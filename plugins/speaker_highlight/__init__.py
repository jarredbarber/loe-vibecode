"""
Post-render content transformer for transcript pages. Does three things:

  1. Highlight "NAME:" speaker labels at the start of <p> tags by wrapping the
     label in <span class="speaker">.
  2. Group consecutive speaker paragraphs into <div class="transcript-block">
     for shared styling.
  3. Convert standalone <p><img alt="..."></p> paragraphs to <figure> blocks
     with a <figcaption> from the alt text. (The ingest pipeline stuffs photo
     captions into the alt text — see `inlineImageCaptions` there.)

Music cues used to live in this plugin too as a bracket-buffer state machine;
that was retired in favor of {% audio %} / {% cue %} shortcodes handled by the
`shortcodes` plugin. Ingest converts bracketed source HTML into those tags at
parse time. See INGEST.md.
"""

import re
from pelican import signals
from bs4 import BeautifulSoup

# Speaker labels look like CURWOOD:, O'NEILL:, McKIBBEN:, MacKENZIE:, DR. SMITH:,
# WOMAN 1:, etc. Allow:
#   - apostrophes (straight + curly) inside the label
#   - up to 2 lowercase letters between caps (Mc, Mac, Di, Van prefixes)
#   - digits, spaces, periods
# Reject sentence-case ("The President:") because runs of >2 lowercase letters
# don't match.
_SPEAKER_RE = re.compile(r"^\s*([A-Z](?:[A-Z'’\d\s.]|[a-z]{1,2}(?=[A-Z]))+):")


def process_transcript(content):
    if not content._content:
        return

    soup = BeautifulSoup(content._content, 'html.parser')
    new_content = soup.new_tag("div")

    current_block = None
    in_speaker_section = False

    for element in list(soup.children):
        if element.name is None:
            if current_block:
                current_block.append(element)
            else:
                new_content.append(element)
            continue

        text_content = element.get_text()
        is_speaker_start = element.name == 'p' and _SPEAKER_RE.match(text_content)

        if is_speaker_start:
            in_speaker_section = True
            current_block = soup.new_tag("div", **{"class": "transcript-block"})
            new_content.append(current_block)
            _highlight_speaker(soup, element)
            current_block.append(element)

        elif in_speaker_section:
            is_media = element.find('img') or element.find('iframe') or element.name in ['img', 'iframe', 'figure']
            is_break = element.name in ['h1', 'h2', 'h3', 'section']

            if is_break:
                in_speaker_section = False
                current_block = None
                new_content.append(element)
            elif is_media:
                current_block = None
                _emit_image(soup, new_content, element)
            else:
                if current_block is None:
                    current_block = soup.new_tag("div", **{"class": "transcript-block"})
                    new_content.append(current_block)
                current_block.append(element)

        else:
            new_content.append(element)

    content._content = new_content.decode_contents()


def _highlight_speaker(soup, element):
    """Wrap a leading 'NAME:' in <span class="speaker">."""
    text_content = element.get_text()
    match = _SPEAKER_RE.match(text_content)
    if not match:
        return
    name = match.group(1)

    if element.string:
        rest = element.string[match.end():]
        element.clear()
        span = soup.new_tag("span", **{"class": "speaker"})
        span.string = f"{name}:"
        element.append(span)
        element.append(rest)
    elif element.contents and isinstance(element.contents[0], str):
        first_text = element.contents[0]
        if first_text.startswith(f"{name}:"):
            element.contents[0].replace_with(first_text[len(name) + 1:])
            span = soup.new_tag("span", **{"class": "speaker"})
            span.string = f"{name}:"
            element.insert(0, span)


def _emit_image(soup, parent, element):
    """If a <p> contains nothing but an <img alt="..."> with non-empty alt,
    convert it to <figure><img><figcaption>...</figcaption></figure>."""
    if element.name == 'p':
        img = element.find('img')
        if img and not element.get_text(strip=True):
            alt_text = img.get('alt', '').strip()
            if alt_text:
                figure = soup.new_tag("figure")
                figure.append(img)
                figcaption = soup.new_tag("figcaption")
                figcaption.string = alt_text
                figure.append(figcaption)
                parent.append(figure)
                return
    parent.append(element)


def register():
    signals.content_object_init.connect(process_transcript)
