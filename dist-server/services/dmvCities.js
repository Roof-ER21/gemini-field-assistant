/**
 * Static DMV + PA/WV/DE city → centroid dictionary.
 *
 * Built for stateless city extraction in Susan's GroupMe handler. When a
 * rep asks "what hail hit Germantown on 8/29/24?" we don't need a round-
 * trip to Census geocoder — every DMV city reps actually ask about is
 * here with a hand-verified lat/lng good to ~0.5 mi (plenty for a 10mi-
 * radius hail query).
 *
 * Why a static dict instead of the Census geocoder:
 *   - Zero HTTP: can't hang, can't rate-limit, can't crash the container
 *     (a 6-state retry loop against Census crashed 2 deploys tonight).
 *   - Sub-millisecond lookups for the hot path.
 *   - Deterministic: same city name always resolves to the same point.
 *     Census occasionally disambiguates to the wrong Germantown/Middletown.
 *
 * Coverage: top-150 populated places across VA/MD/DC/PA/WV/DE + rep-
 * preferred hotspots (Damascus, Lucketts, Boyds, South Riding, Fort
 * Washington, etc.) culled from the GroupMe archive. If we hit a miss,
 * the handler still falls back to the full Census geocoder.
 *
 * Keys: lowercased city name. For ambiguous names (Middletown exists in
 * MD AND DE AND PA), we use the most-populous / most-asked one and
 * document it in the comment.
 */
