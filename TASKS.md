# Open tasks

## Task 1: Update support section

- [x] Move "Support" content from Events page into "About Us" page under the "support us" section and remove duplicate contact info. Replace with a link to the support us section.

## Task 2: Sponsor cloud

- In about.md, under "Funders" section, there is a list of funding organizations and people.
- The funders that are organizations should be replaced with organization logos that link back to the organization pages.

## Task 3: Migrate "Special Features"

- Similar to show migration, but may have slightly different structure.
- Agent is to scrape <https://loe.org/series/> and determine the appropriate structure and metadata for a content/series folder along with appropriate HTML templates and JINJA filters or plugins as necessary.
- Markdown files should have YAML metadata frontmatter.
- Agent is then to scrape each page and convert to the content to Markdown in the content/series folder.
- Agent should download several examples and compare them to target where different content/metadata is located in order to build a robust migration script.
- Alternately, the agent may migrate these manually (without a script), since there is a relatively small number of them compared to the show archives.

## Task 4: Show migration script

- Improve the show migration script to properly scrape the LoE archives
- Migrate 2025 shows into the `content/shows` folder
- Migrate pre-2025 shows into the `content/archives/shows/` folder
- Agent should download several shows/segments and compare them to target where different content/metadata is located in order to build a robust migration script.
- Since the archives go back to 1991, be advised that older content may have slightly different metadata/formatting and/or be missing information.
