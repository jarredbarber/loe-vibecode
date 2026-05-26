/**
 * Eleventy shortcodes — JS port of plugins/shortcodes/__init__.py.
 *
 * Authors write:
 *   {% audio src="..." label="..." duration="..." %}
 *   {% cue text="..." %}
 *
 * Emits the same .music-cue HTML as the Pelican plugin so the theme CSS
 * works unchanged.
 */

const SPEAKER_RE = /^\s*([A-Z](?:[A-Z'’\d\s.]|[a-z]{1,2}(?=[A-Z]))+):/;

function audioShortcode({ src = '', label = '', duration = '' } = {}) {
    if (!src) return '';
    const meta =
        label || duration
            ? `<div class="music-cue-meta">` +
              (label ? `<div class="music-cue-label">${escapeHtml(label)}</div>` : '') +
              (duration ? `<div class="music-cue-duration">${escapeHtml(duration)}</div>` : '') +
              `</div>`
            : '';
    const player =
        `<div class="mcp">` +
        `<button class="mcp-play" type="button" aria-label="Play">▶</button>` +
        `<div class="mcp-progress"><div class="mcp-fill"></div></div>` +
        `<span class="mcp-time">0:00</span>` +
        `<audio class="mcp-audio" preload="none" src="${escapeAttr(src)}"></audio>` +
        `</div>`;
    return `<div class="music-cue"><div class="music-cue-item">${meta}${player}</div></div>`;
}

function cueShortcode({ text = '' } = {}) {
    const t = String(text).trim();
    if (!t) return '';
    const m = t.match(SPEAKER_RE);
    let body;
    if (m) {
        const label = m[1];
        const rest = t.slice(m[0].length);
        body = `<p><span class="speaker">${escapeHtml(label)}:</span>${escapeHtml(rest)}</p>`;
    } else {
        body = `<p>${escapeHtml(t)}</p>`;
    }
    return `<div class="music-cue"><div class="music-cue-item">${body}</div></div>`;
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
}

module.exports = function (eleventyConfig) {
    // Nunjucks named-arg shortcodes. In a markdown file:
    //   {% audio src="..." label="..." duration="..." %}
    //   {% cue text="..." %}
    // The kwargs come in as a single object (with a __keywords marker
    // that we ignore).
    eleventyConfig.addShortcode('audio', function (kwargs = {}) {
        return audioShortcode(kwargs);
    });
    eleventyConfig.addShortcode('cue', function (kwargs = {}) {
        return cueShortcode(kwargs);
    });
};
