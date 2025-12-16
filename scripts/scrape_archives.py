import urllib.request
from bs4 import BeautifulSoup
import re
import ssl
import os
from datetime import datetime
from bs4 import Comment

block_tags = ['p', 'div', 'blockquote', 'figure', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']

def process_children_to_markdown(children):
    parts = []
    children = list(children)
    i = 0
    while i < len(children):
        child = children[i]
        
        # Check for Image to see if we can merge a caption
        is_image = False
        img_node = None
        if hasattr(child, 'name') and child.name == 'img':
            is_image = True
            img_node = child
        
        if is_image and img_node:
            src = img_node.get('src', '')
            if src:
                # Resolve relative URLs
                if src.startswith('/'):
                    src = f"https://loe.org{src}"
                elif not src.startswith('http'):
                    src = f"https://loe.org/shows/{src}"
                
                caption_text = ""
                
                # Look ahead for caption
                lookahead_idx = i + 1
                while lookahead_idx < len(children):
                     next_elem = children[lookahead_idx]
                     next_md = element_to_markdown(next_elem).strip()
                     
                     if not next_md:
                         lookahead_idx += 1
                         continue
                     
                     # Heuristic for caption
                     if len(next_md) < 600 and ("Photo" in next_md or "Credit" in next_md or next_md.startswith('*')):
                         caption_text = next_md
                         
                         # Normalize caption
                         if caption_text.startswith('*') and caption_text.endswith('*'):
                             caption_text = caption_text[1:-1]
                         caption_text = caption_text.replace('\n', ' ').replace('[', '(').replace(']', ')')
                         
                         i = lookahead_idx
                         break
                     else:
                         break
                
                parts.append(f"\n\n![{caption_text}]({src})\n\n")
                i += 1
                continue
        
        # Helper to get markdown of a child
        child_md = element_to_markdown(child)
        parts.append(child_md)
        i += 1
        
    return "".join(parts)

def element_to_markdown(element):
    if element is None: return ""
    
    # Skip comments
    if isinstance(element, Comment):
        return ""
        
    # Handle NavigableString
    if isinstance(element, str): # NavigableString inherits from str
        if element.strip() == "": return str(element) # Keep significant whitespace?
        return str(element)
        
    # Check if it's a tag
    if not hasattr(element, 'name'):
        return str(element)
        
    # Skip noise tags
    if element.name in ['script', 'style', 'noscript']:
        return ""
        
    # Handle Links
    if element.name == 'a':
        href = element.get('href', '')
        text = process_children_to_markdown(element.children).strip()
        if not text: return "" # Skip empty links
        
        # Resolve relative URLs
        if href.startswith('/'):
            href = f"https://loe.org{href}"
        return f"[{text}]({href})"
        
    # Handle Images (Standalone check, usually handled by process_children)
    if element.name == 'img':
        src = element.get('src', '')
        alt = element.get('alt', '')
        if src:
            if src.startswith('/'):
                 src = f"https://loe.org{src}"
            elif not src.startswith('http'):
                 src = f"https://loe.org/shows/{src}"
            return f"\n\n![{alt}]({src})\n\n"
        return ""
        
    # Formatting
    inner_text = process_children_to_markdown(element.children)
    
    if element.name == 'p':
        return f"\n\n{inner_text.strip()}\n\n"
    if element.name == 'br':
        return "\n\n"
    if element.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
        level = int(element.name[1])
        return f"\n{'#' * level} {inner_text.strip()}\n\n"
    if element.name in ['em', 'i', 'cite']:
        prefix = " " if inner_text.startswith(" ") else ""
        suffix = " " if inner_text.endswith(" ") else ""
        return f"{prefix}*{inner_text.strip()}*{suffix}"
    if element.name in ['strong', 'b']:
        prefix = " " if inner_text.startswith(" ") else ""
        suffix = " " if inner_text.endswith(" ") else ""
        return f"{prefix}**{inner_text.strip()}**{suffix}"
    
    if element.name in block_tags:
        return f"\n\n{inner_text.strip()}\n\n"
    
    # Inline tags just pass through text
    return inner_text

# Bypass SSL verification
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE_URL = "https://loe.org"
SHOWS_URL = f"{BASE_URL}/shows/"

def get_soup(url):
    print(f"Fetching {url}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx) as response:
            html = response.read()
            return BeautifulSoup(html, 'html.parser')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def find_latest_year_url():
    soup = get_soup(SHOWS_URL)
    if not soup:
        return None
    
    # Find links to year TOCs (toc.html?year=XXXX)
    # We want the most recent year (likely the first one or max year)
    years = []
    for a in soup.find_all('a', href=True):
        href = a['href']
        if 'toc.html?year=' in href:
            match = re.search(r'year=(\d{4})', href)
            if match:
                years.append((int(match.group(1)), href))
    
    if not years:
        return None
        
    # Sort by year descending
    years.sort(key=lambda x: x[0], reverse=True)
    latest_year_url = years[0][1]
    
    if not latest_year_url.startswith('http'):
        latest_year_url = f"{BASE_URL}/shows/{latest_year_url}"
        
    return latest_year_url

def find_latest_show_url(year_url):
    soup = get_soup(year_url)
    if not soup:
        return None
        
    # Find links to shows (segments.html?programID=...)
    # usually in a list. We want the first one that looks like a show link.
    # Note: sometimes they link to 'shows.html' or 'segments.html'
    
    for a in soup.find_all('a', href=True):
        href = a['href']
        if 'programID=' in href and 'segments.html' in href:
            # Check if it has a segmentID (we want the main show page, usually no segmentID or segmentID=1?)
            # Actually, usually there's a main link.
            # Let's just take the first 'segments.html?programID=' link we find, 
            # assuming the list is reverse chronological (standard for blogs/archives)
            
            # Use regex to ensure we don't pick up a sub-segment if possible, 
            # though usually the main link is first.
            if '&segmentID=' not in href:
                 full_url = href
                 if not full_url.startswith('http'):
                     full_url = f"{BASE_URL}/shows/{full_url}"
                 return full_url
                 
            # If all have segmentID, finding the one with segmentID=1 or just the bare one
            # The previous manual check showed 'shows.html?programID=...' and 'segments.html?programID=...&segmentID=...'
            # Let's look for shows.html or segments.html without segmentID
            
    # Second pass: look for shows.html?programID=
    for a in soup.find_all('a', href=True):
        href = a['href']
        if 'programID=' in href and 'shows.html' in href:
             full_url = href
             if not full_url.startswith('http'):
                 full_url = f"{BASE_URL}/shows/{full_url}"
             return full_url

    return None

def extract_metadata(soup):
    metadata = {}
    
    # Title and Date
    # Usually <h2>Living on Earth: December 5, 2025</h2> or similar
    h2 = soup.find('h2')
    if h2:
        text = h2.get_text(strip=True)
        # Try to parse date
        # "Living on Earth: Month Day, Year"
        # "Air Date: Week of Month Day, Year"
        date_match = re.search(r'([A-Z][a-z]+ \d{1,2}, \d{4})', text)
        if date_match:
            metadata['date_str'] = date_match.group(1)
            try:
                dt = datetime.strptime(metadata['date_str'], '%B %d, %Y')
                metadata['date'] = dt.strftime('%Y-%m-%d')
                metadata['year'] = dt.strftime('%Y')
                metadata['month_day'] = dt.strftime('%m-%d')
            except:
                metadata['date'] = '2025-01-01' # Fallback
        else:
            # Try finding "Air Date: ..." paragraph
            for p in soup.find_all('p'):
                if 'Air Date:' in p.get_text():
                    date_match = re.search(r'([A-Z][a-z]+ \d{1,2}, \d{4})', p.get_text())
                    if date_match:
                        metadata['date_str'] = date_match.group(1)
                        try:
                            dt = datetime.strptime(metadata['date_str'], '%B %d, %Y')
                            metadata['date'] = dt.strftime('%Y-%m-%d')
                            metadata['year'] = dt.strftime('%Y')
                            metadata['month_day'] = dt.strftime('%m-%d')
                        except:
                             metadata['date'] = '2025-01-01'
                    break
    
    if 'date' not in metadata:
        metadata['date'] = datetime.now().strftime('%Y-%m-%d') # Fallback
        metadata['year'] = datetime.now().strftime('%Y')
        metadata['month_day'] = datetime.now().strftime('%m-%d')

    metadata['title'] = f"Living on Earth: {metadata.get('date_str', metadata['date'])}"
    
    # Megaphone ID (Main player)
    iframe = soup.find('iframe', src=re.compile(r'megaphone\.fm'))
    if iframe:
        src = iframe['src']
        match = re.search(r'e=([A-Z0-9]+)', src)
        if match:
            metadata['megaphone_id'] = match.group(1)
            
    # Image
    left_div = soup.find('div', class_='left')
    if left_div:
        img = left_div.find('img')
        if img:
            src = img.get('src')
            if src and not src.endswith('gif'):
                 if not src.startswith('http'):
                     src = f"{BASE_URL}/{src.lstrip('/')}"
                 metadata['image_url'] = src
                 # Caption
                 parent = img.find_parent()
                 if parent:
                      # Try to find text next to image? Or usually the text content of the parent or next sibling
                      # In LOE structure, often the text is just there. 
                      # Let's grab the text of the paragraph containing the image
                      caption_text = parent.get_text(strip=True)
                      if len(caption_text) < 300: # Heuristic
                          metadata['image_caption'] = caption_text

    # Summary: First substantial paragraph in .left that isn't the date or image caption
    if left_div:
         # Use markdown processing to preserve formatting (italics)
         for p in left_div.find_all('p'):
             # Get markdown text
             md_text = element_to_markdown(p).strip()
             # Simple formatting strip for checking content
             plain_text = md_text.replace('*', '').replace('[', '').replace(']', '').replace('(', '').replace(')', '')
             
             if len(plain_text) > 60 and "Air Date:" not in plain_text and "Photo:" not in plain_text:
                 # Flatten newlines for summary field
                 metadata['summary'] = md_text.replace('\n', ' ').strip()
                 break
                 
    return metadata

def extract_segments(soup):
    segments = []
    # Segments are usually <h3><a href="segments.html?...">Title</a></h3>
    for h3 in soup.find_all('h3'):
        a = h3.find('a')
        if a and 'segments.html' in a['href']:
            seg_ur = a['href']
            if not seg_ur.startswith('http'):
                seg_ur = f"{BASE_URL}/shows/{seg_ur.lstrip('/')}" if not seg_ur.startswith('/') else f"{BASE_URL}{seg_ur}"
            
            segments.append({
                'title': a.get_text(strip=True),
                'url': seg_ur
            })
    return segments

def parse_segment_page(url, show_metadata=None, title_hint=None):
    soup = get_soup(url)
    if not soup:
        return None
    
    data = {}
    
    # Title
    # Try H3 first as it's often the real title on segment pages
    h3 = soup.find('h3')
    if h3:
        data['title'] = h3.get_text(strip=True)
    else:
        # Fallback to H2
        h2 = soup.find('h2')
        if h2:
             data['title'] = h2.get_text(strip=True)
    
    # Check for "Air Date" in title and clean logic
    if not data.get('title') or 'Air Date:' in data['title']:
        # If we have a hint from the show page, prefer it
        if title_hint and len(title_hint) > 5:
            data['title'] = title_hint
        elif data.get('title'):
             # Try to clean it
             # Remove "Air Date: ..." prefix
             data['title'] = re.sub(r'Air Date:.*?\d{4}', '', data['title']).strip()
             
    data['slug'] = slugify(data.get('title', 'segment'))
    iframe = soup.find('iframe', src=re.compile(r'megaphone\.fm'))
    if iframe:
        src = iframe['src']
        match = re.search(r'e=([A-Z0-9]+)', src)
        if match:
            data['megaphone_id'] = match.group(1)
            
    # Image & Content
    left_div = soup.find('div', class_='left')
    content_parts = []
    
    if left_div:
        # Image
        img = left_div.find('img')
        if img:
            src = img.get('src')
            if src and not src.endswith('gif'):
                 if not src.startswith('http'):
                     src = f"{BASE_URL}/{src.lstrip('/')}"
                 data['image_url'] = src
        
        # Transcript / Content
        # Everything after the header/image. 
        # LOE structure usually has <p> tags.
        # We want to capture the text.
        
        # Transcript / Content
        # Clean up soup first
        for tag in left_div.find_all(['script', 'style']):
            tag.decompose()
        for div in left_div.find_all('div', class_='clr'):
            div.decompose()
            
        content_parts = []


        # Main processing call using the smart function
        # We process top-level children of the div
        full_text = process_children_to_markdown([c for c in left_div.children if c.name not in ['script', 'style']])

        print(f"Full Text Length before split: {len(full_text)}")
        print(f"Full Text Preview: {full_text[:500]}")
        print(f"Full Text End Preview: {full_text[-500:]}")
        
        # Eliminate excessive newlines
        full_text = re.sub(r'\n{3,}', '\n\n', full_text)
        
        # Stop at Links (Robust check)
        # Look for "Links" or "Related links" on its own line or header
        # regex to找 lines that contain only "Links" or "Related links" (surrounded by newlines)
        footer_patterns = [
            r'\n\s*Links\s*\n',
            r'\n\s*Related links\s*\n',
            r'\n\s*\*\*Links\*\*\s*\n', # Markdown bold
            r'\n\s*##\s*Links\s*\n',
            r'\n\s*###\s*Links\s*\n',
            r'\n\s*Links\s*:'
        ]
        
        min_footer_idx = -1
        
        for pat in footer_patterns:
            match = re.search(pat, full_text, flags=re.IGNORECASE)
            if match:
                idx = match.start()
                # We want the footer that is near the end, but extraction logic is sequential.
                # If we find "Links", that's likely the start of the footer.
                # However, ensure we don't match something early in the text. 
                # Footer is usually in the last 20%? or just trust the markers.
                # "Links" is pretty specific in this context.
                if min_footer_idx == -1 or idx < min_footer_idx:
                    min_footer_idx = idx
        
        if min_footer_idx != -1:
             # Check if the match was a "Links" section we want to KEEP but reformat
             # If we matched "Links", instead of cutting, let's normalize the header
             # and potentially cut AFTER it if we find a *true* footer (like copyright)
             
             # Extract the matched text to see what it was
             # Actually, regex matched at min_footer_idx.
             # We can just check if "Links" patterns match near that index?
             # Simplification: Just Rename known Links headers to ## Related Links and DON'T cut.
             pass
        
        # --- LINKS FORMATTING ---
        # Normalize various "Links" headers to "## Related Links"
        # Patterns: Links:, ### Links, **Links**, etc.
        # We replace them and ensure newlines
        link_header_patterns = [
            r'\n\s*Links\s*\n',
            r'\n\s*Related links\s*\n',
            r'\n\s*\*\*Links\*\*\s*\n',
            r'\n\s*##\s*Links\s*\n',
            r'\n\s*###\s*Links\s*\n',
            r'\n\s*Links\s*:'
        ]
        
        for pat in link_header_patterns:
            # We use sub with a count=1 to only replace the first/main one found (usually at bottom)
            # Replace with standard header
            full_text = re.sub(pat, '\n\n## Related Links\n\n', full_text, count=1, flags=re.IGNORECASE)

        # --- REAL FOOTER REMOVAL ---
        # Now cut actual garbage if it exists (e.g., "Living on Earth is an independent...")
        # Add patterns as needed based on observation.
        # For now, we assume the content ends with links or reasonable text.
        
        # if min_footer_idx != -1:
        #      print(f"Cutting footer at index {min_footer_idx}")
        #      full_text = full_text[:min_footer_idx]
        
        # --- CLEANUP & EXTRACTION ---
        
        # 1. Remove "Air Date" lines (Handle ## header prefix)
        #    Pattern: (## )?Air Date: Week of [Date](link)
        full_text = re.sub(r'^\s*(?:##\s*)?Air Date:.*?\n+', '', full_text, flags=re.IGNORECASE).strip()

        # 2. HEADER IMAGE EXTRACTION
        # Look for the first image at the start of the content (now that Air Date is gone)
        # Pattern: Optional whitespace, then ![Caption](Src)
        header_img_match = re.search(r'^\s*!\[(.*?)\]\((.*?)\)', full_text, flags=re.DOTALL)
        if header_img_match:
            img_caption = header_img_match.group(1).strip()
            img_src = header_img_match.group(2).strip()
            
            # Remove from content
            full_text = full_text.replace(header_img_match.group(0), "", 1).strip()
            
            # Check for DETACHED caption (often in *Italics*) immediately following
            # Pattern: Starts with * and ends with * (or contains Photo:)
            # Look at start of remaining text
            detached_cap_match = re.search(r'^\s*(\*[^*]+\*)\n+', full_text, flags=re.DOTALL)
            if detached_cap_match:
                possible_caption = detached_cap_match.group(1).strip()
                if "Photo:" in possible_caption or len(possible_caption) < 500:
                    img_caption = possible_caption.strip('*').strip() # Clean italics markers
                    # Remove this caption block
                    full_text = full_text.replace(detached_cap_match.group(0), "", 1).strip()
            
            # Update metadata
            data['image_url'] = img_src
            data['image_caption'] = img_caption

        # 3. SUMMARY EXTRACTION
        # Extract Summary from the first bolded paragraph **...**
        # Search somewhat flexibly in the first 2000 chars
        clean_summary = ""
        summary_limit_text = full_text[:3000] 
        summary_match = re.search(r'\*\*(.*?)\*\*', summary_limit_text, flags=re.DOTALL)
        
        if summary_match:
            raw_summary = summary_match.group(1).strip()
            # Remove markdown internal markup if any
            clean_summary = raw_summary.replace('*', '').replace('\n', ' ')
            
            # If summary is reasonably long, use it
            if len(clean_summary) > 20: 
                 data['summary'] = clean_summary
                 print(f"DEBUG: Extracted Summary from bold text: {clean_summary[:30]}...")
                 # Remove the bold summary block from the content
                 full_text = full_text.replace(summary_match.group(0), "", 1).strip()
        
        # If no bold summary, try the first paragraph if it's not a header
        if not data.get('summary') or len(data['summary']) < 10:
             first_para_match = re.search(r'^\s*([^#\n].*?)(\n\n|$)', full_text, flags=re.DOTALL)
             if first_para_match:
                 candidate = first_para_match.group(1).strip()
                 if len(candidate) > 50:
                     data['summary'] = candidate.replace('\n', ' ')
                     print(f"DEBUG: Extracted Summary from first para: {candidate[:30]}...")
                     # Optional: decide if we want to remove the first para if it's used as summary. 
                     # Usually for standard articles, the first para IS the content, so maybe keep it?
                     # But for LOE style, the bold text is a lead-in summary.
                     # Let's keep first para if it wasn't bold.

        # Filter noise lines if they remain
        clean_lines = []
        for line in full_text.split('\n'):
             # Only drop if it's a short line containing the noise
             if "Please enable JavaScript" in line and len(line) < 300: 
                 continue
             clean_lines.append(line)
        full_text = "\n".join(clean_lines)

        # Format "Transcript" as a header ONLY if it isn't already one
        # Use regex to check if it already has ##
        if not re.search(r'#+\s*Transcript', full_text):
            if "Transcript\n" in full_text:
                 full_text = full_text.replace("Transcript\n", "## Transcript\n")
            elif "\nTranscript" in full_text:
                 full_text = full_text.replace("\nTranscript", "\n## Transcript")

        # Post-process content to ensure speakers are separated
        # Add newlines before Speakers to ensure they start a paragraph
        # Pattern: Newline (or start) + NAME:
        # Use \b to ensure we match whole words (MCKIBBEN not cKibben)
        # BUT don't match if preceded by apostrophe (to preserve O'NEILL:)
        full_text = re.sub(r"(?<!\n\n)(?<!['\u2019'])(\b[A-Z]+):", r'\n\n\1:', full_text)
        
        # NOW fix broken speaker names like "O'" on one line, "NEILL:" on next
        # This must run AFTER the speaker separation above
        # The apostrophe might be different character encodings (' vs ')
        lines = full_text.split('\n')
        fixed_lines = []
        i = 0
        while i < len(lines):
            line = lines[i]
            # Check if this line looks like an apostrophe fragment (O' or O' etc)
            # Match: optional whitespace, then O, then any apostrophe-like char, then optional whitespace
            if i + 1 < len(lines) and re.match(r"^\s*O[''`´]\s*$", line):
                # Find the next non-empty line
                next_idx = i + 1
                while next_idx < len(lines) and lines[next_idx].strip() == '':
                    next_idx += 1
                
                if next_idx < len(lines):
                    next_line = lines[next_idx]
                    # Combine: remove trailing/leading whitespace and join
                    merged = line.strip() + next_line
                    # Add the merged line
                    fixed_lines.append(merged)
                    # Skip all lines up to and including the merged line
                    i = next_idx + 1
                else:
                    # No non-empty line found, just keep the O'
                    fixed_lines.append(line)
                    i += 1
            else:
                fixed_lines.append(line)
                i += 1
        
        full_text = '\n'.join(fixed_lines)
        
        # Clean up any leading newlines left after removal
        data['content'] = full_text.strip()
    return data

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'\s+', '-', text)
    return text[:50]

def get_show_urls(year_url):
    soup = get_soup(year_url)
    if not soup:
        return []

    show_links = []
    seen_ids = set()

    # Look for program links
    for a in soup.find_all('a', href=True):
        href = a['href']
        if 'programID=' in href:
             # Extract ID to avoid duplicates
             match = re.search(r'programID=([0-9A-Za-z-]+)', href)
             if match:
                 prog_id = match.group(1)
                 if prog_id not in seen_ids:
                     seen_ids.add(prog_id)
                     
                     # Construct full URL
                     if not href.startswith('http'):
                         full_url = f"{BASE_URL}/shows/{href}"
                     else:
                         full_url = href
                     
                     # Prefer segments.html logic if possible, or shows.html
                     # The links in TOC are usually accurate.
                     show_links.append(full_url)

    return show_links

def process_show_page(soup, metadata):
    # Extract segments from the show page soup
    # Look for links that contain segmentID
    segments_list = []
    seen_urls = set()
    
    # The show page has links to its segments
    for a in soup.find_all('a', href=True):
        href = a['href']
        if 'segmentID=' in href:
            if not href.startswith('http'):
                 full_url = f"{BASE_URL}/shows/{href}"
            else:
                 full_url = href
            
            if full_url not in seen_urls:
                seen_urls.add(full_url)
                segments_list.append({
                    'title': a.get_text(strip=True), # TOC text might be "Segment 1" or empty?
                    'url': full_url
                })
    
    # Sort segments by segment ID if possible? 
    # Usually they appear in order.
    
    print(f"Found {len(segments_list)} segments for {metadata['date']}")
    
    # Determine output directory based on date
    # Shows after 2025-10-31 go to content/shows/
    # Earlier shows go to content/_wip/shows/
    show_date = datetime.strptime(metadata['date'], '%Y-%m-%d')
    cutoff_date = datetime(2025, 10, 31)
    
    if show_date > cutoff_date:
        base_dir = "content/shows"
    else:
        base_dir = "content/_wip/shows"
    
    out_dir = f"{base_dir}/{metadata['year']}/{metadata['month_day']}"
    os.makedirs(out_dir, exist_ok=True)
    
    print(f"Output directory: {out_dir}")
    

    
    segment_titles = []
    segment_filenames = []

    for i, seg in enumerate(segments_list):
        seg_url = seg['url']
        seg_title_hint = seg['title']
        print(f"Processing segment {i+1}: {seg_url}")
        
        # We need to parse the segment page
        seg_data = parse_segment_page(seg_url, metadata, title_hint=seg_title_hint)
        
        # Save Segment File
        if seg_data:
             filename = f"{seg_data['slug']}.md"
             filepath = f"{out_dir}/{filename}"
             
             segment_titles.append(seg_data['title'])
             segment_filenames.append(filename)
             
             with open(filepath, 'w') as f:
                 f.write("---\n")
                 f.write(f"title: {seg_data['title']}\n")
                 f.write(f"date: {metadata['date']}\n")
                 f.write("category: Segments\n")
                 if 'megaphone_id' in seg_data:
                     f.write(f"megaphone_id: {seg_data['megaphone_id']}\n")
                 if 'image_url' in seg_data:
                     f.write(f"image_url: {seg_data['image_url']}\n")
                 if 'image_caption' in seg_data:
                     try:
                         f.write(f"image_caption: {seg_data['image_caption']}\n")
                     except Exception as e:
                         print(f"Warning: Issue cleaning caption: {e}")
                         f.write(f"image_caption: \n")
                 if 'summary' in seg_data:
                     try:
                         f.write(f"summary: {seg_data['summary']}\n")
                     except Exception as e:
                         print(f"Warning: Issue cleaning summary: {e}")
                         f.write(f"summary: \n")
                         
                 f.write("---\n\n")
                 f.write(seg_data['content'])

    # Write Show File
    show_filename = "show.md"  # Changed from show-{date}.md to match existing structure
    show_filepath = f"{out_dir}/{show_filename}"
    
    with open(show_filepath, 'w') as f:
        f.write("---\n")
        f.write(f"title: {metadata['title']}\n")
        f.write(f"date: {metadata['date']}\n")
        f.write("category: Shows\n")
        f.write("template: show\n")
        if 'megaphone_id' in metadata:
            f.write(f"megaphone_id: {metadata['megaphone_id']}\n")
        if 'image_url' in metadata:
            f.write(f"image_url: {metadata['image_url']}\n")
        if 'summary' in metadata:
             f.write(f"summary: {metadata['summary']}\n")
             
        # Add segment titles to summary for display? Or handled by template?
        # Template handles segments via links.
        f.write("---\n\n")
        
        # Add Links to Segments
        f.write("## Segments\n\n")
        for title, filename in zip(segment_titles, segment_filenames):
            f.write(f"### [{title}]({{filename}}{filename})\n\n")
            
    print(f"Done! Created files in {out_dir}")

def main(year):
    print(f"Processing year: {year}")
    
    year_url = f"{BASE_URL}/shows/toc.html?year={year}"
    print(f"Using year URL: {year_url}")
    
    # Get ALL shows for this year
    print("Finding all shows...")
    show_urls = get_show_urls(year_url)
    
    print(f"Found {len(show_urls)} potential shows.")
    
    for show_url in show_urls:
        print(f"Checking show: {show_url}")
        
        # We need to fetch metadata to check the date
        soup = get_soup(show_url)
        if not soup:
            continue

        metadata = extract_metadata(soup)
        date_str = metadata.get('date', '')
        
        # Filter for the specified year only
        if date_str.startswith(str(year)):
            print(f"Processing {year} show: {metadata['title']} ({date_str})")
            process_show_page(soup, metadata)
        else:
            print(f"Skipping show {date_str} (not {year})")

if __name__ == "__main__":
    # Process only 2025 for now
    print(f"\n{'='*60}")
    print(f"Starting scrape for year 2025")
    print(f"{'='*60}\n")
    main(2025)
    print(f"\n{'='*60}")
    print(f"Completed scrape for year 2025")
    print(f"{'='*60}\n")
