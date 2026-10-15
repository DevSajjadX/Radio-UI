import { createVisualizer } from './visualizer.js';

const $ = (id) => document.getElementById(id);

const PLAY_ICON = '<svg class="glyph-play" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M8.5 6.25 19 12 8.5 17.75Z"/></svg>';
const STOP_ICON = '<svg class="glyph-stop" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/></svg>';

const fallbackData = {
  name: 'Radio.demo',
  tagline: 'Independent radio, around the clock.',
  qualities: [
    { id: '192', label: 'High', detail: '192 kbps · richest sound' },
    { id: '128', label: 'Standard', detail: '128 kbps · balanced sound and data' },
    { id: '64', label: 'Data saver', detail: '64 kbps · lighter on mobile data' },
  ],
  genres: [
    {
      id: 'afterglow', name: 'Afterglow', listeners: 284,
      nowPlaying: { artist: 'Maya June & The Midnight Telephone Orchestra', title: 'Soft Static on the Last Train Home Before Sunrise (Extended Mix)' },
      streams: { 64: '', 128: '', 192: '' },
      history: [
        { artist: 'North Arcade', title: 'Polaroid Skies Over an Empty Parking Lot in Late September', started: Date.now() / 1000 - 260 },
        { artist: 'Lumen featuring The Overnight Choir of Saint Petersburg', title: 'Late Checkout', started: Date.now() / 1000 - 590 },
        { artist: 'Sienna Park', title: 'Half Awake', started: Date.now() / 1000 - 930 },
      ],
    },
    {
      id: 'pulse', name: 'Pulse', listeners: 431,
      nowPlaying: { artist: 'Night Service', title: 'Neon Habit (Somebody Turn the Lights Back On Remix)' },
      streams: { 64: '', 128: '', 192: '' },
      history: [
        { artist: 'Phase Club', title: 'Antenna', started: Date.now() / 1000 - 215 },
        { artist: 'Dahlia', title: 'Mirrored Rooms', started: Date.now() / 1000 - 508 },
        { artist: 'Mono Drive', title: 'No Sleep', started: Date.now() / 1000 - 884 },
      ],
    },
    {
      id: 'drift', name: 'Drift', listeners: 196,
      nowPlaying: { artist: 'Low Tides and the Very Long Band Name Collective', title: 'Blue Hours' },
      streams: { 64: '', 128: '', 192: '' },
      history: [
        { artist: 'The Quiet North', title: 'Stillwater', started: Date.now() / 1000 - 302 },
        { artist: 'Elio', title: 'Night Window', started: Date.now() / 1000 - 641 },
        { artist: 'Cedar Lines', title: 'Slow Cinema', started: Date.now() / 1000 - 1010 },
      ],
    },
    {
      id: 'rare-groove', name: 'Rare Groove & Late Night Soul Sessions', listeners: 352,
      nowPlaying: { artist: 'The Sunday Set', title: 'Velvet Steps' },
      streams: { 64: '', 128: '', 192: '' },
      history: [
        { artist: 'Leon Bridgeside', title: 'Side Street', started: Date.now() / 1000 - 246 },
        { artist: 'Honey Gold', title: 'Back Pocket', started: Date.now() / 1000 - 544 },
        { artist: 'Marvin Hale', title: 'Easy Company', started: Date.now() / 1000 - 942 },
      ],
    },
    {
      id: 'focus', name: 'Focus', listeners: 177,
      nowPlaying: { artist: 'Studio Weather', title: 'Open Tabs' },
      streams: { 64: '', 128: '', 192: '' },
      history: [
        { artist: 'Paper Cities', title: 'Deep Work', started: Date.now() / 1000 - 271 },
        { artist: 'Quartz', title: 'Blank Page', started: Date.now() / 1000 - 615 },
        { artist: 'Coda Field', title: 'Small Hours', started: Date.now() / 1000 - 996 },
      ],
    },
    {
      id: 'global', name: 'Global', listeners: 508,
      nowPlaying: { artist: 'Nuru Collective', title: 'Sun Dial' },
      streams: { 64: '', 128: '', 192: '' },
      history: [
        { artist: 'Casa Nova', title: 'Rua 9', started: Date.now() / 1000 - 228 },
        { artist: 'Ayo Mena', title: 'Long Road Home', started: Date.now() / 1000 - 533 },
        { artist: 'Atlas Ensemble', title: 'Meridian', started: Date.now() / 1000 - 917 },
      ],
    },
  ],
};

