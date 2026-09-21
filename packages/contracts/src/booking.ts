import { z } from "zod";
import { emailSchema, uuidSchema } from "./identity-tenancy";

export const serviceCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(""),
  durationMinutes: z.number().int().min(5).max(720),
  priceCents: z.number().int().min(0).max(100_000_000),
  providerMembershipIds: z.array(uuidSchema).min(1).max(100)
}).strict();

export const servicePatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  durationMinutes: z.number().int().min(5).max(720).optional(),
  priceCents: z.number().int().min(0).max(100_000_000).optional(),
  active: z.boolean().optional(),
  providerMembershipIds: z.array(uuidSchema).min(1).max(100).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const availabilityReplaceSchema = z.object({
  membershipId: uuidSchema,
  rules: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440)
  }).strict().refine((rule) => rule.startMinute < rule.endMinute, "Start must precede end." )).max(21)
}).strict();

export const bookingCreateSchema = z.object({
  serviceId: uuidSchema,
  providerMembershipId: uuidSchema,
  startsAt: z.iso.datetime({ offset: true }),
  customerName: z.string().trim().min(2).max(120),
  customerEmail: emailSchema,
  customerPhone: z.string().trim().min(5).max(40).optional(),
  notes: z.string().trim().max(1000).default("")
}).strict();

export const bookingStatusPatchSchema = z.object({
  status: z.enum(["CANCELLED", "COMPLETED", "NO_SHOW"])
}).strict();

export const publicAvailabilityQuerySchema = z.object({
  serviceId: uuidSchema,
  providerMembershipId: uuidSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).strict();
