const endpoint = process.env.API_ENDPOINT || "https://api.swiss-bitcoin-pay.ch";

export const apiRootUrl = endpoint;
export const apiRootDomain = endpoint.replace(/^https?:\/\//, "");
