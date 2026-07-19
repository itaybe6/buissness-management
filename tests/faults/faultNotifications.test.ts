import { describe, expect, it } from "vitest";
import { countNewFaults } from "@/lib/faultNotifications";
import type { Fault } from "@/types/database";

function fault(overrides: Partial<Fault> = {}): Fault {
  return {
    id: "f1",
    business_id: "b1",
    reported_by: null,
    photo_urls: [],
    description: "test",
    status: "needs_handling",
    assigned_to: null,
    created_at: "2026-07-19T10:00:00.000Z",
    updated_at: "2026-07-19T10:00:00.000Z",
    ...overrides,
  };
}

describe("countNewFaults", () => {
  it("returns 0 when nothing was seen yet", () => {
    expect(countNewFaults([fault()], null)).toBe(0);
  });

  it("counts only needs_handling faults created after seenAt", () => {
    const seenAt = "2026-07-19T09:00:00.000Z";
    const faults = [
      fault({ id: "old-open", created_at: "2026-07-19T08:00:00.000Z" }),
      fault({ id: "new-open", created_at: "2026-07-19T10:00:00.000Z" }),
      fault({ id: "new-progress", status: "in_progress", created_at: "2026-07-19T11:00:00.000Z" }),
      fault({ id: "new-handled", status: "handled", created_at: "2026-07-19T12:00:00.000Z" }),
    ];

    expect(countNewFaults(faults, seenAt)).toBe(1);
  });
});
