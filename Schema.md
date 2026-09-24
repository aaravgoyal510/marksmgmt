# Schema.md — Database Schema (Prisma / PostgreSQL)

## 1. Entity Overview

```
User (STUDENT | FACULTY | ADMIN)
  ├── StudentProfile (1:1, if role=STUDENT)
  └── FacultyProfile (1:1, if role=FACULTY or ADMIN-with-teaching, incl. HOD flag)

Department (= Program)
  ├── Batch (many)
  │     └── StudentProfile (many, via batchId + sectionId)
  ├── Subject (many)
  └── HODAssignment (FacultyProfile ↔ Department)

Section (free-text, scoped to a Batch)

AcademicTerm (Department + semesterNumber + label, auto-created on batch promotion)
  └── SubjectOffering (Subject within this term)
        ├── GradingPolicy (1:1)
        │     ├── ScoreComponent (many — CES + Internal, generic)
        │     └── AttendanceSlabRange (many)
        └── SubjectOfferingSection (many — one per Section, own Faculty)
              ├── Mark (many, per student per ScoreComponent)
              └── AttendanceRecord (many, per student — latest snapshot only)

Query (student ↔ Faculty ↔ HOD, scoped to a SubjectOfferingSection + optional ScoreComponent)
AuditLog (tracks Mark edits)
Notification (per user)
```

## 2. Tables

### User
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| username | String | unique — ERP No (student) or Employee ID (faculty/admin) |
| passwordHash | String | bcrypt; randomly generated at creation, ambiguous chars excluded |
| role | Enum(STUDENT, FACULTY, ADMIN) | |
| email | String | nullable, required for self-service reset |
| phone | String | nullable |
| profilePicUrl | String | nullable, Supabase Storage |
| createdAt | DateTime | |

### StudentProfile
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| userId | UUID (FK → User, unique) | |
| name | String | |
| erpNo | String | unique |
| prn | String | unique |
| batchId | UUID (FK → Batch) | |
| sectionId | UUID (FK → Section) | |
| semesterOverride | Int | nullable — for repeaters, overrides batch's currentSemester |

### FacultyProfile
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| userId | UUID (FK → User, unique) | |
| name | String | |
| employeeId | String | unique |
| homeDepartmentId | UUID (FK → Department) | nullable |

### HODAssignment
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| facultyId | UUID (FK → FacultyProfile) | |
| departmentId | UUID (FK → Department) | |
| unique constraint | (departmentId) | one HOD per department at a time |

### Department
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| name | String | e.g. "BCA" |
| totalSemesters | Int | e.g. 6, 4, 8 — drives batch duration and semester bounds |

### Batch
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| departmentId | UUID (FK → Department) | |
| label | String | e.g. "2025-28" |
| startYear | Int | |
| currentSemester | Int | promotable (1..department.totalSemesters), whole-batch action |

### Section
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| batchId | UUID (FK → Batch) | |
| name | String | free text, e.g. "M", "AFT" |

### Subject
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| departmentId | UUID (FK → Department) | |
| name | String | |
| code | String | unique per department |
| semesterNumber | Int | which semester this subject belongs to |

### AcademicTerm
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| departmentId | UUID (FK → Department) | |
| semesterNumber | Int | |
| label | String | e.g. "AY2026-27" |
| createdAt | DateTime | auto-created on first batch promotion into this dept+semester; reused if it already exists |
| unique constraint | (departmentId, semesterNumber, label) | |

### SubjectOffering
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| subjectId | UUID (FK → Subject) | |
| academicTermId | UUID (FK → AcademicTerm) | |
| unique constraint | (subjectId, academicTermId) | |

### GradingPolicy
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| subjectOfferingId | UUID (FK, unique) | 1:1 — shared across all sections of this offering |
| cesGroupWeightage | Float | target combined weightage for all CES components, e.g. 10 |
| internalWeightage | Float | target weightage for internal exam, e.g. 20 |
| attendanceWeightage | Float | max marks attendance contributes, e.g. 10 |
| confirmedAt | DateTime | nullable — null = not yet confirmed, section stays locked |
| confirmedByFacultyId | UUID (FK → FacultyProfile) | the HOD who confirmed it |

`totalIAMarks` is **not stored** — always computed as `cesGroupWeightage + internalWeightage + attendanceWeightage`, displayed live in the policy builder, never a hardcoded constant.

### ScoreComponent (generic — covers both CES and Internal)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| gradingPolicyId | UUID (FK → GradingPolicy) | |
| group | Enum(CES, INTERNAL) | |
| name | String | e.g. "CES-I", "Internal Exam" |
| maxMarks | Float | e.g. 10, or 40/50 for internal |
| order | Int | display order |

