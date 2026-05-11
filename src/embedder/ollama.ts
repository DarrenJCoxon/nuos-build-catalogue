/**
 * Ollama embedder — local inference, no network egress.
 *
 * Default model: qwen3-embedding:0.6b (1024 dims). Picked as default
 * because it runs on the broad majority of developer machines without
 * meaningful CPU strain — the prior 8b default produced noticeable load
 * on Apple Silicon during a catalogue reindex, and the build harness
 * ships to projects whose maintainers won't necessarily have an
 * M-series Mac. Higher-fidelity variants (qwen3-embedding:4b at 2560
 * dims, qwen3-embedding:8b at 4096 dims) are available via
 * NUOS_CATALOGUE_OLLAMA_MODEL when the user wants better recall and
 * has the headroom. Switching variants requires a full reindex because
 * dimensions change.
 *
 * Why local: keeps the catalogue's content (and any future workload that
 * uses the same Embedder interface) inside whatever boundary Ollama is
 * running in — typically the developer's machine, or a school-local
 * server in a deployment context. Closes one of the two remaining
 * third-party calls in the NuOS stack (the other is LLM completion;
 * WU 058 covers that).
 *
 * **Unload-after-use commitment.** A school server (or developer
 * machine) must not be left holding ~5GB of model in RAM idle. Per the
 * NuOS-wide local-inference principle, models are loaded for the
 * duration of work and unloaded as soon as the work is done.
 *
 * Implementation: each call passes `keep_alive: "1m"` so sequential
 * batches within one operation stay warm; the embedder exposes
 * `dispose()` which explicitly unloads via `keep_alive: 0`. The CLI
 * calls `dispose()` after every `index` and `search` command. If the
 * process exits without `dispose()` (crash, kill -9), Ollama's own
 * idle-timeout (the keep_alive: "1m" we sent) cleans up within a
 * minute.
 *
 * Sizing note — the new 0.6b default is ~600MB on disk and runs
 * comfortably on any modern laptop, including CPU-only. The 4b variant
 * (~2.5GB) and 8b variant (~4.7GB, benefits from ~16GB RAM + Metal)
 * are upgrades for users who want better recall and have the headroom.
 */

import type { Embedder } from './types.js';

const DEFAULT_MODEL = 'qwen3-embedding:0.6b';
const DEFAULT_HOST = 'http://localhost:11434';

// Qwen3-Embedding produces Matryoshka representations 32–4096 dims.
// We use the model default. A future tweak could truncate to e.g. 1024
// to shrink the index by 4x at minor accuracy cost.
const KNOWN_DIMENSIONS: Record<string, number> = {
  'qwen3-embedding:8b': 4096,
  'qwen3-embedding:4b': 2560,
  'qwen3-embedding:0.6b': 1024,
};

export class OllamaEmbedder implements Embedder {
  readonly dimensions: number;
  readonly modelId: string;
  private readonly host: string;
  private readonly batchSize: number;

  private constructor(options: {
    modelId: string;
    dimensions: number;
    host: string;
    batchSize: number;
  }) {
    this.modelId = options.modelId;
    this.dimensions = options.dimensions;
    this.host = options.host;
    this.batchSize = options.batchSize;
  }

  static async fromEnv(): Promise<OllamaEmbedder> {
    const modelId = process.env.NUOS_CATALOGUE_OLLAMA_MODEL ?? DEFAULT_MODEL;
    const host = (process.env.OLLAMA_HOST ?? DEFAULT_HOST).replace(/\/$/, '');
    const batchSize = Number(process.env.NUOS_CATALOGUE_OLLAMA_BATCH ?? 8);

    // Probe the host to give a useful error early
    let dimensions = KNOWN_DIMENSIONS[modelId];
    try {
      const probe = await fetch(`${host}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelId, input: 'probe' }),
      });
      if (!probe.ok) {
        const body = await probe.text().catch(() => '<unreadable>');
        throw new Error(
          `Ollama probe failed (${probe.status}): ${body}\n` +
            `Check that Ollama is running and the model is pulled:\n` +
            `  ollama serve\n` +
            `  ollama pull ${modelId}`,
        );
      }
      const json = (await probe.json()) as { embeddings?: number[][] };
      const probeDim = json.embeddings?.[0]?.length;
      if (probeDim) {
        if (dimensions && dimensions !== probeDim) {
          // Trust the live probe over the lookup table
          dimensions = probeDim;
        }
        dimensions ??= probeDim;
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Ollama probe failed')) throw err;
      throw new Error(
        `Could not reach Ollama at ${host}. Is it running? ` +
          `Start it with \`ollama serve\` and pull the model with \`ollama pull ${modelId}\`. ` +
          `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!dimensions) {
      throw new Error(
        `Could not determine embedding dimension for model ${modelId}. ` +
          `If this is a new variant, add it to KNOWN_DIMENSIONS in src/embedder/ollama.ts.`,
      );
    }

    return new OllamaEmbedder({ modelId, dimensions, host, batchSize });
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const slice = texts.slice(i, i + this.batchSize);
      const embeddings = await this.embedBatch(slice);
      out.push(...embeddings);
    }
    return out;
  }

  private async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const res = await fetch(`${this.host}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.modelId,
        input: texts,
        // Keep the model warm only for the duration of one operation.
        // dispose() at the end of the run sends keep_alive: 0 to unload.
        keep_alive: '1m',
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      throw new Error(`Ollama embed call failed (${res.status}): ${body}`);
    }
    const json = (await res.json()) as { embeddings: number[][] };
    if (!Array.isArray(json.embeddings) || json.embeddings.length !== texts.length) {
      throw new Error(
        `Ollama returned ${json.embeddings?.length ?? 0} embeddings for ${texts.length} inputs`,
      );
    }
    return json.embeddings.map((e) => new Float32Array(e));
  }

  /**
   * Explicitly unload the model from Ollama's RAM. Safe to call multiple
   * times; safe to call before any embed() — it's a no-op if the model
   * isn't currently loaded.
   *
   * Implements the NuOS-wide unload-after-use commitment: at the end of
   * any operation that uses local inference, the model is freed so the
   * host machine isn't left carrying idle weights.
   */
  async dispose(): Promise<void> {
    try {
      const res = await fetch(`${this.host}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Empty input + keep_alive: 0 is Ollama's documented unload trigger.
        body: JSON.stringify({
          model: this.modelId,
          input: '',
          keep_alive: 0,
        }),
      });
      // Non-2xx is non-fatal — the keep_alive on prior calls will still
      // expire within ~1 minute and Ollama will free the model.
      if (!res.ok) {
        const body = await res.text().catch(() => '<unreadable>');
        process.stderr.write(
          `[ollama] dispose() returned ${res.status}; model will unload via keep_alive timeout. body: ${body}\n`,
        );
      }
    } catch (err) {
      // Network error reaching Ollama at dispose time is non-fatal.
      // The keep_alive timeout on prior calls covers cleanup.
      process.stderr.write(
        `[ollama] dispose() failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}
