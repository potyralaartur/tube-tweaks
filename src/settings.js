// Shared by the popup and the content script.
// Settings live in chrome.storage.sync, which survives browser restarts,
// Chrome updates and extension updates (and follows the user's Chrome profile).
(function (root) {
  const DEFAULTS = Object.freeze({
    quality: 'hd1080', // YouTube quality id, or 'auto' to leave YouTube alone
    cinemaMode: true,
    hideAmbient: true, // Ambient mode item in the player's settings menu
    hideSleepTimer: true, // Sleep timer item in the player's settings menu
    popularSort: true,
    defaultSort: 'popular', // 'top' | 'newest' | 'popular'
    miniPlayer: true,
    hideShorts: true,
    hideLowViews: true,
    minViews: 1000,
  });

  // Order matters: highest first. Labels match the popup design.
  const QUALITIES = [
    { id: 'highres', label: '4320p (8K)', height: 4320 },
    { id: 'hd2160', label: '2160p (4K)', height: 2160 },
    { id: 'hd1440', label: '1440p (2K)', height: 1440 },
    { id: 'hd1080', label: '1080p (HD)', height: 1080 },
    { id: 'hd720', label: '720p', height: 720 },
    { id: 'large', label: '480p', height: 480 },
    { id: 'medium', label: '360p', height: 360 },
    { id: 'auto', label: 'Auto (YouTube default)', height: 0 },
  ];

  const KEY = 'settings';

  function normalize(raw) {
    const s = Object.assign({}, DEFAULTS, raw || {});
    if (!QUALITIES.some(q => q.id === s.quality)) s.quality = DEFAULTS.quality;
    if (!['top', 'newest', 'popular'].includes(s.defaultSort)) s.defaultSort = DEFAULTS.defaultSort;
    if (s.defaultSort === 'popular' && !s.popularSort) s.defaultSort = 'top';
    s.minViews = Math.max(0, Math.floor(Number(s.minViews) || 0));
    return s;
  }

  async function load() {
    const data = await chrome.storage.sync.get(KEY);
    return normalize(data[KEY]);
  }

  async function save(settings) {
    const s = normalize(settings);
    await chrome.storage.sync.set({ [KEY]: s });
    return s;
  }

  function onChange(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[KEY]) cb(normalize(changes[KEY].newValue));
    });
  }

  root.TTSettings = { DEFAULTS, QUALITIES, KEY, normalize, load, save, onChange };
})(typeof window !== 'undefined' ? window : globalThis);
