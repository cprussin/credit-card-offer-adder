import type { Config } from "@offers/config/config-schema";
import { loadConfig } from "@offers/config/load-config";
import type { Credentials } from "@offers/credentials/credentials";
import { credentialsPath } from "@offers/credentials/credentials-path";
import { loadCredentials } from "@offers/credentials/load-credentials";
import { consoleNotifier } from "@offers/notify/console-notifier";
import { formatRunReport } from "@offers/notify/format-run-report";
import type { Notification, Notifier } from "@offers/notify/notification";
import { ntfyNotifier } from "@offers/notify/ntfy-notifier";
import { ntfyClient } from "@offers/ntfy/ntfy-client";
import { runAccount } from "@offers/offer-run/run-account";
import { runAccounts } from "@offers/offer-run/run-accounts";

import type { NtfyTopics } from "./build-code-source";
import { exitCode } from "./exit-code";
import { openAccountSession } from "./open-account-session";

const DEFAULT_CONFIG_PATH = "offers.config.json";

/**
 * One scheduled run: work through every configured account, then say what
 * happened.
 *
 * The two inputs are deliberately separate files. The config is non-secret and
 * can live in the Nix store; the credentials are read from whatever systemd
 * unsealed for this unit, or from `OFFERS_CREDENTIALS` for an attended run.
 *
 * Nothing here decides anything — the run loop is `@offers/offer-run`, the
 * wording is `@offers/notify`, the ladder is `./build-code-source`.
 */
const main = async (): Promise<void> => {
  const config = await loadConfig(Bun.env.OFFERS_CONFIG ?? DEFAULT_CONFIG_PATH);
  const credentials = await loadCredentials(
    credentialsPath({
      configured: Bun.env.OFFERS_CREDENTIALS,
      systemdCredentialsDir: Bun.env.CREDENTIALS_DIRECTORY,
    }),
  );
  const ntfy = ntfyTopics(config, credentials);
  const report = await runAccounts(config.accounts, {
    runOne: (account) =>
      runAccount(account, {
        openSession: (target) =>
          openAccountSession(target, {
            codeSourceDeps: { credentials, ntfy },
            config,
          }),
      }),
  });
  await notify(formatRunReport(report), ntfy);
  process.exitCode = exitCode(report);
};

const ntfyTopics = (
  config: Config,
  credentials: Credentials,
): NtfyTopics | undefined => {
  const configured = config.ntfy;
  return configured === undefined
    ? undefined
    : {
        alertTopic: configured.alertTopic,
        client: ntfyClient({
          server: configured.server,
          token: credentials.ntfyToken,
        }),
        replyTopic: configured.replyTopic,
      };
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
