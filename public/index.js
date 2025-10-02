// =================== CONFIG ===================
let CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN;
let rafId = null;

// =================== STATE ===================
let accessToken = null;
let tokenExpiry = 0;
let currentTrackId = null;
let isPlaying = false;
let currentProgressMs = 0;
let currentDurationMs = 0;
let pollInterval = null;
let lastUpdateTime = Date.now();

// =================== DOM ===================
const albumArt = document.getElementById("album-art");
const trackName = document.getElementById("track-name");
const artistName = document.getElementById("artist-name");
const playPauseBtn = document.getElementById("play-pause-btn");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const progressFill = document.getElementById("progress-fill");
const progressBar = document.querySelector(".progress-bar");
const currentTime = document.getElementById("current-time");
const duration = document.getElementById("duration");
const volumeSlider = document.getElementById("volume-slider");
const volumeValue = document.getElementById("volume-value");
const deviceName = document.getElementById("device-name");
const backgroundOverlay = document.getElementById("background-overlay");
const lyricsContent = document.getElementById("lyrics-content");

function getScrollParent(el) {
  let p = el && el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
    p = p.parentElement;
  }
  return null;
}

function scrollChildIntoViewCenter(scroller, child) {
  if (!scroller || !child) return;
  const cRect = scroller.getBoundingClientRect();
  const eRect = child.getBoundingClientRect();
  const delta = eRect.top + eRect.height / 2 - (cRect.top + cRect.height / 2);
  scroller.scrollTop += delta;
}

// =================== INIT ===================
window.addEventListener("load", () => {
  init().catch(console.error);
});

async function init() {
  try {
    const credentials = await fetchCredentials();
    CLIENT_ID = credentials.CLIENT_ID;
    CLIENT_SECRET = credentials.CLIENT_SECRET;
    REFRESH_TOKEN = credentials.REFRESH_TOKEN;

    setupEventListeners();
    setupMediaSession();
    await refreshAccessToken();
    await updateNowPlaying();

    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(updateNowPlaying, 5000);

    startProgressAnimation();
  } catch (e) {
    console.error("Init failed:", e);
    trackName.textContent = "Init failed";
    artistName.textContent = e?.message || "See console";
  }
}

// =================== TOKEN ===================
async function fetchCredentials() {
  const r = await fetch("/credentials.json");
  if (!r.ok) throw new Error(`credentials.json ${r.status}`);
  return r.json();
}

async function refreshAccessToken() {
  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: REFRESH_TOKEN,
      }),
    });

    const data = await response.json();
    if (data.access_token) {
      accessToken = data.access_token;
      tokenExpiry = Date.now() + data.expires_in * 1000;
      console.log("Got new access token");
    } else {
      console.error("Failed to refresh token", data);
    }
  } catch (err) {
    console.error("Error refreshing token", err);
  }
}

async function ensureAccessToken() {
  if (!accessToken || Date.now() >= tokenExpiry) {
    await refreshAccessToken();
  }
}

