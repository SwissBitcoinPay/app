// L'app web de sattle.me, vers laquelle l'app web v2 envoie ses utilisateurs
// dès le 26.11.2026 (migration vers sattle.me, SwissBitcoinPay/new-app,
// docs/etude-migration-v2.md). `SATTLEME_URL` (build) ne sert qu'à viser une
// autre app web, en développement ; seule une origine https est retenue :
// l'adresse reçoit la session du propriétaire dans son fragment.
const fallback = "https://app.sattle.me" as const;

export const sattlemeOrigin = (value: string | undefined): string => {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) {
      return fallback;
    }
    return url.origin;
  } catch {
    return fallback;
  }
};

export const sattlemeUrl = sattlemeOrigin(process.env.SATTLEME_URL);
