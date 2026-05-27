/**
 * Date regex covering the rolling "recent" window for the CMS. Hard-filters
 * shows + segments visible in Sveltia so the editor doesn't have to load
 * 12K entries (which crashes the UI).
 *
 * Window: previous 2 months + current month + next month (~4 months,
 * ~16 shows / ~80 segments). Editors needing to edit older content use
 * the "Edit on GitHub" badge on the live page.
 *
 * Rebuilt on each Eleventy run. Refreshed weekly by .github/workflows/refresh-recent-window.yml.
 */
module.exports = function () {
    const now = new Date();
    const months = [];
    for (let delta = -2; delta <= 1; delta++) {
        const d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return {
        pattern: '^(' + months.join('|') + ')-',
        months,
        generatedAt: now.toISOString(),
    };
};
