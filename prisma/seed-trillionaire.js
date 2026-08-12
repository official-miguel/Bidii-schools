/**
 * Plain Node.js seed for trillionairedesigns.ke@gmail.com
 * No ts-node — runs directly with: node prisma/seed-trillionaire.js
 *
 * Requires DATABASE_URL to be set in the environment (or in a .env file).
 */

const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

// ── PRNG ─────────────────────────────────────────────────────────────────────
let _s = 7;
const rand = () => { _s = (_s * 1103515245 + 12345) % 2147483648; return _s / 2147483648; };
const ri = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (a) => a[Math.floor(rand() * a.length)];

// ── Static data ───────────────────────────────────────────────────────────────
const DEPTS = ["Mathematics","Languages","Sciences","Humanities","Technical & Applied"];

const SUBJECTS = [
  { name:"Mathematics",          code:"MAT",  dept:"Mathematics",         type:"CORE",     forms:[1,2,3,4], lpw:6 },
  { name:"English",              code:"ENG",  dept:"Languages",           type:"CORE",     forms:[1,2,3,4], lpw:6 },
  { name:"Kiswahili",            code:"KIS",  dept:"Languages",           type:"CORE",     forms:[1,2,3,4], lpw:5 },
  { name:"Biology",              code:"BIO",  dept:"Sciences",            type:"CORE",     forms:[1,2,3,4], lpw:4, dbl:true, room:"Biology Lab" },
  { name:"Chemistry",            code:"CHE",  dept:"Sciences",            type:"CORE",     forms:[1,2,3,4], lpw:4, dbl:true, room:"Chemistry Lab" },
  { name:"Physics",              code:"PHY",  dept:"Sciences",            type:"CORE",     forms:[1,2,3,4], lpw:4, dbl:true, room:"Physics Lab" },
  { name:"History & Government", code:"HIS",  dept:"Humanities",          type:"CORE",     forms:[1,2,3,4], lpw:3 },
  { name:"Geography",            code:"GEO",  dept:"Humanities",          type:"CORE",     forms:[1,2,3,4], lpw:3 },
  { name:"CRE",                  code:"CRE",  dept:"Humanities",          type:"CORE",     forms:[1,2],     lpw:2 },
  { name:"Agriculture",          code:"AGR",  dept:"Technical & Applied", type:"CORE",     forms:[1,2],     lpw:2 },
  { name:"Business Studies",     code:"BST",  dept:"Technical & Applied", type:"ELECTIVE", forms:[3,4],     lpw:2 },
  { name:"Computer Studies",     code:"COMP", dept:"Technical & Applied", type:"ELECTIVE", forms:[3,4],     lpw:2, room:"Computer Lab" },
];

const TEACHERS = [
  { sid:"T01",  name:"David Otieno",        dept:"Mathematics",         subs:["MAT"], hod:"Mathematics" },
  { sid:"T02",  name:"Grace Wanjiku",        dept:"Mathematics",         subs:["MAT"] },
  { sid:"T03",  name:"Allan Korir",          dept:"Mathematics",         subs:["MAT"] },
  { sid:"T04",  name:"Stella Muema",         dept:"Mathematics",         subs:["MAT"] },
  { sid:"T05",  name:"Emmanuel Were",        dept:"Mathematics",         subs:["MAT"] },
  { sid:"T06",  name:"Peter Kamau",          dept:"Languages",           subs:["ENG"], hod:"Languages" },
  { sid:"T07",  name:"Mercy Achieng",        dept:"Languages",           subs:["ENG"] },
  { sid:"T08",  name:"James Njogu",          dept:"Languages",           subs:["ENG"] },
  { sid:"T09",  name:"Amina Hassan",         dept:"Languages",           subs:["KIS"] },
  { sid:"T10",  name:"Joseph Mwangi",        dept:"Languages",           subs:["KIS"] },
  { sid:"T11",  name:"Sarah Njeri",          dept:"Sciences",            subs:["BIO"], hod:"Sciences" },
  { sid:"T12",  name:"Daniel Kiptoo",        dept:"Sciences",            subs:["BIO"] },
  { sid:"T13",  name:"Wycliffe Opiyo",       dept:"Sciences",            subs:["BIO"] },
  { sid:"T14",  name:"Esther Moraa",         dept:"Sciences",            subs:["CHE"] },
  { sid:"T15",  name:"Samuel Ndegwa",        dept:"Sciences",            subs:["CHE"] },
  { sid:"T16",  name:"Florence Waweru",      dept:"Sciences",            subs:["CHE"] },
  { sid:"T17",  name:"Lucy Wambui",          dept:"Sciences",            subs:["PHY"] },
  { sid:"T18",  name:"Brian Ochieng",        dept:"Sciences",            subs:["PHY"] },
  { sid:"T19",  name:"Victor Sang",          dept:"Sciences",            subs:["PHY"] },
  { sid:"T20",  name:"Rose Chebet",          dept:"Humanities",          subs:["HIS"], hod:"Humanities" },
  { sid:"T21",  name:"John Maina",           dept:"Humanities",          subs:["HIS"] },
  { sid:"T22",  name:"Hilda Oduya",          dept:"Humanities",          subs:["GEO"] },
  { sid:"T23",  name:"Patrick Githinji",     dept:"Humanities",          subs:["GEO"] },
  { sid:"T24",  name:"Faith Nyambura",       dept:"Humanities",          subs:["CRE"] },
  { sid:"T25",  name:"George Barasa",        dept:"Technical & Applied", subs:["AGR"], hod:"Technical & Applied" },
  { sid:"T26",  name:"Caroline Chebet",      dept:"Technical & Applied", subs:["AGR"] },
  { sid:"T27",  name:"Nancy Akinyi",         dept:"Technical & Applied", subs:["BST"] },
  { sid:"T28",  name:"Michael Bett",         dept:"Technical & Applied", subs:["BST"] },
  { sid:"T29",  name:"Kevin Mutua",          dept:"Technical & Applied", subs:["COMP"] },
  { sid:"T30",  name:"Irene Jepchirchir",    dept:"Technical & Applied", subs:["COMP"] },
];