const store = {
  get(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Storage can be unavailable. */ }
  },
};

const allowedVisualizerModes = new Set(['wave', 'pulse']);
const storedVisualizerMode = store.get('visualizerMode', 'wave');

const state = {
  data: null,
  genre: store.get('genre', null),
  quality: store.get('quality', navigator.connection?.saveData ? '64' : '128'),
  visualizerMode: allowedVisualizerModes.has(storedVisualizerMode) ? storedVisualizerMode : 'wave',
  wantPlay: false,
  retry: 0,
  reconnectTimer: null,
  demo: false,
  refreshInFlight: false,
};

const volumeInput = $('volume');
const audio = new Audio();
audio.preload = 'none';
const storedVolume = Number(store.get('volume', '0.9'));
audio.volume = Number.isFinite(storedVolume) ? Math.min(1, Math.max(0, storedVolume)) : 0.9;

function syncVolumeUI(value) {
  const normalized = Math.min(1, Math.max(0, Number(value)));
  const percent = Math.round(normalized * 100);
  volumeInput.value = String(normalized);
  volumeInput.style.setProperty('--volume-progress', `${percent}%`);
  volumeInput.setAttribute('aria-valuetext', percent === 0 ? 'Muted' : `${percent}%`);
  $('volumeReadout').textContent = percent === 0 ? 'Muted' : `${percent}%`;
  const volume = volumeInput.closest('.volume');
  volume.dataset.level = percent === 0 ? 'muted' : percent < 50 ? 'low' : 'high';
  $('muteBtn').setAttribute('aria-pressed', String(percent === 0));
  $('muteBtn').setAttribute('aria-label', percent === 0 ? 'Unmute' : 'Mute');
}

function setVolume(value) {
  audio.volume = value;
  store.set('volume', String(value));
  syncVolumeUI(value);
}

syncVolumeUI(audio.volume);

function setVisualizerMode(mode, { persist = true } = {}) {
  if (!allowedVisualizerModes.has(mode)) return;

  state.visualizerMode = mode;
  $('signalVisual').dataset.visualizer = mode;
  document.querySelectorAll('[data-visualizer-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.visualizerMode === mode));
  });

  if (persist) store.set('visualizerMode', mode);
}

document.querySelectorAll('[data-visualizer-mode]').forEach((button) => {
  button.addEventListener('click', () => setVisualizerMode(button.dataset.visualizerMode));
});

setVisualizerMode(state.visualizerMode, { persist: false });
createVisualizer($('signalVisual'));

