/**
 * Terminal progress bar rendering for the model pull (WU 135).
 *
 * Pure functions — no I/O. The caller writes the returned string to
 * stderr with a leading `\r` for in-place updates, or to stdout when
 * not in a TTY. The renderer is split into formatters (`formatBytes`,
 * `buildBar`) and a composer (`buildProgressLine`) so each piece is
 * independently testable.
 *
 * @module setup/progress-bar
 */

/**
 * Format a byte count as a human-readable string with one decimal place.
 * Uses 1024-based units (KiB / MiB / GiB) but labels them KB / MB / GB
 * since that's what most users expect to see from a CLI.
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * Build a fixed-width progress bar from a 0–1 fraction. Uses
 * solid + light blocks (▰ + ▱) — both BMP characters that render in
 * every modern terminal. Falls back to ASCII (# + -) when
 * `asciiOnly` is true.
 */
export function buildBar(fraction: number, width = 30, asciiOnly = false): string {
  const f = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(f * width);
  const empty = width - filled;
  if (asciiOnly) {
    return `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
  }
  return `[${'▰'.repeat(filled)}${'▱'.repeat(empty)}]`;
}

/**
 * Compose the full progress line for one ongoing download. Shape:
 *
 *   [▰▰▰▰▰▰▰▱▱▱▱▱] 58%  450.2 MB / 600.0 MB  downloading
 *
 * Caller is responsible for any leading `\r` (in-place update) or
 * trailing `\n` (final flush).
 */
export function buildProgressLine(
  completed: number,
  total: number,
  label: string,
  options: { width?: number; asciiOnly?: boolean } = {},
): string {
  const width = options.width ?? 30;
  const fraction = total > 0 ? completed / total : 0;
  const percent = Math.round(fraction * 100);
  const bar = buildBar(fraction, width, options.asciiOnly);
  const bytes = `${formatBytes(completed)} / ${formatBytes(total)}`;
  const percentStr = `${percent.toString().padStart(3)}%`;
  return `${bar} ${percentStr}  ${bytes}  ${label}`;
}

/**
 * Build a line for indeterminate phases (manifest, verify, etc.) where
 * no `completed/total` is available. Shape:
 *
 *   ⋯ verifying sha256 digest
 *
 * The leading glyph is a unicode horizontal ellipsis; falls back to
 * `...` when `asciiOnly`.
 */
export function buildSpinnerLine(label: string, asciiOnly = false): string {
  const glyph = asciiOnly ? '...' : '⋯';
  return `${glyph} ${label}`;
}

/**
 * Clear the current line so the next write starts fresh. Used between
 * in-place progress updates and a final ✓ line.
 */
export function clearLineSequence(): string {
  // \r returns to column 0; the spaces overwrite anything previously
  // written on this line; the second \r returns to column 0 again so
  // the next print starts at the left.
  return `\r${' '.repeat(80)}\r`;
}
