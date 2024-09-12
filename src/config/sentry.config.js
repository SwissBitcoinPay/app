import * as Sentry from "@sentry/react-native";

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    debug: process.env.NODE_ENV !== "production"
  });
}
