import { afterEach, describe, expect, it, vi } from "vitest";
import { writeSecurityLog } from "./logging";

describe("security logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes only allowlisted fields and cannot accept request secrets", () => {
    const sink = vi.spyOn(console, "error").mockImplementation(() => undefined);
    writeSecurityLog({ correlationId: "correlation-1", code: "CSRF_REJECTED", event: "http.request_rejected" });
    const output = String(sink.mock.calls[0]?.[0]);
    expect(JSON.parse(output)).toEqual({ level: "warn", category: "security", event: "http.request_rejected",
      correlationId: "correlation-1", code: "CSRF_REJECTED" });
    expect(output).not.toMatch(/password|cookie|token|authorization/i);
  });
});
