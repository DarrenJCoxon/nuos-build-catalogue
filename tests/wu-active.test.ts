/**
 * Tests for `wu start` / `wu end` / `wu current` — the active-WU marker
 * management commands consumed by the PreToolUse hook (WU 136).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  activeWuMarkerPath,
  cmdWuCurrent,
  cmdWuEnd,
  cmdWuStart,
} from '../src/commands/wu-active.js';

function makeTempProject(): string {
  return mkdtempSync(join(tmpdir(), 'nuos-wu-active-'));
}

test('cmdWuStart rejects an empty handle with exit code 2', () => {
  const cwd = makeTempProject();
  try {
    const r = cmdWuStart(undefined, { cwd });
    assert.equal(r.exitCode, 2);
    assert.match(r.output, /Usage:/);
    assert.equal(existsSync(activeWuMarkerPath(cwd)), false);

    const r2 = cmdWuStart('', { cwd });
    assert.equal(r2.exitCode, 2);

    const r3 = cmdWuStart('   ', { cwd });
    assert.equal(r3.exitCode, 2);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cmdWuStart writes the trimmed handle to .nuos-catalogue/active-wu', () => {
  const cwd = makeTempProject();
  try {
    const r = cmdWuStart('136', { cwd });
    assert.equal(r.exitCode, 0);
    assert.match(r.output, /"136"/);
    const marker = activeWuMarkerPath(cwd);
    assert.equal(existsSync(marker), true);
    assert.equal(readFileSync(marker, 'utf8').trim(), '136');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cmdWuStart trims whitespace around the handle', () => {
  const cwd = makeTempProject();
  try {
    cmdWuStart('  WU-136  ', { cwd });
    assert.equal(readFileSync(activeWuMarkerPath(cwd), 'utf8').trim(), 'WU-136');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cmdWuStart overwrites an existing marker without ceremony', () => {
  const cwd = makeTempProject();
  try {
    cmdWuStart('100', { cwd });
    cmdWuStart('200', { cwd });
    assert.equal(readFileSync(activeWuMarkerPath(cwd), 'utf8').trim(), '200');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cmdWuEnd removes the marker and reports the previous handle', () => {
  const cwd = makeTempProject();
  try {
    cmdWuStart('136', { cwd });
    const r = cmdWuEnd({ cwd });
    assert.equal(r.exitCode, 0);
    assert.match(r.output, /"136"/);
    assert.equal(existsSync(activeWuMarkerPath(cwd)), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cmdWuEnd succeeds silently when no marker is present', () => {
  const cwd = makeTempProject();
  try {
    const r = cmdWuEnd({ cwd });
    assert.equal(r.exitCode, 0);
    assert.match(r.output, /no active work unit/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cmdWuCurrent prints "(none)" when no marker is present', () => {
  const cwd = makeTempProject();
  try {
    const r = cmdWuCurrent({ cwd });
    assert.equal(r.exitCode, 0);
    assert.equal(r.output, '(none)');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cmdWuCurrent prints the active handle when a marker exists', () => {
  const cwd = makeTempProject();
  try {
    cmdWuStart('136', { cwd });
    const r = cmdWuCurrent({ cwd });
    assert.equal(r.exitCode, 0);
    assert.equal(r.output, '136');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cmdWuCurrent prints "(none)" if the marker file exists but is empty', () => {
  const cwd = makeTempProject();
  try {
    cmdWuStart('100', { cwd });
    // Truncate the marker to simulate corruption / manual edit.
    writeFileSync(activeWuMarkerPath(cwd), '', 'utf8');
    const r = cmdWuCurrent({ cwd });
    assert.equal(r.exitCode, 0);
    assert.equal(r.output, '(none)');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cmdWuStart creates the .nuos-catalogue/ dir if it does not exist', () => {
  const cwd = makeTempProject();
  try {
    // Directory should not exist yet (fresh temp dir).
    assert.equal(existsSync(join(cwd, '.nuos-catalogue')), false);
    cmdWuStart('136', { cwd });
    assert.equal(existsSync(join(cwd, '.nuos-catalogue')), true);
    assert.equal(existsSync(activeWuMarkerPath(cwd)), true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