// =================== PROGRESS TICKER ===================
let lastTimeLabel = 0;
function startProgressAnimation() {
  if (rafId) cancelAnimationFrame(rafId);
  let last = performance.now();

  const tick = (now) => {
    const dt = now - last;
    last = now;

    if (isPlaying && currentDurationMs > 0) {
      currentProgressMs = Math.min(currentDurationMs, currentProgressMs + dt);
      const pct = currentDurationMs ? currentProgressMs / currentDurationMs : 0;
      progressFill.style.transform = `scaleX(${Math.min(
        1,
        Math.max(0.0001, pct)
      )})`;

      // Update time label at ~4 fps to reduce layout
      if (now - lastTimeLabel > 250) {
        currentTime.textContent = formatTime(currentProgressMs);
        lastTimeLabel = now;
      }

      updateLyricsHighlight(currentProgressMs);
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

// =================== MEDIA SESSION ===================
function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;

  navigator.mediaSession.setActionHandler("play", () => {
    if (!isPlaying) togglePlayPause();
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    if (isPlaying) togglePlayPause();
  });
  navigator.mediaSession.setActionHandler("previoustrack", skipPrevious);
  navigator.mediaSession.setActionHandler("nexttrack", skipNext);

  navigator.mediaSession.setActionHandler("seekto", (e) => {
    if (typeof e.seekTime === "number" && currentDurationMs) {
      seekToPosition(e.seekTime * 1000);
    }
  });
  navigator.mediaSession.setActionHandler("seekbackward", (e) => {
    const step = (e.seekOffset || 10) * 1000;
    seekToPosition(clamp(currentProgressMs - step, 0, currentDurationMs));
  });
  navigator.mediaSession.setActionHandler("seekforward", (e) => {
    const step = (e.seekOffset || 10) * 1000;
    seekToPosition(clamp(currentProgressMs + step, 0, currentDurationMs));
  });
  navigator.mediaSession.setActionHandler("stop", () => {
    if (isPlaying) togglePlayPause();
  });
}

// =================== PLAYER POLL ===================
async function updateNowPlaying() {
  if (!accessToken) return;
  await ensureAccessToken();

  try {
    const response = await fetch("https://api.spotify.com/v1/me/player", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 204) {
      updateUI(null);
      return;
    }
    if (response.status === 401) {
      await refreshAccessToken();
      return;
    }
    if (response.ok) {
      const data = await response.json();
      updateUI(data);
    }
  } catch (error) {
    console.error("Playback update error:", error);
  }
}

// =================== UI UPDATE ===================
const fallbackCover = "fallback.png";

function updateUI(data) {
  if (!data || !data.item) {
    trackName.textContent = "Not Playing";
    artistName.textContent = "Start playing on Spotify";
    if (albumArt.src !== fallbackCover) {
      albumArt.src = fallbackCover;
      backgroundOverlay.style.backgroundImage = `url(${fallbackCover})`;
    }
    deviceName.textContent = "No device";
    lyricsContent.textContent = "Start playing a song to see lyrics";
    progressFill.style.width = "0%";
    currentTime.textContent = "0:00";
    duration.textContent = "0:00";
    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
    isPlaying = false;
    return;
  }

  const track = data.item;
  const wasPlaying = isPlaying;
  isPlaying = !!data.is_playing;

  currentProgressMs = data.progress_ms || 0;
  currentDurationMs = track.duration_ms || 0;
  lastUpdateTime = Date.now();

  const progressPercent = currentDurationMs ? currentProgressMs / currentDurationMs : 0;
  progressFill.style.transform = `scaleX(${Math.min(
    1,
    Math.max(0.0001, progressPercent)
  )})`;
  currentTime.textContent = formatTime(currentProgressMs);
  duration.textContent = formatTime(currentDurationMs);

  trackName.textContent = track.name;
  artistName.textContent = track.artists.map((a) => a.name).join(", ");

  if (track.album.images.length > 0) {
    const imageUrl = track.album.images[0].url;
    if (albumArt.src !== imageUrl) {
      albumArt.src = imageUrl;
      backgroundOverlay.style.backgroundImage = `url(${imageUrl})`;
    }
  }

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name,
        artist: track.artists.map((a) => a.name).join(", "),
        album: track.album?.name || "",
        artwork: (track.album?.images || []).map((img) => ({
          src: img.url,
          sizes: `${img.width || 640}x${img.height || 640}`,
          type: "image/jpeg",
        })),
      });

      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

      if (typeof navigator.mediaSession.setPositionState === "function") {
        navigator.mediaSession.setPositionState({
          duration: currentDurationMs / 1000,
          position: currentProgressMs / 1000,
          playbackRate: 1.0,
        });
      }
    } catch {}
  }

  playIcon.style.display = isPlaying ? "none" : "block";
  pauseIcon.style.display = isPlaying ? "block" : "none";

  duration.textContent = formatTime(track.duration_ms);

  if (data.device) {
    deviceName.textContent = data.device.name;
    if (typeof data.device.volume_percent === "number") {
      volumeSlider.value = data.device.volume_percent;
      volumeValue.textContent = `${data.device.volume_percent}%`;
    }
  }

  if (currentTrackId !== track.id) {
    currentTrackId = track.id;
    fetchLyrics(track.name, track.artists[0].name);
  } else {
    updateLyricsHighlight(currentProgressMs);
  }

  if (!wasPlaying && isPlaying) {
    lastUpdateTime = Date.now();
  }
}

// =================== LYRICS ===================
let lrcLines = [];
let currentLyricIdx = -1;
let lyricEls = [];
let lyricOffsets = [];
let lyricsScroller = null;
let lastLyricPaint = 0;
let justRenderedLyrics = false;

