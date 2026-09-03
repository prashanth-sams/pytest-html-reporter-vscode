/**
 * Render the sidebar to standalone HTML files you can open in a browser.
 *
 * Launching the Extension Development Host to look at a colour is a slow loop.
 * This renders the same markup the webview gets, so a style change is one
 * command and a refresh away.
 *
 * The webview inherits a large set of --vscode-* custom properties from the
 * host. Nothing outside VS Code supplies those, so the real Dark+ and Light+
 * values are stubbed below; without them every themed colour falls back to its
 * hard-coded default and the preview tells you nothing about what users see.
 *
 *   npm run preview                  # the bundled failure fixture
 *   npm run preview -- all-passed    # a green run
 *   npm run preview -- no-config     # nothing found yet
 *   npm run preview -- error         # a corrupt report
 *
 * PREVIEW_REPORT=/path/to/output.json points it at a real run of your own.
 */
import fs from 'node:fs';
import path from 'node:path';

const EXT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(EXT, '.preview');
fs.mkdirSync(OUT, { recursive: true });

const { parseOutputJson } = await import(`${EXT}/out/src/utils/outputJson.js`);
const { HtmlRenderer } = await import(`${EXT}/out/src/renderers/htmlRenderer.js`);
const { loadHistory, computeFlakeVerdicts, trendOf } = await import(
  `${EXT}/out/src/services/historyService.js`
);

const THEMES = {
  dark: {
    '--vscode-font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '--vscode-font-size': '13px',
    '--vscode-editor-font-family': 'Menlo, Monaco, "Courier New", monospace',
    '--vscode-foreground': '#cccccc',
    '--vscode-descriptionForeground': '#9d9d9d',
    '--vscode-editor-background': '#1f1f1f',
    '--vscode-sideBar-background': '#181818',
    '--vscode-panel-border': '#2b2b2b',
    '--vscode-badge-background': '#616161',
    '--vscode-badge-foreground': '#f8f8f8',
    '--vscode-button-background': '#0078d4',
    '--vscode-button-foreground': '#ffffff',
    '--vscode-button-hoverBackground': '#026ec1',
    '--vscode-button-secondaryBackground': '#313131',
    '--vscode-button-secondaryForeground': '#cccccc',
    '--vscode-dropdown-background': '#313131',
    '--vscode-dropdown-foreground': '#cccccc',
    '--vscode-dropdown-border': '#3c3c3c',
    '--vscode-list-hoverBackground': '#2a2d2e',
    '--vscode-sideBarSectionHeader-background': '#181818',
    '--vscode-textCodeBlock-background': '#2b2b2b',
    '--vscode-errorForeground': '#f85149',
    '--vscode-testing-iconPassed': '#3fb950',
    '--vscode-testing-iconFailed': '#f85149',
    '--vscode-testing-iconSkipped': '#848484',
    '--vscode-testing-iconErrored': '#f85149',
    '--vscode-charts-red': '#f14c4c',
    '--vscode-charts-green': '#3fb950',
    '--vscode-charts-yellow': '#cca700',
    '--vscode-charts-orange': '#d18616',
    '--vscode-charts-blue': '#3794ff',
    '--vscode-charts-purple': '#b180d7',
    '--vscode-progressBar-background': '#0078d4',
    '--vscode-focusBorder': '#0078d4',
  },
  light: {
    '--vscode-font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '--vscode-font-size': '13px',
    '--vscode-editor-font-family': 'Menlo, Monaco, "Courier New", monospace',
    '--vscode-foreground': '#3b3b3b',
    '--vscode-descriptionForeground': '#6b6b6b',
    '--vscode-editor-background': '#ffffff',
    '--vscode-sideBar-background': '#f8f8f8',
    '--vscode-panel-border': '#e5e5e5',
    '--vscode-badge-background': '#cccccc',
    '--vscode-badge-foreground': '#3b3b3b',
    '--vscode-button-background': '#005fb8',
    '--vscode-button-foreground': '#ffffff',
    '--vscode-button-hoverBackground': '#0258a8',
    '--vscode-button-secondaryBackground': '#e5e5e5',
    '--vscode-button-secondaryForeground': '#3b3b3b',
    '--vscode-dropdown-background': '#ffffff',
    '--vscode-dropdown-foreground': '#3b3b3b',
    '--vscode-dropdown-border': '#cecece',
    '--vscode-list-hoverBackground': '#f2f2f2',
    '--vscode-sideBarSectionHeader-background': '#f8f8f8',
    '--vscode-textCodeBlock-background': '#f3f3f3',
    '--vscode-errorForeground': '#cd3131',
    '--vscode-testing-iconPassed': '#107c10',
    '--vscode-testing-iconFailed': '#cd3131',
    '--vscode-testing-iconSkipped': '#848484',
    '--vscode-testing-iconErrored': '#cd3131',
    '--vscode-charts-red': '#cd3131',
    '--vscode-charts-green': '#107c10',
    '--vscode-charts-yellow': '#b89500',
    '--vscode-charts-orange': '#d18616',
    '--vscode-charts-blue': '#005fb8',
    '--vscode-charts-purple': '#652d90',
    '--vscode-progressBar-background': '#005fb8',
    '--vscode-focusBorder': '#005fb8',
  },
};

