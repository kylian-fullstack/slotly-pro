ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_check"
CHECK ("email" = lower(btrim("email")) AND octet_length("email") <= 254);

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_slug_check"
CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_token_digest_check" CHECK ("token_digest" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "sessions_expiry_check" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "sessions_revocation_check" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at");

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_email_normalized_check" CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "invitations_token_digest_check" CHECK ("token_digest" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "invitations_expiry_check" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "invitations_acceptance_state_check" CHECK (
    ("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL AND "accepted_by_user_id" IS NOT NULL)
    OR ("status" <> 'ACCEPTED' AND "accepted_at" IS NULL AND "accepted_by_user_id" IS NULL)
  );

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_metadata_object_check"
CHECK (jsonb_typeof("metadata") = 'object');

ALTER TABLE "idempotency_records"
  ADD CONSTRAINT "idempotency_records_fingerprint_check" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "idempotency_records_response_pair_check" CHECK (("response_status" IS NULL) = ("response_body" IS NULL)),
  ADD CONSTRAINT "idempotency_records_expiry_check" CHECK ("expires_at" > "created_at");

CREATE OR REPLACE FUNCTION slotly_reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION slotly_reject_audit_mutation();
