import { describe, expect, it } from "bun:test";

import { parseCatalogNames } from "./catalog";

describe("parseCatalogNames", () => {
  it("returns the name of every catalog entry", () => {
    const names = parseCatalogNames(
      JSON.stringify({ catalog: { hono: "^4.12.0", zod: "^4.0.0" } }),
    );
    expect([...names].sort()).toEqual(["hono", "zod"]);
  });
});
