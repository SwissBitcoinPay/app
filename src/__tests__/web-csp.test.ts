/*
 * The web app's Content-Security-Policy: a `<meta>` of public/index.html, which `expo export` copies into
 * every web export, since EAS Hosting sends no header for a single-page app. The seed lives in the
 * page's memory while an account is open, and a team member's secret in its storage: the policy is
 * what stops an injected script (a future bug, a compromised dependency) from running.
 *
 * Each value is locked here with its reason; a change is a security change, made here. Checked in
 * Chromium against a web export: the welcome screen,
 * `/pay` (its relay frame's sockets from the frame), `/join`, `/advanced`, `/rescue`, the Breez
 * SDK's and ZXing's WebAssembly compiled, a sound played, an image cut through a canvas, BTC Map's
 * frame, the print frame; refused: eval, an inline or foreign script, `<base>`, `<object>`, a form,
 * another site's frame.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

import { MERCHANT_MAP_ORIGIN, MERCHANT_MAP_URL } from "@/config/merchant-map";
import { bytesToBase64 } from "@/lib/base64";
import { RELAY_FRAME_SCRIPT } from "@/lib/nostr/relay-frame-script";

const fs = jest.requireActual<{ readFileSync(path: string, encoding: "utf8"): string }>("fs");

const page = fs.readFileSync("public/index.html", "utf8");

/** The page's markup without its comments, which may name what it must not hold. */
const markup = page.replace(/<!--[\s\S]*?-->/g, "");

/** The policy's `<meta>` elements. */
const metas = [...markup.matchAll(/<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi)];

/** The policy, directive by directive. */
function directives(): Record<string, string[]> {
  const content = /\bcontent="([^"]*)"/.exec(metas[0]![0])![1]!;
  const result: Record<string, string[]> = {};
  for (const part of content.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (!name) continue;
    expect(result[name]).toBeUndefined(); // a repeated directive is ignored by browsers
    result[name] = values;
  }
  return result;
}

const relayFrameHash = `'sha256-${bytesToBase64(sha256(utf8ToBytes(RELAY_FRAME_SCRIPT)))}'`;

describe("the web app's Content-Security-Policy", () => {
  it("is one meta, the head's first element after its charset, before any script or style", () => {
    expect(metas).toHaveLength(1);
    // A policy only covers what follows it in the document.
    const head = /<head>([\s\S]*?)<\/head>/.exec(markup)![1]!;
    const elements = [...head.matchAll(/<(meta|link|style|script|title|base)\b[^>]*>/gi)];
    expect(elements[0]![0]).toBe('<meta charset="utf-8" />');
    expect(elements[1]![0]).toBe(metas[0]![0]);
    // The page itself has no script: Expo adds its own files' `<script src>` at export.
    expect(markup).not.toMatch(/<script\b/i);
  });

  it("holds exactly these directives", () => {
    expect(directives()).toEqual({
      // Anything not named below: the app's own origin only.
      "default-src": ["'self'"],
      // The app's own files (Metro's bundles, loaded by `<script src>`, lazy ones too), the relay
      // frame's script by its hash (its `srcdoc` inherits this policy), and WebAssembly's
      // compilation (the Breez SDK's, the scan's ZXing): never 'unsafe-inline' nor 'unsafe-eval'.
      "script-src": ["'self'", "'wasm-unsafe-eval'", relayFrameHash],
      // react-native-web writes its styles at run time, index.html and the printed PDFs have
      // `<style>` elements: styles cannot run code.
      "style-src": ["'self'", "'unsafe-inline'"],
      // Products' photos (Open Food Facts), cards' visuals, images the app makes (data:, blob:).
      "img-src": ["'self'", "data:", "blob:", "https:"],
      // The app's fonts, and the statement's, embedded in its print frame (report-fonts.ts).
      "font-src": ["'self'", "data:"],
      // The app's sounds, which expo-audio may preload as an object URL.
      "media-src": ["'self'", "blob:"],
      // Not a list of hosts: relays, the card relay and the merchant's Bitcoin node are the user's
      // own choice, any host, and the node may be a plain HTTP address of the local network
      // (node.ts, isLocalHost), which no host list can describe. Exfiltration is not what this
      // policy prevents (a relay of the user's list is a channel out anyway): running code is.
      "connect-src": ["'self'", "https:", "wss:", "http:", "ws:"],
      // BTC Map's map ("Where to pay with your card"); the relay and print frames are `srcdoc` documents.
      "frame-src": [MERCHANT_MAP_ORIGIN],
      "object-src": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'none'"]
    });
  });

  it("allows the relay frame's script, the one constant script it runs inline", () => {
    expect(directives()["script-src"]).toContain(relayFrameHash);
    expect(MERCHANT_MAP_URL.startsWith(`${MERCHANT_MAP_ORIGIN}/`)).toBe(true);
  });

  it("is checked in the export each deploy job serves", () => {
    for (const workflow of [
      ".github/workflows/deploy-staging.yml",
      ".github/workflows/release-production.yml"
    ]) {
      const text = fs.readFileSync(workflow, "utf8");
      const deploy = /- name: Deploy the web app\n\s+run: \|\n([\s\S]*?)eas deploy/.exec(text);
      expect(deploy?.[1]).toContain(
        "grep -q 'http-equiv=\"Content-Security-Policy\"' dist/index.html"
      );
    }
  });
});
