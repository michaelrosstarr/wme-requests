/* global app.js — WME Requests Dashboard */
'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
// In production the dashboard is served from the same origin as the API.
// Override API_BASE only if you serve the dashboard from a different origin.
const API_BASE = window.location.origin;

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short', timeStyle: 'short',
  });
}

function typeBadge(type) {
  const label = type === 'downlock' ? '🔒 Downlock' : '🖼️ Imagery';
  return `<span class="badge-type badge-${type}">${label}</span>`;
}

function statusBadge(status) {
  const labels = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', rejected: 'Rejected' };
  return `<span class="badge-status badge-${status}">${labels[status] ?? status}</span>`;
}

function platformLabel(p) {
  return { slack: '💬 Slack', discord: '🎮 Discord', telegram: '✈️ Telegram' }[p] ?? p;
}

function eventTypeLabel(e) {
  return { global: '🌐 Global', downlock: '🔒 Downlock', imagery: '🖼️ Imagery' }[e] ?? e;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const overlay = $('#modal-overlay');
const modalContent = $('#modal-content');

function openModal(html) {
  modalContent.innerHTML = html;
  overlay.classList.remove('hidden');
}

function closeModal() {
  overlay.classList.add('hidden');
  modalContent.innerHTML = '';
}

$('#modal-close').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

// ── Navigation ─────────────────────────────────────────────────────────────────
$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    $$('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    $$('main[id^="view-"]').forEach((m) => m.classList.add('hidden'));
    $(`#view-${view}`).classList.remove('hidden');
    if (view === 'admin') loadAdmin();
  });
});

// ── State ─────────────────────────────────────────────────────────────────────
let currentPage = 0;
const PAGE_SIZE = 50;
let countries = [];
let totalRequests = 0;

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function loadCountryFilter() {
  try {
    countries = await apiFetch('/countries');
    const sel = $('#filter-country');
    countries.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.code})`;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn('Could not load countries', e);
  }
}

async function loadStats() {
  try {
    const [all, pending, inProgress, completed] = await Promise.all([
      apiFetch('/requests?limit=1'),
      apiFetch('/requests?status=pending&limit=1'),
      apiFetch('/requests?status=in_progress&limit=1'),
      apiFetch('/requests?status=completed&limit=1'),
    ]);
    $('#stat-total').textContent     = all.total;
    $('#stat-pending').textContent   = pending.total;
    $('#stat-progress').textContent  = inProgress.total;
    $('#stat-completed').textContent = completed.total;
  } catch (e) {
    console.warn('Could not load stats', e);
  }
}

async function loadRequests(page = 0) {
  const tbody = $('#requests-body');
  tbody.innerHTML = `<tr><td colspan="10" class="loading">Loading…</td></tr>`;

  const countryId = $('#filter-country').value;
  const type      = $('#filter-type').value;
  const status    = $('#filter-status').value;

  const params = new URLSearchParams({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(countryId && { country_id: countryId }),
    ...(type      && { type }),
    ...(status    && { status }),
  });

  try {
    const data = await apiFetch(`/requests?${params}`);
    totalRequests = data.total;
    $('#request-count').textContent = `${data.total} result${data.total !== 1 ? 's' : ''}`;

    if (!data.data.length) {
      tbody.innerHTML = `<tr><td colspan="10" class="loading">No requests found.</td></tr>`;
      renderPagination(0, page);
      return;
    }

    tbody.innerHTML = data.data.map((r) => `
      <tr data-id="${r.id}">
        <td>${r.id}</td>
        <td>${escHtml(r.country_name)}<br><small class="muted">${escHtml(r.country_code)}</small></td>
        <td>${typeBadge(r.type)}</td>
        <td>${r.lock_level ?? '—'}</td>
        <td class="permalink-cell"><a href="${escHtml(r.permalink)}" target="_blank" rel="noopener" title="${escHtml(r.permalink)}">Open ↗</a></td>
        <td>${escHtml(r.submitted_by || '—')}</td>
        <td>${escHtml(r.notes || '—')}</td>
        <td>
          <select class="status-select" data-id="${r.id}" aria-label="Status">
            ${['pending','in_progress','completed','rejected'].map((s) =>
              `<option value="${s}"${r.status === s ? ' selected' : ''}>${s.replace('_',' ')}</option>`
            ).join('')}
          </select>
        </td>
        <td><small>${fmtDate(r.created_at)}</small></td>
        <td>
          <button class="btn btn-danger btn-sm btn-delete-request" data-id="${r.id}" title="Delete">🗑</button>
        </td>
      </tr>
    `).join('');

    renderPagination(data.total, page);
    loadStats();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="10" class="loading" style="color:var(--red)">Error: ${escHtml(e.message)}</td></tr>`;
  }
}

