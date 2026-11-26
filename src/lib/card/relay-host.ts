/*
 * A card relay's host, as written in a card (`lnurlw://<host>/w?…`) and as it enters the derivation
 * of a channel's secret (keys.ts): one relay has one spelling, or the same relay would give two
 * channels. Canonical: lowercase, a DNS name (punycode for an international one), and a port only
 * when it is not HTTPS's 443. No IP address of version 6, no user nor path.
 */

/** 1 to 63 letters, digits or hyphens, neither first nor last a hyphen. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PORT = /^[1-9][0-9]{0,4}$/;
const MAX_NAME_LENGTH = 253;

/**
 * The canonical spelling of `text` as a host (`name` or `name:port`), or null when it is not one.
 * Case is folded and port 443 dropped; anything else is refused rather than corrected (a scheme, a
 * path, spaces, a trailing dot).
 */
export function canonicalRelayHost(text: string): string | null {
  const match = /^([^:]+)(?::([^:]+))?$/.exec(text);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const port = match[2];
  if (name.length > MAX_NAME_LENGTH) return null;
  const labels = name.split(".");
  // A single label (`localhost`) is no public host: a card would call a name each network resolves
  // its own way.
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null;
  // The last label of a DNS name is never all digits, unless the whole is an IPv4 address.
  if (/^[0-9]+$/.test(labels[labels.length - 1]) && !isIpv4(labels)) return null;
  if (port === undefined) return name;
  if (!PORT.test(port) || Number(port) > 65535) return null;
  return port === "443" ? name : `${name}:${port}`;
}

/** Whether `host` is already canonical (canonicalRelayHost gives it back unchanged). */
export function isCanonicalRelayHost(host: string): boolean {
  return canonicalRelayHost(host) === host;
}

function isIpv4(labels: string[]): boolean {
  return (
    labels.length === 4 &&
    labels.every((label) => /^(0|[1-9][0-9]{0,2})$/.test(label) && Number(label) <= 255)
  );
}
