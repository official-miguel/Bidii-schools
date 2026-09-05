# Requirements Document

## Introduction

The Diary Module enables subject teachers in the Bidii School Management System to post assignments, homework, revision tasks, projects, and announcements to the classes they teach. Entries surface in student and parent dashboards under a unified `/parent/diary` route that branches on the viewer's role. The module prioritises speed — a teacher must be able to post a standard assignment in under 30 seconds — while enforcing strict per-school, per-teacher data isolation. Attachments are out of scope for v1. Plain textarea is used for all text input; no rich-text library is introduced.

## Glossary

- **DiaryEntry**: A record created by a Teacher containing a title, instructions, entry type, subject, one or more target classes, and an optional due date.
- **DiaryTarget**: A join record linking a DiaryEntry to a specific SchoolClass.
- **DiaryRecipient**: A per-student record derived from DiaryEntry targets, tracking completion status (PENDING, COMPLETED, OVERDUE).
- **DiaryNotification**: A notification record sent to a student's User account and/or the parent User whose email matches `Student.parentContact` when a new DiaryEntry is posted.
- **DiaryEntryType**: Enumeration of entry purposes — ASSIGNMENT, HOMEWORK, REVISION, PROJECT, ANNOUNCEMENT.
- **DiaryRecipientStatus**: Enumeration of a student's completion state — PENDING, COMPLETED, OVERDUE.
- **Teacher**: A staff member with role TEACHER whose class–subject assignments are stored in `ClassSubjectTeacher` and `ClassElectiveGroupTeacher`.
- **ClassSubjectTeacher**: The authoritative table linking a Teacher to a (classId, subjectId) pair for non-elective subjects.
- **ClassElectiveGroupTeacher**: The authoritative table linking a Teacher to a (classId, subjectId) pair for elective subjects.
- **SchoolClass**: A class entity scoped to a school, identified by id, name, form, and stream.
- **Subject**: A subject entity scoped to a school, identified by id, name, and code.
- **Student**: A learner record with a classId, optional userId, parentContact email, and schoolId.
- **Parent**: A User with role PARENT whose email matches one or more `Student.parentContact` values, or whose id matches `Student.userId` (via the parent relationship).
- **AuthorizedClass**: A (classId, subjectId) pair present in the Teacher's ClassSubjectTeacher or ClassElectiveGroupTeacher records.
- **Soft Delete**: Setting `DiaryEntry.deletedAt` to the current timestamp; the entry is excluded from all normal queries.
- **Diary Hub**: The navigation section added to the teacher sidebar and parent sidebar for accessing diary features.
- **Module**: The `Module` enum in `prisma/schema.prisma`; `DIARY` is added as a new value.
- **NavHub**: The TypeScript union type in `src/lib/permissions.ts` that controls sidebar navigation; `"diary"` is added as a new member.

---

## Requirements

### Requirement 1 — Schema and Navigation Bootstrap

**User Story:** As a developer, I want the Diary Module's Prisma models and navigation entries registered in the codebase, so that all other diary features have a stable data layer and routing foundation.

#### Acceptance Criteria

1. THE System SHALL add `DIARY` to the `Module` enum in `prisma/schema.prisma`.
2. THE System SHALL add the `DiaryEntry`, `DiaryTarget`, `DiaryRecipient`, and `DiaryNotification` models to `prisma/schema.prisma` exactly as specified in the feature context, with all relations, indexes, and unique constraints included.
3. THE System SHALL add `"diary"` to the `NavHub` type union in `src/lib/permissions.ts`.
4. THE System SHALL add a `DIARY` entry to `MODULE_INFO` in `src/lib/permissions.ts`.
5. THE System SHALL add diary hub definitions to `HUB_DEFS` and `HUB_SEG_MAP` in `src/components/HubSidebar.tsx`.
6. THE System SHALL add `visibleHubs.add("diary")` to the teacher layout in `src/app/teacher/layout.tsx`.
7. THE System SHALL add `"diary"` to `PARENT_HUBS` in `src/app/parent/layout.tsx`.

---

### Requirement 2 — Teacher: Diary Home Page

**User Story:** As a teacher, I want a diary home page that shows my recent entries and upcoming due dates, so that I can monitor my posted work at a glance.

#### Acceptance Criteria

