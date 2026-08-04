// Pre-computed lat/lng for locations already in the sheet as of Aug 2026.
// Keys are lowercased, trimmed location strings exactly as they appear in the
// "Location" column. Any location NOT found here gets geocoded live via
// Nominatim in script.js, then cached in localStorage so it's only looked up once.
const KNOWN_LOCATIONS = {
  "landgrove, vt": [43.2686, -72.8317],
  "washington dc": [38.9072, -77.0369],
  "burlington, vt": [44.4759, -73.2121],
  "lander, wy": [42.8330, -108.7307],
  "reading, pa": [40.3356, -75.9269],
  "cordoba, argentina": [-31.4201, -64.1888],
  "san jose, ca": [37.3382, -121.8863],
  "san fransisco, ca": [37.7749, -122.4194],
  "san francisco, ca": [37.7749, -122.4194],
  "brooklyn, ny, ny": [40.6782, -73.9442],
  "brooklyn, ny": [40.6782, -73.9442],
  "davis, ca": [38.5449, -121.7405],
  "los angeles, ca": [34.0522, -118.2437],
  "inwood, ny, ny": [40.8677, -73.9212],
  "jamaica plain, ma": [42.3097, -71.1151],
  "newport, vt": [44.9362, -72.2043],
  "gilbert, az": [33.3528, -111.7890],
  "mystic, ct": [41.3543, -71.9660],
  "providence, ri": [41.8240, -71.4128],
  "upperville, va": [38.9807, -77.8969],
  "vancouver": [49.2827, -123.1207],
  "worcester, ma": [42.2626, -71.8023],
  "genova, italy": [44.4056, 8.9463],
  "palo alto, ca": [37.4419, -122.1430]
};
