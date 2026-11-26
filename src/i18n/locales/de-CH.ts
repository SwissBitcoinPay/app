import { swissSpelling } from "../swiss-spelling";

import de from "./de";
import type { Translations } from "./fr";

/*
 * Swiss Standard German (Schweizer Hochdeutsch): German as Switzerland and Liechtenstein write it,
 * for a device whose German is theirs (src/i18n/languages.ts). Not a dialect: the written standard
 * of Swiss newspapers, banks and the federal administration. Derived from de.ts, so that a text
 * written there is never missing here (swissSpelling, then SWISS_WORDINGS):
 * - every ß is written ss, ẞ as SS (amtliches Regelwerk of the Rat für deutsche Rechtschreibung,
 *   § 25 E2: "In der Schweiz und in Liechtenstein kann immer ss geschrieben werden");
 * - quotation marks are guillemets, « » and ‹ ›, without spaces (Federal Chancellery,
 *   Schreibweisungen, 201–202: "Die in Deutschland übliche Schreibung […] ist in der Schweiz für
 *   amtliche Texte nicht zulässig"), where de.ts writes „ “ and ‚ ‘;
 * - Switzerland's own words where it writes otherwise (SWISS_WORDINGS): "innert" for a delay,
 *   "das E-Mail" (Schreibweisungen, 362), "die Limite" (Swiss banks' "Kartenlimite"),
 *   "MWST" and "Normalsatz" (the Swiss VAT act, MWSTG art. 25), "das Total", an amount's
 *   decimal point ("4.80", Schreibweisungen, 514), a letter's salutation without a comma and
 *   "Freundliche Grüsse".
 * Each Swiss wording holds the German text it replaces: once that text changes in de.ts, the
 * wording is no longer used (the German text then shows, in Swiss spelling) and a test fails until
 * the wording is written again (i18n-swiss-german.test.ts).
 */

/** A text as Switzerland writes it instead: [the German text of de.ts, Switzerland's]. */
type SwissWording = readonly [german: string, swiss: string];

/** Switzerland's wordings, at the keys of the translations. */
export type SwissWordings<T> = {
  readonly [K in keyof T]?: T[K] extends string ? SwissWording : SwissWordings<T[K]>;
};

