import type { AuditEvent, Invitation, Membership, Session, User } from "./entities";
import type { MembershipId, NormalizedEmail, OrganizationId, SessionId, UserId, UtcTimestamp } from "./value-objects";

export interface TenantContext { readonly organizationId: OrganizationId; readonly actorUserId: UserId; readonly membership: Membership; }
export interface Clock { now(): UtcTimestamp; }
export interface SecretGenerator { generate(bytes: number): string; digest(secret: string): string; }
export interface PasswordHasher { hash(password: string): Promise<string>; verify(passwordHash: string, password: string): Promise<boolean>; needsUpgrade(passwordHash: string): boolean; }
export interface UserRepository { findByEmail(email: NormalizedEmail): Promise<User | null>; findById(userId: UserId): Promise<User | null>; insert(user: User): Promise<void>; }
export interface MembershipRepository { findForUser(tenant: TenantContext, userId: UserId): Promise<Membership | null>; listForOrganization(tenant: TenantContext): Promise<readonly Membership[]>; insert(membership: Membership): Promise<void>; update(membership: Membership): Promise<void>; }
export interface SessionRepository { findByDigest(tokenDigest: string): Promise<Session | null>; insert(session: Session): Promise<void>; revoke(sessionId: SessionId, revokedAt: UtcTimestamp): Promise<void>; revokeForMembership(membershipId: MembershipId, revokedAt: UtcTimestamp): Promise<number>; revokeForUser(userId: UserId, revokedAt: UtcTimestamp): Promise<number>; }
export interface InvitationRepository { findByDigest(tokenDigest: string): Promise<Invitation | null>; insert(invitation: Invitation): Promise<void>; update(invitation: Invitation): Promise<void>; }
export interface AuditWriter { append(event: AuditEvent): Promise<void>; }
export interface TransactionContext { readonly users: UserRepository; readonly memberships: MembershipRepository; readonly sessions: SessionRepository; readonly invitations: InvitationRepository; readonly audit: AuditWriter; }
export interface TransactionRunner { run<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T>; }
