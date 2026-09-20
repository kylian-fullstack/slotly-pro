import { DomainError } from "@slotly/domain";
import type { PasswordHasher } from "@slotly/domain";

interface LoginCredential {
  readonly userId: string;
  readonly passwordHash: string;
  readonly membershipId: string;
  readonly organizationId: string;
}

interface CredentialReader { findForLogin(email: string): Promise<LoginCredential | null>; }

export async function verifyLogin(
  email: string,
  password: string,
  dependencies: { readonly credentials: CredentialReader; readonly passwords: PasswordHasher; readonly dummyPasswordHash: string }
): Promise<LoginCredential> {
  const credential = await dependencies.credentials.findForLogin(email);
  const matches = await dependencies.passwords.verify(credential?.passwordHash ?? dependencies.dummyPasswordHash, password);
  if (!credential || !matches) {
    throw new DomainError("INVALID_CREDENTIALS", "E-mail nebo heslo není správné.");
  }
  return credential;
}
