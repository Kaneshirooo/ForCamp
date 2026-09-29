// Camp Registration & Room Assignation System
// Render-ready: `npm start` serves API + frontend. Postgres if DATABASE_URL exists, else JSON file.
require('dotenv').catch?.(() => {});
try { require('dotenv').config(); } catch {}
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { db, init, uid } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'camp-secret-change-me';

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 8) || '.jpg';
    cb(null, Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

// ---------- auth ----------
function sign(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role, church: user.church || '', name: user.name }, JWT_SECRET, { expiresIn: '3d' });
}
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Session expired. Login again.' }); }
}
const allow = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden for role: ' + req.user.role });
  next();
};

async function seed() {
  const n = await db.count('users');
  if (n > 0) return;
  const mk = async (name, username, password, role, church = '') => {
    const password_hash = await bcrypt.hash(password, 10);
    await db.insert('users', { id: uid(), name, username, password_hash, role, church, contact: '' });
  };
  await mk('Administrator', 'admin', 'admin123', 'admin');
  await mk('Coordinator', 'coordinator', 'coord123', 'coordinator');
  await mk('President (Demo Church)', 'president', 'pres123', 'president', 'Demo Church');
  await mk('Viewer', 'viewer', 'view123', 'viewer');
  console.log('[seed] default users: admin/admin123, coordinator/coord123, president/pres123, viewer/view123');
  if (process.env.DEMO_SEED === 'true') {
    const r1 = await db.insert('rooms', { id: uid(), building: 'Building A', room_name: 'A-101', capacity: 12, gender: 'boy', description: 'Near hall, 6 bunk beds' });
    const r2 = await db.insert('rooms', { id: uid(), building: 'Building A', room_name: 'A-102', capacity: 12, gender: 'girl', description: 'Near CR, 6 bunk beds' });
    const c1 = await db.insert('campers', { id: uid(), first_name: 'Juan', last_name: 'Dela Cruz', age: 16, gender: 'boy', church: 'Demo Church', contact: '09170000001', guardian: 'Maria Dela Cruz', medical: 'None', status: 'registered', created_by: 'admin' });
    await db.insert('campers', { id: uid(), first_name: 'Maria', last_name: 'Santos', age: 15, gender: 'girl', church: 'Demo Church', contact: '09170000002', guardian: 'Jose Santos', medical: 'Asthma', status: 'registered', created_by: 'admin' });
    await db.insert('designations', { id: uid(), camper_id: c1.id, room_id: r1.id, status: 'pending', notes: 'Demo assignment' });
    await db.insert('representatives', { id: uid(), church: 'Demo Church', name: 'Kuya Leader', gender: 'boy', contact: '09170000111' });
    await db.insert('representatives', { id: uid(), church: 'Demo Church', name: 'Ate Leader', gender: 'girl', contact: '09170000112' });
    void r2;
  }
}

// ---------- routes ----------
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const u = await db.findUserByUsername(String(username).trim());
  if (!u) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(String(password), u.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  await db.log(u.username, 'login', u.role);
  const { password_hash, ...safe } = u;
  res.json({ token: sign(u), user: safe });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const u = await db.findUserByUsername(req.user.username);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const { password_hash, ...safe } = u;
  res.json(safe);
});

