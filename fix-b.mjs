import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const edit = (f, pairs) => { let s = readFileSync(f, "utf8"); for (const [a, b] of pairs) { const p = s.split(a); if (p.length !== 2) throw new Error(f + " miss: " + a.slice(0, 50)); s = p.join(b); } writeFileSync(f, s); };

// 1. Remember when a super admin's password first came from the TD app.
edit("prisma/schema.prisma", [[
  `  isPlatformOwner           Boolean                    @default(false)`,
  `  isPlatformOwner           Boolean                    @default(false)
  /// When this super admin's password was first confirmed by the Trillionaire
  /// Designs app (src/lib/td-auth.ts). Until then the password stored here
  /// still works, so nobody is locked out while the two apps are linked.
  passwordFromTdAt          DateTime?`]]);
mkdirSync("prisma/migrations/20261014130000_password_from_td", { recursive: true });
writeFileSync("prisma/migrations/20261014130000_password_from_td/migration.sql",
`-- When a super admin's password was first confirmed by the Trillionaire Designs app.
ALTER TABLE "User" ADD COLUMN "passwordFromTdAt" TIMESTAMP(3);
`);

// 2. The new kind of token.
edit("src/lib/td-auth.ts", [
  [`export type TdTokenAudience = "bidii-super-admin" | "bidii-account-check";`,
   `export type TdTokenAudience = "bidii-super-admin" | "bidii-account-check" | "bidii-password-check";`],
  [` *   • verifyTdToken(..., "bidii-account-check") — that app asks whether an
 *     email has an active super admin account here, so it shows the button
 *     only to people who do.`,
   ` *   • verifyTdToken(..., "bidii-account-check") — that app asks whether an
 *     email has an active super admin account here, so it shows the button
 *     only to people who do.
 *   • verifyTdToken(..., "bidii-password-check") — the first time a super
 *     admin signs in to that app, it checks their Bidii password here, so
 *     they keep the password they already have.`],
]);

// 3. Login: TD is the source once linked; before that, the Bidii password still works.
edit("src/app/api/auth/login/route.ts", [
  [`        SELECT
          id, email, "passwordHash", role::text AS role,
          "mustChangePassword", "isActive", "schoolId",
          "staffRoleId", "createdAt", "updatedAt",
          "avatarUrl", "avatarStoragePath"
        FROM "User"
        WHERE email = \${identifier}
          AND role::text = 'SUPER_ADMIN'`,
   `        SELECT
          id, email, "passwordHash", role::text AS role,
          "mustChangePassword", "isActive", "schoolId",
          "staffRoleId", "createdAt", "updatedAt",
          "avatarUrl", "avatarStoragePath", "passwordFromTdAt"
        FROM "User"
        WHERE email = \${identifier}
          AND role::text = 'SUPER_ADMIN'`],
  [`  avatarUrl:          string | null;`, `  avatarUrl:          string | null;
  /// Super admins only: when their password started coming from the TD app.
  passwordFromTdAt?:  Date | null;`],
  [`        // Shared login: the Trillionaire Designs app keeps super admins'
        // password. A match there is copied here, so the local hash only
        // matters if that app can't be reached.
        if (tdAuthEnabled()) {
          const td = await verifyWithTd(identifier, password);
          if (td.ok) {
            await prisma.user.update({
              where: { id: candidate.id },
              data:  { passwordHash: await hashPassword(password), mustChangePassword: false },
            });
            user = { ...candidate, mustChangePassword: false };
            passwordAlreadyVerified = true;
          } else if (td.reason !== "unavailable") {
            return invalid();
          }
        }`,
   `        // Shared login: the Trillionaire Designs app keeps super admins'
        // password. A match there is copied here, so the local hash only
        // matters if that app can't be reached. Until someone's password has
        // come from that app once, the password stored here still works, so
        // nobody is locked out while the two apps are being linked.
        if (tdAuthEnabled()) {
          const td = await verifyWithTd(identifier, password);
          if (td.ok) {
            await prisma.$executeRaw\`
              UPDATE "User"
                 SET "passwordHash" = \${await hashPassword(password)},
                     "mustChangePassword" = false,
                     "passwordFromTdAt" = COALESCE("passwordFromTdAt", NOW())
               WHERE id = \${candidate.id}\`;
            user = { ...candidate, mustChangePassword: false };
            passwordAlreadyVerified = true;
          } else if (td.reason !== "unavailable" && candidate.passwordFromTdAt) {
            return invalid();
          }
        }`],
]);
console.log("ok");
