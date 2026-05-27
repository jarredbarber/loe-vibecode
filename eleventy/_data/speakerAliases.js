/**
 * Manual alias map for transcript speaker labels → canonical slug.
 *
 * Values are URL-safe slugs (lowercase, ascii). Keys are the literal
 * uppercase tokens that may appear at the start of a transcript paragraph,
 * including punctuation variants we've observed (curly vs. straight
 * apostrophe, etc.).
 *
 * Display names are looked up via DISPLAY_NAMES (keyed by canonical slug)
 * so we can render "Aynsley O'Neill" instead of title-cased "Oneill".
 *
 * Anyone NOT in this table falls back to a slug derived from the label
 * (lowercased, non-alnum stripped) and a title-cased display name.
 */

const ALIASES = {
    // Hosts.
    "CURWOOD": "curwood",
    "O'NEILL": "oneill",
    "O’NEILL": "oneill",
    "DOERING": "doering",
    "BASCOMB": "bascomb",
    "YOUNG": "young",

    // Frequent contributors / correspondents.
    "DYKSTRA": "dykstra",
    "MCKIBBEN": "mckibben",
    "McKIBBEN": "mckibben",
    "PALMER": "palmer",
    "GELLERMAN": "gellerman",
    "TOOMEY": "toomey",
    "TROWBRIDGE": "trowbridge",
    "PFEIFFER": "pfeiffer",
    "MARTIN": "martin",
    "ROSS": "ross",
    "JANG": "jang",
    "ARSENAULT": "arsenault",
    "HARRINGTON": "harrington",
    "GROSSMAN": "grossman",
    "DUFFIELD": "duffield",
    "RICHARDSON": "richardson",
};

// Fuller display names for canonical slugs. Anything missing falls back to
// title-casing the slug.
const DISPLAY_NAMES = {
    "curwood": "Steve Curwood",
    "oneill": "Aynsley O'Neill",
    "doering": "Jenni Doering",
    "bascomb": "Bobby Bascomb",
    "young": "Jeff Young",
    "dykstra": "Peter Dykstra",
    "mckibben": "Bill McKibben",
    "palmer": "Helen Palmer",
    "gellerman": "Bruce Gellerman",
    "toomey": "Diane Toomey",
};

function titleCase(s) {
    return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Normalize a raw speaker label (e.g. "O'NEILL") to a {slug, name} pair.
 * Returns null for labels we choose to ignore (generic "MAN", "WOMAN",
 * "NARRATOR", "VOICEOVER", numbered crowd lines, etc.).
 */
function normalizeSpeaker(rawLabel) {
    if (!rawLabel) return null;
    const trimmed = rawLabel.trim();

    // Skip generic / anonymous voices and stage directions.
    if (/^(MAN|WOMAN|CHILD|NARRATOR|VOICE(OVER)?|REPORTER|ANNOUNCER|CROWD|AUDIENCE|HOST|GUEST|CALLER|SPEAKER|VOICES?)\s*\d*$/i.test(trimmed)) {
        return null;
    }
    // Skip pure-number labels (e.g. "1:", "2:").
    if (/^\d+$/.test(trimmed)) return null;

    let slug;
    if (Object.prototype.hasOwnProperty.call(ALIASES, trimmed)) {
        slug = ALIASES[trimmed];
    } else {
        slug = trimmed
            .toLowerCase()
            .replace(/[’']/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    if (!slug) return null;

    // Drop slugs that are too short to be a real surname (one letter, etc.).
    if (slug.length < 2) return null;

    const name = DISPLAY_NAMES[slug] || titleCase(slug.replace(/-/g, ' '));
    return { slug, name };
}

module.exports = {
    ALIASES,
    DISPLAY_NAMES,
    normalizeSpeaker,
    // Tell Eleventy this is plain data, not a template needing rendering.
    eleventyDataKey: 'speakerAliases',
};
