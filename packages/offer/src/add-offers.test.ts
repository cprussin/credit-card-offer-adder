import { describe, expect, it } from "bun:test";

import { addOffers } from "./add-offers";
import type { OfferSurface } from "./offer-surface";
import type { PendingOffer } from "./pending-offer";

const offer = (id: string): PendingOffer => ({ id, title: `offer ${id}` });

/**
 * A surface backed by a plain list. `pages` is consumed one entry per
 * `loadMore` call, so a test can describe a grid that reveals more offers as
 * it is paged. Offers move out of `pending` as they are added, mirroring a
 * real grid where an enrolled tile stops advertising its button.
 */
const fakeSurface = ({
  pending = [],
  pages = [],
  rejects = new Set<string>(),
  revealsOnPass = [],
}: {
  pending?: readonly PendingOffer[];
  pages?: readonly (readonly PendingOffer[])[];
  rejects?: ReadonlySet<string>;
  revealsOnPass?: readonly (readonly PendingOffer[])[];
}): OfferSurface & { readonly listCalls: () => number } => {
  const state = {
    listCalls: 0,
    loadCalls: 0,
    pending: [...pending],
  };
  return {
    add: (target) => {
      if (rejects.has(target.id)) {
        return Promise.reject(new Error(`add rejected for ${target.id}`));
      } else {
        state.pending = state.pending.filter((each) => each.id !== target.id);
        return Promise.resolve();
      }
    },
    listCalls: () => state.listCalls,
    listPendingOffers: () => {
      const revealed = revealsOnPass[state.listCalls] ?? [];
      state.listCalls += 1;
      state.pending = [...state.pending, ...revealed];
      return Promise.resolve(state.pending);
    },
    loadMore: () => {
      const page = pages[state.loadCalls];
      state.loadCalls += 1;
      if (page === undefined) {
        return Promise.resolve(false);
      } else {
        state.pending = [...state.pending, ...page];
        return Promise.resolve(true);
      }
    },
  };
};

describe("addOffers", () => {
  it("adds every offer the surface reports as pending", async () => {
    const report = await addOffers({
      surface: fakeSurface({ pending: [offer("a"), offer("b")] }),
    });
    expect(report).toEqual({
      added: [offer("a"), offer("b")],
      failed: [],
    });
  });

  it("records a failed add and continues with the remaining offers", async () => {
    const report = await addOffers({
      surface: fakeSurface({
        pending: [offer("a"), offer("b"), offer("c")],
        rejects: new Set(["b"]),
      }),
    });
    expect(report.added).toEqual([offer("a"), offer("c")]);
    expect(report.failed).toEqual([
      { offer: offer("b"), reason: "add rejected for b" },
    ]);
  });

  it("does not re-attempt an offer the surface keeps listing", async () => {
    const report = await addOffers({
      surface: fakeSurface({
        pending: [offer("a")],
        rejects: new Set(["a"]),
      }),
    });
    expect(report.failed).toHaveLength(1);
  });

  it("pages the whole grid in before listing offers", async () => {
    const report = await addOffers({
      surface: fakeSurface({
        pages: [[offer("a")], [offer("b")]],
        pending: [],
      }),
    });
    expect(report.added).toEqual([offer("a"), offer("b")]);
  });

  it("adds offers that only appear on a later pass", async () => {
    const report = await addOffers({
      surface: fakeSurface({
        pending: [offer("a")],
        revealsOnPass: [[], [offer("b")]],
      }),
    });
    expect(report.added).toEqual([offer("a"), offer("b")]);
  });

  it("stops after the pass budget when new offers never run out", async () => {
    const surface = fakeSurface({
      revealsOnPass: Array.from({ length: 10 }, (_unused, index) => [
        offer(`extra-${index}`),
      ]),
    });
    const report = await addOffers({ maxPasses: 3, surface });
    expect(report.added).toHaveLength(3);
    expect(surface.listCalls()).toBe(3);
  });

  it("throws when the grid never finishes paging", async () => {
    const endlessSurface: OfferSurface = {
      add: () => Promise.resolve(),
      listPendingOffers: () => Promise.resolve([]),
      loadMore: () => Promise.resolve(true),
    };
    await expect(
      addOffers({ maxLoadMoreClicks: 4, surface: endlessSurface }),
    ).rejects.toThrow("offers grid still reported more results after 4 loads");
  });
});
