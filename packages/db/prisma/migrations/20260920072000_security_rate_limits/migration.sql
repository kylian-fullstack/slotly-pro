CREATE TABLE security_rate_limits (
  key_digest char(64) NOT NULL,
  window_start timestamptz(0) NOT NULL,
  hits integer NOT NULL DEFAULT 1 CHECK (hits > 0),
  expires_at timestamptz(0) NOT NULL,
  PRIMARY KEY (key_digest, window_start)
);

CREATE INDEX security_rate_limits_expiry_idx ON security_rate_limits (expires_at);
