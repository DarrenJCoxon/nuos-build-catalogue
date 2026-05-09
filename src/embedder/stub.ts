/**
 * Deterministic hash-based embedder for tests.
 *
 * Not for production retrieval — but lets the indexer + search pipeline
 * be exercised end-to-end without an API key. Enabled via
 * NUOS_CATALOGUE_EMBEDDER=stub.
 */

import { createHash } from 'node:crypto';
import type { Embedder } from './types.js';

const DIMENSIONS = 384;

export class StubEmbedder implements Embedder {
  readonly dimensions = DIMENSIONS;
  readonly modelId = 'stub-sha256-bag-of-words';

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): Float32Array {
    const out = new Float32Array(DIMENSIONS);
    const tokens = text.toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
    for (const tok of tokens) {
      const h = createHash('sha256').update(tok).digest();
      // Spread the token across 4 dims using the first 8 hash bytes
      for (let i = 0; i < 4; i++) {
        const idx = h.readUInt16BE(i * 2) % DIMENSIONS;
        out[idx] += 1;
      }
    }
    // L2 normalise
    let norm = 0;
    for (let i = 0; i < DIMENSIONS; i++) norm += out[i] * out[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < DIMENSIONS; i++) out[i] /= norm;
    }
    return out;
  }

  // No-op — stub holds no resources.
  async dispose(): Promise<void> {}
}