function renderPagination(total, page) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const container = $('#pagination');
  container.innerHTML = '';
  for (let i = 0; i < pages; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn${i === page ? ' active' : ''}`;
    btn.textContent = i + 1;
    btn.addEventListener('click', () => { currentPage = i; loadRequests(i); });
    container.appendChild(btn);
  }
}

// Status change
document.addEventListener('change', async (e) => {
  const sel = e.target.closest('.status-select');
  if (!sel) return;
  try {
    await apiFetch(`/requests/${sel.dataset.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: sel.value }),
    });
    loadStats();
  } catch (err) {
    alert('Failed to update status: ' + err.message);
  }
});

// Delete request
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete-request');
  if (!btn) return;
  if (!confirm('Delete this request?')) return;
  try {
    await apiFetch(`/requests/${btn.dataset.id}`, { method: 'DELETE' });
    loadRequests(currentPage);
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
});

$('#btn-apply-filters').addEventListener('click', () => { currentPage = 0; loadRequests(0); });

// ── Admin ─────────────────────────────────────────────────────────────────────

async function loadAdmin() {
  await loadAdminCountries();
  populateChannelCountrySelect();
  const sel = $('#channel-country-select');
  if (sel.value) loadChannels(sel.value);
}

async function loadAdminCountries() {
  const list = $('#country-list');
  list.innerHTML = '<li class="loading-li">Loading…</li>';
  try {
    countries = await apiFetch('/countries');
    if (!countries.length) {
      list.innerHTML = '<li class="loading-li">No countries yet.</li>';
      return;
    }
    list.innerHTML = countries.map((c) => `
      <li>
        <div class="item-info">
          <span class="item-label">${escHtml(c.name)}</span>
          <span class="item-meta">${escHtml(c.code)}</span>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm btn-primary btn-edit-country" data-id="${c.id}" data-name="${escAttr(c.name)}" data-code="${escAttr(c.code)}">Edit</button>
          <button class="btn btn-sm btn-danger btn-delete-country" data-id="${c.id}">Delete</button>
        </div>
      </li>
    `).join('');
  } catch (e) {
    list.innerHTML = `<li class="loading-li" style="color:var(--red)">${escHtml(e.message)}</li>`;
  }
}

