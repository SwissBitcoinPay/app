// Shape de réponse de `GET /v1/accounts/bank` ([endpoints/merchants.ts]).
// Pure TS (pas de Zod, pas de valeur runtime) — copié tel quel dans le
// front-end par scripts/gen-frontend-types.sh pour partager la source de
// vérité sans déps croisées.

export type BankAccountDetails = {
  id: string;
  type: string;
  bankName: string | null;
  currency: string | null;
  iban: string;
  reference: string | null;
  userIsOwner: boolean;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerStreet: string | null;
  ownerStreet2: string | null;
  ownerPostcode: string | null;
  ownerCity: string | null;
  ownerCountry: string | null;
};

export type GetAccountBankResponse = {
  bankId: string | null;
  details: BankAccountDetails | null;
};
