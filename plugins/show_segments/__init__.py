"""
Resolve `### [Title]({filename}slug.md)` segment links in show pages into
rich segment cards (rendered via modules/show-segment.html). Also attach a
`related_segments` list to the show article so templates can iterate it.

Match strategy: the `{filename}path/to/segment.md` form is authoritative —
each show.md lists segments by their on-disk path. We previously also fell
back to slug-substring matching, but that mis-linked when two different
segments shared a slug (e.g. `tropical-forests-forever` across years).
Removed.
"""

from pelican import signals
from bs4 import BeautifulSoup


def _resolve_segment(href, articles):
    """Match an href like `{filename}slug.md` against article.source_path."""
    if '{filename}' not in href:
        return None
    needle = href.replace('{filename}', '').lstrip('/')
    for art in articles:
        if art.source_path and art.source_path.endswith(needle):
            return art
    return None


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

        soup = BeautifulSoup(article._content, 'html.parser')
        found = []

        for header in soup.find_all('h3'):
            link = header.find('a')
            if not link:
                continue

            target = _resolve_segment(link.get('href', ''), generator.articles)
            if not target:
                continue

            found.append(target)
            rendered = template.render(segment=_segment_data(target))
            header.replace_with(BeautifulSoup(rendered, 'html.parser'))

        article.related_segments = found
        article._content = soup.decode_contents()


def register():
    signals.article_generator_finalized.connect(process_show_segments)
