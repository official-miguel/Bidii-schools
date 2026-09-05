import { PrismaClient } from "@prisma/client";

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function main() {
  const students = await p.student.findMany({
    where: { parentContact: { not: null }, archivedAt: null },
    select: { fullName:true, admissionNumber:true, parentContact:true },
    take:20
  });
  process.stdout.write("STUDENTS:" + JSON.stringify(students) + "\n");

  const parents = await p.parent.findMany({
    include: {
      user: { select: { email:true, isActive:true, mustChangePassword:true } },
      students: { include: { student: { select: { fullName:true, admissionNumber:true } } } }
    },
    take:20
  });
  process.stdout.write("PARENTS:" + JSON.stringify(parents) + "\n");
  await p.$disconnect();
  process.exit(0);
}

main().catch(e => { process.stderr.write(String(e)); process.exit(1); });