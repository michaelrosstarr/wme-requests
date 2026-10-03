// ==UserScript==
// @name         WME Requests
// @namespace    https://github.com/michaelrosstarr/wme-requests
// @version      2.8.5
// @description  Send downlock, uplock, imagery, and place update (accept/decline PUR) requests from Waze Map Editor, with notifications to Slack, Discord and Telegram.
// @author       michaelrosstarr
// @match        https://www.waze.com/editor*
// @match        https://www.waze.com/*/editor*
// @match        https://beta.waze.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_info
// @grant        unsafeWindow
// @license MIT
// @connect      requests.wmekit.com
// @connect      requests.wazetools.com
// @supportURL   https://github.com/michaelrosstarr/wme-requests/issues
// @updateURL    https://raw.githubusercontent.com/michaelrosstarr/wme-requests/main/userscript/wme-requests.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelrosstarr/wme-requests/main/userscript/wme-requests.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ── Configuration ───────────────────────────────────────────────────────────
  // Set this to your deployed Cloudflare Workers URL (no trailing slash).
  // You can also change it in the script settings panel inside WME.
  // Its host is also what @connect above grants GM_xmlhttpRequest access to without a
  // prompt — if you fork this for a self-hosted deployment on a different domain, update
  // both. Anyone who just changes the Settings panel's API Base URL to a different host
  // (rather than forking) will instead get a one-time Tampermonkey permission prompt for
  // it, which is expected.
  const DEFAULT_API_BASE = 'https://requests.wmekit.com';
  // Where WME Requests lived before the move to wmekit.com. A saved API base pointing here is moved
  // to the default: signed-in requests need the session cookie, which only exists on .wmekit.com.
  const LEGACY_API_BASE = 'https://requests.wazetools.com';
  const SCRIPT_NAME = 'WME Requests';
  const PANEL_ID = 'wme-requests-panel';
  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  // ── State ───────────────────────────────────────────────────────────────────
  let apiBase = GM_getValue('apiBase', DEFAULT_API_BASE);
  if (apiBase.replace(/\/+$/, '') === LEGACY_API_BASE) {
    apiBase = DEFAULT_API_BASE;
    GM_setValue('apiBase', apiBase);
  }
  // 'full' (text only), 'compact' (icon + text), or 'icon' (icon only) — style of the
  // always-visible floating Downlock/Imagery buttons. See applyFabStyle().
  let fabStyle = GM_getValue('fabStyle', 'full');
  // Per-button show/hide for the floating action buttons — see applyFabVisibility().
  let fabVisible = loadFabVisible();
  // Kind of the current selection (null when nothing's selected) — decides which floating
  // buttons applyFabVisibility() shows, via FAB_KIND_TYPES.
  let fabKind = null;
  let countries = [];
  // Regions (states/provinces) of whichever country is currently selected — refetched
  // whenever that changes. Optional: a country with none configured just has an empty list.
  let regions = [];
  // WME SDK handle + resolved methods (some method names aren't confirmed by the
  // public docs, so we probe a few candidates and log what's actually available
  // if none match — see resolveSdkMethods()).
  let sdk = null;
  let getSelectionFn = null;
  let getSegmentByIdFn = null;
  let getMapCommentByIdFn = null;
  let getVenueByIdFn = null;
  let getSegmentAddressFn = null;
  let getTopCountryFn = null;
  let getTopStateFn = null;
  const LOCK_GATED_TYPES = ['downlock', 'uplock', 'accept_pur', 'decline_pur'];
  // downlock and uplock both cover segments and places — accept/decline PUR remain
  // place-only, matching what the backend's migrations/0019 added.
  const TYPE_ENTITY_KINDS = {
    downlock: ['segment', 'venue'],
    uplock: ['segment', 'venue'],
    imagery: ['segment', 'mapComment'],
    accept_pur: ['venue'],
    decline_pur: ['venue'],
  };
  // ── Bootstrap ───────────────────────────────────────────────────────────────
  function bootstrap() {
    if (!pageWindow.SDK_INITIALIZED) {
      setTimeout(bootstrap, 500);
      return;
    }
    pageWindow.SDK_INITIALIZED.then(() => {
      if (!pageWindow.getWmeSdk) {
        log('bootstrap: window.getWmeSdk is missing even though SDK_INITIALIZED resolved.');
        return;
      }
      const sdkInstance = pageWindow.getWmeSdk({ scriptId: 'wme-requests', scriptName: SCRIPT_NAME });
      sdk = sdkInstance;
      resolveSdkMethods();
      sdkInstance.Events.once({ eventName: 'wme-ready' }).then(init);
    });
  }
  function init() {
    log('Initialising…');
    injectStyles();
    createPanel();
    sdk.Events.on({ eventName: 'wme-selection-changed', eventHandler: debounce(onSelectionChanged, 150) });
    sdk.Events.on({ eventName: 'wme-map-move-end', eventHandler: debounce(onMapMoveEnd, 150) });
    log('Ready.');
  }
  // A selected segment's country/region comes from its own address, which panning can't
  // change — only the view-based (top country/state) fallback needs re-running on a move.
  function onMapMoveEnd() {
    if (getSelectedSegments().length) {
      debugLog('onMapMoveEnd: segment selected, keeping its address-based country/region.');
      return;
    }
    debugLog('onMapMoveEnd: fired, re-running view-based country/region detection.');
    applyAutoCountry(null);
  }
  function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }
  function sdkMethodOf(obj, candidates, label) {
    if (!obj) {
      log(`${label}: parent object is missing from the SDK.`);
      return null;
    }
    const rec = obj;
    for (const name of candidates) {
      const candidate = rec[name];
      if (typeof candidate === 'function') return candidate.bind(obj);
    }
    const available = Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).join(', ');
    log(`${label}: none of [${candidates.join(', ')}] exist. Available methods: ${available}`);
    return null;
  }
  function resolveSdkMethods() {
    if (!sdk) return;
    getSelectionFn = sdkMethodOf(
      sdk.Editing,
      ['getSelection', 'getSelectedFeatures', 'getSelectedElements'],
      'Editing selection getter',
    );
    getSegmentByIdFn = sdkMethodOf(sdk.DataModel?.Segments, ['getById'], 'DataModel.Segments.getById');
    getMapCommentByIdFn = sdkMethodOf(sdk.DataModel?.MapComments, ['getById'], 'DataModel.MapComments.getById');
    getVenueByIdFn = sdkMethodOf(sdk.DataModel?.Venues, ['getById'], 'DataModel.Venues.getById');
    getSegmentAddressFn = sdkMethodOf(
      sdk.DataModel?.Segments,
      ['getAddress', 'getSegmentAddress', 'getAddressForSegment'],
      'DataModel.Segments.getAddress',
    );
    getTopCountryFn = sdkMethodOf(sdk.DataModel?.Countries, ['getTopCountry'], 'DataModel.Countries.getTopCountry');
    getTopStateFn = sdkMethodOf(
      sdk.DataModel?.States,
      ['getTopState', 'getTopStateId'],
      'DataModel.States.getTopState',
    );
  }
  // ── Styles ──────────────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
    #${PANEL_ID} { font-family: 'Rubik', sans-serif; font-size: 13px; padding: 10px; }
    #${PANEL_ID} h3 {
      font-size: 14px; font-weight: 600; margin: 0 0 10px; color: #333;
      display: flex; align-items: center; justify-content: space-between;
    }
    #${PANEL_ID} .wmereq-version { font-size: 10px; color: #999; text-align: center; margin-top: 8px; }
    #${PANEL_ID} .wmereq-section { background: #f7f7f7; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
    #${PANEL_ID} label { display: block; font-weight: 500; margin-bottom: 3px; color: #555; }
    #${PANEL_ID} select, #${PANEL_ID} input, #${PANEL_ID} textarea {
      width: 100%; padding: 5px 7px; border: 1px solid #ccc; border-radius: 4px;
      font-size: 12px; margin-bottom: 8px; box-sizing: border-box;
    }
    #${PANEL_ID} textarea { resize: vertical; min-height: 60px; }
    /* Not scoped to #${PANEL_ID} — the Settings and Reason dialogs live outside
       the panel's DOM subtree (appended directly to document.body) and share
       these same classes, so they need to match regardless of ancestry. */
    .wmereq-btn {
      display: inline-flex; align-items: center; justify-content: center; line-height: 1.2;
      padding: 7px 16px; border: none; border-radius: 6px;
      cursor: pointer; font-size: 13px; font-weight: 600; margin-right: 5px;
      font-family: 'Rubik', sans-serif; box-shadow: 0 1px 2px rgba(0,0,0,.15);
      transition: background-color .15s, box-shadow .15s;
    }
    .wmereq-btn:hover  { box-shadow: 0 2px 6px rgba(0,0,0,.2); }
    .wmereq-btn:active { box-shadow: none; }
    .wmereq-btn-primary  { background: #0a8cff; color: #fff; }
    .wmereq-btn-primary:hover  { background: #0077e6; }
    .wmereq-btn-downlock { background: #e53935; color: #fff; }
    .wmereq-btn-downlock:hover { background: #c62828; }
    .wmereq-btn-uplock { background: #9b59b6; color: #fff; }
    .wmereq-btn-uplock:hover { background: #8e44ad; }
    .wmereq-btn-imagery  { background: #0a8cff; color: #fff; }
    .wmereq-btn-imagery:hover  { background: #0077e6; }
    .wmereq-btn-accept-pur { background: #2ecc71; color: #fff; }
    .wmereq-btn-accept-pur:hover { background: #27ae60; }
    .wmereq-btn-decline-pur { background: #f39c12; color: #fff; }
    .wmereq-btn-decline-pur:hover { background: #d98408; }
    .wmereq-btn-cancel   { background: #e4e7eb; color: #333; }
    .wmereq-btn-cancel:hover   { background: #d4d8dc; }
    #${PANEL_ID} .wmereq-status { font-size: 11px; margin-top: 6px; padding: 5px 8px; border-radius: 4px; }
    #${PANEL_ID} .wmereq-status.ok     { background: #e8f5e9; color: #2e7d32; }
    #${PANEL_ID} .wmereq-status.error  { background: #ffebee; color: #c62828; }
    #${PANEL_ID} .wmereq-status.info   { background: #e3f2fd; color: #1565c0; }
    #${PANEL_ID} .wmereq-hint { font-size: 11px; color: #888; margin-top: -4px; margin-bottom: 8px; }
    #${PANEL_ID} .wmereq-lock-info { font-size: 12px; color: #555; margin-bottom: 8px; padding: 4px 8px; background:#fffde7; border-radius:4px; }
    #${PANEL_ID} .wmereq-optional { font-weight: 400; color: #888; }
    #${PANEL_ID} .wmereq-btn-block { width: 100%; margin: 0 0 8px; }
    #${PANEL_ID} .wmereq-submit-row { display: flex; flex-wrap: wrap; gap: 6px; }
    #${PANEL_ID} .wmereq-submit-row .wmereq-btn { flex: 1 1 auto; margin: 0; }
    #${PANEL_ID} .wmereq-settings summary { font-weight: 600; color: #333; cursor: pointer; user-select: none; }
    #${PANEL_ID} .wmereq-settings[open] summary { margin-bottom: 8px; }
    #${PANEL_ID} .wmereq-checkbox { display: flex; align-items: center; gap: 6px; font-weight: 400; margin-bottom: 4px; }
    #${PANEL_ID} .wmereq-checkbox input { width: auto; margin: 0; }
    #${PANEL_ID} .wmereq-settings-actions { display: flex; gap: 6px; margin-top: 8px; }
    #${PANEL_ID} .wmereq-settings-actions .wmereq-btn { margin: 0; }
    .wmereq-btn-sm { padding: 4px 10px; font-size: 11px; margin-right: 0; }
    /* Not scoped to #${PANEL_ID} — injected directly into WME's own native place
       (venue) edit panel, which lives outside our panel's DOM subtree entirely. */
    .wmereq-native-quick-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    #${PANEL_ID}.wmereq-floating {
      position: fixed; top: 60px; right: 10px; width: 300px; max-height: calc(100vh - 80px);
      overflow-y: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,.25);
      z-index: 1000;
    }
    #${PANEL_ID} .wmereq-btn-close {
      position: absolute; top: 6px; right: 8px; background: transparent; color: #888; padding: 2px 6px;
    }
    #wmereq-reason-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 9999;
      display: flex; align-items: center; justify-content: center;
    }
    #wmereq-reason-overlay .wmereq-dialog {
      background: #fff; border-radius: 8px; padding: 20px; width: 360px;
      box-shadow: 0 4px 24px rgba(0,0,0,.3);
    }
    #wmereq-reason-overlay h4 { margin: 0 0 8px; font-size: 14px; }
    #wmereq-reason-overlay .wmereq-hint { font-size: 11px; color: #888; margin-bottom: 10px; }
    #wmereq-reason-overlay label { font-size: 12px; font-weight: 500; display: block; margin: 10px 0 3px; }
    #wmereq-reason-overlay textarea, #wmereq-reason-overlay select {
      width: 100%; padding: 5px 7px; border: 1px solid #ccc; border-radius: 4px;
      font-size: 12px; box-sizing: border-box;
    }
    #wmereq-reason-overlay textarea { resize: vertical; min-height: 50px; }
    #wmereq-reason-overlay .wmereq-reason-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    #wmereq-reason-overlay .wmereq-chip {
      border: 1px solid #ccc; background: #f7f7f7; color: #333; border-radius: 14px;
      padding: 5px 12px; font-size: 12px; cursor: pointer; transition: all .15s;
    }
    #wmereq-reason-overlay .wmereq-chip:hover { background: #eee; }
    #wmereq-reason-overlay .wmereq-chip.active { background: #0a8cff; border-color: #0a8cff; color: #fff; }
    #wmereq-reason-overlay .wmereq-btn-screenshot { width: 100%; box-sizing: border-box; margin: 12px 0 0; }
    #wmereq-reason-overlay .wmereq-reason-error { font-size: 11px; color: #c62828; margin-top: 6px; }
    #wmereq-floating-actions {
      position: fixed; top: 70px; left: 10px; z-index: 1000;
      display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
      font-family: 'Rubik', sans-serif;
    }
    #wmereq-floating-actions .wmereq-fab-handle {
      width: 64px; height: 14px; border-radius: 6px; cursor: move; user-select: none;
      background: rgba(0,0,0,.15); display: flex; align-items: center; justify-content: center;
      color: rgba(255,255,255,.85); font-size: 9px; letter-spacing: 1px;
    }
    #wmereq-floating-actions .wmereq-fab-handle:hover { background: rgba(0,0,0,.28); }
    #wmereq-floating-actions .wmereq-fab {
      border: none; border-radius: 16px; padding: 7px 12px; font-size: 11px; font-weight: 600;
      cursor: pointer; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3); transition: opacity .15s;
      text-align: center; width: auto;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    }
    #wmereq-floating-actions .wmereq-fab:hover { opacity: .85; }
    #wmereq-floating-actions .wmereq-fab:disabled { opacity: .5; cursor: default; }
    #wmereq-floating-actions .wmereq-fab-downlock { background: #e53935; }
    #wmereq-floating-actions .wmereq-fab-uplock   { background: #9b59b6; }
    #wmereq-floating-actions .wmereq-fab-imagery  { background: #0a8cff; }
    #wmereq-floating-actions .wmereq-fab-accept-pur  { background: #2ecc71; }
    #wmereq-floating-actions .wmereq-fab-decline-pur { background: #f39c12; }
    /* Short text abbreviation (DL/UL/IMG), not an icon glyph — shown alongside the label in
       compact mode, and alone (in place of the label) in icon-only mode. */
    #wmereq-floating-actions .wmereq-fab-icon { display: none; font-size: 11px; font-weight: 700; letter-spacing: .3px; line-height: 1; }
    /* Abbreviation + text mode: shows the abbreviation alongside the (already small) label. */
    #wmereq-floating-actions.wmereq-fab-compact .wmereq-fab-icon { display: inline; }
    /* Abbreviation-only mode: circular button, label hidden entirely. */
    #wmereq-floating-actions.wmereq-fab-icon-only .wmereq-fab {
      width: 38px; height: 38px; padding: 0; border-radius: 50%;
    }
    #wmereq-floating-actions.wmereq-fab-icon-only .wmereq-fab-icon { display: inline; font-size: 12px; font-weight: 700; letter-spacing: .3px; }
    #wmereq-floating-actions.wmereq-fab-icon-only .wmereq-fab-label { display: none; }
    #wmereq-floating-actions .wmereq-fab-status {
      font-size: 11px; padding: 5px 10px; border-radius: 12px; max-width: 220px; text-align: left;
      background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    #wmereq-floating-actions .wmereq-fab-status.ok    { color: #2e7d32; }
    #wmereq-floating-actions .wmereq-fab-status.error { color: #c62828; }
    #wmereq-floating-actions .wmereq-fab-status.info  { color: #1565c0; }
  `;
    document.head.appendChild(style);
  }
  // ── Panel creation ──────────────────────────────────────────────────────────
  function createPanel() {
    if (byId(PANEL_ID)) return;
    const tabsUl = document.querySelector('#user-info .nav-tabs') || document.querySelector('#sidebar .nav-tabs');
    const tabContent =
      document.querySelector('#user-info .tab-content') || document.querySelector('#sidebar .tab-content');
    if (tabsUl && tabContent) {
      injectAsNativeTab(tabsUl, tabContent);
    } else {
      injectAsFloatingPanel();
    }
    createFloatingActions();
    bindPanelEvents();
    fetchCountries();
  }
  function injectAsNativeTab(tabsUl, tabContent) {
    const li = document.createElement('li');
    li.innerHTML = `<a href="#${PANEL_ID}" data-toggle="tab">WR</a>`;
    tabsUl.appendChild(li);
    const pane = document.createElement('div');
    pane.className = 'tab-pane';
    pane.id = PANEL_ID;
    pane.innerHTML = buildPanelHTML();
    tabContent.appendChild(pane);
  }
  function injectAsFloatingPanel() {
    const wrapper = document.createElement('div');
    wrapper.id = PANEL_ID;
    wrapper.className = 'wmereq-floating';
    wrapper.innerHTML =
      `<button class="wmereq-btn wmereq-btn-close" id="wmereq-btn-close" title="Hide">×</button>` + buildPanelHTML();
    document.body.appendChild(wrapper);
    on('wmereq-btn-close', 'click', () => {
      wrapper.style.display = 'none';
    });
  }
  function createFloatingActions() {
    if (byId('wmereq-floating-actions')) return;
    const wrap = document.createElement('div');
    wrap.id = 'wmereq-floating-actions';
    wrap.innerHTML = `
    <div class="wmereq-fab-handle" title="Drag to move">⠿ ⠿ ⠿</div>
    <div id="wmereq-fab-status" class="wmereq-fab-status" style="display:none"></div>
    ${FAB_TYPES.map((type) => `<button class="wmereq-fab wmereq-fab-${typeSlug(type)}" id="wmereq-fab-${typeSlug(type)}" title="Submit a ${describeType(type)} request for the selection"><span class="wmereq-fab-icon">${TYPE_ABBR[type]}</span><span class="wmereq-fab-label">${describeType(type)}</span></button>`).join('\n    ')}
  `;
    document.body.appendChild(wrap);
    for (const type of FAB_TYPES) on(`wmereq-fab-${typeSlug(type)}`, 'click', () => quickSubmit(type));
    makeDraggable(wrap, wrap.querySelector('.wmereq-fab-handle'), 'wmereq-fab-pos');
    applyFabStyle();
    applyFabVisibility();
  }
  function applyFabStyle() {
    const wrap = byId('wmereq-floating-actions');
    if (wrap) {
      wrap.classList.toggle('wmereq-fab-compact', fabStyle === 'compact');
      wrap.classList.toggle('wmereq-fab-icon-only', fabStyle === 'icon');
    }
    // The same Floating Buttons style setting also drives the quick-action buttons injected
    // into WME's native segment/place panels — refresh their labels to match whenever it changes.
    refreshQuickActionLabels();
  }
  const TYPE_ABBR = { downlock: 'DL', uplock: 'UL', imagery: 'IMG', accept_pur: 'ACC', decline_pur: 'DEC' };
  const TYPE_LABELS = {
    downlock: 'Downlock',
    uplock: 'Uplock',
    imagery: 'Imagery',
    accept_pur: 'Accept PUR',
    decline_pur: 'Decline PUR',
  };
  const KIND_LABELS = { segment: 'segment', mapComment: 'map note', venue: 'place' };
  // `accept_pur` → `accept-pur`, the form used in element ids and CSS classes.
  function typeSlug(type) {
    return type.replace('_', '-');
  }
  // WME stores a 0-based lock rank; everything in this file uses the 1-based display level.
  function lockLevelOf(item) {
    return item.lockRank != null ? item.lockRank + 1 : null;
  }
  const LOCK_LEVEL_OPTIONS_HTML =
    '<option value="">— select —</option>' +
    [1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}">${n}</option>`).join('');
  // Label text for a quick-action button (panel rows and native-injected alike), following
  // the same fabStyle setting as the floating map buttons: full name, abbreviation + name, or
  // just the abbreviation.
  function quickActionLabel(type) {
    const abbr = TYPE_ABBR[type] || describeType(type);
    if (fabStyle === 'icon') return abbr;
    if (fabStyle === 'compact') return `${abbr} ${describeType(type)}`;
    return describeType(type);
  }
  // Re-labels every quick-action button currently on the page (both static panel rows and
  // whatever's been injected into the native segment/place panel) to match the current
  // fabStyle — called whenever that setting changes, since these buttons aren't rebuilt.
  function refreshQuickActionLabels() {
    document.querySelectorAll('[data-wmereq-qa-type]').forEach((btn) => {
      btn.textContent = quickActionLabel(btn.getAttribute('data-wmereq-qa-type'));
    });
  }
  // Same order as QUICK_ACTION_TYPES (spelled out since that's declared further down).
  const FAB_TYPES = ['downlock', 'uplock', 'imagery', 'accept_pur', 'decline_pur'];
  // Which floating buttons fit each selection kind. With nothing selected only Imagery shows,
  // as a fallback (clicking it still prompts to select something first).
  const FAB_KIND_TYPES = {
    venue: ['uplock', 'downlock', 'accept_pur', 'decline_pur'],
    segment: ['uplock', 'downlock'],
    mapComment: ['imagery'],
    none: ['imagery'],
  };
  function loadFabVisible() {
    const defaults = { downlock: true, uplock: true, imagery: true, accept_pur: true, decline_pur: true };
    const saved = GM_getValue('wmereq-fab-visible', null);
    if (!saved) return defaults;
    try {
      return { ...defaults, ...JSON.parse(saved) };
    } catch (e) {
      log('loadFabVisible: failed to parse saved visibility: ' + e.message);
      return defaults;
    }
  }
  function applyFabVisibility() {
    const wrap = byId('wmereq-floating-actions');
    if (!wrap) return;
    for (const type of FAB_TYPES) {
      const btn = byId(`wmereq-fab-${typeSlug(type)}`);
      const show = FAB_KIND_TYPES[fabKind ?? 'none'].includes(type) && fabVisible[type] !== false;
      if (btn) btn.style.display = show ? '' : 'none';
    }
  }
  function resetFabPosition() {
    GM_setValue('wmereq-fab-pos', null);
    const wrap = byId('wmereq-floating-actions');
    if (wrap) {
      wrap.style.top = '';
      wrap.style.left = '';
      wrap.style.right = '';
    }
    showStatus('Button position reset.', 'ok');
  }
  function makeDraggable(container, handle, storageKey) {
    const saved = GM_getValue(storageKey, null);
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        container.style.top = `${pos.top}px`;
        container.style.left = `${pos.left}px`;
        container.style.right = 'auto';
      } catch (e) {
        log('makeDraggable: failed to parse saved position: ' + e.message);
      }
    }
    let startX = 0;
    let startY = 0;
    let startTop = 0;
    let startLeft = 0;
    let lastX = 0;
    let lastY = 0;
    let frame = 0;
    // Positions from the most recent mousemove — run at most once per animation frame.
    const applyPosition = () => {
      frame = 0;
      const maxTop = Math.max(0, window.innerHeight - container.offsetHeight);
      const maxLeft = Math.max(0, window.innerWidth - container.offsetWidth);
      const top = Math.min(Math.max(0, startTop + (lastY - startY)), maxTop);
      const left = Math.min(Math.max(0, startLeft + (lastX - startX)), maxLeft);
      container.style.top = `${top}px`;
      container.style.left = `${left}px`;
      container.style.right = 'auto';
    };
    const onMove = (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!frame) frame = requestAnimationFrame(applyPosition);
    };
    // The document-level listeners only exist for the duration of a drag, so they don't
    // fire on every mouse move over the map (including WME's own map drags).
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (frame) {
        cancelAnimationFrame(frame);
        applyPosition();
      }
      const rect = container.getBoundingClientRect();
      GM_setValue(storageKey, JSON.stringify({ top: rect.top, left: rect.left }));
    };
    handle.addEventListener('mousedown', (e) => {
      const rect = container.getBoundingClientRect();
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      startTop = rect.top;
      startLeft = rect.left;
      e.preventDefault();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
  function buildPanelHTML() {
    return `
    <div>
      <h3>WME Requests</h3>

      <div class="wmereq-section" id="wmereq-segment-info">
        <div class="wmereq-hint">Select a segment, map note, or place on the map to get started.</div>
      </div>

      <div class="wmereq-section">
        <label>Country</label>
        <select id="wmereq-country">
          <option value="">Loading…</option>
        </select>

        <label>Region <span class="wmereq-optional">(optional)</span></label>
        <select id="wmereq-region">
          <option value="">Country-wide</option>
        </select>

        <div id="wmereq-lock-row">
          <label>Lock Level <span id="wmereq-lock-hint" class="wmereq-optional"></span></label>
          <select id="wmereq-lock">
            ${LOCK_LEVEL_OPTIONS_HTML}
          </select>
        </div>

        <label>Notes <span class="wmereq-optional">(optional)</span></label>
        <textarea id="wmereq-notes" placeholder="Any extra context…"></textarea>

        ${screenshotCaptureSupported() ? `<button type="button" class="wmereq-btn wmereq-btn-cancel wmereq-btn-screenshot wmereq-btn-block" id="wmereq-btn-screenshot">Attach Screenshot</button>` : ''}

        <div class="wmereq-submit-row">
          ${QUICK_ACTION_TYPES.map((type) => `<button class="wmereq-btn wmereq-btn-${typeSlug(type)}" id="wmereq-btn-submit-${typeSlug(type)}" title="Submit a ${describeType(type)} request" style="display:none">${describeType(type)}</button>`).join('\n          ')}
        </div>

        <div id="wmereq-status" class="wmereq-status info" style="display:none"></div>
      </div>

      <details class="wmereq-section wmereq-settings">
        <summary>Settings</summary>

        <label>API Base URL</label>
        <input id="wmereq-api-base" type="url" value="${escHtml(apiBase)}" placeholder="https://your-project.your-subdomain.workers.dev" />

        <label>Floating Buttons</label>
        <select id="wmereq-fab-style">
          <option value="full" ${fabStyle === 'full' ? 'selected' : ''}>Text only</option>
          <option value="compact" ${fabStyle === 'compact' ? 'selected' : ''}>Abbreviation + text</option>
          <option value="icon" ${fabStyle === 'icon' ? 'selected' : ''}>Abbreviation only</option>
        </select>

        <label>Show on Map</label>
        <div class="wmereq-fab-visibility">
          ${FAB_TYPES.map(
            (type) => `
            <label class="wmereq-checkbox">
              <input type="checkbox" id="wmereq-fab-visible-${typeSlug(type)}" ${fabVisible[type] !== false ? 'checked' : ''} />
              ${describeType(type)}
            </label>`,
          ).join('')}
        </div>

        <div class="wmereq-settings-actions">
          <button class="wmereq-btn wmereq-btn-primary" id="wmereq-settings-save">Save</button>
          <button type="button" class="wmereq-btn wmereq-btn-cancel" id="wmereq-fab-reset-pos">Reset Button Position</button>
        </div>
      </details>

      <div class="wmereq-version">${SCRIPT_NAME} v${escHtml(getScriptVersion())}</div>
    </div>`;
  }
  function bindPanelEvents() {
    on('wmereq-country', 'change', (e) => fetchRegions(e.target.value));
    on('wmereq-settings-save', 'click', saveSettings);
    on('wmereq-fab-reset-pos', 'click', resetFabPosition);
    on('wmereq-btn-screenshot', 'click', () =>
      captureScreenshotFromButton(byId('wmereq-btn-screenshot'), (msg) => showStatus(msg, 'error')),
    );
    for (const type of QUICK_ACTION_TYPES) {
      on(`wmereq-btn-submit-${typeSlug(type)}`, 'click', () => submitRequest(type));
    }
  }
  // ── Viewport screenshot (optional) ────────────────────────────────────────────
  // Captures the current tab with getDisplayMedia and reduces it to just the map
  // viewport element. Where the Element Capture API (RestrictionTarget) exists
  // (Chrome), the stream itself is restricted to the viewport. Elsewhere (Edge,
  // Firefox, …) we grab a frame of the whole tab and crop it to the viewport's
  // bounding rect ourselves. screenshotCaptureSupported() only requires
  // getDisplayMedia, so browsers without any screen capture don't see the option.
  let capturedScreenshotBlob = null;
  // The server rejects uploads over 5MB, which a full-resolution PNG of satellite imagery
  // on a high-DPI screen easily exceeds — so the image is scaled down to this longest side
  // and encoded as JPEG, which lands well under the limit.
  const SCREENSHOT_MAX_DIMENSION = 1920;
  const SCREENSHOT_JPEG_QUALITY = 0.85;
  const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
  function screenshotCaptureSupported() {
    return !!navigator.mediaDevices?.getDisplayMedia;
  }
  // Returns a drawable frame from the track: an ImageBitmap via ImageCapture where
  // available, otherwise an off-DOM <video> playing the stream (drawn from directly).
  // ImageCapture.grabFrame() can reject (sometimes with no error value at all, in Chrome)
  // when the track has no frame ready, so a failure there falls through to the <video> path.
  async function grabVideoFrame(track, stream) {
    if (typeof ImageCapture !== 'undefined') {
      try {
        const bitmap = await new ImageCapture(track).grabFrame();
        return { source: bitmap, width: bitmap.width, height: bitmap.height };
      } catch (e) {
        log(`ImageCapture.grabFrame() failed, falling back to a <video> element: ${errorMessage(e)}`);
      }
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for a video frame.')), 3000);
        video.addEventListener(
          'loadeddata',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
    return { source: video, width: video.videoWidth, height: video.videoHeight };
  }
  async function captureViewportScreenshot() {
    const viewportEl = sdk.Map.getMapViewportElement();
    if (!viewportEl) throw new Error('Could not find the map viewport element.');
    const stream = await navigator.mediaDevices.getDisplayMedia({ preferCurrentTab: true });
    const [track] = stream.getVideoTracks();
    // Element Capture only accepts elements that form their own stacking context, which
    // WME's map viewport doesn't by default — `isolation: isolate` makes it one without
    // changing how it renders. Restored once the capture is done.
    const prevIsolation = viewportEl.style.isolation;
    try {
      let elementCaptured = false;
      if (typeof RestrictionTarget !== 'undefined' && typeof track.restrictTo === 'function') {
        try {
          viewportEl.style.isolation = 'isolate';
          const restrictionTarget = await RestrictionTarget.fromElement(viewportEl);
          await track.restrictTo(restrictionTarget);
          elementCaptured = true;
        } catch (e) {
          log(`Element Capture failed, falling back to cropping the tab capture: ${errorMessage(e)}`);
        }
      }
      // Lets the restriction apply, and lets the "Sharing this tab" infobar finish
      // resizing the page before the viewport rect is measured below.
      await new Promise((resolve) => setTimeout(resolve, 150));
      const frame = await grabVideoFrame(track, stream);
      // Source rect within the frame; defaults to the whole frame.
      let sx = 0,
        sy = 0,
        sw = frame.width,
        sh = frame.height;
      if (!elementCaptured) {
        const surface = track.getSettings().displaySurface;
        if (surface && surface !== 'browser') {
          log(
            `Screenshot: a ${surface} was shared instead of this tab, so the image can't be cropped to the map viewport; using the full frame.`,
          );
        } else {
          const rect = viewportEl.getBoundingClientRect();
          const scaleX = frame.width / window.innerWidth;
          const scaleY = frame.height / window.innerHeight;
          const left = Math.max(0, Math.round(rect.left * scaleX));
          const top = Math.max(0, Math.round(rect.top * scaleY));
          const right = Math.min(frame.width, Math.round(rect.right * scaleX));
          const bottom = Math.min(frame.height, Math.round(rect.bottom * scaleY));
          if (right > left && bottom > top) {
            sx = left;
            sy = top;
            sw = right - left;
            sh = bottom - top;
          } else {
            log('Screenshot: the map viewport is outside the captured frame; using the full frame.');
          }
        }
      }
      const scale = Math.min(1, SCREENSHOT_MAX_DIMENSION / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context.');
      ctx.drawImage(frame.source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      if (frame.source instanceof ImageBitmap) frame.source.close();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', SCREENSHOT_JPEG_QUALITY));
      if (!blob) throw new Error('Failed to create an image from the canvas.');
      if (blob.size > SCREENSHOT_MAX_BYTES) throw new Error('The screenshot is too large to upload (over 5MB).');
      log(`Screenshot captured: ${canvas.width}×${canvas.height}, ${Math.round(blob.size / 1024)}KB.`);
      return blob;
    } finally {
      stream.getTracks().forEach((t) => t.stop());
      viewportEl.style.isolation = prevIsolation;
    }
  }
  // Syncs every Attach Screenshot button (the panel's, and the reason modal's while it's
  // open) with the shared capturedScreenshotBlob.
  function updateScreenshotButton() {
    document.querySelectorAll('.wmereq-btn-screenshot').forEach((btn) => {
      btn.textContent = capturedScreenshotBlob ? 'Screenshot attached (click to retake)' : 'Attach Screenshot';
    });
  }
  // Captures into capturedScreenshotBlob, reporting failures via `onError`. `hideEl` (the
  // reason modal's overlay) is hidden for the duration so it doesn't end up in the image.
  // Returns whether a screenshot was captured.
  async function captureScreenshotFromButton(btn, onError, hideEl) {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Capturing…';
    }
    if (hideEl) hideEl.style.visibility = 'hidden';
    try {
      capturedScreenshotBlob = await captureViewportScreenshot();
      return true;
    } catch (e) {
      const message = errorMessage(e);
      log('Screenshot capture failed: ' + message);
      onError(`Screenshot capture failed: ${message}`);
      capturedScreenshotBlob = null;
      return false;
    } finally {
      if (hideEl) hideEl.style.visibility = '';
      if (btn) btn.disabled = false;
      updateScreenshotButton();
    }
  }
  // ── Selection helpers ─────────────────────────────────────────────────────────
  // `raw` is typed `unknown` (rather than trusting SelectionWithLocalizedTypeName, what
  // getSelectionFn is *supposed* to return per the official typings) because sdkMethodOf
  // above may have resolved a fallback method name (getSelectedFeatures/getSelectedElements)
  // instead of getSelection — those aren't confirmed to share the same return shape, so this
  // still probes a few historically-seen alternates: a bare `segmentIds` array, or a plain
  // array of feature objects.
  function normalizeSelection(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw;
    if (Array.isArray(r.ids)) {
      if (r.objectType === 'mapComment') return { kind: 'mapComment', ids: r.ids };
      if (r.objectType === 'venue') return { kind: 'venue', ids: r.ids };
      if (!r.objectType || r.objectType === 'segment') return { kind: 'segment', ids: r.ids };
      return null;
    }
    if (Array.isArray(r.segmentIds)) return { kind: 'segment', ids: r.segmentIds };
    if (Array.isArray(raw)) {
      const arr = raw;
      const segIds = arr
        .filter((f) => (f.objectType || f.type) === 'segment' || f.segmentId != null)
        .map((f) => f.id ?? f.segmentId);
      if (segIds.length) return { kind: 'segment', ids: segIds };
      const noteIds = arr.filter((f) => (f.objectType || f.type) === 'mapComment').map((f) => f.id);
      if (noteIds.length) return { kind: 'mapComment', ids: noteIds };
      const venueIds = arr.filter((f) => (f.objectType || f.type) === 'venue').map((f) => f.id);
      if (venueIds.length) return { kind: 'venue', ids: venueIds };
    }
    return null;
  }
  function getSelectedEntity() {
    return getSelectedEntityFromSdk() || getVenueEntityFromIssueTracker() || getVenueEntityFromUrl();
  }
  // Fallback for when a Wazer opens a place's "Place update request" popup
  // (WME's own suggested-edits review UI) without separately clicking to select
  // the venue on the map — WME doesn't register that popup as an SDK-level or
  // legacy selection (both come back empty), so getSelectedEntityFromSdk() finds
  // nothing even though the venue is clearly the one on screen. Its id is still
  // readable off WME's own legacy issue-tracker state though: opening the popup
  // pushes a `<venueId>.<suggestionId>.<subId>` composite id onto
  // window.W.issueTrackerController.app.selectedMarkers, so this reads the venue
  // id (the part before the first dot) back out of it and resolves the venue
  // directly — letting Accept/Decline PUR work from that popup with no extra
  // click. `window.W` is WME's pre-SDK global app object; still present
  // alongside the new SDK and is the only place this particular state lives.
  function getVenueEntityFromIssueTracker() {
    if (!getVenueByIdFn) {
      debugLog('getVenueEntityFromIssueTracker: no getVenueByIdFn resolved.');
      return null;
    }
    try {
      const w = pageWindow;
      const markers = w.W?.issueTrackerController?.app?.selectedMarkers;
      const raw = Array.isArray(markers) ? markers[0] : null;
      const venueId = raw != null ? String(raw).split('.')[0] : null;
      if (DEBUG)
        debugLog(
          `getVenueEntityFromIssueTracker: selectedMarkers = ${JSON.stringify(markers)}, parsed venueId = ${venueId}`,
        );
      if (!venueId) return null;
      const venue = getVenueByIdFn({ venueId });
      if (DEBUG)
        debugLog(
          `getVenueEntityFromIssueTracker: getVenueByIdFn({ venueId: ${venueId} }) = ${venue ? JSON.stringify(venue) : 'nothing'}`,
        );
      return venue ? { kind: 'venue', items: [venue] } : null;
    } catch (e) {
      log('getVenueEntityFromIssueTracker failed: ' + e.message);
      return null;
    }
  }
  function getSelectedEntityFromSdk() {
    if (!getSelectionFn) return null;
    try {
      const raw = getSelectionFn();
      const normalized = normalizeSelection(raw);
      if (!normalized) {
        return null;
      }
      if (normalized.kind === 'segment') {
        if (!getSegmentByIdFn) return null;
        const items = normalized.ids.map((segmentId) => getSegmentByIdFn({ segmentId })).filter((s) => s != null);
        return items.length ? { kind: 'segment', items } : null;
      }
      if (normalized.kind === 'mapComment') {
        if (!getMapCommentByIdFn) return null;
        const items = normalized.ids
          .map((mapCommentId) => getMapCommentByIdFn({ mapCommentId }))
          .filter((s) => s != null);
        return items.length ? { kind: 'mapComment', items } : null;
      }
      if (normalized.kind === 'venue') {
        if (!getVenueByIdFn) return null;
        const items = normalized.ids.map((venueId) => getVenueByIdFn({ venueId })).filter((s) => s != null);
        return items.length ? { kind: 'venue', items } : null;
      }
      return null;
    } catch (e) {
      log('getSelectedEntity failed: ' + e.message);
      return null;
    }
  }
  function getVenueEntityFromUrl() {
    if (!getVenueByIdFn) return null;
    const raw = new URLSearchParams(window.location.search).get('venueUpdateRequest');
    if (DEBUG)
      debugLog(
        `getVenueEntityFromUrl: location.search = "${window.location.search}", venueUpdateRequest param = ${raw ? `"${raw}"` : 'missing'}`,
      );
    const venueId = raw ? raw.split('.')[0] : null;
    if (!venueId) return null;
    try {
      const venue = getVenueByIdFn({ venueId });
      if (DEBUG)
        debugLog(
          `getVenueEntityFromUrl: getVenueByIdFn({ venueId: ${venueId} }) = ${venue ? JSON.stringify(venue) : 'nothing'}`,
        );
      return venue ? { kind: 'venue', items: [venue] } : null;
    } catch (e) {
      log('getVenueEntityFromUrl failed: ' + e.message);
      return null;
    }
  }
  function getSelectedSegments() {
    const entity = getSelectedEntity();
    return entity && entity.kind === 'segment' ? entity.items : [];
  }
  // Buckets items by their own current lock level (WME's 0-based rank, converted to the
  // 1-based display level used everywhere else in this file), preserving the order each
  // level was first seen. Items with no lock info of their own land in a `level: null`
  // bucket. Used to split a mixed-lock-level selection into separate requests — see
  // doSubmit()'s use of this for segments.
  function groupByLockLevel(items) {
    const order = [];
    const buckets = new Map();
    for (const item of items) {
      const level = lockLevelOf(item);
      if (!buckets.has(level)) {
        buckets.set(level, []);
        order.push(level);
      }
      buckets.get(level).push(item);
    }
    return order.map((level) => ({ level, items: buckets.get(level) }));
  }
  // Returns the first defined value among several possible field-name spellings, for
  // SDK objects whose exact shape isn't guaranteed by the public docs (e.g. the current
  // user's session info — see findUserInfo()).
  function pick(obj, keys) {
    if (!obj) return null;
    for (const k of keys) {
      if (obj[k] != null) return obj[k];
    }
    return null;
  }
  // ── Segment / map note selection ─────────────────────────────────────────────
  function onSelectionChanged() {
    const infoDiv = byId('wmereq-segment-info');
    if (!infoDiv) return;
    const entity = getSelectedEntity();
    if (!entity || !entity.items.length) {
      infoDiv.innerHTML =
        '<div class="wmereq-hint">Select a segment, map note, or place on the map to get started.</div>';
      updateSubmitButtons(null);
      injectNativeQuickActions(null);
      fabKind = null;
      applyFabVisibility();
      return;
    }
    // Each kind only differs in its title, lock level and extra multi-select hint — the
    // render and the auto-country/type/button refresh below are shared.
    let titleHtml;
    let lockLevel = null;
    let mixedLockHint = '';
    // Only segments have a per-entity address lookup (DataModel.Segments.getAddress) — for
    // places and map notes applyAutoCountry(null) goes straight to the view-based (top
    // country/state) fallback, which is approximate but the best available.
    let segment = null;
    if (entity.kind === 'venue') {
      const venue = entity.items[0];
      titleHtml = `<strong>${escHtml(venue.name || 'Unnamed Place')}</strong>`;
      // A place's lock rank is what determines whether an editor's rank is enough to
      // accept/decline it themselves, so it's auto-selected the same as a segment's.
      lockLevel = lockLevelOf(venue);
    } else if (entity.kind === 'mapComment') {
      // Map notes don't carry a lock rank, so there's nothing to auto-select on wmereq-lock.
      const note = entity.items[0];
      titleHtml = `<strong>Map Note</strong>${note.subject ? `: ${escHtml(note.subject)}` : ''}`;
    } else {
      segment = entity.items[0];
      titleHtml = `<strong>${getRoadTypeName(segment.roadType)}</strong>`;
      lockLevel = lockLevelOf(segment);
      const lockLevels = [...new Set(entity.items.map(lockLevelOf))].filter((l) => l != null);
      if (lockLevels.length > 1) {
        mixedLockHint = ` — mixed lock levels (${lockLevels.sort((a, b) => a - b).join(', ')}); downlock requests will be sent as separate messages per level`;
      }
    }
    const count = entity.items.length;
    const multiHint =
      count > 1
        ? `<div class="wmereq-hint">${count} ${KIND_LABELS[entity.kind]}s selected${mixedLockHint} — permalink will include all of them.</div>`
        : '';
    const permalink = buildPermalink(entity.items, entity.kind);
    infoDiv.innerHTML = `
    ${multiHint}
    <div class="wmereq-lock-info">
      ${titleHtml}${lockLevel ? ` · Lock: ${lockLevel}` : ''}<br>
      <small style="word-break:break-all">${escHtml(permalink)}</small>
    </div>`;
    // Auto-select the inferred lock level
    const lockSel = byId('wmereq-lock');
    if (lockLevel && lockSel) {
      lockSel.value = String(lockLevel);
      const hint = byId('wmereq-lock-hint');
      if (hint) hint.textContent = `(inferred from ${KIND_LABELS[entity.kind]}: ${lockLevel})`;
    }
    applyAutoCountry(segment);
    updateSubmitButtons(entity.kind);
    injectNativeQuickActions(entity.kind);
    fabKind = entity.kind;
    applyFabVisibility();
  }
  // Matches a WME country/state object against one of our own backend's lists, by
  // ISO code (country only — WME's own State objects don't carry one) or name.
  function matchByNameOrCode(list, obj) {
    if (!obj) return null;
    const name = obj.name.toLowerCase();
    const abbr = ('abbr' in obj ? obj.abbr : '').toLowerCase();
    return list.find((item) => (abbr && item.code.toLowerCase() === abbr) || item.name.toLowerCase() === name) || null;
  }
  // Fetches the SegmentAddress for a specific segment (exact — tied to that segment,
  // not the map view), via the probed getSegmentAddressFn. See resolveSdkMethods for
  // why the method name isn't confirmed by the public docs.
  function getSegmentAddress(seg) {
    if (!getSegmentAddressFn || !seg) return null;
    try {
      const address = getSegmentAddressFn({ segmentId: seg.id });
      if (!address) {
        debugLog('getSegmentAddress: returned nothing.');
        return null;
      }
      if (DEBUG) debugLog(`getSegmentAddress: raw address object = ${JSON.stringify(address)}`);
      return address;
    } catch (e) {
      debugLog('getSegmentAddress: threw: ' + e.message);
      return null;
    }
  }
  // Resolves the country for the current context: if a segment's address is given, its
  // SegmentAddress.country is exact and tried first; otherwise (or if that doesn't
  // resolve) falls back to WME's "top country" for the current map view, which is
  // only approximate — it can be wrong near borders or for small regions.
  function resolveCurrentCountryId(address) {
    if (!countries.length) {
      debugLog('resolveCurrentCountryId: no countries loaded from the API yet.');
      return null;
    }
    if (address) {
      const match = matchByNameOrCode(countries, address.country);
      if (DEBUG) {
        debugLog(
          `resolveCurrentCountryId: segment address country=${address.country ? JSON.stringify(address.country) : 'null'} ` +
            `→ ${match ? `matched "${match.name}" (id ${match.id})` : 'no match'}`,
        );
      }
      if (match) return match.id;
    }
    if (!getTopCountryFn) {
      debugLog('resolveCurrentCountryId: no DataModel.Countries.getTopCountry method resolved.');
      return null;
    }
    try {
      const topCountry = getTopCountryFn();
      if (!topCountry) {
        debugLog('resolveCurrentCountryId: getTopCountry() returned nothing.');
        return null;
      }
      if (DEBUG) debugLog(`resolveCurrentCountryId: top country object = ${JSON.stringify(topCountry)}`);
      const match = matchByNameOrCode(countries, topCountry);
      if (!match && DEBUG) {
        debugLog(
          `resolveCurrentCountryId: no configured country matched view country. Configured: ${countries.map((c) => `${c.name}/${c.code}`).join(', ')}`,
        );
      }
      return match ? match.id : null;
    } catch (e) {
      debugLog('resolveCurrentCountryId: getTopCountry threw: ' + e.message);
      return null;
    }
  }
  // The segment's address is looked up once here and passed down to both the country and
  // (via fetchRegions) the region resolution, rather than each fetching it again.
  function applyAutoCountry(seg) {
    const countrySel = byId('wmereq-country');
    if (!countrySel) return;
    const address = getSegmentAddress(seg);
    const resolved = resolveCurrentCountryId(address);
    if (resolved) {
      countrySel.value = String(resolved);
      fetchRegions(String(resolved), address);
    }
  }
  // Resolves the region for the current context — same segment-address-first, then
  // view-based-fallback approach as resolveCurrentCountryId, but for state/province.
  function resolveCurrentRegionId(address) {
    if (!regions.length) {
      debugLog('resolveCurrentRegionId: no regions loaded for the current country.');
      return null;
    }
    if (address) {
      const match = matchByNameOrCode(regions, address.state);
      if (DEBUG) {
        debugLog(
          `resolveCurrentRegionId: segment address state=${address.state ? JSON.stringify(address.state) : 'null'} — ` +
            `configured regions: [${regions.map((r) => `${r.name}/${r.code}`).join(', ')}] → ${match ? `matched "${match.name}" (id ${match.id})` : 'no match'}`,
        );
      }
      if (match) return match.id;
    }
    if (!getTopStateFn) {
      debugLog('resolveCurrentRegionId: no DataModel.States.getTopState method resolved.');
      return null;
    }
    try {
      const topState = getTopStateFn();
      if (!topState) {
        debugLog('resolveCurrentRegionId: getTopState() returned nothing.');
        return null;
      }
      if (DEBUG) debugLog(`resolveCurrentRegionId: top state object = ${JSON.stringify(topState)}`);
      const match = matchByNameOrCode(regions, topState);
      if (DEBUG) {
        debugLog(
          `resolveCurrentRegionId: view state — configured regions: ` +
            `[${regions.map((r) => `${r.name}/${r.code}`).join(', ')}] → ${match ? `matched "${match.name}" (id ${match.id})` : 'no match'}`,
        );
      }
      return match ? match.id : null;
    } catch (e) {
      debugLog('resolveCurrentRegionId: getTopState threw: ' + e.message);
      return null;
    }
  }
  function applyAutoRegion(address) {
    const regionSel = byId('wmereq-region');
    if (!regionSel) return;
    const resolved = resolveCurrentRegionId(address);
    regionSel.value = resolved ? String(resolved) : '';
  }
  function describeObject(obj) {
    if (!obj) return 'null/undefined';
    const own = Object.getOwnPropertyNames(obj);
    const proto = Object.getPrototypeOf(obj);
    const protoProps = proto ? Object.getOwnPropertyNames(proto).filter((k) => k !== 'constructor') : [];
    return `own=[${own.join(', ')}] proto=[${protoProps.join(', ')}]`;
  }
  // Tries several plausible ways the SDK might expose the logged-in user's info,
  // since sdk.State.userInfo (per the public docs) came back empty in testing.
  // The official WmeSDK typings only confirm sdk.State.getUserInfo(), but this keeps
  // probing the other historically-seen shapes too, in case of API drift on WME's side.
  function findUserInfo() {
    if (!sdk?.State) {
      debugLog('findUserInfo: sdk.State module is missing entirely.');
      return null;
    }
    if (DEBUG) debugLog(`findUserInfo: sdk.State = ${describeObject(sdk.State)}`);
    const state = sdk.State;
    if (state.userInfo) {
      if (DEBUG) debugLog(`findUserInfo: sdk.State.userInfo (property) = ${JSON.stringify(state.userInfo)}`);
      return state.userInfo;
    }
    if (typeof sdk.State.getUserInfo === 'function') {
      const result = sdk.State.getUserInfo();
      if (DEBUG) debugLog(`findUserInfo: sdk.State.getUserInfo() = ${JSON.stringify(result)}`);
      if (result) return result;
    }
    if (typeof state.get === 'function') {
      const result = state.get('userInfo');
      if (DEBUG) debugLog(`findUserInfo: sdk.State.get('userInfo') = ${JSON.stringify(result)}`);
      if (result) return result;
    }
    const sdkRec = sdk;
    if (sdkRec.User) {
      if (DEBUG) debugLog(`findUserInfo: sdk.User = ${describeObject(sdkRec.User)}`);
      const user = sdkRec.User;
      if (user.userInfo) return user.userInfo;
      if (typeof user.getUserInfo === 'function') return user.getUserInfo();
    }
    debugLog(`findUserInfo: no user info found. Top-level sdk keys = ${Object.keys(sdk || {}).join(', ')}`);
    return null;
  }
  // Current Wazer's username + WME editing rank, from the SDK's logged-in user info.
  function getCurrentUserInfo() {
    const info = findUserInfo();
    const userName = pick(info, ['userName', 'username', 'nickname']) || '';
    const rankRaw = pick(info, ['rank', 'editingRank', 'level']);
    if (!userName) log('getCurrentUserInfo: none of [userName, username, nickname] matched on the user info object.');
    return { userName, editorRank: rankRaw != null ? rankRaw + 1 : null }; // WME stores 0-based rank
  }
  // Which request types are valid for a given entity kind — the inverse of TYPE_ENTITY_KINDS.
  function validTypesForKind(kind) {
    return Object.keys(TYPE_ENTITY_KINDS).filter((type) => TYPE_ENTITY_KINDS[type].includes(kind));
  }
  const QUICK_ACTION_TYPES = ['downlock', 'uplock', 'imagery', 'accept_pur', 'decline_pur'];
  // Shows only the panel's Submit buttons valid for the current selection (none when nothing
  // is selected), and the Lock Level row only when one of those types uses it.
  function updateSubmitButtons(kind) {
    const validTypes = kind ? validTypesForKind(kind) : [];
    for (const type of QUICK_ACTION_TYPES) {
      const btn = byId(`wmereq-btn-submit-${typeSlug(type)}`);
      if (btn) btn.style.display = validTypes.includes(type) ? '' : 'none';
    }
    const lockRow = byId('wmereq-lock-row');
    if (lockRow) lockRow.style.display = validTypes.some((t) => LOCK_GATED_TYPES.includes(t)) ? '' : 'none';
  }
  const NATIVE_QUICK_ACTIONS_CLASS = 'wmereq-native-quick-actions';
  // Which quick-action buttons to inject into each native panel — deliberately narrower than
  // validTypesForKind for the segment panel (just Downlock/Uplock, not Imagery) to keep it
  // uncluttered; the place panel keeps its full set.
  const NATIVE_PANEL_TYPES = {
    segment: ['downlock', 'uplock'],
    venue: ['downlock', 'uplock', 'accept_pur', 'decline_pur'],
  };
  // Injects quick-action buttons directly into WME's own native segment/place edit panel,
  // right after its Lock section (<div class="lock-edit-view">) — present, with that same
  // class, in both the segment and place panels, confirmed against real panel HTML for each.
  // Map notes have no lock section and get nothing. Re-runs on every selection change,
  // clearing any previously injected row first (old node from a prior selection, or none at
  // all if the current one isn't a segment/place).
  function injectNativeQuickActions(kind, attempt) {
    document.querySelectorAll(`.${NATIVE_QUICK_ACTIONS_CLASS}`).forEach((el) => el.remove());
    const types = kind ? NATIVE_PANEL_TYPES[kind] : undefined;
    if (!types) return;
    const anchor = document.querySelector('.lock-edit-view');
    if (!anchor) {
      // WME's native panel can render slightly after the SDK's selection-changed event fires —
      // one short retry covers that race without polling indefinitely.
      if (!attempt) setTimeout(() => injectNativeQuickActions(kind, 1), 150);
      return;
    }
    const row = document.createElement('div');
    row.className = NATIVE_QUICK_ACTIONS_CLASS;
    for (const type of types) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `wmereq-btn wmereq-btn-sm wmereq-btn-${typeSlug(type)}`;
      btn.title = `Quick-submit a ${describeType(type)} request`;
      btn.textContent = quickActionLabel(type);
      btn.dataset.wmereqQaType = type;
      btn.addEventListener('click', () => quickSubmit(type, showFabStatus));
      row.appendChild(btn);
    }
    anchor.insertAdjacentElement('afterend', row);
  }
  // ── Permalink builder ─────────────────────────────────────────────────────────
  // Accepts one or more segments (kind = 'segment', the default), map notes
  // (kind = 'mapComment'), or places (kind = 'venue'); Waze permalinks support a
  // comma-separated id list for the relevant param, so a multi-selection produces
  // a single link covering all of them. Builds off the current page's own
  // origin+path (not a hardcoded domain) so it always matches whatever
  // host/locale variant (e.g. waze.com/en-US/editor vs www.waze.com/editor) is
  // actually active — a mismatch there triggers a redirect that drops the query
  // string. zoomLevel (not zoom) is the param name WME expects for segments;
  // `mapComments` for notes and `venues` for places aren't confirmed by any
  // public doc (unlike `segments`), just inferred from the SDK's own
  // `segments`/`mapComment`/`venue` naming — verify they still resolve in WME if
  // note/place permalinks ever stop landing on the right selection.
  function buildPermalink(items, kind) {
    try {
      const center = sdk.Map.getMapCenter();
      const zoom = sdk.Map.getZoomLevel();
      const ids = items
        .map((s) => s.id)
        .filter((id) => id != null)
        .join(',');
      const param = kind === 'mapComment' ? 'mapComments' : kind === 'venue' ? 'venues' : 'segments';
      const base = `${window.location.origin}${window.location.pathname}`;
      return `${base}?env=row&lat=${center.lat}&lon=${center.lon}&zoomLevel=${zoom}&${param}=${ids}`;
    } catch {
      return stripUpdateRequestParams(window.location.href);
    }
  }
  // Removes `*UpdateRequest` params (e.g. `venueUpdateRequest=<venueId>.<suggestionId>.<subId>`)
  // from a URL — used for the buildPermalink() fallback above, since that param ties the
  // link to one specific, ephemeral suggestion (gone once accepted/declined) rather than
  // the place itself, unlike the clean `venues=<id>` link buildPermalink normally sends.
  function stripUpdateRequestParams(href) {
    try {
      const url = new URL(href);
      [...url.searchParams.keys()].forEach((key) => {
        if (/UpdateRequest$/i.test(key)) url.searchParams.delete(key);
      });
      return url.toString();
    } catch {
      return href;
    }
  }
  const ROAD_TYPE_NAMES = {
    1: 'Street',
    2: 'Primary Street',
    3: 'Freeway',
    4: 'Ramp',
    5: 'Walking Trail',
    6: 'Major Highway',
    7: 'Minor Highway',
    8: 'Dirt Road/4x4 Trail',
    10: 'Pedestrian Boardwalk',
    16: 'Stairway',
    17: 'Private Road',
    18: 'Railroad',
    19: 'Runway/Taxiway',
    20: 'Parking Lot Road',
    21: 'Service Road',
  };
  function getRoadTypeName(type) {
    return ROAD_TYPE_NAMES[type] || `Road (${type})`;
  }
  // ── Reason modal (downlock + Accept/Decline PUR) ──────────────────────────────
  const DOWNLOCK_REASONS = ['Adjust SL', 'Add SB', 'Fix Geo', 'Add JB', 'HN', 'TR'];
  // Full wording shown as a tooltip on each chip — check these match your team's shorthand.
  const DOWNLOCK_REASON_TOOLTIPS = {
    'Adjust SL': 'Adjust Speed Limit',
    'Add SB': 'Add Speed Bump',
    'Fix Geo': 'Fix Geometry',
    'Add JB': 'Add Junction Box',
    HN: 'House Numbers',
    TR: 'Turn Restrictions',
  };
  const PUR_REASONS = ['New Name', 'New Image', 'Category', 'Address', 'Hours', 'Other'];
  const PUR_REASON_TOOLTIPS = {
    'New Name': 'Place Name Change',
    'New Image': 'Place Image Update',
    Category: 'Category Change',
    Address: 'Address Change',
    Hours: 'Hours of Operation Update',
    Other: 'Other Place Update',
  };
  // Reasons for locking/unlocking a place — distinct from DOWNLOCK_REASONS above, which are
  // road-attribute-specific and don't apply once downlock also covers venues.
  const PLACE_LOCK_REASONS = ['Vandalism', 'Spam/Abuse', 'Incorrect Lock', 'Rank Change', 'Other'];
  const PLACE_LOCK_REASON_TOOLTIPS = {
    Vandalism: 'Protect against vandalism',
    'Spam/Abuse': 'Repeated spam or abusive edits',
    'Incorrect Lock': 'Lock level was set incorrectly',
    'Rank Change': "Editor's rank no longer matches the lock level",
    Other: 'Other reason',
  };
  // Resolves which reason-modal chips to show for a given (type, entity kind) pair — a
  // function rather than a flat map because downlock's chips depend on what's selected: a
  // segment gets the road-attribute reasons, a place gets the lock-specific ones. Returns
  // null for types with no reason step (currently just imagery).
  function getReasonModalConfig(type, kind) {
    if (type === 'downlock') {
      return kind === 'venue'
        ? { title: 'Downlock Reason', reasons: PLACE_LOCK_REASONS, tooltips: PLACE_LOCK_REASON_TOOLTIPS }
        : { title: 'Downlock Reason', reasons: DOWNLOCK_REASONS, tooltips: DOWNLOCK_REASON_TOOLTIPS };
    }
    if (type === 'uplock')
      return { title: 'Uplock Reason', reasons: PLACE_LOCK_REASONS, tooltips: PLACE_LOCK_REASON_TOOLTIPS };
    if (type === 'accept_pur')
      return { title: 'Accept PUR Reason', reasons: PUR_REASONS, tooltips: PUR_REASON_TOOLTIPS };
    if (type === 'decline_pur')
      return { title: 'Decline PUR Reason', reasons: PUR_REASONS, tooltips: PUR_REASON_TOOLTIPS };
    return null;
  }
  // Shows quick-pick reason chips (from `reasons`/`tooltips`) plus a free-text field, under
  // the given `title`. When `requireLevel` is set, also shows a Target Lock Level select that
  // must be filled before Continue proceeds — used for uplock's quick-submit paths (FAB and
  // in-panel quick buttons), where there's no current lock rank to infer a level from; the
  // user is explicitly choosing how high to raise it. Resolves { confirmed: false } if
  // cancelled, or { confirmed: true, reason, level } otherwise (reason is '' if nothing was
  // picked/typed but the user chose to continue; level is null unless requireLevel was set).
  function openReasonModal({ title, reasons, tooltips, requireLevel }) {
    return new Promise((resolve) => {
      const selected = new Set();
      const dlg = document.createElement('div');
      dlg.id = 'wmereq-reason-overlay';
      dlg.innerHTML = `
      <div class="wmereq-dialog">
        <h4>${escHtml(title)}</h4>
        ${
          requireLevel
            ? `
        <label>Target Lock Level</label>
        <select id="wmereq-reason-level">
          ${LOCK_LEVEL_OPTIONS_HTML}
        </select>`
            : ''
        }
        <div class="wmereq-hint">Select one or more quick reasons, or add your own below.</div>
        <div class="wmereq-reason-chips">
          ${reasons.map((r) => `<button type="button" class="wmereq-chip" data-reason="${escHtml(r)}" title="${escHtml(tooltips[r] || r)}">${escHtml(r)}</button>`).join('')}
        </div>
        <label>Additional details (optional)</label>
        <textarea id="wmereq-reason-custom" placeholder="Any extra context…"></textarea>
        ${
          screenshotCaptureSupported()
            ? `<button type="button" class="wmereq-btn wmereq-btn-cancel wmereq-btn-screenshot" id="wmereq-reason-screenshot">${capturedScreenshotBlob ? 'Screenshot attached (click to retake)' : 'Attach Screenshot'}</button>
        <div class="wmereq-reason-error" id="wmereq-reason-error" style="display:none"></div>`
            : ''
        }
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="wmereq-btn wmereq-btn-primary" id="wmereq-reason-confirm">Continue</button>
          <button class="wmereq-btn wmereq-btn-cancel" id="wmereq-reason-cancel">Cancel</button>
        </div>
      </div>`;
      document.body.appendChild(dlg);
      dlg.querySelectorAll('.wmereq-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          const reason = btn.getAttribute('data-reason');
          if (selected.has(reason)) {
            selected.delete(reason);
            btn.classList.remove('active');
          } else {
            selected.add(reason);
            btn.classList.add('active');
          }
        });
      });
      // Set once a screenshot is taken from this modal, so Cancel can drop it rather than
      // leaving it attached to whatever request is submitted next.
      let capturedHere = false;
      const shotBtn = dlg.querySelector('#wmereq-reason-screenshot');
      shotBtn?.addEventListener('click', async () => {
        const errEl = dlg.querySelector('#wmereq-reason-error');
        errEl.style.display = 'none';
        const ok = await captureScreenshotFromButton(
          shotBtn,
          (msg) => {
            errEl.textContent = msg;
            errEl.style.display = '';
          },
          dlg,
        );
        if (ok) capturedHere = true;
      });
      function close(confirmed, reason, level) {
        document.body.removeChild(dlg);
        if (!confirmed && capturedHere) {
          capturedScreenshotBlob = null;
          updateScreenshotButton();
        }
        resolve(
          confirmed
            ? { confirmed: true, reason: reason ?? null, level: level ?? null }
            : { confirmed: false, reason: null, level: null },
        );
      }
      dlg.querySelector('#wmereq-reason-confirm').addEventListener('click', () => {
        const levelSel = dlg.querySelector('#wmereq-reason-level');
        if (requireLevel && levelSel && !levelSel.value) {
          levelSel.focus();
          return;
        }
        const custom = dlg.querySelector('#wmereq-reason-custom').value.trim();
        const parts = [...selected];
        if (custom) parts.push(custom);
        close(true, parts.join(', '), levelSel ? parseInt(levelSel.value, 10) : null);
      });
      dlg.querySelector('#wmereq-reason-cancel').addEventListener('click', () => close(false));
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) close(false);
      });
    });
  }
  // ── Submit ────────────────────────────────────────────────────────────────────
  async function submitRequest(type) {
    const countryId = byId('wmereq-country')?.value ?? '';
    const regionId = byId('wmereq-region')?.value ?? '';
    const lockLevel = byId('wmereq-lock')?.value ?? '';
    let notes = byId('wmereq-notes')?.value.trim() ?? '';
    if (!countryId) {
      showStatus('Please select a country.', 'error');
      return;
    }
    if (LOCK_GATED_TYPES.includes(type) && !lockLevel) {
      showStatus('Please select a lock level.', 'error');
      return;
    }
    const entity = getSelectedEntity();
    if (!checkEntityForType(type, entity, showStatus, 'Please select a segment, map note, or place first.')) return;
    const cfg = getReasonModalConfig(type, entity.kind);
    if (cfg) {
      // requireLevel is deliberately omitted here — the panel form already has its own
      // explicit Lock Level select above, so the reason modal doesn't need to duplicate it.
      const { confirmed, reason } = await openReasonModal(cfg);
      if (!confirmed) return;
      if (reason) notes = notes ? `Reason: ${reason}\n${notes}` : `Reason: ${reason}`;
    }
    await doSubmit(type, { entity, countryId, regionId, lockLevel, notes, status: showStatus });
  }
  // Reports (via `status`) and returns false if nothing is selected or the selection's kind
  // can't take this request type — see TYPE_ENTITY_KINDS.
  function checkEntityForType(type, entity, status, emptyMessage) {
    if (!entity || !entity.items.length) {
      status(emptyMessage, 'error');
      return false;
    }
    if (!TYPE_ENTITY_KINDS[type].includes(entity.kind)) {
      status(
        `${describeType(type)} requests require a selected ${TYPE_ENTITY_KINDS[type].map(describeKind).join(' or ')}.`,
        'error',
      );
      return false;
    }
    return true;
  }
  // Quick submit from the floating action buttons, using the currently selected
  // entity's inferred country/region and lock level (no need to open the panel).
  // Each type only accepts certain entity kinds — see TYPE_ENTITY_KINDS.
  // `statusFn` defaults to the floating bubble (for the map-side FAB buttons) but the
  // in-panel quick-action buttons pass showStatus instead, so feedback lands in the panel.
  async function quickSubmit(type, statusFn = showFabStatus) {
    const entity = getSelectedEntity();
    if (!checkEntityForType(type, entity, statusFn, 'Select a segment, map note, or place first.')) return;
    // Only segments have a per-entity address lookup (DataModel.Segments.getAddress) —
    // venues/notes fall back to the view-based (top country/state) detection.
    const address = entity.kind === 'segment' ? getSegmentAddress(entity.items[0]) : null;
    const countryId = resolveCurrentCountryId(address);
    const regionId = resolveCurrentRegionId(address);
    // Uplock has no current level to infer from — the whole point is asking for a *higher*
    // level than what's set now, so the target has to be an explicit choice (via the reason
    // modal's level select below), not read off the entity.
    // This lockLevel is only a fallback default (used as-is for venues/notes, and for any
    // segment that has no lock data of its own) — doSubmit() re-derives the real per-segment
    // levels itself and splits mixed-level segment selections into separate requests.
    let lockLevel = null;
    if (type !== 'uplock' && (entity.kind === 'segment' || entity.kind === 'venue')) {
      lockLevel = entity.items.map((it) => lockLevelOf(it)).find((l) => l != null) ?? null;
    }
    if (!countryId) {
      statusFn('Could not detect the country — use the panel.', 'error');
      return;
    }
    if (LOCK_GATED_TYPES.includes(type) && type !== 'uplock' && !lockLevel) {
      statusFn('Selected entity has no lock level.', 'error');
      return;
    }
    let notes = null;
    const cfg = getReasonModalConfig(type, entity.kind);
    if (cfg) {
      const requireLevel = type === 'uplock';
      const { confirmed, reason, level } = await openReasonModal({ ...cfg, requireLevel });
      if (!confirmed) return;
      if (requireLevel) lockLevel = level;
      notes = reason ? `Reason: ${reason}` : null;
    }
    if (type === 'uplock' && !lockLevel) {
      statusFn('Please select a target lock level.', 'error');
      return;
    }
    await doSubmit(type, {
      entity,
      countryId: String(countryId),
      regionId: regionId ? String(regionId) : '',
      lockLevel: lockLevel ? String(lockLevel) : '',
      notes,
      status: statusFn,
    });
  }
  function describeType(type) {
    return TYPE_LABELS[type] || type;
  }
  function describeKind(kind) {
    return KIND_LABELS[kind] || kind;
  }
  async function doSubmit(type, { entity, countryId, regionId, lockLevel, notes, status }) {
    const { userName, editorRank } = getCurrentUserInfo();
    const parsedLockLevel = lockLevel ? parseInt(lockLevel, 10) : null;
    // A segment selection can mix lock levels (e.g. some L4, some L5) — one bundled
    // request with a single lock_level would be wrong for whichever segments don't match
    // it, so split into one request per level instead. Only meaningful for lock-gated
    // types, and not for uplock even among those: there the lock level is an explicit
    // *target* the user picks (via the reason modal), not each segment's current level,
    // so there's nothing of its own to group by.
    const groups =
      LOCK_GATED_TYPES.includes(type) && type !== 'uplock' && entity.kind === 'segment'
        ? groupByLockLevel(entity.items)
        : [{ level: parsedLockLevel, items: entity.items }];
    // Uploaded once (if any) and its key reused across every group's request — not
    // re-uploaded per group — so it's already present when notifications fire.
    let screenshotKey = null;
    // Shown alongside the success message — a failed upload doesn't block the request,
    // but the user should know it went without the screenshot they attached.
    let screenshotWarning = '';
    if (capturedScreenshotBlob) {
      status('Uploading screenshot…', 'info');
      try {
        const upload = await gmRequest(
          'POST',
          '/screenshots',
          capturedScreenshotBlob,
          capturedScreenshotBlob.type || 'image/jpeg',
        );
        screenshotKey = upload.key;
      } catch (e) {
        const message = e.message;
        log('Screenshot upload failed, continuing without it: ' + message);
        screenshotWarning = ` (Screenshot upload failed: ${message})`;
      }
    }
    disableButtons(true);
    const results = [];
    try {
      for (const group of groups) {
        // Segments with no lock data of their own (group.level == null) fall back to
        // whatever level was passed in (manual dropdown choice or the FAB's inferred one).
        const groupLevel = group.level != null ? group.level : parsedLockLevel;
        if (LOCK_GATED_TYPES.includes(type) && groupLevel && editorRank != null && editorRank >= groupLevel) {
          status(
            `Your edit rank (${editorRank}) already covers lock level ${groupLevel} — skipping ${group.items.length} segment(s).`,
            'error',
          );
          continue;
        }
        const body = {
          country_id: parseInt(countryId, 10),
          region_id: regionId ? parseInt(regionId, 10) : null,
          type,
          permalink: buildPermalink(group.items, entity.kind),
          notes: notes || null,
          submitted_by: userName || null,
          editor_rank: editorRank,
          ...(LOCK_GATED_TYPES.includes(type) && groupLevel ? { lock_level: groupLevel } : {}),
          ...(screenshotKey ? { screenshot_key: screenshotKey } : {}),
        };
        log(`doSubmit: request body = ${JSON.stringify(body)}`);
        status(groups.length > 1 ? `Submitting L${groupLevel ?? '?'} request…` : 'Submitting…', 'info');
        results.push(await gmRequest('POST', '/requests', body));
      }
      if (results.length) {
        status(
          (results.length > 1
            ? `${results.length} requests submitted successfully (#${results.map((r) => r.id).join(', #')}).`
            : `Request #${results[0].id} submitted successfully.`) + screenshotWarning,
          screenshotWarning ? 'error' : 'ok',
        );
        capturedScreenshotBlob = null;
        updateScreenshotButton();
        clearForm();
      }
    } catch (e) {
      status(`Error: ${e.message}`, 'error');
    } finally {
      disableButtons(false);
    }
  }
  // ── Countries / Regions ──────────────────────────────────────────────────────
  async function fetchCountries() {
    try {
      countries = await gmRequest('GET', '/countries');
      const sel = byId('wmereq-country');
      if (!sel) return;
      sel.innerHTML = countries.length
        ? countries.map((c) => `<option value="${c.id}">${escHtml(c.name)} (${escHtml(c.code)})</option>`).join('')
        : '<option value="">No countries configured</option>';
      applyAutoCountry(null);
    } catch (e) {
      const sel = byId('wmereq-country');
      if (sel) sel.innerHTML = '<option value="">Error loading countries</option>';
      log('Failed to load countries: ' + e.message);
    }
  }
  // Tracks which country's regions are currently loaded, so re-detecting the same
  // country on every selection change (the common case) doesn't refire the API call.
  let regionsLoadedForCountryId = null;
  // In-flight region requests by country id, so a selection change and a map move landing
  // together share one request instead of each firing their own.
  const regionFetches = new Map();
  // Refetches the region list for the given country and repopulates the region select.
  // Called whenever the country changes, whether by auto-detect or manual selection.
  async function fetchRegions(countryId, address = null) {
    const sel = byId('wmereq-region');
    if (!countryId) {
      regions = [];
      regionsLoadedForCountryId = null;
      if (sel) sel.innerHTML = '<option value="">Country-wide</option>';
      return;
    }
    if (countryId === regionsLoadedForCountryId) {
      applyAutoRegion(address);
      return;
    }
    try {
      let pending = regionFetches.get(countryId);
      if (!pending) {
        pending = gmRequest('GET', `/countries/${countryId}/regions`);
        regionFetches.set(countryId, pending);
        const settle = () => {
          if (regionFetches.get(countryId) === pending) regionFetches.delete(countryId);
        };
        pending.then(settle, settle);
      }
      const result = await pending;
      // The country was switched again while this was in flight — its own fetch owns the
      // region list now, so a late response here mustn't overwrite it.
      if (byId('wmereq-country')?.value !== countryId) {
        debugLog(`fetchRegions: ignoring stale regions for country ${countryId}.`);
        return;
      }
      // Another caller sharing the same request already populated the list.
      if (countryId === regionsLoadedForCountryId) {
        applyAutoRegion(address);
        return;
      }
      regions = result;
      regionsLoadedForCountryId = countryId;
      if (sel) {
        sel.innerHTML =
          '<option value="">Country-wide</option>' +
          regions.map((r) => `<option value="${r.id}">${escHtml(r.name)} (${escHtml(r.code)})</option>`).join('');
      }
      applyAutoRegion(address);
    } catch (e) {
      log('Failed to load regions: ' + e.message);
    }
  }
  // ── Settings section (always visible, below the request form) ──────────────────
  function saveSettings() {
    const val = byId('wmereq-api-base')?.value.trim().replace(/\/$/, '');
    if (val) {
      apiBase = val;
      GM_setValue('apiBase', val);
      regionsLoadedForCountryId = null; // a different backend may have different regions for the same id
      regionFetches.clear();
      fetchCountries();
    }
    fabStyle = byId('wmereq-fab-style')?.value ?? fabStyle;
    GM_setValue('fabStyle', fabStyle);
    applyFabStyle();
    for (const type of FAB_TYPES) {
      const checkbox = byId(`wmereq-fab-visible-${typeSlug(type)}`);
      if (checkbox) fabVisible[type] = checkbox.checked;
    }
    GM_setValue('wmereq-fab-visible', JSON.stringify(fabVisible));
    applyFabVisibility();
    showStatus('Settings saved.', 'ok');
  }
  // ── API helpers (GM_xmlhttpRequest) ───────────────────────────────────────────
  const REQUEST_TIMEOUT_MS = 15000;
  // One request helper for every API call. `data` is sent as JSON unless it's a Blob (the
  // screenshot upload), which goes as the raw body with the given `contentType` —
  // GM_xmlhttpRequest accepts a Blob directly for `data`, same as fetch's body would.
  // The timeout matters: a stalled request would otherwise leave the submit buttons
  // disabled for good.
  function gmRequest(method, path, data, contentType = 'application/json') {
    const body = data === undefined ? undefined : data instanceof Blob ? data : JSON.stringify(data);
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url: `${apiBase}/api${path}`,
        ...(body !== undefined ? { headers: { 'Content-Type': contentType }, data: body } : {}),
        timeout: REQUEST_TIMEOUT_MS,
        onload: (res) => {
          let parsed;
          try {
            parsed = JSON.parse(res.responseText);
          } catch {
            // e.g. a Cloudflare HTML error page instead of our API's JSON
            reject(new Error(`Unexpected response from the server (HTTP ${res.status}).`));
            return;
          }
          if (res.status >= 400) reject(new Error(parsed?.error || `API error (HTTP ${res.status})`));
          else resolve(parsed);
        },
        onerror: (e) => reject(new Error('Network error: ' + (e.error || ''))),
        ontimeout: () => reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`)),
      });
    });
  }
  // ── UI helpers ────────────────────────────────────────────────────────────────
  function byId(id) {
    return document.getElementById(id);
  }
  function on(id, event, fn) {
    const el = byId(id);
    if (el) el.addEventListener(event, fn);
  }
  function showStatus(msg, type) {
    const el = byId('wmereq-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `wmereq-status ${type}`;
    el.style.display = 'block';
  }
  // Every quick-action button (panel rows and native-injected alike) carries
  // data-wmereq-qa-type, so this one selector covers them plus the FABs and submit buttons.
  function disableButtons(disabled) {
    document.querySelectorAll('[data-wmereq-qa-type], .wmereq-fab, [id^="wmereq-btn-submit-"]').forEach((btn) => {
      btn.disabled = disabled;
    });
  }
  let fabStatusTimer;
  function showFabStatus(msg, type) {
    const el = byId('wmereq-fab-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `wmereq-fab-status ${type}`;
    el.style.display = 'block';
    clearTimeout(fabStatusTimer);
    fabStatusTimer = setTimeout(() => {
      el.style.display = 'none';
    }, 4000);
  }
  function clearForm() {
    const notes = byId('wmereq-notes');
    if (notes) notes.value = '';
  }
  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  // Browser APIs don't always reject with an Error (or with anything at all), so caught
  // values are read through this instead of assuming `.message` exists.
  function errorMessage(e) {
    if (e instanceof Error) return e.message;
    return e == null ? 'unknown error' : String(e);
  }
  function log(msg) {
    console.log(`[${SCRIPT_NAME}] ${msg}`);
  }
  // Verbose diagnostics (SDK object dumps) run on every selection change, so they're
  // gated behind this flag instead of always paying the JSON.stringify/string-build
  // cost. Enable via `GM_setValue('wmereq-debug', true)` in the console when diagnosing
  // an SDK method-resolution issue.
  const DEBUG = GM_getValue('wmereq-debug', false);
  function debugLog(msg) {
    if (DEBUG) log(msg);
  }
  // Reads the running version from the userscript manager's metadata (GM_info) rather
  // than a separate hardcoded constant, so it can never drift from the @version header.
  function getScriptVersion() {
    try {
      return (typeof GM_info !== 'undefined' && GM_info.script?.version) || 'unknown';
    } catch {
      return 'unknown';
    }
  }
  // ── Start ─────────────────────────────────────────────────────────────────────
  bootstrap();
})();