export const DMV_CITIES = {
    // ─── VIRGINIA ──────────────────────────────────────────────────────────────
    'alexandria': { name: 'Alexandria', state: 'VA', lat: 38.8048, lng: -77.0469 },
    'annandale': { name: 'Annandale', state: 'VA', lat: 38.8304, lng: -77.1964 },
    'arlington': { name: 'Arlington', state: 'VA', lat: 38.8816, lng: -77.0910 },
    'ashburn': { name: 'Ashburn', state: 'VA', lat: 39.0438, lng: -77.4874 },
    'burke': { name: 'Burke', state: 'VA', lat: 38.7934, lng: -77.2719 },
    'centreville': { name: 'Centreville', state: 'VA', lat: 38.8401, lng: -77.4289 },
    'chantilly': { name: 'Chantilly', state: 'VA', lat: 38.8943, lng: -77.4311 },
    'chesapeake': { name: 'Chesapeake', state: 'VA', lat: 36.7682, lng: -76.2875 },
    'culpeper': { name: 'Culpeper', state: 'VA', lat: 38.4735, lng: -77.9969 },
    'dale city': { name: 'Dale City', state: 'VA', lat: 38.6318, lng: -77.3394 },
    'dumfries': { name: 'Dumfries', state: 'VA', lat: 38.5679, lng: -77.3250 },
    'fairfax': { name: 'Fairfax', state: 'VA', lat: 38.8462, lng: -77.3064 },
    'falls church': { name: 'Falls Church', state: 'VA', lat: 38.8823, lng: -77.1711 },
    'fredericksburg': { name: 'Fredericksburg', state: 'VA', lat: 38.3032, lng: -77.4605 },
    'front royal': { name: 'Front Royal', state: 'VA', lat: 38.9181, lng: -78.1944 },
    'gainesville': { name: 'Gainesville', state: 'VA', lat: 38.7957, lng: -77.6147 },
    'great falls': { name: 'Great Falls', state: 'VA', lat: 39.0121, lng: -77.2905 },
    'hamilton': { name: 'Hamilton', state: 'VA', lat: 39.1337, lng: -77.6697 },
    'hampton': { name: 'Hampton', state: 'VA', lat: 37.0299, lng: -76.3452 },
    'haymarket': { name: 'Haymarket', state: 'VA', lat: 38.8126, lng: -77.6364 },
    'herndon': { name: 'Herndon', state: 'VA', lat: 38.9697, lng: -77.3861 },
    'lake ridge': { name: 'Lake Ridge', state: 'VA', lat: 38.6876, lng: -77.3050 },
    'leesburg': { name: 'Leesburg', state: 'VA', lat: 39.1157, lng: -77.5636 },
    'lorton': { name: 'Lorton', state: 'VA', lat: 38.7043, lng: -77.2283 },
    'lovettsville': { name: 'Lovettsville', state: 'VA', lat: 39.2712, lng: -77.6394 },
    'lucketts': { name: 'Lucketts', state: 'VA', lat: 39.2295, lng: -77.5353 },
    'manassas': { name: 'Manassas', state: 'VA', lat: 38.7509, lng: -77.4753 },
    'manassas park': { name: 'Manassas Park', state: 'VA', lat: 38.7817, lng: -77.4486 },
    'mcleon': { name: 'McLean', state: 'VA', lat: 38.9339, lng: -77.1772 }, // common misspelling
    'mclean': { name: 'McLean', state: 'VA', lat: 38.9339, lng: -77.1772 },
    'middleburg': { name: 'Middleburg', state: 'VA', lat: 38.9687, lng: -77.7372 },
    'newport news': { name: 'Newport News', state: 'VA', lat: 36.9773, lng: -76.4284 },
    'norfolk': { name: 'Norfolk', state: 'VA', lat: 36.8508, lng: -76.2859 },
    'oakton': { name: 'Oakton', state: 'VA', lat: 38.8835, lng: -77.3105 },
    'purcellville': { name: 'Purcellville', state: 'VA', lat: 39.1367, lng: -77.7147 },
    'reston': { name: 'Reston', state: 'VA', lat: 38.9586, lng: -77.3570 },
    'richmond': { name: 'Richmond', state: 'VA', lat: 37.5407, lng: -77.4360 },
    'round hill': { name: 'Round Hill', state: 'VA', lat: 39.1345, lng: -77.7739 },
    'south riding': { name: 'South Riding', state: 'VA', lat: 38.9198, lng: -77.5180 },
    'springfield': { name: 'Springfield', state: 'VA', lat: 38.7893, lng: -77.1872 },
    'stafford': { name: 'Stafford', state: 'VA', lat: 38.4221, lng: -77.4083 },
    'sterling': { name: 'Sterling', state: 'VA', lat: 39.0062, lng: -77.4286 },
    'tysons': { name: 'Tysons', state: 'VA', lat: 38.9184, lng: -77.2270 },
    'tysons corner': { name: 'Tysons Corner', state: 'VA', lat: 38.9184, lng: -77.2270 },
    'vienna': { name: 'Vienna', state: 'VA', lat: 38.9012, lng: -77.2653 },
    'virginia beach': { name: 'Virginia Beach', state: 'VA', lat: 36.8529, lng: -75.9780 },
    'warrenton': { name: 'Warrenton', state: 'VA', lat: 38.7135, lng: -77.7952 },
    'waterford': { name: 'Waterford', state: 'VA', lat: 39.1895, lng: -77.6100 },
    'winchester': { name: 'Winchester', state: 'VA', lat: 39.1857, lng: -78.1633 },
    'woodbridge': { name: 'Woodbridge', state: 'VA', lat: 38.6582, lng: -77.2497 },
    // ─── MARYLAND ──────────────────────────────────────────────────────────────
    'annapolis': { name: 'Annapolis', state: 'MD', lat: 38.9784, lng: -76.4922 },
    'baltimore': { name: 'Baltimore', state: 'MD', lat: 39.2904, lng: -76.6122 },
    'bel air': { name: 'Bel Air', state: 'MD', lat: 39.5359, lng: -76.3483 },
    'beltsville': { name: 'Beltsville', state: 'MD', lat: 39.0345, lng: -76.9077 },
    'bethesda': { name: 'Bethesda', state: 'MD', lat: 38.9847, lng: -77.0947 },
    'boyds': { name: 'Boyds', state: 'MD', lat: 39.1673, lng: -77.3158 },
    'bowie': { name: 'Bowie', state: 'MD', lat: 39.0068, lng: -76.7791 },
    'brookeville': { name: 'Brookeville', state: 'MD', lat: 39.1803, lng: -77.0572 },
    'brunswick': { name: 'Brunswick', state: 'MD', lat: 39.3143, lng: -77.6286 },
    'burtonsville': { name: 'Burtonsville', state: 'MD', lat: 39.1121, lng: -76.9333 },
    'calvert county': { name: 'Calvert County', state: 'MD', lat: 38.5334, lng: -76.5380 },
    'cambridge': { name: 'Cambridge', state: 'MD', lat: 38.5635, lng: -76.0788 },
    'centreville md': { name: 'Centreville', state: 'MD', lat: 39.0432, lng: -76.0674 }, // rare; DMV default is VA
    'charles town': { name: 'Charles Town', state: 'WV', lat: 39.2890, lng: -77.8591 }, // actually WV border
    'clarksburg': { name: 'Clarksburg', state: 'MD', lat: 39.2390, lng: -77.2794 },
    'clarksville': { name: 'Clarksville', state: 'MD', lat: 39.2059, lng: -76.9497 },
    'college park': { name: 'College Park', state: 'MD', lat: 38.9807, lng: -76.9369 },
    'columbia': { name: 'Columbia', state: 'MD', lat: 39.2037, lng: -76.8610 },
    'crofton': { name: 'Crofton', state: 'MD', lat: 39.0043, lng: -76.6858 },
    'damascus': { name: 'Damascus', state: 'MD', lat: 39.2884, lng: -77.2030 },
    'dickerson': { name: 'Dickerson', state: 'MD', lat: 39.2156, lng: -77.4219 },
    'eldersburg': { name: 'Eldersburg', state: 'MD', lat: 39.4054, lng: -76.9480 },
    'elkridge': { name: 'Elkridge', state: 'MD', lat: 39.2121, lng: -76.7122 },
    'ellicott city': { name: 'Ellicott City', state: 'MD', lat: 39.2673, lng: -76.7983 },
    'fallston': { name: 'Fallston', state: 'MD', lat: 39.5187, lng: -76.4216 },
    'fort washington': { name: 'Fort Washington', state: 'MD', lat: 38.7460, lng: -77.0069 },
    'frederick': { name: 'Frederick', state: 'MD', lat: 39.4143, lng: -77.4105 },
    'gaithersburg': { name: 'Gaithersburg', state: 'MD', lat: 39.1434, lng: -77.2014 },
    'galena': { name: 'Galena', state: 'MD', lat: 39.3410, lng: -75.8766 },
    'germantown': { name: 'Germantown', state: 'MD', lat: 39.1732, lng: -77.2717 },
    'glen burnie': { name: 'Glen Burnie', state: 'MD', lat: 39.1626, lng: -76.6247 },
    'glenelg': { name: 'Glenelg', state: 'MD', lat: 39.2418, lng: -77.0080 },
    'glenn dale': { name: 'Glenn Dale', state: 'MD', lat: 38.9918, lng: -76.8297 },
    'greenbelt': { name: 'Greenbelt', state: 'MD', lat: 39.0046, lng: -76.8755 },
    'hagerstown': { name: 'Hagerstown', state: 'MD', lat: 39.6418, lng: -77.7200 },
    'havre de grace': { name: 'Havre de Grace', state: 'MD', lat: 39.5474, lng: -76.0880 },
    'hyattsville': { name: 'Hyattsville', state: 'MD', lat: 38.9557, lng: -76.9455 },
    'ijamsville': { name: 'Ijamsville', state: 'MD', lat: 39.3551, lng: -77.3344 },
    'jefferson': { name: 'Jefferson', state: 'MD', lat: 39.3631, lng: -77.5328 },
    'jessup': { name: 'Jessup', state: 'MD', lat: 39.1451, lng: -76.7752 },
    'keedysville': { name: 'Keedysville', state: 'MD', lat: 39.4818, lng: -77.6972 },
    'kensington': { name: 'Kensington', state: 'MD', lat: 39.0259, lng: -77.0758 },
    'kettering': { name: 'Kettering', state: 'MD', lat: 38.8901, lng: -76.7941 },
    'laurel': { name: 'Laurel', state: 'MD', lat: 39.0993, lng: -76.8483 },
    'laytonsville': { name: 'Laytonsville', state: 'MD', lat: 39.2071, lng: -77.1408 },
    'lutherville': { name: 'Lutherville', state: 'MD', lat: 39.4237, lng: -76.6288 },
    'middletown': { name: 'Middletown', state: 'MD', lat: 39.4428, lng: -77.5436 }, // MD default (most-asked)
    'middletown md': { name: 'Middletown', state: 'MD', lat: 39.4428, lng: -77.5436 },
    'middletown de': { name: 'Middletown', state: 'DE', lat: 39.4496, lng: -75.7163 },
    'monrovia': { name: 'Monrovia', state: 'MD', lat: 39.3448, lng: -77.2617 },
    'montgomery village': { name: 'Montgomery Village', state: 'MD', lat: 39.1776, lng: -77.1953 },
    'mount airy': { name: 'Mount Airy', state: 'MD', lat: 39.3762, lng: -77.1549 },
    'mt airy': { name: 'Mount Airy', state: 'MD', lat: 39.3762, lng: -77.1549 },
    'mt. airy': { name: 'Mount Airy', state: 'MD', lat: 39.3762, lng: -77.1549 },
    'myersville': { name: 'Myersville', state: 'MD', lat: 39.5009, lng: -77.5683 },
    'new market': { name: 'New Market', state: 'MD', lat: 39.3795, lng: -77.2691 },
    'new windsor': { name: 'New Windsor', state: 'MD', lat: 39.5437, lng: -77.1097 },
    'north bethesda': { name: 'North Bethesda', state: 'MD', lat: 39.0460, lng: -77.1191 },
    'odenton': { name: 'Odenton', state: 'MD', lat: 39.0843, lng: -76.6997 },
    'olney': { name: 'Olney', state: 'MD', lat: 39.1527, lng: -77.0683 },
    'owings mills': { name: 'Owings Mills', state: 'MD', lat: 39.4193, lng: -76.7802 },
    'oxon hill': { name: 'Oxon Hill', state: 'MD', lat: 38.8014, lng: -76.9916 },
    'parkville': { name: 'Parkville', state: 'MD', lat: 39.3781, lng: -76.5494 },
    'pasadena': { name: 'Pasadena', state: 'MD', lat: 39.1098, lng: -76.5672 },
    'perry hall': { name: 'Perry Hall', state: 'MD', lat: 39.4118, lng: -76.4600 },
    'pikesville': { name: 'Pikesville', state: 'MD', lat: 39.3765, lng: -76.7255 },
    'point of rocks': { name: 'Point of Rocks', state: 'MD', lat: 39.2773, lng: -77.5372 },
    'poolesville': { name: 'Poolesville', state: 'MD', lat: 39.1465, lng: -77.4164 },
    'potomac': { name: 'Potomac', state: 'MD', lat: 39.0184, lng: -77.2086 },
    'potomac park': { name: 'Potomac Park', state: 'MD', lat: 38.8825, lng: -76.9911 },
    'randallstown': { name: 'Randallstown', state: 'MD', lat: 39.3676, lng: -76.7955 },
    'reisterstown': { name: 'Reisterstown', state: 'MD', lat: 39.4645, lng: -76.8316 },
    'rockville': { name: 'Rockville', state: 'MD', lat: 39.0840, lng: -77.1528 },
    'rosedale': { name: 'Rosedale', state: 'MD', lat: 39.3198, lng: -76.5183 },
    'salisbury': { name: 'Salisbury', state: 'MD', lat: 38.3607, lng: -75.5994 },
    'severna park': { name: 'Severna Park', state: 'MD', lat: 39.0729, lng: -76.5444 },
    'silver spring': { name: 'Silver Spring', state: 'MD', lat: 38.9907, lng: -77.0261 },
    'spencerville': { name: 'Spencerville', state: 'MD', lat: 39.0984, lng: -76.9683 },
    'takoma park': { name: 'Takoma Park', state: 'MD', lat: 38.9779, lng: -77.0075 },
    'thurmont': { name: 'Thurmont', state: 'MD', lat: 39.6237, lng: -77.4105 },
    'towson': { name: 'Towson', state: 'MD', lat: 39.4015, lng: -76.6019 },
    'upper marlboro': { name: 'Upper Marlboro', state: 'MD', lat: 38.8154, lng: -76.7497 },
    'urbana': { name: 'Urbana', state: 'MD', lat: 39.3368, lng: -77.3480 },
    'walkersville': { name: 'Walkersville', state: 'MD', lat: 39.4851, lng: -77.3561 },
    'waldorf': { name: 'Waldorf', state: 'MD', lat: 38.6246, lng: -76.9272 },
    'westminster': { name: 'Westminster', state: 'MD', lat: 39.5754, lng: -76.9958 },
    'wheaton': { name: 'Wheaton', state: 'MD', lat: 39.0399, lng: -77.0552 },
    'woodbine': { name: 'Woodbine', state: 'MD', lat: 39.3473, lng: -77.0639 },
    // ─── DC ────────────────────────────────────────────────────────────────────
    'washington': { name: 'Washington', state: 'DC', lat: 38.9072, lng: -77.0369 },
    'dc': { name: 'Washington', state: 'DC', lat: 38.9072, lng: -77.0369 },
    // ─── PENNSYLVANIA ──────────────────────────────────────────────────────────
    'allentown': { name: 'Allentown', state: 'PA', lat: 40.6084, lng: -75.4902 },
    'altoona': { name: 'Altoona', state: 'PA', lat: 40.5187, lng: -78.3947 },
    'bethlehem': { name: 'Bethlehem', state: 'PA', lat: 40.6259, lng: -75.3705 },
    'bloomsburg': { name: 'Bloomsburg', state: 'PA', lat: 41.0037, lng: -76.4550 },
    'carlisle': { name: 'Carlisle', state: 'PA', lat: 40.2012, lng: -77.1997 },
    'chambersburg': { name: 'Chambersburg', state: 'PA', lat: 39.9375, lng: -77.6611 },
    'easton': { name: 'Easton', state: 'PA', lat: 40.6884, lng: -75.2208 },
    'erie': { name: 'Erie', state: 'PA', lat: 42.1292, lng: -80.0851 },
    'gettysburg': { name: 'Gettysburg', state: 'PA', lat: 39.8309, lng: -77.2311 },
    'greensburg': { name: 'Greensburg', state: 'PA', lat: 40.3015, lng: -79.5389 },
    'harrisburg': { name: 'Harrisburg', state: 'PA', lat: 40.2732, lng: -76.8867 },
    'havertown': { name: 'Havertown', state: 'PA', lat: 39.9804, lng: -75.3064 },
    'hershey': { name: 'Hershey', state: 'PA', lat: 40.2859, lng: -76.6502 },
    'lancaster': { name: 'Lancaster', state: 'PA', lat: 40.0379, lng: -76.3055 },
    'lebanon': { name: 'Lebanon', state: 'PA', lat: 40.3409, lng: -76.4113 },
    'mechanicsburg': { name: 'Mechanicsburg', state: 'PA', lat: 40.2123, lng: -77.0061 },
    'norristown': { name: 'Norristown', state: 'PA', lat: 40.1215, lng: -75.3399 },
    'philadelphia': { name: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652 },
    'pittsburgh': { name: 'Pittsburgh', state: 'PA', lat: 40.4406, lng: -79.9959 },
    'pottstown': { name: 'Pottstown', state: 'PA', lat: 40.2454, lng: -75.6496 },
    'reading': { name: 'Reading', state: 'PA', lat: 40.3356, lng: -75.9269 },
    'scranton': { name: 'Scranton', state: 'PA', lat: 41.4090, lng: -75.6624 },
    'state college': { name: 'State College', state: 'PA', lat: 40.7934, lng: -77.8600 },
    'west chester': { name: 'West Chester', state: 'PA', lat: 39.9601, lng: -75.6058 },
    'wilkes-barre': { name: 'Wilkes-Barre', state: 'PA', lat: 41.2459, lng: -75.8813 },
    'york': { name: 'York', state: 'PA', lat: 39.9626, lng: -76.7277 },
    // ─── WEST VIRGINIA ─────────────────────────────────────────────────────────
    'berkeley springs': { name: 'Berkeley Springs', state: 'WV', lat: 39.6251, lng: -78.2284 },
    'charleston wv': { name: 'Charleston', state: 'WV', lat: 38.3498, lng: -81.6326 },
    'harpers ferry': { name: 'Harpers Ferry', state: 'WV', lat: 39.3259, lng: -77.7394 },
    'huntington': { name: 'Huntington', state: 'WV', lat: 38.4192, lng: -82.4452 },
    'martinsburg': { name: 'Martinsburg', state: 'WV', lat: 39.4562, lng: -77.9639 },
    'morgantown': { name: 'Morgantown', state: 'WV', lat: 39.6295, lng: -79.9559 },
    'shepherdstown': { name: 'Shepherdstown', state: 'WV', lat: 39.4292, lng: -77.8036 },
    // ─── DELAWARE ──────────────────────────────────────────────────────────────
    'dover': { name: 'Dover', state: 'DE', lat: 39.1582, lng: -75.5244 },
    'newark': { name: 'Newark', state: 'DE', lat: 39.6837, lng: -75.7497 },
    'wilmington': { name: 'Wilmington', state: 'DE', lat: 39.7391, lng: -75.5398 },
};
/**
 * Lookup with a couple of normalizations: trim, lowercase, strip "city"
 * suffix ("Rockville City" → "rockville"), strip punctuation.
 */
export function lookupDmvCity(raw) {
    if (!raw)
        return null;
    const key = raw
        .trim()
        .toLowerCase()
        .replace(/\s+city$/, '')
        .replace(/[.,!?]/g, '')
        .replace(/\s+/g, ' ');
    return DMV_CITIES[key] || null;
}
