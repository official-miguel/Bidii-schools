import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { randomUUID } from "crypto";

// ── Shared auth helper ─────────────────────────────────────────────────────
async function getAuthor(manage = false) {
  if (manage) {
    return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  }
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
}

// ── GET /api/timetable/v2/config ───────────────────────────────────────────
// Returns the extended timetable config, operating days, special periods,
// and subject workload rules in one payload — the settings page loads
// everything in a single request.

export async function GET() {
  const user = await getAuthor();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const [config, operatingDays, specialPeriods, workloadRules] = await Promise.all([
    prisma.timetableConfig.findUnique({ where: { schoolId } }),

    prisma.$queryRaw<
      Array<{
        id: string; dayOfWeek: number; isActive: boolean;
        isHalfDay: boolean; halfDayEndsAfterPeriod: number | null; label: string | null;
      }>
    >`SELECT id, "dayOfWeek", "isActive", "isHalfDay", "halfDayEndsAfterPeriod", label
      FROM "OperatingDay" WHERE "schoolId" = ${schoolId} ORDER BY "dayOfWeek"`,

    prisma.$queryRaw<
      Array<{
        id: string; type: string; label: string; dayOfWeek: number | null;
        period: number; durationMinutes: number | null; appliesToForms: number[];
        appliesToClasses: string[]; isActive: boolean; sortOrder: number;
      }>
    >`SELECT id, type, label, "dayOfWeek", period, "durationMinutes",
             "appliesToForms", "appliesToClasses", "isActive", "sortOrder"
      FROM "SpecialPeriod" WHERE "schoolId" = ${schoolId}
      ORDER BY "sortOrder", period`,

    prisma.$queryRaw<
      Array<{
        id: string; subjectId: string; subjectCode: string; subjectName: string;
        form: number; lessonsPerWeek: number; doubleLesson: boolean;
        consecutiveDouble: boolean; requiresSpecialRoom: string | null;
        maxPerDay: number | null; minSpreadDays: number | null;
        preferMorning: boolean; preferAfternoon: boolean;
      }>
    >`SELECT r.id, r."subjectId", s.code AS "subjectCode", s.name AS "subjectName",
             r.form, r."lessonsPerWeek", r."doubleLesson", r."consecutiveDouble",
             r."requiresSpecialRoom", r."maxPerDay", r."minSpreadDays",
             r."preferMorning", r."preferAfternoon"
      FROM "SubjectWorkloadRule" r
      JOIN "Subject" s ON s.id = r."subjectId"
      WHERE r."schoolId" = ${schoolId}
      ORDER BY r.form, s.code`,
  ]);

  const DEFAULTS = {
    periodsPerDay: 8, breakAfterPeriod: null, lunchAfterPeriod: null,
    gamesDayOfWeek: null, gamesPeriod: null, maxLessonsPerTeacherPerDay: 6,
    dayStartTime: "08:00", periodDurationMinutes: 40,
    breakDurationMinutes: 15, lunchDurationMinutes: 45,
    assemblyAfterPeriod: null, assemblyDurationMinutes: 0,
    operatingDaysOfWeek: [0,1,2,3,4], useVersionedTimetable: true,
  };

  return NextResponse.json({
    config:         { ...DEFAULTS, ...(config ?? {}), schoolId },
    operatingDays,
    specialPeriods,
    workloadRules,
  });
}

