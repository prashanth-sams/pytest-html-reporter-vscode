/**
 * Jumping from a failure in the sidebar to the test in the editor.
 *
 * This is the one command the reference extension gets for free and this one
 * cannot. pytest-html-plus records `file` and `line` per test, so its jump is a
 * one-liner. pytest-html-reporter records neither: `output.json` carries only
 * `suite_name` (a workspace-relative path) and `test_name` (pytest's
 * `item.name`, with the class segment of the nodeid already discarded).
 *
 * So the file comes from the suite and the line is recovered by scanning that
 * file's source for the matching `def`.
 */

import * as vscode from 'vscode';

import { locateTest, FunctionDefinition } from '../utils/testLocator.js';
import { findFileByFilename, resolveWorkspacePath } from '../utils/pathUtils.js';

const HIGHLIGHT_MS = 1800;

async function resolveSuiteUri(suiteName: string): Promise<vscode.Uri | undefined> {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const candidate = resolveWorkspacePath(suiteName, folder);
    try {
      await vscode.workspace.fs.stat(candidate);
      return candidate;
    } catch {
      // Try the next folder.
    }
  }
  const basename = suiteName.split(/[\\/]/).pop() ?? suiteName;
  return (await findFileByFilename(basename)) ?? undefined;
}

/**
 * Ask which one when a name is defined more than once.
 *
 * Two classes in one file can hold a method of the same name, and the archive
 * record has no class segment to tell them apart — the information needed was
 * never written. Guessing silently would land the user in the wrong test half
 * the time, so the choice is theirs.
 */
async function chooseCandidate(
  candidates: FunctionDefinition[],
  functionName: string
): Promise<FunctionDefinition | undefined> {
  if (candidates.length === 1) {
    return candidates[0];
  }
  const picked = await vscode.window.showQuickPick(
    candidates.map((candidate) => ({
      label: `Line ${candidate.line + 1}`,
      description: candidate.lineText.trim(),
      candidate,
    })),
    {
      title: `${functionName} is defined ${candidates.length} times in this file`,
      placeHolder: 'The report does not record which one ran — pick a definition',
    }
  );
  return picked?.candidate;
}

export async function jumpToTest(suiteName: string, testName: string): Promise<void> {
  if (!suiteName) {
    void vscode.window.showErrorMessage('This result has no source file recorded.');
    return;
  }

  const uri = await resolveSuiteUri(suiteName);
  if (!uri) {
    void vscode.window.showErrorMessage(`Could not find ${suiteName} in this workspace.`);
    return;
  }

  let document: vscode.TextDocument;
  try {
    document = await vscode.workspace.openTextDocument(uri);
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not open ${suiteName}: ${(error as Error).message}`);
    return;
  }

  const located = locateTest(document.getText(), testName);
  let line = 0;

  if (located) {
    const chosen = await chooseCandidate(located.candidates, located.match.lineText.trim());
    if (!chosen) {
      return;
    }
    line = chosen.line;
  } else {
    // Renamed or deleted since the run. The file is still the right place to
    // land, so open it rather than refusing to navigate.
    void vscode.window.showWarningMessage(
      `Could not find ${testName} in ${suiteName} — it may have been renamed since this run.`
    );
  }

  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const position = new vscode.Position(line, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport
  );

  const decoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    isWholeLine: true,
  });
  editor.setDecorations(decoration, [new vscode.Range(position, position)]);
  setTimeout(() => decoration.dispose(), HIGHLIGHT_MS);
}
