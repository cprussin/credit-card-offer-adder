import { openBrowserSession } from "@offers/browser-session/browser-session";
import type { Account } from "@offers/config/account";
import type { Config } from "@offers/config/config-schema";
import type { IssuerAdapter } from "@offers/issuer/issuer-adapter";
import { amexAdapter } from "@offers/issuer-amex/amex-adapter";
import { chaseAdapter } from "@offers/issuer-chase/chase-adapter";
import { Issuer } from "@offers/offer/issuer";
import type { AccountSession } from "@offers/offer-run/account-session";
import { requestCodeWith } from "@offers/one-time-code/request-code";
import type { Vault } from "@offers/vault/vault";
import type { BuildCodeSourceDeps } from "./build-code-source";
import { buildCodeSource } from "./build-code-source";

export type OpenAccountSessionDeps = {
  readonly config: Config;
  readonly vault: Vault;
  readonly codeSourceDeps: BuildCodeSourceDeps;
};

/**
 * Everything that has to go right before an offer can be added: the account's
 * browser profile, its credentials, its code ladder, and the bank's sign-in
 * flow. `runAccount` treats the whole thing as one step, so this is the only
 * place the pieces meet.
 *
 * Thin wiring over parts that are each tested on their own — see
 * /docs/guidelines/TESTING.md on glue.
 */
export const openAccountSession = async (
  account: Account,
  { config, vault, codeSourceDeps }: OpenAccountSessionDeps,
): Promise<AccountSession> => {
  const adapter = adapterFor(account.issuer);
  const codeSource = await buildCodeSource(account, codeSourceDeps);
  const browser = await openBrowserSession({
    accountId: account.id,
    artifactDir: config.artifactDir,
    headless: config.headless,
    profileDir: config.profileDir,
  });
  try {
    await adapter.signIn({
      credentials: await vault.credentials(account.vaultItem),
      page: browser.page,
      requestCode: requestCodeWith(codeSource, {
        accountLabel: account.label,
        senderHints: account.senderHints,
      }),
    });
  } catch (error) {
    await browser.close();
    throw error;
  }
  return {
    close: () => browser.close(),
    openOffers: async () => {
      try {
        return await adapter.openOffers(browser.page);
      } catch (error) {
        const artifact = await browser.captureFailure("offers");
        throw new Error(`offers page unusable (see ${artifact}.png)`, {
          cause: error,
        });
      }
    },
  };
};

const adapterFor = (issuer: Issuer): IssuerAdapter => {
  switch (issuer) {
    case Issuer.Amex:
      return amexAdapter;
    case Issuer.Chase:
      return chaseAdapter;
  }
};
