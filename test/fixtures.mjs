// Minimal stand-ins for YouTube pages, served by Playwright in place of www.youtube.com.
export const ytcfg = `<script>window.ytcfg={d:{LOGGED_IN:true,INNERTUBE_CONTEXT:{client:{clientName:'WEB'}},INNERTUBE_API_KEY:'k',INNERTUBE_CLIENT_VERSION:'2.0'},get(k){return this.d[k]}};</script>`;

const item = (id, channelHref, views) => `
  <ytd-rich-item-renderer id="${id}">
    <a href="/watch?v=${id}">title ${id}</a>
    <ytd-channel-name><a id="text" href="${channelHref}">${channelHref.slice(1)}</a></ytd-channel-name>
    <div id="metadata-line"><span class="inline-metadata-item">${views}</span><span class="inline-metadata-item">2 days ago</span></div>
  </ytd-rich-item-renderer>`;

export const home = `<!doctype html><html><head>${ytcfg}</head><body>
<ytd-app><ytd-browse page-subtype="home"><div id="contents">
  <ytd-rich-section-renderer id="shorts-shelf"><ytd-rich-shelf-renderer is-shorts>Shorts</ytd-rich-shelf-renderer></ytd-rich-section-renderer>
  ${item('subbed-low', '/@subbed', '120 views')}
  ${item('random-low', '/@random', '120 views')}
  ${item('random-high', '/@random', '1.2K views')}
  ${item('subbed-by-id', '/channel/UCsub2', '50 views')}
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

const thread = (id, likes) => `<ytd-comment-thread-renderer id="${id}"><div id="comment"><span id="vote-count-middle">${likes}</span></div></ytd-comment-thread-renderer>`;

// Same structure as YouTube's yt-dropdown-menu items (Oct 2026).
const sortItem = (id, title, subtitle, selected) => `<a id="${id}" class="yt-simple-endpoint style-scope yt-dropdown-menu${selected ? ' iron-selected' : ''}" aria-selected="${selected}" tabindex="0">
  <tp-yt-paper-item class="style-scope yt-dropdown-menu" role="option" tabindex="0"><tp-yt-paper-item-body class="style-scope yt-dropdown-menu">
    <div id="item-with-badge" class="style-scope yt-dropdown-menu"><div class="item style-scope yt-dropdown-menu">${title}</div><ytd-badge-supported-renderer></ytd-badge-supported-renderer></div>
    <div secondary id="subtitle" class="style-scope yt-dropdown-menu">${subtitle}</div>
  </tp-yt-paper-item-body></tp-yt-paper-item></a>`;

export const watch = `<!doctype html><html><head>${ytcfg}
<style>
/* YouTube's own badge rule (www-player.css, Oct 2026) */
.ytp-settings-button{position:relative;width:48px;height:40px}
.ytp-settings-button.ytp-hd-quality-badge:after{content:"";position:absolute;top:10px;right:5px;height:9px;width:13px;background-color:var(--yt-sys-color-baseline--red-indicator,#e1002d);border-radius:1px;line-height:normal}
body{margin:0} #player-container-outer{height:400px} #below{height:3000px}</style></head><body>
<ytd-app><ytd-watch-flexy>
  <div id="player-container-outer"><div id="movie_player" class="html5-video-player">
    <video class="html5-main-video"></video>
    <button class="ytp-size-button"></button>
    <button class="ytp-button ytp-settings-button ytp-hd-quality-badge"></button>
    <div class="ytp-settings-menu"><div class="ytp-panel-menu">
      <div class="ytp-menuitem" role="menuitemradio"><div class="ytp-menuitem-label"><div><span>1440p60 HDR <sup class="ytp-swatch-color-white">HD</sup></span></div></div></div>
      <div class="ytp-menuitem" role="menuitemradio"><div class="ytp-menuitem-label"><div><span>1080p60 HDR <sup class="ytp-swatch-color-white">HD</sup></span></div></div></div>
    </div></div>
  </div></div>
  <div id="below">
    <ytd-comments id="comments">
      <ytd-comments-header-renderer><div id="sort-menu"><tp-yt-paper-listbox>
        ${sortItem('sort-top', 'Top', 'Show featured comments', true)}
        ${sortItem('sort-new', 'Newest', 'Show recent comments, including potential spam', false)}
      </tp-yt-paper-listbox></div></ytd-comments-header-renderer>
      <ytd-item-section-renderer><div id="contents">
        ${thread('c5', '5')}${thread('c1200', '1.2K')}${thread('c30', '30')}${thread('c0', '')}
        <ytd-continuation-item-renderer id="cont"></ytd-continuation-item-renderer>
      </div></ytd-item-section-renderer>
    </ytd-comments>
  </div>
</ytd-watch-flexy></ytd-app>
<script>
  const flexy = document.querySelector('ytd-watch-flexy');
  document.querySelector('.ytp-size-button').addEventListener('click', () => flexy.toggleAttribute('theater'));
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
  Object.assign(p, {
    getAvailableQualityLevels: () => ['hd2160', 'hd1440', 'hd1080', 'hd720', 'auto'],
    getAvailableQualityData: () => [
      { quality: 'hd1080', qualityLabel: '1080p Premium', formatId: 'premium-fmt', isPlayable: true },
      { quality: 'hd1080', qualityLabel: '1080p', isPlayable: true },
    ],
    getVideoData: () => ({ video_id: 'abc' }),
    setPlaybackQualityRange: (a, b, f) => { window.qualityCalls.push([a, b, f]); current = a; },
    getPlaybackQuality: () => current,
    getPlaybackQualityLabel: () => current === 'hd1080' ? '1080p Premium' : current,
  });
</script></body></html>`;
