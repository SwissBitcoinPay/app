/**
 * The rescue ("Open with my 12 words", rescue.ts) closed, or another opened, while a step ran:
 * nothing sent. Its own module: the account's failures tell it (usePasskeyAccount.ts) without
 * loading the rescue.
 */
export class RescueClosedError extends Error {
  constructor() {
    super("The rescue closed");
    this.name = "RescueClosedError";
  }
}