function themed(html, theme) {
  const vars = Object.entries(THEMES[theme])
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  const bg = THEMES[theme]['--vscode-sideBar-background'];
  return html
    .replace(
      '</head>',
      `<style>\n:root {\n${vars}\n}\nhtml,body { background: ${bg}; }\n</style>\n</head>`
    )
    // acquireVsCodeApi only exists inside a webview.
    .replace(
      '<script>',
      '<script>\nwindow.acquireVsCodeApi = () => ({ postMessage: (m) => console.log("post", JSON.stringify(m)) });\n'
    );
}

/** Load a report plus its history and build the render context. */
async function scenario(name) {
  // The live report is whatever was last run; the fixture is a pinned snapshot
  // with a realistic spread of failures, which is what the layout must handle.
  const src = process.env.PREVIEW_REPORT ?? `${EXT}/tests/fixtures/output.json`;
  const data = parseOutputJson(JSON.parse(fs.readFileSync(src, 'utf8')));
  // History comes from wherever the report lives, so pointing PREVIEW_REPORT at
  // a real run previews that run's real archive too.
  const baseDir = path.dirname(src);
  const { builds } = await loadHistory(
    { outputJsonPath: src, baseDir, archiveDir: path.join(baseDir, 'archive') },
    { maxBuilds: 25 }
  );
  const flake = computeFlakeVerdicts(builds);
  const trends = new Map();
  for (const t of data.tests) trends.set(t.archiveKey, trendOf(builds, t.archiveKey));

  const ctx = {
    reports: [src],
    activeReport: src,
    hasHtmlReport: true,
    showErrorSnippets: true,
    flake,
    trends,
    historyBuildCount: builds.length,
    builds,
  };
  if (name === 'results') return { html: HtmlRenderer.renderResults(data, ctx), data };
  if (name === 'all-passed') return { html: HtmlRenderer.renderAllPassed(data, ctx), data };
  if (name === 'no-config') return { html: HtmlRenderer.renderNoConfig(), data };
  if (name === 'error') return { html: HtmlRenderer.renderError('Invalid report format: Unexpected token'), data };
  throw new Error('unknown scenario ' + name);
}

const which = process.argv[2] ?? 'results';
const { html, data } = await scenario(which);

for (const theme of ['dark', 'light']) {
  const file = path.join(OUT, `preview-${which}-${theme}.html`);
  fs.writeFileSync(file, themed(html, theme));
  console.log('wrote', file);
}
console.log('summary:', JSON.stringify(data.summary));
console.log('\nOpen one of the files above in a browser to see the sidebar.');
