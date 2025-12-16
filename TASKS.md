# Open tasks

Agent instructions: When working on a task, update the status of the task in this TASKS.md file. Add notes to a subheading under the task you are working on that could help future agents complete the task if you are having trouble.

## Task 1: Update support section

- [x] Move "Support" content from Events page into "About Us" page under the "support us" section and remove duplicate contact info. Replace with a link to the support us section.

## Task 2: Sponsor cloud

- [x] In about.md, under "Funders" section, there is a list of funding organizations and people.
- [x] The funders that are organizations should be replaced with organization logos that link back to the organization pages.

**Note:** The Impax Asset Management logo is currently a generated placeholder. It should be replaced with the official logo when a reliable source becomes available.

## Task 3: Migrate "Special Features"

- [x] Similar to show migration, but may have slightly different structure.
- [x] Agent is to scrape <https://loe.org/series/> and determine the appropriate structure and metadata for a content/series folder along with appropriate HTML templates and JINJA filters or plugins as necessary.
- [x] Markdown files should have YAML metadata frontmatter.
- [x] Agent is then to scrape each page and convert to the content to Markdown in the content/series folder.
- [x] Agent should download several examples and compare them to target where different content/metadata is located in order to build a robust migration script.
- [x] Alternately, the agent may migrate these manually (without a script), since there is a relatively small number of them compared to the show archives.

### Critical Review Notes (2025-12-16)

**Completed:**

- ✅ All 47 series migrated from loe.org/series/
- ✅ Created series.html template based on show.html pattern
- ✅ Features.md reorganized chronologically (2019→1997, with undated section)
- ✅ Enhanced scraper to extract dates from segment URLs (e.g., programID=06-P13-00011 → 2006)
- ✅ Scraper now checks segment pages for missing images (reduced from 16→14 missing)

**Issues Identified:**

1. **Empty Series Content (HIGH PRIORITY)**
   - Rachel Carson: Has image/description but NO content/parts listed
   - Several series have only links to parts but no introductory content
   - Content feels sparse - just a list of links with no context

2. **Missing Images (14 series)**
   - 9/11 Coverage, Antarctica Series, Early Signs, Fusion or Illusion
   - Generation Next, Gulf War 2003, Iron Fertilization, Lead: The Silent Epidemic
   - Living Estuaries, Middle East Troubled Waters, Pedaling Lewis & Clark
   - Search for the Golden Moon Bear, Thirst for Safe Water, Vegan Thanksgiving
   - These are mostly older series (1997-2006) where source pages lack images

3. **Inaccurate Default Dates**
   - 22 series dated 2025-12-16 (today) because no segment dates found
   - These should be in "Additional Series" but are showing as undated
   - Examples: Rachel Carson, Page Turners 2004, Gulf War 2003, etc.

4. **Content Quality Issues**
   - LOE Student Productions: Description is garbled text from page scraping
   - Audio/download links captured as separate list items instead of inline
   - Missing series descriptions for context

5. **Template Limitations**
   - No thumbnail/preview images shown on features.html index
   - No excerpt or description shown in series list
   - Just text links with years - visually plain

**Recommendations for Future Work:**

1. Re-scrape series with no content to get full descriptions/introductions
2. Manually add dates for undated series or mark them clearly as "Various" or "Ongoing"
3. Clean up descriptions that have formatting artifacts
4. Add thumbnail support to features.html (card-based layout)
5. Consider adding brief descriptions under each series link
6. For series without original images, could generate topic-related placeholder images

### Scraping Process Learnings

**URL Patterns & Navigation:**

- The loe.org site has malformed URLs in HTML (e.g., `seriesseries.html` duplicates)
- Always filter and deduplicate by ID rather than trusting href uniqueness
- Use both `series.html?seriesID=X` and check for variations like `story.html?seriesID=X`
- Segment URLs follow pattern: `segments.htm?programID=YY-P13-XXXXX&segmentID=N`
  - YY is 2-digit year (06 = 2006, 97 = 1997, etc.)
  - Can extract approximate dates from programID when published dates unavailable

**Content Structure:**

- Main content in `<div class="left">` or `<div class="leftt">`
- Primary title usually in `<h3>`, fallback to `<h2>`
- Images often detached from captions (caption in next paragraph)
- Audio/download links appear as siblings to content links
- Published dates in format: `Published: Month DD, YYYY`

**Metadata Extraction Strategy:**

1. Check series page for image/description first
2. If missing, fetch first segment/part URL and extract from there
3. Parse dates from:
   - Explicit "Published:" text near links
   - ProgramID patterns in URLs (2-digit year prefix)
   - Default to 2000-01-01 for undated content to avoid current date
4. Clean descriptions by removing navigation text, JavaScript notices

**BeautifulSoup Best Practices:**

- Always decompose `<script>`, `<style>`, navigation divs before processing
- Use `.get_text(strip=True)` but preserve structure for multi-element content
- Check multiple possible locations (h2, h3, first p) for titles/descriptions
- Siblings and parent traversal needed for associated content (captions, dates)

**Error Handling:**

- SSL verification bypass required: `ctx.check_hostname = False`
- Handle 404s gracefully (many old series IDs no longer exist)
- Use `.get()` with defaults for optional metadata fields
- Regex patterns should have fallbacks for parsing variations

**Performance Considerations:**

- Fetching segment pages for missing images adds ~2x time per series
- 47 series took ~2-3 minutes with segment fallbacks
- Could optimize by: caching responses, parallel requests, only checking segments when needed
- For archives (1000s of shows), batch processing and progress tracking essential

**Quality Checks Needed:**

- Verify dates are reasonable (not all defaulting to today)
- Check for empty content (title but no body)
- Validate image URLs are accessible
- Review description text for HTML artifacts or garbled content
- Ensure special characters (é, &, etc.) handled correctly in YAML

## Task 4: Show migration script ✅ COMPLETE

- [x] Improve the show migration script to properly scrape the LoE archives
- [x] Migrate shows after 2025-10-31 into the `content/shows` folder  
- [x] Migrate pre-2025 shows into the `content/_wip/shows/` folder
- [x] Downloaded and compared multiple shows/segments to build robust migration script
- [x] Fixed speaker name formatting issue (O'NEILL split bug)
- [x] Resolved Python bytecode caching problem
- [x] Work on the recent 2025 shows first, double-check everything

**Completion Status (2025-12-16):**

- ✅ All 50 shows from 2025 successfully migrated (Jan 3 - Dec 12)
- ✅ 6 shows in `content/shows/2025/` (Nov 7 - Dec 12, post-Oct 31 cutoff)
- ✅ 44 shows in `content/_wip/shows/2025/` (Jan 3 - Oct 31)
- ✅ Total: 293 markdown files (shows + segments) with full transcripts
- ✅ Complete metadata: titles, dates, images, summaries, megaphone IDs
- ✅ Speaker names properly formatted (fixed O'NEILL: issue)
- ✅ Script ready for historical archives (2024, 2023, etc.)

## Task 5: Fix segment images

- [x] The segment thumbnails are not showing up on the show pages.
- [x] Investigate this and update the templates.
- [x] DO NOT change any of the markdown files or any files in content/. Another agent is working on those and you will have conflicts.
