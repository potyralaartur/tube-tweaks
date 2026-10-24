// Minimal stand-ins for YouTube pages, served by Playwright in place of www.youtube.com.
export const ytcfg = `<script>window.ytcfg={d:{LOGGED_IN:true,INNERTUBE_CONTEXT:{client:{clientName:'WEB'}},INNERTUBE_API_KEY:'k',INNERTUBE_CLIENT_VERSION:'2.0',START_IN_THEATER_MODE:false},get(k){return this.d[k]}};</script>`;

const item = (id, channelHref, views) => `
  <ytd-rich-item-renderer id="${id}">
    <a href="/watch?v=${id}">title ${id}</a>
    <ytd-channel-name><a id="text" href="${channelHref}">${channelHref.slice(1)}</a></ytd-channel-name>
    <div id="metadata-line"><span class="inline-metadata-item">${views}</span><span class="inline-metadata-item">2 days ago</span></div>
  </ytd-rich-item-renderer>`;

// Newer tile (Oct 2026): a play icon and a bare number, with the words only in aria-label.
const lockup = (id, channelHref, views) => `
  <ytd-rich-item-renderer id="${id}"><yt-lockup-view-model>
    <a href="/watch?v=${id}">title ${id}</a>
    <yt-content-metadata-view-model><div class="ytContentMetadataViewModelMetadataRow">
      <a href="${channelHref}">${channelHref.slice(2)}</a>
      <span class="ytContentMetadataViewModelLeadingIcon" aria-hidden="true"><svg></svg></span>
      <span class="ytContentMetadataViewModelMetadataText" role="text" aria-label="${views}">${views.split(' ')[0]}</span>
      <span class="ytContentMetadataViewModelMetadataText" role="text" aria-label="8 hours ago">8 hr ago</span>
    </div></yt-content-metadata-view-model>
  </yt-lockup-view-model></ytd-rich-item-renderer>`;

export const home = `<!doctype html><html><head>${ytcfg}</head><body>
<ytd-app><ytd-browse page-subtype="home"><div id="contents">
  <ytd-rich-section-renderer id="shorts-shelf"><ytd-rich-shelf-renderer is-shorts>Shorts</ytd-rich-shelf-renderer></ytd-rich-section-renderer>
  ${item('subbed-low', '/@subbed', '120 views')}
  ${item('random-low', '/@random', '120 views')}
  ${item('random-high', '/@random', '1.2K views')}
  ${item('subbed-by-id', '/channel/UCsub2', '50 views')}
  ${lockup('icon-low', '/@random', '569 views')}${lockup('icon-high', '/@random', '5,690 views')}${lockup('icon-live', '/@random', '53 watching')}
  <ytd-rich-item-renderer id="short-tile"><a href="/shorts/xyz">short</a></ytd-rich-item-renderer>
</div></ytd-browse></ytd-app></body></html>`;

export const guide = {
  items: [{ guideSubscriptionsSectionRenderer: { items: [
    { guideEntryRenderer: { formattedTitle: { simpleText: 'Subbed' }, navigationEndpoint: { browseEndpoint: { browseId: 'UCaaa', canonicalBaseUrl: '/@subbed' } } } },
  ] } }],
};
export const channels = {
  contents: { channelRenderer: { channelId: 'UCsub2', title: { simpleText: 'Sub Two' }, navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: '/channel/UCsub2' } } } },
};

const thread = (id, likes, text = `comment ${id}`, time = '1 day ago', lc = id) => `<ytd-comment-thread-renderer id="${id}"><ytd-comment-view-model id="comment">
  <span id="published-time-text"><a href="/watch?v=abc&lc=${lc}">${time}</a></span><div id="expander"><yt-attributed-string id="content-text"><span>${text}</span></yt-attributed-string></div>
  <span id="vote-count-middle">${likes}</span></ytd-comment-view-model></ytd-comment-thread-renderer>`;

// Same structure as YouTube's yt-dropdown-menu items (Oct 2026).
const sortItem = (id, title, subtitle, selected) => `<a id="${id}" class="yt-simple-endpoint style-scope yt-dropdown-menu${selected ? ' iron-selected' : ''}" aria-selected="${selected}" tabindex="0">
  <tp-yt-paper-item class="style-scope yt-dropdown-menu" role="option" tabindex="0"><tp-yt-paper-item-body class="style-scope yt-dropdown-menu">
    <div id="item-with-badge" class="style-scope yt-dropdown-menu"><div class="item style-scope yt-dropdown-menu">${title}<span class="notification" hidden></span></div><ytd-badge-supported-renderer system-icons hidden></ytd-badge-supported-renderer></div>
    <div secondary id="subtitle" class="style-scope yt-dropdown-menu">${subtitle}</div>
  </tp-yt-paper-item-body></tp-yt-paper-item></a>`;

