import type { IssuerAdapter } from "@offers/issuer/issuer-adapter";
import { Issuer } from "@offers/offer/issuer";
import type { OfferSurface } from "@offers/offer/offer-surface";
import type { PendingOffer } from "@offers/offer/pending-offer";
import type { FrameLocator, Locator, Page } from "playwright";

const LOGIN_URL = "https://secure.chase.com/web/auth/dashboard";
const OFFERS_URL =
  "https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub";

const NAVIGATION_TIMEOUT_MS = 45_000;
const SIGN_IN_TIMEOUT_MS = 60_000;
const SETTLE_TIMEOUT_MS = 15_000;
const PRESENCE_TIMEOUT_MS = 10_000;

/**
 * Every DOM handle this adapter depends on, in one place, so a reskin costs one
 * edit here. All but `loginFrame` and `offerTile` are accessible names a
 * customer reads; those two are the documented structural fallbacks — Chase has
 * historically served the login form inside an iframe, and its offers grid
 * exposes no accessible tile container.
 * See /docs/guidelines/AUTOMATION.md.
 */
const CHASE = {
  addButton: /^add\b|add to card|add offer/i,
  loginFrame: "#logonbox",
  offerTile: '[data-testid*="offer"], article, li',
  otpField: /(identification|verification|one[- ]time|security) code/i,
  password: /password/i,
  rememberDevice: /remember me|don't ask|remember this device/i,
  sendByEmail: /email/i,
  sendCodeButton: /next|send|continue|get code/i,
  signInButton: /sign ?in|log ?in/i,
  signOutControl: /sign ?out|log ?out/i,
  username: /username|user ?id/i,
  verifyButton: /next|verify|continue|submit/i,
  viewMoreButton: /see more|view more|show more|load more/i,
};

/**
 * Chase Offers.
 *
 * Chase can be enrolled in authenticator-app verification, which is why a Chase
 * account's code ladder should start with `totp`: with a TOTP secret in its
 * credentials entry, even a challenged login needs nobody. Failing that it behaves
 * like Amex — ask for email delivery and get the device remembered.
 */
export const chaseAdapter: IssuerAdapter = {
  issuer: Issuer.Chase,

  openOffers: async (page) => {
    await page.goto(OFFERS_URL, { timeout: NAVIGATION_TIMEOUT_MS });
    const rendered = await appears(
      offerTiles(page).first(),
      NAVIGATION_TIMEOUT_MS,
    );
    if (rendered) {
      return chaseOfferSurface(page);
    } else {
      throw new Error("Chase offers grid never rendered");
    }
  },

  signIn: async ({ page, credentials, requestCode }) => {
    await page.goto(LOGIN_URL, { timeout: NAVIGATION_TIMEOUT_MS });
    const alreadyIn = await appears(signedInMarker(page), PRESENCE_TIMEOUT_MS);
    if (!alreadyIn) {
      const form = await loginScope(page);
      await form.getByLabel(CHASE.username).fill(credentials.username);
      await form.getByLabel(CHASE.password).fill(credentials.password);
      await rememberThisDevice(form);
      await form.getByRole("button", { name: CHASE.signInButton }).click();
      await answerChallengeIfAsked(page, requestCode);
      const signedIn = await appears(signedInMarker(page), SIGN_IN_TIMEOUT_MS);
      if (!signedIn) {
        throw new Error("Chase never reached a signed-in page");
      }
    }
  },
};

/**
 * Chase has moved the login form between an iframe and the page itself more
 * than once, so resolve whichever is present rather than betting on one.
 */
const loginScope = async (page: Page): Promise<Page | FrameLocator> =>
  (await page.locator(CHASE.loginFrame).count()) > 0
    ? page.frameLocator(CHASE.loginFrame)
    : page;

const signedInMarker = (page: Page): Locator =>
  page
    .getByRole("link", { name: CHASE.signOutControl })
    .or(page.getByRole("button", { name: CHASE.signOutControl }))
    .first();

const answerChallengeIfAsked = async (
  page: Page,
  requestCode: () => Promise<string>,
): Promise<void> => {
  const codeField = page.getByLabel(CHASE.otpField);
  const emailOption = page.getByRole("radio", { name: CHASE.sendByEmail });
  const challenged = await appears(
    codeField.or(emailOption).first(),
    PRESENCE_TIMEOUT_MS,
  );
  if (challenged) {
    const canPickEmail = await appears(emailOption, PRESENCE_TIMEOUT_MS);
    if (canPickEmail) {
      await emailOption.check();
      await page
        .getByRole("button", { name: CHASE.sendCodeButton })
        .first()
        .click();
    }
    await codeField.waitFor({ state: "visible", timeout: SETTLE_TIMEOUT_MS });
    await codeField.fill(await requestCode());
    await rememberThisDevice(page);
    await page
      .getByRole("button", { name: CHASE.verifyButton })
      .first()
      .click();
  }
};

/** A remembered device is why tomorrow's run needs no code at all. */
const rememberThisDevice = async (
  scope: Page | FrameLocator,
): Promise<void> => {
  const remember = scope.getByRole("checkbox", { name: CHASE.rememberDevice });
  if (await appears(remember, PRESENCE_TIMEOUT_MS)) {
    await remember.check();
  }
};

const chaseOfferSurface = (page: Page): OfferSurface => ({
  add: async (offer) => {
    const button = tileFor(page, offer).getByRole("button", {
      name: CHASE.addButton,
    });
    await button.click({ timeout: SETTLE_TIMEOUT_MS });
    const settled = await disappears(button, SETTLE_TIMEOUT_MS);
    if (!settled) {
      throw new Error(`"${offer.title}" never flipped to added`);
    }
  },

  listPendingOffers: () => pendingOffers(page),

  loadMore: async () => {
    const viewMore = page
      .getByRole("button", { name: CHASE.viewMoreButton })
      .first();
    const more = await appears(viewMore, PRESENCE_TIMEOUT_MS);
    if (more) {
      await viewMore.click({ timeout: SETTLE_TIMEOUT_MS });
      await page.waitForLoadState("networkidle", {
        timeout: SETTLE_TIMEOUT_MS,
      });
    }
    return more;
  },
});

const offerTiles = (page: Page): Locator =>
  page
    .locator(CHASE.offerTile)
    .filter({ has: page.getByRole("button", { name: CHASE.addButton }) });

const pendingOffers = async (page: Page): Promise<readonly PendingOffer[]> => {
  const titles = await offerTiles(page).evaluateAll((tiles) =>
    tiles.map((tile) => tile.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  );
  return titles
    .filter((title) => title.length > 0)
    .map((title) => ({ id: title, title }));
};

const tileFor = (page: Page, offer: PendingOffer): Locator =>
  offerTiles(page)
    .filter({ hasText: offer.title.slice(0, 40) })
    .first();

/**
 * "Is this on the page within the budget?" as a boolean. A timeout is an
 * answer, not a failure — whether Chase challenged us is legitimately
 * either-way, and every caller branches on the result.
 */
const appears = (locator: Locator, timeoutMs: number): Promise<boolean> =>
  locator
    .waitFor({ state: "visible", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);

const disappears = (locator: Locator, timeoutMs: number): Promise<boolean> =>
  locator
    .waitFor({ state: "hidden", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
