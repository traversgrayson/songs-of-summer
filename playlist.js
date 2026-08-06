// ====== CONFIG ======
// After you run "Generate / Update Playlist" once on playlist-admin.html,
// copy the Playlist ID it shows you and paste it here. This page just
// displays that playlist — it never needs your Spotify login.
const PLAYLIST_ID = "7ziI0bX3JBLzFJr4wswcAF";

const wrap = document.getElementById('playlist-embed-wrap');

if (!PLAYLIST_ID) {
  wrap.innerHTML = `<p class="playlist-status error">
    no playlist connected yet — run the admin page once and paste the
    playlist ID into playlist.js
  </p>`;
} else {
  wrap.innerHTML = `
    <iframe class="result-embed" src="https://open.spotify.com/embed/playlist/${PLAYLIST_ID}?utm_source=generator&theme=0"
      width="100%" height="450" frameborder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"></iframe>`;
}
