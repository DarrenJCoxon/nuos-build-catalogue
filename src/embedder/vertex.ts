/**
 * Vertex AI embedder — text-embedding-005 (768 dims).
 *
 * Auth: GOOGLE_APPLICATION_CREDENTIALS env var pointing at a service
 * account JSON, or any other ADC mechanism Google accepts.
 *
 * Chosen as the default because: it matches Sensight's production
 * embedder; UK data residency is available; the README example
 * documents 768 dimensions (matches text-embedding-005); per D010 the
 * choice is the consumer's.
 *
 * Implementation note — Vertex's REST API does not bundle nicely without
 * the Google auth library. Rather than vendor a heavyweight SDK in
 * this small CLI, this implementation expects either:
 *   - GOOGLE_VERTEX_ACCESS_TOKEN env var (a short-lived OAuth token,
 *     refreshable via `gcloud auth print-access-token`), or
 *   - GOOGLE_APPLICATION_CREDENTIALS pointing at a service account JSON,
 *     in which case it shells out to `gcloud` to mint a token.
 *
 * The shell-out path is used by Sensight's local dev environment too.
 * For production use of this CLI a future revision can adopt
 * @google-cloud/aiplatform; not needed for Phase 0.
 */

import type { Embedder } from './types.js';
import { execSync } from 'node:child_process';

const MODEL_ID = 'text-embedding-005';
const DIMENSIONS = 768;
const DEFAULT_LOCATION = 'us-central1';

interface VertexConfig {
  project: string;
  location: string;
  accessToken: string;
}

export class VertexEmbedder implements Embedder {
  readonly dimensions = DIMENSIONS;
  readonly modelId = MODEL_ID;

  constructor(private readonly config: VertexConfig) {}

  static fromEnv(): VertexEmbedder {
    const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT;
    if (!project) {
      throw new Error(
        'GOOGLE_CLOUD_PROJECT (or GCP_PROJECT) is required for the vertex embedder.',
      );
    }
    const location = process.env.GOOGLE_CLOUD_LOCATION ?? DEFAULT_LOCATION;

    let accessToken = process.env.GOOGLE_VERTEX_ACCESS_TOKEN;
    if (!accessToken) {
      try {
        accessToken = execSync('gcloud auth print-access-token', {
          encoding: 'utf8',
        }).trim();
      } catch (err) {
        throw new Error(
          'Could not obtain a Vertex access token. Set GOOGLE_VERTEX_ACCESS_TOKEN, ' +
            'or run `gcloud auth application-default login` and ensure `gcloud` is on PATH. ' +
            'Original error: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    return new VertexEmbedder({ project, location, accessToken });
  }

  private get endpoint(): string {
    const { project, location } = this.config;
    return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${MODEL_ID}:predict`;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    // Vertex enforces a per-request batch limit — chunk to be safe
    const BATCH = 5;
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const slice = texts.slice(i, i + BATCH);
      const embeddings = await this.embedBatch(slice);
      out.push(...embeddings);
    }
    return out;
  }

  private async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.accessToken}`,
      },
      body: JSON.stringify({
        instances: texts.map((content) => ({ content, task_type: 'RETRIEVAL_DOCUMENT' })),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable body>');
      throw new Error(`Vertex embed call failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      predictions: Array<{ embeddings: { values: number[] } }>;
    };

    return json.predictions.map((p) => new Float32Array(p.embeddings.values));
  }

  // Cloud embedder — nothing to release on the local machine.
  async dispose(): Promise<void> {}
}
