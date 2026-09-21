import { describe, expect, it } from "vitest";
import { generateAvailableSlots, zonedLocalTimeToUtc } from "./availability";

describe("booking availability", () => {
  it("converts Prague local time to UTC in winter and summer", () => {
    expect(zonedLocalTimeToUtc("2026-01-12", 9 * 60, "Europe/Prague").toISOString()).toBe("2026-01-12T08:00:00.000Z");
    expect(zonedLocalTimeToUtc("2026-07-13", 9 * 60, "Europe/Prague").toISOString()).toBe("2026-07-13T07:00:00.000Z");
  });

  it("generates only future non-overlapping slots that fit the working window", () => {
    const slots = generateAvailableSlots({
      date: "2026-09-21", timezone: "Europe/Prague", durationMinutes: 60,
      rules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 }],
      busy: [{ startsAt: new Date("2026-09-21T08:00:00.000Z"), endsAt: new Date("2026-09-21T09:00:00.000Z") }],
      now: new Date("2026-09-21T05:00:00.000Z"), leadTimeMinutes: 60, stepMinutes: 60
    });
    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-09-21T07:00:00.000Z", "2026-09-21T09:00:00.000Z"
    ]);
  });

  it("rejects invalid scheduling configuration", () => {
    expect(() => generateAvailableSlots({
      date: "2026-09-21", timezone: "Europe/Prague", durationMinutes: 60,
      rules: [{ weekday: 1, startMinute: 600, endMinute: 600 }], busy: [], now: new Date(0)
    })).toThrow("Pracovní doba není platná");
  });
});
