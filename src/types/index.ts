/**
 * Shared types for pytest-html-reporter for VS Code.
 *
 * Shapes here follow what the plugin actually writes into `output.json` and
 * `archive/*.json`. Nothing in this file may import `vscode`.
 */

/** The exact status strings the plugin writes per test. */
export type PytestStatus = 'PASS' | 'FAIL' | 'SKIP' | 'ERROR' | 'xPASS' | 'xFAIL';

/**
 * The three-way reduction the plugin's own history uses (analytics.outcome):
 * FAIL/ERROR are failures, SKIP is a skip, and everything else — PASS, xPASS
 * and xFAIL — counts as a pass, because an expected failure was declared in
 * advance and must not drag a test's pass rate down.
 */
export type TestOutcome = 'pass' | 'fail' | 'skip';

/** The build-level verdict the plugin stores in the top-level `status` field. */
export type OverallStatus = 'PASS' | 'FAIL';

export interface TestResult {
  /** Suite path exactly as written by the plugin, e.g. `tests/functional/test_x.py`. */
  suiteName: string;
  /** `item.name`, parametrization suffix included: `test_heading[chromium]`. */
  testName: string;
  /** `testName` with the `[...]` suffix stripped — what to look for in source. */
  functionName: string;
  status: PytestStatus;
  /**
   * Absent means the build never measured durations (pre-0.3.7 archives).
   * It never means zero — do not default it.
   */
  durationSeconds?: number;
  /** Parsed from the string the plugin serializes `rerun` as. */
  rerun: number;
  /** Raw `message`, ANSI escape codes intact. Use for "copy error". */
  message: string;
  /** `message` with ANSI stripped. Use for anything shown to a human. */
  messagePlain: string;
  /** Truncated `messagePlain` for the failure card; absent when there is no message. */
  errorSnippet?: string;
  /** `${suiteName}::${testName}` — the only cross-build identity the archives carry. */
  archiveKey: string;
}

/** Per-suite counters, named as the plugin names them under `suites[i].status`. */
export interface SuiteCounters {
  total_pass: number;
  total_fail: number;
  total_skip: number;
  total_error: number;
  total_xpass: number;
  total_xfail: number;
  total_rerun: number;
}

export interface SuiteResult {
  suiteName: string;
  tests: TestResult[];
  counters: SuiteCounters;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  error: number;
  xpassed: number;
  xfailed: number;
  rerun: number;
  /** Sum of measured durations; absent when no test in the build was timed. */
  durationSeconds?: number;
}

/** Optional `--coverage` block; present in only some builds. */
export interface CoverageInfo {
  percent: number;
  statements: number;
  covered: number;
  missing: number;
  branch: boolean;
}

export interface ReportData {
  summary: TestSummary;
  suites: SuiteResult[];
  /** Every test, flattened in suite order. Webview jump/copy messages index into this. */
  tests: TestResult[];
  /** Subset of `tests` whose status is FAIL or ERROR, same relative order. */
  failedTests: TestResult[];
  /** Human date string as written, e.g. `September 02, 2026`. */
  date: string;
  /** Unix epoch seconds, fractional. Also the archive filename stamp. */
  startTime: number;
  overallStatus: OverallStatus;
  coverage?: CoverageInfo;
}

/** One test's outcome inside a past build. */
export interface BuildTestDigest {
  archiveKey: string;
  status: PytestStatus;
  durationSeconds?: number;
  rerun: number;
}

/** A past build reduced to what the history needs; cheap to keep ~50 of these. */
export interface BuildDigest {
  startTime: number;
  date: string;
  summary: TestSummary;
  /** Build a `Map<string, BuildTestDigest>` from this keyed by `archiveKey`. */
  tests: BuildTestDigest[];
}

export interface FlakeVerdict {
  archiveKey: string;
  /** Builds in the window that actually contained this test. */
  totalBuilds: number;
  passes: number;
  failures: number;
  /** Outcome changes between consecutive builds, oldest to newest. */
  flips: number;
  isFlaky: boolean;
  isBroken: boolean;
  /** passes / totalBuilds, 0..1. Zero when totalBuilds is 0. */
  passRate: number;
  /** Consecutive newest builds sharing an outcome: positive passing, negative failing. */
  currentStreak: number;
}

export type SidebarState =
  | 'loading'
  | 'no-config'
  | 'empty'
  | 'all-passed'
  | 'results'
  | 'error';

/** Where a single report's artifacts live on disk. */
export interface ResolvedReport {
  outputJsonPath: string;
  /** Directory holding output.json — the plugin's report base. */
  baseDir: string;
  /** `<baseDir>/<html filename>`; absent when no HTML report is on disk. */
  htmlReportPath?: string;
  /** `<baseDir>/archive` — may not exist yet. */
  archiveDir: string;
}

/** Messages the sidebar webview posts back to the extension host. */
export type WebviewMessage =
  | { command: 'refresh' }
  | { command: 'configure' }
  | { command: 'openHtmlReport' }
  | { command: 'switchReport'; path: string }
  | { command: 'jump'; index: number }
  | { command: 'copyError'; index: number };
