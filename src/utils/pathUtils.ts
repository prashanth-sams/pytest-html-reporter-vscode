/**
 * Finding a report on disk, and mapping a suite name back to a source file.
 */

import * as vscode from 'vscode';

import { ResolvedReport } from '../types/index.js';

/** Absolute paths stay as they are; anything else resolves against the folder. */
export function resolveWorkspacePath(p: string, workspace: vscode.WorkspaceFolder): vscode.Uri {
  if (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)) {
    return vscode.Uri.file(p);
  }
  return vscode.Uri.joinPath(workspace.uri, p.replace(/^\.[\\/]/, ''));
}

export async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/** Last-ditch lookup when a recorded suite path no longer resolves. */
export async function findFileByFilename(
  fileName: string,
  maxResults = 5
): Promise<vscode.Uri | null> {
  const found = await vscode.workspace.findFiles(
    `**/${fileName}`,
    '**/node_modules/**',
    maxResults
  );
  return found.length > 0 ? found[0] : null;
}

/** Two trailing segments — enough to tell `report/output.json` from `reports/output.json`. */
export function shortLabel(fsPath: string): string {
  const parts = fsPath.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join('/') || fsPath;
}

function dirnameOf(fsPath: string): string {
  const idx = Math.max(fsPath.lastIndexOf('/'), fsPath.lastIndexOf('\\'));
  return idx <= 0 ? fsPath : fsPath.slice(0, idx);
}

/**
 * Everything that belongs to one report, given its `output.json`.
 *
 * The HTML file is located by looking, never by predicting. `--html-report` can
 * rename it, and a path holding strftime placeholders is expanded inside the
 * pytest process against that process's clock — so recomputing the name here
 * would disagree with disk whenever a run crosses a minute boundary.
 */
export async function resolveReportArtifacts(outputJsonPath: string): Promise<ResolvedReport> {
  const baseDir = dirnameOf(outputJsonPath);
  const resolved: ResolvedReport = {
    outputJsonPath,
    baseDir,
    archiveDir: `${baseDir}/archive`,
  };

  const conventional = vscode.Uri.file(`${baseDir}/pytest_html_report.html`);
  if (await fileExists(conventional)) {
    resolved.htmlReportPath = conventional.fsPath;
    return resolved;
  }

  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(baseDir));
    const html = entries
      .filter(([name, kind]) => kind === vscode.FileType.File && name.endsWith('.html'))
      .map(([name]) => name)
      .sort();
    if (html.length === 1) {
      resolved.htmlReportPath = `${baseDir}/${html[0]}`;
    }
  } catch {
    // Unreadable base directory: no HTML report, everything else still works.
  }

  return resolved;
}

/** Directories a report is conventionally written into, best first. */
const CANDIDATE_DIRS = ['', 'report', 'reports', 'test-reports', '.reports', 'test-results'];

/**
 * Whether a JSON file really is one of this plugin's reports.
 *
 * `output.json` is a common enough name that a Python repo may hold several
 * that have nothing to do with pytest. Rendering an unrelated file's contents
 * as test results would be worse than finding nothing, so every candidate is
 * checked for the plugin's own shape before it is offered.
 */
async function looksLikeReport(uri: vscode.Uri): Promise<boolean> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
    return Boolean(
      parsed &&
        typeof parsed === 'object' &&
        parsed.content &&
        typeof parsed.content === 'object' &&
        parsed.content.suites &&
        typeof parsed.content.suites === 'object'
    );
  } catch {
    return false;
  }
}

/** Absolute paths of every plausible `output.json` in a folder, best first. */
export async function detectOutputJsonPaths(
  workspace: vscode.WorkspaceFolder
): Promise<string[]> {
  const found: string[] = [];
  const seen = new Set<string>();

  const consider = async (uri: vscode.Uri): Promise<void> => {
    const key = uri.fsPath;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    if (await looksLikeReport(uri)) {
      found.push(key);
    }
  };

  for (const dir of CANDIDATE_DIRS) {
    const uri = dir
      ? vscode.Uri.joinPath(workspace.uri, dir, 'output.json')
      : vscode.Uri.joinPath(workspace.uri, 'output.json');
    await consider(uri);
  }

  try {
    const wider = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspace, '**/output.json'),
      '{**/node_modules/**,**/.venv/**,**/venv/**,**/site-packages/**}',
      20
    );
    for (const uri of wider) {
      await consider(uri);
    }
  } catch {
    // Search unavailable; the conventional locations above still apply.
  }

  return found;
}
