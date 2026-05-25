"""
Liquid-style shortcodes for Living on Earth content.

Authors write tags inline in markdown:

    {% audio src="https://example.org/clip.mp3" label="Wren" duration="0:00-0:30" %}

The plugin makes no assumptions about audio hosts — `src` is whatever URL the
author or ingest pipeline pasted. Tag expansion runs after Python-Markdown so
the curly braces pass through untouched; the regex replaces the enclosing <p>
to keep the result valid block-level HTML.

Adding a new tag = adding a function to TAG_HANDLERS that takes a dict of
parsed args and returns an HTML string.
"""

import re
from pelican import signals

# Matches `{% tag arg1=... arg2=... %}` whether wrapped in a paragraph or not.
_BLOCK_RE = re.compile(
    r'<p>\s*\{%\s*(\w+)\s+(.*?)\s*%\}\s*</p>',
    re.DOTALL,
)
_INLINE_RE = re.compile(r'\{%\s*(\w+)\s+(.*?)\s*%\}', re.DOTALL)

# key=value where value is "double quoted" | 'single quoted' | bare-word
_ARG_RE = re.compile(
    r'''(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))''',
)


def _parse_args(s):
    args = {}
    for m in _ARG_RE.finditer(s):
        args[m.group(1)] = next((g for g in m.groups()[1:] if g is not None), '')
    return args


# ----- audio --------------------------------------------------------------

def render_audio(args):
    src = args.get('src', '').strip()
    if not src:
        return ''
    label = args.get('label', '').strip()
    duration = (args.get('duration') or args.get('time') or '').strip()

    meta_html = ''
    if label or duration:
        bits = ['<div class="music-cue-meta">']
        if label:
            bits.append(f'<div class="music-cue-label">{label}</div>')
        if duration:
            bits.append(f'<div class="music-cue-duration">{duration}</div>')
        bits.append('</div>')
        meta_html = ''.join(bits)

    player_html = (
        '<div class="mcp">'
        '<button class="mcp-play" type="button" aria-label="Play">▶</button>'
        '<div class="mcp-progress"><div class="mcp-fill"></div></div>'
        '<span class="mcp-time">0:00</span>'
        f'<audio class="mcp-audio" preload="none" src="{src}"></audio>'
        '</div>'
    )

    return (
        '<div class="music-cue">'
        '<div class="music-cue-item">'
        f'{meta_html}{player_html}'
        '</div>'
        '</div>'
    )


TAG_HANDLERS = {
    'audio': render_audio,
}


# ----- pelican wiring -----------------------------------------------------

def _expand(html):
    def block_repl(m):
        tag, body = m.group(1), m.group(2)
        handler = TAG_HANDLERS.get(tag)
        if not handler:
            return m.group(0)
        return handler(_parse_args(body))

    def inline_repl(m):
        # Inline (non-paragraph-wrapped) tags become spans of inline HTML.
        # We currently only have block-style tags, but leave the hook open.
        tag, body = m.group(1), m.group(2)
        handler = TAG_HANDLERS.get(tag)
        if not handler:
            return m.group(0)
        return handler(_parse_args(body))

    html = _BLOCK_RE.sub(block_repl, html)
    html = _INLINE_RE.sub(inline_repl, html)
    return html


def _on_content(content):
    if not content._content:
        return
    content._content = _expand(content._content)


def register():
    signals.content_object_init.connect(_on_content)
