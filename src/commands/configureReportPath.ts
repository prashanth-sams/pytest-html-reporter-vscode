/**
 * Choosing which report the sidebar shows.
 */

import * as vscode from 'vscode';

import { SidebarProvider } from '../providers/sidebarProvider.js';
import { detectOutputJsonPaths, shortLabel } from '../utils/pathUtils.js';

const SECTION = 'pytestHtmlReporter';

async function updatePaths(paths: string[]): Promise<void> {
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await vscode.workspace.getConfiguration(SECTION).update('reportJsonPaths', paths, target);
}

export async function configureReportPath(provider?: SidebarProvider): Promise<void> {
  const config = vscode.workspace.getConfiguration(SECTION);
  const configured = config.get<string[]>('reportJsonPaths') ?? [];

  const detected: string[] = [];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    detected.push(...(await detectOutputJsonPaths(folder)));
  }

  type Item = vscode.QuickPickItem & { action: 'use' | 'browse' | 'clear'; path?: string };

  const items: Item[] = detected.map((p) => ({
    label: shortLabel(p),
    description: p,
    detail: configured.includes(p) ? 'Currently configured' : undefined,
    action: 'use',
    path: p,
  }));

  items.push({ label: '$(folder-opened) Browse…', description: 'Pick an output.json', action: 'browse' });
  if (configured.length > 0) {
    items.push({
      label: '$(clear-all) Clear configured paths',
      description: 'Go back to automatic detection',
      action: 'clear',
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: 'pytest-html-reporter: report path',
    placeHolder: detected.length
      ? 'Select a report, or browse for one'
      : 'No report detected — browse for an output.json',
  });
  if (!picked) {
    return;
  }

  if (picked.action === 'clear') {
    await updatePaths([]);
  } else if (picked.action === 'use' && picked.path) {
    await updatePaths([picked.path]);
  } else if (picked.action === 'browse') {
    const chosen = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Use this report',
      filters: { 'pytest-html-reporter report': ['json'] },
    });
    if (!chosen?.length) {
      return;
    }
    await updatePaths([chosen[0].fsPath]);
  }

  await provider?.refresh();
}
