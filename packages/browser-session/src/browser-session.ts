import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { chromium } from "playwright";

import { artifactPath } from "./artifact-path";

/**
 * A real desktop window size. Banks treat an unusual viewport as a signal, and
 * the offers grid lays out differently below this width.
 */
const VIEWPORT = { height: 900, width: 1440 };

/**
 * Chromium advertises itself as automated by default, which is the single
 * loudest bot signal a bank sees.
 */
const LAUNCH_ARGS = ["--disable-blink-features=AutomationControlled"];

export type BrowserSessionOptions = {
  readonly accountId: string;
  readonly profileDir: string;
  readonly artifactDir: string;
  readonly headless: boolean;
};

export type BrowserSession = {
  readonly page: Page;
  /** Save a screenshot and the page's HTML for after-the-fact diagnosis. */
  readonly captureFailure: (name: string) => Promise<string>;
  readonly close: () => Promise<void>;
};

/**
 * Open the account's own persistent browser profile.
 *
 * The profile is the reason this can run unattended: cookies and the device
 * token a bank sets when you tell it to remember the browser live in that
 * directory, so a code is needed on the first run and then rarely again. One
 * directory per account — sharing one would log the accounts out of each other
 * on every run and guarantee a challenge every time.
 */
export const openBrowserSession = async ({
  accountId,
  profileDir,
  artifactDir,
  headless,
}: BrowserSessionOptions): Promise<BrowserSession> => {
  const profile = join(profileDir, accountId);
  await mkdir(profile, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    args: LAUNCH_ARGS,
    headless,
    locale: "en-US",
    viewport: VIEWPORT,
  });
  return {
    captureFailure: (name) =>
      capture(context, { accountId, artifactDir, name }),
    close: () => context.close(),
    page: firstPage(context),
  };
};

const firstPage = (context: BrowserContext): Page => {
  const [page] = context.pages();
  if (page === undefined) {
    throw new Error("persistent context opened with no page");
  } else {
    return page;
  }
};

/**
 * Only ever called after a failure, and only from whatever page the run was
 * already on — never from a login form with a password in it. See
 * /docs/guidelines/AUTOMATION.md.
 */
const capture = async (
  context: BrowserContext,
  input: { accountId: string; artifactDir: string; name: string },
): Promise<string> => {
  const path = artifactPath({ ...input, now: new Date() });
  await mkdir(dirname(path), { recursive: true });
  const page = firstPage(context);
  await page.screenshot({ fullPage: true, path: `${path}.png` });
  await Bun.write(`${path}.html`, await page.content());
  return path;
};
