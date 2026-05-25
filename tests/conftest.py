"""Build the fixture site once per test session and expose the output dir."""

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / 'fixtures'


@pytest.fixture(scope='session')
def site_dir(tmp_path_factory):
    out = tmp_path_factory.mktemp('site')
    subprocess.run(
        [
            sys.executable, '-m', 'pelican',
            str(FIXTURES / 'content'),
            '-s', str(FIXTURES / 'pelicanconf.py'),
            '-o', str(out),
        ],
        check=True,
        capture_output=True,
    )
    yield out
    shutil.rmtree(out, ignore_errors=True)


@pytest.fixture(scope='session')
def read_page(site_dir):
    """Return a callable that reads a built HTML file from the fixture site."""
    def _read(name):
        path = site_dir / name
        return path.read_text('utf-8')
    return _read
