"""Golden tests for the Pelican render path. Each test asserts a specific
invariant we've broken before — it's there to prevent regressions on the
exact bug, not to exhaustively spec the renderer."""

from bs4 import BeautifulSoup


SEGMENT_QUOTE = '2099_01_01_quote-test-bursts-forth.html'
SEGMENT_BIRDNOTE = '2099_01_01_birdnote-fixture.html'
SHOW_PAGE = '2099_01_01_living-on-earth-january-1-2099.html'
INDEX_PAGE = 'index.html'


def _soup(html):
    return BeautifulSoup(html, 'html.parser')


# 1. Frontmatter title with embedded double quotes renders cleanly
def test_title_with_quotes_has_no_errant_punctuation(read_page):
    soup = _soup(read_page(SEGMENT_QUOTE))
    title = soup.find('title').get_text()
    assert 'Quote Test "Bursts" Forth' in title
    # Regression: we used to emit YAML single-quoted strings that rendered literally.
    assert "'Quote Test" not in title
    h2_text = soup.find('h2').get_text()
    assert h2_text.strip().startswith('Quote Test "Bursts" Forth')


# 2. Speaker lines are highlighted and grouped into transcript blocks
def test_transcript_blocks_wrap_speaker_paragraphs(read_page):
    soup = _soup(read_page(SEGMENT_QUOTE))
    blocks = soup.select('div.transcript-block')
    assert len(blocks) >= 1, 'expected at least one transcript-block'
    speakers = soup.select('span.speaker')
    speaker_text = {s.get_text() for s in speakers}
    assert 'CURWOOD:' in speaker_text
    assert 'DOERING:' in speaker_text


# 3. Inline image with alt becomes a <figure><figcaption>
def test_inline_image_caption_becomes_figure(read_page):
    soup = _soup(read_page(SEGMENT_QUOTE))
    figures = soup.find_all('figure')
    inline_fig = next(
        (f for f in figures if f.find('img', src=lambda s: s and 'inline.jpg' in s)),
        None,
    )
    assert inline_fig is not None, 'inline image should be wrapped in <figure>'
    caption = inline_fig.find('figcaption')
    assert caption is not None
    assert 'Caption from alt text' in caption.get_text()


# 4. {% audio %} shortcode expands to the .mcp custom player
def test_audio_shortcode_renders_custom_player(read_page):
    soup = _soup(read_page(SEGMENT_BIRDNOTE))
    cue = soup.select_one('div.music-cue')
    assert cue is not None
    label = cue.select_one('.music-cue-label')
    assert label and label.get_text().strip() == 'Test Bird Song'
    duration = cue.select_one('.music-cue-duration')
    assert duration and duration.get_text().strip() == '0:00-0:30'
    audio = cue.select_one('audio.mcp-audio')
    assert audio is not None
    assert audio['src'] == 'https://example.org/test/bird.mp3'
    # Regression: must NOT include the native controls attribute (we render
    # custom controls via .mcp markup + JS).
    assert 'controls' not in audio.attrs


# 5. {% cue %} shortcode (no audio) detects speaker pattern in text
def test_cue_shortcode_with_speaker_label(read_page):
    soup = _soup(read_page(SEGMENT_BIRDNOTE))
    cues = soup.select('div.music-cue')
    texts = [c.get_text().strip() for c in cues]
    assert 'CROWD CHEERS' in texts
    cutaway = next(c for c in cues if 'CUTAWAY MUSIC' in c.get_text())
    speaker = cutaway.select_one('.speaker')
    assert speaker and speaker.get_text() == 'CUTAWAY MUSIC:'


# 6. Show template synthesizes "Living on Earth: <date>" headline
def test_show_template_headline(read_page):
    soup = _soup(read_page(SHOW_PAGE))
    h2 = soup.find('h2')
    assert h2 is not None
    assert h2.get_text().strip().startswith('Living on Earth: January 1')


# 7. Nav active state matches the current page
def test_nav_active_state_per_page(read_page):
    # On the index, Home is active and nothing else.
    home = _soup(read_page(INDEX_PAGE)).select('.menu li a.active')
    assert [a.get_text() for a in home] == ['Home']
    # On a segment page, no nav item is active.
    segment = _soup(read_page(SEGMENT_BIRDNOTE)).select('.menu li a.active')
    assert segment == []
