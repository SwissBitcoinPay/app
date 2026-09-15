import { FetchError } from "trailbase";

export const isInvalidCredentialsError = (error: unknown): boolean =>
  error instanceof FetchError && error.status === 401;