async function fetchLyrics(trackTitle, artist) {
  lrcLines = [];
  currentLyricIdx = -1;
  lyricEls = [];
  lyricOffsets = [];
  lyricsScroller = null;
  lastLyricPaint = 0;
  lyricsContent.textContent = "Loading lyrics...";

  try {
    const q1 = `https://lrclib.net/api/get?track_name=${encodeURIComponent(
      trackTitle
    )}&artist_name=${encodeURIComponent(artist)}`;
    let r = await fetch(q1);
    let data = r.ok ? await r.json() : null;

    if (!data || (!data.syncedLyrics && !data.lrc)) {
      const q2 = `https://lrclib.net/api/search?track_name=${encodeURIComponent(
        trackTitle
      )}&artist_name=${encodeURIComponent(artist)}&limit=5`;
      const r2 = await fetch(q2);
      if (r2.ok) {
        const arr = await r2.json();
        data = Array.isArray(arr)
          ? arr.find((x) => x?.syncedLyrics || x?.lrc)
          : null;
      }
    }

    const lrcText = data?.syncedLyrics || data?.lrc || null;
    if (lrcText) {
      lrcLines = parseLRC(lrcText);
      if (lrcLines.length) {
        renderSyncedLyrics(lrcLines);
        updateLyricsHighlight(currentProgressMs || 0);
        return;
      }
    }
  } catch (e) {
    console.warn("LRCLIB fetch failed; falling back to plain lyrics", e);
  }

  try {
    const r = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(
        artist
      )}/${encodeURIComponent(trackTitle)}`
    );
    if (r.ok) {
      const j = await r.json();
      if (j.lyrics) {
        const clean = j.lyrics.trim().replace(/Paroles de la chanson.*$/s, "");
        const lines = clean.split("\n").filter(Boolean);
        lyricsContent.innerHTML = "";
        lines.forEach((line) => {
          const div = document.createElement("div");
          div.className = "lyric-line";
          div.textContent = line;
          lyricsContent.appendChild(div);
        });
        return;
      }
    }
    lyricsContent.textContent = "Lyrics not available for this song";
  } catch (e) {
    console.error("Plain lyrics fallback failed", e);
    lyricsContent.textContent = "Lyrics not available";
  }
}

function parseLRC(lrc) {
  const lines = lrc.split(/\r?\n/);
  const out = [];
  const timeTag = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const raw of lines) {
    let text = raw;
    let match;
    const stamps = [];
    timeTag.lastIndex = 0;
    while ((match = timeTag.exec(raw)) !== null) {
      const m = parseInt(match[1], 10) || 0;
      const s = parseInt(match[2], 10) || 0;
      const ms = match[3] ? parseInt(match[3].padEnd(3, "0"), 10) : 0;
      stamps.push(m * 60000 + s * 1000 + ms);
      text = text.replace(match[0], "");
    }
    text = text.trim();
    stamps.forEach((t) => out.push({ t, text }));
  }

  out.sort((a, b) => a.t - b.t);
  return out.filter((x) => x.text && x.text.replace(/\s+/g, "").length > 0);
}

function renderSyncedLyrics(lines) {
  lyricsContent.innerHTML = "";
  const frag = document.createDocumentFragment();
  lyricEls = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const d = document.createElement("div");
    d.className = "lyric-line";
    d.dataset.t = String(lines[i].t);
    d.textContent = lines[i].text;
    frag.appendChild(d);
    lyricEls[i] = d;
  }
  lyricsContent.appendChild(frag);

  lyricsScroller =
    getScrollParent(lyricsContent) ||
    document.querySelector(".lyrics-container");

  requestAnimationFrame(() => {
    lyricOffsets = lyricEls.map((el) => el.offsetTop);
    justRenderedLyrics = true; // <— snap on first highlight after layout
  });

  // keep offsets fresh if the box/font changes
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      lyricOffsets = lyricEls.map((el) => el.offsetTop);
    });
    ro.observe(lyricsContent);
  }
}

function updateLyricsHighlight(nowMs) {
  if (!lrcLines.length) return;

  const now = performance.now();
  if (now - lastLyricPaint < 83) return;
  lastLyricPaint = now;

  let lo = 0,
    hi = lrcLines.length - 1,
    idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lrcLines[mid].t <= nowMs) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx === -1 || idx === currentLyricIdx) return;

  if (currentLyricIdx >= 0 && lyricEls[currentLyricIdx]) {
    lyricEls[currentLyricIdx].classList.remove("active");
  }
  currentLyricIdx = idx;
  const activeEl = lyricEls[idx];
  if (!activeEl) return;
  activeEl.classList.add("active");

  // --- center active line robustly using viewport rects ---
  const sRect = lyricsScroller.getBoundingClientRect();
  const eRect = activeEl.getBoundingClientRect();

  // where the line currently is from the top of the scroller’s visible area
  const currentOffset = eRect.top - sRect.top;

  // where we want it: visually centered (change to a fraction for “top anchor”)
  const desiredOffset = (sRect.height - eRect.height) / 2; // center
  // e.g., keep near top instead: const desiredOffset = sRect.height * 0.15;

  const delta = currentOffset - desiredOffset;

  const snap = justRenderedLyrics || performance.now() - lastLyricPaint < 120;
  if (snap) {
    lyricsScroller.scrollTop += delta; // snap to target on first paint
    justRenderedLyrics = false;
  } else {
    lyricsScroller.scrollTop += Math.round(delta * 0.05); // ease toward target
  }
}

// =================== CONTROLS ===================
async function togglePlayPause() {
  if (!accessToken) return;
  const endpoint = isPlaying ? "pause" : "play";
  await ensureAccessToken();
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/${endpoint}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: "{}",
      }
    );
    if (response.status === 401) {
      await refreshAccessToken();
      return;
    }
    isPlaying = !isPlaying;
    if (isPlaying) lastUpdateTime = Date.now();
    playIcon.style.display = isPlaying ? "none" : "block";
    pauseIcon.style.display = isPlaying ? "block" : "none";
    setTimeout(updateNowPlaying, 300);
  } catch (error) {
    console.error("Play/pause error:", error);
  }
}

async function skipNext() {
  if (!accessToken) return;
  await ensureAccessToken();
  try {
    await fetch("https://api.spotify.com/v1/me/player/next", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setTimeout(updateNowPlaying, 500);
  } catch (error) {
    console.error("Skip next error:", error);
  }
}

async function skipPrevious() {
  if (!accessToken) return;
  await ensureAccessToken();
  try {
    await fetch("https://api.spotify.com/v1/me/player/previous", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setTimeout(updateNowPlaying, 500);
  } catch (error) {
    console.error("Skip previous error:", error);
  }
}

async function setVolume(volume) {
  if (!accessToken) return;
  await ensureAccessToken();
  try {
    await fetch(
      `https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.round(
        volume
      )}`,
      { method: "PUT", headers: { Authorization: `Bearer ${accessToken}` } }
    );
  } catch (error) {
    console.error("Volume error:", error);
  }
}

async function seekToPosition(positionMs) {
  if (!accessToken) return;
  await ensureAccessToken();
  try {
    await fetch(
      `https://api.spotify.com/v1/me/player/seek?position_ms=${Math.round(
        positionMs
      )}`,
      { method: "PUT", headers: { Authorization: `Bearer ${accessToken}` } }
    );
    currentProgressMs = positionMs;
    const pct = currentDurationMs ? currentProgressMs / currentDurationMs : 0;
    progressFill.style.transform = `scaleX(${Math.min(
      1,
      Math.max(0.0001, pct)
    )})`;
    currentTime.textContent = formatTime(currentProgressMs);
    updateLyricsHighlight(currentProgressMs);

    lastUpdateTime = Date.now();
  } catch (error) {
    console.error("Seek error:", error);
  }
}

// =================== EVENTS ===================
function setupEventListeners() {
  playPauseBtn.addEventListener("click", togglePlayPause);
  nextBtn.addEventListener("click", skipNext);
  prevBtn.addEventListener("click", skipPrevious);

  volumeSlider.addEventListener("input", (e) => {
    const volume = e.target.value;
    volumeValue.textContent = `${volume}%`;
  });
  volumeSlider.addEventListener("change", (e) => {
    setVolume(e.target.value);
  });

  progressBar.addEventListener("click", (e) => {
    if (!currentDurationMs) return;
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seekToPosition(percent * currentDurationMs);
  });

  document.addEventListener("keydown", (e) => {
    const block = new Set([
      " ",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
    ]);
    if (block.has(e.key)) e.preventDefault();

    switch (e.key) {
      case " ":
        togglePlayPause();
        break;
      case "ArrowRight":
        skipNext();
        break;
      case "ArrowLeft":
        skipPrevious();
        break;
      case "ArrowUp":
        setSiteVolumePercent(parseInt(volumeSlider.value) + 5);
        break;
      case "ArrowDown":
        setSiteVolumePercent(parseInt(volumeSlider.value) - 5);
        break;

      case "MediaPlayPause":
        togglePlayPause();
        break;
      case "MediaTrackNext":
        skipNext();
        break;
      case "MediaTrackPrevious":
        skipPrevious();
        break;
      case "MediaStop":
        if (isPlaying) togglePlayPause();
        break;

      case "AudioVolumeUp":
        setSiteVolumePercent(parseInt(volumeSlider.value) + 5);
        break;
      case "AudioVolumeDown":
        setSiteVolumePercent(parseInt(volumeSlider.value) - 5);
        break;
      case "AudioVolumeMute":
        setSiteVolumePercent(0);
        break;
    }
  });
}

// =================== UTIL ===================
function formatTime(ms) {
  if (!ms || ms < 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function setSiteVolumePercent(pct) {
  const v = clamp(Math.round(pct), 0, 100);
  volumeSlider.value = v;
  volumeValue.textContent = `${v}%`;
  setVolume(v);
}

document.addEventListener("contextmenu", (e) => e.preventDefault());
