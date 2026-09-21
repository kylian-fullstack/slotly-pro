import { BookingStore, createDatabasePool, CredentialStore, IdempotencyStore, InvitationStore, MembershipStore, OrganizationStore, RateLimitStore, RegistrationStore, SessionStore } from "@slotly/db";
import { parseServerEnvironment } from "./env";
import { createPasswordHasher } from "./security/password";
import { secretGenerator } from "./security/secrets";

let container: ReturnType<typeof createContainer> | undefined;

function createContainer() {
  const environment = parseServerEnvironment(process.env);
  const pool = createDatabasePool(environment.DATABASE_URL);
  return {
    environment, pool, passwords: createPasswordHasher(), secrets: secretGenerator,
    credentials: new CredentialStore(pool), registrations: new RegistrationStore(pool),
    idempotency: new IdempotencyStore(pool),
    sessions: new SessionStore(pool), invitations: new InvitationStore(pool), memberships: new MembershipStore(pool),
    organizations: new OrganizationStore(pool), bookings: new BookingStore(pool), rateLimits: new RateLimitStore(pool)
  };
}

export function getContainer(): ReturnType<typeof createContainer> {
  container ??= createContainer();
  return container;
}
