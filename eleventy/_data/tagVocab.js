/**
 * Loads the editor-maintained tag vocabulary from
 * `content/admin/tag-vocab.yml` and exposes it to templates as
 * `tagVocab.all` (flat array of tag strings) and
 * `tagVocab.grouped` (domain → [tags] map preserving file order).
 *
 * The YAML file is the source of truth — see its preamble for the rules
 * editors should follow when modifying it.
 */

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const VOCAB_PATH = path.resolve(__dirname, '../../content/admin/tag-vocab.yml');

module.exports = function () {
    const raw = fs.readFileSync(VOCAB_PATH, 'utf8');
    const grouped = yaml.load(raw) || {};
    const all = [];
    for (const tags of Object.values(grouped)) {
        if (!Array.isArray(tags)) continue;
        for (const t of tags) all.push(t);
    }
    return { all, grouped };
};
