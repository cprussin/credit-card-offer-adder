import { join } from "node:path";

/**
 * The credential name the NixOS module passes to `LoadCredentialEncrypted`.
 * systemd unseals it into `$CREDENTIALS_DIRECTORY` under this name.
 */
const SYSTEMD_CREDENTIAL_NAME = "offers-credentials";

export type CredentialsPathInput = {
  /** `OFFERS_CREDENTIALS`, for runs outside systemd. */
  readonly configured: string | undefined;
  /** `$CREDENTIALS_DIRECTORY`, set by systemd when the unit loads credentials. */
  readonly systemdCredentialsDir: string | undefined;
};

/**
 * Where to read the credentials from.
 *
 * systemd wins when it is there: that path is a per-unit tmpfs mount, mode
 * 0400, owned by the service user, and its contents were sealed to the machine's
 * TPM rather than sitting in plaintext on the disk. A configured path is the
 * fallback for an attended run. Guessing a default would risk silently reading
 * the wrong file, so with neither we fail.
 */
export const credentialsPath = ({
  configured,
  systemdCredentialsDir,
}: CredentialsPathInput): string => {
  if (systemdCredentialsDir !== undefined) {
    return join(systemdCredentialsDir, SYSTEMD_CREDENTIAL_NAME);
  } else if (configured === undefined) {
    throw new Error(
      "no credentials file: set OFFERS_CREDENTIALS or run under systemd with LoadCredentialEncrypted",
    );
  } else {
    return configured;
  }
};
