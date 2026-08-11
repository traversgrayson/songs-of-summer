// ====== CONFIG ======
// Google Sheet must be shared as "Anyone with the link can view."
// This is the "export as CSV" endpoint for the first sheet tab (gid=0).
const SHEET_ID = "16QJmWOE9RqVYKXjD4HstQX5M4SO02ae56z4JQ3TpAZQ";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;

const PALETTE = ["#FF6B5B", "#FFC93C", "#00C2C2", "#9B5DE5", "#FF5FA2"];
const GEOCODE_CACHE_KEY = "sots_geocode_cache_v1";

// ====== MAP SETUP ======
const map = L.map('map', { zoomControl: false, worldCopyJump: true })
  .setView([30, -30], 2.4);

L.control.zoom({ position: 'topright' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

const statusEl = document.getElementById('status');
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.add('visible');
  statusEl.classList.toggle('error', isError);
}
function hideStatus() { statusEl.classList.remove('visible'); }

// ====== HELPERS ======
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function extractTrackId(link) {
  if (!link) return null;
  const m = link.match(/track\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

function extractYouTubeId(link) {
  if (!link) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = link.match(p);
    if (m) return m[1];
  }
  return null;
}

function buildEmbed(link) {
  const ytId = extractYouTubeId(link);
  if (ytId) {
    return `<iframe width="100%" height="152"
        src="https://www.youtube.com/embed/${ytId}"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        loading="lazy" allowfullscreen></iframe>`;
  }
  const trackId = extractTrackId(link);
  if (trackId) {
    return `<iframe src="https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0"
        width="100%" height="80" frameborder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"></iframe>`;
  }
  return `<div class="pop-noembed">no song added yet</div>`;
}

function loadGeocodeCache() {
  try { return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY)) || {}; }
  catch { return {}; }
}
function saveGeocodeCache(cache) {
  try { localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

async function geocodeLive(location) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('geocode failed');
  const data = await res.json();
  if (!data.length) throw new Error('no results');
  return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ====== MARKER ICON ======
const isMobile = window.matchMedia('(max-width: 560px)').matches;
const MARKER_SIZE = isMobile ? 30 : 22;
const MARKER_CORE_SIZE = isMobile ? 16 : 12;

function makeIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div class="pulse-marker">
             <div class="ring" style="background:${color}"></div>
             <div class="core" style="background:${color}"></div>
           </div>`,
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
    popupAnchor: [0, -(MARKER_SIZE / 2)]
  });
}

// ====== POPUP CONTENT ======
function popupHtml(entry, color) {
  const embed = buildEmbed(entry.link);

  const songBlock = entry.song
    ? `<p class="pop-song">${escapeHtml(entry.song)}</p>
       <p class="pop-artist">${escapeHtml(entry.artist || '')}</p>`
    : '';

  return `
    <div class="pop">
      <div class="pop-accent" style="background:${color}"></div>
      <p class="pop-name">${escapeHtml(entry.name)}</p>
      <p class="pop-location">${escapeHtml(entry.location)}</p>
      ${songBlock}
      ${embed}
    </div>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ====== JITTER for overlapping locations ======
function jitter([lat, lng], index) {
  if (index === 0) return [lat, lng];
  const angle = index * 2.399963; // golden angle spiral, spreads pins evenly
  const radius = 0.06 * Math.sqrt(index);
  return [lat + radius * Math.cos(angle), lng + radius * Math.sin(angle)];
}

// ====== MAIN ======
async function main() {
  setStatus('loading songs…');

  let csvText;
  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`sheet fetch failed (${res.status})`);
    csvText = await res.text();
  } catch (err) {
    setStatus('couldn\'t load the sheet — check it\'s shared as "Anyone with the link"', true);
    console.error(err);
    return;
  }

  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data
    .map(r => ({
      name: (r['Name'] || '').trim(),
      location: (r['Location'] || '').trim(),
      song: (r['Song'] || '').trim(),
      artist: (r['Artist'] || '').trim(),
      link: (r['Link'] || r['Embed Linjk'] || r['Embed Link'] || '').trim(),
      lat: parseFloat(r['Latitude']),
      lng: parseFloat(r['Longitude'])
    }))
    .filter(r => r.name && r.location);

  if (!rows.length) {
    setStatus('no entries found in the sheet yet', true);
    return;
  }

  const geocodeCache = loadGeocodeCache();
  const locationCounts = {};
  const bounds = [];
  let cacheDirty = false;

  for (const entry of rows) {
    const key = entry.location.toLowerCase();
    const hasSheetCoords = !isNaN(entry.lat) && !isNaN(entry.lng);
    let coords = hasSheetCoords ? [entry.lat, entry.lng] : (KNOWN_LOCATIONS[key] || geocodeCache[key]);

    if (!coords) {
      setStatus(`locating ${entry.location}…`);
      try {
        coords = await geocodeLive(entry.location);
        geocodeCache[key] = coords;
        cacheDirty = true;
        await sleep(1100); // respect Nominatim's 1 req/sec usage policy
      } catch (err) {
        console.warn(`Could not geocode "${entry.location}"`, err);
        continue;
      }
    }

    const coordKey = `${coords[0].toFixed(4)},${coords[1].toFixed(4)}`;
    const idx = locationCounts[coordKey] || 0;
    locationCounts[coordKey] = idx + 1;
    const [lat, lng] = jitter(coords, idx);

    const color = hashColor(entry.name);
    L.marker([lat, lng], { icon: makeIcon(color) })
      .addTo(map)
      .bindPopup(popupHtml(entry, color), { maxWidth: 280 });

    bounds.push([lat, lng]);
  }

  if (cacheDirty) saveGeocodeCache(geocodeCache);

  if (bounds.length) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 6 });

  const songCount = rows.filter(r => r.song).length;
  document.getElementById('entry-count').textContent = rows.length;
  document.getElementById('entry-count-2').textContent = songCount;

  hideStatus();
}

main();
