// ==UserScript==
// @name         WME Requests
// @namespace    https://github.com/michaelrosstarr/wme-requests
// @version      2.1.0
// @description  Send downlock and imagery requests from Waze Map Editor, with notifications to Slack, Discord and Telegram.
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
  let countries = [];

  // WME SDK handle + resolved methods (some method names aren't confirmed by the
  // public docs, so we probe a few candidates and log what's actually available
  // if none match — see resolveSdkMethods()).
  let sdk = null;
  let getSelectionFn = null;
  let getSegmentByIdFn = null;
  let getTopCountryFn = null;

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
    sdk.Events.on({ eventName: 'wme-selection-changed', eventHandler: onSelectionChanged });
    log('Ready.');
  }

  // Finds the current SDK method name for things the docs describe but don't give
  // an exact signature for. Logs available method names when nothing matches, so
  // a mismatch is diagnosable from the console instead of failing silently.
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
    getTopCountryFn = sdkMethodOf(sdk.DataModel?.Countries, ['getTopCountry'], 'DataModel.Countries.getTopCountry');
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
        display: inline-block; padding: 7px 16px; border: none; border-radius: 6px;
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
      .wmereq-btn-settings { background: #757575; color: #fff; flex-shrink: 0; }
      .wmereq-btn-settings:hover { background: #616161; }
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
      #wmereq-settings-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 9999;
        display: flex; align-items: center; justify-content: center;
      }
      #wmereq-settings-overlay .wmereq-dialog {
        background: #fff; border-radius: 8px; padding: 20px; width: 340px;
        box-shadow: 0 4px 24px rgba(0,0,0,.3);
      }
      #wmereq-settings-overlay h4 { margin: 0 0 12px; font-size: 14px; }
      #wmereq-settings-overlay .form-row { margin-bottom: 10px; }
      #wmereq-settings-overlay label { font-size: 12px; font-weight: 500; display: block; margin-bottom: 3px; }
      #wmereq-settings-overlay input { width: 100%; padding: 5px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; box-sizing: border-box; }
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
        border: none; border-radius: 20px; padding: 10px 18px; font-size: 13px; font-weight: 600;
        cursor: pointer; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3); transition: opacity .15s;
        text-align: center; width: 140px;
      }
      #wmereq-floating-actions .wmereq-fab:hover { opacity: .85; }
      #wmereq-floating-actions .wmereq-fab:disabled { opacity: .5; cursor: default; }
      #wmereq-floating-actions .wmereq-fab-downlock { background: #e53935; }
      #wmereq-floating-actions .wmereq-fab-imagery  { background: #0a8cff; }
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

    // These selectors matched WME's old Bootstrap-based sidebar markup. The
    // current WME UI is a different (React) build and likely won't match them,
    // in which case we fall back to the floating panel below — which doesn't
    // depend on WME's internal DOM structure at all.
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

  // Adds a tab alongside WME's own sidebar tabs (Layers, My Waze, etc.),
  // using the same Bootstrap nav-tabs/tab-pane markup WME's own UI relies on.
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

  // Fallback used if WME's sidebar tab markup can't be found.
  function injectAsFloatingPanel() {
    const wrapper = document.createElement('div');
    wrapper.id = PANEL_ID;
    wrapper.className = 'wmereq-floating';
    wrapper.innerHTML = `<button class="wmereq-btn wmereq-btn-close" id="wmereq-btn-close" title="Hide">×</button>` + buildPanelHTML();
    document.body.appendChild(wrapper);
    on('wmereq-btn-close', 'click', () => { wrapper.style.display = 'none'; });
  }

  // Always-visible quick-action buttons for submitting a request without opening the panel.
  function createFloatingActions() {
    if (byId('wmereq-floating-actions')) return;
    const wrap = document.createElement('div');
    wrap.id = 'wmereq-floating-actions';
    wrap.innerHTML = `
      <div class="wmereq-fab-handle" title="Drag to move">⠿ ⠿ ⠿</div>
      <div id="wmereq-fab-status" class="wmereq-fab-status" style="display:none"></div>
      <button class="wmereq-fab wmereq-fab-downlock" id="wmereq-fab-downlock" title="Submit a downlock request for the selected segment">Downlock</button>
      <button class="wmereq-fab wmereq-fab-imagery" id="wmereq-fab-imagery" title="Submit an imagery request for the selected segment">Imagery</button>
    `;
    document.body.appendChild(wrap);
    on('wmereq-fab-downlock', 'click', () => quickSubmit('downlock'));
    on('wmereq-fab-imagery', 'click', () => quickSubmit('imagery'));
    makeDraggable(wrap, wrap.querySelector('.wmereq-fab-handle'), 'wmereq-fab-pos');
  }

  // Restores a persisted { top, left } position (if any) and lets the user drag the
  // element via `handle`, saving the new position via GM_setValue so it survives reloads.
  // Defaults to wherever the element's own CSS places it (top-right of the viewport)
  // until the user drags it for the first time.
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
        <h3>WME Requests <button class="wmereq-btn wmereq-btn-settings" id="wmereq-btn-settings">Settings</button></h3>

        <div class="wmereq-section" id="wmereq-segment-info">
          <div class="wmereq-hint">Select a segment on the map to get started.</div>
        </div>

        <div class="wmereq-section">
          <label>Country</label>
          <select id="wmereq-country">
            <option value="">Loading…</option>
          </select>

          <label>Request Type</label>
          <select id="wmereq-type">
            <option value="downlock">Downlock</option>
            <option value="imagery">Imagery</option>
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

          <div id="wmereq-status" class="wmereq-status info" style="display:none"></div>
        </div>

        <div class="wmereq-version">${SCRIPT_NAME} v${escHtml(getScriptVersion())}</div>
      </div>`;
  }

  function bindPanelEvents() {
    on('wmereq-type', 'change', syncLockRow);
    on('wmereq-btn-submit-downlock', 'click', () => submitRequest('downlock'));
    on('wmereq-btn-submit-imagery', 'click', () => submitRequest('imagery'));
    on('wmereq-btn-settings', 'click', openSettings);
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

  // Triggers the browser's native "Choose what to share" picker (unavoidable —
  // there's no way to capture the screen without it), restricts the resulting
  // stream to the map viewport element, grabs a single frame, and stops the
  // stream immediately so the browser's "sharing" indicator goes away right away.
  async function captureViewportScreenshot() {
    const viewportEl = sdk.Map.getMapViewportElement();
    if (!viewportEl) throw new Error('Could not find the map viewport element.');

    const stream = await navigator.mediaDevices.getDisplayMedia({ preferCurrentTab: true });
    const [track] = stream.getVideoTracks();
    try {
      const restrictionTarget = await RestrictionTarget.fromElement(viewportEl);
      await track.restrictTo(restrictionTarget);

      // Give the restricted track a moment to start delivering viewport-cropped
      // frames before grabbing one — the first frame or two can still be uncropped.
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
  // Normalizes whatever shape the SDK's selection getter returns into a plain
  // array of segment ids. Handles a couple of plausible shapes defensively
  // since the exact return type isn't nailed down in the public docs.
  function normalizeSelectionIds(raw) {
    if (!raw) return [];
    if (Array.isArray(raw.ids)) {
      if (raw.objectType && raw.objectType !== 'segment') return [];
      return raw.ids;
    }
    if (Array.isArray(raw.segmentIds)) return raw.segmentIds;
    if (Array.isArray(raw)) {
      return raw
        .filter((f) => (f.objectType || f.type) === 'segment' || f.segmentId != null)
        .map((f) => f.id ?? f.segmentId);
    }
    return [];
  }

  function getSelectedSegments() {
    if (!getSelectionFn || !getSegmentByIdFn) return [];
    try {
      const ids = normalizeSelectionIds(getSelectionFn());
      return ids.map((segmentId) => getSegmentByIdFn({ segmentId })).filter(Boolean);
    } catch (e) {
      log('getSelectedSegments failed: ' + e.message);
      return [];
    }
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

  // ── Segment selection ────────────────────────────────────────────────────────
  function onSelectionChanged() {
    const segments = getSelectedSegments();
    const infoDiv = byId('wmereq-segment-info');
    const lockSel = byId('wmereq-lock');

    if (!infoDiv) return;

    if (!segments.length) {
      infoDiv.innerHTML = '<div class="wmereq-hint">Select a segment on the map to get started.</div>';
      return;
    }

    const multiHint = segments.length > 1
      ? `<div class="wmereq-hint">${segments.length} segments selected — permalink will include all of them.</div>`
      : '';

    const seg = segments[0];
    const lockRankRaw = pick(seg, ['lockRank', 'lockLevel']);
    const lockLevel = lockRankRaw != null ? lockRankRaw + 1 : null; // WME stores 0-based rank
    const roadType = getRoadTypeName(pick(seg, ['roadType']));
    const permalink = buildPermalink(segments);

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

    applyAutoCountry();
    syncLockRow();
  }

  // Matches the country the Wazer is currently viewing/editing (WME's "top country"
  // for the current map view) to a configured country in our list, by ISO code or name.
  function resolveCurrentCountryId() {
    if (!countries.length) { log('resolveCurrentCountryId: no countries loaded from the API yet.'); return null; }
    if (!getTopCountryFn) { log('resolveCurrentCountryId: no DataModel.Countries.getTopCountry method resolved.'); return null; }
    try {
      const topCountry = getTopCountryFn();
      if (!topCountry) {
        log('resolveCurrentCountryId: getTopCountry() returned nothing.');
        return null;
      }
      log(`resolveCurrentCountryId: top country object = ${JSON.stringify(topCountry)}`);
      const name = String(pick(topCountry, ['name']) || '').toLowerCase();
      const abbr = String(pick(topCountry, ['abbr', 'code', 'isoCode']) || '').toLowerCase();
      const match = countries.find((c) =>
        (abbr && String(c.code || '').toLowerCase() === abbr) || String(c.name || '').toLowerCase() === name
      );
      if (!match) {
        log(`resolveCurrentCountryId: no configured country matched name="${name}" abbr="${abbr}". Configured: ${countries.map((c) => `${c.name}/${c.code}`).join(', ')}`);
      }
      return match ? match.id : null;
    } catch (e) {
      log('resolveCurrentCountryId: getTopCountry threw: ' + e.message);
      return null;
    }
  }

  function applyAutoCountry() {
    const countrySel = byId('wmereq-country');
    if (!countrySel) return;
    const resolved = resolveCurrentCountryId();
    if (resolved) countrySel.value = String(resolved);
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
      log('findUserInfo: sdk.State module is missing entirely.');
      return null;
    }
    log(`findUserInfo: sdk.State = ${describeObject(sdk.State)}`);

    if (sdk.State.userInfo) {
      log(`findUserInfo: sdk.State.userInfo (property) = ${JSON.stringify(sdk.State.userInfo)}`);
      return sdk.State.userInfo;
    }
    if (typeof sdk.State.getUserInfo === 'function') {
      const result = sdk.State.getUserInfo();
      log(`findUserInfo: sdk.State.getUserInfo() = ${JSON.stringify(result)}`);
      if (result) return result;
    }
    if (typeof sdk.State.get === 'function') {
      const result = sdk.State.get('userInfo');
      log(`findUserInfo: sdk.State.get('userInfo') = ${JSON.stringify(result)}`);
      if (result) return result;
    }
    if (sdk.User) {
      log(`findUserInfo: sdk.User = ${describeObject(sdk.User)}`);
      if (sdk.User.userInfo) return sdk.User.userInfo;
      if (typeof sdk.User.getUserInfo === 'function') return sdk.User.getUserInfo();
    }
    log(`findUserInfo: no user info found. Top-level sdk keys = ${Object.keys(sdk || {}).join(', ')}`);
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
    if (lockRow) lockRow.style.display = typeVal === 'imagery' ? 'none' : '';
  }

  // ── Permalink builder ─────────────────────────────────────────────────────────
  // Accepts one or more segments; Waze permalinks support a comma-separated
  // segments list, so a multi-selection produces a single link covering all of them.
  // Builds off the current page's own origin+path (not a hardcoded domain) so it
  // always matches whatever host/locale variant (e.g. waze.com/en-US/editor vs
  // www.waze.com/editor) is actually active — a mismatch there triggers a redirect
  // that drops the query string. zoomLevel (not zoom) is the param name WME expects.
  function buildPermalink(segments) {
    try {
      const center = sdk.Map.getMapCenter();
      const zoom = sdk.Map.getZoomLevel();
      const lon = pick(center, ['lon', 'lng', 'x']);
      const lat = pick(center, ['lat', 'y']);
      const segIds = segments.map((s) => pick(s, ['id', 'segmentId'])).filter((id) => id != null).join(',');
      const base = `${window.location.origin}${window.location.pathname}`;
      return `${base}?env=row&lat=${lat}&lon=${lon}&zoomLevel=${zoom}&segments=${segIds}`;
    } catch (e) {
      return window.location.href;
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

  // ── Downlock reason modal ─────────────────────────────────────────────────────
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

  // Shows quick-pick reason chips plus a free-text field. Resolves
  // { confirmed: false } if cancelled, or { confirmed: true, reason } otherwise
  // (reason is '' if nothing was picked/typed but the user chose to continue).
  function openDownlockReasonModal() {
    return new Promise((resolve) => {
      const selected = new Set();
      const dlg = document.createElement('div');
      dlg.id = 'wmereq-reason-overlay';
      dlg.innerHTML = `
        <div class="wmereq-dialog">
          <h4>Downlock Reason</h4>
          <div class="wmereq-hint">Select one or more quick reasons, or add your own below.</div>
          <div class="wmereq-reason-chips">
            ${DOWNLOCK_REASONS.map((r) => `<button type="button" class="wmereq-chip" data-reason="${escHtml(r)}" title="${escHtml(DOWNLOCK_REASON_TOOLTIPS[r] || r)}">${escHtml(r)}</button>`).join('')}
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
    const lockLevel = (byId('wmereq-lock') || {}).value;
    let notes = (byId('wmereq-notes') || {}).value.trim();

    if (!countryId) { showStatus('Please select a country.', 'error'); return; }
    if (type === 'downlock' && !lockLevel) { showStatus('Please select a lock level.', 'error'); return; }

    if (type === 'downlock') {
      const { confirmed, reason } = await openDownlockReasonModal();
      if (!confirmed) return;
      if (reason) notes = notes ? `Reason: ${reason}\n${notes}` : `Reason: ${reason}`;
    }

    await doSubmit(type, { countryId, lockLevel, notes, status: showStatus });
  }

  // Quick submit from the floating action buttons, using the currently selected
  // segment's inferred country and lock level (no need to open the panel).
  async function quickSubmit(type) {
    const selectedSegs = getSelectedSegments();
    if (!selectedSegs.length) { showFabStatus('Select a segment first.', 'error'); return; }

    const seg = selectedSegs[0];
    const countryId = resolveCurrentCountryId();
    const lockRankRaw = pick(seg, ['lockRank', 'lockLevel']);
    const lockLevel = lockRankRaw != null ? lockRankRaw + 1 : null;

    if (!countryId) { showFabStatus('Could not detect the country — use the panel.', 'error'); return; }
    if (type === 'downlock' && !lockLevel) { showFabStatus('Segment has no lock level.', 'error'); return; }

    let notes = null;
    if (type === 'downlock') {
      const { confirmed, reason } = await openDownlockReasonModal();
      if (!confirmed) return;
      notes = reason ? `Reason: ${reason}` : null;
    }

    await doSubmit(type, { countryId, lockLevel, notes, status: showFabStatus });
  }

  async function doSubmit(type, { countryId, lockLevel, notes, status }) {
    const selectedSegs = getSelectedSegments();
    if (!selectedSegs.length) { status('Please select a segment first.', 'error'); return; }

    const seg = selectedSegs[0];
    const permalink = buildPermalink(selectedSegs);
    const { userName, editorRank } = getCurrentUserInfo();

    if (type === 'downlock' && lockLevel && editorRank != null && editorRank >= parseInt(lockLevel)) {
      status(`Your edit rank (${editorRank}) already covers this segment's lock level (${lockLevel}) — no downlock request needed.`, 'error');
      return;
    }

    const body = {
      country_id: parseInt(countryId),
      type,
      permalink,
      notes: notes || null,
      submitted_by: userName || null,
      editor_rank: editorRank,
      ...(type === 'downlock' && lockLevel ? { lock_level: parseInt(lockLevel) } : {}),
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

  // ── Countries ─────────────────────────────────────────────────────────────────
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

  // ── Settings dialog ───────────────────────────────────────────────────────────
  function openSettings() {
    const dlg = document.createElement('div');
    dlg.id = 'wmereq-settings-overlay';
    dlg.innerHTML = `
      <div class="wmereq-dialog">
        <h4>WME Requests Settings</h4>
        <div class="form-row">
          <label>API Base URL</label>
          <input id="wmereq-api-base" type="url" value="${escHtml(apiBase)}" placeholder="https://your-project.your-subdomain.workers.dev" />
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="wmereq-btn wmereq-btn-primary" id="wmereq-settings-save">Save</button>
          <button class="wmereq-btn wmereq-btn-cancel" id="wmereq-settings-cancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);

    dlg.querySelector('#wmereq-settings-save').addEventListener('click', () => {
      const val = dlg.querySelector('#wmereq-api-base').value.trim().replace(/\/$/, '');
      if (val) {
        apiBase = val;
        GM_setValue('apiBase', val);
        fetchCountries();
      }
      document.body.removeChild(dlg);
    });
    dlg.querySelector('#wmereq-settings-cancel').addEventListener('click', () => {
      document.body.removeChild(dlg);
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) document.body.removeChild(dlg); });
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
    ['wmereq-btn-submit-downlock', 'wmereq-btn-submit-imagery', 'wmereq-fab-downlock', 'wmereq-fab-imagery'].forEach((id) => {
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
