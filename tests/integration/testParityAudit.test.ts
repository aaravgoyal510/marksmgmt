import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Legacy Backend Test Parity Audit", () => {
  const rootDir = process.cwd();
  const testsDir = path.join(rootDir, "tests");

  const expectedSuites = [
    // Unit tests
    "unit/gradingEngine.test.ts",
    "unit/frontendSlabValidation.test.ts",
    "unit/authLockout.test.ts",
    // Guard tests
    "guards/hodScoping.test.ts",
    "guards/policyAndLock.test.ts",
    // Integration tests
    "integration/adminExtensions.test.ts",
    "integration/attendanceImport.test.ts",
    "integration/batchSectionScoping.test.ts",
    "integration/edgeCasesAudit.test.ts",
    "integration/hodAcademic.test.ts",
    "integration/hodDirectMarkEditRoute.test.ts",
    "integration/marksAndAudit.test.ts",
    "integration/queriesAndNotifications.test.ts",
    "integration/reportsAndProfile.test.ts",
    "integration/roleAgnosticProfile.test.ts",
    "integration/routeIntegration.test.ts",
    "integration/securityBoundary.test.ts",
    // Route guard tests
    "integration/routeGuards.test.ts",
  ];

  it("should have all 18 test suite files present on the filesystem", () => {
    expectedSuites.forEach((relPath) => {
      const fullPath = path.join(testsDir, relPath);
      expect(
        fs.existsSync(fullPath),
        `Expected test suite file to exist: ${relPath}`
      ).toBe(true);
    });
  });

  it("should contain non-empty test cases in every test suite", () => {
    expectedSuites.forEach((relPath) => {
      const fullPath = path.join(testsDir, relPath);
      const content = fs.readFileSync(fullPath, "utf-8");
      const testMatches = content.match(/\b(it|test)\s*\(/g);
      expect(
        testMatches && testMatches.length > 0,
        `Expected ${relPath} to define at least one test case`
      ).toBe(true);
    });
  });

  it("should accumulate at least 95 tests across all port test suites", () => {
    let totalTests = 0;
    expectedSuites.forEach((relPath) => {
      const fullPath = path.join(testsDir, relPath);
      const content = fs.readFileSync(fullPath, "utf-8");
      const testMatches = content.match(/\b(it|test)\s*\(/g);
      if (testMatches) {
        totalTests += testMatches.length;
      }
    });

    expect(totalTests).toBeGreaterThanOrEqual(95);
  });
});
