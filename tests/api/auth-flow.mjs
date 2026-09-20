import { randomUUID } from "node:crypto";

const baseUrl = process.env.TEST_URL ?? "http://127.0.0.1:3100";
const suffix = randomUUID().slice(0, 8);
const email = `api-${suffix}@example.test`;
const password = "correct horse battery staple";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const registrationKey = `registration-${randomUUID()}`;
const registrationPayload = {
  email, password, displayName: "API Owner", organizationName: "API Studio",
  organizationSlug: `api-studio-${suffix}`, timezone: "Europe/Prague"
};
const registration = await fetch(`${baseUrl}/api/v1/registration`, {
  method: "POST",
  headers: { "content-type": "application/json", "idempotency-key": registrationKey },
  body: JSON.stringify(registrationPayload)
});
assert(registration.status === 201, `Registration failed: ${registration.status} ${await registration.text()}`);
const replay = await fetch(`${baseUrl}/api/v1/registration`, {
  method: "POST", headers: { "content-type": "application/json", "idempotency-key": registrationKey },
  body: JSON.stringify(registrationPayload)
});
assert(replay.status === 201 && replay.headers.get("idempotency-replayed") === "true", "Registration replay was not stable.");
const changedReplay = await fetch(`${baseUrl}/api/v1/registration`, {
  method: "POST", headers: { "content-type": "application/json", "idempotency-key": registrationKey },
  body: JSON.stringify({ ...registrationPayload, organizationName: "Changed" })
});
assert(changedReplay.status === 409, `Changed idempotency payload was not rejected: ${changedReplay.status}`);
const missingKey = await fetch(`${baseUrl}/api/v1/registration`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(registrationPayload)
});
assert(missingKey.status === 400, `Missing idempotency key was not rejected: ${missingKey.status}`);

const wrongPassword = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "definitely wrong" })
});
const unknownEmail = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: `unknown-${suffix}@example.test`, password: "definitely wrong" })
});
const wrongBody = await wrongPassword.json();
const unknownBody = await unknownEmail.json();
assert(wrongPassword.status === 401 && unknownEmail.status === 401, "Credential failures must return 401.");
assert(wrongBody.error.code === unknownBody.error.code && wrongBody.error.message === unknownBody.error.message, "Login disclosed email existence.");

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password })
});
const loginBody = await login.json();
assert(login.status === 200 && loginBody.ok, `Login failed: ${login.status}`);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert(cookie, "Login did not issue a session cookie.");

const current = await fetch(`${baseUrl}/api/v1/session`, { headers: { cookie } });
const currentBody = await current.json();
assert(current.status === 200 && currentBody.data?.role === "OWNER", `Session failed: ${current.status}`);

const authHeaders = { cookie, origin: baseUrl, "x-csrf-token": loginBody.data.csrfToken, "content-type": "application/json" };
const organization = await fetch(`${baseUrl}/api/v1/organizations/current`, { headers: { cookie } });
const organizationBody = await organization.json();
assert(organization.status === 200 && organizationBody.data?.organization?.slug === registrationPayload.organizationSlug,
  `Current organization failed: ${organization.status}`);

const tenantInjection = await fetch(`${baseUrl}/api/v1/organizations/current`, {
  method: "PATCH", headers: authHeaders,
  body: JSON.stringify({ displayName: "Injected", organizationId: randomUUID() })
});
assert(tenantInjection.status === 400, `Caller-supplied tenant identifier was accepted: ${tenantInjection.status}`);

const organizationUpdate = await fetch(`${baseUrl}/api/v1/organizations/current`, {
  method: "PATCH", headers: authHeaders, body: JSON.stringify({ displayName: "API Studio Updated" })
});
assert(organizationUpdate.status === 200, `Organization update failed: ${organizationUpdate.status} ${await organizationUpdate.text()}`);

const invitedEmail = `admin-${suffix}@example.test`;
const invite = await fetch(`${baseUrl}/api/v1/members/invitations`, {
  method: "POST", headers: authHeaders, body: JSON.stringify({ email: invitedEmail, role: "ADMIN", expiresInHours: 2 })
});
const inviteBody = await invite.json();
assert(invite.status === 201 && inviteBody.data?.token, `Invitation creation failed: ${invite.status}`);

const acceptanceKey = `accept-${randomUUID()}`;
const acceptancePayload = { email: invitedEmail, displayName: "API Admin", password };
const accept = await fetch(`${baseUrl}/api/v1/invitations/${encodeURIComponent(inviteBody.data.token)}/accept`, {
  method: "POST", headers: { "content-type": "application/json", "idempotency-key": acceptanceKey }, body: JSON.stringify(acceptancePayload)
});
const acceptBody = await accept.json();
assert(accept.status === 200 && acceptBody.data?.membershipId, `Invitation acceptance failed: ${accept.status}`);
const acceptReplay = await fetch(`${baseUrl}/api/v1/invitations/${encodeURIComponent(inviteBody.data.token)}/accept`, {
  method: "POST", headers: { "content-type": "application/json", "idempotency-key": acceptanceKey }, body: JSON.stringify(acceptancePayload)
});
assert(acceptReplay.status === 200 && acceptReplay.headers.get("idempotency-replayed") === "true", "Invitation replay was not stable.");

const adminLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: invitedEmail, password })
});
const adminLoginBody = await adminLogin.json();
const adminCookie = adminLogin.headers.get("set-cookie")?.split(";")[0];
assert(adminLogin.status === 200 && adminCookie && adminLoginBody.data?.csrfToken, "Invited administrator could not log in.");
const adminSession = await fetch(`${baseUrl}/api/v1/session`, { headers: { cookie: adminCookie } });
const adminSessionBody = await adminSession.json();
assert(adminSession.status === 200 && adminSessionBody.data?.role === "ADMIN", "Invited administrator received the wrong role.");
const adminHeaders = { cookie: adminCookie, origin: baseUrl, "x-csrf-token": adminSessionBody.data.csrfToken, "content-type": "application/json" };
const forbiddenAdminInvite = await fetch(`${baseUrl}/api/v1/members/invitations`, {
  method: "POST", headers: adminHeaders, body: JSON.stringify({ email: `blocked-${suffix}@example.test`, role: "ADMIN", expiresInHours: 2 })
});
assert(forbiddenAdminInvite.status === 403, "Administrator was allowed to invite another administrator.");
const allowedStaffInvite = await fetch(`${baseUrl}/api/v1/members/invitations`, {
  method: "POST", headers: adminHeaders, body: JSON.stringify({ email: `staff-${suffix}@example.test`, role: "STAFF", expiresInHours: 2 })
});
assert(allowedStaffInvite.status === 201, "Administrator could not invite staff.");

const removeLastOwner = await fetch(`${baseUrl}/api/v1/members/${currentBody.data.membershipId}`, {
  method: "PATCH", headers: authHeaders, body: JSON.stringify({ role: "ADMIN" })
});
assert(removeLastOwner.status === 409, "The final active owner could be demoted.");

const audit = await fetch(`${baseUrl}/api/v1/audit?limit=20`, { headers: { cookie } });
const auditBody = await audit.json();
assert(audit.status === 200 && auditBody.data.events.some((event) => event.action === "invitation.accepted"), "Tenant audit did not contain invitation acceptance.");

const demote = await fetch(`${baseUrl}/api/v1/members/${acceptBody.data.membershipId}`, {
  method: "PATCH", headers: authHeaders, body: JSON.stringify({ role: "STAFF" })
});
assert(demote.status === 200, `Membership role change failed: ${demote.status} ${await demote.text()}`);
const revokedAdmin = await fetch(`${baseUrl}/api/v1/session`, { headers: { cookie: adminCookie } });
assert(revokedAdmin.status === 401, "Privilege change did not revoke the affected session.");

const staffLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: invitedEmail, password })
});
const staffLoginBody = await staffLogin.json();
const staffCookie = staffLogin.headers.get("set-cookie")?.split(";")[0];
assert(staffLogin.status === 200 && staffCookie, "Demoted staff member could not log in.");
const staffAudit = await fetch(`${baseUrl}/api/v1/audit`, { headers: { cookie: staffCookie } });
assert(staffAudit.status === 403, "Staff member could read the security audit.");
const staffInvite = await fetch(`${baseUrl}/api/v1/members/invitations`, {
  method: "POST", headers: { cookie: staffCookie, origin: baseUrl, "x-csrf-token": staffLoginBody.data.csrfToken, "content-type": "application/json" },
  body: JSON.stringify({ email: `staff-blocked-${suffix}@example.test`, role: "STAFF", expiresInHours: 2 })
});
assert(staffInvite.status === 403, "Staff member was allowed to create an invitation.");

const removeStaff = await fetch(`${baseUrl}/api/v1/members/${acceptBody.data.membershipId}`, {
  method: "DELETE", headers: authHeaders
});
assert(removeStaff.status === 200, `Staff removal failed: ${removeStaff.status} ${await removeStaff.text()}`);
const removedSession = await fetch(`${baseUrl}/api/v1/session`, { headers: { cookie: staffCookie } });
assert(removedSession.status === 401, "Removed member retained an active session.");

const rejectedLogout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
  method: "POST", headers: { cookie, origin: baseUrl, "x-csrf-token": "invalid" }
});
assert(rejectedLogout.status === 403, `Invalid CSRF was not rejected: ${rejectedLogout.status}`);

const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
  method: "POST", headers: { cookie, origin: baseUrl, "x-csrf-token": loginBody.data.csrfToken }
});
assert(logout.status === 200, `Logout failed: ${logout.status}`);

const afterLogout = await fetch(`${baseUrl}/api/v1/session`, { headers: { cookie } });
assert(afterLogout.status === 401, `Revoked session still worked: ${afterLogout.status}`);

process.stdout.write("API identity flow passed: registration, tenant isolation, organization, invitation, audit, role change, CSRF and revocation.\n");