1. WHEN a Teacher navigates to `/teacher/diary`, THE DiaryHomePage SHALL display a page header, a "+ New Entry" action, a "Due Soon" section, and a "Recent Entries" list.
2. WHEN the DiaryHomePage fetches entries, THE DiaryHomePage SHALL return only DiaryEntry records where `schoolId` equals the Teacher's `schoolId`, `teacherId` equals the Teacher's id, and `deletedAt` IS NULL.
3. WHEN the DiaryHomePage renders the entry list, THE DiaryHomePage SHALL support filtering by DiaryEntryType (ASSIGNMENT, HOMEWORK, REVISION, PROJECT, ANNOUNCEMENT).
4. WHEN no entries exist for the Teacher, THE DiaryHomePage SHALL display a helpful empty state with a call-to-action to create the first entry.
5. WHILE the DiaryHomePage is loading data, THE DiaryHomePage SHALL display skeleton card placeholders in place of actual entry cards.
6. THE DiaryHomePage SHALL apply pagination (maximum 20 entries per page) to the Recent Entries list using cursor-based or offset pagination.

---

### Requirement 3 — Teacher: Create Diary Entry

**User Story:** As a teacher, I want to post a new diary entry in under 30 seconds, so that my students receive their assignments without disrupting my workflow.

#### Acceptance Criteria

1. WHEN a Teacher activates "+ New Entry", THE CreateEntryForm SHALL present a DiaryEntryType selector with 5 large-tile options: ASSIGNMENT, HOMEWORK, REVISION, PROJECT, ANNOUNCEMENT.
2. WHEN a Teacher selects a DiaryEntryType, THE CreateEntryForm SHALL set the Post button label to "Post [TypeLabel]" where TypeLabel is the human-readable name of the selected type (e.g., "Post Assignment").
3. WHEN a Teacher opens the CreateEntryForm, THE CreateEntryForm SHALL populate the subject selector only with Subject records linked to the Teacher via ClassSubjectTeacher or ClassElectiveGroupTeacher for the Teacher's schoolId.
4. WHERE a Teacher is assigned to exactly one subject, THE CreateEntryForm SHALL hide the subject selector and use that subject automatically.
5. WHEN a Teacher selects a subject, THE CreateEntryForm SHALL populate the class selector with only the SchoolClass records that form an AuthorizedClass pair with the selected subject for that Teacher.
6. THE CreateEntryForm SHALL include a title field (required, plain text, maximum 255 characters).
7. THE CreateEntryForm SHALL include a plain textarea for instructions (no rich-text library).
8. WHEN the selected DiaryEntryType is not ANNOUNCEMENT, THE CreateEntryForm SHALL display a due date field.
9. WHEN the selected DiaryEntryType is ANNOUNCEMENT, THE CreateEntryForm SHALL hide the due date field.
10. THE CreateEntryForm SHALL include a recipient toggle with "Everyone" (default) and "Specific Students" options.
11. WHEN a Teacher submits the form with valid data, THE DiaryEntryService SHALL create one DiaryEntry record, one DiaryTarget record per selected class, and one DiaryRecipient record per Student in those classes.
12. WHEN the Teacher submits the form with the title field empty, THE CreateEntryForm SHALL display an inline validation error on the title field and SHALL NOT submit the form.
13. WHEN a Teacher submits a form containing a classId not present in the Teacher's AuthorizedClass set, THE DiaryEntryService SHALL reject the request with an error and SHALL NOT create any diary records.
14. WHEN a Teacher submits a form targeting specific students, THE DiaryEntryService SHALL verify that each specified studentId belongs to one of the targeted classes; IF a studentId does not belong to a targeted class, THEN THE DiaryEntryService SHALL reject the request with an error and SHALL NOT create any diary records.
15. IF a database error occurs during DiaryEntry creation, THEN THE DiaryEntryService SHALL return a human-readable error message and SHALL NOT expose Prisma error details to the client.

---

### Requirement 4 — Teacher: Entry Detail Page

**User Story:** As a teacher, I want to view the details and completion statistics of a posted diary entry, so that I can track student progress and manage individual statuses.

#### Acceptance Criteria

1. WHEN a Teacher navigates to a DiaryEntry detail page, THE EntryDetailPage SHALL display the entry's title, subject name, class name(s), posted date, due date (if present), and instructions.
2. WHEN the EntryDetailPage loads, THE EntryDetailPage SHALL display completion statistics showing the count of DiaryRecipient records in COMPLETED, PENDING, and OVERDUE status for that entry.
3. WHEN the EntryDetailPage loads the student list, THE EntryDetailPage SHALL paginate results at 20 students per page and display each student's full name and current DiaryRecipientStatus.
4. WHEN a Teacher searches by student name in the EntryDetailPage, THE EntryDetailPage SHALL filter the displayed student list to those whose fullName contains the search string.
5. WHEN a Teacher filters by DiaryRecipientStatus in the EntryDetailPage, THE EntryDetailPage SHALL display only DiaryRecipient records matching the selected status.
6. WHEN a Teacher marks a student as complete, THE DiaryEntryService SHALL update the DiaryRecipient record for that student to status COMPLETED and set `completedAt` to the current timestamp.
7. WHEN a Teacher accesses the detail page of a DiaryEntry not belonging to the Teacher's schoolId or teacherId, THE EntryDetailPage SHALL return a 404 response.

