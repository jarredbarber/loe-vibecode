// Map 3-digit zip prefix → centroid [lat, lng]. ~1000 entries, ~25 KB
// inlined into the stations page. Accuracy within a prefix is ~50 km,
// which is plenty to differentiate Boston (021) from Amherst (010-013).
//
// Replaces the old zipPrefixes → state mapping. State-level was too
// coarse to rank stations inside large states (e.g. MA: Boston vs
// Amherst).

const zips = require('us-zips');

function build() {
    const sums = new Map(); // prefix → { lat, lng, count }
    for (const [zip, loc] of Object.entries(zips)) {
        if (!loc || typeof loc.latitude !== 'number') continue;
        const prefix = zip.slice(0, 3);
        const cur = sums.get(prefix) || { lat: 0, lng: 0, count: 0 };
        cur.lat += loc.latitude;
        cur.lng += loc.longitude;
        cur.count += 1;
        sums.set(prefix, cur);
    }
    const out = {};
    for (const [prefix, { lat, lng, count }] of sums) {
        out[prefix] = [+(lat / count).toFixed(4), +(lng / count).toFixed(4)];
    }
    return out;
}

module.exports = build();
