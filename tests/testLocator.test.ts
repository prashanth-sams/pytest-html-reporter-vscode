/**
 * Tests for the source-line recovery that stands in for the file/line fields
 * pytest-html-reporter never writes.
 *
 * The synthetic cases pin the exact semantics; the cases below them run against
 * the real pytest-html-reporter checkout, because the shapes that actually
 * break a line scan — a decorated test, a method indented inside a class, an
 * `async def`, sixteen defs of one name inside pytester string literals — are
 * already sitting in that repo and are more honest than anything invented here.
 *
 * Run with:  node --test out/tests/testLocator.test.js   (after `tsc`)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findFunctionDefinitions,
  locateTest,
  stripParametrization,
} from '../src/utils/testLocator.js';

/** The plugin checkout the extension was built against; override to relocate. */
const PLUGIN_REPO =
  process.env.PYTEST_HTML_REPORTER_REPO ?? '/Users/prashanthsams/Documents/pytest-html-reporter';

const HAVE_REAL_SOURCES = existsSync(join(PLUGIN_REPO, 'tests', 'unit', 'test_analytics.py'));

function realSource(relativePath: string): string {
  return readFileSync(join(PLUGIN_REPO, relativePath), 'utf8');
}

/**
 * Where a `def` really is, found by a deliberately different method.
 *
 * The plugin checkout is a live repo: its tests get edited, and every one of
 * these line numbers shifts when they do. Hard-coding them meant a test here
 * went red because a file over there gained twelve lines, which says nothing
 * about the locator.
 *
 * So the expectation is derived instead — by a plain trimmed-prefix scan rather
 * than by the regex the locator uses, so the two are genuinely independent and
 * agreeing still means something. The structural claims each test makes
 * (indentation, async, ordering, ambiguity) are the real assertions; this only
 * anchors them to the right line.
 */
function defLineByScan(source: string, name: string, occurrence = 0): number {
  const wanted = [`def ${name}(`, `async def ${name}(`];
  let seen = 0;
  const lines = source.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (wanted.some((w) => trimmed.startsWith(w))) {
      if (seen === occurrence) {
        return i;
      }
      seen++;
    }
  }
  throw new Error(`no def ${name} in the fixture — the plugin checkout may have moved on`);
}

/** Skip rather than fail when the plugin checkout is not beside the extension. */
const realFileTest = HAVE_REAL_SOURCES ? it : it.skip;

describe('stripParametrization', () => {
  it('leaves a plain test name alone', () => {
    assert.equal(stripParametrization('test_pass'), 'test_pass');
  });

  it('drops a parametrization suffix', () => {
    assert.equal(stripParametrization('test_heading[chromium]'), 'test_heading');
  });

  it('splits on the first bracket, since an id may contain more', () => {
    // Real name from the archives: the id itself is `200-2xx`.
    assert.equal(
      stripParametrization('test_a_status_is_grouped_by_its_class[200-2xx]'),
      'test_a_status_is_grouped_by_its_class'
    );
    assert.equal(stripParametrization('test_x[a[b]-c]'), 'test_x');
  });

  it('survives an empty id', () => {
    assert.equal(stripParametrization('test_a_status_is_grouped_by_its_class[-]'),
      'test_a_status_is_grouped_by_its_class');
  });
});

