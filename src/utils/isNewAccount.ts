import { addYears, isBefore } from "date-fns";

export const isNewAccount = (createdAt?: number) =>
  createdAt === undefined ||
  isBefore(new Date(), addYears(createdAt * 1000, 1));
