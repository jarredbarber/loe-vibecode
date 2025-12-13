# Living on Earth - Website Migration Project

This project migrates the [Living on Earth](http://loe.org) website to a modern static site built with Pelican, using Markdown content sourced from the original site's archives.

## About Living on Earth

Living on Earth is a weekly, hour-long, award-winning environmental news program distributed by the Public Radio Exchange. Hosted by Steve Curwood, the program features interviews and commentary on a broad range of ecological issues. The show airs on over 300 public radio stations nationwide and has been broadcasting since 1991.

## Project Overview

This codebase provides:
- A Pelican-based static site generator configuration
- Custom plugins for processing show/segment relationships and transcripts
- Web scraping tools to migrate content from the original loe.org site
- Custom templates and styling for the new site

## Quick Start

### Prerequisites

- Python 3.x
- pip

### Installation

1. Clone the repository
2. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install pelican beautifulsoup4 requests markdown
   ```

### Building the Site

Generate the static site:
```bash
pelican content -s site_config.py
```

The generated site will be in the `_site/` directory.

### Local Development Server

To preview the site locally:
```bash
pelican --listen
```

Then visit `http://localhost:8000` in your browser.

## Project Structure

```
loe-vibecode/
├── content/
│   └── shows/           # Show and segment markdown files
│       └── {year}/
│           └── {month-day}/
│               ├── show-{date}.md
│               └── {segment-slug}.md
├── themes/
│   └── loe_original/    # Custom Pelican theme
│       ├── static/
│       │   └── css/
│       └── templates/
├── plugins/
│   ├── show_segments/   # Links shows to their segments
│   └── speaker_highlight/  # Formats transcript speakers
├── scrape_archives.py   # Content migration scraper
├── site_config.py       # Pelican configuration
└── README.md
```

## Content Architecture

### Shows vs Segments

Each weekly broadcast is a **show** containing multiple **segments** (individual stories/interviews):

- **Show pages** (`show-{date}.md`): Overview page with links to all segments
  - Template: `show`
  - Contains segment list as H3 headers with links
  
- **Segment pages** (`{slug}.md`): Individual story/interview articles
  - Template: `article`
  - Contains full transcript, audio player, metadata

### Content Organization

Content is organized by date:
```
content/shows/2024/12-05/
├── show-2024-12-05.md
├── ai-power-demand.md
└── climate-policy-update.md
```

## Custom Pelican Plugins

### `show_segments` Plugin

Links show pages to their segment articles:
- Parses H3 headers in show content to find segment links
- Creates `related_segments` list on show article objects
- Enables templates to display segment previews

### `speaker_highlight` Plugin

Processes transcript text:
- Identifies and styles speaker names (e.g., `CURWOOD:`)
- Handles special formatting for music/cutaway blocks `[MUSIC: ...]`
- Applies CSS class `.speaker` to speaker names

## Web Scraping

### Running the Scraper

The `scrape_archives.py` script migrates content from loe.org:

```bash
# Scrape specific year
python3 scrape_archives.py  # Currently configured for 1991-2022

# The script processes years in descending order
```

### What the Scraper Does

1. Fetches show listings from loe.org archives
2. Extracts metadata (title, date, summary, images, audio IDs)
3. Downloads segment content and transcripts
4. Generates Markdown files with YAML frontmatter
5. Organizes files by date in `content/shows/`

### Scraper Output Format

Generated markdown files include:
```yaml
---
title: Episode Title
date: 2024-12-05
category: Shows
template: show
megaphone_id: LOE1234567890
image_url: https://loe.org/content/...
summary: Episode description
---

## Segments

### [Segment Title]({filename}segment-slug.md)
```

**Important**: Metadata fields are NOT wrapped in quotes to avoid formatting issues.

## Custom Jinja Filters

### `strip_quotes`

Removes surrounding quotes from titles and metadata:
```jinja
{{ article.title|strip_quotes }}
```

### `ordinal`

Converts numbers to ordinal form (1st, 2nd, 3rd):
```jinja
{{ article.date|strftime('%B')|ordinal }}
```

## Templates

### Key Templates

- `base.html` - Main layout with navigation
- `show.html` - Show page template
- `article.html` - Segment/article template
- `archives.html` - Archive listing by year with sticky sidebar
- `show-segment.html` - Segment preview module

### Template Features

- Dynamic "This Week" link points to newest show
- Archive page with year-based navigation
- Sticky sidebar on archives for easy year jumping
- Speaker-highlighted transcripts
- Embedded audio players (Megaphone)

## Styling

Custom CSS includes:
- Bold date links in archives
- Sticky sidebar positioning
- Speaker name styling in transcripts
- Segment player and length indicators

## Development Guidelines

### Important Constraints

⚠️ **Do NOT**:
- Generate images unless explicitly requested
- Modify files in `content/` folder except via `scrape_archives.py`

### Adding New Content

1. Use the scraper to fetch content from loe.org
2. Or manually create markdown files following the structure above
3. Rebuild the site with `pelican content -s site_config.py`

### Modifying Templates

1. Edit templates in `themes/loe_original/templates/`
2. Rebuild to see changes
3. Test with `pelican --listen`

### Creating New Plugins

1. Create a new directory in `plugins/`
2. Add `__init__.py` with plugin logic
3. Register in `site_config.py`:
   ```python
   PLUGINS = ['show_segments', 'speaker_highlight', 'your_plugin']
   ```

## Configuration

### Site Settings (`site_config.py`)

Key configuration options:
- `SITENAME` - Site title
- `SITEURL` - Production URL
- `THEME` - Path to theme directory
- `PLUGINS` - List of enabled plugins
- `JINJA_FILTERS` - Custom Jinja filters

## Build Output

The build process:
- Processes 1500+ articles in ~10-20 seconds
- Generates static HTML in `_site/`
- Creates archive pages organized by year
- Links shows to segments automatically

## Migration Status

Content migration progress:
- ✅ 2025: Complete
- ✅ 2024: Complete
- ✅ 2023: Complete
- 🔄 1991-2022: In progress

## Troubleshooting

### Build Errors

**"Command not found: pelican"**
- Activate virtual environment: `source venv/bin/activate`

**Slug conflicts**
- Add unique `slug` field to markdown frontmatter

**Missing segments**
- Check that segment filenames match H3 links in show files
- Verify `{filename}` syntax in links

### Scraper Issues

**SSL Certificate errors**
- The scraper disables SSL verification for loe.org (known issue)

**Missing metadata**
- Check that the source page structure hasn't changed
- Review scraper debug output

## Contributing

When making changes:
1. Test locally with `pelican --listen`
2. Verify archive navigation works
3. Check that show-segment links function correctly
4. Ensure transcripts display properly with speaker highlighting

## License

This project is for migrating Living on Earth content. Refer to Living on Earth's licensing for content usage.

## Support

For issues or questions about this migration project, refer to the project documentation or contact the development team.
