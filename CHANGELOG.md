# Changelog

## [0.1.1] — 2026-09-03

- New icon, matching the reporter's own bar-chart mark. The activity bar
  version is drawn separately with the bars spaced apart: VS Code renders that
  icon as a monochrome mask, so the original's touching bars would have
  collapsed into a single silhouette.

## [0.1.0] — 2026-09-02

First release.

- Sidebar view of `pytest-html-reporter` results, failures grouped by suite.
- Error previews with the ANSI colouring stripped for reading; the raw message,
  escape codes intact, is what "copy error" puts on the clipboard.
- Jump from a failure to its `def` in the source. The report records no line
  numbers, so the line is recovered by scanning the suite file; a name defined
  more than once in one file offers a pick list rather than guessing.
- Flaky and consistently-broken verdicts computed from `archive/*.json`, using
  the same outcome rules as the plugin's own analytics — `xFAIL` and `xPASS`
  count as passes, a retry inside one build counts as flakiness, and skips
  neither flip an outcome nor enter a pass rate.
- Trend sparkline of recent outcomes on a failing test.
- The full HTML report opens in an editor tab, with screenshot references
  rewritten so they load inside the webview.
- Automatic report detection, verified against the plugin's own JSON shape so an
  unrelated `output.json` is never shown as test results.
- Debounced reload when the report changes, with a size-stability check first so
  a multi-megabyte file is never parsed half-written.
