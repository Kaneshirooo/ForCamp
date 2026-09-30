/* CampReg frontend — vanilla JS SPA */
const $ = s => document.querySelector(s);
const api = async (path, opts = {}) => {
  const token = localStorage.getItem('camp_token');
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};
const apiFile = async (file) => {
  const token = localStorage.getItem('camp_token');
  const fd = new FormData(); fd.append('photo', file);
  const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
};

let ME = null, CAMPERS = [], ROOMS = [], DESIGNATIONS = [], REPS = [], WINNERS = [], ELIGIBLE = [];
const can = (...r) => ME && r.includes(ME.role);

// ---------- theme ----------
$('#btnTheme').onclick = () => {
  const h = document.documentElement;
  h.dataset.theme = h.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('camp_theme', h.dataset.theme);
  if (!$('#page-roulette').classList.contains('hidden')) drawWheel();
};
document.documentElement.dataset.theme = localStorage.getItem('camp_theme') || 'light';

// ---------- nav ----------
function go(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  $('#page-' + page).classList.remove('hidden');
  document.querySelectorAll('#nav button, .bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('#pageTitle').textContent = page[0].toUpperCase() + page.slice(1);
  if (page === 'dashboard') loadDashboard();
  if (page === 'campers') loadCampers();
  if (page === 'rooms') loadRooms();
  if (page === 'designations') loadDesignations();
  if (page === 'reps') loadReps();
  if (page === 'roulette') loadRoulette();
  if (page === 'reports') loadReport();
  if (page === 'users') loadUsers();
}
document.querySelectorAll('#nav button, .bottomnav button').forEach(b => b.onclick = () => go(b.dataset.page));

// ---------- auth ----------
$('#btnLogin').onclick = async () => {
  $('#loginErr').textContent = '';
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: $('#liUser').value.trim(), password: $('#liPass').value }) });
    localStorage.setItem('camp_token', r.token);
    await boot();
  } catch (e) { $('#loginErr').textContent = e.message; }
};
$('#btnLogout').onclick = () => { localStorage.removeItem('camp_token'); location.reload(); };

async function boot() {
  try {
    ME = await api('/api/auth/me');
  } catch { localStorage.removeItem('camp_token'); return; }
  $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden');
  $('#roleBadge').textContent = ME.role + (ME.church ? ' · ' + ME.church : '');
  $('#meLine').textContent = ME.name + ' (@' + ME.username + ')';
  $('#navUsers').style.display = ME.role === 'admin' ? '' : 'none';
  if (ME.role === 'viewer') ['roulette', 'reports'].forEach(p => document.querySelectorAll(`[data-page="${p}"]`).forEach(b => b.style.display = 'none'));
  $('#btnAddCamper').style.display = can('admin', 'coordinator') ? '' : 'none';
  $('#btnAddRoom').style.display = can('admin', 'coordinator') ? '' : 'none';
  $('#btnAddDesig').style.display = can('admin', 'coordinator') ? '' : 'none';
  $('#btnSpin').disabled = !can('admin', 'coordinator');
  setInterval(() => $('#clock').textContent = new Date().toLocaleString(), 1000);
  go('dashboard');
}

// ---------- modal helper ----------
let saveFn = null;
function openModal(title, html, onSave) {
  $('#mTitle').textContent = title; $('#mBody').innerHTML = html;
  $('#modal').classList.remove('hidden'); saveFn = onSave;
}
$('#mCancel').onclick = () => $('#modal').classList.add('hidden');
$('#mSave').onclick = async () => { if (saveFn) await saveFn(); };
const field = (id, label, val = '', type = 'text') => `<label>${label}<input id="${id}" type="${type}" value="${String(val ?? '').replace(/"/g, '&quot;')}"></label>`;

