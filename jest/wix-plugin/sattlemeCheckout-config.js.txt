// sattle.me Checkout: the payment provider's configuration (Payment Provider service
// plugin, getConfig), which Wix reads when the site is published. What the site's payment
// settings and its checkout show. Self-contained: it imports nothing.
//
// The integration key is not one of the fields: it lives in the Secrets Manager alone, as
// sattleme-checkout-key (README, "Installation"). Wix requires a field (and shows no checkbox
// field, as measured on a Wix site): the merchant types the secret's name there, which
// connectAccount checks; a key typed there is refused. The second field is the time to pay an
// invoice, in minutes, which connectAccount checks too: Wix gives what it returned, as strings,
// to every createTransaction (merchantCredentials). Wix keeps "Connect" disabled while a field is
// empty (measured): the label asks for a number, never for an empty field. Wix shows these texts as they are: they read
// the same in every language of the plugin.

export function getConfig() {
  return {
    title: "sattle.me Checkout",
    paymentMethods: [
      {
        hostedPage: {
          title: "Bitcoin (Lightning / on-chain)"
        }
      }
    ],
    credentialsFields: [
      {
        simpleField: {
          name: "keySecretName",
          label:
            "Type sattleme-checkout-key: the secret that holds the integration key (never the key)"
        }
      },
      {
        simpleField: {
          name: "minutesToPay",
          label: "Minutes to pay an invoice: enter 1 to 60 (15 suggested)"
        }
      }
    ]
  };
}
