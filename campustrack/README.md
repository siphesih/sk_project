# CampusTrack

Attendance, engagement & academic risk tracker for ISJ107V — plain **React (Vite)**
frontend + **Node.js/Express** backend, styled with **Bootstrap 5** (no Tailwind,
no Next.js).

## What changed from the reference project

- **Not Next.js.** This is a Vite + React SPA with `react-router-dom`, calling a
  separate Express API — no `app/` router, no server components.
- **Attendance is code-based, not QR.** The lecturer's *Attendance* tab logs a
  session and generates a short code with an expiry; students type that code
  into their own *Mark attendance* tab. No camera, no QR scan, no "face
  verification" step.
- **No single all-in-one dashboard.** Every role gets its own left-hand
  navigation with one tab per concern (Overview, Timetable, Assignments, Mark
  attendance, Rate sessions, Assistant for students; Overview, Attendance,
  Roster, Results, At‑risk students, Notifications, Assistant for lecturers;
  Overview, Users, Modules for admin). "Dashboard" as a page name is gone —
  each tab is named for what it does.
- **Visual language matches the reference screens** (same blue/green palette,
  card style, pill badges, rounded corners) but rebuilt in Bootstrap utility
  classes + a small `theme.css` instead of Tailwind/shadcn.

## Project layout

```
campustrack/
  backend/     Express API and MySQL database connection
  frontend/    Vite + React app, Bootstrap 5
```

## Running with Docker

Requires Docker Desktop with Docker Compose.

```bash
# Run from the campustrack folder
docker compose up --build

# Stop the containers (database data is kept)
docker compose down
```

Open http://localhost:5173. The frontend proxies `/api/*` requests to the backend,
and the backend connects to the MariaDB container. On the first run, Docker
initializes the database from `backend/campustrack_db.sql`; this happens only
when the database volume is created.

To stop and also remove the database volume (this deletes its stored data), run:

```bash
docker compose down --volumes
```

## Running without Docker

Requires Node.js 18+ and a local MySQL/MariaDB server with the database in
`backend/campustrack_db.sql` imported as `campustrack_db`.

```bash
# Terminal 1 — API on http://localhost:5000
cd backend
npm install
npm start

# Terminal 2 — app on http://localhost:5173
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to the API at `http://localhost:5000`.

## Demo logins

| Role     | Username                | Password      |
| -------- | ------------------------ | ------------- |
| Student  | `219524579`              | `password123` |
| Lecturer | `khumalo@tut.ac.za`      | `password123` |
| Admin    | `admin@tut.ac.za`        | `password123` |

## Trying the attendance flow

1. Sign in as the lecturer → **Attendance** → pick a module → log a session
   (date + topic) → **Generate code**.
2. In another browser/tab, sign in as the student → **Mark attendance** →
   type in the code shown to the lecturer.
3. Back on the lecturer's **Attendance** tab, the roster table updates to
   show that student as *present*.

## Notes

- Database connection settings can be overridden with `DB_HOST`, `DB_PORT`,
  `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.
- The assistant is intentionally rule-based (keyword matching against each
  user's own data), matching the proposal's scope decision to avoid an
  external AI service for the MVP.
