---
trigger: model_decision
description: when scraping the loe.org website
---

# Scraping Tips for loe.org

Based on `scrape_archives.py` and migration experience.

## 1. Access & Network
- **SSL Verification**: The legacy site has SSL issues. Always disable verification.
  - Python: `ssl._create_default_https_context = ssl._create_unverified_context` or `context.check_hostname = False`.
- **User Agent**: Use a generic browser User-Agent (e.g., `'Mozilla/5.0'`) to avoid basic blocking.

## 2. Tools
- **Static Content**: `urllib` or `BeautifulSoup` works for most archive pages (`shows/`, `segments.html`).
- **Problematic Pages**: Some pages (like `jobs.html`) may return incomplete content with standard HTTP requests.
  - **Solution**: Use a browser-based tool (like `browser_subagent` or Selenium) to fully render the DOM before extraction.

## 3. HTML Structure & Cleaning
- **Main Content**: Usually located in `<div class="left">` or `<div class="leftt">`.
- **Date Parsing**: Look for dates in `<h2>` headers or "Air Date:" text in paragraphs.
- **Images**:
  - Often detached from their captions. Captions frequently appear in the paragraph *after* the image, sometimes italicized or starting with "Photo:".
- **Speaker Names**: Format is often `NAME: Text`. Ensure distinct paragraphs by adding newlines before speaker names.
- **Noise Removal**: Filter out lines like "Please enable JavaScript" or "Air Date:" prefixes.

## 4. URL Patterns
- **Shows**: Discovery via Year TOC: `https://loe.org/shows/toc.html?year=XXXX`
- **Segments**: `segments.html?programID=...&segmentID=...`

## 5. Artifacts
- **Python Script**: See `scrape_archives.py` for a working implementation of archive scraping logic.
