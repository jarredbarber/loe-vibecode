# Pelican configuration for LoE site
# 
# Build for different environments:
# - Local development:  pelican content -s site_config.py
# - GitHub Pages:       SITEURL=/loe-vibecode pelican content -s site_config.py
# - Production:         SITEURL=https://loe.org pelican content -s site_config.py

import os

AUTHOR = 'Living on Earth'
SITENAME = 'Living on Earth'

# SITEURL can be configured via environment variable
# Default to empty string for local development
SITEURL = os.environ.get('SITEURL', '')

# Staging mode: set STAGING=true to surface in-page "Edit on GitHub" and
# "Add segment" buttons that deep-link to GitHub's web editor. Production
# deploys leave this unset.
STAGING = os.environ.get('STAGING', '').lower() in ('1', 'true', 'yes')
GITHUB_REPO = os.environ.get('GITHUB_REPO', 'jarredbarber/loe-vibecode')
GITHUB_BRANCH = os.environ.get('GITHUB_BRANCH', 'main')

# Fast build setting
if os.environ.get('FAST_BUILD') == 'true':
    ARTICLE_EXCLUDES = ['archive']
    PAGE_EXCLUDES = ['archive']

PATH = 'content'
OUTPUT_PATH = '_site'

# Incremental builds attempted via Pelican's LOAD_CONTENT_CACHE +
# CACHE_CONTENT, but our custom yaml_reader plugin doesn't integrate with
# Pelican's per-reader cache (the gzipped pickle ended up empty for
# articles). Left off pending a proper cache hook in yaml_reader. CI build
# stays at ~3-5 min for the 12k-article archive.

# Use full YAML frontmatter instead of Python-Markdown's default Meta extension.
# Meta is not real YAML — it can't represent quoted strings, lists, or nested
# values. YAML is what Decap-style CMSs write, and is the format we now emit
# from the ingest pipeline.
MARKDOWN = {
    'extension_configs': {
        'markdown.extensions.codehilite': {'css_class': 'highlight'},
        'markdown.extensions.extra': {},
    },
    'extensions': [
        'markdown.extensions.codehilite',
        'markdown.extensions.extra',
        'full_yaml_metadata',
    ],
    'output_format': 'html5',
}

TIMEZONE = 'America/New_York'

DEFAULT_LANG = 'en'

# Feed generation is usually not desired when developing
FEED_ALL_ATOM = None
CATEGORY_FEED_ATOM = None
TRANSLATION_FEED_ATOM = None
AUTHOR_FEED_ATOM = None
AUTHOR_FEED_RSS = None

# Theme
THEME = 'themes/loe_original'

# Static paths
STATIC_PATHS = ['static', 'images', 'extra']
# Admin UI is shipped only on staging builds. Production omits it so /admin/
# 404s on the public site. To preview admin locally: STAGING=true pelican ...
if STAGING:
    STATIC_PATHS.append('admin')

# Don't parse anything inside content/admin/ as an article or page —
# the directory is purely static (SPA shell + config + README).
ARTICLE_EXCLUDES = ['admin']
PAGE_EXCLUDES = ['admin']

# Extra path metadata - serve files from extra directory at root
EXTRA_PATH_METADATA = {
    'extra/favicon.ico': {'path': 'favicon.ico'},
    'extra/podcast.rss': {'path': 'podcast.rss'},
}

# URL settings to match our previous structure
ARTICLE_URL = '{date:%Y_%m_%d}_{slug}.html'
ARTICLE_SAVE_AS = '{date:%Y_%m_%d}_{slug}.html'
PAGE_URL = '{slug}.html'
PAGE_SAVE_AS = '{slug}.html'
INDEX_SAVE_AS = 'index.html'

# Direct templates
DIRECT_TEMPLATES = ['index', 'archives', 'newsletter']
NEWSLETTER_SAVE_AS = 'newsletter.html'

PLUGIN_PATHS = ['plugins']
PLUGINS = ['yaml_reader', 'speaker_highlight', 'show_segments', 'shortcodes']

from datetime import datetime
from zoneinfo import ZoneInfo

def ordinal(n):
    if 11 <= (n % 100) <= 13:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f"{n}{suffix}"

def strip_quotes(value):
    if not value:
        return ""
    return value.strip('"')

def current_time(value, format_string):
    """Return current datetime formatted with the given string"""
    return datetime.now(ZoneInfo('America/New_York')).strftime(format_string)

JINJA_FILTERS = {
    'ordinal': ordinal, 
    'strip_quotes': strip_quotes,
    'current_time': current_time,
    'get_latest_show_url': lambda articles: next((a.url for a in articles if a.metadata.get('template') == 'show'), '#')
}


