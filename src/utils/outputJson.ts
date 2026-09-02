/**
 * Reading pytest-html-reporter's `output.json` and `archive/*.json`.
 *
 * This is the extension's only data source. The generated 3MB HTML report is
 * for display; nothing is ever scraped out of it.
 *
 * Tolerance is the point of this module. The plugin has been through several
 * releases that added fields, so an archive directory holds records of mixed
 * vintage — `duration` arrived in 0.3.7, `coverage` in 0.3.6 — and a build
 * interrupted partway leaves a file that is valid JSON but internally
 * inconsistent. Mirroring `analytics._read_json` upstream, a file we cannot
 * make sense of is skipped rather than allowed to take the sidebar down.
 */

import {
  BuildDigest,
  BuildTestDigest,
  CoverageInfo,
  OverallStatus,
  PytestStatus,
  ReportData,
  SuiteCounters,
  SuiteResult,
  TestOutcome,
  TestResult,
  TestSummary,
} from '../types/index.js';
import { stripAnsi } from './ansi.js';
import { errorSnippet } from './formatters.js';

/** Raised when a payload is not a pytest-html-reporter report at all. */
export class OutputJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutputJsonError';
  }
}

export interface ParseOptions {
  maxErrorLength?: number;
  includeErrorSnippets?: boolean;
}

const DEFAULT_MAX_ERROR_LENGTH = 150;

const STATUSES: PytestStatus[] = ['PASS', 'FAIL', 'SKIP', 'ERROR', 'xPASS', 'xFAIL'];

/** `${suite_name}::${test_name}` — the plugin's own cross-build identity. */
export function makeArchiveKey(suiteName: string, testName: string): string {
  return `${suiteName}::${testName}`;
}

/**
 * `test_heading[chromium]` -> `test_heading`.
 *
 * Cut at the FIRST `[`: a parametrized id may itself contain brackets, so
 * everything from the first one on belongs to the id.
 */
export function functionNameOf(testName: string): string {
  const bracket = String(testName ?? '').indexOf('[');
  return (bracket === -1 ? String(testName ?? '') : String(testName).slice(0, bracket)).trim();
}

/**
 * Coerce whatever is in a `status` field to one of the six the plugin writes.
 *
 * Compared case-insensitively because the plugin's own reducer upper-cases
 * before comparing, so a record written by a different code path still lands
 * on the right bucket. An unrecognised status reads as PASS rather than as a
 * failure: inventing a failure that the run never reported is the worse error.
 */
export function normalizeStatus(raw: unknown): PytestStatus {
  const value = String(raw ?? '').trim().toUpperCase();
  for (const candidate of STATUSES) {
    if (candidate.toUpperCase() === value) {
      return candidate;
    }
  }
  return 'PASS';
}

/**
 * The three-way reduction the plugin's history reads, ported verbatim from
 * `analytics.outcome`.
 *
 * xFAIL and xPASS sit on the pass side. Both were declared in advance and
 * neither turns a build red; counting an expected failure against a test's
 * pass rate would make every xfail-marked test look like the least reliable
 * thing in the suite.
 */
export function outcomeOf(status: unknown): TestOutcome {
  const value = String(status ?? '').trim().toUpperCase();
  if (value === 'FAIL' || value === 'ERROR') {
    return 'fail';
  }
  if (value === 'SKIP') {
    return 'skip';
  }
  return 'pass';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(n) ? n : fallback;
}

/**
 * `duration` when it was measured, `undefined` when it was not.
 *
 * The distinction is load-bearing: archives written before 0.3.7 carry no
 * duration at all, and defaulting those to 0 would report a suite of
 * instantaneous tests and drag every average down.
 */
function optionalDuration(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const n = toNumber(value, Number.NaN);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Suite keys ascending numerically.
 *
 * `content.suites` is a JSON object whose keys are stringified integers, so the
 * insertion/lexicographic order puts `"10"` before `"2"`. Sorting numerically
 * restores the collection order the run actually had.
 */
function orderedSuiteKeys(suites: Record<string, unknown>): string[] {
  return Object.keys(suites).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      return na - nb;
    }
    return a.localeCompare(b);
  });
}

