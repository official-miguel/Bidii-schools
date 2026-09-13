/**
 * src/lib/soma-ai/help-content.ts
 *
 * Curated help knowledge base for Soma AI.
 *
 * Each entry maps one "how do I…" question to the actual steps a user
 * needs in the real Bidii UI.  Soma AI serves these entries directly —
 * with zero Gemini spend — before ever touching the LLM for how-to questions.
 *
 * IMPORTANT FOR MAINTAINERS:
 *   - Keep `answer` short: 3–6 numbered steps, naming real page/button labels.
 *   - `keywords` must be lowercase.  Add synonyms users actually type.
 *   - `roles`: empty array = visible to ALL roles.
 *     Otherwise list only the roles that can perform this action.
 *   - `route`: use the exact Next.js path segment, e.g. "/principal/attendance".
 *     The help-audit CI script validates these against the real route tree.
 *   - Run `npx ts-node scripts/help-audit.ts` (or `npm run help-audit`) after
 *     every change to this file to catch stale routes and keyword collisions.
 */

export interface HelpEntry {
  /** Stable unique id — never change once shipped (referenced in audit logs). */
  id: string;
  /**
   * Lowercase words/phrases scored against the user's message.
   * At least 2 per entry (enforced by CI).  Add synonyms liberally.
   */
  keywords: string[];
  /**
   * Roles that can perform this action.
   * Empty array = applies to every role (e.g. password reset).
   * Valid values: "principal" | "teacher" | "staff" | "parent" | "student"
   */
  roles: string[];
  /** Canonical question shown in disambiguation and "Did you mean…" prompts. */
  question: string;
  /**
   * Short numbered steps using real page/button labels.
   * Markdown bold (**) is rendered in the chat UI.
   */
  answer: string;
  /**
   * App route this entry refers to, e.g. "/principal/attendance".
   * Validated by scripts/help-audit.ts — must match an actual page.tsx path.
   * Omit only for cross-cutting topics (e.g. password reset) that have no
   * single page.
   */
  route?: string;
}

// ---------------------------------------------------------------------------
// Curated help entries
// ---------------------------------------------------------------------------
// NOTE TO MIGUEL: these are accurate stubs based on the real Bidii route tree.
// Please verify each `answer` block against the live UI and correct any
// button/menu labels that don't match before going to production.
// Add new entries here as users ask questions not covered — the CI script
// will keep you honest about stale routes.
// ---------------------------------------------------------------------------