---

### Requirement 5 — Teacher: Edit Diary Entry

**User Story:** As a teacher, I want to edit an existing diary entry's title, instructions, and due date, so that I can correct mistakes or update deadlines after posting.

#### Acceptance Criteria

1. WHEN a Teacher opens the edit form for a DiaryEntry, THE EditEntryForm SHALL pre-populate the title, instructions, and due date fields with the current values.
2. THE EditEntryForm SHALL allow changes only to the title, instructions, and due date fields; subject, class targets, and entry type SHALL NOT be editable after creation.
3. WHEN a Teacher saves edits, THE DiaryEntryService SHALL update the DiaryEntry record's `title`, `description`, `dueDate`, and `updatedAt` fields.
4. WHEN a DiaryEntry has been edited, THE EntryDetailPage SHALL display an "Edited [relative time]" indicator alongside the entry metadata.
5. WHEN a Teacher attempts to edit a DiaryEntry belonging to a different Teacher or a different schoolId, THE DiaryEntryService SHALL reject the request with an authorisation error.

---

### Requirement 6 — Teacher: Soft Delete Diary Entry

**User Story:** As a teacher, I want to delete a diary entry, so that it no longer appears in student or parent views.

#### Acceptance Criteria

1. WHEN a Teacher deletes a DiaryEntry, THE DiaryEntryService SHALL set `deletedAt` to the current timestamp on that record and SHALL NOT permanently remove the database row.
2. WHEN the DiaryEntryService sets `deletedAt`, THE DiaryEntry SHALL be excluded from all diary list queries, detail queries, and recipient views across all roles.
3. WHEN a Teacher attempts to delete a DiaryEntry belonging to a different Teacher or a different schoolId, THE DiaryEntryService SHALL reject the request with an authorisation error.

---

### Requirement 7 — Student View (`/parent/diary`)

**User Story:** As a student, I want to see my assigned diary entries grouped by status, so that I can prioritise what needs my attention.

#### Acceptance Criteria

1. WHEN a User with role STUDENT navigates to `/parent/diary`, THE DiaryPage SHALL render the student view branch.
2. THE StudentDiaryView SHALL display diary entries grouped into four sections: New, Due Soon, Completed, and Overdue.
3. WHEN the StudentDiaryView renders an entry card, THE StudentDiaryView SHALL show the subject name, entry title, and due date (if present).
4. THE StudentDiaryView SHALL only display DiaryRecipient records where `studentId` corresponds to the authenticated Student and the linked DiaryEntry has `deletedAt` IS NULL.
5. IF the Student has no diary entries, THEN THE StudentDiaryView SHALL display a helpful empty state message.
6. WHILE the StudentDiaryView is loading, THE StudentDiaryView SHALL display skeleton card placeholders.

---

### Requirement 8 — Parent View (`/parent/diary`)

**User Story:** As a parent, I want to see my children's diary entries with completion status, so that I can support my children's academic progress.

#### Acceptance Criteria

1. WHEN a User with role PARENT navigates to `/parent/diary`, THE DiaryPage SHALL render the parent view branch.
2. THE ParentDiaryView SHALL identify the parent's children as Students where `Student.parentContact` equals the parent User's email OR `Student.userId` equals the parent User's id.
3. WHEN a parent has exactly one child, THE ParentDiaryView SHALL display that child's name, class name, and a count of new diary entries.
4. WHEN a parent has more than one child, THE ParentDiaryView SHALL display a child switcher and show diary entries for the selected child.
5. WHEN the ParentDiaryView renders an entry card, THE ParentDiaryView SHALL display the subject name, entry title, due date (if present), and the child's DiaryRecipientStatus badge.
6. THE ParentDiaryView SHALL only display DiaryRecipient records for the authenticated parent's children and SHALL NOT expose diary entries belonging to other students.
7. IF a parent has no linked children, THEN THE ParentDiaryView SHALL display a helpful empty state message.

---

### Requirement 9 — Notifications

**User Story:** As a student or parent, I want to receive a notification when a teacher posts a new diary entry, so that I am promptly informed of new assignments.

