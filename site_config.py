# Pelican configuration for LoE site
# Generate site with:
# pelican content -s site_config.py
AUTHOR = 'Living on Earth'
SITENAME = 'Living on Earth'
# Set to your GitHub Pages URL for production, empty string for local development
SITEURL = '/loe-vibecode'  # Change to '' for local development

PATH = 'content'
OUTPUT_PATH = '_site'

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
STATIC_PATHS = ['static']

# URL settings to match our previous structure
ARTICLE_URL = '{date:%Y_%m_%d}_{slug}.html'
ARTICLE_SAVE_AS = '{date:%Y_%m_%d}_{slug}.html'
PAGE_URL = '{slug}.html'
PAGE_SAVE_AS = '{slug}.html'
INDEX_SAVE_AS = 'index.html'

PLUGIN_PATHS = ['plugins']
PLUGINS = ['speaker_highlight', 'show_segments']

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

JINJA_FILTERS = {'ordinal': ordinal, 'strip_quotes': strip_quotes}
