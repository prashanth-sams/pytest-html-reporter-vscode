/**
 * Extension entry point. Wiring only — behaviour lives in the provider.
 */

import * as vscode from 'vscode';

import { SidebarProvider } from './providers/sidebarProvider.js';
import { configureReportPath } from './commands/configureReportPath.js';
import { jumpToTest } from './commands/jumpToTest.js';
import { openHtmlReport } from './commands/openHtmlReport.js';
import { ReportData } from './types/index.js';

let provider: SidebarProvider | undefined;

function updateStatusBar(item: vscode.StatusBarItem, data: ReportData | undefined): void {
  if (!data || data.summary.total === 0) {
    item.hide();
    return;
  }
  const { passed, failed, error } = data.summary;
  const bad = failed + error;
  item.text = bad > 0 ? `$(error) ${bad} failing` : `$(pass) ${passed} passing`;
  item.tooltip = `pytest-html-reporter — ${passed} passed, ${bad} failed of ${data.summary.total}`;
  item.backgroundColor = bad > 0
    ? new vscode.ThemeColor('statusBarItem.errorBackground')
    : undefined;
  item.show();
}

export function activate(context: vscode.ExtensionContext): void {
  provider = new SidebarProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'pytestHtmlReporter.focusSidebar';
  context.subscriptions.push(status);
  context.subscriptions.push(provider.onDidChangeReport((data) => updateStatusBar(status, data)));

  context.subscriptions.push(
    vscode.commands.registerCommand('pytestHtmlReporter.refresh', () => provider?.refresh()),
    vscode.commands.registerCommand('pytestHtmlReporter.configureReportPath', () =>
      configureReportPath(provider)
    ),
    vscode.commands.registerCommand('pytestHtmlReporter.openHtmlReport', () =>
      openHtmlReport(provider?.getResolvedReport())
    ),
    vscode.commands.registerCommand(
      'pytestHtmlReporter.jumpToTest',
      (suiteName: string, testName: string) => jumpToTest(suiteName, testName)
    ),
    vscode.commands.registerCommand('pytestHtmlReporter.focusSidebar', () =>
      vscode.commands.executeCommand('pytestHtmlReporter.sidebar.focus')
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider?.refresh()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('pytestHtmlReporter')) {
        void provider?.refresh();
      }
    })
  );
}

export function deactivate(): void {
  provider?.dispose();
  provider = undefined;
}
