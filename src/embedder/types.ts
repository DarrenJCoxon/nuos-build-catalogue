/**
 * Embedder interface — per D010, NuVector does not generate embeddings;
 * the consumer supplies them. The catalogue indexer ships its own
 * embedder implementations and routes via this interface.
 */

export interface Embedder {
  embed(texts: string[]): Promise<Float32Array[]>;
  /**
   * Release any resources the embedder is holding. For local-inference
   * embedders this unloads the model from RAM. For cloud embedders this
   * is a no-op. Always called by the CLI at the end of an operation per
   * the NuOS-wide unload-after-use commitment.
   */
  dispose(): Promise<void>;
  readonly dimensions: number;
  readonly modelId: string;
}

export type EmbedderName = 'ollama' | 'vertex' | 'openai' | 'stub';

export interface EmbedderConfig {
  name: EmbedderName;
  // Provider-specific options come from env vars; this config object
  // exists so future additions stay structured.
}
