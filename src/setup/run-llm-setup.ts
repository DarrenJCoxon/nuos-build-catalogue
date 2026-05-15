/**
 * Orchestrates the LLM-setup phase of `init` (WU 135).
 *
 * Both `init` (when not run with `--no-llm`) and the standalone
 * `setup-llm` command call this function. The shape of the work:
 *
 *   1. Probe Ollama CLI + API.
 *   2. If neither — offer to install (platform-specific).
 *   3. If installed but API not reachable — print start instructions.
 *   4. Probe for `qwen3-embedding:0.6b`.
 *   5. If missing — pull it with a live progress bar.
 *   6. Return a discriminated `LlmSetupResult`.
 *
 * I/O is injectable via the options bag so tests can run the whole
 * orchestrator with mocked probes and prompts.
 *
 * @module setup/run-llm-setup
 */

import type {
  InstallOffer,
  LlmSetupResult,
  OllamaApiProbe,
  OllamaCliProbe,
  ModelProbe,
  Platform,
  PullEvent,
} from './types.js';
import { narrowPlatform } from './types.js';

import {
  DEFAULT_OLLAMA_HOST,
  detectModelPresent,
  detectOllamaApi,
  detectOllamaCli,
} from './ollama-detect.js';
import {
  buildInstallOffer,
  openInBrowser,
  OLLAMA_DOWNLOAD_URL,
  runInstaller,
} from './ollama-install.js';
import { pullModel } from './ollama-pull.js';
import {
  buildProgressLine,
  buildSpinnerLine,
  clearLineSequence,
} from './progress-bar.js';

/** The default embedding model — matches `src/embedder/ollama.ts`. */
export const DEFAULT_EMBEDDING_MODEL = 'qwen3-embedding:0.6b';

/** Approximate on-disk size of the default model, used in user-facing copy. */
const DEFAULT_MODEL_SIZE_LABEL = '~600 MB';

/** Injectable dependencies for testing. */
export interface RunLlmSetupDeps {
  platform: Platform;
  detectCli: (p: Platform) => Promise<OllamaCliProbe>;
  detectBrewCli: () => Promise<OllamaCliProbe>;
  detectApi: (host: string) => Promise<OllamaApiProbe>;
  detectModel: (host: string, model: string) => Promise<ModelProbe>;
  installer: (offer: InstallOffer, onLine: (l: string) => void) => Promise<{ ok: true } | { ok: false; error: string }>;
  opener: (url: string, p: Platform) => Promise<void>;
  pull: (host: string, model: string, onEvent: (e: PullEvent) => void) => Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Public options the caller (init / setup-llm) passes in. */
export interface RunLlmSetupOptions {
  host?: string;
  model?: string;
  /**
   * When true, no prompts are issued and any "would you like to install" gate
   * defaults to NO. Use this in CI / unattended contexts. Default: false (we
   * ask the user).
   */
  nonInteractive?: boolean;
  /** Output sink — defaults to writing to process.stderr. */
  out?: (text: string) => void;
  /**
   * Prompt callback — defaults to a readline-backed yes/no prompt. Tests
   * provide a mock. Returns true for yes, false for no.
   */
  confirm?: (question: string) => Promise<boolean>;
  /** Dependency injection — defaults to the real Ollama probes. */
  deps?: Partial<RunLlmSetupDeps>;
}

/**
 * Default deps wired against the real Ollama functions. Tests override
 * any subset of these via the `deps` field on the options.
 */
function defaultDeps(): RunLlmSetupDeps {
  return {
    platform: narrowPlatform(process.platform),
    detectCli: detectOllamaCli,
    detectBrewCli: async () => detectOllamaCli(narrowPlatform(process.platform)).then(() => ({ found: false }))
      .catch(() => ({ found: false })),
    detectApi: detectOllamaApi,
    detectModel: detectModelPresent,
    installer: runInstaller,
    opener: openInBrowser,
    pull: pullModel,
  };
}

/**
 * Probe `brew` specifically (separate from the generic CLI probe so we
 * can use the same `detectOllamaCli` machinery and just check a
 * different binary name).
 */
async function detectBrew(platform: Platform): Promise<boolean> {
  if (platform !== 'darwin') return false;
  const probe = await detectBrewBinary();
  return probe.found;
}

async function detectBrewBinary(): Promise<OllamaCliProbe> {
  // Inline duplicate of detectOllamaCli with the binary name swapped —
  // keeps ollama-detect.ts narrowly scoped to its name.
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const child = spawn('which', ['brew'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    child.on('error', () => resolve({ found: false }));
    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve({ found: true, path: stdout.split(/\r?\n/)[0]?.trim() });
      } else {
        resolve({ found: false });
      }
    });
  });
}

