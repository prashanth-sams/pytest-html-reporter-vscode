/**
 * Display formatting. Pure string work — nothing here imports `vscode`.
 */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

/**
 * Render a measured duration.
 *
 * `undefined` is not zero. pytest-html-reporter only started recording
 * `duration` in 0.3.7, so an archive written before that has no timing at all,
 * and rendering it as `0ms` would claim every one of those tests ran
 * instantly. Say so instead.
 *
 * A measured 0 does mean zero — too fast for the clock — and renders `<1ms`.
 */
export function formatDuration(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null) {
    return 'not measured';
  }
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 'not measured';
  }
  if (seconds < 0.001) {
    return '<1ms';
  }
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`;
  }
  if (seconds < SECONDS_PER_MINUTE) {
    return `${seconds.toFixed(2)}s`;
  }
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = Math.round(seconds % SECONDS_PER_MINUTE);
  return `${minutes}m ${rest}s`;
}

/**
 * Escape text for interpolation into webview HTML.
 *
 * Every string that comes out of a report is attacker-adjacent: test names and
 * assertion messages routinely contain `<`, `>`, `&` and quotes. Both quote
 * forms are escaped so the result is equally safe inside an attribute.
 */
export function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * "5m ago" for a build's `start_time`, which the plugin writes as fractional
 * Unix epoch SECONDS — not milliseconds.
 *
 * `nowMs` is injectable so callers (and tests) can pin the clock. A timestamp
 * in the future is clock skew between the machine that ran pytest and this one,
 * not a real event, so it reads as "just now" rather than "in 3 hours".
 */
export function formatRelativeTime(epochSeconds: number, nowMs: number = Date.now()): string {
  if (!Number.isFinite(epochSeconds)) {
    return 'unknown';
  }
  const elapsed = nowMs / 1000 - epochSeconds;
  if (elapsed < SECONDS_PER_MINUTE) {
    return 'just now';
  }
  if (elapsed < SECONDS_PER_HOUR) {
    return `${Math.floor(elapsed / SECONDS_PER_MINUTE)}m ago`;
  }
  if (elapsed < SECONDS_PER_DAY) {
    return `${Math.floor(elapsed / SECONDS_PER_HOUR)}h ago`;
  }
  if (elapsed < 30 * SECONDS_PER_DAY) {
    return `${Math.floor(elapsed / SECONDS_PER_DAY)}d ago`;
  }
  const date = new Date(epochSeconds * 1000);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A 0..1 ratio as a percentage.
 *
 * 100% and 0% are reserved for the real thing: a run that is one test short of
 * perfect rounds to 99%, not 100%, because "100% passing" next to a red card is
 * the one output nobody would trust again.
 */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) {
    return 'n/a';
  }
  const clamped = Math.min(1, Math.max(0, ratio));
  let percent = Math.round(clamped * 100);
  if (percent === 100 && clamped < 1) {
    percent = 99;
  }
  if (percent === 0 && clamped > 0) {
    percent = 1;
  }
  return `${percent}%`;
}

/**
 * A pass rate from raw counts. `n/a` when nothing was counted — a test that has
 * only ever been skipped has no pass rate, and 0% would be a verdict it never
 * earned.
 */
export function formatPassRate(passed: number, total: number): string {
  if (!Number.isFinite(passed) || !Number.isFinite(total) || total <= 0) {
    return 'n/a';
  }
  return formatPercent(passed / total);
}

/** Collapse every run of whitespace — newlines included — to a single space. */
export function condenseWhitespace(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** Hard cut to `maxLength`. Callers append their own ellipsis. */
export function truncate(text: string, maxLength: number): string {
  const value = String(text ?? '');
  if (maxLength <= 0 || value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
}

/**
 * The one line of a failure worth putting on a card.
 *
 * A pytest message opens with the assertion and then unrolls a diff over many
 * lines. The first `SomeError: ...` line is what identifies the failure, so
 * prefer it and fall back to the head of the message when there is no such
 * line (a bare `assert False`, or a collection error).
 */
export function errorSnippet(messagePlain: string, maxLength: number): string {
  const flat = condenseWhitespace(messagePlain);
  if (!flat) {
    return '';
  }
  const named = /(?:^|\s)([A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception|Failure)\b.*)$/.exec(flat);
  const chosen = named ? named[1] : flat;
  return chosen.length > maxLength ? `${truncate(chosen, maxLength)}…` : chosen;
}

/** Local calendar stamp for a build, e.g. `Sep 02, 16:02`. */
export function formatBuildStamp(epochSeconds: number): string {
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) {
    return 'unknown';
  }
  const d = new Date(epochSeconds * 1000);
  const month = d.toLocaleString(undefined, { month: 'short' });
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${month} ${day}, ${hh}:${mm}`;
}

/** Human label for a status, as shown on a chip. */
export function statusLabel(status: string): string {
  switch (status) {
    case 'PASS': return 'Passed';
    case 'FAIL': return 'Failed';
    case 'SKIP': return 'Skipped';
    case 'ERROR': return 'Error';
    case 'xPASS': return 'xPassed';
    case 'xFAIL': return 'xFailed';
    default: return status || 'Unknown';
  }
}

/** CSS class suffix for a status. Kept lowercase and ascii for use in selectors. */
export function statusClass(status: string): string {
  switch (status) {
    case 'PASS': return 'pass';
    case 'FAIL': return 'fail';
    case 'SKIP': return 'skip';
    case 'ERROR': return 'error';
    case 'xPASS': return 'xpass';
    case 'xFAIL': return 'xfail';
    default: return 'unknown';
  }
}
