import { describe, it, expect, vi, beforeEach } from "vitest";
import { PUT as bulkPut } from "@/app/api/marks/bulk/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../mocks/prisma");
  return { prisma: createPrismaMock() };
});

describe("Route-Level Integration: HOD Direct Mark Edit Rejection", () => {
  const hodToken = createToken({
    userId: "user-hod-id",
    username: "HOD_USER",
    role: Role.FACULTY,
    facultyId: "fac-prof-hod-id",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HTTP PUT /api/marks/bulk rejects an HOD's direct mark edit on a section assigned to another teaching faculty with HTTP 403 TEACHING_FACULTY_ONLY", async () => {
    (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-teaching-id", // Teaching faculty ID != HOD faculty ID ("fac-prof-hod-id")
      subjectOffering: {
        gradingPolicy: {
          confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
    });

    const req = createTestRequest("/api/marks/bulk", {
      method: "PUT",
      token: hodToken,
      body: {
        sectionId: "sec-unlocked-1",
        entries: [
          {
            scoreComponentId: "comp-ces-1",
            studentId: "student-aarav",
            marksObtained: 10,
          },
        ],
      },
    });

    const res = await bulkPut(req);
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(403);
    expect(data).toEqual({
      error:
        "Forbidden: Direct mark entry is restricted to the assigned teaching faculty for this section. HODs can instruct via escalated queries, but cannot edit marks directly.",
      code: "TEACHING_FACULTY_ONLY",
    });
  });
});
