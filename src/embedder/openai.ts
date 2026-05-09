/**
 * OpenAI embedder — text-embedding-3-small (1536 dims).
 *
 * Auth: OPENAI_API_KEY env var.
 *
 * Chosen as the alternate embedder because it has the lowest setup
 * friction for a contributor without GCP access. Per the WU 110 spec
 * the build catalogue is non-sensitive so cross-region inference is
 * acceptable; per D010 NuVector does not generate embeddings so the
 * consumer (this CLI) decides.
 */

import type { Embedder } from './types.js';

const MODEL_ID = 'text-embedding-3-small';
const DIMENSIONS = 1536;
const API_URL = 'https://api.openai.com/v1/embeddings';

export class OpenAIEmbedder implements Embedder {
  readonly dimensions = DIMENSIONS;
  readonly modelId = MODEL_ID;

  constructor(private readonly apiKey: string) {}

  static fromEnv(): OpenAIEmbedder {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        'OPENAI_API_KEY is not set; required for the openai embedder. ' +
          'Set it, or switch to NUOS_CATALOGUE_EMBEDDER=vertex.',
      );
    }
    return new OpenAIEmbedder(key);
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        input: texts,
        encoding_format: 'float',
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable body>');
      throw new Error(`OpenAI embeddings call failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index because the API does not guarantee response order
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    return sorted.map((d) => new Float32Array(d.embedding));
  }

  // Cloud embedder — nothing to release on the local machine.
  async dispose(): Promise<void> {}
}
