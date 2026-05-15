/**
 * Streams a model pull from Ollama and emits one `PullEvent` per
 * NDJSON line.
 *
 * The Ollama `/api/pull` endpoint returns a stream of newline-delimited
 * JSON objects describing the pull's progress — `pulling manifest`
 * first, then one or more `downloading` events per blob (each with
 * `digest`, `total`, `completed`), then `verifying`, `writing manifest`,
 * and finally `success`. On failure an object with `error` is emitted
 * instead.
 *
 * The pure parser is exported separately so it can be unit-tested with
 * a fixed byte stream.
 *
 * @module setup/ollama-pull
 */

import type { PullEvent } from './types.js';

/**
 * Parse a single byte chunk into zero-or-more complete events, given
 * the running buffer left over from the previous chunk. Returns the
 * new buffer (any trailing partial line) alongside the parsed events.
 *
 * Pure — exported for testing.
 */
export function parsePullChunk(
  buffer: string,
  chunk: string,
): { buffer: string; events: PullEvent[] } {
  const combined = buffer + chunk;
  const lines = combined.split('\n');
  const trailing = lines.pop() ?? ''; // partial line carries to the next chunk
  const events: PullEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as PullEvent);
    } catch {
      // Malformed line — skip. Ollama has never been observed to emit
      // malformed lines in practice, but we never crash on stream noise.
    }
  }
  return { buffer: trailing, events };
}

/**
 * Pull the named model from the Ollama registry, invoking `onEvent`
 * for each event the stream emits. Resolves to a success/failure
 * result; never throws on protocol-level errors (network failures,
 * abnormal stream closure surface as `{ ok: false }`).
 */
export async function pullModel(
  host: string,
  model: string,
  onEvent: (event: PullEvent) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(`${host}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (!response.ok || !response.body) {
    return { ok: false, error: `Pull request failed (HTTP ${response.status}).` };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf8');
  let buffer = '';
  let sawSuccess = false;
  let lastError: string | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const parsed = parsePullChunk(buffer, chunk);
      buffer = parsed.buffer;
      for (const event of parsed.events) {
        onEvent(event);
        if (event.error) lastError = event.error;
        if (event.status === 'success') sawSuccess = true;
      }
    }
    // Flush any final partial line that turned out to be complete.
    const tail = parsePullChunk(buffer, '\n');
    for (const event of tail.events) {
      onEvent(event);
      if (event.error) lastError = event.error;
      if (event.status === 'success') sawSuccess = true;
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (lastError) return { ok: false, error: lastError };
  if (!sawSuccess) {
    return { ok: false, error: 'Pull stream ended without a success event.' };
  }
  return { ok: true };
}
