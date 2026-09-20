import { describe, expect, it, vi } from "vitest";
import { enforceRateLimit } from "./rate-limit";

describe("enforceRateLimit", () => {
  it("hashes the key before persistence", async () => {
    const consume = vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 }));
    await enforceRateLimit("private@example.test", { limit: 3, windowSeconds: 60, digest: () => "digest", consume });
    expect(consume).toHaveBeenCalledWith("digest", 3, 60);
    expect(JSON.stringify(consume.mock.calls)).not.toContain("private@example.test");
  });

  it("returns a stable domain error after the threshold", async () => {
    await expect(enforceRateLimit("key", { limit: 3, windowSeconds: 60, digest: value => value,
      consume: async () => ({ allowed: false, retryAfterSeconds: 17 })
    })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
