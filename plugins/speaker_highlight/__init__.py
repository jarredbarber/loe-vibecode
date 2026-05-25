import re
from pelican import signals
from bs4 import BeautifulSoup
import itertools

def process_transcript(content):
    if not content._content:
        return

    soup = BeautifulSoup(content._content, 'html.parser')
    
    # Check if we have any speaker tags to process
    # We look for paragraphs starting with "NAME:"
    # Allow for leading whitespace just in case
    speaker_pattern = re.compile(r'^\s*([A-Z][A-Z\s]+):')
    
    # We will iterate through the children of the soup (body)
    # The structure is usually flat <p> elements at the root level of content
    
    # We need to construct a new soup or modify structure in place.
    # Modifying list while iterating is tricky. Let's build a new list of elements.
    
    # Assuming direct children of soup are what we want.
    # Note: BeautifulSoup parser might add <html><body> tags if not present?
    # Usually content._content is a fragment. 'html.parser' keeps it as fragment if simple.
    
    new_content = soup.new_tag("div") # Just a wrapper to hold new structure
    
    current_block = None
    in_speaker_section = False
    
    # State for bracketed music/cutaway blocks
    in_bracket_block = False
    bracket_buffer = [] # Store elements to merge
    
    # Use list(soup.children) to iterate over static list
    for element in list(soup.children):
        if element.name is None:
             if current_block:
                 current_block.append(element)
             elif in_bracket_block:
                 # Ignore whitespace/text nodes while buffering bracket block
                 # (We will merge valid text later)
                 pass
             else:
                 new_content.append(element)
             continue

        text_content = element.get_text()
        stripped_text = text_content.strip()
        
        is_bracket_start = element.name == 'p' and stripped_text.startswith('[') and not in_bracket_block
        
        if is_bracket_start:
            current_block = None
            bracket_buffer = []
            
            # Clean start
            _clean_brackets(element, start=True, end=False)
            
            # Check single line case
            if stripped_text.endswith(']'):
                _clean_brackets(element, start=False, end=True)
                bracket_buffer.append(element)
                _flush_bracket_buffer(soup, new_content, bracket_buffer)
                bracket_buffer = []
            else:
                in_bracket_block = True
                bracket_buffer.append(element)
            continue
                
        if in_bracket_block:
            # Check for termination
            if stripped_text.endswith(']'):
                in_bracket_block = False
                _clean_brackets(element, start=False, end=True)
                bracket_buffer.append(element)
                _flush_bracket_buffer(soup, new_content, bracket_buffer)
                bracket_buffer = []
            else:
                bracket_buffer.append(element)
            continue

        # Check for new speaker
        # Use .get_text() to be safer than .string, but we still need to insert carefully.
        # For now, sticking to simple matching for the "Name:" detection
        is_speaker_start = element.name == 'p' and speaker_pattern.match(text_content)
        
        if is_speaker_start:
            # Start of a new speaker block
            in_speaker_section = True
            current_block = soup.new_tag("div", **{"class": "transcript-block"})
            new_content.append(current_block)
            
            # Highlight the speaker name
            match = speaker_pattern.match(text_content)
            name = match.group(1)
            
            if element.string:
                rest = element.string[match.end():]
                element.clear()
                span = soup.new_tag("span", **{"class": "speaker"})
                span.string = f"{name}:"
                element.append(span)
                element.append(rest)
            else:
                if element.contents and isinstance(element.contents[0], str):
                     first_text = element.contents[0]
                     if first_text.startswith(f"{name}:"):
                         element.contents[0].replace_with(first_text[len(name)+1:])
                         span = soup.new_tag("span", **{"class": "speaker"})
                         span.string = f"{name}:"
                         element.insert(0, span)

            current_block.append(element)
            
        elif in_speaker_section:
            # Check for images/iframes/figures which should break the block
            is_media = element.find('img') or element.find('iframe') or element.name in ['img', 'iframe', 'figure']
            is_break = element.name in ['h1', 'h2', 'h3', 'section']
            
            if is_break:
                in_speaker_section = False
                current_block = None
                new_content.append(element)
            elif is_media:
                current_block = None
                
                # Check if this is a standalone image paragraph we can caption
                # We target <p><img></p> where text content is empty/whitespace
                converted_to_figure = False
                
                if element.name == 'p':
                    # Check if it has an image and effectively no text
                    img = element.find('img')
                    if img and not element.get_text(strip=True):
                        # Use valid text from alt attribute
                        alt_text = img.get('alt', '').strip()
                        if alt_text:
                            figure = soup.new_tag("figure")
                            
                            # Move the image
                            figure.append(img)
                            
                            figcaption = soup.new_tag("figcaption")
                            figcaption.string = alt_text
                            figure.append(figcaption)
                            
                            new_content.append(figure)
                            converted_to_figure = True
                
                if not converted_to_figure:
                     new_content.append(element)

            else:
                # Valid text content for the block
                # Ensure we have a block
                if current_block is None:
                    current_block = soup.new_tag("div", **{"class": "transcript-block"})
                    new_content.append(current_block)
                current_block.append(element)
                
        else:
            # Not in a block (header content before transcript starts)
            new_content.append(element)

    content._content = new_content.decode_contents()

