# Pytest HTML Reporter for VS Code

View [pytest-html-reporter](https://github.com/prashanth-sams/pytest-html-reporter)
results in the VS Code sidebar — failures grouped by suite, error previews,
one-click navigation to the test, and flaky-test detection drawn from the
build history the plugin already keeps.

## Features

- **Failures at a glance.** Every failing test grouped under its suite, with a
  truncated error message on each card.
- **Jump to the test.** Click a failure to open the file at the test's `def`.
- **Copy the real error.** The card shows readable text; the clipboard gets the
  original, terminal colouring intact.
- **Flaky vs broken.** Past builds in `archive/` are read to tell a test that
  *sometimes* fails from one that has never passed. Stable tests get no badge,
  so the ones that do mean something.
- **Charts.** A pass-rate ring, a proportional status bar, and failures per
  build across the recent archive — the trend no single report can show.
- **Per-test trend.** The last dozen outcomes for a flaky test, oldest to newest.
- **Full report, in the editor.** Open the generated HTML report — Steps,
  Attachments, Analytics, Coverage, screenshots — in a tab instead of a browser.
- **Live refresh.** The sidebar reloads when a run finishes.
- **Several reports.** Switch between them from a dropdown.

## Getting started

```bash
pip install pytest-html-reporter
pytest --html-report=./report
```

Open the **Pytest HTML Reporter** view in the activity bar. The report is found
automatically; if you keep it somewhere unusual, run
**Pytest HTML Reporter: Configure Report Path**.

## How it finds your report

The extension reads `output.json`, never the generated HTML — the HTML is only
ever displayed. It looks for `output.json` in the workspace root (the plugin's
default, since it writes relative to pytest's working directory), then in
`report/`, `reports/`, `test-reports/`, `.reports/` and `test-results/`, then
falls back to a bounded workspace search.

Every candidate is checked for the plugin's own `content.suites` shape before it
is offered. `output.json` is a common filename, and rendering an unrelated one
as test results would be worse than finding nothing.

Alongside it the extension expects the layout the plugin writes:

```
<report dir>/output.json                       the current run
<report dir>/archive/output_<timestamp>.json   past runs — the history
<report dir>/pytest_html_report.html           the full report
<report dir>/pytest_screenshots/               screenshots
```

## Settings

| Setting | Default | What it does |
|---|---|---|
| `pytestHtmlReporter.reportJsonPaths` | `[]` | Explicit `output.json` paths. Empty means auto-detect. |
| `pytestHtmlReporter.autoRefresh` | `true` | Reload when the report changes on disk. |
| `pytestHtmlReporter.showErrorSnippets` | `true` | Show a truncated error on each failure. |
| `pytestHtmlReporter.maxErrorLength` | `150` | Snippet length, 50–500. |
| `pytestHtmlReporter.history.enabled` | `true` | Read `archive/*.json` for flaky/broken verdicts. |
| `pytestHtmlReporter.history.maxBuilds` | `25` | Recent builds to consider, 2–200. |

## Previewing the sidebar

Launching the Extension Development Host to check a colour is a slow loop, so
the sidebar can be rendered straight to HTML:

```bash
npm run preview                # the bundled fixture, with failures
npm run preview -- all-passed  # a green run
npm run preview -- no-config   # nothing found yet
npm run preview -- error       # a corrupt report
```

It writes a dark and a light file into `.preview/`; open either in a browser.
The real VS Code theme variables are stubbed in, so what you see is what the
webview renders. Point it at one of your own runs with
`PREVIEW_REPORT=/path/to/output.json npm run preview` — the history charts then
read that report's own `archive/` too.

For the full thing, press <kbd>F5</kbd> for an Extension Development Host and
open a folder containing a report.

## Known limitation: locating a test

`output.json` records no line numbers, and no nodeid. Each result carries only
its suite path and pytest's `item.name` — which means the class segment of the
nodeid is not written down anywhere.

So "jump to test" opens the suite file and scans it for the matching `def`. That
is exact for the overwhelming majority of tests. Where it cannot be exact is
when one file defines the same test name twice — two classes with a method of
the same name — because the record has nothing to tell them apart. In that case
you get a pick list rather than a silent guess at the wrong one.

If a test has been renamed or deleted since the run, the file still opens, at
line 1, with a note explaining why.

## What it does not do

It does not run your tests — the built-in Python extension's Test Explorer does
that well already. This is a viewer for reports the plugin has produced, and it
never shells out to pytest.

Steps, attachments, logs, BDD scenarios and per-file coverage are the HTML
report's job; the sidebar links out to it rather than reproducing it.

## License

MIT
