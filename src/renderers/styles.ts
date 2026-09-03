/**
 * Sidebar stylesheet.
 *
 * Every colour is a VS Code theme variable, so the panel follows light, dark
 * and high-contrast themes without a palette of its own. The `--vscode-testing-*`
 * family is the same one the built-in Test Explorer uses, which is what makes a
 * passed/failed row here read as the same thing it does there.
 *
 * Status colours are used two ways: full strength for the figure itself, and
 * mixed down into the background for the plate behind it. `color-mix` does that
 * against whatever the theme supplies, which is the only way to tint a colour
 * that is not known until runtime.
 */
export function getStyles(): string {
  return `
:root {
  --phr-radius: 5px;
  --phr-pass:  var(--vscode-testing-iconPassed,  #3fb950);
  --phr-fail:  var(--vscode-testing-iconFailed,  #f85149);
  --phr-error: var(--vscode-testing-iconErrored, #f85149);
  --phr-skip:  var(--vscode-testing-iconSkipped, #848484);
  --phr-xpass: var(--vscode-charts-purple, #b180d7);
  --phr-xfail: var(--vscode-charts-blue,   #3794ff);
  --phr-rerun: var(--vscode-charts-orange, #d18616);
  --phr-warn:  var(--vscode-charts-yellow, #cca700);
  --phr-muted: var(--vscode-descriptionForeground, #999);
  --phr-border: var(--vscode-panel-border, rgba(128,128,128,.3));
  --phr-surface: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-foreground);
  background: transparent;
  line-height: 1.45;
}
.container { padding: 10px 12px 24px; }

/* ---------------------------------------------------------------- states */
.center-content {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 34px 16px; gap: 10px;
}
.empty-title, .success-title, .error-title { margin: 0; font-size: 1.05em; font-weight: 600; }
.success-title { color: var(--phr-pass); }
.error-title { color: var(--phr-fail); }
.text-muted { color: var(--phr-muted); margin: 0; }
.text-muted code {
  font-family: var(--vscode-editor-font-family, monospace);
  background: var(--phr-surface); padding: 1px 5px; border-radius: 3px;
}
.btn {
  border: 1px solid transparent; border-radius: var(--phr-radius);
  padding: 5px 12px; cursor: pointer; font: inherit;
}
.btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.btn-secondary {
  background: var(--vscode-button-secondaryBackground, transparent);
  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  border-color: var(--phr-border);
}
.btn-secondary:hover { border-color: var(--vscode-focusBorder, var(--phr-border)); }
.btn-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

.report-selector { margin-bottom: 10px; }
.report-selector select {
  width: 100%; padding: 4px 6px; border-radius: var(--phr-radius); font: inherit;
  background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground);
  border: 1px solid var(--vscode-dropdown-border, var(--phr-border));
}

/* --------------------------------------------------------------- summary */
.summary-section {
  border: 1px solid var(--phr-border); border-radius: 8px;
  padding: 12px; margin-bottom: 14px; background: var(--phr-surface);
}
.summary-header {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
}
.summary-label { font-weight: 600; }
.summary-meta { color: var(--phr-muted); font-size: .85em; }

.summary-hero { display: flex; align-items: center; gap: 14px; margin: 10px 0 12px; }
.hero-facts { min-width: 0; }
.hero-total { display: flex; align-items: baseline; gap: 6px; }
.hero-value { font-size: 2em; font-weight: 650; line-height: 1; letter-spacing: -.02em; }
.hero-label { color: var(--phr-muted); }
.hero-sub {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
  color: var(--phr-muted); font-size: .85em; margin-top: 3px;
}

/* The ring. The track is the same hue at low alpha so it reads as an unfilled
   portion of the same dial rather than as a separate grey object. */
.donut { position: relative; width: 64px; height: 64px; flex: none; }
.donut-track { stroke: color-mix(in srgb, var(--vscode-foreground) 14%, transparent); }
.donut-value { stroke: var(--phr-pass); transition: stroke-dasharray .3s ease; }
.donut-warn .donut-value { stroke: var(--phr-warn); }
.donut-fail .donut-value { stroke: var(--phr-fail); }
.donut-centre {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
}
.donut-pct { font-size: 1.05em; font-weight: 650; letter-spacing: -.02em; }
.donut-pct i { font-style: normal; font-size: .68em; opacity: .65; margin-left: 1px; }

.distribution {
  display: flex; height: 6px; border-radius: 3px; overflow: hidden;
  gap: 1px; margin-bottom: 10px;
}
.seg { display: block; height: 100%; }
.seg-pass  { background: var(--phr-pass); }
.seg-fail  { background: var(--phr-fail); }
.seg-error { background: var(--phr-error); }
.seg-skip  { background: var(--phr-skip); }
.seg-xpass { background: var(--phr-xpass); }
.seg-xfail { background: var(--phr-xfail); }

/* Each count on its own tinted plate: the status is readable from the colour
   of the chip, not only from the word inside it. */
.summary-stats { display: flex; flex-wrap: wrap; gap: 5px; }
.stat {
  display: inline-flex; align-items: baseline; gap: 4px;
  padding: 2px 8px; border-radius: 999px; font-size: .85em;
  border: 1px solid transparent;
}
.stat-value { font-weight: 650; }
.stat-label { opacity: .85; }
.stat-pass  { background: color-mix(in srgb, var(--phr-pass) 16%, transparent);  color: var(--phr-pass);  border-color: color-mix(in srgb, var(--phr-pass) 30%, transparent); }
.stat-fail  { background: color-mix(in srgb, var(--phr-fail) 16%, transparent);  color: var(--phr-fail);  border-color: color-mix(in srgb, var(--phr-fail) 32%, transparent); }
.stat-error { background: color-mix(in srgb, var(--phr-error) 16%, transparent); color: var(--phr-error); border-color: color-mix(in srgb, var(--phr-error) 32%, transparent); }
.stat-skip  { background: color-mix(in srgb, var(--phr-skip) 20%, transparent);  color: color-mix(in srgb, var(--phr-skip) 75%, var(--vscode-foreground)); border-color: color-mix(in srgb, var(--phr-skip) 34%, transparent); }
.stat-xpass { background: color-mix(in srgb, var(--phr-xpass) 16%, transparent); color: var(--phr-xpass); border-color: color-mix(in srgb, var(--phr-xpass) 32%, transparent); }
.stat-xfail { background: color-mix(in srgb, var(--phr-xfail) 16%, transparent); color: var(--phr-xfail); border-color: color-mix(in srgb, var(--phr-xfail) 32%, transparent); }
.stat-rerun { background: color-mix(in srgb, var(--phr-rerun) 16%, transparent); color: var(--phr-rerun); border-color: color-mix(in srgb, var(--phr-rerun) 32%, transparent); }

/* --------------------------------------------------------------- history */
.history { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--phr-border); }
.history-head {
  display: flex; justify-content: space-between; align-items: baseline;
  color: var(--phr-muted); font-size: .8em; margin-bottom: 4px;
}
.history-now { font-weight: 650; color: var(--vscode-foreground); }
.bars { position: relative; height: 30px; }
.bar {
  position: absolute; bottom: 0; border-radius: 1px;
  border-left: 1px solid transparent; border-right: 1px solid transparent;
  background-clip: padding-box;
}
.bar-ok  { background: color-mix(in srgb, var(--phr-pass) 55%, transparent); }
.bar-bad { background: var(--phr-fail); }
.bar:hover { filter: brightness(1.25); }

/* ----------------------------------------------------------------- lists */
.section-title {
  font-weight: 600; margin: 16px 0 8px; display: flex;
  justify-content: space-between; align-items: baseline; gap: 8px;
}
.history-note { color: var(--phr-muted); font-size: .85em; font-weight: 400; }

.suite-group { margin-bottom: 8px; }
.suite-header {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 5px 6px; border: none; border-radius: var(--phr-radius);
  background: transparent; color: var(--phr-muted);
  font-family: var(--vscode-editor-font-family, monospace); font-size: .85em;
  cursor: pointer; text-align: left;
}
.suite-header:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
/* Long paths elide at the front: the file name is what identifies a suite. */
.suite-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
.suite-count {
  font-size: .9em; padding: 0 6px; border-radius: 999px;
  background: color-mix(in srgb, var(--phr-fail) 18%, transparent); color: var(--phr-fail);
}
.suite-body[hidden] { display: none; }

.test-card {
  border-left: 2px solid transparent; padding: 7px 9px; margin: 3px 0 3px 4px;
  border-radius: 0 var(--phr-radius) var(--phr-radius) 0; cursor: pointer;
}
.test-card:hover { background: var(--vscode-list-hoverBackground); }
.test-card.status-fail, .test-card.status-error { border-left-color: var(--phr-fail); }
.test-card.status-pass { border-left-color: var(--phr-pass); }
.test-card.status-skip { border-left-color: var(--phr-skip); }
.test-card.status-xpass { border-left-color: var(--phr-xpass); }
.test-card.status-xfail { border-left-color: var(--phr-xfail); }

.test-head { display: flex; align-items: baseline; gap: 6px; }
/* break-word, not anywhere: a long test name should wrap at an underscore
   rather than mid-token, which is what split ..._the_step_th / at_failed. */
.test-name {
  font-family: var(--vscode-editor-font-family, monospace); font-size: .92em;
  overflow-wrap: break-word; word-break: break-word; flex: 1; min-width: 0;
}
.test-meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
.badge { font-size: .78em; padding: 1px 6px; border-radius: 999px; white-space: nowrap; }
.badge-duration { color: var(--phr-muted); padding-left: 0; }
.badge-rerun { background: color-mix(in srgb, var(--phr-rerun) 18%, transparent); color: var(--phr-rerun); }
.badge-flaky { background: color-mix(in srgb, var(--phr-warn) 20%, transparent); color: var(--phr-warn); }
.badge-broken { background: color-mix(in srgb, var(--phr-fail) 18%, transparent); color: var(--phr-fail); }

/* The snippet is the loudest thing on a card if it is a red block, and a list
   of them is unreadable. Neutral plate, red reserved for the left edge. */
.error-snippet {
  margin-top: 5px; padding: 6px 8px; border-radius: var(--phr-radius);
  border-left: 2px solid color-mix(in srgb, var(--phr-fail) 55%, transparent);
  background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.1));
  color: var(--vscode-foreground); opacity: .9;
  font-family: var(--vscode-editor-font-family, monospace); font-size: .82em;
  white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word;
}
.copy-btn {
  background: none; border: none; color: var(--phr-muted);
  cursor: pointer; padding: 0 2px; font: inherit; font-size: .8em;
}
.copy-btn:hover { color: var(--vscode-foreground); text-decoration: underline; }

.trend { display: inline-flex; gap: 2px; vertical-align: middle; }
.trend-dot { width: 4px; height: 9px; border-radius: 1px; display: inline-block; opacity: .85; }
.trend-pass { background: var(--phr-pass); }
.trend-fail { background: var(--phr-fail); }
.trend-skip { background: var(--phr-skip); }

.footer { margin-top: 18px; display: flex; flex-direction: column; gap: 6px; }

.loading-spinner {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid var(--phr-border);
  border-top-color: var(--vscode-progressBar-background, #0e70c0);
  animation: phr-spin 1s linear infinite;
}
@keyframes phr-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .loading-spinner { animation: none; }
  .donut-value { transition: none; }
}
`;
}
