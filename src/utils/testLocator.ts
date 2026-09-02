/**
 * Recovering a test's source position from a pytest-html-reporter record.
 *
 * The reference extension had it easy: pytest-html-plus writes `file` and
 * `line` for every test. pytest-html-reporter writes neither. All we get is
 * `suite_name` (a workspace-relative .py path) and `test_name`, which is
 * pytest's `item.name` — the function name plus any `[param]` suffix, with the
 * class segment of the nodeid already discarded. So the line number cannot be
 * read; it has to be recovered by scanning the Python source.
 *
 * This module is that scan. It is pure text work — no `vscode`, no `fs` — so
 * the caller supplies the file contents and decides what to do with an
 * ambiguous or missing result.
 */

/** One `def` (or `async def`) found in a Python source file. */
export interface FunctionDefinition {
  /** 0-based line index of the `def` line itself, never of a decorator above it. */
  line: number;
  /** The source line as written, indentation included, newline stripped. */
  lineText: string;
  /** 0-based column where the function name starts — handy for a precise cursor. */
  column: number;
  /** Leading whitespace length. Non-zero means the def is nested, usually in a class. */
  indent: number;
  /** True for `async def`. */
  isAsync: boolean;
}

/** The outcome of looking one test up in one file. */
export interface LocateResult {
  /** The candidate to act on: the first (topmost) one. */
  match: FunctionDefinition;
  /** Every `def` of this name in the file, in source order. */
  candidates: FunctionDefinition[];
  /**
   * True when the file defines this name more than once. That is not a bug
   * here: two classes in one file may hold a method of the same name, and the
   * archive record has no class segment to tell them apart. The information
   * needed to disambiguate was never written, so the caller has to choose
   * (jump to the first, or offer a pick list).
   */
  ambiguous: boolean;
}

const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

/**
 * `test_heading[chromium]` -> `test_heading`.
 *
 * Split on the FIRST `[`: a parametrized id can itself contain brackets, e.g.
 * `test_a_status_is_grouped_by_its_class[200-2xx]`, and everything from the
 * first bracket on belongs to the id, not to the function name.
 */
export function stripParametrization(testName: string): string {
  const bracket = testName.indexOf('[');
  const name = bracket === -1 ? testName : testName.slice(0, bracket);
  return name.trim();
}

/**
 * Every `def <functionName>(` and `async def <functionName>(` in `source`,
 * at any indentation, in source order.
 *
 * Matching is exact on the name, so a lookup of `test_heading` never picks up
 * `test_heading_mismatch` two lines below it. Decorators are ignored for free:
 * only a line whose first non-whitespace token is `def`/`async` can match, so a
 * `@pytest.mark.parametrize(...)` above the def is skipped and the def is what
 * comes back.
 *
 * This is a line scan, not a parse. A `def` inside a triple-quoted string does
 * match — the plugin's own test suite is full of those, since pytester tests
 * embed Python source in string literals. Living with that is deliberate:
 * mis-jumping into a string literal costs a keystroke, whereas an AST parse
 * would mean shipping a Python parser to save one.
 */
export function findFunctionDefinitions(
  source: string,
  functionName: string
): FunctionDefinition[] {
  const name = functionName.trim();
  if (!name) {
    return [];
  }

  const escaped = name.replace(REGEX_METACHARACTERS, '\\$&');
  // Groups: 1 = everything before the name, 2 = indentation, 3 = `async `.
  const pattern = new RegExp(
    `^(([ \\t]*)(async[ \\t]+)?def[ \\t]+)${escaped}[ \\t]*\\(`
  );

  const found: FunctionDefinition[] = [];
  const lines = source.split(/\r\n|\r|\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const match = pattern.exec(lineText);
    if (!match) {
      continue;
    }
    found.push({
      line: i,
      lineText,
      column: match[1].length,
      indent: match[2].length,
      isAsync: match[3] !== undefined,
    });
  }

  return found;
}

/**
 * Locate a test inside one Python file by its pytest `item.name`.
 *
 * Returns null when the name is nowhere in the file — the usual cause is a test
 * renamed or deleted since the run that produced the report. That is not an
 * error: the caller should open the file at line 1 rather than refuse to
 * navigate, because the file itself is still the right place to land.
 */
export function locateTest(source: string, testName: string): LocateResult | null {
  const candidates = findFunctionDefinitions(source, stripParametrization(testName));
  if (candidates.length === 0) {
    return null;
  }
  return {
    match: candidates[0],
    candidates,
    ambiguous: candidates.length > 1,
  };
}
