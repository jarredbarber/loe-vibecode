import urllib.request
from bs4 import BeautifulSoup, NavigableString
import re
import ssl
import os
from datetime import datetime
import glob

# Bypass SSL verification
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE_URL = "https://loe.org"
SHOWS_TOC_URL = f"{BASE_URL}/shows/toc.html?year=2025"
CONTENT_DIR = "content/shows/2025"

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

def get_2025_show_map():
    """Returns a dict of date_str (YYYY-MM-DD) -> {'url': url, 'title_suffix': str}"""
    soup = get_soup(SHOWS_TOC_URL)
    if not soup:
        return {}
    
    show_map = {}
    
    # TOC format: [Month Day, Year](link) - Segment A; Segment B ...
    # We find all links, check if text looks like a date
    for a in soup.find_all('a', href=True):
        text = a.get_text(strip=True)
        href = a['href']
        
        # Parse date from text
        match = re.search(r'([A-Z][a-z]+ \d{1,2}, 2025)', text)
        if match:
            date_str_pretty = match.group(1)
            try:
                dt = datetime.strptime(date_str_pretty, '%B %d, %Y')
                date_key = dt.strftime('%Y-%m-%d')
                
                full_url = href
                if not full_url.startswith('http'):
                     full_url = f"{BASE_URL}/shows/{full_url}"
                
                if 'programID=' in full_url:
                     # Get Title Suffix
                     # The parent paragraph contains the full line.
                     # "October 24, 2025 - Title Text..."
                     # We can get the parent text, remove the date string.
                     parent = a.find_parent()
                     if parent:
                         full_line = parent.get_text(" ", strip=True) # Replace newlines/tags with space
                         # Remove the date part
                         # Pattern: ^Month Day, Year\s*[-–—]?\s*(.*)
                         # Use strict replacement of the date text we found
                         # Note: a.get_text might differ slightly from parent text spacing
                         
                         # Split by the date string?
                         parts = full_line.split(date_str_pretty, 1)
                         if len(parts) > 1:
                             suffix = parts[1].strip()
                             # Remove leading dashes/colons
                             suffix = re.sub(r'^[-–—:\s]+', '', suffix)
                             # Remove trailing "Living on Earth wants to hear from you..." garbage if present
                             if "Living on Earth wants to hear from you" in suffix:
                                 suffix = suffix.split("Living on Earth wants to hear from you")[0].strip()
                             
                             show_map[date_key] = {
                                 'url': full_url,
                                 'title_suffix': suffix
                             }
            except Exception as e:
                print(f"Failed to parse date {text}: {e}")
                
    return show_map

