import urllib.request
from bs4 import BeautifulSoup
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
    """Returns a dict of date_str (YYYY-MM-DD) -> show_url"""
    soup = get_soup(SHOWS_TOC_URL)
    if not soup:
        return {}
    
    show_map = {}
    
    # TOC format: [Month Day, Year](link) ...
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
                     show_map[date_key] = full_url
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
        # Check for caption in parent or next sibling
        # Logic from scrape_archive.py
        parent = img.find_parent()
        if parent:
             caption_text = parent.get_text(strip=True)
             # Basic filter to avoid grabbing the whole article
             if len(caption_text) < 400 and len(caption_text) > 5:
                  metadata['image_caption'] = caption_text

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

    # Length
    # Heuristic: Show length is usually around 52 mins (45-59).
    # Segment lengths are usually < 20.
    # Look for (MM:SS) in text, prefer one that is > 45 mins?
    # Or just don't extract if we aren't sure.
    # Actually, often the show summary ends with (52:00) or similar.
    # If we found a summary, check end of it.
    if 'summary' in metadata:
         len_match = re.search(r'\((\d{1,2}:\d{2})\)', metadata['summary'])
         if len_match:
             l = len_match.group(1)
             # Check if it looks like a full show?
             min_part = int(l.split(':')[0])
             if min_part > 45:
                  metadata['length'] = l
    
    # If not found in summary, scan first 1000 chars but only accept > 45 mins
    if 'length' not in metadata:
        if left_div:
            all_text_start = left_div.get_text()[:3000]
            # Find ALL matches
            matches = re.findall(r'\((\d{1,2}:\d{2})\)', all_text_start)
            for m in matches:
                 min_part = int(m.split(':')[0])
                 if min_part > 45:
                      metadata['length'] = m
                      break

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
            
    # Reconstruct
    new_content = "---\n"
    for k, v in current_fm.items():
        new_content += f"{k}: {v}\n"
    new_content += "---" + body
    
    with open(filepath, 'w') as f:
        f.write(new_content)
        
    print(f"Updated {filepath}")

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

    # Find all show.md files
    # pattern: content/shows/2025/*/show.md
    show_files = glob.glob(os.path.join(shows_dir, "*", "show.md"))
    
    for sf in show_files:
        # Infer date from path?
        # .../2025/11-07/show.md
        parent = os.path.dirname(sf)
        date_part = os.path.basename(parent) # 11-07
        full_date = f"2025-{date_part}"
        
        print(f"\nProcessing {full_date}...")
        
        if full_date in show_map:
            url = show_map[full_date]
            soup = get_soup(url)
            if soup:
                meta = extract_metadata(soup)
                print(f"Extracted: {meta.keys()}")
                update_show_md(sf, meta)
        else:
            print(f"No URL found for {full_date} in TOC (or mismatch)")

if __name__ == "__main__":
    main()
