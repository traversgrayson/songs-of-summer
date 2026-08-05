
const CLIENT_ID = "fde86794c4bf4f17b9abb587fd72a9f5";
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = "playlist-modify-public playlist-modify-private";

const PLAYLIST_NAME = "Songs of the Summer 2026";
const PLAYLIST_DESCRIPTION = "Auto-generated from everyone's song of the summer map.";
const PLAYLIST_PUBLIC = true;

const SHEET_ID = "16QJmWOE9RqVYKXjD4HstQX5M4SO02ae56z4JQ3TpAZQ";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;

const TOKEN_KEY = "sots_spotify_token_v1";

// ====== DOM ======
const connectBtn = document.getElementById('connect-btn');
const generateBtn = document.getElementById('generate-btn');
const signoutBtn = document.getElementById('signout-btn');
const statusEl = document.getElementById('playlist-status');
const resultEl = document.getElementById('playlist-result');
const whoEl = document.getElementById('who-connected');

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.display = msg ? 'block' : 'none';
  statusEl.classList.toggle('error', isError);
}

// ====== PKCE HELPERS ======
function randomString(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

async function sha256base64url(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function redirectToSpotifyLogin() {
  const verifier = randomString(64);
  sessionStorage.setItem('sots_pkce_verifier', verifier);
  const challenge = await sha256base64url(verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const verifier = sessionStorage.getItem('sots_pkce_verifier');
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error('token exchange failed');
  return res.json();
}

async function refreshToken(refresh_token) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error('token refresh failed');
  return res.json();
}

function saveToken(data) {
  const stored = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || loadToken()?.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
  return stored;
}

function loadToken() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); }
  catch { return null; }
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function getValidAccessToken() {
  let token = loadToken();
  if (!token) return null;
  if (Date.now() < token.expires_at) return token.access_token;
  if (!token.refresh_token) return null;
  const refreshed = await refreshToken(token.refresh_token);
  token = saveToken(refreshed);
  return token.access_token;
}

// ====== SPOTIFY API ======
async function spotifyFetch(url, accessToken, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify API error ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

function extractTrackId(link) {
  if (!link) return null;
  const m = link.match(/track\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

async function searchTrackUri(song, artist, accessToken) {
  const q = `track:${song} artist:${artist}`;
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`;
  const data = await spotifyFetch(url, accessToken);
  const item = data.tracks?.items?.[0];
  return item ? item.uri : null;
}

async function findExistingPlaylist(userId, accessToken) {
  let url = `https://api.spotify.com/v1/me/playlists?limit=50`;
  while (url) {
    const data = await spotifyFetch(url, accessToken);
    const found = data.items.find(p => p.name === PLAYLIST_NAME && p.owner.id === userId);
    if (found) return found.id;
    url = data.next;
  }
  return null;
}

async function createPlaylist(userId, accessToken) {
  const data = await spotifyFetch(`https://api.spotify.com/v1/users/${userId}/playlists`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      name: PLAYLIST_NAME,
      description: PLAYLIST_DESCRIPTION,
      public: PLAYLIST_PUBLIC
    })
  });
  return data.id;
}

async function overwritePlaylistTracks(playlistId, uris, accessToken) {
  // First 100 replaces the whole playlist; remaining batches get appended.
  const first = uris.slice(0, 100);
  await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ uris: first })
  });
  for (let i = 100; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100);
    await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ uris: batch })
    });
  }
}

// ====== SHEET ======
async function fetchSheetRows() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`sheet fetch failed (${res.status})`);
  const csvText = await res.text();
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  return parsed.data
    .map(r => ({
      name: (r['Name'] || '').trim(),
      song: (r['Song'] || '').trim(),
      artist: (r['Artist'] || '').trim(),
      link: (r['Link'] || '').trim()
    }))
    .filter(r => r.name);
}

// ====== MAIN FLOWS ======
async function handleRedirectIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;

  setStatus('connecting to Spotify…');
  try {
    const data = await exchangeCodeForToken(code);
    saveToken(data);
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (err) {
    console.error(err);
    setStatus('Spotify connection failed — try again', true);
  }
}

async function updateUiForAuthState() {
  const accessToken = await getValidAccessToken().catch(() => null);
  if (accessToken) {
    connectBtn.style.display = 'none';
    generateBtn.style.display = 'inline-block';
    signoutBtn.style.display = 'inline-block';
    try {
      const me = await spotifyFetch('https://api.spotify.com/v1/me', accessToken);
      whoEl.textContent = `connected as ${me.display_name || me.id}`;
    } catch {
      whoEl.textContent = '';
    }
  } else {
    connectBtn.style.display = 'inline-block';
    generateBtn.style.display = 'none';
    signoutBtn.style.display = 'none';
    whoEl.textContent = '';
  }
}

async function generatePlaylist() {
  generateBtn.disabled = true;
  resultEl.innerHTML = '';
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) { setStatus('please connect Spotify first', true); return; }

    setStatus('loading sheet…');
    const rows = await fetchSheetRows();

    setStatus('matching tracks on Spotify…');
    const uris = [];
    for (const row of rows) {
      const trackId = extractTrackId(row.link);
      if (trackId) {
        uris.push(`spotify:track:${trackId}`);
        continue;
      }
      if (row.song && row.artist) {
        try {
          const uri = await searchTrackUri(row.song, row.artist, accessToken);
          if (uri) uris.push(uri);
          else console.warn(`No Spotify match for "${row.song}" by ${row.artist} (${row.name})`);
        } catch (err) {
          console.warn(`Search failed for "${row.song}" by ${row.artist}`, err);
        }
      }
    }

    const uniqueUris = [...new Set(uris)];
    if (!uniqueUris.length) {
      setStatus('no matching Spotify tracks found', true);
      return;
    }

    setStatus('finding or creating the playlist…');
    const me = await spotifyFetch('https://api.spotify.com/v1/me', accessToken);
    let playlistId = await findExistingPlaylist(me.id, accessToken);
    if (!playlistId) playlistId = await createPlaylist(me.id, accessToken);

    setStatus(`syncing ${uniqueUris.length} tracks…`);
    await overwritePlaylistTracks(playlistId, uniqueUris, accessToken);

    setStatus('');
    resultEl.innerHTML = `
      <p class="result-line">✓ synced ${uniqueUris.length} of ${rows.length} people's songs</p>
      <a class="result-link" href="https://open.spotify.com/playlist/${playlistId}" target="_blank" rel="noopener">
        Open playlist in Spotify →
      </a>
      <iframe class="result-embed" src="https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator&theme=0"
        width="100%" height="352" frameborder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"></iframe>`;
  } catch (err) {
    console.error(err);
    setStatus('something went wrong — check the console for details', true);
  } finally {
    generateBtn.disabled = false;
  }
}

// ====== INIT ======
connectBtn.addEventListener('click', redirectToSpotifyLogin);
generateBtn.addEventListener('click', generatePlaylist);
signoutBtn.addEventListener('click', () => { clearToken(); updateUiForAuthState(); resultEl.innerHTML = ''; });

(async function init() {
  await handleRedirectIfPresent();
  await updateUiForAuthState();
})();
