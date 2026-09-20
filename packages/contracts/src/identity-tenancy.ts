import { z } from "zod";

export const membershipRoleSchema = z.enum(["OWNER", "ADMIN", "STAFF"]);
export const manageableMembershipRoleSchema = z.enum(["ADMIN", "STAFF"]);
export const uuidSchema = z.uuid();
export const emailSchema = z.preprocess(
  (value) => typeof value === "string" ? value.normalize("NFKC").trim().toLowerCase() : value,
  z.email().max(254)
);
export const passwordSchema = z.string().min(12).max(200);
export const idempotencyKeySchema = z.string().min(16).max(200).regex(/^[A-Za-z0-9._:-]+$/);

export const registrationRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(120),
  organizationName: z.string().trim().min(2).max(160),
  organizationSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  timezone: z.string().default("Europe/Prague")
}).strict();

export const loginRequestSchema = z.object({ email: emailSchema, password: z.string().max(200) }).strict();
export const organizationPatchSchema = z.object({
  displayName: z.string().trim().min(2).max(160).optional(),
  defaultTimezone: z.string().optional()
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const invitationCreateSchema = z.object({
  email: emailSchema,
  role: manageableMembershipRoleSchema,
  expiresInHours: z.number().int().min(1).max(168).default(48)
}).strict();

export const invitationAcceptSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(2).max(120).optional(),
  password: passwordSchema.optional()
}).strict();

export const membershipPatchSchema = z.object({
  role: manageableMembershipRoleSchema.optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const apiErrorCodes = [
  "AUTHENTICATION_REQUIRED", "INVALID_CREDENTIALS", "SESSION_EXPIRED", "CSRF_REJECTED",
  "FORBIDDEN", "RESOURCE_NOT_FOUND", "VALIDATION_FAILED", "REGISTRATION_DISABLED",
  "INVITATION_INVALID", "INVITATION_EXPIRED", "INVITATION_EMAIL_MISMATCH", "LAST_OWNER_REQUIRED",
  "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_KEY_REUSED", "RATE_LIMITED", "CONFLICT", "INTERNAL_ERROR"
] as const;

export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.enum(apiErrorCodes), message: z.string(), correlationId: z.string() }).strict()
}).strict();

export function apiSuccessSchema<T extends z.ZodType>(data: T) {
  return z.object({ ok: z.literal(true), data }).strict();
}
