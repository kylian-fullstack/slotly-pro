import { describe, expect, it, vi } from "vitest";
import { createCsrfToken } from "../security/csrf";
import { runAuthenticatedMutation, type RequestSession } from "./pipeline";

const session: RequestSession = { id: "session-id", userId: "user-id", organizationId: "org-id", membershipId: "member-id", role: "OWNER" };
const secret = "a-server-secret-with-at-least-32-characters";

describe("authenticated mutation pipeline", () => {
  it("does not call authentication or handler without a cookie", async () => {
    const authenticate = vi.fn();
    const handler = vi.fn();
    const response = await runAuthenticatedMutation(new Request("https://slotly.example/api", { method: "POST" }), {
      appOrigin: "https://slotly.example", csrfSecret: secret, authenticate
    }, handler);
    expect(response.status).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call the handler before origin and CSRF validation", async () => {
    const authenticate = vi.fn(async () => session);
    const handler = vi.fn();
    const response = await runAuthenticatedMutation(new Request("https://slotly.example/api", {
      method: "POST", headers: { cookie: "slotly_session=raw", origin: "https://evil.example", "x-csrf-token": "bad" }
    }), { appOrigin: "https://slotly.example", csrfSecret: secret, authenticate }, handler);
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler only after every security gate succeeds", async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const csrf = createCsrfToken(session.id, secret);
    const response = await runAuthenticatedMutation(new Request("https://slotly.example/api", {
      method: "POST", headers: { cookie: "slotly_session=raw", origin: "https://slotly.example", "x-csrf-token": csrf }
    }), { appOrigin: "https://slotly.example", csrfSecret: secret, authenticate: async () => session }, handler);
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(session);
  });
});
