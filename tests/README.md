# `/tests` — Automated tests

Unit tests for the Eleventy build. They catch regressions in template rendering, plugin logic, and URL structure — things that are easy to break accidentally when editing templates.

```bash
npm test        # run from repo root
```

Tests use Node's built-in test runner and [cheerio](https://cheerio.js.org/) to parse rendered HTML. Each test asserts a specific invariant that has been broken at least once before (broken URLs, missing audio players, mangled transcripts, etc.).

`fixtures/` contains a minimal content tree used by the tests — small enough to build in under a second. Tests do not touch the real `content/` folder.