// ── PUT /api/timetable/v2/config ───────────────────────────────────────────
// Upserts TimetableConfig, replaces OperatingDays, and upserts
// SpecialPeriods and SubjectWorkloadRules in one round-trip.

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const configSchema = z.object({
  periodsPerDay:              z.number().int().min(1).max(16),
  breakAfterPeriod:           z.number().int().min(1).nullable(),
  lunchAfterPeriod:           z.number().int().min(1).nullable(),
  gamesDayOfWeek:             z.number().int().min(0).max(6).nullable(),
  gamesPeriod:                z.number().int().min(1).nullable(),
  maxLessonsPerTeacherPerDay: z.number().int().min(1).max(16),
  dayStartTime:               z.string().regex(TIME_RE, "Use HH:MM 24-hour format."),
  periodDurationMinutes:      z.number().int().min(5).max(180),
  breakDurationMinutes:       z.number().int().min(0).max(120),
  lunchDurationMinutes:       z.number().int().min(0).max(180),
  assemblyAfterPeriod:        z.number().int().min(1).nullable().optional(),
  assemblyDurationMinutes:    z.number().int().min(0).max(120).optional(),
});

const opDaySchema = z.object({
  dayOfWeek:             z.number().int().min(0).max(6),
  isActive:              z.boolean(),
  isHalfDay:             z.boolean().optional(),
  halfDayEndsAfterPeriod:z.number().int().min(1).nullable().optional(),
  label:                 z.string().max(40).nullable().optional(),
});

const specialPeriodSchema = z.object({
  id:              z.string().optional(),
  type:            z.enum(["ASSEMBLY","BREAK","LUNCH","GAMES","CLUBS","REMEDIAL","CHAPEL","LIBRARY","CUSTOM"]),
  label:           z.string().trim().min(1).max(80),
  dayOfWeek:       z.number().int().min(0).max(6).nullable(),
  period:          z.number().int().min(1).max(16),
  durationMinutes: z.number().int().min(0).max(600).nullable().optional(),
  appliesToForms:  z.array(z.number().int().min(1)).optional(),
  appliesToClasses:z.array(z.string()).optional(),
  isActive:        z.boolean().optional(),
  sortOrder:       z.number().int().optional(),
});

const workloadRuleSchema = z.object({
  id:                  z.string().optional(),
  subjectId:           z.string().min(1),
  form:                z.number().int().min(1),
  lessonsPerWeek:      z.number().int().min(0).max(30),
  doubleLesson:        z.boolean().optional(),
  consecutiveDouble:   z.boolean().optional(),
  requiresSpecialRoom: z.string().max(80).nullable().optional(),
  maxPerDay:           z.number().int().min(1).nullable().optional(),
  minSpreadDays:       z.number().int().min(1).nullable().optional(),
  preferMorning:       z.boolean().optional(),
  preferAfternoon:     z.boolean().optional(),
});

const bodySchema = z.object({
  config:        configSchema.optional(),
  operatingDays: z.array(opDaySchema).optional(),
  specialPeriods:z.array(specialPeriodSchema).optional(),
  workloadRules: z.array(workloadRuleSchema).optional(),
});

