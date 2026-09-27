import { appRootUrl } from "@config/appRootUrl";

const oldAppRootUrl = "https://checkout.swiss-bitcoin-pay.ch";

const supportedOrigins = [appRootUrl, oldAppRootUrl].map((origin) =>
  origin.toLowerCase()
);

// Deliberately parsed without `new URL()`: React Native's implementation is
// not WHATWG-compliant (e.g. it appends a trailing `/` to the path when the
// URL has neither `?` nor `#`), whereas the web and Jest use the standard
// implementation. The same link used to give two different results.
const activationLinkRegex =
  /^(https?:\/\/[^/?#]+)\/connect\/([^/?#]+)\/?(?:\?([^#]*))?(?:#.*)?$/i;

const decodeQueryComponent = (value: string) => {
  const withSpaces = value.replace(/\+/g, " ");
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    return withSpaces;
  }
};

const parseQuery = (query = "") => {
  const params = new Map<string, string>();
  query.split("&").forEach((pair) => {
    if (!pair) {
      return;
    }
    const separatorIndex = pair.indexOf("=");
    const key = decodeQueryComponent(
      separatorIndex === -1 ? pair : pair.slice(0, separatorIndex)
    );
    if (!params.has(key)) {
      params.set(
        key,
        separatorIndex === -1
          ? ""
          : decodeQueryComponent(pair.slice(separatorIndex + 1))
      );
    }
  });
  return params;
};

export const parseActivationLink = (scannedValue: string) => {
  const match = scannedValue.trim().match(activationLinkRegex);
  if (!match) {
    return;
  }

  const [, origin, encodedActivationKey, query] = match;
  if (!supportedOrigins.includes(origin.toLowerCase())) {
    return;
  }

  let activationKey: string;
  try {
    activationKey = decodeURIComponent(encodedActivationKey);
  } catch {
    return;
  }

  const params = parseQuery(query);
  return {
    activationKey,
    deviceName: params.get("deviceName"),
    hmac: params.get("hmac"),
    isGuest: params.has("isGuest")
  };
};
