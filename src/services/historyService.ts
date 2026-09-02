/**
 * Build history: what the archive directory can tell you that one run cannot.
 *
 * pytest-html-reporter rotates each finished run into `<base>/archive/` before
 * writing the next one, so a working repo accumulates a corpus of past builds.
 * Nothing in the reference extension this one is modelled on has an equivalent
 * — pytest-html-plus keeps no history — and it is the reason a test row here
 * can say "flaky, 7/10" instead of only "failed".
 *
 * No `vscode` import: the reducer is the part worth testing, and it is pure.
 * File reading is injected so tests feed synthetic build sequences directly.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BuildDigest, FlakeVerdict, ResolvedReport, TestOutcome } from '../types/index.js';
import { outcomeOf, safeParseBuildDigest } from '../utils/outputJson.js';

export interface HistoryOptions {
  /** Most recent builds to keep, the current run included. */
  maxBuilds: number;
}

export interface HistoryLoadResult {
  /** Oldest first, so a trend reads left to right. */
  builds: BuildDigest[];
  /** Builds on disk that the window excluded — reported, never silently dropped. */
  omitted: number;
  /** Files that were unreadable or not reports. */
  skipped: number;
}

/**
 * Read the archive plus the current run into an ordered window of builds.
 *
 * Ordering is by each file's INNER `start_time`, never by its filename. The
 * plugin names an archived file for the run that *displaced* it, not the run
 * inside it — verified on real data, where `output_1788194765.json` contains
 * `start_time: 1788194287`. Sorting on the name therefore shifts the whole
 * history by one build and scrambles any trend read off it.
 */
export async function loadHistory(
  report: ResolvedReport,
  options: HistoryOptions
): Promise<HistoryLoadResult> {
  const maxBuilds = Math.max(1, Math.floor(options.maxBuilds));
  const paths: string[] = [];

  try {
    const entries = await fs.readdir(report.archiveDir);
    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        paths.push(path.join(report.archiveDir, entry));
      }
    }
  } catch {
    // No archive directory yet: a first run has history of exactly itself.
  }
  paths.push(report.outputJsonPath);

  const builds: BuildDigest[] = [];
  let skipped = 0;

  for (const file of paths) {
    let text: string;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      skipped += 1;
      continue;
    }
    const digest = safeParseBuildDigest(text);
    if (digest) {
      builds.push(digest);
    } else {
      skipped += 1;
    }
  }

  builds.sort((a, b) => a.startTime - b.startTime);

  // Two runs can share a start_time when a file was copied; keep the later read.
  const deduped: BuildDigest[] = [];
  for (const build of builds) {
    const last = deduped[deduped.length - 1];
    if (last && last.startTime === build.startTime) {
      deduped[deduped.length - 1] = build;
      continue;
    }
    deduped.push(build);
  }

  const omitted = Math.max(0, deduped.length - maxBuilds);
  return { builds: deduped.slice(-maxBuilds), omitted, skipped };
}

/** Oldest-first outcomes for one test. Builds that never ran it are omitted. */
export function trendOf(builds: BuildDigest[], archiveKey: string): TestOutcome[] {
  const trend: TestOutcome[] = [];
  for (const build of builds) {
    const hit = build.tests.find((t) => t.archiveKey === archiveKey);
    if (hit) {
      trend.push(outcomeOf(hit.status));
    }
  }
  return trend;
}

/**
 * Reduce a window of builds to one verdict per test.
 *
 * The rules are ported from the plugin's own `analytics.py`, whose unit tests
 * name each one:
 *
 *  - only FAIL and ERROR are failures; xFAIL and xPASS are pass-side, having
 *    been declared in advance
 *  - a test that alternates is flaky; one that never passed is broken, not
 *    flaky, because there is nothing intermittent about it
 *  - a retry inside a single build is enough to be flaky on its own, even if
 *    every build ended green
 *  - skips do not count as flipping and do not enter the pass rate; a test that
 *    was only ever skipped has no pass rate at all
 *  - the streak is counted from the newest build backwards
 */
export function computeFlakeVerdicts(builds: BuildDigest[]): Map<string, FlakeVerdict> {
  const outcomes = new Map<string, TestOutcome[]>();
  const reruns = new Map<string, number>();

  for (const build of builds) {
    for (const test of build.tests) {
      const list = outcomes.get(test.archiveKey);
      const outcome = outcomeOf(test.status);
      if (list) {
        list.push(outcome);
      } else {
        outcomes.set(test.archiveKey, [outcome]);
      }
      if (test.rerun > 0) {
        reruns.set(test.archiveKey, (reruns.get(test.archiveKey) ?? 0) + test.rerun);
      }
    }
  }

  const verdicts = new Map<string, FlakeVerdict>();

  for (const [archiveKey, series] of outcomes) {
    const decided = series.filter((o) => o !== 'skip');
    const passes = decided.filter((o) => o === 'pass').length;
    const failures = decided.filter((o) => o === 'fail').length;

    let flips = 0;
    for (let i = 1; i < decided.length; i++) {
      if (decided[i] !== decided[i - 1]) {
        flips += 1;
      }
    }

    let currentStreak = 0;
    if (decided.length > 0) {
      const newest = decided[decided.length - 1];
      let run = 0;
      for (let i = decided.length - 1; i >= 0 && decided[i] === newest; i--) {
        run += 1;
      }
      currentStreak = newest === 'pass' ? run : -run;
    }

    const retried = (reruns.get(archiveKey) ?? 0) > 0;
    const denominator = passes + failures;

    verdicts.set(archiveKey, {
      archiveKey,
      totalBuilds: series.length,
      passes,
      failures,
      flips,
      // A retry inside one build is intermittency the build totals hide.
      isFlaky: (passes > 0 && failures > 0) || (retried && passes > 0),
      isBroken: failures > 0 && passes === 0,
      passRate: denominator === 0 ? 0 : passes / denominator,
      currentStreak,
    });
  }

  return verdicts;
}
