/**
 * Tests for the runLlmSetup orchestrator (WU 135).
 *
 * Each test injects a custom deps bag so we never hit the real Ollama
 * API, brew, curl, or readline. The orchestrator's branching logic is
 * the load-bearing piece; the underlying probes / installer / pull are
 * tested separately.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runLlmSetup, type RunLlmSetupDeps } from '../src/setup/run-llm-setup.js';
import type { Platform, PullEvent } from '../src/setup/types.js';

interface Recorder {
  out: string[];
  emit: (text: string) => void;
}

function recorder(): Recorder {
  const lines: string[] = [];
  return {
    out: lines,
    emit: (text: string) => lines.push(text),
  };
}

function joinOut(lines: string[]): string {
  return lines.join('');
}

function baseDeps(overrides: Partial<RunLlmSetupDeps> = {}): RunLlmSetupDeps {
  return {
    platform: 'darwin' as Platform,
    detectCli: async () => ({ found: false }),
    detectBrewCli: async () => ({ found: false }),
    detectApi: async (host) => ({ reachable: false, host }),
    detectModel: async (_h, model) => ({ present: false, model }),
    installer: async () => ({ ok: false, error: 'not used' }),
    opener: async () => undefined,
    pull: async () => ({ ok: true }),
    ...overrides,
  };
}

// ─── Happy paths ─────────────────────────────────────────────────────────

test('already_ready when Ollama + model both present', async () => {
  const r = recorder();
  const result = await runLlmSetup({
    out: r.emit,
    confirm: async () => false,
    deps: {
      ...baseDeps({
        detectCli: async () => ({ found: true, path: '/usr/local/bin/ollama' }),
        detectApi: async (host) => ({ reachable: true, host }),
        detectModel: async (_h, model) => ({ present: true, model }),
      }),
    },
  });
  assert.deepEqual(result, { kind: 'already_ready' });
  assert.match(joinOut(r.out), /Ollama detected/);
  assert.match(joinOut(r.out), /already pulled/);
});

test('pulled_only when API reachable but model missing', async () => {
  const r = recorder();
  const events: PullEvent[] = [];
  const result = await runLlmSetup({
    out: r.emit,
    confirm: async () => true,
    deps: {
      ...baseDeps({
        detectCli: async () => ({ found: true, path: '/usr/local/bin/ollama' }),
        detectApi: async (host) => ({ reachable: true, host }),
        detectModel: async (_h, model) => ({ present: false, model }),
        pull: async (_h, _m, onEvent) => {
          onEvent({ status: 'pulling manifest' });
          onEvent({ status: 'downloading', digest: 'sha256:abc', total: 1000, completed: 500 });
          onEvent({ status: 'downloading', digest: 'sha256:abc', total: 1000, completed: 1000 });
          onEvent({ status: 'success' });
          // Capture for assertion side-channel.
          events.push({ status: 'success' });
          return { ok: true };
        },
      }),
    },
  });
  assert.deepEqual(result, { kind: 'pulled_only' });
  assert.match(joinOut(r.out), /Pulling/);
  assert.match(joinOut(r.out), /ready/);
  assert.equal(events.length, 1);
});

// ─── Install paths ───────────────────────────────────────────────────────

test('declined install returns install_offered_declined (auto-install path)', async () => {
  const r = recorder();
  const result = await runLlmSetup({
    out: r.emit,
    confirm: async () => false, // user declines the install offer
    deps: {
      ...baseDeps({
        platform: 'linux',
        detectCli: async () => ({ found: false }),
        detectApi: async (host) => ({ reachable: false, host }),
      }),
    },
  });
  assert.deepEqual(result, { kind: 'install_offered_declined' });
  assert.match(joinOut(r.out), /Skipped/);
});

test('Windows declined opens-the-page path also returns install_offered_declined', async () => {
  const r = recorder();
  const result = await runLlmSetup({
    out: r.emit,
    confirm: async () => false,
    deps: {
      ...baseDeps({
        platform: 'win32',
        detectCli: async () => ({ found: false }),
        detectApi: async (host) => ({ reachable: false, host }),
      }),
    },
  });
  assert.equal(result.kind, 'install_offered_declined');
});

test('install_failed when the installer returns an error', async () => {
  const r = recorder();
  const result = await runLlmSetup({
    out: r.emit,
    confirm: async () => true, // accept the install offer
    deps: {
      ...baseDeps({
        platform: 'linux',
        installer: async () => ({ ok: false, error: 'curl returned 7' }),
      }),
    },
  });
  assert.deepEqual(result, { kind: 'install_failed', error: 'curl returned 7' });
  assert.match(joinOut(r.out), /Install failed/);
});

test('installed_and_pulled after a fresh install that succeeds', async () => {
  const r = recorder();
  let apiCalls = 0;
  const result = await runLlmSetup({
    out: r.emit,
    confirm: async () => true,
    deps: {
      ...baseDeps({
        platform: 'linux',
        detectCli: async () => ({ found: false }),
        detectApi: async (host) => {
          apiCalls += 1;
          // First probe (pre-install): not reachable.
          // Second probe (post-install): reachable.
          return { reachable: apiCalls > 1, host };
        },
        installer: async () => ({ ok: true }),
        detectModel: async (_h, model) => ({ present: false, model }),
        pull: async () => ({ ok: true }),
      }),
    },
  });
  assert.deepEqual(result, { kind: 'installed_and_pulled' });
  assert.match(joinOut(r.out), /Ollama installed/);
});

test('ollama_installed_but_not_running when CLI is found but API is down', async () => {
  const r = recorder();
  const result = await runLlmSetup({
    out: r.emit,
    confirm: async () => false,
    deps: {
      ...baseDeps({
        platform: 'darwin',
        detectCli: async () => ({ found: true, path: '/usr/local/bin/ollama' }),
        detectApi: async (host) => ({ reachable: false, host }),
      }),
    },
  });
  assert.deepEqual(result, { kind: 'ollama_installed_but_not_running' });
  assert.match(joinOut(r.out), /installed but not running/);
});

test('pull_failed surfaces the pull error and retry guidance', async () => {
  const r = recorder();
  const result = await runLlmSetup({
    out: r.emit,
    confirm: async () => true,
    deps: {
      ...baseDeps({
        detectCli: async () => ({ found: true, path: '/x' }),
        detectApi: async (host) => ({ reachable: true, host }),
        detectModel: async (_h, model) => ({ present: false, model }),
        pull: async () => ({ ok: false, error: 'connection reset' }),
      }),
    },
  });
  assert.deepEqual(result, { kind: 'pull_failed', error: 'connection reset' });
  assert.match(joinOut(r.out), /Pull failed/);
  assert.match(joinOut(r.out), /setup-llm/);
});

test('non-interactive run never asks and reports install_offered_declined', async () => {
  let confirmCalled = false;
  const r = recorder();
  const result = await runLlmSetup({
    nonInteractive: true,
    out: r.emit,
    confirm: async () => { confirmCalled = true; return true; },
    deps: {
      ...baseDeps({
        platform: 'linux',
        detectCli: async () => ({ found: false }),
        detectApi: async (host) => ({ reachable: false, host }),
      }),
    },
  });
  assert.equal(confirmCalled, false);
  assert.equal(result.kind, 'install_offered_declined');
});
