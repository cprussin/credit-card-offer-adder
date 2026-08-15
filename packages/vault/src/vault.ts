import type { VaultCredentials } from "./vault-item";

/**
 * Where every secret in a run comes from. Nothing else may source a
 * credential — no config field, no CLI flag, no literal.
 */
export type Vault = {
  readonly credentials: (itemId: string) => Promise<VaultCredentials>;
  /** The item's current TOTP, for issuers that accept an authenticator app. */
  readonly totp: (itemId: string) => Promise<string>;
};
