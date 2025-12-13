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

def _flush_bracket_buffer(soup, new_content, buffer_elements):
    """Merges text from buffered elements and appends a single music cue block."""
    if not buffer_elements:
        return

    full_text_parts = []
    for el in buffer_elements:
        txt = el.get_text(strip=True)
        if txt:
            full_text_parts.append(txt)
            
    if not full_text_parts:
        return
        
    merged_text = " ".join(full_text_parts)
    
    div = soup.new_tag("div", **{"class": "music-cue"})
    div['style'] = "font-style: italic;"
    
    p = soup.new_tag("p")
    
    # Check for Speaker/Label pattern (e.g. "MUSIC:", "CUTAWAY MUSIC:")
    # Using a slightly broader pattern to catch caps-heavy labels
    speaker_pattern = re.compile(r'^\s*([A-Z][A-Z\s]+):')
    match = speaker_pattern.match(merged_text)
    
    if match:
        label = match.group(1)
        rest = merged_text[match.end():]
        
        span = soup.new_tag("span", **{"class": "speaker"})
        span.string = f"{label}:"
        
        p.append(span)
        p.append(rest)
    else:
        p.string = merged_text
        
    div.append(p)
    
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
