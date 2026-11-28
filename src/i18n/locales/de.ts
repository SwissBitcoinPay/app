import type { Translations } from "./fr";

const de: Translations = {
  common: {
    back: "Zurück",
    continue: "Weiter",
    cancel: "Abbrechen",
    startCharging: "Zahlungen annehmen",
    version: "Version {{version}}"
  },
  welcome: {
    headline: "Zahlungen in <accent>Bitcoin</accent>.",
    lead: "Kassensystem, Rechnungen und NFC-Karten.",
    guarantees: {
      nonCustodial: "Ohne Verwahrung",
      noKyc: "Ohne KYC-Identifizierung",
      oneMinute: "In 1 Minute"
    },
    createAccount: "Mein Konto erstellen",
    login: "Anmelden",
    joinInvitation: "Per Einladung beitreten",
    alreadyHave: "Ich habe bereits",
    have: {
      account: "Ein sattle.me-Konto",
      invitation: "Eine Einladung",
      boltCard: "Eine BoltCard"
    },
    manageBoltCard: "Meine BoltCard verwalten",
    boltCardApp: {
      computer:
        "Ein Computer kann keine NFC-Karten lesen. Laden Sie die App sattle.me auf Ihr Telefon herunter: Dort erstellen Sie Ihr Konto und halten dann die Karte an das Telefon, um sie zu programmieren.",
      device:
        "Dieses Gerät kann keine NFC-Karten lesen. Laden Sie die App sattle.me auf Ihr Telefon herunter: Dort erstellen Sie Ihr Konto und halten dann die Karte an das Telefon, um sie zu programmieren.",
      browser:
        "Ein Browser kann keine Karte programmieren. Öffnen oder installieren Sie die App sattle.me auf diesem Telefon: Dort erstellen Sie Ihr Konto und halten dann die Karte an das Telefon, um sie zu programmieren.",
      iphone: "iPhone",
      android: "Android",
      codeIphone: "QR-Code der App sattle.me im App Store",
      codeAndroid: "QR-Code der App sattle.me bei Google Play",
      scan: "Scannen Sie den Code für Ihr Telefon mit dessen Kamera."
    },
    terms: "Mit dem Fortfahren akzeptieren Sie die <link>Allgemeinen Geschäftsbedingungen</link>."
  },
  legal: {
    terms: "Allgemeine Geschäftsbedingungen",
    privacy: "Datenschutzerklärung"
  },
  account: {
    passkeyWarning:
      "Ihr Passkey ist der Schlüssel zu Ihrer Wallet: Wenn Sie ihn löschen, kann Ihr Guthaben unzugänglich werden.",
    progress: {
      creating: "Ihr Passkey wird erstellt…",
      signingIn: "Anmeldung mit Ihrem Passkey…",
      preparing: "Ihr Konto wird vorbereitet…",
      restoring: "Ihre Einstellungen werden abgerufen…",
      terminal: "Ihre Kasse wird vorbereitet…"
    },
    cancelled: {
      title: "Passkey abgebrochen",
      body: "Tippen Sie erneut auf die Schaltfläche, um es nochmals zu versuchen."
    },
    errors: {
      recoveryOverdue:
        "Ihre Zahlungen sind gesperrt: Prüfen Sie zuerst Ihre 12 Wiederherstellungswörter.",
      rescueClosed:
        "Der Notfallmodus wurde geschlossen: Es wurde nichts gesendet. Öffnen Sie ihn mit Ihren 12 Wörtern erneut.",
      unsupported:
        "Dieses Gerät oder dieser Browser kann keinen sattle.me-Passkey verwenden. Nutzen Sie einen aktuellen Browser oder die App auf iPhone, iPad oder Android.",
      prfUnsupported:
        "Ihr Passkey-Manager ist nicht kompatibel: Verwenden Sie die App Passwörter von Apple oder den Google Passwortmanager.",
      notAssociated:
        "Passkeys sind für diese Version der App noch nicht aktiviert. Versuchen Sie es später erneut.",
      notConfigured: "Diese Version der App ist nicht zum Öffnen einer Wallet konfiguriert.",
      cancelled:
        "Passkey abgebrochen. Tippen Sie erneut auf die Schaltfläche, um es nochmals zu versuchen.",
      timedOut:
        "Zeitüberschreitung. Versuchen Sie es erneut und bestätigen Sie mit Ihrem Gesicht, Ihrem Fingerabdruck oder dem Gerätecode.",
      noCredential:
        "Auf diesem Gerät wurde kein sattle.me-Passkey angeboten. Prüfen Sie, ob Ihre Passkeys mit diesem Gerät synchronisiert sind.",
      noCredentialAndroid:
        "Auf diesem Gerät wurde kein sattle.me-Passkey angeboten. Stellen Sie sicher, dass Ihr Passwort-Manager nicht durch den Energiesparmodus eingeschränkt ist.",
      alreadyExists:
        "Auf diesem Gerät gibt es bereits einen Passkey: Verwenden Sie „$t(welcome.login)“.",
      createdNotDerived:
        "Ihr Passkey wurde erstellt, aber Ihre Wallet konnte nicht geöffnet werden. Tippen Sie auf „$t(welcome.createAccount)“, um mit diesem Passkey fortzufahren.",
      connectFailed:
        "Ihre Wallet konnte nicht geöffnet werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      settingsTooNew:
        "Ihre Einstellungen wurden von einer neueren Version der App gespeichert. Aktualisieren Sie die App und versuchen Sie es erneut.",
      notFound: "Mit diesem Passkey wurde auf den Nostr-Relais dieses Geräts kein Konto gefunden.",
      terminalFailed:
        "Ihre Kasse konnte nicht vorbereitet werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      deviceFailed:
        "Ihr Konto konnte auf diesem Gerät nicht vorbereitet werden. Versuchen Sie es erneut.",
      failed: "Ein Fehler ist aufgetreten. Versuchen Sie es erneut."
    }
  },
  noAccount: {
    title: "Kein Konto gefunden",
    unreachableTitle: "Relais nicht erreichbar",
    answered: {
      all: "Auf den Nostr-Relais unten ist mit diesem Passkey kein Konto verknüpft.",
      some: "Auf den Nostr-Relais unten, die geantwortet haben, ist mit diesem Passkey kein Konto verknüpft. Andere haben nicht geantwortet: „$t(relays.test)“ zeigt, welche.",
      none: "Keines der Nostr-Relais unten hat geantwortet: Es lässt sich nicht sagen, ob mit diesem Passkey ein Konto verknüpft ist. Prüfen Sie Ihre Internetverbindung."
    },
    lead: "Haben Sie für Ihr Konto eigene Relais gewählt? Fügen Sie sie hinzu, speichern Sie und tippen Sie dann auf „$t(welcome.login)“. Wenn Sie mehrere Passkeys haben, prüfen Sie auch, ob Sie den richtigen gewählt haben."
  },
  // "Stay informed": the phone's notifications asked once, after the setup.
  notificationsOffer: {
    title: "Bleiben Sie informiert",
    lead: "Erlauben Sie Mitteilungen: sattle.me informiert Sie über Wichtiges, auch wenn die App geschlossen ist.",
    words: "Ihre 12 Wörter",
    wordsBody: "Eine jährliche Erinnerung, sie zu prüfen, für Ihre Sicherheit.",
    cards: "Ihre Karten",
    cardsBody: "Kartenzahlungen, die auf Ihre Zustimmung warten.",
    note: "Niemals Werbung. Sie können es sich in den Einstellungen des Telefons anders überlegen.",
    allow: "Mitteilungen erlauben",
    later: "Nicht jetzt"
  },
  recoveryCheck: {
    reminders: {
      channel: "Wiederherstellungsphrase",
      startTitle: "Zeit, Ihre 12 Wörter zu prüfen",
      startBody:
        "Ein Jahr ist vergangen: Geben Sie sie in sattle.me erneut ein, um sicherzugehen, dass Ihr Blatt noch stimmt.",
      weekTitle: "Ihre Zahlungen werden in 7 Tagen gesperrt",
      eveTitle: "Ihre Zahlungen werden morgen gesperrt",
      soonBody: "Prüfen Sie Ihre 12 Wörter in sattle.me, um weiter zahlen zu können.",
      dayTitle: "Ihre Zahlungen sind gesperrt",
      dayBody: "Prüfen Sie Ihre 12 Wörter in sattle.me, um wieder zahlen zu können."
    },
    banner: {
      due: "Ihr Zweitschlüssel ist nicht geprüft",
      daysLeft: "T−{{count}}",
      daysLeftLabel_one: "Noch {{count}} Tag",
      daysLeftLabel_other: "Noch {{count}} Tage",
      overdue: "Zahlungen gesperrt: Prüfen Sie Ihre 12 Wörter",
      action: "Meine 12 Wörter prüfen"
    },
    title: "Ihre 12 Wörter prüfen",
    intro: {
      title: "Drei Fälle, in denen nur Ihre 12 Wörter helfen",
      lost: "Telefon verloren oder gestohlen",
      passkey: "Passkey gelöscht",
      gone: "sattle.me existiert nicht mehr",
      lead: "In jedem dieser Fälle öffnen Ihre 12 Wörter Ihr Konto und Ihre Karten wieder. Ohne sie ist das Guthaben verloren.",
      key: "Der Passkey ist Ihr Schlüssel für jeden Tag. Die 12 Wörter sind der Zweitschlüssel, zu Hause aufbewahrt: Geben Sie sie von Ihrem Blatt ab ein.",
      due_one: "Noch {{count}} Tag dafür.",
      due_other: "Noch {{count}} Tage dafür.",
      overdue: "Ihre Zahlungen sind bis zu dieser Prüfung gesperrt.",
      optional:
        "Derzeit ist nichts fällig: Diese Prüfung ist eine gute Gewohnheit und sperrt nichts.",
      start: "Beginnen"
    },
    word: {
      progress: "Wort {{index}} von 12",
      label: "Wie lautet Wort {{index}}?",
      hint: "Die Wörter der Liste, die so beginnen: Nichts verrät, welches das richtige ist.",
      unknown: "Dieses Wort steht nicht auf der Liste: Prüfen Sie die Schreibweise",
      next: "Nächstes Wort",
      previous: "Vorheriges Wort",
      check: "Prüfen"
    },
    lost: "Ich habe sie nicht mehr",
    checking: "Wird geprüft…",
    done: {
      title: "Ihre 12 Wörter sind geprüft",
      lead: "Bewahren Sie Ihr Blatt sicher auf. Die nächste Prüfung folgt in einem Jahr, wenn Ihr Konto dann noch mehr als 1000 CHF hält.",
      finish: "Fertig"
    },
    wrong: {
      title: "Diese Wörter stimmen nicht",
      lead: "Mindestens ein Wort ist falsch oder zwei sind vertauscht. Nehmen Sie Ihr Blatt und beginnen Sie neu, oder zeigen Sie Ihre 12 Wörter an.",
      again: "Neu beginnen"
    },
    saveFailed:
      "Ihre Wörter stimmen, aber die Prüfung konnte nicht gespeichert werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es dann erneut.",
    retry: "Erneut versuchen"
  },
  rescue: {
    section: "Wiederherstellung",
    entry: "Mit meinen 12 Wörtern öffnen",
    entryLead:
      "Wenn Ihr Passkey nicht mehr funktioniert, öffnen Ihre 12 Wiederherstellungswörter Ihr Konto, damit Sie das Guthaben anderswohin senden können.",
    words: {
      title: "Mit Ihren 12 Wörtern öffnen",
      lead: "Geben Sie die Wiederherstellungsphrase Ihres Kontos in der richtigen Reihenfolge ein.",
      only: "Geben Sie diese Wörter nur in der App sattle.me ein. Niemand wird Sie danach fragen, weder per E-Mail noch per Nachricht noch per Telefon.",
      label: "Ihre 12 Wörter",
      count_one: "{{count}} Wort von 12",
      count_other: "{{count}} Wörter von 12",
      unknown: "Wort {{position}} steht nicht auf der Liste: Prüfen Sie die Schreibweise",
      checksum:
        "Diese 12 Wörter ergeben keine gültige Phrase: Prüfen Sie jedes Wort und die Reihenfolge",
      valid: "Phrase vollständig und gültig",
      submit: "Mein Konto öffnen",
      opening: "Ihr Konto wird geöffnet…",
      note: "Ihre Wörter werden weder gespeichert noch gesendet: Sie werden vergessen, sobald Sie diesen Bildschirm schließen.",
      failed:
        "Ihr Konto konnte nicht geöffnet werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es dann erneut."
    },
    badge: "Notfallmodus",
    funds: {
      title: "Ihr Guthaben",
      lead: "Konto mit Ihren 12 Wörtern geöffnet. Senden Sie Ihr Guthaben an eine andere Wallet und schließen Sie dann.",
      leadWalletOnly:
        "Kein Relais dieses Geräts kennt Ihr Konto: Nur Ihre Wallet öffnet sich. Um Ihre Karten zu finden, schließen Sie und wechseln Sie dann die Relais unter „$t(relays.advanced)“.",
      wallet: "Wallet",
      card: "Karte „{{name}}“",
      cardUnnamed: "Karte ohne Namen",
      former: "Frühere Wallet der Karte „{{name}}“",
      formerUnnamed: "Frühere Wallet einer Karte",
      reading: "Wird gelesen…",
      unread: "Noch nicht gelesen",
      empty: "Leer",
      arriving: "{{amount}} unterwegs",
      send: "Leeren",
      retry: "$t(wallet.retry)",
      cardsUnread:
        "Ihre Karten konnten nicht auf einer Mehrheit Ihrer Relais gelesen werden: Einige können fehlen. Versuchen Sie es später erneut.",
      cardsFailed:
        "Ihre Karten konnten nicht gelesen werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es dann erneut.",
      export: "Verlauf exportieren",
      close: "Schließen",
      closeNote:
        "Beim Schließen vergisst dieses Gerät Ihre 12 Wörter. Ihr Guthaben bleibt, wo es ist."
    },
    drain: {
      title: "Wallet leeren",
      intro:
        "Das gesamte Guthaben der Wallet geht an eine Lightning-, Bitcoin- oder Spark-Adresse: Geben Sie sie ein, fügen Sie sie ein oder scannen Sie sie. Die Gebühren werden von diesem Guthaben abgezogen.",
      introNoScan:
        "Das gesamte Guthaben der Wallet geht an eine Lightning-, Bitcoin- oder Spark-Adresse: Geben Sie sie ein oder fügen Sie sie ein. Die Gebühren werden von diesem Guthaben abgezogen.",
      total: "Guthaben der Wallet",
      feesAbove: "Die Gebühren übersteigen bei dieser Geschwindigkeit das Guthaben der Wallet",
      empty: "Diese Wallet enthält nichts zum Senden.",
      confirm: "Alles senden",
      done: "{{amount}} gesendet: Die Wallet ist leer.",
      pending: "{{amount}} unterwegs: Der Betrag kommt an, sobald die Zahlung abgeschlossen ist.",
      failed:
        "Die Zahlung wurde nicht abgeschlossen. Prüfen Sie das Guthaben der Wallet und versuchen Sie es dann erneut."
    },
    closed: "Der Notfallmodus wurde geschlossen: Öffnen Sie ihn mit Ihren 12 Wörtern erneut.",
    idle: {
      title: "Schließt in {{seconds}} s",
      body: "Ohne Aktivität schließt sich der Notfallmodus und vergisst Ihre 12 Wörter.",
      closed:
        "Der Notfallmodus wurde nach 5 Minuten ohne Aktivität geschlossen: Geben Sie Ihre 12 Wörter erneut ein, um ihn wieder zu öffnen."
    }
  },
  migration: {
    amount: "{{btc}} (etwa {{fiat}})",
    entry: "Mein Swiss-Bitcoin-Pay-Konto migrieren",
    // Before the brand's wordmark (MigrateAccountEntry); `entry` is what screen readers say.
    entryLead: "Migrieren von",
    home: {
      badge: "Swiss Bitcoin Pay wird zu sattle.me",
      title: "Hallo, {{business}}",
      titleUnnamed: "Hallo",
      titleManual: "Ihr Swiss-Bitcoin-Pay-Konto migrieren",
      leadFound: "Wir haben Ihr Konto gefunden. Alles wird zu sattle.me übernommen:",
      leadPassword:
        "Wir haben Ihr Konto gefunden. Um Ihre Auszahlungen zu übernehmen, ein letztes Mal Ihr Swiss-Bitcoin-Pay-Passwort:",
      leadManual:
        "Melden Sie sich ein letztes Mal bei Ihrem Swiss-Bitcoin-Pay-Konto an: Ihr Geschäft und Ihre Auszahlungen werden zu sattle.me übernommen, das kein Passwort hat.",
      payoutsReading: "Wird gelesen…",
      payoutsAfterPassword: "Nach Ihrem Passwort",
      read: "Aus Ihrem Swiss-Bitcoin-Pay-Konto gelesen",
      money: "Ihr Geld kommt mit: Es wird auf Ihr neues Konto übertragen.",
      retry: "Erneut versuchen",
      migrate: "Migrieren"
    },
    login: {
      email: "E-Mail",
      password: "Passwort",
      checking: "Anmeldung bei Ihrem alten Konto…",
      forgotten: "Passwort vergessen?",
      changed: "Ich habe bereits ein neues Passwort gewählt",
      note: "Ihr Passwort wird ein einziges Mal verwendet und nie gespeichert.",
      errors: {
        refused: "E-Mail oder Passwort falsch",
        unreachable:
          "Ihr altes Konto antwortet nicht. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
        stopped:
          "Um Ihr altes Konto nicht zu sperren, versuchen wir es mit diesem Passwort nicht mehr. Wählen Sie ein neues: Wir senden Ihnen einen Link per E-Mail.",
        secondFactor:
          "Ihr altes Konto verlangt einen Bestätigungscode, den sattle.me nicht verwenden kann. Schreiben Sie uns an {{email}}: Wir helfen Ihnen, Ihr Konto zu aktualisieren."
      }
    },
    forgot: {
      title: "Passwort vergessen",
      lead: "Geben Sie die E-Mail Ihres alten Swiss-Bitcoin-Pay-Kontos ein: Wir senden Ihnen einen Link, um ein neues Passwort zu wählen.",
      send: "Link senden",
      sending: "Wird gesendet…",
      invalidEmail: "Diese E-Mail-Adresse ist ungültig",
      failed:
        "Der Link konnte nicht angefordert werden. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
      sentTitle: "Prüfen Sie Ihre E-Mails",
      sent: "Falls ein Swiss-Bitcoin-Pay-Konto {{email}} verwendet, wurde soeben eine E-Mail dorthin gesendet. Öffnen Sie den Link, um ein neues Passwort zu wählen.",
      sentNote:
        "Der Link ist 15 Minuten gültig. Nichts erhalten? Schauen Sie im Spam-Ordner nach, oder gehen Sie zurück, um ihn erneut anzufordern.",
      choose: "Neues Passwort wählen"
    },
    password: {
      title: "Neues Passwort",
      lead: "Wählen Sie das neue Passwort Ihres alten Swiss-Bitcoin-Pay-Kontos.",
      label: "Neues Passwort",
      rules: {
        length: "Mindestens 8 Zeichen",
        letter: "Mindestens ein Buchstabe",
        digit: "Mindestens eine Ziffer"
      },
      met: "erfüllt",
      unmet: "noch nicht",
      save: "Speichern",
      saving: "Wird gespeichert…",
      rejected: "Dieses Passwort wird nicht akzeptiert: Prüfen Sie die Regeln unten",
      failed:
        "Das Passwort konnte nicht geändert werden. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
      expired:
        "Dieser Link ist nicht mehr gültig: Er wurde bereits verwendet, oder seine 15 Minuten sind abgelaufen. Fordern Sie einen neuen an.",
      again: "Neuen Link erhalten",
      doneTitle: "Passwort geändert",
      done: "Ihr neues Passwort ist gespeichert. Melden Sie sich damit an, um Ihr Konto zu aktualisieren."
    },
    confirm: {
      currency: "Währung",
      payouts: "Auszahlungen",
      payoutsToChoose: "Nach der Kontoeröffnung zu wählen",
      split: "{{bitcoin}} Bitcoin · {{bank}} Bank",
      allBitcoin: "{{percent}} Bitcoin",
      bank: "Bankkonto",
      holder: "Inhaber",
      freeze:
        "Sobald Ihr sattle.me-Konto erstellt ist, nimmt Ihr altes Konto keine Zahlungen mehr an. Die Sats, die es Ihnen schuldet, gehen sofort per Lightning auf Ihr sattle.me-Konto, spätestens um 0:00\u00a0UTC, falls die Überweisung nicht gleich gelingt.",
      notMine: "Das ist nicht mein Konto",
      migratedTitle: "Konto bereits aktualisiert",
      migrated:
        "„{{business}}“ ist am {{date}} zu sattle.me gewechselt. Öffnen Sie Ihr sattle.me-Konto mit seinem Passkey.",
      logIn: "Anmelden"
    },
    freeze: {
      settingTitle: "Altes Swiss-Bitcoin-Pay-Konto",
      settingDescription:
        "Ihr altes Konto konnte am Ende der Aktualisierung nicht eingefroren werden: Es nimmt weiterhin Zahlungen an, und sein Guthaben wird nicht auf sattle.me ausgezahlt. Frieren Sie es jetzt ein.",
      settingLead:
        "Melden Sie sich ein letztes Mal bei Ihrem alten Swiss-Bitcoin-Pay-Konto an: Es wird eingefroren, und die Sats, die es Ihnen schuldet, gehen sofort per Lightning auf Ihr sattle.me-Konto, spätestens um 0:00\u00a0UTC.",
      settingStart: "Mein altes Konto einfrieren",
      running: "Ihr altes Konto wird geschlossen…",
      done: "Ihr altes Swiss-Bitcoin-Pay-Konto ist eingefroren: Es nimmt keine Zahlungen mehr an. Guthaben auf Ihr neues sattle.me-Wallet übertragen.",
      doneNone:
        "Ihr altes Swiss-Bitcoin-Pay-Konto ist eingefroren: Es nimmt keine Zahlungen mehr an. Kein Guthaben zu übertragen.",
      donePending:
        "Ihr altes Swiss-Bitcoin-Pay-Konto ist eingefroren: Es nimmt keine Zahlungen mehr an. Das Guthaben wird spätestens um 0:00\u00a0UTC auf Ihr neues sattle.me-Wallet übertragen.",
      conflict:
        "Ihr altes Konto wurde bereits auf ein anderes sattle.me-Konto aktualisiert: Sein Geld wird dorthin ausgezahlt. Falls Sie das nicht waren, schreiben Sie uns an {{email}}.",
      rejected:
        "Ihr altes Konto konnte nicht eingefroren werden. Schreiben Sie uns an {{email}}: Wir erledigen es mit Ihnen.",
      failed:
        "Ihr altes Konto konnte nicht eingefroren werden: Es nimmt weiterhin Zahlungen an. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
      lost: "Ihr altes Konto konnte nicht eingefroren werden: Es nimmt weiterhin Zahlungen an. Schreiben Sie uns an {{email}}: Wir erledigen es mit Ihnen."
    },
    transfer: {
      prompt: "Ihr altes Portemonnaie öffnen",
      running: "Ihr Geld wird übertragen…",
      retry: "Erneut versuchen",
      sentTitle: "{{amount}} unterwegs auf Ihr neues Konto",
      sent: "Der Betrag erscheint in „$t(navigation.destinations.wallet)“, sobald das Netzwerk ihn bestätigt, meist innerhalb einer Stunde. Netzwerkgebühr: {{fee}}.",
      more: "Weitere {{amount}} sind unterwegs auf Ihr altes Konto: Sie können sie nach dem Eingang in „$t(navigation.destinations.wallet)“ übertragen.",
      empty: "Ihr altes Portemonnaie ist leer: nichts zu übertragen.",
      waiting:
        "{{amount}} gehen auf Ihrem alten Konto ein: Sie können sie nach dem Eingang in „$t(navigation.destinations.wallet)“ übertragen.",
      tooSmall:
        "Ihr altes Portemonnaie enthält {{amount}}, weniger als die Gebühren für die Übertragung. Der Betrag bleibt vorerst, wo er ist.",
      unreadable:
        "Ihr Telefon konnte Ihr altes Portemonnaie nicht öffnen. Versuchen Sie es erneut oder geben Sie seine 12 Wörter ein.",
      failed:
        "Die Übertragung hat nicht geklappt. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
      sheetTitle: "Ihr altes Portemonnaie übertragen?",
      from: "Von",
      fromName: "Swiss Bitcoin Pay Portemonnaie",
      fromCaption: "12 Wörter, auf diesem Telefon",
      to: "Nach",
      toName: "Ihr sattle.me Portemonnaie",
      amountLabel: "Betrag",
      amountUnknown: "Wird bei der Übertragung gelesen",
      sats: "{{sats}} sats",
      fiat: "etwa {{fiat}}",
      eraseNote:
        "Die 12 Wörter werden danach aus dem Speicher dieses Telefons gelöscht, ob übertragen oder nicht.",
      start: "Übertragen",
      skip: "Nicht übertragen",
      skipTitle: "Ohne Übertragung löschen?",
      skipBody:
        "Die 12 Wörter Ihres Swiss Bitcoin Pay Portemonnaies werden aus dem Speicher Ihres Telefons gelöscht. Die {{amount}} darin lassen sich dann nur noch mit Ihren auf Papier notierten 12 Wörtern zurückholen.",
      skipBodyUnknown:
        "Die 12 Wörter Ihres Swiss Bitcoin Pay Portemonnaies werden aus dem Speicher Ihres Telefons gelöscht. Sein Inhalt lässt sich dann nur noch mit Ihren auf Papier notierten 12 Wörtern zurückholen.",
      skipConfirm: "Ich habe die 12 Wörter,\nohne Übertragung löschen",
      erased: "Die 12 Wörter wurden von diesem Telefon gelöscht.",
      tooSmallErased:
        "Ihr altes Portemonnaie enthält {{amount}}, weniger als die Gebühren für die Übertragung: Der Betrag bleibt, wo er ist.",
      skipped:
        "Die 12 Wörter wurden ohne Übertragung von diesem Telefon gelöscht. Mit Ihren auf Papier notierten 12 Wörtern lässt sich der Inhalt übertragen.",
      eraseFailed:
        "Die 12 Wörter konnten nicht von diesem Telefon gelöscht werden. Versuchen Sie es erneut."
    },
    done: {
      title: "Ihr Konto ist auf dem neuesten Stand",
      todoTitle: "Noch zu tun, falls es Sie betrifft",
      employees: "Laden Sie Ihre Mitarbeitenden erneut ein",
      shop: "Migrieren Sie die Integration Ihres Onlineshops",
      changes: "Was sich ändert",
      words:
        "Auf Ihrem alten Swiss-Bitcoin-Pay-Portemonnaie sind noch {{amount}}. Übertragen Sie sie mit den 12 Wörtern, die Sie bei seiner Erstellung notiert haben.",
      wordsUnknown:
        "Ihr altes Swiss-Bitcoin-Pay-Portemonnaie konnte nicht geprüft werden: Es kann noch Geld enthalten. Übertragen Sie es mit den 12 Wörtern, die Sie bei seiner Erstellung notiert haben.",
      checking: "Ihr altes Portemonnaie wird geprüft…",
      titleRunning: "Ihr Konto wird aktualisiert",
      lead: "Meist nur wenige Sekunden.",
      // The steps of the migration's end (MigrationTimeline, end-steps.tsx).
      steps: {
        account: "sattle.me-Konto erstellt",
        accountCaption: "„{{business}}“ ist bereit für Zahlungen.",
        frozen: "Altes Konto eingefroren",
        frozenSent:
          "Es nimmt keine Zahlungen mehr an. Guthaben auf Ihr neues sattle.me-Wallet übertragen.",
        frozenNone: "Es nimmt keine Zahlungen mehr an. Kein Guthaben zu übertragen.",
        frozenPending:
          "Es nimmt keine Zahlungen mehr an. Das Guthaben wird spätestens um 0:00\u00a0UTC auf Ihr neues sattle.me-Wallet übertragen.",
        migratedElsewhere: "Altes Konto bereits aktualisiert",
        notFrozen: "Altes Konto nicht eingefroren",
        history: "Ihr Verlauf wird kopiert",
        historyWaiting: "Sobald Ihr altes Konto eingefroren ist.",
        historyRunning: "Ihr Verlauf wird kopiert…",
        historyRead_one: "{{formatted}} Bewegung gelesen",
        historyRead_other: "{{formatted}} Bewegungen gelesen",
        historyWritten_one: "{{copied}}\u00a0/\u00a0{{total}} Bewegung",
        historyWritten_other: "{{copied}}\u00a0/\u00a0{{total}} Bewegungen",
        historyCopied: "Verlauf kopiert",
        historyCopiedCaption_one:
          "{{formatted}} Bewegung, sichtbar in „$t(navigation.destinations.wallet)“.",
        historyCopiedCaption_other:
          "{{formatted}} Bewegungen, sichtbar in „$t(navigation.destinations.wallet)“.",
        historyEmpty: "Keine Bewegung zu kopieren.",
        historyNotCopied: "Verlauf nicht kopiert",
        wallet: "Altes Portemonnaie"
      }
    },
    changes: {
      title: "Was sich ändert",
      lead: "Sobald Ihr sattle.me-Konto erstellt ist:",
      frozen:
        "Sobald es eingefroren ist, nimmt Ihr altes Swiss-Bitcoin-Pay-Konto keine Zahlungen mehr an, weder an der Kasse noch online noch über seine Lightning-Adresse.",
      items: {
        employees: {
          title: "Laden Sie Ihre Mitarbeitenden erneut ein",
          caption:
            "Ihre Geräte nehmen keine Zahlungen mehr auf das alte Konto an. Laden Sie sie unter „$t(navigation.destinations.employees)“ ein: Sie scannen Ihren Code und kassieren für Sie. Ein für sattle.me zu altes Gerät kann keine Zahlungen mehr annehmen."
        },
        shop: {
          title: "Migrieren Sie die Integration Ihres Onlineshops",
          caption:
            "Ihr Onlineshop nimmt keine Zahlungen mehr auf das alte Konto an. Erstellen Sie unter „$t(navigation.destinations.integrations)“ eine Integration und geben Sie deren Schlüssel der Person, die Ihre Website betreut."
        },
        limits: {
          title: "Keine Limits mehr",
          caption:
            "Dank dem Update auf sattle.me 3.0.0 gibt es keine Limits und Einschränkungen mehr, die an die Identitätsprüfung gebunden sind."
        },
        money: {
          title: "Ihr Geld kommt mit",
          caption:
            "Die Sats, die Ihnen das alte Konto schuldet, gehen mit der Aktualisierung per Lightning auf Ihr sattle.me-Konto, unabhängig von Ihren alten Einstellungen; gelingt die Überweisung nicht, wird sie jede Nacht um 0:00\u00a0UTC wiederholt. Was danach noch eintrifft, folgt bei seiner Abwicklung. Bereits laufende Banküberweisungen erfolgen wie gewohnt."
        },
        cards: {
          title: "Übertragen Sie Ihre Karten",
          caption:
            "Halten Sie jede Swiss-Bitcoin-Pay-Karte unter „$t(navigation.destinations.cards)“ an das Gerät, um ihr Guthaben zu übertragen. Eine noch nicht übertragene Karte funktioniert bis zum {{cardEnd}}."
        },
        history: {
          title: "Ihr Verlauf wird kopiert",
          caption:
            "Ihre Verkäufe, Auszahlungen und Provisionen werden zur Information nach „$t(navigation.destinations.wallet)“ kopiert. Sie sind in seinen CSV- und PDF-Exporten enthalten. Der Verlauf Ihres alten Kontos bleibt bis zum {{merchantEnd}} auf dashboard.swiss-bitcoin-pay.ch einsehbar und exportierbar."
        }
      }
    },
    // The copy of the v2 account's history (src/features/migration/history-import.ts).
    history: {
      running: "Ihr Swiss-Bitcoin-Pay-Verlauf wird im Hintergrund kopiert…",
      // While reading the v2 server (its pages tell no total), then writing to the relays.
      reading_one: "Ihr Swiss-Bitcoin-Pay-Verlauf wird gelesen: {{formatted}} Bewegung gelesen…",
      reading_other:
        "Ihr Swiss-Bitcoin-Pay-Verlauf wird gelesen: {{formatted}} Bewegungen gelesen…",
      writing_one:
        "Ihr Swiss-Bitcoin-Pay-Verlauf wird kopiert: {{copied}}\u00a0/\u00a0{{total}} Bewegung…",
      writing_other:
        "Ihr Swiss-Bitcoin-Pay-Verlauf wird kopiert: {{copied}}\u00a0/\u00a0{{total}} Bewegungen…",
      done_one:
        "Ihr Verlauf ist kopiert: {{formatted}} Bewegung, sichtbar in „$t(navigation.destinations.wallet)“.",
      done_other:
        "Ihr Verlauf ist kopiert: {{formatted}} Bewegungen, sichtbar in „$t(navigation.destinations.wallet)“.",
      failed:
        "Das Kopieren Ihres Verlaufs ist nicht abgeschlossen. Starten Sie es erneut unter „$t(settings.title)“, Bereich „$t(settings.groups.account)“.",
      settingTitle: "Swiss-Bitcoin-Pay-Verlauf",
      settingDescription:
        "Kopieren Sie die Verkäufe, Auszahlungen und Provisionen Ihres alten Kontos zur Information in sattle.me. Möglich bis zum {{date}}.",
      start: "Meinen Verlauf importieren",
      lead: "Melden Sie sich ein letztes Mal bei Ihrem alten Swiss-Bitcoin-Pay-Konto an: Ihr Verlauf wird im Hintergrund kopiert.",
      note: "Ihr Passwort wird ein einziges Mal verwendet und nie gespeichert.",
      errors: {
        secondFactor:
          "Ihr altes Konto verlangt einen Bestätigungscode, den sattle.me nicht verwenden kann. Wenden Sie sich an den Support.",
        stopped:
          "Um Ihr altes Konto nicht zu sperren, versuchen wir es nicht weiter. Prüfen Sie Ihr Passwort, bevor Sie es später erneut versuchen.",
        unreachable:
          "Ihr altes Konto antwortet nicht. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut."
      }
    },
    words: {
      open: "Meine 12 Wörter eingeben",
      title: "Ihr altes Portemonnaie",
      lead: "Geben Sie der Reihe nach die 12 Wörter ein, die Sie beim Erstellen Ihres Portemonnaies in der Swiss-Bitcoin-Pay-App notiert haben. Sein Geld wird auf Ihr sattle.me-Konto übertragen.",
      only: "Nur diese 12 Wörter: Geben Sie hier nie die Wörter eines anderen Portemonnaies ein (Ledger, Trezor, BitBox oder andere).",
      label: "Ihre 12 Wörter",
      invalid: "Diese Wörter ergeben kein Portemonnaie: Prüfen Sie jedes Wort und ihre Reihenfolge",
      mismatch:
        "Diese Wörter gehören nicht zu Ihrem Swiss-Bitcoin-Pay-Portemonnaie: Prüfen Sie jedes Wort und ihre Reihenfolge und geben Sie sie erneut ein",
      unused:
        "Diese Wörter passen zu keinem Portemonnaie, das je Geld erhalten hat: Prüfen Sie jedes Wort und ihre Reihenfolge und geben Sie sie erneut ein",
      submit: "Übertragen",
      done: "Fertig",
      note: "Ihre Wörter werden nur einmal verwendet und nie gespeichert."
    },
    employee: {
      title: "Swiss Bitcoin Pay wird zu sattle.me",
      lead: "Dieses Gerät hat Zahlungen für ein Geschäft angenommen. Um weiterzumachen, bitten Sie die verantwortliche Person, Sie über sattle.me erneut einzuladen, und scannen Sie dann ihren Code.",
      leadBusiness:
        "Dieses Gerät hat Zahlungen für „{{business}}“ angenommen. Um weiterzumachen, bitten Sie die verantwortliche Person, Sie über sattle.me erneut einzuladen, und scannen Sie dann ihren Code.",
      join: "Einladung scannen",
      logIn: "Ich habe bereits ein sattle.me-Konto",
      owner: "Ich bin für dieses Geschäft verantwortlich"
    },
    wallet: {
      unchecked:
        "Ihr altes Swiss-Bitcoin-Pay-Portemonnaie ist auf diesem Telefon. Prüfen Sie, ob noch Geld zu übertragen ist.",
      check: "Prüfen und übertragen",
      funds: "Auf Ihrem alten Konto liegen noch {{amount}}, die Sie hierher übertragen können.",
      transfer: "Übertragen",
      incoming:
        "{{amount}} gehen auf Ihrem alten Konto ein: Sie können sie nach dem Eingang übertragen."
    }
  },
  split: {
    title: "Wie möchten Sie bezahlt werden?",
    description:
      "Die App schlägt Ihnen vor, diesen Anteil Ihrer Einnahmen zu verkaufen. Jederzeit änderbar.",
    bitcoin: "Bitcoin",
    freeUntil: "Gratis bis {{date}}",
    sattleFee: "Gebühr von sattle.me",
    sattleFeeScope: "Auf alle Ihre Einnahmen, umgewandelt oder nicht",
    conversionFee: "Umwandlung in {{currency}}",
    conversionFeeScope: "Verkaufsgebühren von Mt Pelerin, nur auf den umgewandelten Anteil",
    extraFee: "+ {{fee}}",
    transferNote:
      "Überweisung gratis ab {{threshold}}. Darunter werden Ihre Verkäufe gesammelt, bis sie den Betrag erreichen, oder sofort für {{fee}} überwiesen.",
    waivedRate: "{{free}} statt {{fee}}",
    feeRange: "{{min}} bis {{max}}",
    sliderLabel: "Bitcoin-Anteil",
    sliderValue: "{{bitcoin}} in Bitcoin, {{fiat}} in {{currency}}",
    currencyButton: "Auszahlungswährung: {{currency}}"
  },
  bank: {
    currentAccount: "Das gespeicherte Konto",
    currentAccountSub: "Bei Mt Pelerin, in dieser Währung",
    editAccount: "Dieses Konto bearbeiten",
    title:
      "Wohin sollen die in <accent>{{currency}}</accent> umgerechneten <accent>{{percent}}</accent> überwiesen werden?",
    transferSchedule:
      "Ihre Verkäufe werden dorthin überwiesen, in einer Überweisung zusammengefasst.",
    editableLater: "Diese Angaben können Sie in den Einstellungen ändern.",
    country: "Wohnsitzland",
    iban: "IBAN",
    ibanInvalid: "Prüfen Sie die IBAN",
    holderKind: "Der Inhaber ist",
    person: "Eine Person",
    company: "Ein Unternehmen",
    companyName: "Firmenname",
    firstname: "Vorname",
    lastname: "Nachname",
    address: "Adresse",
    addressPlaceholder: "Straße und Nummer",
    postalCode: "PLZ",
    postalCodePlaceholder: "1003",
    city: "Ort",
    cityPlaceholder: "Lausanne",
    mtPelerin: {
      sheetTitle: "Mt-Pelerin-Konto",
      lead: "Dieser Anteil wird an unseren Partner Mt Pelerin verkauft, einen Schweizer Finanzintermediär, der den Betrag auf Ihr Bankkonto überweist.",
      accountTitle: "Ihr Konto bei unserem Partner",
      accountSms: "Ihre Handynummer und ein per SMS erhaltener Code, dann Ihre E-Mail-Adresse",
      accountKey: "Der Schlüssel Ihres sattle.me-Kontos, dann Ihre E-Mail-Adresse und Ihre Nummer",
      bankTitle: "Ihr Bankkonto",
      bankSub: "Bei unserem Partner hinterlegt, der Ihre Verkäufe dorthin überweist",
      saleTitle: "Nichts wird ohne Sie verkauft",
      saleSub:
        "Die App schlägt Ihnen den Verkauf dieses Anteils vor, Sie bestätigen mit Ihrem Passkey. Vor dem ersten Verkauf wird Ihre Wallet mit einer Zahlung von 1 Sat geprüft",
      connected: "Mt-Pelerin-Konto verbunden: Dieses Bankkonto wird dort hinterlegt",
      create: "Mein Mt-Pelerin-Konto erstellen",
      existing: "Ich habe bereits ein Mt-Pelerin-Konto",
      createTitle: "Ihr Konto erstellen",
      createLeadSms:
        "Mit Ihrer Handynummer, dann Ihrer E-Mail-Adresse. Ein bereits mit dieser Nummer eröffnetes Konto wird übernommen.",
      createLeadKey:
        "Mit dem Schlüssel Ihres sattle.me-Kontos, dann Ihrer E-Mail-Adresse und Ihrer Nummer.",
      existingTitle: "Ihr Konto verbinden",
      existingLeadSms: "Mit der Handynummer Ihres Kontos.",
      existingLeadKey: "Mit dem Schlüssel Ihres sattle.me-Kontos."
    }
  },
  setup: {
    title: "Ihr Konto wird eingerichtet…",
    description:
      "Ihre Lightning-Adresse und Ihre Kasse werden vorbereitet. Das kann einen Moment dauern.",
    cardDescription:
      "Ihr Konto wird auf diesem Gerät vorbereitet. Das dauert nur einen Augenblick.",
    failedTitle: "Einrichtung unterbrochen",
    retry: "Erneut versuchen"
  },
  appStores: {
    googlePlay: "App bei Google Play installieren",
    appStore: "App im App Store installieren"
  },
  install: {
    banner: {
      name: "sattle.me",
      iphone: "Die App für iPhone, im App Store",
      ipad: "Die App für iPad, im App Store",
      android: "Die App für Android, bei Google Play",
      computer: "In einem eigenen Fenster, wie eine App",
      get: "Laden",
      install: "Installieren",
      dock: "Zum Dock hinzufügen",
      dismiss: "Schließen, nicht mehr anbieten"
    },
    setting: {
      title: "App installieren",
      places: {
        iphone: "Die sattle.me-App für iPhone, im App Store.",
        ipad: "Die sattle.me-App für iPad, im App Store.",
        android: "Die sattle.me-App für Android, bei Google Play.",
        computer: "sattle.me auf diesem Computer, in einem eigenen Fenster, wie eine App.",
        dock: "sattle.me im Dock dieses Mac, in einem eigenen Fenster, wie eine App."
      },
      appStore: "App Store",
      googlePlay: "Google Play"
    },
    dock: {
      title: "sattle.me zum Dock hinzufügen",
      menu: "Wählen Sie in der Menüleiste von Safari <strong>„Ablage“ > „Zum Dock hinzufügen“</strong>.",
      add: "Klicken Sie auf <strong>„Hinzufügen“</strong>: sattle.me öffnet sich aus dem Dock, in einem eigenen Fenster.",
      requirement: "Mit Safari unter macOS Sonoma oder neuer.",
      passkey:
        "Die App im Dock hat ihre eigenen Daten: Melden Sie sich beim ersten Mal erneut mit Ihrem Passkey an.",
      done: "Verstanden"
    }
  },
  countryPicker: {
    search: "Land suchen",
    noResult: "Kein Land gefunden",
    close: "Schließen"
  },
  currencyPicker: {
    title: "Auszahlungswährung",
    close: "Schließen"
  },
  card: {
    computerTitle: "Fügen Sie Ihre <accent>Karte</accent> mit Ihrem Telefon hinzu",
    computerDescription:
      "Ein Computer kann keine NFC-Karten lesen. Scannen Sie diesen Code mit Ihrem Telefon: Er öffnet die App, in der Sie sich mit demselben Passkey anmelden. Halten Sie dann die Karte an das Telefon.",
    computerCode: "QR-Code, der diesen Schritt in der App auf Ihrem Telefon öffnet",
    computerWaiting:
      "Warten auf Ihr Telefon: Diese Seite geht weiter, sobald die Karte hinzugefügt ist.",
    // The same in the app on a device that reads no card (an iPad, useReadsCards.ts).
    deviceDescription:
      "Dieses Gerät kann keine NFC-Karten lesen. Scannen Sie diesen Code mit Ihrem Telefon: Er öffnet die App, in der Sie sich mit demselben Passkey anmelden. Halten Sie dann die Karte an das Telefon.",
    deviceDescriptionNoCode:
      "Dieses Gerät kann keine NFC-Karten lesen. Öffnen Sie die App auf Ihrem Telefon und melden Sie sich mit demselben Passkey an. Halten Sie dann die Karte an das Telefon.",
    deviceWaiting:
      "Warten auf Ihr Telefon: Dieser Bildschirm geht weiter, sobald die Karte hinzugefügt ist.",
    addedTitle: "Ihre <accent>Karte</accent> ist hinzugefügt",
    addedDescription:
      "Auf Ihrem Telefon hinzugefügt, erscheint sie auch hier, unter „Karten“. Laden Sie sie auf, um sie zu verwenden.",
    webTitle: "Koppeln Sie Ihre <accent>BoltCard</accent> in der App",
    webDescription:
      "Ein Browser kann keine Karte programmieren. Öffnen Sie die App sattle.me auf diesem Telefon und melden Sie sich mit Ihrem Passkey an: Die Kopplung wird dort fortgesetzt.",
    webDescriptionAndroid:
      "Ein Browser kann keine Karte programmieren. Öffnen oder installieren Sie die Android-App sattle.me auf diesem Telefon und melden Sie sich mit Ihrem Passkey an: Die Kopplung wird in der App fortgesetzt.",
    webDescriptionIphone:
      "Ein Browser kann keine Karte programmieren. Öffnen oder installieren Sie die iPhone-App sattle.me auf diesem Telefon und melden Sie sich mit Ihrem Passkey an: Die Kopplung wird in der App fortgesetzt.",
    retry: "Erneut versuchen",
    openSettings: "Einstellungen öffnen",
    activationPending:
      "Ihre Karte ist programmiert, aber ihr Relais hat noch nicht geantwortet. Sie wird beim nächsten Öffnen der App mit Verbindung aktiviert: Bis dahin kann sie nicht bezahlen.",
    activationNoPush:
      "Ihre Karte ist bereit, aber dieses Telefon empfängt keine Zahlungsmitteilungen: Sie bezahlt nur, solange die App angezeigt wird. Die Mitteilungen werden von selbst aktiviert, sobald dieses Telefon sie empfangen kann.",
    failure: {
      noAccount:
        "Ihre Sitzung ist geschlossen. Melden Sie sich erneut mit Ihrem Passkey an und versuchen Sie es dann noch einmal.",
      nfcUnavailable:
        "NFC ist auf diesem Gerät nicht verfügbar oder ausgeschaltet. Schalten Sie es in den Einstellungen ein und versuchen Sie es dann erneut.",
      notificationsDenied:
        "Erlauben Sie die Mitteilungen von sattle.me in den Einstellungen des Telefons: Über sie erfährt Ihr Telefon, dass eine Kasse Ihre Karte liest.",
      relayUnreachable:
        "Das Relais der Karte antwortet nicht. Prüfen Sie Ihre Verbindung und versuchen Sie es dann erneut. Ihre Karte wurde nicht verändert.",
      relayIncompatible:
        "Das Relais der Karte spricht nicht die erwartete Version. Ihre Karte wurde nicht verändert.",
      relayTooLong: "Die Adresse dieses Relais ist zu lang für eine Karte.",
      recordsUnreachable:
        "Zu wenige Relais Ihres Kontos antworten. Prüfen Sie Ihre Verbindung und versuchen Sie es dann erneut. Ihre Karte wurde nicht verändert.",
      notConfirmed:
        "Die Relais Ihres Kontos haben diese Änderung nicht bestätigt: Sie kann noch wirksam werden, oder auch nicht. Prüfen Sie Ihre Verbindung und versuchen Sie es dann erneut.",
      notBlank:
        "Diese Karte ist nicht leer. Bitten Sie zuerst ihren Herausgeber, sie zurückzusetzen.",
      ownCard:
        "Diese Karte ist bereits unter „Karten“. Um sie erneut hinzuzufügen, löschen Sie sie zuerst, die Karte zur Hand.",
      notThisCard:
        "Das ist nicht die gewählte Karte, oder sie wurde anderswo neu programmiert. Nichts wurde geändert: Halten Sie die richtige Karte an das Telefon.",
      cardLost:
        "Die Karte wurde zu früh entfernt. Halten Sie sie erneut an das Telefon und lassen Sie sie bis zum Ende dort: Die Kopplung wird fortgesetzt, wo sie unterbrochen wurde.",
      notBoltCard: "Diese Karte ist keine BoltCard (NTAG 424 DNA).",
      verifyFailed:
        "Die Karte wurde programmiert, aber ihre Prüfung ist fehlgeschlagen. Halten Sie sie erneut an das Telefon.",
      versionsExhausted:
        "Diese Karte wurde zu oft mit diesem Wallet programmiert. Verwenden Sie eine andere Karte.",
      newerApp:
        "Eine neuere Version der App hat diese Karte gespeichert. Aktualisieren Sie die App.",
      walletNotEmpty:
        "Die Wallet dieser Karte ist nicht leer, oder es sind noch Sats unterwegs. Zahlen Sie ihr Guthaben zuerst auf Ihr Hauptguthaben aus: Eine gelöschte Karte erscheint nirgends mehr, ihre Sats auch nicht. Ihre Karte wurde nicht verändert.",
      walletUnavailable:
        "Die Wallet dieser Karte hat nicht geantwortet: Eine Karte wird erst gelöscht, wenn ihre Wallet als leer geprüft ist. Prüfen Sie Ihre Verbindung und versuchen Sie es dann erneut. Ihre Karte wurde nicht verändert.",
      cardGone:
        "Diese Karte ist nicht mehr unter „Karten“: Sie wurde gelöscht. Es wurde nichts verändert.",
      deletionPending:
        "Die Relais Ihres Kontos haben das Löschen noch nicht gespeichert: Die Karte wurde nicht geleert.",
      migrationDrainFailed:
        "Das Guthaben dieser Karte konnte diesmal nicht übertragen werden, und die Karte wurde nicht verändert: Versuchen Sie es gleich erneut.",
      migrationOverDailyLimit:
        "Diese Übertragung überschreitet das Limit der Karte: 1000 CHF pro 24 Stunden, ihre letzten Ausgaben eingerechnet. Es wurde nichts übertragen und die Karte wurde nicht verändert: Versuchen Sie es erneut, sobald ihr Guthaben unter diesem Limit liegt, oder kontaktieren Sie den Support.",
      migrationReceiptPending:
        "Die Übertragung wurde angefordert, aber ihr Eingang auf der neuen Wallet konnte nicht rechtzeitig bestätigt werden. Ihre Sats sind vielleicht schon unterwegs: „Karten“ zeigt die Karte und ihre Wallet. Die Karte wurde nicht verändert: Warten Sie einen Moment und versuchen Sie es erneut.",
      migrationMasterKey:
        "Die Karte konnte nicht neu codiert werden: Ihr Hauptschlüssel ist nicht der erwartete. Was bereits übertragen wurde, ist in ihrer neuen Wallet, die „Karten“ zeigt. Versuchen Sie es erneut; falls das Problem bleibt, kontaktieren Sie den Support.",
      migrationNotWiped:
        "Die Karte konnte nicht zurückgesetzt werden. Was bereits übertragen wurde, ist in ihrer neuen Wallet, die „Karten“ zeigt. Versuchen Sie es erneut; falls das Problem bleibt, kontaktieren Sie den Support.",
      migrationCardDisabled:
        "Diese Karte ist beim bisherigen Dienst gesperrt: Sie kann nicht migriert werden. Wenn Sie sie selbst gesperrt haben, entsperren Sie sie zuerst; andernfalls kontaktieren Sie den Support. Es wurde nichts geändert.",
      migrationPaymentPending:
        "Eine Zahlung dieser Karte ist beim bisherigen Dienst noch in Bearbeitung, oft die soeben erfolgte Übertragung: Sie kann noch nicht gelöscht werden. Die Karte wurde nicht verändert: Versuchen Sie es gleich noch einmal, die Migration wird fortgesetzt, wo sie unterbrochen wurde.",
      migrationServerUnreachable:
        "Der Austausch mit dem Server von Swiss Bitcoin Pay, der als einziger diese Karte öffnen kann, ist nicht zustande gekommen. Prüfen Sie Ihre Verbindung, halten Sie die Karte an das Telefon und versuchen Sie es dann erneut: Die Kopplung wird fortgesetzt, wo sie unterbrochen wurde.",
      cancelled: "Kopplung abgebrochen.",
      failed: "Die Kopplung ist fehlgeschlagen. Versuchen Sie es erneut."
    },
    nfcAlert: "Halten Sie Ihre BoltCard an den oberen Rand des Telefons und lassen Sie sie dort.",
    nfcSuccess: "Karte gekoppelt",
    nfcFailure: "Kopplung unterbrochen",
    notificationChannel: "Kartenzahlungen",
    decline: {
      newPayee:
        "Neuer Händler: Der Karteninhaber muss ihn in seiner sattle.me-App freigeben und die Karte erneut vorhalten.",
      unidentifiedPayee:
        "Händler nicht erkannt: Der Karteninhaber muss die Zahlung in seiner sattle.me-App bestätigen.",
      unconfirmed: "Die Zahlung muss vom Karteninhaber in seiner sattle.me-App bestätigt werden.",
      notConfirmed: "Zahlung auf dem Telefon des Karteninhabers nicht bestätigt.",
      refused: "Zahlung vom Karteninhaber abgelehnt.",
      insufficientBalance: "Guthaben der Karte nicht ausreichend.",
      aboveLimit: "Betrag über dem Limit pro Zahlung der Karte.",
      dayLimit: "24-Stunden-Limit der Karte erreicht.",
      hourLimit: "Zu viele Zahlungen mit dieser Karte innerhalb einer Stunde.",
      suspended:
        "Karte pausiert: Der Karteninhaber kann sie in seiner sattle.me-App wieder aktivieren.",
      invalidInvoice: "Rechnung für diese Karte nicht gültig.",
      expired: "Rechnung abgelaufen: Erstellen Sie eine neue.",
      noAmount: "Rechnung ohne Betrag: Die Karte zahlt nur einen festen Betrag.",
      outOfBounds: "Betrag außerhalb der Grenzen der Karte (1 Sat bis 1 BTC).",
      alreadyPaid: "Die Karte zahlt diese Rechnung nicht: Sie ist bereits beglichen.",
      invalidTap: "Lesen der Karte ungültig: Halten Sie die Karte erneut hin.",
      sendFailed:
        "Die Zahlung ist nicht abgegangen, es wurde nichts bezahlt. Halten Sie die Karte erneut hin.",
      uncertain:
        "Zahlung unterbrochen: Sie kann noch eintreffen. Warten Sie einige Sekunden, bevor Sie es erneut versuchen.",
      updateApp: "Der Karteninhaber muss seine sattle.me-App aktualisieren.",
      superseded: "Ein neueres Lesen der Karte hat dieses ersetzt.",
      other: "Die Zahlung konnte nicht verarbeitet werden."
    },
    payment: {
      title: "Kartenzahlung",
      close: "Schließen",
      waiting: "Karte gelesen, warten auf die Rechnung der Kasse…",
      checking: "Händler wird geprüft…",
      delay: {
        minute: "innerhalb einer Minute",
        seconds_one: "innerhalb von {{count}} Sekunde",
        seconds_other: "innerhalb von {{count}} Sekunden"
      },
      note: {
        newPayee: "Neuer Händler: Prüfen Sie Betrag und Namen vor dem Bezahlen.",
        unidentifiedPayee:
          "Die Kasse hat nicht nachgewiesen, wer diese Zahlung erhält: Prüfen Sie den Betrag mit dem Händler.",
        unconfirmed: "Prüfen Sie den Betrag und den Händler."
      },
      pay: "{{amount}} bezahlen",
      decline: "Ablehnen",
      answerIn: "Antworten Sie innerhalb von {{seconds}} s",
      timeOut: "Zeit abgelaufen",
      timeLabel: "Zeit zum Antworten",
      merchant: "Händler",
      noteLabel: "Notiz",
      card: "Karte",
      exactAmount: "Genauer Betrag",
      approve: "Diesen Händler genehmigen",
      approveCaption: "Seine nächsten Zahlungen gehen ohne Bestätigung durch",
      joined: "{{first}} · {{second}}",
      ofCard: "Karte {{name}}",
      confirming: "Bestätigen Sie mit Ihrem Passkey…",
      paying: "Zahlung wird gesendet…",
      payingAutomatically: "Zahlung wird ohne Bestätigung gesendet…",
      approved: "Dieser Händler gehört nun zu Ihren genehmigten Händlern.",
      done: "Fertig",
      doneIn: "Fertig ({{seconds}} s)",
      failedTitle: "Zahlung nicht ausgeführt",
      nothingPaid: "Es wurde nichts bezahlt.",
      result: {
        completedTitle: "Zahlung ausgeführt",
        completedBody: "{{amount}} mit Ihrer Karte bezahlt.",
        completedBodyAutomatic: "{{amount}} mit Ihrer Karte bezahlt, ohne Bestätigung.",
        pendingTitle: "Zahlung gesendet",
        pendingBody:
          "Die Zahlung von {{amount}} ist unterwegs. Ihr Status erscheint in der Liste der Bewegungen.",
        failedTitle: "Zahlung fehlgeschlagen",
        failedBody:
          "Die Zahlung von {{amount}} ist nicht durchgegangen. Ihr Status erscheint in der Liste der Bewegungen.",
        declinedTitle: "Zahlung abgelehnt",
        declinedBody:
          "Sie haben diese Zahlung von {{amount}} abgelehnt. Es wurde nichts bezahlt; die Kasse ist informiert."
      },
      failure: {
        unreachable:
          "Das Relais der Karte antwortet nicht, oder diese Zahlung ist abgelaufen. Es wurde nichts bezahlt.",
        ended:
          "Die Kasse wartet nicht mehr auf diese Zahlung. Es wurde nichts bezahlt: Halten Sie Ihre Karte bei Bedarf erneut hin.",
        invalidInvoice:
          "Die Kasse hat eine Rechnung gesendet, die Ihr Wallet nicht bezahlen kann. Es wurde nichts bezahlt.",
        otherNetwork:
          "Die Rechnung der Kasse gehört zu einem anderen Bitcoin-Netzwerk. Es wurde nichts bezahlt.",
        expired: "Die Rechnung der Kasse ist abgelaufen. Es wurde nichts bezahlt.",
        noAmount:
          "Die Rechnung der Kasse hat keinen Betrag in ganzen Sats. Es wurde nichts bezahlt.",
        outOfBounds:
          "Der Betrag liegt außerhalb der Grenzen einer Kartenzahlung. Es wurde nichts bezahlt.",
        suspended: "Diese Karte ist pausiert. Es wurde nichts bezahlt.",
        alreadyPaid: "Diese Rechnung wurde bereits bezahlt. Es wurde nichts erneut bezahlt.",
        dayLimit:
          "Diese Zahlung würde das 24-Stunden-Limit Ihrer Karte überschreiten. Es wurde nichts bezahlt.",
        hourLimit:
          "Ihre Karte hat ihre Anzahl Zahlungen für diese Stunde erreicht. Es wurde nichts bezahlt.",
        aboveLimit: "Der Betrag liegt über dem Limit Ihrer Karte. Es wurde nichts bezahlt.",
        notYourCard:
          "Diese Zahlung stammt nicht von einem Tap Ihrer Karte. Es wurde nichts bezahlt.",
        replayed: "Dieser Tap Ihrer Karte wurde bereits verwendet. Es wurde nichts bezahlt.",
        unlock: "Die Zahlung wurde nicht bestätigt. Es wurde nichts bezahlt.",
        insufficientBalance:
          "Das Guthaben Ihrer Karte reicht für diese Zahlung und ihre Gebühr nicht aus. Es wurde nichts bezahlt: Laden Sie die Karte unter „Karten“ auf.",
        sendFailed:
          "Ihr Wallet konnte diese Zahlung nicht senden, zum Beispiel mangels Guthaben. Es ist nichts abgegangen.",
        uncertain:
          "Ihr Wallet hat den Versand nicht bestätigt: Die Zahlung ist vielleicht abgegangen. Prüfen Sie die Liste der Bewegungen, bevor Sie anders bezahlen.",
        newerApp:
          "Eine neuere Version der App hat Ihre Karte gespeichert. Aktualisieren Sie die App. Es wurde nichts bezahlt.",
        otherInvoice:
          "Der Dienst des Händlers erkennt diese Rechnung nicht: Sie wurde unterwegs möglicherweise ersetzt. Es wurde nichts bezahlt.",
        settled:
          "Der Dienst des Händlers meldet, dass diese Rechnung bereits bezahlt ist. Es wurde nichts erneut bezahlt.",
        newPayee:
          "Keine Bestätigung {{delay}}: Es wurde nichts bezahlt. Die Kasse wurde informiert, dass dieser neue Händler in der App zu genehmigen ist.",
        newPayeeHomonym: "Keine Bestätigung {{delay}}: Es wurde nichts bezahlt.",
        unidentifiedPayee:
          "Keine Bestätigung {{delay}}: Es wurde nichts bezahlt. Die Kasse wurde informiert, dass der Händler nicht identifiziert ist.",
        unconfirmed:
          "Keine Bestätigung {{delay}}: Es wurde nichts bezahlt. Die Kasse wurde informiert.",
        late: "Die Zahlung konnte nicht {{delay}} gesendet werden. Es wurde nichts bezahlt.",
        failed: "Diese Zahlung konnte nicht verarbeitet werden. Es wurde nichts bezahlt."
      }
    },
    payee: {
      quoted: "„{{name}}“",
      unnamed: "Unbekannter Name",
      node: "Knoten {{node}}",
      by: {
        address: "über seine Lightning-Adresse identifiziert",
        node: "über seinen Lightning-Knoten identifiziert"
      },
      nodeWarning:
        "Dieser Händler ist über seinen Lightning-Knoten identifiziert, nicht über seine Adresse. Wird dieser Knoten geteilt (Spark, Wallet of Satoshi, Strike…), genehmigen Sie damit auch alle seine anderen Nutzer: Auch diese würden ohne Bestätigung bezahlt, innerhalb der Limits der Karte.",
      formerName: "früher „{{name}}“",
      localName: "in Ihren Händlern: „{{name}}“",
      homonym:
        "Gleicher Name wie ein genehmigter Händler, aber ein anderes Konto: Prüfen Sie vor dem Bezahlen.",
      chip: {
        approved: "Genehmigt am {{date}}",
        approvedUndated: "Genehmigt",
        new: "Neuer Händler",
        unidentified: "Nicht identifizierter Händler",
        unchecked: "Nicht geprüft (automatischer Modus)"
      },
      declaredName: "{{name}}, vom Händler angegebener Name",
      declaredByNode: "{{name}}, vom Knoten angegebener Name"
    },
    notice: {
      title: "Kartenzahlung: {{amount}}",
      body: "{{amount}} an {{name}}",
      askTitle: "Ausstehend: Kartenzahlung",
      askBody: "{{amount}} an {{name}}. Klicken Sie zum Bestätigen, die Kasse wartet.",
      askBodyUnchecked: "{{amount}}. Klicken Sie zum Bestätigen, die Kasse wartet.",
      askBodyNoInvoice: "Klicken Sie zum Bestätigen, die Kasse wartet.",
      refusedTitle: "Abgelehnt: Kartenzahlung ({{amount}} an {{name}})",
      refusedTitleUnchecked: "Abgelehnt: Kartenzahlung ({{amount}})",
      refusedTitleNoInvoice: "Abgelehnt: Kartenzahlung",
      pausedBody: "{{card}} ist pausiert. Es wurde nichts bezahlt."
    }
  },
  cards: {
    title: "Karten",
    locked: {
      title: "Ihre Karten sind gesperrt",
      body: "Entsperren Sie die App mit Ihrem Passkey, um Ihre Karten zu sehen und zu verwalten."
    },
    pairOnPhone:
      "Um eine Karte zu koppeln, öffnen Sie die App auf Ihrem Telefon: Es programmiert die Karte, die Sie daran halten.",
    pairOnAndroid:
      "Um eine Karte zu koppeln, verwenden Sie die Android-App sattle.me: Sie programmiert die Karte, die Sie an das Telefon halten.",
    pairOnIphone:
      "Um eine Karte zu koppeln, verwenden Sie die iPhone-App sattle.me: Sie programmiert die Karte, die Sie an das Telefon halten.",
    shop: {
      order: "Karten bestellen",
      title: "Wählen Sie Ihre Karte",
      lead: "Mehrere Designs, im sattle.me-Shop zu bestellen."
    },
    loading: "Ihre Karten werden geladen…",
    failed: {
      noAccount:
        "Ihre Sitzung ist geschlossen. Entsperren Sie die App mit Ihrem Passkey und versuchen Sie es dann erneut.",
      unreachable:
        "Ihre Karten konnten nicht gelesen werden: Die Relais Ihres Kontos antworten nicht. Prüfen Sie Ihre Verbindung und versuchen Sie es dann erneut."
    },
    retry: "Erneut versuchen",
    map: {
      title: "Wo Sie mit Ihrer Karte zahlen",
      source: "Kontaktlos mit Lightning · BTC Map",
      desktopSubtitle:
        "Die Geschäfte, die kontaktlose Lightning-Zahlungen annehmen · Karte von BTC Map",
      openSite: "btcmap.org öffnen",
      loading: "Karte wird geladen…",
      failedTitle: "Die Karte wurde nicht geladen",
      failedBody:
        "BTC Map antwortet nicht, oder das Gerät ist offline. Prüfen Sie Ihre Verbindung und versuchen Sie es dann erneut.",
      openInBrowser: "btcmap.org im Browser öffnen",
      frameTitle: "BTC-Map-Karte der Geschäfte, die kontaktlose Zahlungen annehmen"
    },
    unnamed: "Karte {{id}}",
    carousel: "Ihre Karten",
    slot: "Karte {{n}} von {{count}}: {{label}}",
    add: "Karte hinzufügen",
    cardOf: "Karte {{name}}",
    order: {
      organize: "Ordnen",
      organizeA11y: "Karten ordnen",
      title: "Reihenfolge der Karten",
      lead: "Halten Sie einen Griff gedrückt und ziehen Sie. Die erste Karte erscheint beim Öffnen von „Karten“, auf all Ihren Geräten.",
      rowLead: "Ziehen Sie eine Karte an ihren Platz (oder ← →). Die erste erscheint beim Öffnen.",
      save: "Speichern",
      cancel: "Abbrechen",
      close: "Schließen",
      saved: "Reihenfolge der Karten gespeichert",
      failedTitle: "Reihenfolge nicht gespeichert",
      unsaved:
        "Die Relais Ihres Kontos haben nicht geantwortet: Prüfen Sie Ihre Verbindung und versuchen Sie es dann erneut",
      newer:
        "Sie wurde in einer neueren Version der App gewählt: Aktualisieren Sie die App, um sie zu ändern",
      moveUp: "Nach oben",
      moveDown: "Nach unten",
      moveLeft: "Nach links verschieben",
      moveRight: "Nach rechts verschieben",
      row: "{{label}}, {{n}} von {{count}}",
      moved: "{{label}}, jetzt {{n}} von {{count}}",
      previous: "Vorherige Karten",
      next: "Nächste Karten"
    },
    // "Add a card", in "Cards" and the sign-up (AddCardFlow.tsx).
    adding: {
      guide: {
        title: "Bevor Sie beginnen",
        subtitle:
          "Eine leere BoltCard. Eine Karte der früheren App wird migriert, mit ihrem Guthaben.",
        card: "Eine leere BoltCard",
        cardBody: "Eine Karte der früheren App wird migriert, mit ihrem Guthaben.",
        notifications: "Die Benachrichtigungen",
        notificationsBody:
          "Erlauben Sie sie, wenn das Telefon danach fragt: Über sie erfährt es, dass eine Kasse die Karte liest.",
        start: "Beginnen"
      },
      web: {
        note: "Ein Computer kann keine NFC-Karten lesen: Eine Karte wird in der App auf Ihrem Telefon hinzugefügt, mit der Karte in der Hand.",
        noteDevice:
          "Dieses Gerät kann keine NFC-Karten lesen: Eine Karte wird in der App auf Ihrem Telefon hinzugefügt, mit der Karte in der Hand.",
        noteAndroid:
          "Ein Browser kann keine Karte programmieren: Eine Karte wird über die Android-App sattle.me hinzugefügt, mit der Karte in der Hand.",
        noteIphone:
          "Ein Browser kann keine Karte programmieren: Eine Karte wird über die iPhone-App sattle.me hinzugefügt, mit der Karte in der Hand.",
        where: "Am Telefon",
        whereBody: "Lassen Sie die Karte bis zum Ende liegen, einige Sekunden.",
        code: "QR-Code, der „Karte hinzufügen“ in der App auf Ihrem Telefon öffnet",
        scan: "Scannen Sie diesen Code mit Ihrem Telefon: Er öffnet „Karte hinzufügen“ in der App."
      },
      steps: {
        label: "Schritte des Hinzufügens",
        notifications: "Benachrichtigungen erlaubt",
        notificationsTodo: "Erlauben der Benachrichtigungen",
        notificationsRunning: "Benachrichtigungen werden erlaubt",
        notificationsFailed: "Benachrichtigungen nicht erlaubt",
        notificationsCaption: "So erfährt Ihr Telefon, dass eine Kasse die Karte liest",
        relay: "Relais der Karte erreichbar",
        relayTodo: "Prüfung des Relais der Karte",
        relayRunning: "Relais der Karte wird geprüft",
        relayFailed: "Relais der Karte nicht geprüft",
        card: "Karte angehalten",
        cardTodo: "Anhalten der Karte",
        cardRunning: "Warten auf die Karte",
        cardFailed: "Karte nicht erkannt",
        cardIos: "Über das Telefon, bis zur Bestätigung",
        cardAndroid: "An die Rückseite des Telefons, bis es vibriert",
        programming: "Karte programmiert",
        programmingTodo: "Programmierung der Karte",
        programmingRunning: "Karte wird programmiert",
        programmingFailed: "Karte nicht programmiert",
        programmingCaption: "Bewegen Sie die Karte nicht",
        activating: "Karte aktiviert",
        activatingTodo: "Aktivierung der Karte",
        activatingRunning: "Karte wird aktiviert",
        activatingFailed: "Karte nicht aktiviert",
        activatingPending: "Aktivierung abzuschließen",
        activatingCaption: "Das Relais registriert dieses Telefon",
        prepTitle: "Vorbereitung…",
        prepSubtitle: "Zwei Prüfungen vor der Karte",
        holdIos: "Halten Sie die Karte über das Telefon",
        holdAndroid: "Halten Sie die Karte an die Rückseite des Telefons",
        holdSubtitle: "Eine leere BoltCard",
        keepTitle: "Lassen Sie die Karte liegen",
        keepSubtitle: "Programmierung für Ihre Wallet",
        almostTitle: "Fast fertig",
        almostSubtitle: "Sie können die Karte entfernen",
        doneTitle: "Karte hinzugefügt",
        doneSubtitle: "Laden Sie sie auf, um sie zu nutzen",
        failedTitle: "Das Hinzufügen ist nicht gelungen",
        failedNothing: "Auf die Karte wurde nichts geschrieben",
        failedGoesOn: "Es wird dort fortgesetzt, wo es unterbrochen wurde",
        notificationsDenied: "Benachrichtigungen abgelehnt",
        notificationsDeniedCaption:
          "Erlauben Sie sie in den Einstellungen des Telefons und versuchen Sie es dann erneut.",
        nfcUnavailable: "NFC nicht verfügbar",
        lost: "Karte zu früh entfernt",
        lostIos:
          "Halten Sie sie erneut an und lassen Sie sie liegen, bis zur Bestätigung: Das Hinzufügen wird dort fortgesetzt, wo es unterbrochen wurde.",
        lostAndroid:
          "Halten Sie sie erneut an und lassen Sie sie liegen, bis das Telefon vibriert: Das Hinzufügen wird dort fortgesetzt, wo es unterbrochen wurde.",
        relayUnreachable: "Relais nicht erreichbar",
        relayUnreachableCaption:
          "{{host}} antwortet nicht: Prüfen Sie die Verbindung dieses Telefons und versuchen Sie es erneut",
        relayIncompatible: "Relais nicht kompatibel",
        relayIncompatibleCaption:
          "{{host}} spricht nicht die erwartete Version: Aktualisieren Sie die App und versuchen Sie es erneut",
        recordsUnreachable: "Relais des Kontos nicht erreichbar",
        recordsUnreachableCaption:
          "Zu wenige Relais Ihres Kontos antworten: Prüfen Sie die Verbindung dieses Telefons und versuchen Sie es erneut",
        notBlank: "Karte nicht leer",
        notBoltCard: "Karte nicht kompatibel",
        notBoltCardCaption:
          "Diese Karte ist keine BoltCard (NTAG 424 DNA): Halten Sie eine leere BoltCard an",
        ownCard: "Karte bereits hinzugefügt",
        verifyFailed: "Prüfung fehlgeschlagen",
        cancelled: "Lesen der Karte abgebrochen",
        failed: "Das Hinzufügen ist fehlgeschlagen: Versuchen Sie es erneut",
        recharge: "Karte aufladen",
        later: "Später",
        cancel: "Abbrechen",
        stateTodo: ": ausstehend",
        stateRunning: ": läuft",
        stateDone: ": erledigt",
        stateFailed: ": fehlgeschlagen",
        stateWarning: ": zu prüfen"
      },
      migration: {
        heading: "Migration der Karte",
        foundTitle: "Swiss-Bitcoin-Pay-Karte erkannt",
        toTransfer: "Zu übertragendes Guthaben",
        reading: "Guthaben wird gelesen…",
        amountA11y: "{{amount}} Sats",
        whatLabel: "Was geschieht",
        whatTransfer: "Ihr Guthaben wird auf die Wallet der Karte übertragen, in Ihrer App.",
        whatErase:
          "Sie halten die Karte ein zweites Mal an: Sie wird gelöscht und dann für Ihre Wallet programmiert.",
        whatVisual: "Sie behält ihr Motiv und ihre Nummer.",
        confirm: "Übertragen und migrieren",
        label: "Schritte der Migration",
        transferred: "Guthaben übertragen",
        transferTodo: "Übertragung des Guthabens",
        transferRunning: "Guthaben wird übertragen",
        recognized: "Karte erkannt",
        recognizedTodo: "Erkennung der Karte",
        recognizedRunning: "Karte wird erkannt",
        recognizedFailed: "Karte nicht erkannt",
        recognizedCaption: "Ihre Wallet behält, was sie bereits übertragen hat",
        nothingCaption: "Kein Guthaben zu übertragen",
        receivedCaption: "{{amount}} erhalten",
        sendingCaption: "{{amount}} unterwegs",
        heldSecond: "Karte ein zweites Mal angehalten",
        heldSecondTodo: "Zweites Anhalten der Karte",
        heldAgain: "Karte noch einmal angehalten",
        heldAgainTodo: "Erneutes Anhalten der Karte",
        programmed: "Karte gelöscht und programmiert",
        programmedTodo: "Löschen und Programmieren der Karte",
        programmedRunning: "Karte wird gelöscht und programmiert",
        activated: "Karte aktiviert",
        doneTitle: "Karte migriert",
        doneSubtitle: "Sie bezahlt nun aus ihrer eigenen Wallet, innerhalb ihrer Limits.",
        doneSubtitleVisual:
          "Sie behält ihr Motiv und ihre Nummer und bezahlt nun aus ihrer eigenen Wallet, innerhalb ihrer Limits.",
        failedTitle: "Die Migration ist nicht gelungen",
        failedGoesOn: "Sie wird dort fortgesetzt, wo sie unterbrochen wurde",
        failed: "Die Migration ist fehlgeschlagen: Versuchen Sie es erneut",
        notTransferred: "Guthaben nicht übertragen",
        transferUnconfirmed: "Übertragung nicht bestätigt",
        lostIos:
          "Halten Sie sie erneut an und lassen Sie sie liegen, bis zur Bestätigung: Die Migration wird dort fortgesetzt, wo sie unterbrochen wurde.",
        lostAndroid:
          "Halten Sie sie erneut an und lassen Sie sie liegen, bis das Telefon vibriert: Die Migration wird dort fortgesetzt, wo sie unterbrochen wurde.",
        transferTitle: "Übertragung des Guthabens",
        transferSubtitle: "{{amount}} gehen auf die Wallet der Karte. Halten Sie die Karte bereit.",
        keepTitle: "Lassen Sie die Karte liegen",
        keepSubtitle: "Löschen und Programmieren: Bewegen Sie sie nicht.",
        almostTitle: "Fast fertig",
        almostSubtitle: "Sie können die Karte entfernen.",
        holdSecond: "Halten Sie die Karte ein zweites Mal an",
        holdAgain: "Halten Sie die Karte noch einmal an",
        holdSubtitleIos:
          "Über das Telefon, bis zur Bestätigung: Sie wird gelöscht und dann programmiert.",
        holdSubtitleAndroid:
          "An die Rückseite des Telefons, bis es vibriert: Sie wird gelöscht und dann programmiert.",
        finish: "Fertig"
      }
    },
    // "Cards", the screen.
    home: {
      firstCard: "Fügen Sie Ihre erste Karte hinzu",
      newCard: "Neue Karte",
      addLead:
        "Eine leere BoltCard bezahlt aus ihrer eigenen Self-Custody-Wallet, die Sie hier aufladen.",
      steps: {
        program: {
          title: "Programmieren",
          caption: "Halten Sie die leere Karte an Ihr Telefon: Es programmiert sie."
        },
        recharge: {
          title: "Aufladen",
          caption: "Sie hat ihre eigene Wallet: Senden Sie ihr die Sats, die sie ausgeben kann."
        },
        pay: {
          title: "Mit einer Geste bezahlen",
          caption:
            "Halten Sie sie an das Terminal eines Händlers: Sie bezahlt, innerhalb der Limits, die Sie festlegen."
        }
      },
      reading: "Guthaben wird gelesen…",
      received: "{{amount}} erhalten",
      balanceA11y: "Guthaben der Karte: {{amount}} sats",
      withdraw: "Auszahlen",
      withdrawA11y: "Von der Karte auszahlen",
      history: "Verlauf",
      rechargeA11y: "Karte aufladen",
      historyCaption: "Alle Bewegungen der Karte",
      withdrawEmpty: "Nichts auszuzahlen",
      sendCaption: "An eine andere Wallet",
      sendCaptionMain: "An eine andere Wallet oder mein Hauptguthaben",
      migratingNote:
        "Die Migration dieser Karte ist nicht abgeschlossen: Sie bezahlt noch nicht. Was sie bereits übertragen hat, liegt in ihrer Wallet, unten.",
      finishMigration: "Migration abschließen",
      finishOnPhone: "Schließen Sie sie in der App auf Ihrem Telefon ab, die Karte daran gehalten.",
      security: "Sicherheit",
      pause: "Pausieren",
      pauseCaption:
        "Sie lehnt jede Zahlung ab, ohne etwas zu vergessen. Der Schalter nimmt sie wieder in Betrieb.",
      limits: "Limits",
      payees: "Zahlungen ohne Bestätigung",
      payeesReading: "Wird gelesen…",
      payeesPending: "noch nicht auf den Relais",
      payeesUnread: "Noch nicht gelesen",
      payeesNewer: "Aktualisieren Sie die App",
      card: "Karte",
      customize: "Anpassen",
      customizeCaption: "Name und Aussehen",
      customizeIssuer: "Name · Motiv des Herausgebers",
      relay: "Relais und Programmierung",
      advanced: "Erweiterte Einstellungen",
      advancedRelayReady: "Relais bereit",
      delete: "Karte löschen",
      deleteCaption: "Sie und alle ihre Daten verschwinden aus der App",
      deleteUnread: "Zuerst muss das Guthaben der Karte gelesen werden"
    },
    // "Limits".
    limits: {
      edit: "Ändern",
      back: "Zurück zu den Limits",
      reading: "Zahlungen werden gelesen…",
      unread:
        "Die Relais Ihres Kontos haben nicht geantwortet: Was die Karte bereits bezahlt hat, wird nicht angezeigt.",
      unreadPhone:
        "Die Zahlungen dieses Telefons konnten nicht gelesen werden: Was die Karte bereits bezahlt hat, wird nicht angezeigt.",
      notePhone:
        "Nach den Zahlungen dieses Telefons. Die Zeitfenster gleiten: Jede Zahlung wird 24 h (oder 1 h) danach frei.",
      noteWeb:
        "Nach den Zahlungen der Karte, die die Relais Ihres Kontos aufbewahren. Die Zeitfenster gleiten: Jede Zahlung wird 24 h (oder 1 h) danach frei.",
      at: "um {{time}}",
      tomorrowAt: "morgen um {{time}}",
      on: "am {{date}}",
      confirm: "Mit meinem Passkey bestätigen",
      fiatHint: "Also {{fiat}} zum aktuellen Kurs · höchstens {{max}} sats",
      satsHint: "Höchstens {{max}} sats",
      countHint: "Höchstens {{max}}",
      preview: {
        reached: "Limit erreicht",
        hourLeft_one: "Noch {{count}} Zahlung",
        hourLeft_other: "Noch {{count}} Zahlungen",
        hourNext: "Nächste Zahlung möglich {{when}}"
      },
      day: {
        title: "In 24 Stunden",
        of: "von {{max}} sats",
        limit: "Limit: {{max}} sats",
        left: "Noch {{amount}} sats, also {{fiat}}",
        leftSats: "Noch {{amount}} sats",
        reached: "Limit erreicht: Die Karte lehnt jede Zahlung ab",
        release: "{{amount}} sats werden {{when}} frei",
        lead: "Eine Zahlung, die mit denen der letzten 24 Stunden dieses Limit überschreiten würde, wird abgelehnt.",
        used: "Bereits verwendet: {{amount}} sats.",
        field: "Limit in 24 Stunden",
        belowUsed:
          "Sie haben bereits {{amount}} sats verwendet: Die Karte lehnt jede Zahlung ab, bis das Zeitfenster frei wird.",
        belowPayment:
          "Unter dem Limit pro Zahlung ({{amount}} sats): Dieses 24-Stunden-Limit begrenzt jede Zahlung."
      },
      hour: {
        title: "Diese Stunde",
        of_one: "Zahlung von {{max}}",
        of_other: "Zahlungen von {{max}}",
        limit_one: "Limit: {{count}} Zahlung pro Stunde",
        limit_other: "Limit: {{count}} Zahlungen pro Stunde",
        release: "Die Zahlung von {{paid}} wird {{when}} frei",
        reached: "Limit erreicht: nächste Zahlung möglich {{when}}",
        formTitle: "Zahlungen pro Stunde",
        lead: "Eine Zahlung, die mit denen der letzten Stunde diese Anzahl überschreiten würde, wird abgelehnt.",
        used_one: "Bereits diese Stunde: {{count}} Zahlung.",
        used_other: "Bereits diese Stunde: {{count}} Zahlungen.",
        field: "Zahlungen pro Stunde",
        belowUsed_one:
          "Sie haben diese Stunde bereits {{count}} Zahlung getätigt: Die Karte lehnt jede Zahlung ab, bis das Zeitfenster frei wird.",
        belowUsed_other:
          "Sie haben diese Stunde bereits {{count}} Zahlungen getätigt: Die Karte lehnt jede Zahlung ab, bis das Zeitfenster frei wird."
      },
      payment: {
        title: "Pro Zahlung",
        caption: "Eine höhere Zahlung wird abgelehnt",
        lead: "Eine Zahlung über diesem Limit wird abgelehnt.",
        field: "Limit pro Zahlung",
        aboveDay:
          "Über dem Limit in 24 Stunden ({{amount}} sats): Das 24-Stunden-Limit begrenzt jede Zahlung."
      }
    },
    // "Customize": a card's "Name" and "Look".
    customize: {
      title: "Karte anpassen",
      name: "Name",
      clear: "Name löschen",
      taken:
        "Eine andere Ihrer Karten heißt bereits {{name}}. Ein anderer Name unterscheidet sie beim Bezahlen.",
      look: "Aussehen",
      lookKind: "Art des Aussehens",
      color: "Farbe",
      image: "Bild",
      // Read by screen readers only.
      colors: {
        ink: "Tinte",
        night: "Nacht",
        plum: "Pflaume",
        bordeaux: "Bordeaux",
        fir: "Tanne",
        lagoon: "Lagune",
        copper: "Kupfer",
        bitcoin: "Bitcoin"
      },
      choosePhoto: "Foto auswählen",
      chooseImage: "Bild auswählen",
      takePhoto: "Foto aufnehmen",
      imageNote: "Danach schneiden Sie es auf das Kartenformat zu. Es ersetzt die Farbe.",
      errors: {
        photoDenied:
          "Erlauben Sie den Zugriff auf Ihre Fotos in den Geräteeinstellungen und versuchen Sie es erneut.",
        cameraDenied:
          "Die Kamera öffnet sich nicht. Erlauben Sie sie in den Geräteeinstellungen und versuchen Sie es erneut.",
        unreadable: "Dieses Bild kann nicht verwendet werden. Wählen Sie ein anderes.",
        imageUnpublished:
          "Das Bild konnte nicht auf den Relais Ihres Kontos gespeichert werden. Prüfen Sie die Verbindung und versuchen Sie es erneut.",
        failed: "Die Karte konnte nicht geändert werden. Versuchen Sie es erneut."
      }
    },
    // "Frame the image".
    frame: {
      title: "Bild zuschneiden",
      hint: "Zum Verschieben ziehen, zum Zoomen mit zwei Fingern oder mit den Tasten.",
      hintWeb: "Ziehen Sie das Bild, um es zu verschieben; das Mausrad oder die Tasten zoomen es.",
      area: "Zuzuschneidendes Bild",
      zoomValue: "Zoom {{zoom}}",
      zoomIn: "Vergrößern",
      zoomOut: "Verkleinern",
      moveLeft: "Bild nach links verschieben",
      moveRight: "Bild nach rechts verschieben",
      moveUp: "Bild nach oben verschieben",
      moveDown: "Bild nach unten verschieben",
      use: "Dieses Bild verwenden"
    },
    status: {
      active: "Aktiv",
      suspended: "Pausiert",
      migrating: "Migration offen"
    },
    sync: {
      ready: "Bereit",
      noPush: "Ohne Mitteilungen",
      unreachable: "Relais nicht erreichbar",
      refused: "Relais-Fehler"
    },
    onPhone: {
      label: "Auf Ihrem Telefon",
      openApp: "Öffnen Sie sattle.me auf Ihrem Telefon",
      openAppScan: "Oder scannen Sie diesen Code damit: Er öffnet „Karten“ in der App.",
      hold: "Halten Sie die Karte an das Telefon",
      code: "QR-Code, der „Karten“ in der App auf Ihrem Telefon öffnet"
    },
    relay: {
      checking: "Karte wird geprüft…",
      readyTitle: "Die Karte ist bereit",
      readyBody:
        "Ihr Relais, {{host}}, weckt dieses Telefon bei jeder Zahlung. Es hält weder Schlüssel noch Guthaben.",
      stateTitle: "Zustand der Karte",
      reachable: "Relais erreichbar",
      defaultCaption: "{{host}}, Standardrelais",
      programmed: "Karte für dieses Relais programmiert",
      programmedCaption: "Ihre nächsten Taps werden dort erwartet",
      notWoken: "Dieses Telefon wird nicht geweckt",
      notWokenCaption:
        "Mitteilungen deaktiviert: Die Karte bezahlt nur, solange die App auf diesem Telefon geöffnet ist.",
      noTokenCaption:
        "Dieses Telefon empfängt keine Zahlungsmitteilungen: Die Karte bezahlt nur, solange die App auf diesem Telefon geöffnet ist.",
      enableNotifications: "Mitteilungen aktivieren",
      unreachable: "Relais nicht erreichbar",
      unreachableCaption:
        "{{host}} hat diesem Telefon nicht geantwortet: Die Karte kann nicht bezahlen, solange es nicht antwortet.",
      refused: "Relais meldet einen Fehler",
      refusedCaption:
        "{{host}} hat den Kanal der Karte abgelehnt: Sie kann nicht bezahlen, solange es ihn ablehnt.",
      uncheckedTitle: "Zustand nicht geprüft",
      uncheckedCaption:
        "Der Zustand der Karte konnte auf diesem Telefon nicht gelesen werden. Versuchen Sie es gleich noch einmal.",
      change: "Relais wechseln",
      changeCaption: "Für ein Relais, das Sie selbst betreiben",
      sourceLink: "sattleme/relay auf github.com",
      webCaption:
        "Es weckt Ihr Telefon bei jeder Zahlung der Karte, ohne Schlüssel oder Guthaben zu halten.",
      webNote:
        "Ein Computer kann keine NFC-Karten lesen: Die Karte wird in der App auf einem Telefon programmiert.",
      webNoteAndroid:
        "Ein Browser kann keine Karte programmieren: Sie wird über die Android-App sattle.me programmiert.",
      webNoteIphone:
        "Ein Browser kann keine Karte programmieren: Sie wird über die iPhone-App sattle.me programmiert.",
      deviceNote:
        "Dieses Gerät kann keine NFC-Karten lesen: Die Karte wird in der App auf einem Telefon programmiert.",
      webOnPhone: "Auf dem Telefon",
      webStepsTitle: "Auf Ihrem Telefon, mit der Karte in der Hand",
      webHoldCaption: "Wenn die App danach fragt, bis zum Ende der Schritte.",
      defaultLink: "Standardrelais",
      fieldInvalid: "Vollständige Adresse eingeben",
      fieldLong: "Adresse mit höchstens {{max}} Zeichen eingeben",
      fieldUnreachable: "Relais nicht erreichbar: Adresse prüfen",
      fieldIncompatible: "Relais mit dieser Karte nicht kompatibel",
      moved: "Die Karte läuft jetzt über {{host}}",
      steps: {
        label: "Schritte des Relaiswechsels",
        relay: "Neues Relais erreichbar",
        relayTodo: "Prüfung des neuen Relais",
        relayRunning: "Neues Relais wird geprüft",
        relayFailed: "Neues Relais nicht geprüft",
        relayCaption: "{{host}}, erwartete Version",
        card: "Karte angehalten",
        cardTodo: "Anhalten der Karte",
        cardRunning: "Warten auf die Karte",
        cardFailed: "Karte nicht erkannt",
        cardAndroid: "An die Rückseite des Telefons, bis es vibriert",
        cardIos: "Über das Telefon, bis zur Bestätigung",
        programming: "Für dieses Relais programmiert",
        programmingTodo: "Programmierung für dieses Relais",
        programmingRunning: "Wird für dieses Relais programmiert",
        programmingFailed: "Nicht für dieses Relais programmiert",
        programmingCaption: "Bewegen Sie die Karte nicht",
        former: "Bisheriges Relais vergessen",
        formerTodo: "Vergessen des bisherigen Relais",
        formerRunning: "Bisheriges Relais wird vergessen",
        formerFailed: "Bisheriges Relais nicht vergessen",
        formerCaption: "{{relay}} empfängt ihre Taps nicht mehr",
        formerDown: "Bisheriges Relais nicht erreichbar",
        formerDownCaption: "{{relay}} hat nicht geantwortet: Ihr Kanal bleibt dort, ohne Wirkung",
        formerRefused: "Bisheriges Relais mit Fehler",
        formerRefusedCaption:
          "{{relay}} hat das Löschen ihres Kanals abgelehnt: Er bleibt dort, ohne Wirkung",
        formerUnknown: "Bisheriges Relais prüfen",
        formerUnknownCaption:
          "{{relay}} hat geantwortet, ohne es zu bestätigen: Ihr Kanal ist dort vielleicht geblieben, ohne Wirkung",
        lost: "Karte zu früh entfernt",
        lostAndroid:
          "Halten Sie sie erneut an und lassen Sie sie liegen, bis das Telefon vibriert: Der Wechsel wird dort fortgesetzt, wo er unterbrochen wurde.",
        lostIos:
          "Halten Sie sie erneut an und lassen Sie sie liegen, bis zur Bestätigung: Der Wechsel wird dort fortgesetzt, wo er unterbrochen wurde.",
        holdAndroid: "Halten Sie {{name}} an die Rückseite des Telefons",
        holdIos: "Halten Sie {{name}} über das Telefon",
        holdSubtitle: "Sie wird über {{host}} laufen",
        keepTitle: "Lassen Sie die Karte liegen",
        keepSubtitle: "Programmierung für das neue Relais",
        almostTitle: "Fast fertig",
        almostSubtitle: "Sie können die Karte entfernen",
        doneTitle: "Die Karte läuft über {{host}}",
        doneSubtitle: "Sie behält ihren Namen, ihr Guthaben und ihre Einstellungen",
        failedTitle: "Der Wechsel ist nicht gelungen",
        failedNothing: "Auf diese Karte wurde nichts geschrieben",
        failedGoesOn: "Er wird dort fortgesetzt, wo er unterbrochen wurde",
        checkingTitle: "Neues Relais wird geprüft",
        relayUnreachable:
          "{{host}} antwortet nicht: Prüfen Sie die Verbindung dieses Telefons und versuchen Sie es erneut",
        relayIncompatible: "{{host}} spricht nicht die erwartete Version",
        recordsUnreachable:
          "Zu wenige Relais Ihres Kontos antworten: Prüfen Sie die Verbindung dieses Telefons und versuchen Sie es erneut",
        cancelled: "Lesen der Karte abgebrochen",
        failed: "Der Wechsel ist fehlgeschlagen: Versuchen Sie es erneut",
        resetNotice:
          "Solange der Wechsel nicht abgeschlossen ist, bezahlt die Karte nicht mehr und erscheint nicht mehr unter „Karten“. Mit „Karte hinzufügen“ kehrt sie mit ihrem Guthaben, ihrem Namen und ihren Limits auf das Standardrelais zurück.",
        finish: "Fertig",
        cancel: "Abbrechen",
        stateTodo: ": ausstehend",
        stateRunning: ": läuft",
        stateDone: ": erledigt",
        stateFailed: ": fehlgeschlagen",
        stateWarning: ": zu prüfen"
      }
    },
    history: {
      title: "Verlauf",
      subtitle: "Karte {{name}}",
      reading: "Verlauf wird gelesen…",
      failed:
        "Die Relais Ihres Kontos haben nicht geantwortet: Der Verlauf kann nicht angezeigt werden.",
      legacyUnread:
        "Nicht alle Relais Ihres Kontos haben geantwortet: Ältere Bewegungen der Karte können fehlen.",
      ownOnly:
        "Die Relais Ihres Kontos haben nicht geantwortet: Zahlungen Ihrer anderen Telefone können fehlen.",
      walletFailed:
        "Die Wallet der Karte konnte nicht gelesen werden: Ihre letzten Aufladungen und Auszahlungen können fehlen.",
      newer: "Einige Bewegungen zeigt nur eine neuere Version der App an.",
      empty: "Keine Bewegung für diese Karte.",
      pendingGroup: "In Bearbeitung",
      deposit: "Bitcoin-Einzahlung",
      depositConfirming: "Erhalten · wartet auf Bestätigung",
      depositClaiming: "Bestätigt · wird dem Guthaben gutgeschrieben",
      depositFees: "Wartet auf niedrigere Gebühren: {{asked}} verlangt, höchstens {{max}}",
      depositFeesUnknown: "Wartet auf niedrigere Gebühren: höchstens {{max}} sats",
      at: "{{time}} · {{what}}",
      paid: "Bezahlt",
      refused: "Abgelehnt: {{reason}}",
      refusedPlain: "Abgelehnt",
      failedRow: "Fehlgeschlagen: nichts gesendet",
      uncertain: "Unsicher: vielleicht gesendet",
      sending: "Wird gesendet",
      noName: "Kartenzahlung",
      recharge: "Aufladung",
      recovered: "Zurückgeholte Gelder",
      return: "Auszahlung",
      toMain: "Auf mein Hauptguthaben",
      ways: {
        main: "Von meinem Hauptguthaben",
        invoice: "Lightning-Rechnung",
        address: "Lightning-Adresse",
        onchain: "Bitcoin-Adresse",
        onchainFee: "Bitcoin-Adresse, Gebühr {{fee}}",
        lnurl: "LNURL-Link",
        spark: "Spark-Adresse"
      },
      means: {
        main: "Mein Hauptguthaben",
        invoice: "Lightning-Rechnung",
        address: "Lightning-Adresse",
        onchain: "Bitcoin-Adresse",
        lnurl: "LNURL-Link",
        spark: "Spark-Adresse"
      },
      showMonth: "{{month}} anzeigen",
      showMonthAll: "{{month}} vollständig anzeigen",
      monthFailed:
        "Dieser Monat konnte nicht gelesen werden: Die Relais Ihres Kontos haben nicht geantwortet.",
      monthIncomplete: "Ein Teil der angezeigten Monate konnte nicht gelesen werden.",
      legacy: {
        pinNeeded:
          "Der Verlauf dieser Karte bei Swiss Bitcoin Pay ist durch die PIN geschützt, die Sie ihr gegeben haben. Geben Sie sie ein, um ihn hier hinzuzufügen.",
        open: "Verlauf abrufen",
        failed: "Der Verlauf dieser Karte bei Swiss Bitcoin Pay konnte nicht abgerufen werden.",
        title: "Verlauf bei Swiss Bitcoin Pay",
        lead: "Geben Sie die PIN ein, die Sie dieser Karte bei Swiss Bitcoin Pay gegeben haben: Ihr Verlauf wird dem der Karte hinzugefügt.",
        pin: "PIN",
        submit: "Abrufen",
        note: "Sie dient nur einmal, um den Verlauf der Karte bei Swiss Bitcoin Pay zu lesen: sattle.me speichert sie nicht.",
        errors: {
          pinInvalid: "Falsche PIN",
          pinLocked:
            "Zu viele Versuche: Swiss Bitcoin Pay lehnt diese PIN eine Weile ab. Versuchen Sie es später erneut.",
          failed:
            "Der Verlauf konnte nicht abgerufen werden. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut."
        }
      },
      reasons: {
        declined: "auf dem Telefon nicht bestätigt",
        newPayee: "neuer Händler, nicht bestätigt",
        unidentifiedPayee: "nicht identifizierter Händler, nicht bestätigt",
        unconfirmed: "nicht rechtzeitig bestätigt",
        insufficientBalance: "Kartenguthaben zu niedrig",
        invalidInvoice: "ungültige Rechnung",
        expired: "Rechnung abgelaufen",
        noAmount: "Rechnung ohne Betrag",
        alreadyPaid: "Rechnung bereits bezahlt",
        outOfBounds: "Betrag außerhalb der Grenzen",
        aboveLimit: "über dem Limit pro Zahlung",
        dayLimit: "24-Stunden-Limit erreicht",
        hourLimit: "zu viele Zahlungen in dieser Stunde",
        suspended: "Karte pausiert",
        invalidTap: "ungültiges Lesen der Karte",
        failed: "Zahlung fehlgeschlagen",
        superseded: "durch ein anderes Lesen ersetzt",
        unavailable: "Zahlung nicht verarbeitet"
      },
      motives: {
        declined: "Auf dem Telefon nicht bestätigt",
        newPayee: "Neuer Händler, nicht rechtzeitig bestätigt",
        unidentifiedPayee: "Nicht identifizierter Händler, nicht rechtzeitig bestätigt",
        unconfirmed: "Nicht rechtzeitig bestätigt",
        insufficientBalance: "Kartenguthaben zu niedrig",
        invalidInvoice: "Ungültige Rechnung",
        expired: "Rechnung abgelaufen",
        noAmount: "Rechnung ohne Betrag",
        alreadyPaid: "Rechnung bereits bezahlt",
        outOfBounds: "Betrag außerhalb der Grenzen",
        aboveLimit: "Über dem Limit pro Zahlung",
        dayLimit: "24-Stunden-Limit erreicht",
        hourLimit: "Zu viele Zahlungen in dieser Stunde",
        suspended: "Karte pausiert",
        invalidTap: "Ungültiges Lesen der Karte",
        failed: "Die Wallet der Karte hat sie nicht gesendet",
        superseded: "Durch ein anderes Lesen der Karte ersetzt",
        unavailable: "Die Zahlung konnte nicht verarbeitet werden"
      },
      detail: {
        payment: "Zahlung",
        refused: "Abgelehnte Zahlung",
        failed: "Fehlgeschlagene Zahlung",
        paid: "Bezahlt",
        paidWith: "Bezahlt · {{payee}}",
        merchant: "Händler",
        payee: {
          approved: "genehmigter Händler",
          new: "neuer Händler",
          unidentified: "nicht identifizierter Händler",
          unchecked: "nicht geprüft (automatischer Modus)"
        },
        refusedPill: "Abgelehnt · nichts gesendet",
        failedPill: "Fehlgeschlagen · nichts gesendet",
        uncertainPill: "Unsicher · vielleicht gesendet",
        sendingPill: "Wird gesendet",
        refusedMotive: "Abgelehnt",
        failedMotive: "Die Wallet der Karte hat sie nicht gesendet",
        date: "Datum",
        value: "Wert",
        valueThen: "Zum Zeitpunkt der Transaktion: {{fiat}}",
        valueNow: "Jetzt: {{fiat}}",
        valueNowReading: "Jetzt: Kurs wird gelesen",
        valueNowUnknown: "Jetzt: Kurs nicht verfügbar",
        note: "Notiz",
        motive: "Grund",
        fees: "Gebühr",
        noFee: "Keine",
        feeDeducted: "{{fee}}, abgezogen",
        way: "Zahlungsart",
        to: "An",
        mainBalance: "Mein Hauptguthaben",
        received: "Erhalten",
        description: "Beschreibung",
        transaction: "Transaktion",
        copyTx: "Transaktions-ID kopieren",
        txCopied: "Transaktions-ID kopiert",
        openTx: "Transaktion auf {{explorer}} ansehen",
        approve: "Diesen Händler genehmigen",
        approveNote:
          "Ihr Passkey wird verlangt. Seine nächsten Zahlungen gehen ohne Bestätigung durch, innerhalb der Limits der Karte.",
        approved: "Händler für diese Karte genehmigt",
        approvedNote:
          "Händler genehmigt: Seine nächsten Zahlungen gehen ohne Bestätigung durch, innerhalb der Limits der Karte.",
        approveFailed: "Der Händler konnte nicht genehmigt werden. Versuchen Sie es erneut.",
        homonym:
          "Gleicher Name wie ein genehmigter Händler, aber ein anderes Konto: Er kann nur genehmigt werden, wenn Sie eine Zahlung bei ihm bestätigen, nach einer Prüfung vor Ort."
      }
    },
    sheet: {
      close: "Schließen",
      nameInvalid: "Eine Zeile mit höchstens {{max}} Zeichen.",
      save: "Speichern",
      ceilingInvalid: "Eine ganze Zahl von sats, von 1 bis {{max}}.",
      hourInvalid: "Eine ganze Zahl, von 1 bis {{max}}.",
      relayHint:
        "Das Relais weckt Ihr Telefon, wenn eine Kasse die Karte liest; es hält weder Schlüssel noch Guthaben. Die Karte wird neu programmiert: Halten Sie sie bereit.",
      relayField: "Adresse des Relais",
      relayPlaceholder: "relais.example.com",
      program: "Karte programmieren",
      back: "Zurück",
      done: "Fertig",
      failedTitle: "Der Vorgang ist nicht gelungen",
      changeFailed: "Die Änderung konnte nicht gespeichert werden. Versuchen Sie es erneut.",
      nfcSuccess: "Karte bereit",
      nfcFailure: "Vorgang unterbrochen"
    },
    delete: {
      card: {
        drainBody:
          "Sie enthält noch <strong>{{amount}}</strong>. Leeren Sie sie an eine Lightning-, Bitcoin- oder Spark-Adresse, bevor Sie sie löschen.",
        drainBodyArriving:
          "Sie enthält noch <strong>{{amount}}</strong>, und <strong>{{arriving}}</strong> kommen auf einer Bitcoin-Adresse an. Leeren Sie sie, dann erneut, sobald diese <strong>{{arriving}}</strong> gutgeschrieben sind.",
        drainBodyArrivingOnly:
          "<strong>{{arriving}}</strong> kommen auf einer Bitcoin-Adresse dieser Karte an. Leeren Sie sie, sobald diese Sats gutgeschrieben sind, bevor Sie sie löschen."
      },
      drainTitle: "Leeren Sie zuerst <accent>{{name}}</accent>",
      drainBody:
        "Sie enthält noch <strong>{{amount}}</strong>. Zahlen Sie sie auf Ihr Hauptguthaben aus, bevor Sie sie löschen.",
      drainBodyArriving:
        "Sie enthält noch <strong>{{amount}}</strong>, und <strong>{{arriving}}</strong> sind an eine Bitcoin-Adresse unterwegs. Zahlen Sie ihr Guthaben auf Ihr Hauptguthaben aus, dann diese <strong>{{arriving}}</strong>, sobald sie gutgeschrieben sind.",
      drainBodyArrivingOnly:
        "<strong>{{arriving}}</strong> sind an eine Bitcoin-Adresse dieser Karte unterwegs. Zahlen Sie sie auf Ihr Hauptguthaben aus, sobald sie gutgeschrieben sind, bevor Sie die Karte löschen.",
      drainConfirm: "Auszahlen",
      title: "{{name}} löschen",
      gone: "Für immer gelöscht",
      goneSettings: "Ihr Name und ihre Einstellungen, genehmigte Händler inbegriffen",
      goneHistory: "Ihr Verlauf",
      goneAddress: "Ihre Lightning-Adresse",
      inHand: "Ich habe die Karte dabei",
      inHandCaption: "An das Telefon gehalten, wird sie wieder leer",
      confirm: "Karte löschen",
      withoutTitle: "{{name}} ohne die Karte löschen?",
      withoutBody:
        "Ihre Daten werden gelöscht, und sie kann nie wieder bezahlen. Wenn Sie sie wiederfinden, macht „Karte hinzufügen“ sie wieder leer.",
      withoutConfirm: "Löschen",
      cardLabel: "Die Karte",
      withCard: "Ich habe sie dabei",
      withCardCaption: "Sie wird wieder leer",
      withoutCard: "Ich habe sie nicht",
      withoutCardCaption: "Sie wird nie wieder bezahlen",
      withoutNote:
        "Wenn Sie sie wiederfinden, macht „Karte hinzufügen“ in der App auf Ihrem Telefon sie wieder leer.",
      webUnder: "„{{inHand}}“ bleibt angehakt.",
      webHoldCaption: "Wenn die App danach fragt.",
      understood: "Verstanden",
      deleting: "Wird gelöscht…",
      failedTitle: "Das Löschen ist nicht gelungen",
      failedBody:
        "Versuchen Sie es erneut; falls das Problem bleibt, kontaktieren Sie den Support.",
      done: "{{name}} ist gelöscht",
      pendingCaption:
        "Die Relais Ihres Kontos haben ihr Löschen noch nicht gespeichert: Es wird bei der nächsten Synchronisierung abgeschlossen",
      steps: {
        screen: "Karte löschen",
        label: "Schritte des Löschens",
        prepTitle: "Vorbereitung…",
        prepSubtitle: "Guthaben der Karte wird geprüft",
        holdAndroid: "Halten Sie {{name}} an die Rückseite des Telefons",
        holdIos: "Halten Sie {{name}} über das Telefon",
        holdSubtitle: "Sie wird wieder leer, dann werden ihre Daten gelöscht",
        keepTitle: "Lassen Sie die Karte liegen",
        keepSubtitle: "Sie wird wieder leer",
        almostTitle: "Fast fertig",
        almostSubtitle: "Sie können die Karte entfernen",
        doneSubtitle:
          "Die Karte ist leer: Geben Sie sie weiter, oder fügen Sie sie als neue Karte hinzu",
        notThisTitle: "Das ist nicht {{name}}",
        notThisSubtitle: "An der angehaltenen Karte wurde nichts verändert",
        notThisCaption:
          "Oder sie wurde anderswo neu programmiert. Es wurde nichts verändert: Halten Sie die richtige Karte an.",
        failedNothing: "An der Karte wurde nichts verändert",
        failedGoesOn: "Sie bezahlt schon nicht mehr: „Erneut versuchen“ schließt das Löschen ab",
        emptied: "Guthaben ausgezahlt",
        emptiedTodo: "Prüfung des Guthabens",
        emptiedRunning: "Guthaben wird geprüft",
        emptiedFailed: "Guthaben nicht ausgezahlt",
        emptiedCaption: "Die Karte ist leer",
        unchecked: "Guthaben nicht geprüft",
        uncheckedCaption:
          "Ihr Löschen war bereits gespeichert: Seitdem eingegangene Sats bleiben unter „Karten“ sichtbar",
        held: "Karte angehalten",
        heldTodo: "Anhalten der Karte",
        heldRunning: "Warten auf die Karte",
        heldFailed: "Karte nicht erkannt",
        heldAndroid: "An die Rückseite des Telefons, bis es vibriert",
        heldIos: "Über das Telefon, bis zur Bestätigung",
        blank: "Karte geleert",
        blankTodo: "Leeren der Karte",
        blankRunning: "Karte wird geleert",
        blankFailed: "Karte nicht geleert",
        blankCaption: "Bewegen Sie die Karte nicht",
        erased: "Daten gelöscht",
        erasedTodo: "Löschen der Daten",
        erasedRunning: "Daten werden gelöscht",
        erasedFailed: "Daten nicht gelöscht",
        erasedCaption: "Ihr Name, ihre Einstellungen, ihr Verlauf, ihre Lightning-Adresse",
        erasedLater: "Löschen abzuschließen",
        erasedLaterCaption:
          "Nicht alle Relais Ihres Kontos haben geantwortet: Das Löschen wird bei der nächsten Synchronisierung fortgesetzt",
        lost: "Karte zu früh entfernt",
        lostAndroid:
          "Halten Sie sie erneut an und lassen Sie sie liegen, bis das Telefon vibriert: Das Löschen wird dort fortgesetzt, wo es unterbrochen wurde.",
        lostIos:
          "Halten Sie sie erneut an und lassen Sie sie liegen, bis zur Bestätigung: Das Löschen wird dort fortgesetzt, wo es unterbrochen wurde.",
        cancelled: "Lesen der Karte abgebrochen",
        failed: "Das Löschen ist fehlgeschlagen: Versuchen Sie es erneut",
        noCard: "Ich habe die Karte nicht",
        finish: "Fertig",
        cancel: "Abbrechen",
        stateTodo: ": ausstehend",
        stateRunning: ": läuft",
        stateDone: ": erledigt",
        stateFailed: ": fehlgeschlagen",
        stateWarning: ": zu prüfen"
      }
    },
    drain: {
      intro:
        "Das gesamte Guthaben der Karte geht an eine Lightning-, Bitcoin- oder Spark-Adresse: Geben Sie sie ein, fügen Sie sie ein oder scannen Sie sie. Die Gebühren werden von diesem Guthaben abgezogen.",
      introNoScan:
        "Das gesamte Guthaben der Karte geht an eine Lightning-, Bitcoin- oder Spark-Adresse: Geben Sie sie ein oder fügen Sie sie ein. Die Gebühren werden von diesem Guthaben abgezogen.",
      placeholder: "Lightning-, Bitcoin- oder Spark-Adresse",
      invoice: "Verwenden Sie eine Lightning-, Bitcoin- oder Spark-Adresse",
      total: "Guthaben der Karte",
      received: "Erhält der Empfänger",
      feesAbove: "Die Gebühren übersteigen bei dieser Geschwindigkeit das Guthaben der Karte",
      empty: "Diese Karte enthält nichts zum Auszahlen.",
      quoteFailed:
        "Das Leeren konnte nicht vorbereitet werden. Prüfen Sie den Empfänger und Ihre Internetverbindung und versuchen Sie es erneut.",
      done: "{{amount}} ausgezahlt: Die Karte ist leer.",
      pending: "Auszahlung von {{amount}} unterwegs: Sie kommt an, sobald sie abgeschlossen ist.",
      failed:
        "Die Auszahlung ist nicht durchgegangen. Prüfen Sie das Guthaben der Karte und versuchen Sie es erneut."
    },
    modifiedPhone: {
      title: "Dieses Telefon ist weniger sicher",
      body: "Es scheint verändert worden zu sein (zum Beispiel „gerootet“). Damit diese Karte ohne Ihre Bestätigung zahlen kann, bewahrt die App auf diesem Telefon auf, was sie dafür braucht: Eine schädliche App könnte damit ihr Guthaben ausgeben. Lassen Sie wenig Sats auf dieser Karte oder wählen Sie „Immer bestätigen“."
    },
    erasedFunds: {
      card: {
        body: "{{amount}} sind nach dem Löschen auf ihrer Wallet eingegangen. Leeren Sie sie an eine Lightning-, Bitcoin- oder Spark-Adresse.",
        bodyArriving:
          "{{amount}} sind nach dem Löschen auf ihrer Wallet eingegangen, und {{arriving}} kommen noch auf ihrer Bitcoin-Adresse an. Leeren Sie sie an eine Lightning-, Bitcoin- oder Spark-Adresse.",
        arrivingOnly:
          "{{arriving}} kommen auf der Bitcoin-Adresse einer gelöschten Karte an. Sie können sie auszahlen, sobald sie gutgeschrieben sind.",
        stoppedBody:
          "Sie kehrt mit ihrem Guthaben unter „Karten“ zurück, wenn Sie sie erneut hinzufügen. {{amount}} bleiben auf ihrer Wallet: Ohne die Karte leeren Sie sie an eine Lightning-, Bitcoin- oder Spark-Adresse.",
        stoppedBodyArriving:
          "Sie kehrt mit ihrem Guthaben unter „Karten“ zurück, wenn Sie sie erneut hinzufügen. {{amount}} bleiben auf ihrer Wallet, und {{arriving}} kommen noch auf ihrer Bitcoin-Adresse an: Ohne die Karte leeren Sie sie an eine Lightning-, Bitcoin- oder Spark-Adresse."
      },
      title: "Sats sind auf einer gelöschten Karte eingegangen",
      titleArriving: "Sats sind an eine gelöschte Karte unterwegs",
      body: "{{amount}} sind nach dem Löschen auf ihrer Wallet eingegangen. Zahlen Sie sie auf Ihr Hauptguthaben aus.",
      bodyArriving:
        "{{amount}} sind nach dem Löschen auf ihrer Wallet eingegangen, und {{arriving}} sind noch an ihre Bitcoin-Adresse unterwegs. Zahlen Sie sie auf Ihr Hauptguthaben aus.",
      arrivingOnly:
        "{{arriving}} sind an die Bitcoin-Adresse einer gelöschten Karte unterwegs. Sie können sie auf Ihr Hauptguthaben auszahlen, sobald sie gutgeschrieben sind.",
      returned: "{{amount}} auf Ihr Hauptguthaben ausgezahlt",
      returnPending:
        "Auszahlung von {{amount}} gesendet: Sie wird Ihrem Hauptguthaben gutgeschrieben, sobald sie abgeschlossen ist",
      failed:
        "Die Auszahlung ist nicht durchgegangen. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      stoppedTitle: "{{card}}: Neuprogrammierung abgebrochen",
      stoppedBody:
        "Sie erscheint wieder unter „Karten“, mit ihrem Guthaben, sobald Sie sie erneut hinzufügen. {{amount}} bleiben auf ihrer Wallet: Ohne die Karte zahlen Sie sie auf Ihr Hauptguthaben aus.",
      stoppedBodyArriving:
        "Sie erscheint wieder unter „Karten“, mit ihrem Guthaben, sobald Sie sie erneut hinzufügen. {{amount}} bleiben auf ihrer Wallet, und {{arriving}} sind noch an ihre Bitcoin-Adresse unterwegs: Ohne die Karte zahlen Sie sie auf Ihr Hauptguthaben aus."
    },
    wallet: {
      balance: "Guthaben",
      pendingDeposit: "{{amount}} auf einer Bitcoin-Adresse erhalten, noch nicht gutgeschrieben",
      failed:
        "Die Wallet dieser Karte konnte nicht gelesen werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      recharge: "Aufladen",
      return: "Auf mein Hauptguthaben auszahlen",
      rechargeCard: "<accent>{{name}}</accent> aufladen",
      amountField: "Betrag",
      rechargeAmount: "{{amount}} aufladen",
      returnAmount: "{{amount}} auszahlen",
      copyInvoice: "Rechnung kopieren",
      copyAddress: "Adresse kopieren",
      onchainOpenHere:
        "Die Gutschrift erfolgt, wenn die Karte unter „Karten“ geöffnet ist, hier oder auf Ihrem Telefon.",
      fromMain: "Von meinem Hauptguthaben",
      invoice: "Lightning-Rechnung",
      onchain: "Bitcoin-Adresse",
      continue: "Weiter",
      invoiceCreate: "Rechnung erstellen",
      invoiceDescription: "Aufladung der Karte",
      noFee: "Keine",
      working: "Überweisung läuft…",
      recharged: "Karte mit {{amount}} aufgeladen.",
      returned: "{{amount}} auf Ihr Hauptguthaben ausgezahlt.",
      rechargePending:
        "Aufladung von {{amount}} gesendet: Sie wird dem Guthaben der Karte gutgeschrieben, sobald sie abgeschlossen ist.",
      returnPending:
        "Auszahlung von {{amount}} gesendet: Sie wird Ihrem Hauptguthaben gutgeschrieben, sobald sie abgeschlossen ist.",
      nothingToReturn: "Diese Karte enthält nichts zum Auszahlen.",
      prepareFailed:
        "Die Überweisung konnte nicht vorbereitet werden: Es wurde nichts gesendet. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      transferFailed:
        "Die Überweisung ist nicht durchgegangen. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut: Sie wird nur einmal gesendet.",
      transferRefused:
        "Die Überweisung ist fehlgeschlagen. Prüfen Sie die Guthaben, bevor Sie es erneut versuchen.",
      receiveFailed:
        "Die Adresse oder Rechnung konnte nicht erstellt werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      invoiceHint: "Einmal bezahlbar, von jeder Lightning-Wallet, bis {{date}}.",
      readingMain: "Ihr Hauptguthaben wird gelesen…",
      otherWallet: "Andere Wallet",
      confirmRecharge: "Aufladung bestätigen",
      mainAvailable: "{{amount}} verfügbar",
      change: "Ändern",
      mainShort: "Ihr Hauptguthaben deckt diesen Betrag nicht",
      mainUnread:
        "Ihr Hauptguthaben konnte nicht gelesen werden. Versuchen Sie es gleich noch einmal.",
      unit: "Einheit",
      addressNote:
        "Die dauerhafte Lightning-Adresse der Karte: Teilen Sie sie, der gesendete Betrag wird dem Guthaben der Karte gutgeschrieben.",
      orAnyWallet: "oder von einer beliebigen Wallet",
      share: "Teilen",
      invoiceWaiting: "Warten auf die Zahlung…",
      invoicePaid: "Rechnung bezahlt",
      invoiceAdded: "dem Guthaben der Karte gutgeschrieben",
      finish: "Fertig",
      invoiceExpired: "Rechnung abgelaufen",
      invoiceExpiredNote:
        "Sie wurde nicht vor dem {{date}} bezahlt: Niemand kann sie mehr bezahlen.",
      newInvoice: "Neue Rechnung",
      onchainConfirmations:
        "Was Sie dorthin senden, wird dem Guthaben der Karte nach 1 bis 3 Bestätigungen gutgeschrieben, innerhalb von etwa dreißig Minuten.",
      onchainFee:
        "Gebühr: höchstens {{fee}}, abgezogen. Verlangt das Netzwerk mehr, wartet die Gutschrift.",
      onchainOpen: "Die Gutschrift erfolgt, wenn Sie die Karte unter „Karten“ öffnen.",
      toMain: "Auf mein Hauptguthaben",
      fromCard: "Von der Karte {{name}} · {{amount}}",
      cardHoldsOnly: "Die Karte enthält nur {{amount}}",
      allOf: "Das ganze Guthaben der Karte · {{fiat}}",
      wholeBalance: "Das ganze Guthaben der Karte",
      partOf: "{{fiat}} · {{left}} bleiben auf der Karte",
      partOfSats: "{{left}} bleiben auf der Karte",
      emptyCard: "Karte leeren",
      rowFrom: "Von",
      rowTo: "An",
      rowFee: "Gebühr",
      rowAfter: "Guthaben der Karte danach",
      mainBalance: "Mein Hauptguthaben",
      confirmPasskey: "Mit meinem Passkey bestätigen",
      copy: "Kopieren",
      copied: "Kopiert",
      copyFailed: "Kopieren fehlgeschlagen"
    },
    payees: {
      approved: "Für diese Karte genehmigt",
      approvedCount: "$t(cards.payees.approved) · {{count}}",
      changeMode: "Modus ändern",
      modeBox: {
        automatic: {
          title: "Modus: automatisch",
          caption: "Jeder gültige Tap wird bezahlt, innerhalb der Limits"
        },
        approved: {
          title: "Modus: genehmigte Händler",
          caption: "Anderswo fragt Ihr Telefon nach Ihrer Bestätigung"
        },
        confirm: {
          title: "Modus: immer bestätigen",
          caption: "Jede Zahlung wartet auf Ihre Bestätigung"
        }
      },
      changeLabel: "Bestätigungsmodus von {{name}} ändern",
      approveNote:
        "Um einen hinzuzufügen, kreuzen Sie „$t(card.payment.approve)“ an, wenn Sie bei ihm eine Zahlung bestätigen.",
      removeLabel: "{{name}} aus den genehmigten Händlern entfernen",
      payments_one: "{{count}} Zahlung",
      payments_other: "{{count}} Zahlungen",
      paymentsRecent_one: "{{count}} Zahlung in 90 Tagen",
      paymentsRecent_other: "{{count}} Zahlungen in 90 Tagen",
      itsName: "Sein Name",
      itsNode: "Sein Knoten",
      nodeNote:
        "Über seinen Lightning-Knoten genehmigt: Wird dieser Knoten geteilt (Spark, Wallet of Satoshi, Strike…), werden auch alle seine anderen Nutzer ohne Bestätigung bezahlt, innerhalb der Limits der Karte.",
      approvedAs: "Genehmigt unter dem Namen",
      approvedOnLabel: "Genehmigt am",
      paymentsLabel: "Zahlungen",
      paymentsValue_one: "{{count}}, für {{amount}}",
      paymentsValue_other: "{{count}}, für {{amount}}",
      paymentsValueRecent_one: "{{count}} in 90 Tagen, für {{amount}}",
      paymentsValueRecent_other: "{{count}} in 90 Tagen, für {{amount}}",
      modesLabel: "Bestätigungsmodus der Zahlungen",
      recommended: "Empfohlen",
      confirmPasskey: "Mit meinem Passkey bestätigen",
      modes: {
        automatic: {
          title: "Automatisch",
          body: "Jeder gültige Tap wird bezahlt, innerhalb der Limits der Karte. Der Händler wird angezeigt, ohne Prüfung."
        },
        approved: {
          title: "Genehmigte Händler",
          body: "Ohne Bestätigung bezahlt bei einem identifizierten Händler, den Sie genehmigt haben; anderswo fragt Ihr Telefon nach Ihrer Bestätigung."
        },
        confirm: {
          title: "Immer bestätigen",
          body: "Jede Zahlung wartet auf Ihre Bestätigung."
        }
      },
      approvedEmpty: "Kein genehmigter Händler",
      approvedEmptyLead:
        "Wenn Sie eine Zahlung mit dieser Karte bestätigen, kreuzen Sie „$t(card.payment.approve)“ an: Seine nächsten Zahlungen gehen ohne Bestätigung durch.",
      approvedOn: "genehmigt am {{date}}",
      nameField: "Ihr Name für diesen Händler",
      nameHint: "Nur für Sie. Leer gelassen, gilt wieder der vom Händler angegebene Name.",
      remove: "Aus den genehmigten Händlern entfernen",
      removeHint:
        "Ihr Passkey wird verlangt. Seine nächsten Zahlungen fragen wieder nach Ihrer Bestätigung.",
      saveFailed: "Die Änderung konnte nicht gespeichert werden. Versuchen Sie es erneut.",
      pending: {
        phone:
          "Auf diesem Telefon gespeichert, noch nicht auf den Relais Ihres Kontos: Ihre anderen Geräte sehen es noch nicht.",
        web: "Noch nicht auf den Relais Ihres Kontos gespeichert: Diese Änderung geht verloren, wenn Sie die Seite verlassen."
      },
      failed: {
        newerApp:
          "Eine neuere Version der App hat Ihre genehmigten Händler gespeichert. Aktualisieren Sie die App: Bis dahin zahlen Ihre Karten nicht.",
        unreachable:
          "Die Relais Ihres Kontos haben nicht geantwortet: Ihre genehmigten Händler können nicht angezeigt werden.",
        failed: "Ihre genehmigten Händler konnten nicht gelesen werden."
      }
    },
    probe: {
      group: "Tests (Staging)",
      row: "Test der iOS-Erweiterung",
      title: "Test der iOS-Erweiterung",
      noPointOfSale:
        "Dieser Test zahlt an die Lightning-Adresse des Kontos: Ein reines Kartenkonto hat keine.",
      unavailable: "Dieser Test existiert nur in der Staging-App auf dem iPhone.",
      intro:
        "Misst, ob eine Karte über eine Mitteilung bezahlen kann, während die App geschlossen ist. Die Erweiterung nutzt ihre eigene Test-Wallet, nie die Ihres Kontos: Sie enthält nur wenige sats.",
      how: "Sperren Sie nach dem Start eines Tests das Telefon: Das Ergebnis erscheint in der Mitteilung, danach hier. Mitteilungen müssen erlaubt sein.",
      launchGroup: "Test starten",
      profile: "SDK-Konfiguration",
      profiles: {
        light: "Leicht",
        standard: "Standard"
      },
      modes: {
        sync: "Synchronisieren",
        receive: "100 sats empfangen",
        pay: "1 sat an Ihre Adresse zahlen",
        engine: "JS-Engine (ohne Zahlung)",
        runtime: "JS-Laufzeit (Netzwerk, Daten)",
        enginePay: "JS-Engine: 1 Sat zahlen"
      },
      balance: "Guthaben der Test-Wallet, beim letzten Test gelesen: {{sats}} sats",
      sent: "Test-Mitteilung gesendet",
      failed: {
        unavailable: "Dieses Telefon hat die Mitteilungserweiterung nicht",
        noApiKey: "Diese App-Version hat keinen Breez-API-Schlüssel",
        storage: "Die Test-Wallet konnte nicht vorbereitet werden",
        notifications: "Erlauben Sie Mitteilungen, um einen Test zu starten",
        pushToken: "Kein Mitteilungs-Token: Netzwerk, oder keine APNs-Zugangsdaten im Build",
        invoice: "Ihre Lightning-Adresse hat keine Rechnung geliefert",
        push: "Der Mitteilungsdienst von Expo hat den Versand abgelehnt",
        unexpected: "Der Test konnte nicht gestartet werden"
      },
      notification: {
        title: "Test der Erweiterung",
        body: "Bleibt dieser Text stehen, hat die Erweiterung die Mitteilung nicht verarbeitet."
      },
      cardText: {
        group: "Benachrichtigung einer Kartenzahlung",
        intro:
          "Sendet diesem Telefon die Benachrichtigung einer Kartenzahlung, wie das Relais: Ihr Titel muss in der Sprache des iPhones erscheinen. „sattle.me“: Die Erweiterung hat sie nicht verarbeitet.",
        launch: "Kartenbenachrichtigung senden",
        sent: "Kartenbenachrichtigung gesendet"
      },
      resultsGroup: "Ergebnisse",
      empty: "Noch kein Test.",
      outcome: {
        waiting: "Ausstehend",
        none: "Kein Ergebnis",
        running: "Läuft ({{step}})",
        stopped: "Abgebrochen ({{step}})",
        ok: "Erfolgreich",
        failed: "Fehlgeschlagen ({{step}})",
        expired: "Zeit überschritten ({{step}})"
      },
      peak: "Spitze {{mb}} MB",
      limit: "Grenze ≈ {{mb}} MB",
      seconds: "{{s}} s",
      copyInvoice: "Rechnung kopieren",
      invoiceCopied: "Rechnung kopiert: Bezahlen Sie sie unter „Senden“",
      copy: "Ergebnisse kopieren",
      copied: "Ergebnisse kopiert",
      copyFailed: "Kopieren fehlgeschlagen",
      clear: "Ergebnisse löschen"
    },
    wakes: {
      row: "Weckprotokoll (Android)",
      title: "Weckprotokoll",
      unavailable: "Dieses Protokoll existiert nur in der Staging-App auf Android.",
      intro:
        "Jedes Wecken dieses Telefons durch das Relais einer Karte, bei geschlossener App oder im Hintergrund: wann es kam und wie weit die Zahlung kam. Kein Betrag, kein Händler, keine Rechnung.",
      how: "Zum Testen: Wischen Sie die App aus den zuletzt verwendeten Apps (ohne sie zwangsweise zu beenden), sperren Sie das Telefon, halten Sie die Karte an eine Kasse, kommen Sie dann hierher zurück und kopieren Sie das Protokoll.",
      group: "Weckrufe",
      empty: "Noch kein Weckruf.",
      outcome: {
        running: "Läuft ({{step}})",
        stopped: "Unterbrochen ({{step}})",
        notTaken: "Ignoriert",
        paid: "Bezahlt",
        pending: "Gesendet, nicht bestätigt",
        declined: "Vom Inhaber abgelehnt",
        failed: "Fehlgeschlagen ({{reason}})",
        letGo: "Aufgegeben ({{step}})",
        ended: "Beendet ({{step}})"
      },
      received: "Aufgabe {{s}} s nach Empfang gestartet",
      js: "JS {{s}} s vorher gestartet",
      silence: "längste Stille {{s}} s",
      copy: "Protokoll kopieren",
      copied: "Protokoll kopiert",
      copyFailed: "Das Kopieren ist fehlgeschlagen",
      clear: "Protokoll löschen",
      newer: "Dieses Protokoll wurde von einer neueren Version der App geschrieben.",
      failed: "Das Protokoll konnte nicht gelesen werden."
    },
    socket: {
      group: "Dauerverbindung",
      row: "Dauerverbindung",
      caption: {
        on: "Aktiv",
        off: "Aus"
      },
      intro:
        "Das Telefon hält eine eigene Verbindung zum Relais seiner Karten: Eine Kartenzahlung weckt es bei geschlossener App. Sie ist standardmäßig aktiv und verbraucht etwas Akku. Ausgeschaltet zahlen Ihre Karten nur bei geöffneter App.",
      noRelay: "Noch kein Relais Ihrer Karten bietet diese Verbindung an.",
      state: {
        connecting: "verbinden…",
        open: "verbunden",
        waiting: "wartet",
        stopped: "gestoppt"
      },
      since: "seit {{time}}",
      lastMessage: "letzte Nachricht vor {{s}} s",
      opened_one: "{{count}} Verbindung",
      opened_other: "{{count}} Verbindungen",
      failures_one: "{{count}} Abbruch",
      failures_other: "{{count}} Abbrüche",
      lastFailure: "letzter Abbruch: {{code}}",
      wakes_one: "{{count}}-mal geweckt",
      wakes_other: "{{count}}-mal geweckt",
      battery: {
        applied: "Die Akku-Optimierung gilt für die App: Android kann die Verbindung trennen.",
        exempt: "Die Akku-Optimierung ist für die App deaktiviert.",
        settings: "Akku-Einstellungen"
      },
      notice: {
        shown:
          "Android zeigt eine Mitteilung, solange die Verbindung aktiv ist. Um sie auszublenden, schalten Sie „Kartenverbindung“ in den sich öffnenden Einstellungen aus: Die Verbindung bleibt bestehen.",
        hidden: "Mitteilung ausgeblendet: Die Verbindung bleibt bestehen.",
        hide: "Mitteilung ausblenden",
        settings: "Mitteilungseinstellungen"
      },
      service: {
        running: "Dienst aktiv (gestartet: {{reason}})",
        stopped: "Dienst gestoppt",
        error: "Der Dienst konnte nicht starten ({{code}})",
        task: "Wecken nicht an die App übergeben ({{code}})"
      },
      failed: "Die Dauerverbindung konnte nicht geändert werden",
      notification: {
        channel: "Kartenverbindung",
        title: "Kartenzahlungen aktiviert",
        text: "Mit dem Relais Ihrer Karten verbunden, um bei geschlossener App zu zahlen",
        stop: "Beenden"
      }
    }
  },
  pos: {
    title: "Kasse",
    subtitle: "Nehmen Sie schnell Bitcoin auf Ihr Konto ein.",
    addNote: "Notiz hinzufügen",
    editNote: "Notiz „{{note}}“ bearbeiten",
    charge: "Kassieren",
    keyboardHint: "Die Tasten Ihrer Tastatur funktionieren auch.",
    deleteKey: "Löschen",
    satsLabel: "{{sats}} Sats",
    rateLoading: "Bitcoin-Kurs wird geladen…",
    rateUnavailable: "Bitcoin-Kurs nicht verfügbar. Prüfen Sie Ihre Internetverbindung.",
    share: "Zahlungsanforderung teilen",
    shareLink: {
      button: "Teilen",
      hint: "Sendet die Zahlungsanforderung an den Kunden.",
      copiedTitle: "Link kopiert",
      copied: "Fügen Sie ihn in eine Nachricht an den Kunden ein.",
      publishFailedTitle: "Link nicht online",
      shareFailedTitle: "Link nicht geteilt",
      publishFailed:
        "Der Link konnte nicht online gestellt werden: Der Kunde würde ihn nicht finden. Prüfen Sie Ihre Internetverbindung und teilen Sie ihn dann erneut.",
      shareFailed: "Der Link konnte nicht geteilt werden. Versuchen Sie es erneut."
    },
    backToPos: "Zurück zur Kasse",
    expiresIn: "Läuft ab in",
    waiting: "Warten auf die Zahlung",
    creating: "Anforderung wird erstellt…",
    checking: "Bitcoin-Zahlung wird geprüft…",
    checkingPayment: "Zahlung wird geprüft…",
    lateCheck: {
      title: "Anforderung abgelaufen",
      body: "Eine in letzter Sekunde gesendete Zahlung kann noch eintreffen.",
      endsIn: "Prüfung endet in"
    },
    // A payment whose check lasts.
    settling: {
      title: "Zahlung erhalten, wird geprüft",
      body: "Die Prüfung dauert länger als üblich. Sie läuft von selbst weiter."
    },
    updatingRate: "Kurs der neuen Stunde wird geladen…",
    networks: {
      scan: "Scannen Sie mit Ihrer Wallet",
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      or: "oder"
    },
    onchainUnavailable: {
      explorer:
        "Bitcoin onchain für diesen Verkauf nicht verfügbar: {{explorer}} konnte die Bitcoin-Adresse nicht rechtzeitig prüfen. Der Kunde kann über Lightning bezahlen.",
      pool: "Bitcoin onchain für diesen Verkauf nicht verfügbar: Dieses Gerät hat keine Bitcoin-Adresse bereit. Es bereitet bei jedem Entsperren mit Ihrem Passkey neue vor, mit Internetverbindung. Der Kunde kann über Lightning bezahlen.",
      lot: "Bitcoin onchain für diesen Verkauf nicht verfügbar: Diesem Gerät steht keine Bitcoin-Adresse zur Verfügung. Die Inhaberin oder der Inhaber gibt ihm neue beim Entsperren der eigenen App mit dem Passkey, mit Internetverbindung. Der Kunde kann über Lightning bezahlen."
    },
    note: {
      label: "Notiz zu dieser Zahlung",
      placeholder: "Tisch 12"
    },
    boltcard: {
      approach: "Oder die BoltCard hinhalten",
      tap: "Oder hier tippen und dann die BoltCard hinhalten",
      alert: "Halten Sie die BoltCard an den oberen Rand des Telefons.",
      paying: "Kartenzahlung läuft…",
      sent: "Kartenzahlung gesendet, Bestätigung ausstehend…",
      refusal: {
        refused: "Karte abgelehnt",
        interrupted: "Kartenzahlung unterbrochen",
        unread: "Karte nicht gelesen",
        noReason:
          "Der Dienst der Karte hat keinen Grund angegeben. Halten Sie die Karte erneut hin oder lassen Sie den Code scannen.",
        outOfRange:
          "Der Betrag liegt außerhalb der Grenzen der Karte. Lassen Sie den Code scannen.",
        noAnswer:
          "Der Dienst der Karte hat nicht geantwortet. Halten Sie die Karte erneut hin oder lassen Sie den Code scannen.",
        unreadable:
          "Dies ist keine hier lesbare Zahlungskarte. Halten Sie sie erneut hin oder lassen Sie den Code scannen.",
        showCode: "Code anzeigen"
      }
    },
    paid: {
      pill: "Bezahlt",
      line: "Lightning · {{time}}",
      onchainLine: "Bitcoin · {{time}}",
      mixedLine: "Bitcoin + Lightning · {{time}}"
    },
    accepted: {
      notice: "Der Inhaber hat den erhaltenen Betrag akzeptiert: Der Verkauf ist bezahlt."
    },
    unconfirmed: {
      pill: "Wird bestätigt",
      notice:
        "Der Kunde hat bezahlt. Das Netzwerk muss die Transaktion noch bestätigen, rechnen Sie mit etwa dreißig Minuten."
    },
    underpaid: {
      rest: "Rest",
      received: "Erhalten",
      restToPay: "Noch zu bezahlen",
      // The accessible name of a transaction's link on the chain card (UnderpaidChain).
      txLink: "Transaktion {{txid}} auf {{explorer}} ansehen"
    },
    underpaidEnded: {
      pill: "Teilweise bezahlt",
      missing: "Fehlt",
      received: "Erhaltene Zahlungen",
      confirmed: "Bestätigt",
      confirming: "Wird bestätigt · {{done}}/{{required}}",
      notice: "Die Zahlungsfrist ist abgelaufen: Es fehlen {{missing}} sats."
    },
    expired: {
      pill: "Abgelaufen",
      notice: "Der Kunde hat nicht rechtzeitig bezahlt. Es wurde nichts eingenommen.",
      recreate: "Anforderung neu erstellen"
    },
    disputed: {
      pill: "Zahlung zu prüfen",
      notice:
        "Eine Zahlung ist eingegangen, aber ein anderer Verkauf beansprucht sie ebenfalls. Fordern Sie keine neue Zahlung an: Prüfen Sie sie unter „$t(navigation.destinations.wallet)“.",
      noticeMember:
        "Eine Zahlung ist eingegangen, aber ein anderer Verkauf beansprucht sie ebenfalls. Fordern Sie keine neue Zahlung an: Der Kontoinhaber prüft sie unter „$t(navigation.destinations.wallet)“."
    },
    failed: {
      network:
        "Die Zahlungsanforderung konnte nicht erstellt werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      invalid: "Der Zahlungsdienst hat unerwartet geantwortet. Versuchen Sie es erneut.",
      limits: "Dieser Betrag kann nicht kassiert werden: nur zwischen {{min}} und {{max}} Sats.",
      onchainOnly: {
        none: "Über {{max}} Sats kann dieser Betrag nur onchain bezahlt werden, und Onchain-Zahlungen sind deaktiviert.",
        explorer:
          "Über {{max}} Sats kann dieser Betrag nur onchain bezahlt werden, und {{explorer}} konnte die Bitcoin-Adresse nicht rechtzeitig prüfen. Versuchen Sie es noch einmal.",
        pool: "Über {{max}} Sats kann dieser Betrag nur onchain bezahlt werden, und dieses Gerät hat keine Bitcoin-Adresse bereit. Es bereitet bei jedem Entsperren mit Ihrem Passkey neue vor, mit Internetverbindung.",
        lot: "Über {{max}} Sats kann dieser Betrag nur onchain bezahlt werden, und diesem Gerät steht keine Bitcoin-Adresse zur Verfügung. Die Inhaberin oder der Inhaber gibt ihm neue beim Entsperren der eigenen App mit dem Passkey, mit Internetverbindung.",
        error:
          "Über {{max}} Sats kann dieser Betrag nur onchain bezahlt werden, und die Bitcoin-Adresse dieses Geräts konnte nicht gelesen werden. Versuchen Sie es noch einmal."
      },
      retry: "Erneut versuchen"
    },
    // The keypad or the articles: the header's segmented control.
    mode: {
      label: "Eingabemodus",
      amount: "Betrag",
      articles: "Artikel",
      scan: "Scannen"
    },
    articles: {
      hint: "Tippen Sie auf einen Artikel, um ihn hinzuzufügen",
      // Without articles, on the owner's device only (ArticlesPad.tsx).
      empty: {
        reading: "Ihre Artikel werden gelesen…",
        unreadableTitle: "Artikel noch nicht gelesen",
        unreadableBody:
          "Ihre Artikel konnten nicht gelesen werden. Prüfen Sie die Internetverbindung: Sie werden in einigen Minuten erneut gelesen.",
        noneTitle: "Noch keine Artikel",
        noneBody:
          "Fügen Sie Ihre Artikel unter „$t(navigation.destinations.articles)“ hinzu: Sie erscheinen dann hier.",
        noneBodyScan:
          "Scannen Sie ein Produkt mit „$t(pos.mode.scan)“, um es zu erfassen, oder fügen Sie Ihre Artikel unter „$t(navigation.destinations.articles)“ hinzu."
      },
      tile: "{{name}}, {{price}}",
      add: "Fügt einen zum Warenkorb hinzu",
      inBasket_one: "{{count}} im Warenkorb",
      inBasket_other: "{{count}} im Warenkorb"
    },
    basket: {
      title: "Warenkorb",
      open: "Warenkorb ansehen",
      charge_one: "Kassieren · {{count}} Artikel",
      charge_other: "Kassieren · {{count}} Artikel",
      total: "Summe",
      empty: "Der Warenkorb ist leer.",
      tooLarge: "Die Summe übersteigt den Höchstbetrag einer Zahlung.",
      scanMore: "Weitere Artikel scannen",
      less: "Menge von {{name}} verringern",
      more: "Menge von {{name}} erhöhen",
      quantity_one: "Menge: {{count}}",
      quantity_other: "Menge: {{count}}"
    },
    // The scan of the point of sale: the camera, the article read last, the basket.
    scan: {
      aim: "Zielen Sie auf den Strichcode eines Artikels",
      lead: "Jeder gescannte Artikel wird zur Summe hinzugefügt.",
      converted: "Preis: {{price}}, umgerechnet",
      unknown: {
        title: "Unbekannter Strichcode",
        body: "Keiner Ihrer Artikel hat diesen Code. Nichts wurde hinzugefügt."
      },
      // A code read before the catalogue was (ScanPad.tsx): nothing can be told of it.
      notRead: {
        title: "Artikel noch nicht gelesen",
        body: "Dieser Code konnte nicht gesucht werden. Nichts wurde hinzugefügt: Scannen Sie ihn gleich noch einmal."
      }
    }
  },
  paymentLink: {
    // The page's switch of theme, in its header: what it does.
    themeToDark: "Zum dunklen Erscheinungsbild wechseln",
    themeToLight: "Zum hellen Erscheinungsbild wechseln",
    payableUntil: "Zahlbar bis {{date}}",
    loading: "Zahlungsanforderung wird geladen…",
    updatingRate: "Kurs der neuen Stunde wird geladen…",
    openWallet: "Meine Wallet öffnen",
    copyInvoice: "Rechnung kopieren",
    copied: "Rechnung kopiert",
    copyFailed:
      "Die Rechnung konnte nicht kopiert werden. Öffnen Sie sie in Ihrer Wallet oder scannen Sie den Code.",
    retry: "Erneut versuchen",
    notFound: {
      title: "Zahlungsanforderung nicht gefunden",
      notice:
        "Diese Zahlungsanforderung existiert nicht oder ist abgelaufen. Bitten Sie den Händler um einen neuen Link.",
      invalid:
        "Dieser Link ist unvollständig. Prüfen Sie, ob er vollständig kopiert wurde, oder bitten Sie den Händler um einen neuen."
    },
    unreachable: {
      title: "Keine Verbindung",
      notice:
        "Die Zahlungsanforderung konnte nicht geladen werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut."
    },
    failed: {
      title: "Zahlungsanforderung nicht verfügbar",
      notice:
        "Der Zahlungsdienst des Händlers konnte die Rechnung nicht erstellen. Versuchen Sie es gleich noch einmal oder bitten Sie den Händler um einen neuen Link.",
      onchainOnly:
        "Dieser Betrag kann nur onchain bezahlt werden, und diese Zahlungsanforderung bietet keine Bitcoin-Adresse an. Bitten Sie {{business}} um eine andere Zahlungsmöglichkeit."
    },
    copyAddress: "Adresse kopieren",
    addressCopied: "Adresse kopiert",
    addressCopyFailed:
      "Die Adresse konnte nicht kopiert werden. Öffnen Sie sie in Ihrer Wallet oder scannen Sie den Code.",
    amountCopied: "Betrag kopiert",
    amountCopyFailed:
      "Der Betrag konnte nicht kopiert werden. Öffnen Sie die Anfrage in Ihrer Wallet oder scannen Sie den Code.",
    receipt: {
      invoice: "Lightning-Rechnung",
      address: "Bitcoin-Adresse",
      amount: "Betrag",
      copyAmount: "Betrag kopieren",
      invoiceCopied: "Kopiert",
      addressCopied: "Kopiert",
      amountCopied: "Kopiert",
      unit: "Einheit: {{unit}}, zu {{next}} wechseln"
    },
    unconfirmed: {
      notice:
        "Ihre Zahlung wurde übermittelt. Das Netzwerk muss die Transaktion noch bestätigen, rechnen Sie mit etwa dreißig Minuten. Sie können diese Seite schließen."
    },
    underpaid: {
      notice:
        "Ihre Zahlung ({{received}} sats) deckt nicht den ganzen Betrag. Zahlen Sie den Rest über Lightning oder Bitcoin.",
      noticeLightning:
        "Ihre Zahlung ({{received}} sats) deckt nicht den ganzen Betrag. Zahlen Sie den Rest über Lightning."
    },
    underpaidEnded: {
      notice:
        "Die Zahlungsfrist ist abgelaufen: Ihre Zahlung ({{received}} sats) deckt nicht den ganzen Betrag, es fehlen {{missing}} sats. Wenden Sie sich für die Differenz an {{business}}."
    },
    details: {
      title: "Zahlungsdetails",
      business: "Empfänger",
      method: "Zahlungsart",
      methods: {
        lightning: "Lightning",
        onchain: "Bitcoin",
        mixed: "Bitcoin + Lightning"
      },
      createdAt: "Erstellt am",
      transaction: "Transaktion",
      transactionNumber: "Transaktion {{number}}",
      confirmations_one: "{{count}} Bestätigung von {{required}}",
      confirmations_other: "{{count}} Bestätigungen von {{required}}",
      confirmed: "Bestätigt"
    },
    paid: {
      pill: "Bezahlt",
      notice: "{{business}} hat Ihre Zahlung erhalten.",
      continue: "Weiter zu {{host}}"
    },
    accepted: {
      notice: "{{business}} hat den erhaltenen Betrag akzeptiert: Ihre Zahlung ist erledigt."
    },
    expired: {
      pill: "Abgelaufen",
      notice:
        "Die Zahlungsfrist ist abgelaufen und es ist keine Zahlung eingegangen. Bitten Sie {{business}} um einen neuen Link."
    },
    canceled: {
      pill: "Storniert",
      notice:
        "{{business}} hat diese Zahlungsanforderung storniert: Bezahlen Sie sie nicht. Bitten Sie {{business}} um einen neuen Link."
    },
    disputed: {
      pill: "Wird geprüft",
      notice:
        "Ihre Zahlung ist eingegangen. {{business}} muss sie noch prüfen: Zahlen Sie nicht ein zweites Mal und wenden Sie sich bei Bedarf an {{business}}."
    },
    checkout: {
      newer: {
        title: "Seite aktualisieren",
        notice:
          "Dieser Zahlungslink hat ein neueres Format als diese Seite. Laden Sie die Seite neu oder aktualisieren Sie die App, und öffnen Sie den Link dann erneut."
      },
      continue: "Weiter",
      redirectTo: "Weiterleitung zu {{target}}",
      unconfirmed: {
        notice:
          "Ihre Zahlung wurde übermittelt. Das Netzwerk muss die Transaktion noch bestätigen, rechnen Sie mit etwa dreißig Minuten."
      },
      underpaid: {
        notice:
          "Ihre Zahlung ({{received}} sats) deckt nicht den ganzen Betrag. Zahlen Sie den Rest über Bitcoin an dieselbe Adresse."
      },
      expired: {
        notice:
          "Die Zahlungsfrist ist abgelaufen und es ist keine Zahlung eingegangen. Kehren Sie zum Shop von {{business}} zurück, um eine neue anzufordern.",
        late: "Die Zahlungsfrist ist abgelaufen: Eine Zahlung ist nach ihrem Ende eingegangen und zählt nicht für diese Bestellung. Wenden Sie sich an {{business}}."
      }
    }
  },
  appLock: {
    title: "App gesperrt",
    body: "Verwenden Sie die Biometrie dieses Geräts, um sie zu öffnen.",
    unlock: "Entsperren",
    prompt: "sattle.me entsperren",
    cancel: "Abbrechen"
  },
  navigation: {
    label: "Navigation",
    destinations: {
      pos: "Kassieren",
      wallet: "Wallet",
      cards: "Karten",
      articles: "Artikel",
      employees: "Mitarbeitende",
      integrations: "Integrationen",
      settings: "Einstellungen"
    },
    memberWallet: "Meine Aktivität",
    groups: {
      sales: "Verkauf",
      manage: "Verwalten",
      account: "Konto"
    },
    more: "Mehr",
    moreWith: "Mehr, aktueller Bildschirm: {{name}}",
    moreWithWait: "{{more}} ({{name}})",
    close: "Schließen",
    customize: "Anpassen",
    customizeTitle: "Leiste anpassen",
    done: "Fertig",
    customizeHint: "Tippen Sie auf ein Ziel, um <accent>{{name}}</accent> zu ersetzen.",
    slotLabel: "{{name}}, Platz {{index}}",
    swapLabel: "{{name}} in die Leiste nehmen",
    currentLabel: "{{name}}, aktueller Bildschirm",
    pendingLabel: "{{name}}, offene Rechnung",
    confirmingLabel: "{{name}}, Zahlung wird bestätigt",
    lock: {
      tillMode: "In den Kassenmodus wechseln",
      lockApp: "App sperren",
      unlock: "Mit Ihrem Passkey entsperren",
      lockedLabel: "{{name}}, gesperrt: mit Ihrem Passkey entsperren",
      unlocking: "Wird entsperrt…",
      preparing: "Entsperren wird vorbereitet…",
      failedTitle: "Entsperren nicht möglich",
      otherAccount: "Dieser Passkey öffnet ein anderes Konto als das dieses Geräts.",
      autoLockTitle: "Sperre in {{seconds}} s",
      autoLockBodyCard: "Ohne Aktivität wird die App gesperrt.",
      autoLockBody: "Ohne Aktivität wechselt die App zurück in den Kassenmodus."
    },
    loadFailure: {
      title: "Bildschirm nicht geladen",
      body: "Prüfen Sie Ihre Internetverbindung und laden Sie dann die Seite neu. Dabei wird auch die neueste Version der App geladen.",
      reload: "Seite neu laden"
    },
    update: {
      title: "Neue Version verfügbar",
      body: "Beim Aktualisieren wird die Seite neu geladen.",
      action: "Aktualisieren"
    }
  },
  team: {
    invite: "Mitarbeitende einladen",
    loading: "Ihre Mitarbeitenden werden geladen…",
    guide: {
      title: "Gemeinsam kassieren",
      lead: "Alle Mitarbeitenden kassieren mit ihrem eigenen Telefon für Ihr Geschäft.",
      invite: {
        title: "Einladen",
        caption: "Wählen Sie den Namen: Die App bereitet die Einladung vor, mit QR-Code und Link."
      },
      activate: {
        title: "Telefon aktivieren",
        caption:
          "Die Person scannt den QR-Code oder öffnet den Link, und ihr Telefon wird zu einer Kasse Ihres Geschäfts."
      },
      sales: {
        title: "Verkäufe verfolgen",
        caption:
          "Sie kommen in Ihrer Wallet an, unter dem Namen der Person; alle Mitarbeitenden sehen nur ihre eigenen."
      }
    },
    noMatch: "Keine Mitarbeitenden entsprechen den Filtern.",
    offline: "Keine Verbindung: Der Stand der Einladungen konnte nicht geprüft werden.",
    rosterOffline:
      "Kein Relay hat geantwortet: Die Liste der Mitarbeitenden konnte nicht gelesen werden. Prüfen Sie die Verbindung und öffnen Sie diese Seite erneut.",
    rosterPartial:
      "Nicht alle Relays haben geantwortet: Die Liste der Mitarbeitenden ist möglicherweise unvollständig.",
    newer:
      "Einige Mitarbeitende stammen aus einer neueren Version der App: Aktualisieren Sie die App, um sie zu sehen.",
    invitations: "Offene Einladungen",
    employees: "Mitarbeitende",
    columns: {
      name: "Name",
      state: "Status",
      date: "Datum"
    },
    status: {
      invited: "Ausstehend",
      joined: "Aktiv",
      left: "Ausgetreten",
      expired: "Abgelaufen"
    },
    detail: {
      invited: "Link erstellt am {{date}}",
      joined: "Beigetreten am {{date}}",
      left: "Ausgetreten am {{date}}",
      expired: "Link abgelaufen am {{date}}"
    },
    // Where an employee's device joined (its record's platform), beside its row's date.
    platform: {
      ios: "auf iPhone oder iPad",
      android: "auf Android",
      web: "in einem Webbrowser"
    },
    detailWithPlatform: "{{detail}}, {{platform}}",
    actions: {
      share: "Link teilen",
      showQr: "Link und Code anzeigen",
      renew: "Einladung erneuern",
      deleteInvite: "Einladung löschen",
      removeAccess: "Zugang entziehen",
      removeLeft: "Aus der Liste entfernen"
    },
    inviteSheet: {
      title: "Mitarbeitende einladen",
      lead: "Mit diesem Link kassiert ein weiteres Gerät für Ihr Geschäft: das Telefon von Mitarbeitenden oder eine gemeinsame Kasse. Die Zahlungen gehen direkt in Ihre Wallet.",
      can: "Dieses Gerät kann",
      canItems: {
        sell: "Kassieren: Betrag, Artikel und Scannen",
        methods: "Zahlungen per Lightning, On-Chain oder Karte annehmen",
        links: "Einen Zahlungslink an Kunden senden",
        ownSales: "Die eigenen Verkäufe sehen"
      },
      cannot: "Dieses Gerät kann nicht",
      cannotItems: {
        wallet: "Ihr Guthaben sehen oder Geld senden",
        settings: "Ihre Artikel, Preise oder Einstellungen ändern",
        otherSales: "Die Verkäufe anderer Mitarbeitender oder Kassen sehen",
        manage: "Team, Karten oder Integrationen verwalten"
      },
      revoke: "Sie können den Zugang jederzeit entziehen.",
      nameLabel: "Name",
      namePlaceholder: "Z. B. Alice oder Kasse 1",
      nameHint: "Er erscheint in Ihrem Wallet neben seinen Verkäufen.",
      create: "Link erstellen",
      notice:
        "Der Link ist 48 Stunden gültig und funktioniert nur einmal. Geben Sie ihn nur der vorgesehenen Person oder Kasse: Wer ihn zuerst öffnet, kann ihren Platz einnehmen."
    },
    qrSheet: {
      title: "Einladung für {{name}}",
      lead: "Scannen Sie diesen Code mit dem Gerät, das kassieren wird, oder senden Sie den Link an dieses Gerät.",
      leadDesktop:
        "Scannen Sie diesen Code mit dem Gerät, das für {{business}} kassieren wird, oder senden Sie den Link an dieses Gerät.",
      linkLabel: "Einladungslink",
      copy: "Link kopieren",
      share: "Link teilen",
      copied: "Link kopiert",
      copyFailed:
        "Der Link konnte nicht kopiert werden. Markieren Sie ihn und kopieren Sie ihn dann.",
      done: "Fertig",
      notice:
        "Dieser Link funktioniert nur einmal und läuft am {{date}} ab. Er ist nur für {{name}} bestimmt: Wer ihn zuerst öffnet, kann diesen Platz einnehmen."
    },
    removeDialog: {
      title: "{{name}} entfernen?",
      body: "{{name}} kann nicht mehr für {{business}} kassieren. Frühere Zahlungen bleiben in der Wallet, unter diesem Namen.",
      confirm: "Zugang entziehen",
      doneTitle: "Zugang entzogen",
      doneBody: "{{name}} gehört nicht mehr zum Team von {{business}}."
    },
    removeLeftDialog: {
      title: "{{name}} aus der Liste entfernen?",
      body: "{{name}} ist am {{date}} bei {{business}} ausgetreten. Frühere Zahlungen bleiben in der Wallet, unter diesem Namen.",
      confirm: "Aus der Liste entfernen",
      doneTitle: "Aus der Liste entfernt",
      doneBody: "{{name}} erscheint nicht mehr unter den Mitarbeitenden von {{business}}."
    },
    deleteInviteDialog: {
      title: "Einladung von {{name}} löschen?",
      body: "Der Link funktioniert dann nicht mehr: {{name}} kann damit {{business}} nicht beitreten.",
      confirm: "Einladung löschen",
      doneTitle: "Einladungslink deaktiviert",
      doneBody: "{{name}} kann {{business}} nicht mehr beitreten."
    },
    cancelSalesDialog: {
      unknownLead: "Der Stand der Rechnungen von {{name}} konnte nicht geprüft werden.",
      linksLeft:
        "{{name}} gehört nicht mehr zum Team von {{business}}. Die Zahlungslinks, die nicht storniert werden konnten, bleiben bis zu ihrem Ende bezahlbar: Ihre Zahlungen gehen in die Wallet.",
      title: "Rechnungen von {{name}} stornieren?",
      lead: "Einige Rechnungen von {{name}} sind noch nicht endgültig.",
      links:
        "Die Zahlungslinks, die noch nichts erhalten haben, werden storniert: Ihre Seite zeigt keinen Code zum Bezahlen mehr. Bezahlte Links werden abgeschlossen.",
      invoices:
        "Die auf dem Gerät angezeigten Rechnungen werden storniert: Das Gerät zeigt sie nicht mehr an, sobald es die Entfernung des Zugangs erhält.",
      end: "Wer eine Rechnung bereits gescannt oder kopiert hat, kann sie noch bezahlen: Die Zahlung geht in die Wallet ein. Danach wird der Zugang von {{name}} entfernt.",
      confirm: "Stornieren und entfernen",
      progress: "Rechnungen von {{name}} werden storniert…"
    },
    failedTitle: "Aktion nicht möglich",
    unreachableTitle: "Keine Verbindung",
    errors: {
      noAccount: "Entsperren Sie diesen Point of Sale mit Ihrem Passkey, um das Team zu verwalten.",
      noWebApp: "Einladungen sind in dieser Version der App noch nicht verfügbar.",
      tooMany: "Ihr Team hat bereits 100 Mitarbeitende.",
      invalidName: "Geben Sie den Namen der Person ein.",
      unreachable:
        "Die Einladung konnte nicht veröffentlicht werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      unpublished:
        "Die Person ist in der Liste, aber ihre Einladung konnte nicht veröffentlicht werden. Teilen Sie ihren Link aus der Liste, um es erneut zu versuchen.",
      removeUnreachable:
        "Die Entfernung konnte nicht veröffentlicht werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      removeFailed: "Die Entfernung konnte nicht gespeichert werden. Versuchen Sie es erneut.",
      removalUnsaved:
        "Der Zugang dieser Person ist gesperrt, aber die Entfernung konnte nicht gespeichert werden. Versuchen Sie es erneut: Sie wird auch beim nächsten Öffnen Ihres Kontos gespeichert.",
      salesInProgress:
        "Einige Rechnungen dieser Person sind noch nicht endgültig. Versuchen Sie es erneut, sobald ihre endgültige Fassung veröffentlicht ist (bis zu 3 Stunden nach dem Ende einer unbezahlten Rechnung).",
      integrationPending:
        "Eine Integration hat Zahlungen, die noch nicht endgültig sind. Versuchen Sie es erneut, sobald sie es sind.",
      exportNewer:
        "Eine neuere Version der App hat diesen Assistenten geändert. Aktualisieren Sie die App, um ihn zu ändern",
      invoicesNewer:
        "Eine neuere Version der App hat diesen Assistenten geändert. Aktualisieren Sie die App, um ihn zu ändern"
    },
    removedNotice: "Dieses Gerät gehört nicht mehr zum Team von {{business}}.",
    join: {
      title: "Einem Team beitreten",
      scanLead:
        "Scannen Sie den Einladungs-QR-Code, den Ihnen die Inhaberin oder der Inhaber des Geschäfts zeigt.",
      cameraAppLead:
        "Scannen Sie den Einladungs-QR-Code mit der Kamera Ihres Telefons: Er öffnet diese Seite.",
      cameraNeeded: "Die Kamera wird zum Scannen des Einladungs-QR-Codes benötigt.",
      allowCamera: "Kamera erlauben",
      openSettings: "Einstellungen öffnen",
      pasteLabel: "Oder fügen Sie den Einladungslink ein",
      checking: "Einladung wird gelesen…",
      joining: "Beitritt zum Team…",
      as: "Sie kassieren als {{name}} für {{business}}.",
      rights:
        "Dieses Gerät erstellt Rechnungen, die an {{business}} bezahlt werden. Es hat keinen Zugriff auf die Wallet, die Einstellungen oder die Verkäufe der anderen Mitarbeitenden.",
      confirm: "Dem Team beitreten",
      scanAnother: "Andere Einladung scannen",
      errors: {
        invalid: "Das ist kein Einladungslink. Prüfen Sie, ob er vollständig kopiert wurde.",
        notFound:
          "Diese Einladung existiert nicht oder ist abgelaufen. Bitten Sie die Inhaberin oder den Inhaber um eine neue.",
        closed:
          "Diese Einladung wurde bereits verwendet. Bitten Sie die Inhaberin oder den Inhaber um eine neue.",
        expired:
          "Diese Einladung ist abgelaufen. Bitten Sie die Inhaberin oder den Inhaber um eine neue.",
        newer:
          "Diese Einladung stammt aus einer neueren Version der App. Aktualisieren Sie die App und versuchen Sie es erneut.",
        unreachable:
          "Keine Verbindung. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
        removed: "Die Inhaberin oder der Inhaber hat diese Einladung zurückgezogen.",
        alreadySetUp:
          "Dieses Gerät kassiert bereits für ein Geschäft: Es kann keinem Team beitreten."
      }
    }
  },
  integrations: {
    create: "Integration erstellen",
    loading: "Ihre Integrationen werden geladen…",
    guide: {
      title: "Kassieren Sie in Ihrem Onlineshop",
      lead: "Mit einer Integration kann ein Onlineshop oder ein Tool seine Kundschaft über Ihr Konto bezahlen lassen.",
      create: {
        title: "Integration erstellen",
        caption: "Wählen Sie Ihren Shop (WooCommerce, PrestaShop…) oder die Sprache Ihres Servers."
      },
      key: {
        title: "Geheimen Schlüssel übergeben",
        caption:
          "Fügen Sie ihn in Ihren Shop ein oder geben Sie ihn Ihrem Entwicklungsteam. Er bleibt auf dem Server, nie bei Ihrer Kundschaft."
      },
      pay: {
        title: "Ihre Kundschaft bezahlt",
        caption:
          "Bei jeder Bestellung zeigt der Shop die Rechnung an. Die Zahlung kommt in Ihrer Wallet an."
      }
    },
    noMatch: "Keine Integrationen entsprechen den Filtern.",
    offline:
      "Kein Relay hat geantwortet: Die Liste der Integrationen konnte nicht gelesen werden. Prüfen Sie die Verbindung und öffnen Sie diese Seite erneut.",
    partial:
      "Nicht alle Relays haben geantwortet: Die Liste der Integrationen ist möglicherweise unvollständig.",
    newer:
      "Einige Integrationen stammen aus einer neueren Version der App: Aktualisieren Sie die App, um sie zu sehen.",
    columns: {
      name: "Name",
      date: "Erstellt am"
    },
    created: "Erstellt am {{date}}",
    actions: {
      remove: "Integration entfernen"
    },
    createSheet: {
      title: "Neue Integration",
      lead: "Schreiben Sie Ihre Rechnungen mit einer KI, kassieren Sie in Ihrem Onlineshop oder auf Ihrer eigenen Website.",
      invoices: "Rechnungen",
      shops: "Onlineshops",
      developers: "Für Entwicklungsteams",
      developersDetail_one: "SDK: {{names}} und {{count}} weitere",
      developersDetail_other: "SDK: {{names}} und {{count}} weitere",
      soon: "Bald verfügbar",
      soonLabel: "{{name}}: bald verfügbar",
      source: "Quellcode",
      sourceLabel: "{{name}}: Quellcode auf GitHub",
      oneShopTitle: "Ein Schlüssel für nur einen Shop",
      oneShop:
        "Die Server eines Shops teilen seinen Schlüssel, zwei Shops nie: Ihre Bestellungen würden sich vermischen, und eine könnte durch die Zahlung der anderen als bezahlt gelten. Erstellen Sie für einen anderen Shop eine weitere Integration.",
      namePlaceholder: "Onlineshop"
    },
    sdk: {
      lead: "Das {{name}}-SDK erstellt auf Ihrem Server die Rechnung jeder Bestellung und prüft ihre Zahlung.",
      package: "Das Paket",
      open: "Auf {{site}} öffnen",
      openLabel: "{{name}} auf {{site}} öffnen",
      readme: "Seine README erklärt, wie man es installiert und verwendet.",
      key: "Der geheime Schlüssel"
    },
    files: {
      show: "Schritte für {{name}} anzeigen",
      copyName: "Namen {{name}} kopieren",
      nameCopied: "Name kopiert: {{name}}",
      copy: "Inhalt kopieren",
      copied: "Inhalt kopiert",
      contentCopied: "Inhalt von {{name}} kopiert",
      copyFailed: "Das Kopieren hat nicht geklappt. Versuchen Sie es noch einmal.",
      readFailed:
        "Die App konnte diese Datei nicht lesen: Schließen Sie die Anleitung und öffnen Sie sie erneut.",
      lastLine: "Eingefügt endet sie in Zeile {{line}}.",
      pasted: "Eingefügt",
      progress: "Eingefügt: {{count}} von {{total}}"
    },
    keyStep: {
      title: "Den Schlüssel dieses Shops erstellen",
      leadShop:
        "Tun Sie es, wenn das Feld für den Schlüssel in {{platform}} geöffnet ist: Er wird nur einmal angezeigt.",
      leadSdk:
        "Ihr Server liest ihn aus einer Umgebungsvariable, nie aus einer Webseite oder einem Code-Repository. Er wird nur einmal angezeigt.",
      shopName: "Name des Shops",
      siteName: "Name der Website oder des Tools",
      nameHint: "Er erscheint in Ihrem Wallet neben seinen Verkäufen.",
      create: "Schlüssel erstellen"
    },
    guides: {
      wix: {
        editor: {
          title: "Den Code der Website öffnen",
          body: "Öffnen Sie an einem Computer den Editor Ihrer Wix-Website. Klicken Sie oben auf „Dev Mode“ und dann auf „Turn on Dev Mode“: Links im Editor erscheint eine Spalte mit Symbolen. Diese Anleitung zeigt den Wix Editor; in Wix Studio sehen die Bildschirme anders aus. Die Wix-Bezeichnungen hier sind die englischen.",
          image:
            "Das Menü „Dev Mode“ des Wix Editors und seine Schaltfläche „Turn on Dev Mode“, eingerahmt."
        },
        packages: {
          title: "Die Pakete öffnen",
          body: "Klicken Sie in dieser Symbolspalte auf den Würfel („Packages & Apps“). Klicken Sie unter „npm“ auf „+ Install packages from npm“.",
          image:
            "Das Wix-Panel „Packages & Apps“: das Würfelsymbol und der Link „+ Install packages from npm“, eingerahmt."
        },
        install: {
          title: "Zwei Wix-Pakete installieren",
          body: "Ein Fenster „Package Manager“ öffnet sich. Geben Sie in seiner Suche @wix/ecom ein und klicken Sie in der Zeile @wix/ecom auf „Install“ (nicht in einer anderen mit ähnlichem Namen). Warten Sie, bis es fertig ist, und tun Sie dasselbe mit @wix/essentials. Schließen Sie das Fenster: Beide Pakete stehen unter „npm“. Es sind zwei Werkzeuge von Wix, die das Plugin braucht.",
          image:
            "Das Fenster „Package Manager“: @wix/ecom in seiner Suche eingegeben und die Schaltfläche „Install“ der Zeile @wix/ecom, eingerahmt."
        },
        files: {
          title: "Die 6 Dateien anlegen",
          body: "Legen Sie in „Backend & Public“ (das Symbol { } der Spalte) jede Datei an ihrem Platz an, in dieser Reihenfolge, und fügen Sie dann ihren Inhalt ein, von hier kopiert: den des Plugins {{version}}, von der App geprüft.",
          where: {
            js: "Backend › + › Add .js file",
            file: "Backend › + › Add file",
            servicePlugin: "Service Plugins › + › Payment",
            servicePluginConfig: "Service Plugins › payment-provider › sattlemeCheckout"
          },
          how: {
            js: "Nennen Sie sie {{name}} und fügen Sie dann ihren Inhalt ein. Sie ist die größte: Warten Sie, bis Wix sie ganz anzeigt, bevor Sie woanders klicken.",
            file: "Nennen Sie sie {{name}}. Wix setzt ein Beispiel hinein: Alles auswählen (Strg+A, auf einem Mac ⌘A), dann einfügen.",
            servicePlugin:
              "Nennen Sie das Plugin sattlemeCheckout, dann „Add & Edit Code“: Wix legt diese und die nächste Datei an. Prüfen Sie, dass der offene Tab {{name}} ist, alles auswählen, dann einfügen.",
            servicePluginConfig:
              "Wix hat sie mit sattlemeCheckout.js angelegt: Öffnen Sie sie, alles auswählen, dann einfügen."
          },
          sharedCode:
            "Ihre Website hat schon ein eigenes {{name}}? Ersetzen Sie es nicht: Fügen Sie den kopierten Inhalt ganz am Ende Ihrer Datei ein, unter ihren Zeilen.",
          sharedJobs:
            "Ihre Website hat schon ein eigenes {{name}}? Ersetzen Sie es nicht: Fügen Sie die Aufgabe des Plugins (den Block in geschweiften Klammern in seiner Liste „jobs“) der Liste „jobs“ Ihrer Datei hinzu, durch ein Komma getrennt.",
          image:
            "Das Wix-Panel „Backend & Public“: das + von „Backend“ und die Einträge „Add .js file“ und „Add file“ seines Menüs, eingerahmt."
        },
        secrets: {
          title: "Den Secrets Manager öffnen",
          body: "Im Dashboard der Website „Developer Tools“ › „Secrets Manager“. Speichern Sie ein Secret namens sattleme-checkout-status-token mit einem zufälligen Wert von 32 Zeichen oder mehr (aus Ihrem Passwortmanager): das Passwort der Statusseite des Plugins. Dann erneut „+ Add Secret“, mit dem Namen sattleme-checkout-key.",
          image:
            "Der Secrets Manager von Wix: „Secrets Manager“ unter „Developer Tools“ und der Link „+ Add Secret“, eingerahmt."
        },
        save: {
          title: "Den Schlüssel speichern",
          body: "Fügen Sie den Schlüssel als Wert des Secrets sattleme-checkout-key ein und speichern Sie. Er bleibt in diesem Secret: Geben Sie ihn nirgends sonst in Wix ein.",
          image:
            "Das Wix-Fenster „Add secret“ mit dem Namen sattleme-checkout-key: sein leeres Feld „Value“ und seine Schaltfläche „Add Secret“, eingerahmt."
        },
        publish: {
          title: "Einmal veröffentlichen",
          body: "Klicken Sie im Editor nur einmal auf „Publish“: Jeder Klick ist eine Veröffentlichung.",
          image: "Der obere Rand des Wix Editors: die Schaltfläche „Publish“, eingerahmt."
        },
        status: {
          title: "Die Statusseite öffnen",
          body: "Öffnen Sie die Adresse Ihrer Website gefolgt von /_functions/sattlemeCheckoutStatus und geben Sie das Token ein (den Wert des Secrets sattleme-checkout-status-token). Die Seite zeigt das Plugin {{version}}. Tun Sie es vor dem Verbinden: Sie merkt sich die Adresse der Website, auf der Ihre Kunden bezahlen.",
          image: "Die Statusseite des Plugins: ihr Token-Feld und ihre Schaltfläche, eingerahmt."
        },
        connect: {
          title: "Die Zahlung verbinden",
          body: "Im Dashboard „Settings“ › „Accept Payments“ › „Bitcoin (Lightning / on-chain)“ › „Connect“. Erstes Feld: sattleme-checkout-key, der Name des Secrets, nie der Schlüssel selbst. Zweites Feld: 15, die Minuten zum Bezahlen einer Rechnung (1 bis 60). Dann „Connect“.",
          image:
            "Das Verbindungsformular von Wix: sattleme-checkout-key im ersten Feld, 15 im zweiten und die Schaltfläche „Connect“, eingerahmt."
        },
        check: {
          title: "Eine Zahlung testen",
          body: "Geben Sie auf Ihrer Website eine Bestellung auf, zuerst auf einer Test-Website, und wählen Sie „Bitcoin (Lightning / on-chain)“: Die Zahlungsseite des Plugins öffnet sich.",
          image:
            "Die Zahlungsseite des Plugins: „Pay with Bitcoin“, der Betrag in Sats und die verbleibende Zeit zum Bezahlen."
        }
      },
      bebop: {
        open: {
          title: "Die Einstellungen von sattle.me öffnen",
          body: "Öffnen Sie in der Administration von be-BOP „Zahlungen“ → „sattle.me“. Steht es nicht in der Liste, aktualisieren Sie zuerst be-BOP.",
          image:
            "Screenshot von be-BOP: das Menü der Administration, „sattle.me“ unter „Payment Settings“ umrahmt"
        },
        save: {
          title: "Den Schlüssel einfügen und speichern",
          body: "Fügen Sie den Schlüssel in „Integrationsschlüssel (sattle.me-App > Integrationen)“ ein. Um auch Onchain-Zahlungen anzunehmen, setzen Sie das Häkchen bei „Auch On-Chain-Zahlungen annehmen (Methode Bitcoin)“. Klicken Sie dann auf „Speichern“.",
          image:
            "Screenshot von be-BOP: die Einstellungen von sattle.me, das Feld „Integration key“, das Kästchen „Also take on-chain payments“ und die Schaltfläche „Save“ umrahmt"
        },
        test: {
          title: "Die Verbindung testen",
          body: "Klicken Sie auf „Verbindung testen“: be-BOP liest die Integration mit ihrem Schlüssel, ohne eine Rechnung zu erstellen, und zeigt „Verbindung erfolgreich. Die sattle.me-Zugangsdaten funktionieren.“ an. Sind Onchain-Zahlungen aktiviert, prüft es auch, dass die Integration Bitcoin-Adressen hat: Diese App gibt ihr welche bei ihrer Erstellung, dann bei jedem Entsperren mit Ihrem Passkey, mit Internetverbindung. Schlägt der Test fehl, prüfen Sie den Schlüssel, entsperren Sie diese App und testen Sie erneut.",
          image:
            "Screenshot von be-BOP: die Einstellungen von sattle.me, die Schaltfläche „Test connection“ umrahmt"
        },
        prefer: {
          title: "sattle.me an die erste Stelle setzen",
          body: "Nimmt bereits ein anderer Anbieter Lightning- oder Onchain-Zahlungen in Ihrem Shop an, öffnen Sie „Einstellungen“ → „Allgemein“. Wählen Sie unter „Einstellungen der Zahlungsanbieter“ „sattleme“ als „Bevorzugter Lightning-Anbieter“ und „sattleme-onchain“ als „Bevorzugter Bitcoin-On-Chain-Anbieter“ und klicken Sie dann unten auf der Seite auf „Aktualisieren“.",
          image:
            "Screenshot von be-BOP: „Payment processor preferences“, sattleme-onchain und sattleme gewählt und umrahmt"
        },
        check: {
          title: "Ihren Shop prüfen",
          body: "Im Zahlungsschritt kann Ihre Kundschaft jetzt „Lightning“ als „Zahlungsmethode“ wählen, und auch „Onchain“, wenn Sie Onchain-Zahlungen aktiviert haben: be-BOP bietet es ab 10 000 Sats an. Ist die Bestellung aufgegeben, bezahlt sie sie, indem sie einen QR-Code scannt. Eine Onchain-Zahlung bezahlt die Bestellung nach 3 Bestätigungen, nach etwa 30 Minuten, mit niedriger Gebühr später. Jede Zahlung ist eine echte Bitcoin-Zahlung an Ihre Wallet.",
          image:
            "Screenshot eines be-BOP-Shops: „Lightning“ als „Payment method“ im Zahlungsschritt"
        }
      },
      pretix: {
        plugins: {
          title: "Die Erweiterungen der Veranstaltung öffnen",
          body: "Öffnen Sie im Backend von pretix Ihre Veranstaltung, dann in ihrem Menü „Einstellungen“ → „Erweiterungen“.",
          image:
            "Screenshot von pretix: das Menü der Veranstaltung, „Plugins“ unter „Settings“ umrahmt"
        },
        enable: {
          title: "Das Plugin aktivieren",
          body: "Suchen Sie nach „sattle.me“ und klicken Sie dann auf „Aktivieren“.",
          image:
            "Screenshot von pretix: die Erweiterungen, gefiltert nach „sattle.me“, ihre Schaltfläche „Enable“ umrahmt"
        },
        open: {
          title: "Seine Einstellungen öffnen",
          body: "Klicken Sie unter „Einstellungen“ → „Zahlung“ neben „Bitcoin (sattle.me)“ auf „Einstellungen“.",
          image:
            "Screenshot von pretix: die Zahlungsmethoden, die Schaltfläche „Settings“ von „Bitcoin (sattle.me)“ umrahmt"
        },
        save: {
          title: "Den Schlüssel einfügen und speichern",
          body: "Setzen Sie das Häkchen bei „Aktiviere Zahlungsmethode“, fügen Sie den Schlüssel in „Integrationsschlüssel“ ein und klicken Sie dann unten auf der Seite auf „Speichern“: pretix prüft ihn und zeigt ihn danach nie wieder an. „Zeit zum Bezahlen“ ist die Zeit, die die Kundschaft zum Bezahlen einer Rechnung hat: 1 bis 60 Minuten, standardmäßig 15.",
          image:
            "Screenshot von pretix: die Einstellungen von Bitcoin (sattle.me), das Kästchen „Enable payment method“ und das Feld „Integration key“ umrahmt"
        },
        channels: {
          title: "Die Verkaufskanäle wählen",
          body: "Auf derselben Seite legt „Auf bestimmte Verkaufskanäle einschränken“ fest, wo Ihre Kundschaft in Bitcoin zahlen kann: standardmäßig im „Online-Shop“. Setzen Sie das Häkchen bei den weiteren gewünschten Kanälen und klicken Sie dann auf „Speichern“.",
          image:
            "Screenshot von pretix: „Restrict to specific sales channels“, sein Kästchen „Online shop“ umrahmt"
        },
        check: {
          title: "Ihren Shop prüfen",
          body: "Im Zahlungsschritt kann Ihre Kundschaft jetzt „Bitcoin“ wählen und dann einen QR-Code scannen: per Lightning unter etwa 1000 Sats, darüber per Lightning oder onchain. Eine Onchain-Zahlung erscheint in weniger als einer Minute als in Bestätigung und bezahlt die Bestellung nach 3 Bestätigungen, nach etwa 30 Minuten, mit niedriger Gebühr später. Antwortet mempool.space zu langsam, kann eine Rechnung nur per Lightning erstellt werden. Auch im Testmodus von pretix ist jede Zahlung eine echte Bitcoin-Zahlung an Ihre Wallet.",
          image: "Screenshot eines pretix-Shops: „Bitcoin“ im Zahlungsschritt"
        }
      },
      nopcommerce: {
        download: {
          title: "Das Plugin herunterladen",
          body: "Laden Sie das Plugin herunter: ein .zip-Archiv, das Sie so lassen, wie es ist, ohne es zu entpacken. Es benötigt nopCommerce 5.00.",
          link: "Marketplace von nopCommerce öffnen",
          file: "Version {{version}} herunterladen"
        },
        plugins: {
          title: "Die lokalen Plugins öffnen",
          body: "Öffnen Sie in der Administration von nopCommerce „Configuration“ → „Local plugins“.",
          image: "Screenshot von nopCommerce: das Menü der Administration, „Local plugins“ umrahmt"
        },
        upload: {
          title: "Das Archiv hochladen",
          body: "Klicken Sie auf „Upload plugin or theme“, wählen Sie das Archiv und klicken Sie dann im sich öffnenden Fenster auf „Upload plugin or theme“.",
          image:
            "Screenshot von nopCommerce: das Fenster „Upload plugin or theme“, das Archiv gewählt, seine Schaltfläche „Upload plugin or theme“ umrahmt"
        },
        restart: {
          title: "nopCommerce neu starten",
          body: "Klicken Sie oben auf der Seite auf „Restart application to apply changes“ und warten Sie, bis die Seite wieder erscheint: Während nopCommerce neu startet, antwortet Ihr Shop nicht. Erst nach diesem Neustart steht das Plugin in der Liste.",
          image:
            "Screenshot von nopCommerce: „Local plugins“, die Schaltfläche „Restart application to apply changes“ umrahmt"
        },
        install: {
          title: "Das Plugin installieren",
          body: "Suchen Sie in der Liste „Bitcoin (sattle.me)“ in der Gruppe „Payment methods“, klicken Sie auf „Install“ und dann erneut auf „Restart application to apply changes“.",
          image:
            "Screenshot von nopCommerce: das Plugin Bitcoin (sattle.me) in der Liste, seine Schaltfläche „Install“ umrahmt"
        },
        open: {
          title: "Seine Einstellungen öffnen",
          body: "Sobald nopCommerce neu gestartet ist, klicken Sie unter „Bitcoin (sattle.me)“ auf „Configure“. Sie finden es auch unter „Configuration“ → „Payment methods“.",
          image:
            "Screenshot von nopCommerce: das installierte Plugin Bitcoin (sattle.me), seine Schaltfläche „Configure“ umrahmt"
        },
        save: {
          title: "Den Schlüssel einfügen und speichern",
          body: "Setzen Sie das Häkchen bei „Enabled“, fügen Sie den Schlüssel in „Integration key“ ein und klicken Sie dann unten auf der Seite auf „Save“: Das Plugin prüft ihn und zeigt ihn danach nie wieder an. „Time to pay (minutes)“ ist die Zeit, die die Kundschaft zum Bezahlen einer Rechnung hat: 1 bis 60 Minuten, standardmäßig 15.",
          image:
            "Screenshot von nopCommerce: die Einstellungen von Bitcoin (sattle.me), das Kästchen „Enabled“ und das Feld „Integration key“ umrahmt"
        },
        check: {
          title: "Ihren Shop prüfen",
          body: "Im Zahlungsschritt kann Ihre Kundschaft jetzt „Bitcoin“ wählen. Ist die Bestellung bestätigt, bezahlt sie sie auf einer Seite Ihres Shops, indem sie einen QR-Code scannt: per Lightning unter etwa 1000 Sats, darüber per Lightning oder onchain. Eine Onchain-Zahlung bezahlt die Bestellung nach 3 Bestätigungen, nach etwa 30 Minuten, mit niedriger Gebühr später. Die Zahlungen werden auch von den geplanten Aufgaben von nopCommerce geprüft, die die URL Ihres Shops erreichen müssen. Jede Zahlung ist eine echte Bitcoin-Zahlung an Ihre Wallet.",
          image: "Screenshot eines nopCommerce-Shops: „Bitcoin“ im Zahlungsschritt"
        },
        autoCancel: {
          title: "Bitcoin von der automatischen Stornierung ausnehmen",
          body: "Ist „Enable auto-canceling of unpaid orders“ aktiviert („Configuration“ → „Settings“ → „Order settings“), fügen Sie „Bitcoin (sattle.me)“ zu dessen „Excluded payment methods“ hinzu, damit eine Bestellung, deren Zahlung bestätigt wird, nicht storniert wird."
        }
      },
      woocommerce: {
        download: {
          title: "Plugin herunterladen",
          body: "Laden Sie die Datei des Plugins herunter, sattleme-for-woocommerce-….zip, und lassen Sie sie, wie sie ist, ohne sie zu entpacken. Das Plugin benötigt WordPress 7.0, WooCommerce 11.1 und PHP 8.2 oder neuer.",
          link: "GitHub-Seite des Plugins öffnen",
          file: "Version {{version}} herunterladen"
        },
        upload: {
          title: "Datei hochladen",
          body: "Öffnen Sie in der Administration von WordPress „Plugins“ → „Plugin hinzufügen“, klicken Sie oben auf der Seite auf „Plugin hochladen“, wählen Sie die Datei und klicken Sie dann auf „Jetzt installieren“.",
          image:
            "Screenshot von WordPress: „Upload Plugin“ und die gewählte Datei, die Schaltflächen „Upload Plugin“ und „Install Now“ umrahmt"
        },
        activate: {
          title: "Plugin aktivieren",
          body: "Ist das Plugin installiert, klicken Sie auf „Plugin aktivieren“.",
          image:
            "Screenshot von WordPress: das installierte Plugin, seine Schaltfläche „Activate Plugin“ umrahmt"
        },
        open: {
          title: "Einstellungen öffnen",
          body: "Klicken Sie unter „Plugins“ bei „sattle.me for WooCommerce“ auf „Einstellungen“. Sie erreichen sie auch über „WooCommerce“ → „Einstellungen“ → „Zahlungen“, unter dem Namen „sattle.me (Bitcoin)“.",
          image:
            "Screenshot von WordPress: das Plugin sattle.me for WooCommerce in der Liste der Plugins, sein Link „Settings“ umrahmt"
        },
        save: {
          title: "Schlüssel einfügen und speichern",
          body: "Aktivieren Sie „Bitcoin-Zahlungen mit sattle.me akzeptieren“, fügen Sie den Schlüssel unter „Integrationsschlüssel“ ein und klicken Sie dann unten auf der Seite auf „Änderungen speichern“: Das Plugin prüft den Schlüssel und zeigt ihn danach nie wieder an. Die Seite zeigt dann „Verbunden mit“, gefolgt vom Namen Ihres Unternehmens. „Zahlungsfrist“ ist die Zeit, die die Kundschaft hat, um eine Rechnung zu bezahlen: 1 bis 60 Minuten, standardmäßig 15.",
          image:
            "Screenshot von WordPress: die gespeicherten Einstellungen von sattle.me (Bitcoin), „Connected to“ und das aktivierte Kästchen umrahmt"
        },
        check: {
          title: "Shop prüfen",
          body: "Im Zahlungsschritt kann Ihre Kundschaft jetzt in Bitcoin bezahlen, mit dem Logo von sattle.me. Ist die Bestellung aufgegeben, bezahlt sie sie auf einer Seite Ihres Shops, indem sie einen QR-Code scannt: per Lightning unter etwa 1000 Sats, darüber per Lightning oder onchain. Eine Onchain-Zahlung bezahlt die Bestellung nach 3 Bestätigungen, nach etwa 30 Minuten, mit niedriger Gebühr später. Das Plugin prüft die Zahlungen außerdem jede Minute, auch wenn die Zahlungsseite geschlossen ist, mit den geplanten Aufgaben von WordPress (WP-Cron): Lassen Sie sie bei einem Shop mit wenigen Besuchen jede Minute vom Cron Ihres Servers ausführen, wie es das README des Plugins erklärt. Jede Zahlung ist eine echte Bitcoin-Zahlung auf Ihr Wallet.",
          image: "Screenshot eines WooCommerce-Shops: die Bitcoin-Zahlung im Zahlungsschritt"
        }
      },
      grandnode: {
        download: {
          title: "Das Plugin herunterladen",
          body: "Laden Sie das Archiv des Plugins herunter, Payments.Sattleme-….zip, und lassen Sie es, wie es ist, ohne es zu entpacken. Das Plugin benötigt GrandNode 2.4.",
          link: "GitHub-Seite des Plugins öffnen",
          file: "Version {{version}} herunterladen"
        },
        plugins: {
          title: "Die lokalen Plugins öffnen",
          body: "Öffnen Sie in der Administration von GrandNode „Plugins“ → „Local plugins“.",
          image:
            "Screenshot von GrandNode: das Menü „Plugins“ der Administration, „Local plugins“ umrahmt"
        },
        upload: {
          title: "Das Archiv hochladen",
          body: "Klicken Sie oben auf der Seite auf „Upload“, wählen Sie das Archiv und klicken Sie dann im sich öffnenden Fenster auf „Upload“. GrandNode zeigt „Plugin uploaded“ an und hält dann an, um neu zu starten: Laden Sie die Seite im Browser neu (nicht mit „Reload list of plugins“, das GrandNode erneut anhält), bis die Liste der Plugins wieder erscheint; Ihr Shop antwortet in der Zwischenzeit nicht. Antwortet er nach einigen Minuten noch immer nicht, starten Sie GrandNode neu (seinen Dienst oder seinen Container).",
          image:
            "Screenshot von GrandNode: das Fenster „Upload“, das Archiv gewählt, seine Schaltfläche „Upload“ umrahmt"
        },
        install: {
          title: "Das Plugin installieren",
          body: "Suchen Sie in der Liste „Bitcoin (sattle.me)“ in der Gruppe „Payment methods“: Seine Kennzeichnung „Installed“ bleibt rot, bis es installiert ist. Klicken Sie auf „Install“: GrandNode startet noch einmal neu. Laden Sie die Seite ebenso neu.",
          image:
            "Screenshot von GrandNode: das Plugin Bitcoin (sattle.me) in der Liste, seine Schaltfläche „Install“ umrahmt"
        },
        open: {
          title: "Seine Einstellungen öffnen",
          body: "Sobald bei „Bitcoin (sattle.me)“ „Configure“ erscheint, klicken Sie darauf. Sie finden seine Einstellungen auch unter „Configuration“ → „Payment“ → „Payment methods“, unter dem Namen „Bitcoin“.",
          image:
            "Screenshot von GrandNode: das Plugin Bitcoin (sattle.me), installiert, seine Schaltfläche „Configure“ umrahmt"
        },
        save: {
          title: "Den Schlüssel einfügen und speichern",
          body: "Schalten Sie „Enabled“ ein, fügen Sie den Schlüssel in „Integration key“ ein und klicken Sie dann oben auf der Seite auf „Save“: Das Plugin prüft ihn und zeigt ihn danach nie wieder an. „Time to pay (minutes)“ ist die Zeit, die die Kundschaft zum Bezahlen einer Rechnung hat: 1 bis 60 Minuten, standardmäßig 15. In einer Administration auf Deutsch heißen diese Einstellungen „Aktiviert“, „Integrationsschlüssel“ und „Zahlungsfrist (Minuten)“.",
          image:
            "Screenshot von GrandNode: die Einstellungen von Bitcoin (sattle.me), „Enabled“, das Feld „Integration key“ und „Save“ umrahmt"
        },
        check: {
          title: "Ihren Shop prüfen",
          body: "Im Zahlungsschritt kann Ihre Kundschaft jetzt in Bitcoin bezahlen, mit dem Logo von sattle.me. Ist die Bestellung bestätigt, bezahlt sie sie auf einer Seite Ihres Shops, indem sie einen QR-Code scannt: per Lightning unter etwa 1000 Sats, darüber per Lightning oder onchain. Eine Onchain-Zahlung bezahlt die Bestellung nach 3 Bestätigungen, nach etwa 30 Minuten, mit niedriger Gebühr später. GrandNode prüft die Zahlungen außerdem jede Minute, auch wenn die Zahlungsseite geschlossen ist. Jede Zahlung ist eine echte Bitcoin-Zahlung an Ihre Wallet.",
          image: "Screenshot eines GrandNode-Shops: die Bitcoin-Zahlung im Zahlungsschritt"
        }
      },
      smartstore: {
        download: {
          title: "Das Plugin herunterladen",
          body: "Laden Sie das Paket des Plugins herunter, Smartstore.Module.Sattleme.Bitcoin.….zip, und lassen Sie es, wie es ist, ohne es zu entpacken. Das Plugin benötigt Smartstore 6.4.",
          link: "GitHub-Seite des Plugins öffnen",
          file: "Version {{version}} herunterladen"
        },
        plugins: {
          title: "Die Plugins öffnen",
          body: "Öffnen Sie in der Administration von Smartstore „Plugins“ → „Manage plugins“.",
          image:
            "Screenshot von Smartstore: das Menü „Plugins“ der Administration, „Manage plugins“ umrahmt"
        },
        upload: {
          title: "Das Paket hochladen",
          body: "Klicken Sie oben auf der Seite auf „Upload plugin“ und wählen Sie das Paket: Smartstore lädt es sofort hoch und bestätigt, dass es hochgeladen und entpackt ist.",
          image:
            "Screenshot von Smartstore: die Seite der Plugins, ihre Schaltfläche „Upload plugin“ umrahmt"
        },
        reload: {
          title: "Die Liste der Plugins neu laden",
          body: "Klicken Sie auf „Edit“ → „Reload list of plugins“. Smartstore startet neu: Warten Sie, bis die Seite wieder erscheint, Ihr Shop antwortet in der Zwischenzeit nicht.",
          image: "Screenshot von Smartstore: das Menü „Edit“, „Reload list of plugins“ umrahmt"
        },
        install: {
          title: "Das Plugin installieren",
          body: "Suchen Sie in der Liste „Bitcoin (sattle.me)“ und klicken Sie auf „Install“: Smartstore stellt die Installation in die Warteschlange.",
          image:
            "Screenshot von Smartstore: das Plugin Bitcoin (sattle.me) in der Liste, seine Schaltfläche „Install“ umrahmt"
        },
        execute: {
          title: "Die Installation ausführen",
          body: "Klicken Sie oben auf der Seite auf „Execute tasks“, dann auf „OK“. Smartstore startet erneut neu und installiert das Plugin: Warten Sie, bis die Seite wieder erscheint.",
          image:
            "Screenshot von Smartstore: die Seite der Plugins, ihre Schaltfläche „Execute tasks“ umrahmt"
        },
        open: {
          title: "Seine Einstellungen öffnen",
          body: "Klicken Sie unter „Bitcoin (sattle.me)“ auf die Zahnrad-Schaltfläche, dann auf „Configure“. Sie finden seine Einstellungen auch unter „Configuration“ → „Payment methods“, unter dem Namen „Bitcoin“.",
          image:
            "Screenshot von Smartstore: das Plugin Bitcoin (sattle.me), installiert, sein Zahnrad und „Configure“ umrahmt"
        },
        save: {
          title: "Den Schlüssel einfügen und speichern",
          body: "Fügen Sie den Schlüssel in „Integration key“ ein und klicken Sie dann oben auf der Seite auf „Save“: Das Plugin prüft ihn und zeigt ihn danach nie wieder an. „Time to pay (minutes)“ ist die Zeit, die die Kundschaft zum Bezahlen einer Rechnung hat: 1 bis 60 Minuten, standardmäßig 15. In einer deutschen Administration nennt das Plugin diese Einstellungen „Integrationsschlüssel“ und „Zahlungsfrist (Minuten)“.",
          image:
            "Screenshot von Smartstore: die Einstellungen von Bitcoin (sattle.me), das Feld „Integration key“ und „Save“ umrahmt"
        },
        activate: {
          title: "Die Zahlungsart aktivieren",
          body: "Öffnen Sie „Configuration“ → „Payment methods“ und klicken Sie unter „Bitcoin“ auf „Activate“: Ihr Shop bietet sie an der Kasse erst an, wenn sie aktiv ist.",
          image:
            "Screenshot von Smartstore: die Zahlungsarten, die Schaltfläche „Activate“ von Bitcoin umrahmt"
        },
        timezone: {
          title: "Die Zeitzone Ihres Shops einstellen",
          body: "Wählen Sie unter „Configuration“ → „Settings“ Ihre „Default store time zone“ und speichern Sie: Die Zahlungsseite zeigt darin, bis wann die Kundschaft bezahlen kann. Ohne sie nimmt Smartstore die seines Servers, oft UTC."
        },
        check: {
          title: "Ihren Shop prüfen",
          body: "Im Zahlungsschritt kann Ihre Kundschaft jetzt „Bitcoin“ wählen. Ist die Bestellung bestätigt, bezahlt sie sie auf einer Seite Ihres Shops, indem sie einen QR-Code scannt: per Lightning unter etwa 1000 Sats, darüber per Lightning oder onchain. Eine Onchain-Zahlung bezahlt die Bestellung nach 3 Bestätigungen, nach etwa 30 Minuten, mit niedriger Gebühr später. Smartstore prüft die Zahlungen außerdem jede Minute, auch wenn die Zahlungsseite geschlossen ist, solange seine geplanten Aufgaben die Adresse Ihres Shops erreichen. Jede Zahlung ist eine echte Bitcoin-Zahlung an Ihre Wallet.",
          image: "Screenshot eines Smartstore-Shops: „Bitcoin“ im Zahlungsschritt"
        }
      },
      prestashop: {
        download: {
          title: "Das Modul herunterladen",
          body: "Laden Sie die Datei des Moduls herunter, sattleme.zip, und lassen Sie sie, wie sie ist, ohne sie zu entpacken. Das Modul benötigt PrestaShop 9.0, 9.1 oder 9.2, mit PHP 8.2 bis 8.5.",
          link: "GitHub-Seite des Moduls öffnen",
          file: "Version {{version}} herunterladen"
        },
        upload: {
          title: "Den Modul-Manager öffnen",
          body: "Öffnen Sie im Backoffice von PrestaShop „Modules“ → „Module Manager“ und klicken Sie dann oben auf der Seite auf „Upload a module“.",
          image:
            "Screenshot von PrestaShop: der Modul-Manager, seine Schaltfläche „Upload a module“ umrahmt"
        },
        drop: {
          title: "Die Datei hochladen",
          body: "Ziehen Sie die Datei in das Fenster, oder klicken Sie auf „select file“ und wählen Sie sie: PrestaShop lädt das Modul hoch und installiert es sofort.",
          image:
            "Screenshot von PrestaShop: das Fenster „Upload a module“, sein Bereich für die Datei umrahmt"
        },
        open: {
          title: "Seine Einstellungen öffnen",
          body: "Sobald PrestaShop „Module installed!“ anzeigt, klicken Sie auf „Configure“. Sie finden seine Einstellungen auch unter „Modules“ → „Module Manager“, unter „sattle.me“.",
          image:
            "Screenshot von PrestaShop: „Module installed!“, seine Schaltfläche „Configure“ umrahmt"
        },
        save: {
          title: "Den Schlüssel einfügen und speichern",
          body: "Schalten Sie „Accept bitcoin payments“ ein, fügen Sie den Schlüssel in „Integration key“ ein und klicken Sie dann unten auf der Seite auf „Save“: Das Modul prüft den Schlüssel und zeigt ihn danach nie wieder an. Die Seite zeigt dann „The integration key of“, gefolgt vom Namen Ihres Geschäfts. „Time to pay“ ist die Zeit, die die Kundschaft zum Bezahlen einer Rechnung hat: 1 bis 60 Minuten, standardmäßig 15. In einem deutschen Backoffice nennt das Modul diese Einstellungen „Bitcoin-Zahlungen akzeptieren“, „Integrationsschlüssel“ und „Zahlungsfrist“.",
          image:
            "Screenshot von PrestaShop: die Einstellungen von sattle.me, „Accept bitcoin payments“ und das Feld „Integration key“ umrahmt"
        },
        cron: {
          title: "Die Prüfungen im Hintergrund einrichten",
          body: "Unter „Background checks“ gibt die Seite eine Zeile für die Crontab Ihres Servers: Fügen Sie sie der Crontab des Benutzers des Webservers hinzu, oder als Cronjob im Panel Ihres Hostings, damit sie jede Minute läuft. Das Modul prüft die Zahlungen dann jede Minute, auch wenn die Zahlungsseite geschlossen ist. Solange sie nicht gelaufen ist, zeigt die Seite „The background checks never ran: set up the cron.“ In einem deutschen Backoffice nennt das Modul diesen Teil „Prüfungen im Hintergrund“.",
          image:
            "Screenshot von PrestaShop: die Einstellungen von sattle.me gespeichert, die Crontab-Zeile unter „Background checks“ umrahmt"
        },
        check: {
          title: "Ihren Shop prüfen",
          body: "Im Zahlungsschritt kann Ihre Kundschaft jetzt „Pay with bitcoin“ wählen („Mit Bitcoin bezahlen“ in einem deutschen Shop). Ist die Bestellung aufgegeben, bezahlt sie sie auf einer Seite Ihres Shops, indem sie einen QR-Code scannt: per Lightning unter etwa 1000 Sats, darüber per Lightning oder onchain. Eine Onchain-Zahlung bezahlt die Bestellung nach 3 Bestätigungen, nach etwa 30 Minuten, mit niedriger Gebühr später. Jede Zahlung ist eine echte Bitcoin-Zahlung an Ihre Wallet.",
          image: "Screenshot eines PrestaShop-Shops: „Pay with bitcoin“ im Zahlungsschritt"
        }
      },
      magento: {
        install: {
          title: "Das Modul installieren",
          body: "Installieren Sie das Modul auf dem Server Ihres Magento, im Stammordner von Magento und als Benutzer des Webservers, mit Composer von Packagist und aktivieren Sie es dann mit diesen Befehlen. Das Modul braucht Magento Open Source 2.4.7, 2.4.8 oder 2.4.9 mit PHP 8.2 bis 8.5. Im Entwicklermodus sind „setup:di:compile“ und „setup:static-content:deploy“ nicht nötig.",
          link: "Packagist-Seite des Moduls öffnen"
        },
        open: {
          title: "Seine Einstellungen öffnen",
          body: "Öffnen Sie im Admin von Magento „Stores“ → „Configuration“, dann „Sales“ → „Payment Methods“, und klappen Sie „Bitcoin (sattle.me)“ auf.",
          image: "Screenshot des Magento-Admins: die Zahlungsarten, „Bitcoin (sattle.me)“ umrahmt"
        },
        save: {
          title: "Den Schlüssel einfügen und speichern",
          body: "Stellen Sie „Enabled“ auf „Yes“, fügen Sie den Schlüssel in „Integration key“ ein und klicken Sie dann oben auf der Seite auf „Save Config“: Das Modul prüft den Schlüssel und zeigt ihn danach nie wieder an. „Connected to“ zeigt dann den Namen Ihres Geschäfts. „Time to pay (minutes)“ ist die Zeit, die die Kundschaft zum Bezahlen einer Rechnung hat: 1 bis 60 Minuten, standardmäßig 15. In einem deutschen Admin nennt das Modul diese Einstellungen „Aktiviert“, „Integrationsschlüssel“, „Verbunden mit“ und „Zahlungsfrist (Minuten)“.",
          image:
            "Screenshot des Magento-Admins: die Einstellungen von Bitcoin (sattle.me), „Enabled“ und das Feld „Integration key“ umrahmt"
        },
        cron: {
          title: "Den Cron von Magento prüfen",
          body: "Das Modul prüft die Zahlungen jede Minute, auch wenn die Zahlungsseite geschlossen ist, über den Cron von Magento, der auch die unbezahlt gebliebenen Bestellungen storniert. Ein Magento im Produktivbetrieb führt ihn bereits aus; ist das bei Ihrem nicht der Fall, richten Sie ihn im Stammordner von Magento, als Benutzer des Webservers, mit diesem Befehl ein."
        },
        check: {
          title: "Ihren Shop prüfen",
          body: "Im Zahlungsschritt kann Ihre Kundschaft jetzt „Bitcoin“ wählen. Ist die Bestellung aufgegeben, bezahlt sie sie auf einer Seite Ihres Shops, indem sie einen QR-Code scannt: per Lightning unter etwa 1000 Sats, darüber per Lightning oder onchain. Eine Onchain-Zahlung bezahlt die Bestellung nach 3 Bestätigungen, nach etwa 30 Minuten, mit niedriger Gebühr später. Jede Zahlung ist eine echte Bitcoin-Zahlung an Ihre Wallet.",
          image: "Screenshot eines Magento-Shops: „Bitcoin“ im Zahlungsschritt"
        }
      }
    },
    assistant: {
      row: "KI-Assistent",
      rowDetail: "Claude, ChatGPT… schreiben Ihre Rechnungen",
      title: "KI-Assistent",
      lead: "Ihr KI-Assistent schreibt die Rechnungen Ihres Geschäfts, in derselben Nummernfolge wie Ihre eigenen, mit Zahlungslink und PDF, und sagt Ihnen, wann sie bezahlt sind. Er gibt nie etwas aus.",
      hosted: {
        title: "In Claude, ChatGPT…",
        detail: "Sofort einsatzbereit, gehostet von sattle.me",
        badge: "Am einfachsten"
      },
      desktop: { title: "In Claude Desktop", detail: "Der Schlüssel bleibt auf Ihrem Computer" },
      selfHosted: {
        title: "Auf Ihrem eigenen Server",
        detail: "Sein Open-Source-Code, auf GitHub",
        badge: "Für Fachleute"
      },
      hostedSteps: {
        add: {
          title: "Konnektor hinzufügen",
          claude:
            "In Claude öffnet diese Schaltfläche das Hinzufügen des Konnektors, bereits ausgefüllt: Prüfen Sie es und bestätigen Sie.",
          other:
            "Fügen Sie in ChatGPT oder einer anderen KI-App einen benutzerdefinierten Konnektor (MCP-Server) mit genau dieser Adresse hinzu:"
        },
        addClaude: "Zu Claude hinzufügen",
        openChatGpt: "ChatGPT öffnen",
        copy: "Adresse kopieren",
        copied: "Adresse kopiert",
        copyFailed: "Die Adresse konnte nicht kopiert werden",
        connect: {
          title: "Verbinden",
          body: "Die App öffnet eine Seite von sattle.me, die den Schlüssel des Assistenten verlangt. Diese Seite zeigt, wohin sie Sie zurückführt: Fahren Sie nur fort, wenn es Ihre KI-App ist."
        }
      },
      desktopSteps: {
        download: {
          title: "Erweiterung herunterladen",
          body: "Die Datei „.mcpb“ der neuesten Version.",
          link: "Die Erweiterung auf github.com",
          file: "Version {{version}} herunterladen"
        },
        open: {
          title: "Öffnen",
          body: "Öffnen Sie die Datei: Claude Desktop installiert den Assistenten und verlangt seinen Schlüssel."
        }
      },
      selfHostedSteps: {
        install: {
          title: "Server installieren",
          body: "Derselbe MCP-Server wie der von sattle.me, auf einem eigenen Rechner oder dem Ihres Dienstleisters, mit Docker. Sein Open-Source-Code und seine Installationsanleitung sind auf GitHub.",
          link: "sattleme/mcp-server auf github.com"
        },
        trust: {
          title: "Dieser Server sieht Ihre Rechnungen",
          body: "Wer ihn betreibt, sieht den Schlüssel des Assistenten und die Rechnungen, die er schreibt: Namen und Adressen Ihrer Kunden, Beträge. Wenn Sie ihm nicht mehr vertrauen, entfernen Sie den Assistenten: Er hört sofort auf."
        },
        add: {
          title: "Konnektor hinzufügen",
          body: "Sobald der Server online ist, fügen Sie seine Adresse in Ihrer KI-App (Claude, ChatGPT…) als benutzerdefinierten Konnektor hinzu."
        },
        connect: {
          title: "Verbinden",
          body: "Die App öffnet eine Seite Ihres Servers, die den Schlüssel des Assistenten verlangt. Diese Seite zeigt, wohin sie Sie zurückführt: Fahren Sie nur fort, wenn es Ihre KI-App ist."
        }
      },
      keyStep: {
        title: "Schlüssel des Assistenten erstellen",
        leadHosted:
          "Tun Sie es, wenn die Seite von sattle.me danach fragt: Er wird nur einmal angezeigt.",
        leadDesktop: "Tun Sie es, wenn Claude Desktop danach fragt: Er wird nur einmal angezeigt.",
        leadSelfHosted:
          "Tun Sie es, wenn die Seite Ihres Servers danach fragt: Er wird nur einmal angezeigt.",
        name: "Name des Assistenten",
        namePlaceholder: "Claude von Alice",
        nameHint: "Er erscheint in Ihrem Wallet neben seinen Rechnungen.",
        permissionsTitle: "Was dieser Assistent darf",
        nonePicked: "Aktivieren Sie mindestens eine Berechtigung, um den Schlüssel zu erstellen.",
        powerTitle: "Mit ihm lässt sich nie etwas ausgeben",
        power: {
          hosted: "Fügen Sie ihn nur in die Seite von sattle.me ein, nie in ein Gespräch.",
          desktop: "Fügen Sie ihn nur in Claude Desktop ein, nie in ein Gespräch.",
          selfHosted: "Fügen Sie ihn nur in die Seite Ihres Servers ein, nie in ein Gespräch."
        }
      },
      keySheet: {
        once: "Er wird nur einmal angezeigt: Kopieren Sie ihn jetzt. Er kann nie wieder angezeigt werden, auch nicht mit Ihrem Passkey. Geht er verloren, entfernen Sie den Assistenten und erstellen Sie einen neuen.",
        unpublished:
          "Der Assistent {{name}} konnte noch nicht auf Ihren Relais veröffentlicht werden. Das geschieht beim nächsten Entsperren mit Ihrem Passkey, mit Internetverbindung: Bis dahin kann er nichts tun.",
        secret:
          "Halten Sie ihn geheim. Ist er bekannt geworden, entfernen Sie den Assistenten und erstellen Sie einen neuen: Bereits geschriebene Rechnungen bleiben zahlbar.",
        pasteHosted:
          "Fügen Sie ihn in die Seite von sattle.me ein. Bitten Sie dann zum Beispiel: „Schreib eine Rechnung an Dupont SA für 3 Tage Beratung zu 1200 CHF, fällig in 30 Tagen.“",
        pasteDesktop:
          "Fügen Sie ihn in das Feld „Assistant key“ von Claude Desktop ein. Bitten Sie dann zum Beispiel: „Schreib eine Rechnung an Dupont SA für 3 Tage Beratung zu 1200 CHF, fällig in 30 Tagen.“",
        pasteSelfHosted:
          "Fügen Sie ihn in die Seite Ihres Servers ein. Bitten Sie dann zum Beispiel: „Schreib eine Rechnung an Dupont SA für 3 Tage Beratung zu 1200 CHF, fällig in 30 Tagen.“",
        pasteHostedExport:
          "Fügen Sie ihn in die Seite von sattle.me ein. Bitten Sie dann zum Beispiel: „Exportiere die Transaktionen des letzten Monats als CSV für meine Buchhaltung.“",
        pasteSelfHostedExport:
          "Fügen Sie ihn in die Seite Ihres Servers ein. Bitten Sie dann zum Beispiel: „Exportiere die Transaktionen des letzten Monats als CSV für meine Buchhaltung.“",
        pasteDesktopExport:
          "Fügen Sie ihn in das Feld „Assistant key“ von Claude Desktop ein. Bitten Sie dann zum Beispiel: „Exportiere die Transaktionen des letzten Monats als CSV für meine Buchhaltung.“"
      },
      created: "KI-Assistent · erstellt am {{date}}",
      createdExporting: "KI-Assistent · erstellt am {{date}} · exportiert Ihre Transaktionen",
      createdExportOnly:
        "KI-Assistent · erstellt am {{date}} · exportiert Ihre Transaktionen, ohne Rechnungen",
      createdNoInvoices: "KI-Assistent · erstellt am {{date}} · ohne Rechnungen",
      invoicing: {
        switch: "Rechnungen schreiben",
        switchHint:
          "Wenn Sie dies aktivieren, erlauben Sie diesem KI-Assistenten, Rechnungen im Namen Ihres Geschäfts zu schreiben, in derselben Nummernfolge wie Ihre, und die von ihm geschriebenen zu lesen, mit den Namen und Adressen Ihrer Kunden. Diese Wahl lässt sich für diesen Schlüssel nicht mehr ändern."
      },
      export: {
        allow: "Export der Transaktionen erlauben",
        withdraw: "Export der Transaktionen beenden",
        switch: "Zugriff auf Ihre Verkäufe und Zahlungsausgänge",
        switchHint:
          "Wenn Sie dies aktivieren, erlauben Sie diesem KI-Assistenten, die Verkäufe und Zahlungsausgänge Ihres Geschäfts zu lesen, um sie zu exportieren. Er kann nie etwas ausgeben.",
        suspended:
          "Vorübergehend nicht verfügbar: Der Zugriff von KI-Assistenten auf Ihre Verkäufe und Zahlungsausgänge wird in einer künftigen Version wieder angeboten.",
        allowDialog: {
          title: "{{name}} erlauben, Ihre Transaktionen zu exportieren?",
          body: "{{name}} kann die auf Ihren Relays gespeicherten Verkäufe und Zahlungsausgänge von {{business}} lesen und sie wie „$t(navigation.destinations.wallet) › $t(walletExport.open)“ exportieren. Zahlungen ohne Verkauf (direkt an Ihre Lightning-Adresse oder Ihre Wallet) sind nicht dabei. Er kann nie etwas ausgeben. Wenn Sie es beenden, exportiert er nichts mehr, aber eine bis dahin erstellte Kopie seines Schlüssels könnte Ihre zuvor erfassten Verkäufe weiterhin lesen.",
          confirm: "Erlauben"
        },
        withdrawDialog: {
          title: "Export für {{name}} beenden?",
          body: "{{name}} kann die Transaktionen von {{business}} nicht mehr exportieren. Was bereits exportiert wurde, bleibt in Ihrer KI-App.",
          confirm: "Export beenden"
        },
        allowedTitle: "Export erlaubt",
        allowedBody: "{{name}} kann Ihre Transaktionen exportieren",
        withdrawnTitle: "Export beendet",
        withdrawnBody: "{{name}} kann Ihre Transaktionen nicht mehr exportieren",
        unreachable:
          "Die Erlaubnis konnte nicht veröffentlicht werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut",
        createFailedTitle: "Export noch nicht erlaubt",
        createFailed:
          "{{name}} wurde erstellt, aber der Export konnte nicht erlaubt werden. Versuchen Sie es in der Liste der Integrationen erneut"
      },
      remove: "Assistenten entfernen",
      removeDialog: {
        title: "{{name}} entfernen?",
        body: "{{name}} schreibt keine Rechnungen mehr für {{business}}. Die bereits geschriebenen bleiben bis zu ihrer Fälligkeit zahlbar und in Ihrem Wallet.",
        confirm: "Assistenten entfernen",
        doneTitle: "Assistent entfernt",
        doneBody: "{{name}} schreibt keine Rechnungen mehr."
      }
    },
    keySheet: {
      title: "Schlüssel für {{name}}",
      keyLabel: "Geheimer Schlüssel",
      once: "Er wird nur einmal angezeigt: Kopieren Sie ihn jetzt. Er kann nie wieder angezeigt werden, auch nicht mit Ihrem Passkey. Geht er verloren, entfernen Sie die Integration und erstellen Sie eine neue.",
      unpublished:
        "Die Integration {{name}} konnte noch nicht auf Ihren Relais veröffentlicht werden. Das geschieht beim nächsten Entsperren mit Ihrem Passkey, mit Internetverbindung: Bis dahin findet ihr Server sie nicht.",
      secret:
        "Halten Sie ihn geheim, nur auf den Servern dieses Shops: nie in einer Webseite, nie in einer App und nie für einen anderen Shop. Mit ihm lässt sich Ihr Guthaben nicht ausgeben. Ist er bekannt geworden, entfernen Sie die Integration und erstellen Sie eine neue.",
      copy: "Schlüssel kopieren",
      copied: "Schlüssel kopiert",
      copyFailed:
        "Der Schlüssel konnte nicht kopiert werden. Markieren Sie ihn und kopieren Sie ihn dann.",
      done: "Fertig"
    },
    removeDialog: {
      title: "{{name}} entfernen?",
      body: "Ihr Schlüssel kann keine Zahlungsanforderungen für {{business}} mehr erstellen. Eine bereits angezeigte Anforderung bleibt bis zu ihrem Ende bezahlbar, und ihre bisherigen Verkäufe bleiben im Wallet.",
      confirm: "Integration entfernen",
      doneTitle: "Integration entfernt",
      doneBody: "Der Schlüssel von {{name}} erstellt keine Zahlungsanforderungen mehr."
    },
    pendingDialog: {
      title: "{{name}} hat laufende Zahlungen",
      unknownTitle: "Zahlungen von {{name}} nicht geprüft",
      lead: "Warten Sie, bis die Zahlungen von {{name}} endgültig sind, bevor Sie sie entfernen, damit jeder ihrer Verkäufe auf ihren Namen bleibt.",
      unknownLead:
        "Ob die Zahlungen von {{name}} endgültig sind, konnte nicht geprüft werden. Warten Sie, bis sie es sind, bevor Sie sie entfernen, damit jeder ihrer Verkäufe auf ihren Namen bleibt.",
      open_one: "{{count}} Zahlungsanforderung noch offen, spätestens bis {{time}}.",
      open_other: "{{count}} Zahlungsanforderungen noch offen, spätestens bis {{time}}.",
      confirming_one:
        "{{count}} Bitcoin-Zahlung wartet auf Bestätigung (3 Bestätigungen, etwa dreißig Minuten).",
      confirming_other:
        "{{count}} Bitcoin-Zahlungen warten auf Bestätigung (3 Bestätigungen, etwa dreißig Minuten).",
      end: "Versuchen Sie es danach erneut.",
      forceNote:
        "Wenn Sie nicht warten können (zum Beispiel, weil ihr Schlüssel durchgesickert ist), entfernen Sie sie trotzdem: Ihre Wallet erhält weiterhin ihre Zahlungen, aber jene, die sie vor ihrer Entfernung nicht gesehen hat, stehen nicht auf ihren Namen.",
      force: "Trotzdem entfernen",
      retry: "Erneut versuchen",
      close: "Schließen"
    },
    failedTitle: "Aktion nicht möglich",
    unreachableTitle: "Keine Verbindung",
    errors: {
      noAccount:
        "Entsperren Sie diesen Point of Sale mit Ihrem Passkey, um die Integrationen zu verwalten.",
      tooMany:
        "Ihr Konto hat bereits {{max}} Integrationen. Entfernen Sie eine, um eine neue zu erstellen.",
      tooManyAssistants:
        "Ihr Konto hat bereits {{max}} Assistenten. Entfernen Sie einen, um einen neuen zu erstellen.",
      invalidName: "Geben Sie den Namen der Integration ein.",
      unreachable:
        "Die Integration konnte nicht veröffentlicht werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      removeUnreachable:
        "Die Entfernung konnte nicht veröffentlicht werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      removeFailed: "Die Entfernung konnte nicht gespeichert werden. Versuchen Sie es erneut.",
      removalUnsaved:
        "Der Schlüssel dieser Integration erstellt keine Zahlungsanforderungen mehr, aber die Entfernung konnte nicht gespeichert werden. Versuchen Sie es erneut: Sie wird auch beim nächsten Öffnen Ihres Kontos gespeichert.",
      exportNewer:
        "Eine neuere Version der App hat diesen Assistenten geändert. Aktualisieren Sie die App, um ihn zu ändern"
    }
  },
  articles: {
    add: "Artikel hinzufügen",
    loading: "Ihre Artikel werden geladen…",
    guide: {
      title: "Mit wenigen Fingertipps verkaufen",
      lead: "Erfassen Sie Ihre Getränke, Gerichte und Desserts einmal: Sie erscheinen in Ihrer Kasse und in der Ihrer Mitarbeitenden.",
      create: {
        title: "Artikel erstellen",
        caption:
          "Ein Name, ein Preis, ein Foto. Scannen Sie einen Barcode, um die Angaben schneller auszufüllen.",
        captionNoScan: "Ein Name, ein Preis, ein Foto."
      },
      tap: {
        title: "An der Kasse antippen",
        caption:
          "Wechseln Sie zu „$t(pos.mode.articles)“: Jedes Antippen legt den Artikel in den Warenkorb. In der App auf dem Telefon können Sie auch den Barcode der Artikel scannen."
      },
      cash: {
        title: "Warenkorb kassieren",
        caption:
          "Der Gesamtbetrag wird automatisch berechnet: Ihre Kundschaft scannt den QR-Code und bezahlt."
      }
    },
    offline:
      "Kein Relay hat geantwortet. Prüfen Sie die Verbindung und öffnen Sie diese Seite erneut.",
    newer:
      "Einige Artikel stammen aus einer neueren Version der App: Aktualisieren Sie die App, um sie zu sehen.",
    openHint: "Öffnet den Artikel zum Bearbeiten oder Löschen.",
    saved: {
      title: "Artikel gespeichert",
      body: "{{name}} ist in Ihren Artikeln."
    },
    changed: {
      title: "Artikel geändert",
      body: "{{name}} ist aktuell."
    },
    removed: {
      title: "Artikel gelöscht",
      body: "{{name}} ist nicht mehr in Ihren Artikeln."
    },
    removeDialog: {
      title: "{{name}} löschen?",
      body: "Der Artikel verschwindet aus Ihren Artikeln, auf allen Ihren Geräten. Dies kann nicht rückgängig gemacht werden.",
      confirm: "Artikel löschen"
    },
    form: {
      title: "Neuer Artikel",
      editTitle: "Artikel bearbeiten",
      scan: "Scannen",
      addPhoto: "Foto hinzufügen",
      changePhoto: "Foto ändern",
      preparingPhoto: "Foto wird vorbereitet…",
      dropPhoto: "Foto hierher ziehen",
      choosePhoto: "oder eine Datei wählen",
      photoMenu: "Foto des Artikels",
      takePhoto: "Foto aufnehmen",
      pickPhoto: "Aus Ihren Fotos wählen",
      nameLabel: "Name",
      namePlaceholder: "Name des Artikels",
      priceLabel: "Preis",
      priceInvalid: "Geben Sie einen Preis wie 4,80 ein",
      descriptionLabel: "Beschreibung",
      descriptionPlaceholder: "Zutaten, Format, Allergene",
      addDescription: "Beschreibung hinzufügen",
      fromOpenFoodFacts: "· von Open Food Facts",
      searching: "· wird auf Open Food Facts gesucht",
      save: "Artikel speichern",
      saveChanges: "Änderungen speichern",
      remove: "Artikel löschen"
    },
    scanner: {
      title: "Barcode scannen",
      aim: "Richten Sie die Kamera auf den Barcode",
      lead: "Name und Foto stammen von Open Food Facts. Sie legen nur noch den Preis fest.",
      leadNoLookup: "Sie geben Name, Foto und Preis selbst ein.",
      manual: "Ohne Barcode eingeben",
      denied: "Erlauben Sie den Kamerazugriff, um einen Barcode zu scannen.",
      // The web app: the browser's own settings (BarcodeScanner.tsx).
      deniedWeb:
        "Erlauben Sie die Kamera für diese Website in den Einstellungen des Browsers (das Schloss neben der Adresse) und tippen Sie dann auf „Kamera erlauben“.",
      allow: "Kamera erlauben",
      settings: "Einstellungen öffnen",
      unavailable: "Die Kamera konnte nicht starten. Dieses Gerät hat möglicherweise keine.",
      engineFailed:
        "Der Strichcodeleser konnte nicht geladen werden. Prüfen Sie die Internetverbindung und versuchen Sie es erneut.",
      retry: "Erneut versuchen",
      notFoundTitle: "Produkt nicht gefunden",
      notFoundBody: "Dieser Barcode wird nicht erkannt. Geben Sie den Namen des Artikels ein.",
      unreachableTitle: "Produktsuche nicht möglich",
      unreachableBody: "Scannen Sie gleich noch einmal oder geben Sie den Namen des Artikels ein."
    },
    errors: {
      title: "Artikel nicht gespeichert",
      changeTitle: "Artikel nicht geändert",
      removeTitle: "Artikel nicht gelöscht",
      noAccount: "Entsperren Sie die App mit Ihrem Passkey und versuchen Sie es erneut.",
      invalid: "Geben Sie einen Namen und einen Preis ein.",
      tooMany: "Der Katalog ist voll: höchstens 500 Artikel.",
      unreachable:
        "Zu wenige Relays haben geantwortet. Prüfen Sie die Verbindung und versuchen Sie es erneut.",
      photoDenied:
        "Erlauben Sie den Zugriff auf Ihre Fotos in den Geräteeinstellungen und versuchen Sie es erneut.",
      cameraDenied:
        "Die Kamera öffnet sich nicht. Erlauben Sie sie in den Geräteeinstellungen und versuchen Sie es erneut.",
      photoUnreadable: "Dieses Bild kann nicht verwendet werden. Wählen Sie ein anderes."
    }
  },
  activity: {
    limited: "Ansicht auf Ihre eigenen Vorgänge beschränkt",
    followUp: "Offen",
    movements: "Bewegungen",
    yourMovements: "Ihre Bewegungen",
    allMovements: "Alle Bewegungen",
    allYourMovements: "Alle Ihre Bewegungen",
    dayNet: "Netto des Tages: {{amount}}",
    clearFilter: "{{name}}, Filter entfernen",
    reading: "Verkäufe und Rechnungen werden geladen…",
    loadFailed:
      "Ihre Aktivität konnte nicht gelesen werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
    empty: "Noch keine Bewegungen.",
    noMatch: "Keine Bewegungen entsprechen den Filtern.",
    showExpired: "Abgelaufene anzeigen ({{count}})",
    hideExpired: "Abgelaufene ausblenden",
    showMore: "Mehr anzeigen",
    arrivals_one: "{{count}} neue Bewegung",
    arrivals_other: "{{count}} neue Bewegungen",
    expiredHidden: "Abgelaufene Rechnungen sind ausgeblendet.",
    pendingCredit: {
      awaiting: "noch nicht im Guthaben",
      received: "Zahlung erhalten",
      confirmed: "bestätigt",
      credit: "Gutschrift auf Ihr Guthaben",
      waiting: "ausstehend",
      fees: "Die Gutschrift dieser Zahlung auf Ihr Guthaben kostet derzeit mehr als {{fee}}, unser Limit. Sie erfolgt automatisch, sobald diese Kosten es nicht mehr überschreiten, wenn Sie Ihre Wallet öffnen.",
      feesQuoted:
        "Die Gutschrift dieser Zahlung auf Ihr Guthaben kostet derzeit {{price}}, mehr als unser Limit von {{fee}}. Sie erfolgt automatisch, sobald diese Kosten es nicht mehr überschreiten, wenn Sie Ihre Wallet öffnen.",
      other:
        "Die Gutschrift erfolgt automatisch, wenn Sie Ihre Wallet öffnen. Abzuziehende Gebühren: höchstens {{fee}}."
    },
    followUps: {
      open: "Offen",
      underpaid: "Unterbezahlt",
      unconfirmed: "Wird bestätigt",
      draft: "Entwürfe"
    },
    followUpTitles: {
      open: "Offene Rechnungen",
      underpaid: "Unterbezahlte Rechnungen",
      unconfirmed: "Wird bestätigt",
      draft: "Entwürfe"
    },
    followUpLabel: "{{name}}: {{count}}, {{total}}",
    rest: "noch {{amount}}",
    states: {
      open: "Offen",
      underpaid: "Unterbezahlt",
      unconfirmed: "Wird bestätigt",
      draft: "Entwurf",
      expired: "Abgelaufen",
      canceled: "Storniert",
      inProgress: "Läuft",
      failed: "Fehlgeschlagen"
    },
    done: {
      paid: "Bezahlt",
      received: "Empfangen",
      sent: "Gesendet"
    },
    sources: {
      pos: "Kasse",
      link: "Rechnung",
      integration: "Integration",
      receive: "Eingang",
      send: "Ausgang",
      recovered: "Rückholung"
    },
    titles: {
      link: "Rechnung",
      recovered: "Zurückgeholte Gelder",
      mtpSale: "Verkauf in {{currency}}",
      // Rows copied from the v2 account (src/features/activity/legacy-history.ts).
      payout: "Auszahlung auf Ihr Wallet",
      referral: "Empfehlungsprovision"
    },
    mtpSale: {
      section: "Verkauf",
      received: "Sie erhalten",
      transferNowNote: "Einzeln überwiesen, ohne auf Ihre anderen Verkäufe zu warten",
      transferLaterNote: "In einer Sammelüberweisung mit Ihren anderen Verkäufen, ab {{threshold}}",
      follow: "Verkauf verfolgen",
      followLabel: "Auftrag {{order}}, Verkauf verfolgen"
    },
    you: "Sie",
    stamp: "{{day}} · {{time}}",
    columns: {
      date: "Datum",
      label: "Bezeichnung",
      source: "Quelle",
      by: "Von",
      state: "Status",
      amount: "Betrag",
      sats: "sats"
    },
    detail: {
      date: "Datum",
      takenBy: "Kassiert von",
      madeBy: "Erstellt von",
      rest: "Noch zu zahlen",
      endsAt: "Zahlbar bis",
      payments: "Zahlungen",
      link: "Zahlungslink",
      openLink: "Rechnung öffnen",
      copyLink: "Link kopieren",
      linkCopied: "Link kopiert",
      accepted: "Akzeptiert am",
      difference: "Akzeptierte Differenz",
      acceptedLate:
        "Zu spät akzeptiert, um an {{integration}} übermittelt zu werden: Dort bleibt die Bestellung abgelaufen. Prüfen Sie, dass sie dort im Backend als bezahlt markiert ist."
    },
    accept: {
      action: "Erhaltenen Betrag akzeptieren",
      done: "Erhaltener Betrag akzeptiert",
      dialog: {
        title: "Erhaltenen Betrag akzeptieren?",
        body: "Der Verkauf gilt mit {{received}} als bezahlt. Die Differenz von {{difference}} wird nicht mehr verlangt. Dies ist endgültig.",
        bodyOrder:
          "Die Bestellung gilt mit {{received}} als bezahlt: Ihr Shop sieht sie als bezahlt, sobald die Zahlung bestätigt ist. Die Differenz von {{difference}} wird nicht mehr verlangt. Dies ist endgültig.",
        bodyLate:
          "Die Bestellung gilt mit {{received}} als bezahlt und die Differenz von {{difference}} wird nicht mehr verlangt. Diese Annahme wird nicht an {{integration}} übermittelt, die Bestellung bleibt dort abgelaufen: Markieren Sie sie auch dort im Backend als bezahlt. Dies ist endgültig.",
        confirm: "Akzeptieren",
        cancel: "Zurück"
      },
      late: {
        title: "Die Rechnung dieser Bestellung ist abgelaufen",
        body: "Für {{integration}} bleibt die Bestellung abgelaufen, Ihre Annahme ist dort nicht sichtbar. Wenn Sie sie hier akzeptieren, markieren Sie sie auch dort im Backend als bezahlt.",
        closingTitle: "Die Rechnung dieser Bestellung läuft ab",
        closingBody:
          "Es ist zu spät, damit {{integration}} Ihre Annahme erhält. Wenn Sie sie hier akzeptieren, markieren Sie sie auch dort im Backend als bezahlt.",
        lapsedBody:
          "Ihre Annahme hat die Mehrheit Ihrer Relais nicht vor Ablauf der Rechnung erreicht: Für {{integration}} ist sie nicht sichtbar. Wenn Sie sie hier akzeptieren, markieren Sie sie auch dort im Backend als bezahlt.",
        yourShop: "Ihren Shop"
      },
      errors: {
        network: "Die Annahme konnte nicht gespeichert werden, versuchen Sie es erneut",
        already: "Dieser Verkauf ist bereits akzeptiert",
        ended:
          "Zu spät, um die Annahme an den Shop zu übermitteln: Lesen Sie erneut, bevor Sie akzeptieren"
      },
      pending:
        "Annahme wird gespeichert: Sie zählt, sobald die Mehrheit Ihrer Relais sie erhalten hat, vor Ablauf der Rechnung.",
      blocked: {
        unread:
          "Die App konnte noch nicht bei der Mehrheit Ihrer Relais prüfen, ob der erhaltene Betrag bereits akzeptiert wurde. „$t(activity.accept.action)“ erscheint hier, sobald diese Prüfung erfolgt ist. Wenn es andauert, verwenden Sie „$t(relays.test)“ unter „$t(settings.relays)“.",
        unmet:
          "Der erhaltene Betrag wurde akzeptiert, als er {{received}} betrug, doch die App sieht heute weniger, zum Beispiel nachdem eine Transaktion ersetzt wurde. Die Annahme zählt wieder, sobald dieser Betrag erreicht ist: Sie wird nicht wiederholt.",
        newer:
          "Der erhaltene Betrag wurde mit einer neueren Version der App akzeptiert: Aktualisieren Sie die App, um diese Annahme zu sehen."
      }
    }
  },
  table: {
    headerHint: "Sortieren und filtern",
    sortedBy: "sortiert: {{order}}",
    filtered: "gefiltert",
    menu: "{{name}}: sortieren und filtern",
    sort: "Sortieren",
    orders: {
      text: { ascending: "Von A bis Z", descending: "Von Z bis A" },
      number: { ascending: "Vom kleinsten zum größten", descending: "Vom größten zum kleinsten" },
      date: { ascending: "Vom ältesten zum neuesten", descending: "Vom neuesten zum ältesten" }
    },
    show: "Anzeigen",
    selectAll: "Alle auswählen",
    periods: {
      thisWeek: "Diese Woche",
      lastWeek: "Letzte Woche",
      thisMonth: "Dieser Monat",
      lastMonth: "Letzter Monat",
      thisYear: "Dieses Jahr",
      lastYear: "Letztes Jahr",
      older: "Älter"
    },
    value: "{{label}}, {{count}}",
    emptyValue: "Leer",
    clearFilters: "Filter löschen"
  },
  wallet: {
    balance: "Saldo",
    atLeast: "mindestens",
    discreet: "Diskret",
    hiddenAmount: "Betrag ausgeblendet",
    received: "Erhalten (letzte 30 Tage)",
    sent: "Gesendet (letzte 30 Tage)",
    send: "Senden",
    sell: "Verkaufen",
    sellFrom: "ab {{amount}} Sats",
    opening: "Ihr Wallet wird geöffnet…",
    loadFailed:
      "Ihr Wallet konnte nicht gelesen werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
    retry: "Erneut versuchen",
    empty: "Noch keine Zahlungen.",
    guide: {
      lead: "Noch keine Bewegungen. So kommen sie zustande:",
      label: "Wie Bewegungen zustande kommen",
      take: {
        title: "Kassieren",
        caption:
          "Geben Sie an der Kasse einen Betrag ein: Ihre Kundschaft scannt den QR-Code und bezahlt."
      },
      receive: {
        title: "Empfangen",
        caption:
          "Die Zahlung kommt in Ihrer Wallet an und erscheint hier, mit der Person, die kassiert hat."
      },
      follow: {
        title: "Verfolgen und senden",
        caption:
          "Rechnungen, Zahlungslinks, Überweisungen: Hier behalten Sie alles im Blick. Senden Sie Ihre Sats, wann Sie möchten."
      }
    },
    syncing: "Wird aktualisiert…",
    syncingWallet: "Ihr Wallet wird synchronisiert…",
    syncLate:
      "Ihr Wallet konnte nicht aktualisiert werden: Das angezeigte Guthaben und die Zahlungen stammen von diesem Gerät und sind möglicherweise unvollständig. Prüfen Sie Ihre Internetverbindung.",
    syncLateBlank:
      "Ihr Wallet konnte nicht synchronisiert werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
    noRate: "Wechselkurs nicht verfügbar: einige Beträge nur in Sats.",
    today: "Heute",
    yesterday: "Gestern",
    meta: "{{time}} · {{kind}}",
    kinds: {
      lightningReceipt: "Lightning-Eingang",
      lightningAddress: "Lightning-Adresse",
      lightningInvoice: "Lightning-Rechnung",
      bitcoinAddress: "Bitcoin-Adresse",
      sparkTransfer: "Spark-Überweisung"
    },
    titles: {
      deposit: "Einzahlung",
      withdrawal: "Auszahlung",
      receipt: "Eingang",
      sending: "Ausgang"
    },
    pills: {
      confirming: "Wird bestätigt",
      inProgress: "Läuft",
      failed: "Fehlgeschlagen"
    },
    networks: {
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      spark: "Spark"
    },
    detail: {
      date: "Datum",
      network: "Netzwerk",
      fee: "Gebühren",
      sendFee: "Sendegebühren",
      noFee: "Keine",
      reference: "Referenz",
      copy: "Referenz kopieren",
      copied: "Referenz kopiert",
      recipient: "Empfänger",
      copyAddress: "Adresse kopieren",
      addressCopied: "Adresse kopiert",
      close: "Schließen"
    },
    sendSheet: {
      intro:
        "Geben Sie eine Lightning-Adresse, eine Lightning-Rechnung, eine Bitcoin-Adresse oder eine Spark-Adresse ein, fügen Sie sie ein oder scannen Sie sie.",
      introNoScan:
        "Geben Sie eine Lightning-Adresse, eine Lightning-Rechnung, eine Bitcoin-Adresse oder eine Spark-Adresse ein oder fügen Sie sie ein.",
      close: "Schließen",
      cancel: "Abbrechen",
      recipient: "Empfänger",
      recipientPlaceholder: "Adresse oder Rechnung",
      paste: "Einfügen",
      scan: "QR-Code scannen",
      reading: "Empfänger wird gelesen…",
      kinds: {
        lightningAddress: "Lightning-Adresse",
        lnurlPay: "LNURL-Link",
        bolt11: "Lightning-Rechnung",
        bitcoinAddress: "Bitcoin-Adresse",
        sparkAddress: "Spark-Adresse"
      },
      recipientErrors: {
        unrecognized: "Adresse oder Rechnung eingeben",
        unsupported: "Adresse oder Rechnung eingeben",
        otherNetwork: "Adresse des Hauptnetzes verwenden",
        expired: "Neue Rechnung anfordern",
        unreachable: "Lightning-Adresse prüfen",
        lnurlUnreachable: "Erneut versuchen: LNURL-Link reagiert nicht",
        failed: "Internetverbindung prüfen",
        pasteEmpty: "Zuerst Adresse oder Rechnung kopieren",
        pasteFailed: "Mit der Tastatur ins Feld einfügen"
      },
      amount: "Betrag",
      switchToSats: "In Sats eingeben",
      switchToFiat: "In {{currency}} eingeben",
      available: "Verfügbar: {{amount}}",
      amountErrors: {
        invalid: "Gültigen Betrag eingeben",
        belowMin: "Mindestens {{amount}} eingeben",
        aboveMax: "Höchstens {{amount}} eingeben",
        aboveBalance: "Höchstens das Guthaben eingeben",
        feesAboveBalance: "Betrag senken, um Gebühren zu decken"
      },
      speed: "Geschwindigkeit",
      speeds: {
        fast: "Schnell",
        medium: "Normal",
        slow: "Günstig"
      },
      fee: "Geschätzte Gebühren",
      feePreparing: "Gebühren werden berechnet…",
      quoteFailed:
        "Die Gebühren konnten nicht berechnet werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es dann erneut.",
      balanceAfter: "Saldo nach dem Senden",
      expiresIn: "Läuft ab in",
      send: "{{amount}} senden",
      pay: "{{amount}} bezahlen",
      confirming: "Bestätigen Sie mit Ihrem Passkey…",
      sending: "Wird gesendet…",
      sendFailed:
        "Die Zahlung ist nicht durchgegangen. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut: Sie wird nur einmal gesendet.",
      recordFailed:
        "Die Relais Ihres Kontos haben nicht geantwortet: Es wurde nichts gesendet. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      noRate: "Der Bitcoin-Kurs ist nicht verfügbar: Geben Sie den Betrag in Sats ein.",
      result: {
        completedTitle: "Zahlung gesendet",
        onchainTitle: "Zahlung gesendet",
        onchainBody:
          "Das Bitcoin-Netzwerk muss die Transaktion noch bestätigen: Ihr Status erscheint in der Liste der Zahlungen.",
        pendingTitle: "Zahlung läuft",
        pendingBody:
          "Die Zahlung ist unterwegs. Dieses Fenster aktualisiert sich von selbst; wenn Sie es schließen, wird die Zahlung nicht abgebrochen.",
        stalledTitle: "Zahlung läuft noch",
        stalledBody: "Ihr endgültiger Status erscheint in der Liste der Zahlungen.",
        failedTitle: "Die Zahlung ist fehlgeschlagen",
        failedBody: "Prüfen Sie Empfänger und Saldo und versuchen Sie es dann erneut.",
        recipientTo: "an {{recipient}}",
        recipientSent: "an {{recipient}}",
        done: "Fertig"
      },
      scanHint:
        "Richten Sie die Kamera auf den QR-Code einer Lightning-Rechnung, einer Lightning-Adresse oder einer Bitcoin-Adresse.",
      scanType: "Eingeben",
      scanDenied: "Erlauben Sie den Kamerazugriff, um einen QR-Code zu scannen.",
      scanAllow: "Kamera erlauben",
      scanSettings: "Einstellungen öffnen"
    }
  },
  sell: {
    title: "Verkaufen",
    back: "Zurück",
    retry: "Erneut versuchen",
    busy: {
      starting: "Ihr Mt-Pelerin-Konto wird gelesen…",
      reading: "Ihr Mt-Pelerin-Konto wird gelesen…",
      signingIn: "Anmeldung bei Mt Pelerin…",
      sendingCode: "Code wird gesendet…",
      checkingCode: "Code wird geprüft…",
      savingProfile: "Wird gespeichert…",
      preparingInvoice: "Zahlung von 1 Sat wird vorbereitet…",
      confirming: "Bestätigung…",
      paying: "Zahlung…",
      addingAccount: "Konto wird hinzugefügt…",
      savingAccount: "Konto wird gespeichert…",
      loggingOut: "Abmeldung…"
    },
    failures: {
      offline:
        "Der Verkaufsdienst antwortet nicht. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut",
      server:
        "Der Verkaufsdienst hat eine unlesbare Antwort gesendet. Versuchen Sie es gleich noch einmal",
      refused: "Die Anfrage wurde abgelehnt",
      codeRefused: "Dieser Code ist nicht der richtige",
      codeExpired: "Dieser Code ist abgelaufen: Fordern Sie einen neuen an",
      malformed: "Die Rechnung des Verkaufs ist nicht die erwartete: Es wurde nichts bezahlt",
      otherNetwork: "Die Rechnung des Verkaufs ist nicht die erwartete: Es wurde nichts bezahlt",
      otherAmount: "Die Rechnung des Verkaufs ist nicht die erwartete: Es wurde nichts bezahlt",
      expired: "Die Rechnung des Verkaufs ist abgelaufen: Es wurde nichts bezahlt",
      payment: "Die Zahlung wurde nicht gesendet. Versuchen Sie es erneut",
      record:
        "Die Relais Ihres Kontos haben nicht geantwortet: Es wurde nichts verkauft. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut",
      ibanTaken: "Diese IBAN ist bereits auf einem anderen Mt-Pelerin-Konto registriert",
      accountKnown: "Dieses Konto ist in dieser Währung bereits unter Ihren Bankkonten",
      accountUnchanged:
        "Mt Pelerin hat dieses Konto nicht geändert: Es gelten weiterhin die angezeigten Angaben. Wenden Sie sich an Mt Pelerin, um sie zu ändern"
    },
    sessionLost: "Ihre Mt-Pelerin-Sitzung ist abgelaufen: Melden Sie sich erneut an",
    intro: {
      title: "Mit Mt Pelerin verkaufen",
      lead: "Mt Pelerin, ein Schweizer Finanzintermediär, kauft Ihre Sats und überweist die Franken auf Ihr Bankkonto.",
      connectLead: "Ihr Mt-Pelerin-Konto öffnet sich mit dem Schlüssel Ihres sattle.me-Kontos.",
      connect: "Bei Mt Pelerin anmelden",
      phoneLead: "Ihr Mt-Pelerin-Konto öffnet sich mit Ihrer Telefonnummer.",
      phone: "Telefonnummer",
      phoneHint: "Mt Pelerin sendet Ihnen einen Code per SMS",
      sendCode: "Code erhalten",
      dialCountry: "Land der Nummer",
      dialCodeOf: "Land der Nummer: {{country}}, {{code}}"
    },
    code: {
      title: "Code eingeben",
      lead: "Mt Pelerin hat ihn Ihnen soeben per SMS an {{phone}} gesendet.",
      label: "6-stelliger Code",
      notReceived: "Nicht erhalten?",
      resend: "Code erneut senden",
      submit: "Bestätigen"
    },
    profile: {
      title: "Ihre E-Mail",
      lead: "Mt Pelerin braucht sie, um Ihr Konto zu eröffnen. Es sendet Ihnen dorthin die Quittung jedes Verkaufs.",
      email: "E-Mail",
      emailInvalid: "Geben Sie eine gültige E-Mail ein",
      phone: "Telefonnummer",
      phoneInvalid: "Geben Sie eine gültige Nummer mit Vorwahl ein",
      phoneCaption: "Die Nummer Ihres Mt-Pelerin-Kontos",
      submit: "Weiter"
    },
    validation: {
      title: "Ihr Wallet prüfen",
      lead: "Ihr Wallet muss geprüft werden. Zahlen Sie 1 Sat ({{value}}), um diese Prüfung durchzuführen.",
      toPay: "Zu bezahlen",
      fee: "Lightning-Gebühren",
      pay: "1 Sat zahlen",
      unaffordable:
        "Ihr Saldo deckt 1 Sat und die Gebühren nicht. Kommen Sie nach Ihrer nächsten Zahlung wieder",
      leadNoRate:
        "Ihr Wallet muss geprüft werden. Zahlen Sie 1 Sat, um diese Prüfung durchzuführen.",
      lessThan: "weniger als {{amount}}",
      about: "etwa {{amount}}"
    },
    pending: {
      badge: "In Bearbeitung",
      title: "Prüfung Ihres Wallets",
      leadNoBank: "Sie können weitermachen: Ihr Bankkonto hängt nicht von dieser Prüfung ab.",
      leadBank:
        "Sie können diesen Bildschirm verlassen: Sie können verkaufen, sobald Ihr Wallet geprüft ist (in der Regel weniger als 15 Minuten).",
      paid: "1 Sat bezahlt",
      toBank: "Ihr Bankkonto hinzufügen"
    },
    verified: {
      title: "Adresse geprüft",
      lead: "Ihr Sat ist angekommen. Ihre Verkäufe gehen von {{address}} aus.",
      account: "Mt-Pelerin-Konto",
      address: "Lightning-Adresse",
      addressVerified: "Geprüft",
      bank: "Bankkonto",
      toBank: "Ihr Bankkonto hinzufügen",
      continue: "Weiter",
      bankTodo: "Offen"
    },
    bank: {
      title: "Wohin Ihre {{currency}} überweisen",
      lead: "Das Konto, auf das Ihre Verkäufe überwiesen werden. Es gehört Ihnen oder Ihrem Unternehmen.",
      none: "Noch kein Bankkonto erfasst",
      add: "Ein Konto hinzufügen"
    },
    accountForm: {
      title: "Ein Konto hinzufügen",
      submit: "Dieses Konto hinzufügen"
    },
    accountEdit: {
      title: "Konto bearbeiten",
      lead: "Für eine andere IBAN oder eine andere Währung fügen Sie ein Konto hinzu.",
      submit: "Speichern"
    },
    payoutCurrency: {
      label: "Auszahlungswährung",
      swift:
        "Internationale Überweisung (SWIFT): ein Werktag oder mehr. Zwischenbanken können Gebühren erheben, von einigen bis zu mehreren Dutzend Dollar"
    },
    accounts: {
      title: "Bankkonten",
      lead: "Ihre Verkäufe werden nur auf diese Konten überwiesen.",
      add: "Ein Konto hinzufügen",
      fromSettings: "Einstellungen",
      pending: "Ausstehend",
      editHint: "Name und Adresse des Inhabers bearbeiten",
      // Accounts Mt Pelerin listed that the app cannot read (guards.ts): never offered.
      unreadable_one:
        "{{count}} weiteres Konto konnte nicht gelesen werden: Es wird nicht angeboten",
      unreadable_other:
        "{{count}} weitere Konten konnten nicht gelesen werden: Sie werden nicht angeboten",
      // Mt Pelerin lacks a line of its holder's address: offered all the same.
      incompleteAddress: "Adresse unvollständig"
    },
    addressTaken: {
      title: "Adresse bereits registriert",
      body: "Ihre Lightning-Adresse ist auf einem anderen Mt-Pelerin-Konto registriert. Melden Sie sich mit der Nummer dieses Kontos an.",
      switch: "Konto wechseln"
    },
    unavailable: "Der Verkauf von Sats über Lightning ist derzeit nicht verfügbar",
    sale: {
      amount: "Betrag",
      available: "Verfügbar: {{amount}}",
      change: "Ändern",
      fee: "Verkaufsgebühren",
      receive: "Sie erhalten etwa",
      estimating: "Berechnung…",
      estimateFailed: "Nicht verfügbar",
      pending: "Ausstehend",
      pendingBalance: "Saldo: {{amount}}",
      pendingSale: "Dieser Verkauf: {{amount}}",
      pendingGauge: "{{balance}} ausstehend, dazu {{sale}} aus diesem Verkauf, von {{threshold}}",
      pendingGaugeHeld: "{{balance}} ausstehend, von {{threshold}}",
      limitsTitle: "Ohne Identifizierung",
      limitLeft: "Noch {{left}} von {{limit}}",
      seeLimits: "Meine Limits ansehen",
      settings: "Einstellungen des Verkaufs",
      quote: "Angebot ansehen",
      aboveMax: "Geben Sie höchstens {{amount}} ein",
      aboveBalance: "Geben Sie höchstens den verfügbaren Saldo ein",
      tooSmall: "Sie müssen mindestens {{amount}} erhalten: Erhöhen Sie den Betrag",
      transferFee: "Überweisungsgebühr",
      transfer: "Überweisung",
      transferNow: "Sofort",
      transferNowNote: "{{fee}} Überweisungsgebühr unter {{threshold}}, darüber gratis",
      transferLater: "Aufgeschoben",
      transferLaterNote:
        "Ohne Überweisungsgebühr: in einer Sammelüberweisung mit Ihren anderen Verkäufen, sobald sie {{threshold}} erreichen",
      equivalentOf: "den Gegenwert von {{amount}}",
      chooseAccount: "Auf welches Konto?",
      addAccount: "Ein Konto hinzufügen"
    },
    quote: {
      title: "Angebot",
      heading: "Sie erhalten {{amount}}",
      lead: "Ihre Sats werden verkauft und die Franken auf Ihr Bankkonto überwiesen.",
      selling: "Sie verkaufen",
      rate: "Kurs",
      ratePrice: "1 BTC = {{price}}",
      fee: "Verkaufsgebühren",
      lightningFee: "Lightning-Gebühren",
      account: "Auf das Konto",
      lockedUntil: "Kurs garantiert bis {{time}}",
      expired: "Der Kurs ist abgelaufen: Es wurde nichts verkauft",
      refresh: "Angebot aktualisieren",
      sell: "{{amount}} verkaufen",
      otherOrder: "Das erhaltene Angebot ist nicht das angefragte: Es wurde nichts bezahlt",
      nothingWired: "Dieser Verkauf würde nichts auf Ihr Konto überweisen: Es wurde nichts bezahlt",
      unaffordable: "Ihr Saldo deckt diesen Verkauf und seine Gebühren nicht"
    },
    order: {
      heading: "{{amount}} an Ihre Bank",
      lead: "Verkauf von {{sats}}, {{date}}. Sie können diesen Bildschirm verlassen: Der Verkauf läuft weiter.",
      leadDated:
        "Verkauf vom {{date}}. Sie können diesen Bildschirm verlassen: Der Verkauf läuft weiter.",
      received: "Sats erhalten",
      receivedTodo: "Empfang der Sats",
      receivedNow: "Sats werden empfangen",
      receivedFailed: "Sats nicht erhalten",
      transferred: "Überweisung auf Ihr Konto",
      held: "Dieser Verkauf wird geprüft: Sehen Sie in Ihren E-Mails von Mt Pelerin nach",
      delayed: "Die Überweisung ist verschoben: Erwarten Sie sie im Laufe der Woche",
      refunded: "Ihre Sats werden Ihnen zurückgegeben",
      failed: "Dieser Verkauf wurde abgelehnt",
      expired: "Das Angebot ist abgelaufen: Es wurde nichts verkauft",
      reference: "Auftragsnummer",
      outcomes: {
        awaitingPayment: "Zahlung ausstehend",
        expired: "Abgelaufen",
        inProgress: "In Bearbeitung",
        delayed: "Verzögert",
        held: "In Prüfung",
        sent: "Überwiesen",
        refunded: "Erstattet",
        failed: "Abgelehnt"
      },
      title: "Verkauf",
      soldTitle: "Erfolgreich verkauft",
      soldLead: "Ihre {{sats}} sind verkauft: {{amount}} werden auf Ihr Konto überwiesen.",
      withOthers:
        "In einer Sammelüberweisung mit Ihren anderen Verkäufen, sobald sie {{threshold}} erreichen",
      next: "Wie es weitergeht",
      processing: "Bearbeitung des Verkaufs",
      processingNow: "In Bearbeitung",
      processed: "In {{currency}} umgerechnet",
      delayChf: "Innerhalb von 1 Werktag (Überweisung in der Schweiz, Montag bis Freitag)",
      delayEur: "Innerhalb von 1 bis 2 Werktagen (SEPA-Überweisung)",
      delaySwift: "Ein Werktag oder mehr (internationale SWIFT-Überweisung)",
      close: "Schließen",
      seeSales: "Ihre Verkäufe ansehen"
    },
    history: {
      title: "Ihre Verkäufe",
      empty: "Noch kein Verkauf",
      unreadable: "Zu viele Verkäufe, um sie hier aufzulisten"
    },
    split: {
      quoting: "Der Kurs Ihres Verkaufs wird festgelegt …",
      receive: "Sie erhalten",
      title: "Aufteilung",
      lead: "Seit dem {{date}} hat Ihr Wallet {{received}} erhalten.",
      kept: "In Bitcoin behalten ({{percent}})",
      share: "Zu verkaufender Anteil ({{percent}})",
      sold: "Jetzt verkauft: {{amount}}",
      lightningFee: "Lightning-Gebühren, zusätzlich",
      deferred:
        "Die aufgeschobenen Verkäufe werden zusammengefasst und auf einmal überwiesen, sobald sie {{threshold}} erreichen.",
      balance:
        "Ihr Guthaben erlaubt nur den Verkauf von {{amount}}. Der Rest des Anteils wird nicht verkauft.",
      limit:
        "Ohne Identitätsprüfung sind Ihre Verkäufe auf {{limit}} pro Monat begrenzt. Verkaufen Sie jetzt {{amount}} (der Rest des Anteils wird nicht verkauft) oder lassen Sie zuerst Ihre Identität prüfen, um den ganzen Anteil zu verkaufen.",
      sell: "{{amount}} verkaufen",
      identify: "Identität bei Mt Pelerin prüfen lassen",
      identifyHeading: "Identität prüfen lassen, um Ihren Anteil zu verkaufen",
      identifyLead:
        "Ihr zu verkaufender Anteil beträgt {{due}}. Ohne Identitätsprüfung sind Ihre Verkäufe auf {{limit}} pro Monat begrenzt, und diese Grenze ist erreicht.",
      identifyHow:
        "Ihre Identität wird auf der Website von Mt Pelerin geprüft, mit der Telefonnummer Ihres Kontos. Sobald Ihre Identität geprüft ist, wird Ihnen hier der ganze Anteil angeboten.",
      soldHeading: "Erfolgreich verkauft",
      soldLead:
        "Ihre {{sats}} sind für {{amount}} verkauft. Der Betrag kommt zu Ihren Verkäufen, die auf die Überweisung warten.",
      held: "Wartet auf Überweisung",
      payout: {
        title: "Nächste Überweisung",
        threshold: "ab {{threshold}}",
        held: "Bereits wartend",
        sale: "Dieser Verkauf",
        left: "Noch <strong>{{left}}</strong> an Verkäufen, dann wird alles auf Ihr Bankkonto überwiesen.",
        reached: "Die Schwelle ist erreicht: Alles wird auf Ihr Bankkonto überwiesen."
      },
      notice: "Aufteilung: {{amount}} zu verkaufen, etwa {{fiat}}.",
      noticeSell: "Verkaufen",
      noticeIdentify: "Aufteilung: {{due}} zu verkaufen, sobald Ihre Identität geprüft ist.",
      noticeSee: "Ansehen",
      setup:
        "Ihre Aufteilung sieht {{percent}} in {{currency}} vor. Richten Sie den Verkauf ein, um diesen Anteil zu verkaufen.",
      setupOpen: "Verkauf einrichten"
    },
    limits: {
      title: "Verkaufslimits",
      lead: "Ohne Identitätsprüfung können Sie höchstens verkaufen:",
      perSale: "Pro Verkauf",
      month: "Letzte {{days}} Tage",
      year: "Dieses Jahr",
      leftUntil: "Noch {{amount}} bis zum {{date}}",
      leftRolling: "Noch {{amount}}: Ein Verkauf zählt {{days}} Tage lang",
      unknown: "Nicht berechnet: ein Verkauf in einer anderen Währung als dem Franken",
      feesTitle: "Gebühren inbegriffen",
      identified: "Ihre Identität ist bei Mt Pelerin geprüft.",
      noLimit: "Unbegrenzt",
      perMonth: "Pro Monat",
      perYear: "Pro Jahr",
      identifyHow:
        "Um mehr zu verkaufen, lassen Sie Ihre Identität auf der Website von Mt Pelerin prüfen, mit der Telefonnummer Ihres Kontos.",
      fees: "Es zählt der verkaufte Betrag vor Abzug der Gebühren. Berechnet aus Ihren Verkäufen."
    },
    settings: {
      title: "Verkaufseinstellungen",
      account: "Mt-Pelerin-Konto",
      byKey: "Mt-Pelerin-Konto · mit dem Schlüssel Ihres Kontos verbunden",
      lightning: "Lightning-Adresse",
      verified: "geprüft",
      pendingValidation: "ausstehend",
      banks: "Bankkonten",
      limits: "Verkaufslimits",
      history: "Ihre Verkäufe",
      logout: "Von Mt Pelerin abmelden",
      logoutTitle: "Von Mt Pelerin abmelden?",
      logoutBody:
        "Auf allen Ihren Geräten. Ihre Konten und Verkäufe bleiben bei Mt Pelerin: Sie finden sie bei der nächsten Anmeldung wieder.",
      logoutConfirm: "Abmelden",
      cancel: "Abbrechen",
      banksCount_one: "{{count}} Konto",
      banksCount_other: "{{count}} Konten",
      left: "Noch {{amount}}",
      perSale: "{{amount}} pro Verkauf",
      salesCount_one: "{{count}} dieses Jahr",
      salesCount_other: "{{count}} dieses Jahr"
    },
    close: "Schließen",
    poweredBy: "Powered by"
  },
  walletExport: {
    open: "Exportieren",
    title: "Transaktionen exportieren",
    close: "Schließen",
    lead: "Die abgeschlossenen Transaktionen des Zeitraums: bezahlte Verkäufe, Eingänge und Ausgänge.",
    period: "Zeitraum",
    periods: {
      thisMonth: "Dieser Monat",
      lastMonth: "Letzter Monat",
      thisYear: "Dieses Jahr",
      lastYear: "Letztes Jahr",
      custom: "Bestimmte Tage"
    },
    days: "{{first}} – {{last}}",
    from: "Vom",
    to: "Bis",
    format: "Art des Exports",
    formats: {
      pdf: "Einfach (PDF)",
      csv: "Ausführlich (CSV)"
    },
    amounts: "Beträge",
    units: {
      fiat: "In {{currency}}",
      btc: "In BTC"
    },
    columnsTitle: "Spalten",
    columnsTicked: "{{ticked}} von {{total}}",
    columns: {
      dateAndTime: "Datum und Uhrzeit",
      label: "Bezeichnung",
      source: "Quelle",
      by: "Von",
      network: "Zahlungsart",
      reference: "Referenz",
      bitcoinAmount: "Betrag in BTC",
      bitcoinFees: "Gebühren in BTC",
      fiatAmount: "Betrag in {{currency}}",
      fiatFees: "Gebühren in {{currency}}",
      originalAmount: "Erfasster Betrag",
      originalCurrency: "Erfasste Währung",
      bitcoinPrice: "Bitcoin-Kurs in {{currency}}",
      remark: "Bemerkung"
    },
    remarks: {
      accepted: "Differenz von {{fiat}} / {{btc}}, vom Inhaber akzeptiert am {{date}} um {{time}}",
      acceptedSats: "Differenz von {{btc}}, vom Inhaber akzeptiert am {{date}} um {{time}}"
    },
    submit: "Exportieren",
    errors: {
      unread:
        "Ihre Verkäufe konnten nicht gelesen werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      receiving:
        "Eine von einer Kasse gesehene Bitcoin-Zahlung ist noch nicht in Ihrer Wallet angekommen. Versuchen Sie es in ein paar Minuten erneut.",
      failed: "Der Export konnte nicht erstellt werden. Versuchen Sie es erneut."
    },
    pdf: {
      title: "Transaktionsbericht",
      period: "Vom {{first}} bis {{last}}",
      made: "Erstellt am {{date}}",
      summary: "Zusammenfassung",
      count: "Anzahl Transaktionen",
      countOf: {
        pos: "davon Kasse",
        link: "davon Rechnungen",
        integration: "davon Integrationen",
        receive: "davon Eingänge",
        send: "davon Ausgänge"
      },
      received: "Insgesamt eingenommen",
      sent: "Insgesamt gesendet",
      fees: "Sendegebühren",
      lines: "Transaktionen im Detail",
      none: "Keine abgeschlossene Transaktion in diesem Zeitraum.",
      amount: "Betrag ({{unit}})",
      amountMixed: "Betrag",
      valuesNote:
        "Ein Verkauf zählt mit dem erfassten Betrag, in seiner Währung; jede andere Transaktion mit dem Wert ihrer Bitcoin zum bei der Zahlung festgehaltenen Kurs (Quelle: CoinGecko). Eine Transaktion ohne festgehaltenen Kurs zählt in BTC.",
      // Rows copied from a v2 account among them (src/features/activity/legacy-history.ts).
      valuesNoteImported:
        "Ein Verkauf zählt mit dem eingegebenen Betrag in seiner Währung; jede andere Transaktion mit dem Wert ihrer Bitcoins zum bei ihrer Zahlung notierten Kurs (Quelle: CoinGecko; für den von Ihrem früheren Zahlungsdienst übernommenen Verlauf der dort erfasste Kurs). Eine Transaktion ohne notierten Kurs zählt in BTC."
    }
  },
  settings: {
    recovery: {
      group: "Sicherheit",
      title: "Wiederherstellungsphrase",
      description:
        "Die 12 Wörter, die Ihr Wallet ohne Passkey wiederherstellen, zum Notieren auf Papier.",
      open: "Anzeigen",
      lead: "Diese 12 Wörter sind eine Kopie Ihres Wallets: Mit ihnen kann jeder sein gesamtes Guthaben ausgeben, ohne Ihren Passkey.",
      rulesTitle: "Bevor Sie sie anzeigen",
      rules:
        "Schreiben Sie sie in der richtigen Reihenfolge auf Papier und bewahren Sie sie sicher auf. Fotografieren Sie sie nicht und speichern Sie sie in keiner Datei und keiner Nachricht. Geben Sie sie niemandem: sattle.me wird Sie nie danach fragen.",
      reveal: "Phrase anzeigen",
      hide: "Ausblenden",
      shownNote:
        "Nur Sie sollten diese Wörter sehen. Sie verschwinden, sobald Sie diesen Bildschirm oder die App verlassen.",
      captureOpen:
        "Bildschirmfotos werden hier nicht blockiert: Machen Sie keine und zeichnen Sie den Bildschirm nicht auf.",
      noPhrase: "Dieses Wallet hat keine Wiederherstellungsphrase zum Anzeigen.",
      wordLabel: "Wort {{index}}: {{word}}"
    },
    title: "Einstellungen",
    business: "Geschäft",
    businessDescription: "Name und Logo, die Kunden sehen, auf Belegen und Rechnungen.",
    businessName: "Name des Geschäfts",
    logo: "Logo des Geschäfts",
    changeLogo: "Logo des Geschäfts ändern",
    logoChange: "Logo ändern",
    merchant: {
      section: "Händlerprofil",
      description:
        "Nehmen Sie mit dieser App Bitcoin-Zahlungen an: Kasse, Rechnungen, Mitarbeitende. Ihre Hauptwallet wird in diesem Schritt erstellt.",
      create: "Mein Händlerprofil erstellen",
      failedTitle: "Kasse nicht vorbereitet",
      doneTitle: "Händlerprofil erstellt",
      doneBody: "Sie können Zahlungen annehmen"
    },
    groups: {
      charging: "Kassieren",
      payouts: "Überweisungen",
      display: "Anzeige",
      network: "Netzwerk",
      // "Account" of "Settings" (the session, the deletion).
      account: "Konto"
    },
    // The phone's cards and the computer's tabs of "Settings".
    rubrics: {
      chargingBoth: "Lightning und Onchain",
      methods: "Zahlungsarten",
      chargingDescription:
        "Was die Kasse, Ihre Mitarbeitenden und Ihre Integrationen der Kundschaft anbieten.",
      lightning: "Lightning",
      lightningCaption: "Immer angeboten, bis {{limit}} pro Rechnung; {{beyond}}",
      lightningCaptionUnknown:
        "Immer angeboten, bis zur Obergrenze Ihrer Lightning-Adresse; {{beyond}}",
      lightningLimitFiat: "{{btc}} (etwa {{fiat}})",
      lightningBeyond: {
        onchain: "darüber wird nur die Onchain-Adresse angezeigt",
        refused:
          "darüber lehnt die Kasse den Verkauf ab, solange Onchain-Zahlungen deaktiviert sind"
      },
      splitLabel: "Aufteilung: {{bitcoin}} in Bitcoin, {{fiat}} in {{currency}}",
      editRelays: "Relais bearbeiten"
    },
    unlock: {
      title: "Biometrie zum Entsperren der App verlangen",
      captionOn: "Bei jedem Öffnen der App",
      captionOff: "Die App öffnet sich ohne Biometrie",
      captionUnavailable: "Weder Biometrie noch Code auf diesem Gerät",
      section: "App-Sperre",
      description:
        "Die Biometrie dieses Geräts oder sein Code wird bei jedem Öffnen der App und bei jeder Rückkehr in die App verlangt, zusätzlich zum Kassenmodus.",
      saveFailed:
        "Diese Wahl konnte auf diesem Gerät nicht gespeichert werden. Versuchen Sie es erneut."
    },
    locked: {
      title: "Kassenmodus",
      titleCard: "App gesperrt",
      body: "Entsperren Sie die App, um Ihre Einstellungen zu ändern.",
      unlock: "Entsperren"
    },
    displayCurrency: "Referenzwährung",
    displayCurrencyCardDescription: "Beträge Ihrer Karten, wie sie in der App angezeigt werden.",
    displayCurrencyDescription:
      "Beträge, die an der Kasse eingegeben und in der App angezeigt werden.",
    amountUnit: {
      title: "Zuerst angezeigte Währung",
      description:
        "In der „Wallet“ und im Verlauf Ihrer Karten, auf diesem Gerät. Der andere Betrag steht darunter.",
      sats: "sats",
      savedTitle: "Zuerst angezeigte Währung gespeichert",
      saveFailed:
        "Diese Wahl konnte auf diesem Gerät nicht gespeichert werden. Versuchen Sie es erneut."
    },
    theme: {
      title: "Erscheinungsbild",
      description:
        "Auf diesem Gerät. „Automatisch“ folgt der hellen oder dunklen Einstellung des Geräts.",
      light: "Hell",
      dark: "Dunkel",
      system: "Automatisch",
      // A rubric's card on a phone ("Display"): the theme chosen.
      summaryLight: "Erscheinungsbild: Hell",
      summaryDark: "Erscheinungsbild: Dunkel",
      summarySystem: "Erscheinungsbild: Automatisch",
      savedTitle: "Erscheinungsbild gespeichert",
      saveFailed:
        "Diese Wahl konnte auf diesem Gerät nicht gespeichert werden. Versuchen Sie es erneut."
    },
    onchain: "Onchain-Zahlungen",
    onchainDescription:
      "Bestätigung in 10 bis 60 Minuten. Gilt für die Kasse, Ihre und die Ihrer Mitarbeitenden. Ihre Rechnungen und Integrationen bieten die Onchain-Zahlung immer an.",
    split: "Aufteilung",
    splitDescription:
      "Gebühr von sattle.me: {{bitcoin}} auf alle Ihre Einnahmen. Umgewandelter Anteil: {{fiat}} Verkaufsgebühren von Mt Pelerin zusätzlich, verkauft, sobald Sie es unter „Wallet“ annehmen.",
    splitDescriptionFree:
      "Gebühr von sattle.me: {{free}} statt {{bitcoin}} bis {{date}}, auf alle Ihre Einnahmen. Umgewandelter Anteil: {{fiat}} Verkaufsgebühren von Mt Pelerin zusätzlich, verkauft, sobald Sie es unter „Wallet“ annehmen.",
    splitShort: "{{percent}} in {{currency}}",
    allBitcoin: "Alles in Bitcoin",
    bankAccount: "Bankkonto",
    noBankAccount: "Keines",
    bankAtMtPelerin: "Bei Mt Pelerin",
    relays: "Nostr-Relais",
    relaysCount_one: "{{count}} Relais",
    relaysCount_other: "{{count}} Relais",
    relaysDescription:
      "Nostr-Server, mit denen sich die App auf allen Geräten des Geschäfts verbindet.",
    // "Bitcoin node" of "Network".
    node: {
      title: "Bitcoin-Node",
      description:
        "Wo Ihre Geräte und die Ihrer Mitarbeitenden On-Chain-Zahlungen verfolgen und wo Ihr Wallet die Blockchain liest.",
      mempoolTitle: "mempool.space",
      mempoolDescription:
        "Öffentlich, nichts zu installieren. Sieht die Adressen Ihrer On-Chain-Verkäufe.",
      ownTitle: "Mein Node",
      ownDescription: "Ihr eigener mempool: niemand sonst sieht Ihre Adressen.",
      mempoolCaption: "Standard",
      urlLabel: "Adresse Ihres mempool",
      urlHint:
        "Die Adresse seiner Seite in Ihrem Browser, zum Beispiel auf Ihrem Umbrel oder Start9",
      errors: {
        empty: "Geben Sie die Adresse Ihres mempool ein",
        incomplete: "Unvollständige Adresse, zum Beispiel https://mempool.example.ch",
        insecure:
          "Nur eine https://-Adresse wird akzeptiert: mit http:// ist die Verbindung unverschlüsselt",
        device: "Diese Adresse ist dieses Gerät: Geben Sie die Ihres Nodes ein"
      },
      legacyHttpTitle: "http://-Adresse wird nicht mehr verwendet",
      legacyHttpBody:
        "Zu Ihrer Sicherheit verbindet sich die App nur noch über https:// mit Ihrem Node: mit http:// könnte sich jemand in diesem WLAN als Ihr Node ausgeben und einen unbezahlten Verkauf als bezahlt erscheinen lassen. Solange Sie keine https://-Adresse eingeben, verhalten sich Ihre Geräte so, als ob Ihr Node nicht antworten würde.",
      test: "Verbindung testen",
      results: {
        ok: {
          title: "Node erreichbar und aktuell",
          body: "Letzter Block: {{height}}"
        },
        unreachable: {
          title: "Node nicht erreichbar",
          body: "Prüfen Sie die Adresse und ob dieses Gerät im selben Netzwerk wie Ihr Node ist."
        },
        notMempool: {
          title: "Kein mempool unter dieser Adresse",
          body: "Etwas antwortet, aber nicht die API von mempool. Prüfen Sie Adresse und Port."
        },
        noAddressIndex: {
          title: "Adressen nicht lesbar",
          body: "Ihr mempool kann noch keine Adressen lesen: Sein Index (electrs oder Fulcrum) fehlt oder ist noch nicht aufgebaut."
        },
        behind: {
          title: "Node im Rückstand",
          body: "Sein letzter Block ist {{hours}} h alt: Er ist noch nicht synchronisiert."
        }
      },
      fallbackTitle: "Wenn er nicht antwortet",
      fallbackMempool: "mempool.space verwenden",
      fallbackMempoolDescription:
        "Ihre On-Chain-Verkäufe gehen weiter; mempool.space sieht dann Ihre Adressen.",
      fallbackNone: "Nur Lightning",
      fallbackNoneDescription:
        "Nichts geht an mempool.space; die Kasse bietet so lange kein Bitcoin an.",
      payersTitle: "Zahlungsseiten Ihrer Kundschaft",
      payersLabel: "Meinen Node an die Seiten der Zahlenden weitergeben",
      payersCaption:
        "Der Browser Ihrer Kundschaft verfolgt ihre Zahlung ebenfalls auf Ihrem Node, mit demselben Ausweichweg. Seine Adresse steht dann in Ihren Zahlungslinks, und er erhält die IP-Adresse Ihrer Kundschaft.",
      payersHttpsOnly:
        "Nur für einen aus dem Internet erreichbaren Node, über https:// mit einem Domainnamen: Der Browser Ihrer Kundschaft erreicht Ihr lokales Netzwerk nicht.",
      publicNotePayers:
        "Der Sendezeitpunkt einer Zahlung, der ihren Kurs bestimmt, bleibt bei mempool.space: derselbe für Sie und Ihre Kundschaft.",
      publicNote:
        "Die Zahlungsseite Ihrer Kundschaft und der Sendezeitpunkt einer Zahlung, der ihren Kurs bestimmt, bleiben bei mempool.space: derselbe für Sie und Ihre Kundschaft.",
      savedTitle: "Bitcoin-Node gespeichert",
      savedOwn: "Ihre Geräte lesen die Blockchain auf Ihrem Node",
      savedMempool: "Ihre Geräte lesen die Blockchain auf mempool.space",
      confirmTitle: "Diesen Node speichern?",
      confirmBody:
        "Er antwortet von diesem Gerät aus nicht richtig. Aus dem Netzwerk Ihres Geschäfts vielleicht schon.",
      confirmAction: "Trotzdem speichern"
    },
    // "Look up scanned products" of "Network".
    productLookup: {
      section: "Katalog",
      title: "Gescannte Produkte suchen",
      caption:
        "Bei Open Food Facts, das den Barcode und die IP-Adresse des Geräts erhält. Aus: Sie geben Name und Foto ein.",
      savedTitle: "Produktsuche gespeichert",
      savedOn: "Name und Foto eines gescannten Produkts kommen von Open Food Facts",
      savedOff: "Name und Foto eines gescannten Produkts werden von Hand eingegeben"
    },
    save: "Speichern",
    close: "Schließen",
    logout: "Abmelden",
    logoutTitle: "Von diesem Gerät abmelden?",
    logoutBody:
      "Ihre Daten und Ihr Guthaben bleiben in Ihrem Konto: Mit Ihrem Passkey melden Sie sich wieder an. Nur die auf diesem Gerät getroffenen Einstellungen werden zurückgesetzt: die Navigationsleiste, „$t(wallet.discreet)“ in der $t(navigation.destinations.wallet), „$t(settings.amountUnit.title)“, „$t(settings.theme.title)“, „$t(pos.mode.amount)“ oder „$t(pos.mode.articles)“ in der $t(pos.title) und die Biometrie zum Entsperren der App.",
    logoutBodyWeb:
      "Ihre Daten und Ihr Guthaben bleiben in Ihrem Konto: Mit Ihrem Passkey melden Sie sich wieder an. Nur die auf diesem Gerät getroffenen Einstellungen werden zurückgesetzt: die Navigationsleiste, „$t(wallet.discreet)“ in der $t(navigation.destinations.wallet), „$t(settings.amountUnit.title)“, „$t(settings.theme.title)“ und „$t(pos.mode.amount)“ oder „$t(pos.mode.articles)“ in der $t(pos.title).",
    logoutBodyCard:
      "Ihre Daten und Ihr Guthaben bleiben in Ihrem Konto: Mit Ihrem Passkey melden Sie sich wieder an. Nur die Einstellungen „$t(settings.amountUnit.title)“ und „$t(settings.theme.title)“ auf diesem Gerät werden zurückgesetzt.",
    logoutConfirm: "Abmelden",
    support: {
      group: "Hilfe",
      section: "Support",
      description:
        "Eine Frage, ein Problem: Schreiben Sie uns. Das Protokoll der App hilft uns zu verstehen, was passiert ist.",
      contact: "Kontakt zum Support",
      attach: "Protokoll der App anhängen",
      attachCaption: "Technische Ereignisse, ohne Beträge und Adressen",
      reports: "Absturzberichte senden",
      reportsKinds: "Abstürze und Verzögerungen",
      reportsCaption: "Keine Beträge und keine Zahlungsadressen",
      reportsSaveFailed:
        "Diese Wahl konnte auf diesem Gerät nicht gespeichert werden. Versuchen Sie es erneut.",
      subject: "Support sattle.me",
      body: "Hallo,\n\nIhre Frage oder Ihr Problem:\n\n\n",
      downloaded:
        "Das Protokoll der App wurde soeben heruntergeladen ({{file}}): Bitte hängen Sie es an diese Nachricht an.",
      attachDownloaded: "Hängen Sie das heruntergeladene Protokoll an ({{file}})",
      notAttached: "Protokoll nicht an die Mail angehängt",
      deposited:
        "Das Protokoll der App wird verschlüsselt an den Support gesendet, mit der Referenz unten.",
      notDeposited: "Protokoll nicht gesendet",
      noMailTitle: "Keine Mail-App auf diesem Gerät",
      addressCopied: "Support-Adresse kopiert: {{email}}",
      writeTo: "Schreiben Sie uns an {{email}}",
      shareTitle: "Protokoll der App",
      shareFailed: "Protokoll nicht geteilt",
      failedTitle: "Mail nicht geöffnet"
    },
    delete: {
      section: "Konto löschen",
      description:
        "Löscht das Konto von den Nostr-Relais und von diesem Gerät und gibt seine Lightning-Adresse auf. Die Wallet muss leer sein.",
      button: "Konto löschen",
      employeesTitle_one: "Sie haben {{count}} mitarbeitende Person",
      employeesTitle_other: "Sie haben {{count}} Mitarbeitende",
      employeesBody_one:
        "Die Person wird aus dem Geschäft entfernt: Ihr Gerät kassiert nicht mehr dafür und vergisst es bei der nächsten Verbindung.",
      employeesBody_other:
        "Sie werden aus dem Geschäft entfernt: Ihre Geräte kassieren nicht mehr dafür und vergessen es bei der nächsten Verbindung.",
      integrationsTitle_one: "Sie haben {{count}} Integration",
      integrationsTitle_other: "Sie haben {{count}} Integrationen",
      integrationsBody_one:
        "Sie wird entfernt: Ihr Server kann keine Rechnungen mehr für das Geschäft erstellen.",
      integrationsBody_other:
        "Sie werden entfernt: Ihre Server können keine Rechnungen mehr für das Geschäft erstellen.",
      assistantsTitle_one: "Sie haben {{count}} KI-Assistenten",
      assistantsTitle_other: "Sie haben {{count}} KI-Assistenten",
      assistantsBody_one:
        "Er wird entfernt: Er kann keine Rechnungen mehr für das Geschäft schreiben.",
      assistantsBody_other:
        "Sie werden entfernt: Sie können keine Rechnungen mehr für das Geschäft schreiben.",
      removeAndContinue: "Entfernen und weiter",
      confirmTitle: "Konto löschen?",
      confirmBody:
        "Die Einstellungen, das Team, die Artikel und die erfassten Verkäufe werden von den Nostr-Relais und von diesem Gerät gelöscht, und die Lightning-Adresse wird aufgegeben. Das ist endgültig. Die leere Wallet bleibt mit Ihrem Passkey zugänglich.",
      confirm: "Endgültig löschen",
      progressTitle: "Konto wird gelöscht",
      progressHint: "Lassen Sie die App bis zum Ende geöffnet.",
      steps: {
        wallet: "Wallet wird geprüft",
        team: "Team wird entfernt",
        reading: "Daten auf den Relais werden gesucht ({{done}}/{{total}})",
        deleting: "Löschen auf den Relais ({{done}}/{{total}})",
        checking: "Löschung wird geprüft ({{done}}/{{total}})",
        device: "Dieses Gerät wird gelöscht"
      },
      deleted: "Ihr Konto wurde gelöscht",
      deletedElsewhere:
        "Das Konto von {{business}} wurde auf einem anderen Gerät gelöscht: Dieses Gerät hat es vergessen.",
      alreadyRemoved: "Die Lightning-Adresse und das Team sind bereits entfernt.",
      card: {
        description:
          "Löscht das Konto von den Nostr-Relays und von diesem Gerät und gibt die Lightning-Adressen Ihrer Karten auf. Die Karten müssen leer sein.",
        confirmBody:
          "Die Einstellungen, die Karten und ihre gespeicherten Zahlungen werden von den Nostr-Relays und von diesem Gerät gelöscht, und die Lightning-Adressen der Karten werden aufgegeben. Dies ist endgültig.",
        stepCards: "Prüfung der Karten",
        alreadyRemoved: "Die Lightning-Adressen der Karten sind bereits aufgegeben.",
        cardWallets:
          "Die Wallet einer Ihrer Karten oder einer gelöschten Karte ist nicht leer, oder es kommen noch Sats an. Senden Sie ihr Guthaben unter „Karten“ anderswohin und versuchen Sie es dann erneut.",
        walletFailed:
          "Die Wallet einer Karte konnte nicht geprüft werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
        begun:
          "Die Löschung ist nicht abgeschlossen: Die Lightning-Adressen der Karten sind bereits aufgegeben, auf diesem Gerät ist nichts gelöscht. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut."
      },
      failedTitle: "Konto nicht gelöscht",
      errors: {
        balance:
          "Die Wallet enthält noch {{sats}} sats. Senden Sie sie anderswohin und versuchen Sie es erneut.",
        pendingPayments:
          "Eine Zahlung der Wallet ist im Gang. Versuchen Sie es erneut, sobald sie abgeschlossen ist.",
        unclaimedDeposits:
          "Eine Onchain-Einzahlung ist der Wallet noch nicht gutgeschrieben. Versuchen Sie es erneut, sobald sie es ist.",
        cardWallets:
          "Die Wallet einer Ihrer Karten oder einer gelöschten Karte ist nicht leer, oder es sind noch Sats unterwegs. Zahlen Sie ihr Guthaben unter „Karten“ auf Ihr Hauptguthaben aus und versuchen Sie es dann erneut.",
        newerApp:
          "Eine neuere Version der App hat eine Karte dieses Kontos gespeichert. Aktualisieren Sie die App und versuchen Sie es dann erneut.",
        salesInProgress:
          "Einige Rechnungen des Geschäfts sind noch nicht endgültig. Versuchen Sie es erneut, sobald ihre endgültige Version veröffentlicht ist (bis zu 3 Std. nach Ablauf einer unbezahlten Rechnung).",
        walletFailed:
          "Die Wallet konnte nicht geprüft werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
        unreachable:
          "Die Nostr-Relais haben nicht geantwortet. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
        notDeleted:
          "Die Nostr-Relais haben die Löschung nicht bestätigt. Auf diesem Gerät ist nichts gelöscht: Versuchen Sie es erneut.",
        begun:
          "Die Löschung ist nicht abgeschlossen: Die Lightning-Adresse und das Team sind bereits entfernt, auf diesem Gerät ist nichts gelöscht. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
        unfinished:
          "Die Löschung hat begonnen, ist aber nicht abgeschlossen: Die anderen Geräte des Kontos haben es vielleicht schon vergessen. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut, um sie abzuschließen.",
        deviceNotWiped:
          "Das Konto ist von den Relais gelöscht, aber nicht alles, was die App auf diesem Gerät gespeichert hatte."
      }
    },
    yourProfile: "Ihr Profil",
    nameLocked: "Name von Ihrem Arbeitgeber festgelegt",
    addPhoto: "Foto hinzufügen",
    changePhoto: "Foto ändern",
    removePhoto: "Entfernen",
    relaysLocked: "Von Ihrem Arbeitgeber festgelegt",
    leave: "Geschäft verlassen",
    leaveTitle: "{{business}} verlassen?",
    leaveBody:
      "Dieses Gerät kassiert nicht mehr für dieses Geschäft. Für eine Rückkehr ist eine neue Einladung nötig.",
    back: "Zurück",
    splitSavedTitle: "Aufteilung gespeichert",
    splitSavedBank: "IBAN geprüft · {{percent}} in {{currency}}",
    splitSavedBitcoin: "Alles in Bitcoin",
    relaysSavedTitle: "Relais gespeichert",
    relaysSavedBody: "Die Geräte des Geschäfts übernehmen sie bei ihrer nächsten Verbindung.",
    nameSavedTitle: "Name gespeichert",
    currencySavedTitle: "Referenzwährung gespeichert",
    onchainSavedTitle: "Onchain-Zahlungen gespeichert",
    onchainSavedOn: "An der Kasse akzeptiert, zusätzlich zu Lightning",
    onchainSavedOff: "Nur Lightning an der Kasse",
    vatRate: "Standard-MwSt.-Satz",
    vatRateDescription: "Der MwSt.-Satz neuer Rechnungspositionen, pro Position änderbar.",
    vatRateField: "MwSt.-Satz (%)",
    vatRateHint: "Leer lassen für den Regelsatz: {{rate}}",
    vatStandard: "{{rate}} (Regelsatz)",
    vatSavedTitle: "Standard-MwSt.-Satz gespeichert",
    vatInvalid: "Geben Sie einen Satz zwischen 0 und 100 % ein",
    tolerance: "Unterzahlungstoleranz",
    toleranceDescription:
      "Eine Onchain-Zahlung, der höchstens dieser Anteil des Betrags fehlt, gilt als bezahlt. Fehlt mehr, muss der Kunde den ganzen Rest bezahlen. Gilt für Ihre Verkäufe, Rechnungen und Zahlungslinks, auch für die Ihrer Mitarbeitenden, Integrationen und KI-Assistenten. Ihren Kunden nie angezeigt.",
    toleranceField: "Toleranz (%)",
    toleranceHint: "Von 0 bis 10 %, auf ein Zehntel genau. Leer oder 0: keine.",
    toleranceNone: "Keine",
    toleranceSavedTitle: "Toleranz gespeichert",
    toleranceSaved: "{{rate}} für die nächsten Verkäufe und Rechnungen",
    toleranceSavedNone: "Keine: Der ganze Betrag wird verlangt",
    toleranceInvalid: "Geben Sie einen Prozentsatz zwischen 0 und 10 ein, auf ein Zehntel genau",
    logoSavedTitle: "Logo gespeichert",
    address: {
      title: "Adresse des Geschäfts",
      description: "Steht auf Ihren Rechnungen unter dem Namen des Geschäfts.",
      street: "Straße und Nummer",
      postalCode: "PLZ",
      city: "Ort",
      country: "Land",
      savedTitle: "Adresse gespeichert"
    },
    numbers: {
      title: "Unternehmensnummern",
      description:
        "Stehen auf Ihren Rechnungen unter der Adresse des Geschäfts. Ihre Bezeichnung richtet sich nach dem Land des Geschäfts.",
      savedTitle: "Nummer gespeichert"
    },
    photoSavedTitle: "Foto gespeichert",
    photoRemovedTitle: "Foto entfernt",
    saveFailedTitle: "Fehler beim Speichern",
    failedTitle: "Einstellung nicht gespeichert",
    errors: {
      unpublished:
        "Zu wenige Relais haben die Änderung bestätigt, sie wurde rückgängig gemacht. Prüfen Sie die Verbindung und versuchen Sie es erneut.",
      newerBackup:
        "Eine neuere Version der App hat dieses Konto gesichert, die Änderung wurde rückgängig gemacht. Aktualisieren Sie die App und versuchen Sie es erneut.",
      noAccount: "Entsperren Sie die App mit Ihrem Passkey und versuchen Sie es erneut.",
      invalid: "Prüfen Sie den eingegebenen Wert und versuchen Sie es erneut.",
      unreachable:
        "Zu wenige Relais haben geantwortet. Prüfen Sie die Verbindung und versuchen Sie es erneut.",
      saveFailed:
        "Die Einstellung konnte auf diesem Gerät nicht gespeichert werden. Versuchen Sie es erneut.",
      denied:
        "Erlauben Sie den Zugriff auf Ihre Fotos in den Geräteeinstellungen und versuchen Sie es erneut.",
      unreadable: "Dieses Bild kann nicht verwendet werden. Wählen Sie ein anderes.",
      logoutFailed: "Die Abmeldung wurde nicht abgeschlossen. Versuchen Sie es erneut.",
      leaveFailed: "Dieses Gerät konnte das Geschäft nicht verlassen. Versuchen Sie es erneut.",
      leaveUnreachable:
        "Das Geschäft konnte nicht über Ihren Austritt informiert werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      salesInProgress:
        "Einige Rechnungen des Geschäfts sind noch nicht endgültig. Versuchen Sie es erneut, sobald ihre endgültige Fassung veröffentlicht ist (bis zu 3 Stunden nach dem Ende einer unbezahlten Rechnung).",
      integrationsPending:
        "Eine Integration hat eine laufende Zahlung (eine offene Zahlungsanfrage oder eine Bitcoin-Zahlung in Bestätigung). Versuchen Sie es erneut, sobald sie abgeschlossen ist."
    },
    splitLead: "Die App schlägt Ihnen vor, diesen Anteil Ihrer Einnahmen zu verkaufen.",
    ibanRefused: "Prüfen Sie die Ziffern der IBAN"
  },
  relays: {
    title: "Nostr-Relais",
    lead: "Nostr-Server, mit denen sich die App auf allen Geräten des Geschäfts verbindet.",
    integrationsNotice:
      "Die Integrationen dieses Kontos folgen höchstens {{moves}} Änderungen der Relais seit ihrer Erstellung. Danach findet ihr Server sie nicht mehr: Erstellen Sie sie neu und geben Sie die neuen Schlüssel an ihre Integratoren weiter.",
    add: "Relais hinzufügen",
    addLead: "Geben Sie die Adresse des Relais ein.",
    address: "Adresse des Relais",
    placeholder: "relais.beispiel.ch",
    addConfirm: "Relais hinzufügen",
    addShort: "Hinzufügen",
    removeLabel: "{{relay}} entfernen",
    keepOne: "Behalten Sie mindestens ein Relais.",
    tooMany: "Höchstens zehn Relais: Entfernen Sie eines, um ein anderes hinzuzufügen.",
    removeUnreachable: "Entfernen Sie das rote Relais, um zu speichern.",
    restrictedRelay:
      "„Lesen verweigert“: Dieses Relais lässt Daten nur von dem lesen, der sie geschrieben hat. Ihre Kassen, Mitarbeitenden und Kunden könnten sie nicht lesen: Wählen Sie ein anderes.",
    localNetworkBlocked:
      "Der Browser blockiert den Zugriff dieser Website auf das lokale Netzwerk: Erlauben Sie „Lokales Netzwerk“ in den Website-Einstellungen (Symbol links der Adresse) und testen Sie erneut.",
    localNetworkNotAllowed:
      "Der Zugriff auf das lokale Netzwerk ist für diese Website noch nicht erlaubt: Testen Sie erneut und erlauben Sie ihn, wenn der Browser fragt. Fragt er nicht, erreicht dieses Gerät das Relais nicht: Prüfen Sie, ob es im selben Netzwerk oder in Tailscale ist.",
    test: "Verbindung testen",
    status: {
      reachable: "Verbunden",
      untested: "Nicht getestet",
      testing: "Test läuft",
      unreachable: "Nicht erreichbar",
      restricted: "Lesen verweigert"
    },
    statusLabel: "{{relay}}, {{status}}",
    statusDetail: "{{status}} · {{detail}}",
    noAnswer: "keine Antwort in {{duration}}",
    milliseconds: "{{value}}\u00a0ms",
    seconds: "{{value}}\u00a0s",
    errors: {
      incomplete: "Geben Sie eine vollständige Adresse ein",
      duplicate: "Geben Sie ein Relais ein, das nicht in der Liste ist",
      local: "Geben Sie die Adresse eines öffentlichen Relais ein: localhost ist dieses Gerät"
    },
    advanced: "Erweiterte Einstellungen",
    advancedLead:
      "Nostr-Relais, auf denen dieses Gerät Ihr Konto sucht und neue erstellt. Nach der Anmeldung gelten die Relais Ihres Kontos.",
    // "Sign-up" of "Advanced settings".
    countryDetection: {
      section: "Registrierung",
      title: "Mein Land mit country.is erkennen",
      caption:
        "Nur wenn die Zeitzone nicht reicht. country.is erhält dann die IP-Adresse dieses Geräts. Aus: Das Land kommt aus den Einstellungen des Geräts.",
      saveFailed:
        "Diese Wahl konnte auf diesem Gerät nicht gespeichert werden. Versuchen Sie es erneut."
    }
  },
  pending: {
    title: "Bald verfügbar",
    description: "Dieser Bildschirm ist noch nicht gestaltet."
  },
  merchantSettings: {
    businessNameWord: "Händler",
    saveFailed:
      "Ihre Einstellungen konnten auf diesem Gerät nicht gespeichert werden. Versuchen Sie es erneut."
  },
  /** "New invoice". */
  invoices: {
    newInvoice: "Neue Rechnung",
    // "Wallet"'s button on a phone, beside "Sell" in half the width: one word, its "+" icon tells
    // "new".
    newInvoiceShort: "Rechnung",
    // "Wallet"'s warning about an assistant (assistant-alerts.ts): "Remove the assistant" or "This
    // is expected" only.
    assistantAlert: {
      jumpTitle: "{{name}} hat Rechnungsnummern übersprungen",
      jumpBody:
        "Seine Rechnungen enden bei Nr. {{from}}, sein Zähler steht aber bei Nr. {{to}}: Die Nummern dazwischen wurden ohne Rechnung vergeben. Wenn sich das nicht erklären lässt, entfernen Sie diesen Assistenten.",
      jumpBodyNone:
        "Er hat {{year}} keine Rechnung geschrieben, sein Zähler steht aber bei Nr. {{to}}: Diese Nummern wurden ohne Rechnung vergeben. Wenn sich das nicht erklären lässt, entfernen Sie diesen Assistenten.",
      blockedTitle: "{{name}} blockiert die Rechnungsnummern",
      blockedBody:
        "Sein Nummernzähler hat ein Format, das diese Version der App nicht lesen kann: Keine Rechnung kann eine Nummer erhalten. Aktualisieren Sie die App; ist sie bereits aktuell, entfernen Sie diesen Assistenten.",
      burstTitle: "{{name}} hat sehr viele Rechnungen geschrieben",
      burstBody:
        "{{invoices}} Rechnungen in 24 Stunden. Wenn Sie diese nicht verlangt haben, entfernen Sie diesen Assistenten: Seine Rechnungen bleiben in Ihrem Wallet.",
      remove: "Assistenten entfernen",
      normal: "Das ist in Ordnung",
      removeFailedTitle: "Assistent nicht entfernt",
      removeFailed:
        "{{name}} konnte nicht entfernt werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es dann in der Liste der Integrationen erneut"
    },
    title: "Neue Rechnung",
    back: "Zurück",
    saveDraft: "Als Entwurf speichern",
    draftSaved: "Rechnung als Entwurf gespeichert",
    draftSavedBody: "Sie finden sie unter „Offen“",
    linkNote: "Rechnung {{number}}",
    recipient: {
      title: "An wen geht die Rechnung?",
      assistant: "Ihre Rechnungen mit einer KI erstellen",
      name: "Firmenname",
      street: "Straße und Nummer",
      postalCode: "PLZ",
      city: "Ort",
      country: "Land"
    },
    preview: {
      title: "PDF-Vorschau",
      invoice: "Rechnung",
      date: "Datum",
      due: "Fällig am"
    },
    lines: {
      title: "Was stellen Sie in Rechnung?",
      empty: "Keine Artikel auf dieser Rechnung",
      emptyLead:
        "Fügen Sie hinzu, was Sie verkaufen: einen Artikel aus Ihrem Katalog oder eine von Hand erfasste Zeile.",
      add: "Artikel hinzufügen",
      name: "Bezeichnung",
      quantity: "Menge",
      quantityShort: "Menge",
      unitPrice: "Stückpreis",
      unitPriceShort: "Stückpreis",
      vatRate: "MwSt.-Satz",
      vat: "MwSt.",
      amount: "Betrag",
      remove: "Entfernen",
      removeLine: "Position entfernen",
      expand: "Position bearbeiten",
      summary: "{{quantity}} · MwSt. {{rate}}",
      net: "Zwischensumme ohne MwSt.",
      vatOn: "MwSt. {{rate}} auf {{base}}",
      total: "Gesamtbetrag",
      quantityInvalid: "Geben Sie eine Menge ein",
      priceInvalid: "Geben Sie einen Preis ein",
      vatInvalid: "Geben Sie einen Satz zwischen 0 und 100 % ein",
      tooLarge: "Der Gesamtbetrag übersteigt den Höchstbetrag einer Rechnung",
      incomplete: "Zu ergänzen",
      save: "In meinen Artikeln speichern",
      saved: "In meinen Artikeln gespeichert"
    },
    picker: {
      title: "Artikel hinzufügen",
      close: "Schließen",
      manual: "Artikel eingeben",
      manualDescription: "Freie Bezeichnung, Menge und Preis",
      catalog: "Meine Artikel",
      loading: "Ihre Artikel werden gelesen…",
      failed:
        "Ihre Artikel konnten nicht gelesen werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      retry: "Erneut versuchen",
      empty: "Noch keine Artikel. Fügen Sie welche unter „Artikel“ hinzu.",
      convertFailed:
        "Der Preis konnte nicht umgerechnet werden. Versuchen Sie es gleich noch einmal"
    },
    sameName: {
      title: "Ein Artikel trägt bereits diesen Namen",
      close: "Schließen",
      lead: "Aktualisieren Sie ihn mit dem Preis dieser Zeile oder erstellen Sie einen zweiten Artikel mit demselben Namen.",
      otherCurrency:
        "Dieser Artikel wird in {{currency}} verkauft: Sein Preis kann keinen Betrag in {{invoice}} annehmen. Erstellen Sie einen zweiten Artikel mit demselben Namen.",
      newPrice: "Preis der Zeile: {{price}}",
      update: "Artikel aktualisieren",
      duplicate: "Duplikat erstellen"
    },
    due: {
      title: "Zahlbar bis <accent>{{date}}</accent>",
      lead: "Der Zahlungslink bleibt bis zum Fälligkeitsdatum offen.",
      label: "Fälligkeitsdatum",
      previousMonth: "Vorheriger Monat",
      nextMonth: "Nächster Monat",
      close: "Schließen"
    },
    terms: {
      title: "Zum Schluss die administrativen Angaben",
      conditions: "Zahlungsbedingungen",
      legal: "Rechtliche Hinweise",
      addRedirect: "Weiterleitungs-URL hinzufügen",
      redirect: "Weiterleitungs-URL",
      redirectInvalid: "Geben Sie eine Adresse ein, die mit https:// beginnt",
      redirectHint:
        "Sobald die Rechnung bezahlt ist, kann Ihre Kundschaft mit einem Klick auf Ihre Website zurückkehren (Dankesseite, Bestellverfolgung…)."
    },
    review: {
      title: "Rechnung prüfen",
      client: "Kunde",
      articles: "Artikel",
      due: "Fälligkeit",
      notices: "Administrative Angaben",
      noNotices: "Keine Angaben",
      editRecipient: "Empfänger bearbeiten",
      editLines: "Artikel bearbeiten",
      editDue: "Fälligkeitsdatum bearbeiten",
      editNotices: "Administrative Angaben bearbeiten",
      create: "Rechnung erstellen"
    },
    sent: {
      title: "Rechnung {{number}} erstellt",
      lead: "Senden Sie sie Ihrem Kunden. Der Zahlungslink bleibt bis zum {{date}} offen.",
      mail: "Per E-Mail senden",
      copy: "Link kopieren",
      copied: "Link kopiert",
      share: "Teilen",
      pdf: "PDF herunterladen",
      newInvoice: "Neue Rechnung",
      view: "Rechnung ansehen",
      close: "Schließen"
    },
    mail: {
      subject: "Rechnung {{number}} · {{business}}",
      body: "Guten Tag,\n\nnachstehend finden Sie die Rechnung {{number}} von {{business}} über {{amount}}, zahlbar bis zum {{date}}.\n\nZahlung in Bitcoin: {{url}}\n\nMit freundlichen Grüßen\n{{business}}"
    },
    pdf: {
      invoice: "Rechnung",
      date: "Datum",
      due: "Fällig am",
      reference: "Ihre Referenz",
      billedTo: "Rechnung an",
      pay: "In Bitcoin bezahlen",
      payHint: "Scannen Sie den QR-Code oder öffnen Sie den Link.",
      title: "Rechnung {{number}}"
    },
    detail: {
      totalDue: "Fälliger Betrag",
      paid: "Bezahlter Betrag",
      due: "Fällig am",
      paidOn: "Bezahlt am",
      rest: "Noch zu bezahlen",
      createdBy: "Von Ihnen erstellt",
      recipient: "Empfänger",
      conditions: "Bedingungen und Hinweise",
      followUp: "Verlauf",
      created: "Erstellt",
      sent: "Gesendet",
      paidEvent: "Bezahlt",
      more: "Weitere Aktionen",
      remind: "Per E-Mail erinnern",
      copyLink: "Zahlungslink kopieren",
      duplicate: "Duplizieren",
      pdf: "PDF herunterladen",
      cancel: "Rechnung stornieren",
      title: "Rechnung {{number}}",
      breadcrumb: "Rechnung {{number}}",
      notFound:
        "Diese Rechnung ist nicht auffindbar. Sie wurde vielleicht auf einem anderen Gerät gelöscht.",
      reading: "Rechnung wird geladen…",
      readFailed:
        "Die Rechnung konnte nicht gelesen werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      cancelDialog: {
        title: "Rechnung {{number}} stornieren?",
        body: "Der Zahlungslink bietet keine Zahlung mehr an. Eine bereits erhaltene Zahlung bleibt in Ihrem Wallet.",
        confirm: "Rechnung stornieren",
        keep: "Rechnung behalten"
      },
      canceled: "Rechnung storniert",
      cancelReceived:
        "Diese Rechnung hat bereits eine Zahlung erhalten: Sie kann nicht mehr storniert werden",
      cancelFailed:
        "Die Rechnung konnte nicht storniert werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut"
    },
    draftDetail: {
      edit: "Entwurf bearbeiten",
      remove: "Entwurf löschen",
      removed: "Entwurf gelöscht",
      removeDialog: {
        title: "Entwurf {{number}} löschen?",
        body: "Er verschwindet von all Ihren Geräten. Seine Nummer wird nicht erneut vergeben.",
        confirm: "Entwurf löschen",
        keep: "Entwurf behalten"
      }
    },
    errors: {
      noAccount: "Entsperren Sie die App und versuchen Sie es erneut",
      invalid: "Vervollständigen Sie die Rechnung und versuchen Sie es erneut",
      number:
        "Die Rechnungsnummer konnte nicht vergeben werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut",
      noWebApp: "Zahlungslinks sind in dieser Version der App noch nicht verfügbar",
      noAddress:
        "Über {{max}} Sats (die Lightning-Obergrenze abzüglich einer Marge von {{margin}}) braucht eine Rechnung eine Onchain-Adresse, und keine Bitcoin-Adresse ist bereit. Versuchen Sie es gleich noch einmal",
      unverified:
        "Die Lightning-Obergrenze der Rechnung konnte nicht geprüft werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut",
      unreachable:
        "Die Rechnung konnte nicht gespeichert werden. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut",
      mailFailed:
        "Es konnte kein E-Mail-Programm geöffnet werden. Kopieren Sie stattdessen den Zahlungslink",
      pdfFailed: "Das PDF konnte nicht erstellt werden. Versuchen Sie es erneut",
      copyFailed: "Der Link konnte nicht kopiert werden"
    }
  },
  documentLanguage: {
    title: {
      mail: "Sprache der E-Mail",
      pdf: "Sprache des PDFs",
      export: "Sprache des Exports"
    },
    change: {
      mail: "Sprache der E-Mail: {{language}}. Ändern",
      pdf: "Sprache des PDFs: {{language}}. Ändern",
      export: "Sprache des Exports: {{language}}. Ändern"
    },
    yours: "Ihre Sprache"
  },
  currencies: {
    AUD: "australischen Dollar",
    CAD: "kanadischen Dollar",
    CHF: "Schweizer Franken",
    CZK: "tschechischen Kronen",
    DKK: "dänischen Kronen",
    EUR: "Euro",
    GBP: "Pfund Sterling",
    HKD: "Hongkong-Dollar",
    HUF: "ungarischen Forint",
    JPY: "japanischen Yen",
    MXN: "mexikanischen Pesos",
    NOK: "norwegischen Kronen",
    NZD: "neuseeländischen Dollar",
    PLN: "polnischen Złoty",
    SEK: "schwedischen Kronen",
    SGD: "Singapur-Dollar",
    USD: "US-Dollar",
    ZAR: "südafrikanischen Rand"
  },
  currencyNames: {
    AUD: "Australische Dollar",
    CAD: "Kanadische Dollar",
    CHF: "Schweizer Franken",
    CZK: "Tschechische Kronen",
    DKK: "Dänische Kronen",
    EUR: "Euro",
    GBP: "Pfund Sterling",
    HKD: "Hongkong-Dollar",
    HUF: "Ungarische Forint",
    JPY: "Japanische Yen",
    MXN: "Mexikanische Pesos",
    NOK: "Norwegische Kronen",
    NZD: "Neuseeländische Dollar",
    PLN: "Polnische Złoty",
    SEK: "Schwedische Kronen",
    SGD: "Singapur-Dollar",
    USD: "US-Dollar",
    ZAR: "Südafrikanische Rand"
  },
  businessNumbers: {
    company: {
      CH: "UID-Nummer",
      FR: "SIRET-Nummer",
      DE: "Steuernummer",
      IT: "Steuernummer (Codice fiscale)",
      ES: "NIF",
      PT: "NIF",
      FI: "Unternehmenskennung (Y-tunnus)",
      other: "Unternehmensnummer"
    },
    vat: {
      CH: "MWST-Nummer",
      EU: "USt-IdNr.",
      other: "Mehrwertsteuernummer"
    }
  },
  whatsNew: {
    title: "Neuigkeiten",
    open: "Neuigkeiten, {{build}}",
    openUnread: "Neuigkeiten, ungelesen, {{build}}",
    next: "Nächste Version",
    new: "Neu",
    source: "Quellcode",
    close: "Schließen",
    empty: "Hier erscheinen die Neuigkeiten jeder Version."
  }
};

export default de;
