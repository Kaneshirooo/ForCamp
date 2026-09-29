# CampReg — Registration & Room Assignation System

Futuristic + formal theme, dark/light mode, mobile responsive (laptop + phone).
4 user levels: **admin · coordinator · president · viewer**.

## Features mapped to your spec
- **Camp registration (CRUDE):** coordinator + admin can Create/Read/Update/Delete/Export campers; president sees own church youth only.
- **Room assignation:** rooms/layout with capacity, gender (boy/girl/mixed), layout image, occupancy bar.
- **Room designation + approve:** admin/coordinator propose → admin/coordinator/president approve or reject.
- **Room sign photos:** arrival (pagkarating) + departure (pagkaalis) uploads per designation.
- **Representatives:** president adds girl + boy leader per church.
- **Roulette (crude):** animated wheel, random draw, winners list, remove-to-re-eligible.
- **Reports:** registered list **excludes roulette winners**; CSV download + print; dashboard summary by church/gender/status.
- **Users/roles:** admin can add user role.

## Why no Render conflict
- Stack: **Node 20 + Express + vanilla frontend** (no build step).
- DB: **Postgres if `DATABASE_URL` exists, else local JSON file** (`data/db.json`).
- No native modules (`bcryptjs`, `pg`, `multer` only) — `npm install` never needs compilation.
- Start command is just `npm start`.

## Run locally
```bash
npm install
npm start
# open http://localhost:3000
```
Demo logins (seeded on first run): `admin/admin123`, `coordinator/coord123`, `president/pres123`, `viewer/view123`

## Deploy on Render
1. Push this folder to GitHub.
2. Render → New → Web Service → select repo.
   - Build: `npm install` · Start: `npm start` (already in `render.yaml`).
3. Set env: `JWT_SECRET` (long random), `DEMO_SEED=true`.
4. (Recommended) Add Render **Postgres Free** → copy Internal Connection String → set as `DATABASE_URL` on the web service. Redeploy. App auto-switches to Postgres for persistence.
   - Without Postgres the app still works (JSON file), but files reset on redeploy — fine for demo, not for production.

## API quick reference
`POST /api/auth/login` · `GET /api/campers` · `POST /api/campers` · `GET /api/rooms` ·
`GET/POST/PUT /api/designations` · `POST /api/upload` · `GET/POST /api/representatives` ·
`GET /api/roulette/eligible` · `POST /api/roulette/draw` · `GET /api/reports/registered(?format=csv)` · `GET /api/reports/summary`