def infer_image_urls(soup, metadata):
    """
    Tries to find the banner and thumb URLs. 
    LOE convention: 
    - Images often stored in /content/YYYY-MM-DD/
    - Banner often b_NAME.jpg
    - Thumb often t_NAME.jpg
    - We can try to finding ANY image in that folder and guessing the others.
    """
    
    # 1. Find main image in .left div
    left_div = soup.find('div', class_='left')
    if not left_div:
        return
        
    img = left_div.find('img')
    if img:
        src = img.get('src', '')
        # src might be /content/2025-11-07/t_COP30_logo.jpg
        
        if 'content' in src and '/2025-' in src:
            # We have a candidate
            if not src.startswith('http'):
                full_img_url = f"{BASE_URL}/{src.lstrip('/')}"
            else:
                full_img_url = src
                
            # If it's a thumb (t_), try to guess banner (b_)
            if '/t' in full_img_url and ('/t_' in full_img_url or '/t-' in full_img_url):
                 # Normalize logic to handle t_ and t-
                 metadata['thumb_url'] = full_img_url
                 # Try replacing t_ with b_ first
                 if '/t_' in full_img_url:
                      metadata['banner_url'] = full_img_url.replace('/t_', '/b_')
                 elif '/t-' in full_img_url:
                      metadata['banner_url'] = full_img_url.replace('/t-', '/b-')
            elif '/b' in full_img_url and ('/b_' in full_img_url or '/b-' in full_img_url):
                 metadata['banner_url'] = full_img_url
                 if '/b_' in full_img_url:
                      metadata['thumb_url'] = full_img_url.replace('/b_', '/t_')
                 elif '/b-' in full_img_url:
                      metadata['thumb_url'] = full_img_url.replace('/b-', '/t-')
            else:
                 # Just use what we found for banner?
                 metadata['image_url'] = full_img_url

        # Caption
        # Check immediate siblings (text nodes) after the image
        # If image is wrapped in a link, we need to check the link's siblings
        caption_node = img
        if img.parent.name == 'a':
             caption_node = img.parent
             
        caption_text = ""
        curr = caption_node.next_sibling
        while curr:
            if isinstance(curr, NavigableString):
                t = curr.strip()
                if t:
                    caption_text += " " + t
            elif curr.name == 'br':
                pass
            elif curr.name in ['strong', 'b', 'h2', 'h3', 'div', 'a']: 
                 # Stop at block/bold/link elements usually starting next section
                 # But if we haven't found any text yet, and we hit a 'p', maybe that 'p' is the caption?
                 # Ignoring 'a' because sometimes caption refers to "photo by [link]"
                 # Actually, usually "Photo: [Link]" is part of caption. 
                 # Let's handle 'a' if inline.
                 if curr.name == 'a':
                     # If we haven't found any text yet, assume this link is a TITLE or NAVIGATION headers, not a caption.
                     if not caption_text.strip():
                         break
                         
                     caption_text += " " + curr.get_text(strip=True)
                     curr = curr.next_sibling # Continue after link
                     continue
                 
                 break
            elif curr.name == 'p':
                 # If we haven't found text yet, check if this P is caption
                 if not caption_text.strip():
                      t = curr.get_text(strip=True)
                      # Heuristic: Caption < 300 chars, Summary > 300 or starts with Strong?
                      if len(t) < 400 and len(t) > 5 and "Air Date" not in t:
                           caption_text = t
                 break
            
            curr = curr.next_sibling
            
        if caption_text:
             clean_cap = caption_text.strip()
             if len(clean_cap) > 5 and len(clean_cap) < 400:
                  metadata['image_caption'] = clean_cap
             else:
                  # Fallback to parent check if sibling check failed?
                  # No, parent check was the one failing (too greedy).
                  pass

def extract_metadata(soup):
    metadata = {}
    
    # Megaphone
    iframe = soup.find('iframe', src=re.compile(r'megaphone\.fm'))
    if iframe:
        src = iframe['src']
        match = re.search(r'e=([A-Z0-9]+)', src)
        if match:
            metadata['megaphone_id'] = match.group(1)
            
    # Host
    # Search for "Host" or "joined by" in text
    text_content = soup.get_text()
    
    # "Host Steve Curwood" or "Hosts Aynsley O'Neill and..."
    host_match = re.search(r'Host[s]?\s+([A-Z][a-z]+ [A-Z][a-z]+(?: and [A-Z][a-z]+ [A-Z][a-z]+)?)', text_content)
    if host_match:
        metadata['host'] = host_match.group(1)
    else:
        # Fallback: check frequent hosts
        if "Steve Curwood" in text_content:
             metadata['host'] = "Steve Curwood"
        elif "Aynsley O'Neill" in text_content:
             metadata['host'] = "Aynsley O'Neill"
    
    # Summary
    # Bold text in .left usually
    left_div = soup.find('div', class_='left')
    if left_div:
        # Try to find a paragraph that looks like a summary
        # Skip "Air Date", "FULL SHOW", "Links"
        for p in left_div.find_all(['p', 'div']): # div sometimes used for text
             t = p.get_text(strip=True)
             if len(t) > 60 and "Air Date" not in t and "Links" not in t:
                  metadata['summary'] = t
                  break
        
        # If no paragraph found, fall back to bold but check content
        if 'summary' not in metadata:
             bold = left_div.find('strong') or left_div.find('b')
             if bold:
                 t = bold.get_text(strip=True)
                 if len(t) > 20 and "Air Date" not in t and "FULL SHOW" not in t:
                      metadata['summary'] = t
                      
    # Clean Summary (remove trailing length)
    if 'summary' in metadata:
        # Remove (MM:SS) at the end, optionally surrounded by whitespace
        metadata['summary'] = re.sub(r'\s*\(\d{1,2}:\d{2}\)\s*$', '', metadata['summary'])

    # Length
    # Heuristic: Show length is usually around 52 mins (45-59).
    # We want the FULL show length.
    # Scan the entire text content for (MM:SS) patterns.
    # Collect all valid lengths.
    # Pick the usage that is > 45 mins.
    # If multiple > 45, pick the max? Or the one that appears near "Full Show"?
    if left_div:
        all_text = left_div.get_text()
        # Regex for (MM:SS) or (H:MM:SS)
        # Note: sometimes it's just MM:SS without parens? Usually parens in LOE.
        matches = re.findall(r'\((\d{1,2}:\d{2})\)', all_text)
        
        candidates = []
        for m in matches:
             parts = m.split(':')
             minutes = int(parts[0])
             if minutes >= 45 and minutes < 90: # reasonable show length
                 candidates.append(m)
        
        if candidates:
             # Take the largest one?
             # If multiple > 45, pick the max.
             candidates.sort(key=lambda x: int(x.split(':')[0]), reverse=True)
             metadata['length'] = candidates[0]
        else:
             # Default to 52:00 if no full show length found
             # This avoids showing the first segment's length (e.g. 13:27) as the show length.
             metadata['length'] = "52:00"
    else:
        # Fallback if no left_div (unlikely)
        metadata['length'] = "52:00"
             
    # Images
    infer_image_urls(soup, metadata)
    
    return metadata


