"""
Auto-discover segments belonging to a show: any .md sibling of a `show.md`
(other than show.md itself) is treated as a segment of that show. The
plugin appends a rendered list of segment cards (via
modules/show-segment.html) to the show's body, and attaches a
`related_segments` list to the show article so templates can iterate it.

Authors don't need to maintain a `## Segments` list inside show.md any
more. Drop a new segment.md into the show's date folder and it'll appear
automatically. Ordering: by an optional `order:` frontmatter field
(integer or float), then by source filename for ties.
"""

import os
from pathlib import Path

from pelican import signals
from bs4 import BeautifulSoup


def _show_dir(article):
    """Absolute filesystem dir containing the show.md, or None."""
    return Path(article.source_path).parent if article.source_path else None


def _segments_for_show(show, all_articles):
    """Return segments that live in the same dir as the show, sorted by
    explicit `order:` frontmatter then filename."""
    show_dir = _show_dir(show)
    if not show_dir:
        return []

    def belongs(art):
        if art is show:
            return False
        if not art.source_path:
            return False
        return Path(art.source_path).parent == show_dir

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