function emptyCounters(): SuiteCounters {
  return {
    total_pass: 0,
    total_fail: 0,
    total_skip: 0,
    total_error: 0,
    total_xpass: 0,
    total_xfail: 0,
    total_rerun: 0,
  };
}

function emptySummary(): TestSummary {
  return {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    error: 0,
    xpassed: 0,
    xfailed: 0,
    rerun: 0,
  };
}

function countInto(summary: TestSummary, status: PytestStatus, rerun: number): void {
  summary.total += 1;
  summary.rerun += rerun;
  switch (status) {
    case 'PASS': summary.passed += 1; break;
    case 'FAIL': summary.failed += 1; break;
    case 'SKIP': summary.skipped += 1; break;
    case 'ERROR': summary.error += 1; break;
    case 'xPASS': summary.xpassed += 1; break;
    case 'xFAIL': summary.xfailed += 1; break;
  }
}

function readCounters(raw: unknown): SuiteCounters {
  const counters = emptyCounters();
  if (!isObject(raw)) {
    return counters;
  }
  for (const key of Object.keys(counters) as (keyof SuiteCounters)[]) {
    counters[key] = toNumber(raw[key], 0);
  }
  return counters;
}

function readCoverage(raw: unknown): CoverageInfo | undefined {
  if (!isObject(raw)) {
    return undefined;
  }
  const percent = toNumber(raw.percent, Number.NaN);
  if (!Number.isFinite(percent)) {
    return undefined;
  }
  return {
    percent,
    statements: toNumber(raw.statements, 0),
    covered: toNumber(raw.covered, 0),
    missing: toNumber(raw.missing, 0),
    branch: Boolean(raw.branch),
  };
}

/** Tests of one suite, in the numeric order of their keys. */
function readSuiteTests(
  suiteName: string,
  rawTests: unknown,
  options: Required<ParseOptions>
): TestResult[] {
  if (!isObject(rawTests)) {
    return [];
  }
  const results: TestResult[] = [];
  for (const key of orderedSuiteKeys(rawTests)) {
    const record = rawTests[key];
    if (!isObject(record)) {
      continue;
    }
    const testName = String(record.test_name ?? '').trim();
    if (!testName) {
      continue;
    }
    const message = typeof record.message === 'string' ? record.message : '';
    const messagePlain = stripAnsi(message);
    const snippet =
      options.includeErrorSnippets && messagePlain
        ? errorSnippet(messagePlain, options.maxErrorLength)
        : '';

    const result: TestResult = {
      suiteName,
      testName,
      functionName: functionNameOf(testName),
      status: normalizeStatus(record.status),
      rerun: toNumber(record.rerun, 0),
      message,
      messagePlain,
      archiveKey: makeArchiveKey(suiteName, testName),
    };
    const duration = optionalDuration(record.duration);
    if (duration !== undefined) {
      result.durationSeconds = duration;
    }
    if (snippet) {
      result.errorSnippet = snippet;
    }
    results.push(result);
  }
  return results;
}

function suitesOf(raw: unknown): Record<string, unknown> {
  if (!isObject(raw)) {
    throw new OutputJsonError('Report is not a JSON object');
  }
  const content = raw.content;
  if (!isObject(content) || !isObject(content.suites)) {
    throw new OutputJsonError(
      'Not a pytest-html-reporter report: no content.suites object'
    );
  }
  return content.suites;
}

/**
 * Parse a full `output.json` into everything the sidebar renders.
 *
 * Summary counters are recounted from the test records rather than read from
 * the file's own `status_list`. Those totals are serialized as strings and are
 * written from separate accumulators, so an interrupted or xdist run can leave
 * them disagreeing with the records underneath. The records are the ground
 * truth the user is about to be shown, so the headline is counted from them.
 */
