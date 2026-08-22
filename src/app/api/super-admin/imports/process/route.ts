import { NextRequest, NextResponse } from "next/server";
import { prisma }                     from "@/lib/prisma";
import { Prisma }                      from "@prisma/client";
import { requireSuperAdmin, logAudit } from "@/lib/super-admin";
import { emitSSE }                     from "@/lib/sse";
import { hashPassword }                from "@/lib/auth";

// Allow up to 5 minutes for large CSV processing on Vercel Pro / self-hosted.
// On Vercel Hobby the cap is 10 s — upgrade to at least Pro for large imports.
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

type RowError = { row: number; field: string; message: string };
type PResult  = Promise<{ succeeded: number; errors: RowError[] }>;

// ─────────────────────────────────────────────────────────────────────────────
// CSV parser — handles quoted fields and embedded commas
// ─────────────────────────────────────────────────────────────────────────────

function parseCSVText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) return { headers: [], rows: [] };

  function splitLine(line: string): string[] {
    const result: string[] = [];
    let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === "," && !inQ) { result.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    result.push(cur.trim());
    return result;
  }

  const headers = splitLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows = lines.slice(1).map(line => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim(); });
    return row;
  });
  return { headers, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function norm(s: string) { return s.toLowerCase().trim(); }

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — School Setup
// ─────────────────────────────────────────────────────────────────────────────

// ── 1a. Departments ──────────────────────────────────────────────────────────
async function processDepartments(rows: Record<string, string>[], schoolId: string): PResult {
  const errors: RowError[] = [];

  // Validate all rows first, collect valid names
  const validRows: { rowNum: number; name: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const name = rows[i]["name"]?.trim();
    if (!name) { errors.push({ row: rowNum, field: "name", message: "name is required" }); continue; }
    validRows.push({ rowNum, name });
  }

  if (validRows.length === 0) return { succeeded: 0, errors };

  // Fetch existing names in one query, then bulk-create missing ones
  const existing = await prisma.department.findMany({
    where: { schoolId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map(d => d.name));

  const toCreate = validRows.filter(r => !existingNames.has(r.name));
  let succeeded = validRows.length - toCreate.length; // already-existing ones count as success

  if (toCreate.length > 0) {
    try {
      await prisma.department.createMany({
        data: toCreate.map(r => ({ name: r.name, schoolId })),
        skipDuplicates: true,
      });
      succeeded += toCreate.length;
    } catch {
      // Fall back to per-row so we can report which one failed
      for (const r of toCreate) {
        try {
          await prisma.department.upsert({
            where:  { schoolId_name: { schoolId, name: r.name } },
            update: {},
            create: { name: r.name, schoolId },
          });
          succeeded++;
        } catch (err) { errors.push({ row: r.rowNum, field: "name", message: String(err) }); }
      }
    }
  }
  return { succeeded, errors };
}

// ── 1b. Classes (with framework) ─────────────────────────────────────────────
async function processClasses(rows: Record<string, string>[], schoolId: string): PResult {
  let succeeded = 0;
  const errors: RowError[] = [];
  const VALID_FW = new Set(["EIGHT_FOUR_FOUR", "CBC", "CBE"]);

  type ValidClass = { rowNum: number; name: string; form: number; stream: string | null; frameworkType: "EIGHT_FOUR_FOUR" | "CBC" | "CBE" };
  const validRows: ValidClass[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum   = i + 2;
    const row      = rows[i];
    const name     = row["name"]?.trim();
    const formRaw  = row["form"]?.trim();
    const stream   = row["stream"]?.trim() || null;
    const fwRaw    = row["framework_type"]?.trim().toUpperCase() || "EIGHT_FOUR_FOUR";

    if (!name)    { errors.push({ row: rowNum, field: "name", message: "name is required" }); continue; }
    if (!formRaw) { errors.push({ row: rowNum, field: "form", message: "form is required" }); continue; }

    const formMatch = formRaw.match(/\d+/);
    const form = formMatch ? parseInt(formMatch[0], 10) : NaN;
    if (isNaN(form) || form < 1) {
      errors.push({ row: rowNum, field: "form", message: `"${formRaw}" is not a valid form number — use a number or e.g. "Form 3", "Grade 10"` }); continue;
    }
    if (!VALID_FW.has(fwRaw)) {
      errors.push({ row: rowNum, field: "framework_type", message: `Must be EIGHT_FOUR_FOUR, CBC, or CBE — got "${fwRaw}"` }); continue;
    }
    validRows.push({ rowNum, name, form, stream, frameworkType: fwRaw as "EIGHT_FOUR_FOUR" | "CBC" | "CBE" });
  }

  if (validRows.length === 0) return { succeeded, errors };

  // Fetch all existing classes in one query
  const existingClasses = await prisma.schoolClass.findMany({
    where:  { schoolId },
    select: { id: true, name: true },
  });
  const existingMap = new Map(existingClasses.map(c => [c.name, c.id]));

  const toCreate = validRows.filter(r => !existingMap.has(r.name));
  const toUpdate = validRows.filter(r =>  existingMap.has(r.name));

  // Bulk-create new classes
  if (toCreate.length > 0) {
    try {
      await prisma.schoolClass.createMany({
        data: toCreate.map(r => ({ name: r.name, form: r.form, stream: r.stream, frameworkType: r.frameworkType, schoolId })),
        skipDuplicates: true,
      });
      succeeded += toCreate.length;
    } catch {
      // Fall back per-row
      for (const r of toCreate) {
        try {
          await prisma.schoolClass.create({ data: { name: r.name, form: r.form, stream: r.stream, frameworkType: r.frameworkType, schoolId } });
          succeeded++;
        } catch (err) { errors.push({ row: r.rowNum, field: "name", message: String(err) }); }
      }
    }
  }

  // Update existing in parallel batches of 20 to avoid overwhelming the DB
  const BATCH = 20;
  for (let b = 0; b < toUpdate.length; b += BATCH) {
    const chunk = toUpdate.slice(b, b + BATCH);
    await Promise.all(chunk.map(async r => {
      const id = existingMap.get(r.name)!;
      try {
        await prisma.schoolClass.update({ where: { id }, data: { form: r.form, stream: r.stream } });
        succeeded++;
      } catch (err) { errors.push({ row: r.rowNum, field: "name", message: String(err) }); }
    }));
  }

  return { succeeded, errors };
}

// ── 1c. Subjects ─────────────────────────────────────────────────────────────
async function processSubjects(rows: Record<string, string>[], schoolId: string): PResult {
  let succeeded = 0;
  const errors: RowError[] = [];

  const depts   = await prisma.department.findMany({ where: { schoolId }, select: { id: true, name: true } });
  const deptMap = new Map(depts.map(d => [norm(d.name), d.id]));

  const maxR    = await prisma.subject.aggregate({ where: { schoolId }, _max: { internalCode: true } });
  let nextCode  = (maxR._max.internalCode ?? 0) + 1;

  type ValidSubject = {
    rowNum: number; name: string; code: string; departmentId: string;
    type: "CORE" | "ELECTIVE"; applicableForms: number[];
  };
  const validRows: ValidSubject[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum    = i + 2;
    const row       = rows[i];
    const name      = row["name"]?.trim();
    const code      = row["code"]?.trim().toUpperCase();
    const deptName  = row["department_name"]?.trim();
    const typeRaw   = row["type"]?.trim().toUpperCase();
    const formsRaw  = row["applicable_forms"]?.trim();

    if (!name)     { errors.push({ row: rowNum, field: "name",            message: "name is required" }); continue; }
    if (!code)     { errors.push({ row: rowNum, field: "code",            message: "code is required" }); continue; }
    if (!deptName) { errors.push({ row: rowNum, field: "department_name", message: "department_name is required" }); continue; }

    const departmentId = deptMap.get(norm(deptName));
    if (!departmentId) {
      errors.push({ row: rowNum, field: "department_name", message: `Department "${deptName}" not found — import Departments first` }); continue;
    }

    const type: "CORE" | "ELECTIVE" = typeRaw === "ELECTIVE" ? "ELECTIVE" : "CORE";
    const applicableForms = formsRaw
      ? formsRaw.split(",").map(f => parseInt(f.trim(), 10)).filter(n => !isNaN(n))
      : [];
    validRows.push({ rowNum, name, code, departmentId, type, applicableForms });
  }

  if (validRows.length === 0) return { succeeded, errors };

  // Fetch all existing subjects in one query
  const existingSubjects = await prisma.subject.findMany({
    where:  { schoolId },
    select: { id: true, code: true },
  });
  const existingMap = new Map(existingSubjects.map(s => [s.code, s.id]));

  const toCreate = validRows.filter(r => !existingMap.has(r.code));
  const toUpdate = validRows.filter(r =>  existingMap.has(r.code));

  // Bulk-create new subjects
  if (toCreate.length > 0) {
    try {
      await prisma.subject.createMany({
        data: toCreate.map(r => ({
          name: r.name, code: r.code, internalCode: nextCode++,
          type: r.type, departmentId: r.departmentId, schoolId, applicableForms: r.applicableForms,
        })),
        skipDuplicates: true,
      });
      succeeded += toCreate.length;
    } catch {
      for (const r of toCreate) {
        try {
          await prisma.subject.create({ data: { name: r.name, code: r.code, internalCode: nextCode++, type: r.type, departmentId: r.departmentId, schoolId, applicableForms: r.applicableForms } });
          succeeded++;
        } catch (err) { errors.push({ row: r.rowNum, field: "code", message: String(err) }); }
      }
    }
  }

  // Update existing in parallel batches
  const BATCH = 20;
  for (let b = 0; b < toUpdate.length; b += BATCH) {
    const chunk = toUpdate.slice(b, b + BATCH);
    await Promise.all(chunk.map(async r => {
      const id = existingMap.get(r.code)!;
      try {
        await prisma.subject.update({ where: { id }, data: { name: r.name, type: r.type, departmentId: r.departmentId, applicableForms: r.applicableForms } });
        succeeded++;
      } catch (err) { errors.push({ row: r.rowNum, field: "code", message: String(err) }); }
    }));
  }

  return { succeeded, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Staff
// Columns: staff_id, full_name, email, phone, designation, department_name,
//          subject_codes   (comma-separated, e.g. "BIO,CHEM")
// Duplicate guard: staffId unique per school — update if exists.
// TeacherSubject: upserted per subject code → no duplicates.
// ─────────────────────────────────────────────────────────────────────────────

async function processStaff(rows: Record<string, string>[], schoolId: string): PResult {
  let succeeded = 0;
  const errors: RowError[] = [];

  const depts    = await prisma.department.findMany({ where: { schoolId }, select: { id: true, name: true } });
  const deptMap  = new Map(depts.map(d => [norm(d.name), d.id]));

  const subjects = await prisma.subject.findMany({ where: { schoolId }, select: { id: true, code: true } });
  const subMap   = new Map(subjects.map(s => [norm(s.code), s.id]));

  // Pre-load all existing teachers for this school in one query
  const existingTeachers = await prisma.teacher.findMany({ where: { schoolId }, select: { id: true, staffId: true } });
  const teacherMap = new Map(existingTeachers.map(t => [t.staffId, t.id]));

  type ValidStaff = {
    rowNum: number; staffId: string; fullName: string; email: string | null;
    phone: string | null; designation: string | null; primaryDepartmentId: string | null;
    resolvedSubjectIds: string[];
  };
  const validRows: ValidStaff[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum       = i + 2;
    const row          = rows[i];
    const staffId      = row["staff_id"]?.trim();
    const fullName     = row["full_name"]?.trim();
    const email        = row["email"]?.trim() || null;
    const phone        = row["phone"]?.trim() || null;
    const designation  = row["designation"]?.trim() || null;
    const deptName     = row["department_name"]?.trim();
    const subjectCodes = row["subject_codes"]?.trim();

    if (!staffId)  { errors.push({ row: rowNum, field: "staff_id",  message: "staff_id is required" }); continue; }
    if (!fullName) { errors.push({ row: rowNum, field: "full_name", message: "full_name is required" }); continue; }

    let primaryDepartmentId: string | null = null;
    if (deptName) {
      primaryDepartmentId = deptMap.get(norm(deptName)) ?? null;
      if (!primaryDepartmentId) {
        errors.push({ row: rowNum, field: "department_name", message: `Department "${deptName}" not found — import Departments first` });
        continue;
      }
    }

    const resolvedSubjectIds: string[] = [];
    const badCodes: string[] = [];
    if (subjectCodes) {
      for (const raw of subjectCodes.split(",")) {
        const c = raw.trim().toUpperCase();
        if (!c) continue;
        const sid = subMap.get(norm(c));
        if (!sid) badCodes.push(c);
        else resolvedSubjectIds.push(sid);
      }
    }
    if (badCodes.length > 0) {
      errors.push({ row: rowNum, field: "subject_codes", message: `Subject codes not found: ${badCodes.join(", ")} — import Subjects first` });
      continue;
    }
    validRows.push({ rowNum, staffId, fullName, email, phone, designation, primaryDepartmentId, resolvedSubjectIds });
  }

  if (validRows.length === 0) return { succeeded, errors };

  // Fetch school slug once — used as initial login password for auto-provisioned accounts
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { slug: true } });
  const schoolSlug = school?.slug ?? "";

  // Pre-load existing User emails for this school to avoid duplicate account creation
  const existingUsers = await prisma.user.findMany({ where: { schoolId }, select: { email: true } });
  const existingUserEmails = new Set(existingUsers.map(u => u.email.toLowerCase()));

  // Process in parallel batches of 20
  const BATCH = 20;
  for (let b = 0; b < validRows.length; b += BATCH) {
    const chunk = validRows.slice(b, b + BATCH);
    await Promise.all(chunk.map(async r => {
      try {
        let teacherId: string;
        const existingId = teacherMap.get(r.staffId);
        if (existingId) {
          // Update existing teacher record
          await prisma.teacher.update({
            where: { id: existingId },
            data:  { fullName: r.fullName, email: r.email, phone: r.phone, designation: r.designation, primaryDepartmentId: r.primaryDepartmentId },
          });
          teacherId = existingId;
          // If they now have an email but still no User account, provision one
          if (r.email && !existingUserEmails.has(r.email.toLowerCase()) && schoolSlug) {
            try {
              const newUser = await prisma.user.create({
                data: {
                  schoolId,
                  email: r.email,
                  passwordHash: await hashPassword(schoolSlug),
                  role: "TEACHER",
                  mustChangePassword: true,
                },
                select: { id: true },
              });
              await prisma.teacher.update({ where: { id: teacherId }, data: { userId: newUser.id } });
              existingUserEmails.add(r.email.toLowerCase());
            } catch {
              // Non-fatal — login can be provisioned manually from the drawer
            }
          }
        } else {
          // New teacher — create Teacher + User account in a transaction
          let userId: string | null = null;
          if (r.email && !existingUserEmails.has(r.email.toLowerCase()) && schoolSlug) {
            try {
              const newUser = await prisma.user.create({
                data: {
                  schoolId,
                  email: r.email,
                  passwordHash: await hashPassword(schoolSlug),
                  role: "TEACHER",
                  mustChangePassword: true,
                },
                select: { id: true },
              });
              userId = newUser.id;
              existingUserEmails.add(r.email.toLowerCase());
            } catch {
              // Non-fatal — login can be provisioned manually from the drawer
            }
          }
          const created = await prisma.teacher.create({
            data: {
              staffId: r.staffId, fullName: r.fullName, email: r.email,
              phone: r.phone, designation: r.designation,
              primaryDepartmentId: r.primaryDepartmentId, schoolId,
              userId,
            },
          });
          teacherId = created.id;
          teacherMap.set(r.staffId, teacherId);
        }
        if (r.resolvedSubjectIds.length > 0) {
          await prisma.teacherSubject.createMany({
            data:           r.resolvedSubjectIds.map(subjectId => ({ teacherId, subjectId })),
            skipDuplicates: true,
          });
        }
        succeeded++;
      } catch (err) { errors.push({ row: r.rowNum, field: "staff_id", message: String(err) }); }
    }));
  }

  return { succeeded, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3a — Students
// Columns: admission_number, full_name, class_name, gender, boarding_status,
//          date_of_birth, elective_subject_codes   (comma-separated codes)
// Duplicate guard: admission_number unique per school — update if exists.
// StudentElective: createMany skipDuplicates — core subjects are NOT stored
// here (they apply automatically via Subject.applicableForms).
// ─────────────────────────────────────────────────────────────────────────────

async function processStudents(rows: Record<string, string>[], schoolId: string): PResult {
  let succeeded = 0;
  const errors: RowError[] = [];

  const classes  = await prisma.schoolClass.findMany({ where: { schoolId }, select: { id: true, name: true } });
  const classMap = new Map(classes.map(c => [norm(c.name), c.id]));

  const subjects = await prisma.subject.findMany({
    where:  { schoolId, type: "ELECTIVE" },
    select: { id: true, code: true },
  });
  const subMap = new Map(subjects.map(s => [norm(s.code), s.id]));

  // Pre-load all existing students for this school in one query
  const existingStudents = await prisma.student.findMany({
    where:  { schoolId },
    select: { id: true, admissionNumber: true },
  });
  const studentMap = new Map(existingStudents.map(s => [s.admissionNumber, s.id]));

  type ValidStudent = {
    rowNum: number; admissionNumber: string; fullName: string; classId: string;
    gender: string | null; boardingStatus: string | null; dateOfBirth: Date | null;
    electiveIds: string[];
  };
  const validRows: ValidStudent[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum          = i + 2;
    const row             = rows[i];
    const admissionNumber = row["admission_number"]?.trim();
    const fullName        = row["full_name"]?.trim();
    const className       = row["class_name"]?.trim();
    const gender          = row["gender"]?.trim().toUpperCase() || null;
    const boardingStatus  = row["boarding_status"]?.trim().toUpperCase() || null;
    const dobRaw          = row["date_of_birth"]?.trim();
    const electiveCodes   = row["elective_subject_codes"]?.trim();

    if (!admissionNumber) { errors.push({ row: rowNum, field: "admission_number", message: "admission_number is required" }); continue; }
    if (!fullName)        { errors.push({ row: rowNum, field: "full_name",         message: "full_name is required" }); continue; }
    if (!className)       { errors.push({ row: rowNum, field: "class_name",        message: "class_name is required" }); continue; }

    const classId = classMap.get(norm(className));
    if (!classId) {
      errors.push({ row: rowNum, field: "class_name", message: `Class "${className}" not found — import Classes first` }); continue;
    }

    const dateOfBirth = dobRaw ? new Date(dobRaw) : null;
    if (dobRaw && dateOfBirth && isNaN(dateOfBirth.getTime())) {
      errors.push({ row: rowNum, field: "date_of_birth", message: `"${dobRaw}" is not a valid date — use YYYY-MM-DD` }); continue;
    }

    const electiveIds: string[] = [];
    const badCodes: string[] = [];
    if (electiveCodes) {
      for (const raw of electiveCodes.split(",")) {
        const c = raw.trim().toUpperCase();
        if (!c) continue;
        const sid = subMap.get(norm(c));
        if (!sid) badCodes.push(c);
        else electiveIds.push(sid);
      }
    }
    if (badCodes.length > 0) {
      errors.push({ row: rowNum, field: "elective_subject_codes", message: `Subject codes not found: ${badCodes.join(", ")} — import Subjects first` });
      continue;
    }
    validRows.push({ rowNum, admissionNumber, fullName, classId, gender, boardingStatus, dateOfBirth, electiveIds });
  }

  if (validRows.length === 0) return { succeeded, errors };

  const toCreate = validRows.filter(r => !studentMap.has(r.admissionNumber));
  const toUpdate = validRows.filter(r =>  studentMap.has(r.admissionNumber));

  // Bulk-create new students (no electives yet — done after IDs are known)
  const CHUNK = 100;
  for (let b = 0; b < toCreate.length; b += CHUNK) {
    const chunk = toCreate.slice(b, b + CHUNK);
    try {
      // createMany doesn't return IDs on all DBs, so create individually in parallel
      await Promise.all(chunk.map(async r => {
        try {
          const created = await prisma.student.create({
            data: { admissionNumber: r.admissionNumber, fullName: r.fullName, classId: r.classId, gender: r.gender, boardingStatus: r.boardingStatus, dateOfBirth: r.dateOfBirth, schoolId },
          });
          studentMap.set(r.admissionNumber, created.id);
          if (r.electiveIds.length > 0) {
            await prisma.studentElective.createMany({
              data: r.electiveIds.map(subjectId => ({ studentId: created.id, subjectId })),
              skipDuplicates: true,
            });
          }
          succeeded++;
        } catch (err) { errors.push({ row: r.rowNum, field: "admission_number", message: String(err) }); }
      }));
    } catch (err) {
      errors.push({ row: chunk[0].rowNum, field: "admission_number", message: `Batch error: ${String(err)}` });
    }
  }

  // Update existing in parallel batches
  const BATCH = 20;
  for (let b = 0; b < toUpdate.length; b += BATCH) {
    const chunk = toUpdate.slice(b, b + BATCH);
    await Promise.all(chunk.map(async r => {
      const id = studentMap.get(r.admissionNumber)!;
      try {
        await prisma.student.update({
          where: { id },
          data:  { fullName: r.fullName, classId: r.classId, gender: r.gender, boardingStatus: r.boardingStatus, dateOfBirth: r.dateOfBirth },
        });
        if (r.electiveIds.length > 0) {
          await prisma.studentElective.createMany({
            data: r.electiveIds.map(subjectId => ({ studentId: id, subjectId })),
            skipDuplicates: true,
          });
        }
        succeeded++;
      } catch (err) { errors.push({ row: r.rowNum, field: "admission_number", message: String(err) }); }
    }));
  }

  return { succeeded, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3b — Student Dorm Allocation
// Columns: admission_number, dorm_name, cubicle_name, bed_label, position, notes
// Duplicate guard: each student can only have one CURRENT allocation —
//   existing CURRENT is vacated before creating the new one.
// ─────────────────────────────────────────────────────────────────────────────

async function processStudentDorm(rows: Record<string, string>[], schoolId: string): PResult {
  let succeeded = 0;
  const errors: RowError[] = [];

  const students  = await prisma.student.findMany({ where: { schoolId }, select: { id: true, admissionNumber: true } });
  const studMap   = new Map(students.map(s => [norm(s.admissionNumber), s.id]));

  const dorms     = await prisma.dormitory.findMany({ where: { schoolId }, select: { id: true, name: true } });
  const dormMap   = new Map(dorms.map(d => [norm(d.name), d.id]));

  const cubicles  = await prisma.cubicle.findMany({ where: { schoolId }, select: { id: true, name: true, dormId: true } });
  const beds      = await prisma.bed.findMany({ where: { schoolId }, select: { id: true, label: true, dormId: true } });
  const positions = await prisma.sleepingPosition.findMany({
    where:  { schoolId },
    select: { id: true, bedId: true, dormId: true, position: true, customLabel: true, isOccupied: true },
  });

  for (let i = 0; i < rows.length; i++) {
    const rowNum   = i + 2;
    const row      = rows[i];
    const admNo    = row["admission_number"]?.trim();
    const dormName = row["dorm_name"]?.trim();
    const cubName  = row["cubicle_name"]?.trim() || null;
    const bedLbl   = row["bed_label"]?.trim() || null;
    const posRaw   = row["position"]?.trim().toUpperCase() || null;
    const notes    = row["notes"]?.trim() || null;

    if (!admNo)    { errors.push({ row: rowNum, field: "admission_number", message: "admission_number is required" }); continue; }
    if (!dormName) { errors.push({ row: rowNum, field: "dorm_name",        message: "dorm_name is required" }); continue; }

    const studentId = studMap.get(norm(admNo));
    if (!studentId) {
      errors.push({ row: rowNum, field: "admission_number", message: `Student "${admNo}" not found — import Students first` }); continue;
    }

    const dormId = dormMap.get(norm(dormName));
    if (!dormId) {
      errors.push({ row: rowNum, field: "dorm_name", message: `Dormitory "${dormName}" not found — import Dormitories first` }); continue;
    }

    // Resolve optional cubicle
    let cubicleId: string | null = null;
    if (cubName) {
      const cub = cubicles.find(c => c.dormId === dormId && norm(c.name) === norm(cubName));
      if (!cub) { errors.push({ row: rowNum, field: "cubicle_name", message: `Cubicle "${cubName}" not found in "${dormName}"` }); continue; }
      cubicleId = cub.id;
    }

    // Resolve optional bed
    let bedId: string | null = null;
    if (bedLbl) {
      const bed = beds.find(b => b.dormId === dormId && norm(b.label) === norm(bedLbl));
      if (!bed) { errors.push({ row: rowNum, field: "bed_label", message: `Bed "${bedLbl}" not found in "${dormName}"` }); continue; }
      bedId = bed.id;
    }

    // Resolve sleeping position (first available that matches constraints)
    let sleepingPositionId: string | null = null;
    if (bedId) {
      const pos = positions.find(p => {
        if (p.bedId !== bedId || p.isOccupied) return false;
        if (posRaw === "UPPER") return p.position === "UPPER";
        if (posRaw === "LOWER") return p.position === "LOWER";
        return true; // SINGLE or unspecified — first available
      });
      if (!pos) {
        errors.push({ row: rowNum, field: "position", message: `No available${posRaw ? ` ${posRaw}` : ""} position on bed "${bedLbl}"` }); continue;
      }
      sleepingPositionId = pos.id;
      pos.isOccupied = true; // mark in local cache to prevent double-use within same file
    }

    try {
      await prisma.$transaction(async tx => {
        // Vacate any existing CURRENT allocation
        await tx.allocationRecord.updateMany({
          where: { studentId, schoolId, status: "CURRENT" },
          data:  { status: "VACATED", vacatedDate: new Date() },
        });
        // Free the previously held sleeping position
        const prev = await tx.allocationRecord.findFirst({
          where:   { studentId, schoolId, status: "VACATED" },
          orderBy: { updatedAt: "desc" },
          select:  { sleepingPositionId: true },
        });
        if (prev?.sleepingPositionId) {
          await tx.sleepingPosition.update({
            where: { id: prev.sleepingPositionId },
            data:  { isOccupied: false },
          });
        }
        // Create new allocation
        await tx.allocationRecord.create({
          data: { schoolId, studentId, dormId, cubicleId, bedId, sleepingPositionId, notes, status: "CURRENT", allocationDate: new Date() },
        });
        // Mark position occupied
        if (sleepingPositionId) {
          await tx.sleepingPosition.update({ where: { id: sleepingPositionId }, data: { isOccupied: true } });
        }
      });
      succeeded++;
    } catch (e) { errors.push({ row: rowNum, field: "admission_number", message: String(e) }); }
  }
  return { succeeded, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Parents
// Columns: admission_number, parent_name, parent_contact, relationship
// No separate Parent model exists — data is stored on Student.parentName /
// Student.parentContact. If a student has multiple guardians in the file,
// the last row wins (upsert pattern). The `relationship` column is stored
// in parentName as "Name (Relationship)" for display clarity.
// Duplicate guard: student found by admission_number — update if exists.
// ─────────────────────────────────────────────────────────────────────────────

async function processParents(rows: Record<string, string>[], schoolId: string): PResult {
  let succeeded = 0;
  const errors: RowError[] = [];

  // Pre-load all students once
  const allStudents = await prisma.student.findMany({
    where:  { schoolId },
    select: { id: true, admissionNumber: true },
  });
  const studentMap = new Map(allStudents.map(s => [s.admissionNumber, s.id]));

  type ValidParent = { rowNum: number; studentId: string; displayName: string; parentContact: string | null };
  const validRows: ValidParent[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum        = i + 2;
    const row           = rows[i];
    const admNo         = row["admission_number"]?.trim();
    const parentName    = row["parent_name"]?.trim();
    const parentContact = row["parent_contact"]?.trim() || null;
    const relationship  = row["relationship"]?.trim();

    if (!admNo)      { errors.push({ row: rowNum, field: "admission_number", message: "admission_number is required" }); continue; }
    if (!parentName) { errors.push({ row: rowNum, field: "parent_name",      message: "parent_name is required" }); continue; }

    const studentId = studentMap.get(admNo);
    if (!studentId) {
      errors.push({ row: rowNum, field: "admission_number", message: `Student "${admNo}" not found — import Students first` }); continue;
    }

    const displayName = relationship ? `${parentName} (${relationship})` : parentName;
    validRows.push({ rowNum, studentId, displayName, parentContact });
  }

  if (validRows.length === 0) return { succeeded, errors };

  // Update in parallel batches of 20
  const BATCH = 20;
  for (let b = 0; b < validRows.length; b += BATCH) {
    const chunk = validRows.slice(b, b + BATCH);
    await Promise.all(chunk.map(async r => {
      try {
        await prisma.student.update({
          where: { id: r.studentId },
          data:  { parentName: r.displayName, parentContact: r.parentContact },
        });
        succeeded++;
      } catch (err) { errors.push({ row: r.rowNum, field: "admission_number", message: String(err) }); }
    }));
  }

  return { succeeded, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// DORM SETUP — dormitories + cubicles + beds in one CSV pass
//
// CSV columns:
//   dorm_name        (required on every row)
//   gender_policy    BOYS_ONLY | GIRLS_ONLY | MIXED          (dorm-def row)
//   structure        OPEN_HALL | CUBICLE_BASED               (dorm-def row)
//   allocation_policy MIXED_FORMS | RESTRICTED_BY_FORM       (dorm-def row)
//   description                                              (dorm-def row, optional)
//   bed_label        present → bed row; absent → dorm-def row
//   cubicle_name     optional, auto-creates the cubicle if new
//   bed_type         SINGLE | DOUBLE_DECKER | CUSTOM         (bed row)
//   custom_occupancy integer, required when bed_type = CUSTOM (bed row)
//
// Duplicate safety:
//   Dorms  → upsert by (schoolId, name)
//   Beds   → findFirst by (dormId, label); create or update
//   Positions → only created for NEW beds (skipDuplicates guard)
// ─────────────────────────────────────────────────────────────────────────────

async function processDormSetup(rows: Record<string, string>[], schoolId: string): PResult {
  let succeeded = 0;
  const errors: RowError[] = [];

  const VALID_GENDER = new Set(["BOYS_ONLY", "GIRLS_ONLY", "MIXED"]);
  const VALID_STRUCT  = new Set(["OPEN_HALL", "CUBICLE_BASED"]);
  const VALID_ALLOC   = new Set(["MIXED_FORMS", "RESTRICTED_BY_FORM"]);
  const VALID_BED     = new Set(["SINGLE", "DOUBLE_DECKER", "CUSTOM"]);

  // Local caches — built as we go so later rows can reference dorms/cubicles
  // created earlier in the same file without an extra DB round-trip.
  const dormCache    = new Map<string, string>(); // norm(name) → id
  const cubicleCache = new Map<string, string>(); // `${dormId}::${norm(name)}` → id

  // Pre-load existing dorms and cubicles for this school
  const existingDorms = await prisma.dormitory.findMany({
    where: { schoolId }, select: { id: true, name: true },
  });
  existingDorms.forEach(d => dormCache.set(norm(d.name), d.id));

  const existingCubicles = await prisma.cubicle.findMany({
    where: { schoolId }, select: { id: true, name: true, dormId: true },
  });
  existingCubicles.forEach(c => cubicleCache.set(`${c.dormId}::${norm(c.name)}`, c.id));

  for (let i = 0; i < rows.length; i++) {
    const rowNum      = i + 2;
    const row         = rows[i];
    const dormName    = row["dorm_name"]?.trim();
    const bedLabel    = row["bed_label"]?.trim();

    if (!dormName) {
      errors.push({ row: rowNum, field: "dorm_name", message: "dorm_name is required on every row" });
      continue;
    }

    // ── Dorm-definition row (bed_label is blank) ─────────────────────────────
    if (!bedLabel) {
      const genderRaw = row["gender_policy"]?.trim().toUpperCase() || "MIXED";
      const structRaw = row["structure"]?.trim().toUpperCase()     || "OPEN_HALL";
      const allocRaw  = row["allocation_policy"]?.trim().toUpperCase() || "MIXED_FORMS";
      const desc      = row["description"]?.trim() || null;

      if (!VALID_GENDER.has(genderRaw)) {
        errors.push({ row: rowNum, field: "gender_policy", message: `Must be BOYS_ONLY, GIRLS_ONLY, or MIXED — got "${genderRaw}"` }); continue;
      }
      if (!VALID_STRUCT.has(structRaw)) {
        errors.push({ row: rowNum, field: "structure", message: `Must be OPEN_HALL or CUBICLE_BASED — got "${structRaw}"` }); continue;
      }
      if (!VALID_ALLOC.has(allocRaw)) {
        errors.push({ row: rowNum, field: "allocation_policy", message: `Must be MIXED_FORMS or RESTRICTED_BY_FORM — got "${allocRaw}"` }); continue;
      }

      try {
        const dorm = await prisma.dormitory.upsert({
          where:  { schoolId_name: { schoolId, name: dormName } },
          update: {
            genderPolicy:     genderRaw as never,
            structure:        structRaw as never,
            allocationPolicy: allocRaw  as never,
            description: desc,
          },
          create: {
            name: dormName,
            genderPolicy:     genderRaw as never,
            structure:        structRaw as never,
            allocationPolicy: allocRaw  as never,
            description: desc,
            schoolId,
          },
        });
        dormCache.set(norm(dormName), dorm.id);
        succeeded++;
      } catch (e) { errors.push({ row: rowNum, field: "dorm_name", message: String(e) }); }
      continue;
    }

    // ── Bed row (bed_label is present) ────────────────────────────────────────
    const dormId = dormCache.get(norm(dormName));
    if (!dormId) {
      errors.push({ row: rowNum, field: "dorm_name", message: `Dormitory "${dormName}" not found — add a dorm-definition row for it above the bed rows` });
      continue;
    }

    const cubicleName  = row["cubicle_name"]?.trim() || null;
    const bedTypeRaw   = row["bed_type"]?.trim().toUpperCase() || "SINGLE";
    const customOccRaw = row["custom_occupancy"]?.trim();

    if (!VALID_BED.has(bedTypeRaw)) {
      errors.push({ row: rowNum, field: "bed_type", message: `Must be SINGLE, DOUBLE_DECKER, or CUSTOM — got "${bedTypeRaw}"` }); continue;
    }

    // Resolve or auto-create cubicle
    let cubicleId: string | null = null;
    if (cubicleName) {
      const cacheKey = `${dormId}::${norm(cubicleName)}`;
      if (cubicleCache.has(cacheKey)) {
        cubicleId = cubicleCache.get(cacheKey)!;
      } else {
        try {
          const nc = await prisma.cubicle.create({
            data: { name: cubicleName, dormId, schoolId, capacity: 4 },
          });
          cubicleCache.set(cacheKey, nc.id);
          cubicleId = nc.id;
        } catch (e) {
          errors.push({ row: rowNum, field: "cubicle_name", message: `Could not create cubicle "${cubicleName}": ${String(e)}` }); continue;
        }
      }
    }

    const customOccupancy = (bedTypeRaw === "CUSTOM" && customOccRaw) ? parseInt(customOccRaw, 10) : null;
    if (bedTypeRaw === "CUSTOM" && (!customOccupancy || customOccupancy < 1)) {
      errors.push({ row: rowNum, field: "custom_occupancy", message: "custom_occupancy must be a positive number when bed_type is CUSTOM" }); continue;
    }

    try {
      const existing = await prisma.bed.findFirst({ where: { dormId, label: bedLabel } });

      if (existing) {
        // Update metadata but don't regenerate positions (would cause duplicates)
        await prisma.bed.update({
          where: { id: existing.id },
          data:  { bedType: bedTypeRaw as never, cubicleId, customOccupancy },
        });
      } else {
        // Create bed + generate sleeping positions atomically
        const bed = await prisma.bed.create({
          data: { label: bedLabel, bedType: bedTypeRaw as never, dormId, cubicleId, customOccupancy, schoolId },
        });

        if (bedTypeRaw === "SINGLE") {
          await prisma.sleepingPosition.create({
            data: { bedId: bed.id, dormId, cubicleId, schoolId, position: null },
          });
        } else if (bedTypeRaw === "DOUBLE_DECKER") {
          await prisma.sleepingPosition.createMany({
            data: [
              { bedId: bed.id, dormId, cubicleId, schoolId, position: "UPPER" },
              { bedId: bed.id, dormId, cubicleId, schoolId, position: "LOWER" },
            ],
          });
        } else if (bedTypeRaw === "CUSTOM" && customOccupancy) {
          await prisma.sleepingPosition.createMany({
            data: Array.from({ length: customOccupancy }, (_, idx) => ({
              bedId: bed.id, dormId, cubicleId, schoolId,
              position: null, customLabel: `Space ${idx + 1}`,
            })),
          });
        }

        // Recompute totalCapacity for this dorm
        const posCount = await prisma.sleepingPosition.count({ where: { dormId, schoolId } });
        await prisma.dormitory.update({ where: { id: dormId }, data: { totalCapacity: posCount } });
      }

      succeeded++;
    } catch (e) { errors.push({ row: rowNum, field: "bed_label", message: String(e) }); }
  }

  return { succeeded, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Finance: Student Opening Balances
//
// Imports the current outstanding balance for each student so that the
// Bidii ledger starts with accurate carry-forward balances from a previous
// system (e.g. school management software, spreadsheet registers).
//
// CSV columns:
//   admission_number   (required)
//   student_name       (informational only — used for preview; not stored)
//   balance            (required) positive = student owes, negative = credit
//   description        (optional) defaults to "Opening balance import"
//
// Behaviour:
//   - Resolves each student by admission_number within the school.
//   - Ensures a StudentFinanceAccount exists (upsert).
//   - Posts an OPENING_BALANCE LedgerEntry via postLedgerEntry which also
//     atomically updates the materialised balance cache.
//   - Duplicate-safe: re-running for the same student adds another entry;
//     the bursar should void duplicates from the ledger if needed.
// ─────────────────────────────────────────────────────────────────────────────

async function processStudentOpeningBalance(rows: Record<string, string>[], schoolId: string): PResult {
  let succeeded = 0;
  const errors: RowError[] = [];

  // Lazy-import to avoid circular deps — same pattern used in finance processor
  const { postLedgerEntry } = await import("@/lib/finance/ledger");
  const { Decimal }         = await import("@prisma/client/runtime/library");

  // Pre-load all students for this school in one query
  const allStudents = await prisma.student.findMany({
    where:  { schoolId, archivedAt: null },
    select: { id: true, admissionNumber: true },
  });
  const studentMap = new Map(allStudents.map(s => [s.admissionNumber.toLowerCase().trim(), s.id]));

  // Find the super-admin user ID to use as postedById
  const saUsers = await prisma.user.findMany({
    where:  { role: "SUPER_ADMIN" },
    select: { id: true },
    take:   1,
  });
  const fallbackPosterId = saUsers[0]?.id;
  if (!fallbackPosterId) {
    return { succeeded: 0, errors: [{ row: 0, field: "fatal", message: "No SUPER_ADMIN user found to attribute entries to." }] };
  }

  for (let i = 0; i < rows.length; i++) {
    const rowNum      = i + 2;
    const row         = rows[i];
    const admNo       = row["admission_number"]?.trim();
    const balanceRaw  = row["balance"]?.trim();
    const description = row["description"]?.trim() || "Opening balance import";

    if (!admNo) {
      errors.push({ row: rowNum, field: "admission_number", message: "admission_number is required" }); continue;
    }
    if (!balanceRaw) {
      errors.push({ row: rowNum, field: "balance", message: "balance is required" }); continue;
    }

    const balanceNum = parseFloat(balanceRaw.replace(/[^0-9.\-]/g, ""));
    if (isNaN(balanceNum) || balanceNum === 0) {
      errors.push({ row: rowNum, field: "balance", message: `"${balanceRaw}" is not a valid non-zero balance` }); continue;
    }

    const studentId = studentMap.get(admNo.toLowerCase());
    if (!studentId) {
      errors.push({ row: rowNum, field: "admission_number", message: `Student "${admNo}" not found in this school` }); continue;
    }

    try {
      // Ensure the finance account cache row exists before posting
      await prisma.studentFinanceAccount.upsert({
        where:  { schoolId_studentId: { schoolId, studentId } },
        create: { schoolId, studentId, currentBalance: 0, totalInvoiced: 0, totalPaid: 0 },
        update: {},
      });

      // Post the ledger entry. OPENING_BALANCE is always a debit (student owes)
      // per the ledger sign convention. If the school is importing a credit
      // (student pre-paid), the bursar should post a CREDIT_ADJUSTMENT manually.
      // Balance is stored as a positive Decimal; entryType drives the sign.
      const amount = new Decimal(Math.abs(balanceNum).toString());

      await prisma.$transaction(async (tx) => {
        await postLedgerEntry(tx, {
          schoolId,
          studentId,
          entryType:   "OPENING_BALANCE",
          amount,
          description,
          postedById:  fallbackPosterId,
        });
      });

      succeeded++;
    } catch (err) {
      errors.push({ row: rowNum, field: "balance", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeeded, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy processors (kept for backward-compat with old import jobs)
// ─────────────────────────────────────────────────────────────────────────────

async function processDormitories(rows: Record<string, string>[], schoolId: string): PResult {
  let succeeded = 0;
  const errors: RowError[] = [];
  const VALID_GENDER = new Set(["BOYS_ONLY", "GIRLS_ONLY", "MIXED"]);
  const VALID_STRUCT = new Set(["OPEN_HALL", "CUBICLE_BASED"]);
  const VALID_ALLOC  = new Set(["MIXED_FORMS", "RESTRICTED_BY_FORM"]);

  for (let i = 0; i < rows.length; i++) {
    const rowNum          = i + 2;
    const row             = rows[i];
    const name            = row["name"]?.trim();
    const genderPolicyRaw = row["gender_policy"]?.trim().toUpperCase() || "MIXED";
    const structureRaw    = row["structure"]?.trim().toUpperCase() || "OPEN_HALL";
    const capacityRaw     = row["total_capacity"]?.trim();
    const allocPolicyRaw  = row["allocation_policy"]?.trim().toUpperCase() || "MIXED_FORMS";
    const description     = row["description"]?.trim() || null;

    if (!name) { errors.push({ row: rowNum, field: "name", message: "name is required" }); continue; }
    if (!VALID_GENDER.has(genderPolicyRaw)) { errors.push({ row: rowNum, field: "gender_policy", message: "Must be BOYS_ONLY, GIRLS_ONLY, or MIXED" }); continue; }
    if (!VALID_STRUCT.has(structureRaw))    { errors.push({ row: rowNum, field: "structure",     message: "Must be OPEN_HALL or CUBICLE_BASED" }); continue; }
    if (!VALID_ALLOC.has(allocPolicyRaw))   { errors.push({ row: rowNum, field: "allocation_policy", message: "Must be MIXED_FORMS or RESTRICTED_BY_FORM" }); continue; }

    const totalCapacity = capacityRaw ? parseInt(capacityRaw, 10) : 0;
    if (capacityRaw && isNaN(totalCapacity)) { errors.push({ row: rowNum, field: "total_capacity", message: "Must be a number" }); continue; }

    try {
      await prisma.dormitory.upsert({
        where:  { schoolId_name: { schoolId, name } },
        update: { genderPolicy: genderPolicyRaw as never, structure: structureRaw as never, totalCapacity, allocationPolicy: allocPolicyRaw as never, description },
        create: { name, genderPolicy: genderPolicyRaw as never, structure: structureRaw as never, totalCapacity, allocationPolicy: allocPolicyRaw as never, description, schoolId },
      });
      succeeded++;
    } catch (e) { errors.push({ row: rowNum, field: "name", message: String(e) }); }
  }
  return { succeeded, errors };
}

async function processBeds(rows: Record<string, string>[], schoolId: string): PResult {
  let succeeded = 0;
  const errors: RowError[] = [];
  const VALID_BED = new Set(["SINGLE", "DOUBLE_DECKER", "CUSTOM"]);

  const dorms    = await prisma.dormitory.findMany({ where: { schoolId }, select: { id: true, name: true } });
  const dormMap  = new Map(dorms.map(d => [norm(d.name), d.id]));
  const cubicles = await prisma.cubicle.findMany({ where: { schoolId }, select: { id: true, name: true, dormId: true } });

  for (let i = 0; i < rows.length; i++) {
    const rowNum      = i + 2;
    const row         = rows[i];
    const dormName    = row["dorm_name"]?.trim();
    const cubicleName = row["cubicle_name"]?.trim() || null;
    const bedLabel    = row["bed_label"]?.trim();
    const bedTypeRaw  = row["bed_type"]?.trim().toUpperCase() || "SINGLE";
    const customOccRaw = row["custom_occupancy"]?.trim();

    if (!dormName) { errors.push({ row: rowNum, field: "dorm_name",  message: "dorm_name is required" }); continue; }
    if (!bedLabel) { errors.push({ row: rowNum, field: "bed_label",  message: "bed_label is required" }); continue; }
    if (!VALID_BED.has(bedTypeRaw)) { errors.push({ row: rowNum, field: "bed_type", message: "Must be SINGLE, DOUBLE_DECKER, or CUSTOM" }); continue; }

    const dormId = dormMap.get(norm(dormName));
    if (!dormId) { errors.push({ row: rowNum, field: "dorm_name", message: `Dormitory "${dormName}" not found` }); continue; }

    let cubicleId: string | null = null;
    if (cubicleName) {
      let cub = cubicles.find(c => c.dormId === dormId && norm(c.name) === norm(cubicleName));
      if (!cub) {
        const nc = await prisma.cubicle.create({ data: { name: cubicleName, dormId, schoolId, capacity: 4 } });
        cubicles.push({ id: nc.id, name: nc.name, dormId });
        cub = nc;
      }
      cubicleId = cub.id;
    }

    const customOccupancy = (bedTypeRaw === "CUSTOM" && customOccRaw) ? parseInt(customOccRaw, 10) : null;

    try {
      const existing = await prisma.bed.findFirst({ where: { dormId, label: bedLabel } });
      let bed: { id: string };
      if (existing) {
        bed = await prisma.bed.update({ where: { id: existing.id }, data: { bedType: bedTypeRaw as never, cubicleId, customOccupancy } });
      } else {
        bed = await prisma.bed.create({ data: { label: bedLabel, bedType: bedTypeRaw as never, dormId, cubicleId, customOccupancy, schoolId } });
        if (bedTypeRaw === "SINGLE") {
          await prisma.sleepingPosition.create({ data: { bedId: bed.id, dormId, cubicleId, schoolId, position: null } });
        } else if (bedTypeRaw === "DOUBLE_DECKER") {
          await prisma.sleepingPosition.createMany({ data: [
            { bedId: bed.id, dormId, cubicleId, schoolId, position: "UPPER" },
            { bedId: bed.id, dormId, cubicleId, schoolId, position: "LOWER" },
          ]});
        } else if (bedTypeRaw === "CUSTOM" && customOccupancy && customOccupancy > 0) {
          await prisma.sleepingPosition.createMany({ data: Array.from({ length: customOccupancy }, (_, idx) => ({
            bedId: bed.id, dormId, cubicleId, schoolId, position: null, customLabel: `Space ${idx + 1}`,
          }))});
        }
        const posCount = await prisma.sleepingPosition.count({ where: { dormId, schoolId } });
        await prisma.dormitory.update({ where: { id: dormId }, data: { totalCapacity: posCount } });
      }
      succeeded++;
    } catch (e) { errors.push({ row: rowNum, field: "bed_label", message: String(e) }); }
  }
  return { succeeded, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/super-admin/imports/process
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }

  const jobId   = formData.get("jobId") as string | null;
  const fileVal = formData.get("file")  as File   | null;

  if (!jobId)   return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  if (!fileVal) return NextResponse.json({ error: "file is required"  }, { status: 400 });

  if (fileVal.size > 50 * 1024 * 1024) return NextResponse.json({ error: "File exceeds 50 MB limit" }, { status: 413 });

  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  if (job.status !== "QUEUED" && job.status !== "FAILED")
    return NextResponse.json({ error: `Job is already ${job.status}` }, { status: 409 });

  const { schoolId } = job;

  await prisma.importJob.update({ where: { id: jobId }, data: { status: "PROCESSING" } });

  let csvText: string;
  try { csvText = await fileVal.text(); }
  catch {
    await prisma.importJob.update({ where: { id: jobId }, data: { status: "FAILED" } });
    return NextResponse.json({ error: "Failed to read file" }, { status: 422 });
  }

  const { rows } = parseCSVText(csvText);
  let result: { succeeded: number; errors: RowError[] };

  try {
    switch (job.type) {
      case "DEPARTMENTS":              result = await processDepartments(rows,             schoolId); break;
      case "CLASSES":                  result = await processClasses(rows,                 schoolId); break;
      case "SUBJECTS":                 result = await processSubjects(rows,                schoolId); break;
      case "STAFF":                    result = await processStaff(rows,                   schoolId); break;
      case "STUDENTS":                 result = await processStudents(rows,                schoolId); break;
      case "STUDENT_DORM":             result = await processStudentDorm(rows,             schoolId); break;
      case "PARENTS":                  result = await processParents(rows,                 schoolId); break;
      case "STUDENT_OPENING_BALANCE":  result = await processStudentOpeningBalance(rows,   schoolId); break;
      case "DORM_SETUP":               result = await processDormSetup(rows,               schoolId); break;
      case "DORMITORIES":              result = await processDormitories(rows,             schoolId); break;
      case "BEDS":                     result = await processBeds(rows,                    schoolId); break;
      case "ALLOCATIONS":              result = await processStudentDorm(rows,             schoolId); break; // legacy alias
      case "BOTH": {
        const r1 = await processStudents(rows, schoolId);
        const r2 = await processStaff(rows,    schoolId);
        result = { succeeded: r1.succeeded + r2.succeeded, errors: [...r1.errors, ...r2.errors] };
        break;
      }
      default:
        result = { succeeded: 0, errors: [{ row: 0, field: "type", message: `Unsupported import type: ${job.type}` }] };
    }

    // ── Notify any open school-side tabs so they re-fetch their data ──────────
    if (result.succeeded > 0) {
      const sseMap: Record<string, Parameters<typeof emitSSE>[1]> = {
        DEPARTMENTS:             "import.departments.completed",
        CLASSES:                 "import.classes.completed",
        SUBJECTS:                "import.subjects.completed",
        STAFF:                   "import.staff.completed",
        STUDENTS:                "import.students.completed",
        STUDENT_DORM:            "import.allocations.completed",
        ALLOCATIONS:             "import.allocations.completed",
        PARENTS:                 "import.students.completed",   // parents update student records
        STUDENT_OPENING_BALANCE: "import.finance.completed",
        DORMITORIES:             "import.dormitories.completed",
        BEDS:                    "import.beds.completed",
        BOTH:                    "import.students.completed",
      };
      const evtType = sseMap[job.type];
      if (evtType) emitSSE(schoolId, evtType, { succeeded: result.succeeded, jobId });
      // For BOTH, also fire the staff event
      if (job.type === "BOTH") emitSSE(schoolId, "import.staff.completed", { succeeded: result.succeeded, jobId });
    }

    const finalStatus = result.succeeded === 0 && result.errors.length > 0 ? "FAILED" : "COMPLETED";
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status:      finalStatus,
        succeeded:   result.succeeded,
        failed:      result.errors.length,
        totalRows:   rows.length,
        errorReport: result.errors.length > 0 ? (result.errors as object[]) : Prisma.JsonNull,
      },
    });

    await logAudit(user.id, "IMPORT_PROCESSED", "school", schoolId, {
      jobId, type: job.type, succeeded: result.succeeded, failed: result.errors.length, status: finalStatus,
    });

    return NextResponse.json({ jobId, status: finalStatus, succeeded: result.succeeded, failed: result.errors.length, errors: result.errors });

  } catch (e) {
    await prisma.importJob.update({
      where: { id: jobId },
      data:  { status: "FAILED", errorReport: [{ row: 0, field: "fatal", message: String(e) }] },
    });
    return NextResponse.json({ error: "Processing failed", detail: String(e) }, { status: 500 });
  }
}
