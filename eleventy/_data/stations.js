// Parses content/pages/stations.md into structured station data.
// Each H2 names a US state; each list item is `[<City>: <Callsign> <Freq> - <Schedule>](<URL>)`.

const fs = require('fs');
const path = require('path');

// Map state name -> 2-letter code (50 states + DC).
const STATE_CODES = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'District of Columbia': 'DC', 'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI',
    'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
    'Wisconsin': 'WI', 'Wyoming': 'WY'
};

// Adjacency list (2-letter codes). Used when home state has <3 stations.
const ADJACENT = {
    AL: ['FL', 'GA', 'TN', 'MS'],
    AK: ['WA'],
    AZ: ['CA', 'NV', 'UT', 'NM', 'CO'],
    AR: ['LA', 'MS', 'TN', 'MO', 'OK', 'TX'],
    CA: ['OR', 'NV', 'AZ'],
    CO: ['WY', 'NE', 'KS', 'OK', 'NM', 'UT'],
    CT: ['NY', 'MA', 'RI'],
    DE: ['MD', 'PA', 'NJ'],
    DC: ['MD', 'VA'],
    FL: ['GA', 'AL'],
    GA: ['FL', 'AL', 'TN', 'NC', 'SC'],
    HI: [],
    ID: ['WA', 'OR', 'NV', 'UT', 'WY', 'MT'],
    IL: ['WI', 'IA', 'MO', 'KY', 'IN'],
    IN: ['IL', 'KY', 'OH', 'MI'],
    IA: ['MN', 'WI', 'IL', 'MO', 'NE', 'SD'],
    KS: ['NE', 'MO', 'OK', 'CO'],
    KY: ['IN', 'OH', 'WV', 'VA', 'TN', 'MO', 'IL'],
    LA: ['TX', 'AR', 'MS'],
    ME: ['NH'],
    MD: ['DE', 'PA', 'WV', 'VA', 'DC'],
    MA: ['NH', 'VT', 'NY', 'CT', 'RI'],
    MI: ['WI', 'IN', 'OH'],
    MN: ['ND', 'SD', 'IA', 'WI'],
    MS: ['LA', 'AR', 'TN', 'AL'],
    MO: ['IA', 'IL', 'KY', 'TN', 'AR', 'OK', 'KS', 'NE'],
    MT: ['ID', 'WY', 'SD', 'ND'],
    NE: ['SD', 'IA', 'MO', 'KS', 'CO', 'WY'],
    NV: ['CA', 'OR', 'ID', 'UT', 'AZ'],
    NH: ['ME', 'VT', 'MA'],
    NJ: ['NY', 'PA', 'DE'],
    NM: ['AZ', 'UT', 'CO', 'OK', 'TX'],
    NY: ['VT', 'MA', 'CT', 'NJ', 'PA'],
    NC: ['VA', 'TN', 'GA', 'SC'],
    ND: ['MT', 'SD', 'MN'],
    OH: ['MI', 'IN', 'KY', 'WV', 'PA'],
    OK: ['KS', 'MO', 'AR', 'TX', 'NM', 'CO'],
    OR: ['WA', 'ID', 'NV', 'CA'],
    PA: ['NY', 'NJ', 'DE', 'MD', 'WV', 'OH'],
    RI: ['CT', 'MA'],
    SC: ['NC', 'GA'],
    SD: ['ND', 'MN', 'IA', 'NE', 'WY', 'MT'],
    TN: ['KY', 'VA', 'NC', 'GA', 'AL', 'MS', 'AR', 'MO'],
    TX: ['NM', 'OK', 'AR', 'LA'],
    UT: ['ID', 'WY', 'CO', 'NM', 'AZ', 'NV'],
    VT: ['NY', 'NH', 'MA'],
    VA: ['MD', 'DC', 'WV', 'KY', 'TN', 'NC'],
    WA: ['ID', 'OR'],
    WV: ['PA', 'MD', 'VA', 'KY', 'OH'],
    WI: ['MN', 'IA', 'IL', 'MI'],
    WY: ['MT', 'SD', 'NE', 'CO', 'UT', 'ID'],
};

function parseStations() {
    const filePath = path.join(__dirname, '..', '..', 'content', 'pages', 'stations.md');
    const md = fs.readFileSync(filePath, 'utf-8');

    const stations = [];
    let currentState = null;
    let currentStateCode = null;

    const lines = md.split('\n');
    const itemRe = /^-\s*\[([^:]+):\s*([^\]]+?)\]\(([^)]+)\)\s*$/;

    for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith('## ')) {
            currentState = line.slice(3).trim();
            currentStateCode = STATE_CODES[currentState] || null;
            continue;
        }
        if (!currentStateCode) continue;
        const m = line.match(itemRe);
        if (!m) continue;
        const city = m[1].trim();
        const rest = m[2].trim();
        const url = m[3].trim();

        // rest typically: "WLRH 89.3FM - Sundays, 5pm-6pm"
        const dash = rest.indexOf(' - ');
        let name, schedule;
        if (dash >= 0) {
            name = rest.slice(0, dash).trim();
            schedule = rest.slice(dash + 3).trim();
        } else {
            name = rest;
            schedule = '';
        }
        // Split callsign/frequency
        const nameParts = name.split(/\s+/);
        const callsign = nameParts[0];
        const frequency = nameParts.slice(1).join(' ');

        stations.push({
            state: currentState,
            stateCode: currentStateCode,
            city,
            callsign,
            frequency,
            schedule,
            url,
        });
    }

    return { stations, adjacent: ADJACENT };
}

module.exports = parseStations();
