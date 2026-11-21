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

| Role     | Sign in with                    | Password      |
| -------- | ------------------------------- | ------------- |
| Student  | student number `219524579`      | `password123` |
| Lecturer | staff number `100045678`        | `password123` |
| Admin    | staff number `100045677`        | `password123` |

## Trying the attendance flow

1. Sign in as the lecturer → **Attendance** → pick a module → log a session
   (date, topic and a description of what was taught) → **Generate code**.
2. In another browser/tab, sign in as the student → **Mark attendance** →
   type in the code shown to the lecturer, then take the 10-question quiz.
3. Back on the lecturer's **Attendance** tab, the table refreshes within 10
   seconds and shows the student as *present*, with an *In class* / *Not in
   class* label, their quiz score and a map pin.

## Running the tests

Start MySQL/MariaDB first (e.g. in XAMPP). The backend tests create their own
throwaway database (`campustrack_autotest`) from `backend/campustrack_db.sql`,
so your `campustrack_db` data is never touched. They also start local stand-ins
for Groq and the ML service, so no internet or API key is needed.

```bash
# Backend API: 131 tests, plus code coverage of server.js
cd backend
npm test                 # all tests
npm test -- quiz         # only test files whose name contains "quiz"

# ML prediction service: 10 tests (needs its requirements installed)
cd campustrack_ml_model/ml_model
python -m unittest -v test_predict_service

# Frontend: checks the app compiles
cd frontend
npx vite build
```

Results are written to `backend/tests/results/` (`results.json`, `coverage.json`
and the server logs).

## Notes

- Database connection settings can be overridden with `DB_HOST`, `DB_PORT`,
  `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.
- The assistant and the session quizzes use the Groq API (`GROQ_API_KEY` in
  `backend/.env`). The assistant only answers from the signed-in user's own
  CampusTrack data. Set `QUIZ_GENERATOR=mock` to generate placeholder quizzes
  without Groq.
- `GEO_MODE=flag` (default) lets students outside the classroom sign in but
  marks them *Not in class*; `GEO_MODE=enforce` refuses them.
