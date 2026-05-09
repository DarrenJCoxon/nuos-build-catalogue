/**
 * Embedder selector — reads NUOS_CATALOGUE_EMBEDDER from env.
 *
 * Default: ollama (local inference; no network egress; sovereignty by
 * default). Alternatives: vertex (cloud Google), openai (cloud OpenAI),
 * stub (deterministic hash for tests).
 */

import type { Embedder } from './types.js';
import { OllamaEmbedder } from './ollama.js';
import { VertexEmbedder } from './vertex.js';
import { OpenAIEmbedder } from './openai.js';
import { StubEmbedder } from './stub.js';

export async function selectEmbedderFromEnv(): Promise<Embedder> {
  const name = (process.env.NUOS_CATALOGUE_EMBEDDER ?? 'ollama').toLowerCase();
  switch (name) {
    case 'ollama':
      return OllamaEmbedder.fromEnv();
    case 'vertex':
      return VertexEmbedder.fromEnv();
    case 'openai':
      return OpenAIEmbedder.fromEnv();
    case 'stub':
      return new StubEmbedder();
    default:
      throw new Error(
        `Unknown embedder "${name}" (NUOS_CATALOGUE_EMBEDDER). ` +
          `Use ollama | vertex | openai | stub.`,
      );
  }
}