// Room layout photo: pick from gallery instead of pasting a URL
const roomImageField = (existing = '') => `
  <label>Layout photo (choose from gallery)<input id="r_file" type="file" accept="image/*" onchange="previewRoomFile(this)"></label>
  <input id="r_im" type="hidden" value="${String(existing || '').replace(/"/g, '&quot;')}">
  <div id="r_prev">${existing ? `<img src="${existing}" style="width:100%;height:140px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">` : '<small class="muted">No photo attached</small>'}</div>`;
window.previewRoomFile = (inp) => {
  const f = inp.files && inp.files[0];
  if (f) $('#r_prev').innerHTML = `<img src="${URL.createObjectURL(f)}" style="width:100%;height:140px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">`;
};
async function resolveRoomImage() {
  const f = $('#r_file');
  if (f && f.files && f.files[0]) {
    $('#mSave').disabled = true; $('#mSave').textContent = 'Uploading…';
    try { $('#r_im').value = await apiFile(f.files[0]); }
    finally { $('#mSave').disabled = false; $('#mSave').textContent = 'Save'; }
  }
  return $('#r_im').value;
}

// ---------- dashboard ----------
async function loadDashboard() {
  const s = await api('/api/reports/summary');
  $('#statCards').innerHTML = [
    ['🧍', 'Campers', s.campers], ['🏠', 'Rooms', s.rooms], ['🛏️', 'Designations', s.designations],
    ['✅', 'Registered', s.clean_registered], ['🏆', 'Winners', s.winners], ['🤝', 'Reps', s.representatives]
  ].map(([ic, k, v]) => `<div class="card glass stat"><div class="stat-ic">${ic}</div><div><span class="muted">${k}</span><b>${v}</b></div></div>`).join('')
    + `<div class="card glass stat"><div class="stat-ic">⚥</div><div><span class="muted">By gender</span><b style="font-size:14px">Boy ${s.byGender.boy} · Girl ${s.byGender.girl}</b></div></div>`;
  const maxChurch = Math.max(1, ...Object.values(s.byChurch));
  const maxStatus = Math.max(1, ...Object.values(s.byStatus));
  $('#byChurch').innerHTML = Object.entries(s.byChurch).map(([k, v]) => `<div class="dash-bar"><div class="row" style="justify-content:space-between"><span>${k}</span><b>${v}</b></div><div class="progress"><i style="width:${Math.round(v / maxChurch * 100)}%"></i></div></div>`).join('') || '<span class="muted">No data</span>';
  $('#byStatus').innerHTML = Object.entries(s.byStatus).map(([k, v]) => `<div class="dash-bar"><div class="row" style="justify-content:space-between"><span class="badge b-${k}">${k}</span><b>${v}</b></div><div class="progress"><i style="width:${Math.round(v / maxStatus * 100)}%"></i></div></div>`).join('') || '<span class="muted">No designations yet</span>';
}

// ---------- campers ----------
async function loadCampers() {
  CAMPERS = await api('/api/campers');
  renderCampers();
}
function renderCampers() {
  const q = ($('#camperSearch').value || '').toLowerCase();
  const g = $('#camperGender').value;
  const list = CAMPERS.filter(c =>
    (!q || `${c.first_name} ${c.last_name} ${c.church}`.toLowerCase().includes(q)) && (!g || c.gender === g));
  $('#camperRows').innerHTML = list.map(c => `<tr>
    <td><b>${c.first_name} ${c.last_name}</b></td><td>${c.age}</td>
    <td><span class="badge b-${c.gender}">${c.gender}</span></td><td>${c.church || '—'}</td>
    <td>${c.contact || '—'}</td><td>${c.guardian || '—'}</td><td>${c.status}</td>
    <td>${can('admin', 'coordinator') ? `<button class="btn sm" onclick="editCamper('${c.id}')">Edit</button>
    <button class="btn sm danger" onclick="delCamper('${c.id}')">Del</button>` : '<span class="muted">view</span>'}</td></tr>`).join('')
    || `<tr><td colspan="8" class="muted">No campers found.</td></tr>`;
}
$('#camperSearch').oninput = renderCampers; $('#camperGender').onchange = renderCampers;
$('#btnAddCamper').onclick = () => openModal('Register camper', `
  <div class="row">${field('f_fn', 'First name')}${field('f_ln', 'Last name')}</div>
  <div class="row">${field('f_age', 'Age', '', 'number')}
  <label>Gender<select id="f_g"><option value="boy">boy</option><option value="girl">girl</option></select></label></div>
  <div class="row">${field('f_ch', 'Church', ME.church || '')}${field('f_ct', 'Contact')}</div>
  <div class="row">${field('f_gd', 'Guardian')}${field('f_md', 'Medical notes')}</div>`,
  async () => {
    await api('/api/campers', { method: 'POST', body: JSON.stringify({
      first_name: $('#f_fn').value, last_name: $('#f_ln').value, age: $('#f_age').value,
      gender: $('#f_g').value, church: $('#f_ch').value, contact: $('#f_ct').value,
      guardian: $('#f_gd').value, medical: $('#f_md').value }) });
    $('#modal').classList.add('hidden'); loadCampers();
  });
