import argon2 from "argon2";
import type { PasswordHasher } from "@slotly/domain";

export interface PasswordParameters {
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
  readonly hashLength: number;
}

export const productionPasswordParameters: PasswordParameters = {
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32
};

export function createPasswordHasher(parameters = productionPasswordParameters): PasswordHasher {
  const options = { type: argon2.argon2id as 2, ...parameters };
  return {
    hash: (password) => argon2.hash(password, options),
    async verify(passwordHash, password) {
      try { return await argon2.verify(passwordHash, password); } catch { return false; }
    },
    needsUpgrade: (passwordHash) => {
      try { return argon2.needsRehash(passwordHash, options); } catch { return true; }
    }
  };
}
