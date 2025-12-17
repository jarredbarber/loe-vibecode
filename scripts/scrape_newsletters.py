
import requests
from bs4 import BeautifulSoup
import os
import re
from datetime import datetime
import time

from scraping_utils import slugify

# URL of the Mailchimp archive
ARCHIVE_URL = "https://us3.campaign-archive.com/home/?u=9f9ebdcfa232a532a7e70746b&id=2383d76cae"
OUTPUT_DIR = "content/newsletters"

# Ensure output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)

def get_soup(url):
    """Fetch using requests library (required for Mailchimp)."""
    response = requests.get(url)
    response.raise_for_status()
    return BeautifulSoup(response.content, 'html.parser')

# slugify function now imported from scraping_utils

def scrape_archive():
    print(f"Fetching archive list from {ARCHIVE_URL}...")
    soup = get_soup(ARCHIVE_URL)
    
    # improved selector based on the viewed content
    # The list items seem to be in a standard UL/LI structure or similar in the archive page
    # Looking at the previous read_url_content output, it looked like:
    # - 12/02/2025 - [Living on Earth Giving Tuesday...]
    # This suggests li -> date text + a tag
    
    # Let's look for the main listing container. 
    # Usually Mailchimp archives have a specific class like 'display_archive' or just li elements in a ul
    
    links = []
    # Try generic list items first
    for li in soup.find_all('li'):
        text = li.get_text()
        # Pattern match date: MM/DD/YYYY - Title
        match = re.search(r'(\d{2}/\d{2}/\d{4}) -', text)
        if match:
            date_str = match.group(1)
            a_tag = li.find('a')
            if a_tag:
                title = a_tag.get_text().strip()
                url = a_tag['href']
                links.append({'date': date_str, 'title': title, 'url': url})

    seen_titles = set()
    unique_links = []
    
    for item in links:
        # Mailchimp often sends corrections or resends with slight date changes (e.g. next day)
        # We'll stick to the first one we find for a given title to avoid clutter
        # Or better, we could keep the LATEST one if titles are identical?
        # The list from scrape is usually newest first? No, archival list order.
        # Let's assume the list order is reverse chronological (newest first) or chronological.
        # Actually in the HTML loop it's likely top-down.
        if item['title'] not in seen_titles:
            unique_links.append(item)
            seen_titles.add(item['title'])
        else:
            print(f"Skipping duplicate title: {item['title']} ({item['date']})")
            
    print(f"Found {len(unique_links)} unique newsletters (from {len(links)} total entries).")
    
    for item in unique_links:
        process_newsletter(item)
        time.sleep(1) # Be nice to the server

from markdownify import markdownify as md

def process_newsletter(item):
    date_obj = datetime.strptime(item['date'], '%m/%d/%Y')
    formatted_date = date_obj.strftime('%Y-%m-%d')
    slug = slugify(item['title'])
    filename = f"{formatted_date}-{slug}.md"
    filepath = os.path.join(OUTPUT_DIR, filename)
    
    # We always overwrite now to improve quality
    # if os.path.exists(filepath):
    #     print(f"Skipping {filename} (already exists)")
    #     return

    print(f"Processing {item['title']} ({formatted_date})...")
    
    try:
        soup = get_soup(item['url'])
        
        # Target the main content area
        # Mailchimp templates usually have #templateBody or #bodyContainer
        content = soup.find(id="templateBody") or soup.find(id="bodyContainer")
        
        if not content:
            # Fallback for "simple" templates (like 12-02-2025) which use .mceText blocks
            blocks = soup.find_all(class_="mceText")
            if blocks:
                content = soup.new_tag("div")
                for block in blocks:
                    content.append(block)
            else:
                 content = soup.body
        
        if content:
             # Remove some common junk if present
            for garbage in content.find_all(class_=["mcnPreviewText", "start-link", "footer-content"]):
                garbage.decompose()

            # Convert to Markdown
            # headings_style="atx" uses # for headers
            # strip layout tables but keep content
            markdown_body = md(str(content), heading_style="atx", strip=["script", "style", "table", "thead", "tbody", "tr", "td", "span", "div"])
            
            # Clean up excessive newlines
            markdown_body = re.sub(r'\n{3,}', '\n\n', markdown_body).strip()
            
            # Remove footer links common in Mailchimp
            # Case-insensitive match for common footer text patterns to strip from the end
            footer_patterns = [
                r'View email in browser.*',
                r'update your preferences.*',
                r'unsubscribe.*',
                r'View.*View email in browser.*', # complex one seen in 12-02
            ]
            
            for pattern in footer_patterns:
                markdown_body = re.sub(pattern, '', markdown_body, flags=re.IGNORECASE | re.DOTALL).strip()

        else:
            print(f"Warning: Could not find content container for {item['url']}")
            markdown_body = "Content extraction failed."

        markdown_content = f"""---
title: {item['title']}
date: {formatted_date}
category: Newsletter
slug: {slug}
summary: Newsletter from {formatted_date}
template: newsletter_article
---

{markdown_body}
"""
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(markdown_content)
            
    except Exception as e:
        print(f"Failed to process {item['url']}: {e}")

if __name__ == "__main__":
    scrape_archive()