window.editCamper = (id) => {
  const c = CAMPERS.find(x => x.id === id);
  openModal('Edit camper', `
    <div class="row">${field('f_fn', 'First name', c.first_name)}${field('f_ln', 'Last name', c.last_name)}</div>
    <div class="row">${field('f_age', 'Age', c.age, 'number')}
    <label>Gender<select id="f_g"><option ${c.gender === 'boy' ? 'selected' : ''}>boy</option><option ${c.gender === 'girl' ? 'selected' : ''}>girl</option></select></label></div>
    <div class="row">${field('f_ch', 'Church', c.church)}${field('f_ct', 'Contact', c.contact)}</div>
    <div class="row">${field('f_gd', 'Guardian', c.guardian)}${field('f_md', 'Medical', c.medical)}</div>
    <label>Status<select id="f_st"><option ${c.status === 'registered' ? 'selected' : ''}>registered</option><option ${c.status === 'confirmed' ? 'selected' : ''}>confirmed</option><option ${c.status === 'cancelled' ? 'selected' : ''}>cancelled</option></select></label>`,
    async () => {
      await api('/api/campers/' + id, { method: 'PUT', body: JSON.stringify({
        first_name: $('#f_fn').value, last_name: $('#f_ln').value, age: $('#f_age').value,
        gender: $('#f_g').value, church: $('#f_ch').value, contact: $('#f_ct').value,
        guardian: $('#f_gd').value, medical: $('#f_md').value, status: $('#f_st').value }) });
      $('#modal').classList.add('hidden'); loadCampers();
    });
};
window.delCamper = async (id) => { if (confirm('Delete camper?')) { await api('/api/campers/' + id, { method: 'DELETE' }); loadCampers(); } };

// ---------- rooms ----------
async function loadRooms() {
  ROOMS = await api('/api/rooms');
  DESIGNATIONS = await api('/api/designations').catch(() => []);
  $('#roomGrid').innerHTML = ROOMS.map(r => {
    const occ = DESIGNATIONS.filter(d => d.room_id === r.id && d.status === 'approved').length;
    const pct = r.capacity ? Math.min(100, Math.round(occ / r.capacity * 100)) : 0;
    return `<div class="card glass room-card">
      ${r.layout_url ? `<img src="${r.layout_url}" loading="lazy">` : ''}
      <div class="row" style="justify-content:space-between"><b>${r.room_name}</b><span class="badge b-${r.gender}">${r.gender}</span></div>
      <small class="muted">${r.building || 'No building'} · ${occ}/${r.capacity} occupied</small>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <small class="muted">${r.description || ''}</small>
      ${can('admin', 'coordinator') ? `<div class="row"><button class="btn sm" onclick="editRoom('${r.id}')">Edit</button>
      <button class="btn sm danger" onclick="delRoom('${r.id}')">Delete</button></div>` : ''}
    </div>`;
  }).join('') || '<p class="muted">No rooms yet. Add layout / room.</p>';
}
$('#btnAddRoom').onclick = () => openModal('Add room / layout', `
  <div class="row">${field('r_bd', 'Building / Layout')}${field('r_nm', 'Room name/number')}</div>
  <div class="row">${field('r_cp', 'Capacity', '10', 'number')}
  <label>Gender assignment<select id="r_g"><option value="mixed">mixed</option><option value="boy">boy</option><option value="girl">girl</option></select></label></div>
  ${field('r_ds', 'Description')}${roomImageField('')}`,
  async () => {
    const layout_url = await resolveRoomImage();
    await api('/api/rooms', { method: 'POST', body: JSON.stringify({
      building: $('#r_bd').value, room_name: $('#r_nm').value, capacity: $('#r_cp').value,
      gender: $('#r_g').value, description: $('#r_ds').value, layout_url }) });
    $('#modal').classList.add('hidden'); loadRooms();
  });