_URL_RE = re.compile(r'(https?://[^\s\]\)<>"\']+)')
# macaulaylibrary.org/audio/<id>  OR  /asset/<id>  → Cornell asset id
_MACAULAY_RE = re.compile(r'https?://(?:www\.)?macaulaylibrary\.org/(?:audio|asset)/(\d+)', re.I)
_SPEAKER_RE = re.compile(r'^\s*([A-Z][A-Z\s]+):')


def _flush_bracket_buffer(soup, new_content, buffer_elements):
    """Append a styled music-cue block. When the cue contains URLs, restructure
    as one card per URL with the label and any duration ("0.07-.10") shown as
    captions above an inline <audio> player. When it has no URLs, render the
    text as before."""
    if not buffer_elements:
        return

    full_text_parts = []
    for el in buffer_elements:
        txt = el.get_text(strip=True)
        if txt:
            full_text_parts.append(txt)
    if not full_text_parts:
        return
    merged_text = " ".join(full_text_parts).strip()

    div = soup.new_tag("div", **{"class": "music-cue"})
    urls = list(_URL_RE.finditer(merged_text))

    if not urls:
        p = soup.new_tag("p")
        match = _SPEAKER_RE.match(merged_text)
        if match:
            span = soup.new_tag("span", **{"class": "speaker"})
            span.string = f"{match.group(1)}:"
            p.append(span)
            p.append(merged_text[match.end():])
        else:
            p.string = merged_text
        div.append(p)
        new_content.append(div)
        return

    # Each URL becomes one item with a label and (optional) duration.
    # Text BEFORE the first URL → labels[0].
    # Text AFTER the last URL  → durations[-1].
    # Text between URL[i] and URL[i+1] → split on the first ';':
    #   left of ; is durations[i]; right of ; is labels[i+1].
    # The semicolon is BirdNote's separator in compound cues like
    #   "...Grosbeak, http://...106598, 0.07-.10; House Wren, http://...144011, ..."
    labels = [''] * len(urls)
    durations = [''] * len(urls)
    labels[0] = merged_text[:urls[0].start()].strip(" ,;[]")
    for i in range(len(urls) - 1):
        gap = merged_text[urls[i].end():urls[i + 1].start()]
        left, _, right = gap.partition(';')
        durations[i] = left.strip(" ,;[]")
        labels[i + 1] = right.strip(" ,;[]")
    durations[-1] = merged_text[urls[-1].end():].strip(" ,;[]")

    items_container = soup.new_tag("div", **{"class": "music-cue-items"})
    for i, m in enumerate(urls):
        url = m.group(1).rstrip('.,;:')
        label = labels[i]
        duration = durations[i]

        item = soup.new_tag("div", **{"class": "music-cue-item"})

        meta = soup.new_tag("div", **{"class": "music-cue-meta"})
        if label:
            lab = soup.new_tag("div", **{"class": "music-cue-label"})
            lab.string = label
            meta.append(lab)
        if duration:
            dur = soup.new_tag("div", **{"class": "music-cue-duration"})
            dur.string = duration
            meta.append(dur)
        item.append(meta)

        ml = _MACAULAY_RE.match(url)
        if ml:
            asset_id = ml.group(1)
            mp3 = f"https://cdn.download.ams.birds.cornell.edu/api/v1/asset/{asset_id}/audio"
            audio = soup.new_tag("audio", controls="", preload="none", src=mp3)
            audio["class"] = "music-cue-audio"
            item.append(audio)
        else:
            a = soup.new_tag("a", href=url, target="_blank", rel="noopener")
            a["class"] = "music-cue-link"
            a.string = url
            item.append(a)

        items_container.append(item)

    div.append(items_container)
    new_content.append(div)


def _clean_brackets(element, start=False, end=False):
    """Helper to strip leading [ and trailing ] from text nodes."""
    if not element.contents:
        return
        
    if start:
        # Loop to find first string content
        for i, child in enumerate(element.contents):
            if isinstance(child, str):
                cleaned = child.lstrip()
                if cleaned.startswith('['):
                    # Replace regex to remove first [
                    # Be careful only to replace the first char found
                    new_text = cleaned.replace('[', '', 1)
                    element.contents[i].replace_with(new_text)
                break
                
    if end:
         # Loop backwards
        for i in range(len(element.contents) - 1, -1, -1):
            child = element.contents[i]
            if isinstance(child, str):
                cleaned = child.rstrip()
                if cleaned.endswith(']'):
                    # Replace last char
                    # Use rsplit or just string slicing if we trust it's at the end
                    # Regex is safer to handle whitespace
                    new_text = re.sub(r'\]\s*$', '', child)
                    element.contents[i].replace_with(new_text)
                break

def register():
    signals.content_object_init.connect(process_transcript)
