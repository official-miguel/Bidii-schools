import fs from "fs";
import path from "path";

// Minimal .env loader (no dotenv dependency) so this script works when run
// directly with ts-node, where Next.js's automatic env loading isn't active.
(() => {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

import { PrismaClient, Module } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Demo seed — a FULL institution to click around in.
 *
 * Creates "Bidii Demo High School" with:
 *   - Principal login
 *   - 5 departments, 12 subjects (Kenyan 8-4-4 style)
 *   - 18 teachers (8 of them class teachers, all with logins)
 *   - Staff roles (Deputy Principal, Registrar, Bursar) + 3 admin-staff logins
 *   - 8 classes: Forms 1-4, East & West streams
 *   - 160 students (20 per class) with parents; Form 3-4 students have electives
 *   - 8-4-4 AssessmentFramework; 3 AssessmentPeriods; full AssessmentItems for the two completed ones
 *   - Timetable config + a conflict-free weekly timetable for every class
 *
 * Re-runnable: if the demo school already exists it is deleted and rebuilt.
 *
 *   npx ts-node --transpile-only prisma/seed-demo.ts
 */

const prisma = new PrismaClient();

const PASSWORD = "Demo@2026";
const SCHOOL_SLUG = "bidii-demo-high-school";
const SCHOOL_NAME = "Bidii Demo High School";
const EMAIL_DOMAIN = "demo.bidii.school";

// Deterministic PRNG so every run produces the same demo data.
let seedState = 42;
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

// ---------------------------------------------------------------------------
// Static demo data
// ---------------------------------------------------------------------------

const DEPARTMENTS = [
  "Mathematics",
  "Languages",
  "Sciences",
  "Humanities",
  "Technical & Applied",
];

type SubjectDef = {
  name: string;
  code: string;
  dept: string;
  type: "CORE" | "ELECTIVE";
  forms: number[];
  lessonsPerWeek: number;
  doubleLesson?: boolean;
  room?: string;
};

const SUBJECTS: SubjectDef[] = [
  { name: "Mathematics", code: "MAT", dept: "Mathematics", type: "CORE", forms: [1, 2, 3, 4], lessonsPerWeek: 6 },
  { name: "English", code: "ENG", dept: "Languages", type: "CORE", forms: [1, 2, 3, 4], lessonsPerWeek: 6 },
  { name: "Kiswahili", code: "KIS", dept: "Languages", type: "CORE", forms: [1, 2, 3, 4], lessonsPerWeek: 5 },
  { name: "Biology", code: "BIO", dept: "Sciences", type: "CORE", forms: [1, 2, 3, 4], lessonsPerWeek: 4, doubleLesson: true, room: "Biology Lab" },
  { name: "Chemistry", code: "CHE", dept: "Sciences", type: "CORE", forms: [1, 2, 3, 4], lessonsPerWeek: 4, doubleLesson: true, room: "Chemistry Lab" },
  { name: "Physics", code: "PHY", dept: "Sciences", type: "CORE", forms: [1, 2, 3, 4], lessonsPerWeek: 4, doubleLesson: true, room: "Physics Lab" },
  { name: "History & Government", code: "HIS", dept: "Humanities", type: "CORE", forms: [1, 2, 3, 4], lessonsPerWeek: 3 },
  { name: "Geography", code: "GEO", dept: "Humanities", type: "CORE", forms: [1, 2, 3, 4], lessonsPerWeek: 3 },
  { name: "CRE", code: "CRE", dept: "Humanities", type: "CORE", forms: [1, 2], lessonsPerWeek: 2 },
  { name: "Agriculture", code: "AGR", dept: "Technical & Applied", type: "CORE", forms: [1, 2], lessonsPerWeek: 2 },
  { name: "Business Studies", code: "BST", dept: "Technical & Applied", type: "ELECTIVE", forms: [3, 4], lessonsPerWeek: 2 },
  { name: "Computer Studies", code: "COMP", dept: "Technical & Applied", type: "ELECTIVE", forms: [3, 4], lessonsPerWeek: 2, room: "Computer Lab" },
];

// subjectCode -> ordered list of teacher indexes below; classes are split
// between them so no teacher exceeds ~24 lessons/week.
type TeacherDef = {
  staffId: string;
  fullName: string;
  dept: string;
  subjects: string[]; // codes
  headOf?: string; // department name
};

const TEACHERS: TeacherDef[] = [
  { staffId: "TCH001", fullName: "David Otieno", dept: "Mathematics", subjects: ["MAT"], headOf: "Mathematics" },
  { staffId: "TCH002", fullName: "Grace Wanjiku", dept: "Mathematics", subjects: ["MAT"] },
  { staffId: "TCH003", fullName: "Peter Kamau", dept: "Languages", subjects: ["ENG"], headOf: "Languages" },
  { staffId: "TCH004", fullName: "Mercy Achieng", dept: "Languages", subjects: ["ENG"] },
  { staffId: "TCH005", fullName: "Amina Hassan", dept: "Languages", subjects: ["KIS"] },
  { staffId: "TCH006", fullName: "Joseph Mwangi", dept: "Languages", subjects: ["KIS"] },
  { staffId: "TCH007", fullName: "Sarah Njeri", dept: "Sciences", subjects: ["BIO"], headOf: "Sciences" },
  { staffId: "TCH008", fullName: "Daniel Kiptoo", dept: "Sciences", subjects: ["BIO"] },
  { staffId: "TCH009", fullName: "Esther Moraa", dept: "Sciences", subjects: ["CHE"] },
  { staffId: "TCH010", fullName: "Samuel Ndegwa", dept: "Sciences", subjects: ["CHE"] },
  { staffId: "TCH011", fullName: "Lucy Wambui", dept: "Sciences", subjects: ["PHY"] },
  { staffId: "TCH012", fullName: "Brian Ochieng", dept: "Sciences", subjects: ["PHY"] },
  { staffId: "TCH013", fullName: "Rose Chebet", dept: "Humanities", subjects: ["HIS"], headOf: "Humanities" },
  { staffId: "TCH014", fullName: "John Maina", dept: "Humanities", subjects: ["GEO"] },
  { staffId: "TCH015", fullName: "Faith Nyambura", dept: "Humanities", subjects: ["CRE"] },
  { staffId: "TCH016", fullName: "George Barasa", dept: "Technical & Applied", subjects: ["AGR"], headOf: "Technical & Applied" },
  { staffId: "TCH017", fullName: "Nancy Akinyi", dept: "Technical & Applied", subjects: ["BST"] },
  { staffId: "TCH018", fullName: "Kevin Mutua", dept: "Technical & Applied", subjects: ["COMP"] },
];

// 8 classes; class teacher = staffId.
const CLASSES = [
  { name: "Form 1 East", form: 1, stream: "East", classTeacher: "TCH001" },
  { name: "Form 1 West", form: 1, stream: "West", classTeacher: "TCH003" },
  { name: "Form 2 East", form: 2, stream: "East", classTeacher: "TCH005" },
  { name: "Form 2 West", form: 2, stream: "West", classTeacher: "TCH007" },
  { name: "Form 3 East", form: 3, stream: "East", classTeacher: "TCH009" },
  { name: "Form 3 West", form: 3, stream: "West", classTeacher: "TCH011" },
  { name: "Form 4 East", form: 4, stream: "East", classTeacher: "TCH013" },
  { name: "Form 4 West", form: 4, stream: "West", classTeacher: "TCH017" },
];

const FIRST_NAMES = [
  "Brian", "Kevin", "Dennis", "Victor", "Collins", "Ian", "Felix", "Elvis",
  "Mercy", "Faith", "Cynthia", "Sharon", "Diana", "Naomi", "Joy", "Purity",
  "Emmanuel", "Moses", "Caleb", "Gideon", "Abigael", "Valentine", "Sylvia",
  "Linet", "Winnie", "Kelvin", "Stephen", "Alice", "Beatrice", "Clinton",
];
const LAST_NAMES = [
  "Omondi", "Wafula", "Kiprop", "Mwende", "Njoroge", "Otieno", "Wanjiru",
  "Chepkemoi", "Mutiso", "Ouma", "Karanja", "Cheruiyot", "Adhiambo",
  "Gitau", "Nafula", "Kilonzo", "Auma", "Rotich", "Muthoni", "Onyango",
  "Wekesa", "Kemboi", "Achieng", "Kariuki", "Jelagat", "Musyoka",
];
const PARENT_TITLES = ["Mr.", "Mrs.", "Dr.", "Eng.", "Rev."];

// ---------------------------------------------------------------------------

async function main() {
  console.log("Seeding demo institution...\n");
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // Wipe any previous demo school (cascades to nearly everything).
  const existing = await prisma.school.findUnique({ where: { slug: SCHOOL_SLUG } });
  if (existing) {
    console.log("Existing demo school found - deleting and rebuilding...");
    await prisma.school.delete({ where: { id: existing.id } });
  }

  // --- School + Principal ---------------------------------------------------
  const school = await prisma.school.create({
    data: {
      name: SCHOOL_NAME,
      slug: SCHOOL_SLUG,
      address: "P.O. Box 1234, Nairobi",
      phone: "+254 700 123 456",
      email: `office@${EMAIL_DOMAIN}`,
    },
  });

  await prisma.user.create({
    data: {
      schoolId: school.id,
      email: `principal@${EMAIL_DOMAIN}`,
      passwordHash,
      role: "PRINCIPAL",
      mustChangePassword: false,
    },
  });

  // --- Departments -----------------------------------------------------------
  const deptByName = new Map<string, string>();
  for (const name of DEPARTMENTS) {
    const d = await prisma.department.create({ data: { schoolId: school.id, name } });
    deptByName.set(name, d.id);
  }

  // --- Subjects ---------------------------------------------------------------
  const subjectByCode = new Map<string, string>();
  let subjectCode = 1;
  for (const s of SUBJECTS) {
    const row = await prisma.subject.create({
      data: {
        schoolId: school.id,
        name: s.name,
        code: s.code,
        type: s.type,
        internalCode: subjectCode++,
        departmentId: deptByName.get(s.dept)!,
        applicableForms: s.forms,
        doubleLesson: s.doubleLesson ?? false,
        requiresSpecialRoom: s.room ?? null,
      },
    });
    subjectByCode.set(s.code, row.id);
  }

  // --- Teachers (all with logins) ----------------------------------------------
  const teacherByStaffId = new Map<string, string>();
  for (const t of TEACHERS) {
    const emailLocal = t.fullName.toLowerCase().replace(/[^a-z]+/g, ".");
    const email = `${emailLocal}@${EMAIL_DOMAIN}`;
    const user = await prisma.user.create({
      data: {
        schoolId: school.id,
        email,
        passwordHash,
        role: "TEACHER",
        mustChangePassword: false,
      },
    });
    const teacher = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        userId: user.id,
        staffId: t.staffId,
        fullName: t.fullName,
        email,
        phone: `+254 7${randInt(10, 39)} ${randInt(100, 999)} ${randInt(100, 999)}`,
        primaryDepartmentId: deptByName.get(t.dept)!,
        teacherSubjects: {
          create: t.subjects.map((code) => ({ subjectId: subjectByCode.get(code)! })),
        },
      },
    });
    teacherByStaffId.set(t.staffId, teacher.id);
  }

  // Department heads
  for (const t of TEACHERS) {
    if (t.headOf) {
      await prisma.department.update({
        where: { id: deptByName.get(t.headOf)! },
        data: { headTeacherId: teacherByStaffId.get(t.staffId)! },
      });
    }
  }

  // --- Staff roles + admin-staff logins ------------------------------------------
  const view = { canView: true, canManage: false };
  const manage = { canView: true, canManage: true };
  const perm = (module: Module, p: { canView: boolean; canManage: boolean }) => ({ module, ...p });

  const roleDefs: { name: string; description: string; perms: { module: Module; canView: boolean; canManage: boolean }[]; email: string }[] = [
    {
      name: "Deputy Principal",
      description: "Full day-to-day administration",
      email: `deputy@${EMAIL_DOMAIN}`,
      perms: [
        perm("DEPARTMENTS", manage), perm("SUBJECTS", manage), perm("STAFF", manage),
        perm("CLASSES", manage), perm("STUDENTS", manage), perm("TIMETABLE", manage),
        perm("ASSESSMENTS", manage), perm("ASSESSMENT_FRAMEWORK", manage), perm("TOD", manage),
        perm("CALENDAR", manage), perm("REPORTS", view),
      ],
    },
    {
      name: "Registrar",
      description: "Student admissions and records",
      email: `registrar@${EMAIL_DOMAIN}`,
      perms: [perm("STUDENTS", manage), perm("CLASSES", view), perm("CALENDAR", view)],
    },
    {
      name: "Bursar",
      description: "Finance office - read-only student records and reports",
      email: `bursar@${EMAIL_DOMAIN}`,
      perms: [perm("STUDENTS", view), perm("REPORTS", view)],
    },
  ];

  for (const r of roleDefs) {
    const role = await prisma.staffRole.create({
      data: {
        schoolId: school.id,
        name: r.name,
        description: r.description,
        permissions: { create: r.perms },
      },
    });
    await prisma.user.create({
      data: {
        schoolId: school.id,
        email: r.email,
        passwordHash,
        role: "ADMIN_STAFF",
        staffRoleId: role.id,
        mustChangePassword: false,
      },
    });
  }

  // --- Classes -------------------------------------------------------------------
  const classRows: { id: string; name: string; form: number }[] = [];
  for (const c of CLASSES) {
    const row = await prisma.schoolClass.create({
      data: {
        schoolId: school.id,
        name: c.name,
        form: c.form,
        stream: c.stream,
        classTeacherId: teacherByStaffId.get(c.classTeacher)!,
      },
    });
    classRows.push({ id: row.id, name: c.name, form: c.form });
  }

  // --- Students (20 per class) ------------------------------------------------------
  console.log("Creating 160 students...");
  let admission = 1;
  const studentsByClass = new Map<string, { id: string; ability: number }[]>();
  for (const c of classRows) {
    const list: { id: string; ability: number }[] = [];
    for (let i = 0; i < 20; i++) {
      const firstName = pick(FIRST_NAMES);
      const lastName = pick(LAST_NAMES);
      const yearOfBirth = 2026 - (13 + c.form) - randInt(0, 1);
      const parentLast = lastName;
      const student = await prisma.student.create({
        data: {
          schoolId: school.id,
          classId: c.id,
          admissionNumber: `ADM${String(admission++).padStart(4, "0")}`,
          fullName: `${firstName} ${lastName}`,
          dateOfBirth: new Date(Date.UTC(yearOfBirth, randInt(0, 11), randInt(1, 28))),
          parentName: `${pick(PARENT_TITLES)} ${pick(FIRST_NAMES)} ${parentLast}`,
          parentContact: `+254 7${randInt(10, 39)} ${randInt(100, 999)} ${randInt(100, 999)}`,
        },
      });
      list.push({ id: student.id, ability: randInt(40, 85) });
    }
    studentsByClass.set(c.id, list);
  }

  // Electives for Form 3-4 students (each picks both demo electives half the
  // time, otherwise one of the two).
  for (const c of classRows.filter((c) => c.form >= 3)) {
    for (const s of studentsByClass.get(c.id)!) {
      const codes = rand() < 0.5 ? ["BST", "COMP"] : [pick(["BST", "COMP"])];
      for (const code of codes) {
        await prisma.studentElective.create({
          data: { studentId: s.id, subjectId: subjectByCode.get(code)! },
        });
      }
    }
  }

  // --- Timetable config -------------------------------------------------------
  await prisma.timetableConfig.upsert({
    where: { schoolId: school.id },
    update: {},
    create: {
      schoolId: school.id,
      maxLessonsPerTeacherPerDay: 6,
      operatingDays: [0, 1, 2, 3, 4],
    },
  });

  // --- Class-subject-teacher assignments ----------------------------------------------
  // For subjects with two teachers, East classes get the first, West the second
  // (and odd-indexed classes alternate) so loads stay under ~24 lessons/week.
  console.log("Assigning subject teachers and building the timetable...");
  const teachersForSubject = new Map<string, string[]>(); // code -> teacherIds
  for (const t of TEACHERS) {
    for (const code of t.subjects) {
      const arr = teachersForSubject.get(code) ?? [];
      arr.push(teacherByStaffId.get(t.staffId)!);
      teachersForSubject.set(code, arr);
    }
  }

  type Lesson = { subjectId: string; teacherId: string; code: string; remaining: number };
  const lessonsByClass = new Map<string, Lesson[]>();

  for (let ci = 0; ci < classRows.length; ci++) {
    const c = classRows[ci];
    const lessons: Lesson[] = [];
    for (const s of SUBJECTS) {
      if (!s.forms.includes(classRows[ci].form)) continue;
      const pool = teachersForSubject.get(s.code)!;
      const teacherId = pool[ci % pool.length];
      lessons.push({
        subjectId: subjectByCode.get(s.code)!,
        teacherId,
        code: s.code,
        remaining: s.lessonsPerWeek,
      });
      await prisma.classSubjectTeacher.create({
        data: { classId: c.id, subjectId: subjectByCode.get(s.code)!, teacherId },
      });
    }
    lessonsByClass.set(c.id, lessons);
  }

  // --- Greedy conflict-free timetable ---------------------------------------------------
  // Slot-major iteration spreads teachers across classes evenly. Respects:
  // class slot uniqueness, teacher slot uniqueness, max 6 lessons/teacher/day,
  // and (soft) max 2 periods of one subject per class per day.
  const teacherBusy = new Set<string>(); // `${teacherId}:${day}:${period}`
  const teacherDayCount = new Map<string, number>(); // `${teacherId}:${day}`
  const classSubjectDay = new Map<string, number>(); // `${classId}:${code}:${day}`
  const slotRows: { classId: string; dayOfWeek: number; period: number; subjectId: string; teacherId: string; room: string | null }[] = [];
  const roomByCode = new Map(SUBJECTS.map((s) => [s.code, s.room ?? null]));

  for (let day = 0; day < 5; day++) {
    for (let period = 1; period <= 8; period++) {
      if (day === 2 && period === 8) continue; // games slot
      for (const c of classRows) {
        const lessons = lessonsByClass.get(c.id)!;
        const usable = (l: Lesson, softLimit: boolean) =>
          l.remaining > 0 &&
          !teacherBusy.has(`${l.teacherId}:${day}:${period}`) &&
          (teacherDayCount.get(`${l.teacherId}:${day}`) ?? 0) < 6 &&
          (!softLimit || (classSubjectDay.get(`${c.id}:${l.code}:${day}`) ?? 0) < 2);

        let candidates = lessons.filter((l) => usable(l, true));
        if (candidates.length === 0) candidates = lessons.filter((l) => usable(l, false));
        if (candidates.length === 0) continue;

        candidates.sort((a, b) => b.remaining - a.remaining);
        const chosen = candidates[0];
        chosen.remaining--;
        teacherBusy.add(`${chosen.teacherId}:${day}:${period}`);
        teacherDayCount.set(
          `${chosen.teacherId}:${day}`,
          (teacherDayCount.get(`${chosen.teacherId}:${day}`) ?? 0) + 1
        );
        classSubjectDay.set(
          `${c.id}:${chosen.code}:${day}`,
          (classSubjectDay.get(`${c.id}:${chosen.code}:${day}`) ?? 0) + 1
        );
        slotRows.push({
          classId: c.id,
          dayOfWeek: day,
          period,
          subjectId: chosen.subjectId,
          teacherId: chosen.teacherId,
          room: roomByCode.get(chosen.code) ?? null,
        });
      }
    }
  }

  await prisma.timetableSlot.createMany({
    data: slotRows.map((r) => ({ ...r, schoolId: school.id })),
  });
  const unplaced = [...lessonsByClass.values()].flat().reduce((n, l) => n + l.remaining, 0);
  console.log(`Timetable: ${slotRows.length} slots placed, ${unplaced} lessons unplaced.`);

  // --- Assessment framework + periods (8-4-4) --------------------------------------
  console.log("Creating 8-4-4 assessment framework and demo periods...");

  const framework844 = await prisma.assessmentFramework.create({
    data: {
      schoolId: school.id,
      type: "EIGHT_FOUR_FOUR",
      label: "KCSE 2026",
      academicYear: "2026",
      isActive: true,
    },
  });

  // Three assessment periods mirroring the old exam period structure.
  // Only the first two have demo items entered (withItems: true).
  const periodDefs = [
    { name: "Term 1 Opener",   term: 1, weight: 0.3, maxMarks: 100, isCurrent: false, withItems: true  },
    { name: "Term 1 End Term", term: 1, weight: 0.7, maxMarks: 100, isCurrent: false, withItems: true  },
    { name: "Term 2 Midterm",  term: 2, weight: 0.5, maxMarks: 100, isCurrent: true,  withItems: false },
  ];

  const periodRows: { id: string; name: string; withItems: boolean }[] = [];
  for (const p of periodDefs) {
    const row = await prisma.assessmentPeriod.create({
      data: {
        schoolId:    school.id,
        name:        p.name,
        academicYear: "2026",
        term:        p.term,
        weight:      p.weight,
        maxMarks:    p.maxMarks,
        isCurrent:   p.isCurrent,
      },
    });
    periodRows.push({ id: row.id, name: p.name, withItems: p.withItems });
  }

  // --- Papers for each subject -------------------------------------------------------
  // Two papers for English and Mathematics; one paper (subject-level) for everything else.
  const multiPaperSubjects: Record<string, { name: string; maxMarks: number }[]> = {
    ENG: [{ name: "Paper 1 (Comprehension)", maxMarks: 40 }, { name: "Paper 2 (Composition)", maxMarks: 60 }],
    MAT: [{ name: "Paper 1",                 maxMarks: 50 }, { name: "Paper 2",                maxMarks: 50 }],
  };

  // paperMap: subjectId -> list of { paperId, maxMarks }
  const paperMap = new Map<string, { paperId: string; maxMarks: number }[]>();
  for (const s of SUBJECTS) {
    const sid = subjectByCode.get(s.code)!;
    const defs = multiPaperSubjects[s.code];
    if (defs) {
      const papers: { paperId: string; maxMarks: number }[] = [];
      for (let i = 0; i < defs.length; i++) {
        const p = await prisma.paper.create({
          data: {
            schoolId:    school.id,
            frameworkId: framework844.id,
            subjectId:   sid,
            name:        defs[i].name,
            maxMarks:    defs[i].maxMarks,
            sortOrder:   i,
          },
        });
        papers.push({ paperId: p.id, maxMarks: defs[i].maxMarks });
      }
      paperMap.set(sid, papers);
    } else {
      // Single-paper subject: create one default paper so all items go through
      // the same path (paperId always set, never null for 8-4-4 items).
      const p = await prisma.paper.create({
        data: {
          schoolId:    school.id,
          frameworkId: framework844.id,
          subjectId:   sid,
          name:        "Paper 1",
          maxMarks:    100,
          sortOrder:   0,
        },
      });
      paperMap.set(sid, [{ paperId: p.id, maxMarks: 100 }]);
    }
  }

  // --- AssessmentItems (numeric scores) for the two completed periods --------------
  // teacher who entered items: the class's assigned teacher for that subject
  const cstByClass = new Map<string, Map<string, string>>(); // classId -> subjectId -> teacherId
  for (const c of classRows) {
    const m = new Map<string, string>();
    for (const l of lessonsByClass.get(c.id)!) m.set(l.subjectId, l.teacherId);
    cstByClass.set(c.id, m);
  }

  for (const period of periodRows.filter((p) => p.withItems)) {
    const itemRows: {
      schoolId: string; frameworkId: string; periodId: string;
      studentId: string; enteredById: string | undefined;
      resultKind: "NUMERIC"; numericScore: number;
      subjectId: string; paperId: string;
    }[] = [];

    for (const c of classRows) {
      for (const s of studentsByClass.get(c.id)!) {
        for (const l of lessonsByClass.get(c.id)!) {
          const papers = paperMap.get(l.subjectId)!;
          for (const paper of papers) {
            const raw = Math.min(paper.maxMarks, Math.max(0,
              (s.ability / 100) * paper.maxMarks + randInt(-15, 15)
            ));
            itemRows.push({
              schoolId:    school.id,
              frameworkId: framework844.id,
              periodId:    period.id,
              studentId:   s.id,
              enteredById: cstByClass.get(c.id)?.get(l.subjectId),
              resultKind:  "NUMERIC",
              numericScore: Math.round(raw * 10) / 10,
              subjectId:   l.subjectId,
              paperId:     paper.paperId,
            });
          }
        }
      }
    }
    await prisma.assessmentItem.createMany({ data: itemRows, skipDuplicates: true });
    console.log(`  ${period.name}: ${itemRows.length} assessment items`);
  }

  // --- Assessment roles: grant each class teacher CLASS_TEACHER scope ----------
  console.log("Seeding assessment roles...");
  for (const c of CLASSES) {
    const teacherId = teacherByStaffId.get(c.classTeacher)!;
    await prisma.assessmentRole.create({
      data: {
        schoolId:    school.id,
        frameworkId: framework844.id,
        teacherId,
        role:        "CLASS_TEACHER",
        // no scope FK — CLASS_TEACHER role is class-wide; scope enforcement
        // is done at query time via SchoolClass.classTeacherId.
      },
    });
  }

  // HOD roles: one EXAM_OFFICER per department head.
  for (const t of TEACHERS.filter((t) => t.headOf)) {
    const teacherId = teacherByStaffId.get(t.staffId)!;
    await prisma.assessmentRole.create({
      data: {
        schoolId:    school.id,
        frameworkId: framework844.id,
        teacherId,
        role:        "HOD",
        // no subject scope for HOD at seed time; can be narrowed later.
      },
    });
  }

  // --- Done ------------------------------------------------------------------
  console.log(`
==========================================================
 Demo institution seeded: ${SCHOOL_NAME}
==========================================================
 All accounts share the password: ${PASSWORD}

 PRINCIPAL
   principal@${EMAIL_DOMAIN}

 ADMIN STAFF
   deputy@${EMAIL_DOMAIN}      (Deputy Principal - manages most modules)
   registrar@${EMAIL_DOMAIN}   (Registrar - manages students)
   bursar@${EMAIL_DOMAIN}      (Bursar - read-only students/reports)

 TEACHERS (all 18 have logins; a few examples)
   david.otieno@${EMAIL_DOMAIN}     (Maths, HoD, class teacher Form 1 East)
   peter.kamau@${EMAIL_DOMAIN}      (English, HoD, class teacher Form 1 West)
   sarah.njeri@${EMAIL_DOMAIN}      (Biology, HoD, class teacher Form 2 West)
   esther.moraa@${EMAIL_DOMAIN}     (Chemistry, class teacher Form 3 East)
==========================================================
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
