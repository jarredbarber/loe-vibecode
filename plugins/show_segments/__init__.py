import sys
from pelican import signals
from bs4 import BeautifulSoup

def process_show_segments(generator):
    sys.stderr.write("DEBUG: process_show_segments called\n")
    for article in generator.articles:
        if article.metadata.get('template') != 'show':
            continue
        
        sys.stderr.write(f"DEBUG: Processing show article: {article.title}\n")
        soup = BeautifulSoup(article._content, 'html.parser')
        
        found_segments = []
        
        headers = soup.find_all('h3')
        for header in headers:
            link = header.find('a')
            if not link:
                continue
                
            href = link.get('href')
            sys.stderr.write(f"DEBUG: Checking link href: {href}\n")
            
            target_article = None
            for art in generator.articles:
                # Handle {filename} syntax
                if '{filename}' in href:
                    clean_path = href.replace('{filename}', '')
                    # Normalize paths for comparison (remove leading slashes if any)
                    clean_path = clean_path.lstrip('/')
                    # art.source_path is absolute usually, or relative to content?
                    # Pelican articles have .source_path attribute
                    if art.source_path and art.source_path.endswith(clean_path):
                        target_article = art
                        break
                
                # Fallback to URL matching (if resolved)
                elif href == art.url or href == '/' + art.url or href.endswith(art.url):
                    target_article = art
                    break
                
                # Fallback to slug match
                elif art.slug and art.slug in href:
                    target_article = art
                    break
            
            if target_article:
                sys.stderr.write(f"DEBUG: Found target: {target_article.title}\n")
                found_segments.append(target_article)
                
                # Prepare context for template
                image_url = target_article.metadata.get('image_url') or target_article.metadata.get('Image_url') or ''
                image_url = image_url.strip('"')

                megaphone_id = target_article.metadata.get('megaphone_id') or target_article.metadata.get('Megaphone_id') or ''
                megaphone_id = megaphone_id.strip('"')

                summary_text = target_article.metadata.get('summary', '') or target_article.metadata.get('Summary', '')
                length_text = target_article.metadata.get('length', '') or target_article.metadata.get('Length', '')
                if length_text:
                    length_text = str(length_text)

                segment_data = {
                    'title': target_article.title,
                    'href': target_article.url,
                    'image_url': image_url,
                    'megaphone_id': megaphone_id,
                    'summary': summary_text,
                    'length': length_text
                }

                # Render template
                template = generator.env.get_template('modules/show-segment.html')
                rendered_html = template.render(segment=segment_data)
                
                # Parse back to soup tag
                new_tag = BeautifulSoup(rendered_html, 'html.parser')
                
                # Replace the header
                header.replace_with(new_tag)
        
        article.related_segments = found_segments
        article._content = soup.decode_contents()

def register():
    signals.article_generator_finalized.connect(process_show_segments)
