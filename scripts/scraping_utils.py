"""
Shared utilities for web scraping scripts.

This module provides common functions used across multiple scraping scripts
to fetch and parse web pages from loe.org.
"""

import urllib.request
from bs4 import BeautifulSoup
import re
import ssl

# Bypass SSL verification for loe.org (per scraping_reference.md)
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Base URLs
BASE_URL = "https://loe.org"
SHOWS_URL = f"{BASE_URL}/shows/"
SERIES_URL = f"{BASE_URL}/series/"


def get_soup(url):
    """
    Fetch and parse a URL, returning BeautifulSoup object.
    
    Args:
        url: The URL to fetch
        
    Returns:
        BeautifulSoup object or None if fetch failed
    """
    print(f"Fetching {url}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx) as response:
            html = response.read()
            return BeautifulSoup(html, 'html.parser')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None


def slugify(text, max_length=None):
    """
    Convert text to URL-friendly slug.
    
    Args:
        text: The text to slugify
        max_length: Optional maximum length for the slug
        
    Returns:
        URL-friendly slug string
    """
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s-]+', '-', text)
    text = text.strip('-')
    if max_length:
        return text[:max_length]
    return text
