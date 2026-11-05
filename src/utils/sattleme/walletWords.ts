import * as BIP39 from "bip39";

export type WordsReveal =
  | { status: "words"; words: string[] }
  | { status: "wrongPassword" }
  | { status: "unreadable" };

// Les mots du portefeuille créé dans l'app web v2, déchiffrés dans ce
// navigateur avec le mot de passe qui les protège (celui du compte à leur
// création : `AsyncStorage` web, PBKDF2 puis AES-GCM). Rien ne quitte ce
// navigateur. `read` lève quand le mot de passe ne les déchiffre pas ; une
// valeur qui n'est pas une phrase BIP-39 n'est jamais montrée pour des mots.
export const revealWalletWords = async (
  read: (password: string) => Promise<string | null>,
  password: string
): Promise<WordsReveal> => {
  let text: string | null;
  try {
    text = await read(password);
  } catch {
    return { status: "wrongPassword" };
  }
  if (!text) return { status: "unreadable" };
  const words = text.trim().split(/[\s,]+/);
  return BIP39.validateMnemonic(words.join(" "))
    ? { status: "words", words }
    : { status: "unreadable" };
};
