import { randomUUID } from "node:crypto";
import type { OwnerRegistrationRecord } from "@slotly/db";
import { DomainError } from "@slotly/domain";
import type { PasswordHasher } from "@slotly/domain";

export interface RegistrationInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly timezone: string;
}

interface RegistrationPersistence {
  registerOwner(record: OwnerRegistrationRecord): Promise<void>;
}

interface RegistrationDependencies {
  readonly enabled: boolean;
  readonly passwords: PasswordHasher;
  readonly persistence: RegistrationPersistence;
  readonly createId?: () => string;
}

export async function registerOwner(input: RegistrationInput, dependencies: RegistrationDependencies): Promise<{ userId: string; organizationId: string }> {
  if (!dependencies.enabled) {
    throw new DomainError("REGISTRATION_DISABLED", "Public registration is disabled.");
  }
  const createId = dependencies.createId ?? randomUUID;
  const record: OwnerRegistrationRecord = {
    userId: createId(), organizationId: createId(), membershipId: createId(), auditEventId: createId(),
    email: input.email, displayName: input.displayName,
    passwordHash: await dependencies.passwords.hash(input.password),
    organizationName: input.organizationName, organizationSlug: input.organizationSlug, timezone: input.timezone
  };
  await dependencies.persistence.registerOwner(record);
  return { userId: record.userId, organizationId: record.organizationId };
}
