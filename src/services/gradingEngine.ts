export type ScoreGroup = "CES" | "INTERNAL";

export interface ScoreComponent {
  id: string;
  group: ScoreGroup;
  name?: string;
  maxMarks: number;
}

export interface Mark {
  scoreComponentId: string;
  marksObtained: number;
}

export interface SlabRange {
  minPercent: number;
  maxPercent: number;
  marks: number;
}

export interface GradingPolicyConfig {
  cesGroupWeightage: number;
  internalWeightage: number;
  attendanceWeightage: number;
  components: ScoreComponent[];
  slabs: SlabRange[];
}

export interface CalculationResult {
  cesScore: number;
  internalScore: number;
  attendanceScore: number | null;
  totalIA: number | null;
}

/**
  * Computes the weighted score for a specific group ("CES" or "INTERNAL").
  * Formula: (Sum of marks obtained for components in group) / (Sum of maxMarks for components in group) * groupWeightage
  * Returns 0 if total maxMarks for the group is 0.
  */
export function groupScore(
  components: ScoreComponent[],
  marks: Mark[],
  group: ScoreGroup,
  groupWeightage: number
): number {
  const groupComponents = components.filter((c) => c.group === group);
  const maxTotal = groupComponents.reduce((sum, c) => sum + c.maxMarks, 0);

  if (maxTotal === 0) return 0;

  const obtainedTotal = groupComponents.reduce((sum, c) => {
    const mark = marks.find((m) => m.scoreComponentId === c.id);
    return sum + (mark?.marksObtained ?? 0);
  }, 0);

  return (obtainedTotal / maxTotal) * groupWeightage;
}

/**
  * Looks up attendance percentage in the defined slab ranges.
  * Returns marks for matching range, or null if the percentage falls in a gap.
  */
export function attendanceScore(
  attendancePercent: number,
  slabs: SlabRange[]
): number | null {
  const match = slabs.find(
    (s) => attendancePercent >= s.minPercent && attendancePercent <= s.maxPercent
  );
  return match !== undefined ? match.marks : null;
}

/**
  * Computes complete IA breakdown and Total IA marks for a student.
  * Returns totalIA = null if attendance falls in an unmapped slab gap.
  */
export function totalIA(
  components: ScoreComponent[],
  marks: Mark[],
  cesWeightage: number,
  internalWeightage: number,
  attendancePercent: number,
  slabs: SlabRange[]
): CalculationResult {
  const ces = groupScore(components, marks, "CES", cesWeightage);
  const internal = groupScore(components, marks, "INTERNAL", internalWeightage);
  const attScore = attendanceScore(attendancePercent, slabs);

  return {
    cesScore: ces,
    internalScore: internal,
    attendanceScore: attScore,
    totalIA: attScore === null ? null : ces + internal + attScore,
  };
}

/**
  * Validates attendance slab ranges for coverage, gaps, overlaps, and max marks.
  */
export function validateSlabs(
  slabs: SlabRange[],
  attendanceWeightage: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (slabs.length === 0) {
    errors.push("At least one attendance slab range is required");
    return { valid: false, errors };
  }

  // Sort by minPercent
  const sorted = [...slabs].sort((a, b) => a.minPercent - b.minPercent);

  if (sorted[0].minPercent > 0) {
    errors.push(`Coverage gap: Attendance below ${sorted[0].minPercent}% is not covered`);
  }

  if (sorted[sorted.length - 1].maxPercent < 100) {
    errors.push(`Coverage gap: Attendance above ${sorted[sorted.length - 1].maxPercent}% is not covered`);
  }

  for (let i = 0; i < sorted.length; i++) {
    const slab = sorted[i];

    if (slab.minPercent > slab.maxPercent) {
      errors.push(
        `Invalid slab range: minPercent (${slab.minPercent}) cannot be greater than maxPercent (${slab.maxPercent})`
      );
    }

    if (slab.marks > attendanceWeightage) {
      errors.push(
        `Slab marks (${slab.marks}) exceed attendance weightage (${attendanceWeightage})`
      );
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      if (slab.minPercent <= prev.maxPercent) {
        errors.push(
          `Overlapping slab ranges: [${prev.minPercent}-${prev.maxPercent}%] and [${slab.minPercent}-${slab.maxPercent}%]`
        );
      } else if (slab.minPercent - prev.maxPercent > 0.02) {
        errors.push(
          `Coverage gap: Attendance between ${prev.maxPercent}% and ${slab.minPercent}% is not covered`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
