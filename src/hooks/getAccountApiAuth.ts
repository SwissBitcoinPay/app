import type { ApiKeyAuth } from "@types";

export const getAccountApiAuth = (
  apiKey?: string
): ApiKeyAuth | undefined => (apiKey ? { apiKey } : undefined);

export const getAccountRefreshApiKey = (
  apiKey: string | undefined,
  hasJwtSession: boolean
): string | undefined => (hasJwtSession ? undefined : apiKey);
