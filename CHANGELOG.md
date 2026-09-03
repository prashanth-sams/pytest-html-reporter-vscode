# Changelog

## [0.1.2] — 2026-09-03

- Readable summary counts. Every figure sat on one uniform badge colour with
  only the number tinted, which left `1 skipped` grey on grey and gave xPASS
  and xFAIL no colour at all. Each count now carries its own tinted plate.
- A pass-rate ring, a proportional status bar, and a failures-per-build chart
  drawn from the archive — the trend no single report can show.
- Long test names wrap at word boundaries instead of mid-token.
- Error snippets sit on a neutral plate with a red edge rather than being solid
  red blocks, which were unreadable stacked down a list.
- A broken test no longer shows both a `0/N` badge and a row of identical red
  trend ticks saying the same thing.
- `npm run preview` renders the sidebar to standalone HTML for design work
  without launching an Extension Development Host.

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
