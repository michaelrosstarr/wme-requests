// ==UserScript==
// @name         WME Requests
// @namespace    https://github.com/michaelrosstarr/wme-requests
// @version      2.7.1
// @description  Send downlock, imagery, and place update (accept/decline PUR) requests from Waze Map Editor, with notifications to Slack, Discord and Telegram.
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
// @connect      *
// @supportURL   https://github.com/michaelrosstarr/wme-requests/issues
// @updateURL    https://raw.githubusercontent.com/michaelrosstarr/wme-requests/main/userscript/wme-requests.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelrosstarr/wme-requests/main/userscript/wme-requests.user.js
// ==/UserScript==

/* global unsafeWindow */
(function () {
  'use strict';

  // ── Configuration ───────────────────────────────────────────────────────────
  // Set this to your deployed Cloudflare Workers URL (no trailing slash).
  // You can also change it in the script settings panel inside WME.
  const DEFAULT_API_BASE = 'https://requests.wazetools.com';

  const SCRIPT_NAME = 'WME Requests';
  const PANEL_ID = 'wme-requests-panel';
  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // ── State ───────────────────────────────────────────────────────────────────
  let apiBase = GM_getValue('apiBase', DEFAULT_API_BASE);
  // 'full' (text only), 'compact' (icon + text), or 'icon' (icon only) — style of the
  // always-visible floating Downlock/Imagery buttons. See applyFabStyle().
  let fabStyle = GM_getValue('fabStyle', 'full');
  // Per-button show/hide for the floating action buttons — see applyFabVisibility().
  let fabVisible = loadFabVisible();
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

  const LOCK_GATED_TYPES = ['downlock', 'accept_pur', 'decline_pur'];

  const TYPE_ENTITY_KINDS = {
    downlock: ['segment'],
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
      sdk = pageWindow.getWmeSdk({ scriptId: 'wme-requests', scriptName: SCRIPT_NAME });
      resolveSdkMethods();
      sdk.Events.once({ eventName: 'wme-ready' }).then(init);
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

  function onMapMoveEnd() {
    debugLog('onMapMoveEnd: fired, re-running auto country/region detection.');
    const segments = getSelectedSegments();
    applyAutoCountry(segments[0]);
  }

  function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function sdkMethodOf(obj, candidates, label) {
    if (!obj) {
      log(`${label}: parent object is missing from the SDK.`);
      return null;
    }
    for (const name of candidates) {
      if (typeof obj[name] === 'function') return obj[name].bind(obj);
    }
    const available = Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).join(', ');
    log(`${label}: none of [${candidates.join(', ')}] exist. Available methods: ${available}`);
    return null;
  }

  function resolveSdkMethods() {
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
    getTopStateFn = sdkMethodOf(sdk.DataModel?.States, ['getTopState', 'getTopStateId'], 'DataModel.States.getTopState');
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
      #wmereq-reason-overlay textarea {
        width: 100%; padding: 5px 7px; border: 1px solid #ccc; border-radius: 4px;
        font-size: 12px; box-sizing: border-box; resize: vertical; min-height: 50px;
      }
      #wmereq-reason-overlay .wmereq-reason-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      #wmereq-reason-overlay .wmereq-chip {
        border: 1px solid #ccc; background: #f7f7f7; color: #333; border-radius: 14px;
        padding: 5px 12px; font-size: 12px; cursor: pointer; transition: all .15s;
      }
      #wmereq-reason-overlay .wmereq-chip:hover { background: #eee; }
      #wmereq-reason-overlay .wmereq-chip.active { background: #0a8cff; border-color: #0a8cff; color: #fff; }
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
      #wmereq-floating-actions .wmereq-fab-imagery  { background: #0a8cff; }
      #wmereq-floating-actions .wmereq-fab-accept-pur  { background: #2ecc71; }
      #wmereq-floating-actions .wmereq-fab-decline-pur { background: #f39c12; }
      #wmereq-floating-actions .wmereq-fab-icon { display: none; font-size: 13px; line-height: 1; }
      /* Icon + text mode: shows the icon alongside the (already small) label. */
      #wmereq-floating-actions.wmereq-fab-compact .wmereq-fab-icon { display: inline; }
      /* Icon-only mode: circular button, label hidden entirely. */
      #wmereq-floating-actions.wmereq-fab-icon-only .wmereq-fab {
        width: 38px; height: 38px; padding: 0; border-radius: 50%;
      }
      #wmereq-floating-actions.wmereq-fab-icon-only .wmereq-fab-icon { display: inline; font-size: 16px; }
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
    const tabContent = document.querySelector('#user-info .tab-content') || document.querySelector('#sidebar .tab-content');

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
    wrapper.innerHTML = `<button class="wmereq-btn wmereq-btn-close" id="wmereq-btn-close" title="Hide">×</button>` + buildPanelHTML();
    document.body.appendChild(wrapper);
    on('wmereq-btn-close', 'click', () => { wrapper.style.display = 'none'; });
  }

  function createFloatingActions() {
    if (byId('wmereq-floating-actions')) return;
    const wrap = document.createElement('div');
    wrap.id = 'wmereq-floating-actions';
    wrap.innerHTML = `
      <div class="wmereq-fab-handle" title="Drag to move">⠿ ⠿ ⠿</div>
      <div id="wmereq-fab-status" class="wmereq-fab-status" style="display:none"></div>
      <button class="wmereq-fab wmereq-fab-downlock" id="wmereq-fab-downlock" title="Submit a downlock request for the selected segment"><span class="wmereq-fab-icon">🔒</span><span class="wmereq-fab-label">Downlock</span></button>
      <button class="wmereq-fab wmereq-fab-imagery" id="wmereq-fab-imagery" title="Submit an imagery request for the selected segment or map note"><span class="wmereq-fab-icon">📷</span><span class="wmereq-fab-label">Imagery</span></button>
      <button class="wmereq-fab wmereq-fab-accept-pur" id="wmereq-fab-accept-pur" title="Submit an Accept PUR request for the selected place"><span class="wmereq-fab-icon">✅</span><span class="wmereq-fab-label">Accept PUR</span></button>
      <button class="wmereq-fab wmereq-fab-decline-pur" id="wmereq-fab-decline-pur" title="Submit a Decline PUR request for the selected place"><span class="wmereq-fab-icon">🚫</span><span class="wmereq-fab-label">Decline PUR</span></button>
    `;
    document.body.appendChild(wrap);
    on('wmereq-fab-downlock', 'click', () => quickSubmit('downlock'));
    on('wmereq-fab-imagery', 'click', () => quickSubmit('imagery'));
    on('wmereq-fab-accept-pur', 'click', () => quickSubmit('accept_pur'));
    on('wmereq-fab-decline-pur', 'click', () => quickSubmit('decline_pur'));
    makeDraggable(wrap, wrap.querySelector('.wmereq-fab-handle'), 'wmereq-fab-pos');
    applyFabStyle();
    applyFabVisibility();
  }

  function applyFabStyle() {
    const wrap = byId('wmereq-floating-actions');
    if (!wrap) return;
    wrap.classList.toggle('wmereq-fab-compact', fabStyle === 'compact');
    wrap.classList.toggle('wmereq-fab-icon-only', fabStyle === 'icon');
  }

  const FAB_TYPES = ['downlock', 'imagery', 'accept_pur', 'decline_pur'];

  function loadFabVisible() {
    const defaults = { downlock: true, imagery: true, accept_pur: true, decline_pur: true };
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
      const btn = byId(`wmereq-fab-${type.replace('_', '-')}`);
      if (btn) btn.style.display = fabVisible[type] === false ? 'none' : '';
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

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startTop = 0;
    let startLeft = 0;

    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      const rect = container.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startTop = rect.top;
      startLeft = rect.left;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const maxTop = Math.max(0, window.innerHeight - container.offsetHeight);
      const maxLeft = Math.max(0, window.innerWidth - container.offsetWidth);
      const top = Math.min(Math.max(0, startTop + (e.clientY - startY)), maxTop);
      const left = Math.min(Math.max(0, startLeft + (e.clientX - startX)), maxLeft);
      container.style.top = `${top}px`;
      container.style.left = `${left}px`;
      container.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      const rect = container.getBoundingClientRect();
      GM_setValue(storageKey, JSON.stringify({ top: rect.top, left: rect.left }));
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

          <label>Region <span style="font-weight:400;color:#888">(optional)</span></label>
          <select id="wmereq-region">
            <option value="">Country-wide</option>
          </select>

          <label>Request Type</label>
          <select id="wmereq-type">
            <option value="downlock">Downlock</option>
            <option value="imagery">Imagery</option>
            <option value="accept_pur">Accept PUR</option>
            <option value="decline_pur">Decline PUR</option>
          </select>

          <div id="wmereq-lock-row">
            <label>Lock Level <span id="wmereq-lock-hint" style="font-weight:400;color:#888"></span></label>
            <select id="wmereq-lock">
              <option value="">— select —</option>
              ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </div>

          <label>Notes (optional)</label>
          <textarea id="wmereq-notes" placeholder="Any extra context…"></textarea>

          ${screenshotCaptureSupported() ? `<button type="button" class="wmereq-btn wmereq-btn-cancel" id="wmereq-btn-screenshot" style="width:100%;box-sizing:border-box;margin-bottom:8px">📷 Attach Screenshot</button>` : ''}

          <button class="wmereq-btn wmereq-btn-downlock" id="wmereq-btn-submit-downlock">Submit Downlock</button>
          <button class="wmereq-btn wmereq-btn-imagery"  id="wmereq-btn-submit-imagery">Submit Imagery</button>
          <button class="wmereq-btn wmereq-btn-accept-pur" id="wmereq-btn-submit-accept-pur">Submit Accept PUR</button>
          <button class="wmereq-btn wmereq-btn-decline-pur" id="wmereq-btn-submit-decline-pur">Submit Decline PUR</button>

          <div id="wmereq-status" class="wmereq-status info" style="display:none"></div>
        </div>

        <div class="wmereq-section" id="wmereq-settings-section">
          <div style="font-weight:600;margin-bottom:8px;color:#333">Settings</div>

          <label>API Base URL</label>
          <input id="wmereq-api-base" type="url" value="${escHtml(apiBase)}" placeholder="https://your-project.your-subdomain.workers.dev" />

          <label>Floating Buttons</label>
          <select id="wmereq-fab-style">
            <option value="full" ${fabStyle === 'full' ? 'selected' : ''}>Text only</option>
            <option value="compact" ${fabStyle === 'compact' ? 'selected' : ''}>Icon + text</option>
            <option value="icon" ${fabStyle === 'icon' ? 'selected' : ''}>Icon only</option>
          </select>

          <label>Show on Map</label>
          <div class="wmereq-fab-visibility">
            ${FAB_TYPES.map((type) => `
              <label style="display:flex;align-items:center;font-weight:400;margin-bottom:4px">
                <input type="checkbox" id="wmereq-fab-visible-${type.replace('_', '-')}" style="width:auto;margin:0 6px 0 0" ${fabVisible[type] !== false ? 'checked' : ''} />
                ${describeType(type)}
              </label>`).join('')}
          </div>

          <button type="button" class="wmereq-btn wmereq-btn-cancel" id="wmereq-fab-reset-pos" style="width:100%;box-sizing:border-box;margin-bottom:8px">Reset Button Position</button>

          <button class="wmereq-btn wmereq-btn-primary" id="wmereq-settings-save">Save Settings</button>
        </div>

        <div class="wmereq-version">${SCRIPT_NAME} v${escHtml(getScriptVersion())}</div>
      </div>`;
  }

  function bindPanelEvents() {
    on('wmereq-type', 'change', syncLockRow);
    on('wmereq-country', 'change', (e) => fetchRegions(e.target.value));
    on('wmereq-btn-submit-downlock', 'click', () => submitRequest('downlock'));
    on('wmereq-btn-submit-imagery', 'click', () => submitRequest('imagery'));
    on('wmereq-btn-submit-accept-pur', 'click', () => submitRequest('accept_pur'));
    on('wmereq-btn-submit-decline-pur', 'click', () => submitRequest('decline_pur'));
    on('wmereq-settings-save', 'click', saveSettings);
    on('wmereq-fab-reset-pos', 'click', resetFabPosition);
    on('wmereq-btn-screenshot', 'click', handleScreenshotButtonClick);
  }

  // ── Viewport screenshot (optional, Chrome-only) ───────────────────────────────
  // Uses the Element Capture API (RestrictionTarget) to crop a getDisplayMedia
  // stream down to just the map viewport element. This is a very new, Chrome-only
  // API — screenshotCaptureSupported() gates the button so unsupported browsers
  // (Firefox, Safari, older Chrome) simply don't see the option.
  let capturedScreenshotBlob = null;

  function screenshotCaptureSupported() {
    return typeof RestrictionTarget !== 'undefined' &&
      typeof ImageCapture !== 'undefined' &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  }

  async function captureViewportScreenshot() {
    const viewportEl = sdk.Map.getMapViewportElement();
    if (!viewportEl) throw new Error('Could not find the map viewport element.');

    const stream = await navigator.mediaDevices.getDisplayMedia({ preferCurrentTab: true });
    const [track] = stream.getVideoTracks();
    try {
      const restrictionTarget = await RestrictionTarget.fromElement(viewportEl);
      await track.restrictTo(restrictionTarget);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const imgCap = new ImageCapture(track);
      const imageBitmap = await imgCap.grabFrame();

      const canvas = document.createElement('canvas');
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context.');
      ctx.drawImage(imageBitmap, 0, 0);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Failed to create an image from the canvas.');
      return blob;
    } finally {
      stream.getTracks().forEach((t) => t.stop());
    }
  }

  function updateScreenshotButton() {
    const btn = byId('wmereq-btn-screenshot');
    if (!btn) return;
    btn.textContent = capturedScreenshotBlob ? '📷 Screenshot attached ✓ (click to retake)' : '📷 Attach Screenshot';
  }

  async function handleScreenshotButtonClick() {
    const btn = byId('wmereq-btn-screenshot');
    if (btn) { btn.disabled = true; btn.textContent = 'Capturing…'; }
    try {
      capturedScreenshotBlob = await captureViewportScreenshot();
    } catch (e) {
      log('Screenshot capture failed: ' + e.message);
      showStatus(`Screenshot capture failed: ${e.message}`, 'error');
      capturedScreenshotBlob = null;
    } finally {
      if (btn) btn.disabled = false;
      updateScreenshotButton();
    }
  }

  // ── Selection helpers ─────────────────────────────────────────────────────────
  function normalizeSelection(raw) {
    if (!raw) return null;
    if (Array.isArray(raw.ids)) {
      if (raw.objectType === 'mapComment') return { kind: 'mapComment', ids: raw.ids };
      if (raw.objectType === 'venue') return { kind: 'venue', ids: raw.ids };
      if (!raw.objectType || raw.objectType === 'segment') return { kind: 'segment', ids: raw.ids };
      return null;
    }
    if (Array.isArray(raw.segmentIds)) return { kind: 'segment', ids: raw.segmentIds };
    if (Array.isArray(raw)) {
      const segIds = raw
        .filter((f) => (f.objectType || f.type) === 'segment' || f.segmentId != null)
        .map((f) => f.id ?? f.segmentId);
      if (segIds.length) return { kind: 'segment', ids: segIds };
      const noteIds = raw.filter((f) => (f.objectType || f.type) === 'mapComment').map((f) => f.id);
      if (noteIds.length) return { kind: 'mapComment', ids: noteIds };
      const venueIds = raw.filter((f) => (f.objectType || f.type) === 'venue').map((f) => f.id);
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
    if (!getVenueByIdFn) { log('getVenueEntityFromIssueTracker: no getVenueByIdFn resolved.'); return null; }
    try {
      const markers = pageWindow.W?.issueTrackerController?.app?.selectedMarkers;
      const raw = Array.isArray(markers) ? markers[0] : null;
      const venueId = raw ? Number(String(raw).split('.')[0]) : null;
      log(`getVenueEntityFromIssueTracker: selectedMarkers = ${JSON.stringify(markers)}, parsed venueId = ${venueId}`);
      if (!venueId) return null;
      const venue = getVenueByIdFn({ venueId });
      log(`getVenueEntityFromIssueTracker: getVenueByIdFn({ venueId: ${venueId} }) = ${venue ? JSON.stringify(venue) : 'nothing'}`);
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
        const items = normalized.ids.map((segmentId) => getSegmentByIdFn({ segmentId })).filter(Boolean);
        return items.length ? { kind: 'segment', items } : null;
      }
      if (normalized.kind === 'mapComment') {
        if (!getMapCommentByIdFn) return null;
        const items = normalized.ids.map((mapCommentId) => getMapCommentByIdFn({ mapCommentId })).filter(Boolean);
        return items.length ? { kind: 'mapComment', items } : null;
      }
      if (normalized.kind === 'venue') {
        if (!getVenueByIdFn) return null;
        const items = normalized.ids.map((venueId) => getVenueByIdFn({ venueId })).filter(Boolean);
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
    if (DEBUG) debugLog(`getVenueEntityFromUrl: location.search = "${window.location.search}", venueUpdateRequest param = ${raw ? `"${raw}"` : 'missing'}`);
    const venueId = raw ? Number(raw.split('.')[0]) : null;
    if (!venueId) return null;
    try {
      const venue = getVenueByIdFn({ venueId });
      if (DEBUG) debugLog(`getVenueEntityFromUrl: getVenueByIdFn({ venueId: ${venueId} }) = ${venue ? JSON.stringify(venue) : 'nothing'}`);
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

  // Returns the first defined value among several possible field-name spellings,
  // since exact field casing on SDK objects isn't confirmed by the public docs.
  function pick(obj, keys) {
    if (!obj) return null;
    for (const k of keys) {
      if (obj[k] != null) return obj[k];
    }
    return null;
  }

  // ── Segment / map note selection ─────────────────────────────────────────────
  function onSelectionChanged() {
    const entity = getSelectedEntity();
    const infoDiv = byId('wmereq-segment-info');
    const lockSel = byId('wmereq-lock');

    if (!infoDiv) return;

    if (!entity || !entity.items.length) {
      infoDiv.innerHTML = '<div class="wmereq-hint">Select a segment, map note, or place on the map to get started.</div>';
      return;
    }

    if (entity.kind === 'venue') {
      const venues = entity.items;
      const multiHint = venues.length > 1
        ? `<div class="wmereq-hint">${venues.length} places selected — permalink will include all of them.</div>`
        : '';
      const venue = venues[0];
      const lockRankRaw = pick(venue, ['lockRank', 'lockLevel']);
      const lockLevel = lockRankRaw != null ? lockRankRaw + 1 : null; // WME stores 0-based rank
      const placeName = pick(venue, ['name']) || 'Unnamed Place';
      const permalink = buildPermalink(venues, 'venue');

      infoDiv.innerHTML = `
        ${multiHint}
        <div class="wmereq-lock-info">
          <strong>${escHtml(placeName)}</strong>${lockLevel ? ` · Lock: ${lockLevel}` : ''}<br>
          <small style="word-break:break-all">${escHtml(permalink)}</small>
        </div>`;

      // Auto-select the inferred lock level, same as segments — a place's lock rank is
      // what determines whether an editor's rank is enough to accept/decline it themselves.
      if (lockLevel && lockSel) {
        lockSel.value = String(lockLevel);
        const hint = byId('wmereq-lock-hint');
        if (hint) hint.textContent = `(inferred from place: ${lockLevel})`;
      }

      applyAutoCountry(null);
      syncLockRow();
      return;
    }

    if (entity.kind === 'mapComment') {
      const notes = entity.items;
      const multiHint = notes.length > 1
        ? `<div class="wmereq-hint">${notes.length} map notes selected — permalink will include all of them.</div>`
        : '';
      const note = notes[0];
      const permalink = buildPermalink(notes, 'mapComment');

      infoDiv.innerHTML = `
        ${multiHint}
        <div class="wmereq-lock-info">
          <strong>Map Note</strong>${note.subject ? `: ${escHtml(note.subject)}` : ''}<br>
          <small style="word-break:break-all">${escHtml(permalink)}</small>
        </div>`;

      // Map notes don't carry a lock rank the way segments do, so nothing to
      // auto-select on wmereq-lock here. There's also no per-entity address
      // lookup for a note (only Segments exposes getAddress) — applyAutoCountry(null)
      // skips the exact-address attempt and falls straight to the view-based
      // (top country/state) fallback, which is approximate but the best available.
      applyAutoCountry(null);
      syncLockRow();
      return;
    }

    const segments = entity.items;
    const multiHint = segments.length > 1
      ? `<div class="wmereq-hint">${segments.length} segments selected — permalink will include all of them.</div>`
      : '';

    const seg = segments[0];
    const lockRankRaw = pick(seg, ['lockRank', 'lockLevel']);
    const lockLevel = lockRankRaw != null ? lockRankRaw + 1 : null; // WME stores 0-based rank
    const roadType = getRoadTypeName(pick(seg, ['roadType']));
    const permalink = buildPermalink(segments, 'segment');

    infoDiv.innerHTML = `
      ${multiHint}
      <div class="wmereq-lock-info">
        <strong>${roadType}</strong>${lockLevel ? ` · Lock: ${lockLevel}` : ''}<br>
        <small style="word-break:break-all">${escHtml(permalink)}</small>
      </div>`;

    // Auto-select the inferred lock level
    if (lockLevel && lockSel) {
      lockSel.value = String(lockLevel);
      const hint = byId('wmereq-lock-hint');
      if (hint) hint.textContent = `(inferred from segment: ${lockLevel})`;
    }

    applyAutoCountry(seg);
    syncLockRow();
  }

  // Matches an SDK country/state object (exact field casing unconfirmed by the public
  // docs) against one of our own backend's lists, by ISO code or name.
  function matchByNameOrCode(list, obj) {
    if (!obj) return null;
    const name = String(pick(obj, ['name']) || '').toLowerCase();
    const abbr = String(pick(obj, ['abbr', 'code', 'isoCode']) || '').toLowerCase();
    return (
      list.find(
        (item) => (abbr && String(item.code || '').toLowerCase() === abbr) || String(item.name || '').toLowerCase() === name,
      ) || null
    );
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

  // Resolves the country for the current context: if a segment is given, its own
  // SegmentAddress.country is exact and tried first; otherwise (or if that doesn't
  // resolve) falls back to WME's "top country" for the current map view, which is
  // only approximate — it can be wrong near borders or for small regions.
  function resolveCurrentCountryId(seg) {
    if (!countries.length) { debugLog('resolveCurrentCountryId: no countries loaded from the API yet.'); return null; }

    const address = getSegmentAddress(seg);
    if (address) {
      const match = matchByNameOrCode(countries, address.country);
      log(
        `resolveCurrentCountryId: segment address country=${address.country ? JSON.stringify(address.country) : 'null'} ` +
        `→ ${match ? `matched "${match.name}" (id ${match.id})` : 'no match'}`,
      );
      if (match) return match.id;
    }

    if (!getTopCountryFn) { debugLog('resolveCurrentCountryId: no DataModel.Countries.getTopCountry method resolved.'); return null; }
    try {
      const topCountry = getTopCountryFn();
      if (!topCountry) {
        debugLog('resolveCurrentCountryId: getTopCountry() returned nothing.');
        return null;
      }
      if (DEBUG) debugLog(`resolveCurrentCountryId: top country object = ${JSON.stringify(topCountry)}`);
      const match = matchByNameOrCode(countries, topCountry);
      if (!match && DEBUG) {
        debugLog(`resolveCurrentCountryId: no configured country matched view country. Configured: ${countries.map((c) => `${c.name}/${c.code}`).join(', ')}`);
      }
      return match ? match.id : null;
    } catch (e) {
      debugLog('resolveCurrentCountryId: getTopCountry threw: ' + e.message);
      return null;
    }
  }

  function applyAutoCountry(seg) {
    const countrySel = byId('wmereq-country');
    if (!countrySel) return;
    const resolved = resolveCurrentCountryId(seg);
    if (resolved) {
      countrySel.value = String(resolved);
      fetchRegions(String(resolved), seg);
    }
  }

  // Resolves the region for the current context — same segment-address-first, then
  // view-based-fallback approach as resolveCurrentCountryId, but for state/province.
  function resolveCurrentRegionId(seg) {
    if (!regions.length) { debugLog('resolveCurrentRegionId: no regions loaded for the current country.'); return null; }

    const address = getSegmentAddress(seg);
    if (address) {
      const match = matchByNameOrCode(regions, address.state);
      log(
        `resolveCurrentRegionId: segment address state=${address.state ? JSON.stringify(address.state) : 'null'} — ` +
        `configured regions: [${regions.map((r) => `${r.name}/${r.code}`).join(', ')}] → ${match ? `matched "${match.name}" (id ${match.id})` : 'no match'}`,
      );
      if (match) return match.id;
    }

    if (!getTopStateFn) { debugLog('resolveCurrentRegionId: no DataModel.States.getTopState method resolved.'); return null; }
    try {
      const topState = getTopStateFn();
      if (!topState) {
        debugLog('resolveCurrentRegionId: getTopState() returned nothing.');
        return null;
      }
      if (DEBUG) debugLog(`resolveCurrentRegionId: top state object = ${JSON.stringify(topState)}`);
      const match = matchByNameOrCode(regions, topState);
      // Always printed (not gated behind DEBUG) so it's easy to see live in WME why a
      // given region did or didn't match, without needing to flip on debug mode first.
      log(
        `resolveCurrentRegionId: view state — configured regions: ` +
        `[${regions.map((r) => `${r.name}/${r.code}`).join(', ')}] → ${match ? `matched "${match.name}" (id ${match.id})` : 'no match'}`,
      );
      return match ? match.id : null;
    } catch (e) {
      debugLog('resolveCurrentRegionId: getTopState threw: ' + e.message);
      return null;
    }
  }

  function applyAutoRegion(seg) {
    const regionSel = byId('wmereq-region');
    if (!regionSel) return;
    const resolved = resolveCurrentRegionId(seg);
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
  function findUserInfo() {
    if (!sdk?.State) {
      debugLog('findUserInfo: sdk.State module is missing entirely.');
      return null;
    }
    if (DEBUG) debugLog(`findUserInfo: sdk.State = ${describeObject(sdk.State)}`);

    if (sdk.State.userInfo) {
      if (DEBUG) debugLog(`findUserInfo: sdk.State.userInfo (property) = ${JSON.stringify(sdk.State.userInfo)}`);
      return sdk.State.userInfo;
    }
    if (typeof sdk.State.getUserInfo === 'function') {
      const result = sdk.State.getUserInfo();
      if (DEBUG) debugLog(`findUserInfo: sdk.State.getUserInfo() = ${JSON.stringify(result)}`);
      if (result) return result;
    }
    if (typeof sdk.State.get === 'function') {
      const result = sdk.State.get('userInfo');
      if (DEBUG) debugLog(`findUserInfo: sdk.State.get('userInfo') = ${JSON.stringify(result)}`);
      if (result) return result;
    }
    if (sdk.User) {
      if (DEBUG) debugLog(`findUserInfo: sdk.User = ${describeObject(sdk.User)}`);
      if (sdk.User.userInfo) return sdk.User.userInfo;
      if (typeof sdk.User.getUserInfo === 'function') return sdk.User.getUserInfo();
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

  function syncLockRow() {
    const typeVal = (byId('wmereq-type') || {}).value;
    const lockRow = byId('wmereq-lock-row');
    if (lockRow) lockRow.style.display = LOCK_GATED_TYPES.includes(typeVal) ? '' : 'none';
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
      const lon = pick(center, ['lon', 'lng', 'x']);
      const lat = pick(center, ['lat', 'y']);
      const ids = items.map((s) => pick(s, ['id', 'segmentId'])).filter((id) => id != null).join(',');
      const param = kind === 'mapComment' ? 'mapComments' : kind === 'venue' ? 'venues' : 'segments';
      const base = `${window.location.origin}${window.location.pathname}`;
      return `${base}?env=row&lat=${lat}&lon=${lon}&zoomLevel=${zoom}&${param}=${ids}`;
    } catch (e) {
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
    } catch (e) {
      return href;
    }
  }

  function getRoadTypeName(type) {
    const names = {
      1: 'Street', 2: 'Primary Street', 3: 'Freeway', 4: 'Ramp', 5: 'Walking Trail', 6: 'Major Highway',
      7: 'Minor Highway', 8: 'Dirt Road/4x4 Trail', 10: 'Pedestrian Boardwalk', 16: 'Stairway',
      17: 'Private Road', 18: 'Railroad', 19: 'Runway/Taxiway', 20: 'Parking Lot Road', 21: 'Service Road',
    };
    return names[type] || `Road (${type})`;
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

  // Which request types show the reason modal before submitting, and with what title/chips.
  const REASON_MODAL_CONFIG = {
    downlock: { title: 'Downlock Reason', reasons: DOWNLOCK_REASONS, tooltips: DOWNLOCK_REASON_TOOLTIPS },
    accept_pur: { title: 'Accept PUR Reason', reasons: PUR_REASONS, tooltips: PUR_REASON_TOOLTIPS },
    decline_pur: { title: 'Decline PUR Reason', reasons: PUR_REASONS, tooltips: PUR_REASON_TOOLTIPS },
  };

  // Shows quick-pick reason chips (from `reasons`/`tooltips`) plus a free-text field, under
  // the given `title`. Resolves { confirmed: false } if cancelled, or
  // { confirmed: true, reason } otherwise (reason is '' if nothing was picked/typed but the
  // user chose to continue).
  function openReasonModal(title, reasons, tooltips) {
    return new Promise((resolve) => {
      const selected = new Set();
      const dlg = document.createElement('div');
      dlg.id = 'wmereq-reason-overlay';
      dlg.innerHTML = `
        <div class="wmereq-dialog">
          <h4>${escHtml(title)}</h4>
          <div class="wmereq-hint">Select one or more quick reasons, or add your own below.</div>
          <div class="wmereq-reason-chips">
            ${reasons.map((r) => `<button type="button" class="wmereq-chip" data-reason="${escHtml(r)}" title="${escHtml(tooltips[r] || r)}">${escHtml(r)}</button>`).join('')}
          </div>
          <label>Additional details (optional)</label>
          <textarea id="wmereq-reason-custom" placeholder="Any extra context…"></textarea>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="wmereq-btn wmereq-btn-primary" id="wmereq-reason-confirm">Continue</button>
            <button class="wmereq-btn wmereq-btn-cancel" id="wmereq-reason-cancel">Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(dlg);

      dlg.querySelectorAll('.wmereq-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          const reason = btn.getAttribute('data-reason');
          if (selected.has(reason)) { selected.delete(reason); btn.classList.remove('active'); }
          else { selected.add(reason); btn.classList.add('active'); }
        });
      });

      function close(confirmed, reason) {
        document.body.removeChild(dlg);
        resolve(confirmed ? { confirmed: true, reason } : { confirmed: false, reason: null });
      }

      dlg.querySelector('#wmereq-reason-confirm').addEventListener('click', () => {
        const custom = dlg.querySelector('#wmereq-reason-custom').value.trim();
        const parts = [...selected];
        if (custom) parts.push(custom);
        close(true, parts.join(', '));
      });
      dlg.querySelector('#wmereq-reason-cancel').addEventListener('click', () => close(false));
      dlg.addEventListener('click', (e) => { if (e.target === dlg) close(false); });
    });
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function submitRequest(type) {
    const countryId = (byId('wmereq-country') || {}).value;
    const regionId = (byId('wmereq-region') || {}).value;
    const lockLevel = (byId('wmereq-lock') || {}).value;
    let notes = (byId('wmereq-notes') || {}).value.trim();

    if (!countryId) { showStatus('Please select a country.', 'error'); return; }
    if (LOCK_GATED_TYPES.includes(type) && !lockLevel) { showStatus('Please select a lock level.', 'error'); return; }

    if (REASON_MODAL_CONFIG[type]) {
      const cfg = REASON_MODAL_CONFIG[type];
      const { confirmed, reason } = await openReasonModal(cfg.title, cfg.reasons, cfg.tooltips);
      if (!confirmed) return;
      if (reason) notes = notes ? `Reason: ${reason}\n${notes}` : `Reason: ${reason}`;
    }

    await doSubmit(type, { countryId, regionId, lockLevel, notes, status: showStatus });
  }

  // Quick submit from the floating action buttons, using the currently selected
  // entity's inferred country/region and lock level (no need to open the panel).
  // Each type only accepts certain entity kinds — see TYPE_ENTITY_KINDS.
  async function quickSubmit(type) {
    const entity = getSelectedEntity();
    if (!entity || !entity.items.length) { showFabStatus('Select a segment, map note, or place first.', 'error'); return; }
    if (!TYPE_ENTITY_KINDS[type].includes(entity.kind)) {
      showFabStatus(`${describeType(type)} requests require a selected ${TYPE_ENTITY_KINDS[type].map(describeKind).join(' or ')}.`, 'error');
      return;
    }

    const isSegment = entity.kind === 'segment';
    const item = entity.items[0];
    // Only segments have a per-entity address lookup (DataModel.Segments.getAddress) —
    // venues/notes fall back to the view-based (top country/state) detection.
    const countryId = resolveCurrentCountryId(isSegment ? item : null);
    const regionId = resolveCurrentRegionId(isSegment ? item : null);
    const lockRankRaw = entity.kind === 'segment' || entity.kind === 'venue' ? pick(item, ['lockRank', 'lockLevel']) : null;
    const lockLevel = lockRankRaw != null ? lockRankRaw + 1 : null;

    if (!countryId) { showFabStatus('Could not detect the country — use the panel.', 'error'); return; }
    if (LOCK_GATED_TYPES.includes(type) && !lockLevel) { showFabStatus('Selected entity has no lock level.', 'error'); return; }

    let notes = null;
    if (REASON_MODAL_CONFIG[type]) {
      const cfg = REASON_MODAL_CONFIG[type];
      const { confirmed, reason } = await openReasonModal(cfg.title, cfg.reasons, cfg.tooltips);
      if (!confirmed) return;
      notes = reason ? `Reason: ${reason}` : null;
    }

    await doSubmit(type, { countryId, regionId, lockLevel, notes, status: showFabStatus });
  }

  function describeType(type) {
    return { downlock: 'Downlock', imagery: 'Imagery', accept_pur: 'Accept PUR', decline_pur: 'Decline PUR' }[type] || type;
  }

  function describeKind(kind) {
    return { segment: 'segment', mapComment: 'map note', venue: 'place' }[kind] || kind;
  }

  async function doSubmit(type, { countryId, regionId, lockLevel, notes, status }) {
    const entity = getSelectedEntity();
    if (!entity || !entity.items.length) { status('Please select a segment, map note, or place first.', 'error'); return; }
    if (!TYPE_ENTITY_KINDS[type].includes(entity.kind)) {
      status(`${describeType(type)} requests require a selected ${TYPE_ENTITY_KINDS[type].map(describeKind).join(' or ')}.`, 'error');
      return;
    }

    const permalink = buildPermalink(entity.items, entity.kind);
    const { userName, editorRank } = getCurrentUserInfo();

    if (LOCK_GATED_TYPES.includes(type) && lockLevel && editorRank != null && editorRank >= parseInt(lockLevel)) {
      status(`Your edit rank (${editorRank}) already covers this lock level (${lockLevel}) — no ${describeType(type).toLowerCase()} request needed.`, 'error');
      return;
    }

    const body = {
      country_id: parseInt(countryId),
      region_id: regionId ? parseInt(regionId) : null,
      type,
      permalink,
      notes: notes || null,
      submitted_by: userName || null,
      editor_rank: editorRank,
      ...(LOCK_GATED_TYPES.includes(type) && lockLevel ? { lock_level: parseInt(lockLevel) } : {}),
    };

    // Uploaded (if any) before creating the request, and its key attached to the create
    // body — not as a follow-up call — so it's already present when notifications fire.
    if (capturedScreenshotBlob) {
      status('Uploading screenshot…', 'info');
      try {
        const upload = await apiPostBlob('/screenshots', capturedScreenshotBlob);
        body.screenshot_key = upload.key;
      } catch (e) {
        log('Screenshot upload failed, continuing without it: ' + e.message);
      }
    }

    log(`doSubmit: request body = ${JSON.stringify(body)}`);

    status('Submitting…', 'info');
    disableButtons(true);

    try {
      const result = await apiPost('/requests', body);
      status(`Request #${result.id} submitted successfully.`, 'ok');
      capturedScreenshotBlob = null;
      updateScreenshotButton();
      clearForm();
    } catch (e) {
      status(`Error: ${e.message}`, 'error');
    } finally {
      disableButtons(false);
    }
  }

  // ── Countries / Regions ──────────────────────────────────────────────────────
  async function fetchCountries() {
    try {
      countries = await apiGet('/countries');
      const sel = byId('wmereq-country');
      if (!sel) return;
      sel.innerHTML = countries.length
        ? countries.map((c) => `<option value="${c.id}">${escHtml(c.name)} (${escHtml(c.code)})</option>`).join('')
        : '<option value="">No countries configured</option>';
      applyAutoCountry();
    } catch (e) {
      const sel = byId('wmereq-country');
      if (sel) sel.innerHTML = '<option value="">Error loading countries</option>';
      log('Failed to load countries: ' + e.message);
    }
  }

  // Tracks which country's regions are currently loaded, so re-detecting the same
  // country on every selection change (the common case) doesn't refire the API call.
  let regionsLoadedForCountryId = null;

  // Refetches the region list for the given country and repopulates the region select.
  // Called whenever the country changes, whether by auto-detect or manual selection.
  async function fetchRegions(countryId, seg) {
    const sel = byId('wmereq-region');
    if (!countryId) {
      regions = [];
      regionsLoadedForCountryId = null;
      if (sel) sel.innerHTML = '<option value="">Country-wide</option>';
      return;
    }
    if (countryId === regionsLoadedForCountryId) {
      applyAutoRegion(seg);
      return;
    }
    try {
      regions = await apiGet(`/countries/${countryId}/regions`);
      regionsLoadedForCountryId = countryId;
      if (sel) {
        sel.innerHTML =
          '<option value="">Country-wide</option>' +
          regions.map((r) => `<option value="${r.id}">${escHtml(r.name)} (${escHtml(r.code)})</option>`).join('');
      }
      applyAutoRegion(seg);
    } catch (e) {
      log('Failed to load regions: ' + e.message);
    }
  }

  // ── Settings section (always visible, below the request form) ──`───────────────`
  function saveSettings() {
    const val = (byId('wmereq-api-base') || {}).value?.trim().replace(/\/$/, '');
    if (val) {
      apiBase = val;
      GM_setValue('apiBase', val);
      regionsLoadedForCountryId = null; // a different backend may have different regions for the same id
      fetchCountries();
    }
    fabStyle = (byId('wmereq-fab-style') || {}).value;
    GM_setValue('fabStyle', fabStyle);
    applyFabStyle();

    for (const type of FAB_TYPES) {
      const checkbox = byId(`wmereq-fab-visible-${type.replace('_', '-')}`);
      if (checkbox) fabVisible[type] = checkbox.checked;
    }
    GM_setValue('wmereq-fab-visible', JSON.stringify(fabVisible));
    applyFabVisibility();

    showStatus('Settings saved.', 'ok');
  }

  // ── API helpers (GM_xmlhttpRequest) ───────────────────────────────────────────
  function apiGet(path) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${apiBase}/api${path}`,
        headers: { 'Content-Type': 'application/json' },
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            res.status >= 400 ? reject(new Error(data.error || 'API error')) : resolve(data);
          } catch (e) { reject(e); }
        },
        onerror: (e) => reject(new Error('Network error: ' + (e.error || ''))),
      });
    });
  }

  function apiPost(path, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${apiBase}/api${path}`,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(body),
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            res.status >= 400 ? reject(new Error(data.error || 'API error')) : resolve(data);
          } catch (e) { reject(e); }
        },
        onerror: (e) => reject(new Error('Network error: ' + (e.error || ''))),
      });
    });
  }

  // Uploads a captured screenshot Blob as the raw request body (not JSON) — GM_xmlhttpRequest
  // accepts a Blob directly for `data`, same as fetch's body would.
  function apiPostBlob(path, blob) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${apiBase}/api${path}`,
        headers: { 'Content-Type': blob.type || 'image/png' },
        data: blob,
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            res.status >= 400 ? reject(new Error(data.error || 'API error')) : resolve(data);
          } catch (e) { reject(e); }
        },
        onerror: (e) => reject(new Error('Network error: ' + (e.error || ''))),
      });
    });
  }

  // ── UI helpers ────────────────────────────────────────────────────────────────
  function byId(id) { return document.getElementById(id); }
  function on(id, event, fn) { const el = byId(id); if (el) el.addEventListener(event, fn); }

  function showStatus(msg, type) {
    const el = byId('wmereq-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `wmereq-status ${type}`;
    el.style.display = 'block';
  }

  function disableButtons(disabled) {
    [
      'wmereq-btn-submit-downlock', 'wmereq-btn-submit-imagery',
      'wmereq-btn-submit-accept-pur', 'wmereq-btn-submit-decline-pur',
      'wmereq-fab-downlock', 'wmereq-fab-imagery', 'wmereq-fab-accept-pur', 'wmereq-fab-decline-pur',
    ].forEach((id) => {
      const btn = byId(id);
      if (btn) btn.disabled = disabled;
    });
  }

  function showFabStatus(msg, type) {
    const el = byId('wmereq-fab-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `wmereq-fab-status ${type}`;
    el.style.display = 'block';
    clearTimeout(showFabStatus._timer);
    showFabStatus._timer = setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  function clearForm() {
    const notes = byId('wmereq-notes');
    if (notes) notes.value = '';
  }

  function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function log(msg) { console.log(`[${SCRIPT_NAME}] ${msg}`); }

  // Verbose diagnostics (SDK object dumps) run on every selection change, so they're
  // gated behind this flag instead of always paying the JSON.stringify/string-build
  // cost. Enable via `GM_setValue('wmereq-debug', true)` in the console when diagnosing
  // an SDK method-resolution issue.
  const DEBUG = GM_getValue('wmereq-debug', false);
  function debugLog(msg) { if (DEBUG) log(msg); }

  // Reads the running version from the userscript manager's metadata (GM_info) rather
  // than a separate hardcoded constant, so it can never drift from the @version header.
  function getScriptVersion() {
    try {
      return (typeof GM_info !== 'undefined' && GM_info.script?.version) || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  // ── Start ─────────────────────────────────────────────────────────────────────
  bootstrap();
})();