def update_show_md(filepath, metadata):
    with open(filepath, 'r') as f:
        content = f.read()
        
    lines = content.split('\n')
    new_lines = []
    in_frontmatter = False
    frontmatter_keys = set()
    
    # Parse existing keys
    for line in lines:
        if line.strip() == '---':
            if not in_frontmatter:
                in_frontmatter = True
            else:
                in_frontmatter = False
            continue
        if in_frontmatter:
            key = line.split(':')[0].strip()
            frontmatter_keys.add(key)
            
    # Now rebuild
    in_frontmatter = False
    fm_processed = False
    
    for line in lines:
        if line.strip() == '---':
            new_lines.append(line)
            if not in_frontmatter:
                in_frontmatter = True
            else:
                # Ending frontmatter, append missing keys
                in_frontmatter = False
                
                # Insert our new metadata if not present or update?
                # We want to UPDATE or ADD.
                # But we are iterating... 
                # Better approach: parse FM into dict, update dict, write back?
                # But we want to preserve comments/order if possible? 
                # Actually, standard YAML dump might be safer but `yaml` module not always avail.
                # Let's do a simple append for missing, and we handled existing by not doing anything yet.
                pass 
                
            continue
            
        if in_frontmatter:
            key = line.split(':')[0].strip()
            # If we have a better value for this key, replace it?
            # Or trust the scrape?
            # Let's Prefer the SCRAPE for missing items, but keep existing if we are unsure?
            # Actually user wanted to "try to capture complete metadata".
            # Let's update standard fields.
            
            if key in metadata:
                 val = metadata[key]
                 if val:
                     # Check if line already has value
                     parts = line.split(':', 1)
                     if len(parts) > 1 and parts[1].strip():
                          # Has value. Replace?
                          # Let's Replace it to be sure we get the latest good data
                          new_lines.append(f"{key}: {val}")
                     else:
                          new_lines.append(f"{key}: {val}")
            else:
                 new_lines.append(line)
        else:
            new_lines.append(line)

    # BUT wait, simple iteration doesn't easily allow "Insert if missing".
    # Let's rewrite the Frontmatter block entirely.
    
    # Extract Body
    parts = content.split('---', 2)
    if len(parts) < 3:
        print(f"Skipping {filepath}, malformed frontmatter")
        return
        
    fm_text = parts[1]
    body = parts[2]
    
    # Parse FM
    current_fm = {}
    for line in fm_text.strip().split('\n'):
        if ':' in line:
            k, v = line.split(':', 1)
            current_fm[k.strip()] = v.strip()
            
    # Merge
    for k, v in metadata.items():
        if v: # Only update if we found something
            current_fm[k] = v
            
    # Cleanup: If we have banner_url or thumb_url, remove legacy image_url
    if 'banner_url' in current_fm or 'thumb_url' in current_fm:
        if 'image_url' in current_fm:
            del current_fm['image_url']
            
    # Reconstruct
    new_content = "---\n"
    for k, v in current_fm.items():
        new_content += f"{k}: {v}\n"
    new_content += "---" + body
    
    with open(filepath, 'w') as f:
        f.write(new_content)
        
    print(f"Updated {filepath}")

