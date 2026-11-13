import { describe, it, expect } from "vitest";
import {
  groupScore,
  attendanceScore,
  totalIA,
  validateSlabs,
  ScoreComponent,
  Mark,
  SlabRange,
} from "@/services/gradingEngine";

describe("Grading Engine — Pure Calculation Logic", () => {
  // ---------------------------------------------------------------------------
  // Subject A Config: 2 CES components, 40 max internal, 5 attendance bands
  // ---------------------------------------------------------------------------
  const subjectAComponents: ScoreComponent[] = [
    { id: "ces-1", group: "CES", name: "CES-I", maxMarks: 10 },
    { id: "ces-2", group: "CES", name: "CES-II", maxMarks: 10 },
    { id: "int-1", group: "INTERNAL", name: "Internal Exam", maxMarks: 40 },
  ];

  const subjectASlabs: SlabRange[] = [
    { minPercent: 0, maxPercent: 60, marks: 0 },
    { minPercent: 60.01, maxPercent: 75, marks: 4 },
    { minPercent: 75.01, maxPercent: 85, marks: 6 },
    { minPercent: 85.01, maxPercent: 95, marks: 8 },
    { minPercent: 95.01, maxPercent: 100, marks: 10 },
  ];

  const subjectAWeightages = {
    ces: 10,
    internal: 20,
    attendance: 10,
  };

  // ---------------------------------------------------------------------------
  // Subject B Config: 3 CES components (15/15/20), 50 max internal, 4 bands
  // ---------------------------------------------------------------------------
  const subjectBComponents: ScoreComponent[] = [
    { id: "ces-b1", group: "CES", name: "CES-I", maxMarks: 15 },
    { id: "ces-b2", group: "CES", name: "CES-II", maxMarks: 15 },
    { id: "ces-b3", group: "CES", name: "CES-III", maxMarks: 20 },
    { id: "int-b1", group: "INTERNAL", name: "Internal Exam", maxMarks: 50 },
  ];

  const subjectBSlabs: SlabRange[] = [
    { minPercent: 0, maxPercent: 70, marks: 0 },
    { minPercent: 70.01, maxPercent: 80, marks: 8 },
    { minPercent: 80.01, maxPercent: 90, marks: 12 },
    { minPercent: 90.01, maxPercent: 100, marks: 15 },
  ];

  const subjectBWeightages = {
    ces: 10,
    internal: 25,
    attendance: 15,
  };

  // ===========================================================================
  // TEST SUITE 1: Subject A Calculations
  // ===========================================================================
  describe("Subject A (2 CES components, 40 max internal)", () => {
    it("should correctly calculate group score for CES (18/20 raw -> 9.0/10 weighted)", () => {
      const marks: Mark[] = [
        { scoreComponentId: "ces-1", marksObtained: 8 },
        { scoreComponentId: "ces-2", marksObtained: 10 },
      ];
      const score = groupScore(subjectAComponents, marks, "CES", subjectAWeightages.ces);
      expect(score).toBeCloseTo(9.0, 4);
    });

    it("should correctly calculate group score for Internal (30/40 raw -> 15.0/20 weighted)", () => {
      const marks: Mark[] = [{ scoreComponentId: "int-1", marksObtained: 30 }];
      const score = groupScore(subjectAComponents, marks, "INTERNAL", subjectAWeightages.internal);
      expect(score).toBeCloseTo(15.0, 4);
    });

    it("should look up attendance slab accurately (88% -> 8 marks)", () => {
      const score = attendanceScore(88, subjectASlabs);
      expect(score).toBe(8);
    });

    it("should compute total IA correctly (9 + 15 + 8 = 32)", () => {
      const marks: Mark[] = [
        { scoreComponentId: "ces-1", marksObtained: 8 },
        { scoreComponentId: "ces-2", marksObtained: 10 },
        { scoreComponentId: "int-1", marksObtained: 30 },
      ];
      const result = totalIA(
        subjectAComponents,
        marks,
        subjectAWeightages.ces,
        subjectAWeightages.internal,
        88,
        subjectASlabs
      );

      expect(result.cesScore).toBeCloseTo(9.0, 4);
      expect(result.internalScore).toBeCloseTo(15.0, 4);
      expect(result.attendanceScore).toBe(8);
      expect(result.totalIA).toBeCloseTo(32.0, 4);
    });
  });

  // ===========================================================================
  // TEST SUITE 2: Subject B Calculations (Diff shape: 3 CES 15/15/20, Int 50)
  // ===========================================================================
  describe("Subject B (3 CES components 15/15/20, 50 max internal)", () => {
    it("should correctly calculate group score for 3 CES components (40/50 raw -> 8.0/10 weighted)", () => {
      const marks: Mark[] = [
        { scoreComponentId: "ces-b1", marksObtained: 15 },
        { scoreComponentId: "ces-b2", marksObtained: 12 },
        { scoreComponentId: "ces-b3", marksObtained: 13 },
      ];
      const score = groupScore(subjectBComponents, marks, "CES", subjectBWeightages.ces);
      expect(score).toBeCloseTo(8.0, 4);
    });

    it("should correctly calculate internal score (40/50 raw -> 20.0/25 weighted)", () => {
      const marks: Mark[] = [{ scoreComponentId: "int-b1", marksObtained: 40 }];
      const score = groupScore(subjectBComponents, marks, "INTERNAL", subjectBWeightages.internal);
      expect(score).toBeCloseTo(20.0, 4);
    });

    it("should look up attendance slab for Subject B (92% -> 15 marks out of 15)", () => {
      const score = attendanceScore(92, subjectBSlabs);
      expect(score).toBe(15);
    });

    it("should compute total IA correctly for Subject B (8 + 20 + 15 = 43)", () => {
      const marks: Mark[] = [
        { scoreComponentId: "ces-b1", marksObtained: 15 },
        { scoreComponentId: "ces-b2", marksObtained: 12 },
        { scoreComponentId: "ces-b3", marksObtained: 13 },
        { scoreComponentId: "int-b1", marksObtained: 40 },
      ];
      const result = totalIA(
        subjectBComponents,
        marks,
        subjectBWeightages.ces,
        subjectBWeightages.internal,
        92,
        subjectBSlabs
      );

      expect(result.cesScore).toBeCloseTo(8.0, 4);
      expect(result.internalScore).toBeCloseTo(20.0, 4);
      expect(result.attendanceScore).toBe(15);
      expect(result.totalIA).toBeCloseTo(43.0, 4);
    });
  });

  // ===========================================================================
  // TEST SUITE 3: Edge Cases & Boundary Conditions
  // ===========================================================================
  describe("Edge Cases & Robustness", () => {
    it("should handle empty marks array gracefully (returns 0 score, not NaN)", () => {
      const result = totalIA(
        subjectAComponents,
        [],
        subjectAWeightages.ces,
        subjectAWeightages.internal,
        70,
        subjectASlabs
      );

      expect(result.cesScore).toBe(0);
      expect(result.internalScore).toBe(0);
      expect(result.attendanceScore).toBe(4);
      expect(result.totalIA).toBe(4);
    });

    it("should return null for attendanceScore and totalIA when attendance falls in a slab gap", () => {
      // 75.005 is between 75 and 75.01 in subjectASlabs
      const score = attendanceScore(75.005, subjectASlabs);
      expect(score).toBeNull();

      const result = totalIA(
        subjectAComponents,
        [],
        subjectAWeightages.ces,
        subjectAWeightages.internal,
        75.005,
        subjectASlabs
      );
      expect(result.attendanceScore).toBeNull();
      expect(result.totalIA).toBeNull();
    });

    it("should return 0 for groupScore if maxTotal is 0 (prevents division by zero)", () => {
      const zeroComponents: ScoreComponent[] = [
        { id: "z1", group: "CES", maxMarks: 0 },
      ];
      const score = groupScore(zeroComponents, [], "CES", 10);
      expect(score).toBe(0);
      expect(Number.isNaN(score)).toBe(false);
    });

    it("should handle partial marks entry (missing components treated as 0 obtained)", () => {
      // Only CES-I entered (8/10), CES-II missing (0/10) -> Raw total 8/20 = 4.0 weighted
      const marks: Mark[] = [{ scoreComponentId: "ces-1", marksObtained: 8 }];
      const score = groupScore(subjectAComponents, marks, "CES", subjectAWeightages.ces);
      expect(score).toBeCloseTo(4.0, 4);
    });

    it("should test exact min/max percentage boundary matches", () => {
      expect(attendanceScore(0, subjectASlabs)).toBe(0);
      expect(attendanceScore(60, subjectASlabs)).toBe(0);
      expect(attendanceScore(60.01, subjectASlabs)).toBe(4);
      expect(attendanceScore(75, subjectASlabs)).toBe(4);
      expect(attendanceScore(75.01, subjectASlabs)).toBe(6);
      expect(attendanceScore(100, subjectASlabs)).toBe(10);
    });
  });

  // ===========================================================================
  // TEST SUITE 4: Attendance Slab Range Validation
  // ===========================================================================
  describe("Slab Range Validation", () => {
    it("should validate a valid slab configuration", () => {
      const res = validateSlabs(subjectASlabs, 10);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it("should detect minPercent > maxPercent", () => {
      const badSlab: SlabRange[] = [{ minPercent: 80, maxPercent: 70, marks: 5 }];
      const res = validateSlabs(badSlab, 10);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("cannot be greater than maxPercent"))).toBe(true);
    });

    it("should detect overlapping slabs", () => {
      const overlapSlab: SlabRange[] = [
        { minPercent: 0, maxPercent: 70, marks: 2 },
        { minPercent: 65, maxPercent: 85, marks: 5 },
      ];
      const res = validateSlabs(overlapSlab, 10);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Overlapping slab ranges"))).toBe(true);
    });

    it("should detect slab marks exceeding attendance weightage", () => {
      const highMarksSlab: SlabRange[] = [{ minPercent: 0, maxPercent: 100, marks: 15 }];
      const res = validateSlabs(highMarksSlab, 10);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain("exceed attendance weightage");
    });

    it("should detect coverage gaps between non-contiguous slab ranges (e.g. 0-60% and 70-100%)", () => {
      const gapSlab: SlabRange[] = [
        { minPercent: 0, maxPercent: 60, marks: 0 },
        { minPercent: 70, maxPercent: 100, marks: 10 },
      ];
      const res = validateSlabs(gapSlab, 10);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Coverage gap"))).toBe(true);
    });
  });
});
