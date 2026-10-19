// Jusqu'à la 2.6.6, l'app enregistrait la clé d'activation sous `apiKey`, le
// nom de l'ancien back-end ; elle l'enregistre depuis sous `invoice_key`.
// Rend la clé d'un enregistrement resté à l'ancien format, rien sinon.
export const getLegacyActivationKey = (
  storedAccountConfig: unknown
): string | undefined => {
  if (typeof storedAccountConfig !== "object" || storedAccountConfig === null) {
    return undefined;
  }

  const { invoice_key: invoiceKey, apiKey } = storedAccountConfig as {
    invoice_key?: unknown;
    apiKey?: unknown;
  };
  // Le nouveau format peut aussi porter `apiKey` : le serveur renvoie encore
  // cet alias déprécié, et l'enregistrement reprend sa réponse telle quelle.
  if (typeof invoiceKey === "string" && invoiceKey !== "") {
    return undefined;
  }

  return typeof apiKey === "string" && apiKey !== "" ? apiKey : undefined;
};