function populateChannelCountrySelect() {
  const sel = $('#channel-country-select');
  const current = sel.value;
  sel.innerHTML = '<option value="">Select a country…</option>';
  countries.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.code})`;
    if (String(c.id) === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function loadChannels(countryId) {
  const list = $('#channel-list');
  list.innerHTML = '<li class="loading-li">Loading…</li>';
  try {
    const channels = await apiFetch(`/countries/${countryId}/channels`);
    if (!channels.length) {
      list.innerHTML = '<li class="loading-li">No channels configured for this country.</li>';
      return;
    }
    list.innerHTML = channels.map((ch) => `
      <li>
        <div class="item-info">
          <span class="item-label">${escHtml(ch.label)}</span>
          <span class="item-meta">
            <span class="ch-badge">${platformLabel(ch.platform)}</span>
            <span class="ch-badge">${eventTypeLabel(ch.event_type)}</span>
          </span>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm btn-primary btn-edit-channel"
            data-id="${ch.id}"
            data-country="${countryId}"
            data-label="${escAttr(ch.label)}"
            data-platform="${ch.platform}"
            data-event_type="${ch.event_type}"
            data-webhook_url="${escAttr(ch.webhook_url || '')}"
            data-bot_token="${escAttr(ch.bot_token || '')}"
            data-chat_id="${escAttr(ch.chat_id || '')}">Edit</button>
          <button class="btn btn-sm btn-danger btn-delete-channel" data-id="${ch.id}" data-country="${countryId}">Delete</button>
        </div>
      </li>
    `).join('');
  } catch (e) {
    list.innerHTML = `<li class="loading-li" style="color:var(--red)">${escHtml(e.message)}</li>`;
  }
}

$('#channel-country-select').addEventListener('change', (e) => {
  if (e.target.value) loadChannels(e.target.value);
  else $('#channel-list').innerHTML = '<li class="loading-li">Select a country to see channels</li>';
});

// ── Country modals ────────────────────────────────────────────────────────────

function countryForm(title, name = '', code = '') {
  return `
    <h2>${title}</h2>
    <div class="form-group"><label>Country Name<input id="f-country-name" type="text" value="${escAttr(name)}" placeholder="e.g. Australia" /></label></div>
    <div class="form-group"><label>Country Code<input id="f-country-code" type="text" value="${escAttr(code)}" placeholder="e.g. AU" maxlength="10" /></label></div>
    <div class="error-msg" id="f-country-err"></div>
    <div class="form-actions">
      <button class="btn" id="f-country-cancel">Cancel</button>
      <button class="btn btn-primary" id="f-country-save">Save</button>
    </div>`;
}

$('#btn-add-country').addEventListener('click', () => {
  openModal(countryForm('Add Country'));
  $('#f-country-cancel').addEventListener('click', closeModal);
  $('#f-country-save').addEventListener('click', async () => {
    const name = $('#f-country-name').value.trim();
    const code = $('#f-country-code').value.trim();
    try {
      await apiFetch('/countries', { method: 'POST', body: JSON.stringify({ name, code }) });
      closeModal();
      await loadAdminCountries();
      populateChannelCountrySelect();
      await loadCountryFilter();
    } catch (e) {
      showFormErr('#f-country-err', e.message);
    }
  });
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-edit-country');
  if (!btn) return;
  const { id, name, code } = btn.dataset;
  openModal(countryForm('Edit Country', name, code));
  $('#f-country-cancel').addEventListener('click', closeModal);
  $('#f-country-save').addEventListener('click', async () => {
    try {
      await apiFetch(`/countries/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: $('#f-country-name').value.trim(), code: $('#f-country-code').value.trim() }),
      });
      closeModal();
      await loadAdminCountries();
      populateChannelCountrySelect();
      await loadCountryFilter();
    } catch (e) {
      showFormErr('#f-country-err', e.message);
    }
  });
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete-country');
  if (!btn) return;
  if (!confirm('Delete this country and all its channels and requests?')) return;
  try {
    await apiFetch(`/countries/${btn.dataset.id}`, { method: 'DELETE' });
    await loadAdminCountries();
    populateChannelCountrySelect();
    await loadCountryFilter();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
});

// ── Channel modals ────────────────────────────────────────────────────────────

