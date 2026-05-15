/**
 * Tests for the progress-bar pure functions (WU 135).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBar,
  buildProgressLine,
  buildSpinnerLine,
  clearLineSequence,
  formatBytes,
} from '../src/setup/progress-bar.js';

test('formatBytes handles each unit', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
  assert.equal(formatBytes(1024 * 1024 * 1024), '1.00 GB');
  assert.equal(formatBytes(1.5 * 1024 * 1024 * 1024), '1.50 GB');
});

test('formatBytes guards against negative and non-finite input', () => {
  assert.equal(formatBytes(-1), '0 B');
  assert.equal(formatBytes(Number.NaN), '0 B');
  assert.equal(formatBytes(Number.POSITIVE_INFINITY), '0 B');
});

test('buildBar fills proportionally to fraction', () => {
  // 10 wide, 0% → all light blocks
  assert.equal(buildBar(0, 10), '[▱▱▱▱▱▱▱▱▱▱]');
  // 10 wide, 100% → all solid blocks
  assert.equal(buildBar(1, 10), '[▰▰▰▰▰▰▰▰▰▰]');
  // 10 wide, 50% → 5 + 5
  assert.equal(buildBar(0.5, 10), '[▰▰▰▰▰▱▱▱▱▱]');
});

test('buildBar clamps fraction to [0, 1]', () => {
  assert.equal(buildBar(-0.5, 4), '[▱▱▱▱]');
  assert.equal(buildBar(1.5, 4), '[▰▰▰▰]');
});

test('buildBar asciiOnly uses hash/dash', () => {
  assert.equal(buildBar(0.5, 6, true), '[###---]');
});

test('buildProgressLine includes bar, percent, bytes, label', () => {
  const line = buildProgressLine(450 * 1024 * 1024, 600 * 1024 * 1024, 'downloading abc', {
    width: 20,
  });
  // 450/600 = 75%
  assert.match(line, /75%/);
  assert.match(line, /450\.0 MB \/ 600\.0 MB/);
  assert.match(line, /downloading abc/);
  assert.ok(line.startsWith('['));
});

test('buildProgressLine handles zero total gracefully', () => {
  const line = buildProgressLine(0, 0, 'starting');
  assert.match(line, /0%/);
  assert.match(line, /0 B \/ 0 B/);
});

test('buildSpinnerLine renders without a bar', () => {
  assert.equal(buildSpinnerLine('verifying'), '⋯ verifying');
  assert.equal(buildSpinnerLine('verifying', true), '... verifying');
});

test('clearLineSequence returns a carriage-return-spaces-carriage-return blob', () => {
  const seq = clearLineSequence();
  assert.equal(seq[0], '\r');
  assert.equal(seq[seq.length - 1], '\r');
  // Some spaces in the middle.
  assert.ok(seq.includes(' '));
});
