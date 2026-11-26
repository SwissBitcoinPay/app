import { bytesOf, decodeUtf8, encodeUtf8 } from "./text";
import { webAtob, webBtoa } from "./web-base64";

/*
 * What JavaScriptCore lacks of the web platform that the app's code uses: TextEncoder and
 * TextDecoder, UTF-8 only (@noble's utf8ToBytes and bytesToUtf8), and atob and btoa
 * (whatwg-url-minimum, web-base64.ts). Installed only where missing,
 * before any other module of the engine's bundle runs (the entry imports this first).
 */

class Utf8Encoder {
  readonly encoding = "utf-8";

  encode(input = ""): Uint8Array {
    return encodeUtf8(String(input));
  }
}

class Utf8Decoder {
  readonly encoding = "utf-8";
  readonly fatal: boolean;
  readonly ignoreBOM = false;

  constructor(label = "utf-8", options: { fatal?: boolean; ignoreBOM?: boolean } = {}) {
    if (!/^\s*(utf-8|utf8|unicode-1-1-utf-8)\s*$/i.test(label)) {
      throw new RangeError(`Only UTF-8 here, not ${label}`);
    }
    if (options.ignoreBOM) throw new RangeError("ignoreBOM is not supported here");
    this.fatal = options.fatal === true;
  }

  decode(input?: unknown, options?: { stream?: boolean }): string {
    if (options?.stream) throw new RangeError("Streaming is not supported here");
    return decodeUtf8(bytesOf(input), { fatal: this.fatal });
  }
}

const scope = globalThis as {
  TextEncoder?: unknown;
  TextDecoder?: unknown;
  atob?: unknown;
  btoa?: unknown;
};
if (typeof scope.TextEncoder !== "function") scope.TextEncoder = Utf8Encoder;
if (typeof scope.TextDecoder !== "function") scope.TextDecoder = Utf8Decoder;
if (typeof scope.atob !== "function") scope.atob = webAtob;
if (typeof scope.btoa !== "function") scope.btoa = webBtoa;

export { Utf8Decoder, Utf8Encoder };