window.editRoom = (id) => {
  const r = ROOMS.find(x => x.id === id);
  openModal('Edit room', `${field('r_bd', 'Building', r.building)}${field('r_nm', 'Room name', r.room_name)}
    <div class="row">${field('r_cp', 'Capacity', r.capacity, 'number')}
    <label>Gender<select id="r_g"><option value="mixed" ${r.gender === 'mixed' ? 'selected' : ''}>mixed</option><option value="boy" ${r.gender === 'boy' ? 'selected' : ''}>boy</option><option value="girl" ${r.gender === 'girl' ? 'selected' : ''}>girl</option></select></label></div>
    ${field('r_ds', 'Description', r.description)}${roomImageField(r.layout_url)}`,
    async () => {
      const layout_url = await resolveRoomImage();
      await api('/api/rooms/' + id, { method: 'PUT', body: JSON.stringify({
        building: $('#r_bd').value, room_name: $('#r_nm').value, capacity: $('#r_cp').value,
        gender: $('#r_g').value, description: $('#r_ds').value, layout_url }) });
      $('#modal').classList.add('hidden'); loadRooms();
    });
};
window.delRoom = async (id) => { if (confirm('Delete room?')) { await api('/api/rooms/' + id, { method: 'DELETE' }); loadRooms(); } };

