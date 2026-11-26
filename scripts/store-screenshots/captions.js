// The store screenshots' captions, per language: the store listing's words, not the app's (the
// app's own texts are in src/i18n/locales/). `title` is two lines, split by "\n", and may set one
// word in the accent colour with <em>…</em>; nothing else is markup. `subtitle` takes at most two
// lines (compose.html checks both). Google Play: no ranking, price, promotion nor call to
// action ("best", "new", "download now"…), and a caption under 20 % of the image
// (compose.html keeps it there).
const CAPTIONS = {
  pos: {
    fr: {
      title: "Encaissez\nen <em>bitcoin</em>",
      subtitle: "Point de vente, gestion des employés et factures"
    },
    en: {
      title: "Accept <em>bitcoin</em>\npayments",
      subtitle: "Point of sale, employee management and invoices"
    },
    de: {
      title: "<em>Bitcoin</em>\nkassieren",
      subtitle: "Kassensystem, Mitarbeiterverwaltung und Rechnungen"
    },
    "de-CH": {
      title: "<em>Bitcoin</em>\nkassieren",
      subtitle: "Kassensystem, Mitarbeiterverwaltung und Rechnungen"
    },
    it: {
      title: "Incassa\nin <em>bitcoin</em>",
      subtitle: "Punto vendita, gestione dei dipendenti e fatture"
    },
    es: {
      title: "Cobra en\n<em>bitcoin</em>",
      subtitle: "Punto de venta, gestión de empleados y facturas"
    },
    pt: {
      title: "Receba em\n<em>bitcoin</em>",
      subtitle: "Ponto de venda, gestão de funcionários e faturas"
    },
    fi: {
      title: "Ota maksuja\n<em>bitcoinilla</em>",
      subtitle: "Kassajärjestelmä, työntekijöiden hallinta ja laskut"
    }
  },
  qr: {
    fr: {
      title: "Un seul\n<em>QR code</em>",
      subtitle: "Pour tous les portefeuilles bitcoin, Lightning et onchain"
    },
    en: {
      title: "One single\n<em>QR code</em>",
      subtitle: "For every bitcoin wallet, Lightning and on-chain"
    },
    de: {
      title: "Ein einziger\n<em>QR-Code</em>",
      subtitle: "Für alle Bitcoin-Wallets, Lightning und Onchain"
    },
    "de-CH": {
      title: "Ein einziger\n<em>QR-Code</em>",
      subtitle: "Für alle Bitcoin-Wallets, Lightning und Onchain"
    },
    it: {
      title: "Un solo\n<em>codice QR</em>",
      subtitle: "Per tutti i portafogli bitcoin, Lightning e onchain"
    },
    es: {
      title: "Un solo\n<em>código QR</em>",
      subtitle: "Para todos los monederos bitcoin, Lightning y onchain"
    },
    pt: {
      title: "Um único\n<em>código QR</em>",
      subtitle: "Para todas as carteiras bitcoin, Lightning e onchain"
    },
    fi: {
      title: "Yksi ainoa\n<em>QR-koodi</em>",
      subtitle: "Kaikille bitcoin-lompakoille, Lightning ja onchain"
    }
  },
  split: {
    fr: {
      title: "<em>Bitcoin</em> ou fiat,\nvous choisissez",
      subtitle: "La part à vendre, virée sur votre compte"
    },
    en: {
      title: "<em>Bitcoin</em> or fiat,\nyour choice",
      subtitle: "The share you sell, transferred to your account"
    },
    de: {
      title: "<em>Bitcoin</em> oder Fiat,\nSie entscheiden",
      subtitle: "Der verkaufte Anteil, auf Ihr Konto überwiesen"
    },
    "de-CH": {
      title: "<em>Bitcoin</em> oder Fiat,\nSie entscheiden",
      subtitle: "Der verkaufte Anteil, auf Ihr Konto überwiesen"
    },
    it: {
      title: "<em>Bitcoin</em> o fiat,\nscegli tu",
      subtitle: "La quota da vendere, versata sul tuo conto"
    },
    es: {
      title: "<em>Bitcoin</em> o fiat,\ntú eliges",
      subtitle: "La parte a vender, transferida a tu cuenta"
    },
    pt: {
      title: "<em>Bitcoin</em> ou fiat,\nà sua escolha",
      subtitle: "A parte a vender, transferida para a sua conta"
    },
    fi: {
      title: "<em>Bitcoin</em> vai fiat,\nsinä päätät",
      subtitle: "Myytävä osuus siirretään tilillesi"
    }
  },
  wallet: {
    fr: {
      title: "Chaque vente,\n<em>exportable</em>",
      subtitle: "Solde, encaissements et qui les a encaissés"
    },
    en: {
      title: "Every sale,\n<em>exportable</em>",
      subtitle: "Balance, payments and who took them"
    },
    de: {
      title: "Jeder Verkauf,\n<em>exportierbar</em>",
      subtitle: "Saldo, Zahlungseingänge und wer sie kassiert hat"
    },
    "de-CH": {
      title: "Jeder Verkauf,\n<em>exportierbar</em>",
      subtitle: "Saldo, Zahlungseingänge und wer sie kassiert hat"
    },
    it: {
      title: "Ogni vendita,\n<em>esportabile</em>",
      subtitle: "Saldo, incassi e chi li ha incassati"
    },
    es: { title: "Cada venta,\n<em>exportable</em>", subtitle: "Saldo, cobros y quién los hizo" },
    pt: {
      title: "Cada venda,\n<em>exportável</em>",
      subtitle: "Saldo, recebimentos e quem os recebeu"
    },
    fi: {
      title: "Jokainen myynti\n<em>vietävissä</em>",
      subtitle: "Saldo, maksut ja kuka ne veloitti"
    }
  },
  articles: {
    fr: {
      title: "Vos <em>articles</em>\nen un geste",
      subtitle: "Photos, prix exacts et panier, scan des codes-barres"
    },
    en: {
      title: "Your <em>items</em>\nin one tap",
      subtitle: "Photos, exact prices, basket and barcode scanning"
    },
    de: {
      title: "Ihre <em>Artikel</em>\nmit einem Tipp",
      subtitle: "Fotos, exakte Preise, Warenkorb und Barcode-Scan"
    },
    "de-CH": {
      title: "Ihre <em>Artikel</em>\nmit einem Tipp",
      subtitle: "Fotos, exakte Preise, Warenkorb und Barcode-Scan"
    },
    it: {
      title: "I tuoi <em>articoli</em>\nin un tocco",
      subtitle: "Foto, prezzi esatti, carrello e scansione dei codici a barre"
    },
    es: {
      title: "Tus <em>artículos</em>\nen un toque",
      subtitle: "Fotos, precios exactos, cesta y escaneo de códigos de barras"
    },
    pt: {
      title: "Os seus <em>artigos</em>\nnum toque",
      subtitle: "Fotos, preços exatos, cesto e leitura de códigos de barras"
    },
    fi: {
      title: "<em>Tuotteesi</em>\nnopeasti kassaan",
      subtitle: "Kuvat, tarkat hinnat, ostoskori ja viivakoodit"
    }
  },
  team: {
    fr: { title: "Toute votre <em>équipe</em>\nencaisse", subtitle: "Sans accès à vos fonds" },
    en: {
      title: "Your whole <em>team</em>\ntakes payments",
      subtitle: "Without access to your funds"
    },
    de: { title: "Ihr ganzes <em>Team</em>\nkassiert", subtitle: "Ohne Zugriff auf Ihr Guthaben" },
    "de-CH": {
      title: "Ihr ganzes <em>Team</em>\nkassiert",
      subtitle: "Ohne Zugriff auf Ihr Guthaben"
    },
    it: { title: "Tutto il tuo <em>team</em>\nincassa", subtitle: "Senza accesso ai tuoi fondi" },
    es: { title: "Todo tu <em>equipo</em>\ncobra", subtitle: "Sin acceso a tus fondos" },
    pt: { title: "Toda a sua <em>equipa</em>\nrecebe", subtitle: "Sem acesso aos seus fundos" },
    fi: { title: "Koko <em>tiimisi</em>\nveloittaa", subtitle: "Ilman pääsyä varoihisi" }
  },
  invoice: {
    fr: {
      title: "Des <em>factures</em>\nen bitcoin",
      subtitle: "TVA, numérotation, PDF et lien de paiement"
    },
    en: {
      title: "<em>Invoices</em>\nin bitcoin",
      subtitle: "VAT, numbering, PDF and payment link"
    },
    de: {
      title: "<em>Rechnungen</em>\nin Bitcoin",
      subtitle: "MwSt., Nummerierung, PDF und Zahlungslink"
    },
    "de-CH": {
      title: "<em>Rechnungen</em>\nin Bitcoin",
      subtitle: "MWST, Nummerierung, PDF und Zahlungslink"
    },
    it: {
      title: "<em>Fatture</em>\nin bitcoin",
      subtitle: "IVA, numerazione, PDF e link di pagamento"
    },
    es: {
      title: "<em>Facturas</em>\nen bitcoin",
      subtitle: "IVA, numeración, PDF y enlace de pago"
    },
    pt: {
      title: "<em>Faturas</em>\nem bitcoin",
      subtitle: "IVA, numeração, PDF e link de pagamento"
    },
    fi: { title: "<em>Laskut</em>\nbitcoinilla", subtitle: "ALV, numerointi, PDF ja maksulinkki" }
  }
};

module.exports = { CAPTIONS };
