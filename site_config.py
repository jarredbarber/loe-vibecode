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

# Fast build setting
if os.environ.get('FAST_BUILD') == 'true':
    ARTICLE_EXCLUDES = ['archive']
    PAGE_EXCLUDES = ['archive']

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

# Direct templates
DIRECT_TEMPLATES = ['index', 'archives', 'newsletter']
NEWSLETTER_SAVE_AS = 'newsletter.html'

PLUGIN_PATHS = ['plugins']
PLUGINS = ['speaker_highlight', 'show_segments']

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
    'current_time': current_time
}