// The theme is resolved before first paint by the inline script in <head>; this keeps it in sync afterwards.
const lightQuery = window.matchMedia('(prefers-color-scheme: light)');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#eceef4' : '#0b0b0e');
  $('themeToggle').setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`);
}

applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

$('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  store.set('theme', next);
  applyTheme(next);
});

lightQuery.addEventListener('change', (event) => {
  // Follow the OS only until the listener picks a theme themselves.
  if (!['light', 'dark'].includes(store.get('theme', ''))) applyTheme(event.matches ? 'light' : 'dark');
});

const numberFormatter = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child != null) node.append(child);
  return node;
}

function hashHue(id) {
  let hue = 0;
  for (const character of String(id)) hue = (hue * 31 + character.charCodeAt(0)) % 360;
  return hue;
}

// Hashed hues can land right next to each other (Global and Rare Groove did), so a clash is nudged
// along the golden angle until every channel sits at least MIN_HUE_GAP degrees from the ones before it.
const MIN_HUE_GAP = 20;
let hueCache = { genres: null, hues: new Map() };

function hueFor(id) {
  const genres = state.data?.genres || [];
  if (hueCache.genres !== genres) {
    const hues = new Map();
    const taken = [];
    const clashes = (hue) => taken.some((other) => {
      const gap = Math.abs(hue - other) % 360;
      return Math.min(gap, 360 - gap) < MIN_HUE_GAP;
    });
    for (const genre of genres) {
      let hue = hashHue(genre.id);
      for (let tries = 0; tries < 12 && clashes(hue); tries++) hue = (hue + 137.5) % 360;
      taken.push(hue);
      hues.set(genre.id, Math.round(hue));
    }
    hueCache = { genres, hues };
  }
  return hueCache.hues.get(id) ?? hashHue(id);
}

const currentGenre = () => state.data?.genres.find((genre) => genre.id === state.genre);
const streamUrl = () => currentGenre()?.streams?.[state.quality] || '';
const trackText = (track) => track ? [track.artist, track.title].filter(Boolean).join(' — ') : '';

// Song over artist, each on its own line. dir="auto" keeps Persian/Arabic titles in reading order.
function trackLines(track, titleClass, artistClass) {
  const title = track?.title || track?.artist || '';
  const artist = track?.title ? track.artist : '';
  return [
    el('span', { class: titleClass, dir: 'auto' }, title),
    artist ? el('span', { class: artistClass, dir: 'auto' }, artist) : null,
  ];
}

function timeAgo(epochSeconds) {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - Number(epochSeconds || 0)));
  if (seconds < 60) return relativeFormatter.format(-seconds, 'second');
  if (seconds < 3600) return relativeFormatter.format(-Math.floor(seconds / 60), 'minute');
  return relativeFormatter.format(-Math.floor(seconds / 3600), 'hour');
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 1800);
}

function renderGenres() {
  // Update existing cards in place: rebuilding them on every click would snap their hover/press transitions.
  const container = $('genres');
  const existing = new Map([...container.querySelectorAll('[data-genre]')].map((button) => [button.dataset.genre, button]));
  const cards = state.data.genres.map((genre, index) => {
    const active = genre.id === state.genre;
    const playingHere = active && state.wantPlay;
    const icon = el('span', { class: 'genre-icon' });
    icon.innerHTML = playingHere ? STOP_ICON : PLAY_ICON;

    const button = existing.get(genre.id) || el('button', { type: 'button', 'data-genre': genre.id });
    button.className = `genre${active ? ' active' : ''}`;
    button.style.cssText = `--hue:${hueFor(genre.id)}`;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', `${playingHere ? 'Stop' : 'Play'} ${genre.name}`);
    button.onclick = () => playingHere ? stop() : tune(genre.id);
    // Rebuild the contents only when they change, so a scrolling name isn't reset by every refresh.
    const key = JSON.stringify([index, genre.name, genre.nowPlaying, genre.listeners, playingHere]);
    if (button.dataset.key === key) return button;
    button.dataset.key = key;
    button.replaceChildren(
      el('div', { class: 'genre-top' },
        el('span', { class: 'genre-index' }, String(index + 1).padStart(2, '0')),
        el('span', { class: 'genre-live' },
          el('span', { class: 'eq', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')),
          'On air',
        ),
        icon,
      ),
      el('h3', { dir: 'auto', title: genre.name }, genre.name),
      el('p', { class: 'genre-track', title: trackText(genre.nowPlaying) },
        ...(genre.nowPlaying ? trackLines(genre.nowPlaying, 'genre-song', 'genre-artist')
          : [el('span', { class: 'genre-song' }, 'The next track is loading…')])),
      el('div', { class: 'genre-meta' },
        el('span', {}, 'Listeners'),
        el('strong', {}, numberFormatter.format(genre.listeners || 0)),
      ),
    );
    return button;
  });
  const current = [...container.children];
  if (cards.length !== current.length || cards.some((card, i) => card !== current[i])) {
    const focusedGenre = document.activeElement?.dataset?.genre;
    container.replaceChildren(...cards);
    if (focusedGenre) cards.find((card) => card.dataset.genre === focusedGenre)?.focus({ preventScroll: true });
  }
  keepActiveInView();
  refreshMarquees();
}

// On phones the channels are a swipeable row: whenever the selection changes (and on first load),
// bring the selected card to the middle of the row, without moving the page itself.
let centredGenre;
function keepActiveInView() {
  const row = $('genres');
  const card = row.querySelector('.genre.active');
  if (!card || centredGenre === state.genre || row.scrollWidth <= row.clientWidth + 1) return;
  const instant = centredGenre === undefined || matchMedia('(prefers-reduced-motion: reduce)').matches;
  centredGenre = state.genre;
  const rowBox = row.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  const left = row.scrollLeft + cardBox.left - rowBox.left - (rowBox.width - cardBox.width) / 2;
  row.scrollTo({ left, behavior: instant ? 'instant' : 'smooth' });
}
// switching into the row layout (rotating a tablet, resizing) should land on the selection too
matchMedia('(max-width: 680px)').addEventListener('change', () => {
  centredGenre = undefined;
  requestAnimationFrame(keepActiveInView);
});

function renderQuality() {
  // Reuse the buttons so the selected tint can transition between tiers.
  const container = $('quality');
  const existing = new Map([...container.querySelectorAll('[data-quality]')].map((button) => [button.dataset.quality, button]));
  const buttons = state.data.qualities.map((quality) => {
    const id = String(quality.id);
    const button = existing.get(id) || el('button', { type: 'button', 'data-quality': id });
    button.setAttribute('aria-pressed', String(id === state.quality));
    button.title = quality.detail || '';
    button.onclick = () => setQuality(id);
    button.textContent = quality.label;
    return button;
  });
  const current = [...container.children];
  if (buttons.length !== current.length || buttons.some((button, i) => button !== current[i])) {
    container.replaceChildren(...buttons);
  }
}

function renderHistory(genre) {
  const history = (genre?.history || []).map((track, index) => el('li', { 'data-started': track.started },
    el('span', { class: 'history-number' }, String(index + 1).padStart(2, '0')),
    el('span', { class: 'history-track', title: trackText(track) }, ...trackLines(track, 'track-title', 'track-artist')),
    el('span', { class: 'history-time' }, timeAgo(track.started)),
  ));
  if (history.length && genre?.nowPlaying) {
    history.unshift(el('li', { class: 'history-now' },
      el('span', { class: 'history-number' }, el('span', { class: 'eq', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'))),
      el('span', { class: 'history-track', title: trackText(genre.nowPlaying) }, ...trackLines(genre.nowPlaying, 'track-title', 'track-artist')),
      el('span', { class: 'history-time' }, 'Now'),
    ));
  }

  $('history').replaceChildren(...(history.length
    ? history
    : [el('li', { class: 'empty' }, 'Nothing here yet — stay tuned.')]));
}

function renderNowPlaying() {
  const genre = currentGenre();
  const title = genre?.nowPlaying?.title || (genre ? 'The next track is loading…' : 'Your next favorite track');
  const artist = genre?.nowPlaying?.artist || (genre ? genre.name : 'Choose a channel to start listening.');

  $('npGenre').textContent = genre?.name || 'Pick a channel';
  if ($('npTitle').textContent !== title) {
    // Restart the entrance animation whenever the track (or channel) changes.
    for (const node of [$('nowHeading'), $('npArtist')]) {
      node.classList.remove('swap');
      void node.offsetWidth;
      node.classList.add('swap');
    }
  }
  $('npTitle').textContent = title;
  // Long titles step down in size (see .now-copy h1[data-length]); the full text stays in the tooltip.
  $('nowHeading').dataset.length = title.length > 48 ? 'long' : title.length > 24 ? 'medium' : '';
  $('nowHeading').title = title;
  $('npArtist').textContent = artist;
  // Only on change: rewriting the same text would restart a running marquee.
  if ($('dockTitle').textContent !== title) $('dockTitle').textContent = title;
  if ($('dockArtist').textContent !== artist) $('dockArtist').textContent = artist;
  $('historyGenre').textContent = genre?.name || '';
  $('listenerCount').textContent = genre ? numberFormatter.format(genre.listeners || 0) : '—';

  $('npArt').textContent = genre ? genre.name.charAt(0) : '';

  // Same for the history: rebuild only when the tracks change, otherwise just age the timestamps.
  const historyKey = JSON.stringify([genre?.id, genre?.nowPlaying, genre?.history]);
  if ($('history').dataset.key === historyKey) {
    for (const row of $('history').querySelectorAll('[data-started]')) {
      row.querySelector('.history-time').textContent = timeAgo(row.dataset.started);
    }
  } else {
    $('history').dataset.key = historyKey;
    renderHistory(genre);
  }
  refreshMarquees();

  // Set once on the root: it's a registered property there, so every surface that inherits it cross-fades together.
  document.documentElement.style.setProperty('--active-hue', genre ? hueFor(genre.id) : 16);

  document.title = genre?.nowPlaying ? `${trackText(genre.nowPlaying)} · ${state.data.name}` : state.data.name;

  if ('mediaSession' in navigator && genre) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: `${state.data.name} · ${genre.name}`,
    });
  }
}

// Names that don't fit scroll into view while their card, history row or the player is hovered or focused.
const MARQUEE_HOSTS = '.genre, #history li, .player';
const MARQUEE_TEXT = '.genre h3, .genre-song, .genre-artist, .track-title, .track-artist, .np-title, .np-artist';
const MARQUEE_SPEED = 32; // px per second
const marqueeSince = new WeakMap();

function startMarquee(host) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!marqueeSince.has(host)) marqueeSince.set(host, performance.now());
  // Re-renders replace the text mid-hover, so resume from where the scroll was instead of starting over.
  const elapsed = (performance.now() - marqueeSince.get(host)) / 1000;
  for (const node of host.querySelectorAll(MARQUEE_TEXT)) {
    if (node.querySelector('.marquee-text')) continue;
    const overflow = node.scrollWidth - node.clientWidth;
    if (overflow < 2) continue;
    const inner = el('span', { class: 'marquee-text' }, node.textContent);
    inner.style.setProperty('--marquee-shift', `${-overflow}px`);
    inner.style.setProperty('--marquee-time', `${(overflow / MARQUEE_SPEED / 0.64 + 1.2).toFixed(2)}s`);
    inner.style.animationDelay = `${(0.35 - elapsed).toFixed(2)}s`;
    node.classList.add('marquee');
    node.replaceChildren(inner);
  }
}

function stopMarquee(host) {
  marqueeSince.delete(host);
  for (const node of host.querySelectorAll('.marquee')) {
    node.classList.remove('marquee');
    node.textContent = node.textContent;
  }
}

function refreshMarquees() {
  for (const host of document.querySelectorAll(MARQUEE_HOSTS)) {
    if (host.matches(':hover') || host.matches(':focus-within')) startMarquee(host);
  }
}

// mouseenter doesn't bubble, but a capturing listener still sees it for every element
document.addEventListener('mouseenter', (event) => event.target.matches?.(MARQUEE_HOSTS) && startMarquee(event.target), true);
document.addEventListener('mouseleave', (event) => {
  const host = event.target;
  if (host.matches?.(MARQUEE_HOSTS) && !host.matches(':focus-within')) stopMarquee(host);
}, true);
document.addEventListener('focusin', (event) => {
  const host = event.target.closest?.(MARQUEE_HOSTS);
  if (host) startMarquee(host);
});
document.addEventListener('focusout', (event) => {
  const host = event.target.closest?.(MARQUEE_HOSTS);
  if (host && !host.contains(event.relatedTarget) && !host.matches(':hover')) stopMarquee(host);
});

function render() {
  renderGenres();
  renderQuality();
  renderNowPlaying();
}

function setPlayerState(status) {
  document.body.classList.toggle('playing', status === 'playing');
  document.body.classList.toggle('loading', status === 'loading');
  const playing = status !== 'idle';
  const label = playing ? 'Stop' : 'Play';
  $('playBtn').setAttribute('aria-label', label);
  $('heroPlay').setAttribute('aria-label', label);
  $('heroPlay').querySelector('.hero-play-label').textContent = playing ? 'Stop live' : 'Listen live';
  $('playerStatus').textContent = status === 'loading' ? 'Connecting' : status === 'playing' ? 'Now playing' : 'Ready to play';
  $('signalState').textContent = status === 'loading' ? 'Tuning in…' : status === 'playing' ? 'Broadcasting live' : 'Ready';
}

function start() {
  const url = streamUrl();
  state.wantPlay = true;
  setPlayerState(url ? 'loading' : 'playing');

  if (url) {
    audio.src = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    audio.play().catch((error) => {
      if (error.name === 'NotAllowedError') stop();
      else reconnect();
    });
  } else if (state.demo) {
    showToast('UI preview — connect /api/stations for live audio');
  } else {
    state.wantPlay = false;
    setPlayerState('idle');
    showToast('This channel has no active stream');
  }

  renderGenres();
}

function stop() {
  state.wantPlay = false;
  window.clearTimeout(state.reconnectTimer);
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  setPlayerState('idle');
  renderGenres();
}

function tune(genreId) {
  state.genre = genreId;
  store.set('genre', genreId);
  state.retry = 0;
  renderNowPlaying();
  start();
}

function setQuality(id) {
  state.quality = id;
  store.set('quality', id);
  renderQuality();
  if (state.wantPlay && streamUrl()) start();
}

function reconnect() {
  if (!state.wantPlay || !streamUrl()) return;
  setPlayerState('loading');
  window.clearTimeout(state.reconnectTimer);
  const delay = Math.min(15000, 1000 * 2 ** state.retry++);
  state.reconnectTimer = window.setTimeout(() => state.wantPlay && start(), delay);
}

audio.addEventListener('playing', () => {
  state.retry = 0;
  setPlayerState('playing');
});
audio.addEventListener('waiting', () => state.wantPlay && setPlayerState('loading'));
audio.addEventListener('error', reconnect);
audio.addEventListener('ended', reconnect);

function togglePlayback() {
  if (state.wantPlay) return stop();
  if (!state.genre) state.genre = state.data.genres[0]?.id;
  if (state.genre) tune(state.genre);
}

$('playBtn').addEventListener('click', togglePlayback);
$('heroPlay').addEventListener('click', togglePlayback);

volumeInput.addEventListener('input', (event) => setVolume(Number(event.currentTarget.value)));

let volumeBeforeMute = audio.volume || 0.9;
function toggleMute() {
  if (audio.volume > 0) {
    volumeBeforeMute = audio.volume;
    setVolume(0);
  } else {
    setVolume(volumeBeforeMute || 0.9);
  }
}
$('muteBtn').addEventListener('click', toggleMute);

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  // Space on a focused button already activates that button.
  if ((key === ' ' && !event.target.closest?.('button, a')) || key === 'k') {
    event.preventDefault();
    togglePlayback();
  } else if (key === 'm') toggleMute();
});

$('copyBtn').addEventListener('click', async () => {
  const url = streamUrl() || currentGenre()?.streams?.[state.quality];
  if (!url) {
    showToast('Stream link becomes available with the live API');
    return;
  }

  const fullUrl = new URL(url, location.href).href;
  try {
    await navigator.clipboard.writeText(fullUrl);
    $('copyBtn').querySelector('.copy-label').textContent = 'Copied';
    showToast('Stream link copied');
  } catch {
    window.prompt('Stream URL', fullUrl);
  }
  window.setTimeout(() => {
    $('copyBtn').querySelector('.copy-label').textContent = 'Stream link';
  }, 1500);
});

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => tune(state.genre || state.data.genres[0].id));
  navigator.mediaSession.setActionHandler('pause', stop);
  navigator.mediaSession.setActionHandler('stop', stop);
}

async function refresh() {
  if (state.refreshInFlight) return;
  state.refreshInFlight = true;
  const previousGenreId = state.genre;
  const previousStreamUrl = streamUrl();
  try {
    const response = await fetch('/api/stations', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Station API returned ${response.status}`);
    const payload = await response.json();
    if (!payload?.genres?.length || !payload?.qualities?.length) throw new Error('Station API response is incomplete');
    state.data = normalizeData(payload);
    state.demo = false;
    document.body.classList.remove('demo-mode');
    $('connectionText').textContent = 'Live';
    $('connectionText').parentElement.title = 'Live station data connected';
  } catch {
    if (!state.data) state.data = fallbackData;
    state.demo = true;
    document.body.classList.add('demo-mode');
    $('connectionText').textContent = 'Preview data';
    $('connectionText').parentElement.title = 'Station API not reachable — showing preview data. Ready for /api/stations.';
  } finally {
    state.refreshInFlight = false;
  }

  state.quality = String(state.quality);
  if (!state.data.genres.some((genre) => genre.id === state.genre)) {
    state.genre = state.data.genres[0]?.id ?? null;
  }
  if (!state.data.qualities.some((quality) => String(quality.id) === state.quality)) {
    state.quality = String(state.data.qualities[0].id);
  }

  // Dots in the name are tinted with the accent colour.
  $('stationName').replaceChildren(...state.data.name.split('.').flatMap((part, i) => (
    i ? [el('span', { class: 'brand-dot' }, '.'), part] : [part]
  )));
  $('tagline').textContent = state.data.tagline;
  render();

  if (state.wantPlay && (state.genre !== previousGenreId || streamUrl() !== previousStreamUrl)) {
    start();
  }
}

function normalizeData(payload) {
  return {
    name: String(payload.name || 'Radio.demo'),
    tagline: String(payload.tagline || 'Independent radio, around the clock.'),
    qualities: payload.qualities.map((quality) => ({
      ...quality,
      id: String(quality.id),
      label: String(quality.label || quality.id),
    })),
    genres: payload.genres.map((genre) => ({
      ...genre,
      id: String(genre.id),
      name: String(genre.name || 'Untitled channel'),
      listeners: Number.isFinite(Number(genre.listeners)) ? Number(genre.listeners) : 0,
      streams: genre.streams || {},
      history: Array.isArray(genre.history) ? genre.history : [],
    })),
  };
}

await refresh();
window.setInterval(() => {
  if (!document.hidden) refresh();
}, 10000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});