describe('findFunctionDefinitions', () => {
  it('finds a plain module-level def and reports a 0-based line', () => {
    const source = ['import pytest', '', 'def test_pass():', '    assert True', ''].join('\n');
    const [found] = findFunctionDefinitions(source, 'test_pass');
    assert.equal(found.line, 2);
    assert.equal(found.lineText, 'def test_pass():');
    assert.equal(found.column, 4);
    assert.equal(found.indent, 0);
    assert.equal(found.isAsync, false);
  });

  it('finds an async def', () => {
    const source = ['async def test_pass():', '    pass'].join('\n');
    const [found] = findFunctionDefinitions(source, 'test_pass');
    assert.equal(found.line, 0);
    assert.equal(found.isAsync, true);
    assert.equal(found.column, 'async def '.length);
  });

  it('finds a method indented inside a class', () => {
    const source = ['class TestThing:', '    def test_pass(self):', '        pass'].join('\n');
    const [found] = findFunctionDefinitions(source, 'test_pass');
    assert.equal(found.line, 1);
    assert.equal(found.indent, 4);
    assert.equal(found.column, 8);
  });

  it('lands on the def of a decorated test, not on its decorator', () => {
    const source = [
      '@pytest.mark.parametrize("a", [1, 2])',
      '@pytest.mark.slow',
      'def test_pass(a):',
      '    pass',
    ].join('\n');
    const [found] = findFunctionDefinitions(source, 'test_pass');
    assert.equal(found.line, 2);
    assert.equal(found.lineText, 'def test_pass(a):');
  });

  it('matches the whole name, never a prefix of a longer one', () => {
    const source = ['def test_heading_mismatch():', '    pass', 'def test_heading():', '    pass'].join('\n');
    const found = findFunctionDefinitions(source, 'test_heading');
    assert.equal(found.length, 1);
    assert.equal(found[0].line, 2);
  });

  it('returns every candidate when one name is defined twice', () => {
    const source = [
      'class TestA:',
      '    def test_dupe(self):',
      '        pass',
      '',
      'class TestB:',
      '    def test_dupe(self):',
      '        pass',
    ].join('\n');
    const found = findFunctionDefinitions(source, 'test_dupe');
    assert.deepEqual(found.map((f) => f.line), [1, 5]);
  });

  it('returns nothing for a name that is not there', () => {
    assert.deepEqual(findFunctionDefinitions('def test_pass():\n    pass\n', 'test_gone'), []);
  });

  it('ignores a commented-out def', () => {
    const source = ['# def test_pass():', 'def test_other():', '    pass'].join('\n');
    assert.deepEqual(findFunctionDefinitions(source, 'test_pass'), []);
  });

  it('tolerates whitespace between the name and the parameter list', () => {
    const [found] = findFunctionDefinitions('def test_pass ():\n    pass', 'test_pass');
    assert.equal(found.column, 4);
  });

  it('reads CRLF sources without an off-by-one', () => {
    const source = 'import pytest\r\n\r\ndef test_pass():\r\n    pass\r\n';
    const [found] = findFunctionDefinitions(source, 'test_pass');
    assert.equal(found.line, 2);
    assert.equal(found.lineText, 'def test_pass():');
  });

  it('does not treat a regex metacharacter in the name as a pattern', () => {
    // A `.` must match a literal dot, not "any character".
    assert.deepEqual(findFunctionDefinitions('def test_ax():\n    pass', 'test_a.'), []);
  });

  it('returns nothing for an empty name', () => {
    assert.deepEqual(findFunctionDefinitions('def test_pass():\n    pass', ''), []);
  });
});

describe('locateTest', () => {
  it('strips the parametrization before searching', () => {
    const source = ['@pytest.mark.parametrize("a", [1, 2])', 'def test_pass(a):', '    pass'].join('\n');
    const result = locateTest(source, 'test_pass[1]');
    assert.ok(result);
    assert.equal(result.match.line, 1);
    assert.equal(result.ambiguous, false);
  });

  it('flags an ambiguous name and keeps both candidates', () => {
    const source = [
      'class TestA:',
      '    def test_dupe(self):',
      '        pass',
      'class TestB:',
      '    def test_dupe(self):',
      '        pass',
    ].join('\n');
    const result = locateTest(source, 'test_dupe');
    assert.ok(result);
    assert.equal(result.ambiguous, true);
    assert.equal(result.candidates.length, 2);
    // The first is the one to act on by default.
    assert.equal(result.match.line, 1);
  });

  it('returns null when the test is gone, so the caller can still open the file', () => {
    assert.equal(locateTest('def test_pass():\n    pass', 'test_renamed'), null);
  });
});

