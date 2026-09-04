/**
 * src/lib/hooks/useGlobalSearch.ts
 *
 * Application-wide instant search hook.
 *
 * Sources (fetched via API and cached locally):
 *   - Students           (direct API fetch)
 *   - Teachers / Staff   (direct API fetch)
 *   - Departments        (direct API fetch)
 *   - Subjects           (direct API fetch)
 *   - Navigation pages   (static per-role registry)
 *
 * Results are grouped by category and returned quickly for
 * typical school datasets (< 5,000 students, < 200 staff).
 */

"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import { fetchAllStudents } from "@/lib/utils/fetchAllStudents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchCategory =
  | "students"
  | "staff"
  | "departments"
  | "subjects"
  | "navigation"
  | "actions";

export interface SearchResult {
  id:       string;
  category: SearchCategory;
  label:    string;
  /** Secondary detail line (class, role, etc.) */
  detail?:  string;
  href:     string;
  /** Lucide icon name */
  icon:     string;
}

export interface SearchResultGroup {
  category: SearchCategory;
  label:    string;
  icon:     string;
  results:  SearchResult[];
}

// ---------------------------------------------------------------------------
// Local data types (matching API responses)
// ---------------------------------------------------------------------------

type LocalStudent = {
  id: string;
  admissionNumber: string;
  fullName: string;
  dateOfBirth: Date | null;
  classId: string;
  parentName: string | null;
  parentContact: string | null;
  schoolId: string;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type LocalTeacher = {
  id: string;
  staffId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  primaryDepartmentId: string | null;
  todEligible: boolean;
  schoolId: string;
  userId: string | null;
  updatedAt: string;
};

type LocalDepartment = {
  id: string;
  name: string;
  headTeacherId: string | null;
  schoolId: string;
  updatedAt: string;
};

type LocalSubject = {
  id: string;
  name: string;
  code: string;
  type: string;
  departmentId: string;
  applicableForms: number[];
  schoolId: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Role-aware navigation registry
// Each entry describes a page reachable within the app.
// ---------------------------------------------------------------------------

interface NavEntry {
  id:       string;
  label:    string;
  detail:   string;
  href:     string;
  icon:     string;
  roles:    string[];  // which roles can navigate here
  keywords: string[];  // extra search terms
}

const NAV_REGISTRY: NavEntry[] = [
  // ── People ──────────────────────────────────────────────────────────────
  { id: "nav_students",      label: "Students",           detail: "People",         href: "/{role}/students",       icon: "Users",         roles: ["principal","teacher","staff"], keywords: ["register","admission","pupils"] },
  { id: "nav_staff",         label: "Staff",              detail: "People",         href: "/{role}/staff",          icon: "UserCheck",     roles: ["principal"],                  keywords: ["teachers","employees","hr"] },
  { id: "nav_people",        label: "People",             detail: "Hub",            href: "/{role}/people",         icon: "UsersRound",    roles: ["principal"],                  keywords: ["directory","contacts"] },
  // ── Academics ────────────────────────────────────────────────────────────
  { id: "nav_classes",       label: "Classes",            detail: "Academics",      href: "/{role}/classes",        icon: "School",        roles: ["principal"],                  keywords: ["forms","streams","grades"] },
  { id: "nav_subjects",      label: "Subjects",           detail: "Academics",      href: "/{role}/subjects",       icon: "BookMarked",    roles: ["principal"],                  keywords: ["curriculum","courses"] },
  { id: "nav_timetable",     label: "Timetable",          detail: "Academics",      href: "/{role}/timetable",      icon: "CalendarDays",  roles: ["principal","teacher"],        keywords: ["schedule","periods","lessons"] },
  { id: "nav_attendance",    label: "Attendance",         detail: "Academics",      href: "/{role}/attendance",     icon: "ClipboardCheck",roles: ["principal","teacher","staff"], keywords: ["present","absent","roll call"] },
  { id: "nav_calendar",      label: "Calendar",           detail: "Academics",      href: "/{role}/calendar",       icon: "Calendar",      roles: ["principal","teacher","staff"], keywords: ["events","holidays","term"] },
  { id: "nav_assessments",   label: "Assessments",        detail: "Academics",      href: "/{role}/assessments",    icon: "ClipboardList", roles: ["principal","teacher"],        keywords: ["exams","marks","grades","tests"] },
  { id: "nav_academics_hub", label: "Academics",          detail: "Hub",            href: "/{role}/academics",      icon: "BookOpen",      roles: ["principal","teacher"],        keywords: ["academic","hub"] },
  // ── Communication ────────────────────────────────────────────────────────
  { id: "nav_communication", label: "Communication",      detail: "Messaging",      href: "/{role}/communication",  icon: "MessageSquare", roles: ["principal","staff"],          keywords: ["messages","announcements","inbox","sms"] },
  // ── Reports ──────────────────────────────────────────────────────────────
  { id: "nav_reports",       label: "Reports",            detail: "Reports",        href: "/{role}/reports",        icon: "FileText",      roles: ["principal"],                  keywords: ["analytics","summary","statistics"] },
  { id: "nav_records",       label: "Records",            detail: "Reports",        href: "/{role}/records",        icon: "Archive",       roles: ["principal","staff"],          keywords: ["documents","files","history"] },
  { id: "nav_results",       label: "Results",            detail: "Assessments",    href: "/{role}/results",        icon: "BarChart2",     roles: ["principal","teacher"],        keywords: ["report cards","grades","performance"] },
  { id: "nav_exam_periods",  label: "Exam Periods",       detail: "Assessments",    href: "/{role}/exam-periods",   icon: "BookOpenCheck", roles: ["principal"],                  keywords: ["term exams","examinations","schedule"] },
  // ── Administration ────────────────────────────────────────────────────────
  { id: "nav_departments",   label: "Departments",        detail: "Administration", href: "/{role}/departments",    icon: "Layers",        roles: ["principal"],                  keywords: ["faculties","sections"] },
  { id: "nav_library",       label: "Library",            detail: "Administration", href: "/{role}/library",        icon: "Library",       roles: ["principal","staff"],          keywords: ["books","borrowing","catalogue","isbn"] },
  { id: "nav_accommodation", label: "Accommodation",      detail: "Administration", href: "/{role}/accommodation",  icon: "BedDouble",     roles: ["principal"],                  keywords: ["dormitory","boarding","dorm","allocation","hostel"] },
  { id: "nav_settings",      label: "Settings",           detail: "Administration", href: "/{role}/settings",       icon: "Settings",      roles: ["principal"],                  keywords: ["configuration","preferences","school"] },
  { id: "nav_administration",label: "Administration",     detail: "Hub",            href: "/{role}/administration", icon: "Settings2",     roles: ["principal"],                  keywords: ["admin","management"] },
  // ── Staff portal ─────────────────────────────────────────────────────────
  { id: "nav_directory",     label: "Staff Directory",    detail: "Staff Portal",   href: "/{role}/directory",      icon: "ContactRound",  roles: ["staff"],                      keywords: ["teachers","employees","contacts"] },
];

// Quick-action registry: frequently performed tasks
interface QuickActionEntry {
  id:       string;
  label:    string;
  detail:   string;
  href:     string;
  icon:     string;
  roles:    string[];
  keywords: string[];
}

const ACTIONS_REGISTRY: QuickActionEntry[] = [
  { id: "qa_add_student",    label: "Register Student",     detail: "Quick Action", href: "/{role}/students?action=add",          icon: "UserPlus",      roles: ["principal","staff"],   keywords: ["new student","enroll","admit"] },
  { id: "qa_add_staff",      label: "Add Staff Member",     detail: "Quick Action", href: "/{role}/staff?action=add",             icon: "UserCheck",     roles: ["principal"],           keywords: ["hire","new teacher","new staff"] },
  { id: "qa_take_attendance",label: "Take Attendance",      detail: "Quick Action", href: "/{role}/attendance",                   icon: "ClipboardCheck",roles: ["principal","teacher"], keywords: ["mark attendance","roll call"] },
  { id: "qa_issue_book",     label: "Issue Book",           detail: "Quick Action", href: "/{role}/library?action=issue",         icon: "BookUp",        roles: ["principal","staff"],   keywords: ["borrow","lend","library"] },
  { id: "qa_send_message",   label: "Send Message",         detail: "Quick Action", href: "/{role}/communication?action=compose", icon: "Send",          roles: ["principal","staff"],   keywords: ["compose","email","sms","announce"] },
  { id: "qa_create_exam",    label: "Create Exam Period",   detail: "Quick Action", href: "/{role}/exam-periods?action=add",      icon: "BookOpenCheck", roles: ["principal"],           keywords: ["new exam","schedule exam"] },
  { id: "qa_view_reports",   label: "Generate Report",      detail: "Quick Action", href: "/{role}/reports",                      icon: "FileBarChart",  roles: ["principal"],           keywords: ["analytics","summary","export"] },
  { id: "qa_add_class",      label: "Add Class",            detail: "Quick Action", href: "/{role}/classes?action=add",           icon: "School",        roles: ["principal"],                  keywords: ["new class","new form","stream"] },
  { id: "qa_record_result",  label: "Enter Results",        detail: "Quick Action", href: "/{role}/results",                      icon: "ClipboardEdit", roles: ["principal","teacher"],        keywords: ["marks","grades","scores"] },
  { id: "qa_allocate_dorm",  label: "Allocate Boarding",    detail: "Quick Action", href: "/{role}/accommodation/allocations",    icon: "BedDouble",     roles: ["principal"],                  keywords: ["dorm","boarding","allocate","hostel"] },
  // ── Fees / Finance ────────────────────────────────────────────────────────
  { id: "qa_post_payment",   label: "Post Payment",         detail: "Quick Action", href: "/{role}/finance/payments",             icon: "Banknote",      roles: ["principal","staff"],          keywords: ["payment","collect fee","cash","bank transfer"] },
  { id: "qa_view_debtors",   label: "View Debtors",         detail: "Quick Action", href: "/{role}/finance/debtors",              icon: "TrendingDown",  roles: ["principal","staff"],          keywords: ["outstanding","arrears","unpaid","owing"] },
  { id: "qa_invoice_term",   label: "Invoice Term Fees",    detail: "Quick Action", href: "/{role}/finance/fee-structures",       icon: "ReceiptText",   roles: ["principal"],                  keywords: ["invoice","charge","term fees","billing"] },
  { id: "qa_fee_reports",    label: "Fee Reports",          detail: "Quick Action", href: "/{role}/finance/reports",              icon: "PieChart",      roles: ["principal","staff"],          keywords: ["finance report","collection rate","analytics"] },
  { id: "qa_reconcile",      label: "Reconcile Payments",   detail: "Quick Action", href: "/{role}/finance/reconciliation",       icon: "RefreshCw",     roles: ["principal","staff"],          keywords: ["mpesa","unmatched","reconcile","match payment"] },
  // ── Library ───────────────────────────────────────────────────────────────
  { id: "qa_return_book",    label: "Return Book",          detail: "Quick Action", href: "/{role}/library/circulate",            icon: "BookCheck",     roles: ["principal","staff"],          keywords: ["return","hand in","borrow back"] },
  { id: "qa_add_book",       label: "Add Book to Catalogue",detail: "Quick Action", href: "/{role}/library/inventory?action=add", icon: "BookPlus",      roles: ["principal","staff"],          keywords: ["new book","catalogue","add title","acquisition"] },
  { id: "qa_library_fines",  label: "Manage Library Fines", detail: "Quick Action", href: "/{role}/library/cards?hasFine=true",   icon: "BadgeDollarSign",roles: ["principal","staff"],         keywords: ["library fine","waive fine","collect fine","overdue fine"] },
  { id: "qa_overdue_books",  label: "View Overdue Books",   detail: "Quick Action", href: "/{role}/library/cards",                icon: "BookX",         roles: ["principal","staff"],          keywords: ["overdue","late return","past due","unreturned"] },
];

// ---------------------------------------------------------------------------
// Category display metadata
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<SearchCategory, { label: string; icon: string }> = {
  students:   { label: "Students",   icon: "GraduationCap" },
  staff:      { label: "Staff",      icon: "UserCheck"     },
  departments:{ label: "Departments",icon: "Layers"        },
  subjects:   { label: "Subjects",   icon: "BookMarked"    },
  navigation: { label: "Pages",      icon: "LayoutGrid"    },
  actions:    { label: "Actions",    icon: "Zap"           },
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGlobalSearch(query: string, role: string) {
  // Local state for data management
  const [students, setStudents] = useState<LocalStudent[]>([]);
  const [teachers, setTeachers] = useState<LocalTeacher[]>([]);
  const [departments, setDepartments] = useState<LocalDepartment[]>([]);
  const [subjects, setSubjects] = useState<LocalSubject[]>([]);
  const [loading, setLoading] = useState(true);

  // Roles that have access to the staff-only search APIs.
  // PARENT (and any future portal-only roles) only get navigation/actions search.
  const isStaffRole = ["principal", "teacher", "staff"].includes(role);

  // Fetch data from APIs on component mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (isStaffRole) {
          const [studentsData, teachersRes, departmentsRes, subjectsRes] = await Promise.all([
            fetchAllStudents(),
            fetch("/api/staff"),
            fetch("/api/departments"),
            fetch("/api/subjects"),
          ]);

          // Process students response
          {
            const activeStudents = (studentsData as LocalStudent[]).filter(s => !s.archivedAt);
            activeStudents.sort((a, b) => a.fullName.localeCompare(b.fullName));
            setStudents(activeStudents);
          }

          // Process teachers response
          if (teachersRes.ok) {
            const teachersData: LocalTeacher[] = await teachersRes.json();
            teachersData.sort((a, b) => a.fullName.localeCompare(b.fullName));
            setTeachers(teachersData);
          }

          // Process departments response
          if (departmentsRes.ok) {
            const departmentsData: LocalDepartment[] = await departmentsRes.json();
            departmentsData.sort((a, b) => a.name.localeCompare(b.name));
            setDepartments(departmentsData);
          }

          // Process subjects response
          if (subjectsRes.ok) {
            const subjectsData: LocalSubject[] = await subjectsRes.json();
            subjectsData.sort((a, b) => a.name.localeCompare(b.name));
            setSubjects(subjectsData);
          }
        }
      } catch (error) {
        console.error("Failed to fetch search data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isStaffRole]);

  const search = useCallback(
    (q: string): SearchResultGroup[] => {
      if (!q.trim() || loading) return [];
      const lower = q.toLowerCase().trim();

      const groups: SearchResultGroup[] = [];

      // ── Students ──────────────────────────────────────────────────────────
      const studentResults: SearchResult[] = students
        .filter(
          (s) =>
            s.fullName.toLowerCase().includes(lower) ||
            s.admissionNumber.toLowerCase().includes(lower) ||
            (s.parentName?.toLowerCase().includes(lower) ?? false)
        )
        .slice(0, 5)
        .map((s) => ({
          id:       s.id,
          category: "students" as SearchCategory,
          label:    s.fullName,
          detail:   `Adm: ${s.admissionNumber}`,
          href:     `/${role}/students/${s.id}`,
          icon:     "GraduationCap",
        }));

      if (studentResults.length > 0) {
        groups.push({
          category: "students",
          ...CATEGORY_META.students,
          results: studentResults,
        });
      }

      // ── Staff / Teachers ──────────────────────────────────────────────────
      const staffResults: SearchResult[] = teachers
        .filter(
          (t) =>
            t.fullName.toLowerCase().includes(lower) ||
            t.staffId.toLowerCase().includes(lower) ||
            (t.email?.toLowerCase().includes(lower) ?? false)
        )
        .slice(0, 5)
        .map((t) => ({
          id:       t.id,
          category: "staff" as SearchCategory,
          label:    t.fullName,
          detail:   `Staff ID: ${t.staffId}`,
          href:     `/${role}/staff/${t.id}`,
          icon:     "UserCheck",
        }));

      if (staffResults.length > 0) {
        groups.push({
          category: "staff",
          ...CATEGORY_META.staff,
          results: staffResults,
        });
      }

      // ── Departments ────────────────────────────────────────────────────────
      const deptResults: SearchResult[] = departments
        .filter((d) => d.name.toLowerCase().includes(lower))
        .slice(0, 3)
        .map((d) => ({
          id:       d.id,
          category: "departments" as SearchCategory,
          label:    d.name,
          href:     `/${role}/departments`,
          icon:     "Layers",
        }));

      if (deptResults.length > 0) {
        groups.push({
          category: "departments",
          ...CATEGORY_META.departments,
          results: deptResults,
        });
      }

      // ── Subjects ──────────────────────────────────────────────────────────
      const subjectResults: SearchResult[] = subjects
        .filter((s) => s.name.toLowerCase().includes(lower))
        .slice(0, 3)
        .map((s) => ({
          id:       s.id,
          category: "subjects" as SearchCategory,
          label:    s.name,
          href:     `/${role}/subjects`,
          icon:     "BookMarked",
        }));

      if (subjectResults.length > 0) {
        groups.push({
          category: "subjects",
          ...CATEGORY_META.subjects,
          results: subjectResults,
        });
      }

      // ── Navigation ────────────────────────────────────────────────────────
      const navResults: SearchResult[] = NAV_REGISTRY
        .filter(
          (n) =>
            n.roles.includes(role) &&
            (n.label.toLowerCase().includes(lower) ||
              n.detail.toLowerCase().includes(lower) ||
              n.keywords.some((k) => k.toLowerCase().includes(lower)))
        )
        .slice(0, 5)
        .map((n) => ({
          id:       n.id,
          category: "navigation" as SearchCategory,
          label:    n.label,
          detail:   n.detail,
          href:     n.href.replace("{role}", role),
          icon:     n.icon,
        }));

      if (navResults.length > 0) {
        groups.push({
          category: "navigation",
          ...CATEGORY_META.navigation,
          results: navResults,
        });
      }

      // ── Quick Actions ─────────────────────────────────────────────────────
      const actionResults: SearchResult[] = ACTIONS_REGISTRY
        .filter(
          (a) =>
            a.roles.includes(role) &&
            (a.label.toLowerCase().includes(lower) ||
              a.keywords.some((k) => k.toLowerCase().includes(lower)))
        )
        .slice(0, 4)
        .map((a) => ({
          id:       a.id,
          category: "actions" as SearchCategory,
          label:    a.label,
          detail:   a.detail,
          href:     a.href.replace("{role}", role),
          icon:     a.icon,
        }));

      if (actionResults.length > 0) {
        groups.push({
          category: "actions",
          ...CATEGORY_META.actions,
          results: actionResults,
        });
      }

      return groups;
    },
    [students, teachers, departments, subjects, role, loading]
  );

  const results = useMemo(() => search(query), [search, query]);

  const totalCount = useMemo(
    () => results.reduce((acc, g) => acc + g.results.length, 0),
    [results]
  );

  return { results, totalCount, loading };
}

// Re-export registry for use by QuickActionsPanel
export { NAV_REGISTRY, ACTIONS_REGISTRY };
export type { NavEntry, QuickActionEntry };
