import { describeError, type LoggedError } from "./entry";

/*
 * A copy of an error that holds nothing of the app's, for what reports an error off the device:
 * Expo Observe (src/lib/observe/), and React Native's own report of an error that stops the app,
 * which Observe also reads (Android: its JavascriptException; iOS: the exception RCTFatal raises).
 * Its kind, its code and its message as the journal keeps them (entry.ts: a message only when it is
 * plain words), its causes the same way, and the frames of its stack, which are the code's. Never
 * its message as written (the stack starts with it), nor anything else it carries: React's
 * component stack, own properties. A stack that does not start with the error's message as it is
 * now could repeat an earlier one: none of its lines is kept. Never throws: it runs in the handler
 * of the errors that stop the app, which must hand them on. Pure.
 */

/** The message of a copy whose error said nothing that may leave the device. */
export const LEFT_OUT_MESSAGE = "(message left out)";

/**
 * A frame of a stack, as Hermes writes it (React Native's parseHermesStack: `at name (file:1:2)`,
 * `at name (address at file:1:2)`, `at name (native)`), and V8 in Jest. The function's name is the
 * code's; its file, a path or a bundle's name, has no space.
 */
const FRAME =
  /^ {4}at [^()\n]{1,256} \((?:native|(?:address at )?[^\s()]{1,1024}:\d{1,10}:\d{1,10})\)$/;
/** Hermes' line for the frames it leaves out of a long stack. */
const SKIPPED = /^ {4}\.\.\. skipping \d{1,10} frames$/;
/** Frames kept at most: the innermost, where the error came from. */
export const MAX_FRAMES = 64;

/** An error as the copy says it: its code and its message, then what caused it. */
function said(error: LoggedError): string {
  const own = [error.code, error.message].filter((part) => part !== null).join(": ");
  if (!error.cause) return own;
  const cause = said(error.cause);
  const causeText = cause ? `${error.cause.kind}: ${cause}` : error.cause.kind;
  return own ? `${own} (caused by ${causeText})` : `caused by ${causeText}`;
}

/** The error as text, as its stack starts with it (Error.prototype.toString). */
function headerOf(name: string, message: string): string {
  if (!name) return message;
  return message ? `${name}: ${message}` : name;
}

/**
 * The frames of `error`'s stack, after its first lines: the error as text, with its message on as
 * many lines as it has. Its name may have been given once its stack was (a subclass naming itself
 * in its constructor): its stack then starts with "Error".
 */
function framesOf(error: unknown): string[] {
  if (typeof error !== "object" || error === null) return [];
  const { stack, name, message } = error as Record<string, unknown>;
  if (typeof stack !== "string" || typeof message !== "string") return [];
  const header = [typeof name === "string" ? name : "Error", "Error"]
    .map((given) => headerOf(given, message))
    // Whole lines: its next line starts after it.
    .find(
      (text) =>
        stack.startsWith(text) && (stack.length === text.length || stack[text.length] === "\n")
    );
  if (header === undefined) return [];
  return stack
    .slice(header.length)
    .split("\n")
    .filter((line) => FRAME.test(line) || SKIPPED.test(line))
    .slice(0, MAX_FRAMES);
}

/** A new Error that says of `error` only what may leave the device (see above). */
export function safeErrorCopy(error: unknown): Error {
  try {
    const described = describeError(error);
    const name = described?.kind ?? "Error";
    const message = (described && said(described)) || LEFT_OUT_MESSAGE;
    const copy = new Error(message);
    copy.name = name;
    copy.stack = [`${name}: ${message}`, ...framesOf(error)].join("\n");
    return copy;
  } catch {
    // An error that cannot be read (a getter that throws, a revoked proxy): nothing of it.
    const copy = new Error(LEFT_OUT_MESSAGE);
    copy.stack = `Error: ${LEFT_OUT_MESSAGE}`;
    return copy;
  }
}