// ---------- designations ----------
async function loadDesignations() {
  [CAMPERS, ROOMS, DESIGNATIONS] = [await api('/api/campers'), await api('/api/rooms'), await api('/api/designations')];
  $('#desigGrid').innerHTML = DESIGNATIONS.map(d => `
    <div class="card glass room-card">
      <div class="row" style="justify-content:space-between">
        <b>${d.camper ? d.camper.first_name + ' ' + d.camper.last_name : 'Unknown'}</b>
        <span class="badge b-${d.status}">${d.status}</span></div>
      <small class="muted">→ ${d.room ? (d.room.building + ' · ' + d.room.room_name) : 'no room'} · ${d.camper?.church || ''}</small>
      <div class="row">
        <div style="flex:1;display:grid;gap:4px">${d.arrival_photo ? `<img src="${d.arrival_photo}">` : '<small class="muted">No arrival photo</small>'}<small class="muted">Arrival</small></div>
        <div style="flex:1;display:grid;gap:4px">${d.departure_photo ? `<img src="${d.departure_photo}">` : '<small class="muted">No departure photo</small>'}<small class="muted">Departure</small></div>
      </div>
      <small class="muted">${d.notes || ''} ${d.approved_by ? '· by ' + d.approved_by : ''}</small>
      ${d.signature ? `<div class="sig-block"><img src="${d.signature}" alt="Pirma"><small class="muted">Pirma · ${d.signed_by || 'signed'}</small></div>` : ''}
      <div class="row">
        ${can('admin', 'coordinator', 'president') && d.status === 'pending' ? `<button class="btn sm primary" onclick="approveDesig('${d.id}','approved')">Approve</button><button class="btn sm danger" onclick="approveDesig('${d.id}','rejected')">Reject</button>` : ''}
        ${can('admin', 'coordinator', 'president') ? `<button class="btn sm" onclick="photoDesig('${d.id}','arrival_photo')">📷 Arrival</button><button class="btn sm" onclick="photoDesig('${d.id}','departure_photo')">📷 Departure</button>` : ''}
        ${can('admin', 'coordinator', 'president') ? `<button class="btn sm" onclick="signDesig('${d.id}')">${d.signature ? '✍ Re-sign' : '✍ Sign'}</button>` : ''}
        ${can('admin', 'coordinator') ? `<button class="btn sm danger" onclick="delDesig('${d.id}')">Del</button>` : ''}
      </div>
    </div>`).join('') || '<p class="muted">No designations yet.</p>';
}
$('#btnAddDesig').onclick = () => {
  openModal('New designation', `
    <label>Camper<select id="d_c">${CAMPERS.map(c => `<option value="${c.id}">${c.first_name} ${c.last_name} (${c.gender} · ${c.church})</option>`).join('')}</select></label>
    <label>Room<select id="d_r">${ROOMS.map(r => `<option value="${r.id}">${r.building} · ${r.room_name} (${r.gender})</option>`).join('')}</select></label>
    ${field('d_n', 'Notes (optional)')}`,
    async () => {
      await api('/api/designations', { method: 'POST', body: JSON.stringify({ camper_id: $('#d_c').value, room_id: $('#d_r').value, notes: $('#d_n').value }) });
      $('#modal').classList.add('hidden'); loadDesignations();
    });
};
window.approveDesig = async (id, status) => { await api('/api/designations/' + id, { method: 'PUT', body: JSON.stringify({ status }) }); loadDesignations(); };
window.delDesig = async (id) => { if (confirm('Delete designation?')) { await api('/api/designations/' + id, { method: 'DELETE' }); loadDesignations(); } };
window.photoDesig = (id, kind) => {
  const inp = $('#hiddenFile'); inp.value = ''; inp.click();
  inp.onchange = async () => {
    if (!inp.files[0]) return;
    const url = await apiFile(inp.files[0]);
    await api('/api/designations/' + id, { method: 'PUT', body: JSON.stringify({ [kind]: url, [kind === 'arrival_photo' ? 'arrival_date' : 'departure_date']: new Date().toISOString() }) });
    loadDesignations();
  };
};
// Pirma — hand signature (president approval sign-off)
window.signDesig = (id) => {
  window._sigDrawn = false;
  openModal('✍ Pirma — sign designation', `
    <p class="muted">Sign below with your finger or mouse, then Save.</p>
    <canvas id="sigPad" width="460" height="170" style="width:100%;border:1px solid var(--line);border-radius:12px;touch-action:none;cursor:crosshair"></canvas>
    <div class="row" style="margin-top:8px"><button class="btn sm ghost" onclick="clearSig()">Clear</button></div>`,
    async () => {
      if (!window._sigDrawn) return alert('Please sign first.');
      const url = $('#sigPad').toDataURL('image/png');
      await api('/api/designations/' + id, { method: 'PUT', body: JSON.stringify({ signature: url, signed_by: ME.name }) });
      $('#modal').classList.add('hidden'); loadDesignations();
    });
  initSigPad();
};
window.clearSig = () => { window._sigDrawn = false; initSigPad(); };
function initSigPad() {
  const cv = $('#sigPad'); if (!cv) return;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const light = document.documentElement.dataset.theme === 'light';
  ctx.strokeStyle = light ? '#7c2d12' : '#f2a93b';
  ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let drawing = false, last = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  cv.onpointerdown = (e) => { drawing = true; last = pos(e); try { cv.setPointerCapture(e.pointerId); } catch {} };
  cv.onpointermove = (e) => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; window._sigDrawn = true; };
  cv.onpointerup = () => drawing = false;
  cv.onpointercancel = () => drawing = false;
}