describe('real pytest-html-reporter sources', () => {
  realFileTest('finds a module-level def at the top of the file', () => {
    const result = locateTest(realSource('tests/functional/test_simple.py'), 'test_pass');
    assert.ok(result);
    assert.equal(result.match.line, defLineByScan(realSource('tests/functional/test_simple.py'), 'test_pass'));
    assert.equal(result.ambiguous, false);
  });

  realFileTest('finds a parametrized method inside a class, from its archive test_name', () => {
    // Real archive record: tests/functional/test_playwright.py :: test_heading[chromium].
    // The nodeid's `TestClass::` segment is not in the record at all — this is
    // exactly the lossy case the locator exists for.
    const result = locateTest(realSource('tests/functional/test_playwright.py'), 'test_heading[chromium]');
    assert.ok(result);
    assert.equal(result.match.line, defLineByScan(realSource('tests/functional/test_playwright.py'), 'test_heading'));
    assert.equal(result.match.indent, 4);
    assert.equal(result.ambiguous, false);
    assert.match(result.match.lineText, /def test_heading\(self, page\):/);
  });

  realFileTest('does not confuse test_heading with test_heading_mismatch', () => {
    const source = realSource('tests/functional/test_playwright.py');
    assert.equal(findFunctionDefinitions(source, 'test_heading').length, 1);
    assert.equal(
      findFunctionDefinitions(source, 'test_heading_mismatch')[0].line,
      defLineByScan(source, 'test_heading_mismatch')
    );
  });

  realFileTest('finds a decorated parametrized test', () => {
    // tests/functional/test_parameterize.py: @pytest.mark.parametrize on line 4,
    // def on line 5. Archive name is test_fixture_pass[1-2].
    const result = locateTest(realSource('tests/functional/test_parameterize.py'), 'test_fixture_pass[1-2]');
    assert.ok(result);
    assert.equal(
      result.match.line,
      defLineByScan(realSource('tests/functional/test_parameterize.py'), 'test_fixture_pass')
    );
    assert.equal(result.match.indent, 0);
  });

  realFileTest('finds a test decorated with pytest.mark.xfail', () => {
    const result = locateTest(realSource('tests/functional/test_skip_xfail_xpass.py'), 'test_xpass');
    assert.ok(result);
    // The decorator sits above; the locator must land on the def, not on it.
    assert.equal(
      result.match.line,
      defLineByScan(realSource('tests/functional/test_skip_xfail_xpass.py'), 'test_xpass')
    );
  });

  realFileTest('finds an async def nested in a class, among same-named siblings', () => {
    // tests/unit/test_auto_screenshots.py defines `screenshot` four times — at
    // lines 39, 53, 67 and 334 — because the file builds several fake drivers.
    // Candidates come back in source order, so [0] is the line-39 one, and the
    // async definition is found by looking rather than by assuming.
    const found = findFunctionDefinitions(
      realSource('tests/unit/test_auto_screenshots.py'),
      'screenshot'
    );
    assert.ok(found.length >= 3, 'the fixture file defines screenshot several times');
    const source = realSource('tests/unit/test_auto_screenshots.py');
    assert.equal(
      found[0].line,
      defLineByScan(source, 'screenshot', 0),
      'first candidate is the topmost def'
    );

    const asyncDef = found.find((d) => d.isAsync);
    assert.ok(asyncDef, 'one of them is an async def');
    assert.equal(asyncDef.line, defLineByScan(source, 'screenshot', 2));
    assert.equal(asyncDef.indent, 4);
  });

  realFileTest('reports ambiguity when one name has several definitions', () => {
    // This is the case the plugin's record cannot resolve: `test_name` is
    // pytest's item.name, so the class segment that would disambiguate was
    // never written. The locator surfaces the choice instead of guessing.
    const result = locateTest(realSource('tests/unit/test_auto_screenshots.py'), 'screenshot');
    assert.ok(result);
    assert.equal(result.ambiguous, true);
    assert.ok(result.candidates.length > 1);
  });

  realFileTest('finds a long module-level test name', () => {
    const result = locateTest(
      realSource('tests/unit/test_analytics.py'),
      'test_only_a_failure_counts_as_a_failure'
    );
    assert.ok(result);
    assert.equal(
      result.match.line,
      defLineByScan(
        realSource('tests/unit/test_analytics.py'),
        'test_only_a_failure_counts_as_a_failure'
      )
    );
  });

  realFileTest('reports the real duplicate-name case as ambiguous', () => {
    // test_markers.py defines test_one sixteen times, inside pytester source
    // strings. The line scan sees them all; only a Python parse could tell them
    // apart, and even then the archive key could not say which one ran.
    const result = locateTest(realSource('tests/unit/test_markers.py'), 'test_one');
    assert.ok(result);
    assert.equal(result.ambiguous, true);
    assert.equal(result.candidates.length, 16);
    assert.ok(result.candidates.every((c, i, all) => i === 0 || all[i - 1].line < c.line));
  });

  realFileTest('returns null for a name that only appears as a prefix', () => {
    // test_analytics.py has test_one_failing_build_is_not_yet_a_standing_failure
    // but no test_one.
    assert.equal(locateTest(realSource('tests/unit/test_analytics.py'), 'test_one'), null);
  });

  realFileTest('returns null for a test deleted since the run', () => {
    assert.equal(
      locateTest(realSource('tests/functional/test_simple.py'), 'test_removed_last_week'),
      null
    );
  });
});
