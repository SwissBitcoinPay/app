/*
 * The web app does not run in a frame. Another site could
 * show it in one, under its own page, and lead the user to click in it (clickjacking): the web app
 * is served without `frame-ancestors` nor `X-Frame-Options`, which EAS Hosting does not send for a
 * single-page app.
 *
 * Imported by the app's entry (index.ts) before anything else: in a frame, the page only shows a
 * link that opens the app in a tab of its own, and the bundle stops there, before the router or
 * any key is read.
 */

/** Whether the page is shown in a frame of another page. */
export function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    // A browser that refuses to compare them: a frame of another origin.
    return true;
  }
}

if (isFramed()) {
  const link = document.createElement("a");
  link.href = window.location.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = window.location.host;
  document.body?.replaceChildren(link);
  throw new Error("The web app does not run in a frame");
}
