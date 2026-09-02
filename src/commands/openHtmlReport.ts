/**
 * Showing the plugin's own HTML report inside VS Code.
 *
 * Display only. Nothing here parses the document for data — every number in the
 * sidebar comes from `output.json`. This panel exists because the generated
 * report has tabs the sidebar deliberately does not reproduce (Steps,
 * Attachments, Analytics, Coverage, screenshots), and opening it here beats
 * hunting for the file in a browser.
 */

import * as vscode from 'vscode';

import { ResolvedReport } from '../types/index.js';

let panel: vscode.WebviewPanel | undefined;

/**
 * Point the report's own relative asset references at the webview.
 *
 * The report links screenshots as `pytest_screenshots/<file>`, which resolves
 * to nothing inside a webview: its document lives on a `vscode-webview://`
 * origin, not on the report's directory. Rewriting `src`/`href` for that one
 * directory is the whole of the surgery — everything else in the file is
 * already inlined by the plugin.
 */
function rewriteAssets(html: string, webview: vscode.Webview, baseDir: string): string {
  return html.replace(
    /(src|href)=("|')(\.\/)?pytest_screenshots\/([^"']+)\2/g,
    (_match, attribute: string, quote: string, _dot: string, file: string) => {
      const uri = webview.asWebviewUri(
        vscode.Uri.file(`${baseDir}/pytest_screenshots/${file}`)
      );
      return `${attribute}=${quote}${uri.toString()}${quote}`;
    }
  );
}

export async function openHtmlReport(report: ResolvedReport | undefined): Promise<void> {
  if (!report?.htmlReportPath) {
    void vscode.window.showWarningMessage(
      'No HTML report found next to output.json. Run pytest with --html-report to generate one.'
    );
    return;
  }

  const baseUri = vscode.Uri.file(report.baseDir);

  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      'pytestHtmlReporter.htmlReport',
      'pytest HTML Report',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [baseUri],
      }
    );
    panel.onDidDispose(() => {
      panel = undefined;
    });
  } else {
    panel.reveal(vscode.ViewColumn.Active);
  }

  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(report.htmlReportPath));
    const html = Buffer.from(bytes).toString('utf8');
    // No CSP is injected here on purpose. The report is a self-contained
    // document written by the plugin, carrying its own inline scripts and
    // styles; a policy tight enough to be worth adding would break the tabs the
    // panel is opened to use. It loads nothing from the network.
    panel.webview.html = rewriteAssets(html, panel.webview, report.baseDir);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Could not open the HTML report: ${(error as Error).message}`
    );
  }
}
