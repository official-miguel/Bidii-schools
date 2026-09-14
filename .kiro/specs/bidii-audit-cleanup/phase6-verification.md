# Phase 6 — Verification Checklist

**Date generated:** 2026-09-14  
**Spec:** bidii-audit-cleanup  
**Covers:** All Phase 3 fixes (Groups 1–7) applied during tasks 5–11

---

## How to Use This Document

1. Open the app in a browser against a test school with real credentials.
2. Ensure `DEV_BYPASS_AUTH` is **unset** for all tests.
3. Work through each role section in order.
4. For every test case: perform the action, record Pass/Fail, add notes if needed.
5. Complete the sign-off table at the end before closing the audit spec.

---

## PRINCIPAL Role

### Fix-Verification Tests

| TC-ID | Fix Ref | Navigation Path | Action | Expected Result |
|---|---|---|---|---|
| TC-P-01 | E1/E2 (root error boundaries) | Trigger a server error (e.g. visit `/api/nonexistent`) | Observe the error page | Branded Bidii error page renders with "Try again" button — NOT a blank screen or raw Next.js 500 |
| TC-P-02 | E3 (not-found boundary) | Visit any invalid URL, e.g. `/principal/does-not-exist` | Observe the 404 page | Branded Bidii 404 page renders with navigation back to dashboard |
| TC-P-03 | E4 (principal error boundary) | In principal portal, navigate to any page and simulate a crash (or visit a broken route) | Observe the error boundary | Branded principal-portal error card renders with "Try again" and "Back to dashboard" buttons |
| TC-P-04 | C14 (`/principal/finance/payments`) | From principal portal, use global search or navigate to `/principal/finance/payments` | Page loads | Redirects to `/staff/finance/payments` (or renders the principal finance page) without a 404 |
| TC-P-05 | C15 (`/principal/finance/debtors`) | Navigate to `/principal/finance/debtors` | Page loads | Redirects correctly, no 404 |
| TC-P-06 | C16 (`/principal/finance/fee-structures`) | Navigate to `/principal/finance/fee-structures` | Page loads | Redirects correctly, no 404 |
| TC-P-07 | C17 (`/principal/finance/reports`) | Navigate to `/principal/finance/reports` | Page loads | Redirects correctly, no 404 |
| TC-P-08 | C18 (`/principal/finance/reconciliation`) | Navigate to `/principal/finance/reconciliation` | Page loads | Redirects correctly, no 404 |
| TC-P-09 | B-6 (defence-in-depth) | Visit `/principal` directly while authenticated as PRINCIPAL | Dashboard renders | Principal dashboard loads correctly; no accidental redirect |
| TC-P-10 | Phase 5 / F-04 | Staff → Library → Student Fines | Load fines list as PRINCIPAL | Fines list loads (verifies F-04 didn't break principal access) |

### Regression Tests

| TC-ID | Module | Navigation Path | Action | Expected Result |
|---|---|---|---|---|
| TC-P-R01 | Principal dashboard | `/principal` | Log in as PRINCIPAL | Dashboard renders with all widgets; no blank sections |
| TC-P-R02 | Timetable builder | `/principal/timetable/builder` | Open timetable builder | Builder page loads; version list visible |
| TC-P-R03 | Students | `/principal/students` | View student list | Student list renders; search works |
| TC-P-R04 | Settings AI Config | `/principal/settings` → AI Configuration tab | View AI status card | "Soma AI key active" or "No Soma AI key assigned" shown — NOT "Gemini API key" |

---

## ADMIN_STAFF Role

### Fix-Verification Tests

| TC-ID | Fix Ref | Navigation Path | Action | Expected Result |
|---|---|---|---|---|
| TC-A-01 | E6 (staff error boundary) | Staff portal → navigate to a broken page | Observe error | Branded staff-portal error card with "Try again" button |
| TC-A-02 | C1 (`/staff/library/issue`) | From library dashboard, click "Issue" quick link | Page loads | Redirects to `/staff/library/circulate`; no 404 |
| TC-A-03 | C2 (`/staff/library/return`) | From library dashboard, click "Return" quick link | Page loads | Redirects to `/staff/library/circulate`; no 404 |
| TC-A-04 | C3 (`/staff/library/catalogue`) | Navigate to `/staff/library/catalogue` | Page loads | Redirects to `/staff/library/inventory`; no 404 |
| TC-A-05 | C4 (`/staff/library/fines`) | Navigate to `/staff/library/fines` | Page loads | Redirects to `/staff/library/cards?hasFine=true`; no 404 |
| TC-A-06 | C5 (`/staff/library/copies`) | Navigate to `/staff/library/copies` | Page loads | Redirects to `/staff/library/inventory`; no 404 |
| TC-A-07 | C6 (`/staff/classes`) | HOD dashboard → Classes link | Page loads | Staff classes page or redirect renders; no 404 |
| TC-A-08 | C7 (`/staff/subjects`) | Navigate to `/staff/subjects` | Page loads | No 404 |
| TC-A-09 | C8 (`/staff/assessments`) | Navigate to `/staff/assessments` | Page loads | No 404 |
| TC-A-10 | C9 (`/staff/reports`) | Navigate to `/staff/reports` | Page loads | Redirects to `/staff/finance/reports`; no 404 |
| TC-A-11 | C10 (`/staff/tod`) | Navigate to `/staff/tod` | Page loads | Teacher-on-Duty stub page renders; no 404 |
| TC-A-12 | C11 (`/staff/accommodation`) | Navigate to `/staff/accommodation` | Page loads | No 404 |
| TC-A-13 | C12 (`/staff/accommodation/allocate`) | Navigate to `/staff/accommodation/allocate` | Page loads | No 404 |
| TC-A-14 | C13 (`/staff/accommodation/inspections`) | Navigate to `/staff/accommodation/inspections` | Page loads | No 404 |

### Regression Tests

| TC-ID | Module | Navigation Path | Action | Expected Result |
|---|---|---|---|---|
| TC-A-R01 | Staff dashboard | `/staff` | Log in as ADMIN_STAFF | Staff dashboard renders |
| TC-A-R02 | Library circulate | `/staff/library/circulate` | Open circulation page | Student search and scan controls load correctly |
| TC-A-R03 | Library inventory | `/staff/library/inventory` | Open inventory page | Book list renders; search works |

---

## TEACHER Role

### Fix-Verification Tests

| TC-ID | Fix Ref | Navigation Path | Action | Expected Result |
|---|---|---|---|---|
| TC-T-01 | B-3 (timetable nested layout guard) | Log in as TEACHER → navigate to `/staff/timetable` | Page loads | TEACHER reaches the staff timetable page (no longer bounced to `/login`) |
| TC-T-02 | E5 (teacher error boundary) | Teacher portal → navigate to a broken page | Observe error | Branded teacher-portal error card with "Try again" button |
| TC-T-03 | B-5 (permission map for module-teacher) | Log in as TEACHER with LIBRARY module access → navigate to `/staff/library` | Library page loads | Correct permissions shown; no wrong permission map applied |

### Auth-Redirect Tests

| TC-ID | Fix Ref | Action | Expected Result |
|---|---|---|---|
| TC-T-AUTH-01 | B-3 (middleware / layout guard) | Log out, then visit `/staff/timetable` directly | Redirects to `/login` |

### Regression Tests

| TC-ID | Module | Navigation Path | Action | Expected Result |
|---|---|---|---|---|
| TC-T-R01 | Teacher dashboard | `/teacher` | Log in as TEACHER | Teacher dashboard renders; diary and timetable widgets load |
| TC-T-R02 | Diary | `/teacher/diary` | Open diary | Diary entry list renders |

---

## BURSAR Role

### Fix-Verification Tests

| TC-ID | Fix Ref | Navigation Path | Action | Expected Result |
|---|---|---|---|---|
| TC-B-01 | B-2 (staff page role check) | Log in as BURSAR → navigate to `/staff` | Page loads | BURSAR reaches staff dashboard (no longer bounced to `/login`) |
| TC-B-02 | B-4 (staff directory role check) | Log in as BURSAR → navigate to `/staff/directory` | Page loads | BURSAR reaches the staff directory page |
| TC-B-03 | F-04 (library/students/fines guard) | Log in as BURSAR with LIBRARY.view permission → navigate to library student fines | Fines list loads | BURSAR with LIBRARY.view sees the student fines list (no 401) |

### Auth-Redirect Tests

| TC-ID | Fix Ref | Action | Expected Result |
|---|---|---|---|
| TC-B-AUTH-01 | B-2 (staff page guard) | Log out, then visit `/staff` directly | Redirects to `/login` |

### Regression Tests

| TC-ID | Module | Navigation Path | Action | Expected Result |
|---|---|---|---|---|
| TC-B-R01 | Finance dashboard | `/staff/finance` | Log in as BURSAR | Finance dashboard renders |
| TC-B-R02 | Finance payments | `/staff/finance/payments` | View payments | Payments list renders |

---

## PARENT Role

### Fix-Verification Tests

| TC-ID | Fix Ref | Navigation Path | Action | Expected Result |
|---|---|---|---|---|
| TC-PAR-01 | E7 (parent error boundary) | Parent portal → navigate to a broken sub-route | Observe error | Branded parent-portal error card with "Try again" button |

### Regression Tests

| TC-ID | Module | Navigation Path | Action | Expected Result |
|---|---|---|---|---|
| TC-PAR-R01 | Parent dashboard | `/parent` | Log in as PARENT | Parent dashboard renders; student selector loads |
| TC-PAR-R02 | Diary | `/parent/diary` | Open parent diary | Diary entries for selected student render |

---

## STUDENT Role (via parent portal)

### Fix-Verification Tests

| TC-ID | Fix Ref | Navigation Path | Action | Expected Result |
|---|---|---|---|---|
| TC-STU-01 | B-1 (parent layout role allowlist) | Log in as a STUDENT account → attempt to reach parent portal | Page loads | STUDENT user reaches the parent portal (no longer bounced to `/login` by the layout) |

### Auth-Redirect Tests

| TC-ID | Fix Ref | Action | Expected Result |
|---|---|---|---|
| TC-STU-AUTH-01 | B-1 (parent layout guard) | Log out, then visit `/parent` directly | Redirects to `/login` |

---

## Library Mobile User (Expo App)

### Fix-Verification Tests

| TC-ID | Fix Ref | Screen | Action | Expected Result |
|---|---|---|---|---|
| TC-MOB-01 | D10 (catalogue URL mismatch) | Catalogue tab | Open catalogue list | Books list loads (no longer 404 from `catalogues` → `catalogue` fix) |
| TC-MOB-02 | D10 | Catalogue tab | Search for a book | Search results return correctly |
| TC-MOB-03 | D10 | Add Book screen | Create a new catalogue entry | POST succeeds; book appears in list |
| TC-MOB-04 | D1 (borrow token route) | Scan tab | Scan a LOAN QR code | Borrow details screen appears with student + book info |
| TC-MOB-05 | D2 (card suspend) | Student card screen | Tap "Suspend" on a library card | Card status changes to SUSPENDED |
| TC-MOB-06 | D3 (card unsuspend) | Student card screen | Tap "Reactivate" on a suspended card | Card status changes to ACTIVE |
| TC-MOB-07 | D4 (fines overdue) | Fines tab | Open fines screen | Overdue fines list loads |
| TC-MOB-08 | D5 (fines pay) | Fines tab | Tap "Mark Paid" on a fine | Fine status updates to paid |
| TC-MOB-09 | D6 (fines resume) | Fines tab | Tap "Resume" on a paused fine | Fine resumes accumulating |
| TC-MOB-10 | D7 (reservation fulfill) | Reservations tab | Tap "Fulfill" on a pending reservation | Reservation status updates to fulfilled |
| TC-MOB-11 | D8 (policy update) | Settings screen | Edit and save a library policy | PATCH succeeds; updated policy reflected |
| TC-MOB-12 | D9 (card borrows) | Web library card view | Open a student's library card → Borrows tab | Borrow history list loads (no 404) |
| TC-MOB-13 | C19 (fines stats screen) | Fines tab → Stats link | Navigate to fines statistics | Stats screen renders; no blank screen or crash |
| TC-MOB-14 | E9 (mobile error boundary) | Any screen | Trigger a crash (e.g. invalid prop) | Expo Router renders the `ErrorBoundary` component with a retry button |

### Regression Tests

| TC-ID | Module | Screen | Action | Expected Result |
|---|---|---|---|---|
| TC-MOB-R01 | Auth | Login screen | Log in with valid librarian credentials | Lands on dashboard/tabs |
| TC-MOB-R02 | Scan | Scan tab | Scan a RETURN QR code | Return flow completes correctly |
| TC-MOB-R03 | Browse | Browse tab | Browse catalogue | Book list renders and is scrollable |

---

## Sign-Off

| Item | Status |
|---|---|
| All test cases executed | ☐ |
| No regression found | ☐ |
| Tester name | ___________ |
| Date | ___________ |
