import "dotenv/config";
import { spawnSync } from "node:child_process";
import { isLocalDatabaseUrl } from "../../lib/dev/clean-e2e";

/**
 * The local `prisma dev` database sometimes degrades after many sessions: ordinary queries
 * work but a join query kills the connection ("Connection terminated unexpectedly").
 * This probes with such a query and, only for a local database, restarts the dev server
 * named `clinicassist` (data is kept). Set E2E_NO_DB_RESTART=1 to disable the restart.
 */
function probe(): boolean {
  const r = spawnSync("npx tsx scripts/db-probe.ts", {
    shell: true,
    stdio: "ignore",
    timeout: 60_000,
  });
  return r.status === 0;
}

function prismaDev(action: "stop" | "start") {
  spawnSync(`npx prisma dev ${action} clinicassist`, {
    shell: true,
    stdio: "ignore",
    timeout: 120_000,
  });
}

export async function ensureDatabaseHealthy() {
  if (probe()) return;
  if (process.env.E2E_NO_DB_RESTART || !isLocalDatabaseUrl(process.env.DATABASE_URL)) {
    throw new Error(
      "The database is failing queries. Restart it (npx prisma dev stop/start clinicassist).",
    );
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`Database unhealthy: restarting the local dev database (attempt ${attempt}).`);
    prismaDev("stop");
    await new Promise((r) => setTimeout(r, 3000));
    prismaDev("start");
    await new Promise((r) => setTimeout(r, 8000));
    if (probe()) return;
  }
  throw new Error("The local dev database is still failing after 3 restarts.");
}
