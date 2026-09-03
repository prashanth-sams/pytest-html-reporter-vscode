/**
 * Building the sidebar's HTML.
 *
 * Two rules hold everywhere in this file:
 *
 *  1. Every string that came out of a report — suite name, test name, error
 *     text, file path — goes through `escapeHtml` before it reaches the markup.
 *     Assertion diffs are full of `<`, `>`, `&` and quotes, so this is not
 *     theoretical.
 *  2. No handler is ever written with report data interpolated into it. Rows
 *     carry a numeric `data-index` and listeners are attached by delegation, so
 *     nothing from the report is ever parsed as code.
 */

import {
  BuildDigest,
  FlakeVerdict,
  ReportData,
  TestOutcome,
  TestResult,
  TestSummary,
} from '../types/index.js';
import {
  escapeHtml,
  formatDuration,
  formatPercent,
  statusClass,
  statusLabel,
} from '../utils/formatters.js';
import { getStyles } from './styles.js';

export interface RenderContext {
  reports: string[];
  activeReport?: string;
  hasHtmlReport: boolean;
  showErrorSnippets: boolean;
  flake?: Map<string, FlakeVerdict>;
  trends?: Map<string, TestOutcome[]>;
  historyBuildCount: number;
  /** Oldest-first window of past builds, for the history chart. */
  builds?: BuildDigest[];
}

const ICON_EMPTY =
  '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 3h6l1 3H8l1-3Z"/><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8 12h8M8 16h5"/></svg>';
const ICON_PASS =
  '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>';
const ICON_ERROR =
  '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>';

function shortPath(fsPath: string): string {
  const parts = fsPath.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join('/') || fsPath;
}

