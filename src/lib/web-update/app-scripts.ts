/*
 * The web app's own scripts, by which one deployment is told from another (watch.web.ts): `expo
 * export` names each after its content (`/_expo/static/js/web/index-<hash>.js`), and the page's
 * HTML loads the first ones (`<script src>`). Pure.
 */

const APP_SCRIPT = /\/_expo\/static\/js\/web\/([A-Za-z0-9._-]+\.js)$/;
const SCRIPT_SRC = /<script\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi;

/** The name of the app's script at `src` (a path or a URL), or null for any other script. */
export function appScriptName(src: string): string | null {
  // Its path only: a query or a fragment is no part of the name.
  const path = src.split(/[?#]/, 1)[0];
  return APP_SCRIPT.exec(path)?.[1] ?? null;
}

/** The app's scripts a page's HTML loads, in order. */
export function appScriptsOf(html: string): string[] {
  const names: string[] = [];
  for (const [, src] of html.matchAll(SCRIPT_SRC)) {
    const name = appScriptName(src);
    if (name) names.push(name);
  }
  return names;
}

/**
 * Whether the page deployed (its scripts, `deployed`) is another version than the one running
 * (`running`, the scripts it loaded): one of its scripts at least is not among them. Without
 * scripts of the app on either side, never: nothing to compare.
 */
export function isOtherVersion(deployed: readonly string[], running: ReadonlySet<string>): boolean {
  return running.size > 0 && deployed.some((name) => !running.has(name));
}
