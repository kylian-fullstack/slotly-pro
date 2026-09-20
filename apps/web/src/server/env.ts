import { z } from "zod";

const booleanFlag = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().startsWith("postgresql://"),
    TEST_DATABASE_URL: z.string().startsWith("postgresql://").optional(),
    TEST_DATABASE_MARKER: z.literal("slotly_test_only").optional(),
    SESSION_SECRET: z.string().min(32),
    PUBLIC_REGISTRATION_ENABLED: booleanFlag.default(false),
    TEST_SEED_ENABLED: booleanFlag.default(false),
    RATE_LIMIT_BACKEND: z.enum(["memory", "postgres"]),
    APP_ORIGIN: z.url()
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== "production") {
      return;
    }

    if (environment.TEST_SEED_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["TEST_SEED_ENABLED"],
        message: "Test seeds must be disabled in production."
      });
    }

    if (environment.RATE_LIMIT_BACKEND === "memory") {
      context.addIssue({
        code: "custom",
        path: ["RATE_LIMIT_BACKEND"],
        message: "Production requires a shared rate-limit backend."
      });
    }
  });

export type ServerEnvironment = z.infer<typeof environmentSchema>;

export function parseServerEnvironment(
  input: Record<string, string | undefined>
): ServerEnvironment {
  return environmentSchema.parse(input);
}
