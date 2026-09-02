/**
 * The sidebar view: resolve a report, render it, keep it current.
 */

import * as vscode from 'vscode';

import { FlakeVerdict, ReportData, ResolvedReport, TestOutcome, WebviewMessage } from '../types/index.js';
import { HtmlRenderer, RenderContext } from '../renderers/htmlRenderer.js';
import { ReportService, readSettings } from '../services/reportService.js';
import { computeFlakeVerdicts, loadHistory, trendOf } from '../services/historyService.js';

export class SidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'pytestHtmlReporter.sidebar';

  private view: vscode.WebviewView | undefined;
  private readonly service = new ReportService();
  private data: ReportData | undefined;
  private resolved: ResolvedReport | undefined;
  private loading = false;

  private readonly statusChanged = new vscode.EventEmitter<ReportData | undefined>();
  /** Fires whenever the loaded report changes, so the status bar can follow. */
  readonly onDidChangeReport = this.statusChanged.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    view: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.onDidReceiveMessage((message: WebviewMessage) => this.handleMessage(message));
    view.onDidDispose(() => this.service.stopWatching());
    void this.loadReport();
  }

  getResolvedReport(): ResolvedReport | undefined {
    return this.resolved;
  }

  getReportData(): ReportData | undefined {
    return this.data;
  }

  async refresh(): Promise<void> {
    await this.loadReport();
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.command) {
      case 'refresh':
        await this.refresh();
        break;
      case 'configure':
        await vscode.commands.executeCommand('pytestHtmlReporter.configureReportPath');
        break;
      case 'openHtmlReport':
        await vscode.commands.executeCommand('pytestHtmlReporter.openHtmlReport');
        break;
      case 'switchReport':
        this.service.setActiveReport(message.path);
        await this.loadReport();
        break;
      case 'jump':
        await this.jump(message.index);
        break;
      case 'copyError':
        await this.copyError(message.index);
        break;
    }
  }

  private async jump(index: number): Promise<void> {
    const test = this.data?.tests[index];
    if (!test) {
      return;
    }
    await vscode.commands.executeCommand(
      'pytestHtmlReporter.jumpToTest',
      test.suiteName,
      test.testName
    );
  }

  /**
   * Copy the raw message, escape codes and all.
   *
   * The sidebar shows the ANSI-stripped text because the codes are unreadable
   * on screen, but the clipboard gets the original: pasted into a terminal it
   * renders with pytest's own colouring, which is usually why it is being
   * copied.
   */
  private async copyError(index: number): Promise<void> {
    const test = this.data?.tests[index];
    if (!test?.message) {
      return;
    }
    await vscode.env.clipboard.writeText(test.message);
    void vscode.window.showInformationMessage('Error copied to clipboard.');
  }

  async loadReport(): Promise<void> {
    if (this.loading) {
      return;
    }
    this.loading = true;
    try {
      this.render(HtmlRenderer.renderLoading());

      const reportPath = await this.service.resolveReportPath();
      if (!reportPath) {
        this.data = undefined;
        this.resolved = undefined;
        this.statusChanged.fire(undefined);
        this.render(HtmlRenderer.renderNoConfig());
        return;
      }

      this.service.watch(reportPath, () => void this.loadReport());

      let data: ReportData;
      try {
        data = await this.service.loadReport(reportPath);
      } catch (error) {
        this.data = undefined;
        this.statusChanged.fire(undefined);
        this.render(HtmlRenderer.renderError((error as Error).message));
        return;
      }

      this.data = data;
      this.resolved = await this.service.resolveArtifacts(reportPath);
      this.statusChanged.fire(data);

      const ctx = await this.buildContext(data, reportPath);

      if (data.summary.total === 0) {
        this.render(HtmlRenderer.renderEmpty(ctx));
      } else if (data.failedTests.length === 0) {
        this.render(HtmlRenderer.renderAllPassed(data, ctx));
      } else {
        this.render(HtmlRenderer.renderResults(data, ctx));
      }
    } finally {
      this.loading = false;
    }
  }

  private async buildContext(data: ReportData, reportPath: string): Promise<RenderContext> {
    const settings = readSettings();
    const ctx: RenderContext = {
      reports: await this.service.listAvailableReports(),
      activeReport: reportPath,
      hasHtmlReport: Boolean(this.resolved?.htmlReportPath),
      showErrorSnippets: settings.showErrorSnippets,
      historyBuildCount: 0,
    };

    if (!settings.historyEnabled || !this.resolved) {
      return ctx;
    }

    try {
      const history = await loadHistory(this.resolved, { maxBuilds: settings.historyMaxBuilds });
      ctx.historyBuildCount = history.builds.length;
      ctx.flake = computeFlakeVerdicts(history.builds) as Map<string, FlakeVerdict>;

      const trends = new Map<string, TestOutcome[]>();
      for (const test of data.failedTests) {
        trends.set(test.archiveKey, trendOf(history.builds, test.archiveKey));
      }
      ctx.trends = trends;
    } catch {
      // History is an enhancement; a report still renders fully without it.
    }
    return ctx;
  }

  private render(html: string): void {
    if (this.view) {
      this.view.webview.html = html;
    }
  }

  dispose(): void {
    this.service.dispose();
    this.statusChanged.dispose();
  }
}
