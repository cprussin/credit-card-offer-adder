import { describe, expect, it } from "bun:test";

import { loadCredentials } from "./load-credentials";

const PATH = "/run/credentials/offers-credentials";

const deps = (contents: string) => ({
  readFile: () => Promise.resolve(contents),
  statMode: () => Promise.resolve(0o10_0600),
});

/** The wrapper's own message, which must not carry any of the file's contents. */
const messageOf = async (contents: string): Promise<string> => {
  try {
    await loadCredentials(PATH, deps(contents));
    throw new Error("expected loadCredentials to reject");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

describe("loadCredentials", () => {
  it("reads a well-formed document", async () => {
    const credentials = await loadCredentials(
      PATH,
      deps(
        JSON.stringify({
          accounts: { "connor-amex": { password: "hunter2", username: "c" } },
        }),
      ),
    );
    expect(credentials.accounts["connor-amex"]?.password).toBe("hunter2");
  });

  it("names the file when it is not JSON at all", async () => {
    expect(await messageOf("not json")).toBe(
      `${PATH} is not a valid offer-adder credentials file`,
    );
  });

  it("names the file when it is JSON of the wrong shape", async () => {
    expect(
      await messageOf('{"accounts":{"connor-amex":{"username":"c"}}}'),
    ).toBe(`${PATH} is not a valid offer-adder credentials file`);
  });

  it("keeps the document's contents out of the failure message", async () => {
    const message = await messageOf(
      '{"accounts":{"a":{"password":"hunter2"}}}',
    );
    expect(message).not.toContain("hunter2");
  });
});
