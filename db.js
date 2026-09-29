// Dual-mode DB: Postgres (Render) or local JSON file (zero-setup).
// No native modules, so `npm install` never conflicts on Render.
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || '';
const usePostgres = Boolean(DATABASE_URL);

let pgPool = null;
if (usePostgres) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
}

// ---------- JSON fallback ----------
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function blankDB() {
  return { users: [], campers: [], rooms: [], designations: [], representatives: [], winners: [], logs: [] };
}
function loadJSON() {
  try {
    if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE, JSON.stringify(blankDB(), null, 2)); }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return blankDB(); }
}
function saveJSON(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => new Date().toISOString();

async function init() {
  if (usePostgres) {
    await pgPool.query(`CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
      church TEXT DEFAULT '', contact TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS campers(
      id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      age INT DEFAULT 0, gender TEXT DEFAULT 'boy', church TEXT DEFAULT '',
      contact TEXT DEFAULT '', guardian TEXT DEFAULT '', medical TEXT DEFAULT '',
      status TEXT DEFAULT 'registered', created_by TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS rooms(
      id TEXT PRIMARY KEY, building TEXT DEFAULT '', room_name TEXT NOT NULL,
      capacity INT DEFAULT 10, gender TEXT DEFAULT 'mixed',
      description TEXT DEFAULT '', layout_url TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS designations(
      id TEXT PRIMARY KEY, camper_id TEXT NOT NULL, room_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending', arrival_photo TEXT DEFAULT '', departure_photo TEXT DEFAULT '',
      arrival_date TEXT DEFAULT '', departure_date TEXT DEFAULT '',
      approved_by TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS representatives(
      id TEXT PRIMARY KEY, church TEXT NOT NULL, name TEXT NOT NULL,
      gender TEXT DEFAULT 'boy', contact TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS winners(
      id TEXT PRIMARY KEY, camper_id TEXT NOT NULL, prize TEXT DEFAULT '',
      drawn_by TEXT DEFAULT '', drawn_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS logs(
      id SERIAL PRIMARY KEY, actor TEXT DEFAULT '', action TEXT DEFAULT '', detail TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log('[db] Postgres mode');
  } else {
    loadJSON(); // ensure file exists
    console.log('[db] JSON file mode (data/db.json)');
  }
}

// Generic helpers — both backends expose same function names
const db = {
  mode: usePostgres ? 'postgres' : 'json',
  pool: () => pgPool,

  async all(table) {
    if (usePostgres) { const r = await pgPool.query(`SELECT * FROM ${table} ORDER BY created_at DESC`); return r.rows; }
    return (loadJSON()[table] || []).slice().reverse();
  },
  async get(table, id) {
    if (usePostgres) { const r = await pgPool.query(`SELECT * FROM ${table} WHERE id=$1`, [id]); return r.rows[0] || null; }
    return (loadJSON()[table] || []).find(x => x.id === id) || null;
  },
  async findUserByUsername(username) {
    if (usePostgres) { const r = await pgPool.query(`SELECT * FROM users WHERE username=$1`, [username]); return r.rows[0] || null; }
    return (loadJSON().users || []).find(u => u.username === username) || null;
  },
  async insert(table, row) {
    row.id = row.id || uid();
    row.created_at = row.created_at || now();
    if (usePostgres) {
      const keys = Object.keys(row);
      const vals = Object.values(row);
      const ph = keys.map((_, i) => `$${i + 1}`).join(',');
      await pgPool.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${ph})`, vals);
      return row;
    }
    const j = loadJSON(); j[table].push(row); saveJSON(j); return row;
  },
  async update(table, id, patch) {
    if (usePostgres) {
      const keys = Object.keys(patch);
      if (!keys.length) return await db.get(table, id);
      const set = keys.map((k, i) => `${k}=$${i + 1}`).join(',');
      await pgPool.query(`UPDATE ${table} SET ${set} WHERE id=$${keys.length + 1}`, [...Object.values(patch), id]);
      return await db.get(table, id);
    }
    const j = loadJSON();
    const i = (j[table] || []).findIndex(x => x.id === id);
    if (i < 0) return null;
    j[table][i] = { ...j[table][i], ...patch };
    saveJSON(j); return j[table][i];
  },
  async remove(table, id) {
    if (usePostgres) { await pgPool.query(`DELETE FROM ${table} WHERE id=$1`, [id]); return true; }
    const j = loadJSON(); j[table] = (j[table] || []).filter(x => x.id !== id); saveJSON(j); return true;
  },
  async count(table) {
    if (usePostgres) { const r = await pgPool.query(`SELECT COUNT(*)::int AS c FROM ${table}`); return r.rows[0].c; }
    return (loadJSON()[table] || []).length;
  },
  async log(actor, action, detail = '') {
    try {
      if (usePostgres) await pgPool.query(`INSERT INTO logs(actor,action,detail) VALUES($1,$2,$3)`, [actor, action, detail]);
      else { const j = loadJSON(); j.logs.push({ id: uid(), actor, action, detail, created_at: now() }); saveJSON(j); }
    } catch {}
  }
};

module.exports = { db, init, uid, now, usePostgres };