#### Acceptance Criteria

1. WHEN a new DiaryEntry is successfully created, THE DiaryNotificationService SHALL create one DiaryNotification record for each Student in the DiaryRecipient list who has a non-null `userId`.
2. WHEN a new DiaryEntry is successfully created, THE DiaryNotificationService SHALL create one DiaryNotification record for each User whose email matches the `parentContact` of any Student in the DiaryRecipient list.
3. WHEN creating a DiaryNotification, THE DiaryNotificationService SHALL set the message to: "📚 New [SubjectName] [TypeLabel] — [StudentFirstName] has a new [SubjectName] [typeLabelLower]. Due [dueDay]." where `dueDay` is the formatted due date, or omit the "Due [dueDay]" segment when no due date is set.
4. WHEN a new DiaryEntry is of type ANNOUNCEMENT, THE DiaryNotificationService SHALL omit the "Due [dueDay]" segment from every notification message regardless of whether a due date is stored.
5. THE DiaryNotification record SHALL include: `id`, `schoolId`, `diaryEntryId`, `userId`, `message`, `isRead` (default false), and `createdAt`.
6. IF notification creation fails for one or more recipients, THEN THE DiaryNotificationService SHALL log the failure and SHALL NOT roll back the DiaryEntry creation.

---

### Requirement 10 — Security and Data Isolation

**User Story:** As a school administrator, I want all diary data strictly scoped to the correct school and user, so that no cross-school or cross-role data leakage occurs.

#### Acceptance Criteria

1. THE DiaryEntryService SHALL scope every database query with a `schoolId` clause equal to the authenticated user's `schoolId`.
2. WHEN a Teacher creates a DiaryEntry, THE DiaryEntryService SHALL verify that every classId in the request forms an AuthorizedClass pair (via ClassSubjectTeacher or ClassElectiveGroupTeacher) for that Teacher; IF any classId is not authorised, THEN THE DiaryEntryService SHALL reject the entire request.
3. THE StudentDiaryView SHALL only query DiaryRecipient records where `studentId` corresponds to the authenticated Student.
4. THE ParentDiaryView SHALL only query DiaryRecipient records where the linked Student's `parentContact` equals the authenticated parent's email or the linked Student's `userId` equals the authenticated parent's id.
5. WHEN a Teacher queries DiaryEntry records, THE DiaryEntryService SHALL filter by `teacherId` equal to the authenticated Teacher's id.
6. THE System SHALL exclude all DiaryEntry records where `deletedAt` IS NOT NULL from every query issued to teachers, students, and parents.

---

### Requirement 11 — Performance

**User Story:** As a system operator, I want the diary module to perform efficiently even in large schools, so that response times remain acceptable under load.

#### Acceptance Criteria

1. THE DiaryEntryService SHALL never load all Student records for a school; student retrieval SHALL be scoped to the classId(s) targeted by a specific DiaryEntry.
2. THE DiaryHomePage, EntryDetailPage, and StudentDiaryView SHALL paginate all list queries at a maximum of 20 records per request using cursor-based or offset pagination.
3. THE System SHALL maintain a database index on `(schoolId, deletedAt)` for the DiaryEntry table.
4. THE System SHALL maintain a database index on `(teacherId)` for the DiaryEntry table.
5. THE System SHALL maintain a database index on `(studentId, status)` for the DiaryRecipient table.
6. THE System SHALL maintain database indexes on `(userId, isRead)` and `(schoolId, createdAt)` for the DiaryNotification table.

---

### Requirement 12 — UX and Accessibility

**User Story:** As a teacher or student using a mobile device, I want the diary module to be fast and easy to interact with on a small screen, so that I can use it comfortably without a desktop.

#### Acceptance Criteria

1. THE DiaryModule SHALL apply a mobile-first layout with touch targets meeting a minimum size of 44×44 CSS pixels for all interactive elements.
2. THE CreateEntryForm SHALL use a plain `<textarea>` element for the instructions field and SHALL NOT introduce any rich-text editor library.
3. WHEN a server-side or database error occurs, THE DiaryModule SHALL display a human-readable error message and SHALL NOT expose raw Prisma error text or stack traces to the user.
4. WHILE any diary page is fetching data, THE DiaryModule SHALL display skeleton card placeholders to communicate loading state.
5. WHEN a diary list or section is empty, THE DiaryModule SHALL display an empty state message with a contextually relevant call-to-action.
6. WHEN the selected DiaryEntryType changes, THE CreateEntryForm SHALL update the Post button label in real time to reflect the current type (e.g., "Post Homework", "Post Announcement").
