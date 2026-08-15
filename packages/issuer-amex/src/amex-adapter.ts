import type { IssuerAdapter } from "@offers/issuer/issuer-adapter";
import { Issuer } from "@offers/offer/issuer";
import type { OfferSurface } from "@offers/offer/offer-surface";
import type { PendingOffer } from "@offers/offer/pending-offer";
import type { Locator, Page } from "playwright";

const LOGIN_URL = "https://www.americanexpress.com/en-us/account/login";
const OFFERS_URL = "https://global.americanexpress.com/offers/eligible";

/**
 * Bounds on every wait, so a site change fails the run instead of hanging it.
 * `SIGN_IN` is generous because it can span a challenge; `SETTLE` is what a
 * single tile gets to flip to "Added"; `PRESENCE` is how long we look for
 * something that legitimately may not be there at all.
 */
const NAVIGATION_TIMEOUT_MS = 45_000;
const SIGN_IN_TIMEOUT_MS = 60_000;
const SETTLE_TIMEOUT_MS = 15_000;
const PRESENCE_TIMEOUT_MS = 10_000;

/**
 * Every DOM handle this adapter depends on, in one place, so a reskin costs one
 * edit here. All but `offerTile` are accessible names a customer reads — Amex
 * restyles constantly but does not rename the button it tells people to click.
 * `offerTile` is the documented structural fallback for grouping a tile's
 * controls, since the grid exposes no accessible container.
 * See /docs/guidelines/AUTOMATION.md.
 */
const AMEX = {
  addButton: /add to card/i,
  loginButton: /log ?in/i,
  offerTile: '[data-testid*="offer"], article, li',
  otpField: /(one[- ]time|verification|security) code|enter code/i,
  password: /password/i,
  rememberDevice: /remember|don't ask|trust this/i,
  sendByEmail: /email/i,
  sendCodeButton: /send( me a)? code|continue|get code/i,
  signOutControl: /log ?out|sign ?out/i,
  userId: /user ?id/i,
  verifyButton: /verify|continue|submit/i,
  viewMoreButton: /view more|show more|load more/i,
};

/**
 * Amex Offers.
 *
 * Amex will not accept an authenticator app for most accounts, so the code
 * ladder here is expected to land on email — the run tells Amex to deliver by
 * email when it is offered, and asks to be remembered so the next run is not
 * challenged at all.
 */
export const amexAdapter: IssuerAdapter = {
  issuer: Issuer.Amex,

  openOffers: async (page) => {
    await page.goto(OFFERS_URL, { timeout: NAVIGATION_TIMEOUT_MS });
    const rendered = await appears(
      offerTiles(page).first(),
      NAVIGATION_TIMEOUT_MS,
    );
    if (rendered) {
      return amexOfferSurface(page);
    } else {
      throw new Error("Amex offers grid never rendered");
    }
  },

  signIn: async ({ page, credentials, requestCode }) => {
    await page.goto(LOGIN_URL, { timeout: NAVIGATION_TIMEOUT_MS });
    const alreadyIn = await appears(signedInMarker(page), PRESENCE_TIMEOUT_MS);
    if (!alreadyIn) {
      await page.getByLabel(AMEX.userId).fill(credentials.username);
      await page.getByLabel(AMEX.password).fill(credentials.password);
      await page.getByRole("button", { name: AMEX.loginButton }).click();
      await answerChallengeIfAsked(page, requestCode);
      const signedIn = await appears(signedInMarker(page), SIGN_IN_TIMEOUT_MS);
      if (!signedIn) {
        throw new Error("Amex never reached a signed-in page");
      }
    }
  },
};

const signedInMarker = (page: Page): Locator =>
  page
    .getByRole("link", { name: AMEX.signOutControl })
    .or(page.getByRole("button", { name: AMEX.signOutControl }))
    .first();

/**
 * Amex only challenges a browser it does not recognize, so most runs pass
 * straight through here. When it does challenge, pick email delivery: that is
 * the channel an unattended run can read for itself.
 */
const answerChallengeIfAsked = async (
  page: Page,
  requestCode: () => Promise<string>,
): Promise<void> => {
  const codeField = page.getByLabel(AMEX.otpField);
  const emailOption = page.getByRole("radio", { name: AMEX.sendByEmail });
  const challenged = await appears(
    codeField.or(emailOption).first(),
    PRESENCE_TIMEOUT_MS,
  );
  if (challenged) {
    const canPickEmail = await appears(emailOption, PRESENCE_TIMEOUT_MS);
    if (canPickEmail) {
      await emailOption.check();
      await page.getByRole("button", { name: AMEX.sendCodeButton }).click();
    }
    await codeField.waitFor({ state: "visible", timeout: SETTLE_TIMEOUT_MS });
    await codeField.fill(await requestCode());
    await rememberThisDevice(page);
    await page.getByRole("button", { name: AMEX.verifyButton }).first().click();
  }
};

/**
 * The single highest-value click in the whole run: a remembered device is why
 * tomorrow's run needs no code at all.
 */
const rememberThisDevice = async (page: Page): Promise<void> => {
  const remember = page.getByRole("checkbox", { name: AMEX.rememberDevice });
  if (await appears(remember, PRESENCE_TIMEOUT_MS)) {
    await remember.check();
  }
};

const amexOfferSurface = (page: Page): OfferSurface => ({
  add: async (offer) => {
    const button = tileFor(page, offer).getByRole("button", {
      name: AMEX.addButton,
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
      .getByRole("button", { name: AMEX.viewMoreButton })
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

/** Only tiles that still offer the button; an enrolled tile drops out here. */
const offerTiles = (page: Page): Locator =>
  page
    .locator(AMEX.offerTile)
    .filter({ has: page.getByRole("button", { name: AMEX.addButton }) });

const pendingOffers = async (page: Page): Promise<readonly PendingOffer[]> => {
  const titles = await offerTiles(page).evaluateAll((tiles) =>
    tiles.map((tile) => tile.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  );
  return titles
    .filter((title) => title.length > 0)
    .map((title) => ({ id: title, title }));
};

/** Tiles carry no stable id, so their own text is the handle we have. */
const tileFor = (page: Page, offer: PendingOffer): Locator =>
  offerTiles(page)
    .filter({ hasText: offer.title.slice(0, 40) })
    .first();

/**
 * "Is this on the page within the budget?" as a boolean.
 *
 * A timeout here is an answer, not a failure: whether Amex challenged us, and
 * whether a grid has a "view more" button, are both legitimately either-way.
 * Every caller branches on the result, so nothing is being swallowed.
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