// Users — admin can add user role (CRUD)
app.get('/api/users', auth, allow('admin'), async (req, res) => {
  const users = (await db.all('users')).map(u => { const { password_hash, ...s } = u; return s; });
  res.json(users);
});
app.post('/api/users', auth, allow('admin'), async (req, res) => {
  const { name, username, password, role, church = '', contact = '' } = req.body || {};
  if (!name || !username || !password || !role) return res.status(400).json({ error: 'name, username, password, role required' });
  if (!['admin', 'coordinator', 'president', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (await db.findUserByUsername(username)) return res.status(400).json({ error: 'Username already exists' });
  const password_hash = await bcrypt.hash(String(password), 10);
  const row = await db.insert('users', { id: uid(), name, username, password_hash, role, church, contact });
  await db.log(req.user.username, 'create_user', username + ' / ' + role);
  const { password_hash: ph, ...safe } = row;
  res.json(safe);
});
app.put('/api/users/:id', auth, allow('admin'), async (req, res) => {
  const patch = {};
  for (const k of ['name', 'role', 'church', 'contact']) if (req.body[k] !== undefined) patch[k] = req.body[k];
  if (req.body.password) patch.password_hash = await bcrypt.hash(String(req.body.password), 10);
  const row = await db.update('users', req.params.id, patch);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { password_hash, ...safe } = row;
  res.json(safe);
});
app.delete('/api/users/:id', auth, allow('admin'), async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  await db.remove('users', req.params.id);
  await db.log(req.user.username, 'delete_user', req.params.id);
  res.json({ ok: true });
});

// Campers — coordinator+admin full CRUDE, president view own church, viewer read-only
function scopeCampers(user, list) {
  if (user.role === 'president') return list.filter(c => (c.church || '') === (user.church || ''));
  return list;
}
app.get('/api/campers', auth, async (req, res) => {
  let list = await db.all('campers');
  list = scopeCampers(req.user, list);
  const q = (req.query.q || '').toLowerCase();
  if (q) list = list.filter(c => `${c.first_name} ${c.last_name} ${c.church}`.toLowerCase().includes(q));
  if (req.query.gender) list = list.filter(c => c.gender === req.query.gender);
  if (req.query.church) list = list.filter(c => c.church === req.query.church);
  res.json(list);
});
app.post('/api/campers', auth, allow('admin', 'coordinator'), async (req, res) => {
  const { first_name, last_name, age = 0, gender = 'boy', church = '', contact = '', guardian = '', medical = '', status = 'registered' } = req.body || {};
  if (!first_name || !last_name) return res.status(400).json({ error: 'First and last name required' });
  const row = await db.insert('campers', { id: uid(), first_name, last_name, age: Number(age) || 0, gender, church, contact, guardian, medical, status, created_by: req.user.username });
  await db.log(req.user.username, 'register_camper', `${first_name} ${last_name}`);
  res.json(row);
});
app.put('/api/campers/:id', auth, allow('admin', 'coordinator'), async (req, res) => {
  const row = await db.update('campers', req.params.id, req.body || {});
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});
app.delete('/api/campers/:id', auth, allow('admin', 'coordinator'), async (req, res) => {
  await db.remove('campers', req.params.id);
  await db.log(req.user.username, 'delete_camper', req.params.id);
  res.json({ ok: true });
});

// Rooms / layout — admin + coordinator can add; everyone logged in can see
app.get('/api/rooms', auth, async (req, res) => res.json(await db.all('rooms')));
app.post('/api/rooms', auth, allow('admin', 'coordinator'), async (req, res) => {
  const { building = '', room_name, capacity = 10, gender = 'mixed', description = '', layout_url = '' } = req.body || {};
  if (!room_name) return res.status(400).json({ error: 'room_name required' });
  const row = await db.insert('rooms', { id: uid(), building, room_name, capacity: Number(capacity) || 0, gender, description, layout_url });
  await db.log(req.user.username, 'add_room', room_name);
  res.json(row);
});
app.put('/api/rooms/:id', auth, allow('admin', 'coordinator'), async (req, res) => {
  const row = await db.update('rooms', req.params.id, req.body || {});
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});
app.delete('/api/rooms/:id', auth, allow('admin', 'coordinator'), async (req, res) => {
  await db.remove('rooms', req.params.id);
  res.json({ ok: true });
});

// Room designations — propose (admin/coordinator), approve (admin/coordinator/president)
app.get('/api/designations', auth, async (req, res) => {
  let list = await db.all('designations');
  const campers = await db.all('campers');
  const rooms = await db.all('rooms');
  const cmap = Object.fromEntries(campers.map(c => [c.id, c]));
  const rmap = Object.fromEntries(rooms.map(r => [r.id, r]));
  let joined = list.map(d => ({ ...d, camper: cmap[d.camper_id] || null, room: rmap[d.room_id] || null }));
  if (req.user.role === 'president') joined = joined.filter(d => (d.camper?.church || '') === (req.user.church || ''));
  res.json(joined);
});
app.post('/api/designations', auth, allow('admin', 'coordinator'), async (req, res) => {
  const { camper_id, room_id, status = 'pending', notes = '' } = req.body || {};
  if (!camper_id || !room_id) return res.status(400).json({ error: 'camper_id and room_id required' });
  const row = await db.insert('designations', { id: uid(), camper_id, room_id, status, notes, arrival_photo: '', departure_photo: '', arrival_date: '', departure_date: '', approved_by: '' });
  await db.log(req.user.username, 'assign_room', `${camper_id} -> ${room_id}`);
  res.json(row);
});
app.put('/api/designations/:id', auth, allow('admin', 'coordinator', 'president'), async (req, res) => {
  const patch = {};
  for (const k of ['status', 'notes', 'arrival_photo', 'departure_photo', 'arrival_date', 'departure_date', 'room_id', 'camper_id']) {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  }
  if (['approved', 'rejected'].includes(patch.status)) patch.approved_by = req.user.username;
  const row = await db.update('designations', req.params.id, patch);
  if (!row) return res.status(404).json({ error: 'Not found' });
  await db.log(req.user.username, 'update_designation', `${req.params.id} -> ${patch.status || 'edit'}`);
  res.json(row);
});
app.delete('/api/designations/:id', auth, allow('admin', 'coordinator'), async (req, res) => {
  await db.remove('designations', req.params.id);
  res.json({ ok: true });
});

// Photo upload (room sign: pagkarating / pagkaalis) + room layout images
app.post('/api/upload', auth, allow('admin', 'coordinator', 'president'), upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// Representatives (girl & boy per church) — president adds for own church
app.get('/api/representatives', auth, async (req, res) => {
  let list = await db.all('representatives');
  if (req.user.role === 'president') list = list.filter(r => r.church === req.user.church);
  res.json(list);
});
app.post('/api/representatives', auth, allow('admin', 'coordinator', 'president'), async (req, res) => {
  let { church = '', name, gender = 'boy', contact = '' } = req.body || {};
  if (req.user.role === 'president') church = req.user.church; // lock to own church
  if (!church || !name) return res.status(400).json({ error: 'church and name required' });
  const row = await db.insert('representatives', { id: uid(), church, name, gender, contact });
  res.json(row);
});
app.put('/api/representatives/:id', auth, allow('admin', 'coordinator', 'president'), async (req, res) => {
  const row = await db.update('representatives', req.params.id, req.body || {});
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});
app.delete('/api/representatives/:id', auth, allow('admin', 'coordinator', 'president'), async (req, res) => {
  await db.remove('representatives', req.params.id);
  res.json({ ok: true });
});

// Roulette (crude: eligible list, draw, winners CRUD)
app.get('/api/roulette/eligible', auth, async (req, res) => {
  let campers = await db.all('campers');
  if (req.user.role === 'president') campers = campers.filter(c => c.church === req.user.church);
  const winners = await db.all('winners');
  const won = new Set(winners.map(w => w.camper_id));
  res.json(campers.filter(c => !won.has(c.id)));
});
app.get('/api/roulette/winners', auth, async (req, res) => {
  const winners = await db.all('winners');
  const campers = await db.all('campers');
  const cmap = Object.fromEntries(campers.map(c => [c.id, c]));
  res.json(winners.map(w => ({ ...w, camper: cmap[w.camper_id] || null })));
});
app.post('/api/roulette/draw', auth, allow('admin', 'coordinator'), async (req, res) => {
  const { camper_id, prize = '' } = req.body || {};
  const winners = await db.all('winners');
  const won = new Set(winners.map(w => w.camper_id));
  let campers = (await db.all('campers')).filter(c => !won.has(c.id));
  if (!campers.length) return res.status(400).json({ error: 'No eligible campers left' });
  let pick = camper_id ? campers.find(c => c.id === camper_id) : campers[Math.floor(Math.random() * campers.length)];
  if (!pick) return res.status(400).json({ error: 'Camper not eligible (already won?)' });
  const row = await db.insert('winners', { id: uid(), camper_id: pick.id, prize, drawn_by: req.user.username });
  await db.log(req.user.username, 'roulette_draw', `${pick.first_name} ${pick.last_name} — ${prize}`);
  res.json({ ...row, camper: pick });
});
app.delete('/api/roulette/:id', auth, allow('admin', 'coordinator'), async (req, res) => {
  await db.remove('winners', req.params.id);
  res.json({ ok: true });
});

// Reports — registered list EXCLUDES roulette winners (per spec)
app.get('/api/reports/registered', auth, async (req, res) => {
  let campers = await db.all('campers');
  if (req.user.role === 'president') campers = campers.filter(c => c.church === req.user.church);
  const winners = await db.all('winners');
  const won = new Set(winners.map(w => w.camper_id));
  const clean = campers.filter(c => !won.has(c.id));
  if ((req.query.format || '') === 'csv') {
    const head = 'first_name,last_name,age,gender,church,contact,guardian,status\n';
    const body = clean.map(c => [c.first_name, c.last_name, c.age, c.gender, `"${(c.church || '').replace(/"/g, '')}"`, c.contact, `"${(c.guardian || '').replace(/"/g, '')}"`, c.status].join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="registered-campers.csv"');
    return res.send(head + body);
  }
  res.json({ total_registered: campers.length, total_winners: winners.length, total_clean: clean.length, campers: clean });
});
app.get('/api/reports/summary', auth, async (req, res) => {
  const [campers, rooms, designations, winners, reps] = await Promise.all([
    db.all('campers'), db.all('rooms'), db.all('designations'), db.all('winners'), db.all('representatives')
  ]);
  const byChurch = {};
  campers.forEach(c => { byChurch[c.church || 'Unspecified'] = (byChurch[c.church || 'Unspecified'] || 0) + 1; });
  const byGender = { boy: campers.filter(c => c.gender === 'boy').length, girl: campers.filter(c => c.gender === 'girl').length };
  const byStatus = {};
  designations.forEach(d => { byStatus[d.status || 'pending'] = (byStatus[d.status || 'pending'] || 0) + 1; });
  res.json({
    campers: campers.length, rooms: rooms.length, designations: designations.length,
    winners: winners.length, representatives: reps.length,
    clean_registered: campers.length - winners.length,
    byChurch, byGender, byStatus, db: db.mode
  });
});

app.get('/api/health', (req, res) => res.json({ ok: true, db: db.mode, time: new Date().toISOString() }));

// ---------- frontend ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

(async () => {
  await init();
  await seed();
  app.listen(PORT, () => console.log(`[camp] running on :${PORT} (db=${db.mode})`));
})();