export function parseOutputJson(raw: unknown, options: ParseOptions = {}): ReportData {
  const resolved: Required<ParseOptions> = {
    maxErrorLength: options.maxErrorLength ?? DEFAULT_MAX_ERROR_LENGTH,
    includeErrorSnippets: options.includeErrorSnippets ?? true,
  };

  const rawSuites = suitesOf(raw);
  const source = raw as Record<string, unknown>;

  const suites: SuiteResult[] = [];
  const tests: TestResult[] = [];
  const summary = emptySummary();
  let measured = 0;
  let anyMeasured = false;

  for (const key of orderedSuiteKeys(rawSuites)) {
    const rawSuite = rawSuites[key];
    if (!isObject(rawSuite)) {
      continue;
    }
    const suiteName = String(rawSuite.suite_name ?? '').trim();
    if (!suiteName) {
      continue;
    }
    const suiteTests = readSuiteTests(suiteName, rawSuite.tests, resolved);
    for (const test of suiteTests) {
      countInto(summary, test.status, test.rerun);
      if (test.durationSeconds !== undefined) {
        measured += test.durationSeconds;
        anyMeasured = true;
      }
    }
    suites.push({
      suiteName,
      tests: suiteTests,
      counters: readCounters(rawSuite.status),
    });
    tests.push(...suiteTests);
  }

  if (anyMeasured) {
    summary.durationSeconds = measured;
  }

  const failedTests = tests.filter((t) => t.status === 'FAIL' || t.status === 'ERROR');

  const declared = String(source.status ?? '').trim().toUpperCase();
  const overallStatus: OverallStatus =
    declared === 'PASS' || declared === 'FAIL'
      ? (declared as OverallStatus)
      : failedTests.length > 0
        ? 'FAIL'
        : 'PASS';

  const data: ReportData = {
    summary,
    suites,
    tests,
    failedTests,
    date: String(source.date ?? ''),
    startTime: toNumber(source.start_time, 0),
    overallStatus,
  };

  const coverage = readCoverage(source.coverage);
  if (coverage) {
    data.coverage = coverage;
  }
  return data;
}

/**
 * The cheap path for an archived build: counters and per-test outcomes only.
 *
 * History keeps a window of these in memory at once, so messages and snippets —
 * by far the biggest part of a record — are dropped rather than parsed.
 */
export function parseBuildDigest(raw: unknown): BuildDigest {
  const rawSuites = suitesOf(raw);
  const source = raw as Record<string, unknown>;

  const summary = emptySummary();
  const tests: BuildTestDigest[] = [];
  let measured = 0;
  let anyMeasured = false;

  for (const key of orderedSuiteKeys(rawSuites)) {
    const rawSuite = rawSuites[key];
    if (!isObject(rawSuite)) {
      continue;
    }
    const suiteName = String(rawSuite.suite_name ?? '').trim();
    if (!suiteName || !isObject(rawSuite.tests)) {
      continue;
    }
    for (const testKey of orderedSuiteKeys(rawSuite.tests)) {
      const record = rawSuite.tests[testKey];
      if (!isObject(record)) {
        continue;
      }
      const testName = String(record.test_name ?? '').trim();
      if (!testName) {
        continue;
      }
      const status = normalizeStatus(record.status);
      const rerun = toNumber(record.rerun, 0);
      const digest: BuildTestDigest = {
        archiveKey: makeArchiveKey(suiteName, testName),
        status,
        rerun,
      };
      const duration = optionalDuration(record.duration);
      if (duration !== undefined) {
        digest.durationSeconds = duration;
        measured += duration;
        anyMeasured = true;
      }
      countInto(summary, status, rerun);
      tests.push(digest);
    }
  }

  if (anyMeasured) {
    summary.durationSeconds = measured;
  }

  return {
    startTime: toNumber(source.start_time, 0),
    date: String(source.date ?? ''),
    summary,
    tests,
  };
}

/** Parse text, returning `null` for anything unreadable. Never throws. */
export function safeParseBuildDigest(text: string): BuildDigest | null {
  try {
    return parseBuildDigest(JSON.parse(text));
  } catch {
    return null;
  }
}
