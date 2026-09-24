# Design.md — Visual & Layout Guidelines

## 1. Design Principles
- **Configuration-heavy tool, used in short bursts** — HOD setting up policy, Faculty entering marks between classes, students checking scores once in a while. Prioritize clarity and speed over decoration.
- **Status must be legible without reading numbers** — color-coded pills for attendance thresholds, subject-offering status, and query status.
- **Mobile-first for Faculty flows** (attendance CSV upload, quick mark checks), **desktop-first for HOD policy configuration and Admin management** (denser forms, more fields).

## 2. Color Palette

| Purpose | Color | Hex |
|---|---|---|
| Primary (brand/action) | Deep Indigo | `#3730A3` |
| Primary hover | Indigo 600 | `#4338CA` |
| Success / Active / Resolved / Good attendance | Emerald | `#059669` |
| Warning / Policy Pending / Escalated / Near threshold | Amber | `#D97706` |
| Danger / Unassigned / Blocked import row / Below threshold | Rose | `#DC2626` |
| Neutral background | Slate 50 | `#F8FAFC` |
| Card background | White | `#FFFFFF` |
| Border/divider | Slate 200 | `#E2E8F0` |
| Primary text | Slate 900 | `#0F172A` |
| Secondary text | Slate 500 | `#64748B` |

Status pairs (color + icon, never color alone): ✓ Active/Resolved (emerald), ⏳ Pending/Escalated (amber), ✗ Unassigned/Blocked (rose).

## 3. Typography
- **Font:** Inter — consistent with your Quiz Portal for visual continuity across your project family.
- Scale: 12px (table meta) / 14px (body/table cells) / 16px (form labels) / 20px (card titles) / 28px (page titles).
- Tabular-nums for all numeric columns (marks, %, roll numbers) so grid columns align.

## 4. Layout Patterns

### Student Semester View
- Vertically stacked subject cards, one per current-semester subject, in a single scroll — no tabs.
- Each card: header (subject name, code, faculty name) → component table → performance bar chart → "Raise a query" button.

### Marks Entry Grid (Faculty)
- Sticky header row (student name, roll no, then one column per policy-defined component — dynamic column count).
- Sticky first column (student name/roll) on horizontal scroll.
- Per-row inline save indicator, not one global submit button — avoid losing partial work.
- Locked-state overlay (greyed grid + explanatory banner) when the section isn't unlocked yet.

### Attendance CSV Import (Faculty)
- Step 1: upload → Step 2: **dry-run preview table** (green rows = will import, amber = will import with a note, rose = blocked/flagged) → Step 3: confirm commit.
- Never skip the preview step, even for small classes — consistency matters more than saving one click.

### HOD Policy Builder
- Form-based, not free-text: repeatable "CES component" rows (name + max marks, add/remove), single Internal exam row (max marks + weightage), attendance slab as a repeatable range-table (min% – max% → marks, add/remove rows, with a live gap/overlap validator).
- Running total ("Total IA Marks: 40") computed and shown live as the HOD edits, no separate save-then-check step.
- "Duplicate last term's policy" button pre-fills the whole form from the previous offering.

### HOD Status Board
- Simple table/grid: Subject | Section | Faculty | Policy | Status pill — sortable/filterable by status so "what still needs setup" is immediately visible after a batch promotion.

### Admin Screens
- Standard data-table + modal-form pattern for Departments/Batches/Faculty — nothing exotic needed here, prioritize speed of data entry over visual flourish.
- Credential Excel download: a clear, single "Download Credentials (.xlsx)" button immediately after any bulk creation action.

## 5. Component Notes
- Threshold badges: pill-shaped, colored per palette (e.g. "82% — Good" emerald, "68% — Low" rose).
- Audit log entries: monospace-style diff (`old → new`) for fast scanning.
- Query thread: chat-style bubbles, faculty/HOD/student visually distinguished (avatar + name), status pill pinned at the top of the thread.
- Empty states (no policy configured yet, no marks entered yet) get a clear CTA, not blank space.
