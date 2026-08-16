import { describe, expect, it } from "bun:test";
import type { FetchLike } from "./npm-registry";
import { fetchPublishedAt } from "./npm-registry";

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });

describe("fetchPublishedAt", () => {
  it("returns the publish date for the requested version", async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(
        jsonResponse({ time: { "1.2.3": "2026-06-01T12:00:00.000Z" } }),
      );
    const published = await fetchPublishedAt("pkg", "1.2.3", fetchImpl);
    expect(published).toEqual(new Date("2026-06-01T12:00:00.000Z"));
  });

  it("throws when the registry has no publish time for the version", async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(jsonResponse({ time: {} }));
    await expect(fetchPublishedAt("pkg", "9.9.9", fetchImpl)).rejects.toThrow(
      "no publish time",
    );
  });

  it("throws when the registry request fails", async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(new Response("nope", { status: 500 }));
    await expect(fetchPublishedAt("pkg", "1.0.0", fetchImpl)).rejects.toThrow(
      "500",
    );
  });
});