// Player settings menu item, built like YouTube's player does (Oct 2026).
const menuItem = (id, role, label, d, toggle) => `<div id="${id}" class="ytp-menuitem" role="${role}" tabindex="0"${toggle ? ` aria-checked="false" aria-label="${label}"` : ' aria-haspopup="true"'}>
  <div class="ytp-menuitem-icon">${d ? `<svg height="24" viewBox="0 0 24 24" width="24"><path d="${d}" fill="white"></path></svg>` : ''}</div>
  <div class="ytp-menuitem-label">${label}</div>
  <div class="ytp-menuitem-content">${toggle ? '<div class="ytp-menuitem-toggle-checkbox"></div>' : 'Off'}</div></div>`;

export const watch = `<!doctype html><html><head>${ytcfg}
<style>
/* YouTube's own badge rule (www-player.css, Oct 2026) */
.ytp-settings-button{position:relative;width:48px;height:40px}
.ytp-settings-button.ytp-hd-quality-badge:after{content:"";position:absolute;top:10px;right:5px;height:9px;width:13px;background-color:var(--yt-sys-color-baseline--red-indicator,#e1002d);border-radius:1px;line-height:normal}
body{margin:0} #player-container-outer{height:400px} #below{height:3000px}
/* Like YouTube: the player's container is its own stacking context and the related videos are positioned. */
#masthead-container{position:fixed;top:0;left:0;right:0;height:56px;z-index:2020}
#player-container-outer{position:relative;view-transition-name:player-resize}
#columns{display:flex} #primary{flex:1} #secondary{width:426px;padding-right:24px}
.related{position:relative;z-index:1;height:3000px;background:#333}</style></head><body>
<div id="watch-page-skeleton" style="position:absolute;top:56px;left:0;width:10px;height:10px"></div>
<div id="player" style="position:absolute;top:80px;left:24px"><div id="player-wrap"></div></div><!-- by the time the test looks, YouTube has moved the early player into ytd-watch-flexy -->
<ytd-app><div id="masthead-container"></div><ytd-watch-flexy>
  <div id="player-container-outer"><div id="movie_player" class="html5-video-player">
    <video class="html5-main-video"></video>
    <button class="ytp-size-button"></button>
    <div class="ytp-paid-content-overlay" aria-live="assertive" data-overlay-order="5"><a class="ytp-paid-content-overlay-link" href="https://support.google.com/youtube/answer/154235"><div class="ytp-paid-content-overlay-text">Includes paid promotion</div></a></div>
    <button class="ytp-button ytp-settings-button ytp-hd-quality-badge"></button>
    <div class="ytp-settings-menu"><div class="ytp-panel-menu">
      ${menuItem('mi-stable', 'menuitemcheckbox', 'Stable Volume', 'M12 .99C5.92 .99 1 5.92 1 12Z', true)}
      ${menuItem('mi-ambient', 'menuitemcheckbox', 'Ambient mode', 'M12 .5C11.73 .5 11.48 .60 11.29 .79C11.10 .98 11 1.23 11 1.5V3.5Z', true)}
      ${menuItem('mi-ambient-legacy', 'menuitemcheckbox', 'Ambient mode', 'M21 7v10H3V7h18m1-1H2v12h20V6zM11.5 2v3h1V2h-1z', true)}
      ${menuItem('mi-annotations', 'menuitemcheckbox', 'Annotations', 'M17.5,7c1.93,0,3.5,1.57Z', true)}
      ${menuItem('mi-sleep', 'menuitem', 'Sleep timer', 'M12.33 1.00C12.22 1.00 12.11 1.00 12 1Z', false)}
      ${menuItem('mi-sleep-noicon', 'menuitem', 'Sleep timer', null, false)}
      ${menuItem('mi-speed', 'menuitem', 'Playback speed', 'M12 1c1.44 0 2.87.28 4.21.83Z', false)}
      <div class="ytp-menuitem" role="menuitemradio"><div class="ytp-menuitem-label"><div><span>1440p60 HDR <sup class="ytp-swatch-color-white">HD</sup></span></div></div></div>
      <div class="ytp-menuitem" role="menuitemradio"><div class="ytp-menuitem-label"><div><span>1080p60 HDR <sup class="ytp-swatch-color-white">HD</sup></span></div></div></div>
    </div></div>
  </div></div>
  <div id="columns"><div id="primary"><div id="below">
    <ytd-comments id="comments">
      <ytd-comments-header-renderer><div id="sort-menu"><tp-yt-paper-listbox role="listbox" tabindex="0">
        ${sortItem('sort-top', 'Top', 'Show featured comments', true)}
        ${sortItem('sort-new', 'Newest', 'Show recent comments, including potential spam', false)}
        <dom-repeat id="repeat"><template></template></dom-repeat>
      </tp-yt-paper-listbox></div></ytd-comments-header-renderer>
      <ytd-item-section-renderer><div id="contents">
        ${thread('c5', '5')}${thread('c1200', '1.2K', 'Now THIS is racing! That triple overtake was incredible. Max is the GOAT', '6 hours ago')}${thread('c30', '30')}${thread('c0', '')}
        ${thread('copy', '2.5K', 'Now THIS is racing! That triple overtake was incredible. Max is the GOAT ....', '5 hours ago')}
        ${thread('short1', '', 'Ferrari being Ferrari!!', '2 hours ago')}${thread('short2', '3', 'ferrari being ferrari', '1 hour ago')}
        ${thread('real1', '40', 'This was honestly the best race of the whole year', '2 weeks ago')}${thread('real2', '2K', 'This was honestly the best race of the whole year!', '2 weeks ago')}
        ${thread('tieA', '12', 'Underrated how good the pit wall strategy was today', '3 days ago')}${thread('tieB', '900', 'Underrated how good the pit wall strategy was today', '3 days ago')}
        ${thread('again', '30', 'comment c30', '1 day ago', 'c30')}
        <ytd-continuation-item-renderer id="cont"></ytd-continuation-item-renderer>
      </div></ytd-item-section-renderer>
    </ytd-comments>
  </div></div>
  <div id="secondary"><div id="secondary-inner"><div class="related">Related videos</div></div></div></div>
</ytd-watch-flexy></ytd-app>
<script>
  const flexy = document.querySelector('ytd-watch-flexy');
  // Like YouTube: the sort menu's data carries the continuation token of the Newest list.
  document.querySelector('ytd-comments-header-renderer').data = { sortMenu: { sortFilterSubMenuRenderer: { subMenuItems: [
    { title: 'Top', serviceEndpoint: { continuationCommand: { token: 'TOP' } } },
    { title: 'Newest', serviceEndpoint: { continuationCommand: { token: 'NEWEST' } } },
  ] } } };
  // Like YouTube: the starting layout comes from ytcfg; the size button toggles it.
  // Narrow window: single column, YouTube hides the theater button and ignores the start mode.
  const narrow = location.search.includes('narrow');
  if (narrow) document.querySelector('.ytp-size-button').style.display = 'none';
  else if (ytcfg.get('START_IN_THEATER_MODE')) flexy.setAttribute('theater', '');
  window.sizeClicks = 0;
  document.querySelector('.ytp-size-button').addEventListener('click', () => { window.sizeClicks++; flexy.toggleAttribute('theater'); });
  // Like iron-selector: the listbox selects whichever of its children was clicked.
  const listbox = document.querySelector('#sort-menu tp-yt-paper-listbox');
  listbox.addEventListener('click', e => {
    const a = [...listbox.children].find(x => x.contains(e.target));
    if (!a) return;
    for (const x of listbox.children) { x.classList.toggle('iron-selected', x === a); x.setAttribute('aria-selected', String(x === a)); }
    window.sortClicks = (window.sortClicks || []).concat(a.id || a.className);
  });
  const p = document.getElementById('movie_player');
  window.qualityCalls = [];
  let current = 'hd720';
  // Like YouTube's player: API events are registered by name on the element.
  const apiListeners = [];
  const domAdd = p.addEventListener.bind(p);
  p.addEventListener = (type, fn, o) => type === 'onPlaybackQualityChange' ? apiListeners.push(fn) : domAdd(type, fn, o);
  window.setQualityFromMenu = q => { current = q; apiListeners.forEach(fn => fn(q)); };
  Object.assign(p, {
    getAvailableQualityLevels: () => ['hd2160', 'hd1440', 'hd1080', 'hd720', 'auto'],
    getAvailableQualityData: () => [
      { quality: 'hd1080', qualityLabel: '1080p Premium', formatId: 'premium-fmt', isPlayable: true },
      { quality: 'hd1080', qualityLabel: '1080p', isPlayable: true },
    ],
    getVideoData: () => ({ video_id: 'abc' }),
    setPlaybackQualityRange: (a, b, f) => { window.qualityCalls.push([a, b, f]); current = a; apiListeners.forEach(fn => fn(a)); },
    getPlaybackQuality: () => current,
    getPlaybackQualityLabel: () => current === 'hd1080' ? '1080p Premium' : current,
  });
</script></body></html>`;

// YouTube's Newest list, two pages: tieB was posted after tieA. real1/real2 are older than both pages.
const orderItem = id => ({ commentThreadRenderer: { commentViewModel: { commentViewModel: { commentId: id } } } });
const more = token => ({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } });
export const newestPages = {
  NEWEST: { onResponseReceivedEndpoints: [{ reloadContinuationItemsCommand: { continuationItems: [orderItem('x1'), orderItem('tieB'), more('P2')] } }] },
  P2: { onResponseReceivedEndpoints: [{ appendContinuationItemsAction: { continuationItems: [orderItem('x2'), orderItem('tieA')] } }] },
};