function channelForm(title, d = {}) {
  return `
    <h2>${title}</h2>
    <div class="form-group"><label>Label<input id="f-ch-label" type="text" value="${escAttr(d.label || '')}" placeholder="e.g. #wme-au-downlocks" /></label></div>
    <div class="form-group"><label>Country
      <select id="f-ch-country">
        ${countries.map((c) => `<option value="${c.id}"${String(c.id) === String(d.country) ? ' selected' : ''}>${escHtml(c.name)} (${escHtml(c.code)})</option>`).join('')}
      </select></label>
    </div>
    <div class="form-group"><label>Platform
      <select id="f-ch-platform">
        <option value="slack"${d.platform === 'slack' ? ' selected' : ''}>💬 Slack</option>
        <option value="discord"${d.platform === 'discord' ? ' selected' : ''}>🎮 Discord</option>
        <option value="telegram"${d.platform === 'telegram' ? ' selected' : ''}>✈️ Telegram</option>
      </select></label>
    </div>
    <div class="form-group"><label>Event Type
      <select id="f-ch-event">
        <option value="global"${d.event_type === 'global' ? ' selected' : ''}>🌐 Global (all requests)</option>
        <option value="downlock"${d.event_type === 'downlock' ? ' selected' : ''}>🔒 Downlock only</option>
        <option value="imagery"${d.event_type === 'imagery' ? ' selected' : ''}>🖼️ Imagery only</option>
      </select></label>
    </div>
    <div id="f-ch-webhook-row" class="form-group"><label>Webhook URL<input id="f-ch-webhook" type="url" value="${escAttr(d.webhook_url || '')}" placeholder="https://hooks.slack.com/…" /></label></div>
    <div id="f-ch-tg-rows" class="hidden">
      <div class="form-group"><label>Bot Token<input id="f-ch-bot-token" type="text" value="${escAttr(d.bot_token || '')}" placeholder="123456:ABC-…" /></label></div>
      <div class="form-group"><label>Chat ID<input id="f-ch-chat-id" type="text" value="${escAttr(d.chat_id || '')}" placeholder="-100123456789" /></label></div>
    </div>
    <div class="error-msg" id="f-ch-err"></div>
    <div class="form-actions">
      <button class="btn" id="f-ch-cancel">Cancel</button>
      <button class="btn btn-primary" id="f-ch-save">Save</button>
    </div>`;
}

function wireChannelFormVisibility() {
  const platformSel = $('#f-ch-platform');
  function update() {
    const isTg = platformSel.value === 'telegram';
    $('#f-ch-webhook-row').classList.toggle('hidden', isTg);
    $('#f-ch-tg-rows').classList.toggle('hidden', !isTg);
  }
  platformSel.addEventListener('change', update);
  update();
}

$('#btn-add-channel').addEventListener('click', () => {
  if (!countries.length) { alert('Add a country first.'); return; }
  const countryId = $('#channel-country-select').value || countries[0].id;
  openModal(channelForm('Add Notification Channel', { country: countryId }));
  wireChannelFormVisibility();
  $('#f-ch-cancel').addEventListener('click', closeModal);
  $('#f-ch-save').addEventListener('click', async () => {
    const body = gatherChannelForm();
    const cId  = $('#f-ch-country').value;
    try {
      await apiFetch(`/countries/${cId}/channels`, { method: 'POST', body: JSON.stringify(body) });
      closeModal();
      loadChannels(cId);
    } catch (e) {
      showFormErr('#f-ch-err', e.message);
    }
  });
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-edit-channel');
  if (!btn) return;
  openModal(channelForm('Edit Notification Channel', btn.dataset));
  wireChannelFormVisibility();
  $('#f-ch-cancel').addEventListener('click', closeModal);
  $('#f-ch-save').addEventListener('click', async () => {
    const body = gatherChannelForm();
    const cId  = btn.dataset.country;
    try {
      await apiFetch(`/channels/${btn.dataset.id}`, { method: 'PUT', body: JSON.stringify(body) });
      closeModal();
      loadChannels(cId);
    } catch (e) {
      showFormErr('#f-ch-err', e.message);
    }
  });
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete-channel');
  if (!btn) return;
  if (!confirm('Delete this channel?')) return;
  try {
    await apiFetch(`/channels/${btn.dataset.id}`, { method: 'DELETE' });
    loadChannels(btn.dataset.country);
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
});

function gatherChannelForm() {
  const platform = $('#f-ch-platform').value;
  return {
    label:       $('#f-ch-label').value.trim(),
    platform,
    event_type:  $('#f-ch-event').value,
    webhook_url: platform !== 'telegram' ? $('#f-ch-webhook').value.trim() || null : null,
    bot_token:   platform === 'telegram' ? $('#f-ch-bot-token').value.trim() || null : null,
    chat_id:     platform === 'telegram' ? $('#f-ch-chat-id').value.trim() || null : null,
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(s) { return escHtml(s); }

function showFormErr(sel, msg) {
  const el = $(sel);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Boot ──────────────────────────────────────────────────────────────────────

(async () => {
  await loadCountryFilter();
  loadStats();
  loadRequests(0);
})();
