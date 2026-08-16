import type { Config } from "@offers/config/config-schema";
import { loadConfig } from "@offers/config/load-config";
import { consoleNotifier } from "@offers/notify/console-notifier";
import { formatRunReport } from "@offers/notify/format-run-report";
import type { Notification, Notifier } from "@offers/notify/notification";
import { ntfyNotifier } from "@offers/notify/ntfy-notifier";
import { ntfyClient } from "@offers/ntfy/ntfy-client";
import { runAccount } from "@offers/offer-run/run-account";
import { runAccounts } from "@offers/offer-run/run-accounts";
import { bitwardenVault } from "@offers/vault/bitwarden-vault";
import type { Vault } from "@offers/vault/vault";

import type { NtfyTopics } from "./build-code-source";
import { exitCode } from "./exit-code";
import { openAccountSession } from "./open-account-session";

const DEFAULT_CONFIG_PATH = "offers.config.json";

/**
 * One scheduled run: work through every configured account, then say what
 * happened.
 *
 * Nothing here decides anything — the run loop is `@offers/offer-run`, the
 * wording is `@offers/notify`, the ladder is `./build-code-source`. This is
 * where they are handed their real implementations.
 */
const main = async (): Promise<void> => {
  const config = await loadConfig(Bun.env.OFFERS_CONFIG ?? DEFAULT_CONFIG_PATH);
  const vault = bitwardenVault({
    masterPassword: Bun.env.BW_PASSWORD,
    session: Bun.env.BW_SESSION,
  });
  const ntfy = await ntfyTopics(config, vault);
  const report = await runAccounts(config.accounts, {
    runOne: (account) =>
      runAccount(account, {
        openSession: (target) =>
          openAccountSession(target, {
            codeSourceDeps: { ntfy, vault },
            config,
            vault,
          }),
      }),
  });
  await notify(formatRunReport(report), ntfy);
  process.exitCode = exitCode(report);
};

const ntfyTopics = async (
  config: Config,
  vault: Vault,
): Promise<NtfyTopics | undefined> => {
  const configured = config.ntfy;
  if (configured === undefined) {
    return undefined;
  } else {
    const token =
      configured.tokenVaultItem === undefined
        ? undefined
        : (await vault.credentials(configured.tokenVaultItem)).password;
    return {
      alertTopic: configured.alertTopic,
      client: ntfyClient({ server: configured.server, token }),
      replyTopic: configured.replyTopic,
    };
  }
};

/**
 * The terminal always gets the summary — on a server that is the journal entry
 * for the run — and a phone gets it too when ntfy is configured.
 */
const notify = async (
  notification: Notification,
  ntfy: NtfyTopics | undefined,
): Promise<void> => {
  const notifiers: Notifier[] =
    ntfy === undefined
      ? [consoleNotifier]
      : [consoleNotifier, ntfyNotifier(ntfy.client, ntfy.alertTopic)];
  for (const notifier of notifiers) {
    await notifier.send(notification);
  }
};

await main();
