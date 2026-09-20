import { createHash, randomBytes } from "node:crypto";
import type { SecretGenerator } from "@slotly/domain";

export const secretGenerator: SecretGenerator = {
  generate(bytes) {
    if (!Number.isSafeInteger(bytes) || bytes < 32) throw new Error("Secrets require at least 32 bytes of entropy.");
    return randomBytes(bytes).toString("base64url");
  },
  digest(secret) {
    return createHash("sha256").update(secret, "utf8").digest("hex");
  }
};
