import { describe, expect, it } from "vitest";
import { normalizeEmail, parseIanaTimezone, parseOrganizationId, parseUtcTimestamp } from "./value-objects";

describe("identity value objects", () => {
  it("normalizes case, compatibility Unicode and whitespace in email", () => {
    expect(normalizeEmail("  Dušan＠Example.COM  ")).toBe("dušan@example.com");
  });
  it("rejects malformed email", () => expect(() => normalizeEmail("not-an-email")).toThrow(/invalid/));
  it("accepts Europe/Prague and rejects unknown timezones", () => {
    expect(parseIanaTimezone("Europe/Prague")).toBe("Europe/Prague");
    expect(() => parseIanaTimezone("Prague/Local")).toThrow(/IANA/);
  });
  it("requires an explicit UTC timestamp", () => {
    expect(parseUtcTimestamp("2026-09-20T00:00:00.000Z")).toBe("2026-09-20T00:00:00.000Z");
    expect(() => parseUtcTimestamp("2026-09-20T02:00:00+02:00")).toThrow(/UTC/);
  });
  it("rejects malformed IDs", () => expect(() => parseOrganizationId("org-1")).toThrow(/UUID/));
});
