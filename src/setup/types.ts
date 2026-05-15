/**
 * Shared types for the LLM-setup phase of `init` (WU 135).
 *
 * The setup phase runs after the scaffold and is responsible for
 * detecting Ollama, offering to install it where reliable, and pulling
 * the default embedding model (`qwen3-embedding:0.6b`, ~600MB) with a
 * live progress bar.
 *
 * @module setup/types
 */

/** Node `process.platform` narrowed to the cases we handle. */
export type Platform = 'darwin' | 'linux' | 'win32' | 'other';

/** Result of probing for the Ollama CLI binary on PATH. */
export interface OllamaCliProbe {
  found: boolean;
  /** Resolved path when `found`. */
  path?: string;
}

/** Result of probing the Ollama HTTP API. */
export interface OllamaApiProbe {
  reachable: boolean;
  /** Host the probe used (e.g. "http://localhost:11434"). */
  host: string;
  /** Error message when `!reachable`. */
  error?: string;
}

/** Result of querying the local model list. */
export interface ModelProbe {
  present: boolean;
  /** Model identifier we probed for (e.g. "qwen3-embedding:0.6b"). */
  model: string;
}

/**
 * One event from the Ollama `/api/pull` NDJSON stream. The status
 * strings come straight from Ollama; we treat them as opaque except for
 * the distinguished cases used to render the progress bar.
 *
 * Known status values observed in practice:
 *   - "pulling manifest"
 *   - "downloading"          (carries digest + total + completed)
 *   - "verifying sha256 digest"
 *   - "writing manifest"
 *   - "removing any unused layers"
 *   - "success"
 *
 * An `error` field is set instead of `status` on failure.
 */
export interface PullEvent {
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

/**
 * Outcome of the LLM-setup phase. Returned to the caller (init or the
 * standalone `setup-llm` command) so the surrounding UX can render an
 * appropriate summary line.
 */
export type LlmSetupResult =
  | { kind: 'already_ready' }
  | { kind: 'installed_and_pulled' }
  | { kind: 'pulled_only' }
  | { kind: 'install_offered_declined' }
  | { kind: 'install_failed'; error: string }
  | { kind: 'ollama_installed_but_not_running' }
  | { kind: 'pull_failed'; error: string }
  | { kind: 'skipped'; reason: string };

/**
 * Per-platform install offer the CLI can present to the user. The
 * `canAutoInstall` flag is the gate for offering to run the install
 * command directly — false on Windows (no reliable CLI install path).
 */
export interface InstallOffer {
  platform: Platform;
  /** The shell command the offer would run (empty string when !canAutoInstall). */
  primaryCommand: string;
  /** Plain-English description of the primary path. */
  primaryDescription: string;
  /** Download page URL — always present as the safe fallback. */
  fallbackUrl: string;
  /** Whether we have a reliable CLI install path to offer running. */
  canAutoInstall: boolean;
  /** Whether the primary command needs sudo. Used to phrase the prompt. */
  requiresElevation: boolean;
}

/** Narrow Node's process.platform string to our Platform union. */
export function narrowPlatform(p: NodeJS.Platform): Platform {
  if (p === 'darwin') return 'darwin';
  if (p === 'linux') return 'linux';
  if (p === 'win32') return 'win32';
  return 'other';
}
