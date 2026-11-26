import type { Translations } from "./fr";

const it: Translations = {
  common: {
    back: "Indietro",
    continue: "Continua",
    cancel: "Annulla",
    startCharging: "Inizia a incassare",
    version: "Versione {{version}}"
  },
  welcome: {
    headline: "Pagamenti in <accent>bitcoin</accent>.",
    lead: "Punto vendita, fatture e carte NFC.",
    guarantees: {
      nonCustodial: "Non custodial",
      noKyc: "Senza identificazione KYC",
      oneMinute: "In 1 minuto"
    },
    createAccount: "Crea il mio conto",
    login: "Accesso",
    joinInvitation: "Unisciti tramite invito",
    alreadyHave: "Ho già",
    have: {
      account: "Un conto sattle.me",
      invitation: "Un invito",
      boltCard: "Una BoltCard"
    },
    manageBoltCard: "Gestire la mia BoltCard",
    boltCardApp: {
      computer:
        "Un computer non legge le carte NFC. Scarica l'app sattle.me sul telefono: lì creerai il tuo account, poi avvicinerai la carta al telefono per programmarla.",
      device:
        "Questo dispositivo non legge le carte NFC. Scarica l'app sattle.me sul telefono: lì creerai il tuo account, poi avvicinerai la carta al telefono per programmarla.",
      browser:
        "Un browser non può programmare una carta. Apri o installa l'app sattle.me su questo telefono: lì creerai il tuo account, poi avvicinerai la carta al telefono per programmarla.",
      iphone: "iPhone",
      android: "Android",
      codeIphone: "Codice QR dell'app sattle.me sull'App Store",
      codeAndroid: "Codice QR dell'app sattle.me su Google Play",
      scan: "Scansiona il codice del tuo telefono con la sua fotocamera."
    },
    terms: "Continuando, accetti le <link>condizioni generali</link>."
  },
  legal: {
    terms: "Condizioni generali",
    privacy: "Informativa sulla privacy"
  },
  account: {
    passkeyWarning:
      "La tua passkey è la chiave del tuo portafoglio: eliminarla può rendere i tuoi fondi inaccessibili.",
    progress: {
      creating: "Creazione della tua passkey…",
      signingIn: "Accesso con la tua passkey…",
      preparing: "Preparazione del tuo conto…",
      restoring: "Recupero delle tue impostazioni…",
      terminal: "Preparazione del tuo punto vendita…"
    },
    cancelled: {
      title: "Passkey annullata",
      body: "Tocca di nuovo il pulsante per riprovare."
    },
    errors: {
      recoveryOverdue:
        "I tuoi pagamenti sono bloccati: verifica prima le tue 12 parole di recupero.",
      rescueClosed:
        "La modalità di soccorso si è chiusa: non è stato inviato nulla. Riaprila con le tue 12 parole.",
      unsupported:
        "Questo dispositivo o browser non può usare una passkey sattle.me. Usa un browser recente, oppure l'app su iPhone, iPad o Android.",
      prfUnsupported:
        "Il tuo gestore di passkey non è compatibile: usa l'app Password di Apple o il Gestore delle password di Google.",
      notAssociated:
        "Le passkey non sono ancora attive per questa versione dell'app. Riprova più tardi.",
      notConfigured: "Questa versione dell'app non è configurata per aprire un portafoglio.",
      cancelled: "Passkey annullata. Tocca di nuovo il pulsante per riprovare.",
      timedOut:
        "Tempo scaduto. Riprova, poi conferma con il volto, l'impronta digitale o il codice del dispositivo.",
      noCredential:
        "Nessuna passkey sattle.me è stata proposta su questo dispositivo. Verifica che le tue passkey siano sincronizzate su questo dispositivo.",
      noCredentialAndroid:
        "Nessuna passkey sattle.me è stata proposta su questo dispositivo. Verifica che il tuo gestore delle password non sia limitato dal risparmio batteria.",
      alreadyExists: "Su questo dispositivo esiste già una passkey: usa «$t(welcome.login)».",
      createdNotDerived:
        "La tua passkey è stata creata, ma non è stato possibile aprire il tuo portafoglio. Tocca «$t(welcome.createAccount)» per completare con questa passkey.",
      connectFailed:
        "Non è stato possibile aprire il tuo portafoglio. Controlla la connessione a internet, poi riprova.",
      settingsTooNew:
        "Le tue impostazioni sono state salvate da una versione più recente dell'app. Aggiorna l'app, poi riprova.",
      notFound: "Nessun account trovato con questa passkey sui relay Nostr di questo dispositivo.",
      terminalFailed:
        "Non è stato possibile preparare il tuo punto vendita. Verifica la connessione a internet, poi riprova.",
      deviceFailed:
        "Non è stato possibile preparare il tuo account su questo dispositivo. Riprova.",
      failed: "Si è verificato un errore. Riprova."
    }
  },
  noAccount: {
    title: "Nessun account trovato",
    unreachableTitle: "Relay irraggiungibili",
    answered: {
      all: "Nessun account è associato a questa passkey sui relay Nostr qui sotto.",
      some: "Nessun account è associato a questa passkey sui relay Nostr qui sotto che hanno risposto. Altri non hanno risposto: «$t(relays.test)» indica quali.",
      none: "Nessuno dei relay Nostr qui sotto ha risposto: impossibile sapere se un account è associato a questa passkey. Controlla la tua connessione a internet."
    },
    lead: "Hai scelto relay personalizzati per il tuo account? Aggiungili, salva, poi tocca «$t(welcome.login)». Se hai più passkey, verifica anche di aver scelto quella giusta."
  },
  // "Stay informed": the phone's notifications asked once, after the setup.
  notificationsOffer: {
    title: "Resta informato",
    lead: "Consenti le notifiche: sattle.me ti avvisa delle informazioni importanti, anche con l'app chiusa.",
    words: "Le tue 12 parole",
    wordsBody: "Un promemoria annuale per verificarle, per la tua sicurezza.",
    cards: "Le tue carte",
    cardsBody: "I pagamenti con carta che attendono la tua approvazione.",
    note: "Mai pubblicità. Potrai cambiare idea nelle impostazioni del telefono.",
    allow: "Consenti le notifiche",
    later: "Non ora"
  },
  recoveryCheck: {
    reminders: {
      channel: "Frase di recupero",
      startTitle: "È il momento di verificare le tue 12 parole",
      startBody:
        "È passato un anno: ridigitale in sattle.me per assicurarti che il tuo foglio sia ancora corretto.",
      weekTitle: "I tuoi pagamenti saranno bloccati tra 7 giorni",
      eveTitle: "I tuoi pagamenti saranno bloccati domani",
      soonBody: "Verifica le tue 12 parole in sattle.me per continuare a pagare.",
      dayTitle: "I tuoi pagamenti sono bloccati",
      dayBody: "Verifica le tue 12 parole in sattle.me per pagare di nuovo."
    },
    banner: {
      due: "La tua chiave di riserva non è verificata",
      daysLeft: "G−{{count}}",
      daysLeftLabel_one: "Ancora {{count}} giorno",
      daysLeftLabel_other: "Ancora {{count}} giorni",
      overdue: "Pagamenti bloccati: verifica le tue 12 parole",
      action: "Verifica le mie 12 parole"
    },
    title: "Verifica le tue 12 parole",
    intro: {
      title: "Tre casi in cui solo le tue 12 parole aiutano",
      lost: "Telefono perso o rubato",
      passkey: "Passkey cancellata",
      gone: "sattle.me non esiste più",
      lead: "In ciascuno, le tue 12 parole riaprono il tuo account e le tue carte. Senza di esse, i fondi sono persi.",
      key: "La passkey è la tua chiave di tutti i giorni. Le 12 parole sono la chiave di riserva, conservata a casa: ridigitale dal tuo foglio.",
      due_one: "Ancora {{count}} giorno per farlo.",
      due_other: "Ancora {{count}} giorni per farlo.",
      overdue: "I tuoi pagamenti sono bloccati fino a questa verifica.",
      optional:
        "Per ora non è dovuto nulla: questa verifica è una buona pratica, non blocca nulla.",
      start: "Inizia"
    },
    word: {
      progress: "Parola {{index}} di 12",
      label: "Qual è la parola {{index}}?",
      hint: "Le parole dell'elenco che iniziano così: nulla dice quale sia quella giusta.",
      unknown: "Questa parola non è nell'elenco: controlla come è scritta",
      next: "Parola successiva",
      previous: "Parola precedente",
      check: "Verifica"
    },
    lost: "Non le ho più",
    checking: "Verifica in corso…",
    done: {
      title: "Le tue 12 parole sono verificate",
      lead: "Conserva il tuo foglio in un luogo sicuro. La prossima verifica avverrà tra un anno, se il tuo account custodisce ancora più di 1000 CHF.",
      finish: "Fatto"
    },
    wrong: {
      title: "Queste parole non corrispondono",
      lead: "Almeno una parola è sbagliata, o due sono invertite. Riprendi il tuo foglio e ricomincia, oppure mostra le tue 12 parole.",
      again: "Ricomincia"
    },
    saveFailed:
      "Le tue parole sono giuste, ma non è stato possibile salvare la verifica. Controlla la tua connessione a internet, poi riprova.",
    retry: "Riprova"
  },
  rescue: {
    section: "Recupero",
    entry: "Apri con le mie 12 parole",
    entryLead:
      "Se la tua passkey non funziona più, le tue 12 parole di recupero aprono il tuo account per inviarne i fondi altrove.",
    words: {
      title: "Apri con le tue 12 parole",
      lead: "Digita la frase di recupero del tuo account, nell'ordine.",
      only: "Digita queste parole solo nell'app sattle.me. Nessuno te le chiederà, né via e-mail, né via messaggio, né al telefono.",
      label: "Le tue 12 parole",
      count_one: "{{count}} parola su 12",
      count_other: "{{count}} parole su 12",
      unknown: "La parola {{position}} non è nell'elenco: controlla come è scritta",
      checksum:
        "Queste 12 parole non formano una frase valida: controlla ciascuna di esse e il loro ordine",
      valid: "Frase completa e valida",
      submit: "Apri il mio account",
      opening: "Apertura del tuo account…",
      note: "Le tue parole non vengono né salvate né inviate: vengono dimenticate appena chiudi questa schermata.",
      failed:
        "Non è stato possibile aprire il tuo account. Controlla la tua connessione a internet, poi riprova."
    },
    badge: "Modalità di soccorso",
    funds: {
      title: "I tuoi fondi",
      lead: "Account aperto con le tue 12 parole. Invia i tuoi fondi a un altro portafoglio, poi chiudi.",
      leadWalletOnly:
        "Nessun relay di questo dispositivo conosce il tuo account: si apre solo il tuo portafoglio. Per ritrovare le tue carte, chiudi, poi cambia relay in «$t(relays.advanced)».",
      wallet: "Portafoglio",
      card: "Carta «{{name}}»",
      cardUnnamed: "Carta senza nome",
      former: "Vecchio portafoglio della carta «{{name}}»",
      formerUnnamed: "Vecchio portafoglio di una carta",
      reading: "Lettura…",
      unread: "Non ancora letto",
      empty: "Vuoto",
      arriving: "{{amount}} in arrivo",
      send: "Svuota",
      retry: "$t(wallet.retry)",
      cardsUnread:
        "Non è stato possibile leggere le tue carte sulla maggioranza dei tuoi relay: alcune potrebbero mancare. Riprova più tardi.",
      cardsFailed:
        "Non è stato possibile leggere le tue carte. Controlla la tua connessione a internet, poi riprova.",
      export: "Esporta la cronologia",
      close: "Chiudi",
      closeNote:
        "Chiudendo, questo dispositivo dimentica le tue 12 parole. I tuoi fondi restano dove sono."
    },
    drain: {
      title: "Svuota il portafoglio",
      intro:
        "Tutto il saldo del portafoglio va a un indirizzo lightning, bitcoin o Spark: digitalo, incollalo o scansionalo. Le commissioni sono prese da questo saldo.",
      introNoScan:
        "Tutto il saldo del portafoglio va a un indirizzo lightning, bitcoin o Spark: digitalo o incollalo. Le commissioni sono prese da questo saldo.",
      total: "Saldo del portafoglio",
      feesAbove: "Le commissioni superano il saldo del portafoglio a questa velocità",
      empty: "Questo portafoglio non contiene nulla da inviare.",
      confirm: "Invia tutto",
      done: "{{amount}} inviati: il portafoglio è vuoto.",
      pending: "Invio di {{amount}} partito: arriverà non appena sarà concluso.",
      failed: "L'invio non è andato a buon fine. Controlla il saldo del portafoglio, poi riprova."
    },
    closed: "La modalità di soccorso si è chiusa: riaprila con le tue 12 parole.",
    idle: {
      title: "Chiusura tra {{seconds}} s",
      body: "Senza attività, la modalità di soccorso si chiude e dimentica le tue 12 parole.",
      closed:
        "La modalità di soccorso si è chiusa dopo 5 minuti senza attività: digita di nuovo le tue 12 parole per riaprirla."
    }
  },
  migration: {
    amount: "{{btc}} (circa {{fiat}})",
    entry: "Migra il mio conto Swiss\u00a0Bitcoin\u00a0Pay",
    // Before the brand's wordmark (MigrateAccountEntry); `entry` is what screen readers say.
    entryLead: "Migra da",
    home: {
      badge: "Swiss\u00a0Bitcoin\u00a0Pay diventa sattle.me",
      title: "Buongiorno, {{business}}",
      titleUnnamed: "Buongiorno",
      titleManual: "Migra il tuo conto Swiss\u00a0Bitcoin\u00a0Pay",
      leadFound: "Abbiamo ritrovato il tuo conto. Tutto viene ripreso su sattle.me:",
      leadPassword:
        "Abbiamo ritrovato il tuo conto. Per riprendere i tuoi versamenti, la tua password Swiss\u00a0Bitcoin\u00a0Pay, un'ultima volta:",
      leadManual:
        "Accedi un'ultima volta al tuo conto Swiss\u00a0Bitcoin\u00a0Pay: la tua attività e i tuoi versamenti vengono ripresi su sattle.me, che non ha password.",
      payoutsReading: "Lettura…",
      payoutsAfterPassword: "Dopo la tua password",
      read: "Letto sul tuo conto Swiss\u00a0Bitcoin\u00a0Pay",
      money: "I tuoi soldi ti seguono: vengono trasferiti sul tuo nuovo account.",
      retry: "Riprova",
      migrate: "Migra"
    },
    login: {
      email: "E-mail",
      password: "Password",
      checking: "Accesso al tuo vecchio account…",
      forgotten: "Password dimenticata?",
      changed: "Ho già scelto una nuova password",
      note: "La tua password serve una sola volta e non viene mai conservata.",
      errors: {
        refused: "E-mail o password errata",
        unreachable: "Il tuo vecchio account non risponde. Controlla la connessione e riprova.",
        stopped:
          "Per non bloccare il tuo vecchio account, non riproviamo più con questa password. Scegline una nuova: ti inviamo un link per e-mail.",
        secondFactor:
          "Il tuo vecchio account chiede un codice di verifica, che sattle.me non può usare. Scrivici a {{email}}: ti aiuteremo ad aggiornare il tuo account."
      }
    },
    forgot: {
      title: "Password dimenticata",
      lead: "Indica l'e-mail del tuo vecchio account Swiss\u00a0Bitcoin\u00a0Pay: ti inviamo un link per scegliere una nuova password.",
      send: "Invia il link",
      sending: "Invio in corso…",
      invalidEmail: "Questo indirizzo e-mail non è valido",
      failed: "Non è stato possibile richiedere il link. Controlla la connessione e riprova.",
      sentTitle: "Controlla le tue e-mail",
      sent: "Se un account Swiss\u00a0Bitcoin\u00a0Pay usa {{email}}, gli è appena stata inviata un'e-mail. Apri il suo link per scegliere una nuova password.",
      sentNote:
        "Il link è valido 15 minuti. Non hai ricevuto nulla? Guarda nella posta indesiderata, oppure torna indietro per richiederlo di nuovo.",
      choose: "Scegli una nuova password"
    },
    password: {
      title: "Nuova password",
      lead: "Scegli la nuova password del tuo vecchio account Swiss\u00a0Bitcoin\u00a0Pay.",
      label: "Nuova password",
      rules: {
        length: "Almeno 8 caratteri",
        letter: "Almeno una lettera",
        digit: "Almeno una cifra"
      },
      met: "rispettato",
      unmet: "non ancora",
      save: "Salva",
      saving: "Salvataggio…",
      rejected: "Questa password non è accettata: controlla le regole qui sotto",
      failed: "Non è stato possibile cambiare la password. Controlla la connessione e riprova.",
      expired:
        "Questo link non è più valido: è già stato usato, oppure i suoi 15 minuti sono passati. Richiedine uno nuovo.",
      again: "Ricevi un nuovo link",
      doneTitle: "Password cambiata",
      done: "La tua nuova password è salvata. Accedi con essa per aggiornare il tuo account."
    },
    confirm: {
      currency: "Valuta",
      payouts: "Versamenti",
      payoutsToChoose: "Da scegliere dopo la creazione del conto",
      split: "{{bitcoin}} bitcoin · {{bank}} banca",
      allBitcoin: "{{percent}} bitcoin",
      bank: "Conto bancario",
      holder: "Intestatario",
      freeze:
        "Alla creazione del tuo conto sattle.me, il tuo vecchio account smette di incassare. I sats che ti deve vengono inviati subito in Lightning sul tuo conto sattle.me, o al più tardi alle 0:00\u00a0UTC se l'invio non riesce subito.",
      notMine: "Non è il mio account",
      migratedTitle: "Account già aggiornato",
      migrated:
        "«{{business}}» è passato a sattle.me il {{date}}. Apri il tuo conto sattle.me con la sua passkey.",
      logIn: "Accedi"
    },
    freeze: {
      settingTitle: "Vecchio account Swiss\u00a0Bitcoin\u00a0Pay",
      settingDescription:
        "Non è stato possibile congelare il tuo vecchio account alla fine dell'aggiornamento: incassa ancora, e il suo saldo non viene versato su sattle.me. Congelalo ora.",
      settingLead:
        "Accedi un'ultima volta al tuo vecchio account Swiss\u00a0Bitcoin\u00a0Pay: viene congelato, e i sats che ti deve vengono inviati subito in Lightning sul tuo conto sattle.me, o al più tardi alle 0:00\u00a0UTC.",
      settingStart: "Congela il mio vecchio account",
      running: "Chiusura del tuo vecchio account…",
      done: "Il tuo vecchio account Swiss\u00a0Bitcoin\u00a0Pay è congelato: non incassa più. Fondi trasferiti sul tuo nuovo portafoglio sattle.me.",
      doneNone:
        "Il tuo vecchio account Swiss\u00a0Bitcoin\u00a0Pay è congelato: non incassa più. Nessun saldo da trasferire.",
      donePending:
        "Il tuo vecchio account Swiss\u00a0Bitcoin\u00a0Pay è congelato: non incassa più. I fondi saranno trasferiti sul tuo nuovo portafoglio sattle.me al più tardi alle 0:00\u00a0UTC.",
      conflict:
        "Il tuo vecchio account era già stato aggiornato verso un altro conto sattle.me: è lì che viene versato il suo denaro. Se non sei stato tu, scrivici a {{email}}.",
      rejected:
        "Non è stato possibile congelare il tuo vecchio account. Scrivici a {{email}}: lo faremo insieme a te.",
      failed:
        "Non è stato possibile congelare il tuo vecchio account: incassa ancora. Controlla la connessione e riprova.",
      lost: "Non è stato possibile congelare il tuo vecchio account: incassa ancora. Scrivici a {{email}}: lo faremo insieme a te."
    },
    transfer: {
      prompt: "Apri il tuo vecchio portafoglio",
      running: "Trasferimento dei tuoi soldi…",
      retry: "Riprova",
      sentTitle: "{{amount}} in arrivo sul tuo nuovo account",
      sent: "Appariranno in «$t(navigation.destinations.wallet)» quando la rete li avrà confermati, di solito entro un'ora. Commissione di rete: {{fee}}.",
      more: "Altri {{amount}} sono in arrivo sul tuo vecchio account: potrai trasferirli da «$t(navigation.destinations.wallet)» una volta arrivati.",
      empty: "Il tuo vecchio portafoglio è vuoto: niente da trasferire.",
      waiting:
        "{{amount}} stanno arrivando sul tuo vecchio account: potrai trasferirli da «$t(navigation.destinations.wallet)» una volta arrivati.",
      tooSmall:
        "Il tuo vecchio portafoglio contiene {{amount}}, meno delle commissioni per trasferirli. Per ora restano dove sono.",
      unreadable:
        "Il tuo telefono non è riuscito ad aprire il tuo vecchio portafoglio. Riprova, oppure digita le sue 12 parole.",
      failed: "Il trasferimento non è riuscito. Controlla la connessione e riprova.",
      sheetTitle: "Trasferire il tuo vecchio portafoglio?",
      from: "Da",
      fromName: "Portafoglio Swiss Bitcoin Pay",
      fromCaption: "12 parole, su questo telefono",
      to: "A",
      toName: "Il tuo portafoglio sattle.me",
      amountLabel: "Importo",
      amountUnknown: "Letto al momento del trasferimento",
      sats: "{{sats}} sats",
      fiat: "circa {{fiat}}",
      eraseNote:
        "Le 12 parole verranno poi cancellate dalla memoria di questo telefono, trasferimento fatto o no.",
      start: "Trasferisci",
      skip: "Non trasferire",
      skipTitle: "Cancellare senza trasferire?",
      skipBody:
        "Le 12 parole del tuo portafoglio Swiss Bitcoin Pay verranno cancellate dalla memoria del telefono. I {{amount}} che contiene potranno essere recuperati solo con le 12 parole annotate su carta.",
      skipBodyUnknown:
        "Le 12 parole del tuo portafoglio Swiss Bitcoin Pay verranno cancellate dalla memoria del telefono. Ciò che contiene potrà essere recuperato solo con le 12 parole annotate su carta.",
      skipConfirm: "Ho le 12 parole,\ncancella senza trasferire",
      erased: "Le 12 parole sono state cancellate da questo telefono.",
      tooSmallErased:
        "Il tuo vecchio portafoglio contiene {{amount}}, meno delle commissioni per trasferirlo: resta dov'è.",
      skipped:
        "Le 12 parole sono state cancellate da questo telefono, senza trasferimento. Con le 12 parole annotate su carta puoi trasferire ciò che contiene.",
      eraseFailed: "Non è stato possibile cancellare le 12 parole da questo telefono. Riprova."
    },
    done: {
      title: "Il tuo account è aggiornato",
      todoTitle: "Ancora da fare, se ti riguarda",
      employees: "Invita di nuovo i tuoi dipendenti",
      shop: "Migra l'integrazione del tuo e-commerce",
      changes: "Cosa cambia",
      words:
        "Sul tuo vecchio portafoglio Swiss\u00a0Bitcoin\u00a0Pay restano {{amount}}. Trasferiscili con le 12 parole annotate alla sua creazione.",
      wordsUnknown:
        "Non è stato possibile verificare il tuo vecchio portafoglio Swiss\u00a0Bitcoin\u00a0Pay: potrebbe contenere ancora denaro. Trasferiscilo con le 12 parole annotate alla sua creazione.",
      checking: "Verifica del tuo vecchio portafoglio…",
      titleRunning: "Aggiornamento del tuo account",
      lead: "Di solito pochi secondi.",
      // The steps of the migration's end (MigrationTimeline, end-steps.tsx).
      steps: {
        account: "Account sattle.me creato",
        accountCaption: "«{{business}}» è pronta a incassare.",
        frozen: "Vecchio account congelato",
        frozenSent: "Non incassa più. Fondi trasferiti sul tuo nuovo portafoglio sattle.me.",
        frozenNone: "Non incassa più. Nessun saldo da trasferire.",
        frozenPending:
          "Non incassa più. I fondi saranno trasferiti sul tuo nuovo portafoglio sattle.me al più tardi alle 0:00\u00a0UTC.",
        migratedElsewhere: "Vecchio account già aggiornato",
        notFrozen: "Vecchio account non congelato",
        history: "Copia della tua cronologia",
        historyWaiting: "Appena il tuo vecchio account è congelato.",
        historyRunning: "Copia della tua cronologia…",
        historyRead_one: "{{formatted}} movimento letto",
        historyRead_other: "{{formatted}} movimenti letti",
        historyWritten_one: "{{copied}}\u00a0/\u00a0{{total}} movimento",
        historyWritten_other: "{{copied}}\u00a0/\u00a0{{total}} movimenti",
        historyCopied: "Cronologia copiata",
        historyCopiedCaption_one:
          "{{formatted}} movimento, visibile in «$t(navigation.destinations.wallet)».",
        historyCopiedCaption_other:
          "{{formatted}} movimenti, visibili in «$t(navigation.destinations.wallet)».",
        historyEmpty: "Nessun movimento da copiare.",
        historyNotCopied: "Cronologia non copiata",
        wallet: "Vecchio portafoglio"
      }
    },
    changes: {
      title: "Cosa cambia",
      lead: "Dalla creazione del tuo conto sattle.me:",
      frozen:
        "Una volta congelato, il tuo vecchio account Swiss\u00a0Bitcoin\u00a0Pay non incassa più nulla, né in cassa, né online, né sul suo indirizzo Lightning.",
      items: {
        employees: {
          title: "Invita di nuovo i tuoi dipendenti",
          caption:
            "I loro dispositivi non incassano più sul vecchio account. Invitali in «$t(navigation.destinations.employees)»: scansionano il tuo codice e incassano per te. Un dispositivo troppo vecchio per sattle.me non può più incassare."
        },
        shop: {
          title: "Migra l'integrazione del tuo e-commerce",
          caption:
            "Il tuo e-commerce non incassa più sul vecchio account. Crea un'integrazione in «$t(navigation.destinations.integrations)» e dai la sua chiave a chi gestisce il tuo sito."
        },
        limits: {
          title: "Niente più limiti",
          caption:
            "Grazie all'aggiornamento sattle.me 3.0.0, non ci sono più limiti né restrizioni legati alla verifica dell'identità."
        },
        money: {
          title: "Il tuo denaro ti segue",
          caption:
            "I sats che ti deve il vecchio account vengono inviati in Lightning sul tuo conto sattle.me con l'aggiornamento, qualunque fossero le tue vecchie impostazioni; se l'invio non riesce, viene ripetuto ogni notte alle 0:00\u00a0UTC. Quelli che arrivano ancora dopo seguono al loro regolamento. I bonifici bancari già in corso avvengono come di consueto."
        },
        cards: {
          title: "Trasferisci le tue carte",
          caption:
            "Avvicina ogni carta Swiss\u00a0Bitcoin\u00a0Pay in «$t(navigation.destinations.cards)» per trasferirne il saldo. Una carta non ancora trasferita funziona fino al {{cardEnd}}."
        },
        history: {
          title: "Il tuo storico è copiato",
          caption:
            "Le tue vendite, prelievi e commissioni sono copiati in «$t(navigation.destinations.wallet)», a titolo informativo. Sono nei suoi export CSV e PDF. Lo storico del tuo vecchio account resta consultabile ed esportabile su dashboard.swiss-bitcoin-pay.ch fino al {{merchantEnd}}."
        }
      }
    },
    // The copy of the v2 account's history (src/features/migration/history-import.ts).
    history: {
      running: "Copia della tua cronologia Swiss\u00a0Bitcoin\u00a0Pay in background…",
      // While reading the v2 server (its pages tell no total), then writing to the relays.
      reading_one:
        "Lettura della tua cronologia Swiss\u00a0Bitcoin\u00a0Pay: {{formatted}} movimento letto…",
      reading_other:
        "Lettura della tua cronologia Swiss\u00a0Bitcoin\u00a0Pay: {{formatted}} movimenti letti…",
      writing_one:
        "Copia della tua cronologia Swiss\u00a0Bitcoin\u00a0Pay: {{copied}}\u00a0/\u00a0{{total}} movimento…",
      writing_other:
        "Copia della tua cronologia Swiss\u00a0Bitcoin\u00a0Pay: {{copied}}\u00a0/\u00a0{{total}} movimenti…",
      done_one:
        "La tua cronologia è stata copiata: {{formatted}} movimento, visibile in «$t(navigation.destinations.wallet)».",
      done_other:
        "La tua cronologia è stata copiata: {{formatted}} movimenti, visibili in «$t(navigation.destinations.wallet)».",
      failed:
        "La copia della tua cronologia non è andata a buon fine. Riavviala da «$t(settings.title)», sezione «$t(settings.groups.account)».",
      settingTitle: "Cronologia Swiss\u00a0Bitcoin\u00a0Pay",
      settingDescription:
        "Copia in sattle.me le vendite, i prelievi e le commissioni del tuo vecchio conto, a titolo informativo. Possibile fino al {{date}}.",
      start: "Importa la mia cronologia",
      lead: "Accedi un'ultima volta al tuo vecchio conto Swiss\u00a0Bitcoin\u00a0Pay: la tua cronologia viene copiata in background.",
      note: "La tua password serve una sola volta e non viene mai conservata.",
      errors: {
        secondFactor:
          "Il tuo vecchio conto chiede un codice di verifica che sattle.me non può usare. Contatta l'assistenza.",
        stopped:
          "Per non bloccare il tuo vecchio conto, non riproviamo più. Verifica la tua password prima di riprovare più tardi.",
        unreachable: "Il tuo vecchio conto non risponde. Verifica la connessione e riprova."
      }
    },
    words: {
      open: "Digita le mie 12 parole",
      title: "Il tuo vecchio portafoglio",
      lead: "Digita in ordine le 12 parole annotate alla creazione del tuo portafoglio nell'app Swiss Bitcoin Pay. Il suo denaro sarà trasferito sul tuo conto sattle.me.",
      only: "Solo queste 12 parole: non digitare mai qui quelle di un altro portafoglio (Ledger, Trezor, BitBox o altro).",
      label: "Le tue 12 parole",
      invalid:
        "Queste parole non formano un portafoglio: controlla ciascuna di esse e il loro ordine",
      mismatch:
        "Queste parole non sono quelle del tuo portafoglio Swiss\u00a0Bitcoin\u00a0Pay: controlla ciascuna di esse e il loro ordine, poi digitale di nuovo",
      unused:
        "Queste parole non corrispondono a nessun portafoglio che abbia mai ricevuto denaro: controlla ciascuna di esse e il loro ordine, poi digitale di nuovo",
      submit: "Trasferisci",
      done: "Fatto",
      note: "Le tue parole servono una sola volta e non vengono mai conservate."
    },
    employee: {
      title: "Swiss Bitcoin Pay diventa sattle.me",
      lead: "Questo dispositivo incassava per un'attività. Per continuare, chiedi al responsabile di invitarti di nuovo da sattle.me, poi scansiona il suo codice.",
      leadBusiness:
        "Questo dispositivo incassava per «{{business}}». Per continuare, chiedi al responsabile di invitarti di nuovo da sattle.me, poi scansiona il suo codice.",
      join: "Scansiona l'invito",
      owner: "Sono il responsabile di questa attività"
    },
    wallet: {
      unchecked:
        "Il tuo vecchio portafoglio Swiss Bitcoin Pay è su questo telefono. Verifica se ci sono ancora soldi da trasferire.",
      check: "Verifica e trasferisci",
      funds: "Sul tuo vecchio account restano {{amount}}, da trasferire qui.",
      transfer: "Trasferisci",
      incoming:
        "{{amount}} stanno arrivando sul tuo vecchio account: potrai trasferirli una volta arrivati."
    }
  },
  split: {
    title: "Come vuoi essere pagato?",
    description:
      "L'app ti proporrà di vendere questa quota dei tuoi incassi. Modificabile in qualsiasi momento.",
    bitcoin: "Bitcoin",
    freeUntil: "Gratuito fino al {{date}}",
    sattleFee: "Commissione di sattle.me",
    sattleFeeScope: "Su tutto ciò che incassi, convertito o no",
    conversionFee: "Conversione in {{currency}}",
    conversionFeeScope: "Commissioni di vendita di Mt Pelerin, solo sulla quota convertita",
    extraFee: "+ {{fee}}",
    transferNote:
      "Bonifico gratuito da {{threshold}}. Sotto, le tue vendite vengono raggruppate fino a raggiungerlo, oppure versate subito per {{fee}}.",
    waivedRate: "{{free}} invece di {{fee}}",
    feeRange: "da {{min}} a {{max}}",
    sliderLabel: "Quota in bitcoin",
    sliderValue: "{{bitcoin}} in bitcoin, {{fiat}} in {{currency}}",
    currencyButton: "Valuta del bonifico: {{currency}}"
  },
  bank: {
    currentAccount: "Il conto registrato",
    currentAccountSub: "Presso Mt Pelerin, in questa valuta",
    editAccount: "Modifica questo conto",
    title:
      "Dove versare il <accent>{{percent}}</accent> convertito in <accent>{{currency}}</accent>?",
    transferSchedule: "Le tue vendite vi sono versate, raggruppate in un bonifico.",
    editableLater: "Queste informazioni restano modificabili nelle impostazioni.",
    country: "Paese di residenza",
    iban: "IBAN",
    ibanInvalid: "Verifica l'IBAN",
    holderKind: "Il titolare è",
    person: "Una persona",
    company: "Una società",
    companyName: "Ragione sociale",
    firstname: "Nome",
    lastname: "Cognome",
    address: "Indirizzo",
    addressPlaceholder: "Via e numero",
    postalCode: "NPA",
    postalCodePlaceholder: "1003",
    city: "Località",
    cityPlaceholder: "Lausanne",
    mtPelerin: {
      sheetTitle: "Conto Mt Pelerin",
      lead: "Questa quota viene venduta al nostro partner Mt Pelerin, intermediario finanziario svizzero, che vira l'importo sul tuo conto bancario.",
      accountTitle: "Il tuo conto presso il nostro partner",
      accountSms: "Il tuo numero di cellulare e un codice ricevuto per SMS, poi la tua e-mail",
      accountKey: "La chiave del tuo conto sattle.me, poi la tua e-mail e il tuo numero",
      bankTitle: "Il tuo conto bancario",
      bankSub: "Registrato presso il nostro partner, che vi vira le tue vendite",
      saleTitle: "Niente viene venduto senza di te",
      saleSub:
        "L'app ti propone di vendere questa quota, tu confermi con la tua passkey. Prima della prima vendita, un pagamento di 1 sat verifica il tuo portafoglio",
      connected: "Conto Mt Pelerin collegato: questo conto bancario vi sarà registrato",
      create: "Crea il mio conto Mt Pelerin",
      existing: "Ho già un conto Mt Pelerin",
      createTitle: "Crea il tuo conto",
      createLeadSms:
        "Con il tuo numero di cellulare, poi la tua e-mail. Un conto già aperto con questo numero viene ripreso.",
      createLeadKey: "Con la chiave del tuo conto sattle.me, poi la tua e-mail e il tuo numero.",
      existingTitle: "Collega il tuo conto",
      existingLeadSms: "Con il numero di cellulare del tuo conto.",
      existingLeadKey: "Con la chiave del tuo conto sattle.me."
    }
  },
  setup: {
    title: "Configurazione del tuo account…",
    description:
      "Preparazione del tuo indirizzo Lightning e del tuo punto vendita. Potrebbe volerci qualche istante.",
    cardDescription:
      "Preparazione del tuo account su questo dispositivo. Ci vuole solo un istante.",
    failedTitle: "Configurazione interrotta",
    retry: "Riprova"
  },
  appStores: {
    googlePlay: "Installa l'app da Google Play",
    appStore: "Installa l'app dall'App Store"
  },
  install: {
    banner: {
      name: "sattle.me",
      iphone: "L'app per iPhone, sull'App Store",
      ipad: "L'app per iPad, sull'App Store",
      android: "L'app per Android, su Google Play",
      computer: "In una finestra tutta sua, come un'app",
      get: "Ottieni",
      install: "Installa",
      dock: "Aggiungi al Dock",
      dismiss: "Chiudi, non proporre più"
    },
    setting: {
      title: "Installa l'app",
      places: {
        iphone: "L'app sattle.me per iPhone, sull'App Store.",
        ipad: "L'app sattle.me per iPad, sull'App Store.",
        android: "L'app sattle.me per Android, su Google Play.",
        computer: "sattle.me su questo computer, in una finestra tutta sua, come un'app.",
        dock: "sattle.me nel Dock di questo Mac, in una finestra tutta sua, come un'app."
      },
      appStore: "App Store",
      googlePlay: "Google Play"
    },
    dock: {
      title: "Aggiungi sattle.me al Dock",
      menu: "Dalla barra dei menu di Safari, scegli <strong>File > Aggiungi al Dock</strong>.",
      add: "Fai clic su <strong>Aggiungi</strong>: sattle.me si apre dal Dock, in una finestra tutta sua.",
      requirement: "Con Safari su macOS Sonoma o versioni successive.",
      passkey: "L'app del Dock ha i suoi dati: la prima volta, accedi di nuovo con la tua passkey.",
      done: "Ho capito"
    }
  },
  countryPicker: {
    search: "Cerca un paese",
    noResult: "Nessun paese trovato",
    close: "Chiudi"
  },
  currencyPicker: {
    title: "Valuta del bonifico",
    close: "Chiudi"
  },
  card: {
    computerTitle: "Aggiungi la tua <accent>carta</accent> dal telefono",
    computerDescription:
      "Un computer non legge le carte NFC. Scansiona questo codice con il telefono: apre l'app, dove accedi con la stessa passkey. Poi avvicina la carta al telefono.",
    computerCode: "Codice QR che apre questo passaggio nell'app sul tuo telefono",
    computerWaiting: "In attesa del telefono: questa pagina prosegue appena la carta è aggiunta.",
    // The same in the app on a device that reads no card (an iPad, useReadsCards.ts).
    deviceDescription:
      "Questo dispositivo non legge le carte NFC. Scansiona questo codice con il telefono: apre l'app, dove accedi con la stessa passkey. Poi avvicina la carta al telefono.",
    deviceDescriptionNoCode:
      "Questo dispositivo non legge le carte NFC. Apri l'app sul telefono e accedi con la stessa passkey, poi avvicina la carta al telefono.",
    deviceWaiting: "In attesa del telefono: questa schermata prosegue appena la carta è aggiunta.",
    addedTitle: "La tua <accent>carta</accent> è aggiunta",
    addedDescription:
      "Aggiunta dal telefono, compare anche qui, in « Carte ». Ricaricala per usarla.",
    webTitle: "Abbina la tua <accent>BoltCard</accent> dall'app",
    webDescription:
      "Un browser non può programmare una carta. Apri l'app sattle.me su questo telefono e accedi con la tua passkey: l'abbinamento riprenderà lì.",
    webDescriptionAndroid:
      "Un browser non può programmare una carta. Apri l'app Android sattle.me su questo telefono, o installala, poi accedi con la tua passkey: l'abbinamento riprenderà nell'app.",
    webDescriptionIphone:
      "Un browser non può programmare una carta. Apri l'app iPhone sattle.me su questo telefono, o installala, poi accedi con la tua passkey: l'abbinamento riprenderà nell'app.",
    retry: "Riprova",
    openSettings: "Apri le impostazioni",
    activationPending:
      "La tua carta è programmata, ma il suo relay non ha ancora risposto. Sarà attivata alla prossima apertura dell'app con una connessione: fino ad allora non può pagare.",
    activationNoPush:
      "La tua carta è pronta, ma questo telefono non riceve le notifiche di pagamento: paga solo quando l'app è aperta sullo schermo. Le notifiche si attiveranno da sole se questo telefono potrà riceverle.",
    failure: {
      noAccount: "La tua sessione è chiusa. Accedi di nuovo con la tua passkey, poi riprova.",
      nfcUnavailable:
        "L'NFC non è disponibile o è disattivato su questo dispositivo. Attivalo nelle impostazioni, poi riprova.",
      notificationsDenied:
        "Consenti le notifiche di sattle.me nelle impostazioni del telefono: è grazie a loro che il telefono sa che una cassa sta leggendo la tua carta.",
      relayUnreachable:
        "Il relay della carta non risponde. Controlla la connessione, poi riprova. La tua carta non è stata modificata.",
      relayIncompatible:
        "Il relay della carta non usa la versione prevista. La tua carta non è stata modificata.",
      relayTooLong: "L'indirizzo di questo relay è troppo lungo per una carta.",
      recordsUnreachable:
        "Troppo pochi relè del tuo conto rispondono. Controlla la connessione, poi riprova. La tua carta non è stata modificata.",
      notConfirmed:
        "I relè del tuo conto non hanno confermato questa modifica: potrebbe ancora applicarsi, oppure no. Controlla la connessione, poi riprova.",
      notBlank: "Questa carta non è vergine. Chiedi prima al suo emittente di reimpostarla.",
      ownCard:
        "Questa carta è già in « Carte ». Per aggiungerla di nuovo, eliminala prima, con la carta in mano.",
      notThisCard:
        "Questa non è la carta scelta, oppure è stata riprogrammata altrove. Non è stato modificato nulla: avvicina la carta giusta.",
      cardLost:
        "La carta si è allontanata troppo presto. Avvicinala di nuovo e tienila contro il telefono fino alla fine: l'abbinamento riprenderà da dove si era fermato.",
      notBoltCard: "Questa carta non è una BoltCard (NTAG 424 DNA).",
      verifyFailed:
        "La carta è stata programmata, ma la verifica non è riuscita. Avvicinala di nuovo per riprovare.",
      versionsExhausted:
        "Questa carta è stata programmata troppe volte con questo portafoglio. Usa un'altra carta.",
      newerApp: "Una versione più recente dell'app ha registrato questa carta. Aggiorna l'app.",
      walletNotEmpty:
        "Il portafoglio di questa carta non è vuoto, o vi stanno ancora arrivando dei sats. Preleva prima il suo saldo verso il tuo saldo principale: una carta eliminata non compare più da nessuna parte, né i suoi sats. La tua carta non è stata modificata.",
      walletUnavailable:
        "Il portafoglio di questa carta non ha risposto: una carta viene eliminata solo quando il suo portafoglio risulta vuoto. Controlla la connessione, poi riprova. La tua carta non è stata modificata.",
      cardGone:
        "Questa carta non è più in « Carte »: è stata eliminata. Non è stato modificato nulla.",
      deletionPending:
        "I relè del tuo conto non hanno ancora registrato l'eliminazione: la carta non è stata resa vergine.",
      migrationDrainFailed:
        "Questa volta non è stato possibile trasferire il saldo di questa carta, e la carta non è stata modificata: riprova tra un momento.",
      migrationOverDailyLimit:
        "Questo trasferimento supera il limite della carta: 1'000 CHF ogni 24 ore, comprese le spese recenti. Non è stato trasferito nulla e la carta non è stata modificata: riprova quando il saldo è sotto questo limite, oppure contatta il supporto.",
      migrationReceiptPending:
        "Il trasferimento è stato richiesto, ma non è stato possibile confermarne in tempo l'arrivo sul nuovo portafoglio. I tuoi sat potrebbero essere già in arrivo: « Carte » mostra la carta e il suo portafoglio. La carta non è stata modificata: attendi un momento, poi riprova.",
      migrationMasterKey:
        "Non è stato possibile ricodificare la carta: la sua chiave principale non è quella prevista. Ciò che è già stato trasferito è nel suo nuovo portafoglio, che « Carte » mostra. Riprova; se il problema persiste, contatta l'assistenza.",
      migrationNotWiped:
        "Non è stato possibile azzerare la carta. Ciò che è già stato trasferito è nel suo nuovo portafoglio, che « Carte » mostra. Riprova; se il problema persiste, contatta l'assistenza.",
      migrationCardDisabled:
        "Questa carta è bloccata sul servizio precedente: non può essere migrata. Se l'hai bloccata tu, sbloccala prima; altrimenti contatta l'assistenza. Non è stato modificato nulla.",
      migrationPaymentPending:
        "Un pagamento di questa carta è ancora in corso sul servizio precedente, spesso il trasferimento appena fatto: non può ancora essere cancellata. La carta non è stata modificata: riprova tra un istante, la migrazione riprenderà da dove si era fermata.",
      migrationServerUnreachable:
        "Lo scambio con il server di Swiss Bitcoin Pay, l'unico che può aprire questa carta, non è andato a buon fine. Controlla la connessione e tieni la carta contro il telefono, poi riprova: l'abbinamento riprenderà da dove si era fermato.",
      cancelled: "Abbinamento annullato.",
      failed: "L'abbinamento non è riuscito. Riprova."
    },
    nfcAlert: "Avvicina la tua BoltCard alla parte alta del telefono e tienila ferma.",
    nfcSuccess: "Carta abbinata",
    nfcFailure: "Abbinamento interrotto",
    notificationChannel: "Pagamenti con carta",
    decline: {
      newPayee:
        "Nuovo commerciante: il titolare deve approvarlo nella sua app sattle.me, poi presentare di nuovo la carta.",
      unidentifiedPayee:
        "Commerciante non identificato: il titolare deve confermare il pagamento nella sua app sattle.me.",
      unconfirmed: "Pagamento da confermare dal titolare nella sua app sattle.me.",
      notConfirmed: "Pagamento non confermato sul telefono del titolare.",
      refused: "Pagamento rifiutato dal titolare della carta.",
      insufficientBalance: "Saldo della carta insufficiente.",
      aboveLimit: "Importo superiore al limite per pagamento della carta.",
      dayLimit: "Limite della carta sulle 24 ore raggiunto.",
      hourLimit: "Troppi pagamenti con questa carta nell'ultima ora.",
      suspended: "Carta in pausa: il titolare può riattivarla nella sua app sattle.me.",
      invalidInvoice: "Fattura non valida per questa carta.",
      expired: "Fattura scaduta: creane una nuova.",
      noAmount: "Fattura senza importo: la carta paga solo un importo fisso.",
      outOfBounds: "Importo fuori dai limiti della carta (da 1 sat a 1 BTC).",
      alreadyPaid: "La carta non paga questa fattura: è già saldata.",
      invalidTap: "Lettura della carta non valida: presenta di nuovo la carta.",
      sendFailed:
        "Il pagamento non è partito, non è stato pagato nulla. Presenta di nuovo la carta.",
      uncertain:
        "Pagamento interrotto: può ancora arrivare, attendi qualche secondo prima di riprovare.",
      updateApp: "Il titolare deve aggiornare la sua app sattle.me.",
      superseded: "Una lettura più recente della carta ha sostituito questa.",
      other: "Non è stato possibile elaborare il pagamento."
    },
    payment: {
      title: "Pagamento con carta",
      close: "Chiudi",
      waiting: "Carta letta, in attesa della fattura della cassa…",
      checking: "Verifica del commerciante…",
      delay: {
        minute: "entro un minuto",
        seconds_one: "entro {{count}} secondo",
        seconds_other: "entro {{count}} secondi"
      },
      note: {
        newPayee: "Nuovo commerciante: verifica l'importo e il nome prima di pagare.",
        unidentifiedPayee:
          "La cassa non ha provato chi riceve questo pagamento: verifica l'importo con il commerciante.",
        unconfirmed: "Verifica l'importo e il commerciante."
      },
      pay: "Paga {{amount}}",
      decline: "Rifiuta",
      answerIn: "Rispondi entro {{seconds}} s",
      timeOut: "Tempo scaduto",
      timeLabel: "Tempo per rispondere",
      merchant: "Commerciante",
      noteLabel: "Nota",
      card: "Carta",
      exactAmount: "Importo esatto",
      approve: "Approva questo commerciante",
      approveCaption: "I suoi prossimi pagamenti partiranno senza conferma",
      joined: "{{first}} · {{second}}",
      ofCard: "carta {{name}}",
      confirming: "Conferma con la tua passkey…",
      paying: "Invio del pagamento…",
      payingAutomatically: "Invio del pagamento, senza conferma…",
      approved: "Questo commerciante fa ora parte dei tuoi commercianti approvati.",
      done: "Fine",
      doneIn: "Fine ({{seconds}} s)",
      failedTitle: "Pagamento non effettuato",
      nothingPaid: "Non è stato pagato nulla.",
      result: {
        completedTitle: "Pagamento effettuato",
        completedBody: "{{amount}} pagati con la tua carta.",
        completedBodyAutomatic: "{{amount}} pagati con la tua carta, senza conferma.",
        pendingTitle: "Pagamento inviato",
        pendingBody:
          "Il pagamento di {{amount}} è partito. Il suo stato appare nell'elenco dei movimenti.",
        failedTitle: "Pagamento non riuscito",
        failedBody:
          "Il pagamento di {{amount}} non è andato a buon fine. Il suo stato appare nell'elenco dei movimenti.",
        declinedTitle: "Pagamento rifiutato",
        declinedBody:
          "Hai rifiutato questo pagamento di {{amount}}. Non è stato pagato nulla; la cassa ne è informata."
      },
      failure: {
        unreachable:
          "Il relè della carta non risponde, oppure questo pagamento è scaduto. Non è stato pagato nulla.",
        ended:
          "La cassa non attende più questo pagamento. Non è stato pagato nulla: presenta di nuovo la carta se necessario.",
        invalidInvoice:
          "La cassa ha inviato una fattura che il tuo portafoglio non può pagare. Non è stato pagato nulla.",
        otherNetwork:
          "La fattura della cassa è di un'altra rete Bitcoin. Non è stato pagato nulla.",
        expired: "La fattura della cassa è scaduta. Non è stato pagato nulla.",
        noAmount:
          "La fattura della cassa non ha un importo in sats interi. Non è stato pagato nulla.",
        outOfBounds:
          "L'importo è fuori dai limiti di un pagamento con carta. Non è stato pagato nulla.",
        suspended: "Questa carta è in pausa. Non è stato pagato nulla.",
        alreadyPaid: "Questa fattura è già stata pagata. Non è stato pagato nulla di nuovo.",
        dayLimit:
          "Questo pagamento supererebbe il limite di 24 ore della tua carta. Non è stato pagato nulla.",
        hourLimit:
          "La tua carta ha raggiunto il numero di pagamenti per quest'ora. Non è stato pagato nulla.",
        aboveLimit: "L'importo supera il limite della tua carta. Non è stato pagato nulla.",
        notYourCard:
          "Questo pagamento non proviene da un tap della tua carta. Non è stato pagato nulla.",
        replayed: "Questo tap della tua carta è già stato usato. Non è stato pagato nulla.",
        unlock: "Il pagamento non è stato confermato. Non è stato pagato nulla.",
        insufficientBalance:
          "Il saldo della tua carta non basta per questo pagamento e la sua commissione. Non è stato pagato nulla: ricarica la carta in « Carte ».",
        sendFailed:
          "Il tuo portafoglio non ha potuto inviare questo pagamento, per esempio per saldo insufficiente. Non è partito nulla.",
        uncertain:
          "Il tuo portafoglio non ha confermato l'invio: il pagamento potrebbe essere partito. Controlla l'elenco dei movimenti prima di pagare in un altro modo.",
        newerApp:
          "Una versione più recente dell'app ha registrato la tua carta. Aggiorna l'app. Non è stato pagato nulla.",
        otherInvoice:
          "Il servizio del commerciante non riconosce questa fattura: potrebbe essere stata sostituita lungo il percorso. Non è stato pagato nulla.",
        settled:
          "Il servizio del commerciante indica che questa fattura è già pagata. Non è stato pagato nulla di nuovo.",
        newPayee:
          "Nessuna conferma {{delay}}: non è stato pagato nulla. La cassa è stata informata che questo nuovo commerciante va approvato nell'app.",
        newPayeeHomonym: "Nessuna conferma {{delay}}: non è stato pagato nulla.",
        unidentifiedPayee:
          "Nessuna conferma {{delay}}: non è stato pagato nulla. La cassa è stata informata che il commerciante non è identificato.",
        unconfirmed:
          "Nessuna conferma {{delay}}: non è stato pagato nulla. La cassa è stata informata.",
        late: "Il pagamento non è potuto partire {{delay}}. Non è stato pagato nulla.",
        failed: "Questo pagamento non ha potuto essere elaborato. Non è stato pagato nulla."
      }
    },
    payee: {
      quoted: "«{{name}}»",
      unnamed: "Nome sconosciuto",
      node: "Nodo {{node}}",
      by: {
        address: "identificato dal suo indirizzo Lightning",
        node: "identificato dal suo nodo Lightning"
      },
      nodeWarning:
        "Questo commerciante è identificato dal suo nodo Lightning, non dal suo indirizzo. Se questo nodo è condiviso (Spark, Wallet of Satoshi, Strike…), approvarlo approva anche tutti i suoi altri utenti: sarebbero pagati senza conferma, entro i limiti della carta.",
      formerName: "in precedenza «{{name}}»",
      localName: "nei tuoi commercianti: «{{name}}»",
      homonym:
        "Stesso nome di un commerciante già approvato, ma conto diverso: verifica prima di pagare.",
      chip: {
        approved: "Approvato il {{date}}",
        approvedUndated: "Approvato",
        new: "Nuovo commerciante",
        unidentified: "Commerciante non identificato",
        unchecked: "Non controllato (modalità automatica)"
      },
      declaredName: "{{name}}, nome dichiarato dal commerciante",
      declaredByNode: "{{name}}, nome dichiarato dal nodo"
    },
    notice: {
      title: "Pagamento con carta: {{amount}}",
      body: "{{amount}} a {{name}}",
      askTitle: "In attesa: Pagamento con carta",
      askBody: "{{amount}} a {{name}}. Clicca per confermare, la cassa attende.",
      askBodyUnchecked: "{{amount}}. Clicca per confermare, la cassa attende.",
      askBodyNoInvoice: "Clicca per confermare, la cassa attende.",
      refusedTitle: "Rifiutato: Pagamento con carta ({{amount}} a {{name}})",
      refusedTitleUnchecked: "Rifiutato: Pagamento con carta ({{amount}})",
      refusedTitleNoInvoice: "Rifiutato: Pagamento con carta",
      pausedBody: "{{card}} è in pausa. Non è stato pagato nulla."
    }
  },
  cards: {
    title: "Carte",
    locked: {
      title: "Le tue carte sono bloccate",
      body: "Sblocca l'app con la tua passkey per vedere e gestire le tue carte."
    },
    pairOnPhone:
      "Per associare una carta, apri l'app sul telefono: è lui che la programma, con la carta avvicinata.",
    pairOnAndroid:
      "Per associare una carta, usa l'app Android sattle.me: è lei che la programma, con la carta avvicinata al telefono.",
    pairOnIphone:
      "Per associare una carta, usa l'app iPhone sattle.me: è lei che la programma, con la carta avvicinata al telefono.",
    shop: {
      order: "Ordina carte",
      title: "Scegli la tua carta",
      lead: "Diversi design, da ordinare nel negozio sattle.me."
    },
    loading: "Caricamento delle tue carte…",
    failed: {
      noAccount: "La tua sessione è chiusa. Sblocca l'app con la tua passkey, poi riprova.",
      unreachable:
        "Le tue carte non hanno potuto essere lette: i relè del tuo conto non rispondono. Verifica la connessione, poi riprova."
    },
    retry: "Riprova",
    map: {
      title: "Dove pagare con la tua carta",
      source: "Lightning contactless · BTC Map",
      desktopSubtitle: "I negozi che accettano pagamenti Lightning contactless · mappa di BTC Map",
      openSite: "Apri btcmap.org",
      loading: "Caricamento della mappa…",
      failedTitle: "La mappa non si è caricata",
      failedBody:
        "BTC Map non risponde, oppure il dispositivo è offline. Verifica la connessione, poi riprova.",
      openInBrowser: "Apri btcmap.org nel browser",
      frameTitle: "Mappa BTC Map dei negozi che accettano pagamenti contactless"
    },
    unnamed: "Carta {{id}}",
    carousel: "Le tue carte",
    slot: "Carta {{n}} di {{count}}: {{label}}",
    add: "Aggiungi una carta",
    cardOf: "Carta {{name}}",
    order: {
      organize: "Organizza",
      organizeA11y: "Organizza le carte",
      title: "Ordine delle carte",
      lead: "Tieni premuta una maniglia e trascina. La prima carta appare all'apertura di «Carte», su tutti i tuoi dispositivi.",
      rowLead: "Trascina una carta al suo posto (o ← →). La prima appare all'apertura.",
      save: "Salva",
      cancel: "Annulla",
      close: "Chiudi",
      saved: "Ordine delle carte salvato",
      failedTitle: "Ordine non salvato",
      unsaved: "I relè del tuo conto non hanno risposto: verifica la connessione, poi riprova",
      newer: "È stato scelto in una versione più recente dell'app: aggiorna l'app per cambiarlo",
      moveUp: "Sposta su",
      moveDown: "Sposta giù",
      moveLeft: "Sposta a sinistra",
      moveRight: "Sposta a destra",
      row: "{{label}}, {{n}} di {{count}}",
      moved: "{{label}}, ora {{n}} di {{count}}",
      previous: "Carte precedenti",
      next: "Carte successive"
    },
    // "Add a card", in "Cards" and the sign-up (AddCardFlow.tsx).
    adding: {
      guide: {
        title: "Prima di iniziare",
        subtitle:
          "Una BoltCard vergine. Una carta della vecchia app viene migrata, con il suo saldo.",
        card: "Una BoltCard vergine",
        cardBody: "Una carta della vecchia app viene migrata, con il suo saldo.",
        notifications: "Le notifiche",
        notificationsBody:
          "Consentile quando il telefono lo chiede: è tramite loro che sa che una cassa legge la carta.",
        start: "Inizia"
      },
      web: {
        note: "Un computer non legge le carte NFC: una carta si aggiunge dall'app, sul telefono, con la carta in mano.",
        noteDevice:
          "Questo dispositivo non legge le carte NFC: una carta si aggiunge dall'app, sul telefono, con la carta in mano.",
        noteAndroid:
          "Un browser non può programmare una carta: una carta si aggiunge dall'app Android sattle.me, con la carta in mano.",
        noteIphone:
          "Un browser non può programmare una carta: una carta si aggiunge dall'app iPhone sattle.me, con la carta in mano.",
        where: "Contro il telefono",
        whereBody: "Tieni ferma la carta fino alla fine, qualche secondo.",
        code: "Codice QR che apre « Aggiungi una carta » nell'app sul telefono",
        scan: "Scansiona questo codice con il telefono: apre « Aggiungi una carta » nell'app."
      },
      steps: {
        label: "Passaggi dell'aggiunta",
        notifications: "Notifiche consentite",
        notificationsTodo: "Autorizzazione delle notifiche",
        notificationsRunning: "Notifiche in corso di autorizzazione",
        notificationsFailed: "Notifiche non consentite",
        notificationsCaption: "Così il tuo telefono sa che una cassa legge la carta",
        relay: "Relè della carta raggiungibile",
        relayTodo: "Verifica del relè della carta",
        relayRunning: "Relè della carta in corso di verifica",
        relayFailed: "Relè della carta non verificato",
        card: "Carta avvicinata",
        cardTodo: "Avvicinamento della carta",
        cardRunning: "In attesa della carta",
        cardFailed: "Carta non riconosciuta",
        cardIos: "Sopra il telefono, fino alla conferma",
        cardAndroid: "Contro il retro del telefono, fino alla vibrazione",
        programming: "Carta programmata",
        programmingTodo: "Programmazione della carta",
        programmingRunning: "Carta in corso di programmazione",
        programmingFailed: "Carta non programmata",
        programmingCaption: "Non muovere la carta",
        activating: "Carta attivata",
        activatingTodo: "Attivazione della carta",
        activatingRunning: "Carta in corso di attivazione",
        activatingFailed: "Carta non attivata",
        activatingPending: "Attivazione da completare",
        activatingCaption: "Il relè registra questo telefono",
        prepTitle: "Preparazione…",
        prepSubtitle: "Due verifiche prima della carta",
        holdIos: "Tieni la carta sopra il telefono",
        holdAndroid: "Tieni la carta contro il retro del telefono",
        holdSubtitle: "Una BoltCard vergine",
        keepTitle: "Tieni ferma la carta",
        keepSubtitle: "Programmazione per il tuo portafoglio",
        almostTitle: "Quasi fatto",
        almostSubtitle: "Puoi allontanare la carta",
        doneTitle: "Carta aggiunta",
        doneSubtitle: "Ricaricala per usarla",
        failedTitle: "L'aggiunta non è riuscita",
        failedNothing: "Sulla carta non è stato scritto nulla",
        failedGoesOn: "Riprenderà da dove si è fermata",
        notificationsDenied: "Notifiche rifiutate",
        notificationsDeniedCaption: "Consentile nelle impostazioni del telefono, poi riprova.",
        nfcUnavailable: "NFC non disponibile",
        lost: "Carta allontanata troppo presto",
        lostIos:
          "Avvicinala di nuovo e tienila ferma fino alla conferma: l'aggiunta riprenderà da dove si è fermata.",
        lostAndroid:
          "Avvicinala di nuovo e tienila ferma fino alla vibrazione: l'aggiunta riprenderà da dove si è fermata.",
        relayUnreachable: "Relè irraggiungibile",
        relayUnreachableCaption:
          "{{host}} non risponde: controlla la connessione di questo telefono, poi riprova",
        relayIncompatible: "Relè incompatibile",
        relayIncompatibleCaption:
          "{{host}} non parla la versione attesa: aggiorna l'app, poi riprova",
        recordsUnreachable: "Relè del conto irraggiungibili",
        recordsUnreachableCaption:
          "Troppo pochi relè del tuo conto rispondono: controlla la connessione di questo telefono, poi riprova",
        notBlank: "Carta non vergine",
        notBoltCard: "Carta non compatibile",
        notBoltCardCaption:
          "Questa carta non è una BoltCard (NTAG 424 DNA): avvicina una BoltCard vergine",
        ownCard: "Carta già aggiunta",
        verifyFailed: "Verifica non riuscita",
        cancelled: "Lettura della carta annullata",
        failed: "L'aggiunta non è riuscita: riprova",
        recharge: "Ricarica la carta",
        later: "Più tardi",
        cancel: "Annulla",
        stateTodo: ": da fare",
        stateRunning: ": in corso",
        stateDone: ": fatto",
        stateFailed: ": non riuscito",
        stateWarning: ": da verificare"
      },
      migration: {
        heading: "Migrazione della carta",
        foundTitle: "Carta Swiss Bitcoin Pay rilevata",
        toTransfer: "Saldo da trasferire",
        reading: "Lettura del saldo…",
        amountA11y: "{{amount}} sats",
        whatLabel: "Cosa succederà",
        whatTransfer: "Il suo saldo viene trasferito sul portafoglio della carta, nella tua app.",
        whatErase:
          "Avvicini la carta una seconda volta: viene cancellata, poi programmata per il tuo portafoglio.",
        whatVisual: "Mantiene la sua grafica e il suo numero.",
        confirm: "Trasferisci e migra",
        label: "Passaggi della migrazione",
        transferred: "Saldo trasferito",
        transferTodo: "Trasferimento del saldo",
        transferRunning: "Saldo in corso di trasferimento",
        recognized: "Carta riconosciuta",
        recognizedTodo: "Riconoscimento della carta",
        recognizedRunning: "Carta in corso di riconoscimento",
        recognizedFailed: "Carta non riconosciuta",
        recognizedCaption: "Il suo portafoglio conserva ciò che ha già trasferito",
        nothingCaption: "Nessun saldo da trasferire",
        receivedCaption: "{{amount}} ricevuti",
        sendingCaption: "{{amount}} in arrivo",
        heldSecond: "Carta avvicinata una seconda volta",
        heldSecondTodo: "Avvicinamento della carta una seconda volta",
        heldAgain: "Carta avvicinata ancora una volta",
        heldAgainTodo: "Avvicinamento della carta ancora una volta",
        programmed: "Carta cancellata e programmata",
        programmedTodo: "Cancellazione e programmazione della carta",
        programmedRunning: "Carta in corso di cancellazione e programmazione",
        activated: "Carta attivata",
        doneTitle: "Carta migrata",
        doneSubtitle: "Ora paga dal proprio portafoglio, entro i suoi limiti.",
        doneSubtitleVisual:
          "Mantiene la sua grafica e il suo numero, e ora paga dal proprio portafoglio, entro i suoi limiti.",
        failedTitle: "La migrazione non è riuscita",
        failedGoesOn: "Riprenderà da dove si è fermata",
        failed: "La migrazione non è riuscita: riprova",
        notTransferred: "Saldo non trasferito",
        transferUnconfirmed: "Trasferimento non confermato",
        lostIos:
          "Avvicinala di nuovo e tienila ferma fino alla conferma: la migrazione riprenderà da dove si è fermata.",
        lostAndroid:
          "Avvicinala di nuovo e tienila ferma fino alla vibrazione: la migrazione riprenderà da dove si è fermata.",
        transferTitle: "Trasferimento del saldo",
        transferSubtitle:
          "{{amount}} vanno sul portafoglio della carta. Tieni la carta a portata di mano.",
        keepTitle: "Tieni ferma la carta",
        keepSubtitle: "Cancellazione e programmazione: non muoverla.",
        almostTitle: "Quasi fatto",
        almostSubtitle: "Puoi allontanare la carta.",
        holdSecond: "Avvicina la carta una seconda volta",
        holdAgain: "Avvicina la carta ancora una volta",
        holdSubtitleIos:
          "Sopra il telefono, fino alla conferma: verrà cancellata, poi programmata.",
        holdSubtitleAndroid:
          "Contro il retro del telefono, fino alla vibrazione: verrà cancellata, poi programmata.",
        finish: "Fine"
      }
    },
    // "Cards", the screen.
    home: {
      firstCard: "Aggiungi la tua prima carta",
      newCard: "Nuova carta",
      addLead:
        "Una BoltCard vergine paga dal proprio portafoglio self-custodial, che ricarichi qui.",
      steps: {
        program: {
          title: "Programmala",
          caption: "Avvicina la carta vergine al telefono: è lui che la programma."
        },
        recharge: {
          title: "Ricaricala",
          caption: "Ha un proprio portafoglio: inviale i sats che potrà spendere."
        },
        pay: {
          title: "Paga con un gesto",
          caption: "Avvicinala al terminale di un esercente: paga, entro i limiti che scegli."
        }
      },
      reading: "Lettura del saldo…",
      received: "{{amount}} ricevuti",
      balanceA11y: "Saldo della carta: {{amount}} sats",
      withdraw: "Preleva",
      withdrawA11y: "Preleva dalla carta",
      history: "Cronologia",
      rechargeA11y: "Ricarica la carta",
      historyCaption: "Tutti i movimenti della carta",
      withdrawEmpty: "Niente da prelevare",
      sendCaption: "Verso un altro portafoglio",
      sendCaptionMain: "Verso un altro portafoglio o il mio saldo principale",
      migratingNote:
        "La migrazione di questa carta non è terminata: non paga ancora. Ciò che ha già trasferito è nel suo portafoglio, qui sotto.",
      finishMigration: "Completa la migrazione",
      finishOnPhone: "Completala nell'app sul telefono, con la carta avvicinata.",
      security: "Sicurezza",
      pause: "Metti in pausa",
      pauseCaption: "Rifiuta ogni pagamento, senza dimenticare nulla. L'interruttore la riattiva.",
      limits: "Limiti",
      payees: "Pagamenti senza conferma",
      payeesReading: "Lettura…",
      payeesPending: "non ancora sui relè",
      payeesUnread: "Non ancora letto",
      payeesNewer: "Aggiorna l'app",
      card: "Carta",
      customize: "Personalizza",
      customizeCaption: "Nome e aspetto",
      customizeIssuer: "Nome · grafica dell'emittente",
      relay: "Relè e programmazione",
      advanced: "Impostazioni avanzate",
      advancedRelayReady: "Relè pronto",
      delete: "Elimina la carta",
      deleteCaption: "La carta e tutti i suoi dati spariscono dall'app",
      deleteUnread: "Prima va letto il suo saldo"
    },
    // "Limits".
    limits: {
      edit: "Modifica",
      back: "Torna ai limiti",
      reading: "Lettura dei pagamenti…",
      unread:
        "I relè del tuo conto non hanno risposto: ciò che la carta ha già pagato non è mostrato.",
      unreadPhone:
        "I pagamenti di questo telefono non hanno potuto essere letti: ciò che la carta ha già pagato non è mostrato.",
      notePhone:
        "In base ai pagamenti fatti da questo telefono. Le finestre scorrono: ogni pagamento si libera 24 h (o 1 h) dopo.",
      noteWeb:
        "In base ai pagamenti della carta conservati dai relè del tuo conto. Le finestre scorrono: ogni pagamento si libera 24 h (o 1 h) dopo.",
      at: "alle {{time}}",
      tomorrowAt: "domani alle {{time}}",
      on: "il {{date}}",
      confirm: "Conferma con la mia passkey",
      fiatHint: "Cioè {{fiat}} al tasso attuale · {{max}} sats al massimo",
      satsHint: "{{max}} sats al massimo",
      countHint: "{{max}} al massimo",
      preview: {
        reached: "Limite raggiunto",
        hourLeft_one: "Ancora {{count}} pagamento",
        hourLeft_other: "Ancora {{count}} pagamenti",
        hourNext: "Prossimo pagamento possibile {{when}}"
      },
      day: {
        title: "In 24 ore",
        of: "su {{max}} sats",
        limit: "Limite: {{max}} sats",
        left: "Ancora {{amount}} sats, cioè {{fiat}}",
        leftSats: "Ancora {{amount}} sats",
        reached: "Limite raggiunto: la carta rifiuta ogni pagamento",
        release: "{{amount}} sats si liberano {{when}}",
        lead: "Un pagamento che, con quelli delle ultime 24 ore, superasse questo limite viene rifiutato.",
        used: "Già usati: {{amount}} sats.",
        field: "Limite in 24 ore",
        belowUsed:
          "Hai già usato {{amount}} sats: la carta rifiuterà ogni pagamento finché la finestra non si libera.",
        belowPayment:
          "Inferiore al limite per pagamento ({{amount}} sats): sarà questo limite di 24 h a limitare ogni pagamento."
      },
      hour: {
        title: "Quest'ora",
        of_one: "pagamento su {{max}}",
        of_other: "pagamenti su {{max}}",
        limit_one: "Limite: {{count}} pagamento all'ora",
        limit_other: "Limite: {{count}} pagamenti all'ora",
        release: "Il pagamento delle {{paid}} si libera {{when}}",
        reached: "Limite raggiunto: prossimo pagamento possibile {{when}}",
        formTitle: "Pagamenti all'ora",
        lead: "Un pagamento che, con quelli dell'ultima ora, superasse questo numero viene rifiutato.",
        used_one: "Già in quest'ora: {{count}} pagamento.",
        used_other: "Già in quest'ora: {{count}} pagamenti.",
        field: "Pagamenti all'ora",
        belowUsed_one:
          "Hai già fatto {{count}} pagamento in quest'ora: la carta rifiuterà ogni pagamento finché la finestra non si libera.",
        belowUsed_other:
          "Hai già fatto {{count}} pagamenti in quest'ora: la carta rifiuterà ogni pagamento finché la finestra non si libera."
      },
      payment: {
        title: "Per pagamento",
        caption: "Un pagamento più alto viene rifiutato",
        lead: "Un pagamento superiore a questo limite viene rifiutato.",
        field: "Limite per pagamento",
        aboveDay:
          "Superiore al limite in 24 ore ({{amount}} sats): sarà il limite di 24 h a limitare ogni pagamento."
      }
    },
    // "Customize": a card's "Name" and "Look".
    customize: {
      title: "Personalizza la carta",
      name: "Nome",
      clear: "Cancella il nome",
      taken:
        "Un'altra delle tue carte si chiama già {{name}}. Un nome diverso le distingue al momento di pagare.",
      look: "Aspetto",
      lookKind: "Tipo di aspetto",
      color: "Colore",
      image: "Immagine",
      // Read by screen readers only.
      colors: {
        ink: "Inchiostro",
        night: "Notte",
        plum: "Prugna",
        bordeaux: "Bordeaux",
        fir: "Abete",
        lagoon: "Laguna",
        copper: "Rame",
        bitcoin: "Bitcoin"
      },
      choosePhoto: "Scegli una foto",
      chooseImage: "Scegli un'immagine",
      takePhoto: "Scatta una foto",
      imageNote: "La ritaglierai poi nel formato della carta. Sostituirà il colore.",
      errors: {
        photoDenied:
          "Consenti l'accesso alle foto nelle impostazioni del dispositivo, poi riprova.",
        cameraDenied:
          "La fotocamera non si apre. Consentila nelle impostazioni del dispositivo, poi riprova.",
        unreadable: "Questa immagine non può essere usata. Scegline un'altra.",
        imageUnpublished:
          "Non è stato possibile salvare l'immagine sui relè del tuo account. Verifica la connessione, poi riprova.",
        failed: "Non è stato possibile modificare la carta. Riprova."
      }
    },
    // "Frame the image".
    frame: {
      title: "Ritaglia l'immagine",
      hint: "Trascina per spostare, pizzica o usa i pulsanti per lo zoom.",
      hintWeb: "Trascina l'immagine per spostarla; la rotella o i pulsanti la ingrandiscono.",
      area: "Immagine da ritagliare",
      zoomValue: "Zoom {{zoom}}",
      zoomIn: "Ingrandisci",
      zoomOut: "Riduci",
      moveLeft: "Sposta l'immagine a sinistra",
      moveRight: "Sposta l'immagine a destra",
      moveUp: "Sposta l'immagine in alto",
      moveDown: "Sposta l'immagine in basso",
      use: "Usa questa immagine"
    },
    status: {
      active: "Attiva",
      suspended: "In pausa",
      migrating: "Migrazione da completare"
    },
    sync: {
      ready: "Pronta",
      noPush: "Senza notifiche",
      unreachable: "Relè irraggiungibile",
      refused: "Errore del relè"
    },
    onPhone: {
      label: "Sul tuo telefono",
      openApp: "Apri sattle.me sul tuo telefono",
      openAppScan: "Oppure scansiona questo codice con il telefono: apre « Carte » nell'app.",
      hold: "Avvicina la carta al telefono",
      code: "Codice QR che apre « Carte » nell'app sul tuo telefono"
    },
    relay: {
      checking: "Verifica della carta…",
      readyTitle: "La carta è pronta",
      readyBody:
        "Il suo relè, {{host}}, sveglia questo telefono a ogni pagamento. Non detiene né chiavi né fondi.",
      stateTitle: "Stato della carta",
      reachable: "Relè raggiungibile",
      defaultCaption: "{{host}}, relè predefinito",
      programmed: "Carta programmata per questo relè",
      programmedCaption: "I suoi prossimi tap vi sono attesi",
      notWoken: "Questo telefono non viene svegliato",
      notWokenCaption:
        "Notifiche disattivate: la carta paga solo quando l'app è aperta su questo telefono.",
      noTokenCaption:
        "Questo telefono non riceve le notifiche di pagamento: la carta paga solo quando l'app è aperta su questo telefono.",
      enableNotifications: "Attiva le notifiche",
      unreachable: "Relè irraggiungibile",
      unreachableCaption:
        "{{host}} non ha risposto a questo telefono: la carta non può pagare finché non risponde.",
      refused: "Errore del relè",
      refusedCaption:
        "{{host}} ha rifiutato il canale della carta: non può pagare finché lo rifiuta.",
      uncheckedTitle: "Stato non verificato",
      uncheckedCaption:
        "Non è stato possibile leggere lo stato della carta su questo telefono. Riprova tra un istante.",
      change: "Cambia relè",
      changeCaption: "Per un relè che ospiti tu stesso",
      sourceLink: "sattleme/relay su github.com",
      webCaption:
        "Sveglia il tuo telefono a ogni pagamento della carta, senza detenere né chiavi né fondi.",
      webNote:
        "Un computer non legge le carte NFC: la carta si programma dall'app, su un telefono.",
      webNoteAndroid:
        "Un browser non può programmare una carta: si programma dall'app Android sattle.me.",
      webNoteIphone:
        "Un browser non può programmare una carta: si programma dall'app iPhone sattle.me.",
      deviceNote:
        "Questo dispositivo non legge le carte NFC: la carta si programma dall'app, su un telefono.",
      webOnPhone: "Sul telefono",
      webStepsTitle: "Sul tuo telefono, con la carta in mano",
      webHoldCaption: "Quando l'app te lo chiede, fino alla fine dei passaggi.",
      defaultLink: "Relè predefinito",
      fieldInvalid: "Inserisci un indirizzo completo",
      fieldLong: "Inserisci un indirizzo di {{max}} caratteri al massimo",
      fieldUnreachable: "Relè irraggiungibile: verifica l'indirizzo",
      fieldIncompatible: "Relè non compatibile con questa carta",
      moved: "Ora la carta passa per {{host}}",
      steps: {
        label: "Passaggi del cambio di relè",
        relay: "Nuovo relè raggiungibile",
        relayTodo: "Verifica del nuovo relè",
        relayRunning: "Nuovo relè in corso di verifica",
        relayFailed: "Nuovo relè non verificato",
        relayCaption: "{{host}}, versione attesa",
        card: "Carta avvicinata",
        cardTodo: "Avvicinamento della carta",
        cardRunning: "In attesa della carta",
        cardFailed: "Carta non riconosciuta",
        cardAndroid: "Contro il retro del telefono, fino alla vibrazione",
        cardIos: "Sopra il telefono, fino alla conferma",
        programming: "Programmata per questo relè",
        programmingTodo: "Programmazione per questo relè",
        programmingRunning: "In corso di programmazione per questo relè",
        programmingFailed: "Non programmata per questo relè",
        programmingCaption: "Non muovere la carta",
        former: "Relè precedente dimenticato",
        formerTodo: "Relè precedente da dimenticare",
        formerRunning: "Il relè precedente dimentica la carta",
        formerFailed: "Relè precedente non dimenticato",
        formerCaption: "{{relay}} non riceve più i suoi tap",
        formerDown: "Relè precedente irraggiungibile",
        formerDownCaption: "{{relay}} non ha risposto: il suo canale vi resta, senza effetto",
        formerRefused: "Relè precedente in errore",
        formerRefusedCaption:
          "{{relay}} ha rifiutato di dimenticare il suo canale: vi resta, senza effetto",
        formerUnknown: "Relè precedente da verificare",
        formerUnknownCaption:
          "{{relay}} ha risposto senza confermarlo: il suo canale forse vi è rimasto, senza effetto",
        lost: "Carta allontanata troppo presto",
        lostAndroid:
          "Avvicinala di nuovo e tienila ferma fino alla vibrazione: il cambio riprenderà da dove si è fermato.",
        lostIos:
          "Avvicinala di nuovo e tienila ferma fino alla conferma: il cambio riprenderà da dove si è fermato.",
        holdAndroid: "Tieni {{name}} contro il retro del telefono",
        holdIos: "Tieni {{name}} sopra il telefono",
        holdSubtitle: "Passerà per {{host}}",
        keepTitle: "Tieni ferma la carta",
        keepSubtitle: "Programmazione per il nuovo relè",
        almostTitle: "Quasi fatto",
        almostSubtitle: "Puoi allontanare la carta",
        doneTitle: "La carta passa per {{host}}",
        doneSubtitle: "Mantiene il nome, il saldo e le impostazioni",
        failedTitle: "Il cambio non è riuscito",
        failedNothing: "Su questa carta non è stato scritto nulla",
        failedGoesOn: "Riprenderà da dove si è fermato",
        checkingTitle: "Verifica del nuovo relè",
        relayUnreachable:
          "{{host}} non risponde: controlla la connessione di questo telefono, poi riprova",
        relayIncompatible: "{{host}} non parla la versione attesa",
        recordsUnreachable:
          "Troppo pochi relè del tuo account rispondono: controlla la connessione di questo telefono, poi riprova",
        cancelled: "Lettura della carta annullata",
        failed: "Il cambio non è riuscito: riprova",
        resetNotice:
          "Finché il cambio non è riuscito, la carta non paga più e non compare più in « Carte ». Con « Aggiungi una carta », torna sul relè predefinito, con il suo saldo, il suo nome e i suoi limiti.",
        finish: "Fine",
        cancel: "Annulla",
        stateTodo: ": da fare",
        stateRunning: ": in corso",
        stateDone: ": fatto",
        stateFailed: ": non riuscito",
        stateWarning: ": da verificare"
      }
    },
    history: {
      title: "Cronologia",
      subtitle: "Carta {{name}}",
      reading: "Lettura della cronologia…",
      failed: "I relè del tuo conto non hanno risposto: lo storico non può essere mostrato.",
      legacyUnread:
        "Non tutti i relè del tuo conto hanno risposto: potrebbero mancare movimenti meno recenti della carta.",
      ownOnly:
        "I relè del tuo conto non hanno risposto: potrebbero mancare i pagamenti fatti dagli altri tuoi telefoni.",
      walletFailed:
        "Non è stato possibile leggere il portafoglio della carta: le ultime ricariche e i prelievi potrebbero mancare.",
      newer: "Alcuni movimenti si vedono solo con una versione più recente dell'app.",
      empty: "Nessun movimento per questa carta.",
      pendingGroup: "In corso",
      deposit: "Deposito Bitcoin",
      depositConfirming: "Ricevuto · in attesa di conferma",
      depositClaiming: "Confermato · in aggiunta al saldo",
      depositFees: "In attesa di commissioni più basse: {{asked}} richiesti, {{max}} al massimo",
      depositFeesUnknown: "In attesa di commissioni più basse: {{max}} sats al massimo",
      at: "{{time}} · {{what}}",
      paid: "Pagato",
      refused: "Rifiutato: {{reason}}",
      refusedPlain: "Rifiutato",
      failedRow: "Non riuscito: non è partito nulla",
      uncertain: "Incerto: forse partito",
      sending: "Invio in corso",
      noName: "Pagamento con carta",
      recharge: "Ricarica",
      recovered: "Fondi recuperati",
      return: "Prelievo",
      toMain: "Verso il mio saldo principale",
      ways: {
        main: "Dal mio saldo principale",
        invoice: "Fattura Lightning",
        address: "Indirizzo Lightning",
        onchain: "Indirizzo Bitcoin",
        onchainFee: "Indirizzo Bitcoin, commissione {{fee}}",
        lnurl: "Link LNURL",
        spark: "Indirizzo Spark"
      },
      means: {
        main: "Il mio saldo principale",
        invoice: "Fattura Lightning",
        address: "Indirizzo Lightning",
        onchain: "Indirizzo Bitcoin",
        lnurl: "Link LNURL",
        spark: "Indirizzo Spark"
      },
      showMonth: "Mostra {{month}}",
      showMonthAll: "Mostra tutto {{month}}",
      monthFailed:
        "Non è stato possibile leggere questo mese: i relay del tuo account non hanno risposto.",
      monthIncomplete: "Non è stato possibile leggere una parte dei mesi mostrati.",
      legacy: {
        pinNeeded:
          "La cronologia di questa carta presso Swiss Bitcoin Pay è protetta dal PIN che le avevi dato. Inseriscilo per aggiungerla qui.",
        open: "Recupera la cronologia",
        failed:
          "Non è stato possibile recuperare la cronologia di questa carta presso Swiss Bitcoin Pay.",
        title: "Cronologia Swiss Bitcoin Pay",
        lead: "Inserisci il PIN che avevi dato a questa carta presso Swiss Bitcoin Pay: la sua cronologia si aggiunge a quella della carta.",
        pin: "PIN",
        submit: "Recupera",
        note: "Serve una sola volta, per leggere la cronologia della carta presso Swiss Bitcoin Pay: sattle.me non lo conserva.",
        errors: {
          pinInvalid: "PIN errato",
          pinLocked:
            "Troppi tentativi: Swiss Bitcoin Pay rifiuta questo PIN per un po'. Riprova più tardi.",
          failed:
            "Non è stato possibile recuperare la cronologia. Verifica la connessione e riprova."
        }
      },
      reasons: {
        declined: "non confermato sul telefono",
        newPayee: "nuovo commerciante non confermato",
        unidentifiedPayee: "commerciante non identificato, non confermato",
        unconfirmed: "non confermato in tempo",
        insufficientBalance: "saldo della carta insufficiente",
        invalidInvoice: "fattura non valida",
        expired: "fattura scaduta",
        noAmount: "fattura senza importo",
        alreadyPaid: "fattura già pagata",
        outOfBounds: "importo fuori dai limiti",
        aboveLimit: "oltre il limite per pagamento",
        dayLimit: "limite sulle 24 ore raggiunto",
        hourLimit: "troppi pagamenti in quest'ora",
        suspended: "carta in pausa",
        invalidTap: "lettura della carta non valida",
        failed: "pagamento non riuscito",
        superseded: "sostituito da un'altra lettura",
        unavailable: "pagamento non elaborato"
      },
      motives: {
        declined: "Non confermato sul telefono",
        newPayee: "Nuovo commerciante, non confermato in tempo",
        unidentifiedPayee: "Commerciante non identificato, non confermato in tempo",
        unconfirmed: "Non confermato in tempo",
        insufficientBalance: "Saldo della carta insufficiente",
        invalidInvoice: "Fattura non valida",
        expired: "Fattura scaduta",
        noAmount: "Fattura senza importo",
        alreadyPaid: "Fattura già pagata",
        outOfBounds: "Importo fuori dai limiti",
        aboveLimit: "Oltre il limite per pagamento",
        dayLimit: "Limite sulle 24 ore raggiunto",
        hourLimit: "Troppi pagamenti in quest'ora",
        suspended: "Carta in pausa",
        invalidTap: "Lettura della carta non valida",
        failed: "Il portafoglio della carta non l'ha inviato",
        superseded: "Sostituito da un'altra lettura della carta",
        unavailable: "Non è stato possibile elaborare il pagamento"
      },
      detail: {
        payment: "Pagamento",
        refused: "Pagamento rifiutato",
        failed: "Pagamento non riuscito",
        paid: "Pagato",
        paidWith: "Pagato · {{payee}}",
        merchant: "Commerciante",
        payee: {
          approved: "commerciante approvato",
          new: "nuovo commerciante",
          unidentified: "commerciante non identificato",
          unchecked: "non controllato (modalità automatica)"
        },
        refusedPill: "Rifiutato · non è partito nulla",
        failedPill: "Non riuscito · non è partito nulla",
        uncertainPill: "Incerto · forse partito",
        sendingPill: "Invio in corso",
        refusedMotive: "Rifiutato",
        failedMotive: "Il portafoglio della carta non l'ha inviato",
        date: "Data",
        value: "Valore",
        valueThen: "Al momento della transazione: {{fiat}}",
        valueNow: "Ora: {{fiat}}",
        valueNowReading: "Ora: lettura del cambio",
        valueNowUnknown: "Ora: cambio non disponibile",
        note: "Nota",
        motive: "Motivo",
        fees: "Commissione",
        noFee: "Nessuna",
        feeDeducted: "{{fee}}, detratti",
        way: "Tipo di pagamento",
        to: "Verso",
        mainBalance: "Il mio saldo principale",
        received: "Ricevuto",
        description: "Descrizione",
        transaction: "Transazione",
        copyTx: "Copia l'identificativo della transazione",
        txCopied: "Identificativo della transazione copiato",
        openTx: "Vedi la transazione su {{explorer}}",
        approve: "Approva questo commerciante",
        approveNote:
          "Ti sarà chiesta la tua passkey. I suoi prossimi pagamenti passeranno senza conferma, entro i limiti della carta.",
        approved: "Commerciante approvato per questa carta",
        approvedNote:
          "Commerciante approvato: i suoi prossimi pagamenti passeranno senza conferma, entro i limiti della carta.",
        approveFailed: "Non è stato possibile approvare il commerciante. Riprova.",
        homonym:
          "Stesso nome di un commerciante già approvato, ma conto diverso: può essere approvato solo confermando un pagamento presso di lui, dopo una verifica sul posto."
      }
    },
    sheet: {
      close: "Chiudi",
      nameInvalid: "Una riga di {{max}} caratteri al massimo.",
      save: "Salva",
      ceilingInvalid: "Un numero intero di sats, da 1 a {{max}}.",
      hourInvalid: "Un numero intero, da 1 a {{max}}.",
      relayHint:
        "Il relè sveglia il telefono quando una cassa legge la carta; non detiene né chiavi né fondi. La carta sarà riprogrammata: tienila a portata di mano.",
      relayField: "Indirizzo del relè",
      relayPlaceholder: "rele.example.com",
      program: "Programma la carta",
      back: "Indietro",
      done: "Fine",
      failedTitle: "L'operazione non è riuscita",
      changeFailed: "La modifica non è stata salvata. Riprova.",
      nfcSuccess: "Carta pronta",
      nfcFailure: "Operazione interrotta"
    },
    delete: {
      card: {
        drainBody:
          "Contiene ancora <strong>{{amount}}</strong>. Svuotala verso un indirizzo lightning, bitcoin o Spark prima di eliminarla.",
        drainBodyArriving:
          "Contiene ancora <strong>{{amount}}</strong>, e <strong>{{arriving}}</strong> stanno arrivando su un indirizzo Bitcoin. Svuotala, poi di nuovo una volta accreditati questi <strong>{{arriving}}</strong>.",
        drainBodyArrivingOnly:
          "<strong>{{arriving}}</strong> stanno arrivando su un indirizzo Bitcoin di questa carta. Svuotala una volta accreditati questi sats, prima di eliminarla."
      },
      drainTitle: "Svuota prima <accent>{{name}}</accent>",
      drainBody:
        "Contiene ancora <strong>{{amount}}</strong>. Prelevali verso il tuo saldo principale prima di eliminarla.",
      drainBodyArriving:
        "Contiene ancora <strong>{{amount}}</strong>, e <strong>{{arriving}}</strong> stanno arrivando a un indirizzo Bitcoin. Preleva il suo saldo verso il tuo saldo principale, poi questi <strong>{{arriving}}</strong> una volta aggiunti.",
      drainBodyArrivingOnly:
        "<strong>{{arriving}}</strong> stanno arrivando a un indirizzo Bitcoin di questa carta. Prelevali verso il tuo saldo principale una volta aggiunti, prima di eliminarla.",
      drainConfirm: "Preleva",
      title: "Elimina {{name}}",
      gone: "Cancellato per sempre",
      goneSettings: "Il suo nome e le sue impostazioni, esercenti approvati compresi",
      goneHistory: "La sua cronologia",
      goneAddress: "Il suo indirizzo Lightning",
      inHand: "Ho la carta con me",
      inHandCaption: "Tenuta contro il telefono, torna vergine",
      confirm: "Elimina la carta",
      withoutTitle: "Eliminare {{name}} senza la carta?",
      withoutBody:
        "I suoi dati vengono cancellati e non potrà mai più pagare. Se la ritrovi, « Aggiungi una carta » la renderà vergine.",
      withoutConfirm: "Elimina",
      cardLabel: "La carta",
      withCard: "Ce l'ho con me",
      withCardCaption: "Torna vergine",
      withoutCard: "Non ce l'ho",
      withoutCardCaption: "Non pagherà mai più",
      withoutNote:
        "Se la ritrovi, « Aggiungi una carta », nell'app sul tuo telefono, la renderà vergine.",
      webUnder: "« {{inHand}} » resta selezionato.",
      webHoldCaption: "Quando l'app te lo chiede.",
      understood: "Ho capito",
      deleting: "Eliminazione…",
      failedTitle: "L'eliminazione non è riuscita",
      failedBody: "Riprova; se il problema persiste, contatta l'assistenza.",
      done: "{{name}} è stata eliminata",
      pendingCaption:
        "I relè del tuo conto non hanno ancora registrato la sua eliminazione: si concluderà alla prossima sincronizzazione",
      steps: {
        screen: "Elimina la carta",
        label: "Passaggi dell'eliminazione",
        prepTitle: "Preparazione…",
        prepSubtitle: "Verifica del saldo della carta",
        holdAndroid: "Tieni {{name}} contro il retro del telefono",
        holdIos: "Tieni {{name}} sopra il telefono",
        holdSubtitle: "Torna vergine, poi i suoi dati vengono cancellati",
        keepTitle: "Tieni ferma la carta",
        keepSubtitle: "Torna vergine",
        almostTitle: "Quasi fatto",
        almostSubtitle: "Puoi allontanare la carta",
        doneSubtitle: "La carta è vergine: regalala, o aggiungila come nuova",
        notThisTitle: "Non è {{name}}",
        notThisSubtitle: "Non è stato modificato nulla sulla carta avvicinata",
        notThisCaption:
          "Oppure è stata riprogrammata altrove. Non è stato modificato nulla: avvicina la carta giusta.",
        failedNothing: "Non è stato modificato nulla sulla carta",
        failedGoesOn: "Non paga già più: « Riprova » completa l'eliminazione",
        emptied: "Saldo prelevato",
        emptiedTodo: "Verifica del saldo",
        emptiedRunning: "Saldo in corso di verifica",
        emptiedFailed: "Saldo non prelevato",
        emptiedCaption: "La carta è vuota",
        unchecked: "Saldo non verificato",
        uncheckedCaption:
          "La sua eliminazione era già registrata: i sats arrivati nel frattempo restano visibili in « Carte »",
        held: "Carta avvicinata",
        heldTodo: "Avvicinamento della carta",
        heldRunning: "In attesa della carta",
        heldFailed: "Carta non riconosciuta",
        heldAndroid: "Contro il retro del telefono, fino alla vibrazione",
        heldIos: "Sopra il telefono, fino alla conferma",
        blank: "Carta resa vergine",
        blankTodo: "Ripristino della carta",
        blankRunning: "Carta in corso di ripristino",
        blankFailed: "Carta non ripristinata",
        blankCaption: "Non muovere la carta",
        erased: "Dati cancellati",
        erasedTodo: "Cancellazione dei dati",
        erasedRunning: "Dati in corso di cancellazione",
        erasedFailed: "Dati non cancellati",
        erasedCaption:
          "Il suo nome, le sue impostazioni, la sua cronologia, il suo indirizzo Lightning",
        erasedLater: "Cancellazione da completare",
        erasedLaterCaption:
          "Non tutti i relè del tuo conto hanno risposto: la cancellazione riprenderà alla prossima sincronizzazione",
        lost: "Carta allontanata troppo presto",
        lostAndroid:
          "Avvicinala di nuovo e tienila ferma fino alla vibrazione: l'eliminazione riprenderà da dove si è fermata.",
        lostIos:
          "Avvicinala di nuovo e tienila ferma fino alla conferma: l'eliminazione riprenderà da dove si è fermata.",
        cancelled: "Lettura della carta annullata",
        failed: "L'eliminazione non è riuscita: riprova",
        noCard: "Non ho la carta",
        finish: "Fine",
        cancel: "Annulla",
        stateTodo: ": da fare",
        stateRunning: ": in corso",
        stateDone: ": fatto",
        stateFailed: ": non riuscito",
        stateWarning: ": da verificare"
      }
    },
    drain: {
      intro:
        "Tutto il saldo della carta va a un indirizzo lightning, bitcoin o Spark: digitalo, incollalo o scansionalo. Le commissioni sono prese da questo saldo.",
      introNoScan:
        "Tutto il saldo della carta va a un indirizzo lightning, bitcoin o Spark: digitalo o incollalo. Le commissioni sono prese da questo saldo.",
      placeholder: "Indirizzo lightning, bitcoin o Spark",
      invoice: "Usa un indirizzo lightning, bitcoin o Spark",
      total: "Saldo della carta",
      received: "Ricevuto dal destinatario",
      feesAbove: "Le commissioni superano il saldo della carta a questa velocità",
      empty: "Questa carta non contiene nulla da prelevare.",
      quoteFailed:
        "Non è stato possibile preparare lo svuotamento. Verifica il destinatario e la connessione a internet, poi riprova.",
      done: "{{amount}} prelevati: la carta è vuota.",
      pending: "Prelievo di {{amount}} partito: arriverà appena sarà completato.",
      failed: "Il prelievo non è andato a buon fine. Controlla il saldo della carta, poi riprova."
    },
    modifiedPhone: {
      title: "Questo telefono è meno sicuro",
      body: "Sembra essere stato modificato (ad esempio con « root »). Perché questa carta possa pagare senza la tua conferma, l'app conserva su questo telefono ciò che serve per farla pagare: un'app malevola potrebbe usarlo per spendere il suo saldo. Tieni pochi sats su questa carta, o scegli « Conferma sempre »."
    },
    erasedFunds: {
      card: {
        body: "{{amount}} sono arrivati sul suo portafoglio dopo l'eliminazione. Svuotalo verso un indirizzo lightning, bitcoin o Spark.",
        bodyArriving:
          "{{amount}} sono arrivati sul suo portafoglio dopo l'eliminazione, e {{arriving}} stanno ancora arrivando sul suo indirizzo Bitcoin. Svuotalo verso un indirizzo lightning, bitcoin o Spark.",
        arrivingOnly:
          "{{arriving}} stanno arrivando sull'indirizzo Bitcoin di una carta eliminata. Potrai prelevarli una volta accreditati.",
        stoppedBody:
          "Torna in « Carte », con il suo saldo, quando la aggiungi di nuovo. {{amount}} restano sul suo portafoglio: senza la carta, svuotalo verso un indirizzo lightning, bitcoin o Spark.",
        stoppedBodyArriving:
          "Torna in « Carte », con il suo saldo, quando la aggiungi di nuovo. {{amount}} restano sul suo portafoglio, e {{arriving}} stanno ancora arrivando sul suo indirizzo Bitcoin: senza la carta, svuotalo verso un indirizzo lightning, bitcoin o Spark."
      },
      title: "Dei sats sono arrivati su una carta eliminata",
      titleArriving: "Dei sats stanno arrivando su una carta eliminata",
      body: "{{amount}} sono arrivati sul suo portafoglio dopo l'eliminazione. Prelevali verso il tuo saldo principale.",
      bodyArriving:
        "{{amount}} sono arrivati sul suo portafoglio dopo l'eliminazione, e {{arriving}} stanno ancora arrivando al suo indirizzo Bitcoin. Prelevali verso il tuo saldo principale.",
      arrivingOnly:
        "{{arriving}} stanno arrivando all'indirizzo Bitcoin di una carta eliminata. Potrai prelevarli verso il tuo saldo principale una volta aggiunti.",
      returned: "{{amount}} prelevati verso il tuo saldo principale",
      returnPending:
        "Prelievo di {{amount}} partito: si aggiungerà al tuo saldo principale non appena sarà completato",
      failed:
        "Il prelievo non è andato a buon fine. Verifica la connessione a internet, poi riprova.",
      stoppedTitle: "{{card}}: riprogrammazione interrotta",
      stoppedBody:
        "Torna in « Carte », con il suo saldo, quando la aggiungi di nuovo. {{amount}} restano sul suo portafoglio: senza la carta, prelevali verso il tuo saldo principale.",
      stoppedBodyArriving:
        "Torna in « Carte », con il suo saldo, quando la aggiungi di nuovo. {{amount}} restano sul suo portafoglio, e {{arriving}} stanno ancora arrivando al suo indirizzo Bitcoin: senza la carta, prelevali verso il tuo saldo principale."
    },
    wallet: {
      balance: "Saldo",
      pendingDeposit: "{{amount}} ricevuti su un indirizzo Bitcoin, non ancora aggiunti al saldo",
      failed:
        "Non è stato possibile leggere il portafoglio di questa carta. Verifica la connessione a internet, poi riprova.",
      recharge: "Ricarica",
      return: "Preleva verso il mio saldo principale",
      rechargeCard: "Ricarica <accent>{{name}}</accent>",
      amountField: "Importo",
      rechargeAmount: "Ricarica {{amount}}",
      returnAmount: "Preleva {{amount}}",
      copyInvoice: "Copia la fattura",
      copyAddress: "Copia l'indirizzo",
      onchainOpenHere:
        "L'accredito avviene quando la carta è aperta in « Carte », qui o sul telefono.",
      fromMain: "Dal mio saldo principale",
      invoice: "Fattura Lightning",
      onchain: "Indirizzo Bitcoin",
      continue: "Continua",
      invoiceCreate: "Crea la fattura",
      invoiceDescription: "Ricarica della carta",
      noFee: "Nessuna",
      working: "Trasferimento in corso…",
      recharged: "Carta ricaricata di {{amount}}.",
      returned: "{{amount}} prelevati verso il tuo saldo principale.",
      rechargePending:
        "Ricarica di {{amount}} partita: si aggiungerà al saldo della carta non appena sarà completata.",
      returnPending:
        "Prelievo di {{amount}} partito: si aggiungerà al tuo saldo principale non appena sarà completato.",
      nothingToReturn: "Questa carta non contiene nulla da prelevare.",
      prepareFailed:
        "Non è stato possibile preparare il trasferimento: non è partito nulla. Verifica la connessione a internet, poi riprova.",
      transferFailed:
        "Il trasferimento non è andato a buon fine. Verifica la connessione a internet, poi riprova: partirà una sola volta.",
      transferRefused: "Il trasferimento non è riuscito. Controlla i saldi prima di ricominciare.",
      receiveFailed:
        "Non è stato possibile creare l'indirizzo o la fattura. Verifica la connessione a internet, poi riprova.",
      invoiceHint: "Pagabile una sola volta, da qualsiasi portafoglio Lightning, fino al {{date}}.",
      readingMain: "Lettura del tuo saldo principale…",
      otherWallet: "Altro portafoglio",
      confirmRecharge: "Conferma la ricarica",
      mainAvailable: "{{amount}} disponibili",
      change: "Cambia",
      mainShort: "Il tuo saldo principale non copre questo importo",
      mainUnread: "Non è stato possibile leggere il tuo saldo principale. Riprova tra un istante.",
      unit: "Unità",
      addressNote:
        "L'indirizzo Lightning permanente della carta: condividilo, l'importo inviato si aggiunge al saldo della carta.",
      orAnyWallet: "o da qualsiasi portafoglio",
      share: "Condividi",
      invoiceWaiting: "In attesa del pagamento…",
      invoicePaid: "Fattura pagata",
      invoiceAdded: "aggiunti al saldo della carta",
      finish: "Fine",
      invoiceExpired: "Fattura scaduta",
      invoiceExpiredNote: "Non è stata pagata prima del {{date}}: nessuno può più pagarla.",
      newInvoice: "Nuova fattura",
      onchainConfirmations:
        "Ciò che vi invii si aggiunge al saldo della carta dopo da 1 a 3 conferme, fino a una trentina di minuti.",
      onchainFee:
        "Commissione: al massimo {{fee}}, dedotta. Se la rete chiede di più, l'accredito attende.",
      onchainOpen: "L'accredito avviene quando apri la carta in « Carte ».",
      toMain: "Verso il mio saldo principale",
      fromCard: "Dalla carta {{name}} · {{amount}}",
      cardHoldsOnly: "La carta contiene solo {{amount}}",
      allOf: "Tutto il saldo della carta · {{fiat}}",
      wholeBalance: "Tutto il saldo della carta",
      partOf: "{{fiat}} · resteranno {{left}} sulla carta",
      partOfSats: "Resteranno {{left}} sulla carta",
      emptyCard: "Svuota la carta",
      rowFrom: "Da",
      rowTo: "A",
      rowFee: "Commissione",
      rowAfter: "Saldo della carta dopo",
      mainBalance: "Il mio saldo principale",
      confirmPasskey: "Conferma con la mia passkey",
      copy: "Copia",
      copied: "Copiato",
      copyFailed: "Copia non riuscita"
    },
    payees: {
      approved: "Approvati per questa carta",
      approvedCount: "$t(cards.payees.approved) · {{count}}",
      changeMode: "Cambia modalità",
      modeBox: {
        automatic: {
          title: "Modalità: automatica",
          caption: "Ogni tap valido viene pagato, entro i limiti"
        },
        approved: {
          title: "Modalità: commercianti approvati",
          caption: "Altrove, il telefono ti chiede di confermare"
        },
        confirm: {
          title: "Modalità: conferma sempre",
          caption: "Ogni pagamento attende la tua conferma"
        }
      },
      changeLabel: "Cambia la modalità di conferma di {{name}}",
      approveNote:
        "Per aggiungerne uno, spunta «$t(card.payment.approve)» quando confermi un pagamento presso di lui.",
      removeLabel: "Rimuovi {{name}} dai commercianti approvati",
      payments_one: "{{count}} pagamento",
      payments_other: "{{count}} pagamenti",
      paymentsRecent_one: "{{count}} pagamento in 90 giorni",
      paymentsRecent_other: "{{count}} pagamenti in 90 giorni",
      itsName: "Il suo nome",
      itsNode: "Il suo nodo",
      nodeNote:
        "Approvato tramite il suo nodo Lightning: se questo nodo è condiviso (Spark, Wallet of Satoshi, Strike…), anche tutti i suoi altri utenti sono pagati senza conferma, entro i limiti della carta.",
      approvedAs: "Approvato con il nome",
      approvedOnLabel: "Approvato il",
      paymentsLabel: "Pagamenti",
      paymentsValue_one: "{{count}}, per {{amount}}",
      paymentsValue_other: "{{count}}, per {{amount}}",
      paymentsValueRecent_one: "{{count}} in 90 giorni, per {{amount}}",
      paymentsValueRecent_other: "{{count}} in 90 giorni, per {{amount}}",
      modesLabel: "Modalità di conferma dei pagamenti",
      recommended: "Consigliata",
      confirmPasskey: "Conferma con la mia passkey",
      modes: {
        automatic: {
          title: "Automatica",
          body: "Ogni tap valido viene pagato, entro i limiti della carta. Il commerciante è mostrato, senza controllo."
        },
        approved: {
          title: "Commercianti approvati",
          body: "Pagato senza conferma presso un commerciante identificato che hai approvato; altrove, il telefono ti chiede di confermare."
        },
        confirm: {
          title: "Conferma sempre",
          body: "Ogni pagamento attende la tua conferma."
        }
      },
      approvedEmpty: "Nessun commerciante approvato",
      approvedEmptyLead:
        "Quando confermi un pagamento con questa carta, spunta «$t(card.payment.approve)»: i suoi prossimi pagamenti partiranno senza conferma.",
      approvedOn: "approvato il {{date}}",
      nameField: "Il tuo nome per questo commerciante",
      nameHint: "Solo per te. Se lo lasci vuoto, torna il nome dichiarato dal commerciante.",
      remove: "Rimuovi dai commercianti approvati",
      removeHint:
        "Ti sarà chiesta la tua passkey. I suoi prossimi pagamenti chiederanno di nuovo la tua conferma.",
      saveFailed: "La modifica non è stata salvata. Riprova.",
      pending: {
        phone:
          "Salvato su questo telefono, non ancora sui relè del tuo conto: i tuoi altri dispositivi non lo vedono ancora.",
        web: "Non ancora salvato sui relè del tuo conto: questa modifica andrà persa se lasci la pagina."
      },
      failed: {
        newerApp:
          "Una versione più recente dell'app ha salvato i tuoi commercianti approvati. Aggiorna l'app: fino ad allora, le tue carte non pagano.",
        unreachable:
          "I relè del tuo conto non hanno risposto: i tuoi commercianti approvati non possono essere mostrati.",
        failed: "Non è stato possibile leggere i tuoi commercianti approvati."
      }
    },
    probe: {
      group: "Test (staging)",
      row: "Test dell'estensione iOS",
      title: "Test dell'estensione iOS",
      noPointOfSale:
        "Questo test paga l'indirizzo Lightning dell'account: un account solo carte non ne ha.",
      unavailable: "Questo test esiste solo nell'app di staging, su iPhone.",
      intro:
        "Misura se una carta può pagare da una notifica, con l'app chiusa. L'estensione usa un proprio portafoglio di test, mai quello del tuo account: contiene solo pochi sats.",
      how: "Dopo aver avviato un test, blocca il telefono: il risultato appare nella notifica, poi qui. Le notifiche devono essere consentite.",
      launchGroup: "Avvia un test",
      profile: "Configurazione dell'SDK",
      profiles: {
        light: "Leggera",
        standard: "Standard"
      },
      modes: {
        sync: "Sincronizza",
        receive: "Ricevi 100 sats",
        pay: "Paga 1 sat al tuo indirizzo",
        engine: "Motore JS (senza pagamento)",
        runtime: "Runtime JS (rete, dati)",
        enginePay: "Motore JS: paga 1 sat"
      },
      balance: "Saldo del portafoglio di test, letto all'ultimo test: {{sats}} sats",
      sent: "Notifica di test inviata",
      failed: {
        unavailable: "Questo telefono non ha l'estensione delle notifiche",
        noApiKey: "Questa versione dell'app non ha una chiave API Breez",
        storage: "Il portafoglio di test non ha potuto essere preparato",
        notifications: "Consenti le notifiche per avviare un test",
        pushToken: "Nessun token di notifica: rete, o credenziali APNs assenti dalla build",
        invoice: "Il tuo indirizzo Lightning non ha fornito una fattura",
        push: "Il servizio di notifiche di Expo ha rifiutato l'invio",
        unexpected: "Non è stato possibile avviare il test"
      },
      notification: {
        title: "Test dell'estensione",
        body: "Se questo testo resta visibile, l'estensione non ha elaborato la notifica."
      },
      cardText: {
        group: "Notifica di un pagamento con carta",
        intro:
          "Invia a questo telefono la notifica di un pagamento con carta, come il relay: il titolo deve comparire nella lingua dell'iPhone. «sattle.me»: l'estensione non l'ha elaborata.",
        launch: "Invia una notifica della carta",
        sent: "Notifica della carta inviata"
      },
      resultsGroup: "Risultati",
      empty: "Ancora nessun test.",
      outcome: {
        waiting: "In attesa",
        none: "Nessun risultato",
        running: "In corso ({{step}})",
        stopped: "Interrotto ({{step}})",
        ok: "Riuscito",
        failed: "Fallito ({{step}})",
        expired: "Tempo scaduto ({{step}})"
      },
      peak: "picco {{mb}} MB",
      limit: "limite ≈ {{mb}} MB",
      seconds: "{{s}} s",
      copyInvoice: "Copia la fattura",
      invoiceCopied: "Fattura copiata: pagala da « Invia »",
      copy: "Copia i risultati",
      copied: "Risultati copiati",
      copyFailed: "Copia non riuscita",
      clear: "Cancella i risultati"
    },
    wakes: {
      row: "Registro dei risvegli (Android)",
      title: "Registro dei risvegli",
      unavailable: "Questo registro esiste solo nell'app di staging, su Android.",
      intro:
        "Ogni risveglio di questo telefono da parte del relay di una carta, con l'app chiusa o in background: quando è arrivato e fin dove è arrivato il pagamento. Nessun importo, esercente o fattura.",
      how: "Per testare: scorri l'app fuori dalle app recenti (senza forzarne l'arresto), blocca il telefono, avvicina la carta a una cassa, poi torna qui e copia il registro.",
      group: "Risvegli",
      empty: "Ancora nessun risveglio.",
      outcome: {
        running: "In corso ({{step}})",
        stopped: "Interrotto ({{step}})",
        notTaken: "Ignorato",
        paid: "Pagato",
        pending: "Inviato, non confermato",
        declined: "Rifiutato dal titolare",
        failed: "Non riuscito ({{reason}})",
        letGo: "Abbandonato ({{step}})",
        ended: "Terminato ({{step}})"
      },
      received: "attività avviata {{s}} s dopo la ricezione",
      js: "JS avviato {{s}} s prima",
      silence: "silenzio più lungo {{s}} s",
      copy: "Copia il registro",
      copied: "Registro copiato",
      copyFailed: "La copia non è riuscita",
      clear: "Cancella il registro",
      newer: "Questo registro è stato scritto da una versione più recente dell'app.",
      failed: "Non è stato possibile leggere il registro."
    },
    socket: {
      group: "Connessione permanente",
      row: "Connessione permanente",
      caption: {
        on: "Attiva",
        off: "Disattivata"
      },
      intro:
        "Il telefono mantiene una propria connessione al relay delle sue carte: un pagamento con carta lo risveglia con l'app chiusa. È attiva per impostazione predefinita e consuma un po' di batteria. Disattivata, le tue carte pagano solo con l'app aperta.",
      noRelay: "Nessun relay delle tue carte offre ancora questa connessione.",
      state: {
        connecting: "connessione…",
        open: "connessa",
        waiting: "in attesa",
        stopped: "fermata"
      },
      since: "da {{time}}",
      lastMessage: "ultimo messaggio {{s}} s fa",
      opened_one: "{{count}} connessione",
      opened_other: "{{count}} connessioni",
      failures_one: "{{count}} interruzione",
      failures_other: "{{count}} interruzioni",
      lastFailure: "ultima interruzione: {{code}}",
      wakes_one: "{{count}} risveglio",
      wakes_other: "{{count}} risvegli",
      battery: {
        applied:
          "L'ottimizzazione della batteria si applica all'app: Android può interrompere la connessione.",
        exempt: "L'ottimizzazione della batteria è disattivata per l'app.",
        settings: "Impostazioni batteria"
      },
      notice: {
        shown:
          "Android mostra una notifica finché la connessione è attiva. Per nasconderla, disattiva «Connessione delle carte» nelle impostazioni che si aprono: la connessione continua.",
        hidden: "Notifica nascosta: la connessione continua.",
        hide: "Nascondi la notifica",
        settings: "Impostazioni della notifica"
      },
      service: {
        running: "Servizio attivo (avviato: {{reason}})",
        stopped: "Servizio fermato",
        error: "Il servizio non è potuto partire ({{code}})",
        task: "Risveglio non trasmesso all'app ({{code}})"
      },
      failed: "Non è stato possibile modificare la connessione permanente",
      notification: {
        channel: "Connessione delle carte",
        title: "Pagamenti con carta attivati",
        text: "Connesso al relay delle tue carte per pagare con l'app chiusa",
        stop: "Ferma"
      }
    }
  },
  pos: {
    title: "Punto vendita",
    subtitle: "Incassa bitcoin sul tuo conto, rapidamente.",
    addNote: "Aggiungi una nota",
    editNote: "Modifica la nota «{{note}}»",
    charge: "Incassa",
    keyboardHint: "Funzionano anche i tasti della tastiera.",
    deleteKey: "Cancella",
    satsLabel: "{{sats}} sats",
    rateLoading: "Caricamento del prezzo del bitcoin…",
    rateUnavailable: "Prezzo del bitcoin non disponibile. Verifica la connessione a internet.",
    share: "Condividi la richiesta di pagamento",
    shareLink: {
      button: "Condividi",
      hint: "Invia la richiesta di pagamento al cliente.",
      copiedTitle: "Link copiato",
      copied: "Incollalo in un messaggio al cliente.",
      publishFailedTitle: "Link non online",
      shareFailedTitle: "Link non condiviso",
      publishFailed:
        "Non è stato possibile mettere online il link: il cliente non lo troverebbe. Controlla la connessione a internet, poi condividilo di nuovo.",
      shareFailed: "Non è stato possibile condividere il link. Riprova."
    },
    backToPos: "Torna al punto vendita",
    expiresIn: "Scade tra",
    waiting: "In attesa del pagamento",
    creating: "Creazione della richiesta…",
    checking: "Verifica del pagamento Bitcoin…",
    checkingPayment: "Verifica del pagamento…",
    lateCheck: {
      title: "Richiesta scaduta",
      body: "Un pagamento inviato all'ultimo secondo può ancora arrivare.",
      endsIn: "Fine della verifica tra"
    },
    // A payment whose check lasts.
    settling: {
      title: "Pagamento ricevuto, in verifica",
      body: "La verifica richiede più tempo del previsto. Prosegue da sola."
    },
    updatingRate: "Aggiornamento al tasso dell'ora…",
    networks: {
      scan: "Scansiona con il tuo portafoglio",
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      or: "o"
    },
    onchainUnavailable: {
      explorer:
        "Bitcoin onchain non disponibile per questa vendita: {{explorer}} non è riuscito a verificare l'indirizzo Bitcoin in tempo. Il cliente può pagare tramite Lightning.",
      pool: "Bitcoin onchain non disponibile per questa vendita: questo dispositivo non ha indirizzi Bitcoin pronti. Ne prepara a ogni sblocco con la tua passkey, con la connessione a internet. Il cliente può pagare tramite Lightning.",
      lot: "Bitcoin onchain non disponibile per questa vendita: questo dispositivo non ha indirizzi Bitcoin disponibili. Il titolare gliene fornisce sbloccando la propria app con la sua passkey, con la connessione a internet. Il cliente può pagare tramite Lightning."
    },
    note: {
      label: "Nota dell'incasso",
      placeholder: "Tavolo 12"
    },
    boltcard: {
      approach: "Oppure avvicina la carta BoltCard",
      tap: "Oppure tocca qui, poi avvicina la carta BoltCard",
      alert: "Avvicina la carta BoltCard alla parte alta del telefono.",
      paying: "Pagamento con carta in corso…",
      sent: "Pagamento con carta inviato, in attesa di conferma…",
      refusal: {
        refused: "Carta rifiutata",
        interrupted: "Pagamento con carta interrotto",
        unread: "Carta non letta",
        noReason:
          "Il servizio della carta non ha indicato un motivo. Presenta di nuovo la carta o fai scansionare il codice.",
        outOfRange: "L'importo è fuori dai limiti della carta. Fai scansionare il codice.",
        noAnswer:
          "Il servizio della carta non ha risposto. Presenta di nuovo la carta o fai scansionare il codice.",
        unreadable:
          "Questa non è una carta di pagamento leggibile qui. Presentala di nuovo o fai scansionare il codice.",
        showCode: "Mostra il codice"
      }
    },
    paid: {
      pill: "Incassato",
      line: "Lightning · {{time}}",
      onchainLine: "Bitcoin · {{time}}",
      mixedLine: "Bitcoin + Lightning · {{time}}"
    },
    accepted: {
      notice: "Il titolare ha accettato l'importo ricevuto: la vendita è pagata."
    },
    unconfirmed: {
      pill: "In conferma",
      notice:
        "Il cliente ha pagato. La rete deve ancora confermare la transazione, contare circa trenta minuti."
    },
    underpaid: {
      rest: "Resto",
      received: "Ricevuto",
      restToPay: "Resta da pagare",
      // The accessible name of a transaction's link on the chain card (UnderpaidChain).
      txLink: "Vedi la transazione {{txid}} su {{explorer}}"
    },
    underpaidEnded: {
      pill: "Pagato in parte",
      missing: "Mancante",
      received: "Pagamenti ricevuti",
      confirmed: "Confermata",
      confirming: "In conferma · {{done}}/{{required}}",
      notice: "Il tempo per pagare è scaduto: mancano {{missing}} sats."
    },
    expired: {
      pill: "Scaduto",
      notice: "Il cliente non ha pagato entro il tempo previsto. Non è stato incassato nulla.",
      recreate: "Ricrea la richiesta"
    },
    disputed: {
      pill: "Pagamento da verificare",
      notice:
        "È stato ricevuto un pagamento, ma anche un'altra vendita lo reclama. Non chiedere un nuovo pagamento: verificalo in «$t(navigation.destinations.wallet)».",
      noticeMember:
        "È stato ricevuto un pagamento, ma anche un'altra vendita lo reclama. Non chiedere un nuovo pagamento: il titolare del conto lo verifica in «$t(navigation.destinations.wallet)»."
    },
    failed: {
      network:
        "Non è stato possibile creare la richiesta di pagamento. Verifica la connessione a internet, poi riprova.",
      invalid: "Il servizio di pagamento ha risposto in modo inatteso. Riprova.",
      limits: "Questo importo non può essere incassato: solo tra {{min}} e {{max}} sats.",
      onchainOnly: {
        none: "Oltre {{max}} sats, questo importo può essere pagato solo onchain, e i pagamenti onchain sono disattivati.",
        explorer:
          "Oltre {{max}} sats, questo importo può essere pagato solo onchain, e {{explorer}} non è riuscito a verificare l'indirizzo Bitcoin in tempo. Riprova.",
        pool: "Oltre {{max}} sats, questo importo può essere pagato solo onchain, e questo dispositivo non ha indirizzi Bitcoin pronti. Ne prepara a ogni sblocco con la tua passkey, con la connessione a internet.",
        lot: "Oltre {{max}} sats, questo importo può essere pagato solo onchain, e questo dispositivo non ha indirizzi Bitcoin disponibili. Il titolare gliene fornisce sbloccando la propria app con la sua passkey, con la connessione a internet.",
        error:
          "Oltre {{max}} sats, questo importo può essere pagato solo onchain, e non è stato possibile leggere l'indirizzo Bitcoin di questo dispositivo. Riprova."
      },
      retry: "Riprova"
    },
    // The keypad or the articles: the header's segmented control.
    mode: {
      label: "Modalità di inserimento",
      amount: "Importo",
      articles: "Articoli",
      scan: "Scansiona"
    },
    articles: {
      hint: "Tocca un articolo per aggiungerlo",
      // Without articles, on the owner's device only (ArticlesPad.tsx).
      empty: {
        reading: "Lettura dei tuoi articoli…",
        unreadableTitle: "Articoli non ancora letti",
        unreadableBody:
          "Non è stato possibile leggere i tuoi articoli. Verifica la connessione a internet: saranno letti di nuovo tra qualche minuto.",
        noneTitle: "Ancora nessun articolo",
        noneBody:
          "Aggiungi i tuoi articoli in «$t(navigation.destinations.articles)»: appariranno qui.",
        noneBodyScan:
          "Scansiona un prodotto con «$t(pos.mode.scan)» per crearlo, oppure aggiungi i tuoi articoli in «$t(navigation.destinations.articles)»."
      },
      tile: "{{name}}, {{price}}",
      add: "Ne aggiunge uno al carrello",
      inBasket_one: "{{count}} nel carrello",
      inBasket_other: "{{count}} nel carrello"
    },
    basket: {
      title: "Carrello",
      open: "Vedi il carrello",
      charge_one: "Incassa · {{count}} articolo",
      charge_other: "Incassa · {{count}} articoli",
      total: "Totale",
      empty: "Il carrello è vuoto.",
      tooLarge: "Il totale supera l'importo massimo di un incasso.",
      scanMore: "Scansiona altri articoli",
      less: "Diminuisci la quantità di {{name}}",
      more: "Aumenta la quantità di {{name}}",
      quantity_one: "Quantità: {{count}}",
      quantity_other: "Quantità: {{count}}"
    },
    // The scan of the point of sale: the camera, the article read last, the basket.
    scan: {
      aim: "Inquadra il codice a barre di un articolo",
      lead: "Ogni articolo scansionato si aggiunge al totale.",
      converted: "Prezzo: {{price}}, convertito",
      unknown: {
        title: "Codice a barre sconosciuto",
        body: "Nessuno dei tuoi articoli ha questo codice. Non è stato aggiunto nulla."
      },
      // A code read before the catalogue was (ScanPad.tsx): nothing can be told of it.
      notRead: {
        title: "Articoli non ancora letti",
        body: "Non è stato possibile cercare questo codice. Non è stato aggiunto nulla: scansionalo di nuovo tra un attimo."
      }
    }
  },
  paymentLink: {
    // The page's switch of theme, in its header: what it does.
    themeToDark: "Passa al tema scuro",
    themeToLight: "Passa al tema chiaro",
    payableUntil: "Pagabile entro il {{date}}",
    loading: "Caricamento della richiesta di pagamento…",
    updatingRate: "Aggiornamento al tasso dell'ora…",
    openWallet: "Apri il mio portafoglio",
    copyInvoice: "Copia la fattura",
    copied: "Fattura copiata",
    copyFailed:
      "Non è stato possibile copiare la fattura. Aprila nel tuo portafoglio o scansiona il codice.",
    retry: "Riprova",
    notFound: {
      title: "Richiesta non trovata",
      notice:
        "Questa richiesta di pagamento non esiste o è scaduta. Chiedi un nuovo link al commerciante.",
      invalid:
        "Questo link è incompleto. Verifica che sia stato copiato per intero, o chiedine uno nuovo al commerciante."
    },
    unreachable: {
      title: "Connessione impossibile",
      notice:
        "Non è stato possibile caricare la richiesta di pagamento. Controlla la connessione a internet, poi riprova."
    },
    failed: {
      title: "Richiesta non disponibile",
      notice:
        "Il servizio di pagamento del commerciante non è riuscito a creare la fattura. Riprova tra qualche istante, oppure chiedi un nuovo link al commerciante.",
      onchainOnly:
        "Questo importo può essere pagato solo onchain, e questa richiesta non propone alcun indirizzo Bitcoin. Chiedi a {{business}} un altro metodo di pagamento."
    },
    copyAddress: "Copia l'indirizzo",
    addressCopied: "Indirizzo copiato",
    addressCopyFailed:
      "Non è stato possibile copiare l'indirizzo. Aprilo nel tuo portafoglio o scansiona il codice.",
    amountCopied: "Importo copiato",
    amountCopyFailed:
      "Non è stato possibile copiare l'importo. Apri la richiesta nel tuo portafoglio o scansiona il codice.",
    receipt: {
      invoice: "Fattura Lightning",
      address: "Indirizzo Bitcoin",
      amount: "Importo",
      copyAmount: "Copia l'importo",
      invoiceCopied: "Copiata",
      addressCopied: "Copiato",
      amountCopied: "Copiato",
      unit: "Unità: {{unit}}, passa a {{next}}"
    },
    unconfirmed: {
      notice:
        "Il tuo pagamento è stato inviato. La rete deve ancora confermare la transazione, contare circa trenta minuti. Puoi chiudere questa pagina."
    },
    underpaid: {
      notice:
        "Il tuo pagamento ({{received}} sats) non copre l'intero importo. Paga il resto tramite Lightning o Bitcoin.",
      noticeLightning:
        "Il tuo pagamento ({{received}} sats) non copre l'intero importo. Paga il resto tramite Lightning."
    },
    underpaidEnded: {
      notice:
        "Il tempo per pagare è scaduto: il tuo pagamento ({{received}} sats) non copre l'intero importo, mancano {{missing}} sats. Contatta {{business}} per la differenza."
    },
    details: {
      title: "Dettagli del pagamento",
      business: "Beneficiario",
      method: "Metodo",
      methods: {
        lightning: "Lightning",
        onchain: "Bitcoin",
        mixed: "Bitcoin + Lightning"
      },
      createdAt: "Creata il",
      transaction: "Transazione",
      transactionNumber: "Transazione {{number}}",
      confirmations_one: "{{count}} conferma su {{required}}",
      confirmations_other: "{{count}} conferme su {{required}}",
      confirmed: "Confermata"
    },
    paid: {
      pill: "Pagato",
      notice: "{{business}} ha ricevuto il tuo pagamento.",
      continue: "Continua su {{host}}"
    },
    accepted: {
      notice: "{{business}} ha accettato l'importo ricevuto: il tuo pagamento è saldato."
    },
    expired: {
      pill: "Scaduto",
      notice:
        "Il tempo per pagare è scaduto e non è stato ricevuto alcun pagamento. Chiedi un nuovo link a {{business}}."
    },
    canceled: {
      pill: "Annullata",
      notice:
        "{{business}} ha annullato questa richiesta di pagamento: non pagarla. Chiedi un nuovo link a {{business}}."
    },
    disputed: {
      pill: "Da verificare",
      notice:
        "Il tuo pagamento è stato ricevuto. {{business}} deve ancora verificarlo: non pagare una seconda volta e contatta {{business}} se necessario."
    },
    checkout: {
      newer: {
        title: "Pagina da aggiornare",
        notice:
          "Questo link di pagamento ha un formato più recente di questa pagina. Ricarica la pagina, o aggiorna l'app, poi apri di nuovo il link."
      },
      continue: "Continua",
      redirectTo: "Reindirizzamento a {{target}}",
      unconfirmed: {
        notice:
          "Il tuo pagamento è stato inviato. La rete deve ancora confermare la transazione, contare circa trenta minuti."
      },
      underpaid: {
        notice:
          "Il tuo pagamento ({{received}} sats) non copre l'intero importo. Paga il resto tramite Bitcoin, allo stesso indirizzo."
      },
      expired: {
        notice:
          "Il tempo per pagare è scaduto e non è stato ricevuto alcun pagamento. Torna al negozio di {{business}} per richiederne uno nuovo.",
        late: "Il tempo per pagare è scaduto: un pagamento è arrivato dopo la scadenza e non vale per questo ordine. Contatta {{business}}."
      }
    }
  },
  appLock: {
    title: "App bloccata",
    body: "Usa la biometria di questo dispositivo per aprirla.",
    unlock: "Sblocca",
    prompt: "Sblocca sattle.me",
    cancel: "Annulla"
  },
  navigation: {
    label: "Navigazione",
    destinations: {
      pos: "Incassa",
      wallet: "Portafoglio",
      cards: "Carte",
      articles: "Articoli",
      employees: "Dipendenti",
      integrations: "Integrazioni",
      settings: "Impostazioni"
    },
    memberWallet: "La mia attività",
    groups: {
      sales: "Vendite",
      manage: "Gestire",
      account: "Account"
    },
    more: "Altro",
    moreWith: "Altro, schermata attuale: {{name}}",
    moreWithWait: "{{more}} ({{name}})",
    close: "Chiudi",
    customize: "Personalizza",
    customizeTitle: "Personalizza la barra",
    done: "Fine",
    customizeHint: "Tocca una destinazione per sostituire <accent>{{name}}</accent>.",
    slotLabel: "{{name}}, posizione {{index}}",
    swapLabel: "Metti {{name}} nella barra",
    currentLabel: "{{name}}, schermata attuale",
    pendingLabel: "{{name}}, fattura in corso",
    confirmingLabel: "{{name}}, pagamento in conferma",
    lock: {
      tillMode: "Passa alla modalità cassa",
      lockApp: "Blocca l'app",
      unlock: "Sblocca con la tua passkey",
      lockedLabel: "{{name}}, bloccato: sblocca con la tua passkey",
      unlocking: "Sblocco…",
      preparing: "Preparazione dello sblocco…",
      failedTitle: "Sblocco non riuscito",
      otherAccount: "Questa passkey apre un account diverso da quello di questo dispositivo.",
      autoLockTitle: "Blocco tra {{seconds}} s",
      autoLockBodyCard: "Senza attività, l'app si blocca.",
      autoLockBody: "Senza attività, l'app torna alla modalità cassa."
    },
    loadFailure: {
      title: "Schermata non caricata",
      body: "Controlla la connessione a internet, poi ricarica la pagina. Il ricaricamento carica anche l'ultima versione dell'app.",
      reload: "Ricarica la pagina"
    },
    update: {
      title: "Nuova versione disponibile",
      body: "L'aggiornamento ricarica la pagina.",
      action: "Aggiorna"
    }
  },
  team: {
    invite: "Invita un dipendente",
    loading: "Caricamento dei tuoi dipendenti…",
    guide: {
      title: "Incassa in squadra",
      lead: "Ogni dipendente incassa con il proprio telefono, per la tua attività.",
      invite: {
        title: "Invita",
        caption: "Scegli il suo nome: l'app prepara il suo invito, un codice QR e un link."
      },
      activate: {
        title: "Attiva il suo telefono",
        caption:
          "Il dipendente scansiona il codice QR o apre il link: il suo telefono diventa una cassa della tua attività."
      },
      sales: {
        title: "Segui le sue vendite",
        caption: "Arrivano nel tuo portafoglio, a suo nome; ogni dipendente vede solo le proprie."
      }
    },
    noMatch: "Nessun dipendente corrisponde ai filtri.",
    offline: "Connessione impossibile: non è stato possibile verificare lo stato degli inviti.",
    rosterOffline:
      "Nessun relay ha risposto: non è stato possibile leggere l'elenco dei dipendenti. Controlla la connessione, poi torna su questa schermata.",
    rosterPartial:
      "Non tutti i relay hanno risposto: l'elenco dei dipendenti potrebbe essere incompleto.",
    newer:
      "Alcuni dipendenti provengono da una versione più recente dell'app: aggiorna l'app per vederli.",
    invitations: "Inviti in corso",
    employees: "Dipendenti",
    columns: {
      name: "Nome",
      state: "Stato",
      date: "Data"
    },
    status: {
      invited: "In attesa",
      joined: "Attivo",
      left: "Uscito",
      expired: "Scaduto"
    },
    detail: {
      invited: "Link creato il {{date}}",
      joined: "Si è unito il {{date}}",
      left: "Uscito il {{date}}",
      expired: "Link scaduto il {{date}}"
    },
    // Where an employee's device joined (its record's platform), beside its row's date.
    platform: {
      ios: "su iPhone o iPad",
      android: "su Android",
      web: "in un browser web"
    },
    detailWithPlatform: "{{detail}}, {{platform}}",
    actions: {
      share: "Condividi il link",
      showQr: "Mostra il link e il codice",
      renew: "Rinnova l'invito",
      deleteInvite: "Elimina l'invito",
      removeAccess: "Revoca l'accesso",
      removeLeft: "Rimuovi dall'elenco"
    },
    inviteSheet: {
      title: "Invita un dipendente",
      lead: "Con questo link, un altro dispositivo incassa per la tua attività: il telefono di un dipendente o una cassa condivisa. I pagamenti arrivano direttamente nel tuo portafoglio.",
      can: "Questo dispositivo potrà",
      canItems: {
        sell: "Incassare: importo, articoli e scansione",
        methods: "Farsi pagare in Lightning, on-chain o con carta",
        links: "Inviare un link di pagamento a un cliente",
        ownSales: "Vedere le proprie vendite"
      },
      cannot: "Questo dispositivo non potrà",
      cannotItems: {
        wallet: "Vedere il tuo saldo né inviare fondi",
        settings: "Modificare i tuoi articoli, i prezzi o le impostazioni",
        otherSales: "Vedere le vendite degli altri dipendenti o casse",
        manage: "Gestire il team, le carte o le integrazioni"
      },
      revoke: "Potrai revocare il suo accesso in qualsiasi momento.",
      nameLabel: "Nome",
      namePlaceholder: "Es. Alice o Cassa 1",
      nameHint: "Compare nel tuo portafoglio accanto alle sue vendite.",
      create: "Crea il link",
      notice:
        "Il link sarà valido 48 ore e funziona una sola volta. Consegnalo solo al dipendente o alla cassa previsti: la prima persona che lo apre può prendere il suo posto."
    },
    qrSheet: {
      title: "Invito per {{name}}",
      lead: "Scansiona questo codice con il dispositivo che incasserà, oppure invia il link a quel dispositivo.",
      leadDesktop:
        "Scansiona questo codice con il dispositivo che incasserà per {{business}}, oppure invia il link a quel dispositivo.",
      linkLabel: "Link d'invito",
      copy: "Copia il link",
      share: "Condividi il link",
      copied: "Link copiato",
      copyFailed: "Non è stato possibile copiare il link. Selezionalo, poi copialo.",
      done: "Fine",
      notice:
        "Questo link funziona una sola volta e scade il {{date}}. È riservato a {{name}}: la prima persona che lo apre può prendere il suo posto."
    },
    removeDialog: {
      title: "Rimuovere {{name}}?",
      body: "{{name}} non potrà più incassare per {{business}}. I suoi incassi passati restano nel portafoglio, a suo nome.",
      confirm: "Revoca l'accesso",
      doneTitle: "Accesso revocato",
      doneBody: "{{name}} non fa più parte del team di {{business}}."
    },
    removeLeftDialog: {
      title: "Rimuovere {{name}} dall'elenco?",
      body: "{{name}} è uscito da {{business}} il {{date}}. I suoi incassi passati restano nel portafoglio, a suo nome.",
      confirm: "Rimuovi dall'elenco",
      doneTitle: "Elenco dei dipendenti aggiornato",
      doneBody: "{{name}} non vi compare più."
    },
    deleteInviteDialog: {
      title: "Eliminare l'invito di {{name}}?",
      body: "Il link non funzionerà più: {{name}} non potrà unirsi a {{business}} con esso.",
      confirm: "Elimina l'invito",
      doneTitle: "Link di invito disattivato",
      doneBody: "{{name}} non potrà più unirsi a {{business}}."
    },
    cancelSalesDialog: {
      unknownLead: "Non è stato possibile verificare lo stato degli incassi di {{name}}.",
      linksLeft:
        "{{name}} non fa più parte del team di {{business}}. I suoi link di pagamento che non è stato possibile annullare restano pagabili fino alla loro scadenza: i pagamenti arrivano nel portafoglio.",
      title: "Annullare le fatture di {{name}}?",
      lead: "Alcune fatture di {{name}} non sono ancora definitive.",
      links:
        "I suoi link di pagamento che non hanno ancora ricevuto nulla saranno annullati: la loro pagina non mostrerà più un codice da pagare. Quelli pagati saranno finalizzati.",
      invoices:
        "Le fatture mostrate sul suo dispositivo saranno annullate: il dispositivo smette di mostrarle non appena riceve la rimozione del suo accesso.",
      end: "Un cliente che ha già scansionato o copiato una fattura può ancora pagarla: il pagamento arriva nel portafoglio. L'accesso di {{name}} viene poi rimosso.",
      confirm: "Annulla e rimuovi",
      progress: "Annullamento delle fatture di {{name}}…"
    },
    failedTitle: "Azione impossibile",
    unreachableTitle: "Connessione impossibile",
    errors: {
      noAccount: "Sblocca questo punto vendita con la tua passkey per gestire il team.",
      noWebApp: "Gli inviti non sono ancora disponibili in questa versione dell'app.",
      tooMany: "Il tuo team conta già 100 dipendenti.",
      invalidName: "Inserisci il nome del dipendente.",
      unreachable:
        "Non è stato possibile pubblicare l'invito. Verifica la connessione a internet, poi riprova.",
      unpublished:
        "Il dipendente è stato aggiunto all'elenco, ma non è stato possibile pubblicare il suo invito. Condividi il suo link dall'elenco per riprovare.",
      removeUnreachable:
        "Non è stato possibile pubblicare la rimozione. Verifica la connessione a internet, poi riprova.",
      removeFailed: "Non è stato possibile registrare la rimozione. Riprova.",
      removalUnsaved:
        "L'accesso di questo dipendente è stato bloccato, ma non è stato possibile registrarne la rimozione. Riprova: verrà registrata anche alla prossima apertura del tuo account.",
      salesInProgress:
        "Alcune fatture di questo dipendente non sono ancora definitive. Riprova quando la loro versione finale sarà pubblicata (fino a 3 ore dopo la fine di una fattura non pagata).",
      integrationPending:
        "Un'integrazione ha pagamenti non ancora definitivi. Riprova quando lo saranno.",
      exportNewer:
        "Una versione più recente dell'app ha modificato questo assistente. Aggiorna l'app per cambiarlo",
      invoicesNewer:
        "Una versione più recente dell'app ha modificato questo assistente. Aggiorna l'app per cambiarlo"
    },
    removedNotice: "Questo dispositivo non fa più parte del team di {{business}}.",
    join: {
      title: "Unisciti a un team",
      scanLead: "Scansiona il codice QR d'invito che ti mostra il titolare dell'attività.",
      cameraAppLead:
        "Scansiona il codice QR d'invito con la fotocamera del telefono: apre questa pagina.",
      cameraNeeded: "La fotocamera serve a scansionare il codice QR d'invito.",
      allowCamera: "Consenti la fotocamera",
      openSettings: "Apri le impostazioni",
      pasteLabel: "Oppure incolla il link d'invito",
      checking: "Lettura dell'invito…",
      joining: "Ingresso nel team…",
      as: "Incasserai per {{business}} come {{name}}.",
      rights:
        "Questo dispositivo creerà fatture pagate a {{business}}. Non avrà accesso né al portafoglio, né alle impostazioni, né alle vendite degli altri dipendenti.",
      confirm: "Unisciti al team",
      scanAnother: "Scansiona un altro invito",
      errors: {
        invalid: "Questo non è un link d'invito. Verifica che sia stato copiato per intero.",
        notFound: "Questo invito non esiste o è scaduto. Chiedine uno nuovo al titolare.",
        closed: "Questo invito è già stato usato. Chiedine uno nuovo al titolare.",
        expired: "Questo invito è scaduto. Chiedine uno nuovo al titolare.",
        newer:
          "Questo invito proviene da una versione più recente dell'app. Aggiorna l'app, poi riprova.",
        unreachable: "Connessione impossibile. Verifica la connessione a internet, poi riprova.",
        removed: "Il titolare ha ritirato questo invito.",
        alreadySetUp: "Questo dispositivo incassa già per un'attività: non può unirsi a un team."
      }
    }
  },
  integrations: {
    create: "Crea un'integrazione",
    loading: "Caricamento delle tue integrazioni…",
    guide: {
      title: "Incassa sul tuo negozio online",
      lead: "Un'integrazione permette a un negozio online o a uno strumento di far pagare i suoi clienti sul tuo conto.",
      create: {
        title: "Crea l'integrazione",
        caption: "Scegli il tuo negozio (WooCommerce, PrestaShop…) o il linguaggio del tuo server."
      },
      key: {
        title: "Consegna la chiave segreta",
        caption:
          "Incollala nel tuo negozio o affidala al tuo sviluppatore. Resta sul server, mai presso i tuoi clienti."
      },
      pay: {
        title: "I tuoi clienti pagano",
        caption:
          "A ogni ordine, il negozio mostra la fattura. Il pagamento arriva nel tuo portafoglio."
      }
    },
    noMatch: "Nessuna integrazione corrisponde ai filtri.",
    offline:
      "Nessun relay ha risposto: non è stato possibile leggere l'elenco delle integrazioni. Controlla la connessione, poi torna su questa schermata.",
    partial:
      "Non tutti i relay hanno risposto: l'elenco delle integrazioni potrebbe essere incompleto.",
    newer:
      "Alcune integrazioni provengono da una versione più recente dell'app: aggiorna l'app per vederle.",
    columns: {
      name: "Nome",
      date: "Creata il"
    },
    created: "Creata il {{date}}",
    actions: {
      remove: "Rimuovi l'integrazione"
    },
    createSheet: {
      title: "Nuova integrazione",
      lead: "Fai le tue fatture con un'IA, incassa sul tuo negozio online o dal tuo sito.",
      invoices: "Fatture",
      shops: "Negozi online",
      developers: "Per gli sviluppatori",
      developersDetail_one: "SDK: {{names}} e {{count}} altro",
      developersDetail_other: "SDK: {{names}} e altri {{count}}",
      soon: "In arrivo",
      soonLabel: "{{name}}: in arrivo",
      source: "Codice sorgente",
      sourceLabel: "{{name}}: codice sorgente su GitHub",
      oneShopTitle: "Una chiave per un solo negozio",
      oneShop:
        "I server di uno stesso negozio condividono la sua chiave; due negozi, mai: i loro ordini si mescolerebbero, e uno potrebbe risultare pagato con il pagamento dell'altro. Per un altro negozio, crea un'altra integrazione.",
      namePlaceholder: "Negozio online"
    },
    sdk: {
      lead: "L'SDK {{name}} crea sul tuo server la fattura di ogni ordine e ne verifica il pagamento.",
      package: "Il pacchetto",
      open: "Apri su {{site}}",
      openLabel: "Apri {{name}} su {{site}}",
      readme: "Il suo README spiega come installarlo e usarlo.",
      key: "La chiave segreta"
    },
    files: {
      show: "Mostra i passaggi per {{name}}",
      copyName: "Copia il nome {{name}}",
      nameCopied: "Nome copiato: {{name}}",
      copy: "Copia il contenuto",
      copied: "Contenuto copiato",
      contentCopied: "Contenuto di {{name}} copiato",
      copyFailed: "Non è stato possibile copiarlo. Riprova.",
      readFailed: "L'app non è riuscita a leggere questo file: chiudi la guida, poi riaprila.",
      lastLine: "Una volta incollato, finisce alla riga {{line}}.",
      pasted: "Incollato",
      progress: "Incollati: {{count}} su {{total}}"
    },
    keyStep: {
      title: "Crea la chiave di questo negozio",
      leadShop:
        "Fallo quando il campo della chiave è aperto in {{platform}}: verrà mostrata una sola volta.",
      leadSdk:
        "Il tuo server la legge da una variabile d'ambiente, mai da una pagina web né da un repository di codice. Verrà mostrata una sola volta.",
      shopName: "Nome del negozio",
      siteName: "Nome del sito o dello strumento",
      nameHint: "Compare nel tuo portafoglio accanto alle sue vendite.",
      create: "Crea la chiave"
    },
    guides: {
      wix: {
        editor: {
          title: "Apri il codice del sito",
          body: "Su un computer, apri l'editor del tuo sito Wix. In alto, clicca su «Dev Mode», poi su «Turn on Dev Mode»: a sinistra dell'editor compare una colonna di icone. Questa guida mostra l'Editor di Wix; in Wix Studio le schermate sono diverse. I nomi di Wix qui sono quelli inglesi.",
          image:
            "Il menu «Dev Mode» dell'Editor di Wix e il suo pulsante «Turn on Dev Mode», incorniciati."
        },
        packages: {
          title: "Apri i pacchetti",
          body: "In quella colonna di icone, clicca sul cubo («Packages & Apps»). Sotto «npm», clicca su «+ Install packages from npm».",
          image:
            "Il pannello «Packages & Apps» di Wix: l'icona del cubo e il link «+ Install packages from npm», incorniciati."
        },
        install: {
          title: "Installa due pacchetti di Wix",
          body: "Si apre una finestra «Package Manager». Nella sua ricerca, scrivi @wix/ecom, poi clicca su «Install» sulla riga @wix/ecom (non su un'altra dal nome simile). Aspetta che finisca, poi fai lo stesso con @wix/essentials. Chiudi la finestra: i due pacchetti sono elencati sotto «npm». Sono due strumenti di Wix di cui il plugin ha bisogno.",
          image:
            "La finestra «Package Manager»: @wix/ecom scritto nella sua ricerca e il pulsante «Install» della riga @wix/ecom, incorniciati."
        },
        files: {
          title: "Crea i 6 file",
          body: "In «Backend & Public» (l'icona { } della colonna), crea ogni file al suo posto, in quest'ordine, poi incolla il suo contenuto, copiato da qui: quello del plugin {{version}}, verificato dall'app.",
          where: {
            js: "Backend › + › Add .js file",
            file: "Backend › + › Add file",
            servicePlugin: "Service Plugins › + › Payment",
            servicePluginConfig: "Service Plugins › payment-provider › sattlemeCheckout"
          },
          how: {
            js: "Chiamalo {{name}}, poi incolla il suo contenuto. È il più grande: aspetta che Wix lo mostri tutto prima di cliccare altrove.",
            file: "Chiamalo {{name}}. Wix ci mette un esempio: seleziona tutto (Ctrl+A, o ⌘A su un Mac), poi incolla.",
            servicePlugin:
              "Chiama il plugin sattlemeCheckout, poi «Add & Edit Code»: Wix crea questo file e il successivo. Verifica che la scheda aperta sia {{name}}, seleziona tutto, poi incolla.",
            servicePluginConfig:
              "Wix l'ha creato con sattlemeCheckout.js: aprilo, seleziona tutto, poi incolla."
          },
          sharedCode:
            "Il tuo sito ha già un suo {{name}}? Non sostituirlo: incolla il contenuto copiato in fondo al tuo, sotto le sue righe.",
          sharedJobs:
            "Il tuo sito ha già un suo {{name}}? Non sostituirlo: aggiungi il job del plugin (il blocco tra graffe della sua lista «jobs») alla lista «jobs» del tuo, separato da una virgola.",
          image:
            "Il pannello «Backend & Public» di Wix: il + di «Backend» e le voci «Add .js file» e «Add file» del suo menu, incorniciati."
        },
        secrets: {
          title: "Apri il Secrets Manager",
          body: "Nella dashboard del sito, «Developer Tools» › «Secrets Manager». Salva un secret chiamato sattleme-checkout-status-token, con un valore casuale di 32 caratteri o più (dal tuo gestore di password): la password della pagina di stato del plugin. Poi di nuovo «+ Add Secret», chiamato sattleme-checkout-key.",
          image:
            "Il Secrets Manager di Wix: «Secrets Manager» sotto «Developer Tools» e il link «+ Add Secret», incorniciati."
        },
        save: {
          title: "Salva la chiave",
          body: "Incolla la chiave come valore del secret sattleme-checkout-key, poi salva. Resta in quel secret: non scriverla da nessun'altra parte in Wix.",
          image:
            "La finestra «Add secret» di Wix, chiamata sattleme-checkout-key: il suo campo «Value» vuoto e il suo pulsante «Add Secret», incorniciati."
        },
        publish: {
          title: "Pubblica una volta",
          body: "Nell'editor, clicca una sola volta su «Publish»: ogni clic fa una pubblicazione.",
          image: "La parte alta dell'Editor di Wix: il pulsante «Publish», incorniciato."
        },
        status: {
          title: "Apri la pagina di stato",
          body: "Apri l'indirizzo del tuo sito seguito da /_functions/sattlemeCheckoutStatus, poi inserisci il token (il valore del secret sattleme-checkout-status-token). La pagina mostra il plugin {{version}}. Fallo prima di collegare: ricorda l'indirizzo del sito, dove pagano i tuoi clienti.",
          image:
            "La pagina di stato del plugin: il suo campo del token e il suo pulsante, incorniciati."
        },
        connect: {
          title: "Collega il pagamento",
          body: "Nella dashboard, «Settings» › «Accept Payments» › «Bitcoin (Lightning / on-chain)» › «Connect». Primo campo: sattleme-checkout-key, il nome del secret, mai la chiave stessa. Secondo campo: 15, i minuti per pagare una fattura (da 1 a 60). Poi «Connect».",
          image:
            "Il modulo di collegamento di Wix: sattleme-checkout-key nel primo campo, 15 nel secondo e il pulsante «Connect», incorniciati."
        },
        check: {
          title: "Prova un pagamento",
          body: "Fai un ordine sul tuo sito, prima su un sito di prova, e scegli «Bitcoin (Lightning / on-chain)»: si apre la pagina di pagamento del plugin.",
          image:
            "La pagina di pagamento del plugin: «Pay with Bitcoin», l'importo in sats e il tempo rimasto per pagare."
        }
      },
      bebop: {
        open: {
          title: "Apri le impostazioni di sattle.me",
          body: "Nell'amministrazione di be-BOP, apri «Pagamenti» → «sattle.me». Se non è nell'elenco, aggiorna prima be-BOP.",
          image:
            "Screenshot di be-BOP: il menu dell'amministrazione, «sattle.me» incorniciato sotto «Payment Settings»"
        },
        save: {
          title: "Incolla la chiave e salva",
          body: "Incolla la chiave in «Chiave di integrazione (app sattle.me > Integrazioni)». Per accettare anche i pagamenti onchain, spunta «Accetta anche pagamenti on-chain (metodo Bitcoin)». Poi clicca su «Salva».",
          image:
            "Screenshot di be-BOP: le impostazioni di sattle.me, il campo «Integration key», la casella «Also take on-chain payments» e il pulsante «Save» incorniciati"
        },
        test: {
          title: "Prova la connessione",
          body: "Clicca su «Prova la connessione»: be-BOP legge l'integrazione con la sua chiave, senza fare alcuna fattura, e mostra «Connessione riuscita. Le credenziali sattle.me funzionano.». Se i pagamenti onchain sono spuntati, verifica anche che l'integrazione abbia indirizzi Bitcoin: questa app gliene dà alla sua creazione, poi a ogni sblocco con la tua passkey, con la connessione a internet. Se il test non riesce, verifica la chiave, sblocca questa app, poi riprova.",
          image:
            "Screenshot di be-BOP: le impostazioni di sattle.me, il pulsante «Test connection» incorniciato"
        },
        prefer: {
          title: "Metti sattle.me al primo posto",
          body: "Se un altro processore accetta già i pagamenti Lightning o onchain del tuo negozio, apri «Impostazioni» → «Generale». In «Preferenze del processore di pagamento», scegli «sattleme» come «Processore Lightning preferito» e «sattleme-onchain» come «Processore Bitcoin on-chain preferito», poi clicca su «Aggiorna» in fondo alla pagina.",
          image:
            "Screenshot di be-BOP: «Payment processor preferences», sattleme-onchain e sattleme scelti e incorniciati"
        },
        check: {
          title: "Verifica il tuo negozio",
          body: "Al passaggio del pagamento, i tuoi clienti possono ora scegliere «Lightning» come «Metodi di pagamento», e anche «Onchain» se hai spuntato i pagamenti onchain: be-BOP lo propone da 10.000 sats. Una volta fatto l'ordine, lo pagano scansionando un codice QR. Un pagamento onchain paga l'ordine dopo 3 conferme, circa 30 minuti, di più con commissioni basse. Ogni pagamento è un vero pagamento in bitcoin, verso il tuo portafoglio.",
          image:
            "Screenshot di un negozio be-BOP: «Lightning» come «Payment method» al passaggio del pagamento"
        }
      },
      pretix: {
        plugins: {
          title: "Apri i plugin dell'evento",
          body: "Nel backend di pretix, apri il tuo evento, poi, nel suo menu, «Impostazioni» → «Plugin».",
          image: "Screenshot di pretix: il menu dell'evento, «Plugins» evidenziato sotto «Settings»"
        },
        enable: {
          title: "Attiva il plugin",
          body: "Cerca «sattle.me», poi clicca su «Enable».",
          image:
            "Screenshot di pretix: i plugin, filtrati per «sattle.me», il suo pulsante «Enable» evidenziato"
        },
        open: {
          title: "Apri le sue impostazioni",
          body: "In «Impostazioni» → «Pagamento», clicca su «Impostazioni» accanto a «Bitcoin (sattle.me)».",
          image:
            "Screenshot di pretix: i metodi di pagamento, il pulsante «Settings» di «Bitcoin (sattle.me)» evidenziato"
        },
        save: {
          title: "Incolla la chiave e salva",
          body: "Spunta «Abilita metodo di pagamento», incolla la chiave in «Chiave di integrazione», poi clicca su «Salva» in fondo alla pagina: pretix la verifica, poi non la mostra più. «Tempo per pagare» è il tempo che il cliente ha per pagare una fattura: da 1 a 60 minuti, 15 se non lo cambi.",
          image:
            "Screenshot di pretix: le impostazioni di Bitcoin (sattle.me), la casella «Enable payment method» e il campo «Integration key» evidenziati"
        },
        channels: {
          title: "Scegli i canali di vendita",
          body: "Nella stessa pagina, «Limita ad alcuni canali di vendita specifici» indica dove i tuoi clienti possono pagare in bitcoin: «Vendite online» se non lo cambi. Spunta gli altri canali che vuoi, poi clicca su «Salva».",
          image:
            "Screenshot di pretix: «Restrict to specific sales channels», la sua casella «Online shop» evidenziata"
        },
        check: {
          title: "Verifica il tuo negozio",
          body: "Al passaggio del pagamento, i tuoi clienti possono ora scegliere «Bitcoin», poi scansionare un codice QR: in Lightning sotto circa 1.000 sats, in Lightning o onchain sopra. Un pagamento onchain risulta in conferma in meno di un minuto e paga l'ordine dopo 3 conferme, circa 30 minuti, di più con commissioni basse. Quando mempool.space tarda a rispondere, una fattura può essere fatta solo in Lightning. Anche in modalità test di pretix, ogni pagamento è un vero pagamento in bitcoin, verso il tuo portafoglio.",
          image: "Screenshot di un negozio pretix: «Bitcoin» al passaggio del pagamento"
        }
      },
      nopcommerce: {
        download: {
          title: "Scarica il plugin",
          body: "Scarica il plugin: un archivio .zip, da tenere così com'è, senza decomprimerlo. Richiede nopCommerce 5.00.",
          link: "Apri il marketplace di nopCommerce",
          file: "Scarica la versione {{version}}"
        },
        plugins: {
          title: "Apri i plugin locali",
          body: "Nell'amministrazione di nopCommerce, apri «Configuration» → «Local plugins».",
          image:
            "Screenshot di nopCommerce: il menu dell'amministrazione, «Local plugins» evidenziato"
        },
        upload: {
          title: "Carica l'archivio",
          body: "Clicca su «Upload plugin or theme», scegli l'archivio, poi clicca su «Upload plugin or theme» nella finestra che si apre.",
          image:
            "Screenshot di nopCommerce: la finestra «Upload plugin or theme», l'archivio scelto, il suo pulsante «Upload plugin or theme» evidenziato"
        },
        restart: {
          title: "Riavvia nopCommerce",
          body: "Clicca su «Restart application to apply changes» in cima alla pagina, poi attendi che la pagina compaia di nuovo: il tuo negozio non risponde mentre nopCommerce si riavvia. Il plugin compare nell'elenco solo dopo questo riavvio.",
          image:
            "Screenshot di nopCommerce: «Local plugins», il suo pulsante «Restart application to apply changes» evidenziato"
        },
        install: {
          title: "Installa il plugin",
          body: "Nell'elenco, trova «Bitcoin (sattle.me)», nel gruppo «Payment methods», clicca su «Install», poi di nuovo su «Restart application to apply changes».",
          image:
            "Screenshot di nopCommerce: il plugin Bitcoin (sattle.me) nell'elenco, il suo pulsante «Install» evidenziato"
        },
        open: {
          title: "Apri le sue impostazioni",
          body: "Una volta riavviato nopCommerce, clicca su «Configure» sotto «Bitcoin (sattle.me)». Lo trovi anche in «Configuration» → «Payment methods».",
          image:
            "Screenshot di nopCommerce: il plugin Bitcoin (sattle.me), installato, il suo pulsante «Configure» evidenziato"
        },
        save: {
          title: "Incolla la chiave e salva",
          body: "Spunta «Enabled», incolla la chiave in «Integration key», poi clicca su «Save» in fondo alla pagina: il plugin la verifica, poi non la mostra più. «Time to pay (minutes)» è il tempo che il cliente ha per pagare una fattura: da 1 a 60 minuti, 15 se non lo cambi.",
          image:
            "Screenshot di nopCommerce: le impostazioni di Bitcoin (sattle.me), la casella «Enabled» e il campo «Integration key» evidenziati"
        },
        check: {
          title: "Verifica il tuo negozio",
          body: "Al passaggio del pagamento, i tuoi clienti possono ora scegliere «Bitcoin». Una volta confermato l'ordine, lo pagano su una pagina del tuo negozio scansionando un codice QR: in Lightning sotto circa 1.000 sats, in Lightning o onchain sopra. Un pagamento onchain paga l'ordine dopo 3 conferme, circa 30 minuti, di più con commissioni basse. I pagamenti sono verificati anche dalle attività pianificate di nopCommerce, che devono poter raggiungere l'URL del tuo negozio. Ogni pagamento è un vero pagamento in bitcoin, verso il tuo portafoglio.",
          image: "Screenshot di un negozio nopCommerce: «Bitcoin» al passaggio del pagamento"
        },
        autoCancel: {
          title: "Escludere Bitcoin dall'annullamento automatico",
          body: "Se «Enable auto-canceling of unpaid orders» è spuntata («Configuration» → «Settings» → «Order settings»), aggiungi «Bitcoin (sattle.me)» ai suoi «Excluded payment methods», perché un ordine il cui pagamento è in conferma non venga annullato."
        }
      },
      woocommerce: {
        download: {
          title: "Scaricare il plugin",
          body: "Scarica il file del plugin, sattleme-for-woocommerce-….zip, e tienilo così com'è, senza decomprimerlo. Il plugin richiede WordPress 7.0, WooCommerce 11.1 e PHP 8.2, o più recenti.",
          link: "Apri la pagina GitHub del plugin",
          file: "Scarica la versione {{version}}"
        },
        upload: {
          title: "Caricare il file",
          body: "Nell'amministrazione di WordPress, apri «Plugin» → «Aggiungi plugin», clicca su «Carica plugin» in cima alla pagina, scegli il file, poi clicca su «Installa ora».",
          image:
            "Screenshot di WordPress: «Upload Plugin» e il file scelto, i pulsanti «Upload Plugin» e «Install Now» evidenziati"
        },
        activate: {
          title: "Attivare il plugin",
          body: "Una volta installato il plugin, clicca su «Attiva plugin».",
          image:
            "Screenshot di WordPress: il plugin installato, il pulsante «Activate Plugin» evidenziato"
        },
        open: {
          title: "Aprire le sue impostazioni",
          body: "In «Plugin», sotto «sattle.me for WooCommerce», clicca su «Impostazioni». Ci arrivi anche da «WooCommerce» → «Impostazioni» → «Pagamenti», con il nome «sattle.me (Bitcoin)».",
          image:
            "Screenshot di WordPress: il plugin sattle.me for WooCommerce nell'elenco dei plugin, il link «Settings» evidenziato"
        },
        save: {
          title: "Incollare la chiave e salvare",
          body: "Spunta «Accetta pagamenti in bitcoin con sattle.me», incolla la chiave in «Chiave di integrazione», poi clicca su «Salva le modifiche» in fondo alla pagina: il plugin verifica la chiave, poi non la mostra più. La pagina indica allora «Connesso a», seguito dal nome della tua azienda. «Tempo per pagare» è il tempo che il cliente ha per pagare una fattura: da 1 a 60 minuti, 15 di default.",
          image:
            "Screenshot di WordPress: le impostazioni di sattle.me (Bitcoin) salvate, «Connected to» e la casella spuntata evidenziati"
        },
        check: {
          title: "Verificare il negozio",
          body: "Al passaggio del pagamento, i tuoi clienti possono ora pagare in bitcoin, con il logo di sattle.me. Una volta effettuato l'ordine, lo pagano su una pagina del tuo negozio scansionando un codice QR: in Lightning sotto circa 1.000 sats, in Lightning o onchain sopra. Un pagamento onchain paga l'ordine dopo 3 conferme, circa 30 minuti, di più con commissioni basse. Il plugin verifica anche i pagamenti ogni minuto, anche a pagina di pagamento chiusa, con le attività pianificate di WordPress (WP-Cron): su un negozio con poche visite, falle avviare ogni minuto dal cron del tuo server, come spiega il README del plugin. Ogni pagamento è un vero pagamento in bitcoin, verso il tuo portafoglio.",
          image:
            "Screenshot di un negozio WooCommerce: il pagamento in bitcoin al passaggio del pagamento"
        }
      },
      grandnode: {
        download: {
          title: "Scarica il plugin",
          body: "Scarica l'archivio del plugin, Payments.Sattleme-….zip, e tienilo così com'è, senza decomprimerlo. Richiede GrandNode 2.4.",
          link: "Apri la pagina GitHub del plugin",
          file: "Scarica la versione {{version}}"
        },
        plugins: {
          title: "Apri i plugin locali",
          body: "Nell'amministrazione di GrandNode, apri «Plugins» → «Local plugins».",
          image:
            "Screenshot di GrandNode: il menu «Plugins» dell'amministrazione, «Local plugins» evidenziato"
        },
        upload: {
          title: "Carica l'archivio",
          body: "Clicca su «Upload» in cima alla pagina, scegli l'archivio, poi clicca su «Upload» nella finestra che si apre. GrandNode mostra «Plugin uploaded», poi si ferma per riavviarsi: ricarica la pagina nel browser (non con «Reload list of plugins», che ferma di nuovo GrandNode) finché l'elenco dei plugin non ricompare; nel frattempo il tuo negozio non risponde. Se dopo qualche minuto non risponde ancora, riavvia GrandNode (il suo servizio o il suo container).",
          image:
            "Screenshot di GrandNode: la finestra «Upload», l'archivio scelto, il suo pulsante «Upload» evidenziato"
        },
        install: {
          title: "Installa il plugin",
          body: "Nell'elenco, trova «Bitcoin (sattle.me)», nel gruppo «Payment methods»: la sua etichetta «Installed» resta rossa finché non è installato. Clicca su «Install»: GrandNode si riavvia di nuovo. Ricarica la pagina allo stesso modo.",
          image:
            "Screenshot di GrandNode: il plugin Bitcoin (sattle.me) nell'elenco, il suo pulsante «Install» evidenziato"
        },
        open: {
          title: "Apri le sue impostazioni",
          body: "Quando compare «Configure» per «Bitcoin (sattle.me)», cliccaci sopra. Trovi le sue impostazioni anche in «Configuration» → «Payment» → «Payment methods», con il nome «Bitcoin».",
          image:
            "Screenshot di GrandNode: il plugin Bitcoin (sattle.me), installato, il suo pulsante «Configure» evidenziato"
        },
        save: {
          title: "Incolla la chiave e salva",
          body: "Attiva «Enabled», incolla la chiave in «Integration key», poi clicca su «Save» in cima alla pagina: il plugin la verifica, poi non la mostra più. «Time to pay (minutes)» è il tempo che il cliente ha per pagare una fattura: da 1 a 60 minuti, 15 se non lo cambi. In un'amministrazione in italiano, il plugin chiama queste impostazioni «Attivato», «Chiave di integrazione» e «Tempo per pagare (minuti)».",
          image:
            "Screenshot di GrandNode: le impostazioni di Bitcoin (sattle.me), «Enabled», il campo «Integration key» e «Save» evidenziati"
        },
        check: {
          title: "Verifica il tuo negozio",
          body: "Al passaggio del pagamento, i tuoi clienti possono ora pagare in bitcoin, con il logo di sattle.me. Una volta confermato l'ordine, lo pagano su una pagina del tuo negozio scansionando un codice QR: in Lightning sotto circa 1.000 sats, in Lightning o onchain sopra. Un pagamento onchain paga l'ordine dopo 3 conferme, circa 30 minuti, di più con commissioni basse. GrandNode verifica inoltre i pagamenti ogni minuto, anche a pagina di pagamento chiusa. Ogni pagamento è un vero pagamento in bitcoin, verso il tuo portafoglio.",
          image:
            "Screenshot di un negozio GrandNode: il pagamento in bitcoin al passaggio del pagamento"
        }
      },
      smartstore: {
        download: {
          title: "Scarica il plugin",
          body: "Scarica il pacchetto del plugin, Smartstore.Module.Sattleme.Bitcoin.….zip, e tienilo così com'è, senza decomprimerlo. Il plugin richiede Smartstore 6.4.",
          link: "Apri la pagina GitHub del plugin",
          file: "Scarica la versione {{version}}"
        },
        plugins: {
          title: "Apri i plugin",
          body: "Nell'amministrazione di Smartstore, apri «Plugins» → «Manage plugins».",
          image:
            "Screenshot di Smartstore: il menu «Plugins» dell'amministrazione, «Manage plugins» incorniciato"
        },
        upload: {
          title: "Carica il pacchetto",
          body: "Clicca su «Upload plugin» in cima alla pagina e scegli il pacchetto: Smartstore lo carica subito e conferma che è caricato e decompresso.",
          image:
            "Screenshot di Smartstore: la pagina dei plugin, il suo pulsante «Upload plugin» incorniciato"
        },
        reload: {
          title: "Ricarica l'elenco dei plugin",
          body: "Clicca su «Edit» → «Reload list of plugins». Smartstore si riavvia: attendi che la pagina compaia di nuovo, nel frattempo il tuo negozio non risponde.",
          image: "Screenshot di Smartstore: il menu «Edit», «Reload list of plugins» incorniciato"
        },
        install: {
          title: "Installa il plugin",
          body: "Nell'elenco, trova «Bitcoin (sattle.me)» e clicca su «Install»: Smartstore mette in coda la sua installazione.",
          image:
            "Screenshot di Smartstore: il plugin Bitcoin (sattle.me) nell'elenco, il suo pulsante «Install» incorniciato"
        },
        execute: {
          title: "Avvia l'installazione",
          body: "Clicca su «Execute tasks» in cima alla pagina, poi su «OK». Smartstore si riavvia di nuovo e installa il plugin: attendi che la pagina compaia di nuovo.",
          image:
            "Screenshot di Smartstore: la pagina dei plugin, il suo pulsante «Execute tasks» incorniciato"
        },
        open: {
          title: "Apri le sue impostazioni",
          body: "Sotto «Bitcoin (sattle.me)», clicca sul pulsante a forma di ingranaggio, poi su «Configure». Trovi le sue impostazioni anche in «Configuration» → «Payment methods», con il nome «Bitcoin».",
          image:
            "Screenshot di Smartstore: il plugin Bitcoin (sattle.me), installato, il suo ingranaggio e «Configure» incorniciati"
        },
        save: {
          title: "Incolla la chiave e salva",
          body: "Incolla la chiave in «Integration key», poi clicca su «Save» in cima alla pagina: il plugin la verifica, poi non la mostra più. «Time to pay (minutes)» è il tempo che il cliente ha per pagare una fattura: da 1 a 60 minuti, 15 se non lo cambi. In un'amministrazione in italiano, il plugin chiama queste impostazioni «Chiave di integrazione» e «Tempo per pagare (minuti)».",
          image:
            "Screenshot di Smartstore: le impostazioni di Bitcoin (sattle.me), il campo «Integration key» e «Save» incorniciati"
        },
        activate: {
          title: "Attiva il metodo di pagamento",
          body: "Apri «Configuration» → «Payment methods» e clicca su «Activate» sotto «Bitcoin»: il tuo negozio lo offre al pagamento solo una volta attivato.",
          image:
            "Screenshot di Smartstore: i metodi di pagamento, il pulsante «Activate» di Bitcoin incorniciato"
        },
        timezone: {
          title: "Imposta il fuso orario del tuo negozio",
          body: "In «Configuration» → «Settings», scegli il tuo «Default store time zone» e salva: la pagina di pagamento indica in esso fino a quando il cliente può pagare. Senza, Smartstore usa quello del suo server, spesso UTC."
        },
        check: {
          title: "Verifica il tuo negozio",
          body: "Al passaggio del pagamento, i tuoi clienti possono ora scegliere «Bitcoin». Una volta confermato l'ordine, lo pagano su una pagina del tuo negozio scansionando un codice QR: in Lightning sotto circa 1.000 sats, in Lightning o onchain sopra. Un pagamento onchain paga l'ordine dopo 3 conferme, circa 30 minuti, di più con commissioni basse. Smartstore verifica anche i pagamenti ogni minuto, anche a pagina di pagamento chiusa, purché le sue attività pianificate raggiungano l'indirizzo del tuo negozio. Ogni pagamento è un vero pagamento in bitcoin, verso il tuo portafoglio.",
          image: "Screenshot di un negozio Smartstore: «Bitcoin» al passaggio del pagamento"
        }
      },
      prestashop: {
        download: {
          title: "Scarica il modulo",
          body: "Scarica il file del modulo, sattleme.zip, e tienilo così com'è, senza decomprimerlo. Il modulo richiede PrestaShop 9.0, 9.1 o 9.2, con PHP da 8.2 a 8.5.",
          link: "Apri la pagina GitHub del modulo",
          file: "Scarica la versione {{version}}"
        },
        upload: {
          title: "Apri il gestore dei moduli",
          body: "Nel back office di PrestaShop, apri «Modules» → «Module Manager», poi clicca su «Upload a module» in cima alla pagina.",
          image:
            "Screenshot di PrestaShop: il gestore dei moduli, il suo pulsante «Upload a module» incorniciato"
        },
        drop: {
          title: "Carica il file",
          body: "Trascina il file nella finestra, oppure clicca su «select file» e sceglilo: PrestaShop carica il modulo e lo installa subito.",
          image:
            "Screenshot di PrestaShop: la finestra «Upload a module», la sua area per il file incorniciata"
        },
        open: {
          title: "Apri le sue impostazioni",
          body: "Quando PrestaShop mostra «Module installed!», clicca su «Configure». Trovi le sue impostazioni anche in «Modules» → «Module Manager», sotto «sattle.me».",
          image:
            "Screenshot di PrestaShop: «Module installed!», il suo pulsante «Configure» incorniciato"
        },
        save: {
          title: "Incolla la chiave e salva",
          body: "Attiva «Accept bitcoin payments», incolla la chiave in «Integration key», poi clicca su «Save» in fondo alla pagina: il modulo verifica la chiave, poi non la mostra più. La pagina indica allora «The integration key of», seguito dal nome della tua attività. «Time to pay» è il tempo che il cliente ha per pagare una fattura: da 1 a 60 minuti, 15 se non lo cambi. In un back office in italiano, il modulo chiama queste impostazioni «Accetta pagamenti in bitcoin», «Chiave di integrazione» e «Tempo per pagare».",
          image:
            "Screenshot di PrestaShop: le impostazioni di sattle.me, «Accept bitcoin payments» e il campo «Integration key» incorniciati"
        },
        cron: {
          title: "Pianifica le verifiche in background",
          body: "Sotto «Background checks», la pagina dà una riga per il crontab del tuo server: aggiungila al crontab dell'utente del server web, o come attività cron nel pannello del tuo hosting, perché venga eseguita ogni minuto. Il modulo verifica allora i pagamenti ogni minuto, anche a pagina di pagamento chiusa. Finché non è stata eseguita, la pagina indica «The background checks never ran: set up the cron.». In un back office in italiano, il modulo chiama questa parte «Verifiche in background».",
          image:
            "Screenshot di PrestaShop: le impostazioni di sattle.me salvate, la riga di crontab sotto «Background checks» incorniciata"
        },
        check: {
          title: "Verifica il tuo negozio",
          body: "Al passaggio del pagamento, i tuoi clienti possono ora scegliere «Pay with bitcoin» («Paga con bitcoin» in un negozio in italiano). Una volta effettuato l'ordine, lo pagano su una pagina del tuo negozio scansionando un codice QR: in Lightning sotto circa 1.000 sats, in Lightning o onchain sopra. Un pagamento onchain paga l'ordine dopo 3 conferme, circa 30 minuti, di più con commissioni basse. Ogni pagamento è un vero pagamento in bitcoin, verso il tuo portafoglio.",
          image:
            "Screenshot di un negozio PrestaShop: «Pay with bitcoin» al passaggio del pagamento"
        }
      },
      magento: {
        install: {
          title: "Installa il modulo",
          body: "Sul server del tuo Magento, dalla cartella principale di Magento e con l'utente del server web, installa il modulo da Packagist con Composer, poi attivalo con questi comandi. Il modulo richiede Magento Open Source 2.4.7, 2.4.8 o 2.4.9, con PHP da 8.2 a 8.5. In modalità sviluppatore, «setup:di:compile» e «setup:static-content:deploy» non servono.",
          link: "Apri la pagina Packagist del modulo"
        },
        open: {
          title: "Apri le sue impostazioni",
          body: "Nell'admin di Magento, apri «Stores» → «Configuration», poi «Sales» → «Payment Methods», ed espandi «Bitcoin (sattle.me)».",
          image:
            "Schermata dell'admin di Magento: i metodi di pagamento, «Bitcoin (sattle.me)» evidenziato"
        },
        save: {
          title: "Incolla la chiave e salva",
          body: "Imposta «Enabled» su «Yes», incolla la chiave in «Integration key», poi clicca su «Save Config» in cima alla pagina: il modulo verifica la chiave, poi non la mostra più. «Connected to» mostra allora il nome della tua attività. «Time to pay (minutes)» è il tempo che il cliente ha per pagare una fattura: da 1 a 60 minuti, 15 se non lo cambi. In un admin in italiano, il modulo chiama queste impostazioni «Attivato», «Chiave di integrazione», «Collegato a» e «Tempo per pagare (minuti)».",
          image:
            "Schermata dell'admin di Magento: le impostazioni di Bitcoin (sattle.me), «Enabled» e il campo «Integration key» evidenziati"
        },
        cron: {
          title: "Verifica il cron di Magento",
          body: "Il modulo verifica i pagamenti ogni minuto, anche quando la pagina di pagamento è chiusa, tramite il cron di Magento, che annulla anche gli ordini rimasti non pagati. Un Magento in produzione lo esegue già; se il tuo no, installalo dalla cartella principale di Magento, con l'utente del server web, con questo comando."
        },
        check: {
          title: "Verifica il tuo negozio",
          body: "Al passaggio del pagamento, i tuoi clienti possono ora scegliere «Bitcoin». Una volta effettuato l'ordine, lo pagano su una pagina del tuo negozio scansionando un codice QR: in Lightning sotto circa 1.000 sats, in Lightning o onchain sopra. Un pagamento onchain paga l'ordine dopo 3 conferme, circa 30 minuti, di più con commissioni basse. Ogni pagamento è un vero pagamento in bitcoin, verso il tuo portafoglio.",
          image: "Schermata di un negozio Magento: «Bitcoin» al passaggio del pagamento"
        }
      }
    },
    assistant: {
      row: "Assistente IA",
      rowDetail: "Claude, ChatGPT… fanno le tue fatture",
      title: "Assistente IA",
      lead: "Il tuo assistente IA fa le fatture della tua attività, numerate insieme alle tue, con il link di pagamento e il PDF, e ti dice quando sono pagate. Non spende mai nulla.",
      hosted: {
        title: "In Claude, ChatGPT…",
        detail: "Pronto all'uso, ospitato da sattle.me",
        badge: "Il più semplice"
      },
      desktop: { title: "In Claude Desktop", detail: "La chiave resta sul tuo computer" },
      selfHosted: {
        title: "Sul tuo server",
        detail: "Il suo codice open source, su GitHub",
        badge: "Per esperti"
      },
      hostedSteps: {
        add: {
          title: "Aggiungi il connettore",
          claude:
            "In Claude, questo pulsante apre l'aggiunta del connettore, già compilata: controllala, poi conferma.",
          other:
            "In ChatGPT o in un'altra app di IA, aggiungi un connettore personalizzato (server MCP) con questo indirizzo, così com'è:"
        },
        addClaude: "Aggiungi a Claude",
        openChatGpt: "Apri ChatGPT",
        copy: "Copia l'indirizzo",
        copied: "Indirizzo copiato",
        copyFailed: "Non è stato possibile copiare l'indirizzo",
        connect: {
          title: "Collegati",
          body: "L'app apre una pagina di sattle.me che chiede la chiave dell'assistente. Quella pagina indica dove ti riporterà: continua solo se è la tua app di IA."
        }
      },
      desktopSteps: {
        download: {
          title: "Scarica l'estensione",
          body: "Il file «.mcpb» dell'ultima versione.",
          link: "L'estensione su github.com",
          file: "Scarica la versione {{version}}"
        },
        open: {
          title: "Aprila",
          body: "Apri il file: Claude Desktop installa l'assistente e ne chiede la chiave."
        }
      },
      selfHostedSteps: {
        install: {
          title: "Installa il server",
          body: "Lo stesso server MCP di sattle.me, su una macchina tua o del tuo fornitore, con Docker. Il suo codice open source e la guida all'installazione sono su GitHub.",
          link: "sattleme/mcp-server su github.com"
        },
        trust: {
          title: "Questo server vede le tue fatture",
          body: "Chi lo gestisce vede la chiave dell'assistente e le fatture che fa: nomi e indirizzi dei tuoi clienti, importi. Se non ti fidi più, rimuovi l'assistente: si ferma subito."
        },
        add: {
          title: "Aggiungi il connettore",
          body: "Quando il server è online, aggiungi il suo indirizzo come connettore personalizzato nella tua app di IA (Claude, ChatGPT…)."
        },
        connect: {
          title: "Collegati",
          body: "L'app apre una pagina del tuo server che chiede la chiave dell'assistente. Quella pagina indica dove ti riporterà: continua solo se è la tua app di IA."
        }
      },
      keyStep: {
        title: "Crea la chiave dell'assistente",
        leadHosted: "Fallo quando la pagina di sattle.me la chiede: viene mostrata una sola volta.",
        leadDesktop: "Fallo quando Claude Desktop la chiede: viene mostrata una sola volta.",
        leadSelfHosted:
          "Fallo quando la pagina del tuo server la chiede: viene mostrata una sola volta.",
        name: "Nome dell'assistente",
        namePlaceholder: "Claude di Alice",
        nameHint: "Compare nel tuo portafoglio accanto alle sue fatture.",
        permissionsTitle: "Cosa potrà fare questo assistente",
        nonePicked: "Attiva almeno un'autorizzazione per creare la chiave.",
        powerTitle: "Non permette mai di spendere",
        power: {
          hosted: "Incollala solo nella pagina di sattle.me, mai in una conversazione.",
          desktop: "Incollala solo in Claude Desktop, mai in una conversazione.",
          selfHosted: "Incollala solo nella pagina del tuo server, mai in una conversazione."
        }
      },
      keySheet: {
        once: "Viene mostrata una sola volta: copiala ora. Non potrà più essere mostrata, nemmeno con la tua passkey. Se la perdi, rimuovi l'assistente e creane un altro.",
        unpublished:
          "Non è ancora stato possibile pubblicare l'assistente {{name}} sui tuoi relay. Lo sarà al prossimo sblocco con la tua passkey, con una connessione a internet: fino ad allora, non può fare nulla.",
        secret:
          "Tienila segreta. Se è trapelata, rimuovi l'assistente e creane un altro: le fatture già fatte restano pagabili.",
        pasteHosted:
          "Incollala nella pagina di sattle.me. Poi chiedi, per esempio: «Fai una fattura a Dupont SA per 3 giorni di consulenza a 1200 CHF, con scadenza a 30 giorni.»",
        pasteDesktop:
          "Incollala nel campo «Assistant key» di Claude Desktop. Poi chiedi, per esempio: «Fai una fattura a Dupont SA per 3 giorni di consulenza a 1200 CHF, con scadenza a 30 giorni.»",
        pasteSelfHosted:
          "Incollala nella pagina del tuo server. Poi chiedi, per esempio: «Fai una fattura a Dupont SA per 3 giorni di consulenza a 1200 CHF, con scadenza a 30 giorni.»",
        pasteHostedExport:
          "Incollala nella pagina di sattle.me. Poi chiedi, per esempio: «Esporta le transazioni del mese scorso in CSV per il mio contabile.»",
        pasteSelfHostedExport:
          "Incollala nella pagina del tuo server. Poi chiedi, per esempio: «Esporta le transazioni del mese scorso in CSV per il mio contabile.»",
        pasteDesktopExport:
          "Incollala nel campo «Assistant key» di Claude Desktop. Poi chiedi, per esempio: «Esporta le transazioni del mese scorso in CSV per il mio contabile.»"
      },
      created: "Assistente IA · creato il {{date}}",
      createdExporting: "Assistente IA · creato il {{date}} · esporta le tue transazioni",
      createdExportOnly:
        "Assistente IA · creato il {{date}} · esporta le tue transazioni, senza fatture",
      createdNoInvoices: "Assistente IA · creato il {{date}} · senza fatture",
      invoicing: {
        switch: "Fare fatture",
        switchHint:
          "Attivandolo, autorizzi questo assistente IA a fare fatture a nome della tua attività, numerate insieme alle tue, e a leggere quelle che ha fatto, con i nomi e gli indirizzi dei tuoi clienti. Questa scelta non potrà più essere cambiata per questa chiave."
      },
      export: {
        allow: "Consenti l'esportazione delle transazioni",
        withdraw: "Revoca l'esportazione delle transazioni",
        switch: "Accesso alle tue vendite e ai pagamenti inviati",
        switchHint:
          "Attivandolo, autorizzi questo assistente IA a leggere le vendite e i pagamenti inviati della tua attività, per esportarli. Non potrà mai spendere.",
        suspended:
          "Temporaneamente non disponibile: l'accesso degli assistenti IA alle tue vendite e ai tuoi invii sarà di nuovo proposto in una prossima versione.",
        allowDialog: {
          title: "Consentire a {{name}} di esportare le tue transazioni?",
          body: "{{name}} potrà leggere le vendite e i pagamenti inviati di {{business}} registrati sui tuoi relay ed esportarli come «$t(navigation.destinations.wallet) › $t(walletExport.open)». I pagamenti ricevuti senza vendita (direttamente sul tuo indirizzo Lightning o sul tuo portafoglio) non sono inclusi. Non potrà mai spendere. Se revochi il consenso, non esporterà più, ma una copia della sua chiave fatta fino ad allora potrebbe ancora leggere le tue vendite registrate prima.",
          confirm: "Consenti"
        },
        withdrawDialog: {
          title: "Revocare l'esportazione a {{name}}?",
          body: "{{name}} non potrà più esportare le transazioni di {{business}}. Ciò che ha già esportato resta nella tua app di IA.",
          confirm: "Revoca l'esportazione"
        },
        allowedTitle: "Esportazione consentita",
        allowedBody: "{{name}} può esportare le tue transazioni",
        withdrawnTitle: "Esportazione revocata",
        withdrawnBody: "{{name}} non può più esportare le tue transazioni",
        unreachable:
          "Il consenso non è stato pubblicato. Controlla la connessione a internet, poi riprova",
        createFailedTitle: "Esportazione non ancora consentita",
        createFailed:
          "{{name}} è stato creato, ma l'esportazione non è stata consentita. Riprova dall'elenco delle integrazioni"
      },
      remove: "Rimuovi l'assistente",
      removeDialog: {
        title: "Rimuovere {{name}}?",
        body: "{{name}} non farà più fatture per {{business}}. Quelle che ha fatto restano pagabili fino alla scadenza, e nel tuo portafoglio.",
        confirm: "Rimuovi l'assistente",
        doneTitle: "Assistente rimosso",
        doneBody: "{{name}} non farà più fatture."
      }
    },
    keySheet: {
      title: "Chiave di {{name}}",
      keyLabel: "Chiave segreta",
      once: "Viene mostrata una sola volta: copiala ora. Non potrà più essere mostrata, nemmeno con la tua passkey. Se la perdi, rimuovi l'integrazione e creane un'altra.",
      unpublished:
        "Non è ancora stato possibile pubblicare {{name}} sui tuoi relay. Lo sarà al prossimo sblocco con la tua passkey, con una connessione a internet: fino ad allora, il suo server non la trova.",
      secret:
        "Tienila segreta, solo sui server di quel negozio: mai in una pagina web, in un'app né per un altro negozio. Non permette di spendere i tuoi fondi. Se è trapelata, rimuovi l'integrazione e creane un'altra.",
      copy: "Copia la chiave",
      copied: "Chiave copiata",
      copyFailed: "Non è stato possibile copiare la chiave. Selezionala, poi copiala.",
      done: "Fine"
    },
    removeDialog: {
      title: "Rimuovere {{name}}?",
      body: "La sua chiave non potrà più creare richieste di pagamento per {{business}}. Una richiesta già mostrata resta pagabile fino alla sua scadenza, e le sue vendite passate restano nel portafoglio.",
      confirm: "Rimuovi l'integrazione",
      doneTitle: "Integrazione rimossa",
      doneBody: "La chiave di {{name}} non crea più richieste di pagamento."
    },
    pendingDialog: {
      title: "{{name}} ha pagamenti in corso",
      unknownTitle: "Pagamenti di {{name}} non verificati",
      lead: "Attendi che i pagamenti di {{name}} siano definitivi prima di rimuoverla, affinché ognuna delle sue vendite resti a suo nome.",
      unknownLead:
        "Non è stato possibile verificare se i pagamenti di {{name}} sono definitivi. Attendi che lo siano prima di rimuoverla, affinché ognuna delle sue vendite resti a suo nome.",
      open_one: "{{count}} richiesta di pagamento ancora aperta, al più tardi fino alle {{time}}.",
      open_other:
        "{{count}} richieste di pagamento ancora aperte, al più tardi fino alle {{time}}.",
      confirming_one:
        "{{count}} pagamento Bitcoin in attesa di conferma (3 conferme, circa trenta minuti).",
      confirming_other:
        "{{count}} pagamenti Bitcoin in attesa di conferma (3 conferme, circa trenta minuti).",
      end: "Riprova dopo.",
      forceNote:
        "Se non puoi attendere (la sua chiave è trapelata, per esempio), rimuovila comunque: i suoi pagamenti arriveranno sempre nel tuo portafoglio, ma quelli che non ha visto prima della rimozione non saranno a suo nome.",
      force: "Rimuovi comunque",
      retry: "Riprova",
      close: "Chiudi"
    },
    failedTitle: "Azione impossibile",
    unreachableTitle: "Connessione impossibile",
    errors: {
      noAccount: "Sblocca questo punto vendita con la tua passkey per gestire le integrazioni.",
      tooMany: "Il tuo account ha già {{max}} integrazioni. Rimuovine una per crearne un'altra.",
      tooManyAssistants:
        "Il tuo account ha già {{max}} assistenti. Rimuovine uno per crearne un altro.",
      invalidName: "Inserisci il nome dell'integrazione.",
      unreachable:
        "Non è stato possibile pubblicare l'integrazione. Verifica la connessione a internet, poi riprova.",
      removeUnreachable:
        "Non è stato possibile pubblicare la rimozione. Verifica la connessione a internet, poi riprova.",
      removeFailed: "Non è stato possibile registrare la rimozione. Riprova.",
      removalUnsaved:
        "La chiave di questa integrazione non crea più richieste di pagamento, ma non è stato possibile registrarne la rimozione. Riprova: verrà registrata anche alla prossima apertura del tuo account.",
      exportNewer:
        "Una versione più recente dell'app ha modificato questo assistente. Aggiorna l'app per cambiarlo"
    }
  },
  articles: {
    add: "Aggiungi un articolo",
    loading: "Caricamento dei tuoi articoli…",
    guide: {
      title: "Vendi in pochi tocchi",
      lead: "Crea una volta bevande, piatti e dessert: appaiono nella tua cassa e in quella dei tuoi dipendenti.",
      create: {
        title: "Crea i tuoi articoli",
        caption:
          "Un nome, un prezzo, una foto. Scansiona un codice a barre per compilare la scheda più in fretta.",
        captionNoScan: "Un nome, un prezzo, una foto."
      },
      tap: {
        title: "Toccali alla cassa",
        caption:
          "Passa a «$t(pos.mode.articles)»: ogni tocco aggiunge l'articolo al carrello. Nell'app sul telefono puoi anche scansionarne il codice a barre."
      },
      cash: {
        title: "Incassa il carrello",
        caption: "Il totale si calcola da solo: il tuo cliente scansiona il codice QR e paga."
      }
    },
    offline: "Nessun relay ha risposto. Controlla la connessione, poi torna su questa schermata.",
    newer:
      "Alcuni articoli provengono da una versione più recente dell'app: aggiorna l'app per vederli.",
    openHint: "Apre l'articolo per modificarlo o eliminarlo.",
    saved: {
      title: "Articolo salvato",
      body: "{{name}} è tra i tuoi articoli."
    },
    changed: {
      title: "Articolo modificato",
      body: "{{name}} è aggiornato."
    },
    removed: {
      title: "Articolo eliminato",
      body: "{{name}} non è più tra i tuoi articoli."
    },
    removeDialog: {
      title: "Eliminare {{name}}?",
      body: "L'articolo scompare dai tuoi articoli, su tutti i tuoi dispositivi. L'azione è definitiva.",
      confirm: "Elimina l'articolo"
    },
    form: {
      title: "Nuovo articolo",
      editTitle: "Modifica l'articolo",
      scan: "Scansiona",
      addPhoto: "Aggiungi una foto",
      changePhoto: "Cambia la foto",
      preparingPhoto: "Preparazione della foto…",
      dropPhoto: "Trascina qui una foto",
      choosePhoto: "oppure scegli un file",
      photoMenu: "Foto dell'articolo",
      takePhoto: "Scatta una foto",
      pickPhoto: "Scegli tra le tue foto",
      nameLabel: "Nome",
      namePlaceholder: "Nome dell'articolo",
      priceLabel: "Prezzo",
      priceInvalid: "Inserisci un prezzo come 4,80",
      descriptionLabel: "Descrizione",
      descriptionPlaceholder: "Ingredienti, formato, allergeni",
      addDescription: "Aggiungi una descrizione",
      fromOpenFoodFacts: "· da Open Food Facts",
      searching: "· ricerca su Open Food Facts",
      save: "Salva l'articolo",
      saveChanges: "Salva le modifiche",
      remove: "Elimina l'articolo"
    },
    scanner: {
      title: "Scansiona un codice a barre",
      aim: "Inquadra il codice a barre",
      lead: "Il nome e la foto provengono da Open Food Facts. Resterà solo da fissare il prezzo.",
      leadNoLookup: "Ti resterà da inserire nome, foto e prezzo.",
      manual: "Inserisci senza codice a barre",
      denied: "Consenti l'accesso alla fotocamera per scansionare un codice a barre.",
      // The web app: the browser's own settings (BarcodeScanner.tsx).
      deniedWeb:
        "Consenti la fotocamera per questo sito nelle impostazioni del browser (il lucchetto accanto all'indirizzo), poi tocca «Consenti la fotocamera».",
      allow: "Consenti la fotocamera",
      settings: "Apri le impostazioni",
      unavailable:
        "Non è stato possibile avviare la fotocamera. Questo dispositivo potrebbe non averne una.",
      engineFailed:
        "Non è stato possibile caricare il lettore di codici a barre. Verifica la connessione a internet, poi riprova.",
      retry: "Riprova",
      notFoundTitle: "Prodotto non trovato",
      notFoundBody: "Questo codice a barre non è riconosciuto. Inserisci il nome dell'articolo.",
      unreachableTitle: "Ricerca del prodotto non riuscita",
      unreachableBody: "Scansiona di nuovo tra un attimo, oppure inserisci il nome dell'articolo."
    },
    errors: {
      title: "Articolo non salvato",
      changeTitle: "Articolo non modificato",
      removeTitle: "Articolo non eliminato",
      noAccount: "Sblocca l'app con la tua passkey, poi riprova.",
      invalid: "Inserisci un nome e un prezzo.",
      tooMany: "Il catalogo è pieno: 500 articoli al massimo.",
      unreachable: "Troppo pochi relay hanno risposto. Controlla la connessione, poi riprova.",
      photoDenied: "Consenti l'accesso alle foto nelle impostazioni del dispositivo, poi riprova.",
      cameraDenied:
        "La fotocamera non si apre. Consentila nelle impostazioni del dispositivo, poi riprova.",
      photoUnreadable: "Questa immagine non può essere usata. Scegline un'altra."
    }
  },
  activity: {
    limited: "Vista limitata alle tue operazioni",
    followUp: "Da seguire",
    movements: "Movimenti",
    yourMovements: "I tuoi movimenti",
    allMovements: "Tutti i movimenti",
    allYourMovements: "Tutti i tuoi movimenti",
    dayNet: "Netto del giorno: {{amount}}",
    clearFilter: "{{name}}, rimuovi il filtro",
    reading: "Caricamento delle vendite e delle fatture…",
    loadFailed:
      "Non è stato possibile leggere la tua attività. Controlla la connessione a internet, poi riprova.",
    empty: "Ancora nessun movimento.",
    noMatch: "Nessun movimento corrisponde ai filtri.",
    showExpired: "Mostra le scadute ({{count}})",
    hideExpired: "Nascondi le scadute",
    showMore: "Mostra altri",
    arrivals_one: "{{count}} nuovo movimento",
    arrivals_other: "{{count}} nuovi movimenti",
    expiredHidden: "Le fatture scadute sono nascoste.",
    pendingCredit: {
      awaiting: "non ancora nel saldo",
      received: "Pagamento ricevuto",
      confirmed: "confermato",
      credit: "Accredito sul tuo saldo",
      waiting: "in attesa",
      fees: "L'accredito di questo pagamento sul tuo saldo costa in questo momento più di {{fee}}, il nostro limite. Avverrà automaticamente quando questo costo non lo supererà più, quando apri il tuo portafoglio.",
      feesQuoted:
        "L'accredito di questo pagamento sul tuo saldo costa in questo momento {{price}}, più del nostro limite di {{fee}}. Avverrà automaticamente quando questo costo non lo supererà più, quando apri il tuo portafoglio.",
      other:
        "L'accredito avverrà automaticamente quando apri il tuo portafoglio. Commissioni da detrarre: al massimo {{fee}}."
    },
    followUps: {
      open: "Aperte",
      underpaid: "Sottopagate",
      unconfirmed: "In conferma",
      draft: "Bozze"
    },
    followUpTitles: {
      open: "Fatture aperte",
      underpaid: "Fatture sottopagate",
      unconfirmed: "In conferma",
      draft: "Bozze"
    },
    followUpLabel: "{{name}}: {{count}}, {{total}}",
    rest: "restano {{amount}}",
    states: {
      open: "Aperta",
      underpaid: "Sottopagata",
      unconfirmed: "In conferma",
      draft: "Bozza",
      expired: "Scaduta",
      canceled: "Annullata",
      inProgress: "In corso",
      failed: "Non riuscito"
    },
    done: {
      paid: "Pagata",
      received: "Ricevuto",
      sent: "Inviato"
    },
    sources: {
      pos: "Punto vendita",
      link: "Fattura",
      integration: "Integrazione",
      receive: "Ricezione",
      send: "Invio",
      recovered: "Recupero"
    },
    titles: {
      link: "Fattura",
      recovered: "Fondi recuperati",
      mtpSale: "Vendita in {{currency}}",
      // Rows copied from the v2 account (src/features/activity/legacy-history.ts).
      payout: "Prelievo sul tuo portafoglio",
      referral: "Commissione di segnalazione"
    },
    mtpSale: {
      section: "Vendita",
      received: "Ricevi",
      transferNowNote: "Versato da solo, senza attendere le altre vendite",
      transferLaterNote: "In un bonifico cumulativo con le altre vendite, da {{threshold}}",
      follow: "Segui la vendita",
      followLabel: "Ordine {{order}}, segui la vendita"
    },
    you: "Tu",
    stamp: "{{day}} · {{time}}",
    columns: {
      date: "Data",
      label: "Descrizione",
      source: "Origine",
      by: "Da",
      state: "Stato",
      amount: "Importo",
      sats: "sats"
    },
    detail: {
      date: "Data",
      takenBy: "Incassato da",
      madeBy: "Creata da",
      rest: "Resta da pagare",
      endsAt: "Pagabile fino al",
      payments: "Pagamenti",
      link: "Link di pagamento",
      openLink: "Apri la fattura",
      copyLink: "Copia il link",
      linkCopied: "Link copiato",
      accepted: "Accettata il",
      difference: "Differenza accettata",
      acceptedLate:
        "Accettata troppo tardi per essere inviata a {{integration}}: lì l'ordine resta scaduto. Verifica che sia segnato come pagato nel suo back-office."
    },
    accept: {
      action: "Accetta l'importo ricevuto",
      done: "Importo ricevuto accettato",
      dialog: {
        title: "Accettare l'importo ricevuto?",
        body: "La vendita sarà pagata a {{received}}. La differenza di {{difference}} non sarà più richiesta. È definitivo.",
        bodyOrder:
          "L'ordine sarà pagato a {{received}}: il tuo negozio lo vedrà pagato una volta confermato il pagamento. La differenza di {{difference}} non sarà più richiesta. È definitivo.",
        bodyLate:
          "L'ordine sarà pagato a {{received}} e la differenza di {{difference}} non sarà più richiesta. Questa accettazione non viene trasmessa: per {{integration}} l'ordine resta scaduto, segnalo come pagato anche nel suo back-office. È definitivo.",
        confirm: "Accetta",
        cancel: "Indietro"
      },
      late: {
        title: "La fattura di questo ordine è terminata",
        body: "Per {{integration}} l'ordine resta scaduto e la tua accettazione non sarà visibile. Se lo accetti qui, segnalo come pagato anche nel suo back-office.",
        closingTitle: "La fattura di questo ordine sta per terminare",
        closingBody:
          "È troppo tardi perché {{integration}} riceva la tua accettazione. Se lo accetti qui, segnalo come pagato anche nel suo back-office.",
        lapsedBody:
          "La tua accettazione non ha raggiunto la maggioranza dei tuoi relay prima della fine della fattura: {{integration}} non la vedrà. Se lo accetti qui, segnalo come pagato anche nel suo back-office.",
        yourShop: "il tuo negozio"
      },
      errors: {
        network: "Impossibile salvare l'accettazione, riprova",
        already: "Questa vendita è già accettata",
        ended: "Troppo tardi per inviare l'accettazione al negozio: rileggi prima di accettare"
      },
      pending:
        "Accettazione in corso di salvataggio: conterà quando la maggioranza dei tuoi relay l'avrà ricevuta, prima della fine della fattura.",
      blocked: {
        unread:
          "L'app non ha ancora potuto verificare presso la maggioranza dei tuoi relay se l'importo ricevuto è già stato accettato. «$t(activity.accept.action)» comparirà qui una volta fatta questa verifica. Se dura, usa «$t(relays.test)» in «$t(settings.relays)».",
        unmet:
          "L'importo ricevuto è stato accettato quando era di {{received}}, ma oggi l'app ne vede meno, per esempio dopo la sostituzione di una transazione. L'accettazione conterà di nuovo appena questo importo sarà raggiunto: non si ripete.",
        newer:
          "L'importo ricevuto è stato accettato con una versione più recente dell'app: aggiorna l'app per vedere questa accettazione."
      }
    }
  },
  table: {
    headerHint: "Ordina e filtra",
    sortedBy: "ordinato: {{order}}",
    filtered: "filtrato",
    menu: "{{name}}: ordina e filtra",
    sort: "Ordina",
    orders: {
      text: { ascending: "Dalla A alla Z", descending: "Dalla Z alla A" },
      number: {
        ascending: "Dal più piccolo al più grande",
        descending: "Dal più grande al più piccolo"
      },
      date: {
        ascending: "Dal meno recente al più recente",
        descending: "Dal più recente al meno recente"
      }
    },
    show: "Mostra",
    selectAll: "Seleziona tutto",
    periods: {
      thisWeek: "Questa settimana",
      lastWeek: "Settimana scorsa",
      thisMonth: "Questo mese",
      lastMonth: "Mese scorso",
      thisYear: "Quest'anno",
      lastYear: "Anno scorso",
      older: "Meno recenti"
    },
    value: "{{label}}, {{count}}",
    emptyValue: "Vuoto",
    clearFilters: "Cancella i filtri"
  },
  wallet: {
    balance: "Saldo",
    atLeast: "almeno",
    discreet: "Discreto",
    hiddenAmount: "Importo nascosto",
    received: "Ricevuto in 30 giorni",
    sent: "Inviato in 30 giorni",
    send: "Invia",
    sell: "Vendere",
    sellFrom: "da {{amount}} sats",
    opening: "Apertura del tuo portafoglio…",
    loadFailed:
      "Non è stato possibile leggere il tuo portafoglio. Controlla la connessione a internet, poi riprova.",
    retry: "Riprova",
    empty: "Ancora nessun movimento.",
    guide: {
      lead: "Ancora nessun movimento. Ecco come arrivano:",
      label: "Come arrivano i movimenti",
      take: {
        title: "Incassa",
        caption: "Inserisci un importo alla cassa: il tuo cliente scansiona il codice QR e paga."
      },
      receive: {
        title: "Ricevi",
        caption: "Il pagamento arriva nel tuo portafoglio e appare qui, con chi l'ha incassato."
      },
      follow: {
        title: "Segui e invia",
        caption:
          "Fatture, link di pagamento, trasferimenti: segui tutto qui. Invia i tuoi sats quando vuoi."
      }
    },
    syncing: "Aggiornamento…",
    syncingWallet: "Sincronizzazione del portafoglio…",
    syncLate:
      "Non è stato possibile aggiornare il tuo portafoglio: il saldo e i movimenti mostrati sono quelli di questo dispositivo e potrebbero essere incompleti. Controlla la connessione a internet.",
    syncLateBlank:
      "Non è stato possibile sincronizzare il tuo portafoglio. Controlla la connessione a internet, poi riprova.",
    noRate: "Tasso di cambio non disponibile: alcuni importi solo in sats.",
    today: "Oggi",
    yesterday: "Ieri",
    meta: "{{time}} · {{kind}}",
    kinds: {
      lightningReceipt: "Ricezione lightning",
      lightningAddress: "Indirizzo lightning",
      lightningInvoice: "Fattura lightning",
      bitcoinAddress: "Indirizzo bitcoin",
      sparkTransfer: "Trasferimento Spark"
    },
    titles: {
      deposit: "Deposito",
      withdrawal: "Prelievo",
      receipt: "Ricezione",
      sending: "Invio"
    },
    pills: {
      confirming: "In conferma",
      inProgress: "In corso",
      failed: "Non riuscito"
    },
    networks: {
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      spark: "Spark"
    },
    detail: {
      date: "Data",
      network: "Rete",
      fee: "Commissioni",
      sendFee: "Commissioni di invio",
      noFee: "Nessuna",
      reference: "Riferimento",
      copy: "Copia il riferimento",
      copied: "Riferimento copiato",
      recipient: "Destinatario",
      copyAddress: "Copia l'indirizzo",
      addressCopied: "Indirizzo copiato",
      close: "Chiudi"
    },
    sendSheet: {
      intro:
        "Inserisci, incolla o scansiona un indirizzo lightning, una fattura lightning, un indirizzo bitcoin o un indirizzo Spark.",
      introNoScan:
        "Inserisci o incolla un indirizzo lightning, una fattura lightning, un indirizzo bitcoin o un indirizzo Spark.",
      close: "Chiudi",
      cancel: "Annulla",
      recipient: "Destinatario",
      recipientPlaceholder: "Indirizzo o fattura",
      paste: "Incolla",
      scan: "Scansiona un codice QR",
      reading: "Lettura del destinatario…",
      kinds: {
        lightningAddress: "Indirizzo lightning",
        lnurlPay: "Link LNURL",
        bolt11: "Fattura lightning",
        bitcoinAddress: "Indirizzo bitcoin",
        sparkAddress: "Indirizzo Spark"
      },
      recipientErrors: {
        unrecognized: "Inserisci un indirizzo o una fattura",
        unsupported: "Inserisci un indirizzo o una fattura",
        otherNetwork: "Usa un indirizzo della rete principale",
        expired: "Chiedi una nuova fattura",
        unreachable: "Verifica l'indirizzo lightning",
        lnurlUnreachable: "Riprova: il link LNURL non risponde",
        failed: "Verifica la connessione a internet",
        pasteEmpty: "Copia prima un indirizzo o una fattura",
        pasteFailed: "Incolla nel campo con la tastiera"
      },
      amount: "Importo",
      switchToSats: "Inserisci in sats",
      switchToFiat: "Inserisci in {{currency}}",
      available: "Disponibile: {{amount}}",
      amountErrors: {
        invalid: "Inserisci un importo valido",
        belowMin: "Inserisci almeno {{amount}}",
        aboveMax: "Inserisci al massimo {{amount}}",
        aboveBalance: "Inserisci al massimo il saldo disponibile",
        feesAboveBalance: "Riduci l'importo per coprire le commissioni"
      },
      speed: "Velocità",
      speeds: {
        fast: "Rapida",
        medium: "Normale",
        slow: "Economica"
      },
      fee: "Commissioni stimate",
      feePreparing: "Calcolo delle commissioni…",
      quoteFailed:
        "Non è stato possibile calcolare le commissioni. Verifica la connessione a internet, poi riprova.",
      balanceAfter: "Saldo dopo l'invio",
      expiresIn: "Scade tra",
      send: "Invia {{amount}}",
      pay: "Paga {{amount}}",
      confirming: "Conferma con la tua passkey…",
      sending: "Invio in corso…",
      sendFailed:
        "L'invio non è andato a buon fine. Verifica la connessione a internet, poi riprova: il pagamento partirà una sola volta.",
      recordFailed:
        "I relay del tuo account non hanno risposto: non è partito nulla. Controlla la connessione a internet, poi riprova.",
      noRate: "Il cambio del bitcoin non è disponibile: inserisci l'importo in sats.",
      result: {
        completedTitle: "Invio effettuato",
        onchainTitle: "Pagamento inviato",
        onchainBody:
          "La rete Bitcoin deve ancora confermare la transazione: il suo stato appare nell'elenco dei movimenti.",
        pendingTitle: "Invio in corso",
        pendingBody:
          "Il pagamento è in viaggio. Questa finestra si aggiorna da sola; chiuderla non annulla l'invio.",
        stalledTitle: "Ancora in corso",
        stalledBody: "Il suo stato finale apparirà nell'elenco dei movimenti.",
        failedTitle: "L'invio non è riuscito",
        failedBody: "Verifica il destinatario e il saldo, poi riprova.",
        recipientTo: "a {{recipient}}",
        recipientSent: "a {{recipient}}",
        done: "Fine"
      },
      scanHint:
        "Inquadra il codice QR di una fattura lightning, di un indirizzo lightning o di un indirizzo bitcoin.",
      scanType: "Inserisci",
      scanDenied: "Consenti l'accesso alla fotocamera per scansionare un codice QR.",
      scanAllow: "Consenti la fotocamera",
      scanSettings: "Apri le impostazioni"
    }
  },
  sell: {
    title: "Vendere",
    back: "Indietro",
    retry: "Riprova",
    busy: {
      starting: "Lettura del tuo conto Mt Pelerin…",
      reading: "Lettura del tuo conto Mt Pelerin…",
      signingIn: "Accesso a Mt Pelerin…",
      sendingCode: "Invio del codice…",
      checkingCode: "Verifica del codice…",
      savingProfile: "Salvataggio…",
      preparingInvoice: "Preparazione del pagamento di 1 sat…",
      confirming: "Conferma…",
      paying: "Pagamento…",
      addingAccount: "Aggiunta del conto…",
      savingAccount: "Salvataggio del conto…",
      loggingOut: "Disconnessione…"
    },
    failures: {
      offline:
        "Il servizio di vendita non risponde. Controlla la connessione a internet, poi riprova",
      server: "Il servizio di vendita ha inviato una risposta illeggibile. Riprova tra un momento",
      refused: "La richiesta è stata rifiutata",
      codeRefused: "Questo codice non è quello giusto",
      codeExpired: "Questo codice è scaduto: chiedine uno nuovo",
      malformed: "La fattura della vendita non è quella attesa: non è stato pagato nulla",
      otherNetwork: "La fattura della vendita non è quella attesa: non è stato pagato nulla",
      otherAmount: "La fattura della vendita non è quella attesa: non è stato pagato nulla",
      expired: "La fattura della vendita è scaduta: non è stato pagato nulla",
      payment: "Il pagamento non è partito. Riprova",
      record:
        "I relay del tuo account non hanno risposto: non è stato venduto nulla. Controlla la connessione a internet, poi riprova",
      ibanTaken: "Questo IBAN è già registrato su un altro conto Mt Pelerin",
      accountKnown: "Questo conto è già tra i tuoi conti bancari, in questa valuta",
      accountUnchanged:
        "Mt Pelerin non ha modificato questo conto: i suoi dati restano quelli indicati. Contatta Mt Pelerin per modificarli"
    },
    sessionLost: "La tua sessione Mt Pelerin è scaduta: accedi di nuovo",
    intro: {
      title: "Vendere con Mt Pelerin",
      lead: "Mt Pelerin, intermediario finanziario svizzero, acquista i tuoi sats e vira i franchi sul tuo conto bancario.",
      connectLead: "Il tuo conto Mt Pelerin si apre con la chiave del tuo conto sattle.me.",
      connect: "Accedi a Mt Pelerin",
      phoneLead: "Il tuo conto Mt Pelerin si apre con il tuo numero.",
      phone: "Numero di telefono",
      phoneHint: "Mt Pelerin ti invia un codice via SMS",
      sendCode: "Ricevi il codice",
      dialCountry: "Paese del numero",
      dialCodeOf: "Paese del numero: {{country}}, {{code}}"
    },
    code: {
      title: "Inserisca il suo codice",
      lead: "Mt Pelerin gliel'ha appena inviato per SMS al {{phone}}.",
      label: "Codice a 6 cifre",
      notReceived: "Non ricevuto?",
      resend: "Invia di nuovo il codice",
      submit: "Conferma"
    },
    profile: {
      title: "La tua e-mail",
      lead: "Mt Pelerin ne ha bisogno per aprire il tuo conto. Ti invia lì la ricevuta di ogni vendita.",
      email: "E-mail",
      emailInvalid: "Inserisci un'e-mail valida",
      phone: "Numero di telefono",
      phoneInvalid: "Inserisci un numero valido, con il prefisso",
      phoneCaption: "Il numero del tuo conto Mt Pelerin",
      submit: "Continua"
    },
    validation: {
      title: "Verificare il suo portafoglio",
      lead: "Il suo portafoglio deve essere verificato. Paghi 1 sat ({{value}}) per effettuare questa verifica.",
      toPay: "Da pagare",
      fee: "Commissioni Lightning",
      pay: "Paga 1 sat",
      unaffordable:
        "Il tuo saldo non copre 1 sat e le commissioni. Torna dopo il tuo prossimo incasso",
      leadNoRate:
        "Il suo portafoglio deve essere verificato. Paghi 1 sat per effettuare questa verifica.",
      lessThan: "meno di {{amount}}",
      about: "circa {{amount}}"
    },
    pending: {
      badge: "In corso",
      title: "Verifica del suo portafoglio",
      leadNoBank: "Puoi continuare: il tuo conto bancario non dipende da questa verifica.",
      leadBank:
        "Puoi lasciare questa schermata: potrai vendere appena il tuo portafoglio sarà verificato (di solito meno di 15 minuti).",
      paid: "1 sat pagato",
      toBank: "Aggiungi il tuo conto bancario"
    },
    verified: {
      title: "Indirizzo verificato",
      lead: "Il tuo sat è arrivato. Le tue vendite partiranno da {{address}}.",
      account: "Conto Mt Pelerin",
      address: "Indirizzo Lightning",
      addressVerified: "Verificato",
      bank: "Conto bancario",
      toBank: "Aggiungi il tuo conto bancario",
      continue: "Continua",
      bankTodo: "Da completare"
    },
    bank: {
      title: "Dove virare i tuoi {{currency}}",
      lead: "Il conto su cui sono versate le tue vendite. È tuo o della tua azienda.",
      none: "Nessun conto bancario registrato per ora",
      add: "Aggiungi un conto"
    },
    accountForm: {
      title: "Aggiungi un conto",
      submit: "Aggiungi questo conto"
    },
    accountEdit: {
      title: "Modifica il conto",
      lead: "Per un altro IBAN o un'altra valuta, aggiungi un conto.",
      submit: "Salva"
    },
    payoutCurrency: {
      label: "Valuta dei bonifici",
      swift:
        "Bonifico internazionale (SWIFT): un giorno lavorativo o più. Le banche intermediarie possono applicare commissioni, da pochi dollari a diverse decine"
    },
    accounts: {
      title: "Conti bancari",
      lead: "Le tue vendite sono versate solo su questi conti.",
      add: "Aggiungi un conto",
      fromSettings: "Impostazioni",
      pending: "In attesa",
      editHint: "Modifica il nome e l'indirizzo del titolare",
      // Accounts Mt Pelerin listed that the app cannot read (guards.ts): never offered.
      unreadable_one: "{{count}} altro conto non è stato letto: non viene proposto",
      unreadable_other: "{{count}} altri conti non sono stati letti: non vengono proposti",
      // Mt Pelerin lacks a line of its holder's address: offered all the same.
      incompleteAddress: "Indirizzo incompleto"
    },
    addressTaken: {
      title: "Indirizzo già registrato",
      body: "Il tuo indirizzo Lightning è registrato su un altro conto Mt Pelerin. Accedi con il numero di quel conto.",
      switch: "Cambia conto"
    },
    unavailable: "La vendita di sats tramite Lightning non è disponibile per ora",
    sale: {
      amount: "Importo",
      available: "Disponibile: {{amount}}",
      change: "Cambia",
      fee: "Commissioni di vendita",
      receive: "Ricevi circa",
      estimating: "Calcolo…",
      estimateFailed: "Non disponibile",
      pending: "In attesa",
      pendingBalance: "Saldo: {{amount}}",
      pendingSale: "Questa vendita: {{amount}}",
      pendingGauge: "{{balance}} in attesa, più {{sale}} di questa vendita, su {{threshold}}",
      pendingGaugeHeld: "{{balance}} in attesa, su {{threshold}}",
      limitsTitle: "Senza identificazione",
      limitLeft: "{{left}} rimanenti su {{limit}}",
      seeLimits: "Vedi i miei limiti",
      settings: "Impostazioni della vendita",
      quote: "Vedi il preventivo",
      aboveMax: "Inserisci al massimo {{amount}}",
      aboveBalance: "Inserisci al massimo il saldo disponibile",
      tooSmall: "Devi ricevere almeno {{amount}}: aumenta l'importo",
      transferFee: "Spese di bonifico",
      transfer: "Bonifico",
      transferNow: "Immediato",
      transferNowNote: "{{fee}} di spese di bonifico sotto {{threshold}}, gratuito oltre",
      transferLater: "Differito",
      transferLaterNote:
        "Senza spese di bonifico: in un bonifico cumulativo con le altre vendite, quando raggiungono {{threshold}}",
      equivalentOf: "l'equivalente di {{amount}}",
      chooseAccount: "Su quale conto?",
      addAccount: "Aggiungi un conto"
    },
    quote: {
      title: "Preventivo",
      heading: "Ricevi {{amount}}",
      lead: "I tuoi sats sono venduti e i franchi versati sul tuo conto bancario.",
      selling: "Vendi",
      rate: "Corso",
      ratePrice: "1 BTC = {{price}}",
      fee: "Commissioni di vendita",
      lightningFee: "Commissioni Lightning",
      account: "Sul conto",
      lockedUntil: "Corso garantito fino alle {{time}}",
      expired: "Il corso è scaduto: non è stato venduto nulla",
      refresh: "Aggiorna il preventivo",
      sell: "Vendi {{amount}}",
      otherOrder: "Il preventivo ricevuto non è quello richiesto: non è stato pagato nulla",
      nothingWired: "Questa vendita non verserebbe nulla sul tuo conto: non è stato pagato nulla",
      unaffordable: "Il tuo saldo non copre questa vendita e le sue commissioni"
    },
    order: {
      heading: "{{amount}} verso la tua banca",
      lead: "Vendita di {{sats}}, {{date}}. Puoi lasciare questa schermata: la vendita prosegue.",
      leadDated: "Vendita del {{date}}. Puoi lasciare questa schermata: la vendita prosegue.",
      received: "Sats ricevuti",
      receivedTodo: "Ricezione dei sats",
      receivedNow: "Sats in ricezione",
      receivedFailed: "Sats non ricevuti",
      transferred: "Bonifico sul tuo conto",
      held: "Questa vendita è in fase di verifica: controlli le sue e-mail di Mt Pelerin",
      delayed: "Il bonifico è rinviato: attendilo entro la settimana",
      refunded: "Ti vengono restituiti i tuoi sats",
      failed: "Questa vendita è stata rifiutata",
      expired: "Il preventivo è scaduto: non è stato venduto nulla",
      reference: "Numero d'ordine",
      outcomes: {
        awaitingPayment: "In attesa del pagamento",
        expired: "Scaduta",
        inProgress: "In corso",
        delayed: "Rinviata",
        held: "In verifica",
        sent: "Virata",
        refunded: "Rimborsata",
        failed: "Rifiutata"
      },
      title: "Vendita",
      soldTitle: "Venduto con successo",
      soldLead: "I suoi {{sats}} sono venduti: {{amount}} saranno versati sul suo conto.",
      withOthers:
        "In un bonifico cumulativo con le altre vendite, quando raggiungono {{threshold}}",
      next: "E ora",
      processing: "Elaborazione della vendita",
      processingNow: "In elaborazione",
      processed: "Convertiti in {{currency}}",
      delayChf: "Entro 1 giorno lavorativo (bonifico in Svizzera, dal lunedì al venerdì)",
      delayEur: "Entro 1-2 giorni lavorativi (bonifico SEPA)",
      delaySwift: "Un giorno lavorativo o più (bonifico internazionale SWIFT)",
      close: "Chiudi",
      seeSales: "Vedere le sue vendite"
    },
    history: {
      title: "Le tue vendite",
      empty: "Nessuna vendita per ora",
      unreadable: "Troppe vendite per elencarle qui"
    },
    split: {
      quoting: "Definizione del cambio della sua vendita…",
      receive: "Riceve",
      title: "Ripartizione",
      lead: "Dal {{date}}, il suo portafoglio ha ricevuto {{received}}.",
      kept: "Tenuto in bitcoin ({{percent}})",
      share: "Quota da vendere ({{percent}})",
      sold: "Venduto ora: {{amount}}",
      lightningFee: "Commissioni Lightning, in più",
      deferred:
        "Le vendite differite sono raggruppate e saranno versate in una sola volta, appena raggiungono {{threshold}}.",
      balance:
        "Il suo saldo permette di vendere solo {{amount}}. Il resto della quota non sarà venduto.",
      limit:
        "Senza verifica dell'identità, le sue vendite sono limitate a {{limit}} al mese. Venda {{amount}} ora (il resto della quota non sarà venduto), oppure si faccia prima identificare per vendere tutta la quota.",
      sell: "Vendere {{amount}}",
      identify: "Identificarmi presso Mt Pelerin",
      identifyHeading: "Si identifichi per vendere la sua quota",
      identifyLead:
        "La sua quota da vendere è di {{due}}. Senza verifica dell'identità, le sue vendite sono limitate a {{limit}} al mese, e questo limite è raggiunto.",
      identifyHow:
        "La sua identità si verifica sul sito di Mt Pelerin, con il numero di telefono del suo conto. Una volta verificata l'identità, tutta la quota le viene proposta qui.",
      soldHeading: "Venduto con successo",
      soldLead:
        "I suoi {{sats}} sono venduti per {{amount}}, che si aggiungono alle sue vendite in attesa di bonifico.",
      held: "In attesa di bonifico",
      payout: {
        title: "Prossimo bonifico",
        threshold: "da {{threshold}}",
        held: "Già in attesa",
        sale: "Questa vendita",
        left: "Ancora <strong>{{left}}</strong> di vendite, poi il tutto sarà versato sul tuo conto bancario.",
        reached: "La soglia è raggiunta: il tutto sarà versato sul tuo conto bancario."
      },
      notice: "Ripartizione: {{amount}} da vendere, circa {{fiat}}.",
      noticeSell: "Vendere",
      noticeIdentify: "Ripartizione: {{due}} da vendere, una volta verificata la sua identità.",
      noticeSee: "Vedere",
      setup:
        "La sua ripartizione prevede il {{percent}} in {{currency}}. Configuri la vendita per vendere questa quota.",
      setupOpen: "Configurare la vendita"
    },
    limits: {
      title: "Limiti di vendita",
      lead: "Senza verifica dell'identità, può vendere al massimo:",
      perSale: "Per vendita",
      month: "Ultimi {{days}} giorni",
      year: "Quest'anno",
      leftUntil: "Restano {{amount}} fino al {{date}}",
      leftRolling: "Restano {{amount}}: una vendita conta per {{days}} giorni",
      unknown: "Non calcolato: una vendita in una valuta diversa dal franco",
      feesTitle: "Commissioni incluse",
      identified: "La sua identità è verificata presso Mt Pelerin.",
      noLimit: "Senza limite",
      perMonth: "Al mese",
      perYear: "All'anno",
      identifyHow:
        "Per vendere di più, faccia verificare la sua identità sul sito di Mt Pelerin, con il numero di telefono del suo conto.",
      fees: "Conta l'importo venduto, prima della deduzione delle commissioni. Calcolato dalle tue vendite."
    },
    settings: {
      title: "Impostazioni della vendita",
      account: "Conto Mt Pelerin",
      byKey: "Conto Mt Pelerin · connesso con la chiave del suo conto",
      lightning: "Indirizzo Lightning",
      verified: "verificato",
      pendingValidation: "in attesa",
      banks: "Conti bancari",
      limits: "Limiti di vendita",
      history: "Le tue vendite",
      logout: "Disconnettiti da Mt Pelerin",
      logoutTitle: "Disconnettersi da Mt Pelerin?",
      logoutBody:
        "Su tutti i tuoi dispositivi. I tuoi conti e le tue vendite restano presso Mt Pelerin: li ritroverai riconnettendoti.",
      logoutConfirm: "Disconnetti",
      cancel: "Annulla",
      banksCount_one: "{{count}} conto",
      banksCount_other: "{{count}} conti",
      left: "Restano {{amount}}",
      perSale: "{{amount}} per vendita",
      salesCount_one: "{{count}} quest'anno",
      salesCount_other: "{{count}} quest'anno"
    },
    close: "Chiudi",
    poweredBy: "Powered by"
  },
  walletExport: {
    open: "Esporta",
    title: "Esporta le transazioni",
    close: "Chiudi",
    lead: "Le transazioni concluse del periodo: vendite pagate, ricezioni e invii.",
    period: "Periodo",
    periods: {
      thisMonth: "Questo mese",
      lastMonth: "Mese scorso",
      thisYear: "Quest'anno",
      lastYear: "Anno scorso",
      custom: "Date precise"
    },
    days: "{{first}} – {{last}}",
    from: "Dal",
    to: "Al",
    format: "Tipo di esportazione",
    formats: {
      pdf: "Semplice (PDF)",
      csv: "Dettagliata (CSV)"
    },
    amounts: "Importi",
    units: {
      fiat: "In {{currency}}",
      btc: "In BTC"
    },
    columnsTitle: "Colonne",
    columnsTicked: "{{ticked}} su {{total}}",
    columns: {
      dateAndTime: "Data e ora",
      label: "Descrizione",
      source: "Origine",
      by: "Da",
      network: "Tipo di pagamento",
      reference: "Riferimento",
      bitcoinAmount: "Importo in BTC",
      bitcoinFees: "Commissioni in BTC",
      fiatAmount: "Importo in {{currency}}",
      fiatFees: "Commissioni in {{currency}}",
      originalAmount: "Importo inserito",
      originalCurrency: "Valuta inserita",
      bitcoinPrice: "Prezzo del bitcoin in {{currency}}",
      remark: "Osservazione"
    },
    remarks: {
      accepted:
        "Differenza di {{fiat}} / {{btc}}, accettata dal titolare il {{date}} alle {{time}}",
      acceptedSats: "Differenza di {{btc}}, accettata dal titolare il {{date}} alle {{time}}"
    },
    submit: "Esporta",
    errors: {
      unread:
        "Non è stato possibile leggere le tue vendite. Controlla la connessione a internet, poi riprova.",
      receiving:
        "Un pagamento bitcoin visto da un punto vendita non è ancora arrivato nel tuo portafoglio. Riprova tra qualche minuto.",
      failed: "Non è stato possibile fare l'esportazione. Riprova."
    },
    pdf: {
      title: "Rapporto sulle transazioni",
      period: "Dal {{first}} al {{last}}",
      made: "Redatto il {{date}}",
      summary: "Riepilogo",
      count: "Numero di transazioni",
      countOf: {
        pos: "di cui punto vendita",
        link: "di cui fatture",
        integration: "di cui integrazioni",
        receive: "di cui ricezioni",
        send: "di cui invii"
      },
      received: "Totale incassato",
      sent: "Totale inviato",
      fees: "Commissioni d'invio",
      lines: "Dettaglio delle transazioni",
      none: "Nessuna transazione conclusa in questo periodo.",
      amount: "Importo ({{unit}})",
      amountMixed: "Importo",
      valuesNote:
        "Una vendita conta per l'importo inserito, nella sua valuta; ogni altra transazione, per il valore dei suoi bitcoin al prezzo registrato al momento del pagamento (fonte: CoinGecko). Una transazione senza prezzo registrato conta in BTC.",
      // Rows copied from a v2 account among them (src/features/activity/legacy-history.ts).
      valuesNoteImported:
        "Una vendita conta per l'importo inserito, nella sua valuta; ogni altra transazione, per il valore dei suoi bitcoin al cambio registrato al momento del pagamento (fonte: CoinGecko; per la cronologia ripresa dal tuo precedente servizio di pagamento, il cambio da esso registrato). Una transazione senza cambio registrato conta in BTC."
    }
  },
  settings: {
    recovery: {
      group: "Sicurezza",
      title: "Frase di recupero",
      description:
        "Le 12 parole che ripristinano il tuo portafoglio senza passkey, da annotare su carta.",
      open: "Mostra",
      lead: "Queste 12 parole sono una copia del tuo portafoglio: con esse chiunque può spenderne tutti i fondi, senza la tua passkey.",
      rulesTitle: "Prima di mostrarle",
      rules:
        "Annotale su carta, nell'ordine, e conservale in un luogo sicuro. Non fotografarle e non salvarle in alcun file né messaggio. Non darle a nessuno: sattle.me non te le chiederà mai.",
      reveal: "Mostra la frase",
      hide: "Nascondi",
      shownNote:
        "Solo tu devi vedere queste parole. Scompaiono non appena lasci questa schermata o l'app.",
      captureOpen: "Qui gli screenshot non sono bloccati: non farne e non registrare lo schermo.",
      noPhrase: "Questo portafoglio non ha una frase di recupero da mostrare.",
      wordLabel: "Parola {{index}}: {{word}}"
    },
    title: "Impostazioni",
    business: "Attività",
    businessDescription: "Nome e logo visti dal cliente, sulle ricevute e sulle fatture.",
    businessName: "Nome dell'attività",
    logo: "Logo dell'attività",
    changeLogo: "Cambia il logo dell'attività",
    logoChange: "Cambia il logo",
    merchant: {
      section: "Profilo commerciante",
      description:
        "Incassa pagamenti in bitcoin con questa app: cassa, fatture, dipendenti. Il tuo portafoglio principale viene creato in questo passaggio.",
      create: "Crea il mio profilo commerciante",
      failedTitle: "Punto vendita non preparato",
      doneTitle: "Profilo commerciante creato",
      doneBody: "Puoi incassare pagamenti"
    },
    groups: {
      charging: "Incassi",
      payouts: "Bonifici",
      display: "Visualizzazione",
      network: "Rete",
      // "Account" of "Settings" (the session, the deletion).
      account: "Account"
    },
    // The phone's cards and the computer's tabs of "Settings".
    rubrics: {
      chargingBoth: "Lightning e onchain",
      methods: "Metodi di pagamento",
      chargingDescription:
        "Ciò che la cassa, i tuoi dipendenti e le tue integrazioni propongono al cliente.",
      lightning: "Lightning",
      lightningCaption: "Sempre proposto, fino a {{limit}} per fattura; {{beyond}}",
      lightningCaptionUnknown:
        "Sempre proposto, fino al limite del tuo indirizzo Lightning; {{beyond}}",
      lightningLimitFiat: "{{btc}} (circa {{fiat}})",
      lightningBeyond: {
        onchain: "oltre, viene mostrato solo l'indirizzo onchain",
        refused: "oltre, la cassa rifiuta la vendita finché i pagamenti onchain sono disattivati"
      },
      splitLabel: "Ripartizione: {{bitcoin}} in bitcoin, {{fiat}} in {{currency}}",
      editRelays: "Modifica i relay"
    },
    unlock: {
      title: "Chiedi la biometria per sbloccare l'app",
      captionOn: "A ogni apertura dell'app",
      captionOff: "L'app si apre senza biometria",
      captionUnavailable: "Nessuna biometria né codice su questo dispositivo",
      section: "Blocco dell'app",
      description:
        "La biometria di questo dispositivo, o il suo codice, è chiesta a ogni apertura dell'app e a ogni ritorno nell'app, oltre alla modalità cassa.",
      saveFailed: "Questa scelta non è stata salvata su questo dispositivo. Riprova."
    },
    locked: {
      title: "Modalità cassa",
      titleCard: "App bloccata",
      body: "Sblocca l'app per modificare le tue impostazioni.",
      unlock: "Sblocca"
    },
    displayCurrency: "Valuta di riferimento",
    displayCurrencyCardDescription: "Importi delle tue carte mostrati nell'app.",
    displayCurrencyDescription: "Importi inseriti alla cassa e mostrati nell'app.",
    amountUnit: {
      title: "Valuta mostrata per prima",
      description:
        "In «Portafoglio» e nella cronologia delle tue carte, su questo dispositivo. L'altro importo è mostrato sotto.",
      sats: "sats",
      savedTitle: "Valuta mostrata per prima salvata",
      saveFailed: "Questa scelta non è stata salvata su questo dispositivo. Riprova."
    },
    theme: {
      title: "Tema",
      description:
        "Su questo dispositivo. «Automatico» segue l'impostazione chiara o scura del dispositivo.",
      light: "Chiaro",
      dark: "Scuro",
      system: "Automatico",
      // A rubric's card on a phone ("Display"): the theme chosen.
      summaryLight: "Tema chiaro",
      summaryDark: "Tema scuro",
      summarySystem: "Tema automatico",
      savedTitle: "Tema salvato",
      saveFailed: "Questa scelta non è stata salvata su questo dispositivo. Riprova."
    },
    onchain: "Pagamenti onchain",
    onchainDescription:
      "Conferma in 10-60 minuti. Vale per la cassa, la tua e quella dei tuoi dipendenti. Le tue fatture e integrazioni propongono sempre il pagamento onchain.",
    split: "Ripartizione",
    splitDescription:
      "Commissione di sattle.me: {{bitcoin}} su tutto ciò che incassi. Quota convertita: {{fiat}} di commissioni di vendita di Mt Pelerin in più, venduta quando l'accetti in «Portafoglio».",
    splitDescriptionFree:
      "Commissione di sattle.me: {{free}} invece di {{bitcoin}} fino al {{date}}, su tutto ciò che incassi. Quota convertita: {{fiat}} di commissioni di vendita di Mt Pelerin in più, venduta quando l'accetti in «Portafoglio».",
    splitShort: "{{percent}} in {{currency}}",
    allBitcoin: "Tutto in bitcoin",
    bankAccount: "Conto bancario",
    noBankAccount: "Nessuno",
    bankAtMtPelerin: "Presso Mt Pelerin",
    relays: "Relay Nostr",
    relaysCount_one: "{{count}} relay",
    relaysCount_other: "{{count}} relay",
    relaysDescription:
      "Server Nostr a cui l'app si connette, su tutti i dispositivi dell'attività.",
    // "Bitcoin node" of "Network".
    node: {
      title: "Nodo Bitcoin",
      description:
        "Dove i tuoi dispositivi e quelli dei tuoi dipendenti seguono i pagamenti onchain, e dove il tuo wallet legge la blockchain.",
      mempoolTitle: "mempool.space",
      mempoolDescription:
        "Pubblico, niente da installare. Vede gli indirizzi delle tue vendite onchain.",
      ownTitle: "Il mio nodo",
      ownDescription: "Il tuo mempool: nessun altro vede i tuoi indirizzi.",
      mempoolCaption: "Predefinito",
      urlLabel: "Indirizzo del tuo mempool",
      urlHint: "L'indirizzo della sua pagina nel browser, per esempio sul tuo Umbrel o Start9",
      errors: {
        empty: "Inserisci l'indirizzo del tuo mempool",
        incomplete: "Indirizzo incompleto, per esempio https://mempool.example.ch",
        insecure:
          "È accettato solo un indirizzo https://: con http:// la connessione non è cifrata",
        device: "Questo indirizzo è questo dispositivo: inserisci quello del tuo nodo"
      },
      legacyHttpTitle: "Indirizzo http:// non più usato",
      legacyHttpBody:
        "Per la tua sicurezza, l'app si connette ormai al tuo nodo solo in https://: con http://, chi è connesso a questo Wi-Fi potrebbe spacciarsi per il nodo e far sembrare pagata una vendita che non lo è. Finché non inserisci un indirizzo https://, i tuoi dispositivi fanno come se il nodo non rispondesse.",
      test: "Prova la connessione",
      results: {
        ok: {
          title: "Nodo raggiungibile e aggiornato",
          body: "Ultimo blocco: {{height}}"
        },
        unreachable: {
          title: "Nodo non raggiungibile",
          body: "Verifica l'indirizzo e che questo dispositivo sia sulla stessa rete del tuo nodo."
        },
        notMempool: {
          title: "Nessun mempool a questo indirizzo",
          body: "Qualcosa risponde, ma non l'API di mempool. Verifica l'indirizzo e la porta."
        },
        noAddressIndex: {
          title: "Indirizzi illeggibili",
          body: "Il tuo mempool non legge ancora gli indirizzi: il suo indice (electrs o Fulcrum) manca o non è ancora costruito."
        },
        behind: {
          title: "Nodo in ritardo",
          body: "Il suo ultimo blocco risale a {{hours}} h fa: non è ancora sincronizzato."
        }
      },
      fallbackTitle: "Quando non risponde",
      fallbackMempool: "Passa da mempool.space",
      fallbackMempoolDescription:
        "Le tue vendite onchain continuano; mempool.space vede allora i tuoi indirizzi.",
      fallbackNone: "Solo Lightning",
      fallbackNoneDescription:
        "Niente va a mempool.space; nel frattempo il Punto Vendita non propone più Bitcoin.",
      payersTitle: "Pagine di pagamento dei tuoi clienti",
      payersLabel: "Trasmetti il mio nodo alle pagine dei paganti",
      payersCaption:
        "Anche il browser dei tuoi clienti segue il loro pagamento sul tuo nodo, con la stessa alternativa. Il suo indirizzo compare allora nei tuoi link di pagamento, e riceve l'indirizzo IP dei tuoi clienti.",
      payersHttpsOnly:
        "Solo per un nodo raggiungibile da Internet, in https:// con un nome di dominio: il browser dei tuoi clienti non raggiunge la tua rete locale.",
      publicNotePayers:
        "L'ora di invio di un pagamento, che ne fissa il cambio, resta su mempool.space: la stessa per te e per i tuoi clienti.",
      publicNote:
        "La pagina di pagamento dei tuoi clienti e l'ora di invio di un pagamento, che ne fissa il cambio, restano su mempool.space: la stessa per te e per i tuoi clienti.",
      savedTitle: "Nodo Bitcoin salvato",
      savedOwn: "I tuoi dispositivi leggono la blockchain sul tuo nodo",
      savedMempool: "I tuoi dispositivi leggono la blockchain su mempool.space",
      confirmTitle: "Salvare questo nodo?",
      confirmBody:
        "Non risponde correttamente da questo dispositivo. Dalla rete della tua attività forse sì.",
      confirmAction: "Salva comunque"
    },
    // "Look up scanned products" of "Network".
    productLookup: {
      section: "Catalogo",
      title: "Cerca i prodotti scansionati",
      caption:
        "Su Open Food Facts, che riceve il codice a barre e l'indirizzo IP del dispositivo. Disattivato: inserisci tu nome e foto.",
      savedTitle: "Ricerca dei prodotti salvata",
      savedOn: "Nome e foto di un prodotto scansionato vengono da Open Food Facts",
      savedOff: "Nome e foto di un prodotto scansionato vanno inseriti a mano"
    },
    save: "Salva",
    close: "Chiudi",
    logout: "Esci",
    logoutTitle: "Uscire da questo dispositivo?",
    logoutBody:
      "I tuoi dati e i tuoi fondi restano sul tuo account: la tua passkey ti riconnette. Solo le scelte fatte su questo dispositivo tornano a quelle predefinite: la barra di navigazione, «$t(wallet.discreet)» nel $t(navigation.destinations.wallet), «$t(settings.amountUnit.title)», «$t(settings.theme.title)», «$t(pos.mode.amount)» o «$t(pos.mode.articles)» nel $t(pos.title) e la biometria per sbloccare l'app.",
    logoutBodyWeb:
      "I tuoi dati e i tuoi fondi restano sul tuo account: la tua passkey ti riconnette. Solo le scelte fatte su questo dispositivo tornano a quelle predefinite: la barra di navigazione, «$t(wallet.discreet)» nel $t(navigation.destinations.wallet), «$t(settings.amountUnit.title)», «$t(settings.theme.title)» e «$t(pos.mode.amount)» o «$t(pos.mode.articles)» nel $t(pos.title).",
    logoutBodyCard:
      "I tuoi dati e i tuoi fondi restano sul tuo account: la tua passkey ti riconnette. Solo le scelte «$t(settings.amountUnit.title)» e «$t(settings.theme.title)» fatte su questo dispositivo tornano a quelle predefinite.",
    logoutConfirm: "Esci",
    support: {
      group: "Aiuto",
      section: "Assistenza",
      description:
        "Una domanda, un problema: scriveteci. Il registro dell'app ci aiuta a capire cosa è successo.",
      contact: "Contatta l'assistenza",
      attach: "Allega il registro dell'app",
      attachCaption: "Eventi tecnici, senza importi né indirizzi",
      reports: "Invia i rapporti di arresto anomalo",
      reportsKinds: "Arresti e rallentamenti",
      reportsCaption: "Nessun importo né indirizzo di pagamento",
      reportsSaveFailed: "Questa scelta non è stata salvata su questo dispositivo. Riprova.",
      subject: "Assistenza sattle.me",
      body: "Buongiorno,\n\nLa vostra domanda o il vostro problema:\n\n\n",
      downloaded:
        "Il registro dell'app è appena stato scaricato ({{file}}): allegatelo a questo messaggio.",
      attachDownloaded: "Allegate il registro scaricato ({{file}})",
      notAttached: "Registro non allegato alla mail",
      deposited:
        "Il registro dell'app viene inviato cifrato al supporto, con il riferimento qui sotto.",
      notDeposited: "Registro non inviato",
      noMailTitle: "Nessuna app Mail su questo dispositivo",
      addressCopied: "Indirizzo dell'assistenza copiato: {{email}}",
      writeTo: "Scriveteci a {{email}}",
      shareTitle: "Registro dell'app",
      shareFailed: "Registro non condiviso",
      failedTitle: "Mail non aperta"
    },
    delete: {
      section: "Elimina account",
      description:
        "Cancella l'account dai relay Nostr e da questo dispositivo e rinuncia al suo indirizzo lightning. Il portafoglio deve essere vuoto.",
      button: "Elimina account",
      employeesTitle_one: "Hai {{count}} dipendente",
      employeesTitle_other: "Hai {{count}} dipendenti",
      employeesBody_one:
        "Sarà rimosso dall'attività: il suo dispositivo non incasserà più per essa e la dimenticherà alla prossima connessione.",
      employeesBody_other:
        "Saranno rimossi dall'attività: i loro dispositivi non incasseranno più per essa e la dimenticheranno alla prossima connessione.",
      integrationsTitle_one: "Hai {{count}} integrazione",
      integrationsTitle_other: "Hai {{count}} integrazioni",
      integrationsBody_one:
        "Sarà rimossa: il suo server non potrà più creare fatture per l'attività.",
      integrationsBody_other:
        "Saranno rimosse: i loro server non potranno più creare fatture per l'attività.",
      assistantsTitle_one: "Hai {{count}} assistente IA",
      assistantsTitle_other: "Hai {{count}} assistenti IA",
      assistantsBody_one: "Sarà rimosso: non potrà più fare fatture per l'attività.",
      assistantsBody_other: "Saranno rimossi: non potranno più fare fatture per l'attività.",
      removeAndContinue: "Rimuovi e continua",
      confirmTitle: "Eliminare l'account?",
      confirmBody:
        "Le impostazioni, il team, gli articoli e le vendite registrate vengono cancellati dai relay Nostr e da questo dispositivo, e si rinuncia all'indirizzo lightning. È definitivo. Il portafoglio, vuoto, resta accessibile con la tua passkey.",
      confirm: "Elimina definitivamente",
      progressTitle: "Eliminazione dell'account",
      progressHint: "Tieni l'app aperta fino alla fine.",
      steps: {
        wallet: "Verifica del portafoglio",
        team: "Rimozione del team",
        reading: "Ricerca dei dati sui relay ({{done}}/{{total}})",
        deleting: "Cancellazione sui relay ({{done}}/{{total}})",
        checking: "Verifica della cancellazione ({{done}}/{{total}})",
        device: "Cancellazione di questo dispositivo"
      },
      deleted: "Il tuo account è stato eliminato",
      deletedElsewhere:
        "L'account di {{business}} è stato eliminato da un altro dispositivo: questo dispositivo l'ha dimenticato.",
      alreadyRemoved: "L'indirizzo lightning e il team sono già rimossi.",
      card: {
        description:
          "Cancella l'account dai relay Nostr e da questo dispositivo, e abbandona gli indirizzi Lightning delle tue carte. Le carte devono essere vuote.",
        confirmBody:
          "Le impostazioni, le carte e i loro pagamenti registrati vengono cancellati dai relay Nostr e da questo dispositivo, e gli indirizzi Lightning delle carte vengono abbandonati. È definitivo.",
        stepCards: "Verifica delle carte",
        alreadyRemoved: "Gli indirizzi Lightning delle carte sono già abbandonati.",
        cardWallets:
          "Il portafoglio di una delle tue carte, o di una carta eliminata, non è vuoto, o vi stanno ancora arrivando sats. Invia il suo saldo altrove da « Carte », poi riprova.",
        walletFailed:
          "Non è stato possibile verificare il portafoglio di una carta. Verifica la connessione a internet, poi riprova.",
        begun:
          "L'eliminazione non è terminata: gli indirizzi Lightning delle carte sono già abbandonati, niente è cancellato su questo dispositivo. Verifica la connessione a internet, poi riprova."
      },
      failedTitle: "Account non eliminato",
      errors: {
        balance: "Il portafoglio contiene ancora {{sats}} sats. Inviali altrove, poi riprova.",
        pendingPayments: "Un pagamento del portafoglio è in corso. Riprova quando sarà concluso.",
        unclaimedDeposits:
          "Un deposito onchain non è ancora accreditato sul portafoglio. Riprova quando lo sarà.",
        cardWallets:
          "Il portafoglio di una delle tue carte, o di una carta eliminata, non è vuoto, o vi stanno ancora arrivando dei sats. Preleva il suo saldo verso il tuo saldo principale in « Carte », poi riprova.",
        newerApp:
          "Una versione più recente dell'app ha registrato una carta di questo account. Aggiorna l'app, poi riprova.",
        salesInProgress:
          "Alcune fatture dell'attività non sono ancora definitive. Riprova quando la loro versione finale sarà pubblicata (fino a 3 h dopo la fine di una fattura non pagata).",
        walletFailed:
          "Non è stato possibile verificare il portafoglio. Controlla la connessione a internet, poi riprova.",
        unreachable:
          "I relay Nostr non hanno risposto. Controlla la connessione a internet, poi riprova.",
        notDeleted:
          "I relay Nostr non hanno confermato la cancellazione. Nulla è cancellato su questo dispositivo: riprova.",
        begun:
          "L'eliminazione non è conclusa: l'indirizzo lightning e il team sono già rimossi, nulla è cancellato su questo dispositivo. Controlla la connessione a internet, poi riprova.",
        unfinished:
          "L'eliminazione è iniziata ma non è conclusa: gli altri dispositivi dell'account potrebbero averlo già dimenticato. Controlla la connessione a internet, poi riprova per concluderla.",
        deviceNotWiped:
          "L'account è cancellato dai relay, ma non tutto ciò che l'app conservava su questo dispositivo."
      }
    },
    yourProfile: "Il tuo profilo",
    nameLocked: "Nome definito dal tuo datore di lavoro",
    addPhoto: "Aggiungi una foto",
    changePhoto: "Cambia la foto",
    removePhoto: "Rimuovi",
    relaysLocked: "Definiti dal tuo datore di lavoro",
    leave: "Lascia l'attività",
    leaveTitle: "Lasciare {{business}}?",
    leaveBody:
      "Questo dispositivo non incasserà più per questa attività. Per tornare servirà un nuovo invito.",
    back: "Indietro",
    splitSavedTitle: "Ripartizione salvata",
    splitSavedBank: "IBAN verificato · {{percent}} in {{currency}}",
    splitSavedBitcoin: "Tutto in bitcoin",
    relaysSavedTitle: "Relay salvati",
    relaysSavedBody: "I dispositivi dell'attività li seguono dalla loro prossima connessione.",
    nameSavedTitle: "Nome salvato",
    currencySavedTitle: "Valuta di riferimento salvata",
    onchainSavedTitle: "Pagamenti onchain salvati",
    onchainSavedOn: "Accettati alla cassa, oltre a Lightning",
    onchainSavedOff: "Solo Lightning alla cassa",
    vatRate: "IVA predefinita",
    vatRateDescription: "L'aliquota IVA delle nuove righe di fattura, modificabile riga per riga.",
    vatRateField: "Aliquota IVA (%)",
    vatRateHint: "Lascia vuoto per l'aliquota normale: {{rate}}",
    vatStandard: "{{rate}} (aliquota normale)",
    vatSavedTitle: "IVA predefinita salvata",
    vatInvalid: "Inserisci un'aliquota tra 0 e 100 %",
    tolerance: "Tolleranza di pagamento insufficiente",
    toleranceDescription:
      "Un pagamento onchain a cui manca al massimo questa percentuale dell'importo conta come pagato. Se manca di più, il cliente deve saldare tutto il resto. Applicata alle tue vendite, fatture e link di pagamento, compresi quelli dei tuoi dipendenti, integrazioni e assistenti IA. Mai mostrata ai tuoi clienti.",
    toleranceField: "Tolleranza (%)",
    toleranceHint: "Da 0 a 10 %, al decimo. Vuoto o 0: nessuna.",
    toleranceNone: "Nessuna",
    toleranceSavedTitle: "Tolleranza salvata",
    toleranceSaved: "{{rate}} per le prossime vendite e fatture",
    toleranceSavedNone: "Nessuna: viene richiesto l'importo intero",
    toleranceInvalid: "Inserisci una percentuale tra 0 e 10, al decimo",
    logoSavedTitle: "Logo salvato",
    address: {
      title: "Indirizzo dell'attività",
      description: "Compare sotto il nome dell'attività sulle tue fatture.",
      street: "Via e numero",
      postalCode: "NPA",
      city: "Località",
      country: "Paese",
      savedTitle: "Indirizzo salvato"
    },
    numbers: {
      title: "Numeri dell'attività",
      description:
        "Compaiono sulle tue fatture, sotto l'indirizzo dell'attività. Il loro nome segue il paese dell'attività.",
      savedTitle: "Numero salvato"
    },
    photoSavedTitle: "Foto salvata",
    photoRemovedTitle: "Foto rimossa",
    saveFailedTitle: "Errore durante il salvataggio",
    failedTitle: "Impostazione non salvata",
    errors: {
      unpublished:
        "Troppo pochi relay hanno confermato la modifica, che è stata annullata. Verifica la connessione, poi riprova.",
      newerBackup:
        "Una versione più recente dell'app ha salvato questo account, la modifica è stata annullata. Aggiorna l'app, poi riprova.",
      noAccount: "Sblocca l'app con la tua passkey, poi riprova.",
      invalid: "Verifica il valore inserito, poi riprova.",
      unreachable: "Troppo pochi relay hanno risposto. Verifica la connessione, poi riprova.",
      saveFailed: "L'impostazione non è stata salvata su questo dispositivo. Riprova.",
      denied: "Consenti l'accesso alle foto nelle impostazioni del dispositivo, poi riprova.",
      unreadable: "Questa immagine non può essere usata. Scegline un'altra.",
      logoutFailed: "L'uscita non è stata completata. Riprova.",
      leaveFailed: "Questo dispositivo non ha potuto lasciare l'attività. Riprova.",
      leaveUnreachable:
        "Non è stato possibile avvisare l'attività della tua uscita. Verifica la connessione a internet, poi riprova.",
      salesInProgress:
        "Alcune fatture dell'attività non sono ancora definitive. Riprova quando la loro versione finale sarà pubblicata (fino a 3 ore dopo la fine di una fattura non pagata).",
      integrationsPending:
        "Un'integrazione ha un pagamento in corso (una richiesta di pagamento aperta o un pagamento Bitcoin in conferma). Riprova quando sarà concluso."
    },
    splitLead: "L'app ti proporrà di vendere questa quota dei tuoi incassi.",
    ibanRefused: "Verifica le cifre dell'IBAN"
  },
  relays: {
    title: "Relay Nostr",
    lead: "Server Nostr a cui l'app si connette, su tutti i dispositivi dell'attività.",
    integrationsNotice:
      "Le integrazioni di questo account seguono al massimo {{moves}} cambi di relay dalla loro creazione. Oltre, il loro server non le trova più: creale di nuovo e dai le nuove chiavi ai loro integratori.",
    add: "Aggiungi un relay",
    addLead: "Inserisci l'indirizzo del relay.",
    address: "Indirizzo del relay",
    placeholder: "relay.esempio.ch",
    addConfirm: "Aggiungi il relay",
    addShort: "Aggiungi",
    removeLabel: "Rimuovi {{relay}}",
    keepOne: "Mantieni almeno un relay.",
    tooMany: "Al massimo dieci relay: rimuovine uno per aggiungerne un altro.",
    removeUnreachable: "Rimuovi il relay in rosso per salvare.",
    restrictedRelay:
      "« Lettura rifiutata »: questo relay lascia leggere i dati solo a chi li ha scritti. Le tue casse, i tuoi dipendenti e i tuoi clienti non potrebbero leggerli: scegline un altro.",
    localNetworkBlocked:
      "Il browser blocca l'accesso di questo sito alla rete locale: consenti « Rete locale » nelle impostazioni del sito (icona a sinistra dell'indirizzo), poi riprova.",
    localNetworkNotAllowed:
      "L'accesso alla rete locale non è ancora consentito per questo sito: riprova, poi consentilo quando il browser lo chiede. Se non chiede nulla, questo dispositivo non raggiunge il relay: verifica che sia sulla stessa rete o su Tailscale.",
    test: "Prova la connessione",
    status: {
      reachable: "Connesso",
      untested: "Non provato",
      testing: "Prova in corso",
      unreachable: "Irraggiungibile",
      restricted: "Lettura rifiutata"
    },
    statusLabel: "{{relay}}, {{status}}",
    statusDetail: "{{status}} · {{detail}}",
    noAnswer: "nessuna risposta in {{duration}}",
    milliseconds: "{{value}}\u00a0ms",
    seconds: "{{value}}\u00a0s",
    errors: {
      incomplete: "Inserisci un indirizzo completo",
      duplicate: "Inserisci un relay non presente nell'elenco",
      local: "Inserisci l'indirizzo di un relay pubblico: localhost è questo dispositivo"
    },
    advanced: "Impostazioni avanzate",
    advancedLead:
      "Relay Nostr in cui questo dispositivo cerca il tuo account e crea quelli nuovi. Una volta connesso, valgono quelli del tuo account.",
    // "Sign-up" of "Advanced settings".
    countryDetection: {
      section: "Registrazione",
      title: "Rileva il mio paese con country.is",
      caption:
        "Solo se il fuso orario non basta. country.is riceve allora l'indirizzo IP di questo dispositivo. Disattivato: il paese viene dalle impostazioni del dispositivo.",
      saveFailed: "Questa scelta non è stata salvata su questo dispositivo. Riprova."
    }
  },
  pending: {
    title: "Presto disponibile",
    description: "Questa schermata non è ancora stata progettata."
  },
  merchantSettings: {
    businessNameWord: "Commerciante",
    saveFailed: "Non è stato possibile salvare le tue impostazioni su questo dispositivo. Riprova."
  },
  /** "New invoice". */
  invoices: {
    newInvoice: "Nuova fattura",
    // "Wallet"'s button on a phone, beside "Sell" in half the width: one word, its "+" icon tells
    // "new".
    newInvoiceShort: "Fattura",
    // "Wallet"'s warning about an assistant (assistant-alerts.ts): "Remove the assistant" or "This
    // is expected" only.
    assistantAlert: {
      jumpTitle: "{{name}} ha saltato dei numeri di fattura",
      jumpBody:
        "Le sue fatture si fermano al n. {{from}}, ma il suo contatore indica il n. {{to}}: i numeri intermedi sono stati presi senza fattura. Se non c'è una spiegazione, rimuovi questo assistente.",
      jumpBodyNone:
        "Non ha fatto nessuna fattura nel {{year}}, ma il suo contatore indica il n. {{to}}: questi numeri sono stati presi senza fattura. Se non c'è una spiegazione, rimuovi questo assistente.",
      blockedTitle: "{{name}} blocca la numerazione",
      blockedBody:
        "Il suo contatore dei numeri ha un formato che questa versione dell'app non sa leggere: nessuna fattura può ricevere un numero. Aggiorna l'app; se è già aggiornata, rimuovi questo assistente.",
      burstTitle: "{{name}} ha fatto moltissime fatture",
      burstBody:
        "{{invoices}} fatture in 24 ore. Se non le hai chieste tu, rimuovi questo assistente: le sue fatture restano nel tuo portafoglio.",
      remove: "Rimuovi l'assistente",
      normal: "È normale",
      removeFailedTitle: "Assistente non rimosso",
      removeFailed:
        "Non è stato possibile rimuovere {{name}}. Controlla la connessione a internet, poi riprova dall'elenco delle integrazioni"
    },
    title: "Nuova fattura",
    back: "Indietro",
    saveDraft: "Salva come bozza",
    draftSaved: "Fattura salvata come bozza",
    draftSavedBody: "La trovi in «Da seguire»",
    linkNote: "Fattura {{number}}",
    recipient: {
      title: "A chi è destinata la fattura?",
      assistant: "Fare le vostre fatture con un'IA",
      name: "Ragione sociale",
      street: "Via e numero",
      postalCode: "NPA",
      city: "Località",
      country: "Paese"
    },
    preview: {
      title: "Anteprima del PDF",
      invoice: "Fattura",
      date: "Data",
      due: "Scadenza"
    },
    lines: {
      title: "Cosa fatturi?",
      empty: "Nessun articolo in questa fattura",
      emptyLead: "Aggiungi ciò che vendi: un articolo del tuo catalogo o una riga inserita a mano.",
      add: "Aggiungi un articolo",
      name: "Descrizione",
      quantity: "Quantità",
      quantityShort: "Qtà",
      unitPrice: "Prezzo unitario",
      unitPriceShort: "Prezzo unit.",
      vatRate: "Aliquota IVA",
      vat: "IVA",
      amount: "Importo",
      remove: "Rimuovi",
      removeLine: "Rimuovi la riga",
      expand: "Modifica la riga",
      summary: "{{quantity}} · IVA {{rate}}",
      net: "Subtotale IVA esclusa",
      vatOn: "IVA {{rate}} su {{base}}",
      total: "Totale",
      quantityInvalid: "Inserisci una quantità",
      priceInvalid: "Inserisci un prezzo",
      vatInvalid: "Inserisci un'aliquota tra 0 e 100 %",
      tooLarge: "Il totale supera l'importo massimo di una fattura",
      incomplete: "Da completare",
      save: "Salva nei miei articoli",
      saved: "Salvato nei miei articoli"
    },
    picker: {
      title: "Aggiungi un articolo",
      close: "Chiudi",
      manual: "Inserisci un articolo",
      manualDescription: "Descrizione, quantità e prezzo liberi",
      catalog: "I miei articoli",
      loading: "Lettura dei tuoi articoli…",
      failed:
        "Non è stato possibile leggere i tuoi articoli. Controlla la connessione a internet, poi riprova.",
      retry: "Riprova",
      empty: "Ancora nessun articolo. Aggiungine in «Articoli».",
      convertFailed: "Non è stato possibile convertire il prezzo. Riprova tra qualche istante"
    },
    sameName: {
      title: "Un articolo ha già questo nome",
      close: "Chiudi",
      lead: "Aggiornalo con il prezzo di questa riga, oppure crea un secondo articolo con lo stesso nome.",
      otherCurrency:
        "Questo articolo è venduto in {{currency}}: il suo prezzo non può ricevere un importo in {{invoice}}. Crea un secondo articolo con lo stesso nome.",
      newPrice: "Prezzo della riga: {{price}}",
      update: "Aggiorna l'articolo",
      duplicate: "Crea un duplicato"
    },
    due: {
      title: "Pagabile fino al <accent>{{date}}</accent>",
      lead: "Il link di pagamento resta aperto fino alla scadenza.",
      label: "Data di scadenza",
      previousMonth: "Mese precedente",
      nextMonth: "Mese successivo",
      close: "Chiudi"
    },
    terms: {
      title: "Per finire, le indicazioni amministrative",
      conditions: "Condizioni di pagamento",
      legal: "Note legali",
      addRedirect: "Aggiungi un URL di reindirizzamento",
      redirect: "URL di reindirizzamento",
      redirectInvalid: "Inserisci un indirizzo che inizia con https://",
      redirectHint:
        "Una volta pagata la fattura, il tuo cliente potrà tornare sul tuo sito (pagina di ringraziamento, monitoraggio dell'ordine…) con un semplice clic."
    },
    review: {
      title: "Verifica la fattura",
      client: "Cliente",
      articles: "Articoli",
      due: "Scadenza",
      notices: "Indicazioni amministrative",
      noNotices: "Nessuna indicazione",
      editRecipient: "Modifica il destinatario",
      editLines: "Modifica gli articoli",
      editDue: "Modifica la scadenza",
      editNotices: "Modifica le indicazioni amministrative",
      create: "Crea la fattura"
    },
    sent: {
      title: "Fattura {{number}} creata",
      lead: "Inviala al tuo cliente. Il link di pagamento resta aperto fino al {{date}}.",
      mail: "Invia per email",
      copy: "Copia il link",
      copied: "Link copiato",
      share: "Condividi",
      pdf: "Scarica il PDF",
      newInvoice: "Nuova fattura",
      view: "Vedi la fattura",
      close: "Chiudi"
    },
    mail: {
      subject: "Fattura {{number}} · {{business}}",
      body: "Buongiorno,\n\ndi seguito trova la fattura {{number}} di {{business}}, per un importo di {{amount}}, pagabile fino al {{date}}.\n\nPer pagarla in bitcoin: {{url}}\n\nCordiali saluti\n{{business}}"
    },
    pdf: {
      invoice: "Fattura",
      date: "Data",
      due: "Scadenza",
      reference: "Il vostro riferimento",
      billedTo: "Fatturato a",
      pay: "Paga in bitcoin",
      payHint: "Scansiona il codice QR o apri il link.",
      title: "Fattura {{number}}"
    },
    detail: {
      totalDue: "Totale dovuto",
      paid: "Importo pagato",
      due: "Scadenza",
      paidOn: "Pagata il",
      rest: "Resta da pagare",
      createdBy: "Creata da te",
      recipient: "Destinatario",
      conditions: "Condizioni e note",
      followUp: "Cronologia",
      created: "Creata",
      sent: "Inviata",
      paidEvent: "Pagata",
      more: "Altre azioni",
      remind: "Sollecita per email",
      copyLink: "Copia il link di pagamento",
      duplicate: "Duplica",
      pdf: "Scarica il PDF",
      cancel: "Annulla la fattura",
      title: "Fattura {{number}}",
      breadcrumb: "fattura {{number}}",
      notFound:
        "Questa fattura non è stata trovata. Forse è stata eliminata su un altro dispositivo.",
      reading: "Caricamento della fattura…",
      readFailed:
        "Non è stato possibile leggere la fattura. Controlla la connessione a internet, poi riprova.",
      cancelDialog: {
        title: "Annullare la fattura {{number}}?",
        body: "Il link di pagamento non proporrà più di pagare. Un pagamento già ricevuto resta nel tuo portafoglio.",
        confirm: "Annulla la fattura",
        keep: "Mantieni la fattura"
      },
      canceled: "Fattura annullata",
      cancelReceived: "Questa fattura ha già ricevuto un pagamento: non può più essere annullata",
      cancelFailed:
        "Non è stato possibile annullare la fattura. Controlla la connessione a internet, poi riprova"
    },
    draftDetail: {
      edit: "Modifica la bozza",
      remove: "Elimina la bozza",
      removed: "Bozza eliminata",
      removeDialog: {
        title: "Eliminare la bozza {{number}}?",
        body: "Scompare da tutti i tuoi dispositivi. Il suo numero non viene riassegnato.",
        confirm: "Elimina la bozza",
        keep: "Mantieni la bozza"
      }
    },
    errors: {
      noAccount: "Sblocca l'app, poi riprova",
      invalid: "Completa la fattura, poi riprova",
      number:
        "Non è stato possibile assegnare il numero della fattura. Controlla la connessione a internet, poi riprova",
      noWebApp: "I link di pagamento non sono ancora disponibili in questa versione dell'app",
      noAddress:
        "Oltre {{max}} sats (il limite Lightning meno un margine del {{margin}}), una fattura deve avere un indirizzo onchain, e nessun indirizzo Bitcoin è pronto. Riprova tra un istante",
      unverified:
        "Non è stato possibile verificare il limite Lightning della fattura. Controlla la connessione a internet, poi riprova",
      unreachable:
        "Non è stato possibile salvare la fattura. Controlla la connessione a internet, poi riprova",
      mailFailed:
        "Non è stato possibile aprire alcuna app di posta. Copia invece il link di pagamento",
      pdfFailed: "Non è stato possibile creare il PDF. Riprova",
      copyFailed: "Non è stato possibile copiare il link"
    }
  },
  documentLanguage: {
    title: {
      mail: "Lingua dell'email",
      pdf: "Lingua del PDF",
      export: "Lingua dell'esportazione"
    },
    change: {
      mail: "Lingua dell'email: {{language}}. Cambia",
      pdf: "Lingua del PDF: {{language}}. Cambia",
      export: "Lingua dell'esportazione: {{language}}. Cambia"
    },
    yours: "La tua lingua"
  },
  currencies: {
    AUD: "dollari australiani",
    CAD: "dollari canadesi",
    CHF: "franchi svizzeri",
    CZK: "corone ceche",
    DKK: "corone danesi",
    EUR: "euro",
    GBP: "sterline britanniche",
    HKD: "dollari di Hong Kong",
    HUF: "fiorini ungheresi",
    JPY: "yen giapponesi",
    MXN: "pesos messicani",
    NOK: "corone norvegesi",
    NZD: "dollari neozelandesi",
    PLN: "zloty polacchi",
    SEK: "corone svedesi",
    SGD: "dollari di Singapore",
    USD: "dollari statunitensi",
    ZAR: "rand sudafricani"
  },
  currencyNames: {
    AUD: "Dollari australiani",
    CAD: "Dollari canadesi",
    CHF: "Franchi svizzeri",
    CZK: "Corone ceche",
    DKK: "Corone danesi",
    EUR: "Euro",
    GBP: "Sterline britanniche",
    HKD: "Dollari di Hong Kong",
    HUF: "Fiorini ungheresi",
    JPY: "Yen giapponesi",
    MXN: "Pesos messicani",
    NOK: "Corone norvegesi",
    NZD: "Dollari neozelandesi",
    PLN: "Zloty polacchi",
    SEK: "Corone svedesi",
    SGD: "Dollari di Singapore",
    USD: "Dollari statunitensi",
    ZAR: "Rand sudafricani"
  },
  businessNumbers: {
    company: {
      CH: "Numero IDI",
      FR: "Numero SIRET",
      DE: "Codice fiscale (Steuernummer)",
      IT: "Codice fiscale",
      ES: "NIF",
      PT: "NIF",
      FI: "Codice d'impresa (Y-tunnus)",
      other: "Numero d'impresa"
    },
    vat: {
      CH: "Numero IVA",
      EU: "Partita IVA",
      other: "Numero IVA"
    }
  },
  whatsNew: {
    title: "Novità",
    open: "Novità, {{build}}",
    openUnread: "Novità, non lette, {{build}}",
    next: "Prossima versione",
    new: "Nuovo",
    source: "Codice sorgente",
    close: "Chiudi",
    empty: "Qui compariranno le novità di ogni versione."
  }
};

export default it;
