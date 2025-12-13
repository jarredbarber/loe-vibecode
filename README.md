# Living on Earth - Website

This is the website for [Living on Earth](http://loe.org), a weekly environmental news radio program. The site is built with Pelican (a static site generator) and automatically publishes to GitHub Pages.

## 🌍 About Living on Earth

Living on Earth is a weekly, hour-long, award-winning environmental news program distributed by the Public Radio Exchange. Hosted by Steve Curwood, the program features interviews and commentary on environmental issues. The show has been broadcasting since 1991 and airs on over 300 public radio stations nationwide.

## 🚀 Quick Start for Content Editors

### Viewing the Live Site

The site is published at: **https://jarredbarber.github.io/loe-vibecode/**

### Making Changes

1. **Edit content directly on GitHub**
   - Navigate to the file you want to edit
   - Click the pencil icon (✏️) to edit
   - Make your changes
   - Scroll down and click "Commit changes"

2. **The site updates automatically**
   - After you commit, GitHub Actions will rebuild the site
   - Check the "Actions" tab to see the build progress
   - Your changes will be live in 2-3 minutes

### Where Things Are

```
loe-vibecode/
├── content/shows/        ← Show and episode content (Markdown files)
│   └── 2024/
│       └── 12-05/
│           ├── show-2024-12-05.md
│           └── episode-name.md
├── themes/loe_original/  ← Website design and layout
│   ├── static/css/       ← Styling (colors, fonts, layout)
│   └── templates/        ← HTML templates
└── site_config.py        ← Site settings
```

## 📝 Editing Content

### Content Structure

Each weekly show has:
- **One show page** (`show-YYYY-MM-DD.md`) - Overview with links to segments
- **Multiple segment pages** - Individual stories/interviews

### Editing a Segment

1. Go to `content/shows/YEAR/MM-DD/`
2. Find the segment file (e.g., `climate-policy-update.md`)
3. Click the pencil icon to edit
4. The file has two parts:

**Frontmatter** (metadata at the top):
```yaml
---
title: Climate Policy Update
date: 2024-12-05
category: Segments
megaphone_id: LOE1234567890
summary: A summary of the segment
---
```

**Content** (below the `---`):
```markdown
## Transcript

CURWOOD: This is the transcript...
```

5. Make your edits and commit

### Adding a New Segment

1. Create a new file in the appropriate date folder
2. Name it with lowercase and hyphens: `my-new-segment.md`
3. Add the frontmatter and content
4. Update the show page to link to it:

```markdown
### [My New Segment]({filename}my-new-segment.md)
```

## 🎨 Editing the Design

### Changing Styles (CSS)

Edit: `themes/loe_original/static/css/style.css`

Common changes:
- **Colors**: Search for color codes like `#333` or `rgb()`
- **Fonts**: Look for `font-family` or `font-size`
- **Spacing**: Adjust `margin` and `padding` values

### Modifying Templates (HTML)

Templates are in `themes/loe_original/templates/`:

- `base.html` - Main layout, navigation, header/footer
- `article.html` - Individual segment pages
- `show.html` - Weekly show overview pages
- `archives.html` - Archive listing page
- `index.html` - Homepage

**Example: Changing the navigation menu**

Edit `base.html` and find the `<nav>` or menu section:
```html
<li><a href="/archives.html">Archive</a></li>
```

## ⚙️ Site Configuration

### Environment-Based Configuration

The site URL is configured via environment variable to support different deployment targets:

**Local development** (default):
```bash
pelican content -s site_config.py
# SITEURL defaults to '' (empty string)
```

**GitHub Pages**:
```bash
SITEURL=/loe-vibecode pelican content -s site_config.py
```

**Production** (future):
```bash
SITEURL=https://loe.org pelican content -s site_config.py
```

### Other Settings

Edit `site_config.py` to change:
- `SITENAME` - Site title
- `TIMEZONE` - Time zone for dates
- `AUTHOR` - Site author

## 🔄 How Publishing Works

Every time you commit to the `main` branch:

1. **GitHub Actions triggers** (see `.github/workflows/deploy.yml`)
2. **Pelican builds the site** - Converts Markdown to HTML
3. **Site deploys to GitHub Pages** - Goes live automatically

You can watch this happen in the "Actions" tab.

## 🧪 Testing Locally (Optional)

If you want to preview changes before publishing:

### Setup (One-time)

```bash
# Clone the repository
git clone https://github.com/jarredbarber/loe-vibecode.git
cd loe-vibecode

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Build and Preview

```bash
# Activate virtual environment
source venv/bin/activate

# Build the site
pelican content -s site_config.py

# Start local server
pelican --listen
```

Visit `http://localhost:8000` in your browser.

**Remember**: Set `SITEURL = ''` in `site_config.py` for local testing!

## 📚 Understanding the Content System

### Shows vs Segments

- **Show** = One weekly broadcast (e.g., "December 5, 2024")
- **Segment** = Individual story within a show (e.g., "AI Power Demand")

Each show page lists its segments with links. The custom plugins automatically connect them.

### Metadata Fields

Common fields in frontmatter:

- `title` - Segment or show title
- `date` - Publication date (YYYY-MM-DD)
- `category` - "Shows" or "Segments"
- `template` - "show" or "article"
- `megaphone_id` - Audio player ID
- `image_url` - Featured image
- `summary` - Brief description

### Special Formatting

**Speaker names** in transcripts are automatically highlighted:
```
CURWOOD: Welcome to Living on Earth.
```

**Music blocks** are formatted specially:
```
[MUSIC: Title, Artist, Album]
```

## 🛠️ Advanced: Web Scraping

The `scrape_archives.py` script imports content from the original loe.org site.

**To scrape content:**
```bash
python3 scrape_archives.py
```

This is configured to scrape years 1991-2022. The script:
- Fetches show data from loe.org
- Extracts transcripts and metadata
- Creates Markdown files in `content/shows/`

**⚠️ Important**: Only use the scraper to add content. Don't manually edit files in `content/shows/` that were created by the scraper, as they may be overwritten.

## 🐛 Troubleshooting

### Site Not Updating

1. Check the "Actions" tab for build errors
2. Look for red ❌ marks indicating failures
3. Click on the failed workflow to see error details

### Broken Links

- Make sure segment filenames match the links in show pages
- Use `{filename}segment-name.md` format in links
- Check that files are in the correct date folder

### CSS Not Loading

- Verify `SITEURL = '/loe-vibecode'` in `site_config.py`
- Clear your browser cache
- Check that CSS files are in `themes/loe_original/static/css/`

### Local Preview Not Working

- Make sure virtual environment is activated
- Set `SITEURL = ''` (empty string) for local development
- Run `pelican content -s site_config.py` to rebuild

## 📖 Additional Resources

### Markdown Guide

- [Markdown Cheatsheet](https://www.markdownguide.org/cheat-sheet/)
- Use `#` for headers, `**bold**`, `*italic*`
- Links: `[text](url)`
- Images: `![alt text](url)`

### Pelican Documentation

- [Pelican Docs](https://docs.getpelican.com/)
- [Writing Content](https://docs.getpelican.com/en/stable/content.html)
- [Theming](https://docs.getpelican.com/en/stable/themes.html)

### GitHub Pages

- [GitHub Pages Docs](https://docs.github.com/en/pages)
- [Custom Domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)

## 🤝 Getting Help

- Check the "Actions" tab for build errors
- Review this README for common tasks
- Look at existing content files as examples
- Test changes locally before committing

## 📄 License

This project is for migrating Living on Earth content. Refer to Living on Earth's licensing for content usage.
