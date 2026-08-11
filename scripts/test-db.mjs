import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
  await p.$connect();
  const r = await p.$queryRaw`SELECT COUNT(*) as tables FROM information_schema.tables WHERE table_schema='public'`;
  console.log("✓ Connected! Tables in public schema:", r[0].tables.toString());
  const schools = await p.school.count();
  console.log("✓ School table accessible. Row count:", schools);
  await p.$disconnect();
} catch (e) {
  console.error("✗ FAIL:", e.message);
  process.exit(1);
}
