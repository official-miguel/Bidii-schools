/**
 * scripts/set-vercel-env.mjs
 *
 * Sets all required environment variables on the Vercel project via the
 * Vercel REST API.
 *
 * Usage:
 *   set VERCEL_TOKEN=your_vercel_token
 *   set VERCEL_PROJECT_ID=your_project_id   (or VERCEL_PROJECT_NAME=bidii)
 *   node scripts/set-vercel-env.mjs
 *
 * Find your token:  https://vercel.com/account/tokens
 * Find project ID:  Vercel Dashboard → project → Settings → General → Project ID
 */

const TOKEN      = process.env.VERCEL_TOKEN;
const PROJECT_ID = process.env.VERCEL_PROJECT_ID;

if (!TOKEN || !PROJECT_ID) {
  console.error(`
ERROR: Missing required env vars.

Run:
  set VERCEL_TOKEN=xxxxxxxxxxxxxxxx
  set VERCEL_PROJECT_ID=prj_xxxxxxxxxxxxxxxx
  node scripts/set-vercel-env.mjs

Get your token:      https://vercel.com/account/tokens
Get your project ID: Vercel Dashboard → your project → Settings → General → Project ID
`);
  process.exit(1);
}

// All environments to apply to
const TARGETS = ["production", "preview", "development"];

// ── Variables to set ────────────────────────────────────────────────────────
// sensitive = true  → encrypted in Vercel (not exposed in UI)
// sensitive = false → plain (NEXT_PUBLIC_ vars are public anyway)

const VARS = [
  // Database — Supabase Postgres
  {
    key:       "DATABASE_URL",
    value:     "postgresql://postgres.qakretnjeuhihodkrctq:Ifoundme%402025@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
    sensitive: true,
  },
  {
    key:       "DIRECT_URL",
    value:     "postgresql://postgres.qakretnjeuhihodkrctq:Ifoundme%402025@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
    sensitive: true,
  },
  // App secrets
  {
    key:       "SESSION_SECRET",
    value:     "5be221a387a9f01b424b429a1a950dff93bb4e00f6600e39b9cd7aff1ccc8f13",
    sensitive: true,
  },
  {
    key:       "INTEGRATION_ENCRYPTION_KEY",
    value:     "1e4d95815ee36db2533638fdafcec3b9b648be588d4d7f37acb97b7161888bbd",
    sensitive: true,
  },
  // Supabase — public (safe in browser)
  {
    key:       "NEXT_PUBLIC_SUPABASE_URL",
    value:     "https://qakretnjeuhihodkrctq.supabase.co",
    sensitive: false,
  },
  {
    key:       "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    value:     "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFha3JldG5qZXVoaWhvZGtyY3RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNzY2MjQsImV4cCI6MjEwMTk1MjYyNH0.4ngijarq1Ta8dgFgkGuNiKdNyhs5m_IWEXxAknWmL60",
    sensitive: false,
  },
  // Supabase — server-only secrets
  {
    key:       "SUPABASE_SERVICE_ROLE_KEY",
    value:     "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFha3JldG5qZXVoaWhvZGtyY3RxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM3NjYyNCwiZXhwIjoyMTAxOTUyNjI0fQ.Py49YAdhgmOInXPCuXNCKVZvFRKzhJ9Jq2Yf3pq8CxU",
    sensitive: true,
  },
  {
    key:       "SUPABASE_STORAGE_IMAGES_BUCKET",
    value:     "images",
    sensitive: false,
  },
  {
    key:       "SUPABASE_STORAGE_REPORTS_BUCKET",
    value:     "reports",
    sensitive: false,
  },
  // App URL
  {
    key:       "NEXT_PUBLIC_APP_URL",
    value:     "https://bidii.vercel.app",
    sensitive: false,
  },
];

const BASE = "https://api.vercel.com";

async function upsertEnvVar(variable) {
  const body = {
    key:       variable.key,
    value:     variable.value,
    type:      variable.sensitive ? "encrypted" : "plain",
    target:    TARGETS,
  };

  // Try creating first
  const createRes = await fetch(`${BASE}/v10/projects/${PROJECT_ID}/env`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  const createData = await createRes.json();

  if (createRes.ok) {
    console.log(`  ✓  Created: ${variable.key}`);
    return;
  }

  // If it already exists (409), update it
  if (createRes.status === 409 || createData.error?.code === "ENV_ALREADY_EXISTS") {
    // Find the existing env var ID
    const listRes  = await fetch(`${BASE}/v9/projects/${PROJECT_ID}/env?limit=100`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const listData = await listRes.json();
    const existing = listData.envs?.find((e) => e.key === variable.key);

    if (!existing) {
      console.error(`  ✗  Could not find existing var to update: ${variable.key}`);
      return;
    }

    const updateRes = await fetch(`${BASE}/v10/projects/${PROJECT_ID}/env/${existing.id}`, {
      method:  "PATCH",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body:    JSON.stringify({
        value:  variable.value,
        type:   variable.sensitive ? "encrypted" : "plain",
        target: TARGETS,
      }),
    });

    if (updateRes.ok) {
      console.log(`  ↻  Updated: ${variable.key}`);
    } else {
      const errData = await updateRes.json();
      console.error(`  ✗  Failed to update ${variable.key}: ${JSON.stringify(errData.error)}`);
    }
    return;
  }

  console.error(`  ✗  Failed to create ${variable.key}: ${JSON.stringify(createData.error)}`);
}

async function triggerRedeploy() {
  // Get latest deployment
  const res  = await fetch(`${BASE}/v6/deployments?projectId=${PROJECT_ID}&limit=1&state=READY`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const data = await res.json();
  const dep  = data.deployments?.[0];

  if (!dep) { console.log("  –  No ready deployment found to redeploy"); return; }

  const redeployRes = await fetch(`${BASE}/v13/deployments`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body:    JSON.stringify({
      deploymentId: dep.uid,
      name:         dep.name,
      target:       "production",
    }),
  });

  if (redeployRes.ok) {
    console.log(`  ✓  Redeploy triggered (${dep.uid})`);
  } else {
    const errData = await redeployRes.json();
    console.log(`  ⚠  Could not auto-redeploy: ${errData.error?.message ?? "unknown"}`);
    console.log("     → Manually redeploy in Vercel Dashboard to pick up new env vars");
  }
}

async function main() {
  console.log(`\n━━━ Setting Vercel Environment Variables ━━━`);
  console.log(`Project: ${PROJECT_ID}\n`);

  for (const v of VARS) {
    await upsertEnvVar(v);
  }

  console.log(`\n━━━ Triggering redeploy ━━━`);
  await triggerRedeploy();

  console.log(`\n✅ Done. Your next deployment will have all env vars set.\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
