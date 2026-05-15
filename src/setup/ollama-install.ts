/**
 * Per-platform install offers for Ollama (WU 135).
 *
 * Three platforms; three install paths with very different
 * reliability:
 *
 *   - macOS — `brew install --cask ollama` is reliable when Homebrew
 *     is present. Without Homebrew, the only path is the download
 *     page.
 *   - Linux — `curl -fsSL https://ollama.com/install.sh | sh` is the
 *     official one-liner and works on every Linux distro Ollama
 *     supports. It writes to /usr/local and asks for sudo.
 *   - Windows — there is no reliable CLI install path. Open the
 *     download page.
 *
 * The pure offer-builder is split from the spawn-the-installer
 * function so it's unit-testable.
 *
 * @module setup/ollama-install
 */

import { spawn } from 'node:child_process';

import type { InstallOffer, Platform } from './types.js';

/** The canonical download page used as the safe fallback on every platform. */
export const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';

/**
 * Build the install offer for the current platform. `hasBrew` is
 * relevant only on macOS — the caller probes for `brew` separately
 * via the standard CLI detection path and passes the result in.
 *
 * Pure — no I/O.
 */
export function buildInstallOffer(platform: Platform, hasBrew: boolean): InstallOffer {
  switch (platform) {
    case 'darwin':
      if (hasBrew) {
        return {
          platform,
          primaryCommand: 'brew install --cask ollama',
          primaryDescription: 'Install Ollama via Homebrew (brew install --cask ollama)',
          fallbackUrl: OLLAMA_DOWNLOAD_URL,
          canAutoInstall: true,
          requiresElevation: false,
        };
      }
      return {
        platform,
        primaryCommand: '',
        primaryDescription: `Download the Ollama app from ${OLLAMA_DOWNLOAD_URL}`,
        fallbackUrl: OLLAMA_DOWNLOAD_URL,
        canAutoInstall: false,
        requiresElevation: false,
      };

    case 'linux':
      return {
        platform,
        primaryCommand: 'curl -fsSL https://ollama.com/install.sh | sh',
        primaryDescription: 'Install Ollama via the official install script (asks for sudo)',
        fallbackUrl: OLLAMA_DOWNLOAD_URL,
        canAutoInstall: true,
        requiresElevation: true,
      };

    case 'win32':
      return {
        platform,
        primaryCommand: '',
        primaryDescription: `Download the Ollama installer from ${OLLAMA_DOWNLOAD_URL}`,
        fallbackUrl: OLLAMA_DOWNLOAD_URL,
        canAutoInstall: false,
        requiresElevation: false,
      };

    case 'other':
    default:
      return {
        platform,
        primaryCommand: '',
        primaryDescription: `See ${OLLAMA_DOWNLOAD_URL} for install options on your platform`,
        fallbackUrl: OLLAMA_DOWNLOAD_URL,
        canAutoInstall: false,
        requiresElevation: false,
      };
  }
}

/**
 * Run the offer's primary command, streaming the installer's stdout
 * and stderr to the caller's handler. Resolves with a result the
 * caller turns into a `LlmSetupResult`.
 *
 * The command is invoked via the user's shell so pipes (`curl | sh`)
 * work as expected. The user already consented to running it; the
 * harness does not silently auto-run installers.
 */
export async function runInstaller(
  offer: InstallOffer,
  onOutput: (line: string) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!offer.canAutoInstall || !offer.primaryCommand) {
    return { ok: false, error: 'No auto-install path is available for this platform.' };
  }

  return new Promise((resolve) => {
    // Spawn through the user's shell so the Linux curl-pipe-sh form
    // works. macOS brew is also fine via shell. We never spawn this
    // without explicit user consent at the prompt layer above.
    const child = spawn(offer.primaryCommand, {
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        if (line) onOutput(line);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        if (line) onOutput(line);
      }
    });
    child.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: `Installer exited with code ${code ?? 'null'}.` });
    });
  });
}

/**
 * Open a URL in the user's default browser. Used as the Windows /
 * brew-less macOS fallback so the user can grab the installer
 * manually. Best-effort — never throws.
 */
export async function openInBrowser(url: string, platform: Platform): Promise<void> {
  const command = platform === 'darwin' ? 'open'
    : platform === 'win32' ? 'start'
    : 'xdg-open';
  return new Promise((resolve) => {
    const child = spawn(command, [url], { stdio: 'ignore', shell: platform === 'win32' });
    child.on('error', () => resolve());
    child.on('close', () => resolve());
  });
}
