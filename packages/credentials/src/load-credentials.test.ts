import { describe, expect, it } from "bun:test";
import { errorMessage } from "@offers/error-message/error-message";

import { loadCredentials } from "./load-credentials";

const PATH = "/run/credentials/offers-credentials";

const deps = (contents: string) => ({
  readFile: () => Promise.resolve(contents),
  statMode: () => Promise.resolve(0o10_0600),
});

/**
 * The whole reportable failure, not just the outer message: `errorMessage`
 * flattens the `cause` chain, and that flattened line is what reaches the
 * journal and a push notification. A leak hides in the chain, not the wrapper.
 */
const reportOf = async (contents: string): Promise<string> => {
  try {
    await loadCredentials(PATH, deps(contents));
    throw new Error("expected loadCredentials to reject");
  } catch (error) {
    return errorMessage(error);
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
    expect(await reportOf("not json")).toContain(
      `${PATH} is not a valid offer-adder credentials file`,
    );
  });

  it("says which field is wrong when the shape is wrong", async () => {
    // Actionable without being revealing: the path to the field, never its
    // value. "Something is wrong somewhere in the file" is not a fixable
    // report when the file cannot be printed.
    expect(
      await reportOf('{"accounts":{"connor-amex":{"username":"c"}}}'),
    ).toContain("accounts.connor-amex.password");
  });

  describe("never reports the file's contents", () => {
    // Everything thrown here reaches the journal and a phone. A JSON syntax
    // error is the dangerous case: the parser quotes the token it choked on,
    // and an unquoted password is exactly such a token.
    const SECRET = "hunter2SECRET";

    it("when a value is unquoted, so the parser names it", async () => {
      const report = await reportOf(
        `{"accounts":{"a":{"username":"u","password": ${SECRET}}}}`,
      );
      expect(report).not.toContain(SECRET);
    });

    it("when the shape is wrong", async () => {
      const report = await reportOf(
        `{"accounts":{"a":{"username":"u","password":${JSON.stringify(SECRET)},"totpSecret":7}}}`,
      );
      expect(report).not.toContain(SECRET);
    });
  });
});