export async function PUT(req: NextRequest) {
  const user = await getAuthor(true);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  const { config, operatingDays, specialPeriods, workloadRules } = parsed.data;
  const now = new Date();

  // ── TimetableConfig ──────────────────────────────────────────────────────
  if (config) {
    await prisma.timetableConfig.upsert({
      where:  { schoolId },
      update: { ...config, updatedAt: now },
      create: { schoolId, ...config, updatedAt: now },
    });
  }

  // ── OperatingDays — full replace ─────────────────────────────────────────
  if (operatingDays) {
    await prisma.$executeRaw`DELETE FROM "OperatingDay" WHERE "schoolId" = ${schoolId}`;
    for (const d of operatingDays) {
      await prisma.$executeRaw`
        INSERT INTO "OperatingDay"
          (id, "schoolId", "dayOfWeek", "isActive", "isHalfDay",
           "halfDayEndsAfterPeriod", label, "createdAt", "updatedAt")
        VALUES (
          ${randomUUID()}, ${schoolId}, ${d.dayOfWeek}, ${d.isActive},
          ${d.isHalfDay ?? false}, ${d.halfDayEndsAfterPeriod ?? null},
          ${d.label ?? null}, ${now}, ${now}
        )
      `;
    }
  }

  // ── SpecialPeriods — upsert by id, insert if no id ──────────────────────
  if (specialPeriods) {
    // Simplest correct approach: delete all existing rows for this school,
    // then re-insert the full list. The list is small (< 20 rows typically)
    // so a full replace is cheaper and safer than diffing.
    await prisma.$executeRaw`DELETE FROM "SpecialPeriod" WHERE "schoolId" = ${schoolId}`;

    for (const sp of specialPeriods) {
      const id = sp.id ?? randomUUID();
      const forms   = `{${(sp.appliesToForms   ?? []).join(",")}}`;
      const classes = `{${(sp.appliesToClasses ?? []).map((c) => `"${c}"`).join(",")}}`;
      await prisma.$executeRaw`
        INSERT INTO "SpecialPeriod"
          (id, "schoolId", type, label, "dayOfWeek", period, "durationMinutes",
           "appliesToForms", "appliesToClasses", "isActive", "sortOrder",
           "createdAt", "updatedAt")
        VALUES (
          ${id}, ${schoolId}, ${sp.type}::"SpecialPeriodType",
          ${sp.label}, ${sp.dayOfWeek ?? null}, ${sp.period},
          ${sp.durationMinutes ?? null},
          ${forms}::integer[], ${classes}::text[],
          ${sp.isActive ?? true}, ${sp.sortOrder ?? 0},
          ${now}, ${now}
        )
        ON CONFLICT (id) DO UPDATE SET
          type             = EXCLUDED.type,
          label            = EXCLUDED.label,
          "dayOfWeek"      = EXCLUDED."dayOfWeek",
          period           = EXCLUDED.period,
          "durationMinutes"= EXCLUDED."durationMinutes",
          "appliesToForms" = EXCLUDED."appliesToForms",
          "appliesToClasses"= EXCLUDED."appliesToClasses",
          "isActive"       = EXCLUDED."isActive",
          "sortOrder"      = EXCLUDED."sortOrder",
          "updatedAt"      = EXCLUDED."updatedAt"
      `;
    }
  }

  // ── SubjectWorkloadRules — upsert by (schoolId, subjectId, form) ─────────
  if (workloadRules) {
    for (const r of workloadRules) {
      await prisma.$executeRaw`
        INSERT INTO "SubjectWorkloadRule"
          (id, "schoolId", "subjectId", form, "lessonsPerWeek", "doubleLesson",
           "consecutiveDouble", "requiresSpecialRoom", "maxPerDay", "minSpreadDays",
           "preferMorning", "preferAfternoon", "createdAt", "updatedAt")
        VALUES (
          ${r.id ?? randomUUID()}, ${schoolId}, ${r.subjectId}, ${r.form},
          ${r.lessonsPerWeek}, ${r.doubleLesson ?? false},
          ${r.consecutiveDouble ?? false}, ${r.requiresSpecialRoom ?? null},
          ${r.maxPerDay ?? null}, ${r.minSpreadDays ?? null},
          ${r.preferMorning ?? false}, ${r.preferAfternoon ?? false},
          ${now}, ${now}
        )
        ON CONFLICT ("schoolId", "subjectId", form) DO UPDATE SET
          "lessonsPerWeek"     = EXCLUDED."lessonsPerWeek",
          "doubleLesson"       = EXCLUDED."doubleLesson",
          "consecutiveDouble"  = EXCLUDED."consecutiveDouble",
          "requiresSpecialRoom"= EXCLUDED."requiresSpecialRoom",
          "maxPerDay"          = EXCLUDED."maxPerDay",
          "minSpreadDays"      = EXCLUDED."minSpreadDays",
          "preferMorning"      = EXCLUDED."preferMorning",
          "preferAfternoon"    = EXCLUDED."preferAfternoon",
          "updatedAt"          = EXCLUDED."updatedAt"
      `;
    }
  }

  // Return the full updated config in one response
  return GET();
}
