/**
 * Locating, loading and watching the active report.
 *
 * Every settings read lives here, so the pure modules underneath stay free of
 * configuration concerns and remain testable in plain node.
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as vscode from 'vscode';

import { ReportData, ResolvedReport } from '../types/index.js';
import { parseOutputJson } from '../utils/outputJson.js';
import { detectOutputJsonPaths, resolveReportArtifacts } from '../utils/pathUtils.js';

export interface ExtensionSettings {
  reportJsonPaths: string[];
  autoRefresh: boolean;
  showErrorSnippets: boolean;
  maxErrorLength: number;
  historyEnabled: boolean;
  historyMaxBuilds: number;
}

const SECTION = 'pytestHtmlReporter';

function clamp(value: number, low: number, high: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(high, Math.max(low, Math.floor(value)));
}

export function readSettings(): ExtensionSettings {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    reportJsonPaths: config.get<string[]>('reportJsonPaths') ?? [],
    autoRefresh: config.get<boolean>('autoRefresh') ?? true,
    showErrorSnippets: config.get<boolean>('showErrorSnippets') ?? true,
    maxErrorLength: clamp(config.get<number>('maxErrorLength') ?? 150, 50, 500, 150),
    historyEnabled: config.get<boolean>('history.enabled') ?? true,
    historyMaxBuilds: clamp(config.get<number>('history.maxBuilds') ?? 25, 2, 200, 25),
  };
}

const WATCH_DEBOUNCE_MS = 300;
const SETTLE_POLL_MS = 120;
const SETTLE_MAX_POLLS = 40;

export class ReportService {
  private watcher: fs.FSWatcher | undefined;
  private debounce: NodeJS.Timeout | undefined;
  private activeReport: string | undefined;

  getConfiguredReportPaths(): string[] {
    return readSettings().reportJsonPaths;
  }

  setActiveReport(outputJsonPath: string): void {
    this.activeReport = outputJsonPath;
  }

  getActiveReportPath(): string | undefined {
    return this.activeReport;
  }

  /**
   * Reports the user can switch between: their configured paths when they have
   * any, otherwise whatever auto-detection turns up.
   *
   * Configured paths that no longer exist are pruned back into settings, so a
   * report deleted between runs stops haunting the switcher.
   */
  async listAvailableReports(): Promise<string[]> {
    const configured = this.getConfiguredReportPaths();

    if (configured.length > 0) {
      const alive: string[] = [];
      for (const p of configured) {
        if (fs.existsSync(p)) {
          alive.push(p);
        }
      }
      if (alive.length !== configured.length) {
        await vscode.workspace
          .getConfiguration(SECTION)
          .update('reportJsonPaths', alive, vscode.ConfigurationTarget.Workspace)
          .then(undefined, () => undefined);
      }
      if (alive.length > 0) {
        return alive;
      }
    }

    const detected: string[] = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      detected.push(...(await detectOutputJsonPaths(folder)));
    }
    return detected;
  }

  async resolveReportPath(): Promise<string | null> {
    const available = await this.listAvailableReports();
    if (available.length === 0) {
      return null;
    }
    if (this.activeReport && available.includes(this.activeReport)) {
      return this.activeReport;
    }
    this.activeReport = available[0];
    return this.activeReport;
  }

  async resolveArtifacts(outputJsonPath: string): Promise<ResolvedReport> {
    return resolveReportArtifacts(outputJsonPath);
  }

  /**
   * Wait until the file stops growing before reading it.
   *
   * The plugin writes `output.json` in one pass at the very end of a run, and a
   * real suite's file runs to megabytes. A watcher that reads on the first
   * change event routinely catches a half-written file and reports a parse
   * error for a run that was perfectly fine. Two consecutive identical sizes is
   * enough to call it settled.
   */
  private async settle(outputJsonPath: string): Promise<void> {
    let previous = -1;
    for (let i = 0; i < SETTLE_MAX_POLLS; i++) {
      let size: number;
      try {
        size = (await fsp.stat(outputJsonPath)).size;
      } catch {
        return;
      }
      if (size === previous && size > 0) {
        return;
      }
      previous = size;
      await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
    }
  }

  async loadReport(outputJsonPath: string): Promise<ReportData> {
    await this.settle(outputJsonPath);
    const settings = readSettings();
    const text = await fsp.readFile(outputJsonPath, 'utf8');
    return parseOutputJson(JSON.parse(text), {
      maxErrorLength: settings.maxErrorLength,
      includeErrorSnippets: settings.showErrorSnippets,
    });
  }

  /** Watch one report, replacing any previous watch. No-op when autoRefresh is off. */
  watch(outputJsonPath: string, onChange: () => void): void {
    this.stopWatching();
    if (!readSettings().autoRefresh) {
      return;
    }
    try {
      this.watcher = fs.watch(outputJsonPath, (event) => {
        if (event !== 'change' && event !== 'rename') {
          return;
        }
        if (this.debounce) {
          clearTimeout(this.debounce);
        }
        this.debounce = setTimeout(onChange, WATCH_DEBOUNCE_MS);
      });
      this.watcher.on('error', () => this.stopWatching());
    } catch {
      // Watching is a convenience; the manual refresh command still works.
    }
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = undefined;
    if (this.debounce) {
      clearTimeout(this.debounce);
      this.debounce = undefined;
    }
  }

  dispose(): void {
    this.stopWatching();
  }
}
