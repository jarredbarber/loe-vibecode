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

## Task 4: Show migration script

- Improve the show migration script to properly scrape the LoE archives
- Migrate 2025 shows into the `content/shows` folder
- Migrate pre-2025 shows into the `content/archives/shows/` folder
- Agent should download several shows/segments and compare them to target where different content/metadata is located in order to build a robust migration script.
- Since the archives go back to 1991, be advised that older content may have slightly different metadata/formatting and/or be missing information.