export const HELP_CONTENT: HelpEntry[] = [

  // ── ATTENDANCE ───────────────────────────────────────────────────────────

  {
    id: "mark-attendance",
    keywords: [
      "mark attendance", "take attendance", "record attendance",
      "mark present", "mark absent", "attendance register",
    ],
    roles: ["teacher", "principal", "staff"],
    question: "How do I mark attendance for my class?",
    answer: `1. Go to **Attendance** in the left sidebar.
2. Select your class from the class list.
3. Today's date is pre-selected — change it if needed using the date picker.
4. Click **Present** or **Absent** next to each student's name.
5. Click **Save attendance** when done.`,
    route: "/principal/attendance",
  },

  {
    id: "view-attendance-report",
    keywords: [
      "attendance report", "attendance history", "attendance record",
      "view attendance", "check attendance", "attendance summary",
    ],
    roles: ["principal", "staff"],
    question: "How do I view the school's attendance report?",
    answer: `1. Go to **Attendance** in the left sidebar.
2. Click the **Reports** tab at the top of the page.
3. Use the **Class**, **Date range**, and **Status** filters to narrow results.
4. Click **Export** (top right) to download the filtered data as a CSV.`,
    route: "/principal/attendance",
  },

  // ── STUDENTS ─────────────────────────────────────────────────────────────

  {
    id: "add-student",
    keywords: [
      "add student", "register student", "enrol student", "new student",
      "admit student", "create student", "student registration",
    ],
    roles: ["principal", "staff"],
    question: "How do I add a new student?",
    answer: `1. Go to **Students** in the left sidebar.
2. Click the **+ Add student** button (top right).
3. Fill in the student's name, admission number, class, and date of birth.
4. Add parent / guardian contact details in the **Parent** section.
5. Click **Save student** to create the record.`,
    route: "/principal/students",
  },

  {
    id: "view-student-profile",
    keywords: [
      "student profile", "view student", "student details", "student record",
      "find student", "search student",
    ],
    roles: ["principal", "staff", "teacher"],
    question: "How do I view a student's profile?",
    answer: `1. Go to **Students** in the left sidebar.
2. Use the **Search** bar to find the student by name or admission number.
3. Click the student's name row to open their full profile.
4. The profile shows personal details, class, attendance, marks, and more.`,
    route: "/principal/students",
  },

  // ── ASSESSMENTS / MARKS ──────────────────────────────────────────────────

  {
    id: "enter-marks",
    keywords: [
      "enter marks", "add marks", "record marks", "enter grades",
      "add scores", "enter results", "fill marksheet", "marksheet",
    ],
    roles: ["teacher", "principal", "staff"],
    question: "How do I enter marks / scores for my students?",
    answer: `1. Go to **Assessments** in the left sidebar.
2. Select the **Assessment period** (e.g. Term 1 End of Term).
3. Click your class and then the subject you want to enter marks for.
4. Type each student's score in the marks column.
5. Click **Save marks** — a green tick confirms the save.`,
    route: "/principal/assessments",
  },

  {
    id: "generate-report-card",
    keywords: [
      "report card", "generate report", "print report", "report cards",
      "download report card", "student report", "end of term report",
    ],
    roles: ["principal", "staff"],
    question: "How do I generate and print report cards?",
    answer: `1. Go to **Assessments → Report Cards** in the left sidebar.
2. Select the **Assessment period** and the **Class** you want.
3. Review the marks preview — fix any missing scores first.
4. Click **Generate report cards** to produce the PDF batch.
5. Click **Download PDF** or **Print** to get the final report cards.`,
    route: "/principal/assessments/report-cards",
  },

  // ── TIMETABLE ────────────────────────────────────────────────────────────

  {
    id: "view-timetable",
    keywords: [
      "view timetable", "see timetable", "check timetable",
      "my timetable", "class timetable", "school timetable", "schedule",
    ],
    roles: ["teacher", "principal", "staff", "student"],
    question: "How do I view the timetable?",
    answer: `1. Go to **Timetable** in the left sidebar.
2. Use the **Class** or **Teacher** selector at the top to choose whose timetable to view.
3. The weekly grid shows all lessons, subjects, and rooms.
4. Use the **Print** button (top right) to get a printable version.`,
    route: "/principal/timetable",
  },

  // ── PARENT ───────────────────────────────────────────────────────────────

  {
    id: "parent-view-results",
    keywords: [
      "view results", "check results", "see grades", "my child results",
      "exam results", "marks results", "academic results",
    ],
    roles: ["parent"],
    question: "How do I check my child's exam results?",
    answer: `1. Go to **Results** in the left sidebar (or tap **Results** on the bottom tab bar on mobile).
2. Your child's most recent assessment results are shown by subject.
3. Tap a subject row to see the full marks breakdown.
4. Use the **Term** dropdown to view results from a previous term.`,
    route: "/parent/results",
  },

  {
    id: "parent-view-attendance",
    keywords: [
      "child attendance", "my child absent", "check attendance", "attendance record",
      "how many times absent", "attendance history",
    ],
    roles: ["parent"],
    question: "How do I check my child's attendance record?",
    answer: `1. Go to **Attendance** in the left sidebar.
2. Your child's attendance calendar is shown with colour-coded days (green = present, red = absent).
3. Use the **Month** arrows to browse previous months.
4. The summary at the top shows total present/absent days and attendance percentage.`,
    route: "/parent/attendance",
  },

  // ── ACCOUNT / PASSWORD ───────────────────────────────────────────────────

  {
    id: "reset-password",
    keywords: [
      "reset password", "forgot password", "change password",
      "can't log in", "cannot login", "lost password", "new password",
    ],
    roles: [],          // all roles
    question: "How do I reset or change my password?",
    answer: `**If you know your current password:**
1. Click your profile avatar (top-right corner).
2. Select **Profile** from the dropdown.
3. Click **Change password**, enter your current and new password, then **Save**.

**If you have forgotten your password:**
1. On the login page, click **Forgot password?**
2. Enter your email address and click **Send reset link**.
3. Check your email for the reset link (check spam if it doesn't arrive).
4. Click the link and enter a new password.`,
  },

  // ── LIBRARY ──────────────────────────────────────────────────────────────

  {
    id: "issue-library-book",
    keywords: [
      "issue book", "borrow book", "lend book", "library issue",
      "check out book", "library borrow", "issue library",
    ],
    roles: ["principal", "staff"],
    question: "How do I issue a library book to a student?",
    answer: `1. Go to **Library** in the left sidebar.
2. Click **Issue book** (or scan the student's library card / QR code).
3. Search for the student by name or admission number.
4. Search for the book by title, ISBN, or barcode.
5. Click **Issue** — the due date is set automatically based on library settings.`,
    route: "/principal/library",
  },

  // ── COMMUNICATION ────────────────────────────────────────────────────────

  {
    id: "send-sms-message",
    keywords: [
      "send sms", "send message", "bulk sms", "send notification",
      "message parents", "communicate parents", "send alert",
    ],
    roles: ["principal", "staff"],
    question: "How do I send an SMS or message to parents?",
    answer: `1. Go to **Communication** in the left sidebar.
2. Click **New message** (top right).
3. Choose your recipients: **All parents**, **By class**, or **By student**.
4. Type your message in the text box (character count shown below).
5. Click **Send now** to dispatch immediately, or **Schedule** to send later.`,
    route: "/principal/communication",
  },

];

// ---------------------------------------------------------------------------
// Lookup helper — used by help.ts and tests
// ---------------------------------------------------------------------------

/** Returns the entry with the given id, or undefined. */
export function getHelpEntry(id: string): HelpEntry | undefined {
  return HELP_CONTENT.find((e) => e.id === id);
}
