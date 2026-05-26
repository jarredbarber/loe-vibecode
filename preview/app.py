"""
CMS preview render service.

Receives markdown body + frontmatter from the Sveltia CMS editor and returns
HTML rendered through the SAME plugin chain as the live Pelican build. This
is the only way to get pixel-perfect previews of {% audio %} / {% cue %}
shortcodes, speaker styling, and image-caption rendering without mirroring
all the plugin logic in JS.

Deployed to Fly.io. Sveltia (browser) calls POST /preview which returns
{"html": "..."} which the CMS injects into its preview pane.

Endpoint: POST /preview
  { "body": "<markdown body>", "frontmatter": {...}, "collection": "segments" }
"""

import os
import sys
import re
from contextlib import contextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import markdown
from bs4 import BeautifulSoup


# Stub the pelican module so plugin imports work without the full framework.
class _SignalsStub:
    class _Signal:
        def connect(self, *_args, **_kwargs):
            pass

    def __getattr__(self, _name):
        return _SignalsStub._Signal()


class _PelicanStub:
    signals = _SignalsStub()


# Wire stub into sys.modules BEFORE importing plugins.
sys.modules.setdefault("pelican", _PelicanStub())
sys.modules.setdefault("pelican.signals", _PelicanStub.signals)

# Add the project root so we can import the actual plugin source.
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))

# Now import the real plugin transforms. We only need their core functions,
# not the register() wiring.
from plugins.speaker_highlight import process_transcript  # noqa: E402
from plugins.shortcodes import _expand as expand_shortcodes  # noqa: E402


app = FastAPI(title="LoE CMS Preview")

# Sveltia (the CMS browser app) lives on a different origin than this service.
# Allow CORS for the deployed admin URL. For ease, we allow any origin since
# the only thing this endpoint does is render markdown to HTML.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


class PreviewRequest(BaseModel):
    body: str = ""
    frontmatter: dict = {}
    collection: str = "segments"


class _FakeContent:
    """Plugins act on a Pelican Content-like object — they only need
    ._content (mutable HTML string) and .metadata (frontmatter dict)."""

    def __init__(self, html, metadata):
        self._content = html
        self.metadata = metadata


def _markdown_to_html(body: str) -> str:
    md = markdown.Markdown(
        extensions=["markdown.extensions.codehilite", "markdown.extensions.extra"],
        output_format="html5",
    )
    return md.convert(body)


def _render(body: str, frontmatter: dict) -> str:
    html = _markdown_to_html(body)
    fake = _FakeContent(html, frontmatter)
    # Order matters: shortcodes expand {% audio %} / {% cue %} into HTML;
    # speaker_highlight then wraps speaker-prefixed paragraphs.
    from plugins.shortcodes import _on_content
    _on_content(fake)
    process_transcript(fake)
    return fake._content


@app.get("/")
def root():
    return {"service": "loe-cms-preview", "status": "ok"}


# Absolute URL to the live site's stylesheet. Prepended to every preview
# response so the CMS iframe loads it directly, bypassing Sveltia's
# preview-style registration (which has been unreliable here).
SITE_CSS_LINK = (
    '<link rel="stylesheet" '
    'href="https://vibingon.earth/theme/css/style.css">'
)


@app.post("/preview")
def preview(req: PreviewRequest):
    try:
        body_html = _render(req.body, req.frontmatter)
    except Exception as e:
        return {"error": str(e), "type": type(e).__name__}, 500
    # Wrap in the same layout containers the public site uses so styles
    # that depend on .body, .body_resize, .single-column, etc. apply.
    html = (
        SITE_CSS_LINK
        + '<div class="body"><div class="body_resize"><div class="single-column">'
        + body_html
        + '</div></div></div>'
    )
    return {"html": html}