// ---------- reps ----------
async function loadReps() {
  REPS = await api('/api/representatives');
  $('#repRows').innerHTML = REPS.map(r => `<tr><td>${r.church}</td><td><b>${r.name}</b></td>
    <td><span class="badge b-${r.gender}">${r.gender === 'boy' ? 'Boy rep' : 'Girl rep'}</span></td><td>${r.contact || '—'}</td>
    <td><button class="btn sm danger" onclick="delRep('${r.id}')">Del</button></td></tr>`).join('')
    || `<tr><td colspan="5" class="muted">No representatives yet.</td></tr>`;
}
$('#btnAddRep').onclick = () => openModal('Add representative', `
  ${field('p_ch', 'Church', ME.role === 'president' ? ME.church : '')}
  ${field('p_nm', 'Name')}
  <label>Role<select id="p_g"><option value="boy">Boy representative</option><option value="girl">Girl representative</option></select></label>
  ${field('p_ct', 'Contact')}`,
  async () => {
    await api('/api/representatives', { method: 'POST', body: JSON.stringify({ church: $('#p_ch').value, name: $('#p_nm').value, gender: $('#p_g').value, contact: $('#p_ct').value }) });
    $('#modal').classList.add('hidden'); loadReps();
  });
window.delRep = async (id) => { if (confirm('Delete representative?')) { await api('/api/representatives/' + id, { method: 'DELETE' }); loadReps(); } };

