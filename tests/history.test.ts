import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { computeFlakeVerdicts, trendOf } from '../src/services/historyService.js';
import { BuildDigest, PytestStatus } from '../src/types/index.js';

/**
 * A build in which one test, `a.py::t`, ended with the given status.
 *
 * These mirror the scenarios named in the plugin's own
 * tests/unit/test_analytics.py, one for one, so the ported reducer can be
 * checked against the rules the plugin documents rather than against itself.
 */
function build(startTime: number, status: PytestStatus, rerun = 0): BuildDigest {
  return {
    startTime,
    date: 'x',
    summary: {
      total: 1,
      passed: 0,
      failed: 0,
      skipped: 0,
      error: 0,
      xpassed: 0,
      xfailed: 0,
      rerun,
    },
    tests: [{ archiveKey: 'a.py::t', status, rerun }],
  };
}

const verdictFor = (builds: BuildDigest[]) => computeFlakeVerdicts(builds).get('a.py::t');

describe('flake reducer — ported from the plugin analytics rules', () => {
  it('a test that always passed is stable', () => {
    const v = verdictFor([build(1, 'PASS'), build(2, 'PASS'), build(3, 'PASS')]);
    assert.ok(v);
    assert.equal(v.isFlaky, false);
    assert.equal(v.isBroken, false);
    assert.equal(v.flips, 0);
    assert.equal(v.passRate, 1);
    assert.equal(v.currentStreak, 3);
  });

  it('a test that alternates is flaky', () => {
    const v = verdictFor([build(1, 'PASS'), build(2, 'FAIL'), build(3, 'PASS')]);
    assert.ok(v);
    assert.equal(v.isFlaky, true);
    assert.equal(v.isBroken, false);
    assert.equal(v.flips, 2);
  });

  it('a test that never passed is broken, not flaky', () => {
    const v = verdictFor([build(1, 'FAIL'), build(2, 'FAIL'), build(3, 'ERROR')]);
    assert.ok(v);
    assert.equal(v.isBroken, true);
    assert.equal(v.isFlaky, false);
    assert.equal(v.passRate, 0);
    assert.equal(v.currentStreak, -3);
  });

  it('a retry inside one build is enough to be flaky on its own', () => {
    // Every build ended green, so the pass/fail record alone shows nothing.
    const v = verdictFor([build(1, 'PASS'), build(2, 'PASS', 2)]);
    assert.ok(v);
    assert.equal(v.isFlaky, true, 'a rerun is intermittency the totals hide');
    assert.equal(v.failures, 0);
  });

  it('only a failure counts as a failure — an expected outcome does not', () => {
    const v = verdictFor([build(1, 'xFAIL'), build(2, 'xPASS'), build(3, 'PASS')]);
    assert.ok(v);
    assert.equal(v.failures, 0, 'xFAIL and xPASS sit on the pass side');
    assert.equal(v.isFlaky, false);
    assert.equal(v.passRate, 1);
  });

  it('an error counts as a failure', () => {
    const v = verdictFor([build(1, 'PASS'), build(2, 'ERROR')]);
    assert.ok(v);
    assert.equal(v.failures, 1);
    assert.equal(v.isFlaky, true);
  });

  it('skips do not count as flipping', () => {
    const v = verdictFor([build(1, 'PASS'), build(2, 'SKIP'), build(3, 'PASS')]);
    assert.ok(v);
    assert.equal(v.flips, 0, 'a skip between two passes is not a flip');
    assert.equal(v.isFlaky, false);
    assert.equal(v.totalBuilds, 3, 'the skipped build still counted as a build');
  });

  it('a test only ever skipped has no pass rate', () => {
    const v = verdictFor([build(1, 'SKIP'), build(2, 'SKIP')]);
    assert.ok(v);
    assert.equal(v.passRate, 0);
    assert.equal(v.passes, 0);
    assert.equal(v.failures, 0);
    assert.equal(v.currentStreak, 0);
    assert.equal(v.isFlaky, false);
    assert.equal(v.isBroken, false);
  });

  it('the streak is counted from the newest build', () => {
    // Oldest first: fail, fail, pass, pass -> currently on a 2-build pass run.
    const v = verdictFor([build(1, 'FAIL'), build(2, 'FAIL'), build(3, 'PASS'), build(4, 'PASS')]);
    assert.ok(v);
    assert.equal(v.currentStreak, 2);
    assert.equal(v.flips, 1);
  });

  it('a negative streak means it is currently failing', () => {
    const v = verdictFor([build(1, 'PASS'), build(2, 'FAIL'), build(3, 'FAIL')]);
    assert.ok(v);
    assert.equal(v.currentStreak, -2);
  });

  it('pass rate excludes skipped builds from its denominator', () => {
    const v = verdictFor([build(1, 'PASS'), build(2, 'SKIP'), build(3, 'FAIL')]);
    assert.ok(v);
    assert.equal(v.passes, 1);
    assert.equal(v.failures, 1);
    assert.equal(v.passRate, 0.5, 'the skip must not drag the rate to 1/3');
  });
});

describe('trend', () => {
  it('is oldest first and omits builds that never ran the test', () => {
    const builds = [build(1, 'PASS'), build(2, 'FAIL'), build(3, 'PASS')];
    builds.push({ startTime: 4, date: 'x', summary: builds[0].summary, tests: [] });
    assert.deepEqual(trendOf(builds, 'a.py::t'), ['pass', 'fail', 'pass']);
  });

  it('is empty for a test no build has seen', () => {
    assert.deepEqual(trendOf([build(1, 'PASS')], 'other.py::nope'), []);
  });
});
