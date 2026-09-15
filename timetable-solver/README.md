# Timetable CP-SAT Solver

A FastAPI microservice that uses [Google OR-Tools CP-SAT](https://developers.google.com/optimization/reference/python/sat/python/cp_model) to generate school timetables.

---

## Production deployment (Cloud Run → Vercel)

The solver runs as a Cloud Run service; the Next.js app runs on Vercel and calls it via `TIMETABLE_SOLVER_URL` and `TIMETABLE_SOLVER_SECRET`.

### Prerequisites

- `gcloud` CLI installed and authenticated (`gcloud auth login`)
- A GCP project with billing enabled
- `TIMETABLE_SOLVER_URL` and `TIMETABLE_SOLVER_SECRET` env vars in your Vercel project

---

### Step 1 — Enable required GCP APIs

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

---

### Step 2 — Create the shared secret in Secret Manager

```bash
# Generate a cryptographically random 32-byte hex secret
SOLVER_SECRET=$(openssl rand -hex 32)

# Store it in Secret Manager
echo -n "$SOLVER_SECRET" | gcloud secrets create solver-shared-secret --data-file=-

# Print the value — copy it, you'll add it to Vercel in Step 4
echo "Vercel secret value: $SOLVER_SECRET"
```

---

### Step 3 — Deploy to Cloud Run

Run from the `timetable-solver/` directory. Cloud Run builds the image directly from the existing `Dockerfile`.

```bash
cd timetable-solver

gcloud run deploy bidii-timetable-solver \
  --source . \
  --region africa-south1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --concurrency 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 3 \
  --set-secrets SOLVER_SHARED_SECRET=solver-shared-secret:latest
```

Flag notes:
- `--concurrency 1` — each solve is CPU-heavy and blocks the process; one instance handles one request at a time.
- `--allow-unauthenticated` — safe because the app-level `X-Solver-Secret` header is the real gate; Cloud Run IAM is left open because Vercel is not a GCP identity.
- `--timeout 300` — generous headroom beyond typical solve budgets.
- `--set-secrets` — injects `SOLVER_SHARED_SECRET` from Secret Manager at runtime; no secret is baked into the image.

After deploy, `gcloud run deploy` prints a Service URL, e.g.:

```
https://bidii-timetable-solver-xxxxxxxxxx-af.a.run.app
```

Copy it — you need it in Step 4.

---

### Step 4 — Wire the Cloud Run URL and secret into Vercel

1. Open your Vercel project dashboard → **Settings → Environment Variables**.
2. Set/update the following variables for **Production** and **Preview**:

   | Name | Value |
   |---|---|
   | `TIMETABLE_SOLVER_URL` | The Cloud Run Service URL from Step 3 (no trailing slash) |
   | `TIMETABLE_SOLVER_SECRET` | The hex secret generated in Step 2 |

3. Click **Save** for each variable.
4. **Redeploy** your Vercel app for the env vars to take effect:
   - Vercel dashboard → **Deployments → Redeploy**, or
   - Push a commit to trigger a deploy.

---

### Step 5 — Verify end-to-end

Health check (no secret required):

```bash
curl https://bidii-timetable-solver-xxxxxxxxxx-af.a.run.app/health
# → {"status":"ok","solver":"cp-sat"}
```

Secret check (empty body should return 422 validation error, NOT 401):

```bash
curl -X POST https://bidii-timetable-solver-xxxxxxxxxx-af.a.run.app/solve \
  -H "Content-Type: application/json" \
  -H "X-Solver-Secret: $SOLVER_SECRET" \
  -d '{}'
# → 422 Unprocessable Entity (validation error) — confirms secret passed through correctly
```

Missing secret should return 401:

```bash
curl -X POST https://bidii-timetable-solver-xxxxxxxxxx-af.a.run.app/solve \
  -H "Content-Type: application/json" \
  -d '{}'
# → {"detail":"Invalid or missing solver secret."}
```

Then generate a timetable in the app to confirm full end-to-end behaviour.

Check Cloud Run logs if you need to debug:

```bash
gcloud run services logs read bidii-timetable-solver --region africa-south1
```

---

## Architecture overview

```
Vercel (Next.js)
  └── POST /api/timetable/generate
  └── POST /api/timetable/v2/generate
        │
        │  TIMETABLE_SOLVER_URL  (Cloud Run Service URL)
        │  TIMETABLE_SOLVER_SECRET  (X-Solver-Secret header)
        ▼
Cloud Run (FastAPI + OR-Tools)
  └── GET  /health          (open — no secret required)
  └── POST /solve           (protected by X-Solver-Secret)
```

The Next.js app health-checks the solver before every generation request. If the solver is unreachable the API returns a clear 422 with a hint rather than crashing.

### Shared-secret authentication

Every `POST /solve` request must include the header:

```
X-Solver-Secret: <value of TIMETABLE_SOLVER_SECRET>
```

The solver compares it to `SOLVER_SHARED_SECRET` (injected from Secret Manager by Cloud Run) using a constant-time comparison. Requests with a missing or wrong secret receive `401 Unauthorized`. The `GET /health` endpoint is intentionally unauthenticated so Cloud Run's own health probes work without configuration.

When `SOLVER_SHARED_SECRET` is not set (local dev), the check is skipped entirely.

### Hard group co-scheduling constraint

When a school defines **Elective Groups** (e.g. "GPC" containing Geography, History, CRE for Form 4), every class in that form must have those subjects scheduled at the **same day and period** so students can move between streams.

The Next.js API converts `ElectiveGroup` records into `linkedClassGroups` entries before calling `/solve`:

```
ElectiveGroup { scopeForm: 4, scopeStreams: [], members: [geo, hist, cre] }
  → linkedClassGroups: [{ subjectIds: [geo, hist, cre], classIds: [4A, 4B, 4C] }]
```

The solver enforces this via pairwise mutual implication for every `(subject, day, period)`:

```
x[4A, geo, d, p] == x[4B, geo, d, p] == x[4C, geo, d, p]   for all d, p
```

This is a **hard constraint** — the solver will never place a group subject at a different time for any stream. If teacher unavailability makes it impossible to find a common slot, the solver emits a warning and the shortfall is surfaced to the admin.

---

## Local development

**Prerequisites:** Python 3.11 or 3.12

```bash
cd timetable-solver
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python solver.py
# → Uvicorn running on http://0.0.0.0:8080
```

The service starts on `http://localhost:8080`. Verify:

```bash
curl http://localhost:8080/health
# → {"status":"ok","solver":"cp-sat"}
```

Your local `.env` should have:
```
TIMETABLE_SOLVER_URL="http://localhost:8080"
# TIMETABLE_SOLVER_SECRET is intentionally omitted for local dev —
# the solver skips the auth check when SOLVER_SHARED_SECRET is not set.
```

---

## Running with Docker

```bash
# Build
docker build -t timetable-solver .

# Run (mirrors Cloud Run's behaviour)
docker run -e PORT=8080 -p 8080:8080 timetable-solver
```

---

## Environment variables

### Solver service (Cloud Run / Docker)

| Variable | Default | Description |
|---|---|---|
| `PORT` | — | Injected by Cloud Run at runtime. Takes precedence over `SOLVER_PORT`. |
| `SOLVER_PORT` | `8080` | Fallback port for local dev and Docker. |
| `SOLVER_SHARED_SECRET` | — | Shared secret for `POST /solve` auth. Set via Secret Manager in production. Omit for local dev to skip auth. |

### Next.js app (Vercel)

| Variable | Description |
|---|---|
| `TIMETABLE_SOLVER_URL` | Cloud Run Service URL (no trailing slash). |
| `TIMETABLE_SOLVER_SECRET` | Must match `SOLVER_SHARED_SECRET`. Sent as `X-Solver-Secret` header on every solver request. |

---

## API reference

### `GET /health`

No authentication required.

```json
{ "status": "ok", "solver": "cp-sat" }
```

### `POST /solve`

**Required header:** `X-Solver-Secret: <secret>` (when `SOLVER_SHARED_SECRET` is configured)

**Request** (abbreviated):

```jsonc
{
  "subjects": [{ "id": "...", "code": "MATH", "internalCode": 1, "doubleLesson": false, "requiresSpecialRoom": null }],
  "classes":  [{ "id": "...", "name": "Form 1A", "form": 1, "streamIndex": 0 }],
  "teachers": [{ "id": "...", "name": "Mr Oduya" }],
  "requirements": [{ "classId": "...", "subjectId": "...", "lessonsPerWeek": 5 }],
  "teacherAssignments": [{ "classId": "...", "subjectId": "...", "teacherId": "..." }],
  "teacherUnavailability": [],
  "sessionPreferences": [],
  "templateColumns": [
    { "position": 1, "startTime": "08:00", "endTime": "08:40", "slotType": "LESSON", "session": "MORNING", "label": null }
  ],
  "operatingDays": [0, 1, 2, 3, 4],
  "maxLessonsPerTeacherPerDay": 6,
  "timeLimitSeconds": 60,
  "linkedClassGroups": [
    {
      "subjectIds": ["sid-geo", "sid-hist", "sid-cre"],
      "classIds":   ["cls-1A",  "cls-1B",  "cls-1C"]
    }
  ]
}
```

**Response:**

```jsonc
{
  "status": "FEASIBLE",
  "slots": [
    { "classId": "...", "dayOfWeek": 0, "period": 1, "subjectId": "...", "teacherId": "...", "room": null }
  ],
  "warnings": [],
  "stats": {
    "totalLessonsScheduled": 120,
    "totalLessonsRequired": 120,
    "completionRate": 100.0,
    "wallTime": 0.43,
    "branches": 512,
    "conflicts": 14
  }
}
```

`period` is 1-based among LESSON columns only.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Vercel returns 422 "solver service not running" | `TIMETABLE_SOLVER_URL` not set or Cloud Run service is not deployed | Check the env var in Vercel dashboard; redeploy Vercel after updating |
| `401 Invalid or missing solver secret` | `TIMETABLE_SOLVER_SECRET` in Vercel doesn't match the Secret Manager value | Re-check both values; redeploy Vercel after correcting |
| Cloud Run build fails | Missing `Dockerfile` or wrong source directory | Run `gcloud run deploy` from inside `timetable-solver/` |
| `status: "UNKNOWN"` | Solver hit 60 s time limit | Reduce lesson requirements or increase `timeLimitSeconds` |
| First solve is slow | OR-Tools JIT compilation + cold start | Normal — subsequent calls on the same instance are faster |
| 422 "no lessons could be scheduled" | All teachers marked unavailable or too few teachers | Assign more teachers or reduce unavailability blocks |