### AttendanceSlabRange
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| gradingPolicyId | UUID (FK → GradingPolicy) | |
| minPercent | Float | inclusive |
| maxPercent | Float | inclusive |
| marks | Float | out of `attendanceWeightage` |

A % that falls in a gap between ranges is **not covered** — import blocks that row (see AttendanceRecord notes). Validated for gaps/overlaps live in the HOD policy builder UI.

### SubjectOfferingSection
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| subjectOfferingId | UUID (FK → SubjectOffering) | |
| sectionId | UUID (FK → Section) | |
| facultyId | UUID (FK → FacultyProfile) | nullable — null = unassigned, locked |
| unique constraint | (subjectOfferingId, sectionId) | |

**Locking rule**: marks entry and attendance import for a SubjectOfferingSection require `facultyId IS NOT NULL` **and** its parent GradingPolicy's `confirmedAt IS NOT NULL`.

### Mark
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| scoreComponentId | UUID (FK → ScoreComponent) | |
| studentId | UUID (FK → StudentProfile) | |
| marksObtained | Float | |
| updatedAt | DateTime | |
| updatedByFacultyId | UUID (FK → FacultyProfile) | |
| unique constraint | (scoreComponentId, studentId) | |

### AttendanceRecord
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| subjectOfferingSectionId | UUID (FK) | |
| studentId | UUID (FK → StudentProfile) | |
| attendancePercent | Float | |
| updatedAt | DateTime | latest snapshot overwrites — no history table |
| unique constraint | (subjectOfferingSectionId, studentId) | |

### Query
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| studentId | UUID (FK → StudentProfile) | |
| subjectOfferingSectionId | UUID (FK) | |
| scoreComponentId | UUID (FK → ScoreComponent) | nullable — may target attendance instead of a specific mark |
| message | String | |
| status | Enum(OPEN, ESCALATED, RESOLVED) | |
| facultyId | UUID (FK → FacultyProfile) | first-line owner |
| hodId | UUID (FK → FacultyProfile) | nullable, set on escalation |
| createdAt | DateTime | |
| resolvedAt | DateTime | nullable |

### QueryMessage (thread)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| queryId | UUID (FK → Query) | |
| authorUserId | UUID (FK → User) | |
| message | String | |
| createdAt | DateTime | |

### AuditLog
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| entityType | String | e.g. "Mark" |
| entityId | UUID | |
| changedByUserId | UUID (FK → User) | |
| oldValue | String | |
| newValue | String | |
| changedAt | DateTime | |

### Notification
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| userId | UUID (FK → User) | |
| type | String | e.g. "QUERY_REPLY", "MARKS_PUBLISHED", "IMPORT_BLOCKED", "OFFERING_UNLOCKED" |
| message | String | |
| link | String | nullable |
| isRead | Boolean | default false |
| createdAt | DateTime | |

## 3. Key Computed Values (never stored, always computed on read)
```
groupScore(group) = (Σ marksObtained for Marks in that group) / (Σ maxMarks for ScoreComponents in that group)
                     × groupWeightage(group)

attendanceScore(student) = lookup AttendanceRecord.attendancePercent in AttendanceSlabRange
                            → if no matching range: import was already blocked, this state shouldn't occur

totalIA(student, subjectOffering) = groupScore(CES) + groupScore(INTERNAL) + attendanceScore(student)
```
This keeps the entire grading formula out of the database and out of hardcoded logic — it's a pure function over `GradingPolicy` + `ScoreComponent` + `Mark` + `AttendanceSlabRange` + `AttendanceRecord`, so a subject can change its CES count, max marks, or attendance bands from one semester to the next without touching code.

## 4. Indexes to Add
- `Mark(studentId)`, `Mark(scoreComponentId)`
- `AttendanceRecord(studentId)`, `AttendanceRecord(subjectOfferingSectionId)`
- `AuditLog(entityType, entityId)`
- `Query(status)`, `Query(facultyId)`, `Query(hodId)`
- `SubjectOfferingSection(facultyId)` — for Faculty dashboard's "my sections" lookup
- `StudentProfile(batchId, sectionId)`

## 5. Deferred (Later Update)
- **Bulk student import** table/format: left unspecified pending the real CSV Aarav will provide. Expected to at minimum populate `StudentProfile` (erpNo, prn, name), create the `User` record with a generated password, and assign `sectionId` at import time — but exact column mapping TBD.
