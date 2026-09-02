/**
 * Sidebar stylesheet.
 *
 * Every colour is a VS Code theme variable, so the panel follows light, dark
 * and high-contrast themes without a palette of its own. The `--vscode-testing-*`
 * family is the same one the built-in Test Explorer uses, which is what makes a
 * passed/failed row here read as the same thing it does there.
 */
export function getStyles(): string {
  return `
:root {
  --phr-gap: 8px;
  --phr-radius: 4px;
  --phr-pass: var(--vscode-testing-iconPassed, #388a34);
  --phr-fail: var(--vscode-testing-iconFailed, #e51400);
  --phr-skip: var(--vscode-testing-iconSkipped, #848484);
  --phr-error: var(--vscode-testing-iconErrored, #e51400);
  --phr-muted: var(--vscode-descriptionForeground, #999);
  --phr-border: var(--vscode-panel-border, rgba(128,128,128,.35));
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-foreground);
  background: transparent;
}
.container { padding: 10px 12px 20px; }

.center-content {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 32px 16px; gap: 10px;
}
.empty-title, .success-title, .error-title { margin: 0; font-size: 1.05em; font-weight: 600; }
.success-title { color: var(--phr-pass); }
.error-title { color: var(--phr-fail); }
.text-muted { color: var(--phr-muted); margin: 0; line-height: 1.5; }
.empty-icon svg, .success-icon svg, .error-icon svg { opacity: .8; }

.btn {
  border: 1px solid transparent; border-radius: var(--phr-radius);
  padding: 5px 12px; cursor: pointer; font-size: inherit; font-family: inherit;
}
.btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.btn-secondary {
  background: var(--vscode-button-secondaryBackground, transparent);
  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  border-color: var(--phr-border);
}
.btn-row { display: flex; gap: var(--phr-gap); flex-wrap: wrap; justify-content: center; }

.report-selector { margin-bottom: 10px; }
.report-selector select {
  width: 100%; padding: 4px 6px; border-radius: var(--phr-radius);
  background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground);
  border: 1px solid var(--vscode-dropdown-border, var(--phr-border));
  font-family: inherit; font-size: inherit;
}

.summary-section {
  border: 1px solid var(--phr-border); border-radius: var(--phr-radius);
  padding: 10px; margin-bottom: 12px;
}
.summary-header {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 8px; gap: var(--phr-gap);
}
.summary-label { font-weight: 600; }
.summary-meta { color: var(--phr-muted); font-size: .9em; }
.summary-total { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
.total-value { font-size: 1.7em; font-weight: 600; line-height: 1; }
.total-label { color: var(--phr-muted); font-size: .9em; }
.summary-stats { display: flex; flex-wrap: wrap; gap: 6px; }
.stat-item {
  display: flex; align-items: baseline; gap: 5px;
  padding: 2px 8px; border-radius: 10px;
  background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
  font-size: .88em;
}
.stat-value { font-weight: 600; }
.stat-passed .stat-value { color: var(--phr-pass); }
.stat-failed .stat-value, .stat-error .stat-value { color: var(--phr-fail); }
.stat-skipped .stat-value { color: var(--phr-skip); }

.suite-group { margin-bottom: 10px; }
.suite-header {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 5px 6px; border: none; border-radius: var(--phr-radius);
  background: var(--vscode-sideBarSectionHeader-background, transparent);
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family, monospace); font-size: .9em;
  cursor: pointer; text-align: left;
}
.suite-header:hover { background: var(--vscode-list-hoverBackground); }
.suite-name { flex: 1; overflow-wrap: anywhere; }
.suite-count { color: var(--phr-muted); font-size: .9em; }
.suite-body { display: block; }
.suite-body[hidden] { display: none; }

.test-card {
  border-left: 2px solid transparent; padding: 6px 8px; margin: 4px 0 4px 6px;
  border-radius: 0 var(--phr-radius) var(--phr-radius) 0; cursor: pointer;
}
.test-card:hover { background: var(--vscode-list-hoverBackground); }
.test-card.status-fail, .test-card.status-error { border-left-color: var(--phr-fail); }
.test-card.status-pass { border-left-color: var(--phr-pass); }
.test-card.status-skip { border-left-color: var(--phr-skip); }
.test-card.status-xpass, .test-card.status-xfail { border-left-color: var(--vscode-charts-purple, #b180d7); }
.test-head { display: flex; align-items: baseline; gap: 6px; }
.test-name {
  font-family: var(--vscode-editor-font-family, monospace);
  overflow-wrap: anywhere; flex: 1;
}
.test-meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 3px; }
.badge {
  font-size: .78em; padding: 1px 6px; border-radius: 8px;
  background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
}
.badge-duration { background: transparent; color: var(--phr-muted); padding-left: 0; }
.badge-rerun { background: var(--vscode-charts-orange, #d18616); color: var(--vscode-editor-background); }
.badge-flaky { background: var(--vscode-charts-yellow, #cca700); color: var(--vscode-editor-background); }
.badge-broken { background: var(--phr-fail); color: var(--vscode-editor-background); }
.error-snippet {
  margin-top: 4px; padding: 5px 7px; border-radius: var(--phr-radius);
  background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.12));
  color: var(--vscode-errorForeground, var(--phr-fail));
  font-family: var(--vscode-editor-font-family, monospace); font-size: .85em;
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.copy-btn {
  background: none; border: none; color: var(--phr-muted);
  cursor: pointer; padding: 0 4px; font-size: .85em; font-family: inherit;
}
.copy-btn:hover { color: var(--vscode-foreground); text-decoration: underline; }

.trend { display: inline-flex; gap: 2px; vertical-align: middle; }
.trend-dot { width: 5px; height: 5px; border-radius: 1px; display: inline-block; }
.trend-pass { background: var(--phr-pass); }
.trend-fail { background: var(--phr-fail); }
.trend-skip { background: var(--phr-skip); }

.section-title {
  font-weight: 600; margin: 14px 0 6px; display: flex;
  justify-content: space-between; align-items: baseline; gap: var(--phr-gap);
}
.footer { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }
.history-note { color: var(--phr-muted); font-size: .85em; }

.loading-spinner {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid var(--phr-border); border-top-color: var(--vscode-progressBar-background, #0e70c0);
  animation: phr-spin 1s linear infinite;
}
@keyframes phr-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .loading-spinner { animation: none; } }
`;
}
