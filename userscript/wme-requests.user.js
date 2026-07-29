// ==UserScript==
// @name         WME Requests
// @namespace    https://github.com/michaelrosstarr/wme-requests
// @version      1.0.0
// @description  Send downlock and imagery requests from Waze Map Editor, with notifications to Slack, Discord and Telegram.
// @author       michaelrosstarr
// @match        https://www.waze.com/editor*
// @match        https://www.waze.com/*/editor*
// @match        https://beta.waze.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @require      https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// ==/UserScript==

/* global W, WazeWrap */
(function () {
  'use strict';

  // ── Configuration ───────────────────────────────────────────────────────────
  // Set this to your deployed Cloudflare Pages URL (no trailing slash).
  // You can also change it in the script settings panel inside WME.
  const DEFAULT_API_BASE = 'https://YOUR-PROJECT.pages.dev';

  const SCRIPT_NAME = 'WME Requests';
  const PANEL_ID    = 'wme-requests-panel';

  // ── State ───────────────────────────────────────────────────────────────────
  let apiBase   = GM_getValue('apiBase', DEFAULT_API_BASE);
  let countries = [];

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  function bootstrap() {
    if (typeof W === 'undefined' || !W.map || !W.loginManager?.user) {
      setTimeout(bootstrap, 500);
      return;
    }
    // Wait for WazeWrap if available
    if (typeof WazeWrap !== 'undefined' && !WazeWrap.Ready) {
      setTimeout(bootstrap, 500);
      return;
    }
    init();
  }

  function init() {
    log('Initialising…');
    injectStyles();
    createPanel();
    W.selectionManager.events.register('selectionchanged', null, onSelectionChanged);
    log('Ready.');
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #${PANEL_ID} { font-family: 'Rubik', sans-serif; font-size: 13px; padding: 10px; }
      #${PANEL_ID} h3 { font-size: 14px; font-weight: 600; margin: 0 0 10px; color: #333; }
      #${PANEL_ID} .wmereq-section { background: #f7f7f7; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
      #${PANEL_ID} label { display: block; font-weight: 500; margin-bottom: 3px; color: #555; }
      #${PANEL_ID} select, #${PANEL_ID} input, #${PANEL_ID} textarea {
        width: 100%; padding: 5px 7px; border: 1px solid #ccc; border-radius: 4px;
        font-size: 12px; margin-bottom: 8px; box-sizing: border-box;
      }
      #${PANEL_ID} textarea { resize: vertical; min-height: 60px; }
      #${PANEL_ID} .wmereq-btn {
        display: inline-block; padding: 6px 12px; border: none; border-radius: 4px;
        cursor: pointer; font-size: 12px; font-weight: 600; margin-right: 5px;
        transition: opacity .15s;
      }
      #${PANEL_ID} .wmereq-btn:hover { opacity: .85; }
      #${PANEL_ID} .wmereq-btn-primary  { background: #1a73e8; color: #fff; }
      #${PANEL_ID} .wmereq-btn-downlock { background: #e53935; color: #fff; }
      #${PANEL_ID} .wmereq-btn-imagery  { background: #1e88e5; color: #fff; }
      #${PANEL_ID} .wmereq-btn-settings { background: #757575; color: #fff; float: right; }
      #${PANEL_ID} .wmereq-status { font-size: 11px; margin-top: 6px; padding: 5px 8px; border-radius: 4px; }
      #${PANEL_ID} .wmereq-status.ok     { background: #e8f5e9; color: #2e7d32; }
      #${PANEL_ID} .wmereq-status.error  { background: #ffebee; color: #c62828; }
      #${PANEL_ID} .wmereq-status.info   { background: #e3f2fd; color: #1565c0; }
      #${PANEL_ID} .wmereq-hint { font-size: 11px; color: #888; margin-top: -4px; margin-bottom: 8px; }
      #${PANEL_ID} .wmereq-lock-info { font-size: 12px; color: #555; margin-bottom: 8px; padding: 4px 8px; background:#fffde7; border-radius:4px; }
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
    `;
    document.head.appendChild(style);
  }

  // ── Panel creation ──────────────────────────────────────────────────────────
  function createPanel() {
    // Use WazeWrap tab system if available, otherwise insert into sidebar
    if (typeof WazeWrap !== 'undefined' && WazeWrap.Interface && WazeWrap.Interface.AddTab) {
      WazeWrap.Interface.AddTab(SCRIPT_NAME, buildPanelHTML(), 'WR', PANEL_ID);
    } else {
      // Fallback: inject into the edit-panel area
      const sidebar = document.querySelector('#edit-panel') || document.querySelector('.edit-area');
      if (sidebar) {
        const wrapper = document.createElement('div');
        wrapper.id = PANEL_ID;
        wrapper.innerHTML = buildPanelHTML();
        sidebar.prepend(wrapper);
      } else {
        log('Could not find sidebar — retrying…');
        setTimeout(createPanel, 1000);
        return;
      }
    }
    bindPanelEvents();
    fetchCountries();
  }

  function buildPanelHTML() {
    return `
      <div>
        <h3>🗺️ WME Requests <button class="wmereq-btn wmereq-btn-settings" id="wmereq-btn-settings">⚙</button></h3>

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
            <option value="downlock">🔒 Downlock</option>
            <option value="imagery">🖼️ Imagery</option>
          </select>

          <div id="wmereq-lock-row">
            <label>Lock Level <span id="wmereq-lock-hint" style="font-weight:400;color:#888"></span></label>
            <select id="wmereq-lock">
              <option value="">— select —</option>
              ${[1,2,3,4,5,6,7].map((n) => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </div>

          <label>Notes (optional)</label>
          <textarea id="wmereq-notes" placeholder="Any extra context…"></textarea>

          <button class="wmereq-btn wmereq-btn-downlock" id="wmereq-btn-submit-downlock">🔒 Submit Downlock</button>
          <button class="wmereq-btn wmereq-btn-imagery"  id="wmereq-btn-submit-imagery">🖼️ Submit Imagery</button>

          <div id="wmereq-status" class="wmereq-status info" style="display:none"></div>
        </div>
      </div>`;
  }

  function bindPanelEvents() {
    on('wmereq-type', 'change', syncLockRow);
    on('wmereq-btn-submit-downlock', 'click', () => submitRequest('downlock'));
    on('wmereq-btn-submit-imagery',  'click', () => submitRequest('imagery'));
    on('wmereq-btn-settings',        'click', openSettings);
  }

  // ── Segment selection ────────────────────────────────────────────────────────
  function onSelectionChanged() {
    const selected  = W.selectionManager.getSelectedFeatures();
    const segments  = selected.filter((f) => f.model?.type === 'segment');
    const infoDiv   = byId('wmereq-segment-info');
    const lockSel   = byId('wmereq-lock');

    if (!infoDiv) return;

    if (!segments.length) {
      infoDiv.innerHTML = '<div class="wmereq-hint">Select a segment on the map to get started.</div>';
      return;
    }

    if (segments.length > 1) {
      infoDiv.innerHTML = `<div class="wmereq-hint">⚠️ ${segments.length} segments selected. Only one permalink will be used.</div>`;
    }

    const seg       = segments[0].model;
    const attrs     = seg.attributes;
    const lockLevel = attrs.lockRank != null ? attrs.lockRank + 1 : null; // WME stores 0-based rank
    const roadType  = getRoadTypeName(attrs.roadType);
    const permalink = buildPermalink(seg);

    infoDiv.innerHTML = `
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

    syncLockRow();
  }

  function syncLockRow() {
    const typeVal = (byId('wmereq-type') || {}).value;
    const lockRow = byId('wmereq-lock-row');
    if (lockRow) lockRow.style.display = typeVal === 'imagery' ? 'none' : '';
  }

  // ── Permalink builder ─────────────────────────────────────────────────────────
  function buildPermalink(segment) {
    try {
      const ll      = W.map.getCenter();
      const zoom    = W.map.getZoom();
      const segId   = segment.attributes.id;
      return `https://www.waze.com/editor?env=row&lon=${ll.lon}&lat=${ll.lat}&zoom=${zoom}&segments=${segId}`;
    } catch (e) {
      return window.location.href;
    }
  }

  function getRoadTypeName(type) {
    const names = {
      1:'Street',2:'Primary Street',3:'Freeway',4:'Ramp',5:'Walking Trail',6:'Major Highway',
      7:'Minor Highway',8:'Dirt Road/4x4 Trail',10:'Pedestrian Boardwalk',16:'Stairway',
      17:'Private Road',18:'Railroad',19:'Runway/Taxiway',20:'Parking Lot Road',21:'Service Road',
    };
    return names[type] || `Road (${type})`;
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function submitRequest(type) {
    const countryId   = (byId('wmereq-country') || {}).value;
    const lockLevel   = (byId('wmereq-lock') || {}).value;
    const notes       = (byId('wmereq-notes') || {}).value.trim();
    const selectedSegs = W.selectionManager.getSelectedFeatures().filter((f) => f.model?.type === 'segment');

    if (!countryId) { showStatus('Please select a country.', 'error'); return; }
    if (!selectedSegs.length) { showStatus('Please select a segment first.', 'error'); return; }
    if (type === 'downlock' && !lockLevel) { showStatus('Please select a lock level.', 'error'); return; }

    const seg       = selectedSegs[0].model;
    const permalink = buildPermalink(seg);
    const user      = W.loginManager.user?.userName || '';

    const body = {
      country_id:   parseInt(countryId),
      type,
      permalink,
      notes:        notes || null,
      submitted_by: user || null,
      ...(type === 'downlock' && lockLevel ? { lock_level: parseInt(lockLevel) } : {}),
    };

    showStatus('Submitting…', 'info');
    disableButtons(true);

    try {
      const result = await apiPost('/requests', body);
      showStatus(`✅ Request #${result.id} submitted successfully!`, 'ok');
      clearForm();
    } catch (e) {
      showStatus(`❌ Error: ${e.message}`, 'error');
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
        <h4>⚙️ WME Requests Settings</h4>
        <div class="form-row">
          <label>API Base URL</label>
          <input id="wmereq-api-base" type="url" value="${escHtml(apiBase)}" placeholder="https://your-project.pages.dev" />
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="wmereq-btn wmereq-btn-primary" id="wmereq-settings-save">Save</button>
          <button class="wmereq-btn" id="wmereq-settings-cancel" style="background:#e0e0e0;color:#333">Cancel</button>
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
    ['wmereq-btn-submit-downlock', 'wmereq-btn-submit-imagery'].forEach((id) => {
      const btn = byId(id);
      if (btn) btn.disabled = disabled;
    });
  }

  function clearForm() {
    const notes = byId('wmereq-notes');
    if (notes) notes.value = '';
  }

  function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function log(msg) { console.log(`[${SCRIPT_NAME}] ${msg}`); }

  // ── Start ─────────────────────────────────────────────────────────────────────
  bootstrap();
})();