/**
 * Default yes/no prompt. Returns false on EOF (non-TTY input) so unattended
 * runs can't hang.
 */
async function defaultConfirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

/** Default output sink — process.stderr so the bar doesn't pollute stdout pipes. */
function defaultOut(text: string): void {
  process.stderr.write(text);
}

// ─── Orchestrator ────────────────────────────────────────────────────────

/**
 * Run the LLM-setup phase. Pure-result return — never throws on user-
 * facing failures. The caller turns the result into a one-line summary
 * for the surrounding command's output.
 */
export async function runLlmSetup(opts: RunLlmSetupOptions = {}): Promise<LlmSetupResult> {
  const out = opts.out ?? defaultOut;
  const confirm = opts.confirm ?? defaultConfirm;
  const host = opts.host ?? process.env.NUOS_CATALOGUE_OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST;
  const model = opts.model ?? process.env.NUOS_CATALOGUE_OLLAMA_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  const deps: RunLlmSetupDeps = { ...defaultDeps(), ...opts.deps };

  // Step 1 — Probe Ollama CLI + API.
  out('\nSetting up local semantic search…\n');
  const cliProbe = await deps.detectCli(deps.platform);
  const apiProbe = await deps.detectApi(host);

  if (!cliProbe.found && !apiProbe.reachable) {
    // Ollama is not installed.
    const hasBrew = await detectBrew(deps.platform);
    const offer = buildInstallOffer(deps.platform, hasBrew);

    out(`\nOllama is not installed. ${offer.primaryDescription}.\n`);
    out(`Reference: ${offer.fallbackUrl}\n`);

    if (!offer.canAutoInstall) {
      // Windows / brew-less macOS / unknown platforms: offer to open the page.
      if (opts.nonInteractive) {
        out('Skipping (non-interactive). Install Ollama, then run `nuos-catalogue setup-llm`.\n');
        return { kind: 'install_offered_declined' };
      }
      const openIt = await confirm(`Open ${offer.fallbackUrl} in your browser?`);
      if (openIt) {
        await deps.opener(offer.fallbackUrl, deps.platform);
        out('Browser opened. After installing Ollama, run `nuos-catalogue setup-llm` to finish.\n');
      } else {
        out('Skipped. After installing Ollama, run `nuos-catalogue setup-llm`.\n');
      }
      return { kind: 'install_offered_declined' };
    }

    // We have a reliable CLI install path. Offer to run it.
    if (opts.nonInteractive) {
      out(`Skipping (non-interactive). Run \`${offer.primaryCommand}\` then re-run setup.\n`);
      return { kind: 'install_offered_declined' };
    }
    const elevationNote = offer.requiresElevation ? ' (you will be asked for your password)' : '';
    const runIt = await confirm(`Run \`${offer.primaryCommand}\` now?${elevationNote}`);
    if (!runIt) {
      out('Skipped. Install Ollama, then run `nuos-catalogue setup-llm` to finish.\n');
      return { kind: 'install_offered_declined' };
    }

    out(`Running: ${offer.primaryCommand}\n`);
    const installResult = await deps.installer(offer, (line) => out(`  ${line}\n`));
    if (!installResult.ok) {
      out(`\nInstall failed: ${installResult.error}\n`);
      out(`Try installing manually from ${offer.fallbackUrl}, then run \`nuos-catalogue setup-llm\`.\n`);
      return { kind: 'install_failed', error: installResult.error };
    }
    out('\nOllama installed.\n');

    // After install, the API may not be running yet (the user needs to
    // start the app on macOS, or the systemd unit might be queued on
    // Linux). Re-probe and steer the user appropriately.
    const postInstallApi = await deps.detectApi(host);
    if (!postInstallApi.reachable) {
      out('\nOllama is installed but not running yet.\n');
      if (deps.platform === 'darwin') {
        out('Open the Ollama app (Spotlight → Ollama), then run `nuos-catalogue setup-llm`.\n');
      } else if (deps.platform === 'linux') {
        out('Start Ollama with `ollama serve` (or `systemctl start ollama` on systems where the unit is installed), then run `nuos-catalogue setup-llm`.\n');
      } else {
        out('Launch the Ollama app, then run `nuos-catalogue setup-llm`.\n');
      }
      return { kind: 'ollama_installed_but_not_running' };
    }
    // API is reachable — fall through to the model-pull step below.
  } else if (cliProbe.found && !apiProbe.reachable) {
    out('\nOllama is installed but not running.\n');
    if (deps.platform === 'darwin') {
      out('Open the Ollama app, then run `nuos-catalogue setup-llm`.\n');
    } else if (deps.platform === 'linux') {
      out('Start Ollama with `ollama serve`, then run `nuos-catalogue setup-llm`.\n');
    } else {
      out('Launch Ollama, then run `nuos-catalogue setup-llm`.\n');
    }
    return { kind: 'ollama_installed_but_not_running' };
  } else {
    // API is reachable (with or without CLI on PATH — Docker / remote
    // Ollama would have API but no local CLI).
    const detail = cliProbe.path ? ` (CLI at ${cliProbe.path})` : '';
    out(`✓ Ollama detected at ${host}${detail}.\n`);
  }

  // Step 2 — Check the model.
  const modelProbe = await deps.detectModel(host, model);
  if (modelProbe.present) {
    out(`✓ ${model} already pulled (${DEFAULT_MODEL_SIZE_LABEL}).\n`);
    return { kind: 'already_ready' };
  }

  // Step 3 — Pull the model with a progress bar.
  out(`\nPulling ${model} (${DEFAULT_MODEL_SIZE_LABEL})…\n`);

  // We render the bar to the same line repeatedly. Outside a TTY we
  // fall back to line-per-status to keep logs readable.
  const isTty = !!process.stderr.isTTY;
  let lastLineLength = 0;

  function renderPullLine(line: string): void {
    if (isTty) {
      out(`\r${' '.repeat(Math.max(lastLineLength, line.length))}\r${line}`);
      lastLineLength = line.length;
    } else {
      out(`${line}\n`);
    }
  }

  const pullResult = await deps.pull(host, model, (event) => {
    if (event.error) {
      // Error events are emitted instead of status; let the wrapper handle.
      return;
    }
    if (event.status === 'downloading' && typeof event.total === 'number' && typeof event.completed === 'number') {
      const shortDigest = event.digest ? event.digest.slice(0, 12) : '';
      renderPullLine(buildProgressLine(event.completed, event.total, `downloading ${shortDigest}`));
    } else if (event.status) {
      renderPullLine(buildSpinnerLine(event.status));
    }
  });

  // Close the bar line cleanly.
  if (isTty) out(clearLineSequence());

  if (!pullResult.ok) {
    out(`\nPull failed: ${pullResult.error}\n`);
    out('Re-run `nuos-catalogue setup-llm` to retry — Ollama resumes partial pulls automatically.\n');
    return { kind: 'pull_failed', error: pullResult.error };
  }

  out(`✓ ${model} ready.\n`);
  out(`\nLocal semantic search is ready. Try \`nuos-catalogue search 'your query'\` after the first index.\n`);

  // Differentiate the result based on whether we just installed Ollama
  // this run, or only pulled the model.
  return cliProbe.found || apiProbe.reachable
    ? { kind: 'pulled_only' }
    : { kind: 'installed_and_pulled' };
}

/** Re-export of the download URL for callers that want to print it. */
export { OLLAMA_DOWNLOAD_URL };
