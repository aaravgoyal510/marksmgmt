import { describe, it, expect } from "vitest";
import { validateSlabsClient, SlabRangeInput } from "@/lib/slabValidation";

describe("Frontend Client Slab Validation Helper (validateSlabsClient)", () => {
  it("1. Genuine Coverage Gap: flags missing ranges (e.g. 0-60% and 70-100%, missing 60-70%)", () => {
    const gapSlabs: SlabRangeInput[] = [
      { minPercent: 0, maxPercent: 60, marks: 0 },
      { minPercent: 70, maxPercent: 100, marks: 10 },
    ];

    const warnings = validateSlabsClient(gapSlabs, 10);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("Coverage gap: Attendance between 60% and 70% is not covered"))).toBe(true);
  });

  it("2. Genuine Overlap: flags overlapping ranges (e.g. 0-60% and 55-100%)", () => {
    const overlapSlabs: SlabRangeInput[] = [
      { minPercent: 0, maxPercent: 60, marks: 0 },
      { minPercent: 55, maxPercent: 100, marks: 10 },
    ];

    const warnings = validateSlabsClient(overlapSlabs, 10);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("Overlap detected"))).toBe(true);
  });

  it("3. Fully Valid Configuration: stays silent with empty warnings array ([]) for a valid full-coverage slab setup", () => {
    const validSlabs: SlabRangeInput[] = [
      { minPercent: 0, maxPercent: 60, marks: 0 },
      { minPercent: 60.01, maxPercent: 75, marks: 4 },
      { minPercent: 75.01, maxPercent: 85, marks: 6 },
      { minPercent: 85.01, maxPercent: 100, marks: 10 },
    ];

    const warnings = validateSlabsClient(validSlabs, 10);
    expect(warnings).toHaveLength(0);
  });

  it("4. Weightage Overflow: flags slab marks exceeding total Attendance Weightage", () => {
    const overflowSlabs: SlabRangeInput[] = [
      { minPercent: 0, maxPercent: 100, marks: 15 },
    ];

    const warnings = validateSlabsClient(overflowSlabs, 10);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("exceed total Attendance Weightage"))).toBe(true);
  });
});
