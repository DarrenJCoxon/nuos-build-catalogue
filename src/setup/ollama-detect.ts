/**
 * Probes for the Ollama CLI binary, the HTTP API, and a specific model.
 *
 * All three probes are non-throwing — they return result objects with a
 * `found` / `reachable` / `present` boolean so the caller can compose a
 * branching setup flow without try/catch noise.
 *
 * @module setup/ollama-detect
 */

import { spawn } from 'node:child_process';

import type { OllamaApiProbe, OllamaCliProbe, ModelProbe, Platform } from './types.js';

/** Default API host used by the existing Ollama embedder. */
export const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';

/**
 * Resolve `ollama` on PATH and capture its absolute path if present.
 *
 * Uses `which` on Unix-likes and `where` on Windows. We do not parse
 * version output here — the caller only needs the boolean and the path.
 */
export async function detectOllamaCli(platform: Platform): Promise<OllamaCliProbe> {
  const command = platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    const child = spawn(command, ['ollama'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.on('error', () => resolve({ found: false }));
    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        // `where` on Windows may return multiple lines; take the first.
        const firstLine = stdout.split(/\r?\n/)[0]?.trim() ?? '';
        resolve({ found: true, path: firstLine });
      } else {
        resolve({ found: false });
      }
    });
  });
}

/**
 * Probe the Ollama HTTP API at the given host. Uses `/api/tags` which
 * is cheap and returns a 200 even on an empty model list.
 *
 * Returns `reachable: false` plus an error string for any non-200 or
 * network failure. Times out after 1500ms so a hung daemon doesn't
 * stall the setup flow.
 */
export async function detectOllamaApi(host = DEFAULT_OLLAMA_HOST): Promise<OllamaApiProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${host}/api/tags`, { signal: controller.signal });
    if (!response.ok) {
      return { reachable: false, host, error: `HTTP ${response.status}` };
    }
    return { reachable: true, host };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { reachable: false, host, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check whether a specific model has been pulled into the local Ollama
 * instance. Calls `/api/tags` and matches by exact name. Returns
 * `present: false` on any failure — the caller's next step (pull) will
 * surface the underlying error.
 */
export async function detectModelPresent(
  host: string,
  model: string,
): Promise<ModelProbe> {
  try {
    const response = await fetch(`${host}/api/tags`);
    if (!response.ok) return { present: false, model };
    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    const present = Array.isArray(data.models)
      && data.models.some((m) => m.name === model);
    return { present, model };
  } catch {
    return { present: false, model };
  }
}
