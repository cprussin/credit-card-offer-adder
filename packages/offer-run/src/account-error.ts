/**
 * Why an account produced no offers this run. The distinction matters when the
 * report reaches a phone at 6am: `SignInFailed` usually means a code never
 * arrived and is worth acting on, while `OffersUnavailable` normally means the
 * bank changed its page and the adapter needs a fix.
 */
export enum AccountErrorType {
  SignInFailed,
  OffersUnavailable,
}

export const AccountError = {
  OffersUnavailable: (reason: string) => ({
    reason,
    type: AccountErrorType.OffersUnavailable as const,
  }),
  SignInFailed: (reason: string) => ({
    reason,
    type: AccountErrorType.SignInFailed as const,
  }),
};

export type AccountError = ReturnType<
  (typeof AccountError)[keyof typeof AccountError]
>;