const STREAMS = ["East","West","North","South"];
const CT_SIDS  = ["T01","T06","T09","T11","T14","T17","T20","T22","T23","T24","T25","T27","T28","T29","T30","T02"];

const MULTI_PAPER = {
  ENG:  [{name:"Paper 1 (Comprehension)", mm:40},{name:"Paper 2 (Composition)", mm:60}],
  MAT:  [{name:"Paper 1", mm:50},{name:"Paper 2", mm:50}],
};

const FNAMES = ["Brian","Kevin","Dennis","Victor","Collins","Ian","Felix","Elvis","Mercy","Faith",
  "Cynthia","Sharon","Diana","Naomi","Joy","Purity","Emmanuel","Moses","Caleb","Gideon",
  "Abigael","Valentine","Sylvia","Linet","Winnie","Kelvin","Stephen","Alice","Beatrice","Clinton",
  "Ruth","Esther","Lydia","Samuel","Philip","Daniel","Joshua","Miriam","Hannah","Charity","Eunice"];
const LNAMES = ["Omondi","Wafula","Kiprop","Mwende","Njoroge","Otieno","Wanjiru","Chepkemoi","Mutiso",
  "Ouma","Karanja","Cheruiyot","Adhiambo","Gitau","Nafula","Kilonzo","Auma","Rotich","Muthoni",
  "Onyango","Wekesa","Kemboi","Achieng","Kariuki","Jelagat","Musyoka","Simiyu","Abuya","Barasa","Kigen"];
const TITLES = ["Mr.","Mrs.","Dr.","Eng.","Rev."];

