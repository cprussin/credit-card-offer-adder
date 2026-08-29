import { Err, Ok } from "@cprussin/option-result";
import { errorMessage } from "@offers/error-message/error-message";

import type { CodeSource } from "./code-source";

/**
 * A code we derive ourselves, from the TOTP secret stored beside the password
 * in the credentials document. This is the only source that needs neither a
 * network round trip to the bank's delivery channel nor a human, so it belongs
 * first in every chain — see `@offers/one-time-code/chain-code-sources`.
 *
 * Chase can be enrolled in authenticator-app verification; Amex generally
 * cannot, so an Amex chain falls through this to the mailbox.
 */
export const totpCodeSource = (
  generateTotp: () => Promise<string>,
): CodeSource => ({
  name: "totp",
  waitForCode: async () => {
    try {
      const code = (await generateTotp()).trim();
      return code.length === 0
        ? Err({ reason: "generated an empty code", source: "totp" })
        : Ok(code);
    } catch (error) {
      return Err({ reason: errorMessage(error), source: "totp" });
    }
  },
});
