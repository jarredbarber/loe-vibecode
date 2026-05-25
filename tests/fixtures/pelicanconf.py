"""Test Pelican config — reuses the production config but points at fixture
content. Imports * so any future change to site_config.py picks up here too."""

import os
import sys
from pathlib import Path

# Make the project root importable so we can re-use site_config + plugins.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from site_config import *  # noqa: F401,F403

PATH = str(Path(__file__).parent / 'content')
OUTPUT_PATH = os.environ.get('PELICAN_OUTPUT', str(Path(__file__).parent / '_build'))
PLUGIN_PATHS = [str(PROJECT_ROOT / 'plugins')]
THEME = str(PROJECT_ROOT / 'themes' / 'loe_original')
SITEURL = ''
