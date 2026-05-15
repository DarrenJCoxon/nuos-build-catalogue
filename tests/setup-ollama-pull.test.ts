/**
 * Tests for the NDJSON pull-event parser and the install-offer builder
 * (WU 135). Both are pure; no Ollama needed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parsePullChunk } from '../src/setup/ollama-pull.js';
import { buildInstallOffer, OLLAMA_DOWNLOAD_URL } from '../src/setup/ollama-install.js';

// ─── parsePullChunk ──────────────────────────────────────────────────────

test('parsePullChunk parses a single complete event', () => {
  const { buffer, events } = parsePullChunk('', '{"status":"pulling manifest"}\n');
  assert.equal(buffer, '');
  assert.deepEqual(events, [{ status: 'pulling manifest' }]);
});

test('parsePullChunk handles multiple events in one chunk', () => {
  const chunk = [
    '{"status":"pulling manifest"}',
    '{"status":"downloading","digest":"sha256:abc","total":1000,"completed":250}',
    '{"status":"downloading","digest":"sha256:abc","total":1000,"completed":500}',
    '',
  ].join('\n');
  const { buffer, events } = parsePullChunk('', chunk);
  assert.equal(buffer, '');
  assert.equal(events.length, 3);
  assert.equal(events[1]?.completed, 250);
  assert.equal(events[2]?.completed, 500);
});

test('parsePullChunk carries a partial trailing line to the next chunk', () => {
  const first = parsePullChunk('', '{"status":"pulling manifest"}\n{"status":"down');
  assert.equal(first.events.length, 1);
  assert.equal(first.buffer, '{"status":"down');

  const second = parsePullChunk(first.buffer, 'loading","total":42,"completed":42}\n');
  assert.equal(second.events.length, 1);
  assert.equal(second.events[0]?.status, 'downloading');
  assert.equal(second.events[0]?.total, 42);
});

test('parsePullChunk skips malformed lines without crashing', () => {
  const { events } = parsePullChunk('', 'not-json-at-all\n{"status":"ok"}\n');
  assert.equal(events.length, 1);
  assert.equal(events[0]?.status, 'ok');
});

test('parsePullChunk decodes an error event with no status', () => {
  const { events } = parsePullChunk('', '{"error":"pull failed: out of disk space"}\n');
  assert.equal(events.length, 1);
  assert.equal(events[0]?.error, 'pull failed: out of disk space');
  assert.equal(events[0]?.status, undefined);
});

// ─── buildInstallOffer ───────────────────────────────────────────────────

test('macOS with Homebrew offers brew install --cask ollama', () => {
  const offer = buildInstallOffer('darwin', true);
  assert.equal(offer.primaryCommand, 'brew install --cask ollama');
  assert.equal(offer.canAutoInstall, true);
  assert.equal(offer.requiresElevation, false);
  assert.equal(offer.fallbackUrl, OLLAMA_DOWNLOAD_URL);
});

test('macOS without Homebrew falls back to download page', () => {
  const offer = buildInstallOffer('darwin', false);
  assert.equal(offer.canAutoInstall, false);
  assert.equal(offer.primaryCommand, '');
  assert.equal(offer.fallbackUrl, OLLAMA_DOWNLOAD_URL);
});

test('Linux offers the curl-pipe-sh install script (with sudo)', () => {
  const offer = buildInstallOffer('linux', false);
  assert.match(offer.primaryCommand, /^curl/);
  assert.match(offer.primaryCommand, /ollama\.com\/install\.sh/);
  assert.equal(offer.canAutoInstall, true);
  assert.equal(offer.requiresElevation, true);
});

test('Windows falls back to download page with no auto-install', () => {
  const offer = buildInstallOffer('win32', false);
  assert.equal(offer.canAutoInstall, false);
  assert.equal(offer.primaryCommand, '');
  assert.equal(offer.fallbackUrl, OLLAMA_DOWNLOAD_URL);
});

test('unknown platforms degrade to the download page', () => {
  const offer = buildInstallOffer('other', false);
  assert.equal(offer.canAutoInstall, false);
  assert.equal(offer.fallbackUrl, OLLAMA_DOWNLOAD_URL);
});
