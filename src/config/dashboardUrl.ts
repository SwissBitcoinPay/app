const fallback = "https://dashboard.swiss-bitcoin-pay.ch" as const;

const fromEnv = process.env.DASHBOARD_URL;

export const dashboardUrl: `https://${string}` =
  fromEnv && /^https:\/\//.test(fromEnv)
    ? (fromEnv as `https://${string}`)
    : fallback;