// ---------- roulette ----------
let wheelNames = [];
let wheelEntries = [];
const getExcluded = () => { try { return JSON.parse(localStorage.getItem('camp_wheel_excluded') || '[]'); } catch { return []; } };
const setExcluded = (arr) => localStorage.setItem('camp_wheel_excluded', JSON.stringify(arr));
function refreshWheel() {
  const excl = new Set(getExcluded());
  wheelEntries = ELIGIBLE.filter(c => !excl.has(c.id));
  wheelNames = wheelEntries.map(c => c.first_name + ' ' + c.last_name);
  $('#eligibleCount').textContent = wheelEntries.length;
  drawWheel();
  renderWheelEntries();
}
function renderWheelEntries() {
  const excl = new Set(getExcluded());
  const excluded = ELIGIBLE.filter(c => excl.has(c.id));
  $('#wheelAddRow').style.display = can('admin', 'coordinator') ? '' : 'none';
  $('#wheelEntries').innerHTML = wheelEntries.map(c =>
    `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0"><span>${c.first_name} ${c.last_name} <small class="muted">${c.church || ''}</small></span><button class="btn sm danger" onclick="excludeFromWheel('${c.id}')">Remove</button></div>`).join('')
    || '<p class="muted">Wheel is empty — add people above.</p>';
  $('#wheelExcluded').innerHTML = excluded.length
    ? 'Removed: ' + excluded.map(c => `<button class="btn sm ghost" style="margin:2px" onclick="restoreToWheel('${c.id}')">${c.first_name} ${c.last_name} ↩</button>`).join(' ')
    : '';
}
window.excludeFromWheel = (id) => { const e = getExcluded(); if (!e.includes(id)) e.push(id); setExcluded(e); refreshWheel(); };
window.restoreToWheel = (id) => { setExcluded(getExcluded().filter(x => x !== id)); refreshWheel(); };
$('#btnWheelAdd').onclick = async () => {
  const raw = ($('#wheelName').value || '').trim();
  if (!raw) return alert('Type a name first.');
  const parts = raw.split(/\s+/);
  const first_name = parts.shift();
  const last_name = parts.join(' ') || '—';
  try {
    await api('/api/campers', { method: 'POST', body: JSON.stringify({ first_name, last_name, age: 0, gender: $('#wheelGender').value, church: '', contact: '', guardian: '', medical: '' }) });
    $('#wheelName').value = '';
    await loadRoulette();
  } catch (e) { alert(e.message); }
};
function drawWheel(highlight = -1) {
  const cv = $('#wheel'), ctx = cv.getContext('2d'), n = Math.max(wheelNames.length, 1);
  const light = document.documentElement.dataset.theme === 'light';
  const sliceA = light ? '#f7e8d2' : '#2b140b', sliceB = light ? '#f0d5ae' : '#3d1e10';
  const ink = light ? '#5b2c12' : '#f7ecdc';
  ctx.clearRect(0, 0, 340, 340);
  for (let i = 0; i < n; i++) {
    ctx.beginPath(); ctx.moveTo(170, 170);
    ctx.arc(170, 170, 160, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
    ctx.fillStyle = i === highlight ? '#f2a93b' : (i % 2 ? sliceA : sliceB);
    ctx.fill(); ctx.strokeStyle = 'rgba(242,169,59,.4)'; ctx.stroke();
    ctx.save(); ctx.translate(170, 170); ctx.rotate((i + .5) / n * Math.PI * 2);
    ctx.fillStyle = ink; ctx.font = '11px Inter'; ctx.textAlign = 'right';
    ctx.fillText((wheelNames[i] || '—').slice(0, 16), 150, 4); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(170, 170, 26, 0, 7); ctx.fillStyle = '#f2a93b'; ctx.fill();
  ctx.fillStyle = '#2b1408'; ctx.font = 'bold 12px Orbitron'; ctx.textAlign = 'center'; ctx.fillText('SPIN', 170, 174);
}
async function loadRoulette() {
  ELIGIBLE = await api('/api/roulette/eligible');
  WINNERS = await api('/api/roulette/winners');
  refreshWheel();
  $('#winnerList').innerHTML = WINNERS.map(w => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:8px 0">
    <span>🏆 <b>${w.camper ? w.camper.first_name + ' ' + w.camper.last_name : w.camper_id}</b> <small class="muted">${w.prize || ''}</small></span>
    ${can('admin', 'coordinator') ? `<button class="btn sm danger" onclick="delWinner('${w.id}')">Remove</button>` : ''}</div>`).join('')
    || '<p class="muted">No winners yet.</p>';
}
$('#btnSpin').onclick = async () => {
  if (!wheelEntries.length) return alert('Wheel is empty. Add people first.');
  let ticks = 20 + Math.floor(Math.random() * 15), i = 0;
  const timer = setInterval(() => { drawWheel(i % wheelNames.length); i++; if (--ticks <= 0) {
    clearInterval(timer);
    const idx = Math.floor(Math.random() * wheelEntries.length);
    const pick = wheelEntries[idx];
    $('#spinResult').textContent = '🎉 ' + pick.first_name + ' ' + pick.last_name;
    api('/api/roulette/draw', { method: 'POST', body: JSON.stringify({ camper_id: pick.id, prize: $('#prizeInput').value }) })
      .then(() => loadRoulette()).catch(e => alert(e.message));
  } }, 90);
};
window.delWinner = async (id) => { if (confirm('Remove winner (they become eligible again)?')) { await api('/api/roulette/' + id, { method: 'DELETE' }); loadRoulette(); } };

// ---------- reports ----------
async function loadReport() {
  const r = await api('/api/reports/registered');
  $('#reportRows').innerHTML = r.campers.map(c => `<tr><td><b>${c.first_name} ${c.last_name}</b></td><td>${c.age}</td>
    <td>${c.gender}</td><td>${c.church}</td><td>${c.contact || '—'}</td></tr>`).join('')
    || '<tr><td colspan="5" class="muted">No campers.</td></tr>';
}
$('#btnCsv').onclick = async () => {
  const token = localStorage.getItem('camp_token');
  const res = await fetch('/api/reports/registered?format=csv', { headers: { Authorization: 'Bearer ' + token } });
  const blob = await res.blob();
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'registered-campers.csv'; a.click();
};
$('#btnPrint').onclick = () => window.print();

// ---------- users ----------
const ROLE_STYLE = {
  admin: { icon: '◈', cls: 'role-admin', desc: 'Full access' },
  coordinator: { icon: '✦', cls: 'role-coordinator', desc: 'Registration & rooms' },
  president: { icon: '★', cls: 'role-president', desc: 'Church oversight' },
  viewer: { icon: '◎', cls: 'role-viewer', desc: 'Read only' }
};
const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let USERS = [];
async function loadUsers() {
  USERS = await api('/api/users');
  const counts = {};
  USERS.forEach(u => counts[u.role] = (counts[u.role] || 0) + 1);
  $('#roleStrip').innerHTML = Object.keys(ROLE_STYLE).map(r =>
    `<div class="role-chip ${ROLE_STYLE[r].cls}"><span class="dot"></span>${ROLE_STYLE[r].icon} ${r} <b>${counts[r] || 0}</b></div>`).join('');
  $('#userGrid').innerHTML = USERS.map(u => {
    const rs = ROLE_STYLE[u.role] || ROLE_STYLE.viewer;
    const initials = u.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const isMe = ME && u.id === ME.id;
    return `<div class="card glass user-card ${rs.cls}">
      <div class="user-top"><div class="avatar">${escHtml(initials)}</div>
        <div><b>${escHtml(u.name)}</b><small class="muted">@${escHtml(u.username)}${isMe ? ' · you' : ''}</small></div>
        <span class="role-badge">${rs.icon} ${escHtml(u.role)}</span></div>
      <div class="user-meta"><span>⛪ ${escHtml(u.church || '—')}</span><small class="muted">${rs.desc}</small></div>
      <div class="row"><button class="btn sm" onclick="editUser('${u.id}')">Edit</button>
      <button class="btn sm danger" onclick="delUser('${u.id}')">Delete</button></div>
    </div>`;
  }).join('') || '<p class="muted">No users.</p>';
}
$('#btnAddUser').onclick = () => openModal('Add user / role', `
  ${field('u_nm', 'Full name')}<div class="row">${field('u_un', 'Username')}${field('u_pw', 'Password', '', 'password')}</div>
  <div class="row"><label>Role<select id="u_role"><option>admin</option><option>coordinator</option><option>president</option><option>viewer</option></select></label>
  ${field('u_ch', 'Church (for presidents)')}</div>`,
  async () => {
    await api('/api/users', { method: 'POST', body: JSON.stringify({ name: $('#u_nm').value, username: $('#u_un').value, password: $('#u_pw').value, role: $('#u_role').value, church: $('#u_ch').value }) });
    $('#modal').classList.add('hidden'); loadUsers();
  });
window.editUser = (id) => {
  const u = USERS.find(x => x.id === id); if (!u) return;
  openModal('Edit user', `
  ${field('u_nm', 'Full name', u.name)}${field('u_pw', 'New password (blank = keep)', '', 'password')}
  <div class="row"><label>Role<select id="u_role"><option ${u.role === 'admin' ? 'selected' : ''}>admin</option><option ${u.role === 'coordinator' ? 'selected' : ''}>coordinator</option><option ${u.role === 'president' ? 'selected' : ''}>president</option><option ${u.role === 'viewer' ? 'selected' : ''}>viewer</option></select></label>
  ${field('u_ch', 'Church', u.church || '')}</div>`,
  async () => {
    const body = { name: $('#u_nm').value, role: $('#u_role').value, church: $('#u_ch').value };
    if ($('#u_pw').value) body.password = $('#u_pw').value;
    await api('/api/users/' + id, { method: 'PUT', body: JSON.stringify(body) });
    $('#modal').classList.add('hidden'); loadUsers();
  });
};
window.delUser = async (id) => { if (confirm('Delete user?')) { await api('/api/users/' + id, { method: 'DELETE' }); loadUsers(); } };

// enter-to-login + auto boot
$('#liPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnLogin').click(); });
if (localStorage.getItem('camp_token')) boot();