export class HtmlRenderer {
  /**
   * The document shell.
   *
   * The CSP allows inline style and script because both are generated here and
   * shipped in the same string; it allows nothing else at all, so no report
   * content can pull in a remote resource.
   */
  static wrapHtml(content: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${getStyles()}</style>
</head>
<body>
<div class="container">${content}</div>
<script>
(function () {
  const vscode = acquireVsCodeApi();
  function post(command, extra) { vscode.postMessage(Object.assign({ command: command }, extra || {})); }

  document.addEventListener('click', function (event) {
    const action = event.target.closest('[data-action]');
    if (!action) { return; }
    const name = action.getAttribute('data-action');

    if (name === 'jump') {
      post('jump', { index: Number(action.getAttribute('data-index')) });
    } else if (name === 'copyError') {
      event.stopPropagation();
      post('copyError', { index: Number(action.getAttribute('data-index')) });
    } else if (name === 'toggleSuite') {
      const body = document.getElementById(action.getAttribute('data-target'));
      if (body) {
        const hidden = body.hasAttribute('hidden');
        if (hidden) { body.removeAttribute('hidden'); } else { body.setAttribute('hidden', ''); }
        action.setAttribute('aria-expanded', String(hidden));
      }
    } else {
      post(name);
    }
  });

  const selector = document.getElementById('report-switcher');
  if (selector) {
    selector.addEventListener('change', function () { post('switchReport', { path: selector.value }); });
  }
}());
</script>
</body>
</html>`;
  }

  static renderLoading(): string {
    return HtmlRenderer.wrapHtml(`
      <div class="center-content">
        <div class="loading-spinner"></div>
        <p class="text-muted">Loading test results…</p>
      </div>`);
  }

  static renderNoConfig(): string {
    return HtmlRenderer.wrapHtml(`
      <div class="center-content">
        <div class="empty-icon text-muted">${ICON_EMPTY}</div>
        <h3 class="empty-title">No report found</h3>
        <p class="text-muted">
          Run pytest with the reporter to produce one:<br>
          <code>pytest --html-report=./report</code>
        </p>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="configure">Configure report path</button>
          <button class="btn btn-secondary" data-action="refresh">Refresh</button>
        </div>
      </div>`);
  }

  static renderError(message: string): string {
    return HtmlRenderer.wrapHtml(`
      <div class="center-content">
        <div class="error-icon" style="color: var(--phr-fail)">${ICON_ERROR}</div>
        <h3 class="error-title">Unable to load report</h3>
        <p class="text-muted">${escapeHtml(message)}</p>
        <div class="btn-row">
          <button class="btn btn-secondary" data-action="refresh">Retry</button>
          <button class="btn btn-primary" data-action="configure">Configure report path</button>
        </div>
      </div>`);
  }

  static renderEmpty(ctx: RenderContext): string {
    return HtmlRenderer.wrapHtml(`
      ${HtmlRenderer.renderSwitcher(ctx)}
      <div class="center-content">
        <div class="empty-icon text-muted">${ICON_EMPTY}</div>
        <h3 class="empty-title">No tests in this report</h3>
        <p class="text-muted">The report exists but records no tests.</p>
        <button class="btn btn-secondary" data-action="refresh">Refresh</button>
      </div>`);
  }

  static renderAllPassed(data: ReportData, ctx: RenderContext): string {
    return HtmlRenderer.wrapHtml(`
      ${HtmlRenderer.renderSwitcher(ctx)}
      ${HtmlRenderer.renderSummarySection(data.summary, data.date, ctx)}
      <div class="center-content" style="padding-top: 12px;">
        <div class="success-icon" style="color: var(--phr-pass)">${ICON_PASS}</div>
        <h3 class="success-title">All tests passed</h3>
        <p class="text-muted">${data.summary.total} tests completed with no failures.</p>
      </div>
      ${HtmlRenderer.renderFooter(ctx)}`);
  }

  static renderResults(data: ReportData, ctx: RenderContext): string {
    const indexOf = new Map<TestResult, number>();
    data.tests.forEach((test, index) => indexOf.set(test, index));

    const groups = data.suites
      .filter((suite) => suite.tests.some((t) => t.status === 'FAIL' || t.status === 'ERROR'))
      .map((suite, position) => {
        const failing = suite.tests.filter((t) => t.status === 'FAIL' || t.status === 'ERROR');
        const bodyId = `suite-${position}`;
        const cards = failing
          .map((test) => HtmlRenderer.renderTestCard(test, indexOf.get(test) ?? 0, ctx))
          .join('');
        return `
        <div class="suite-group">
          <button class="suite-header" data-action="toggleSuite" data-target="${bodyId}" aria-expanded="true">
            <span class="suite-name">${escapeHtml(suite.suiteName)}</span>
            <span class="suite-count">${failing.length}</span>
          </button>
          <div class="suite-body" id="${bodyId}">${cards}</div>
        </div>`;
      })
      .join('');

    const failed = data.failedTests.length;
    return HtmlRenderer.wrapHtml(`
      ${HtmlRenderer.renderSwitcher(ctx)}
      ${HtmlRenderer.renderSummarySection(data.summary, data.date, ctx)}
      <div class="section-title">
        <span>${failed} failing ${failed === 1 ? 'test' : 'tests'}</span>
        ${ctx.historyBuildCount > 1
          ? `<span class="history-note">${ctx.historyBuildCount} builds of history</span>`
          : ''}
      </div>
      ${groups}
      ${HtmlRenderer.renderFooter(ctx)}`);
  }

  /**
   * The headline: a pass-rate ring, the counts, and where the run sits against
   * the builds before it.
   *
   * The counts used to sit on one uniform badge colour with only the number
   * tinted, which made `1 skipped` grey-on-grey and left xPASS and xFAIL with
   * no colour at all. Each figure now carries its own tinted plate, so the
   * status is legible from the shape of the chip rather than from reading it.
   */
  static renderSummarySection(
    summary: TestSummary,
    date?: string,
    ctx?: RenderContext
  ): string {
    const decided = summary.passed + summary.xpassed + summary.xfailed + summary.failed + summary.error;
    const rate = decided === 0 ? 0 : (summary.passed + summary.xpassed + summary.xfailed) / decided;
    const broken = summary.failed + summary.error;

    return `
      <div class="summary-section">
        <div class="summary-header">
          <span class="summary-label">Test Summary</span>
          ${date ? `<span class="summary-meta">${escapeHtml(date)}</span>` : ''}
        </div>

        <div class="summary-hero">
          ${HtmlRenderer.renderDonut(rate, broken)}
          <div class="hero-facts">
            <div class="hero-total">
              <span class="hero-value">${summary.total}</span>
              <span class="hero-label">tests</span>
            </div>
            <div class="hero-sub">
              ${summary.durationSeconds !== undefined
                ? `<span>${escapeHtml(formatDuration(summary.durationSeconds))}</span>`
                : ''}
              ${ctx && ctx.historyBuildCount > 1
                ? `<span>${ctx.historyBuildCount} builds tracked</span>`
                : ''}
            </div>
          </div>
        </div>

        ${HtmlRenderer.renderDistribution(summary)}

        <div class="summary-stats">
          ${HtmlRenderer.chip('pass', summary.passed, 'passed', true)}
          ${HtmlRenderer.chip('fail', summary.failed, 'failed', true)}
          ${HtmlRenderer.chip('error', summary.error, 'error')}
          ${HtmlRenderer.chip('skip', summary.skipped, 'skipped')}
          ${HtmlRenderer.chip('xpass', summary.xpassed, 'xpassed')}
          ${HtmlRenderer.chip('xfail', summary.xfailed, 'xfailed')}
          ${HtmlRenderer.chip('rerun', summary.rerun, 'reruns')}
        </div>

        ${ctx ? HtmlRenderer.renderHistoryChart(ctx) : ''}
      </div>`;
  }

  /** One count. Hidden entirely at zero unless it is a headline figure. */
  private static chip(kind: string, value: number, label: string, always = false): string {
    if (value === 0 && !always) {
      return '';
    }
    return `<div class="stat stat-${kind}"><span class="stat-value">${value}</span><span class="stat-label">${label}</span></div>`;
  }

  /**
   * Pass rate as a ring.
   *
   * Drawn with stroke-dasharray on a circle rather than an arc path: the maths
   * is one multiplication, and it degrades to a plain circle rather than to a
   * malformed path if anything is off.
   */
  private static renderDonut(rate: number, broken: number): string {
    const radius = 26;
    const circumference = 2 * Math.PI * radius;
    const filled = Math.max(0, Math.min(1, rate)) * circumference;
    const tone = broken === 0 ? 'pass' : rate >= 0.9 ? 'warn' : 'fail';

    return `
      <div class="donut donut-${tone}" role="img"
           aria-label="${Math.round(rate * 100)} percent of tests passed">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <circle class="donut-track" cx="32" cy="32" r="${radius}" fill="none" stroke-width="7"/>
          <circle class="donut-value" cx="32" cy="32" r="${radius}" fill="none" stroke-width="7"
                  stroke-linecap="round" transform="rotate(-90 32 32)"
                  stroke-dasharray="${filled.toFixed(2)} ${(circumference - filled).toFixed(2)}"/>
        </svg>
        <div class="donut-centre">
          <span class="donut-pct">${Math.round(rate * 100)}<i>%</i></span>
        </div>
      </div>`;
  }

  /**
   * Every status as one proportional bar.
   *
   * Segments below a pixel or so are widened to a visible minimum: a single
   * failure in seven hundred tests is exactly the thing worth seeing, and at
   * true scale it would be 0.14% of the width and invisible.
   */
  private static renderDistribution(summary: TestSummary): string {
    const parts: Array<[string, number, string]> = [
      ['pass', summary.passed, 'passed'],
      ['xpass', summary.xpassed, 'xpassed'],
      ['xfail', summary.xfailed, 'xfailed'],
      ['skip', summary.skipped, 'skipped'],
      ['error', summary.error, 'error'],
      ['fail', summary.failed, 'failed'],
    ].filter((p) => (p[1] as number) > 0) as Array<[string, number, string]>;

    if (parts.length === 0) {
      return '';
    }
    const total = parts.reduce((sum, p) => sum + p[1], 0);
    const MIN_PERCENT = 2.5;
    const raw = parts.map((p) => (p[1] / total) * 100);
    const lifted = raw.map((v) => Math.max(v, MIN_PERCENT));
    const scale = 100 / lifted.reduce((a, b) => a + b, 0);

    const segments = parts
      .map(
        ([kind, count, label], i) =>
          `<span class="seg seg-${kind}" style="width:${(lifted[i] * scale).toFixed(2)}%"
                 title="${count} ${label}"></span>`
      )
      .join('');
    return `<div class="distribution" aria-hidden="true">${segments}</div>`;
  }

  /**
   * Failures per build, oldest to newest.
   *
   * This is the view no single report can give, and the reason the extension
   * reads the archive at all.
   *
   * Bars rather than a pass-rate line: a healthy suite sits between 98% and
   * 100%, so a rate line is visually flat and spends its whole height on a
   * band nobody cares about, whereas "how many broke" spikes exactly when
   * something went wrong. Bars also survive being squashed into a short strip,
   * which circles on a stretched viewBox do not — they come out as ellipses.
   */
  private static renderHistoryChart(ctx: RenderContext): string {
    const builds = ctx.builds ?? [];
    if (builds.length < 2) {
      return '';
    }

    const counts = builds.map((b) => b.summary.failed + b.summary.error);
    const worst = Math.max(...counts, 1);
    const clean = counts.filter((c) => c === 0).length;
    const latest = counts[counts.length - 1];

    // Percentage widths so the strip fills whatever the panel is; a fixed
    // pixel bar would either overflow a narrow sidebar or leave a gap.
    const slot = 100 / counts.length;
    const bars = counts
      .map((count, i) => {
        // A clean build still gets a visible nub, so the row reads as a
        // timeline of builds rather than as gaps between the bad ones.
        const height = count === 0 ? 8 : 18 + (count / worst) * 82;
        const kind = count === 0 ? 'ok' : 'bad';
        const label = count === 0 ? 'no failures' : `${count} failing`;
        return `<span class="bar bar-${kind}" style="left:${(i * slot).toFixed(3)}%;width:${slot.toFixed(3)}%;height:${height.toFixed(1)}%" title="${label}"></span>`;
      })
      .join('');

    return `
      <div class="history">
        <div class="history-head">
          <span>Failures · last ${counts.length} builds</span>
          <span class="history-now">${clean}/${counts.length} clean</span>
        </div>
        <div class="bars" role="img"
             aria-label="Failures across the last ${counts.length} builds; most recent has ${latest}">
          ${bars}
        </div>
      </div>`;
  }

  private static renderTestCard(test: TestResult, index: number, ctx: RenderContext): string {
    const snippet =
      ctx.showErrorSnippets && test.errorSnippet
        ? `<div class="error-snippet">${escapeHtml(test.errorSnippet)}</div>`
        : '';

    const badges: string[] = [
      `<span class="badge badge-duration">${escapeHtml(formatDuration(test.durationSeconds))}</span>`,
    ];
    if (test.rerun > 0) {
      badges.push(`<span class="badge badge-rerun">${test.rerun} retries</span>`);
    }
    badges.push(HtmlRenderer.renderFlakeBadge(test, ctx));
    badges.push(HtmlRenderer.renderTrend(test, ctx));
    badges.push(
      `<button class="copy-btn" data-action="copyError" data-index="${index}" title="Copy the full error">copy error</button>`
    );

    return `
      <div class="test-card status-${statusClass(test.status)}" data-action="jump" data-index="${index}"
           title="Go to ${escapeHtml(test.functionName)}">
        <div class="test-head">
          <span class="test-name">${escapeHtml(test.testName)}</span>
          <span class="badge">${escapeHtml(statusLabel(test.status))}</span>
        </div>
        <div class="test-meta">${badges.filter(Boolean).join('')}</div>
        ${snippet}
      </div>`;
  }

  /**
   * A flake chip, and only when history actually says something.
   *
   * A badge on every row would be noise, so a test with a single build behind
   * it, or a consistent record, gets nothing.
   */
  private static renderFlakeBadge(test: TestResult, ctx: RenderContext): string {
    const verdict = ctx.flake?.get(test.archiveKey);
    if (!verdict || verdict.totalBuilds < 2) {
      return '';
    }
    if (verdict.isBroken) {
      return `<span class="badge badge-broken" title="Never passed in ${verdict.totalBuilds} builds">broken · 0/${verdict.totalBuilds}</span>`;
    }
    if (verdict.isFlaky) {
      return `<span class="badge badge-flaky" title="${verdict.flips} flips across ${verdict.totalBuilds} builds">flaky · ${escapeHtml(formatPercent(verdict.passRate))}</span>`;
    }
    return '';
  }

  private static renderTrend(test: TestResult, ctx: RenderContext): string {
    const trend = ctx.trends?.get(test.archiveKey);
    if (!trend || trend.length < 2) {
      return '';
    }
    // A broken test's badge already says 0/N and its trend is N identical red
    // ticks; drawing them too states the same fact twice.
    if (ctx.flake?.get(test.archiveKey)?.isBroken) {
      return '';
    }
    const dots = trend
      .slice(-12)
      .map((outcome) => `<span class="trend-dot trend-${outcome}"></span>`)
      .join('');
    return `<span class="trend" title="Oldest to newest across ${trend.length} builds">${dots}</span>`;
  }


  private static renderSwitcher(ctx: RenderContext): string {
    if (ctx.reports.length < 2) {
      return '';
    }
    const options = ctx.reports
      .map(
        (p) =>
          `<option value="${escapeHtml(p)}"${p === ctx.activeReport ? ' selected' : ''}>${escapeHtml(shortPath(p))}</option>`
      )
      .join('');
    return `<div class="report-selector"><select id="report-switcher" aria-label="Active report">${options}</select></div>`;
  }

  private static renderFooter(ctx: RenderContext): string {
    if (!ctx.hasHtmlReport) {
      return '';
    }
    return `
      <div class="footer">
        <button class="btn btn-secondary" data-action="openHtmlReport">Open full HTML report</button>
      </div>`;
  }
}