export const SWISS_WORDINGS: SwissWordings<Translations> = {
  migration: {
    forgot: {
      lead: [
        "Geben Sie die E-Mail Ihres alten Swiss-Bitcoin-Pay-Kontos ein: Wir senden Ihnen einen Link, um ein neues Passwort zu wählen.",
        "Geben Sie das E-Mail Ihres alten Swiss-Bitcoin-Pay-Kontos ein: Wir senden Ihnen einen Link, um ein neues Passwort zu wählen."
      ],
      sent: [
        "Falls ein Swiss-Bitcoin-Pay-Konto {{email}} verwendet, wurde soeben eine E-Mail dorthin gesendet. Öffnen Sie den Link, um ein neues Passwort zu wählen.",
        "Falls ein Swiss-Bitcoin-Pay-Konto {{email}} verwendet, wurde soeben ein E-Mail dorthin gesendet. Öffnen Sie den Link, um ein neues Passwort zu wählen."
      ]
    },
    transfer: {
      sent: [
        "Der Betrag erscheint in „$t(navigation.destinations.wallet)“, sobald das Netzwerk ihn bestätigt, meist innerhalb einer Stunde. Netzwerkgebühr: {{fee}}.",
        "Der Betrag erscheint in «$t(navigation.destinations.wallet)», sobald das Netzwerk ihn bestätigt, meist innert einer Stunde. Netzwerkgebühr: {{fee}}."
      ]
    },
    changes: {
      items: {
        limits: {
          title: ["Keine Limits mehr", "Keine Limiten mehr"],
          caption: [
            "Dank dem Update auf sattle.me 3.0.0 gibt es keine Limits und Einschränkungen mehr, die an die Identitätsprüfung gebunden sind.",
            "Dank dem Update auf sattle.me 3.0.0 gibt es keine Limiten und Einschränkungen mehr, die an die Identitätsprüfung gebunden sind."
          ]
        }
      }
    }
  },
  card: {
    failure: {
      migrationOverDailyLimit: [
        "Diese Übertragung überschreitet das Limit der Karte: 1000 CHF pro 24 Stunden, ihre letzten Ausgaben eingerechnet. Es wurde nichts übertragen und die Karte wurde nicht verändert: Versuchen Sie es erneut, sobald ihr Guthaben unter diesem Limit liegt, oder kontaktieren Sie den Support.",
        "Diese Übertragung überschreitet die Limite der Karte: 1000 CHF pro 24 Stunden, ihre letzten Ausgaben eingerechnet. Es wurde nichts übertragen und die Karte wurde nicht verändert: Versuchen Sie es erneut, sobald ihr Guthaben unter dieser Limite liegt, oder kontaktieren Sie den Support."
      ]
    },
    decline: {
      aboveLimit: [
        "Betrag über dem Limit pro Zahlung der Karte.",
        "Betrag über der Limite pro Zahlung der Karte."
      ],
      dayLimit: ["24-Stunden-Limit der Karte erreicht.", "24-Stunden-Limite der Karte erreicht."],
      hourLimit: [
        "Zu viele Zahlungen mit dieser Karte innerhalb einer Stunde.",
        "Zu viele Zahlungen mit dieser Karte innert einer Stunde."
      ]
    },
    payment: {
      delay: {
        minute: ["innerhalb einer Minute", "innert einer Minute"],
        seconds_one: ["innerhalb von {{count}} Sekunde", "innert {{count}} Sekunde"],
        seconds_other: ["innerhalb von {{count}} Sekunden", "innert {{count}} Sekunden"]
      },
      answerIn: ["Antworten Sie innerhalb von {{seconds}} s", "Antworten Sie innert {{seconds}} s"],
      failure: {
        dayLimit: [
          "Diese Zahlung würde das 24-Stunden-Limit Ihrer Karte überschreiten. Es wurde nichts bezahlt.",
          "Diese Zahlung würde die 24-Stunden-Limite Ihrer Karte überschreiten. Es wurde nichts bezahlt."
        ],
        aboveLimit: [
          "Der Betrag liegt über dem Limit Ihrer Karte. Es wurde nichts bezahlt.",
          "Der Betrag liegt über der Limite Ihrer Karte. Es wurde nichts bezahlt."
        ]
      }
    },
    payee: {
      nodeWarning: [
        "Dieser Händler ist über seinen Lightning-Knoten identifiziert, nicht über seine Adresse. Wird dieser Knoten geteilt (Spark, Wallet of Satoshi, Strike…), genehmigen Sie damit auch alle seine anderen Nutzer: Auch diese würden ohne Bestätigung bezahlt, innerhalb der Limits der Karte.",
        "Dieser Händler ist über seinen Lightning-Knoten identifiziert, nicht über seine Adresse. Wird dieser Knoten geteilt (Spark, Wallet of Satoshi, Strike…), genehmigen Sie damit auch alle seine anderen Nutzer: Auch diese würden ohne Bestätigung bezahlt, innerhalb der Limiten der Karte."
      ]
    }
  },
  cards: {
    adding: {
      migration: {
        doneSubtitle: [
          "Sie bezahlt nun aus ihrer eigenen Wallet, innerhalb ihrer Limits.",
          "Sie bezahlt nun aus ihrer eigenen Wallet, innerhalb ihrer Limiten."
        ],
        doneSubtitleVisual: [
          "Sie behält ihr Motiv und ihre Nummer und bezahlt nun aus ihrer eigenen Wallet, innerhalb ihrer Limits.",
          "Sie behält ihr Motiv und ihre Nummer und bezahlt nun aus ihrer eigenen Wallet, innerhalb ihrer Limiten."
        ]
      }
    },
    home: {
      steps: {
        pay: {
          caption: [
            "Halten Sie sie an das Terminal eines Händlers: Sie bezahlt, innerhalb der Limits, die Sie festlegen.",
            "Halten Sie sie an das Terminal eines Händlers: Sie bezahlt, innerhalb der Limiten, die Sie festlegen."
          ]
        }
      },
      limits: ["Limits", "Limiten"]
    },
    limits: {
      back: ["Zurück zu den Limits", "Zurück zu den Limiten"],
      day: {
        limit: ["Limit: {{max}} sats", "Limite: {{max}} sats"],
        reached: [
          "Limit erreicht: Die Karte lehnt jede Zahlung ab",
          "Limite erreicht: Die Karte lehnt jede Zahlung ab"
        ],
        lead: [
          "Eine Zahlung, die mit denen der letzten 24 Stunden dieses Limit überschreiten würde, wird abgelehnt.",
          "Eine Zahlung, die mit denen der letzten 24 Stunden diese Limite überschreiten würde, wird abgelehnt."
        ],
        field: ["Limit in 24 Stunden", "Limite in 24 Stunden"],
        belowPayment: [
          "Unter dem Limit pro Zahlung ({{amount}} sats): Dieses 24-Stunden-Limit begrenzt jede Zahlung.",
          "Unter der Limite pro Zahlung ({{amount}} sats): Diese 24-Stunden-Limite begrenzt jede Zahlung."
        ]
      },
      hour: {
        limit_one: ["Limit: {{count}} Zahlung pro Stunde", "Limite: {{count}} Zahlung pro Stunde"],
        limit_other: [
          "Limit: {{count}} Zahlungen pro Stunde",
          "Limite: {{count}} Zahlungen pro Stunde"
        ],
        reached: [
          "Limit erreicht: nächste Zahlung möglich {{when}}",
          "Limite erreicht: nächste Zahlung möglich {{when}}"
        ]
      },
      payment: {
        lead: [
          "Eine Zahlung über diesem Limit wird abgelehnt.",
          "Eine Zahlung über dieser Limite wird abgelehnt."
        ],
        field: ["Limit pro Zahlung", "Limite pro Zahlung"],
        aboveDay: [
          "Über dem Limit in 24 Stunden ({{amount}} sats): Das 24-Stunden-Limit begrenzt jede Zahlung.",
          "Über der Limite in 24 Stunden ({{amount}} sats): Die 24-Stunden-Limite begrenzt jede Zahlung."
        ]
      }
    },
    relay: {
      steps: {
        resetNotice: [
          "Solange der Wechsel nicht abgeschlossen ist, bezahlt die Karte nicht mehr und erscheint nicht mehr unter „Karten“. Mit „Karte hinzufügen“ kehrt sie mit ihrem Guthaben, ihrem Namen und ihren Limits auf das Standardrelais zurück.",
          "Solange der Wechsel nicht abgeschlossen ist, bezahlt die Karte nicht mehr und erscheint nicht mehr unter «Karten». Mit «Karte hinzufügen» kehrt sie mit ihrem Guthaben, ihrem Namen und ihren Limiten auf das Standardrelais zurück."
        ]
      }
    },
    history: {
      reasons: {
        aboveLimit: ["über dem Limit pro Zahlung", "über der Limite pro Zahlung"],
        dayLimit: ["24-Stunden-Limit erreicht", "24-Stunden-Limite erreicht"]
      },
      motives: {
        aboveLimit: ["Über dem Limit pro Zahlung", "Über der Limite pro Zahlung"],
        dayLimit: ["24-Stunden-Limit erreicht", "24-Stunden-Limite erreicht"]
      },
      detail: {
        approveNote: [
          "Ihr Passkey wird verlangt. Seine nächsten Zahlungen gehen ohne Bestätigung durch, innerhalb der Limits der Karte.",
          "Ihr Passkey wird verlangt. Seine nächsten Zahlungen gehen ohne Bestätigung durch, innerhalb der Limiten der Karte."
        ],
        approvedNote: [
          "Händler genehmigt: Seine nächsten Zahlungen gehen ohne Bestätigung durch, innerhalb der Limits der Karte.",
          "Händler genehmigt: Seine nächsten Zahlungen gehen ohne Bestätigung durch, innerhalb der Limiten der Karte."
        ]
      }
    },
    wallet: {
      onchainConfirmations: [
        "Was Sie dorthin senden, wird dem Guthaben der Karte nach 1 bis 3 Bestätigungen gutgeschrieben, innerhalb von etwa dreißig Minuten.",
        "Was Sie dorthin senden, wird dem Guthaben der Karte nach 1 bis 3 Bestätigungen gutgeschrieben, innert etwa dreissig Minuten."
      ]
    },
    payees: {
      modeBox: {
        automatic: {
          caption: [
            "Jeder gültige Tap wird bezahlt, innerhalb der Limits",
            "Jeder gültige Tap wird bezahlt, innerhalb der Limiten"
          ]
        }
      },
      nodeNote: [
        "Über seinen Lightning-Knoten genehmigt: Wird dieser Knoten geteilt (Spark, Wallet of Satoshi, Strike…), werden auch alle seine anderen Nutzer ohne Bestätigung bezahlt, innerhalb der Limits der Karte.",
        "Über seinen Lightning-Knoten genehmigt: Wird dieser Knoten geteilt (Spark, Wallet of Satoshi, Strike…), werden auch alle seine anderen Nutzer ohne Bestätigung bezahlt, innerhalb der Limiten der Karte."
      ],
      modes: {
        automatic: {
          body: [
            "Jeder gültige Tap wird bezahlt, innerhalb der Limits der Karte. Der Händler wird angezeigt, ohne Prüfung.",
            "Jeder gültige Tap wird bezahlt, innerhalb der Limiten der Karte. Der Händler wird angezeigt, ohne Prüfung."
          ]
        }
      }
    }
  },
  pos: {
    basket: {
      total: ["Summe", "Total"],
      tooLarge: [
        "Die Summe übersteigt den Höchstbetrag einer Zahlung.",
        "Das Total übersteigt den Höchstbetrag einer Zahlung."
      ]
    },
    scan: {
      lead: [
        "Jeder gescannte Artikel wird zur Summe hinzugefügt.",
        "Jeder gescannte Artikel wird zum Total hinzugefügt."
      ]
    }
  },
  articles: {
    form: {
      priceInvalid: ["Geben Sie einen Preis wie 4,80 ein", "Geben Sie einen Preis wie 4.80 ein"]
    }
  },
  activity: {
    pendingCredit: {
      fees: [
        "Die Gutschrift dieser Zahlung auf Ihr Guthaben kostet derzeit mehr als {{fee}}, unser Limit. Sie erfolgt automatisch, sobald diese Kosten es nicht mehr überschreiten, wenn Sie Ihre Wallet öffnen.",
        "Die Gutschrift dieser Zahlung auf Ihr Guthaben kostet derzeit mehr als {{fee}}, unsere Limite. Sie erfolgt automatisch, sobald diese Kosten sie nicht mehr überschreiten, wenn Sie Ihre Wallet öffnen."
      ],
      feesQuoted: [
        "Die Gutschrift dieser Zahlung auf Ihr Guthaben kostet derzeit {{price}}, mehr als unser Limit von {{fee}}. Sie erfolgt automatisch, sobald diese Kosten es nicht mehr überschreiten, wenn Sie Ihre Wallet öffnen.",
        "Die Gutschrift dieser Zahlung auf Ihr Guthaben kostet derzeit {{price}}, mehr als unsere Limite von {{fee}}. Sie erfolgt automatisch, sobald diese Kosten sie nicht mehr überschreiten, wenn Sie Ihre Wallet öffnen."
      ]
    }
  },
  sell: {
    profile: {
      title: ["Ihre E-Mail", "Ihr E-Mail"],
      emailInvalid: ["Geben Sie eine gültige E-Mail ein", "Geben Sie ein gültiges E-Mail ein"]
    },
    sale: {
      seeLimits: ["Meine Limits ansehen", "Meine Limiten ansehen"]
    },
    order: {
      delayChf: [
        "Innerhalb von 1 Werktag (Überweisung in der Schweiz, Montag bis Freitag)",
        "Innert 1 Werktag (Überweisung in der Schweiz, Montag bis Freitag)"
      ],
      delayEur: [
        "Innerhalb von 1 bis 2 Werktagen (SEPA-Überweisung)",
        "Innert 1 bis 2 Werktagen (SEPA-Überweisung)"
      ]
    },
    limits: {
      title: ["Verkaufslimits", "Verkaufslimiten"]
    },
    settings: {
      limits: ["Verkaufslimits", "Verkaufslimiten"]
    }
  },
  walletExport: {
    pdf: {
      received: ["Insgesamt eingenommen", "Total eingenommen"],
      sent: ["Insgesamt gesendet", "Total gesendet"]
    }
  },
  settings: {
    support: {
      notAttached: [
        "Protokoll nicht an die Mail angehängt",
        "Protokoll nicht an das Mail angehängt"
      ]
    },
    vatRate: ["Standard-MwSt.-Satz", "Standard-MWST"],
    vatRateDescription: [
      "Der MwSt.-Satz neuer Rechnungspositionen, pro Position änderbar.",
      "Der MWST-Satz neuer Rechnungspositionen, pro Position änderbar."
    ],
    vatRateField: ["MwSt.-Satz (%)", "MWST-Satz (%)"],
    vatRateHint: [
      "Leer lassen für den Regelsatz: {{rate}}",
      "Leer lassen für den Normalsatz: {{rate}}"
    ],
    vatStandard: ["{{rate}} (Regelsatz)", "{{rate}} (Normalsatz)"],
    vatSavedTitle: ["Standard-MwSt.-Satz gespeichert", "Standard-MWST gespeichert"]
  },
  invoices: {
    lines: {
      vatRate: ["MwSt.-Satz", "MWST-Satz"],
      vat: ["MwSt.", "MWST"],
      summary: ["{{quantity}} · MwSt. {{rate}}", "{{quantity}} · MWST {{rate}}"],
      net: ["Zwischensumme ohne MwSt.", "Zwischensumme ohne MWST"],
      vatOn: ["MwSt. {{rate}} auf {{base}}", "MWST {{rate}} auf {{base}}"],
      total: ["Gesamtbetrag", "Total"],
      tooLarge: [
        "Der Gesamtbetrag übersteigt den Höchstbetrag einer Rechnung",
        "Das Total übersteigt den Höchstbetrag einer Rechnung"
      ]
    },
    mail: {
      body: [
        "Guten Tag,\n\nnachstehend finden Sie die Rechnung {{number}} von {{business}} über {{amount}}, zahlbar bis zum {{date}}.\n\nZahlung in Bitcoin: {{url}}\n\nMit freundlichen Grüßen\n{{business}}",
        "Guten Tag\n\nNachstehend finden Sie die Rechnung {{number}} von {{business}} über {{amount}}, zahlbar bis zum {{date}}.\n\nZahlung in Bitcoin: {{url}}\n\nFreundliche Grüsse\n{{business}}"
      ]
    }
  },
  documentLanguage: {
    title: { mail: ["Sprache der E-Mail", "Sprache des E-Mails"] },
    change: {
      mail: [
        "Sprache der E-Mail: {{language}}. Ändern",
        "Sprache des E-Mails: {{language}}. Ändern"
      ]
    }
  }
};

function swiss(german: unknown, wordings: unknown): unknown {
  if (typeof german === "string") {
    const wording = wordings as SwissWording | undefined;
    return wording !== undefined && wording[0] === german ? wording[1] : swissSpelling(german);
  }
  const within = (wordings ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(german as Record<string, unknown>).map(([key, value]) => [
      key,
      swiss(value, within[key])
    ])
  );
}

const deCH = swiss(de, SWISS_WORDINGS) as Translations;

export default deCH;
