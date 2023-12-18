import axios, { AxiosError } from "axios";
import { MarkRequired, XOR } from "ts-essentials";

type ApiErrorType = {
  field?: string;
} & XOR<{ detail: string }, { reason: { detail: string } }>;

export const isApiError = (
  e: unknown
): e is MarkRequired<AxiosError<ApiErrorType>, "response"> =>
  axios.isAxiosError(e) && !!e?.response;
