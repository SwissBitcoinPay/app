/**
 * Source language: the other languages translate it.
 * `<accent>…</accent>` marks the words set in orange (values chosen by the
 * user, brand names); `<strong>…</strong>` the words in bold; `<link>…</link>` marks a link.
 */
const fr = {
  common: {
    back: "Retour",
    continue: "Continuer",
    cancel: "Annuler",
    startCharging: "Commencer à encaisser",
    version: "Version {{version}}"
  },
  welcome: {
    headline: "Paiements en <accent>bitcoin</accent>.",
    // The welcome screen: what the app does in one line, its guarantees without a full stop, then
    // "I already have" and what one may already have.
    lead: "Point de vente, factures et cartes NFC.",
    guarantees: {
      nonCustodial: "Non dépositaire",
      noKyc: "Sans identification KYC",
      oneMinute: "En 1 minute"
    },
    createAccount: "Créer mon compte",
    login: "Connexion",
    joinInvitation: "Rejoindre par invitation",
    alreadyHave: "J'ai déjà",
    have: {
      account: "Un compte sattle.me",
      invitation: "Une invitation",
      boltCard: "Une BoltCard"
    },
    manageBoltCard: "Gérer ma BoltCard",
    // "Manage my BoltCard" where no card is programmed (BoltCardAppSheet.tsx): the app on the
    // phone, where the account is created.
    boltCardApp: {
      computer:
        "Un ordinateur ne lit pas les cartes NFC. Téléchargez l'app sattle.me sur votre téléphone : vous y créerez votre compte, puis vous approcherez la carte pour la programmer.",
      device:
        "Cet appareil ne lit pas les cartes NFC. Téléchargez l'app sattle.me sur votre téléphone : vous y créerez votre compte, puis vous approcherez la carte pour la programmer.",
      browser:
        "Un navigateur ne peut pas programmer une carte. Ouvrez ou installez l'app sattle.me sur ce téléphone : vous y créerez votre compte, puis vous approcherez la carte pour la programmer.",
      iphone: "iPhone",
      android: "Android",
      codeIphone: "QR code de l'app sattle.me sur l'App Store",
      codeAndroid: "QR code de l'app sattle.me sur Google Play",
      scan: "Scannez le code de votre téléphone avec son appareil photo."
    },
    terms: "En continuant, vous acceptez les <link>conditions générales</link>."
  },
  // The links to sattle.me's legal documents (src/config/legal.ts): their titles, under the
  // welcome screen's terms and in every account's "Settings" (LegalLinks.tsx).
  legal: {
    terms: "Conditions générales",
    privacy: "Politique de confidentialité"
  },
  // Passkey states and errors.
  account: {
    passkeyWarning:
      "Votre passkey est la clé de votre portefeuille : la supprimer peut rendre vos fonds inaccessibles.",
    progress: {
      creating: "Création de votre passkey…",
      signingIn: "Connexion avec votre passkey…",
      preparing: "Préparation de votre compte…",
      restoring: "Récupération de vos réglages…",
      terminal: "Préparation de votre point de vente…"
    },
    // A dismissed prompt on the welcome screen: a notification.
    cancelled: {
      title: "Passkey annulée",
      body: "Touchez à nouveau le bouton pour réessayer."
    },
    errors: {
      recoveryOverdue: "Vos paiements sont bloqués : vérifiez d'abord vos 12 mots de récupération.",
      rescueClosed:
        "Le mode secours s'est fermé : rien n'a été envoyé. Rouvrez-le avec vos 12 mots.",
      unsupported:
        "Cet appareil ou ce navigateur ne permet pas d'utiliser une passkey sattle.me. Utilisez un navigateur récent, ou l'app sur iPhone, iPad ou Android.",
      prfUnsupported:
        "Votre gestionnaire de passkeys n'est pas compatible : utilisez l'app Mots de passe d'Apple ou le Gestionnaire de mots de passe de Google.",
      notAssociated:
        "Les passkeys ne sont pas encore activées pour cette version de l'app. Réessayez plus tard.",
      notConfigured: "Cette version de l'app n'est pas configurée pour ouvrir un portefeuille.",
      // Not shown: a dismissed prompt is a notification (account.cancelled), or nothing.
      cancelled: "Passkey annulée. Touchez à nouveau le bouton pour réessayer.",
      timedOut:
        "Délai dépassé. Réessayez, puis validez avec votre visage, votre empreinte ou le code de l'appareil.",
      // Not "no passkey": a password manager that could not answer looks the same to the app.
      // On Android, its network cut by a battery saver (seen with Proton Pass):
      // noCredentialAndroid, chosen by accountFailureMessage.
      noCredential:
        "Aucune passkey sattle.me n'a été proposée sur cet appareil. Vérifiez que vos passkeys sont synchronisées sur cet appareil.",
      noCredentialAndroid:
        "Aucune passkey sattle.me n'a été proposée sur cet appareil. Vérifiez que votre gestionnaire de mots de passe n'est pas limité par l'économiseur de batterie.",
      alreadyExists: "Une passkey existe déjà sur cet appareil : utilisez « $t(welcome.login) ».",
      createdNotDerived:
        "Votre passkey a été créée, mais votre portefeuille n'a pas pu être ouvert. Touchez « $t(welcome.createAccount) » pour terminer avec cette passkey.",
      connectFailed:
        "Votre portefeuille n'a pas pu être ouvert. Vérifiez votre connexion à internet, puis réessayez.",
      settingsTooNew:
        "Vos réglages ont été enregistrés par une version plus récente de l'app. Mettez l'app à jour, puis réessayez.",
      notFound:
        "Aucun compte n'a été trouvé avec cette passkey sur les relais Nostr de cet appareil.",
      terminalFailed:
        "Votre point de vente n'a pas pu être préparé. Vérifiez votre connexion à internet, puis réessayez.",
      deviceFailed: "Votre compte n'a pas pu être préparé sur cet appareil. Réessayez.",
      failed: "Une erreur est survenue. Réessayez."
    }
  },
  // "No account found" (src/app/no-account.tsx): a login whose passkey's account is on none of the
  // device's relays.
  noAccount: {
    title: "Aucun compte trouvé",
    unreachableTitle: "Relais injoignables",
    answered: {
      all: "Aucun compte n'est associé à cette passkey sur les relais Nostr ci-dessous.",
      some: "Aucun compte n'est associé à cette passkey sur les relais Nostr ci-dessous qui ont répondu. D'autres n'ont pas répondu : « $t(relays.test) » indique lesquels.",
      none: "Aucun des relais Nostr ci-dessous n'a répondu : impossible de savoir si un compte est associé à cette passkey. Vérifiez votre connexion à internet."
    },
    lead: "Avez-vous choisi des relais personnalisés pour votre compte ? Ajoutez-les, enregistrez, puis touchez « $t(welcome.login) ». Si vous avez plusieurs passkeys, vérifiez aussi que vous avez choisi la bonne."
  },
  // "Stay informed": the phone's notifications asked once, after the setup.
  notificationsOffer: {
    title: "Restez informé",
    lead: "Autorisez les notifications : sattle.me vous prévient des informations importantes, même l'application fermée.",
    words: "Vos 12 mots",
    wordsBody: "Un rappel annuel de les vérifier, pour votre sécurité.",
    cards: "Vos cartes",
    cardsBody: "Les paiements par carte qui attendent votre accord.",
    note: "Jamais de publicité. Vous pourrez changer d'avis dans les réglages du téléphone.",
    allow: "Autoriser les notifications",
    later: "Pas maintenant"
  },
  // The yearly check of the 12 words (src/features/recovery-check/): the banner, the input and the
  // illustrated explanation.
  recoveryCheck: {
    reminders: {
      channel: "Phrase de récupération",
      startTitle: "C'est le moment de vérifier vos 12 mots",
      startBody:
        "Un an s'est écoulé : retapez-les dans sattle.me pour vous assurer que votre feuille est toujours juste.",
      weekTitle: "Vos paiements seront bloqués dans 7 jours",
      eveTitle: "Vos paiements seront bloqués demain",
      soonBody: "Vérifiez vos 12 mots dans sattle.me pour continuer à payer.",
      dayTitle: "Vos paiements sont bloqués",
      dayBody: "Vérifiez vos 12 mots dans sattle.me pour payer à nouveau."
    },
    banner: {
      due: "Votre double de clé n'est pas vérifié",
      daysLeft: "J−{{count}}",
      daysLeftLabel_one: "Encore {{count}} jour",
      daysLeftLabel_other: "Encore {{count}} jours",
      overdue: "Paiements bloqués : vérifiez vos 12 mots",
      action: "Vérifier mes 12 mots"
    },
    title: "Vérifier vos 12 mots",
    intro: {
      title: "Trois cas où seuls vos 12 mots aident",
      lost: "Téléphone perdu ou volé",
      passkey: "Passkey effacée",
      gone: "sattle.me n'existe plus",
      lead: "Dans chacun, vos 12 mots rouvrent votre compte et vos cartes. Sans eux, les fonds sont perdus.",
      key: "La passkey est votre clé de tous les jours. Les 12 mots sont le double, rangé chez vous : retapez-les depuis votre feuille.",
      due_one: "Encore {{count}} jour pour le faire.",
      due_other: "Encore {{count}} jours pour le faire.",
      overdue: "Vos paiements sont bloqués jusqu'à cette vérification.",
      optional:
        "Rien n'est dû pour l'instant : cette vérification est une bonne pratique, elle ne bloque rien.",
      start: "Commencer"
    },
    word: {
      progress: "Mot {{index}} sur 12",
      label: "Quel est le mot {{index}} ?",
      hint: "Les mots de la liste qui commencent ainsi : rien ne dit lequel est le bon.",
      unknown: "Ce mot n'est pas dans la liste : vérifiez son orthographe",
      next: "Mot suivant",
      previous: "Mot précédent",
      check: "Vérifier"
    },
    lost: "Je ne les ai plus",
    checking: "Vérification…",
    done: {
      title: "Vos 12 mots sont vérifiés",
      lead: "Rangez votre feuille en lieu sûr. La prochaine vérification aura lieu dans un an, si votre compte garde encore plus de 1 000 CHF.",
      finish: "Terminé"
    },
    wrong: {
      title: "Ces mots ne correspondent pas",
      lead: "Au moins un mot est faux, ou deux sont inversés. Reprenez votre feuille et recommencez, ou affichez vos 12 mots.",
      again: "Recommencer"
    },
    saveFailed:
      "Vos mots sont justes, mais la vérification n'a pas pu être enregistrée. Vérifiez votre connexion à internet, puis réessayez.",
    retry: "Réessayer"
  },
  // "Open with my 12 words" (src/features/rescue/): "Rescue mode".
  rescue: {
    section: "Récupération",
    entry: "Ouvrir avec mes 12 mots",
    entryLead:
      "Si votre passkey ne fonctionne plus, vos 12 mots de récupération ouvrent votre compte pour en envoyer les fonds ailleurs.",
    words: {
      title: "Ouvrir avec vos 12 mots",
      lead: "Tapez la phrase de récupération de votre compte, dans l'ordre.",
      only: "Ne tapez ces mots que dans l'app sattle.me. Personne ne vous les demandera, ni par e-mail, ni par message, ni par téléphone.",
      label: "Vos 12 mots",
      count_one: "{{count}} mot sur 12",
      count_other: "{{count}} mots sur 12",
      unknown: "Le mot {{position}} n'est pas un mot de la liste : vérifiez son orthographe",
      checksum:
        "Ces 12 mots ne forment pas une phrase valide : vérifiez chacun d'eux et leur ordre",
      valid: "Phrase complète et valide",
      submit: "Ouvrir mon compte",
      opening: "Ouverture de votre compte…",
      note: "Vos mots ne sont ni enregistrés ni envoyés : ils sont oubliés dès que vous fermez cet écran.",
      failed:
        "Votre compte n'a pas pu être ouvert. Vérifiez votre connexion à internet, puis réessayez."
    },
    badge: "Mode secours",
    funds: {
      title: "Vos fonds",
      lead: "Compte ouvert avec vos 12 mots. Envoyez vos fonds vers un autre portefeuille, puis fermez.",
      leadWalletOnly:
        "Aucun relais de cet appareil ne connaît votre compte : seul votre portefeuille s'ouvre. Pour retrouver vos cartes, fermez, puis changez de relais dans « $t(relays.advanced) ».",
      wallet: "Portefeuille",
      card: "Carte « {{name}} »",
      cardUnnamed: "Carte sans nom",
      former: "Ancien portefeuille de la carte « {{name}} »",
      formerUnnamed: "Ancien portefeuille d'une carte",
      reading: "Lecture…",
      unread: "Pas encore lu",
      empty: "Vide",
      arriving: "{{amount}} en route",
      send: "Vider",
      retry: "$t(wallet.retry)",
      cardsUnread:
        "Vos cartes n'ont pas pu être lues sur une majorité de vos relais : certaines peuvent manquer. Réessayez plus tard.",
      cardsFailed:
        "Vos cartes n'ont pas pu être lues. Vérifiez votre connexion à internet, puis réessayez.",
      export: "Exporter l'historique",
      close: "Fermer",
      closeNote: "Fermer oublie vos 12 mots sur cet appareil. Vos fonds restent où ils sont."
    },
    drain: {
      title: "Vider le portefeuille",
      intro:
        "Tout le solde du portefeuille part vers une adresse lightning, bitcoin ou Spark : saisissez-la, collez-la ou scannez-la. Les frais sont pris sur ce solde.",
      introNoScan:
        "Tout le solde du portefeuille part vers une adresse lightning, bitcoin ou Spark : saisissez-la ou collez-la. Les frais sont pris sur ce solde.",
      total: "Solde du portefeuille",
      feesAbove: "Les frais dépassent le solde du portefeuille à cette vitesse",
      empty: "Ce portefeuille ne contient rien à envoyer.",
      confirm: "Tout envoyer",
      done: "{{amount}} envoyés : le portefeuille est vide.",
      pending: "Envoi de {{amount}} parti : il arrivera dès qu'il aura abouti.",
      failed: "L'envoi n'a pas abouti. Vérifiez le solde du portefeuille, puis réessayez."
    },
    closed: "Le mode secours s'est fermé : rouvrez-le avec vos 12 mots.",
    // The closing after a while without activity.
    idle: {
      title: "Fermeture dans {{seconds}} s",
      body: "Sans activité, le mode secours se ferme et oublie vos 12 mots.",
      closed:
        "Le mode secours s'est fermé après 5 minutes sans activité : retapez vos 12 mots pour le rouvrir."
    }
  },
  // The migration of a v2 device (Swiss Bitcoin Pay) to sattle.me, in words any merchant reads.
  migration: {
    amount: "{{btc}} (environ {{fiat}})",
    entry: "Migrer mon compte Swiss\u00a0Bitcoin\u00a0Pay",
    // Before the brand's wordmark (MigrateAccountEntry); `entry` is what screen readers say.
    entryLead: "Migrer depuis",
    home: {
      badge: "Swiss\u00a0Bitcoin\u00a0Pay devient sattle.me",
      title: "Bonjour, {{business}}",
      titleUnnamed: "Bonjour",
      titleManual: "Migrer votre compte Swiss\u00a0Bitcoin\u00a0Pay",
      leadFound: "Nous avons retrouvé votre compte. Tout est repris sur sattle.me :",
      leadPassword:
        "Nous avons retrouvé votre compte. Pour reprendre vos versements, votre mot de passe Swiss\u00a0Bitcoin\u00a0Pay, une dernière fois :",
      leadManual:
        "Connectez-vous une dernière fois à votre compte Swiss\u00a0Bitcoin\u00a0Pay : votre commerce et vos versements sont repris sur sattle.me, qui n'a pas de mot de passe.",
      payoutsReading: "Lecture…",
      payoutsAfterPassword: "Après votre mot de passe",
      read: "Lu sur votre compte Swiss\u00a0Bitcoin\u00a0Pay",
      money: "Votre argent suit : il est transféré sur votre nouveau compte.",
      retry: "Réessayer",
      migrate: "Migrer"
    },
    login: {
      email: "E-mail",
      password: "Mot de passe",
      checking: "Connexion à votre ancien compte…",
      forgotten: "Mot de passe oublié ?",
      changed: "J'ai déjà choisi un nouveau mot de passe",
      note: "Votre mot de passe sert une seule fois et n'est jamais gardé.",
      errors: {
        refused: "E-mail ou mot de passe incorrect",
        unreachable: "Votre ancien compte ne répond pas. Vérifiez votre connexion et réessayez.",
        stopped:
          "Pour ne pas bloquer votre ancien compte, nous n'essayons plus avec ce mot de passe. Choisissez-en un nouveau : nous vous envoyons un lien par e-mail.",
        secondFactor:
          "Votre ancien compte demande un code de vérification, que sattle.me ne peut pas utiliser. Écrivez-nous à {{email}} : nous vous aiderons à mettre votre compte à jour."
      }
    },
    forgot: {
      title: "Mot de passe oublié",
      lead: "Indiquez l'e-mail de votre ancien compte Swiss\u00a0Bitcoin\u00a0Pay : nous vous envoyons un lien pour choisir un nouveau mot de passe.",
      send: "Envoyer le lien",
      sending: "Envoi en cours…",
      invalidEmail: "Cette adresse e-mail n'est pas valide",
      failed: "Le lien n'a pas pu être demandé. Vérifiez votre connexion et réessayez.",
      sentTitle: "Vérifiez vos e-mails",
      sent: "Si un compte Swiss\u00a0Bitcoin\u00a0Pay utilise {{email}}, un e-mail vient de lui être envoyé. Ouvrez son lien pour choisir un nouveau mot de passe.",
      sentNote:
        "Le lien est valable 15 minutes. Rien reçu ? Regardez dans vos courriers indésirables, ou revenez en arrière pour le demander à nouveau.",
      choose: "Choisir un nouveau mot de passe"
    },
    password: {
      title: "Nouveau mot de passe",
      lead: "Choisissez le nouveau mot de passe de votre ancien compte Swiss\u00a0Bitcoin\u00a0Pay.",
      label: "Nouveau mot de passe",
      rules: {
        length: "Au moins 8 caractères",
        letter: "Au moins une lettre",
        digit: "Au moins un chiffre"
      },
      met: "respecté",
      unmet: "pas encore",
      save: "Enregistrer",
      saving: "Enregistrement…",
      rejected: "Ce mot de passe n'est pas accepté : vérifiez les règles ci-dessous",
      failed: "Le mot de passe n'a pas pu être changé. Vérifiez votre connexion et réessayez.",
      expired:
        "Ce lien n'est plus valable : il a déjà servi, ou ses 15 minutes sont passées. Demandez-en un nouveau.",
      again: "Recevoir un nouveau lien",
      doneTitle: "Mot de passe changé",
      done: "Votre nouveau mot de passe est enregistré. Connectez-vous avec lui pour mettre votre compte à jour."
    },
    confirm: {
      currency: "Devise",
      payouts: "Versements",
      payoutsToChoose: "À choisir après la création du compte",
      split: "{{bitcoin}} bitcoin · {{bank}} banque",
      allBitcoin: "{{percent}} bitcoin",
      bank: "Compte bancaire",
      holder: "Titulaire",
      freeze:
        "À la création de votre compte sattle.me, votre ancien compte s'arrête d'encaisser. Les sats qu'il vous doit sont envoyés aussitôt en Lightning sur votre compte sattle.me, ou au plus tard à 0:00\u00a0UTC si l'envoi n'aboutit pas tout de suite.",
      notMine: "Ce n'est pas mon compte",
      migratedTitle: "Compte déjà mis à jour",
      migrated:
        "«\u00a0{{business}}\u00a0» est passé à sattle.me le {{date}}. Ouvrez votre compte sattle.me avec sa passkey.",
      logIn: "Me connecter"
    },
    freeze: {
      settingTitle: "Ancien compte Swiss\u00a0Bitcoin\u00a0Pay",
      settingDescription:
        "Votre ancien compte n'a pas pu être figé à la fin de la mise à jour : il encaisse encore, et son solde n'est pas versé sur sattle.me. Figez-le maintenant.",
      settingLead:
        "Connectez-vous une dernière fois à votre ancien compte Swiss\u00a0Bitcoin\u00a0Pay : il est figé, et les sats qu'il vous doit sont envoyés aussitôt en Lightning sur votre compte sattle.me, ou au plus tard à 0:00\u00a0UTC.",
      settingStart: "Figer mon ancien compte",
      running: "Fermeture de votre ancien compte…",
      done: "Votre ancien compte Swiss\u00a0Bitcoin\u00a0Pay est figé : il n'encaisse plus. Fonds transférés sur votre nouveau portefeuille sattle.me.",
      doneNone:
        "Votre ancien compte Swiss\u00a0Bitcoin\u00a0Pay est figé : il n'encaisse plus. Aucun solde à transférer.",
      donePending:
        "Votre ancien compte Swiss\u00a0Bitcoin\u00a0Pay est figé : il n'encaisse plus. Les fonds seront transférés sur votre nouveau portefeuille sattle.me au plus tard à 0:00\u00a0UTC.",
      conflict:
        "Votre ancien compte avait déjà été mis à jour vers un autre compte sattle.me : c'est là que son argent est versé. Si ce n'est pas vous, écrivez-nous à {{email}}.",
      rejected:
        "Votre ancien compte n'a pas pu être figé. Écrivez-nous à {{email}} : nous le ferons avec vous.",
      failed:
        "Votre ancien compte n'a pas pu être figé : il encaisse encore. Vérifiez votre connexion et réessayez.",
      lost: "Votre ancien compte n'a pas pu être figé : il encaisse encore. Écrivez-nous à {{email}} : nous le ferons avec vous."
    },
    transfer: {
      // The system's prompt over the v2 wallet's words (Face ID, fingerprint).
      prompt: "Ouvrir votre ancien portefeuille",
      running: "Transfert de votre argent…",
      retry: "Réessayer",
      sentTitle: "{{amount}} en route vers votre nouveau compte",
      sent: "Ils apparaîtront dans « $t(navigation.destinations.wallet) » une fois confirmés par le réseau, en général dans l'heure. Frais du réseau : {{fee}}.",
      more: "Encore {{amount}} en route vers votre ancien compte : vous pourrez les transférer depuis « $t(navigation.destinations.wallet) » une fois arrivés.",
      empty: "Votre ancien portefeuille est vide : rien à transférer.",
      waiting:
        "{{amount}} arrivent sur votre ancien compte : vous pourrez les transférer depuis « $t(navigation.destinations.wallet) » une fois arrivés.",
      tooSmall:
        "Votre ancien portefeuille contient {{amount}}, moins que les frais pour le transférer. Il reste où il est pour l'instant.",
      unreadable:
        "Votre téléphone n'a pas pu ouvrir votre ancien portefeuille. Réessayez, ou tapez ses 12 mots.",
      failed: "Le transfert n'a pas pu se faire. Vérifiez votre connexion et réessayez.",
      sheetTitle: "Transférer votre ancien portefeuille ?",
      from: "De",
      fromName: "Portefeuille Swiss Bitcoin Pay",
      fromCaption: "12 mots, sur ce téléphone",
      to: "Vers",
      toName: "Votre portefeuille sattle.me",
      amountLabel: "Montant",
      amountUnknown: "Lu au moment du transfert",
      sats: "{{sats}} sats",
      fiat: "environ {{fiat}}",
      eraseNote:
        "Les 12 mots seront ensuite effacés de la mémoire de ce téléphone, transfert fait ou non.",
      start: "Transférer",
      skip: "Ne pas transférer",
      skipTitle: "Effacer sans transférer ?",
      skipBody:
        "Les 12 mots de votre portefeuille Swiss Bitcoin Pay vont être effacés de la mémoire de votre téléphone. Les {{amount}} qu'il contient ne pourront être récupérés qu'avec vos 12 mots notés sur papier.",
      skipBodyUnknown:
        "Les 12 mots de votre portefeuille Swiss Bitcoin Pay vont être effacés de la mémoire de votre téléphone. Ce qu'il contient ne pourra être récupéré qu'avec vos 12 mots notés sur papier.",
      skipConfirm: "J'ai les 12 mots,\neffacer sans transférer",
      erased: "Les 12 mots ont été effacés de ce téléphone.",
      tooSmallErased:
        "Votre ancien portefeuille contient {{amount}}, moins que les frais pour le transférer : il reste où il est.",
      skipped:
        "Les 12 mots ont été effacés de ce téléphone, sans transfert. Vos 12 mots notés sur papier transfèrent ce qu'il contient.",
      eraseFailed: "Les 12 mots n'ont pas pu être effacés de ce téléphone. Réessayez."
    },
    done: {
      title: "Votre compte est à jour",
      todoTitle: "Encore à faire, si cela vous concerne",
      employees: "Invitez à nouveau vos employés",
      shop: "Migrez l'intégration de votre boutique en ligne",
      changes: "Ce qui change",
      words:
        "Il reste {{amount}} sur votre ancien portefeuille Swiss\u00a0Bitcoin\u00a0Pay. Transférez-les avec les 12 mots notés à sa création.",
      wordsUnknown:
        "Votre ancien portefeuille Swiss\u00a0Bitcoin\u00a0Pay n'a pas pu être vérifié : il peut encore contenir de l'argent. Transférez-le avec les 12 mots notés à sa création.",
      checking: "Vérification de votre ancien portefeuille…",
      titleRunning: "Mise à jour de votre compte",
      lead: "En général quelques secondes.",
      // The steps of the migration's end (MigrationTimeline, end-steps.tsx).
      steps: {
        account: "Compte sattle.me créé",
        accountCaption: "«\u00a0{{business}}\u00a0» est prêt à encaisser.",
        frozen: "Ancien compte figé",
        frozenSent:
          "Il n'encaisse plus. Fonds transférés sur votre nouveau portefeuille sattle.me.",
        frozenNone: "Il n'encaisse plus. Aucun solde à transférer.",
        frozenPending:
          "Il n'encaisse plus. Les fonds seront transférés sur votre nouveau portefeuille sattle.me au plus tard à 0:00\u00a0UTC.",
        migratedElsewhere: "Ancien compte déjà mis à jour",
        notFrozen: "Ancien compte non figé",
        history: "Copie de votre historique",
        historyWaiting: "Dès que votre ancien compte est figé.",
        historyRunning: "Copie de votre historique…",
        historyRead_one: "{{formatted}} mouvement lu",
        historyRead_other: "{{formatted}} mouvements lus",
        historyWritten_one: "{{copied}}\u00a0/\u00a0{{total}} mouvement",
        historyWritten_other: "{{copied}}\u00a0/\u00a0{{total}} mouvements",
        historyCopied: "Historique copié",
        historyCopiedCaption_one:
          "{{formatted}} mouvement, visible dans «\u00a0$t(navigation.destinations.wallet)\u00a0».",
        historyCopiedCaption_other:
          "{{formatted}} mouvements, visibles dans «\u00a0$t(navigation.destinations.wallet)\u00a0».",
        historyEmpty: "Aucun mouvement à copier.",
        historyNotCopied: "Historique non copié",
        wallet: "Ancien portefeuille"
      }
    },
    changes: {
      title: "Ce qui change",
      lead: "Dès la création de votre compte sattle.me :",
      frozen:
        "Une fois figé, votre ancien compte Swiss\u00a0Bitcoin\u00a0Pay n'encaisse plus rien, ni en caisse, ni en ligne, ni sur son adresse Lightning.",
      items: {
        employees: {
          title: "Invitez à nouveau vos employés",
          caption:
            "Leurs appareils n'encaissent plus sur l'ancien compte. Invitez-les dans « $t(navigation.destinations.employees) » : ils scannent votre code et encaissent pour vous. Un appareil trop ancien pour sattle.me ne peut plus encaisser."
        },
        shop: {
          title: "Migrez l'intégration de votre boutique en ligne",
          caption:
            "Votre boutique en ligne n'encaisse plus sur l'ancien compte. Créez une intégration dans «\u00a0$t(navigation.destinations.integrations)\u00a0» et donnez sa clé à la personne qui gère votre site."
        },
        limits: {
          title: "Plus de limites",
          caption:
            "Grâce à la mise à jour sattle.me 3.0.0, plus aucune limite ni restriction liée à la vérification d'identité."
        },
        money: {
          title: "Votre argent vous suit",
          caption:
            "Les sats que vous doit l'ancien compte sont envoyés en Lightning sur votre compte sattle.me dès la mise à jour, quels que soient vos anciens réglages ; si l'envoi n'aboutit pas, il est refait chaque nuit à 0:00\u00a0UTC. Ceux qui arrivent encore ensuite suivent dès leur règlement. Les virements en banque déjà en cours se font comme d'habitude."
        },
        cards: {
          title: "Transférez vos cartes",
          caption:
            "Présentez chaque carte Swiss\u00a0Bitcoin\u00a0Pay dans « $t(navigation.destinations.cards) » pour transférer son solde. Une carte pas encore transférée fonctionne jusqu'au {{cardEnd}}."
        },
        history: {
          title: "Votre historique est copié",
          caption:
            "Vos ventes, retraits et commissions sont copiés dans « $t(navigation.destinations.wallet) », pour information. Ils sont dans ses exports CSV et PDF. L'historique de votre ancien compte reste consultable et exportable sur dashboard.swiss-bitcoin-pay.ch jusqu'au {{merchantEnd}}."
        }
      }
    },
    // The copy of the v2 account's history (src/features/migration/history-import.ts).
    history: {
      running: "Copie de votre historique Swiss\u00a0Bitcoin\u00a0Pay en arrière-plan…",
      // While reading the v2 server (its pages tell no total), then writing to the relays.
      reading_one:
        "Lecture de votre historique Swiss\u00a0Bitcoin\u00a0Pay : {{formatted}} mouvement lu…",
      reading_other:
        "Lecture de votre historique Swiss\u00a0Bitcoin\u00a0Pay : {{formatted}} mouvements lus…",
      writing_one:
        "Copie de votre historique Swiss\u00a0Bitcoin\u00a0Pay : {{copied}}\u00a0/\u00a0{{total}} mouvement…",
      writing_other:
        "Copie de votre historique Swiss\u00a0Bitcoin\u00a0Pay : {{copied}}\u00a0/\u00a0{{total}} mouvements…",
      done_one:
        "Votre historique est copié : {{formatted}} mouvement, visible dans « $t(navigation.destinations.wallet) ».",
      done_other:
        "Votre historique est copié : {{formatted}} mouvements, visibles dans « $t(navigation.destinations.wallet) ».",
      failed:
        "La copie de votre historique n'a pas abouti. Relancez-la depuis « $t(settings.title) », rubrique « $t(settings.groups.account) ».",
      settingTitle: "Historique Swiss\u00a0Bitcoin\u00a0Pay",
      settingDescription:
        "Copiez dans sattle.me les ventes, retraits et commissions de votre ancien compte, pour information. Possible jusqu'au {{date}}.",
      start: "Importer mon historique",
      lead: "Connectez-vous une dernière fois à votre ancien compte Swiss\u00a0Bitcoin\u00a0Pay : votre historique est copié en arrière-plan.",
      note: "Votre mot de passe sert une seule fois et n'est jamais gardé.",
      errors: {
        secondFactor:
          "Votre ancien compte demande un code de vérification, que sattle.me ne peut pas utiliser. Contactez le support.",
        stopped:
          "Pour ne pas bloquer votre ancien compte, nous n'essayons plus. Vérifiez votre mot de passe avant de réessayer plus tard.",
        unreachable: "Votre ancien compte ne répond pas. Vérifiez votre connexion et réessayez."
      }
    },
    words: {
      open: "Taper mes 12 mots",
      title: "Votre ancien portefeuille",
      lead: "Tapez dans l'ordre les 12 mots notés à la création de votre portefeuille dans l'app Swiss Bitcoin Pay. Son argent sera transféré sur votre compte sattle.me.",
      only: "Uniquement ces 12 mots-là : ne tapez jamais ici ceux d'un autre portefeuille (Ledger, Trezor, BitBox ou autre).",
      label: "Vos 12 mots",
      invalid: "Ces mots ne forment pas un portefeuille : vérifiez chacun d'eux et leur ordre",
      mismatch:
        "Ces mots ne sont pas ceux de votre portefeuille Swiss\u00a0Bitcoin\u00a0Pay : vérifiez chacun d'eux et leur ordre, puis tapez-les à nouveau",
      unused:
        "Ces mots ne correspondent à aucun portefeuille ayant déjà reçu de l'argent : vérifiez chacun d'eux et leur ordre, puis tapez-les à nouveau",
      submit: "Transférer",
      done: "Terminé",
      note: "Vos mots servent une seule fois et ne sont jamais gardés."
    },
    employee: {
      title: "Swiss Bitcoin Pay devient sattle.me",
      lead: "Cet appareil encaissait pour un commerce. Pour continuer, demandez au responsable de vous inviter à nouveau depuis sattle.me, puis scannez son code.",
      leadBusiness:
        "Cet appareil encaissait pour « {{business}} ». Pour continuer, demandez au responsable de vous inviter à nouveau depuis sattle.me, puis scannez son code.",
      join: "Scanner l'invitation",
      owner: "Je suis le responsable de ce commerce"
    },
    // "Wallet": what the v2 wallet on this phone may still hold.
    wallet: {
      unchecked:
        "Votre ancien portefeuille Swiss Bitcoin Pay est sur ce téléphone. Vérifiez s'il reste de l'argent à transférer.",
      check: "Vérifier et transférer",
      funds: "Il reste {{amount}} sur votre ancien compte, à transférer ici.",
      transfer: "Transférer",
      incoming:
        "{{amount}} arrivent sur votre ancien compte : vous pourrez les transférer une fois arrivés."
    }
  },
  split: {
    title: "Comment voulez-vous être payé ?",
    description:
      "L'app vous proposera de vendre cette part de vos encaissements. Modifiable à tout moment.",
    bitcoin: "Bitcoin",
    freeUntil: "Gratuit jusqu'au {{date}}",
    // The fees card (SplitFees.tsx): sattle.me's fee, on everything taken in, then the conversion's,
    // Mt Pelerin's, in addition on the share converted only.
    sattleFee: "Frais sattle.me",
    sattleFeeScope: "Sur tout ce que vous encaissez, converti ou non",
    conversionFee: "Conversion en {{currency}}",
    conversionFeeScope: "Frais de vente de Mt Pelerin, seulement sur la part convertie",
    extraFee: "+ {{fee}}",
    // Under Mt Pelerin's fees: a transfer is free from the equivalent of 50 CHF, the threshold of the
    // grouped transfer and of the transfer fee alike; a smaller sale waits in the grouped transfer,
    // or goes at once for the fee (SELL_TRANSFER_FEE: 1 CHF, EUR or GBP, else the equivalent of 1 CHF).
    transferNote:
      "Virement gratuit dès {{threshold}}. En dessous, vos ventes sont regroupées jusqu'à l'atteindre, ou virées tout de suite pour {{fee}}.",
    // Spoken by screen readers: the waived rate struck through, 0 % after it.
    waivedRate: "{{free}} au lieu de {{fee}}",
    feeRange: "{{min}} à {{max}}",
    sliderLabel: "Part en bitcoin",
    // Spoken by screen readers.
    sliderValue: "{{bitcoin}} en bitcoin, {{fiat}} en {{currency}}",
    currencyButton: "Devise du virement : {{currency}}"
  },
  bank: {
    currentAccount: "Le compte enregistré",
    currentAccountSub: "Chez Mt Pelerin, dans cette devise",
    editAccount: "Modifier ce compte",
    title:
      "Où verser les <accent>{{percent}}</accent> convertis en <accent>{{currency}}</accent> ?",
    transferSchedule: "Vos ventes y sont virées, regroupées en un virement.",
    editableLater: "Ces informations restent modifiables dans les réglages.",
    // "Country": the holder's country of residence.
    country: "Pays de résidence",
    iban: "IBAN",
    ibanInvalid: "Vérifiez l'IBAN",
    holderKind: "Le titulaire est",
    person: "Une personne",
    company: "Une société",
    companyName: "Raison sociale",
    firstname: "Prénom",
    lastname: "Nom",
    address: "Adresse",
    addressPlaceholder: "Rue et numéro",
    postalCode: "Code postal",
    postalCodePlaceholder: "1003",
    city: "Ville",
    cityPlaceholder: "Lausanne",
    // The merchant sign-up's bank step before its Mt Pelerin login (onboarding/bank.tsx), Mt Pelerin
    // named once, as sattle.me's partner; "accountKey" on Mt Pelerin's dev/test (the staging app).
    // "create", "existing": its two buttons, one and the same login; "…Title", "…Lead…": its
    // panel's heading after each, by SMS ("…Sms") or by the account's key on dev/test ("…Key").
    mtPelerin: {
      sheetTitle: "Compte Mt Pelerin",
      lead: "Cette part est vendue à notre partenaire Mt Pelerin, intermédiaire financier suisse, qui vire le montant sur votre compte bancaire.",
      accountTitle: "Votre compte chez notre partenaire",
      accountSms: "Votre numéro de mobile et un code reçu par SMS, puis votre e-mail",
      accountKey: "La clé de votre compte sattle.me, puis votre e-mail et votre numéro",
      bankTitle: "Votre compte bancaire",
      bankSub: "Enregistré chez notre partenaire, qui y vire vos ventes",
      saleTitle: "Rien n'est vendu sans vous",
      saleSub:
        "L'app vous propose de vendre cette part, vous validez avec votre passkey. Avant la première vente, un paiement de 1 sat vérifie votre portefeuille",
      connected: "Compte Mt Pelerin connecté : ce compte bancaire y sera enregistré",
      create: "Créer mon compte Mt Pelerin",
      existing: "J'ai déjà un compte Mt Pelerin",
      createTitle: "Créer votre compte",
      createLeadSms:
        "Avec votre numéro de mobile, puis votre e-mail. Un compte déjà ouvert à ce numéro est repris.",
      createLeadKey: "Avec la clé de votre compte sattle.me, puis votre e-mail et votre numéro.",
      existingTitle: "Connecter votre compte",
      existingLeadSms: "Avec le numéro de mobile de votre compte.",
      existingLeadKey: "Avec la clé de votre compte sattle.me."
    }
  },
  // The setup screen after the last step (onboarding/setup.tsx).
  setup: {
    title: "Configuration de votre compte…",
    description:
      "Préparation de votre adresse Lightning et de votre point de vente. Cela peut prendre quelques instants.",
    cardDescription: "Préparation de votre compte sur cet appareil. Cela ne prend qu'un instant.",
    failedTitle: "Configuration interrompue",
    retry: "Réessayer"
  },
  // The app's page on the phone's store (AppStoreLink.tsx).
  appStores: {
    googlePlay: "Installer l'app sur Google Play",
    appStore: "Installer l'app sur l'App Store"
  },
  // "Install the app" (src/features/install/): the welcome screen's banner and its block in
  // "Settings › Display". Safari's menus as Apple names them.
  install: {
    banner: {
      name: "sattle.me",
      iphone: "L'app pour iPhone, sur l'App Store",
      ipad: "L'app pour iPad, sur l'App Store",
      android: "L'app pour Android, sur Google Play",
      computer: "Dans sa propre fenêtre, comme une app",
      get: "Obtenir",
      install: "Installer",
      dock: "Ajouter au Dock",
      dismiss: "Fermer, ne plus proposer"
    },
    setting: {
      title: "Installer l'app",
      places: {
        iphone: "L'app sattle.me pour iPhone, sur l'App Store.",
        ipad: "L'app sattle.me pour iPad, sur l'App Store.",
        android: "L'app sattle.me pour Android, sur Google Play.",
        computer: "sattle.me sur cet ordinateur, dans sa propre fenêtre, comme une app.",
        dock: "sattle.me dans le Dock de ce Mac, dans sa propre fenêtre, comme une app."
      },
      appStore: "App Store",
      googlePlay: "Google Play"
    },
    dock: {
      title: "Ajouter sattle.me au Dock",
      menu: "Dans la barre de menus de Safari, choisissez <strong>Fichier > Ajouter au Dock</strong>.",
      add: "Cliquez sur <strong>Ajouter</strong> : sattle.me s'ouvre depuis le Dock, dans sa propre fenêtre.",
      requirement: "Avec Safari sur macOS Sonoma ou plus récent.",
      passkey:
        "L'app du Dock garde ses propres données : la première fois, reconnectez-vous avec votre passkey.",
      done: "Compris"
    }
  },
  countryPicker: {
    search: "Rechercher un pays",
    noResult: "Aucun pays trouvé",
    close: "Fermer"
  },
  currencyPicker: {
    title: "Devise du virement",
    close: "Fermer"
  },
  card: {
    // The sign-up's card step on a computer.
    computerTitle: "Ajoutez votre <accent>carte</accent> depuis votre téléphone",
    computerDescription:
      "Un ordinateur ne lit pas les cartes NFC. Scannez ce code avec votre téléphone : il ouvre l'app, où vous vous connectez avec la même passkey. Puis approchez la carte du téléphone.",
    computerCode: "QR code qui ouvre cette étape dans l'app sur votre téléphone",
    computerWaiting:
      "En attente de votre téléphone : cette page continue dès que la carte est ajoutée.",
    // The same in the app on a device that reads no card (an iPad, useReadsCards.ts).
    deviceDescription:
      "Cet appareil ne lit pas les cartes NFC. Scannez ce code avec votre téléphone : il ouvre l'app, où vous vous connectez avec la même passkey. Puis approchez la carte du téléphone.",
    deviceDescriptionNoCode:
      "Cet appareil ne lit pas les cartes NFC. Ouvrez l'app sur votre téléphone et connectez-vous avec la même passkey, puis approchez la carte du téléphone.",
    deviceWaiting:
      "En attente de votre téléphone : cet écran continue dès que la carte est ajoutée.",
    addedTitle: "Votre <accent>carte</accent> est ajoutée",
    addedDescription:
      "Ajoutée depuis votre téléphone, elle apparaît aussi ici, dans « Cartes ». Rechargez-la pour l'utiliser.",
    webTitle: "Appairez votre <accent>BoltCard</accent> depuis l'application",
    webDescription:
      "Un navigateur ne peut pas programmer une carte. Ouvrez l'application sattle.me sur ce téléphone et connectez-vous avec votre passkey : l'appairage reprendra ici.",
    webDescriptionAndroid:
      "Un navigateur ne peut pas programmer une carte. Ouvrez l'app Android sattle.me sur ce téléphone, ou installez-la, puis connectez-vous avec votre passkey : l'appairage reprendra dans l'app.",
    webDescriptionIphone:
      "Un navigateur ne peut pas programmer une carte. Ouvrez l'app iPhone sattle.me sur ce téléphone, ou installez-la, puis connectez-vous avec votre passkey : l'appairage reprendra dans l'app.",
    retry: "Réessayer",
    openSettings: "Ouvrir les réglages",
    activationPending:
      "Votre carte est programmée, mais son relais n'a pas encore répondu. Elle sera activée à la prochaine ouverture de l'application, avec une connexion : d'ici là, elle ne paie pas.",
    activationNoPush:
      "Votre carte est prête, mais ce téléphone ne reçoit pas les notifications de paiement : elle paie seulement quand l'application est affichée. Les notifications s'activeront d'elles-mêmes si ce téléphone peut les recevoir.",
    failure: {
      noAccount: "Votre session est fermée. Reconnectez-vous avec votre passkey, puis réessayez.",
      nfcUnavailable:
        "Le NFC n'est pas disponible ou est désactivé sur cet appareil. Activez-le dans les réglages, puis réessayez.",
      notificationsDenied:
        "Autorisez les notifications de sattle.me dans les réglages du téléphone : c'est par elles que votre téléphone apprend qu'une caisse lit votre carte.",
      relayUnreachable:
        "Le relais de la carte ne répond pas. Vérifiez votre connexion, puis réessayez. Votre carte n'a pas été modifiée.",
      relayIncompatible:
        "Le relais de la carte ne parle pas la version attendue. Votre carte n'a pas été modifiée.",
      relayTooLong: "L'adresse de ce relais est trop longue pour tenir dans une carte.",
      recordsUnreachable:
        "Les relais de votre compte ne répondent pas assez. Vérifiez votre connexion, puis réessayez. Votre carte n'a pas été modifiée.",
      notConfirmed:
        "Les relais de votre compte n'ont pas confirmé ce changement : il peut encore s'appliquer, ou non. Vérifiez votre connexion, puis réessayez.",
      notBlank:
        "Cette carte n'est pas vierge. Demandez d'abord à son émetteur de la réinitialiser.",
      ownCard:
        "Cette carte est déjà dans « Cartes ». Pour l'ajouter à nouveau, supprimez-la d'abord, la carte en main.",
      notThisCard:
        "Ce n'est pas la carte choisie, ou elle a été reprogrammée ailleurs. Rien n'a été modifié : approchez la bonne carte.",
      cardLost:
        "La carte s'est éloignée trop tôt. Approchez-la à nouveau et gardez-la contre le téléphone jusqu'à la fin : l'appairage reprendra là où il s'est arrêté.",
      notBoltCard: "Cette carte n'est pas une BoltCard (NTAG 424 DNA).",
      verifyFailed:
        "La carte a été programmée, mais sa vérification a échoué. Approchez-la à nouveau pour réessayer.",
      versionsExhausted:
        "Cette carte a été reprogrammée trop de fois avec ce portefeuille. Utilisez une autre carte.",
      newerApp:
        "Une version plus récente de l'application a enregistré cette carte. Mettez l'application à jour.",
      walletNotEmpty:
        "Le portefeuille de cette carte n'est pas vide, ou des sats y arrivent encore. Retirez d'abord son solde vers votre solde principal : une carte supprimée n'apparaît plus nulle part, ses sats non plus. Votre carte n'a pas été modifiée.",
      walletUnavailable:
        "Le portefeuille de cette carte n'a pas répondu : une carte n'est supprimée qu'une fois son portefeuille vérifié vide. Vérifiez votre connexion, puis réessayez. Votre carte n'a pas été modifiée.",
      cardGone:
        "Cette carte n'est plus dans « Cartes » : elle a été supprimée. Rien n'a été modifié.",
      deletionPending:
        "Les relais de votre compte n'ont pas encore enregistré la suppression : la carte n'a pas été rendue vierge.",
      migrationDrainFailed:
        "Le solde de cette carte n'a pas pu être transféré cette fois, et la carte n'a pas été modifiée : réessayez dans un instant.",
      migrationOverDailyLimit:
        "Ce transfert dépasse le plafond de la carte : 1 000 CHF par 24 heures, ses dépenses récentes comprises. Rien n'a été transféré et la carte n'a pas été modifiée : réessayez quand son solde est sous ce plafond, ou contactez le support.",
      migrationReceiptPending:
        "Le transfert a été demandé, mais sa réception sur le nouveau portefeuille n'a pas pu être confirmée à temps. Vos sats sont peut-être déjà en route : « Cartes » montre la carte et son portefeuille. La carte n'a pas été modifiée : patientez un instant, puis réessayez.",
      migrationMasterKey:
        "La carte n'a pas pu être ré-encodée : sa clé maîtresse n'est pas celle attendue. Ce qui a déjà été transféré est dans son nouveau portefeuille, que « Cartes » montre. Réessayez ; si cela persiste, contactez le support.",
      migrationNotWiped:
        "La carte n'a pas pu être remise à zéro. Ce qui a déjà été transféré est dans son nouveau portefeuille, que « Cartes » montre. Réessayez ; si cela persiste, contactez le support.",
      migrationCardDisabled:
        "Cette carte est verrouillée ou bloquée sur l'ancien service : elle ne peut pas être migrée. Si vous l'avez verrouillée vous-même, déverrouillez-la d'abord ; sinon, contactez le support. Rien n'a été modifié.",
      migrationPaymentPending:
        "Un paiement de cette carte est encore en cours sur l'ancien service, souvent le transfert qui vient d'être fait : elle ne peut pas encore être effacée. La carte n'a pas été modifiée : réessayez dans un instant, la migration reprendra là où elle s'est arrêtée.",
      migrationServerUnreachable:
        "L'échange avec le serveur Swiss Bitcoin Pay, seul à pouvoir ouvrir cette carte, n'a pas abouti. Vérifiez votre connexion et gardez la carte contre le téléphone, puis réessayez : l'appairage reprendra là où il s'est arrêté.",
      cancelled: "Appairage annulé.",
      failed: "L'appairage a échoué. Réessayez."
    },
    nfcAlert: "Approchez votre BoltCard du haut du téléphone et gardez-la en place.",
    nfcSuccess: "Carte appairée",
    nfcFailure: "Appairage interrompu",
    notificationChannel: "Paiements par carte",
    // What the point of sale shows when the phone does not pay (decline-message.ts): read at the
    // till, sent in the language of the holder's phone, 200 UTF-16 code units at most.
    decline: {
      newPayee:
        "Nouveau commerçant : le porteur doit l'approuver dans son app sattle.me, puis représenter la carte.",
      unidentifiedPayee:
        "Commerçant non identifié : le porteur doit confirmer le paiement dans son app sattle.me.",
      unconfirmed: "Paiement à confirmer par le porteur dans son app sattle.me.",
      notConfirmed: "Paiement non confirmé sur le téléphone du porteur.",
      refused: "Paiement refusé par le porteur de la carte.",
      insufficientBalance: "Solde de la carte insuffisant.",
      aboveLimit: "Montant au-dessus du plafond par paiement de la carte.",
      dayLimit: "Plafond de la carte sur 24 heures atteint.",
      hourLimit: "Trop de paiements avec cette carte dans l'heure.",
      suspended: "Carte en pause : le porteur peut la réactiver dans son app sattle.me.",
      invalidInvoice: "Facture non valide pour cette carte.",
      expired: "Facture expirée : créez-en une nouvelle.",
      noAmount: "Facture sans montant : la carte ne paie qu'un montant fixé.",
      outOfBounds: "Montant hors des limites de la carte (1 sat à 1 BTC).",
      alreadyPaid: "La carte ne paie pas cette facture : elle est déjà réglée.",
      invalidTap: "Lecture de la carte non valide : représentez la carte.",
      sendFailed: "Le paiement n'est pas parti, rien n'a été payé. Représentez la carte.",
      uncertain:
        "Paiement interrompu : il peut encore arriver, attendez quelques secondes avant de réessayer.",
      updateApp: "Le porteur doit mettre à jour son app sattle.me.",
      superseded: "Une autre lecture de la carte a remplacé celle-ci.",
      other: "Le paiement n'a pas pu être traité."
    },
    payment: {
      title: "Paiement par carte",
      close: "Fermer",
      waiting: "Carte lue, en attente de la facture de la caisse…",
      checking: "Vérification du commerçant…",
      delay: {
        minute: "dans la minute",
        seconds_one: "dans la seconde",
        seconds_other: "dans les {{count}} secondes"
      },
      note: {
        newPayee: "Nouveau commerçant : vérifiez le montant et le nom avant de payer.",
        unidentifiedPayee:
          "La caisse n'a pas prouvé qui reçoit ce paiement : vérifiez le montant avec le commerçant.",
        unconfirmed: "Vérifiez le montant et le commerçant."
      },
      pay: "Payer {{amount}}",
      decline: "Refuser",
      answerIn: "Répondez dans {{seconds}} s",
      timeOut: "Délai dépassé",
      timeLabel: "Temps pour répondre",
      merchant: "Commerçant",
      noteLabel: "Note",
      card: "Carte",
      exactAmount: "Montant exact",
      approve: "Approuver ce commerçant",
      approveCaption: "Ses prochains paiements partiront sans confirmation",
      joined: "{{first}} · {{second}}",
      ofCard: "carte {{name}}",
      confirming: "Confirmez avec votre passkey…",
      paying: "Envoi du paiement…",
      payingAutomatically: "Envoi du paiement, sans confirmation…",
      approved: "Ce commerçant fait désormais partie de vos commerçants approuvés.",
      done: "Terminer",
      doneIn: "Terminer ({{seconds}} s)",
      failedTitle: "Paiement non effectué",
      nothingPaid: "Rien n'a été payé.",
      result: {
        completedTitle: "Paiement effectué",
        completedBody: "{{amount}} payés avec votre carte.",
        completedBodyAutomatic: "{{amount}} payés avec votre carte, sans confirmation.",
        pendingTitle: "Paiement envoyé",
        pendingBody:
          "Le paiement de {{amount}} est parti. Son état s'affiche dans la liste des mouvements.",
        failedTitle: "Paiement échoué",
        failedBody:
          "Le paiement de {{amount}} n'a pas abouti. Son état s'affiche dans la liste des mouvements.",
        declinedTitle: "Paiement refusé",
        declinedBody:
          "Vous avez refusé ce paiement de {{amount}}. Rien n'a été payé ; la caisse en est informée."
      },
      failure: {
        unreachable:
          "Le relais de la carte ne répond pas, ou ce paiement a expiré. Rien n'a été payé.",
        ended:
          "La caisse n'attend plus ce paiement. Rien n'a été payé : présentez à nouveau votre carte si besoin.",
        invalidInvoice:
          "La caisse a envoyé une facture que votre portefeuille ne peut pas payer. Rien n'a été payé.",
        otherNetwork: "La facture de la caisse est d'un autre réseau Bitcoin. Rien n'a été payé.",
        expired: "La facture de la caisse a expiré. Rien n'a été payé.",
        noAmount: "La facture de la caisse n'a pas de montant en sats entiers. Rien n'a été payé.",
        outOfBounds: "Le montant sort des limites d'un paiement par carte. Rien n'a été payé.",
        suspended: "Cette carte est en pause. Rien n'a été payé.",
        alreadyPaid: "Cette facture a déjà été payée. Rien n'a été payé de nouveau.",
        dayLimit:
          "Ce paiement dépasserait le plafond de votre carte sur 24 heures. Rien n'a été payé.",
        hourLimit: "Votre carte a atteint son nombre de paiements pour l'heure. Rien n'a été payé.",
        aboveLimit: "Le montant dépasse le plafond de votre carte. Rien n'a été payé.",
        notYourCard: "Ce paiement ne vient pas d'un tap de votre carte. Rien n'a été payé.",
        replayed: "Ce tap de votre carte a déjà servi. Rien n'a été payé.",
        unlock: "Le paiement n'a pas été confirmé. Rien n'a été payé.",
        insufficientBalance:
          "Le solde de votre carte ne suffit pas pour ce paiement et ses frais. Rien n'a été payé : rechargez la carte dans « Cartes ».",
        sendFailed:
          "Votre portefeuille n'a pas pu envoyer ce paiement, par exemple faute de solde. Rien n'est parti.",
        uncertain:
          "Votre portefeuille n'a pas confirmé l'envoi : le paiement est peut-être parti. Vérifiez la liste des mouvements avant de payer autrement.",
        otherInvoice:
          "Le service du commerçant ne reconnaît pas cette facture : elle a pu être remplacée en chemin. Rien n'a été payé.",
        settled:
          "Le service du commerçant indique que cette facture est déjà payée. Rien n'a été payé de nouveau.",
        newPayee:
          "Pas de confirmation {{delay}} : rien n'a été payé. La caisse a été informée que ce nouveau commerçant est à approuver dans l'app.",
        newPayeeHomonym: "Pas de confirmation {{delay}} : rien n'a été payé.",
        unidentifiedPayee:
          "Pas de confirmation {{delay}} : rien n'a été payé. La caisse a été informée que le commerçant n'est pas identifié.",
        unconfirmed:
          "Pas de confirmation {{delay}} : rien n'a été payé. La caisse en a été informée.",
        late: "Le paiement n'a pas pu partir {{delay}}. Rien n'a été payé.",
        newerApp:
          "Une version plus récente de l'application a enregistré votre carte. Mettez l'application à jour. Rien n'a été payé.",
        failed: "Ce paiement n'a pas pu être traité. Rien n'a été payé."
      }
    },
    payee: {
      quoted: "« {{name}} »",
      unnamed: "Nom inconnu",
      node: "Nœud {{node}}",
      by: {
        address: "identifié par son adresse Lightning",
        node: "identifié par son nœud Lightning"
      },
      nodeWarning:
        "Ce commerçant est identifié par son nœud Lightning, pas par son adresse. Si ce nœud est partagé (Spark, Wallet of Satoshi, Strike…), l'approuver approuve aussi tous ses autres utilisateurs : ils seraient payés sans confirmation, dans les plafonds de la carte.",
      formerName: "anciennement « {{name}} »",
      localName: "dans vos commerçants : « {{name}} »",
      homonym:
        "Même nom qu'un commerçant déjà approuvé, mais compte différent : vérifiez avant de payer.",
      chip: {
        approved: "Approuvé le {{date}}",
        approvedUndated: "Approuvé",
        new: "Nouveau commerçant",
        unidentified: "Commerçant non identifié",
        unchecked: "Non contrôlé (mode automatique)"
      },
      declaredName: "{{name}}, nom déclaré par le commerçant",
      declaredByNode: "{{name}}, nom déclaré par le nœud"
    },
    notice: {
      title: "Paiement par carte : {{amount}}",
      body: "{{amount}} pour {{name}}",
      askTitle: "En attente : Paiement par carte",
      askBody: "{{amount}} pour {{name}}. Cliquez pour confirmer, la caisse attend.",
      askBodyUnchecked: "{{amount}}. Cliquez pour confirmer, la caisse attend.",
      askBodyNoInvoice: "Cliquez pour confirmer, la caisse attend.",
      refusedTitle: "Refusé : Paiement par carte ({{amount}} pour {{name}})",
      refusedTitleUnchecked: "Refusé : Paiement par carte ({{amount}})",
      refusedTitleNoInvoice: "Refusé : Paiement par carte",
      pausedBody: "{{card}} est en pause. Rien n'a été payé."
    }
  },
  cards: {
    title: "Cartes",
    locked: {
      title: "Vos cartes sont verrouillées",
      body: "Déverrouillez l'app avec votre passkey pour voir vos cartes et les gérer."
    },
    pairOnPhone:
      "Pour appairer une carte, ouvrez l'application sur votre téléphone : c'est lui qui la programme, la carte tenue contre lui.",
    pairOnAndroid:
      "Pour appairer une carte, utilisez l'app Android sattle.me : c'est elle qui la programme, la carte tenue contre le téléphone.",
    pairOnIphone:
      "Pour appairer une carte, utilisez l'app iPhone sattle.me : c'est elle qui la programme, la carte tenue contre le téléphone.",
    // The sattle.me shop, wherever "Cards" offers to add a card (CardShop.tsx).
    shop: {
      order: "Commander des cartes",
      title: "Choisissez votre carte",
      lead: "Plusieurs designs, à commander sur la boutique sattle.me."
    },
    loading: "Chargement de vos cartes…",
    failed: {
      noAccount:
        "Votre session est fermée. Déverrouillez l'application avec votre passkey, puis réessayez.",
      unreachable:
        "Vos cartes n'ont pas pu être lues : les relais de votre compte ne répondent pas. Vérifiez votre connexion, puis réessayez."
    },
    retry: "Réessayer",
    map: {
      title: "Où payer avec votre carte",
      source: "Sans contact Lightning · BTC Map",
      desktopSubtitle: "Les commerces qui acceptent le sans-contact Lightning · carte de BTC Map",
      openSite: "Ouvrir btcmap.org",
      loading: "Chargement de la carte…",
      failedTitle: "La carte ne s'est pas chargée",
      failedBody:
        "BTC Map ne répond pas, ou l'appareil est hors ligne. Vérifiez votre connexion, puis réessayez.",
      openInBrowser: "Ouvrir btcmap.org dans le navigateur",
      frameTitle: "Carte BTC Map des commerces qui acceptent le paiement sans contact"
    },
    unnamed: "Carte {{id}}",
    carousel: "Vos cartes",
    slot: "Carte {{n}} sur {{count}} : {{label}}",
    add: "Ajouter une carte",
    cardOf: "Carte {{name}}",
    // "Organise": the order of the cards.
    order: {
      organize: "Organiser",
      organizeA11y: "Organiser les cartes",
      title: "Ordre des cartes",
      lead: "Maintenez une poignée et faites glisser. La première carte s'affiche à l'ouverture de « Cartes », sur tous vos appareils.",
      rowLead: "Glissez une carte à sa place (ou ← →). La première s'affiche à l'ouverture.",
      save: "Enregistrer",
      cancel: "Annuler",
      close: "Fermer",
      saved: "Ordre des cartes enregistré",
      failedTitle: "Ordre non enregistré",
      unsaved:
        "Les relais de votre compte n'ont pas répondu : vérifiez votre connexion, puis réessayez",
      newer:
        "Il a été choisi dans une version plus récente de l'app : mettez-la à jour pour le changer",
      moveUp: "Monter",
      moveDown: "Descendre",
      moveLeft: "Déplacer à gauche",
      moveRight: "Déplacer à droite",
      row: "{{label}}, {{n}} sur {{count}}",
      moved: "{{label}}, maintenant {{n}} sur {{count}}",
      previous: "Cartes précédentes",
      next: "Cartes suivantes"
    },
    // "Add a card", in "Cards" and the sign-up (AddCardFlow.tsx).
    adding: {
      guide: {
        title: "Avant de commencer",
        subtitle: "Une BoltCard vierge. Une carte de l'ancienne app est migrée, avec son solde.",
        card: "Une BoltCard vierge",
        cardBody: "Une carte de l'ancienne app est migrée, avec son solde.",
        notifications: "Les notifications",
        notificationsBody:
          "Autorisez-les quand le téléphone le demande : c'est par elles qu'il apprend qu'une caisse lit la carte.",
        start: "Commencer"
      },
      // "Add a card" on a computer (AddCardDialog.tsx).
      web: {
        note: "Un ordinateur ne lit pas les cartes NFC : une carte s'ajoute depuis l'app, sur votre téléphone, la carte en main.",
        noteDevice:
          "Cet appareil ne lit pas les cartes NFC : une carte s'ajoute depuis l'app, sur votre téléphone, la carte en main.",
        noteAndroid:
          "Un navigateur ne peut pas programmer une carte : une carte s'ajoute depuis l'app Android sattle.me, la carte en main.",
        noteIphone:
          "Un navigateur ne peut pas programmer une carte : une carte s'ajoute depuis l'app iPhone sattle.me, la carte en main.",
        where: "Contre le téléphone",
        whereBody: "Gardez la carte en place jusqu'à la fin, quelques secondes.",
        code: "QR code qui ouvre « Ajouter une carte » dans l'app sur votre téléphone",
        scan: "Scannez ce code avec votre téléphone : il ouvre « Ajouter une carte » dans l'app."
      },
      steps: {
        label: "Étapes de l'ajout",
        notifications: "Notifications autorisées",
        notificationsTodo: "Autorisation des notifications",
        notificationsRunning: "Notifications en cours d'autorisation",
        notificationsFailed: "Notifications non autorisées",
        notificationsCaption: "Votre téléphone apprend ainsi qu'une caisse lit la carte",
        relay: "Relais de la carte joignable",
        relayTodo: "Vérification du relais de la carte",
        relayRunning: "Relais de la carte en cours de vérification",
        relayFailed: "Relais de la carte non vérifié",
        card: "Carte approchée",
        cardTodo: "Approche de la carte",
        cardRunning: "En attente de la carte",
        cardFailed: "Carte non reconnue",
        cardIos: "Au‑dessus du téléphone, jusqu'à la confirmation",
        cardAndroid: "Contre le dos du téléphone, jusqu'à la vibration",
        programming: "Carte programmée",
        programmingTodo: "Programmation de la carte",
        programmingRunning: "Carte en cours de programmation",
        programmingFailed: "Carte non programmée",
        programmingCaption: "Ne bougez pas la carte",
        activating: "Carte activée",
        activatingTodo: "Activation de la carte",
        activatingRunning: "Carte en cours d'activation",
        activatingFailed: "Carte non activée",
        activatingPending: "Activation à terminer",
        activatingCaption: "Le relais enregistre ce téléphone",
        prepTitle: "Préparation…",
        prepSubtitle: "Deux vérifications avant la carte",
        holdIos: "Tenez la carte au‑dessus du téléphone",
        holdAndroid: "Tenez la carte contre le dos du téléphone",
        holdSubtitle: "Une BoltCard vierge",
        keepTitle: "Gardez la carte en place",
        keepSubtitle: "Programmation pour votre portefeuille",
        almostTitle: "Presque fini",
        almostSubtitle: "Vous pouvez éloigner la carte",
        doneTitle: "Carte ajoutée",
        doneSubtitle: "Rechargez-la pour l'utiliser",
        failedTitle: "L'ajout n'a pas abouti",
        failedNothing: "Rien n'a été écrit sur la carte",
        failedGoesOn: "Il reprendra là où il s'est arrêté",
        notificationsDenied: "Notifications refusées",
        notificationsDeniedCaption: "Autorisez-les dans les réglages du téléphone, puis réessayez.",
        nfcUnavailable: "NFC indisponible",
        lost: "Carte éloignée trop tôt",
        lostIos:
          "Approchez-la à nouveau et gardez-la en place jusqu'à la confirmation : l'ajout reprendra là où il s'est arrêté.",
        lostAndroid:
          "Approchez-la à nouveau et gardez-la en place jusqu'à la vibration : l'ajout reprendra là où il s'est arrêté.",
        relayUnreachable: "Relais injoignable",
        relayUnreachableCaption:
          "{{host}} ne répond pas : vérifiez la connexion de ce téléphone, puis réessayez",
        relayIncompatible: "Relais incompatible",
        relayIncompatibleCaption:
          "{{host}} ne parle pas la version attendue : mettez l'application à jour, puis réessayez",
        recordsUnreachable: "Relais du compte injoignables",
        recordsUnreachableCaption:
          "Les relais de votre compte ne répondent pas assez : vérifiez la connexion de ce téléphone, puis réessayez",
        notBlank: "Carte non vierge",
        notBoltCard: "Carte non compatible",
        notBoltCardCaption:
          "Cette carte n'est pas une BoltCard (NTAG 424 DNA) : approchez une BoltCard vierge",
        ownCard: "Carte déjà ajoutée",
        verifyFailed: "Vérification échouée",
        cancelled: "Lecture de la carte annulée",
        failed: "L'ajout a échoué : réessayez",
        recharge: "Recharger la carte",
        later: "Plus tard",
        cancel: "Annuler",
        stateTodo: " : à venir",
        stateRunning: " : en cours",
        stateDone: " : fait",
        stateFailed: " : en échec",
        stateWarning: " : à vérifier"
      },
      migration: {
        heading: "Migration de la carte",
        foundTitle: "Carte Swiss Bitcoin Pay détectée",
        toTransfer: "Solde à transférer",
        reading: "Lecture du solde…",
        amountA11y: "{{amount}} sats",
        whatLabel: "Ce qui va se passer",
        whatTransfer: "Son solde est transféré vers le portefeuille de la carte, dans votre app.",
        whatErase:
          "Vous approchez la carte une seconde fois : elle est effacée, puis programmée pour votre portefeuille.",
        whatVisual: "Elle garde son visuel et son numéro.",
        confirm: "Transférer et migrer",
        label: "Étapes de la migration",
        transferred: "Solde transféré",
        transferTodo: "Transfert du solde",
        transferRunning: "Solde en cours de transfert",
        recognized: "Carte reconnue",
        recognizedTodo: "Reconnaissance de la carte",
        recognizedRunning: "Carte en cours de reconnaissance",
        recognizedFailed: "Carte non reconnue",
        recognizedCaption: "Son portefeuille garde ce qu'elle a déjà transféré",
        nothingCaption: "Aucun solde à transférer",
        receivedCaption: "{{amount}} reçus",
        sendingCaption: "{{amount}} en route",
        heldSecond: "Carte approchée une seconde fois",
        heldSecondTodo: "Approche de la carte une seconde fois",
        heldAgain: "Carte approchée encore une fois",
        heldAgainTodo: "Approche de la carte encore une fois",
        programmed: "Carte effacée et programmée",
        programmedTodo: "Effacement et programmation de la carte",
        programmedRunning: "Carte en cours d'effacement et de programmation",
        activated: "Carte activée",
        doneTitle: "Carte migrée",
        doneSubtitle: "Elle paie désormais depuis son propre portefeuille, dans ses plafonds.",
        doneSubtitleVisual:
          "Elle garde son visuel et son numéro, et paie désormais depuis son propre portefeuille, dans ses plafonds.",
        failedTitle: "La migration n'a pas abouti",
        failedGoesOn: "Elle reprendra là où elle s'est arrêtée",
        failed: "La migration a échoué : réessayez",
        notTransferred: "Solde non transféré",
        transferUnconfirmed: "Transfert non confirmé",
        lostIos:
          "Approchez-la à nouveau et gardez-la en place jusqu'à la confirmation : la migration reprendra là où elle s'est arrêtée.",
        lostAndroid:
          "Approchez-la à nouveau et gardez-la en place jusqu'à la vibration : la migration reprendra là où elle s'est arrêtée.",
        transferTitle: "Transfert du solde",
        transferSubtitle:
          "{{amount}} vont vers le portefeuille de la carte. Gardez la carte à portée de main.",
        keepTitle: "Gardez la carte en place",
        keepSubtitle: "Effacement et programmation : ne la bougez pas.",
        almostTitle: "Presque fini",
        almostSubtitle: "Vous pouvez éloigner la carte.",
        holdSecond: "Approchez la carte une seconde fois",
        holdAgain: "Approchez la carte encore une fois",
        holdSubtitleIos:
          "Au‑dessus du téléphone, jusqu'à la confirmation : elle va être effacée, puis programmée.",
        holdSubtitleAndroid:
          "Contre le dos du téléphone, jusqu'à la vibration : elle va être effacée, puis programmée.",
        finish: "Terminer"
      }
    },
    // "Cards", the screen.
    home: {
      // Without a card: what a card does, in three steps.
      firstCard: "Ajoutez votre première carte",
      newCard: "Nouvelle carte",
      addLead:
        "Une BoltCard vierge paie depuis son propre portefeuille self-custodial, que vous rechargez ici.",
      steps: {
        program: {
          title: "Programmez-la",
          caption: "Tenez la carte vierge contre votre téléphone : il la programme."
        },
        recharge: {
          title: "Rechargez-la",
          caption: "Elle a son propre portefeuille : envoyez-lui les sats qu'elle pourra dépenser."
        },
        pay: {
          title: "Payez d'un geste",
          caption:
            "Approchez-la du terminal d'un commerçant : elle paie, dans les limites que vous choisissez."
        }
      },
      reading: "Lecture du solde…",
      // A payment the card received while "Cards" shows it: the notice's title, the card under it.
      received: "{{amount}} reçus",
      balanceA11y: "Solde de la carte : {{amount}} sats",
      withdraw: "Retirer",
      withdrawA11y: "Retirer de la carte",
      history: "Historique",
      rechargeA11y: "Recharger la carte",
      historyCaption: "Tous les mouvements de la carte",
      withdrawEmpty: "Rien à retirer",
      sendCaption: "Vers un autre portefeuille",
      sendCaptionMain: "Vers un autre portefeuille ou mon solde principal",
      migratingNote:
        "La migration de cette carte n'est pas terminée : elle ne paie pas encore. Ce qu'elle a déjà transféré est dans son portefeuille, ci-dessous.",
      finishMigration: "Terminer la migration",
      finishOnPhone:
        "Terminez-la dans l'application sur votre téléphone, la carte tenue contre lui.",
      security: "Sécurité",
      pause: "Mettre en pause",
      pauseCaption:
        "Elle refuse tout paiement, sans rien oublier. L'interrupteur la remet en marche.",
      limits: "Plafonds",
      payees: "Paiements sans confirmation",
      payeesReading: "Lecture…",
      payeesPending: "pas encore sur les relais",
      payeesUnread: "Pas encore lu",
      payeesNewer: "Mettez l'application à jour",
      card: "Carte",
      customize: "Personnaliser",
      customizeCaption: "Nom et apparence",
      customizeIssuer: "Nom · visuel de l'émetteur",
      relay: "Relais et programmation",
      advanced: "Réglages avancés",
      advancedRelayReady: "Relais prêt",
      delete: "Supprimer la carte",
      deleteCaption: "Elle et toutes ses données disparaissent de l'app",
      deleteUnread: "Son solde doit d'abord être lu"
    },
    // "Limits".
    limits: {
      edit: "Modifier",
      back: "Retour aux plafonds",
      reading: "Lecture des paiements…",
      unread:
        "Les relais de votre compte n'ont pas répondu : ce que la carte a déjà payé n'est pas affiché.",
      unreadPhone:
        "Les paiements de ce téléphone n'ont pas pu être lus : ce que la carte a déjà payé n'est pas affiché.",
      notePhone:
        "D'après les paiements faits par ce téléphone. Les fenêtres glissent : chaque paiement se libère 24 h (ou 1 h) après.",
      noteWeb:
        "D'après les paiements de la carte que gardent les relais de votre compte. Les fenêtres glissent : chaque paiement se libère 24 h (ou 1 h) après.",
      at: "à {{time}}",
      tomorrowAt: "demain à {{time}}",
      on: "le {{date}}",
      confirm: "Confirmer avec ma passkey",
      fiatHint: "Soit {{fiat}} au cours actuel · {{max}} sats au plus",
      satsHint: "{{max}} sats au plus",
      countHint: "{{max}} au plus",
      // "Limits" in "Cards" (LimitsPreview): a tile's line.
      preview: {
        reached: "Plafond atteint",
        hourLeft_one: "Encore {{count}} paiement",
        hourLeft_other: "Encore {{count}} paiements",
        hourNext: "Prochain paiement possible {{when}}"
      },
      day: {
        title: "Sur 24 heures",
        of: "sur {{max}} sats",
        limit: "Plafond : {{max}} sats",
        left: "Encore {{amount}} sats, soit {{fiat}}",
        leftSats: "Encore {{amount}} sats",
        reached: "Plafond atteint : la carte refuse tout paiement",
        release: "{{amount}} sats se libèrent {{when}}",
        lead: "Un paiement qui, avec ceux des 24 dernières heures, dépasserait ce plafond est refusé.",
        used: "Déjà utilisé : {{amount}} sats.",
        field: "Plafond sur 24 heures",
        belowUsed:
          "Vous avez déjà utilisé {{amount}} sats : la carte refusera tout paiement jusqu'à ce que la fenêtre se libère.",
        belowPayment:
          "Inférieur au plafond par paiement ({{amount}} sats) : c'est ce plafond sur 24 h qui limitera chaque paiement."
      },
      hour: {
        title: "Cette heure",
        of_one: "paiement sur {{max}}",
        of_other: "paiements sur {{max}}",
        limit_one: "Plafond : {{count}} paiement par heure",
        limit_other: "Plafond : {{count}} paiements par heure",
        release: "Le paiement de {{paid}} se libère {{when}}",
        reached: "Plafond atteint : prochain paiement possible {{when}}",
        formTitle: "Paiements par heure",
        lead: "Un paiement qui, avec ceux de la dernière heure, dépasserait ce nombre est refusé.",
        used_one: "Déjà cette heure : {{count}} paiement.",
        used_other: "Déjà cette heure : {{count}} paiements.",
        field: "Paiements par heure",
        belowUsed_one:
          "Vous avez déjà fait {{count}} paiement cette heure : la carte refusera tout paiement jusqu'à ce que la fenêtre se libère.",
        belowUsed_other:
          "Vous avez déjà fait {{count}} paiements cette heure : la carte refusera tout paiement jusqu'à ce que la fenêtre se libère."
      },
      payment: {
        title: "Par paiement",
        caption: "Un paiement plus élevé est refusé",
        lead: "Un paiement plus élevé que ce plafond est refusé.",
        field: "Plafond par paiement",
        aboveDay:
          "Supérieur au plafond sur 24 h ({{amount}} sats) : c'est le plafond sur 24 h qui limitera chaque paiement."
      }
    },
    // "Customize": a card's "Name" and "Look".
    customize: {
      title: "Personnaliser la carte",
      name: "Nom",
      clear: "Effacer le nom",
      taken:
        "Une autre de vos cartes s'appelle déjà {{name}}. Un nom différent les distingue au moment de payer.",
      look: "Apparence",
      lookKind: "Type d'apparence",
      color: "Couleur",
      image: "Image",
      // Read by screen readers only.
      colors: {
        ink: "Encre",
        night: "Nuit",
        plum: "Prune",
        bordeaux: "Bordeaux",
        fir: "Sapin",
        lagoon: "Lagune",
        copper: "Cuivre",
        bitcoin: "Bitcoin"
      },
      choosePhoto: "Choisir une photo",
      chooseImage: "Choisir une image",
      takePhoto: "Prendre une photo",
      imageNote: "Vous la cadrerez ensuite au format de la carte. Elle remplacera la couleur.",
      errors: {
        photoDenied:
          "Autorisez l'accès à vos photos dans les réglages de l'appareil, puis réessayez.",
        cameraDenied:
          "L'appareil photo ne s'ouvre pas. Autorisez-le dans les réglages de l'appareil, puis réessayez.",
        unreadable: "Cette image ne peut pas être utilisée. Choisissez-en une autre.",
        imageUnpublished:
          "L'image n'a pas pu être enregistrée sur les relais de votre compte. Vérifiez la connexion, puis réessayez.",
        failed: "La carte n'a pas pu être modifiée. Réessayez."
      }
    },
    // "Frame the image".
    frame: {
      title: "Cadrer l'image",
      hint: "Glissez pour déplacer, pincez ou utilisez les boutons pour zoomer.",
      hintWeb: "Glissez l'image pour la déplacer ; la molette ou les boutons la zooment.",
      area: "Image à cadrer",
      zoomValue: "Zoom {{zoom}}",
      zoomIn: "Zoomer",
      zoomOut: "Dézoomer",
      moveLeft: "Déplacer l'image vers la gauche",
      moveRight: "Déplacer l'image vers la droite",
      moveUp: "Déplacer l'image vers le haut",
      moveDown: "Déplacer l'image vers le bas",
      use: "Utiliser cette image"
    },
    status: {
      active: "Active",
      suspended: "En pause",
      migrating: "Migration à terminer"
    },
    sync: {
      ready: "Prête",
      noPush: "Sans notifications",
      unreachable: "Relais injoignable",
      refused: "Relais en erreur"
    },
    // What the web app leaves to the phone (OnPhoneSteps.tsx).
    onPhone: {
      label: "Sur votre téléphone",
      openApp: "Ouvrez sattle.me sur votre téléphone",
      openAppScan: "Ou scannez ce code avec lui : il ouvre « Cartes » dans l'app.",
      hold: "Approchez la carte du téléphone",
      code: "QR code qui ouvre « Cartes » dans l'app sur votre téléphone"
    },
    relay: {
      checking: "Vérification de la carte…",
      readyTitle: "La carte est prête",
      readyBody:
        "Son relais, {{host}}, réveille ce téléphone à chaque paiement. Il ne détient ni clé ni fonds.",
      stateTitle: "État de la carte",
      reachable: "Relais joignable",
      defaultCaption: "{{host}}, relais par défaut",
      programmed: "Carte programmée pour ce relais",
      programmedCaption: "Ses prochains taps y sont attendus",
      notWoken: "Ce téléphone n'est pas réveillé",
      notWokenCaption:
        "Notifications désactivées : la carte ne paie que lorsque l'app est ouverte sur ce téléphone.",
      noTokenCaption:
        "Ce téléphone ne reçoit pas les notifications de paiement : la carte ne paie que lorsque l'app est ouverte sur ce téléphone.",
      enableNotifications: "Activer les notifications",
      unreachable: "Relais injoignable",
      unreachableCaption:
        "{{host}} n'a pas répondu à ce téléphone : la carte ne peut pas payer tant qu'il ne répond pas.",
      refused: "Relais en erreur",
      refusedCaption:
        "{{host}} a refusé le canal de la carte : elle ne peut pas payer tant qu'il le refuse.",
      uncheckedTitle: "État non vérifié",
      uncheckedCaption:
        "L'état de la carte n'a pas pu être lu sur ce téléphone. Réessayez dans un instant.",
      change: "Changer de relais",
      changeCaption: "Pour un relais que vous hébergez vous-même",
      // The relay's source, to host one's own (RelayPanel.tsx, RelayWebPanel.tsx).
      sourceLink: "sattleme/relay sur github.com",
      // In the web app (RelayWebPanel.tsx).
      webCaption:
        "Il réveille votre téléphone à chaque paiement de la carte, sans détenir ni clé ni fonds.",
      webNote:
        "Un ordinateur ne lit pas les cartes NFC : la carte se programme depuis l'app, sur un téléphone.",
      webNoteAndroid:
        "Un navigateur ne peut pas programmer une carte : elle se programme depuis l'app Android sattle.me.",
      webNoteIphone:
        "Un navigateur ne peut pas programmer une carte : elle se programme depuis l'app iPhone sattle.me.",
      deviceNote:
        "Cet appareil ne lit pas les cartes NFC : la carte se programme depuis l'app, sur un téléphone.",
      webOnPhone: "Sur le téléphone",
      webStepsTitle: "Sur votre téléphone, la carte en main",
      webHoldCaption: "Quand l'app vous la demande, jusqu'à la fin des étapes.",
      defaultLink: "Relais par défaut",
      fieldInvalid: "Saisir une adresse complète",
      fieldLong: "Saisir une adresse de {{max}} caractères au plus",
      fieldUnreachable: "Relais injoignable : vérifier l'adresse",
      fieldIncompatible: "Relais incompatible avec cette carte",
      moved: "La carte passe désormais par {{host}}",
      steps: {
        label: "Étapes du changement de relais",
        relay: "Nouveau relais joignable",
        relayTodo: "Vérification du nouveau relais",
        relayRunning: "Nouveau relais en cours de vérification",
        relayFailed: "Nouveau relais non vérifié",
        relayCaption: "{{host}}, version attendue",
        card: "Carte approchée",
        cardTodo: "Approche de la carte",
        cardRunning: "En attente de la carte",
        cardFailed: "Carte non reconnue",
        cardAndroid: "Contre le dos du téléphone, jusqu'à la vibration",
        cardIos: "Au‑dessus du téléphone, jusqu'à la confirmation",
        programming: "Programmée pour ce relais",
        programmingTodo: "Programmation pour ce relais",
        programmingRunning: "En cours de programmation pour ce relais",
        programmingFailed: "Non programmée pour ce relais",
        programmingCaption: "Ne bougez pas la carte",
        former: "Ancien relais oublié",
        formerTodo: "Oubli de l'ancien relais",
        formerRunning: "Oubli de l'ancien relais en cours",
        formerFailed: "Ancien relais non oublié",
        formerCaption: "{{relay}} ne reçoit plus ses taps",
        formerDown: "Ancien relais injoignable",
        formerDownCaption: "{{relay}} n'a pas répondu : son canal y reste, sans effet",
        formerRefused: "Ancien relais en erreur",
        formerRefusedCaption: "{{relay}} a refusé d'oublier son canal : il y reste, sans effet",
        formerUnknown: "Ancien relais à vérifier",
        formerUnknownCaption:
          "{{relay}} a répondu sans le confirmer : son canal y est peut-être resté, sans effet",
        lost: "Carte éloignée trop tôt",
        lostAndroid:
          "Approchez-la à nouveau et gardez-la en place jusqu'à la vibration : le changement reprendra là où il s'est arrêté.",
        lostIos:
          "Approchez-la à nouveau et gardez-la en place jusqu'à la confirmation : le changement reprendra là où il s'est arrêté.",
        holdAndroid: "Tenez {{name}} contre le dos du téléphone",
        holdIos: "Tenez {{name}} au‑dessus du téléphone",
        holdSubtitle: "Elle va passer par {{host}}",
        keepTitle: "Gardez la carte en place",
        keepSubtitle: "Programmation pour le nouveau relais",
        almostTitle: "Presque fini",
        almostSubtitle: "Vous pouvez éloigner la carte",
        doneTitle: "La carte passe par {{host}}",
        doneSubtitle: "Elle garde son nom, son solde et ses réglages",
        failedTitle: "Le changement n'a pas abouti",
        failedNothing: "Rien n'a été écrit sur cette carte",
        failedGoesOn: "Il reprendra là où il s'est arrêté",
        checkingTitle: "Vérification du nouveau relais",
        relayUnreachable:
          "{{host}} ne répond pas : vérifiez la connexion de ce téléphone, puis réessayez",
        relayIncompatible: "{{host}} ne parle pas la version attendue",
        recordsUnreachable:
          "Les relais de votre compte ne répondent pas assez : vérifiez la connexion de ce téléphone, puis réessayez",
        cancelled: "Lecture de la carte annulée",
        failed: "Le changement a échoué : réessayez",
        resetNotice:
          "Tant que le changement n'a pas abouti, la carte ne paie plus et n'apparaît plus dans « Cartes ». Avec « Ajouter une carte », elle revient sur le relais par défaut, avec son solde, son nom et ses plafonds.",
        finish: "Terminer",
        cancel: "Annuler",
        stateTodo: " : à venir",
        stateRunning: " : en cours",
        stateDone: " : fait",
        stateFailed: " : en échec",
        stateWarning: " : à vérifier"
      }
    },
    history: {
      title: "Historique",
      subtitle: "Carte {{name}}",
      reading: "Lecture de l'historique…",
      failed:
        "Les relais de votre compte n'ont pas répondu : l'historique ne peut pas être affiché.",
      legacyUnread:
        "Les relais de votre compte n'ont pas tous répondu : des mouvements anciens de la carte peuvent manquer.",
      ownOnly:
        "Les relais de votre compte n'ont pas répondu : les paiements faits par vos autres téléphones peuvent manquer.",
      walletFailed:
        "Le portefeuille de la carte n'a pas pu être lu : ses recharges et retraits récents peuvent manquer.",
      newer:
        "Certains mouvements ne s'affichent qu'avec une version plus récente de l'application.",
      empty: "Aucun mouvement pour cette carte.",
      pendingGroup: "En cours",
      deposit: "Dépôt Bitcoin",
      depositConfirming: "Reçu · en attente de confirmation",
      depositClaiming: "Confirmé · ajout au solde en cours",
      depositFees: "Attend des frais plus bas : {{asked}} demandés, {{max}} au plus",
      depositFeesUnknown: "Attend des frais plus bas : {{max}} sats au plus",
      at: "{{time}} · {{what}}",
      paid: "Payé",
      refused: "Refusé : {{reason}}",
      refusedPlain: "Refusé",
      failedRow: "Échoué : rien n'est parti",
      uncertain: "Incertain : peut-être parti",
      sending: "Envoi en cours",
      noName: "Paiement par carte",
      recharge: "Recharge",
      // Funds that left the card wallet's balance, back in it (src/features/wallet/funds-recovery.ts).
      recovered: "Fonds récupérés",
      return: "Retrait",
      toMain: "Vers mon solde principal",
      ways: {
        main: "Depuis mon solde principal",
        invoice: "Facture Lightning",
        address: "Adresse Lightning",
        onchain: "Adresse Bitcoin",
        onchainFee: "Adresse Bitcoin, frais {{fee}}",
        lnurl: "Lien LNURL",
        spark: "Adresse Spark"
      },
      means: {
        main: "Mon solde principal",
        invoice: "Facture Lightning",
        address: "Adresse Lightning",
        onchain: "Adresse Bitcoin",
        lnurl: "Lien LNURL",
        spark: "Adresse Spark"
      },
      showMonth: "Afficher {{month}}",
      showMonthAll: "Afficher tout {{month}}",
      monthFailed: "Ce mois n'a pas pu être lu : les relais de votre compte n'ont pas répondu.",
      monthIncomplete: "Une partie des mois affichés n'a pas pu être lue.",
      // A card migrated from Swiss Bitcoin Pay: the copy of its v2 history (LegacyHistoryOffer.tsx).
      legacy: {
        pinNeeded:
          "L'historique de cette carte chez Swiss Bitcoin Pay est protégé par le code PIN que vous lui aviez donné. Saisissez-le pour l'ajouter ici.",
        open: "Récupérer l'historique",
        failed: "L'historique de cette carte chez Swiss Bitcoin Pay n'a pas pu être récupéré.",
        title: "Historique Swiss Bitcoin Pay",
        lead: "Saisissez le code PIN que vous aviez donné à cette carte chez Swiss Bitcoin Pay : son historique s'ajoute à celui de la carte.",
        pin: "Code PIN",
        submit: "Récupérer",
        note: "Il ne sert qu'une fois, à lire l'historique de la carte chez Swiss Bitcoin Pay : sattle.me ne le garde pas.",
        errors: {
          pinInvalid: "Code PIN incorrect",
          pinLocked:
            "Trop d'essais : Swiss Bitcoin Pay refuse ce code pour un moment. Réessayez plus tard.",
          failed: "L'historique n'a pas pu être récupéré. Vérifiez votre connexion et réessayez."
        }
      },
      reasons: {
        declined: "non confirmé sur le téléphone",
        newPayee: "nouveau commerçant non confirmé",
        unidentifiedPayee: "commerçant non identifié, non confirmé",
        unconfirmed: "non confirmé à temps",
        insufficientBalance: "solde de la carte insuffisant",
        invalidInvoice: "facture invalide",
        expired: "facture expirée",
        noAmount: "facture sans montant",
        alreadyPaid: "facture déjà payée",
        outOfBounds: "montant hors limites",
        aboveLimit: "au-dessus du plafond par paiement",
        dayLimit: "plafond sur 24 heures atteint",
        hourLimit: "trop de paiements dans l'heure",
        suspended: "carte en pause",
        invalidTap: "lecture de la carte non valide",
        failed: "paiement échoué",
        superseded: "remplacé par une autre lecture",
        unavailable: "paiement non traité"
      },
      motives: {
        declined: "Non confirmé sur le téléphone",
        newPayee: "Nouveau commerçant, non confirmé à temps",
        unidentifiedPayee: "Commerçant non identifié, non confirmé à temps",
        unconfirmed: "Non confirmé à temps",
        insufficientBalance: "Solde de la carte insuffisant",
        invalidInvoice: "Facture invalide",
        expired: "Facture expirée",
        noAmount: "Facture sans montant",
        alreadyPaid: "Facture déjà payée",
        outOfBounds: "Montant hors limites",
        aboveLimit: "Au-dessus du plafond par paiement",
        dayLimit: "Plafond sur 24 heures atteint",
        hourLimit: "Trop de paiements dans l'heure",
        suspended: "Carte en pause",
        invalidTap: "Lecture de la carte non valide",
        failed: "Le portefeuille de la carte ne l'a pas envoyé",
        superseded: "Remplacé par une autre lecture de la carte",
        unavailable: "Le paiement n'a pas pu être traité"
      },
      detail: {
        payment: "Paiement",
        refused: "Paiement refusé",
        failed: "Paiement échoué",
        paid: "Payé",
        paidWith: "Payé · {{payee}}",
        merchant: "Commerçant",
        payee: {
          approved: "commerçant approuvé",
          new: "nouveau commerçant",
          unidentified: "commerçant non identifié",
          unchecked: "non contrôlé (mode automatique)"
        },
        refusedPill: "Refusé · rien n'est parti",
        failedPill: "Échoué · rien n'est parti",
        uncertainPill: "Incertain · peut-être parti",
        sendingPill: "Envoi en cours",
        refusedMotive: "Refusé",
        failedMotive: "Le portefeuille de la carte ne l'a pas envoyé",
        date: "Date",
        value: "Valeur",
        valueThen: "Lors de la transaction : {{fiat}}",
        valueNow: "Maintenant : {{fiat}}",
        valueNowReading: "Maintenant : lecture du cours",
        valueNowUnknown: "Maintenant : cours indisponible",
        note: "Note",
        motive: "Motif",
        fees: "Frais",
        noFee: "Aucun",
        feeDeducted: "{{fee}}, déduits",
        way: "Type de paiement",
        to: "Vers",
        mainBalance: "Mon solde principal",
        received: "Reçu",
        description: "Description",
        transaction: "Transaction",
        copyTx: "Copier l'identifiant de la transaction",
        txCopied: "Identifiant de la transaction copié",
        openTx: "Voir la transaction sur {{explorer}}",
        approve: "Approuver ce commerçant",
        approveNote:
          "Votre passkey vous sera demandée. Ses prochains paiements passeront sans confirmation, dans les plafonds de la carte.",
        approved: "Commerçant approuvé pour cette carte",
        approvedNote:
          "Commerçant approuvé : ses prochains paiements passeront sans confirmation, dans les plafonds de la carte.",
        approveFailed: "Le commerçant n'a pas pu être approuvé. Réessayez.",
        homonym:
          "Même nom qu'un commerçant déjà approuvé, mais compte différent : il ne peut être approuvé qu'en confirmant un paiement chez lui, après vérification sur place."
      }
    },
    sheet: {
      close: "Fermer",
      nameInvalid: "Une ligne de {{max}} caractères au plus.",
      save: "Enregistrer",
      ceilingInvalid: "Un nombre entier de sats, de 1 à {{max}}.",
      hourInvalid: "Un nombre entier, de 1 à {{max}}.",
      relayHint:
        "Le relais réveille votre téléphone quand une caisse lit la carte ; il ne détient ni clé ni fonds. La carte sera reprogrammée : gardez-la à portée de main.",
      relayField: "Adresse du relais",
      relayPlaceholder: "relais.example.com",
      program: "Programmer la carte",
      back: "Retour",
      done: "Terminé",
      failedTitle: "L'opération n'a pas abouti",
      changeFailed: "La modification n'a pas pu être enregistrée. Réessayez.",
      nfcSuccess: "Carte prête",
      nfcFailure: "Opération interrompue"
    },
    // "Delete the card": all its data erased.
    delete: {
      card: {
        drainBody:
          "Elle contient encore <strong>{{amount}}</strong>. Videz-la vers une adresse lightning, bitcoin ou Spark avant de la supprimer.",
        drainBodyArriving:
          "Elle contient encore <strong>{{amount}}</strong>, et <strong>{{arriving}}</strong> arrivent sur une adresse Bitcoin. Videz-la, puis à nouveau une fois ces <strong>{{arriving}}</strong> ajoutés.",
        drainBodyArrivingOnly:
          "<strong>{{arriving}}</strong> arrivent sur une adresse Bitcoin de cette carte. Videz-la une fois ces sats ajoutés, avant de la supprimer."
      },
      drainTitle: "Videz d'abord <accent>{{name}}</accent>",
      drainBody:
        "Elle contient encore <strong>{{amount}}</strong>. Retirez-les vers votre solde principal avant de la supprimer.",
      drainBodyArriving:
        "Elle contient encore <strong>{{amount}}</strong>, et <strong>{{arriving}}</strong> arrivent sur une adresse Bitcoin. Retirez son solde vers votre solde principal, puis ces <strong>{{arriving}}</strong> une fois ajoutés.",
      drainBodyArrivingOnly:
        "<strong>{{arriving}}</strong> arrivent sur une adresse Bitcoin de cette carte. Retirez-les vers votre solde principal une fois ajoutés, avant de la supprimer.",
      drainConfirm: "Retirer",
      title: "Supprimer {{name}}",
      gone: "Effacé pour toujours",
      goneSettings: "Son nom et ses réglages, commerçants approuvés compris",
      goneHistory: "Son historique",
      goneAddress: "Son adresse Lightning",
      inHand: "J'ai la carte avec moi",
      inHandCaption: "Tenue contre le téléphone, elle redevient vierge",
      confirm: "Supprimer la carte",
      withoutTitle: "Supprimer {{name}} sans elle ?",
      withoutBody:
        "Ses données sont effacées et elle ne pourra plus jamais payer. Si vous la retrouvez, « Ajouter une carte » la rendra vierge.",
      withoutConfirm: "Supprimer",
      // In the web app (DeleteCardPanel.tsx).
      cardLabel: "La carte",
      withCard: "Je l'ai avec moi",
      withCardCaption: "Elle redevient vierge",
      withoutCard: "Je ne l'ai pas",
      withoutCardCaption: "Elle ne paiera plus jamais",
      withoutNote:
        "Si vous la retrouvez, « Ajouter une carte », dans l'app sur votre téléphone, la rendra vierge.",
      webUnder: "« {{inHand}} » reste coché.",
      webHoldCaption: "Quand l'app vous la demande.",
      understood: "Compris",
      deleting: "Suppression…",
      failedTitle: "La suppression n'a pas abouti",
      failedBody: "Réessayez ; si cela persiste, contactez le support.",
      done: "{{name}} est supprimée",
      pendingCaption:
        "Les relais de votre compte n'ont pas encore enregistré sa suppression : elle se terminera à la prochaine synchronisation",
      steps: {
        screen: "Supprimer la carte",
        label: "Étapes de la suppression",
        prepTitle: "Préparation…",
        prepSubtitle: "Vérification du solde de la carte",
        holdAndroid: "Tenez {{name}} contre le dos du téléphone",
        holdIos: "Tenez {{name}} au‑dessus du téléphone",
        holdSubtitle: "Elle redevient vierge, puis ses données sont effacées",
        keepTitle: "Gardez la carte en place",
        keepSubtitle: "Elle redevient vierge",
        almostTitle: "Presque fini",
        almostSubtitle: "Vous pouvez éloigner la carte",
        doneSubtitle: "La carte est vierge : donnez-la, ou ajoutez-la comme neuve",
        notThisTitle: "Ce n'est pas {{name}}",
        notThisSubtitle: "Rien n'a été modifié sur la carte présentée",
        notThisCaption:
          "Ou elle a été reprogrammée ailleurs. Rien n'a été modifié : approchez la bonne carte.",
        failedNothing: "Rien n'a été modifié sur la carte",
        failedGoesOn: "Elle ne paie déjà plus : « Réessayer » termine la suppression",
        emptied: "Solde retiré",
        emptiedTodo: "Vérification du solde",
        emptiedRunning: "Solde en cours de vérification",
        emptiedFailed: "Solde non retiré",
        emptiedCaption: "La carte est vide",
        unchecked: "Solde non vérifié",
        uncheckedCaption:
          "Sa suppression était déjà enregistrée : des sats arrivés depuis restent visibles dans « Cartes »",
        held: "Carte approchée",
        heldTodo: "Approche de la carte",
        heldRunning: "En attente de la carte",
        heldFailed: "Carte non reconnue",
        heldAndroid: "Contre le dos du téléphone, jusqu'à la vibration",
        heldIos: "Au‑dessus du téléphone, jusqu'à la confirmation",
        blank: "Carte vierge",
        blankTodo: "Réinitialisation de la carte",
        blankRunning: "Carte en cours de réinitialisation",
        blankFailed: "Carte non réinitialisée",
        blankCaption: "Ne bougez pas la carte",
        erased: "Données effacées",
        erasedTodo: "Effacement des données",
        erasedRunning: "Données en cours d'effacement",
        erasedFailed: "Données non effacées",
        erasedCaption: "Son nom, ses réglages, son historique, son adresse Lightning",
        erasedLater: "Effacement à terminer",
        erasedLaterCaption:
          "Les relais de votre compte n'ont pas tous répondu : l'effacement reprendra à la prochaine synchronisation",
        lost: "Carte éloignée trop tôt",
        lostAndroid:
          "Approchez-la à nouveau et gardez-la en place jusqu'à la vibration : la suppression reprendra là où elle s'est arrêtée.",
        lostIos:
          "Approchez-la à nouveau et gardez-la en place jusqu'à la confirmation : la suppression reprendra là où elle s'est arrêtée.",
        cancelled: "Lecture de la carte annulée",
        failed: "La suppression a échoué : réessayez",
        noCard: "Je n'ai pas la carte",
        finish: "Terminer",
        cancel: "Annuler",
        stateTodo: " : à venir",
        stateRunning: " : en cours",
        stateDone: " : fait",
        stateFailed: " : en échec",
        stateWarning: " : à vérifier"
      }
    },
    // Sats that reached a deleted card's wallet ("Cards", erased-funds.ts).
    drain: {
      intro:
        "Tout le solde de la carte part vers une adresse lightning, bitcoin ou Spark : saisissez-la, collez-la ou scannez-la. Les frais sont pris sur ce solde.",
      introNoScan:
        "Tout le solde de la carte part vers une adresse lightning, bitcoin ou Spark : saisissez-la ou collez-la. Les frais sont pris sur ce solde.",
      placeholder: "Adresse lightning, bitcoin ou Spark",
      invoice: "Utilisez une adresse lightning, bitcoin ou Spark",
      total: "Solde de la carte",
      received: "Reçu par le destinataire",
      feesAbove: "Les frais dépassent le solde de la carte à cette vitesse",
      empty: "Cette carte ne contient rien à retirer.",
      quoteFailed:
        "Le vidage n'a pas pu être préparé. Vérifiez le destinataire et votre connexion à internet, puis réessayez.",
      done: "{{amount}} retirés : la carte est vide.",
      pending: "Retrait de {{amount}} parti : il arrivera dès qu'il aura abouti.",
      failed: "Le retrait n'a pas abouti. Vérifiez le solde de la carte, puis réessayez."
    },
    // A phone that keeps cards' passes and looks modified (modified-phone.ts, PayeesPanel.tsx).
    modifiedPhone: {
      title: "Ce téléphone est moins sûr",
      body: "Il semble avoir été modifié (par exemple « rooté »). Pour que cette carte paie sans votre confirmation, l'app garde sur ce téléphone de quoi la faire payer : une app malveillante pourrait s'en servir pour dépenser son solde. Gardez peu de sats sur cette carte, ou choisissez « Toujours confirmer »."
    },
    erasedFunds: {
      card: {
        body: "{{amount}} sont arrivés sur son portefeuille après sa suppression. Videz-le vers une adresse lightning, bitcoin ou Spark.",
        bodyArriving:
          "{{amount}} sont arrivés sur son portefeuille après sa suppression, et {{arriving}} arrivent encore sur son adresse Bitcoin. Videz-le vers une adresse lightning, bitcoin ou Spark.",
        arrivingOnly:
          "{{arriving}} arrivent sur l'adresse Bitcoin d'une carte supprimée. Vous pourrez les retirer une fois ajoutés.",
        stoppedBody:
          "Elle revient dans « Cartes », avec son solde, quand vous l'ajoutez à nouveau. {{amount}} restent sur son portefeuille : sans la carte, videz-le vers une adresse lightning, bitcoin ou Spark.",
        stoppedBodyArriving:
          "Elle revient dans « Cartes », avec son solde, quand vous l'ajoutez à nouveau. {{amount}} restent sur son portefeuille, et {{arriving}} arrivent encore sur son adresse Bitcoin : sans la carte, videz-le vers une adresse lightning, bitcoin ou Spark."
      },
      title: "Des sats sont arrivés sur une carte supprimée",
      titleArriving: "Des sats arrivent sur une carte supprimée",
      body: "{{amount}} sont arrivés sur son portefeuille après sa suppression. Retirez-les vers votre solde principal.",
      bodyArriving:
        "{{amount}} sont arrivés sur son portefeuille après sa suppression, et {{arriving}} arrivent encore sur son adresse Bitcoin. Retirez-les vers votre solde principal.",
      arrivingOnly:
        "{{arriving}} arrivent sur l'adresse Bitcoin d'une carte supprimée. Vous pourrez les retirer vers votre solde principal une fois ajoutés.",
      returned: "{{amount}} retirés vers votre solde principal",
      returnPending:
        "Retrait de {{amount}} parti : il s'ajoutera à votre solde principal dès qu'il aura abouti",
      failed: "Le retrait n'a pas abouti. Vérifiez votre connexion à internet, puis réessayez.",
      // A card whose programming stopped (reset), its balance.
      stoppedTitle: "{{card}} : reprogrammation interrompue",
      stoppedBody:
        "Elle revient dans « Cartes », avec son solde, quand vous l'ajoutez à nouveau. {{amount}} restent sur son portefeuille : sans la carte, retirez-les vers votre solde principal.",
      stoppedBodyArriving:
        "Elle revient dans « Cartes », avec son solde, quand vous l'ajoutez à nouveau. {{amount}} restent sur son portefeuille, et {{arriving}} arrivent encore sur son adresse Bitcoin : sans la carte, retirez-les vers votre solde principal."
    },
    // The card's own wallet, in its panel (CardWalletPanel.tsx).
    wallet: {
      balance: "Solde",
      pendingDeposit: "{{amount}} reçus sur une adresse Bitcoin, pas encore ajoutés au solde",
      failed:
        "Le portefeuille de cette carte n'a pas pu être lu. Vérifiez votre connexion à internet, puis réessayez.",
      recharge: "Recharger",
      return: "Retirer vers mon solde principal",
      // On a desktop (CardWalletFlow.tsx).
      rechargeCard: "Recharger <accent>{{name}}</accent>",
      amountField: "Montant",
      rechargeAmount: "Recharger {{amount}}",
      returnAmount: "Retirer {{amount}}",
      copyInvoice: "Copier la facture",
      copyAddress: "Copier l'adresse",
      onchainOpenHere:
        "L'ajout se fait quand la carte est ouverte dans « Cartes », ici ou sur votre téléphone.",
      fromMain: "Depuis mon solde principal",
      invoice: "Facture Lightning",
      onchain: "Adresse Bitcoin",
      continue: "Continuer",
      invoiceCreate: "Créer la facture",
      invoiceDescription: "Recharge de carte",
      noFee: "Aucun",
      working: "Transfert en cours…",
      recharged: "Carte rechargée de {{amount}}.",
      returned: "{{amount}} retirés vers votre solde principal.",
      rechargePending:
        "Recharge de {{amount}} partie : elle s'ajoutera au solde de la carte dès qu'elle aura abouti.",
      returnPending:
        "Retrait de {{amount}} parti : il s'ajoutera à votre solde principal dès qu'il aura abouti.",
      nothingToReturn: "Cette carte ne contient rien à retirer.",
      prepareFailed:
        "Le transfert n'a pas pu être préparé : rien n'est parti. Vérifiez votre connexion à internet, puis réessayez.",
      transferFailed:
        "Le transfert n'a pas abouti. Vérifiez votre connexion à internet, puis réessayez : il ne partira qu'une fois.",
      transferRefused: "Le transfert a échoué. Vérifiez les soldes avant de recommencer.",
      receiveFailed:
        "L'adresse ou la facture n'a pas pu être créée. Vérifiez votre connexion à internet, puis réessayez.",
      invoiceHint:
        "Payable une seule fois, depuis n'importe quel portefeuille Lightning, jusqu'au {{date}}.",
      readingMain: "Lecture de votre solde principal…",
      otherWallet: "Autre portefeuille",
      confirmRecharge: "Confirmer la recharge",
      mainAvailable: "{{amount}} disponibles",
      change: "Changer",
      mainShort: "Votre solde principal ne couvre pas ce montant",
      mainUnread: "Votre solde principal n'a pas pu être lu. Réessayez dans un instant.",
      unit: "Unité",
      addressNote:
        "L'adresse Lightning de la carte, permanente : partagez-la, le montant envoyé s'ajoute au solde de la carte.",
      orAnyWallet: "ou depuis n'importe quel portefeuille",
      share: "Partager",
      invoiceWaiting: "En attente du paiement…",
      invoicePaid: "Facture payée",
      invoiceAdded: "ajoutés au solde de la carte",
      finish: "Terminer",
      invoiceExpired: "Facture expirée",
      invoiceExpiredNote:
        "Elle n'a pas été payée avant le {{date}} : plus personne ne peut la payer.",
      newInvoice: "Nouvelle facture",
      onchainConfirmations:
        "Ce que vous y envoyez s'ajoute au solde de la carte après 1 à 3 confirmations, jusqu'à une trentaine de minutes.",
      onchainFee: "Frais : {{fee}} au plus, déduits. Si le réseau demande plus, l'ajout attend.",
      onchainOpen: "L'ajout se fait quand vous ouvrez la carte dans « Cartes ».",
      toMain: "Vers mon solde principal",
      fromCard: "Depuis la carte {{name}} · {{amount}}",
      cardHoldsOnly: "La carte ne contient que {{amount}}",
      allOf: "Tout le solde de la carte · {{fiat}}",
      wholeBalance: "Tout le solde de la carte",
      partOf: "{{fiat}} · il restera {{left}} sur la carte",
      partOfSats: "Il restera {{left}} sur la carte",
      emptyCard: "Vider la carte",
      rowFrom: "De",
      rowTo: "Vers",
      rowFee: "Frais",
      rowAfter: "Solde de la carte après",
      mainBalance: "Mon solde principal",
      confirmPasskey: "Confirmer avec ma passkey",
      copy: "Copier",
      copied: "Copié",
      copyFailed: "La copie a échoué"
    },
    payees: {
      approved: "Approuvés pour cette carte",
      approvedCount: "$t(cards.payees.approved) · {{count}}",
      changeMode: "Changer de mode",
      modeBox: {
        automatic: {
          title: "Mode : automatique",
          caption: "Chaque tap valide est payé, dans les plafonds"
        },
        approved: {
          title: "Mode : commerçants approuvés",
          caption: "Ailleurs, votre téléphone demande de confirmer"
        },
        confirm: {
          title: "Mode : toujours confirmer",
          caption: "Chaque paiement attend votre confirmation"
        }
      },
      changeLabel: "Changer le mode de confirmation de {{name}}",
      approveNote:
        "Pour en ajouter un, cochez « $t(card.payment.approve) » quand vous confirmez un paiement chez lui.",
      removeLabel: "Retirer {{name}} des commerçants approuvés",
      payments_one: "{{count}} paiement",
      payments_other: "{{count}} paiements",
      paymentsRecent_one: "{{count}} paiement en 90 jours",
      paymentsRecent_other: "{{count}} paiements en 90 jours",
      itsName: "Son nom",
      itsNode: "Son nœud",
      nodeNote:
        "Approuvé par son nœud Lightning : si ce nœud est partagé (Spark, Wallet of Satoshi, Strike…), tous ses autres utilisateurs sont aussi payés sans confirmation, dans les plafonds de la carte.",
      approvedAs: "Approuvé sous le nom",
      approvedOnLabel: "Approuvé le",
      paymentsLabel: "Paiements",
      paymentsValue_one: "{{count}}, pour {{amount}}",
      paymentsValue_other: "{{count}}, pour {{amount}}",
      paymentsValueRecent_one: "{{count}} en 90 jours, pour {{amount}}",
      paymentsValueRecent_other: "{{count}} en 90 jours, pour {{amount}}",
      modesLabel: "Mode de confirmation des paiements",
      recommended: "Recommandé",
      confirmPasskey: "Confirmer avec ma passkey",
      modes: {
        automatic: {
          title: "Automatique",
          body: "Chaque tap valide est payé, dans les plafonds de la carte. Le commerçant est affiché, sans contrôle."
        },
        approved: {
          title: "Commerçants approuvés",
          body: "Payé sans confirmation chez un commerçant identifié que vous avez approuvé ; ailleurs, votre téléphone vous demande de confirmer."
        },
        confirm: {
          title: "Toujours confirmer",
          body: "Chaque paiement attend votre confirmation."
        }
      },
      approvedEmpty: "Aucun commerçant approuvé",
      approvedEmptyLead:
        "Quand vous confirmez un paiement avec cette carte, cochez « $t(card.payment.approve) » : ses prochains paiements partiront sans confirmation.",
      approvedOn: "approuvé le {{date}}",
      nameField: "Votre nom pour ce commerçant",
      nameHint: "Pour vous seulement. Laissé vide, son propre nom revient.",
      remove: "Retirer des commerçants approuvés",
      removeHint:
        "Votre passkey vous sera demandée. Ses prochains paiements demanderont à nouveau votre confirmation.",
      saveFailed: "La modification n'a pas pu être enregistrée. Réessayez.",
      pending: {
        phone:
          "Enregistré sur ce téléphone, pas encore sur les relais de votre compte : vos autres appareils ne le voient pas encore.",
        web: "Pas encore enregistré sur les relais de votre compte : cette modification sera perdue si vous quittez la page."
      },
      failed: {
        newerApp:
          "Une version plus récente de l'application a enregistré vos commerçants approuvés. Mettez l'application à jour : d'ici là, vos cartes ne paient pas.",
        unreachable:
          "Les relais de votre compte n'ont pas répondu : vos commerçants approuvés ne peuvent pas être affichés.",
        failed: "Vos commerçants approuvés n'ont pas pu être lus."
      }
    },
    probe: {
      group: "Tests (staging)",
      row: "Test de l'extension iOS",
      title: "Test de l'extension iOS",
      noPointOfSale:
        "Ce test paie l'adresse Lightning du compte : un compte 100 % cartes n'en a pas.",
      unavailable: "Ce test n'existe que dans l'application staging, sur iPhone.",
      intro:
        "Mesure si une carte peut payer depuis une notification, l'application fermée. L'extension utilise son propre portefeuille de test, jamais celui de votre compte : il ne garde que quelques sats.",
      how: "Après avoir lancé un test, verrouillez le téléphone : le résultat s'affiche dans la notification, puis ici. Les notifications doivent être autorisées.",
      launchGroup: "Lancer un test",
      profile: "Configuration du SDK",
      profiles: {
        light: "Légère",
        standard: "Standard"
      },
      modes: {
        sync: "Synchroniser",
        receive: "Recevoir 100 sats",
        pay: "Payer 1 sat à votre adresse",
        engine: "Moteur JS (sans paiement)",
        runtime: "Runtime JS (réseau, données)",
        enginePay: "Moteur JS : payer 1 sat"
      },
      balance: "Solde du portefeuille de test, lu au dernier test : {{sats}} sats",
      sent: "Notification de test envoyée",
      failed: {
        unavailable: "Ce téléphone n'a pas l'extension de notification",
        noApiKey: "Cette version de l'application n'a pas de clé API Breez",
        storage: "Le portefeuille de test n'a pas pu être préparé",
        notifications: "Autorisez les notifications pour lancer un test",
        pushToken: "Pas de jeton de notification : réseau, ou identifiants APNs absents du build",
        invoice: "Votre adresse Lightning n'a pas donné de facture",
        push: "Le service de notifications d'Expo a refusé l'envoi",
        unexpected: "Le test n'a pas pu être lancé"
      },
      notification: {
        title: "Test de l'extension",
        body: "Si ce texte reste affiché, l'extension n'a pas traité la notification."
      },
      cardText: {
        group: "Notification d'un paiement par carte",
        intro:
          "Envoie au téléphone la notification d'un paiement par carte, comme le relais : son titre doit s'afficher dans la langue de l'iPhone. « sattle.me » : l'extension ne l'a pas traitée.",
        launch: "Envoyer une notification de carte",
        sent: "Notification de carte envoyée"
      },
      resultsGroup: "Résultats",
      empty: "Aucun test pour l'instant.",
      outcome: {
        waiting: "En attente",
        none: "Pas de résultat",
        running: "En cours ({{step}})",
        stopped: "Interrompu ({{step}})",
        ok: "Réussi",
        failed: "Échec ({{step}})",
        expired: "Temps dépassé ({{step}})"
      },
      peak: "pic {{mb}} Mo",
      limit: "limite ≈ {{mb}} Mo",
      seconds: "{{s}} s",
      copyInvoice: "Copier la facture",
      invoiceCopied: "Facture copiée : payez-la depuis « Envoyer »",
      copy: "Copier les résultats",
      copied: "Résultats copiés",
      copyFailed: "La copie a échoué",
      clear: "Effacer les résultats"
    },
    wakes: {
      row: "Journal des réveils (Android)",
      title: "Journal des réveils",
      unavailable: "Ce journal n'existe que dans l'application staging, sur Android.",
      intro:
        "Chaque réveil de ce téléphone par le relais d'une carte, l'application fermée ou en arrière-plan : quand il est arrivé et jusqu'où est allé le paiement. Ni montant, ni commerçant, ni facture.",
      how: "Pour tester : balayez l'application hors des applications récentes (sans « Forcer l'arrêt »), verrouillez le téléphone, présentez la carte à une caisse, puis revenez ici et copiez le journal.",
      group: "Réveils",
      empty: "Aucun réveil pour l'instant.",
      outcome: {
        running: "En cours ({{step}})",
        stopped: "Interrompu ({{step}})",
        notTaken: "Ignoré",
        paid: "Payé",
        pending: "Envoyé, non confirmé",
        declined: "Refusé par le porteur",
        failed: "Échec ({{reason}})",
        letGo: "Abandonné ({{step}})",
        ended: "Terminé ({{step}})"
      },
      received: "tâche lancée {{s}} s après réception",
      js: "JS lancé {{s}} s avant",
      silence: "plus long silence {{s}} s",
      copy: "Copier le journal",
      copied: "Journal copié",
      copyFailed: "La copie a échoué",
      clear: "Effacer le journal",
      newer: "Ce journal a été écrit par une version plus récente de l'application.",
      failed: "Le journal n'a pas pu être lu."
    },
    socket: {
      group: "Connexion permanente",
      row: "Connexion permanente",
      caption: {
        on: "Active",
        off: "Désactivée"
      },
      intro:
        "Le téléphone garde sa propre connexion au relais de ses cartes : un paiement par carte le réveille, l'application fermée. Elle est active par défaut et consomme un peu de batterie. Désactivée, vos cartes ne paient que l'application affichée.",
      noRelay: "Aucun relais de vos cartes ne propose encore cette connexion.",
      state: {
        connecting: "connexion…",
        open: "connectée",
        waiting: "en attente",
        stopped: "arrêtée"
      },
      since: "depuis {{time}}",
      lastMessage: "dernier message il y a {{s}} s",
      opened_one: "{{count}} connexion",
      opened_other: "{{count}} connexions",
      failures_one: "{{count}} coupure",
      failures_other: "{{count}} coupures",
      lastFailure: "dernière coupure : {{code}}",
      wakes_one: "{{count}} réveil",
      wakes_other: "{{count}} réveils",
      battery: {
        applied:
          "Optimisation de batterie appliquée à l'application : Android peut couper la connexion.",
        exempt: "Optimisation de batterie désactivée pour l'application.",
        settings: "Réglages de batterie"
      },
      notice: {
        shown:
          "Android affiche une notification tant que la connexion est active. Pour la masquer, désactivez « Connexion des cartes » dans les réglages qui s'ouvrent : la connexion continue.",
        hidden: "Notification masquée : la connexion continue.",
        hide: "Masquer la notification",
        settings: "Réglages de la notification"
      },
      service: {
        running: "Service actif (démarré : {{reason}})",
        stopped: "Service arrêté",
        error: "Le service n'a pas pu démarrer ({{code}})",
        task: "Réveil non transmis à l'application ({{code}})"
      },
      failed: "La connexion permanente n'a pas pu être modifiée",
      notification: {
        channel: "Connexion des cartes",
        title: "Paiements par carte activés",
        text: "Connecté au relais de vos cartes pour payer l'application fermée",
        stop: "Arrêter"
      }
    }
  },
  /** "Point of Sale". */
  pos: {
    title: "Point de Vente",
    subtitle: "Encaissez du bitcoin sur votre compte rapidement.",
    addNote: "Ajouter une note",
    editNote: "Modifier la note « {{note}} »",
    charge: "Encaisser",
    keyboardHint: "Les touches du clavier fonctionnent aussi.",
    deleteKey: "Effacer",
    satsLabel: "{{sats}} sats",
    rateLoading: "Chargement du cours du bitcoin…",
    rateUnavailable: "Cours du bitcoin indisponible. Vérifiez votre connexion à internet.",
    share: "Partager la demande de paiement",
    shareLink: {
      button: "Partager",
      hint: "Envoie la demande de paiement au client.",
      copiedTitle: "Lien copié",
      copied: "Collez-le dans un message au client.",
      publishFailedTitle: "Lien non mis en ligne",
      shareFailedTitle: "Lien non partagé",
      publishFailed:
        "Le lien n'a pas pu être mis en ligne : le client ne le trouverait pas. Vérifiez votre connexion à internet, puis partagez-le à nouveau.",
      shareFailed: "Le lien n'a pas pu être partagé. Réessayez."
    },
    backToPos: "Revenir au Point de Vente",
    expiresIn: "Expire dans",
    waiting: "En attente du paiement",
    creating: "Création de la demande…",
    // The invoice ended; whether its Bitcoin address was paid is not known yet (explorer).
    checking: "Vérification du paiement Bitcoin…",
    checkingPayment: "Vérification du paiement…",
    // The request ended with nothing received: its invoices are still checked for 2 minutes, a
    // payment may still be reported (the plate, then the countdown of those checks).
    lateCheck: {
      title: "Demande expirée",
      body: "Un paiement envoyé à la dernière seconde peut encore arriver.",
      endsIn: "Fin de la vérification dans"
    },
    // A payment whose check lasts.
    settling: {
      title: "Paiement reçu, en vérification",
      body: "La vérification prend plus de temps que prévu. Elle continue d'elle-même."
    },
    updatingRate: "Mise à jour du cours de l'heure…",
    // Under the QR, the networks its code carries.
    networks: {
      scan: "Scannez avec votre portefeuille",
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      or: "ou"
    },
    // A sale that should offer Bitcoin and shows no address:
    // why, under the networks (charge.tsx). Only the causes the merchant can act on.
    onchainUnavailable: {
      // {{explorer}}: the merchant's node's host when the device reads it, else mempool.space
      // (explorerName).
      explorer:
        "Bitcoin onchain indisponible pour cette vente : {{explorer}} n'a pas pu vérifier l'adresse Bitcoin à temps. Le client peut payer en Lightning.",
      pool: "Bitcoin onchain indisponible pour cette vente : cet appareil n'a pas d'adresse Bitcoin prête. Il en prépare à chaque déverrouillage avec votre passkey, connecté à internet. Le client peut payer en Lightning.",
      lot: "Bitcoin onchain indisponible pour cette vente : cet appareil n'a pas d'adresse Bitcoin disponible. Le propriétaire lui en donne en déverrouillant son app avec sa passkey, connecté à internet. Le client peut payer en Lightning."
    },
    note: {
      label: "Note de l'encaissement",
      placeholder: "Table 12"
    },
    boltcard: {
      approach: "Ou approcher la carte BoltCard",
      tap: "Ou toucher ici, puis approcher la carte BoltCard",
      alert: "Approchez la carte BoltCard du haut du téléphone.",
      paying: "Paiement par carte en cours…",
      sent: "Paiement par carte envoyé, en attente de sa confirmation…",
      refusal: {
        refused: "Carte refusée",
        interrupted: "Paiement par carte interrompu",
        unread: "Carte non lue",
        noReason:
          "Le service de la carte n'a pas donné de raison. Représentez la carte, ou faites scanner le code.",
        outOfRange: "Le montant est hors des limites de la carte. Faites scanner le code.",
        noAnswer:
          "Le service de la carte n'a pas répondu. Représentez la carte, ou faites scanner le code.",
        unreadable:
          "Ce n'est pas une carte de paiement lisible ici. Représentez-la, ou faites scanner le code.",
        showCode: "Afficher le code"
      }
    },
    paid: {
      pill: "Encaissé",
      line: "Lightning · {{time}}",
      onchainLine: "Bitcoin · {{time}}",
      mixedLine: "Bitcoin + Lightning · {{time}}"
    },
    // Paid short, the owner accepted what it received.
    accepted: {
      notice: "Le propriétaire a accepté le montant reçu : la vente est payée."
    },
    unconfirmed: {
      pill: "En confirmation",
      notice:
        "Le client a payé. Le réseau doit encore confirmer la transaction, compter une trentaine de minutes."
    },
    underpaid: {
      rest: "Reste",
      received: "Reçu",
      restToPay: "Reste à payer",
      // The accessible name of a transaction's link on the chain card (UnderpaidChain); {{explorer}}:
      // the host of the merchant's node its page is on, or mempool.space (explorerName).
      txLink: "Voir la transaction {{txid}} sur {{explorer}}"
    },
    underpaidEnded: {
      pill: "Sous-payé",
      missing: "Manquant",
      received: "Paiements reçus",
      confirmed: "Confirmée",
      confirming: "En confirmation · {{done}}/{{required}}",
      notice: "Le délai de paiement est passé : il manque {{missing}} sats."
    },
    expired: {
      pill: "Expiré",
      notice: "Le client n'a pas payé dans le délai imparti. Rien n'a été encaissé.",
      recreate: "Recréer la demande"
    },
    // A payment another sale declared too.
    disputed: {
      pill: "Paiement à vérifier",
      notice:
        "Un paiement a été reçu, mais une autre vente le réclame aussi. Ne demandez pas de nouveau paiement : vérifiez-le dans « $t(navigation.destinations.wallet) ».",
      noticeMember:
        "Un paiement a été reçu, mais une autre vente le réclame aussi. Ne demandez pas de nouveau paiement : le titulaire du compte le vérifie dans « $t(navigation.destinations.wallet) »."
    },
    failed: {
      network:
        "La demande de paiement n'a pas pu être créée. Vérifiez votre connexion à internet, puis réessayez.",
      invalid: "Le service de paiement a répondu de façon inattendue. Réessayez.",
      limits: "Ce montant ne peut pas être encaissé : entre {{min}} et {{max}} sats seulement.",
      onchainOnly: {
        none: "Au-delà de {{max}} sats, ce montant ne peut être payé qu'en onchain, et les paiements onchain sont désactivés.",
        // {{explorer}}: as pos.onchainUnavailable.explorer.
        explorer:
          "Au-delà de {{max}} sats, ce montant ne peut être payé qu'en onchain, et {{explorer}} n'a pas pu vérifier l'adresse Bitcoin à temps. Réessayez.",
        pool: "Au-delà de {{max}} sats, ce montant ne peut être payé qu'en onchain, et cet appareil n'a pas d'adresse Bitcoin prête. Il en prépare à chaque déverrouillage avec votre passkey, connecté à internet.",
        lot: "Au-delà de {{max}} sats, ce montant ne peut être payé qu'en onchain, et cet appareil n'a pas d'adresse Bitcoin disponible. Le propriétaire lui en donne en déverrouillant son app avec sa passkey, connecté à internet.",
        error:
          "Au-delà de {{max}} sats, ce montant ne peut être payé qu'en onchain, et l'adresse Bitcoin de cet appareil n'a pas pu être lue. Réessayez."
      },
      retry: "Réessayer"
    },
    // The keypad or the articles: the header's segmented control.
    mode: {
      label: "Mode de saisie",
      amount: "Montant",
      articles: "Articles",
      scan: "Scanner"
    },
    articles: {
      hint: "Touchez un article pour l'ajouter",
      // Without articles, on the owner's device only (ArticlesPad.tsx).
      empty: {
        reading: "Lecture de vos articles…",
        unreadableTitle: "Articles pas encore lus",
        unreadableBody:
          "Vos articles n'ont pas pu être lus. Vérifiez la connexion à internet : une nouvelle lecture suit dans quelques minutes.",
        noneTitle: "Aucun article pour l'instant",
        noneBody:
          "Ajoutez vos articles dans « $t(navigation.destinations.articles) » : ils s'afficheront ici.",
        noneBodyScan:
          "Passez sur « $t(pos.mode.scan) » et scannez un produit pour le créer, ou ajoutez vos articles dans « $t(navigation.destinations.articles) »."
      },
      tile: "{{name}}, {{price}}",
      add: "Ajoute un article au panier",
      inBasket_one: "{{count}} dans le panier",
      inBasket_other: "{{count}} dans le panier"
    },
    basket: {
      title: "Panier",
      open: "Voir le panier",
      charge_one: "Encaisser · {{count}} article",
      charge_other: "Encaisser · {{count}} articles",
      total: "Total",
      empty: "Le panier est vide.",
      tooLarge: "Le total dépasse le montant maximal d'un encaissement.",
      scanMore: "Scanner d'autres articles",
      less: "Diminuer la quantité de {{name}}",
      more: "Augmenter la quantité de {{name}}",
      quantity_one: "Quantité : {{count}}",
      quantity_other: "Quantité : {{count}}"
    },
    // The scan of the point of sale: the camera, the article read last, the basket.
    scan: {
      aim: "Visez le code-barres d'un article",
      lead: "Chaque article scanné s'ajoute au total.",
      converted: "Prix : {{price}}, converti",
      unknown: {
        title: "Code-barres inconnu",
        body: "Aucun de vos articles n'a ce code. Rien n'a été ajouté."
      },
      // A code read before the catalogue was (ScanPad.tsx): nothing can be told of it.
      notRead: {
        title: "Articles pas encore lus",
        body: "Ce code n'a pas pu être cherché. Rien n'a été ajouté : scannez-le à nouveau dans un instant."
      }
    }
  },
  // The payer's page of a payment link (src/app/pay.tsx).
  paymentLink: {
    // The page's switch of theme, in its header: what it does.
    themeToDark: "Passer en thème sombre",
    themeToLight: "Passer en thème clair",
    // An invoice ("New invoice"): payable until its due date, no countdown.
    payableUntil: "Payable jusqu'au {{date}}",
    loading: "Chargement de la demande de paiement…",
    updatingRate: "Mise à jour du cours de l'heure…",
    openWallet: "Ouvrir mon portefeuille",
    copyInvoice: "Copier la facture",
    copied: "Facture copiée",
    copyFailed:
      "La facture n'a pas pu être copiée. Ouvrez-la dans votre portefeuille ou scannez le code.",
    retry: "Réessayer",
    notFound: {
      title: "Demande introuvable",
      notice:
        "Cette demande de paiement n'existe pas ou a expiré. Demandez un nouveau lien au commerçant.",
      invalid:
        "Ce lien est incomplet. Vérifiez qu'il a été copié en entier, ou demandez-en un nouveau au commerçant."
    },
    unreachable: {
      title: "Connexion impossible",
      notice:
        "La demande de paiement n'a pas pu être chargée. Vérifiez votre connexion à internet, puis réessayez."
    },
    // The invoice of the hour could not be asked: amount refused or unexpected answer.
    failed: {
      title: "Demande indisponible",
      notice:
        "Le service de paiement du commerçant n'a pas pu créer la facture. Réessayez dans quelques instants, ou demandez un nouveau lien au commerçant.",
      onchainOnly:
        "Ce montant ne peut être payé qu'en onchain, et cette demande ne propose pas d'adresse Bitcoin. Demandez à {{business}} un autre moyen de paiement."
    },
    copyAddress: "Copier l'adresse",
    addressCopied: "Adresse copiée",
    addressCopyFailed:
      "L'adresse n'a pas pu être copiée. Ouvrez-la dans votre portefeuille ou scannez le code.",
    amountCopied: "Montant copié",
    amountCopyFailed:
      "Le montant n'a pas pu être copié. Ouvrez la demande dans votre portefeuille ou scannez le code.",
    // What to pay, to copy; the amount's unit changes with a tap.
    receipt: {
      invoice: "Facture Lightning",
      address: "Adresse Bitcoin",
      amount: "Montant",
      copyAmount: "Copier le montant",
      invoiceCopied: "Copiée",
      addressCopied: "Copiée",
      amountCopied: "Copié",
      unit: "Unité : {{unit}}, passer en {{next}}"
    },
    unconfirmed: {
      notice:
        "Votre paiement a bien été transmis. Le réseau doit encore confirmer la transaction, compter une trentaine de minutes. Vous pouvez fermer cette page."
    },
    underpaid: {
      notice:
        "Votre paiement ({{received}} sats) ne couvre pas tout le montant. Payez le reste via Lightning ou Bitcoin.",
      noticeLightning:
        "Votre paiement ({{received}} sats) ne couvre pas tout le montant. Payez le reste via Lightning."
    },
    underpaidEnded: {
      notice:
        "Le délai de paiement est passé : votre paiement ({{received}} sats) ne couvre pas tout le montant, il manque {{missing}} sats. Contactez {{business}} pour la différence."
    },
    // What the payer's page tells of a payment being confirmed, or paid.
    details: {
      title: "Détails du paiement",
      business: "Bénéficiaire",
      method: "Mode",
      methods: {
        lightning: "Lightning",
        onchain: "Bitcoin",
        mixed: "Bitcoin + Lightning"
      },
      createdAt: "Créée le",
      transaction: "Transaction",
      transactionNumber: "Transaction {{number}}",
      // A transaction's pill ("1/3"), read aloud.
      confirmations_one: "{{count}} confirmation sur {{required}}",
      confirmations_other: "{{count}} confirmations sur {{required}}",
      confirmed: "Confirmée"
    },
    paid: {
      pill: "Payé",
      notice: "{{business}} a bien reçu votre paiement.",
      continue: "Continuer vers {{host}}"
    },
    // Paid short, the business accepted what it received.
    accepted: {
      notice: "{{business}} a accepté le montant reçu : votre paiement est réglé."
    },
    expired: {
      pill: "Expiré",
      notice:
        "Le délai de paiement est dépassé et aucun paiement n'a été reçu. Demandez un nouveau lien à {{business}}."
    },
    canceled: {
      pill: "Annulée",
      notice:
        "{{business}} a annulé cette demande de paiement : ne la payez pas. Demandez un nouveau lien à {{business}}."
    },
    // A payment another sale declared too.
    disputed: {
      pill: "À vérifier",
      notice:
        "Votre paiement a été reçu. {{business}} doit encore le vérifier : ne payez pas une seconde fois et contactez {{business}} si besoin."
    },
    // Checkout links of integrations (src/lib/payment-link/checkout.ts): the page of an online
    // shop's invoice, which sends the payer back to the shop once it is paid.
    checkout: {
      newer: {
        title: "Page à mettre à jour",
        notice:
          "Ce lien de paiement est d'un format plus récent que cette page. Rechargez la page, ou mettez à jour l'app, puis ouvrez le lien à nouveau."
      },
      continue: "Continuer",
      redirectTo: "Redirection vers {{target}}",
      // Being confirmed, the page about to go back to the shop: never "You can close this page".
      unconfirmed: {
        notice:
          "Votre paiement a bien été transmis. Le réseau doit encore confirmer la transaction, compter une trentaine de minutes."
      },
      underpaid: {
        notice:
          "Votre paiement ({{received}} sats) ne couvre pas tout le montant. Payez le reste via Bitcoin, à la même adresse."
      },
      expired: {
        notice:
          "Le délai de paiement est dépassé et aucun paiement n'a été reçu. Retournez sur la boutique de {{business}} pour en demander un nouveau.",
        late: "Le délai de paiement est dépassé : un paiement est arrivé après la fin du délai et ne compte pas pour cette commande. Contactez {{business}}."
      }
    }
  },
  // Navigation: side bar on desktop, dock on mobile, till mode.
  // The app's own lock (src/features/app-lock/).
  appLock: {
    title: "App verrouillée",
    body: "Utilisez la biométrie de cet appareil pour l'ouvrir.",
    unlock: "Déverrouiller",
    prompt: "Déverrouiller sattle.me",
    cancel: "Annuler"
  },
  navigation: {
    label: "Navigation",
    destinations: {
      // A verb, the same in the side bar as in the dock: "Point of Sale" does not fit in the dock.
      pos: "Encaisser",
      wallet: "Portefeuille",
      // The title of its screen (cards.title): the app's texts send there by that name.
      cards: "Cartes",
      articles: "Articles",
      employees: "Employés",
      integrations: "Intégrations",
      settings: "Réglages"
    },
    // An employee's "Wallet": its own operations only.
    memberWallet: "Mon activité",
    groups: {
      // Not "Charge", the name of its first row.
      sales: "Ventes",
      manage: "Gérer",
      account: "Compte"
    },
    more: "Plus",
    moreWith: "Plus, écran actuel : {{name}}",
    // "More" carrying the dot of "Charge", out of the dock.
    moreWithWait: "{{more}} ({{name}})",
    close: "Fermer",
    customize: "Personnaliser",
    customizeTitle: "Personnaliser la barre",
    done: "Terminer",
    customizeHint: "Touchez une destination pour remplacer <accent>{{name}}</accent>.",
    slotLabel: "{{name}}, emplacement {{index}}",
    swapLabel: "Mettre {{name}} dans la barre",
    currentLabel: "{{name}}, écran actuel",
    // The point of sale holding an invoice still waiting (its pending dot, side bar and dock).
    pendingLabel: "{{name}}, facture en cours",
    // Its on-chain payment seen, waiting for its confirmations (a teal dot).
    confirmingLabel: "{{name}}, paiement en confirmation",
    lock: {
      tillMode: "Passer en mode caisse",
      lockApp: "Verrouiller l'app",
      unlock: "Déverrouiller avec votre passkey",
      lockedLabel: "{{name}}, verrouillé : déverrouiller avec votre passkey",
      unlocking: "Déverrouillage…",
      preparing: "Préparation du déverrouillage…",
      failedTitle: "Déverrouillage impossible",
      otherAccount: "Cette passkey ouvre un autre compte que celui de cet appareil.",
      // The auto-lock's warning, 30 s before.
      autoLockTitle: "Verrouillage dans {{seconds}} s",
      autoLockBodyCard: "Sans activité, l'app se verrouille.",
      autoLockBody: "Sans activité, l'app repasse en mode caisse."
    },
    // The web app's screen whose code could not be fetched (ScreenLoadFailure.tsx).
    loadFailure: {
      title: "Écran non chargé",
      body: "Vérifiez votre connexion à internet, puis rechargez la page. Le rechargement prend aussi la dernière version de l'app.",
      reload: "Recharger la page"
    },
    // A new deployment of the web app while a page of it is open (WebUpdateNotice.tsx).
    update: {
      title: "Nouvelle version disponible",
      body: "La mise à jour recharge la page.",
      action: "Mettre à jour"
    }
  },
  // The team's screens.
  // "Employees".
  team: {
    invite: "Inviter un employé",
    // While the team is read (EmployeesScreen), under its loading scene.
    loading: "Chargement de vos employés…",
    // Without an employee nor an invitation: what a team does, in three steps.
    guide: {
      title: "Encaissez à plusieurs",
      lead: "Chaque employé encaisse avec son propre téléphone, pour votre commerce.",
      invite: {
        title: "Invitez",
        caption: "Choisissez son nom : l'app prépare son invitation, un QR code et un lien."
      },
      activate: {
        title: "Activez son téléphone",
        caption:
          "Votre employé scanne le QR code ou ouvre le lien : son téléphone devient une caisse de votre commerce."
      },
      sales: {
        title: "Suivez ses ventes",
        caption:
          "Elles arrivent dans votre portefeuille, à son nom ; chaque employé ne voit que les siennes."
      }
    },
    noMatch: "Aucun employé ne correspond aux filtres.",
    offline: "Connexion impossible : l'état des invitations n'a pas pu être vérifié.",
    rosterOffline:
      "Aucun relais n'a répondu : la liste des employés n'a pas pu être lue. Vérifiez la connexion, puis revenez sur cet écran.",
    rosterPartial:
      "Tous les relais n'ont pas répondu : la liste des employés peut être incomplète.",
    newer:
      "Des employés viennent d'une version plus récente de l'app : mettez l'app à jour pour les voir.",
    invitations: "Invitations en cours",
    employees: "Employés",
    columns: {
      name: "Nom",
      state: "État",
      date: "Date"
    },
    status: {
      invited: "En attente",
      joined: "Actif",
      left: "Parti",
      expired: "Expirée"
    },
    detail: {
      invited: "Lien créé le {{date}}",
      joined: "A rejoint le {{date}}",
      left: "A quitté le {{date}}",
      expired: "Lien expiré le {{date}}"
    },
    // Where an employee's device joined (its record's platform), beside its row's date.
    platform: {
      ios: "sur iPhone ou iPad",
      android: "sur Android",
      web: "dans un navigateur web"
    },
    detailWithPlatform: "{{detail}}, {{platform}}",
    actions: {
      share: "Partager le lien",
      showQr: "Afficher le lien et le code",
      renew: "Renouveler l'invitation",
      deleteInvite: "Supprimer l'invitation",
      removeAccess: "Retirer l'accès",
      removeLeft: "Retirer de la liste"
    },
    inviteSheet: {
      title: "Inviter un employé",
      lead: "Avec ce lien, un autre appareil encaisse pour votre commerce : le téléphone d'un employé ou une caisse partagée. Les paiements arrivent directement dans votre portefeuille.",
      // What the employee's device does, and what stays the owner's:
      // src/features/team/MemberShell.tsx, MEMBER_DESTINATIONS.
      can: "Cet appareil pourra",
      canItems: {
        sell: "Encaisser : montant, articles et scan",
        methods: "Faire payer en Lightning, on-chain ou par carte",
        links: "Envoyer un lien de paiement à un client",
        ownSales: "Voir ses propres ventes"
      },
      cannot: "Cet appareil ne pourra pas",
      cannotItems: {
        wallet: "Voir votre solde ni envoyer de fonds",
        settings: "Modifier vos articles, vos prix ou vos réglages",
        otherSales: "Voir les ventes des autres employés ou caisses",
        manage: "Gérer l'équipe, les cartes ou les intégrations"
      },
      revoke: "Vous pourrez retirer son accès à tout moment.",
      nameLabel: "Nom",
      namePlaceholder: "Ex. Alice ou Caisse 1",
      nameHint: "Il s'affiche dans votre portefeuille à côté de ses ventes.",
      create: "Créer le lien",
      notice:
        "Le lien sera valable 48 h et ne servira qu'une fois. Remettez-le uniquement à l'employé ou à la caisse prévus : la première personne qui l'ouvre peut prendre sa place."
    },
    qrSheet: {
      title: "Invitation pour {{name}}",
      lead: "Scannez ce code avec l'appareil qui encaissera, ou envoyez le lien à cet appareil.",
      leadDesktop:
        "Scannez ce code avec l'appareil qui encaissera pour {{business}}, ou envoyez le lien à cet appareil.",
      linkLabel: "Lien d'invitation",
      copy: "Copier le lien",
      share: "Partager le lien",
      copied: "Lien copié",
      copyFailed: "Le lien n'a pas pu être copié. Sélectionnez-le, puis copiez-le.",
      done: "Terminer",
      notice:
        "Ce lien ne sert qu'une fois et expire le {{date}}. Il est réservé à {{name}} : la première personne qui l'ouvre peut prendre sa place."
    },
    removeDialog: {
      title: "Retirer {{name}} ?",
      body: "{{name}} ne pourra plus encaisser pour {{business}}. Ses encaissements passés restent dans le portefeuille, à son nom.",
      confirm: "Retirer l'accès",
      doneTitle: "Accès retiré",
      doneBody: "{{name}} ne fait plus partie de l'équipe de {{business}}."
    },
    // An employee who left on its own ("Leave the business"): only its row is removed.
    removeLeftDialog: {
      title: "Retirer {{name}} de la liste ?",
      body: "{{name}} a quitté {{business}} le {{date}}. Ses encaissements passés restent dans le portefeuille, à son nom.",
      confirm: "Retirer de la liste",
      doneTitle: "Liste des employés mise à jour",
      doneBody: "{{name}} n'y apparaît plus."
    },
    deleteInviteDialog: {
      title: "Supprimer l'invitation de {{name}} ?",
      body: "Le lien ne fonctionnera plus : {{name}} ne pourra pas rejoindre {{business}} avec.",
      confirm: "Supprimer l'invitation",
      doneTitle: "Lien d'invitation désactivé",
      doneBody: "{{name}} ne pourra plus rejoindre {{business}}."
    },
    cancelSalesDialog: {
      unknownLead: "L'état des factures de {{name}} n'a pas pu être vérifié.",
      linksLeft:
        "{{name}} ne fait plus partie de l'équipe de {{business}}. Ses liens de paiement qui n'ont pas pu être annulés restent payables jusqu'à leur fin : leurs paiements arrivent dans le portefeuille.",
      title: "Annuler les factures de {{name}} ?",
      lead: "Des factures de {{name}} ne sont pas encore définitives.",
      links:
        "Ses liens de paiement qui n'ont encore rien reçu seront annulés : leur page n'affichera plus de code à payer. Ceux qui ont été payés seront finalisés.",
      invoices:
        "Les factures affichées sur son appareil seront annulées : son appareil cesse de les afficher dès qu'il reçoit le retrait de son accès.",
      end: "Un client qui a déjà scanné ou copié une facture peut encore la payer : le paiement arrive dans le portefeuille. L'accès de {{name}} est ensuite retiré.",
      confirm: "Annuler et retirer",
      progress: "Annulation des factures de {{name}}…"
    },
    failedTitle: "Action impossible",
    unreachableTitle: "Connexion impossible",
    errors: {
      noAccount: "Déverrouillez ce point de vente avec votre passkey pour gérer l'équipe.",
      noWebApp: "Les invitations ne sont pas encore disponibles dans cette version de l'app.",
      tooMany: "Votre équipe compte déjà 100 employés.",
      invalidName: "Indiquez le nom de l'employé.",
      unreachable:
        "L'invitation n'a pas pu être publiée. Vérifiez votre connexion à internet, puis réessayez.",
      unpublished:
        "L'employé est ajouté à la liste, mais son invitation n'a pas pu être publiée. Partagez son lien depuis la liste pour réessayer.",
      removeUnreachable:
        "Le retrait n'a pas pu être publié. Vérifiez votre connexion à internet, puis réessayez.",
      removeFailed: "Le retrait n'a pas pu être enregistré. Réessayez.",
      removalUnsaved:
        "L'accès de cet employé est coupé, mais son retrait n'a pas pu être enregistré. Réessayez : il le sera aussi à la prochaine ouverture de votre compte.",
      salesInProgress:
        "Des factures de cet employé ne sont pas encore définitives. Réessayez une fois leur version finale publiée (jusqu'à 3 h après la fin d'une facture non payée).",
      integrationPending:
        "Une intégration a des paiements pas encore définitifs. Réessayez une fois qu'ils le sont.",
      exportNewer:
        "Une version plus récente de l'app a modifié cet assistant. Mettez l'app à jour pour le changer",
      invoicesNewer:
        "Une version plus récente de l'app a modifié cet assistant. Mettez l'app à jour pour le changer"
    },
    removedNotice: "Cet appareil ne fait plus partie de l'équipe de {{business}}.",
    join: {
      title: "Rejoindre une équipe",
      scanLead: "Scannez le QR code d'invitation que vous montre le propriétaire du commerce.",
      cameraAppLead:
        "Scannez le QR code d'invitation avec l'appareil photo de votre téléphone : il ouvre cette page.",
      cameraNeeded: "L'appareil photo sert à scanner le QR code d'invitation.",
      allowCamera: "Autoriser l'appareil photo",
      openSettings: "Ouvrir les réglages",
      pasteLabel: "Ou collez le lien d'invitation",
      checking: "Lecture de l'invitation…",
      joining: "Arrivée dans l'équipe…",
      as: "Vous encaisserez pour {{business}} en tant que {{name}}.",
      rights:
        "Cet appareil créera des factures payées à {{business}}. Il n'aura accès ni au portefeuille, ni aux réglages, ni aux ventes des autres employés.",
      confirm: "Rejoindre l'équipe",
      scanAnother: "Scanner une autre invitation",
      errors: {
        invalid: "Ce n'est pas un lien d'invitation. Vérifiez qu'il a été copié en entier.",
        notFound:
          "Cette invitation n'existe pas ou a expiré. Demandez-en une nouvelle au propriétaire.",
        closed: "Cette invitation a déjà été utilisée. Demandez-en une nouvelle au propriétaire.",
        expired: "Cette invitation a expiré. Demandez-en une nouvelle au propriétaire.",
        newer:
          "Cette invitation vient d'une version plus récente de l'app. Mettez l'app à jour, puis réessayez.",
        unreachable: "Connexion impossible. Vérifiez votre connexion à internet, puis réessayez.",
        removed: "Le propriétaire a retiré cette invitation.",
        alreadySetUp:
          "Cet appareil encaisse déjà pour un commerce : il ne peut pas rejoindre une équipe."
      }
    }
  },
  // "Integrations" (docs/integrations.md): a shop's server's secret key.
  integrations: {
    create: "Créer une intégration",
    // While the integrations are read (IntegrationsScreen), under their loading scene.
    loading: "Chargement de vos intégrations…",
    // Without an integration: what one does, in three steps.
    guide: {
      title: "Encaissez sur votre boutique en ligne",
      lead: "Une intégration permet à une boutique en ligne ou à un outil de faire payer ses clients sur votre compte.",
      create: {
        title: "Créez l'intégration",
        caption:
          "Choisissez votre boutique (WooCommerce, PrestaShop…) ou le langage de votre serveur."
      },
      key: {
        title: "Donnez la clé secrète",
        caption:
          "Collez-la dans votre boutique ou confiez-la à votre développeur. Elle reste sur le serveur, jamais chez vos clients."
      },
      pay: {
        title: "Vos clients paient",
        caption:
          "À chaque commande, la boutique affiche la facture. Le paiement arrive dans votre portefeuille."
      }
    },
    noMatch: "Aucune intégration ne correspond aux filtres.",
    offline:
      "Aucun relais n'a répondu : la liste des intégrations n'a pas pu être lue. Vérifiez la connexion, puis revenez sur cet écran.",
    partial: "Tous les relais n'ont pas répondu : la liste des intégrations peut être incomplète.",
    newer:
      "Des intégrations viennent d'une version plus récente de l'app : mettez l'app à jour pour les voir.",
    columns: {
      name: "Nom",
      date: "Créée le"
    },
    created: "Créée le {{date}}",
    actions: {
      remove: "Retirer l'intégration"
    },
    // "New integration": the online shops, then the developers' SDKs; each opens its guide or its
    // package, with its key.
    createSheet: {
      title: "Nouvelle intégration",
      lead: "Faites vos factures avec une IA, encaissez sur votre boutique en ligne ou depuis votre propre site.",
      invoices: "Factures",
      shops: "Boutiques en ligne",
      developers: "Pour les développeurs",
      developersDetail_one: "SDK : {{names}} et {{count}} autre",
      developersDetail_other: "SDK : {{names}} et {{count}} autres",
      soon: "Bientôt",
      soonLabel: "{{name}} : bientôt",
      source: "Code source",
      sourceLabel: "{{name}} : code source sur GitHub",
      oneShopTitle: "Une clé pour une seule boutique",
      oneShop:
        "Les serveurs d'une même boutique partagent sa clé ; deux boutiques, jamais : leurs commandes se mélangeraient, et l'une pourrait passer pour payée par le paiement de l'autre. Pour une autre boutique, créez une autre intégration.",
      namePlaceholder: "Boutique en ligne"
    },
    sdk: {
      lead: "Le SDK {{name}} crée sur votre serveur la facture de chaque commande et vérifie son paiement.",
      package: "Le paquet",
      open: "Ouvrir sur {{site}}",
      openLabel: "Ouvrir {{name}} sur {{site}}",
      readme: "Son README explique comment l'installer et l'utiliser.",
      key: "La clé secrète"
    },
    files: {
      show: "Afficher les étapes de {{name}}",
      copyName: "Copier le nom {{name}}",
      nameCopied: "Nom copié : {{name}}",
      copy: "Copier le contenu",
      copied: "Contenu copié",
      contentCopied: "Contenu de {{name}} copié",
      copyFailed: "La copie n'a pas pu se faire. Réessayez.",
      readFailed: "Ce fichier n'a pas pu être lu dans l'app : fermez le guide, puis rouvrez-le.",
      lastLine: "Une fois collé, il finit à la ligne {{line}}.",
      pasted: "C'est collé",
      progress: "Collés : {{count}} sur {{total}}"
    },
    keyStep: {
      title: "Créer la clé de cette boutique",
      leadShop:
        "Faites-le quand le champ de la clé est ouvert dans {{platform}} : elle ne s'affichera qu'une fois.",
      leadSdk:
        "Votre serveur la lit dans une variable d'environnement, jamais dans une page web ni un dépôt de code. Elle ne s'affichera qu'une fois.",
      shopName: "Nom de la boutique",
      siteName: "Nom du site ou de l'outil",
      nameHint: "Il s'affiche dans votre portefeuille à côté de ses ventes.",
      create: "Créer la clé"
    },
    // "AI assistant": an AI app making the business's invoices with an assistant's key
    // (sattleme/mcp-server).
    assistant: {
      row: "Assistant IA",
      rowDetail: "Claude, ChatGPT… font vos factures",
      title: "Assistant IA",
      lead: "Votre assistant IA fait les factures de votre commerce, numérotées avec les vôtres, avec leur lien de paiement et leur PDF, et vous dit quand elles sont payées. Il ne dépense jamais rien.",
      hosted: {
        title: "Dans Claude, ChatGPT…",
        detail: "Prêt à l'emploi, hébergé par sattle.me",
        badge: "Le plus simple"
      },
      desktop: { title: "Dans Claude Desktop", detail: "La clé reste sur votre ordinateur" },
      selfHosted: {
        title: "Sur votre propre serveur",
        detail: "Son code open source, sur GitHub",
        badge: "Pour les experts"
      },
      hostedSteps: {
        add: {
          title: "Ajouter le connecteur",
          claude:
            "Dans Claude, ce bouton ouvre l'ajout du connecteur, déjà rempli : vérifiez-le, puis confirmez.",
          other:
            "Dans ChatGPT ou une autre application d'IA, ajoutez un connecteur personnalisé (serveur MCP) avec cette adresse, telle quelle :"
        },
        addClaude: "Ajouter à Claude",
        openChatGpt: "Ouvrir ChatGPT",
        copy: "Copier l'adresse",
        copied: "Adresse copiée",
        copyFailed: "L'adresse n'a pas pu être copiée",
        connect: {
          title: "Se connecter",
          body: "L'application ouvre une page sattle.me qui demande la clé de l'assistant. Cette page indique où elle vous ramènera : continuez seulement si c'est votre application d'IA."
        }
      },
      desktopSteps: {
        download: {
          title: "Télécharger l'extension",
          body: "Le fichier « .mcpb » de la dernière version.",
          link: "L'extension sur github.com",
          file: "Télécharger la version {{version}}"
        },
        open: {
          title: "L'ouvrir",
          body: "Ouvrez le fichier : Claude Desktop installe l'assistant et demande sa clé."
        }
      },
      selfHostedSteps: {
        install: {
          title: "Installer le serveur",
          body: "Le même serveur MCP que celui de sattle.me, sur une machine à vous ou à votre prestataire, avec Docker. Son code open source et son guide d'installation sont sur GitHub.",
          link: "sattleme/mcp-server sur github.com"
        },
        trust: {
          title: "Ce serveur voit vos factures",
          body: "Qui le fait fonctionner voit passer la clé de l'assistant et les factures qu'il fait : noms et adresses de vos clients, montants. Si vous ne lui faites plus confiance, retirez l'assistant : il s'arrête aussitôt."
        },
        add: {
          title: "Ajouter le connecteur",
          body: "Une fois le serveur en ligne, ajoutez son adresse comme connecteur personnalisé dans votre application d'IA (Claude, ChatGPT…)."
        },
        connect: {
          title: "Se connecter",
          body: "L'application ouvre une page de votre serveur qui demande la clé de l'assistant. Cette page indique où elle vous ramènera : continuez seulement si c'est votre application d'IA."
        }
      },
      keyStep: {
        title: "Créer la clé de l'assistant",
        leadHosted:
          "Faites-le quand la page sattle.me la demande : elle ne s'affichera qu'une fois.",
        leadDesktop: "Faites-le quand Claude Desktop la demande : elle ne s'affichera qu'une fois.",
        leadSelfHosted:
          "Faites-le quand la page de votre serveur la demande : elle ne s'affichera qu'une fois.",
        name: "Nom de l'assistant",
        namePlaceholder: "Claude d'Alice",
        nameHint: "Il s'affiche dans votre portefeuille à côté de ses factures.",
        permissionsTitle: "Ce que cet assistant pourra faire",
        nonePicked: "Activez au moins une autorisation pour créer la clé.",
        powerTitle: "Elle ne permet jamais de dépenser",
        power: {
          hosted: "Collez-la seulement dans la page sattle.me, jamais dans une conversation.",
          desktop: "Collez-la seulement dans Claude Desktop, jamais dans une conversation.",
          selfHosted:
            "Collez-la seulement dans la page de votre serveur, jamais dans une conversation."
        }
      },
      keySheet: {
        once: "Elle ne s'affiche qu'une fois : copiez-la maintenant. Elle ne pourra plus être affichée, même avec votre passkey. Si elle est perdue, retirez l'assistant et créez-en un autre.",
        unpublished:
          "L'assistant {{name}} n'a pas encore pu être publié sur vos relais. Il le sera au prochain déverrouillage avec votre passkey, connecté à internet : d'ici là, il ne peut rien faire.",
        secret:
          "Gardez-la secrète. Si elle a fuité, retirez l'assistant et créez-en un autre : les factures déjà faites restent payables.",
        pasteHosted:
          "Collez-la dans la page sattle.me. Demandez ensuite par exemple : « Fais une facture à Dupont SA pour 3 jours de conseil à 1200 CHF, échéance dans 30 jours. »",
        pasteDesktop:
          "Collez-la dans le champ « Assistant key » de Claude Desktop. Demandez ensuite par exemple : « Fais une facture à Dupont SA pour 3 jours de conseil à 1200 CHF, échéance dans 30 jours. »",
        pasteSelfHosted:
          "Collez-la dans la page de votre serveur. Demandez ensuite par exemple : « Fais une facture à Dupont SA pour 3 jours de conseil à 1200 CHF, échéance dans 30 jours. »",
        pasteHostedExport:
          "Collez-la dans la page sattle.me. Demandez ensuite par exemple : « Exporte les transactions du mois dernier en CSV pour ma comptable. »",
        pasteSelfHostedExport:
          "Collez-la dans la page de votre serveur. Demandez ensuite par exemple : « Exporte les transactions du mois dernier en CSV pour ma comptable. »",
        pasteDesktopExport:
          "Collez-la dans le champ « Assistant key » de Claude Desktop. Demandez ensuite par exemple : « Exporte les transactions du mois dernier en CSV pour ma comptable. »"
      },
      created: "Assistant IA · créé le {{date}}",
      createdExporting: "Assistant IA · créé le {{date}} · exporte vos transactions",
      createdExportOnly:
        "Assistant IA · créé le {{date}} · exporte vos transactions, sans factures",
      createdNoInvoices: "Assistant IA · créé le {{date}} · sans factures",
      invoicing: {
        switch: "Faire des factures",
        switchHint:
          "En l'activant, vous autorisez cet assistant IA à faire des factures au nom de votre commerce, numérotées avec les vôtres, et à lire celles qu'il a faites, avec les noms et adresses de vos clients. Ce choix ne pourra plus être changé pour cette clé."
      },
      export: {
        allow: "Autoriser l'export des transactions",
        withdraw: "Retirer l'export des transactions",
        switch: "Accès à vos ventes et envois",
        switchHint:
          "En l'activant, vous autorisez cet assistant IA à lire les ventes et les envois de votre commerce, pour les exporter. Il ne pourra jamais dépenser.",
        suspended:
          "Temporairement indisponible : l'accès des assistants IA à vos ventes et envois sera de nouveau proposé dans une prochaine version.",
        allowDialog: {
          title: "Autoriser {{name}} à exporter vos transactions ?",
          body: "{{name}} pourra lire les ventes et les envois de {{business}} enregistrés sur vos relais, et les exporter comme « $t(navigation.destinations.wallet) › $t(walletExport.open) ». Les paiements reçus sans vente (directement sur votre adresse Lightning ou votre portefeuille) n'y sont pas. Il ne pourra jamais dépenser. Si vous retirez l'autorisation, il n'exportera plus, mais une copie de sa clé faite d'ici là pourrait encore lire vos ventes enregistrées jusque-là.",
          confirm: "Autoriser"
        },
        withdrawDialog: {
          title: "Retirer l'export à {{name}} ?",
          body: "{{name}} ne pourra plus exporter les transactions de {{business}}. Ce qu'il a déjà exporté reste dans votre application d'IA.",
          confirm: "Retirer l'export"
        },
        allowedTitle: "Export autorisé",
        allowedBody: "{{name}} peut exporter vos transactions",
        withdrawnTitle: "Export retiré",
        withdrawnBody: "{{name}} ne peut plus exporter vos transactions",
        unreachable:
          "L'autorisation n'a pas pu être publiée. Vérifiez votre connexion à internet, puis réessayez",
        createFailedTitle: "Export pas encore autorisé",
        createFailed:
          "{{name}} a été créé, mais l'export n'a pas pu être autorisé. Réessayez depuis la liste des intégrations"
      },
      remove: "Retirer l'assistant",
      removeDialog: {
        title: "Retirer {{name}} ?",
        body: "{{name}} ne fera plus de facture pour {{business}}. Celles qu'il a faites restent payables jusqu'à leur échéance, et dans votre portefeuille.",
        confirm: "Retirer l'assistant",
        doneTitle: "Assistant retiré",
        doneBody: "{{name}} ne fera plus de facture."
      }
    },
    // A plugin's installation guide (guides.ts): pretix's labels as pretix shows them in French.
    // Its spaces inside guillemets, before colons and arrows, and between a number and its unit
    // ("15 minutes") are no-break spaces (in every language for arrows and units): none is left
    // alone at a line's end or start.
    guides: {
      wix: {
        editor: {
          title: "Ouvrir le code du site",
          body: "Sur un ordinateur, ouvrez l'éditeur de votre site Wix. En haut, cliquez sur « Mode développeur », puis sur le bouton qui l'active : une colonne d'icônes s'affiche à gauche de l'éditeur. Ce guide montre l'éditeur Wix ; dans Wix Studio, les écrans sont différents. Les captures montrent Wix en anglais.",
          image:
            "Le menu « Dev Mode » de l'éditeur Wix (en anglais) et son bouton « Turn on Dev Mode », encadrés."
        },
        packages: {
          title: "Ouvrir les paquets",
          body: "Dans cette colonne d'icônes, cliquez sur le cube (« Paquets et applis »). Sous « npm », cliquez sur « + Installer un paquet depuis npm ».",
          image:
            "Le panneau « Packages & Apps » de Wix (en anglais) : l'icône du cube et le lien « + Install packages from npm », encadrés."
        },
        install: {
          title: "Installer deux paquets de Wix",
          body: "Une fenêtre « Package Manager » s'ouvre, en anglais. Dans sa recherche, tapez @wix/ecom, puis cliquez sur « Install » sur la ligne @wix/ecom (et non sur une autre au nom proche). Attendez la fin, puis faites de même avec @wix/essentials. Fermez la fenêtre : les deux paquets sont listés sous « npm ». Ce sont deux outils de Wix dont le plugin a besoin.",
          image:
            "La fenêtre « Package Manager » : @wix/ecom tapé dans sa recherche, et le bouton « Install » de la ligne @wix/ecom, encadrés."
        },
        files: {
          title: "Créer les 6 fichiers",
          body: "Dans « Back-end et public » (l'icône { } de la colonne), créez chaque fichier à sa place, dans cet ordre, puis collez son contenu, copié d'ici : celui du plugin {{version}}, vérifié par l'app.",
          where: {
            js: "Back-end › + › Ajouter un fichier .js",
            file: "Back-end › + › Ajouter un fichier",
            servicePlugin: "Plug-ins de service › + › Paiement",
            servicePluginConfig: "Plug-ins de service › payment-provider › sattlemeCheckout"
          },
          how: {
            js: "Nommez-le {{name}}, puis collez son contenu. C'est le plus gros : attendez que Wix l'affiche en entier avant de cliquer ailleurs.",
            file: "Nommez-le {{name}}. Wix y met un exemple : sélectionnez tout (Ctrl+A, ou ⌘A sur un Mac), puis collez.",
            servicePlugin:
              "Nommez le plug-in sattlemeCheckout, puis « Ajouter et modifier le code » : Wix crée ce fichier et le suivant. Vérifiez que l'onglet ouvert est {{name}}, sélectionnez tout, puis collez.",
            servicePluginConfig:
              "Wix l'a créé avec sattlemeCheckout.js : ouvrez-le, sélectionnez tout, puis collez."
          },
          sharedCode:
            "Votre site a déjà son propre {{name}} ? Ne le remplacez pas : collez le contenu copié tout à la fin du vôtre, sous ses lignes.",
          sharedJobs:
            "Votre site a déjà son propre {{name}} ? Ne le remplacez pas : ajoutez la tâche du plugin (le bloc entre accolades de sa liste « jobs ») à la liste « jobs » du vôtre, séparée par une virgule.",
          image:
            "Le panneau « Backend & Public » de Wix (en anglais) : le + de « Backend », et les choix « Add .js file » et « Add file » de son menu, encadrés."
        },
        secrets: {
          title: "Ouvrir le gestionnaire de secrets",
          body: "Dans le tableau de bord du site, « Outils de développement » › « Gestionnaire de secrets ». Ajoutez un secret nommé sattleme-checkout-status-token, d'une valeur aléatoire de 32 caractères ou plus (de votre gestionnaire de mots de passe) : le mot de passe de la page d'état du plugin. Puis « Ajouter un secret » à nouveau, nommé sattleme-checkout-key.",
          image:
            "Le gestionnaire de secrets de Wix (en anglais) : « Secrets Manager » sous « Developer Tools », et le lien « + Add Secret », encadrés."
        },
        save: {
          title: "Enregistrer la clé",
          body: "Collez la clé comme valeur du secret sattleme-checkout-key, puis enregistrez. Elle reste dans ce secret : ne la tapez nulle part ailleurs dans Wix.",
          image:
            "La fenêtre d'ajout d'un secret de Wix (en anglais), nommé sattleme-checkout-key : son champ « Value » vide et son bouton « Add Secret », encadrés."
        },
        publish: {
          title: "Publier une fois",
          body: "Dans l'éditeur, cliquez une seule fois sur « Publier » : chaque clic fait une publication.",
          image: "Le haut de l'éditeur Wix (en anglais) : le bouton « Publish », encadré."
        },
        status: {
          title: "Ouvrir la page d'état",
          body: "Ouvrez l'adresse de votre site suivie de /_functions/sattlemeCheckoutStatus, puis entrez le jeton (la valeur du secret sattleme-checkout-status-token). La page montre le plugin {{version}}. Faites-le avant de connecter : elle retient l'adresse du site, où vos clients paient.",
          image: "La page d'état du plugin : son champ du jeton et son bouton, encadrés."
        },
        connect: {
          title: "Connecter le paiement",
          body: "Dans le tableau de bord, « Paramètres » › « Accepter les paiements » › « Bitcoin (Lightning / on-chain) » › « Connecter ». Premier champ : sattleme-checkout-key, le nom du secret, jamais la clé elle-même. Second champ : 15, les minutes pour payer une facture (de 1 à 60). Puis « Connecter ».",
          image:
            "Le formulaire de connexion de Wix (en anglais) : sattleme-checkout-key dans son premier champ, 15 dans le second, et le bouton « Connect », encadrés."
        },
        check: {
          title: "Tester un paiement",
          body: "Passez une commande sur votre site, sur un site de test d'abord, et choisissez « Bitcoin (Lightning / on-chain) » : la page de paiement du plugin s'ouvre.",
          image:
            "La page de paiement du plugin : « Pay with Bitcoin », le montant en sats et le temps restant pour payer."
        }
      },
      bebop: {
        open: {
          title: "Ouvrir les réglages de sattle.me",
          body: "Dans l'administration de be-BOP, ouvrez « Paiements » → « sattle.me ». S'il n'est pas dans la liste, mettez d'abord be-BOP à jour.",
          image:
            "Capture d'écran de be-BOP : le menu de l'administration, « sattle.me » encadré sous « Payment Settings »"
        },
        save: {
          title: "Coller la clé et enregistrer",
          body: "Collez la clé dans « Clé d’intégration (app sattle.me > Intégrations) ». Pour accepter aussi les paiements onchain, cochez « Accepter aussi les paiements on-chain (méthode Bitcoin) ». Puis cliquez sur « Enregistrer ».",
          image:
            "Capture d'écran de be-BOP : les réglages de sattle.me, le champ « Integration key », la case « Also take on-chain payments » et le bouton « Save » encadrés"
        },
        test: {
          title: "Tester la connexion",
          body: "Cliquez sur « Tester la connexion » : be-BOP lit l'intégration avec sa clé, sans faire de facture, et affiche « Connexion réussie. Les identifiants sattle.me fonctionnent. » Si les paiements onchain sont cochés, il vérifie aussi que l'intégration a des adresses Bitcoin : cette app lui en donne à sa création, puis à chaque déverrouillage avec votre passkey, connecté à internet. Si le test échoue, vérifiez la clé, déverrouillez cette app, puis testez de nouveau.",
          image:
            "Capture d'écran de be-BOP : les réglages de sattle.me, le bouton « Test connection » encadré"
        },
        prefer: {
          title: "Mettre sattle.me en premier",
          body: "Si un autre processeur prend déjà les paiements Lightning ou onchain de votre boutique, ouvrez « Paramètres » → « Général ». Dans « Préférences des processeurs de paiement », choisissez « sattleme » pour « Processeur Lightning préféré » et « sattleme-onchain » pour « Processeur Bitcoin on-chain préféré », puis cliquez sur « Mettre à jour » en bas de la page.",
          image:
            "Capture d'écran de be-BOP : « Payment processor preferences », sattleme-onchain et sattleme choisis et encadrés"
        },
        check: {
          title: "Vérifier votre boutique",
          body: "À l'étape du paiement, vos clients peuvent maintenant choisir « Lightning » comme « Mode de paiement », et aussi « BTC on-chain » si vous avez coché les paiements onchain : be-BOP le propose à partir de 10 000 sats. Une fois la commande passée, ils la paient en scannant un QR code. Un paiement onchain paie la commande après 3 confirmations, environ 30 minutes, davantage avec des frais bas. Chaque paiement est un vrai paiement en bitcoin, vers votre portefeuille.",
          image:
            "Capture d'écran d'une boutique be-BOP : « Lightning » comme « Payment method » à l'étape du paiement"
        }
      },
      pretix: {
        plugins: {
          title: "Ouvrir les plugins de l'événement",
          body: "Dans le backoffice de pretix, ouvrez votre événement, puis, dans son menu, « Paramètres » → « Plugins ».",
          image:
            "Capture d'écran de pretix : le menu de l'événement, « Plugins » encadré sous « Settings »"
        },
        enable: {
          title: "Activer le plugin",
          body: "Cherchez « sattle.me », puis cliquez sur « Activer ».",
          image:
            "Capture d'écran de pretix : les plugins, filtrés par « sattle.me », son bouton « Enable » encadré"
        },
        open: {
          title: "Ouvrir ses réglages",
          body: "Dans « Paramètres » → « Paiement », cliquez sur « Paramètres » à côté de « Bitcoin (sattle.me) ».",
          image:
            "Capture d'écran de pretix : les moyens de paiement, le bouton « Settings » de « Bitcoin (sattle.me) » encadré"
        },
        save: {
          title: "Coller la clé et enregistrer",
          body: "Cochez « Activer le mode de paiement », collez la clé dans « Clé d'intégration », puis cliquez sur « Enregistrer » en bas de la page : pretix la vérifie, puis ne l'affiche plus. « Temps pour payer » est le temps qu'a le client pour payer une facture : de 1 à 60 minutes, 15 par défaut.",
          image:
            "Capture d'écran de pretix : les réglages de Bitcoin (sattle.me), la case « Enable payment method » et le champ « Integration key » encadrés"
        },
        channels: {
          title: "Choisir les canaux de vente",
          body: "Sur la même page, « Restreindre à des canaux de vente spécifiques » dit où vos clients peuvent payer en bitcoin : « Boutique en ligne » par défaut. Cochez les autres canaux voulus, puis cliquez sur « Enregistrer ».",
          image:
            "Capture d'écran de pretix : « Restrict to specific sales channels », sa case « Online shop » encadrée"
        },
        check: {
          title: "Vérifier votre boutique",
          body: "À l'étape du paiement, vos clients peuvent maintenant choisir « Bitcoin », puis scanner un QR code : en Lightning sous environ 1 000 sats, en Lightning ou onchain au-dessus. Un paiement onchain apparaît en confirmation en moins d'une minute et paie la commande après 3 confirmations, environ 30 minutes, davantage avec des frais bas. Quand mempool.space tarde à répondre, une facture peut être faite en Lightning seulement. Même en mode test de pretix, chaque paiement est un vrai paiement en bitcoin, vers votre portefeuille.",
          image: "Capture d'écran d'une boutique pretix : « Bitcoin » à l'étape du paiement"
        }
      },
      nopcommerce: {
        download: {
          title: "Télécharger le plugin",
          body: "Téléchargez le plugin : une archive .zip, à garder telle quelle, sans la décompresser. Il demande nopCommerce 5.00.",
          link: "Ouvrir le marketplace de nopCommerce",
          file: "Télécharger la version {{version}}"
        },
        plugins: {
          title: "Ouvrir les plugins locaux",
          body: "Dans l'administration de nopCommerce, ouvrez « Configuration » → « Local plugins ».",
          image:
            "Capture d'écran de nopCommerce : le menu de l'administration, « Local plugins » encadré"
        },
        upload: {
          title: "Envoyer l'archive",
          body: "Cliquez sur « Upload plugin or theme », choisissez l'archive, puis cliquez sur « Upload plugin or theme » dans la fenêtre qui s'ouvre.",
          image:
            "Capture d'écran de nopCommerce : la fenêtre « Upload plugin or theme », l'archive choisie, son bouton « Upload plugin or theme » encadré"
        },
        restart: {
          title: "Redémarrer nopCommerce",
          body: "Cliquez sur « Restart application to apply changes » en haut de la page, puis attendez que la page s'affiche de nouveau : votre boutique ne répond pas pendant que nopCommerce redémarre. Le plugin n'apparaît dans la liste qu'après ce redémarrage.",
          image:
            "Capture d'écran de nopCommerce : « Local plugins », son bouton « Restart application to apply changes » encadré"
        },
        install: {
          title: "Installer le plugin",
          body: "Dans la liste, trouvez « Bitcoin (sattle.me) », dans le groupe « Payment methods », cliquez sur « Install », puis de nouveau sur « Restart application to apply changes ».",
          image:
            "Capture d'écran de nopCommerce : le plugin Bitcoin (sattle.me) dans la liste, son bouton « Install » encadré"
        },
        open: {
          title: "Ouvrir ses réglages",
          body: "Une fois nopCommerce redémarré, cliquez sur « Configure » sous « Bitcoin (sattle.me) ». Vous y accédez aussi par « Configuration » → « Payment methods ».",
          image:
            "Capture d'écran de nopCommerce : le plugin Bitcoin (sattle.me), installé, son bouton « Configure » encadré"
        },
        save: {
          title: "Coller la clé et enregistrer",
          body: "Cochez « Enabled », collez la clé dans « Integration key », puis cliquez sur « Save » en bas de la page : le plugin la vérifie, puis ne l'affiche plus. « Time to pay (minutes) » est le temps qu'a le client pour payer une facture : de 1 à 60 minutes, 15 par défaut.",
          image:
            "Capture d'écran de nopCommerce : les réglages de Bitcoin (sattle.me), la case « Enabled » et le champ « Integration key » encadrés"
        },
        check: {
          title: "Vérifier votre boutique",
          body: "À l'étape du paiement, vos clients peuvent maintenant choisir « Bitcoin ». Une fois la commande confirmée, ils la paient sur une page de votre boutique en scannant un QR code : en Lightning sous environ 1 000 sats, en Lightning ou onchain au-dessus. Un paiement onchain paie la commande après 3 confirmations, environ 30 minutes, davantage avec des frais bas. Les paiements sont aussi vérifiés par les tâches planifiées de nopCommerce, qui doivent pouvoir joindre l'URL de votre boutique. Chaque paiement est un vrai paiement en bitcoin, vers votre portefeuille.",
          image: "Capture d'écran d'une boutique nopCommerce : « Bitcoin » à l'étape du paiement"
        },
        autoCancel: {
          title: "Exclure Bitcoin de l'annulation automatique",
          body: "Si « Enable auto-canceling of unpaid orders » est cochée (« Configuration » → « Settings » → « Order settings »), ajoutez « Bitcoin (sattle.me) » à ses « Excluded payment methods », pour qu'une commande dont le paiement est en confirmation ne soit pas annulée."
        }
      },
      woocommerce: {
        download: {
          title: "Télécharger le plugin",
          body: "Téléchargez le fichier du plugin, sattleme-for-woocommerce-….zip, et gardez-le tel quel, sans le décompresser. Le plugin demande WordPress 7.0, WooCommerce 11.1 et PHP 8.2, ou plus récents.",
          link: "Ouvrir la page GitHub du plugin",
          file: "Télécharger la version {{version}}"
        },
        upload: {
          title: "Envoyer le fichier",
          body: "Dans l'administration de WordPress, ouvrez « Extensions » → « Ajouter une extension », cliquez sur « Téléverser une extension » en haut de la page, choisissez le fichier, puis cliquez sur « Installer maintenant ».",
          image:
            "Capture d'écran de WordPress : « Upload Plugin » et le fichier choisi, ses boutons « Upload Plugin » et « Install Now » encadrés"
        },
        activate: {
          title: "Activer le plugin",
          body: "Une fois le plugin installé, cliquez sur « Activer l’extension ».",
          image:
            "Capture d'écran de WordPress : le plugin installé, son bouton « Activate Plugin » encadré"
        },
        open: {
          title: "Ouvrir ses réglages",
          body: "Dans « Extensions », sous « sattle.me for WooCommerce », cliquez sur « Réglages ». Vous y accédez aussi par « WooCommerce » → « Réglages » → « Paiements », sous le nom « sattle.me (Bitcoin) ».",
          image:
            "Capture d'écran de WordPress : le plugin sattle.me for WooCommerce dans la liste des extensions, son lien « Settings » encadré"
        },
        save: {
          title: "Coller la clé et enregistrer",
          body: "Cochez « Accepter les paiements en bitcoin avec sattle.me », collez la clé dans « Clé d’intégration », puis cliquez sur « Enregistrer les modifications » en bas de la page : le plugin vérifie la clé, puis ne l'affiche plus. La page indique alors « Connecté à », suivi du nom de votre entreprise. « Délai de paiement » est le temps qu'a le client pour payer une facture : de 1 à 60 minutes, 15 par défaut.",
          image:
            "Capture d'écran de WordPress : les réglages de sattle.me (Bitcoin) enregistrés, « Connected to » et la case cochée encadrés"
        },
        check: {
          title: "Vérifier votre boutique",
          body: "À l'étape du paiement, vos clients peuvent maintenant payer en bitcoin, avec le logo de sattle.me. Une fois la commande passée, ils la paient sur une page de votre boutique en scannant un QR code : en Lightning sous environ 1 000 sats, en Lightning ou onchain au-dessus. Un paiement onchain paie la commande après 3 confirmations, environ 30 minutes, davantage avec des frais bas. Le plugin vérifie aussi les paiements chaque minute, même une fois la page de paiement fermée, grâce aux tâches planifiées de WordPress (WP-Cron) : sur une boutique peu visitée, faites-les lancer chaque minute par le cron de votre serveur, comme l'explique le README du plugin. Chaque paiement est un vrai paiement en bitcoin, vers votre portefeuille.",
          image:
            "Capture d'écran d'une boutique WooCommerce : le paiement en bitcoin à l'étape du paiement"
        }
      },
      grandnode: {
        download: {
          title: "Télécharger le plugin",
          body: "Téléchargez l'archive du plugin, Payments.Sattleme-….zip, et gardez-la telle quelle, sans la décompresser. Le plugin demande GrandNode 2.4.",
          link: "Ouvrir la page GitHub du plugin",
          file: "Télécharger la version {{version}}"
        },
        plugins: {
          title: "Ouvrir les plugins locaux",
          body: "Dans l'administration de GrandNode, ouvrez « Plugins » → « Local plugins ».",
          image:
            "Capture d'écran de GrandNode : le menu « Plugins » de l'administration, « Local plugins » encadré"
        },
        upload: {
          title: "Envoyer l'archive",
          body: "Cliquez sur « Upload » en haut de la page, choisissez l'archive, puis cliquez sur « Upload » dans la fenêtre qui s'ouvre. GrandNode affiche « Plugin uploaded », puis s'arrête pour redémarrer : rechargez la page dans votre navigateur (pas avec « Reload list of plugins », qui arrête de nouveau GrandNode) jusqu'à ce que la liste des plugins réapparaisse ; votre boutique ne répond pas pendant ce temps. Si elle ne répond toujours pas après quelques minutes, redémarrez GrandNode (son service ou son conteneur).",
          image:
            "Capture d'écran de GrandNode : la fenêtre « Upload », l'archive choisie, son bouton « Upload » encadré"
        },
        install: {
          title: "Installer le plugin",
          body: "Dans la liste, trouvez « Bitcoin (sattle.me) », dans le groupe « Payment methods » : son étiquette « Installed » reste rouge tant qu'il n'est pas installé. Cliquez sur « Install » : GrandNode redémarre de nouveau. Rechargez la page de la même façon.",
          image:
            "Capture d'écran de GrandNode : le plugin Bitcoin (sattle.me) dans la liste, son bouton « Install » encadré"
        },
        open: {
          title: "Ouvrir ses réglages",
          body: "Une fois « Configure » affiché pour « Bitcoin (sattle.me) », cliquez dessus. Vous accédez aussi à ses réglages par « Configuration » → « Payment » → « Payment methods », sous le nom « Bitcoin ».",
          image:
            "Capture d'écran de GrandNode : le plugin Bitcoin (sattle.me), installé, son bouton « Configure » encadré"
        },
        save: {
          title: "Coller la clé et enregistrer",
          body: "Activez « Enabled », collez la clé dans « Integration key », puis cliquez sur « Save » en haut de la page : le plugin la vérifie, puis ne l'affiche plus. « Time to pay (minutes) » est le temps qu'a le client pour payer une facture : de 1 à 60 minutes, 15 par défaut. Dans une administration en français, le plugin nomme ces réglages « Activé », « Clé d'intégration » et « Délai de paiement (minutes) ».",
          image:
            "Capture d'écran de GrandNode : les réglages de Bitcoin (sattle.me), « Enabled », le champ « Integration key » et « Save » encadrés"
        },
        check: {
          title: "Vérifier votre boutique",
          body: "À l'étape du paiement, vos clients peuvent maintenant payer en bitcoin, avec le logo de sattle.me. Une fois la commande confirmée, ils la paient sur une page de votre boutique en scannant un QR code : en Lightning sous environ 1 000 sats, en Lightning ou onchain au-dessus. Un paiement onchain paie la commande après 3 confirmations, environ 30 minutes, davantage avec des frais bas. GrandNode vérifie aussi les paiements chaque minute, même une fois la page de paiement fermée. Chaque paiement est un vrai paiement en bitcoin, vers votre portefeuille.",
          image:
            "Capture d'écran d'une boutique GrandNode : le paiement en bitcoin à l'étape du paiement"
        }
      },
      smartstore: {
        download: {
          title: "Télécharger le plugin",
          body: "Téléchargez le paquet du plugin, Smartstore.Module.Sattleme.Bitcoin.….zip, et gardez-le tel quel, sans le décompresser. Le plugin demande Smartstore 6.4.",
          link: "Ouvrir la page GitHub du plugin",
          file: "Télécharger la version {{version}}"
        },
        plugins: {
          title: "Ouvrir les plugins",
          body: "Dans l'administration de Smartstore, ouvrez « Plugins » → « Manage plugins ».",
          image:
            "Capture d'écran de Smartstore : le menu « Plugins » de l'administration, « Manage plugins » encadré"
        },
        upload: {
          title: "Envoyer le paquet",
          body: "Cliquez sur « Upload plugin » en haut de la page et choisissez le paquet : Smartstore l'envoie aussitôt et confirme qu'il est envoyé et décompressé.",
          image:
            "Capture d'écran de Smartstore : la page des plugins, son bouton « Upload plugin » encadré"
        },
        reload: {
          title: "Recharger la liste des plugins",
          body: "Cliquez sur « Edit » → « Reload list of plugins ». Smartstore redémarre : attendez que la page s'affiche de nouveau, votre boutique ne répond pas pendant ce temps.",
          image:
            "Capture d'écran de Smartstore : le menu « Edit », « Reload list of plugins » encadré"
        },
        install: {
          title: "Installer le plugin",
          body: "Dans la liste, trouvez « Bitcoin (sattle.me) » et cliquez sur « Install » : Smartstore met son installation en attente.",
          image:
            "Capture d'écran de Smartstore : le plugin Bitcoin (sattle.me) dans la liste, son bouton « Install » encadré"
        },
        execute: {
          title: "Lancer l'installation",
          body: "Cliquez sur « Execute tasks » en haut de la page, puis sur « OK ». Smartstore redémarre de nouveau et installe le plugin : attendez que la page s'affiche de nouveau.",
          image:
            "Capture d'écran de Smartstore : la page des plugins, son bouton « Execute tasks » encadré"
        },
        open: {
          title: "Ouvrir ses réglages",
          body: "Sous « Bitcoin (sattle.me) », cliquez sur le bouton en forme de roue dentée, puis sur « Configure ». Vous accédez aussi à ses réglages par « Configuration » → « Payment methods », sous le nom « Bitcoin ».",
          image:
            "Capture d'écran de Smartstore : le plugin Bitcoin (sattle.me), installé, sa roue dentée et « Configure » encadrés"
        },
        save: {
          title: "Coller la clé et enregistrer",
          body: "Collez la clé dans « Integration key », puis cliquez sur « Save » en haut de la page : le plugin la vérifie, puis ne l'affiche plus. « Time to pay (minutes) » est le temps qu'a le client pour payer une facture : de 1 à 60 minutes, 15 par défaut. Dans une administration en français, le plugin nomme ces réglages « Clé d'intégration » et « Délai de paiement (minutes) ».",
          image:
            "Capture d'écran de Smartstore : les réglages de Bitcoin (sattle.me), le champ « Integration key » et « Save » encadrés"
        },
        activate: {
          title: "Activer le moyen de paiement",
          body: "Ouvrez « Configuration » → « Payment methods » et cliquez sur « Activate » sous « Bitcoin » : votre boutique ne le propose au paiement qu'une fois activé.",
          image:
            "Capture d'écran de Smartstore : les moyens de paiement, le bouton « Activate » de Bitcoin encadré"
        },
        timezone: {
          title: "Régler le fuseau horaire de votre boutique",
          body: "Dans « Configuration » → « Settings », choisissez votre « Default store time zone » et enregistrez : la page de paiement indique alors jusqu'à quand payer dans votre fuseau horaire. Sans lui, Smartstore prend celui de son serveur, souvent UTC."
        },
        check: {
          title: "Vérifier votre boutique",
          body: "À l'étape du paiement, vos clients peuvent maintenant choisir « Bitcoin ». Une fois la commande confirmée, ils la paient sur une page de votre boutique en scannant un QR code : en Lightning sous environ 1 000 sats, en Lightning ou onchain au-dessus. Un paiement onchain paie la commande après 3 confirmations, environ 30 minutes, davantage avec des frais bas. Smartstore vérifie aussi les paiements chaque minute, même une fois la page de paiement fermée, tant que ses tâches planifiées atteignent l'adresse de votre boutique. Chaque paiement est un vrai paiement en bitcoin, vers votre portefeuille.",
          image: "Capture d'écran d'une boutique Smartstore : « Bitcoin » à l'étape du paiement"
        }
      },
      prestashop: {
        download: {
          title: "Télécharger le module",
          body: "Téléchargez le fichier du module, sattleme.zip, et gardez-le tel quel, sans le décompresser. Le module demande PrestaShop 9.0, 9.1 ou 9.2, avec PHP 8.2 à 8.5.",
          link: "Ouvrir la page GitHub du module",
          file: "Télécharger la version {{version}}"
        },
        upload: {
          title: "Ouvrir le gestionnaire de modules",
          body: "Dans le back-office de PrestaShop, ouvrez « Modules » → « Module Manager », puis cliquez sur « Upload a module » en haut de la page.",
          image:
            "Capture d'écran de PrestaShop : le gestionnaire de modules, son bouton « Upload a module » encadré"
        },
        drop: {
          title: "Envoyer le fichier",
          body: "Déposez le fichier dans la fenêtre, ou cliquez sur « select file » et choisissez-le : PrestaShop envoie le module et l'installe aussitôt.",
          image:
            "Capture d'écran de PrestaShop : la fenêtre « Upload a module », sa zone pour le fichier encadrée"
        },
        open: {
          title: "Ouvrir ses réglages",
          body: "Quand PrestaShop affiche « Module installed! », cliquez sur « Configure ». Vous retrouvez aussi ses réglages dans « Modules » → « Module Manager », sous « sattle.me ».",
          image:
            "Capture d'écran de PrestaShop : « Module installed! », son bouton « Configure » encadré"
        },
        save: {
          title: "Coller la clé et enregistrer",
          body: "Activez « Accept bitcoin payments », collez la clé dans « Integration key », puis cliquez sur « Save » en bas de la page : le module vérifie la clé, puis ne l'affiche plus. La page indique alors « The integration key of », suivi du nom de votre entreprise. « Time to pay » est le temps qu'a le client pour payer une facture : de 1 à 60 minutes, 15 par défaut. Dans un back-office en français, le module nomme ces réglages « Accepter les paiements en bitcoin », « Clé d'intégration » et « Délai de paiement ».",
          image:
            "Capture d'écran de PrestaShop : les réglages de sattle.me, « Accept bitcoin payments » et le champ « Integration key » encadrés"
        },
        cron: {
          title: "Programmer les vérifications en arrière-plan",
          body: "Sous « Background checks », la page donne une ligne pour la crontab de votre serveur : ajoutez-la à la crontab de l'utilisateur du serveur web, ou comme tâche cron dans le panneau de votre hébergement, pour qu'elle s'exécute chaque minute. Le module vérifie alors les paiements chaque minute, même une fois la page de paiement fermée. Tant qu'elle ne s'est pas exécutée, la page indique « The background checks never ran: set up the cron. ». Dans un back-office en français, le module nomme cette partie « Vérifications en arrière-plan ».",
          image:
            "Capture d'écran de PrestaShop : les réglages de sattle.me enregistrés, la ligne de crontab sous « Background checks » encadrée"
        },
        check: {
          title: "Vérifier votre boutique",
          body: "À l'étape du paiement, vos clients peuvent maintenant choisir « Pay with bitcoin » (« Payer en bitcoin » dans une boutique en français). Une fois la commande passée, ils la paient sur une page de votre boutique en scannant un QR code : en Lightning sous environ 1 000 sats, en Lightning ou onchain au-dessus. Un paiement onchain paie la commande après 3 confirmations, environ 30 minutes, davantage avec des frais bas. Chaque paiement est un vrai paiement en bitcoin, vers votre portefeuille.",
          image:
            "Capture d'écran d'une boutique PrestaShop : « Pay with bitcoin » à l'étape du paiement"
        }
      },
      magento: {
        install: {
          title: "Installer le module",
          body: "Sur le serveur de votre Magento, depuis le dossier racine de Magento et avec l'utilisateur du serveur web, installez le module depuis Packagist avec Composer, puis activez-le avec ces commandes. Le module demande Magento Open Source 2.4.7, 2.4.8 ou 2.4.9, avec PHP 8.2 à 8.5. En mode développeur, « setup:di:compile » et « setup:static-content:deploy » ne sont pas nécessaires.",
          link: "Ouvrir la page Packagist du module"
        },
        open: {
          title: "Ouvrir ses réglages",
          body: "Dans l'admin de Magento, ouvrez « Stores » → « Configuration », puis « Sales » → « Payment Methods », et dépliez « Bitcoin (sattle.me) ».",
          image:
            "Capture d'écran de l'admin de Magento : les moyens de paiement, « Bitcoin (sattle.me) » encadré"
        },
        save: {
          title: "Coller la clé et enregistrer",
          body: "Réglez « Enabled » sur « Yes », collez la clé dans « Integration key », puis cliquez sur « Save Config » en haut de la page : le module vérifie la clé, puis ne l'affiche plus. « Connected to » affiche alors le nom de votre entreprise. « Time to pay (minutes) » est le temps qu'a le client pour payer une facture : de 1 à 60 minutes, 15 par défaut. Dans un admin en français, le module nomme ces réglages « Activé », « Clé d'intégration », « Connecté à » et « Temps pour payer (minutes) ».",
          image:
            "Capture d'écran de l'admin de Magento : les réglages de Bitcoin (sattle.me), « Enabled » et le champ « Integration key » encadrés"
        },
        cron: {
          title: "Vérifier le cron de Magento",
          body: "Le module vérifie les paiements chaque minute, même une fois la page de paiement fermée, grâce au cron de Magento, qui annule aussi les commandes restées impayées. Un Magento en production le fait déjà tourner ; si ce n'est pas le cas du vôtre, installez-le depuis le dossier racine de Magento, avec l'utilisateur du serveur web, avec cette commande."
        },
        check: {
          title: "Vérifier votre boutique",
          body: "À l'étape du paiement, vos clients peuvent maintenant choisir « Bitcoin ». Une fois la commande passée, ils la paient sur une page de votre boutique en scannant un QR code : en Lightning sous environ 1 000 sats, en Lightning ou onchain au-dessus. Un paiement onchain paie la commande après 3 confirmations, environ 30 minutes, davantage avec des frais bas. Chaque paiement est un vrai paiement en bitcoin, vers votre portefeuille.",
          image: "Capture d'écran d'une boutique Magento : « Bitcoin » à l'étape du paiement"
        }
      }
    },
    keySheet: {
      title: "Clé de {{name}}",
      keyLabel: "Clé secrète",
      once: "Elle ne s'affiche qu'une fois : copiez-la maintenant. Elle ne pourra plus être affichée, même avec votre passkey. Si elle est perdue, retirez l'intégration et créez-en une autre.",
      unpublished:
        "L'intégration {{name}} n'a pas encore pu être publiée sur vos relais. Elle le sera au prochain déverrouillage avec votre passkey, connecté à internet : d'ici là, son serveur ne la trouve pas.",
      secret:
        "Gardez-la secrète, sur les serveurs de cette boutique seulement : jamais dans une page web, dans une app ni pour une autre boutique. Elle ne permet pas de dépenser vos fonds. Si elle a fuité, retirez l'intégration et créez-en une autre.",
      copy: "Copier la clé",
      copied: "Clé copiée",
      copyFailed: "La clé n'a pas pu être copiée. Sélectionnez-la, puis copiez-la.",
      done: "Terminer"
    },
    removeDialog: {
      title: "Retirer {{name}} ?",
      body: "Sa clé ne pourra plus créer de demande de paiement pour {{business}}. Une demande déjà affichée reste payable jusqu'à sa fin, et ses ventes passées restent dans le portefeuille.",
      confirm: "Retirer l'intégration",
      doneTitle: "Intégration retirée",
      doneBody: "La clé de {{name}} ne crée plus de demande de paiement."
    },
    pendingDialog: {
      title: "{{name}} a des paiements en cours",
      unknownTitle: "Paiements de {{name}} non vérifiés",
      lead: "Attendez que les paiements de {{name}} soient définitifs avant de la retirer, pour que chacune de ses ventes reste à son nom.",
      unknownLead:
        "Impossible de vérifier si les paiements de {{name}} sont définitifs. Attendez qu'ils le soient avant de la retirer, pour que chacune de ses ventes reste à son nom.",
      open_one: "{{count}} demande de paiement encore ouverte, jusqu'à {{time}} au plus tard.",
      open_other: "{{count}} demandes de paiement encore ouvertes, jusqu'à {{time}} au plus tard.",
      confirming_one:
        "{{count}} paiement Bitcoin en attente de confirmation (3 confirmations, une trentaine de minutes).",
      confirming_other:
        "{{count}} paiements Bitcoin en attente de confirmation (3 confirmations, une trentaine de minutes).",
      end: "Réessayez ensuite.",
      forceNote:
        "Si vous ne pouvez pas attendre (sa clé a fuité, par exemple), retirez-la quand même : ses paiements arriveront toujours dans votre portefeuille, mais ceux qu'elle n'a pas vus avant son retrait ne seront pas à son nom.",
      force: "Retirer quand même",
      retry: "Réessayer",
      close: "Fermer"
    },
    failedTitle: "Action impossible",
    unreachableTitle: "Connexion impossible",
    errors: {
      noAccount: "Déverrouillez ce point de vente avec votre passkey pour gérer les intégrations.",
      tooMany: "Votre compte a déjà {{max}} intégrations. Retirez-en une pour en créer une autre.",
      tooManyAssistants:
        "Votre compte a déjà {{max}} assistants. Retirez-en un pour en créer un autre.",
      invalidName: "Indiquez le nom de l'intégration.",
      unreachable:
        "L'intégration n'a pas pu être publiée. Vérifiez votre connexion à internet, puis réessayez.",
      removeUnreachable:
        "Le retrait n'a pas pu être publié. Vérifiez votre connexion à internet, puis réessayez.",
      removeFailed: "Le retrait n'a pas pu être enregistré. Réessayez.",
      removalUnsaved:
        "La clé de cette intégration ne crée plus de demande de paiement, mais son retrait n'a pas pu être enregistré. Réessayez : il le sera aussi à la prochaine ouverture de votre compte.",
      exportNewer:
        "Une version plus récente de l'app a modifié cet assistant. Mettez l'app à jour pour le changer"
    }
  },
  // "Items": the business's catalogue, the owner's only.
  articles: {
    add: "Ajouter un article",
    loading: "Chargement de vos articles…",
    // Without an article: what the catalogue does, in three steps.
    guide: {
      title: "Vendez en quelques touches",
      lead: "Créez vos boissons, plats et desserts une fois : ils s'affichent dans votre caisse et dans celle de vos employés.",
      create: {
        title: "Créez vos articles",
        caption:
          "Un nom, un prix, une photo. Scannez un code-barres pour remplir la fiche plus vite.",
        // Where nothing scans (a desktop, the web app): the caption without the scan.
        captionNoScan: "Un nom, un prix, une photo."
      },
      tap: {
        title: "Touchez-les à la caisse",
        // On every device: the till may be another one, a phone of
        // the owner's or an employee's; only the apps scan (ScanPad.tsx).
        caption:
          "Passez sur « $t(pos.mode.articles) » : chaque touche ajoute l'article au panier. Dans l'app sur téléphone, scannez aussi leur code-barres."
      },
      cash: {
        title: "Encaissez le panier",
        caption: "Le total se calcule tout seul : votre client scanne le QR code et paie."
      }
    },
    offline: "Aucun relais n'a répondu. Vérifiez la connexion, puis revenez sur cet écran.",
    newer:
      "Des articles viennent d'une version plus récente de l'app : mettez l'app à jour pour les voir.",
    openHint: "Ouvre l'article pour le modifier ou le supprimer.",
    saved: {
      title: "Article enregistré",
      body: "{{name}} est dans vos articles."
    },
    changed: {
      title: "Article modifié",
      body: "{{name}} est à jour."
    },
    removed: {
      title: "Article supprimé",
      body: "{{name}} n'est plus dans vos articles."
    },
    removeDialog: {
      title: "Supprimer {{name}} ?",
      body: "L'article disparaît de vos articles, sur tous vos appareils. Cette action est définitive.",
      confirm: "Supprimer l'article"
    },
    form: {
      title: "Nouvel article",
      editTitle: "Modifier l'article",
      scan: "Scanner",
      addPhoto: "Ajouter une photo",
      changePhoto: "Changer la photo",
      preparingPhoto: "Préparation de la photo…",
      dropPhoto: "Glissez une photo ici",
      choosePhoto: "ou choisir un fichier",
      photoMenu: "Photo de l'article",
      takePhoto: "Prendre une photo",
      pickPhoto: "Choisir parmi vos photos",
      nameLabel: "Nom",
      namePlaceholder: "Nom de l'article",
      priceLabel: "Prix",
      priceInvalid: "Saisissez un prix comme 4,80",
      descriptionLabel: "Description",
      descriptionPlaceholder: "Ingrédients, format, allergènes",
      addDescription: "Ajouter une description",
      fromOpenFoodFacts: "· repris d'Open Food Facts",
      searching: "· recherche sur Open Food Facts",
      save: "Enregistrer l'article",
      saveChanges: "Enregistrer les modifications",
      remove: "Supprimer l'article"
    },
    scanner: {
      title: "Scanner un code-barres",
      aim: "Visez le code-barres",
      lead: "Le nom et la photo sont repris d'Open Food Facts. Il vous restera à fixer le prix.",
      leadNoLookup: "Il vous restera à saisir le nom, la photo et le prix.",
      manual: "Saisir sans code-barres",
      denied: "Autorisez l'appareil photo pour scanner un code-barres.",
      // The web app: the browser's own settings (BarcodeScanner.tsx).
      deniedWeb:
        "Autorisez l'appareil photo pour ce site dans les réglages du navigateur (le cadenas à côté de l'adresse), puis touchez « Autoriser l'appareil photo ».",
      allow: "Autoriser l'appareil photo",
      settings: "Ouvrir les réglages",
      unavailable: "L'appareil photo n'a pas pu démarrer. Cet appareil n'en a peut-être pas.",
      engineFailed:
        "Le lecteur de codes-barres n'a pas pu être chargé. Vérifiez la connexion à internet, puis réessayez.",
      retry: "Réessayer",
      notFoundTitle: "Produit introuvable",
      notFoundBody: "Ce code-barres n'est pas reconnu. Saisissez le nom de l'article.",
      unreachableTitle: "Recherche du produit impossible",
      unreachableBody: "Scannez à nouveau dans un instant, ou saisissez le nom de l'article."
    },
    errors: {
      title: "Article non enregistré",
      changeTitle: "Article non modifié",
      removeTitle: "Article non supprimé",
      noAccount: "Déverrouillez l'app avec votre passkey, puis réessayez.",
      invalid: "Saisissez un nom et un prix.",
      tooMany: "Le catalogue est plein : 500 articles au plus.",
      unreachable: "Trop peu de relais ont répondu. Vérifiez la connexion, puis réessayez.",
      photoDenied:
        "Autorisez l'accès à vos photos dans les réglages de l'appareil, puis réessayez.",
      cameraDenied:
        "L'appareil photo ne s'ouvre pas. Autorisez-le dans les réglages de l'appareil, puis réessayez.",
      photoUnreadable: "Cette image ne peut pas être utilisée. Choisissez-en une autre."
    }
  },
  // "Wallet" (the owner's) and "My activity" (an employee's).
  activity: {
    limited: "Vue limitée à vos opérations",
    followUp: "À suivre",
    movements: "Mouvements",
    yourMovements: "Vos mouvements",
    allMovements: "Tous les mouvements",
    allYourMovements: "Tous vos mouvements",
    // Read with a day's net, at the right of its title (activity/MovementList.tsx).
    dayNet: "Total net du jour : {{amount}}",
    clearFilter: "{{name}}, retirer le filtre",
    reading: "Chargement des ventes et des factures…",
    loadFailed:
      "Votre activité n'a pas pu être lue. Vérifiez votre connexion à internet, puis réessayez.",
    empty: "Aucun mouvement pour l'instant.",
    noMatch: "Aucun mouvement ne correspond aux filtres.",
    // Mobile: expired invoices are left out of the list until shown; desktop: "showExpired" under a
    // table of expired invoices only, hidden by default.
    showExpired: "Afficher les expirées ({{count}})",
    hideExpired: "Masquer les expirées",
    // Under the list, while older movements are left out of it.
    showMore: "Voir plus",
    // Movements arrived live while the list is scrolled down, kept out of it until its top shows:
    // the pill over the list, which scrolls back up to them.
    arrivals_one: "{{count}} nouveau mouvement",
    arrivals_other: "{{count}} nouveaux mouvements",
    // Desktop: the table holds expired invoices only, hidden by default.
    expiredHidden: "Les factures expirées sont masquées.",
    // A sale paid on-chain whose sats the wallet has not credited yet.
    pendingCredit: {
      awaiting: "en attente du solde",
      received: "Paiement reçu",
      confirmed: "confirmé",
      credit: "Ajout à votre solde",
      waiting: "en attente",
      // The price of the claim (the Spark provider's quote, not the network's fee rate) is above
      // MAX_DEPOSIT_CLAIM_FEE_SATS; no delay promised, none is known.
      // "feesQuoted" when the wallet tells that price (once synced), "fees" else.
      fees: "Le crédit de ce paiement sur votre solde coûte en ce moment plus de {{fee}}, notre limite. Il se fera automatiquement dès que ce coût ne la dépassera plus, quand vous ouvrez votre portefeuille.",
      feesQuoted:
        "Le crédit de ce paiement sur votre solde coûte en ce moment {{price}}, plus que notre limite de {{fee}}. Il se fera automatiquement dès que ce coût ne la dépassera plus, quand vous ouvrez votre portefeuille.",
      other:
        "L'ajout se fera automatiquement quand vous ouvrez votre portefeuille. Frais à déduire : {{fee}} au plus."
    },
    // The rows of "To follow up" (short), and the list's title once one is chosen.
    followUps: {
      open: "Ouvertes",
      underpaid: "Sous-payées",
      unconfirmed: "En confirmation",
      draft: "Brouillons"
    },
    followUpTitles: {
      open: "Factures ouvertes",
      underpaid: "Factures sous-payées",
      unconfirmed: "En confirmation",
      draft: "Brouillons"
    },
    followUpLabel: "{{name}} : {{count}}, {{total}}",
    rest: "reste {{amount}}",
    states: {
      open: "Ouverte",
      underpaid: "Sous-payée",
      unconfirmed: "En confirmation",
      draft: "Brouillon",
      expired: "Expirée",
      canceled: "Annulée",
      inProgress: "En cours",
      failed: "Échoué"
    },
    // The desktop table's "Status" and a row's details, for what is done.
    done: {
      paid: "Payée",
      received: "Reçu",
      sent: "Envoyé"
    },
    sources: {
      pos: "Point de Vente",
      link: "Facture",
      integration: "Intégration",
      receive: "Réception",
      send: "Envoi",
      // Funds that left the balance, back in it (src/features/wallet/funds-recovery.ts).
      recovered: "Récupération"
    },
    // A payment link without a note (a sale of the point of sale: "—", activity/format.ts).
    titles: {
      link: "Facture",
      recovered: "Fonds récupérés",
      // A sale to Mt Pelerin: its currency, "Sale in CHF".
      mtpSale: "Vente en {{currency}}",
      // Rows copied from the v2 account (src/features/activity/legacy-history.ts).
      payout: "Retrait vers votre portefeuille",
      referral: "Commission de parrainage"
    },
    // A sale to Mt Pelerin in its details (src/features/sell/sale-detail.ts): what it wires.
    mtpSale: {
      section: "Vente",
      received: "Vous recevez",
      transferNowNote: "Viré seul, sans attendre vos autres ventes",
      transferLaterNote: "En virement groupé avec vos autres ventes, dès {{threshold}}",
      follow: "Suivre la vente",
      followLabel: "Ordre {{order}}, suivre la vente"
    },
    you: "Vous",
    stamp: "{{day}} · {{time}}",
    columns: {
      date: "Date",
      label: "Libellé",
      source: "Source",
      by: "Par",
      state: "État",
      amount: "Montant",
      sats: "sats"
    },
    detail: {
      date: "Date",
      takenBy: "Encaissé par",
      madeBy: "Créée par",
      rest: "Reste à payer",
      endsAt: "Payable jusqu'au",
      payments: "Paiements",
      // The page of a payment link (/pay), from its details.
      link: "Lien de paiement",
      openLink: "Ouvrir la facture",
      copyLink: "Copier le lien",
      linkCopied: "Lien copié",
      // The owner's acceptance of a sale paid short.
      accepted: "Acceptée le",
      difference: "Différence acceptée",
      // Accepted late (from 5 minutes before its invoice's end): its shop not told.
      acceptedLate:
        "Acceptée trop tard pour être transmise à {{integration}}, qui garde la commande expirée. Vérifiez qu'elle est marquée payée dans son back-office."
    },
    accept: {
      action: "Accepter le montant reçu",
      done: "Montant reçu accepté",
      dialog: {
        title: "Accepter le montant reçu ?",
        body: "La vente sera payée à {{received}}. La différence de {{difference}} ne sera plus demandée. C'est définitif.",
        bodyOrder:
          "La commande sera payée à {{received}} : votre boutique la verra payée une fois le paiement confirmé. La différence de {{difference}} ne sera plus demandée. C'est définitif.",
        bodyLate:
          "La commande sera payée à {{received}} et la différence de {{difference}} ne sera plus demandée. Cette acceptation n'est pas transmise à {{integration}}, qui garde la commande expirée : marquez-la aussi comme payée dans son back-office. C'est définitif.",
        confirm: "Accepter",
        cancel: "Retour"
      },
      // An integration's order whose invoice ended: its shop keeps it expired. "yourShop": an
      // integration whose name is not known.
      late: {
        title: "La facture de cette commande a pris fin",
        body: "La commande reste expirée pour {{integration}}, qui ne verra pas votre acceptation. Si vous l'acceptez ici, marquez-la aussi comme payée dans son back-office.",
        // From acceptanceCutoff, 5 minutes before the invoice's end (acceptance.ts): too late for
        // its shop; "lapsed": the acceptance its server reads did not reach a majority in time.
        closingTitle: "La facture de cette commande prend fin",
        closingBody:
          "Il est trop tard pour que {{integration}} reçoive votre acceptation. Si vous l'acceptez ici, marquez-la aussi comme payée dans son back-office.",
        lapsedBody:
          "Votre acceptation n'a pas atteint la majorité de vos relais avant la fin de la facture : {{integration}} ne la verra pas. Si vous l'acceptez ici, marquez-la aussi comme payée dans son back-office.",
        yourShop: "votre boutique"
      },
      errors: {
        network: "L'acceptation n'a pas pu être enregistrée, réessayez",
        already: "Cette vente est déjà acceptée",
        ended: "Trop tard pour transmettre l'acceptation à la boutique : relisez avant d'accepter"
      },
      // An order's acceptance a minority of the relays hold yet, being sent (acceptance.ts).
      pending:
        "Acceptation en cours d'enregistrement : elle comptera une fois reçue par la majorité de vos relais, avant la fin de la facture.",
      // Why a row "Underpaid" offers no acceptance (acceptBlockOf, acceptance.ts): its
      // acceptance not read on a majority of the relays yet, accepted at more than it received
      // now, or told by a newer app.
      blocked: {
        unread:
          "L'app n'a pas encore pu vérifier auprès de la majorité de vos relais si le montant reçu a déjà été accepté. « $t(activity.accept.action) » apparaîtra ici une fois cette vérification faite. Si cela dure, utilisez « $t(relays.test) » dans « $t(settings.relays) ».",
        unmet:
          "Le montant reçu a été accepté quand il était de {{received}}, mais l'app en voit moins aujourd'hui, par exemple après le remplacement d'une transaction. L'acceptation comptera de nouveau dès que ce montant sera atteint : elle ne se refait pas.",
        newer:
          "Le montant reçu a été accepté avec une version plus récente de l'app : mettez l'app à jour pour voir cette acceptation."
      }
    }
  },
  // Sorting and filtering the desktop tables by their columns: a column's header opens its menu
  // (ColumnHeader).
  table: {
    headerHint: "Trier et filtrer",
    sortedBy: "trié : {{order}}",
    filtered: "filtré",
    menu: "{{name}} : trier et filtrer",
    sort: "Trier",
    orders: {
      text: { ascending: "De A à Z", descending: "De Z à A" },
      number: {
        ascending: "Du plus petit au plus grand",
        descending: "Du plus grand au plus petit"
      },
      date: {
        ascending: "Du plus ancien au plus récent",
        descending: "Du plus récent au plus ancien"
      }
    },
    show: "Afficher",
    selectAll: "Tout sélectionner",
    // "Date"'s values (src/lib/date-periods.ts); today and yesterday are the device's words.
    periods: {
      thisWeek: "Cette semaine",
      lastWeek: "Semaine dernière",
      thisMonth: "Ce mois",
      lastMonth: "Le mois dernier",
      thisYear: "Cette année",
      lastYear: "L'année dernière",
      older: "Plus ancien"
    },
    value: "{{label}}, {{count}}",
    emptyValue: "Vide",
    clearFilters: "Effacer les filtres"
  },
  wallet: {
    balance: "Solde",
    // Before an amount that is a minimum ("at least +1.41 CHF").
    atLeast: "au moins",
    // "Discreet": masks the screen's amounts; screen readers read hiddenAmount in their place.
    discreet: "Discret",
    hiddenAmount: "Montant masqué",
    received: "Reçu en 30 jours",
    sent: "Envoyé en 30 jours",
    send: "Envoyer",
    // "Sell": grayed under SELL_MIN_BALANCE_SATS, `sellFrom` then under its label.
    sell: "Vendre",
    sellFrom: "dès {{amount}} sats",
    opening: "Ouverture de votre portefeuille…",
    loadFailed:
      "Votre portefeuille n'a pas pu être lu. Vérifiez votre connexion à internet, puis réessayez.",
    retry: "Réessayer",
    empty: "Aucun mouvement pour l'instant.",
    // The owner's list without a movement: how they come, in three steps. `label`: the steps' name
    // for screen readers.
    guide: {
      lead: "Aucun mouvement pour l'instant. Voici comment ils arrivent :",
      label: "Comment arrivent les mouvements",
      take: {
        title: "Encaissez",
        caption: "Saisissez un montant à la caisse : votre client scanne le QR code et paie."
      },
      receive: {
        title: "Recevez",
        caption:
          "Le paiement arrive dans votre portefeuille et s'affiche ici, avec qui l'a encaissé."
      },
      follow: {
        title: "Suivez et envoyez",
        caption:
          "Factures, liens de paiement, virements : tout se suit ici. Envoyez vos sats quand vous le souhaitez."
      }
    },
    // Until a sync of the wallet reached the network (useWalletData): the pill beside the list's
    // title (syncing), or alone (syncingWallet).
    syncing: "Mise à jour…",
    syncingWallet: "Synchronisation du portefeuille…",
    // Past a minute without a sync that reached the network (WALLET_SYNC_LATE_MS): over what
    // shows (syncLate), or instead of an empty wallet (syncLateBlank).
    syncLate:
      "Votre portefeuille n'a pas pu être mis à jour : le solde et les mouvements affichés sont ceux de cet appareil et peuvent être incomplets. Vérifiez votre connexion à internet.",
    syncLateBlank:
      "Votre portefeuille n'a pas pu être synchronisé. Vérifiez votre connexion à internet, puis réessayez.",
    // A rate outage: what is valued at the current rate shows in sats; a sale's amount typed, a
    // transfer valued at its payment (activity/format.ts) keep theirs.
    noRate: "Taux de change indisponible : certains montants en sats uniquement.",
    today: "Aujourd'hui",
    yesterday: "Hier",
    meta: "{{time}} · {{kind}}",
    kinds: {
      lightningReceipt: "Réception lightning",
      lightningAddress: "Adresse lightning",
      lightningInvoice: "Facture lightning",
      bitcoinAddress: "Adresse bitcoin",
      sparkTransfer: "Transfert Spark"
    },
    titles: {
      deposit: "Dépôt",
      withdrawal: "Retrait",
      receipt: "Réception",
      sending: "Envoi"
    },
    pills: {
      confirming: "En confirmation",
      inProgress: "En cours",
      failed: "Échoué"
    },
    networks: {
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      spark: "Spark"
    },
    detail: {
      date: "Date",
      network: "Réseau",
      fee: "Frais",
      sendFee: "Frais d'envoi",
      noFee: "Aucun",
      reference: "Référence",
      copy: "Copier la référence",
      copied: "Référence copiée",
      recipient: "Destinataire",
      copyAddress: "Copier l'adresse",
      addressCopied: "Adresse copiée",
      close: "Fermer"
    },
    // "Send".
    sendSheet: {
      intro:
        "Saisir, coller ou scanner une adresse lightning, une facture lightning, une adresse bitcoin ou une adresse Spark.",
      introNoScan:
        "Saisir ou coller une adresse lightning, une facture lightning, une adresse bitcoin ou une adresse Spark.",
      close: "Fermer",
      cancel: "Annuler",
      recipient: "Destinataire",
      recipientPlaceholder: "Adresse ou facture",
      paste: "Coller",
      scan: "Scanner un QR code",
      reading: "Lecture du destinataire…",
      kinds: {
        lightningAddress: "Adresse lightning",
        lnurlPay: "Lien LNURL",
        bolt11: "Facture lightning",
        bitcoinAddress: "Adresse bitcoin",
        sparkAddress: "Adresse Spark"
      },
      // Inside the field, on one line: short.
      recipientErrors: {
        unrecognized: "Saisissez une adresse ou une facture",
        unsupported: "Saisissez une adresse ou une facture",
        otherNetwork: "Utilisez une adresse du réseau principal",
        expired: "Demandez une nouvelle facture",
        unreachable: "Vérifiez l'adresse lightning",
        lnurlUnreachable: "Réessayez : le lien LNURL ne répond pas",
        failed: "Vérifiez votre connexion à internet",
        pasteEmpty: "Copiez d'abord une adresse ou une facture",
        pasteFailed: "Collez dans le champ avec le clavier"
      },
      amount: "Montant",
      switchToSats: "Saisir en sats",
      switchToFiat: "Saisir en {{currency}}",
      available: "Disponible : {{amount}}",
      amountErrors: {
        invalid: "Saisissez un montant valide",
        belowMin: "Saisissez au moins {{amount}}",
        aboveMax: "Saisissez au plus {{amount}}",
        aboveBalance: "Saisissez au plus le solde disponible",
        feesAboveBalance: "Réduisez le montant pour couvrir les frais"
      },
      speed: "Vitesse",
      speeds: { fast: "Rapide", medium: "Normale", slow: "Économique" },
      fee: "Frais estimés",
      feePreparing: "Calcul des frais…",
      quoteFailed:
        "Les frais n'ont pas pu être calculés. Vérifiez votre connexion à internet, puis réessayez.",
      balanceAfter: "Solde après l'envoi",
      expiresIn: "Expire dans",
      send: "Envoyer {{amount}}",
      pay: "Payer {{amount}}",
      confirming: "Confirmez avec votre passkey…",
      sending: "Envoi en cours…",
      sendFailed:
        "L'envoi n'a pas abouti. Vérifiez votre connexion à internet, puis réessayez : le paiement ne partira qu'une fois.",
      recordFailed:
        "Les relais de votre compte n'ont pas répondu : rien n'est parti. Vérifiez votre connexion à internet, puis réessayez.",
      noRate: "Le cours du bitcoin est indisponible : saisissez le montant en sats.",
      result: {
        completedTitle: "Envoi effectué",
        onchainTitle: "Paiement envoyé",
        onchainBody:
          "Le réseau Bitcoin doit encore confirmer la transaction : son état s'affiche dans la liste des mouvements.",
        pendingTitle: "Envoi en cours",
        pendingBody:
          "Le paiement est en route. Cette fenêtre se met à jour d'elle-même ; la fermer n'annule pas l'envoi.",
        // The payment no longer followed (useSend's FOLLOW_FOR_MS), still pending.
        stalledTitle: "Toujours en cours",
        stalledBody: "Son état final s'affichera dans la liste des mouvements.",
        failedTitle: "L'envoi a échoué",
        failedBody: "Vérifiez le destinataire et le solde, puis réessayez.",
        // Under the amount: who it goes to (pending, failed), who received it (sent).
        recipientTo: "vers {{recipient}}",
        recipientSent: "à {{recipient}}",
        done: "Terminer"
      },
      scanHint:
        "Visez le QR code d'une facture lightning, d'une adresse lightning ou d'une adresse bitcoin.",
      scanType: "Saisir",
      scanDenied: "Autorisez l'appareil photo pour scanner un QR code.",
      scanAllow: "Autoriser l'appareil photo",
      scanSettings: "Ouvrir les réglages"
    }
  },
  // "Export" of "Wallet": every transaction done, the PDF a summary then the list, no recurring
  // export (it needs a server).
  // "Sell": the merchant's sats sold to Mt Pelerin, their francs wired to the merchant's bank
  // account. Its words apart from "Bank account" of "Settings" (the payouts' account), which the
  // first account here starts from.
  sell: {
    title: "Vendre",
    back: "Retour",
    retry: "Réessayer",
    busy: {
      starting: "Lecture de votre compte Mt Pelerin…",
      reading: "Lecture de votre compte Mt Pelerin…",
      signingIn: "Connexion à Mt Pelerin…",
      sendingCode: "Envoi du code…",
      checkingCode: "Vérification du code…",
      savingProfile: "Enregistrement…",
      preparingInvoice: "Préparation du paiement de 1 sat…",
      confirming: "Confirmation…",
      paying: "Paiement…",
      addingAccount: "Ajout du compte…",
      savingAccount: "Enregistrement du compte…",
      loggingOut: "Déconnexion…"
    },
    failures: {
      offline:
        "Le service de vente ne répond pas. Vérifiez votre connexion à internet, puis réessayez",
      server: "Le service de vente a renvoyé une réponse illisible. Réessayez dans un instant",
      refused: "La demande a été refusée",
      codeRefused: "Ce code n'est pas le bon",
      codeExpired: "Ce code a expiré : demandez-en un nouveau",
      malformed: "La facture de la vente n'est pas celle attendue : rien n'a été payé",
      otherNetwork: "La facture de la vente n'est pas celle attendue : rien n'a été payé",
      otherAmount: "La facture de la vente n'est pas celle attendue : rien n'a été payé",
      expired: "La facture de la vente a expiré : rien n'a été payé",
      payment: "Le paiement n'est pas parti. Réessayez",
      // No majority of the account's relays took the sale's record (sale-records.ts): nothing paid.
      record:
        "Les relais de votre compte n'ont pas répondu : rien n'a été vendu. Vérifiez votre connexion à internet, puis réessayez",
      ibanTaken: "Cet IBAN est déjà enregistré sur un autre compte Mt Pelerin",
      accountKnown: "Ce compte est déjà dans vos comptes bancaires, dans cette devise",
      accountUnchanged:
        "Mt Pelerin n'a pas modifié ce compte : ses coordonnées restent celles affichées. Contactez Mt Pelerin pour les changer"
    },
    sessionLost: "Votre session Mt Pelerin a expiré : reconnectez-vous",
    intro: {
      title: "Vendre avec Mt Pelerin",
      lead: "Mt Pelerin, intermédiaire financier suisse, achète vos sats et vire les francs sur votre compte bancaire.",
      connectLead: "Votre compte Mt Pelerin s'ouvre avec la clé de votre compte sattle.me.",
      connect: "Se connecter à Mt Pelerin",
      phoneLead: "Votre compte chez Mt Pelerin s'ouvre avec votre numéro.",
      phone: "Numéro de téléphone",
      phoneHint: "Mt Pelerin vous envoie un code par SMS",
      sendCode: "Recevoir le code",
      dialCountry: "Pays du numéro",
      dialCodeOf: "Pays du numéro : {{country}}, {{code}}"
    },
    code: {
      title: "Entrez votre code",
      lead: "Mt Pelerin vient de vous l'envoyer par SMS au {{phone}}.",
      label: "Code à 6 chiffres",
      notReceived: "Pas reçu ?",
      resend: "Renvoyer le code",
      submit: "Valider"
    },
    profile: {
      title: "Votre e-mail",
      lead: "Mt Pelerin en a besoin pour ouvrir votre compte. Il vous y envoie le reçu de chaque vente.",
      email: "E-mail",
      emailInvalid: "Saisissez un e-mail valide",
      phone: "Numéro de téléphone",
      phoneInvalid: "Saisissez un numéro valide, avec son indicatif",
      phoneCaption: "Le numéro de votre compte Mt Pelerin",
      submit: "Continuer"
    },
    validation: {
      title: "Vérifier votre portefeuille",
      lead: "Votre portefeuille doit être vérifié. Payez 1 sat ({{value}}) pour effectuer cette vérification.",
      toPay: "À payer",
      fee: "Frais Lightning",
      pay: "Payer 1 sat",
      unaffordable:
        "Votre solde ne couvre pas 1 sat et ses frais. Revenez après votre prochain encaissement",
      leadNoRate:
        "Votre portefeuille doit être vérifié. Payez 1 sat pour effectuer cette vérification.",
      lessThan: "moins de {{amount}}",
      about: "environ {{amount}}"
    },
    pending: {
      badge: "En cours",
      title: "Vérification de votre portefeuille",
      leadNoBank:
        "Vous pouvez continuer : votre compte bancaire ne dépend pas de cette vérification.",
      leadBank:
        "Vous pouvez quitter cet écran : vous pourrez vendre dès que votre portefeuille sera vérifié (moins de 15 minutes en général).",
      paid: "1 sat payé",
      toBank: "Ajouter votre compte bancaire"
    },
    verified: {
      title: "Adresse vérifiée",
      lead: "Votre sat est bien arrivé. Vos ventes partiront de {{address}}.",
      account: "Compte Mt Pelerin",
      address: "Adresse Lightning",
      addressVerified: "Vérifiée",
      bank: "Compte bancaire",
      toBank: "Ajouter votre compte bancaire",
      continue: "Continuer",
      bankTodo: "À remplir"
    },
    bank: {
      title: "Où virer vos {{currency}}",
      lead: "Le compte où vos ventes sont virées. Il est à vous ou à votre entreprise.",
      none: "Aucun compte bancaire enregistré pour l'instant",
      add: "Ajouter un compte"
    },
    accountForm: {
      title: "Ajouter un compte",
      submit: "Ajouter ce compte"
    },
    accountEdit: {
      title: "Modifier le compte",
      lead: "Pour un autre IBAN ou une autre devise, ajoutez un compte.",
      submit: "Enregistrer"
    },
    payoutCurrency: {
      label: "Devise de versement",
      swift:
        "Virement international (SWIFT) : un jour ouvrable ou plus. Des banques intermédiaires peuvent prélever des frais, de quelques dollars à plusieurs dizaines"
    },
    accounts: {
      title: "Comptes bancaires",
      lead: "Vos ventes ne sont virées que sur ces comptes.",
      add: "Ajouter un compte",
      fromSettings: "Réglages",
      pending: "En attente",
      editHint: "Modifier le nom et l'adresse du titulaire",
      // Accounts Mt Pelerin listed that the app cannot read (guards.ts): never offered.
      unreadable_one: "{{count}} autre compte n'a pas pu être lu : il n'est pas proposé",
      unreadable_other: "{{count}} autres comptes n'ont pas pu être lus : ils ne sont pas proposés",
      // Mt Pelerin lacks a line of its holder's address: offered all the same.
      incompleteAddress: "Adresse incomplète"
    },
    addressTaken: {
      title: "Adresse déjà enregistrée",
      body: "Votre adresse Lightning est enregistrée sur un autre compte Mt Pelerin. Connectez-vous avec le numéro de ce compte.",
      switch: "Changer de compte"
    },
    unavailable: "La vente de sats par Lightning n'est pas disponible pour l'instant",
    sale: {
      amount: "Montant",
      available: "Disponible : {{amount}}",
      change: "Changer",
      fee: "Frais de vente",
      receive: "Vous recevez environ",
      estimating: "Calcul…",
      estimateFailed: "Indisponible",
      pending: "En attente",
      pendingBalance: "Solde : {{amount}}",
      pendingSale: "Cette vente : {{amount}}",
      pendingGauge: "{{balance}} en attente, plus {{sale}} de cette vente, sur {{threshold}}",
      pendingGaugeHeld: "{{balance}} en attente, sur {{threshold}}",
      limitsTitle: "Sans identification",
      limitLeft: "{{left}} restants sur {{limit}}",
      seeLimits: "Voir mes limites",
      settings: "Réglages de la vente",
      quote: "Voir le devis",
      aboveMax: "Saisissez au plus {{amount}}",
      aboveBalance: "Saisissez au plus le solde disponible",
      tooSmall: "Vous devez recevoir au moins {{amount}} : augmentez le montant",
      transferFee: "Frais de virement",
      transfer: "Virement",
      transferNow: "Immédiat",
      transferNowNote: "{{fee}} de frais de virement en dessous de {{threshold}}, gratuit au-delà",
      transferLater: "Différé",
      transferLaterNote:
        "Sans frais de virement : en un virement groupé avec vos autres ventes, dès qu'elles atteignent {{threshold}}",
      equivalentOf: "l'équivalent de {{amount}}",
      chooseAccount: "Sur quel compte ?",
      addAccount: "Ajouter un compte"
    },
    quote: {
      title: "Devis",
      heading: "Vous recevez {{amount}}",
      lead: "Vos sats sont vendus et les francs virés sur votre compte bancaire.",
      selling: "Vous vendez",
      rate: "Cours",
      ratePrice: "1 BTC = {{price}}",
      fee: "Frais de vente",
      lightningFee: "Frais Lightning",
      account: "Sur le compte",
      lockedUntil: "Cours garanti jusqu'à {{time}}",
      expired: "Le cours a expiré : rien n'a été vendu",
      refresh: "Actualiser le devis",
      sell: "Vendre {{amount}}",
      otherOrder: "Le devis reçu n'est pas celui demandé : rien n'a été payé",
      nothingWired: "Cette vente ne virerait rien sur votre compte : rien n'a été payé",
      unaffordable: "Votre solde ne couvre pas cette vente et ses frais"
    },
    order: {
      heading: "{{amount}} vers votre banque",
      lead: "Vente de {{sats}}, {{date}}. Vous pouvez quitter cet écran : la vente suit son cours.",
      leadDated: "Vente du {{date}}. Vous pouvez quitter cet écran : la vente suit son cours.",
      received: "Sats reçus",
      receivedTodo: "Réception des sats",
      receivedNow: "Sats en cours de réception",
      receivedFailed: "Sats non reçus",
      transferred: "Virement sur votre compte",
      held: "Cette vente est en cours de vérification : regardez vos e-mails de Mt Pelerin",
      delayed: "Le virement est reporté : attendez-le dans la semaine",
      refunded: "Vos sats vous sont rendus",
      failed: "Cette vente a été refusée",
      expired: "Le devis a expiré : rien n'a été vendu",
      reference: "Numéro d'ordre",
      outcomes: {
        awaitingPayment: "En attente du paiement",
        expired: "Expirée",
        inProgress: "En cours",
        delayed: "Retardée",
        held: "En vérification",
        sent: "Virée",
        refunded: "Remboursée",
        failed: "Refusée"
      },
      title: "Vente",
      soldTitle: "Vendu avec succès",
      soldLead: "Vos {{sats}} sont vendus : {{amount}} vont être virés sur votre compte.",
      withOthers:
        "En virement groupé avec vos autres ventes, dès qu'elles atteignent {{threshold}}",
      next: "Et maintenant",
      processing: "Traitement de la vente",
      processingNow: "En cours de traitement",
      processed: "Convertis en {{currency}}",
      delayChf: "Sous 1 jour ouvrable (virement en Suisse, lundi au vendredi)",
      delayEur: "Sous 1 à 2 jours ouvrables (virement SEPA)",
      delaySwift: "Un jour ouvrable ou plus (virement international SWIFT)",
      close: "Fermer",
      seeSales: "Voir vos ventes"
    },
    history: {
      title: "Vos ventes",
      empty: "Aucune vente pour l'instant",
      unreadable: "Trop de ventes pour les lister ici"
    },
    // The split's sale (src/features/sell/SplitSale.tsx).
    split: {
      quoting: "Fixation du cours de votre vente…",
      receive: "Vous recevez",
      title: "Répartition",
      lead: "Depuis le {{date}}, votre portefeuille a reçu {{received}}.",
      kept: "Gardé en bitcoin ({{percent}})",
      share: "Part à vendre ({{percent}})",
      sold: "Vendu maintenant : {{amount}}",
      lightningFee: "Frais Lightning, en plus",
      deferred:
        "Les ventes différées sont regroupées et seront virées en une fois, dès qu'elles atteignent {{threshold}}.",
      balance:
        "Votre solde ne permet de vendre que {{amount}}. Le reste de la part ne sera pas vendu.",
      limit:
        "Sans vérification d'identité, vos ventes sont limitées à {{limit}} par mois. Vendez {{amount}} maintenant (le reste de la part ne sera pas vendu), ou identifiez-vous d'abord pour vendre toute la part.",
      sell: "Vendre {{amount}}",
      identify: "M'identifier chez Mt Pelerin",
      identifyHeading: "Identifiez-vous pour vendre votre part",
      identifyLead:
        "Votre part à vendre est de {{due}}. Sans vérification d'identité, vos ventes sont limitées à {{limit}} par mois, et cette limite est atteinte.",
      identifyHow:
        "Votre identité se vérifie sur le site de Mt Pelerin, avec le numéro de téléphone de votre compte. Une fois votre identité vérifiée, toute la part vous est proposée ici.",
      soldHeading: "Vendu avec succès",
      soldLead:
        "Vos {{sats}} sont vendus pour {{amount}}, qui rejoignent vos ventes en attente de virement.",
      held: "En attente de virement",
      // The deferred sells' next transfer (PayoutGauge.tsx): what is held, this sale, the threshold.
      payout: {
        title: "Prochain virement",
        threshold: "dès {{threshold}}",
        held: "Déjà en attente",
        sale: "Cette vente",
        left: "Encore <strong>{{left}}</strong> de ventes, puis le tout sera viré sur votre compte bancaire.",
        reached: "Le seuil est atteint : le tout sera viré sur votre compte bancaire."
      },
      notice: "Répartition : {{amount}} à vendre, environ {{fiat}}.",
      noticeSell: "Vendre",
      noticeIdentify: "Répartition : {{due}} à vendre, une fois votre identité vérifiée.",
      noticeSee: "Voir",
      setup:
        "Votre répartition prévoit {{percent}} en {{currency}}. Configurez la vente pour vendre cette part.",
      setupOpen: "Configurer la vente"
    },
    limits: {
      title: "Limites de vente",
      lead: "Sans vérification d'identité, vous pouvez vendre au plus :",
      perSale: "Par vente",
      month: "{{days}} derniers jours",
      year: "Cette année",
      leftUntil: "Reste {{amount}} jusqu'au {{date}}",
      leftRolling: "Reste {{amount}} : une vente compte pendant {{days}} jours",
      unknown: "Non calculé : une vente dans une autre devise que le franc",
      feesTitle: "Frais compris",
      identified: "Votre identité est vérifiée chez Mt Pelerin.",
      noLimit: "Sans limite",
      perMonth: "Par mois",
      perYear: "Par année",
      identifyHow:
        "Pour vendre davantage, faites vérifier votre identité sur le site de Mt Pelerin, avec le numéro de téléphone de votre compte.",
      fees: "C'est le montant vendu qui compte, avant déduction des frais. Calculé d'après vos ventes."
    },
    settings: {
      title: "Réglages de la vente",
      account: "Compte Mt Pelerin",
      byKey: "Compte Mt Pelerin · connecté avec la clé de votre compte",
      lightning: "Adresse Lightning",
      verified: "vérifiée",
      pendingValidation: "en attente",
      banks: "Comptes bancaires",
      limits: "Limites de vente",
      history: "Vos ventes",
      logout: "Se déconnecter de Mt Pelerin",
      logoutTitle: "Se déconnecter de Mt Pelerin ?",
      logoutBody:
        "Sur tous vos appareils. Vos comptes et vos ventes restent chez Mt Pelerin : vous les retrouverez en vous reconnectant.",
      logoutConfirm: "Se déconnecter",
      cancel: "Annuler",
      banksCount_one: "{{count}} compte",
      banksCount_other: "{{count}} comptes",
      left: "Reste {{amount}}",
      perSale: "{{amount}} par vente",
      salesCount_one: "{{count}} cette année",
      salesCount_other: "{{count}} cette année"
    },
    close: "Fermer",
    poweredBy: "Propulsé par"
  },
  walletExport: {
    open: "Exporter",
    title: "Exporter les transactions",
    close: "Fermer",
    lead: "Les transactions terminées de la période : ventes payées, réceptions et envois.",
    period: "Période",
    periods: {
      thisMonth: "Ce mois",
      lastMonth: "Le mois dernier",
      thisYear: "Cette année",
      lastYear: "L'année dernière",
      custom: "Dates précises"
    },
    days: "{{first}} – {{last}}",
    from: "Du",
    to: "Au",
    format: "Type d'export",
    formats: {
      pdf: "Simple (PDF)",
      csv: "Détaillé (CSV)"
    },
    amounts: "Montants",
    units: {
      fiat: "En {{currency}}",
      btc: "En BTC"
    },
    columnsTitle: "Colonnes",
    columnsTicked: "{{ticked}} sur {{total}}",
    columns: {
      dateAndTime: "Date et heure",
      label: "Libellé",
      source: "Source",
      by: "Par",
      network: "Type de paiement",
      reference: "Référence",
      bitcoinAmount: "Montant en BTC",
      bitcoinFees: "Frais en BTC",
      fiatAmount: "Montant en {{currency}}",
      fiatFees: "Frais en {{currency}}",
      originalAmount: "Montant saisi",
      originalCurrency: "Devise saisie",
      bitcoinPrice: "Cours du bitcoin en {{currency}}",
      remark: "Remarque"
    },
    // "Remark": what a line says besides (an acceptance of the owner's); its date and time in the
    // device's locale.
    remarks: {
      accepted:
        "Différence de {{fiat}} / {{btc}}, accepté par le propriétaire le {{date}} à {{time}}",
      acceptedSats: "Différence de {{btc}}, accepté par le propriétaire le {{date}} à {{time}}"
    },
    submit: "Exporter",
    errors: {
      unread:
        "Vos ventes n'ont pas pu être lues. Vérifiez votre connexion à internet, puis réessayez.",
      receiving:
        "Un paiement bitcoin vu par un point de vente n'est pas encore arrivé dans votre portefeuille. Réessayez dans quelques minutes.",
      failed: "L'export n'a pas pu être fait. Réessayez."
    },
    pdf: {
      title: "Rapport de transactions",
      period: "Du {{first}} au {{last}}",
      made: "Établi le {{date}}",
      summary: "Récapitulatif",
      count: "Nombre de transactions",
      countOf: {
        pos: "dont point de vente",
        link: "dont factures",
        integration: "dont intégrations",
        receive: "dont réceptions",
        send: "dont envois"
      },
      received: "Montant total encaissé",
      sent: "Montant total envoyé",
      fees: "Frais d'envoi",
      lines: "Détail des transactions",
      none: "Aucune transaction terminée sur cette période.",
      amount: "Montant ({{unit}})",
      amountMixed: "Montant",
      valuesNote:
        "Une vente compte pour le montant saisi, dans sa devise ; toute autre transaction, pour la valeur de ses bitcoins au cours noté lors de son paiement (source : CoinGecko). Une transaction sans cours noté compte en BTC.",
      // Rows copied from a v2 account among them (src/features/activity/legacy-history.ts).
      valuesNoteImported:
        "Une vente compte pour le montant saisi, dans sa devise ; toute autre transaction, pour la valeur de ses bitcoins au cours noté lors de son paiement (source : CoinGecko ; pour l'historique repris de votre ancien service de paiement, le cours qu'il avait enregistré). Une transaction sans cours noté compte en BTC."
    }
  },
  // "Settings".
  settings: {
    recovery: {
      group: "Sécurité",
      title: "Phrase de récupération",
      description:
        "Les 12 mots qui restaurent votre portefeuille sans passkey, à noter sur papier.",
      open: "Afficher",
      lead: "Ces 12 mots sont une copie de votre portefeuille : avec eux, n'importe qui peut en dépenser tous les fonds, sans votre passkey.",
      rulesTitle: "Avant de les afficher",
      rules:
        "Notez-les sur papier, dans l'ordre, et rangez-les en lieu sûr. Ne les photographiez pas et ne les enregistrez dans aucun fichier ni message. Ne les donnez à personne : sattle.me ne vous les demandera jamais.",
      reveal: "Afficher la phrase",
      hide: "Masquer",
      shownNote:
        "Seul vous devez voir ces mots. Ils disparaissent dès que vous quittez cet écran ou l'application.",
      captureOpen:
        "Les captures d'écran ne sont pas bloquées ici : n'en faites pas et ne filmez pas l'écran.",
      noPhrase: "Ce portefeuille n'a pas de phrase de récupération à afficher.",
      wordLabel: "Mot {{index}} : {{word}}"
    },
    title: "Réglages",
    business: "Commerce",
    businessDescription: "Nom et logo vus par le client, sur les reçus et les factures.",
    businessName: "Nom du commerce",
    logo: "Logo du commerce",
    changeLogo: "Changer le logo du commerce",
    logoChange: "Changer le logo",
    merchant: {
      section: "Profil commerçant",
      description:
        "Encaissez des paiements en bitcoin avec cette app : point de vente, factures, employés. Votre portefeuille principal est créé à cette étape.",
      create: "Créer mon profil commerçant",
      failedTitle: "Point de vente non préparé",
      doneTitle: "Profil commerçant créé",
      doneBody: "Vous pouvez encaisser des paiements"
    },
    groups: {
      charging: "Encaissement",
      payouts: "Virements",
      display: "Affichage",
      network: "Réseau",
      // "Account" of "Settings" (the session, the deletion).
      account: "Compte"
    },
    // The phone's cards and the computer's tabs of "Settings".
    rubrics: {
      chargingBoth: "Lightning et onchain",
      methods: "Moyens de paiement",
      chargingDescription:
        "Ce que le Point de Vente, vos employés et vos intégrations proposent au client.",
      lightning: "Lightning",
      lightningCaption: "Toujours proposé, jusqu'à {{limit}} par facture ; {{beyond}}",
      lightningCaptionUnknown:
        "Toujours proposé, jusqu'au plafond de votre adresse Lightning ; {{beyond}}",
      lightningLimitFiat: "{{btc}} (environ {{fiat}})",
      lightningBeyond: {
        onchain: "au-delà, seule l'adresse onchain s'affiche",
        refused:
          "au-delà, le Point de Vente refuse la vente tant que les paiements onchain sont désactivés"
      },
      splitLabel: "Répartition : {{bitcoin}} en bitcoin, {{fiat}} en {{currency}}",
      editRelays: "Modifier les relais"
    },
    // "Ask for biometrics to unlock the app" (app-lock/preference.ts).
    unlock: {
      title: "Demander la biométrie pour déverrouiller l'app",
      captionOn: "À chaque ouverture de l'app",
      captionOff: "L'app s'ouvre sans biométrie",
      captionUnavailable: "Aucune biométrie ni code sur cet appareil",
      section: "Verrouillage de l'app",
      description:
        "La biométrie de cet appareil, ou son code, est demandée à chaque ouverture de l'app et à chaque retour dans l'app, en plus du mode caisse.",
      saveFailed: "Ce choix n'a pas pu être enregistré sur cet appareil. Réessayez."
    },
    // "Settings" in till mode, reduced (LockedSettings.tsx).
    locked: {
      title: "Mode caisse",
      titleCard: "App verrouillée",
      body: "Déverrouillez l'app pour modifier vos réglages.",
      unlock: "Déverrouiller"
    },
    displayCurrency: "Devise de référence",
    displayCurrencyCardDescription: "Montants de vos cartes affichés dans l'app.",
    displayCurrencyDescription: "Montants saisis au Point de Vente et affichés dans l'app.",
    // "Currency shown first" (settings/amount-unit.ts).
    amountUnit: {
      title: "Devise affichée en premier",
      description:
        "Dans « Portefeuille » et l'historique de vos cartes, sur cet appareil. L'autre montant s'affiche en dessous.",
      sats: "sats",
      savedTitle: "Devise affichée en premier enregistrée",
      saveFailed: "Ce choix n'a pas pu être enregistré sur cet appareil. Réessayez."
    },
    theme: {
      title: "Thème",
      description:
        "Sur cet appareil. « Automatique » suit le réglage clair ou sombre de l'appareil.",
      light: "Clair",
      dark: "Sombre",
      system: "Automatique",
      // A rubric's card on a phone ("Display"): the theme chosen.
      summaryLight: "Thème clair",
      summaryDark: "Thème sombre",
      summarySystem: "Thème automatique",
      savedTitle: "Thème enregistré",
      saveFailed: "Ce choix n'a pas pu être enregistré sur cet appareil. Réessayez."
    },
    onchain: "Paiements onchain",
    // The point of sale's only: the employees' devices follow it
    // through their channel (owner.ts teamProfile, member.ts); the invoices (the owner's and the
    // assistants') and the integrations always offer on-chain (invoices.ts, owner.ts activeChannel,
    // integration-addresses.ts).
    onchainDescription:
      "Confirmation en 10 à 60 minutes. S'applique au Point de Vente, le vôtre et celui de vos employés. Vos factures et vos intégrations proposent toujours le paiement onchain.",
    split: "Répartition",
    splitDescription:
      "Frais sattle.me : {{bitcoin}} sur tous vos encaissements. Part convertie : {{fiat}} de frais de vente de Mt Pelerin en plus, vendue quand vous l'acceptez dans « Portefeuille ».",
    splitDescriptionFree:
      "Frais sattle.me : {{free}} au lieu de {{bitcoin}} jusqu'au {{date}}, sur tous vos encaissements. Part convertie : {{fiat}} de frais de vente de Mt Pelerin en plus, vendue quand vous l'acceptez dans « Portefeuille ».",
    splitShort: "{{percent}} en {{currency}}",
    allBitcoin: "Tout en bitcoin",
    bankAccount: "Compte bancaire",
    noBankAccount: "Aucun",
    bankAtMtPelerin: "Chez Mt Pelerin",
    relays: "Relais Nostr",
    relaysCount_one: "{{count}} relais",
    relaysCount_other: "{{count}} relais",
    relaysDescription:
      "Serveurs Nostr auxquels l'app se connecte, sur tous les appareils du commerce.",
    // "Bitcoin node" of "Network".
    node: {
      title: "Nœud Bitcoin",
      description:
        "Où vos appareils et ceux de vos employés suivent les paiements onchain, et où votre portefeuille lit la blockchain.",
      mempoolTitle: "mempool.space",
      mempoolDescription: "Public, sans rien à installer. Voit les adresses de vos ventes onchain.",
      ownTitle: "Mon nœud",
      ownDescription: "Votre propre mempool : personne d'autre ne voit vos adresses.",
      mempoolCaption: "Par défaut",
      urlLabel: "Adresse de votre mempool",
      urlHint: "L'adresse de sa page dans votre navigateur, par exemple sur votre Umbrel ou Start9",
      errors: {
        empty: "Saisissez l'adresse de votre mempool",
        incomplete: "Adresse incomplète, par exemple https://mempool.example.ch",
        insecure:
          "Seule une adresse en https:// est acceptée : en http://, la connexion n'est pas chiffrée",
        device: "Cette adresse désigne cet appareil : saisissez celle de votre nœud"
      },
      legacyHttpTitle: "Adresse en http:// plus utilisée",
      legacyHttpBody:
        "Pour votre sécurité, l'app ne se connecte plus à votre nœud qu'en https:// : en http://, quelqu'un connecté à ce Wi-Fi pourrait se faire passer pour lui et faire paraître payée une vente qui ne l'est pas. Tant que vous n'avez pas saisi une adresse en https://, vos appareils font comme si votre nœud ne répondait pas.",
      test: "Tester la connexion",
      results: {
        ok: {
          title: "Nœud joignable et à jour",
          body: "Dernier bloc : {{height}}"
        },
        unreachable: {
          title: "Nœud injoignable",
          body: "Vérifiez l'adresse, et que cet appareil est sur le même réseau que votre nœud."
        },
        notMempool: {
          title: "Pas de mempool à cette adresse",
          body: "Quelque chose répond, mais pas l'API de mempool. Vérifiez l'adresse et le port."
        },
        noAddressIndex: {
          title: "Adresses illisibles",
          body: "Votre mempool ne lit pas encore les adresses : son index (electrs ou Fulcrum) manque, ou n'est pas encore construit."
        },
        behind: {
          title: "Nœud en retard",
          body: "Son dernier bloc date de {{hours}} h : il n'est pas encore synchronisé."
        }
      },
      fallbackTitle: "Quand il ne répond pas",
      fallbackMempool: "Passer par mempool.space",
      fallbackMempoolDescription:
        "Vos ventes onchain continuent ; mempool.space voit alors vos adresses.",
      fallbackNone: "Lightning seul",
      fallbackNoneDescription:
        "Rien ne part chez mempool.space ; le Point de Vente ne propose plus Bitcoin en attendant.",
      payersTitle: "Pages de paiement de vos clients",
      payersLabel: "Transmettre mon nœud aux pages des payeurs",
      payersCaption:
        "Le navigateur de vos clients suit aussi leur paiement sur votre nœud, avec le même secours. Son adresse figure alors dans vos liens de paiement, et il reçoit l'adresse IP de vos clients.",
      payersHttpsOnly:
        "Pour un nœud joignable depuis Internet seulement, en https:// avec un nom de domaine : le navigateur de vos clients ne joint pas votre réseau local.",
      publicNotePayers:
        "L'heure d'envoi d'un paiement, qui fixe son cours, reste chez mempool.space : la même pour vous et vos clients.",
      publicNote:
        "La page de paiement de vos clients et l'heure d'envoi d'un paiement, qui fixe son cours, restent chez mempool.space : la même pour vous et vos clients.",
      savedTitle: "Nœud Bitcoin enregistré",
      savedOwn: "Vos appareils lisent la blockchain sur votre nœud",
      savedMempool: "Vos appareils lisent la blockchain sur mempool.space",
      confirmTitle: "Enregistrer ce nœud ?",
      confirmBody:
        "Il ne répond pas correctement depuis cet appareil. Depuis le réseau de votre commerce, il répondra peut-être.",
      confirmAction: "Enregistrer quand même"
    },
    // "Look up scanned products" of "Network".
    productLookup: {
      section: "Catalogue",
      title: "Rechercher les produits scannés",
      caption:
        "Sur Open Food Facts, qui reçoit le code-barres et l'adresse IP de l'appareil. Désactivé : vous saisissez le nom et la photo.",
      savedTitle: "Recherche des produits enregistrée",
      savedOn: "Le nom et la photo d'un produit scanné viennent d'Open Food Facts",
      savedOff: "Le nom et la photo d'un produit scanné sont à saisir"
    },
    save: "Enregistrer",
    close: "Fermer",
    logout: "Déconnexion",
    logoutTitle: "Se déconnecter de cet appareil ?",
    // What "Log out" loses (sign-out.ts): only this device's own choices, the rest is on the
    // account. A merchant's or a card holder's, in the apps (the app's lock) or on the web.
    logoutBody:
      "Vos données et vos fonds restent sur votre compte : votre passkey vous y reconnecte. Seuls les choix faits sur cet appareil reviennent par défaut : la barre de navigation, « $t(wallet.discreet) » dans le $t(navigation.destinations.wallet), « $t(settings.amountUnit.title) », « $t(settings.theme.title) », « $t(pos.mode.amount) » ou « $t(pos.mode.articles) » au $t(pos.title) et la biométrie pour déverrouiller l'app.",
    logoutBodyWeb:
      "Vos données et vos fonds restent sur votre compte : votre passkey vous y reconnecte. Seuls les choix faits sur cet appareil reviennent par défaut : la barre de navigation, « $t(wallet.discreet) » dans le $t(navigation.destinations.wallet), « $t(settings.amountUnit.title) », « $t(settings.theme.title) » et « $t(pos.mode.amount) » ou « $t(pos.mode.articles) » au $t(pos.title).",
    logoutBodyCard:
      "Vos données et vos fonds restent sur votre compte : votre passkey vous y reconnecte. Seuls les choix « $t(settings.amountUnit.title) » et « $t(settings.theme.title) » faits sur cet appareil reviennent par défaut.",
    logoutConfirm: "Se déconnecter",
    // "Contact support".
    support: {
      group: "Aide",
      section: "Support",
      description:
        "Une question, un problème : écrivez-nous. Le journal de l'app nous aide à comprendre ce qui s'est passé.",
      contact: "Contacter le support",
      attach: "Joindre le journal de l'app",
      attachCaption: "Événements techniques, sans montant ni adresse",
      reports: "Envoyer les rapports de plantage",
      // The switch's row, under the section named as "reports": what they hold, no repetition.
      reportsKinds: "Plantages et lenteurs",
      // Never "anonymous": a report carries the device's IP address and a pseudonymous id of the
      // installation (Expo Observe). A "payment" address: the IP address is sent.
      reportsCaption: "Aucun montant ni adresse de paiement",
      reportsSaveFailed: "Ce choix n'a pas pu être enregistré sur cet appareil. Réessayez.",
      subject: "Support sattle.me",
      body: "Bonjour,\n\nVotre question ou votre problème :\n\n\n",
      downloaded:
        "Le journal de l'app vient d'être téléchargé ({{file}}) : joignez-le à ce message.",
      attachDownloaded: "Joignez-y le journal téléchargé ({{file}})",
      notAttached: "Journal non joint au mail",
      deposited: "Le journal de l'app est envoyé chiffré au support, avec la référence ci-dessous.",
      notDeposited: "Journal non envoyé",
      noMailTitle: "Aucune app Mail sur cet appareil",
      addressCopied: "Adresse du support copiée : {{email}}",
      writeTo: "Écrivez-nous à {{email}}",
      shareTitle: "Journal de l'app",
      shareFailed: "Journal non partagé",
      failedTitle: "Mail non ouvert"
    },
    // "Delete account".
    delete: {
      section: "Supprimer le compte",
      description:
        "Efface le compte des relais Nostr et de cet appareil, et abandonne son adresse Lightning. Le portefeuille doit être vide.",
      button: "Supprimer le compte",
      employeesTitle_one: "Vous avez {{count}} employé",
      employeesTitle_other: "Vous avez {{count}} employés",
      employeesBody_one:
        "Il sera retiré du commerce : son appareil n'encaissera plus pour lui et l'oubliera à sa prochaine connexion.",
      employeesBody_other:
        "Ils seront retirés du commerce : leurs appareils n'encaisseront plus pour lui et l'oublieront à leur prochaine connexion.",
      integrationsTitle_one: "Vous avez {{count}} intégration",
      integrationsTitle_other: "Vous avez {{count}} intégrations",
      integrationsBody_one:
        "Elle sera retirée : son serveur ne pourra plus créer de facture pour le commerce.",
      integrationsBody_other:
        "Elles seront retirées : leurs serveurs ne pourront plus créer de facture pour le commerce.",
      assistantsTitle_one: "Vous avez {{count}} assistant IA",
      assistantsTitle_other: "Vous avez {{count}} assistants IA",
      assistantsBody_one: "Il sera retiré : il ne pourra plus faire de facture pour le commerce.",
      assistantsBody_other:
        "Ils seront retirés : ils ne pourront plus faire de facture pour le commerce.",
      removeAndContinue: "Retirer et continuer",
      confirmTitle: "Supprimer le compte ?",
      confirmBody:
        "Les réglages, l'équipe, les articles et les ventes enregistrées sont effacés des relais Nostr et de cet appareil, et l'adresse Lightning est abandonnée. C'est définitif. Le portefeuille, vide, reste accessible avec votre passkey.",
      confirm: "Supprimer définitivement",
      progressTitle: "Suppression du compte",
      progressHint: "Gardez l'app ouverte jusqu'à la fin.",
      steps: {
        wallet: "Vérification du portefeuille",
        team: "Retrait de l'équipe",
        reading: "Recherche des données sur les relais ({{done}}/{{total}})",
        deleting: "Effacement sur les relais ({{done}}/{{total}})",
        checking: "Vérification de l'effacement ({{done}}/{{total}})",
        device: "Effacement de cet appareil"
      },
      // On the welcome screen, once "Delete account" is done on this device (deleted-here.ts).
      deleted: "Votre compte a bien été supprimé",
      deletedElsewhere:
        "Le compte de {{business}} a été supprimé depuis un autre appareil : cet appareil l'a oublié.",
      alreadyRemoved: "L'adresse Lightning et l'équipe sont déjà retirées.",
      card: {
        description:
          "Efface le compte des relais Nostr et de cet appareil, et abandonne les adresses Lightning de vos cartes. Les cartes doivent être vides.",
        confirmBody:
          "Les réglages, les cartes et leurs paiements enregistrés sont effacés des relais Nostr et de cet appareil, et les adresses Lightning des cartes sont abandonnées. C'est définitif.",
        stepCards: "Vérification des cartes",
        alreadyRemoved: "Les adresses Lightning des cartes sont déjà abandonnées.",
        cardWallets:
          "Le portefeuille d'une de vos cartes, ou d'une carte supprimée, n'est pas vide, ou des sats y arrivent encore. Envoyez son solde ailleurs depuis « Cartes », puis réessayez.",
        walletFailed:
          "Le portefeuille d'une carte n'a pas pu être vérifié. Vérifiez votre connexion à internet, puis réessayez.",
        begun:
          "La suppression n'est pas terminée : les adresses Lightning des cartes sont déjà abandonnées, rien n'est effacé sur cet appareil. Vérifiez votre connexion à internet, puis réessayez."
      },
      failedTitle: "Compte non supprimé",
      errors: {
        balance:
          "Le portefeuille contient encore {{sats}} sats. Envoyez-les ailleurs, puis réessayez.",
        pendingPayments:
          "Un paiement du portefeuille est en cours. Réessayez une fois qu'il est terminé.",
        unclaimedDeposits:
          "Un dépôt onchain n'est pas encore crédité au portefeuille. Réessayez une fois qu'il l'est.",
        cardWallets:
          "Le portefeuille d'une de vos cartes, ou d'une carte supprimée, n'est pas vide, ou des sats y arrivent encore. Retirez son solde vers votre solde principal dans « Cartes », puis réessayez.",
        newerApp:
          "Une version plus récente de l'application a enregistré une carte de ce compte. Mettez l'application à jour, puis réessayez.",
        salesInProgress:
          "Des factures du commerce ne sont pas encore définitives. Réessayez une fois leur version finale publiée (jusqu'à 3 h après la fin d'une facture non payée).",
        walletFailed:
          "Le portefeuille n'a pas pu être vérifié. Vérifiez votre connexion à internet, puis réessayez.",
        unreachable:
          "Les relais Nostr n'ont pas répondu. Vérifiez votre connexion à internet, puis réessayez.",
        notDeleted:
          "Les relais Nostr n'ont pas confirmé l'effacement. Rien n'est effacé sur cet appareil : réessayez.",
        begun:
          "La suppression n'est pas terminée : l'adresse Lightning et l'équipe sont déjà retirées, rien n'est effacé sur cet appareil. Vérifiez votre connexion à internet, puis réessayez.",
        unfinished:
          "Suppression commencée mais pas terminée : les autres appareils du compte l'ont peut-être déjà oublié. Vérifiez votre connexion à internet, puis réessayez pour la finir.",
        deviceNotWiped:
          "Le compte est effacé des relais, mais pas tout ce que l'app gardait sur cet appareil."
      }
    },
    // Employee.
    yourProfile: "Votre profil",
    nameLocked: "Nom défini par votre employeur",
    addPhoto: "Ajouter une photo",
    changePhoto: "Changer la photo",
    removePhoto: "Retirer",
    relaysLocked: "Définis par votre employeur",
    leave: "Quitter le commerce",
    leaveTitle: "Quitter {{business}} ?",
    leaveBody:
      "Cet appareil n'encaissera plus pour ce commerce. Pour revenir, une nouvelle invitation sera nécessaire.",
    back: "Retour",
    // Notifications.
    splitSavedTitle: "Répartition enregistrée",
    splitSavedBank: "IBAN vérifié · {{percent}} en {{currency}}",
    splitSavedBitcoin: "Tout en bitcoin",
    relaysSavedTitle: "Relais enregistrés",
    relaysSavedBody: "Les appareils du commerce les suivent dès leur prochaine connexion.",
    // Saved once a relay took the change, else cancelled.
    nameSavedTitle: "Nom enregistré",
    currencySavedTitle: "Devise de référence enregistrée",
    onchainSavedTitle: "Paiements onchain enregistrés",
    onchainSavedOn: "Acceptés au Point de Vente, en plus de Lightning",
    onchainSavedOff: "Lightning seulement au Point de Vente",
    vatRate: "TVA par défaut",
    vatRateDescription:
      "Le taux de TVA des nouvelles lignes de facture, modifiable ligne par ligne.",
    vatRateField: "Taux de TVA (%)",
    vatRateHint: "Laissez vide pour le taux normal : {{rate}}",
    vatStandard: "{{rate}} (taux normal)",
    vatSavedTitle: "TVA par défaut enregistrée",
    vatInvalid: "Saisissez un taux entre 0 et 100 %",
    tolerance: "Tolérance de sous-paiement",
    toleranceDescription:
      "Un paiement onchain auquel il manque au plus ce pourcentage du montant compte comme payé. S'il manque davantage, le client doit régler tout le reste. Appliquée à vos ventes, factures et liens de paiement, y compris ceux de vos employés, intégrations et assistants IA. Jamais montrée à vos clients.",
    toleranceField: "Tolérance (%)",
    toleranceHint: "De 0 à 10 %, au dixième près. Vide ou 0 : aucune.",
    toleranceNone: "Aucune",
    toleranceSavedTitle: "Tolérance enregistrée",
    toleranceSaved: "{{rate}} pour les prochaines ventes et factures",
    toleranceSavedNone: "Aucune : le montant entier est demandé",
    toleranceInvalid: "Saisissez un pourcentage entre 0 et 10, au dixième près",
    logoSavedTitle: "Logo enregistré",
    address: {
      title: "Adresse du commerce",
      description: "Écrite sous le nom du commerce sur vos factures.",
      street: "Rue et numéro",
      postalCode: "NPA",
      city: "Localité",
      country: "Pays",
      savedTitle: "Adresse enregistrée"
    },
    numbers: {
      title: "Numéros d'entreprise",
      description:
        "Écrits sur vos factures, sous l'adresse du commerce. Leur nom suit le pays du commerce.",
      savedTitle: "Numéro enregistré"
    },
    photoSavedTitle: "Photo enregistrée",
    photoRemovedTitle: "Photo retirée",
    saveFailedTitle: "Erreur lors de l'enregistrement",
    failedTitle: "Réglage non enregistré",
    errors: {
      unpublished:
        "Trop peu de relais ont confirmé l'enregistrement : le changement est annulé. Vérifiez la connexion, puis réessayez.",
      newerBackup:
        "Une version plus récente de l'app a sauvegardé ce compte : le changement est annulé. Mettez l'app à jour, puis réessayez.",
      noAccount: "Déverrouillez l'app avec votre passkey, puis réessayez.",
      invalid: "Vérifiez la valeur saisie, puis réessayez.",
      unreachable: "Trop peu de relais ont répondu. Vérifiez la connexion, puis réessayez.",
      saveFailed: "Le réglage n'a pas pu être enregistré sur cet appareil. Réessayez.",
      denied: "Autorisez l'accès à vos photos dans les réglages de l'appareil, puis réessayez.",
      unreadable: "Cette image ne peut pas être utilisée. Choisissez-en une autre.",
      logoutFailed: "La déconnexion n'a pas abouti. Réessayez.",
      leaveFailed: "Cet appareil n'a pas pu quitter le commerce. Réessayez.",
      leaveUnreachable:
        "Le commerce n'a pas pu être prévenu de votre départ. Vérifiez votre connexion à internet, puis réessayez.",
      salesInProgress:
        "Des factures du commerce ne sont pas encore définitives. Réessayez une fois leur version finale publiée (jusqu'à 3 h après la fin d'une facture non payée).",
      integrationsPending:
        "Une intégration a un paiement en cours (une demande de paiement ouverte ou un paiement Bitcoin en confirmation). Réessayez une fois qu'il est terminé."
    },
    // "Split" and "Bank account": the sign-up's screens, from the settings.
    splitLead: "L'app vous proposera de vendre cette part de vos encaissements.",
    ibanRefused: "Vérifier les chiffres de l'IBAN"
  },
  // The list of relays.
  relays: {
    title: "Relais Nostr",
    lead: "Serveurs Nostr auxquels l'app se connecte, sur tous les appareils du commerce.",
    integrationsNotice:
      "Les intégrations de ce compte suivent au plus {{moves}} changements de relais depuis leur création. Au-delà, leur serveur ne les trouve plus : créez-les à nouveau et donnez les nouvelles clés à leurs intégrateurs.",
    add: "Ajouter un relais",
    addLead: "Saisissez l'adresse du relais.",
    address: "Adresse du relais",
    placeholder: "relais.exemple.ch",
    addConfirm: "Ajouter le relais",
    addShort: "Ajouter",
    removeLabel: "Retirer {{relay}}",
    keepOne: "Gardez au moins un relais.",
    tooMany: "Dix relais au plus : retirez-en un pour en ajouter un autre.",
    removeUnreachable: "Retirer le relais en rouge pour enregistrer.",
    // A relay that refuses the query of a key not its author's (relay-test.ts).
    restrictedRelay:
      "« Lecture refusée » : ce relais ne laisse lire les données qu'à celui qui les a écrites. Vos caisses, vos employés et vos clients ne pourraient pas les lire : choisissez-en un autre.",
    localNetworkBlocked:
      "Le navigateur bloque l'accès au réseau local pour ce site : autorisez « Réseau local » dans les paramètres du site (icône à gauche de l'adresse), puis testez à nouveau.",
    localNetworkNotAllowed:
      "L'accès au réseau local n'est pas encore autorisé pour ce site : testez à nouveau, puis autorisez-le quand le navigateur le demande. S'il ne demande rien, cet appareil n'atteint pas le relais : vérifiez qu'il est sur le même réseau ou sur Tailscale.",
    test: "Tester la connexion",
    status: {
      reachable: "Connecté",
      untested: "Non testé",
      testing: "Test en cours",
      unreachable: "Injoignable",
      restricted: "Lecture refusée"
    },
    statusLabel: "{{relay}}, {{status}}",
    // Under the address of a relay tested.
    statusDetail: "{{status}} · {{detail}}",
    noAnswer: "aucune réponse en {{duration}}",
    milliseconds: "{{value}}\u00a0ms",
    seconds: "{{value}}\u00a0s",
    errors: {
      incomplete: "Saisir une adresse complète",
      duplicate: "Saisir un relais absent de la liste",
      local: "Saisir l'adresse d'un relais public : localhost est cet appareil"
    },
    // Before the sign-in.
    advanced: "Réglages avancés",
    advancedLead:
      "Relais Nostr où cet appareil cherche votre compte et crée les nouveaux. Une fois connecté, ce sont ceux de votre compte.",
    // "Sign-up" of "Advanced settings".
    countryDetection: {
      section: "Inscription",
      title: "Détecter mon pays avec country.is",
      caption:
        "Seulement si le fuseau horaire ne suffit pas. country.is reçoit alors l'adresse IP de cet appareil. Désactivé : le pays vient des réglages de l'appareil.",
      saveFailed: "Ce choix n'a pas pu être enregistré sur cet appareil. Réessayez."
    }
  },
  pending: {
    title: "Bientôt disponible",
    description: "Cet écran n'est pas encore conçu."
  },
  // The sign-up answers saved on the device.
  merchantSettings: {
    /** Generated business name: this word, then 4 characters of the wallet id ("Commerce 7F3A"). */
    businessNameWord: "Commerce",
    saveFailed: "Vos réglages n'ont pas pu être enregistrés sur cet appareil. Réessayez."
  },
  /** "New invoice". */
  invoices: {
    newInvoice: "Nouvelle facture",
    // "Wallet"'s button on a phone, beside "Sell" in half the width: one word, its "+" icon tells
    // "new".
    newInvoiceShort: "Facture",
    // "Wallet"'s warning about an assistant (assistant-alerts.ts): "Remove the assistant" or "This
    // is expected" only.
    assistantAlert: {
      jumpTitle: "{{name}} a fait sauter la numérotation",
      jumpBody:
        "Ses factures s'arrêtent au n° {{from}}, mais son compteur annonce le n° {{to}} : les numéros entre les deux ont été pris sans facture. Si ce n'est pas expliqué, retirez cet assistant.",
      jumpBodyNone:
        "Il n'a fait aucune facture en {{year}}, mais son compteur annonce le n° {{to}} : ces numéros ont été pris sans facture. Si ce n'est pas expliqué, retirez cet assistant.",
      blockedTitle: "{{name}} bloque la numérotation",
      blockedBody:
        "Son compteur de numéros est d'un format que cette version de l'app ne lit pas : aucune facture ne peut recevoir de numéro. Mettez l'app à jour ; si elle l'est déjà, retirez cet assistant.",
      burstTitle: "{{name}} a fait beaucoup de factures",
      burstBody:
        "{{invoices}} factures en 24 heures. Si vous ne les avez pas demandées, retirez cet assistant : ses factures restent dans votre portefeuille.",
      remove: "Retirer l'assistant",
      normal: "C'est normal",
      removeFailedTitle: "Assistant pas retiré",
      removeFailed:
        "{{name}} n'a pas pu être retiré. Vérifiez votre connexion à internet, puis réessayez depuis la liste des intégrations"
    },
    title: "Nouvelle facture",
    back: "Revenir",
    saveDraft: "Enregistrer comme brouillon",
    draftSaved: "Facture enregistrée comme brouillon",
    draftSavedBody: "Retrouvez-la dans « À suivre »",
    linkNote: "Facture {{number}}",
    recipient: {
      title: "À qui adresser la facture ?",
      // "AI assistant" from "New invoice".
      assistant: "Faire vos factures avec une IA",
      name: "Raison sociale",
      street: "Rue et numéro",
      postalCode: "NPA",
      city: "Localité",
      country: "Pays"
    },
    preview: {
      title: "Aperçu du PDF",
      invoice: "Facture",
      date: "Date",
      due: "Échéance"
    },
    lines: {
      title: "Que facturez-vous ?",
      empty: "Aucun article sur cette facture",
      emptyLead:
        "Ajoutez ce que vous vendez : un article de votre catalogue ou une ligne saisie à la main.",
      add: "Ajouter un article",
      name: "Désignation",
      quantity: "Quantité",
      quantityShort: "Qté",
      unitPrice: "Prix unitaire",
      unitPriceShort: "Prix unit.",
      vatRate: "Taux de TVA",
      vat: "TVA",
      amount: "Montant",
      remove: "Supprimer",
      removeLine: "Supprimer la ligne",
      expand: "Modifier la ligne",
      summary: "{{quantity}} · TVA {{rate}}",
      net: "Sous-total hors taxes",
      vatOn: "TVA {{rate}} sur {{base}}",
      total: "Total",
      quantityInvalid: "Saisissez une quantité",
      priceInvalid: "Saisissez un prix",
      vatInvalid: "Saisissez un taux entre 0 et 100 %",
      tooLarge: "Le total dépasse le montant maximal d'une facture",
      incomplete: "À compléter",
      save: "Enregistrer dans mes articles",
      saved: "Enregistré dans mes articles"
    },
    picker: {
      title: "Ajouter un article",
      close: "Fermer",
      manual: "Saisir un article",
      manualDescription: "Désignation, quantité et prix libres",
      catalog: "Mes articles",
      loading: "Lecture de vos articles…",
      failed:
        "Vos articles n'ont pas pu être lus. Vérifiez votre connexion à internet, puis réessayez.",
      retry: "Réessayer",
      empty: "Aucun article pour l'instant. Ajoutez-en dans « Articles ».",
      convertFailed: "Le prix n'a pas pu être converti. Réessayez dans quelques instants"
    },
    sameName: {
      title: "Un article porte déjà ce nom",
      close: "Fermer",
      lead: "Mettez-le à jour avec le prix de cette ligne, ou créez un second article du même nom.",
      otherCurrency:
        "Cet article est vendu en {{currency}} : son prix ne peut pas prendre un montant en {{invoice}}. Créez un second article du même nom.",
      newPrice: "Prix de la ligne : {{price}}",
      update: "Mettre à jour l'article",
      duplicate: "Créer un doublon"
    },
    due: {
      title: "Payable jusqu'au <accent>{{date}}</accent>",
      lead: "Le lien de paiement reste ouvert jusqu'à l'échéance.",
      label: "Date d'échéance",
      previousMonth: "Mois précédent",
      nextMonth: "Mois suivant",
      close: "Fermer"
    },
    terms: {
      title: "Pour finir, les mentions administratives",
      conditions: "Conditions de paiement",
      legal: "Mentions légales",
      addRedirect: "Ajouter une URL de redirection",
      redirect: "URL de redirection",
      redirectInvalid: "Saisissez une adresse qui commence par https://",
      redirectHint:
        "Une fois la facture payée, votre client pourra revenir sur votre site (page de remerciement, suivi de commande…) d'un simple clic."
    },
    review: {
      title: "Vérifier la facture",
      client: "Client",
      articles: "Articles",
      due: "Échéance",
      notices: "Mentions administratives",
      noNotices: "Aucune mention",
      editRecipient: "Modifier le destinataire",
      editLines: "Modifier les articles",
      editDue: "Modifier l'échéance",
      editNotices: "Modifier les mentions administratives",
      create: "Créer la facture"
    },
    sent: {
      title: "Facture {{number}} créée",
      lead: "Envoyez-la à votre client. Le lien de paiement reste ouvert jusqu'au {{date}}.",
      mail: "Envoyer par mail",
      copy: "Copier le lien",
      copied: "Lien copié",
      share: "Partager",
      pdf: "Télécharger le PDF",
      newInvoice: "Nouvelle facture",
      view: "Voir la facture",
      close: "Fermer"
    },
    mail: {
      subject: "Facture {{number}} · {{business}}",
      body: "Bonjour,\n\nVeuillez trouver ci-dessous la facture {{number}} de {{business}}, d'un montant de {{amount}}, payable jusqu'au {{date}}.\n\nPour la régler en bitcoin : {{url}}\n\nMeilleures salutations\n{{business}}"
    },
    pdf: {
      invoice: "Facture",
      date: "Date",
      due: "Échéance",
      reference: "Votre référence",
      billedTo: "Facturé à",
      pay: "Payer en bitcoin",
      payHint: "Scannez le code QR, ou ouvrez le lien.",
      title: "Facture {{number}}"
    },
    detail: {
      totalDue: "Total dû",
      paid: "Montant payé",
      due: "Échéance",
      paidOn: "Payée le",
      rest: "Reste à payer",
      createdBy: "Créée par vous",
      recipient: "Destinataire",
      conditions: "Conditions et mentions",
      followUp: "Suivi",
      created: "Créée",
      sent: "Envoyée",
      paidEvent: "Payée",
      more: "Plus d'actions",
      remind: "Relancer par email",
      copyLink: "Copier le lien de paiement",
      duplicate: "Dupliquer",
      pdf: "Télécharger le PDF",
      cancel: "Annuler la facture",
      title: "Facture {{number}}",
      breadcrumb: "facture {{number}}",
      notFound:
        "Cette facture est introuvable. Elle a peut-être été supprimée sur un autre appareil.",
      reading: "Chargement de la facture…",
      readFailed:
        "La facture n'a pas pu être lue. Vérifiez votre connexion à internet, puis réessayez.",
      cancelDialog: {
        title: "Annuler la facture {{number}} ?",
        body: "Le lien de paiement ne proposera plus de payer. Un paiement déjà reçu reste dans votre portefeuille.",
        confirm: "Annuler la facture",
        keep: "Garder la facture"
      },
      canceled: "Facture annulée",
      cancelReceived: "Cette facture a déjà reçu un paiement : elle ne peut plus être annulée",
      cancelFailed:
        "La facture n'a pas pu être annulée. Vérifiez votre connexion à internet, puis réessayez"
    },
    draftDetail: {
      edit: "Modifier le brouillon",
      remove: "Supprimer le brouillon",
      removed: "Brouillon supprimé",
      removeDialog: {
        title: "Supprimer le brouillon {{number}} ?",
        body: "Il disparaît de tous vos appareils. Son numéro n'est pas réattribué.",
        confirm: "Supprimer le brouillon",
        keep: "Garder le brouillon"
      }
    },
    errors: {
      noAccount: "Déverrouillez l'application, puis réessayez",
      invalid: "Complétez la facture, puis réessayez",
      number:
        "Le numéro de la facture n'a pas pu être attribué. Vérifiez votre connexion à internet, puis réessayez",
      noWebApp: "Les liens de paiement ne sont pas encore disponibles dans cette version de l'app",
      noAddress:
        "Au-delà de {{max}} sats (le plafond Lightning moins une marge de {{margin}}), une facture doit avoir une adresse onchain, et aucune adresse Bitcoin n'est prête. Réessayez dans un instant",
      unverified:
        "Le plafond Lightning de la facture n'a pas pu être vérifié. Vérifiez votre connexion à internet, puis réessayez",
      unreachable:
        "La facture n'a pas pu être enregistrée. Vérifiez votre connexion à internet, puis réessayez",
      mailFailed: "Aucune messagerie n'a pu s'ouvrir. Copiez le lien de paiement à la place",
      pdfFailed: "Le PDF n'a pas pu être créé. Réessayez",
      copyFailed: "Le lien n'a pas pu être copié"
    }
  },
  /** The language of a document (an invoice's PDF and mail, an export): DocumentLanguage.tsx. */
  documentLanguage: {
    title: {
      mail: "Langue de l'email",
      pdf: "Langue du PDF",
      export: "Langue de l'export"
    },
    change: {
      mail: "Langue de l'email : {{language}}. Changer",
      pdf: "Langue du PDF : {{language}}. Changer",
      export: "Langue de l'export : {{language}}. Changer"
    },
    yours: "Votre langue"
  },
  currencies: {
    AUD: "dollars australiens",
    CAD: "dollars canadiens",
    CHF: "francs suisses",
    CZK: "couronnes tchèques",
    DKK: "couronnes danoises",
    EUR: "euros",
    GBP: "livres sterling",
    HKD: "dollars de Hong Kong",
    HUF: "forints hongrois",
    JPY: "yens japonais",
    MXN: "pesos mexicains",
    NOK: "couronnes norvégiennes",
    NZD: "dollars néo-zélandais",
    PLN: "zlotys polonais",
    SEK: "couronnes suédoises",
    SGD: "dollars de Singapour",
    USD: "dollars américains",
    ZAR: "rands sud-africains"
  },
  /** Currency names on their own (a column header, the currency picker), capitalised. */
  currencyNames: {
    AUD: "Dollars australiens",
    CAD: "Dollars canadiens",
    CHF: "Francs suisses",
    CZK: "Couronnes tchèques",
    DKK: "Couronnes danoises",
    EUR: "Euros",
    GBP: "Livres sterling",
    HKD: "Dollars de Hong Kong",
    HUF: "Forints hongrois",
    JPY: "Yens japonais",
    MXN: "Pesos mexicains",
    NOK: "Couronnes norvégiennes",
    NZD: "Dollars néo-zélandais",
    PLN: "Zlotys polonais",
    SEK: "Couronnes suédoises",
    SGD: "Dollars de Singapour",
    USD: "Dollars américains",
    ZAR: "Rands sud-africains"
  },
  businessNumbers: {
    company: {
      CH: "Numéro IDE",
      FR: "Numéro SIRET",
      DE: "Numéro fiscal (Steuernummer)",
      IT: "Code fiscal (codice fiscale)",
      ES: "NIF",
      PT: "NIF",
      FI: "Identifiant d'entreprise (Y-tunnus)",
      other: "Numéro d'entreprise"
    },
    vat: {
      CH: "Numéro TVA",
      EU: "Numéro de TVA intracommunautaire",
      other: "Numéro de TVA"
    }
  },
  // "What's new": the window the version's label opens (src/features/release-notes/).
  whatsNew: {
    title: "Nouveautés",
    open: "Nouveautés, {{build}}",
    openUnread: "Nouveautés, non lues, {{build}}",
    next: "Prochaine version",
    new: "Nouveau",
    source: "Code source",
    close: "Fermer",
    empty: "Les nouveautés de chaque version s'afficheront ici."
  }
};

export default fr;

type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };
export type Translations = DeepString<typeof fr>;
