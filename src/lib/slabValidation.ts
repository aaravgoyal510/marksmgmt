export interface SlabRangeInput {
  minPercent: number;
  maxPercent: number;
  marks: number;
}

/**
 * Pure validation helper used by the HOD Policy Modal UI to compute live warnings.
 */
export function validateSlabsClient(
  slabsList: SlabRangeInput[],
  attWeightage: number
): string[] {
  const warnings: string[] = [];

  for (const s of slabsList) {
    if (Number(s.marks) > Number(attWeightage)) {
      warnings.push(`Slab marks (${s.marks}) exceed total Attendance Weightage (${attWeightage}).`);
      break;
    }
  }

  const sorted = [...slabsList].sort((a, b) => Number(a.minPercent) - Number(b.minPercent));
  for (let i = 0; i < sorted.length - 1; i++) {
    if (Number(sorted[i].maxPercent) >= Number(sorted[i + 1].minPercent)) {
      warnings.push(
        `Overlap detected: Range ${sorted[i].minPercent}%-${sorted[i].maxPercent}% overlaps with ${sorted[i + 1].minPercent}%-${sorted[i + 1].maxPercent}%.`
      );
      break;
    }
  }

  if (sorted.length > 0) {
    if (Number(sorted[0].minPercent) > 0) {
      warnings.push(`Coverage gap: Attendance below ${sorted[0].minPercent}% is not covered.`);
    }
    if (Number(sorted[sorted.length - 1].maxPercent) < 100) {
      warnings.push(`Coverage gap: Attendance above ${sorted[sorted.length - 1].maxPercent}% is not covered.`);
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      if (Number(sorted[i + 1].minPercent) - Number(sorted[i].maxPercent) > 0.02) {
        warnings.push(
          `Coverage gap: Attendance between ${sorted[i].maxPercent}% and ${sorted[i + 1].minPercent}% is not covered.`
        );
      }
    }
  }

  return warnings;
}