async function main() {
  console.log("═══ Seed: trillionairedesigns.ke@gmail.com ═══\n");

  const principalUser = await p.user.findUnique({
    where: { email: "trillionairedesigns.ke@gmail.com" },
    include: { school: true },
  });
  if (!principalUser) { console.error("Account not found."); process.exit(1); }
  const s   = principalUser.schoolId;
  const schoolName = principalUser.school.name;
  console.log(`School: ${schoolName}  (${s})\n`);

  // ── Clear existing data ────────────────────────────────────────────────────
  console.log("Clearing old data...");
  await p.assessmentItem.deleteMany({ where: { schoolId: s } }); console.log("  items cleared");
  await p.assessmentRole.deleteMany({ where: { schoolId: s } }); console.log("  roles cleared");
  await p.assessmentPeriod.deleteMany({ where: { schoolId: s } }); console.log("  periods cleared");
  await p.paper.deleteMany({ where: { schoolId: s } }); console.log("  papers cleared");
  await p.assessmentFramework.deleteMany({ where: { schoolId: s } }); console.log("  frameworks cleared");
  await p.rankingConfig.deleteMany({ where: { schoolId: s } }); console.log("  rankingConfig cleared");
  await p.timetableSlot.deleteMany({ where: { schoolId: s } }); console.log("  timetableSlots cleared");

  // ClassSubjectTeacher has no schoolId — delete via class IDs
  const existingClassIds = await p.schoolClass.findMany({ where: { schoolId: s }, select: { id: true } }).then(r => r.map(x => x.id));
  if (existingClassIds.length > 0) {
    await p.classSubjectTeacher.deleteMany({ where: { classId: { in: existingClassIds } } });
    console.log("  classSubjectTeachers cleared");
  }

  // StudentElective — via student IDs
  const existingStudentIds = await p.student.findMany({ where: { schoolId: s }, select: { id: true } }).then(r => r.map(x => x.id));
  if (existingStudentIds.length > 0) {
    await p.studentElective.deleteMany({ where: { studentId: { in: existingStudentIds } } });
    console.log("  studentElectives cleared");
  }

  await p.student.deleteMany({ where: { schoolId: s } }); console.log("  students cleared");
  await p.schoolClass.deleteMany({ where: { schoolId: s } }); console.log("  classes cleared");

  // Teachers → get their userIds, delete teachers then users
  const teacherUserIds = await p.teacher.findMany({ where: { schoolId: s }, select: { userId: true } })
    .then(r => r.map(x => x.userId).filter(id => id != null));
  await p.teacher.deleteMany({ where: { schoolId: s } });
  if (teacherUserIds.length > 0) await p.user.deleteMany({ where: { id: { in: teacherUserIds } } });
  console.log("  teachers cleared");

  await p.subject.deleteMany({ where: { schoolId: s } }); console.log("  subjects cleared");
  await p.department.deleteMany({ where: { schoolId: s } }); console.log("  departments cleared\n");

  // ── Departments ────────────────────────────────────────────────────────────
  const deptId = new Map();
  for (const name of DEPTS) {
    const d = await p.department.create({ data: { schoolId: s, name } });
    deptId.set(name, d.id);
  }
  console.log(`Departments: ${DEPTS.length}`);

  // ── Subjects ───────────────────────────────────────────────────────────────
  const subId = new Map();
  for (const sub of SUBJECTS) {
    const row = await p.subject.create({
      data: {
        schoolId: s, name: sub.name, code: sub.code, type: sub.type,
        departmentId: deptId.get(sub.dept),
        applicableForms: sub.forms, lessonsPerWeek: sub.lpw,
        doubleLesson: sub.dbl ?? false, requiresSpecialRoom: sub.room ?? null,
      },
    });
    subId.set(sub.code, row.id);
  }
  console.log(`Subjects: ${SUBJECTS.length}`);

  // ── Teachers ───────────────────────────────────────────────────────────────
  const teacherId = new Map();
  for (const t of TEACHERS) {
    const email = `${t.name.toLowerCase().replace(/[^a-z]+/g,".")}@trillionaire.school`;
    const user = await p.user.create({
      data: {
        schoolId: s, email,
        passwordHash: "$2b$12$demohashfortrillionaireteachersXXXXXXXXXXXXXXXXXXXXXXXX",
        role: "TEACHER", mustChangePassword: false,
      },
    });
    const teacher = await p.teacher.create({
      data: {
        schoolId: s, userId: user.id, staffId: t.sid, fullName: t.name, email,
        phone: `+254 7${ri(10,39)} ${ri(100,999)} ${ri(100,999)}`,
        primaryDepartmentId: deptId.get(t.dept),
        teacherSubjects: { create: t.subs.map(c => ({ subjectId: subId.get(c) })) },
      },
    });
    teacherId.set(t.sid, teacher.id);
  }
  for (const t of TEACHERS.filter(t => t.hod)) {
    await p.department.update({ where: { id: deptId.get(t.hod) }, data: { headTeacherId: teacherId.get(t.sid) } });
  }
  console.log(`Teachers: ${TEACHERS.length}`);

  // ── Classes ────────────────────────────────────────────────────────────────
  const classes = [];
  let ctIdx = 0;
  for (let form = 1; form <= 4; form++) {
    for (const stream of STREAMS) {
      const row = await p.schoolClass.create({
        data: { schoolId: s, name: `Form ${form} ${stream}`, form, stream, classTeacherId: teacherId.get(CT_SIDS[ctIdx++]) },
      });
      classes.push({ id: row.id, name: row.name, form, stream });
    }
  }
  console.log(`Classes: ${classes.length}`);

  // ── Subject-teacher pools & CST links ─────────────────────────────────────
  const pool = new Map();
  for (const t of TEACHERS) {
    for (const c of t.subs) { const a = pool.get(c) ?? []; a.push(teacherId.get(t.sid)); pool.set(c, a); }
  }
  const lessonsByClass = new Map();
  const cstRows = [];
  for (let ci = 0; ci < classes.length; ci++) {
    const c = classes[ci];
    const lessons = [];
    for (const sub of SUBJECTS) {
      if (!sub.forms.includes(c.form)) continue;
      const teachers = pool.get(sub.code);
      const tid = teachers[ci % teachers.length];
      lessons.push({ subjectId: subId.get(sub.code), teacherId: tid, code: sub.code });
      cstRows.push({ classId: c.id, subjectId: subId.get(sub.code), teacherId: tid });
    }
    lessonsByClass.set(c.id, lessons);
  }
  await p.classSubjectTeacher.createMany({ data: cstRows, skipDuplicates: true });
  console.log(`Class-Subject-Teacher links: ${cstRows.length}`);

  // ── Students: build all data → createMany → fetch IDs back ───────────────
  console.log("\nBuilding 640 student records...");
  let admNo = 1;
  const studentSeeds = []; // {admissionNumber, classId, form, ability, ...}
  for (const c of classes) {
    for (let i = 0; i < 40; i++) {
      const fn = pick(FNAMES); const ln = pick(LNAMES);
      const yob = 2026 - (13 + c.form) - ri(0, 1);
      studentSeeds.push({
        admissionNumber: `TRL${String(admNo++).padStart(4,"0")}`,
        fullName: `${fn} ${ln}`, classId: c.id,
        dateOfBirth: new Date(Date.UTC(yob, ri(0,11), ri(1,28))),
        parentName: `${pick(TITLES)} ${pick(FNAMES)} ${ln}`,
        parentContact: `+254 7${ri(10,39)} ${ri(100,999)} ${ri(100,999)}`,
        ability: ri(25, 90),
      });
    }
  }

  await p.student.createMany({
    data: studentSeeds.map(s2 => ({
      schoolId: s, classId: s2.classId,
      admissionNumber: s2.admissionNumber, fullName: s2.fullName,
      dateOfBirth: s2.dateOfBirth, parentName: s2.parentName, parentContact: s2.parentContact,
    })),
    skipDuplicates: true,
  });

  const allStudents = await p.student.findMany({ where: { schoolId: s }, select: { id: true, admissionNumber: true, classId: true } });
  const admAbility = new Map(studentSeeds.map(s2 => [s2.admissionNumber, s2.ability]));
  const studentsByClass = new Map();
  for (const st of allStudents) {
    const list = studentsByClass.get(st.classId) ?? [];
    list.push({ id: st.id, ability: admAbility.get(st.admissionNumber) ?? 55 });
    studentsByClass.set(st.classId, list);
  }
  console.log(`Students created: ${allStudents.length}`);

  // Electives for F3-F4
  const electiveRows = [];
  for (const c of classes.filter(c => c.form >= 3)) {
    for (const st of (studentsByClass.get(c.id) ?? [])) {
      const codes = rand() < 0.6 ? ["BST","COMP"] : [pick(["BST","COMP"])];
      for (const code of codes) electiveRows.push({ studentId: st.id, subjectId: subId.get(code) });
    }
  }
  await p.studentElective.createMany({ data: electiveRows, skipDuplicates: true });
  console.log(`Elective links: ${electiveRows.length}`);

  // ── Assessment framework + periods ─────────────────────────────────────────
  const framework = await p.assessmentFramework.create({
    data: { schoolId: s, type: "EIGHT_FOUR_FOUR", label: "KCSE 2026", academicYear: "2026", isActive: true },
  });

  const PERIOD_DEFS = [
    { name:"Term 1 Opener",   term:1, weight:0.3, maxMarks:100, isCurrent:false, withItems:true  },
    { name:"Term 1 End Term", term:1, weight:0.7, maxMarks:100, isCurrent:false, withItems:true  },
    { name:"Term 2 Midterm",  term:2, weight:0.5, maxMarks:100, isCurrent:true,  withItems:false },
  ];
  const periods = [];
  for (const pd of PERIOD_DEFS) {
    const row = await p.assessmentPeriod.create({
      data: { schoolId: s, frameworkId: framework.id, name: pd.name, academicYear: "2026", term: pd.term, weight: pd.weight, maxMarks: pd.maxMarks, isCurrent: pd.isCurrent },
    });
    periods.push({ id: row.id, name: pd.name, withItems: pd.withItems });
  }
  console.log(`\nPeriods: ${periods.map(p=>p.name).join(", ")}`);

  // ── Papers ─────────────────────────────────────────────────────────────────
  const paperMap = new Map(); // subjectId -> [{paperId, mm}]
  for (const sub of SUBJECTS) {
    const sid2 = subId.get(sub.code);
    const defs = MULTI_PAPER[sub.code];
    if (defs) {
      const papers = [];
      for (let i = 0; i < defs.length; i++) {
        const row = await p.paper.create({
          data: { schoolId: s, frameworkId: framework.id, subjectId: sid2, name: defs[i].name, maxMarks: defs[i].mm, sortOrder: i },
        });
        papers.push({ paperId: row.id, mm: defs[i].mm });
      }
      paperMap.set(sid2, papers);
    } else {
      const row = await p.paper.create({
        data: { schoolId: s, frameworkId: framework.id, subjectId: sid2, name: "Paper 1", maxMarks: 100, sortOrder: 0 },
      });
      paperMap.set(sid2, [{ paperId: row.id, mm: 100 }]);
    }
  }
  console.log(`Papers: ${[...paperMap.values()].flat().length}`);

  // ── Assessment items for completed periods ─────────────────────────────────
  const BATCH = 1000;
  for (const period of periods.filter(pd => pd.withItems)) {
    const bias = period.name.includes("Opener") ? -5 : 0;
    const rows = [];
    for (const c of classes) {
      const students = studentsByClass.get(c.id) ?? [];
      const lessons  = lessonsByClass.get(c.id) ?? [];
      for (const st of students) {
        for (const l of lessons) {
          for (const paper of (paperMap.get(l.subjectId) ?? [])) {
            const raw = Math.min(paper.mm, Math.max(0, (st.ability / 100) * paper.mm + bias + ri(-18, 18)));
            rows.push({
              schoolId: s, frameworkId: framework.id,
              periodId: period.id, studentId: st.id,
              enteredById: l.teacherId,
              resultKind: "NUMERIC",
              numericScore: Math.round(raw * 10) / 10,
              subjectId: l.subjectId, paperId: paper.paperId,
            });
          }
        }
      }
    }
    console.log(`\nInserting ${rows.length} items for "${period.name}"...`);
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      await p.assessmentItem.createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
      done += Math.min(BATCH, rows.length - i);
      process.stdout.write(`\r  ${done}/${rows.length}`);
    }
    console.log(`\n  ✓ Done.`);
  }

  // ── Assessment roles ────────────────────────────────────────────────────────
  const roleRows = [];
  for (let i = 0; i < classes.length; i++)
    roleRows.push({ schoolId: s, frameworkId: framework.id, teacherId: teacherId.get(CT_SIDS[i]), role: "CLASS_TEACHER" });
  for (const t of TEACHERS.filter(t => t.hod))
    roleRows.push({ schoolId: s, frameworkId: framework.id, teacherId: teacherId.get(t.sid), role: "HOD" });
  await p.assessmentRole.createMany({ data: roleRows, skipDuplicates: true });
  console.log(`\nAssessment roles: ${roleRows.length}`);

  // ── RankingConfig ───────────────────────────────────────────────────────────
  await p.rankingConfig.upsert({
    where:  { schoolId: s },
    create: { schoolId: s, improvementWeight: 0.4, completionWeight: 0.3, absoluteWeight: 0.3, meanFlagThreshold: 5.0 },
    update: { improvementWeight: 0.4, completionWeight: 0.3, absoluteWeight: 0.3, meanFlagThreshold: 5.0 },
  });

  console.log(`
═══════════════════════════════════════════════════════
 Seed complete!
 School   : ${schoolName}
 Classes  : ${classes.length} (Forms 1-4, East/West/North/South)
 Students : ${allStudents.length}
 Teachers : ${TEACHERS.length}
 Framework: 8-4-4 KCSE 2026
 Periods  :
   [✓] Term 1 Opener   — marks entered
   [✓] Term 1 End Term — marks entered
   [ ] Term 2 Midterm  — current, no marks yet
 Mean flag threshold: 5.0 grade points
═══════════════════════════════════════════════════════
`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