def process_segment_markdown(filepath):
    """
    Parse a segment markdown file.
    Look for a caption pattern at the top of the body:
    *Caption text... (Photo: Credt)*
    Move it to metadata.
    """
    with open(filepath, 'r') as f:
        content = f.read()
        
    parts = content.split('---', 2)
    if len(parts) < 3:
        return
        
    fm_text = parts[1]
    body = parts[2]
    
    # Check if caption is already in metadata
    if "image_caption: " in fm_text and "image_caption: \n" not in fm_text:
         # Already has a caption value?
         # Check if it is empty string
         pass

    # Regex for caption at start of body
    # Pattern: Optional whitespace, then *Caption...*
    # We want to match until the asterisk followed by newline.
    # Use non-greedy match (.+?) which works because internal asterisks are not followed by newline.
    
    caption_match = re.search(r'^\s*\*([\s\S]+?)\*\s*\n', body)
    if caption_match:
        raw_caption = caption_match.group(1).strip()
        # Heuristic: Captions usually have "Photo" or are reasonably long but not too long
        if "Photo" in raw_caption or "Credit" in raw_caption or len(raw_caption) > 10:
             print(f"Found caption in {os.path.basename(filepath)}: {raw_caption[:30]}...")
             
             # Remove from body
             body = body.replace(caption_match.group(0), "", 1).strip()
             
             # Update Frontmatter
             current_fm = {}
             for line in fm_text.strip().split('\n'):
                 if ':' in line:
                     k, v = line.split(':', 1)
                     current_fm[k.strip()] = v.strip()
             
             current_fm['image_caption'] = raw_caption
             
             # Rebuild
             new_content = "---\n"
             for k, v in current_fm.items():
                 new_content += f"{k}: {v}\n"
             new_content += "---\n\n" + body
             
             with open(filepath, 'w') as f:
                 f.write(new_content)
             print(f"Updated segment {filepath}")

def main():
    print("Building Map...")
    show_map = get_2025_show_map()
    print(f"Found {len(show_map)} shows in TOC.")
    
    # Walk directories
    # content/shows/2025/MM-DD/show.md
    
    shows_dir = "content/shows/2025"
    if not os.path.exists(shows_dir):
        print(f"Directory {shows_dir} not found.")
        return

    # Process SHOW files
    show_files = glob.glob(os.path.join(shows_dir, "*", "show.md"))
    
    for sf in show_files:
        # Infer date from path?
        # .../2025/11-07/show.md
        parent = os.path.dirname(sf)
        date_part = os.path.basename(parent) # 11-07
        full_date = f"2025-{date_part}"
        
        print(f"\nProcessing {full_date}...")
        
        if full_date in show_map:
            entry = show_map[full_date]
            url = entry['url']
            title_suffix = entry.get('title_suffix', '')
            
            soup = get_soup(url)
            if soup:
                meta = extract_metadata(soup)
                
                if title_suffix:
                    meta['title'] = title_suffix
                
                print(f"Extracted: {meta.keys()}")
                update_show_md(sf, meta)
        else:
            print(f"No URL found for {full_date} in TOC (or mismatch)")
            
        # Process SEGMENT files in this directory
        segment_files = glob.glob(os.path.join(parent, "*.md"))
        for seg_file in segment_files:
            if os.path.basename(seg_file) == "show.md":
                continue
            process_segment_markdown(seg_file)

if __name__ == "__main__":
    main()
