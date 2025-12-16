import urllib.request
from bs4 import BeautifulSoup
import re
import ssl
import os
from datetime import datetime

# Bypass SSL verification (per scraping_reference.md)
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE_URL = "https://loe.org"
SERIES_INDEX_URL = f"{BASE_URL}/series/"

def get_soup(url):
    """Fetch and parse a URL, returning BeautifulSoup object."""
    print(f"Fetching {url}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx) as response:
            html = response.read()
            return BeautifulSoup(html, 'html.parser')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def slugify(text):
    """Convert text to URL-friendly slug."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'\s+', '-', text)
    return text[:50]

def get_all_series_urls():
    """Extract all series URLs from the main series index page."""
    soup = get_soup(SERIES_INDEX_URL)
    if not soup:
        return []
    
    series_links = []
    seen_ids = set()
    
    # Find all links with seriesID parameter
    for a in soup.find_all('a', href=True):
        href = a['href']
        if 'seriesID=' in href:
            # Skip malformed URLs with double 'series'
            if 'seriesseries.html' in href:
                continue
            
            # Extract series ID
            match = re.search(r'seriesID=(\d+)', href)
            if match:
                series_id = match.group(1)
                if series_id not in seen_ids:
                    seen_ids.add(series_id)
                    
                    # Construct full URL
                    if href.startswith('http'):
                        full_url = href
                    elif href.startswith('/'):
                        full_url = f"{BASE_URL}{href}"
                    else:
                        full_url = f"{BASE_URL}/series/{href}"
                    
                    # Get title from link text
                    title = a.get_text(strip=True)
                    
                    series_links.append({
                        'id': series_id,
                        'url': full_url,
                        'title': title
                    })
    
    return series_links

def parse_series_page(series_info):
    """Parse an individual series page and extract content."""
    soup = get_soup(series_info['url'])
    if not soup:
        return None
    
    data = {
        'series_id': series_info['id'],
        'title': series_info['title'],
        'slug': slugify(series_info['title'])
    }
    
    # Try to find main content area
    left_div = soup.find('div', class_='left')
    if not left_div:
        left_div = soup.find('div', class_='leftt')
    
    if not left_div:
        print(f"Warning: Could not find content area for series {data['title']}")
        return data
    
    # Clean up soup
    for tag in left_div.find_all(['script', 'style']):
        tag.decompose()
    for div in left_div.find_all('div', class_='clr'):
        div.decompose()
    
    # Look for header/title (often h3)
    h3 = left_div.find('h3')
    if h3:
        # Use h3 title if it's different/better than link text
        page_title = h3.get_text(strip=True)
        if len(page_title) > len(data['title']):
            data['title'] = page_title
    
    # Extract any description or intro text
    # Look for first substantial paragraph before the parts list
    description = ""
    for p in left_div.find_all('p'):
        text = p.get_text(strip=True)
        if len(text) > 60 and not text.startswith('[') and 'PART' not in text.upper():
            description = text
            break
    
    if description:
        data['description'] = description
    
    # Look for main image
    img = left_div.find('img')
    if img:
        src = img.get('src')
        if src and not src.endswith('gif'):
            if not src.startswith('http'):
                src = f"{BASE_URL}/{src.lstrip('/')}"
            data['image_url'] = src
            
            # Try to find caption
            parent = img.find_parent()
            if parent:
                caption_text = parent.get_text(strip=True)
                if len(caption_text) < 300:
                    data['image_caption'] = caption_text
    
    # Convert content to markdown and extract dates
    content_parts = []
    earliest_date = None
    first_segment_url = None
    
    # Process links to parts/episodes
    for a in left_div.find_all('a', href=True):
        href = a['href']
        link_text = a.get_text(strip=True)
        
        # Skip navigation links
        if not link_text or 'Back to' in link_text:
            continue
        
        # Resolve relative URLs
        if href.startswith('http'):
            href = href
        elif href.startswith('/'):
            href = f"{BASE_URL}{href}"
        elif href.startswith('series/'):
            href = f"{BASE_URL}/{href}"
        elif href.startswith('shows/'):
            href = f"{BASE_URL}/{href}"
        else:
            # Fallback - might need series/ or shows/ prefix
            href = f"{BASE_URL}/{href}"
        
        # Save first segment URL for potential image/date extraction
        if first_segment_url is None and ('segments.htm' in href or 'story.html' in href):
            first_segment_url = href
        
        # Look for listen/download links next to this link
        audio_links = []
        next_sibling = a.find_next_sibling()
        if next_sibling:
            for audio_link in [next_sibling.find('a', string='listen'), 
                             next_sibling.find('a', string='download')]:
                if audio_link:
                    audio_href = audio_link.get('href', '')
                    if audio_href:
                        if not audio_href.startswith('http'):
                            audio_href = f"{BASE_URL}/{audio_href.lstrip('/')}"
                        audio_links.append(f"[{audio_link.get_text()}]({audio_href})")
        
        # Check if there's a published date nearby
        published = ""
        parent_text = a.parent.get_text() if a.parent else ""
        date_match = re.search(r'Published:\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})', parent_text)
        if date_match:
            published = f" _(Published: {date_match.group(1)})_"
            # Try to parse this date for sorting
            try:
                date_obj = datetime.strptime(date_match.group(1), '%B %d, %Y')
                if earliest_date is None or date_obj < earliest_date:
                    earliest_date = date_obj
            except:
                pass
        
        # Build the content line
        if 'PART' in link_text.upper() or 'Episode' in link_text:
            content_parts.append(f"\n### [{link_text}]({href})")
        else:
            content_parts.append(f"\n- [{link_text}]({href})")
        
        if audio_links:
            content_parts.append(f" {' / '.join(audio_links)}")
        if published:
            content_parts.append(published)
        content_parts.append("\n")
    
    data['content'] = ''.join(content_parts).strip()
    
    # If no image found on main page, try to get from first segment
    if 'image_url' not in data and first_segment_url:
        print(f"  No image on series page, checking first segment...")
        segment_soup = get_soup(first_segment_url)
        if segment_soup:
            segment_left = segment_soup.find('div', class_='left')
            if segment_left:
                segment_img = segment_left.find('img')
                if segment_img:
                    src = segment_img.get('src')
                    if src and not src.endswith('gif'):
                        if not src.startswith('http'):
                            src = f"{BASE_URL}/{src.lstrip('/')}"
                        data['image_url'] = src
                        print(f"  Found image from segment: {src[:50]}...")
    
    # Set date based on earliest part date, or extract from first segment URL
    if earliest_date:
        data['date'] = earliest_date.strftime('%Y-%m-%d')
    elif first_segment_url:
        # Try to extract date from segment URL (programID often contains date info)
        # Example: programID=06-P13-00011 -> Year 2006
        year_match = re.search(r'programID=(\d{2})', first_segment_url)
        if year_match:
            year_prefix = year_match.group(1)
            # Assume 00-50 is 2000s, 51-99 is 1900s
            if int(year_prefix) <= 50:
                full_year = f"20{year_prefix}"
            else:
                full_year = f"19{year_prefix}"
            data['date'] = f"{full_year}-01-01"  # Use January 1st as default
    else:
        data['date'] = datetime.now().strftime('%Y-%m-%d')
    
    return data

def save_series_markdown(series_data):
    """Save series data to a Markdown file."""
    if not series_data:
        return
    
    # Create output directory
    out_dir = "content/series"
    os.makedirs(out_dir, exist_ok=True)
    
    # Create filename
    filename = f"{series_data['slug']}.md"
    filepath = os.path.join(out_dir, filename)
    
    print(f"Writing {filepath}...")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        # Write YAML frontmatter
        f.write("---\n")
        f.write(f"title: {series_data['title']}\n")
        f.write(f"series_id: {series_data['series_id']}\n")
        f.write(f"slug: {series_data['slug']}\n")
        f.write(f"date: {series_data.get('date', '2000-01-01')}\n")
        f.write("category: Series\n")
        f.write("template: series\n")
        
        if 'description' in series_data:
            f.write(f"description: {series_data['description']}\n")
        if 'image_url' in series_data:
            f.write(f"image_url: {series_data['image_url']}\n")
        if 'image_caption' in series_data:
            f.write(f"image_caption: {series_data['image_caption']}\n")
        
        f.write("---\n\n")
        
        # Write content
        if series_data.get('content'):
            f.write(series_data['content'])
            f.write("\n")

def main():
    """Main script execution."""
    print("="*60)
    print("Starting Special Features/Series Migration")
    print("="*60)
    
    # Get all series from index
    print("\nFetching series index...")
    series_list = get_all_series_urls()
    print(f"Found {len(series_list)} series to migrate\n")
    
    # Process each series
    for i, series_info in enumerate(series_list, 1):
        print(f"\n[{i}/{len(series_list)}] Processing: {series_info['title']}")
        print(f"URL: {series_info['url']}")
        
        # Parse the series page
        series_data = parse_series_page(series_info)
        
        if series_data:
            # Save to file
            save_series_markdown(series_data)
            print(f"✓ Saved: {series_data['slug']}.md")
        else:
            print(f"✗ Failed to parse series")
    
    print("\n" + "="*60)
    print("Migration Complete!")
    print("="*60)

if __name__ == "__main__":
    main()
