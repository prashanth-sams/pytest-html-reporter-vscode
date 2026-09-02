import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  functionNameOf,
  makeArchiveKey,
  normalizeStatus,
  outcomeOf,
  parseOutputJson,
  safeParseBuildDigest,
  OutputJsonError,
} from '../src/utils/outputJson.js';

const FIXTURES = path.join(__dirname, '..', '..', 'tests', 'fixtures');
const readFixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

/** An ANSI CSI introducer, built by code point so no control byte sits in this file. */
const CSI = new RegExp('\\u001B\\[');

test('parses a real report written by the plugin', () => {
  const data = parseOutputJson(JSON.parse(readFixture('output.json')));
  assert.ok(data.summary.total > 0, 'should find tests');
  assert.equal(
    data.summary.total,
    data.summary.passed +
      data.summary.failed +
      data.summary.skipped +
      data.summary.error +
      data.summary.xpassed +
      data.summary.xfailed,
    'status counts must partition the total'
  );
  assert.equal(data.tests.length, data.summary.total);
});

test('failedTests is FAIL and ERROR only — an expected failure is not a failure', () => {
  const data = parseOutputJson(JSON.parse(readFixture('output.json')));
  for (const t of data.failedTests) {
    assert.ok(t.status === 'FAIL' || t.status === 'ERROR', `unexpected ${t.status}`);
  }
  for (const t of data.tests.filter((x) => x.status === 'xFAIL' || x.status === 'xPASS')) {
    assert.ok(!data.failedTests.includes(t), 'xFAIL/xPASS must not be listed as failures');
  }
});

test('ANSI escape codes are stripped for display but kept in the raw message', () => {
  const data = parseOutputJson(JSON.parse(readFixture('output.json')));
  const coloured = data.tests.filter((t) => CSI.test(t.message));
  assert.ok(coloured.length > 0, 'fixture should contain at least one ANSI-coloured message');
  for (const t of coloured) {
    assert.ok(!CSI.test(t.messagePlain), 'messagePlain must have no escape codes');
    assert.ok(!CSI.test(t.errorSnippet ?? ''), 'snippet must have no escape codes');
  }
});

test('suites are read in numeric key order, not lexicographic', () => {
  const suites: Record<string, unknown> = {};
  for (let i = 0; i < 12; i++) {
    suites[String(i)] = {
      suite_name: `tests/test_${i}.py`,
      tests: { '0': { test_name: `t${i}`, status: 'PASS', message: '', rerun: '0' } },
      status: {},
    };
  }
  const data = parseOutputJson({ content: { suites } });
  assert.deepEqual(
    data.suites.map((s) => s.suiteName),
    Array.from({ length: 12 }, (_, i) => `tests/test_${i}.py`),
    'suite "10" must not sort before suite "2"'
  );
});

test('an absent duration stays undefined — it means "not measured", never zero', () => {
  const data = parseOutputJson({
    content: {
      suites: {
        '0': {
          suite_name: 'tests/test_old.py',
          tests: {
            '0': { test_name: 'test_untimed', status: 'PASS', message: '', rerun: '0' },
            '1': { test_name: 'test_timed', status: 'PASS', message: '', rerun: '0', duration: 0 },
          },
          status: {},
        },
      },
    },
  });
  assert.equal(data.tests[0].durationSeconds, undefined, 'missing duration must not become 0');
  assert.equal(data.tests[1].durationSeconds, 0, 'a measured zero is still a measurement');
});

test('rerun arrives as a string and is coerced to a number', () => {
  const data = parseOutputJson({
    content: {
      suites: {
        '0': {
          suite_name: 'a.py',
          tests: { '0': { test_name: 't', status: 'FAIL', message: '', rerun: '3' } },
          status: {},
        },
      },
    },
  });
  assert.equal(data.tests[0].rerun, 3);
  assert.equal(data.summary.rerun, 3);
});

test('a payload that is not a report is rejected, and safe parsing returns null', () => {
  assert.throws(() => parseOutputJson({ hello: 1 }), OutputJsonError);
  assert.throws(() => parseOutputJson(null), OutputJsonError);
  assert.equal(safeParseBuildDigest('{not json'), null);
  assert.equal(safeParseBuildDigest(readFixture('corrupt.json')), null);
});

test('every real archive fixture parses into a digest', () => {
  const archives = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.startsWith('output_') && f.endsWith('.json'));
  assert.ok(archives.length >= 5, 'expected several real archives to test against');
  for (const name of archives) {
    const digest = safeParseBuildDigest(readFixture(name));
    assert.ok(digest, `${name} should parse`);
    assert.ok(digest.startTime > 0, `${name} should carry an inner start_time`);
  }
});

test('the archive filename stamp is not the build start_time inside it', () => {
  // The plugin names an archived file for the run that displaced it, so
  // ordering history by filename shifts every build by one.
  const name = 'output_1788194765.0343602.json';
  const digest = safeParseBuildDigest(readFixture(name));
  assert.ok(digest);
  const fromName = Number(name.slice('output_'.length, -'.json'.length));
  assert.notEqual(digest.startTime, fromName);
});

test('status normalization and outcome reduction match the plugin', () => {
  assert.equal(normalizeStatus('xfail'), 'xFAIL');
  assert.equal(normalizeStatus('XPASS'), 'xPASS');
  assert.equal(normalizeStatus('nonsense'), 'PASS');
  assert.equal(outcomeOf('FAIL'), 'fail');
  assert.equal(outcomeOf('ERROR'), 'fail');
  assert.equal(outcomeOf('SKIP'), 'skip');
  // Declared in advance, so both sit on the pass side — analytics.outcome.
  assert.equal(outcomeOf('xFAIL'), 'pass');
  assert.equal(outcomeOf('xPASS'), 'pass');
});

test('a parametrized id is cut at the first bracket', () => {
  assert.equal(functionNameOf('test_heading[chromium]'), 'test_heading');
  assert.equal(functionNameOf('test_x[a[b]-c]'), 'test_x');
  assert.equal(functionNameOf('test_plain'), 'test_plain');
  assert.equal(makeArchiveKey('a.py', 'test_x[1]'), 'a.py::test_x[1]');
});
