"""
Auto-discover segments belonging to a show. Segments live in a parallel
folder tree:

    content/shows/2026/05-22/show.md       ← the show
    content/segments/2026/05-22/seg-1.md   ← its segments
    content/segments/2026/05-22/seg-2.md
    …

A show owns every .md file in the matching content/segments/YYYY/MM-DD/
directory. The plugin appends a rendered list of segment cards (via
modules/show-segment.html) to the show's body and attaches a
`related_segments` list to the show article.

This split-folder layout exists so the CMS can model shows and segments
as two distinct collections without filter ambiguity. Ordering: by
optional `order:` frontmatter then source filename.
"""

import os
from pathlib import Path

from pelican import signals
from bs4 import BeautifulSoup


def _segment_dir_for_show(show):
    """Resolve a show's filesystem path to the matching segments dir.
    `content/shows/2026/05-22/show.md` → `content/segments/2026/05-22/`."""
    if not show.source_path:
        return None
    show_path = Path(show.source_path)
    show_root_idx = None
    for i, part in enumerate(show_path.parts):
        if part == 'shows':
            show_root_idx = i
            break
    if show_root_idx is None:
        return None
    parts = list(show_path.parts)
    parts[show_root_idx] = 'segments'
    # Drop the trailing 'show.md' filename — we want the directory.
    return Path(*parts).parent


def _segments_for_show(show, all_articles):
    """Return every segment article whose source_path is in this show's
    paired content/segments/YYYY/MM-DD/ directory, sorted by optional
    `order:` frontmatter then filename."""
    segment_dir = _segment_dir_for_show(show)
    if not segment_dir:
        return []

    def belongs(art):
        if art is show or not art.source_path:
            return False
        return Path(art.source_path).parent == segment_dir

    candidates = [a for a in all_articles if belongs(a)]

    def sort_key(a):
        order = a.metadata.get('order')
        try:
            order_val = float(order) if order is not None else float('inf')
        except (TypeError, ValueError):
            order_val = float('inf')
        return (order_val, os.path.basename(a.source_path or ''))

    return sorted(candidates, key=sort_key)


def _segment_data(article):
    md = article.metadata
    return {
        'title': article.title,
        'href': article.url,
        'banner_url': md.get('banner_url') or md.get('image_url', ''),
        'megaphone_id': md.get('megaphone_id', ''),
        'summary': md.get('summary', ''),
        'length': str(md.get('length', '')) if md.get('length') else '',
    }


def process_show_segments(generator):
    template = generator.env.get_template('modules/show-segment.html')

    for article in generator.articles:
        if article.metadata.get('template') != 'show':
            continue

        segments = _segments_for_show(article, generator.articles)
        article.related_segments = segments

        soup = BeautifulSoup(article._content or '', 'html.parser')

        # Strip any legacy `## Segments` header + the segment links that
        # follow it. New show.md files no longer need this section, but
        # existing content may still contain one.
        for h2 in soup.find_all('h2'):
            if h2.get_text(strip=True).lower() == 'segments':
                # Remove this h2 and every following sibling up to (but not
                # including) the next h2 of the same level.
                cur = h2.next_sibling
                while cur and not (getattr(cur, 'name', None) == 'h2'):
                    nxt = cur.next_sibling
                    cur.extract()
                    cur = nxt
                h2.extract()

        # Append rendered segment cards.
        for seg in segments:
            soup.append(BeautifulSoup(template.render(segment=_segment_data(seg)), 'html.parser'))

        article._content = soup.decode_contents()


def register():
    signals.article_generator_finalized.connect(process_show_segments)
