import type { Translations } from "./fr";

const en: Translations = {
  common: {
    back: "Back",
    continue: "Continue",
    cancel: "Cancel",
    startCharging: "Start accepting payments",
    version: "Version {{version}}"
  },
  welcome: {
    headline: "Payments in <accent>bitcoin</accent>.",
    lead: "Point of sale, invoices and NFC cards.",
    guarantees: {
      nonCustodial: "Non-custodial",
      noKyc: "No KYC identification",
      oneMinute: "In 1 minute"
    },
    createAccount: "Create my account",
    login: "Log in",
    joinInvitation: "Join by invitation",
    alreadyHave: "I already have",
    have: {
      account: "A sattle.me account",
      invitation: "An invitation",
      boltCard: "A BoltCard"
    },
    manageBoltCard: "Manage my BoltCard",
    boltCardApp: {
      computer:
        "A computer cannot read NFC cards. Download the sattle.me app on your phone: you will create your account there, then hold the card to the phone to program it.",
      device:
        "This device cannot read NFC cards. Download the sattle.me app on your phone: you will create your account there, then hold the card to the phone to program it.",
      browser:
        "A browser cannot program a card. Open or install the sattle.me app on this phone: you will create your account there, then hold the card to the phone to program it.",
      iphone: "iPhone",
      android: "Android",
      codeIphone: "QR code of the sattle.me app on the App Store",
      codeAndroid: "QR code of the sattle.me app on Google Play",
      scan: "Scan the code for your phone with its camera."
    },
    terms: "By continuing, you accept the <link>terms and conditions</link>."
  },
  legal: {
    terms: "Terms and conditions",
    privacy: "Privacy policy"
  },
  account: {
    passkeyWarning:
      "Your passkey is the key to your wallet: deleting it can make your funds inaccessible.",
    progress: {
      creating: "Creating your passkey…",
      signingIn: "Signing in with your passkey…",
      preparing: "Preparing your account…",
      restoring: "Retrieving your settings…",
      terminal: "Preparing your point of sale…"
    },
    cancelled: {
      title: "Passkey cancelled",
      body: "Tap the button again to retry."
    },
    errors: {
      recoveryOverdue: "Your payments are blocked: first check your 12 recovery words.",
      rescueClosed: "Rescue mode closed: nothing was sent. Open it again with your 12 words.",
      unsupported:
        "This device or browser cannot use a sattle.me passkey. Use a recent browser, or the app on iPhone, iPad or Android.",
      prfUnsupported:
        "Your passkey manager is not compatible: use Apple's Passwords app or Google Password Manager.",
      notAssociated: "Passkeys are not enabled yet for this version of the app. Try again later.",
      notConfigured: "This version of the app is not configured to open a wallet.",
      cancelled: "Passkey cancelled. Tap the button again to retry.",
      timedOut:
        "Timed out. Try again, then confirm with your face, your fingerprint or your device passcode.",
      noCredential:
        "No sattle.me passkey was offered on this device. Check that your passkeys are synced to this device.",
      noCredentialAndroid:
        "No sattle.me passkey was offered on this device. Check that your password manager is not restricted by the battery saver.",
      alreadyExists: "A passkey already exists on this device: use “$t(welcome.login)”.",
      createdNotDerived:
        "Your passkey was created, but your wallet could not be opened. Tap “$t(welcome.createAccount)” to finish with this passkey.",
      connectFailed:
        "Your wallet could not be opened. Check your internet connection, then try again.",
      settingsTooNew:
        "Your settings were saved by a newer version of the app. Update the app, then try again.",
      notFound: "No account was found with this passkey on this device's Nostr relays.",
      terminalFailed:
        "Your point of sale could not be prepared. Check your internet connection, then try again.",
      deviceFailed: "Your account could not be prepared on this device. Try again.",
      failed: "Something went wrong. Try again."
    }
  },
  noAccount: {
    title: "No account found",
    unreachableTitle: "Relays unreachable",
    answered: {
      all: "No account is linked to this passkey on the Nostr relays below.",
      some: "No account is linked to this passkey on the Nostr relays below that answered. Others did not answer: “$t(relays.test)” shows which.",
      none: "None of the Nostr relays below answered: there is no way to tell whether an account is linked to this passkey. Check your internet connection."
    },
    lead: "Did you choose custom relays for your account? Add them, save, then tap “$t(welcome.login)”. If you have several passkeys, also check that you chose the right one."
  },
  // "Stay informed": the phone's notifications asked once, after the setup.
  notificationsOffer: {
    title: "Stay informed",
    lead: "Allow notifications: sattle.me tells you what matters, even with the app closed.",
    words: "Your 12 words",
    wordsBody: "A yearly reminder to check them, for your security.",
    cards: "Your cards",
    cardsBody: "Card payments waiting for your approval.",
    note: "Never any advertising. You can change your mind in the phone's settings.",
    allow: "Allow notifications",
    later: "Not now"
  },
  recoveryCheck: {
    reminders: {
      channel: "Recovery phrase",
      startTitle: "Time to check your 12 words",
      startBody:
        "A year has passed: type them back in sattle.me to make sure your sheet is still right.",
      weekTitle: "Your payments will be blocked in 7 days",
      eveTitle: "Your payments will be blocked tomorrow",
      soonBody: "Check your 12 words in sattle.me to keep paying.",
      dayTitle: "Your payments are blocked",
      dayBody: "Check your 12 words in sattle.me to pay again."
    },
    banner: {
      due: "Your spare key is not checked",
      daysLeft: "D−{{count}}",
      daysLeftLabel_one: "{{count}} day left",
      daysLeftLabel_other: "{{count}} days left",
      overdue: "Payments blocked: check your 12 words",
      action: "Check my 12 words"
    },
    title: "Check your 12 words",
    intro: {
      title: "Three cases where only your 12 words help",
      lost: "Phone lost or stolen",
      passkey: "Passkey erased",
      gone: "sattle.me no longer exists",
      lead: "In each of them, your 12 words open your account and your cards again. Without them, the funds are lost.",
      key: "The passkey is your everyday key. The 12 words are the spare one, kept at home: type them back from your sheet.",
      due_one: "{{count}} day left to do it.",
      due_other: "{{count}} days left to do it.",
      overdue: "Your payments are blocked until this check.",
      optional: "Nothing is due for now: this check is good practice, it blocks nothing.",
      start: "Start"
    },
    word: {
      progress: "Word {{index}} of 12",
      label: "What is word {{index}}?",
      hint: "The words of the list that start this way: nothing says which one is right.",
      unknown: "This word is not on the list: check its spelling",
      next: "Next word",
      previous: "Previous word",
      check: "Check"
    },
    lost: "I no longer have them",
    checking: "Checking…",
    done: {
      title: "Your 12 words are checked",
      lead: "Keep your sheet somewhere safe. The next check will come in a year, if your account still keeps more than CHF 1,000.",
      finish: "Done"
    },
    wrong: {
      title: "These words do not match",
      lead: "At least one word is wrong, or two are swapped. Take your sheet again and start over, or show your 12 words.",
      again: "Start over"
    },
    saveFailed:
      "Your words are right, but the check could not be saved. Check your internet connection, then try again.",
    retry: "Try again"
  },
  rescue: {
    section: "Recovery",
    entry: "Open with my 12 words",
    entryLead:
      "If your passkey no longer works, your 12 recovery words open your account so you can send its funds elsewhere.",
    words: {
      title: "Open with your 12 words",
      lead: "Type your account's recovery phrase, in order.",
      only: "Only type these words in the sattle.me app. No one will ever ask you for them, by email, by message or by phone.",
      label: "Your 12 words",
      count_one: "{{count}} word of 12",
      count_other: "{{count}} words of 12",
      unknown: "Word {{position}} is not on the list: check its spelling",
      checksum: "These 12 words do not form a valid phrase: check each of them and their order",
      valid: "Complete and valid phrase",
      submit: "Open my account",
      opening: "Opening your account…",
      note: "Your words are neither saved nor sent: they are forgotten as soon as you close this screen.",
      failed: "Your account could not be opened. Check your internet connection, then try again."
    },
    badge: "Rescue mode",
    funds: {
      title: "Your funds",
      lead: "Account opened with your 12 words. Send your funds to another wallet, then close.",
      leadWalletOnly:
        "No relay of this device knows your account: only your wallet opens. To find your cards, close, then change relays in “$t(relays.advanced)”.",
      wallet: "Wallet",
      card: "Card “{{name}}”",
      cardUnnamed: "Unnamed card",
      former: "Former wallet of the card “{{name}}”",
      formerUnnamed: "Former wallet of a card",
      reading: "Reading…",
      unread: "Not read yet",
      empty: "Empty",
      arriving: "{{amount}} on its way",
      send: "Empty",
      retry: "$t(wallet.retry)",
      cardsUnread:
        "Your cards could not be read on a majority of your relays: some may be missing. Try again later.",
      cardsFailed: "Your cards could not be read. Check your internet connection, then try again.",
      export: "Export the history",
      close: "Close",
      closeNote: "Closing forgets your 12 words on this device. Your funds stay where they are."
    },
    drain: {
      title: "Empty the wallet",
      intro:
        "The wallet's whole balance goes to a lightning, bitcoin or Spark address: type it, paste it or scan it. The fees are taken from that balance.",
      introNoScan:
        "The wallet's whole balance goes to a lightning, bitcoin or Spark address: type it or paste it. The fees are taken from that balance.",
      total: "Wallet balance",
      feesAbove: "The fees exceed the wallet's balance at this speed",
      empty: "This wallet holds nothing to send.",
      confirm: "Send everything",
      done: "{{amount}} sent: the wallet is empty.",
      pending: "{{amount}} sent off: it will arrive once it goes through.",
      failed: "The payment did not go through. Check the wallet's balance, then try again."
    },
    closed: "Rescue mode closed: open it again with your 12 words.",
    idle: {
      title: "Closing in {{seconds}} s",
      body: "Without activity, rescue mode closes and forgets your 12 words.",
      closed:
        "Rescue mode closed after 5 minutes without activity: type your 12 words again to reopen it."
    }
  },
  migration: {
    amount: "{{btc}} (about {{fiat}})",
    entry: "Migrate my Swiss\u00a0Bitcoin\u00a0Pay account",
    // Before the brand's wordmark (MigrateAccountEntry); `entry` is what screen readers say.
    entryLead: "Migrate from",
    home: {
      badge: "Swiss\u00a0Bitcoin\u00a0Pay becomes sattle.me",
      title: "Hello, {{business}}",
      titleUnnamed: "Hello",
      titleManual: "Migrate your Swiss\u00a0Bitcoin\u00a0Pay account",
      leadFound: "We found your account. Everything carries over to sattle.me:",
      leadPassword:
        "We found your account. To carry over your payouts, your Swiss\u00a0Bitcoin\u00a0Pay password, one last time:",
      leadManual:
        "Sign in to your Swiss\u00a0Bitcoin\u00a0Pay account one last time: your business and your payouts carry over to sattle.me, which has no password.",
      payoutsReading: "Reading…",
      payoutsAfterPassword: "After your password",
      read: "Read from your Swiss\u00a0Bitcoin\u00a0Pay account",
      money: "Your money follows: it is moved to your new account.",
      retry: "Try again",
      migrate: "Migrate"
    },
    login: {
      email: "Email",
      password: "Password",
      checking: "Logging in to your old account…",
      forgotten: "Forgot your password?",
      changed: "I already chose a new password",
      note: "Your password is used once and never kept.",
      errors: {
        refused: "Wrong email or password",
        unreachable: "Your old account does not answer. Check your connection and try again.",
        stopped:
          "So as not to lock your old account, we stopped trying this password. Choose a new one: we email you a link.",
        secondFactor:
          "Your old account asks for a verification code, which sattle.me cannot use. Write to us at {{email}}: we will help you update your account."
      }
    },
    forgot: {
      title: "Forgot your password",
      lead: "Enter the email of your old Swiss\u00a0Bitcoin\u00a0Pay account: we send you a link to choose a new password.",
      send: "Send the link",
      sending: "Sending…",
      invalidEmail: "This email address is not valid",
      failed: "The link could not be requested. Check your connection and try again.",
      sentTitle: "Check your email",
      sent: "If a Swiss\u00a0Bitcoin\u00a0Pay account uses {{email}}, an email was just sent to it. Open its link to choose a new password.",
      sentNote:
        "The link is valid for 15 minutes. Nothing received? Look in your spam folder, or go back to ask for it again.",
      choose: "Choose a new password"
    },
    password: {
      title: "New password",
      lead: "Choose the new password of your old Swiss\u00a0Bitcoin\u00a0Pay account.",
      label: "New password",
      rules: {
        length: "At least 8 characters",
        letter: "At least one letter",
        digit: "At least one digit"
      },
      met: "met",
      unmet: "not yet",
      save: "Save",
      saving: "Saving…",
      rejected: "This password is not accepted: check the rules below",
      failed: "The password could not be changed. Check your connection and try again.",
      expired:
        "This link is no longer valid: it was already used, or its 15 minutes have passed. Ask for a new one.",
      again: "Get a new link",
      doneTitle: "Password changed",
      done: "Your new password is saved. Log in with it to update your account."
    },
    confirm: {
      currency: "Currency",
      payouts: "Payouts",
      payoutsToChoose: "To choose once the account is created",
      split: "{{bitcoin}} bitcoin · {{bank}} bank",
      allBitcoin: "{{percent}} bitcoin",
      bank: "Bank account",
      holder: "Holder",
      freeze:
        "When your sattle.me account is created, your old account stops accepting payments. The sats it owes you are sent at once over Lightning to your sattle.me account, or by 0:00\u00a0UTC at the latest if the transfer does not go through right away.",
      notMine: "This is not my account",
      migratedTitle: "Account already updated",
      migrated:
        "“{{business}}” moved to sattle.me on {{date}}. Open your sattle.me account with its passkey.",
      logIn: "Log in"
    },
    freeze: {
      settingTitle: "Old Swiss\u00a0Bitcoin\u00a0Pay account",
      settingDescription:
        "Your old account could not be frozen at the end of the update: it still accepts payments, and its balance is not paid out to sattle.me. Freeze it now.",
      settingLead:
        "Log in one last time to your old Swiss\u00a0Bitcoin\u00a0Pay account: it is frozen, and the sats it owes you are sent at once over Lightning to your sattle.me account, or by 0:00\u00a0UTC at the latest.",
      settingStart: "Freeze my old account",
      running: "Closing your old account…",
      done: "Your old Swiss\u00a0Bitcoin\u00a0Pay account is frozen: it no longer accepts payments. Funds transferred to your new sattle.me wallet.",
      doneNone:
        "Your old Swiss\u00a0Bitcoin\u00a0Pay account is frozen: it no longer accepts payments. No balance to transfer.",
      donePending:
        "Your old Swiss\u00a0Bitcoin\u00a0Pay account is frozen: it no longer accepts payments. The funds will be transferred to your new sattle.me wallet by 0:00\u00a0UTC at the latest.",
      conflict:
        "Your old account was already updated to another sattle.me account: its money is paid out there. If this was not you, write to us at {{email}}.",
      rejected:
        "Your old account could not be frozen. Write to us at {{email}}: we will do it with you.",
      failed:
        "Your old account could not be frozen: it still accepts payments. Check your connection and try again.",
      lost: "Your old account could not be frozen: it still accepts payments. Write to us at {{email}}: we will do it with you."
    },
    transfer: {
      prompt: "Open your old wallet",
      running: "Moving your money…",
      retry: "Try again",
      sentTitle: "{{amount}} on its way to your new account",
      sent: "It will show in “$t(navigation.destinations.wallet)” once the network confirms it, usually within the hour. Network fee: {{fee}}.",
      more: "Another {{amount}} is on its way to your old account: you can move it from “$t(navigation.destinations.wallet)” once it arrives.",
      empty: "Your old wallet is empty: nothing to move.",
      waiting:
        "{{amount}} is arriving on your old account: you can move it from “$t(navigation.destinations.wallet)” once it arrives.",
      tooSmall:
        "Your old wallet holds {{amount}}, less than the fees to move it. It stays where it is for now.",
      unreadable: "Your phone could not open your old wallet. Try again, or type its 12 words.",
      failed: "The transfer did not go through. Check your connection and try again.",
      sheetTitle: "Move your old wallet?",
      from: "From",
      fromName: "Swiss Bitcoin Pay wallet",
      fromCaption: "12 words, on this phone",
      to: "To",
      toName: "Your sattle.me wallet",
      amountLabel: "Amount",
      amountUnknown: "Read when it is moved",
      sats: "{{sats}} sats",
      fiat: "about {{fiat}}",
      eraseNote: "The 12 words are then erased from this phone's memory, moved or not.",
      start: "Move",
      skip: "Don't move",
      skipTitle: "Erase without moving?",
      skipBody:
        "The 12 words of your Swiss Bitcoin Pay wallet will be erased from your phone's memory. The {{amount}} it holds can then only be recovered with your 12 words written on paper.",
      skipBodyUnknown:
        "The 12 words of your Swiss Bitcoin Pay wallet will be erased from your phone's memory. What it holds can then only be recovered with your 12 words written on paper.",
      skipConfirm: "I have the 12 words,\nerase without moving",
      erased: "The 12 words were erased from this phone.",
      tooSmallErased:
        "Your old wallet holds {{amount}}, less than the fees to move it: it stays where it is.",
      skipped:
        "The 12 words were erased from this phone, without a transfer. Your 12 words written on paper move what it holds.",
      eraseFailed: "The 12 words could not be erased from this phone. Try again."
    },
    done: {
      title: "Your account is up to date",
      todoTitle: "Still to do, if it applies to you",
      employees: "Invite your employees again",
      shop: "Move your online shop's integration",
      changes: "What changes",
      words:
        "{{amount}} is left on your old Swiss\u00a0Bitcoin\u00a0Pay wallet. Move it with the 12 words you wrote down when you created it.",
      wordsUnknown:
        "Your old Swiss\u00a0Bitcoin\u00a0Pay wallet could not be checked: it may still hold money. Move it with the 12 words you wrote down when you created it.",
      checking: "Checking your old wallet…",
      titleRunning: "Updating your account",
      lead: "Usually a few seconds.",
      // The steps of the migration's end (MigrationTimeline, end-steps.tsx).
      steps: {
        account: "sattle.me account created",
        accountCaption: "“{{business}}” is ready to accept payments.",
        frozen: "Old account frozen",
        frozenSent:
          "It no longer accepts payments. Funds transferred to your new sattle.me wallet.",
        frozenNone: "It no longer accepts payments. No balance to transfer.",
        frozenPending:
          "It no longer accepts payments. The funds will be transferred to your new sattle.me wallet by 0:00\u00a0UTC at the latest.",
        migratedElsewhere: "Old account already updated",
        notFrozen: "Old account not frozen",
        history: "Copying your history",
        historyWaiting: "As soon as your old account is frozen.",
        historyRunning: "Copying your history…",
        historyRead_one: "{{formatted}} movement read",
        historyRead_other: "{{formatted}} movements read",
        historyWritten_one: "{{copied}}\u00a0/\u00a0{{total}} movement",
        historyWritten_other: "{{copied}}\u00a0/\u00a0{{total}} movements",
        historyCopied: "History copied",
        historyCopiedCaption_one:
          "{{formatted}} movement, shown in “$t(navigation.destinations.wallet)”.",
        historyCopiedCaption_other:
          "{{formatted}} movements, shown in “$t(navigation.destinations.wallet)”.",
        historyEmpty: "No movement to copy.",
        historyNotCopied: "History not copied",
        wallet: "Old wallet"
      }
    },
    changes: {
      title: "What changes",
      lead: "As soon as your sattle.me account is created:",
      frozen:
        "Once frozen, your old Swiss\u00a0Bitcoin\u00a0Pay account no longer accepts any payment, at the till, online or on its Lightning address.",
      items: {
        employees: {
          title: "Invite your employees again",
          caption:
            "Their devices no longer accept payments on the old account. Invite them in “$t(navigation.destinations.employees)”: they scan your code and accept payments for you. A device too old for sattle.me can no longer accept payments."
        },
        shop: {
          title: "Move your online shop's integration",
          caption:
            "Your online shop no longer accepts payments on the old account. Create an integration in “$t(navigation.destinations.integrations)” and give its key to the person who runs your website."
        },
        limits: {
          title: "No more limits",
          caption:
            "With the sattle.me 3.0.0 update, there are no longer any limits or restrictions tied to identity verification."
        },
        money: {
          title: "Your money follows you",
          caption:
            "The sats the old account owes you are sent over Lightning to your sattle.me account as soon as you update, whatever your old settings; if the transfer does not go through, it is tried again every night at 0:00\u00a0UTC. Any that still arrive later follow as soon as they settle. Bank transfers already under way go through as usual."
        },
        cards: {
          title: "Move your cards",
          caption:
            "Hold each Swiss\u00a0Bitcoin\u00a0Pay card in “$t(navigation.destinations.cards)” to move its balance. A card not moved yet keeps working until {{cardEnd}}."
        },
        history: {
          title: "Your history is copied",
          caption:
            "Your sales, payouts and fees are copied into “$t(navigation.destinations.wallet)”, for information. They are in its CSV and PDF exports. Your old account's history stays available to view and export on dashboard.swiss-bitcoin-pay.ch until {{merchantEnd}}."
        }
      }
    },
    // The copy of the v2 account's history (src/features/migration/history-import.ts).
    history: {
      running: "Copying your Swiss\u00a0Bitcoin\u00a0Pay history in the background…",
      // While reading the v2 server (its pages tell no total), then writing to the relays.
      reading_one: "Reading your Swiss\u00a0Bitcoin\u00a0Pay history: {{formatted}} movement read…",
      reading_other:
        "Reading your Swiss\u00a0Bitcoin\u00a0Pay history: {{formatted}} movements read…",
      writing_one:
        "Copying your Swiss\u00a0Bitcoin\u00a0Pay history: {{copied}}\u00a0/\u00a0{{total}} movement…",
      writing_other:
        "Copying your Swiss\u00a0Bitcoin\u00a0Pay history: {{copied}}\u00a0/\u00a0{{total}} movements…",
      done_one:
        "Your history is copied: {{formatted}} movement, shown in “$t(navigation.destinations.wallet)”.",
      done_other:
        "Your history is copied: {{formatted}} movements, shown in “$t(navigation.destinations.wallet)”.",
      failed:
        "Copying your history did not finish. Start it again from “$t(settings.title)”, section “$t(settings.groups.account)”.",
      settingTitle: "Swiss\u00a0Bitcoin\u00a0Pay history",
      settingDescription:
        "Copy the sales, payouts and fees of your old account into sattle.me, for information. Possible until {{date}}.",
      start: "Import my history",
      lead: "Log in to your old Swiss\u00a0Bitcoin\u00a0Pay account one last time: your history is copied in the background.",
      note: "Your password is used once and never kept.",
      errors: {
        secondFactor:
          "Your old account asks for a verification code, which sattle.me cannot use. Contact support.",
        stopped:
          "So as not to lock your old account, we stopped trying. Check your password before trying again later.",
        unreachable: "Your old account does not answer. Check your connection and try again."
      }
    },
    words: {
      open: "Type my 12 words",
      title: "Your old wallet",
      lead: "Type, in order, the 12 words you wrote down when you created your wallet in the Swiss Bitcoin Pay app. Its money will be moved to your sattle.me account.",
      only: "Only these 12 words: never type here those of another wallet (Ledger, Trezor, BitBox or any other).",
      label: "Your 12 words",
      invalid: "These words do not make a wallet: check each of them and their order",
      mismatch:
        "These words are not those of your Swiss\u00a0Bitcoin\u00a0Pay wallet: check each of them and their order, then type them again",
      unused:
        "These words match no wallet that ever received money: check each of them and their order, then type them again",
      submit: "Move",
      done: "Done",
      note: "Your words are used once and never kept."
    },
    employee: {
      title: "Swiss Bitcoin Pay becomes sattle.me",
      lead: "This device accepted payments for a business. To continue, ask the manager to invite you again from sattle.me, then scan their code.",
      leadBusiness:
        "This device accepted payments for “{{business}}”. To continue, ask the manager to invite you again from sattle.me, then scan their code.",
      join: "Scan the invitation",
      owner: "I am the manager of this business"
    },
    wallet: {
      unchecked:
        "Your old Swiss Bitcoin Pay wallet is on this phone. Check whether there is money left to move.",
      check: "Check and move",
      funds: "{{amount}} is left on your old account, to move here.",
      transfer: "Move",
      incoming: "{{amount}} is arriving on your old account: you can move it once it arrives."
    }
  },
  split: {
    title: "How do you want to be paid?",
    description:
      "The app will offer to sell this share of what you receive. You can change it at any time.",
    bitcoin: "Bitcoin",
    freeUntil: "Free until {{date}}",
    sattleFee: "sattle.me fee",
    sattleFeeScope: "On everything you take in, converted or not",
    conversionFee: "Conversion to {{currency}}",
    conversionFeeScope: "Mt Pelerin's sale fees, only on the share converted",
    extraFee: "+ {{fee}}",
    transferNote:
      "Free transfer from {{threshold}}. Below it, your sales are grouped until they reach it, or transferred at once for {{fee}}.",
    waivedRate: "{{free}} instead of {{fee}}",
    feeRange: "{{min}} to {{max}}",
    sliderLabel: "Bitcoin share",
    sliderValue: "{{bitcoin}} in bitcoin, {{fiat}} in {{currency}}",
    currencyButton: "Payout currency: {{currency}}"
  },
  bank: {
    currentAccount: "The saved account",
    currentAccountSub: "At Mt Pelerin, in this currency",
    editAccount: "Edit this account",
    title:
      "Where should we send the <accent>{{percent}}</accent> converted to <accent>{{currency}}</accent>?",
    transferSchedule: "Your sales are transferred there, grouped into one transfer.",
    editableLater: "You can change these details in the settings.",
    country: "Country of residence",
    iban: "IBAN",
    ibanInvalid: "Check the IBAN",
    holderKind: "The holder is",
    person: "A person",
    company: "A company",
    companyName: "Company name",
    firstname: "First name",
    lastname: "Last name",
    address: "Address",
    addressPlaceholder: "Street and number",
    postalCode: "Postal code",
    postalCodePlaceholder: "1003",
    city: "City",
    cityPlaceholder: "Lausanne",
    mtPelerin: {
      sheetTitle: "Mt Pelerin account",
      lead: "This share is sold to our partner Mt Pelerin, a Swiss financial intermediary, which wires the amount to your bank account.",
      accountTitle: "Your account with our partner",
      accountSms: "Your mobile number and a code received by SMS, then your e-mail",
      accountKey: "Your sattle.me account's key, then your e-mail and your number",
      bankTitle: "Your bank account",
      bankSub: "Registered with our partner, which wires your sales to it",
      saleTitle: "Nothing is sold without you",
      saleSub:
        "The app offers to sell this share, you confirm with your passkey. Before the first sale, a payment of 1 sat verifies your wallet",
      connected: "Mt Pelerin account connected: this bank account will be registered there",
      create: "Create my Mt Pelerin account",
      existing: "I already have a Mt Pelerin account",
      createTitle: "Create your account",
      createLeadSms:
        "With your mobile number, then your e-mail. An account already opened with this number is reused.",
      createLeadKey: "With your sattle.me account's key, then your e-mail and your number.",
      existingTitle: "Connect your account",
      existingLeadSms: "With your account's mobile number.",
      existingLeadKey: "With your sattle.me account's key."
    }
  },
  setup: {
    title: "Setting up your account…",
    description:
      "Preparing your Lightning address and your point of sale. This may take a few moments.",
    cardDescription: "Preparing your account on this device. This only takes a moment.",
    failedTitle: "Setup interrupted",
    retry: "Try again"
  },
  appStores: {
    googlePlay: "Get the app on Google Play",
    appStore: "Get the app on the App Store"
  },
  install: {
    banner: {
      name: "sattle.me",
      iphone: "The app for iPhone, on the App Store",
      ipad: "The app for iPad, on the App Store",
      android: "The app for Android, on Google Play",
      computer: "In a window of its own, like an app",
      get: "Get",
      install: "Install",
      dock: "Add to Dock",
      dismiss: "Close, don't offer again"
    },
    setting: {
      title: "Install the app",
      places: {
        iphone: "The sattle.me app for iPhone, on the App Store.",
        ipad: "The sattle.me app for iPad, on the App Store.",
        android: "The sattle.me app for Android, on Google Play.",
        computer: "sattle.me on this computer, in a window of its own, like an app.",
        dock: "sattle.me in this Mac's Dock, in a window of its own, like an app."
      },
      appStore: "App Store",
      googlePlay: "Google Play"
    },
    dock: {
      title: "Add sattle.me to the Dock",
      menu: "In Safari's menu bar, choose <strong>File > Add to Dock</strong>.",
      add: "Click <strong>Add</strong>: sattle.me opens from the Dock, in a window of its own.",
      requirement: "With Safari on macOS Sonoma or later.",
      passkey: "The Dock's app keeps its own data: the first time, log in again with your passkey.",
      done: "Got it"
    }
  },
  countryPicker: {
    search: "Search for a country",
    noResult: "No country found",
    close: "Close"
  },
  currencyPicker: {
    title: "Payout currency",
    close: "Close"
  },
  card: {
    computerTitle: "Add your <accent>card</accent> from your phone",
    computerDescription:
      "A computer cannot read NFC cards. Scan this code with your phone: it opens the app, where you log in with the same passkey. Then hold the card to the phone.",
    computerCode: "QR code that opens this step in the app on your phone",
    computerWaiting: "Waiting for your phone: this page continues as soon as the card is added.",
    // The same in the app on a device that reads no card (an iPad, useReadsCards.ts).
    deviceDescription:
      "This device cannot read NFC cards. Scan this code with your phone: it opens the app, where you log in with the same passkey. Then hold the card to the phone.",
    deviceDescriptionNoCode:
      "This device cannot read NFC cards. Open the app on your phone and log in with the same passkey, then hold the card to the phone.",
    deviceWaiting: "Waiting for your phone: this screen continues as soon as the card is added.",
    addedTitle: "Your <accent>card</accent> is added",
    addedDescription: "Added from your phone, it also shows here, in “Cards”. Top it up to use it.",
    webTitle: "Pair your <accent>BoltCard</accent> from the app",
    webDescription:
      "A browser cannot program a card. Open the sattle.me app on this phone and log in with your passkey: the pairing will resume there.",
    webDescriptionAndroid:
      "A browser cannot program a card. Open the sattle.me Android app on this phone, or install it, then log in with your passkey: the pairing will resume in the app.",
    webDescriptionIphone:
      "A browser cannot program a card. Open the sattle.me iPhone app on this phone, or install it, then log in with your passkey: the pairing will resume in the app.",
    retry: "Try again",
    openSettings: "Open settings",
    activationPending:
      "Your card is programmed, but its relay has not answered yet. It will be activated the next time you open the app with a connection: until then, it cannot pay.",
    activationNoPush:
      "Your card is ready, but this phone does not receive payment notifications: it pays only while the app is on screen. Notifications will turn on by themselves if this phone can receive them.",
    failure: {
      noAccount: "Your session is closed. Log in again with your passkey, then try again.",
      nfcUnavailable:
        "NFC is unavailable or turned off on this device. Turn it on in the settings, then try again.",
      notificationsDenied:
        "Allow sattle.me's notifications in the phone's settings: they are how your phone learns that a till is reading your card.",
      relayUnreachable:
        "The card's relay is not answering. Check your connection, then try again. Your card was not changed.",
      relayIncompatible:
        "The card's relay does not speak the expected version. Your card was not changed.",
      relayTooLong: "This relay's address is too long to fit in a card.",
      recordsUnreachable:
        "Not enough of your account's relays are answering. Check your connection, then try again. Your card was not changed.",
      notConfirmed:
        "Your account's relays did not confirm this change: it may still apply, or not. Check your connection, then try again.",
      notBlank: "This card is not blank. Ask its issuer to reset it first.",
      ownCard:
        "This card is already in “Cards”. To add it again, delete it first, the card in hand.",
      notThisCard:
        "This is not the chosen card, or it was reprogrammed elsewhere. Nothing was changed: hold the right card near the phone.",
      cardLost:
        "The card moved away too early. Hold it near the phone again and keep it there until the end: the pairing will resume where it stopped.",
      notBoltCard: "This card is not a BoltCard (NTAG 424 DNA).",
      verifyFailed:
        "The card was programmed, but its check failed. Hold it near the phone again to retry.",
      versionsExhausted:
        "This card has been programmed too many times with this wallet. Use another card.",
      newerApp: "A newer version of the app saved this card. Update the app.",
      walletNotEmpty:
        "This card's wallet is not empty, or sats are still on their way to it. Withdraw its balance to your main balance first: a deleted card no longer shows anywhere, nor do its sats. Your card was not changed.",
      walletUnavailable:
        "This card's wallet did not answer: a card is only deleted once its wallet is checked empty. Check your connection, then try again. Your card was not changed.",
      cardGone: "This card is no longer in “Cards”: it was deleted. Nothing was changed.",
      deletionPending:
        "Your account's relays have not recorded the deletion yet: the card was not made blank.",
      migrationDrainFailed:
        "This card's balance couldn't be transferred this time, and the card wasn't changed: try again in a moment.",
      migrationOverDailyLimit:
        "This transfer is above the card's limit: CHF 1,000 per 24 hours, its recent spending included. Nothing was transferred and the card wasn't changed: try again once its balance is under this limit, or contact support.",
      migrationReceiptPending:
        "The transfer was requested, but its arrival in the new wallet couldn't be confirmed in time. Your sats may already be on their way: “Cards” shows the card and its wallet. The card wasn't changed: wait a moment, then try again.",
      migrationMasterKey:
        "The card couldn't be re-encoded: its master key isn't the expected one. What was already transferred is in its new wallet, which “Cards” shows. Try again; if this persists, contact support.",
      migrationNotWiped:
        "The card couldn't be reset. What was already transferred is in its new wallet, which “Cards” shows. Try again; if this persists, contact support.",
      migrationCardDisabled:
        "This card is locked or blocked on the former service: it can't be migrated. If you locked it yourself, unlock it first; otherwise, contact support. Nothing was changed.",
      migrationPaymentPending:
        "A payment of this card is still in progress on the former service, often the transfer just made: it can't be erased yet. The card wasn't changed: try again in a moment, and the migration will resume where it stopped.",
      migrationServerUnreachable:
        "The exchange with the Swiss Bitcoin Pay server, the only one that can open this card, didn't go through. Check your connection and keep the card against the phone, then try again: the pairing will resume where it stopped.",
      cancelled: "Pairing cancelled.",
      failed: "The pairing failed. Try again."
    },
    nfcAlert: "Hold your BoltCard near the top of the phone and keep it in place.",
    nfcSuccess: "Card paired",
    nfcFailure: "Pairing interrupted",
    notificationChannel: "Card payments",
    decline: {
      newPayee:
        "New merchant: the cardholder must approve it in their sattle.me app, then present the card again.",
      unidentifiedPayee:
        "Merchant not identified: the cardholder must confirm the payment in their sattle.me app.",
      unconfirmed: "Payment to be confirmed by the cardholder in their sattle.me app.",
      notConfirmed: "Payment not confirmed on the cardholder's phone.",
      refused: "Payment declined by the cardholder.",
      insufficientBalance: "Insufficient card balance.",
      aboveLimit: "Amount above the card's limit per payment.",
      dayLimit: "The card's 24-hour limit has been reached.",
      hourLimit: "Too many payments with this card within the hour.",
      suspended: "Card paused: the cardholder can resume it in their sattle.me app.",
      invalidInvoice: "Invoice not valid for this card.",
      expired: "Invoice expired: create a new one.",
      noAmount: "Invoice without an amount: the card only pays a set amount.",
      outOfBounds: "Amount outside the card's limits (1 sat to 1 BTC).",
      alreadyPaid: "The card does not pay this invoice: it is already settled.",
      invalidTap: "Card reading not valid: present the card again.",
      sendFailed: "The payment did not go out, nothing was paid. Present the card again.",
      uncertain:
        "Payment interrupted: it may still arrive, wait a few seconds before trying again.",
      updateApp: "The cardholder must update their sattle.me app.",
      superseded: "Another reading of the card replaced this one.",
      other: "The payment could not be processed."
    },
    payment: {
      title: "Card payment",
      close: "Close",
      waiting: "Card read, waiting for the till's invoice…",
      checking: "Checking the merchant…",
      delay: {
        minute: "within a minute",
        seconds_one: "within {{count}} second",
        seconds_other: "within {{count}} seconds"
      },
      note: {
        newPayee: "New merchant: check the amount and the name before paying.",
        unidentifiedPayee:
          "The till did not prove who receives this payment: check the amount with the merchant.",
        unconfirmed: "Check the amount and the merchant."
      },
      pay: "Pay {{amount}}",
      decline: "Decline",
      answerIn: "Answer within {{seconds}} s",
      timeOut: "Time is up",
      timeLabel: "Time to answer",
      merchant: "Merchant",
      noteLabel: "Note",
      card: "Card",
      exactAmount: "Exact amount",
      approve: "Approve this merchant",
      approveCaption: "Its next payments will go without confirmation",
      joined: "{{first}} · {{second}}",
      ofCard: "card {{name}}",
      confirming: "Confirm with your passkey…",
      paying: "Sending the payment…",
      payingAutomatically: "Sending the payment, without confirmation…",
      approved: "This merchant is now one of your approved merchants.",
      done: "Done",
      doneIn: "Done ({{seconds}} s)",
      failedTitle: "Payment not made",
      nothingPaid: "Nothing was paid.",
      result: {
        completedTitle: "Payment made",
        completedBody: "{{amount}} paid with your card.",
        completedBodyAutomatic: "{{amount}} paid with your card, without confirmation.",
        pendingTitle: "Payment sent",
        pendingBody:
          "The payment of {{amount}} has left. Its status shows in the list of transactions.",
        failedTitle: "Payment failed",
        failedBody:
          "The payment of {{amount}} did not go through. Its status shows in the list of transactions.",
        declinedTitle: "Payment declined",
        declinedBody:
          "You declined this payment of {{amount}}. Nothing was paid; the till has been told."
      },
      failure: {
        unreachable:
          "The card's relay is not answering, or this payment has expired. Nothing was paid.",
        ended:
          "The till is no longer waiting for this payment. Nothing was paid: present your card again if needed.",
        invalidInvoice: "The till sent an invoice your wallet cannot pay. Nothing was paid.",
        otherNetwork: "The till's invoice is for another Bitcoin network. Nothing was paid.",
        expired: "The till's invoice has expired. Nothing was paid.",
        noAmount: "The till's invoice has no amount in whole sats. Nothing was paid.",
        outOfBounds: "The amount is outside the limits of a card payment. Nothing was paid.",
        suspended: "This card is paused. Nothing was paid.",
        alreadyPaid: "This invoice was already paid. Nothing was paid again.",
        dayLimit: "This payment would exceed your card's 24-hour limit. Nothing was paid.",
        hourLimit: "Your card has reached its number of payments for the hour. Nothing was paid.",
        aboveLimit: "The amount is above your card's limit. Nothing was paid.",
        notYourCard: "This payment does not come from a tap of your card. Nothing was paid.",
        replayed: "This tap of your card was already used. Nothing was paid.",
        unlock: "The payment was not confirmed. Nothing was paid.",
        insufficientBalance:
          "Your card's balance does not cover this payment and its fee. Nothing was paid: top up the card in “Cards”.",
        sendFailed:
          "Your wallet could not send this payment, for example for lack of balance. Nothing left.",
        uncertain:
          "Your wallet did not confirm the sending: the payment may have left. Check the list of transactions before paying another way.",
        newerApp: "A newer version of the app saved your card. Update the app. Nothing was paid.",
        otherInvoice:
          "The merchant's service does not recognise this invoice: it may have been replaced on the way. Nothing was paid.",
        settled:
          "The merchant's service says this invoice is already paid. Nothing was paid again.",
        newPayee:
          "No confirmation {{delay}}: nothing was paid. The till was told that this new merchant must be approved in the app.",
        newPayeeHomonym: "No confirmation {{delay}}: nothing was paid.",
        unidentifiedPayee:
          "No confirmation {{delay}}: nothing was paid. The till was told that the merchant is not identified.",
        unconfirmed: "No confirmation {{delay}}: nothing was paid. The till was told.",
        late: "The payment could not leave {{delay}}. Nothing was paid.",
        failed: "This payment could not be processed. Nothing was paid."
      }
    },
    payee: {
      quoted: "“{{name}}”",
      unnamed: "Unknown name",
      node: "Node {{node}}",
      by: {
        address: "identified by its Lightning address",
        node: "identified by its Lightning node"
      },
      nodeWarning:
        "This merchant is identified by its Lightning node, not by its address. If this node is shared (Spark, Wallet of Satoshi, Strike…), approving it also approves all its other users: they would be paid without confirmation, within the card's limits.",
      formerName: "formerly “{{name}}”",
      localName: "in your merchants: “{{name}}”",
      homonym: "Same name as an approved merchant, but a different account: check before paying.",
      chip: {
        approved: "Approved on {{date}}",
        approvedUndated: "Approved",
        new: "New merchant",
        unidentified: "Unidentified merchant",
        unchecked: "Not checked (automatic mode)"
      },
      declaredName: "{{name}}, name declared by the merchant",
      declaredByNode: "{{name}}, name declared by the node"
    },
    notice: {
      title: "Card payment: {{amount}}",
      body: "{{amount}} to {{name}}",
      askTitle: "Pending: Card payment",
      askBody: "{{amount}} to {{name}}. Click to confirm, the till is waiting.",
      askBodyUnchecked: "{{amount}}. Click to confirm, the till is waiting.",
      askBodyNoInvoice: "Click to confirm, the till is waiting.",
      refusedTitle: "Refused: Card payment ({{amount}} to {{name}})",
      refusedTitleUnchecked: "Refused: Card payment ({{amount}})",
      refusedTitleNoInvoice: "Refused: Card payment",
      pausedBody: "{{card}} is paused. Nothing was paid."
    }
  },
  cards: {
    title: "Cards",
    locked: {
      title: "Your cards are locked",
      body: "Unlock the app with your passkey to see and manage your cards."
    },
    pairOnPhone:
      "To pair a card, open the app on your phone: it programs the card, held against it.",
    pairOnAndroid:
      "To pair a card, use the sattle.me Android app: it programs the card, held against the phone.",
    pairOnIphone:
      "To pair a card, use the sattle.me iPhone app: it programs the card, held against the phone.",
    shop: {
      order: "Order cards",
      title: "Choose your card",
      lead: "Several designs, to order from the sattle.me shop."
    },
    loading: "Loading your cards…",
    failed: {
      noAccount: "Your session is closed. Unlock the app with your passkey, then try again.",
      unreachable:
        "Your cards could not be read: your account's relays are not answering. Check your connection, then try again."
    },
    retry: "Try again",
    map: {
      title: "Where to pay with your card",
      source: "Contactless Lightning · BTC Map",
      desktopSubtitle: "The shops that accept contactless Lightning payment · BTC Map's map",
      openSite: "Open btcmap.org",
      loading: "Loading the map…",
      failedTitle: "The map did not load",
      failedBody:
        "BTC Map is not answering, or the device is offline. Check your connection, then try again.",
      openInBrowser: "Open btcmap.org in the browser",
      frameTitle: "BTC Map's map of the shops that accept contactless payment"
    },
    unnamed: "Card {{id}}",
    carousel: "Your cards",
    slot: "Card {{n}} of {{count}}: {{label}}",
    add: "Add a card",
    cardOf: "Card {{name}}",
    order: {
      organize: "Organise",
      organizeA11y: "Organise cards",
      title: "Card order",
      lead: "Hold a handle and drag. The first card shows when you open “Cards”, on all your devices.",
      rowLead: "Drag a card to its place (or ← →). The first one shows on opening.",
      save: "Save",
      cancel: "Cancel",
      close: "Close",
      saved: "Card order saved",
      failedTitle: "Order not saved",
      unsaved: "Your account's relays did not answer: check your connection, then try again",
      newer: "It was chosen in a newer version of the app: update the app to change it",
      moveUp: "Move up",
      moveDown: "Move down",
      moveLeft: "Move left",
      moveRight: "Move right",
      row: "{{label}}, {{n}} of {{count}}",
      moved: "{{label}}, now {{n}} of {{count}}",
      previous: "Previous cards",
      next: "Next cards"
    },
    // "Add a card", in "Cards" and the sign-up (AddCardFlow.tsx).
    adding: {
      guide: {
        title: "Before you start",
        subtitle: "A blank BoltCard. A card from the former app is migrated, with its balance.",
        card: "A blank BoltCard",
        cardBody: "A card from the former app is migrated, with its balance.",
        notifications: "Notifications",
        notificationsBody:
          "Allow them when the phone asks: they are how it learns that a till reads the card.",
        start: "Start"
      },
      web: {
        note: "A computer cannot read NFC cards: a card is added from the app, on your phone, with the card in hand.",
        noteDevice:
          "This device cannot read NFC cards: a card is added from the app, on your phone, with the card in hand.",
        noteAndroid:
          "A browser cannot program a card: a card is added from the sattle.me Android app, with the card in hand.",
        noteIphone:
          "A browser cannot program a card: a card is added from the sattle.me iPhone app, with the card in hand.",
        where: "Against the phone",
        whereBody: "Keep the card in place until the end, a few seconds.",
        code: "QR code that opens “Add a card” in the app on your phone",
        scan: "Scan this code with your phone: it opens “Add a card” in the app."
      },
      steps: {
        label: "Steps of adding the card",
        notifications: "Notifications allowed",
        notificationsTodo: "Notification permission",
        notificationsRunning: "Allowing notifications",
        notificationsFailed: "Notifications not allowed",
        notificationsCaption: "That is how your phone learns that a till reads the card",
        relay: "Card's relay reachable",
        relayTodo: "Card's relay check",
        relayRunning: "Checking the card's relay",
        relayFailed: "Card's relay not checked",
        card: "Card held to the phone",
        cardTodo: "Holding the card",
        cardRunning: "Waiting for the card",
        cardFailed: "Card not recognized",
        cardIos: "Above the phone, until the confirmation",
        cardAndroid: "Against the back of the phone, until it vibrates",
        programming: "Card programmed",
        programmingTodo: "Card programming",
        programmingRunning: "Programming the card",
        programmingFailed: "Card not programmed",
        programmingCaption: "Do not move the card",
        activating: "Card activated",
        activatingTodo: "Card activation",
        activatingRunning: "Activating the card",
        activatingFailed: "Card not activated",
        activatingPending: "Activation to finish",
        activatingCaption: "The relay registers this phone",
        prepTitle: "Preparing…",
        prepSubtitle: "Two checks before the card",
        holdIos: "Hold the card above the phone",
        holdAndroid: "Hold the card against the back of the phone",
        holdSubtitle: "A blank BoltCard",
        keepTitle: "Keep the card in place",
        keepSubtitle: "Programming for your wallet",
        almostTitle: "Almost done",
        almostSubtitle: "You can move the card away",
        doneTitle: "Card added",
        doneSubtitle: "Top it up to use it",
        failedTitle: "The card was not added",
        failedNothing: "Nothing was written to the card",
        failedGoesOn: "It will resume where it stopped",
        notificationsDenied: "Notifications refused",
        notificationsDeniedCaption: "Allow them in the phone's settings, then try again.",
        nfcUnavailable: "NFC unavailable",
        lost: "Card moved away too early",
        lostIos:
          "Hold it again and keep it in place until the confirmation: adding it will resume where it stopped.",
        lostAndroid:
          "Hold it again and keep it in place until it vibrates: adding it will resume where it stopped.",
        relayUnreachable: "Relay unreachable",
        relayUnreachableCaption:
          "{{host}} does not answer: check this phone's connection, then try again",
        relayIncompatible: "Relay incompatible",
        relayIncompatibleCaption:
          "{{host}} does not speak the expected version: update the app, then try again",
        recordsUnreachable: "Account's relays unreachable",
        recordsUnreachableCaption:
          "Too few of your account's relays answer: check this phone's connection, then try again",
        notBlank: "Card not blank",
        notBoltCard: "Card not compatible",
        notBoltCardCaption: "This card is not a BoltCard (NTAG 424 DNA): hold a blank BoltCard",
        ownCard: "Card already added",
        verifyFailed: "Check failed",
        cancelled: "Card reading cancelled",
        failed: "Adding the card failed: try again",
        recharge: "Top up the card",
        later: "Later",
        cancel: "Cancel",
        stateTodo: ": to come",
        stateRunning: ": in progress",
        stateDone: ": done",
        stateFailed: ": failed",
        stateWarning: ": to check"
      },
      migration: {
        heading: "Card migration",
        foundTitle: "Swiss Bitcoin Pay card detected",
        toTransfer: "Balance to transfer",
        reading: "Reading the balance…",
        amountA11y: "{{amount}} sats",
        whatLabel: "What will happen",
        whatTransfer: "Its balance is transferred to the card's wallet, in your app.",
        whatErase:
          "You hold the card to the phone a second time: it is erased, then programmed for your wallet.",
        whatVisual: "It keeps its visual and its number.",
        confirm: "Transfer and migrate",
        label: "Steps of the migration",
        transferred: "Balance transferred",
        transferTodo: "Balance transfer",
        transferRunning: "Transferring the balance",
        recognized: "Card recognized",
        recognizedTodo: "Card recognition",
        recognizedRunning: "Recognizing the card",
        recognizedFailed: "Card not recognized",
        recognizedCaption: "Its wallet keeps what it has already transferred",
        nothingCaption: "No balance to transfer",
        receivedCaption: "{{amount}} received",
        sendingCaption: "{{amount}} on their way",
        heldSecond: "Card held a second time",
        heldSecondTodo: "Holding the card a second time",
        heldAgain: "Card held once more",
        heldAgainTodo: "Holding the card once more",
        programmed: "Card erased and programmed",
        programmedTodo: "Card erasure and programming",
        programmedRunning: "Erasing and programming the card",
        activated: "Card activated",
        doneTitle: "Card migrated",
        doneSubtitle: "It now pays from its own wallet, within its limits.",
        doneSubtitleVisual:
          "It keeps its visual and its number, and now pays from its own wallet, within its limits.",
        failedTitle: "The migration did not go through",
        failedGoesOn: "It will resume where it stopped",
        failed: "The migration failed: try again",
        notTransferred: "Balance not transferred",
        transferUnconfirmed: "Transfer not confirmed",
        lostIos:
          "Hold it again and keep it in place until the confirmation: the migration will resume where it stopped.",
        lostAndroid:
          "Hold it again and keep it in place until it vibrates: the migration will resume where it stopped.",
        transferTitle: "Transferring the balance",
        transferSubtitle: "{{amount}} are going to the card's wallet. Keep the card at hand.",
        keepTitle: "Keep the card in place",
        keepSubtitle: "Erasing and programming: do not move it.",
        almostTitle: "Almost done",
        almostSubtitle: "You can move the card away.",
        holdSecond: "Hold the card to the phone a second time",
        holdAgain: "Hold the card to the phone once more",
        holdSubtitleIos:
          "Above the phone, until the confirmation: it will be erased, then programmed.",
        holdSubtitleAndroid:
          "Against the back of the phone, until it vibrates: it will be erased, then programmed.",
        finish: "Done"
      }
    },
    // "Cards", the screen.
    home: {
      firstCard: "Add your first card",
      newCard: "New card",
      addLead: "A blank BoltCard pays from its own self-custodial wallet, which you top up here.",
      steps: {
        program: {
          title: "Program it",
          caption: "Hold the blank card against your phone: the phone programs it."
        },
        recharge: {
          title: "Top it up",
          caption: "It has its own wallet: send it the sats it will be able to spend."
        },
        pay: {
          title: "Pay with a tap",
          caption: "Hold it to a merchant's terminal: it pays, within the limits you choose."
        }
      },
      reading: "Reading the balance…",
      received: "{{amount}} received",
      balanceA11y: "Card balance: {{amount}} sats",
      withdraw: "Withdraw",
      withdrawA11y: "Withdraw from the card",
      history: "History",
      rechargeA11y: "Top up the card",
      historyCaption: "All of the card's movements",
      withdrawEmpty: "Nothing to withdraw",
      sendCaption: "To another wallet",
      sendCaptionMain: "To another wallet or my main balance",
      migratingNote:
        "This card's migration is not finished: it does not pay yet. What it has already transferred is in its wallet, below.",
      finishMigration: "Finish the migration",
      finishOnPhone: "Finish it in the app on your phone, the card held against it.",
      security: "Security",
      pause: "Pause",
      pauseCaption: "It refuses every payment, forgetting nothing. The switch turns it back on.",
      limits: "Limits",
      payees: "Payments without confirmation",
      payeesReading: "Reading…",
      payeesPending: "not yet on the relays",
      payeesUnread: "Not read yet",
      payeesNewer: "Update the app",
      card: "Card",
      customize: "Customize",
      customizeCaption: "Name and look",
      customizeIssuer: "Name · issuer's visual",
      relay: "Relay and programming",
      advanced: "Advanced settings",
      advancedRelayReady: "Relay ready",
      delete: "Delete the card",
      deleteCaption: "It and all its data leave the app",
      deleteUnread: "Its balance must be read first"
    },
    // "Limits".
    limits: {
      edit: "Change",
      back: "Back to the limits",
      reading: "Reading the payments…",
      unread: "Your account's relays did not answer: what the card has already paid is not shown.",
      unreadPhone:
        "This phone's payments could not be read: what the card has already paid is not shown.",
      notePhone:
        "Based on the payments made by this phone. The windows slide: each payment is released 24 h (or 1 h) after it.",
      noteWeb:
        "Based on the card's payments your account's relays keep. The windows slide: each payment is released 24 h (or 1 h) after it.",
      at: "at {{time}}",
      tomorrowAt: "tomorrow at {{time}}",
      on: "on {{date}}",
      confirm: "Confirm with my passkey",
      fiatHint: "That is {{fiat}} at the current rate · {{max}} sats at most",
      satsHint: "{{max}} sats at most",
      countHint: "{{max}} at most",
      preview: {
        reached: "Limit reached",
        hourLeft_one: "{{count}} payment left",
        hourLeft_other: "{{count}} payments left",
        hourNext: "Next payment possible {{when}}"
      },
      day: {
        title: "Over 24 hours",
        of: "of {{max}} sats",
        limit: "Limit: {{max}} sats",
        left: "{{amount}} sats left, that is {{fiat}}",
        leftSats: "{{amount}} sats left",
        reached: "Limit reached: the card refuses every payment",
        release: "{{amount}} sats are released {{when}}",
        lead: "A payment that, with those of the last 24 hours, would go over this limit is refused.",
        used: "Already used: {{amount}} sats.",
        field: "Limit over 24 hours",
        belowUsed:
          "You have already used {{amount}} sats: the card will refuse every payment until the window frees up.",
        belowPayment:
          "Below the limit per payment ({{amount}} sats): this 24-hour limit will bound each payment."
      },
      hour: {
        title: "This hour",
        of_one: "payment of {{max}}",
        of_other: "payments of {{max}}",
        limit_one: "Limit: {{count}} payment per hour",
        limit_other: "Limit: {{count}} payments per hour",
        release: "The payment of {{paid}} is released {{when}}",
        reached: "Limit reached: next payment possible {{when}}",
        formTitle: "Payments per hour",
        lead: "A payment that, with those of the last hour, would go over this number is refused.",
        used_one: "Already this hour: {{count}} payment.",
        used_other: "Already this hour: {{count}} payments.",
        field: "Payments per hour",
        belowUsed_one:
          "You have already made {{count}} payment this hour: the card will refuse every payment until the window frees up.",
        belowUsed_other:
          "You have already made {{count}} payments this hour: the card will refuse every payment until the window frees up."
      },
      payment: {
        title: "Per payment",
        caption: "A higher payment is refused",
        lead: "A payment higher than this limit is refused.",
        field: "Limit per payment",
        aboveDay:
          "Above the limit over 24 hours ({{amount}} sats): the 24-hour limit will bound each payment."
      }
    },
    // "Customize": a card's "Name" and "Look".
    customize: {
      title: "Customise the card",
      name: "Name",
      clear: "Clear the name",
      taken:
        "Another of your cards is already called {{name}}. A different name tells them apart when paying.",
      look: "Look",
      lookKind: "Kind of look",
      color: "Colour",
      image: "Image",
      // Read by screen readers only.
      colors: {
        ink: "Ink",
        night: "Night",
        plum: "Plum",
        bordeaux: "Bordeaux",
        fir: "Fir",
        lagoon: "Lagoon",
        copper: "Copper",
        bitcoin: "Bitcoin"
      },
      choosePhoto: "Choose a photo",
      chooseImage: "Choose an image",
      takePhoto: "Take a photo",
      imageNote: "You will then frame it to the card's shape. It will replace the colour.",
      errors: {
        photoDenied: "Allow access to your photos in the device settings, then try again.",
        cameraDenied: "The camera does not open. Allow it in the device settings, then try again.",
        unreadable: "This image cannot be used. Choose another one.",
        imageUnpublished:
          "The image could not be saved on your account's relays. Check your connection, then try again.",
        failed: "The card could not be changed. Try again."
      }
    },
    // "Frame the image".
    frame: {
      title: "Frame the image",
      hint: "Drag to move, pinch or use the buttons to zoom.",
      hintWeb: "Drag the image to move it; the wheel or the buttons zoom it.",
      area: "Image to frame",
      zoomValue: "Zoom {{zoom}}",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      moveLeft: "Move the image left",
      moveRight: "Move the image right",
      moveUp: "Move the image up",
      moveDown: "Move the image down",
      use: "Use this image"
    },
    status: {
      active: "Active",
      suspended: "Paused",
      migrating: "Migration to finish"
    },
    sync: {
      ready: "Ready",
      noPush: "No notifications",
      unreachable: "Relay unreachable",
      refused: "Relay error"
    },
    onPhone: {
      label: "On your phone",
      openApp: "Open sattle.me on your phone",
      openAppScan: "Or scan this code with it: it opens “Cards” in the app.",
      hold: "Hold the card to the phone",
      code: "QR code that opens “Cards” in the app on your phone"
    },
    relay: {
      checking: "Checking the card…",
      readyTitle: "The card is ready",
      readyBody:
        "Its relay, {{host}}, wakes this phone at each payment. It holds no key and no funds.",
      stateTitle: "Card status",
      reachable: "Relay reachable",
      defaultCaption: "{{host}}, default relay",
      programmed: "Card programmed for this relay",
      programmedCaption: "Its next taps are expected there",
      notWoken: "This phone is not woken",
      notWokenCaption: "Notifications off: the card pays only while the app is open on this phone.",
      noTokenCaption:
        "This phone does not receive payment notifications: the card pays only while the app is open on this phone.",
      enableNotifications: "Turn on notifications",
      unreachable: "Relay unreachable",
      unreachableCaption:
        "{{host}} did not answer this phone: the card cannot pay until it answers.",
      refused: "Relay error",
      refusedCaption:
        "{{host}} refused the card's channel: it cannot pay while the relay refuses it.",
      uncheckedTitle: "Status not checked",
      uncheckedCaption: "The card's state could not be read on this phone. Try again in a moment.",
      change: "Change relay",
      changeCaption: "For a relay you host yourself",
      sourceLink: "sattleme/relay on github.com",
      webCaption: "It wakes your phone at each payment of the card, holding neither key nor funds.",
      webNote: "A computer cannot read NFC cards: the card is programmed from the app, on a phone.",
      webNoteAndroid:
        "A browser cannot program a card: it is programmed from the sattle.me Android app.",
      webNoteIphone:
        "A browser cannot program a card: it is programmed from the sattle.me iPhone app.",
      deviceNote:
        "This device cannot read NFC cards: the card is programmed from the app, on a phone.",
      webOnPhone: "On the phone",
      webStepsTitle: "On your phone, with the card in hand",
      webHoldCaption: "When the app asks for it, until the end of the steps.",
      defaultLink: "Default relay",
      fieldInvalid: "Enter a complete address",
      fieldLong: "Enter an address of {{max}} characters at most",
      fieldUnreachable: "Relay unreachable: check the address",
      fieldIncompatible: "Relay not compatible with this card",
      moved: "The card now goes through {{host}}",
      steps: {
        label: "Steps of the relay change",
        relay: "New relay reachable",
        relayTodo: "New relay check",
        relayRunning: "Checking the new relay",
        relayFailed: "New relay not checked",
        relayCaption: "{{host}}, expected version",
        card: "Card held to the phone",
        cardTodo: "Holding the card",
        cardRunning: "Waiting for the card",
        cardFailed: "Card not recognized",
        cardAndroid: "Against the back of the phone, until it vibrates",
        cardIos: "Above the phone, until the confirmation",
        programming: "Programmed for this relay",
        programmingTodo: "Programming for this relay",
        programmingRunning: "Being programmed for this relay",
        programmingFailed: "Not programmed for this relay",
        programmingCaption: "Do not move the card",
        former: "Former relay forgotten",
        formerTodo: "Former relay to forget",
        formerRunning: "Forgetting the former relay",
        formerFailed: "Former relay not forgotten",
        formerCaption: "{{relay}} no longer receives its taps",
        formerDown: "Former relay unreachable",
        formerDownCaption: "{{relay}} did not answer: its channel stays there, without effect",
        formerRefused: "Former relay in error",
        formerRefusedCaption:
          "{{relay}} refused to forget its channel: it stays there, without effect",
        formerUnknown: "Former relay to check",
        formerUnknownCaption:
          "{{relay}} answered without confirming it: its channel may still be there, without effect",
        lost: "Card moved away too early",
        lostAndroid:
          "Hold it again and keep it in place until it vibrates: the change will resume where it stopped.",
        lostIos:
          "Hold it again and keep it in place until the confirmation: the change will resume where it stopped.",
        holdAndroid: "Hold {{name}} against the back of the phone",
        holdIos: "Hold {{name}} above the phone",
        holdSubtitle: "It will go through {{host}}",
        keepTitle: "Keep the card in place",
        keepSubtitle: "Programming for the new relay",
        almostTitle: "Almost done",
        almostSubtitle: "You can move the card away",
        doneTitle: "The card goes through {{host}}",
        doneSubtitle: "It keeps its name, its balance and its settings",
        failedTitle: "The change did not go through",
        failedNothing: "Nothing was written to this card",
        failedGoesOn: "It will resume where it stopped",
        checkingTitle: "Checking the new relay",
        relayUnreachable: "{{host}} does not answer: check this phone's connection, then try again",
        relayIncompatible: "{{host}} does not speak the expected version",
        recordsUnreachable:
          "Too few of your account's relays answer: check this phone's connection, then try again",
        cancelled: "Card reading cancelled",
        failed: "The change failed: try again",
        resetNotice:
          "Until the change succeeds, the card no longer pays and no longer shows in “Cards”. With “Add a card”, it comes back on the default relay, with its balance, its name and its limits.",
        finish: "Done",
        cancel: "Cancel",
        stateTodo: ": to come",
        stateRunning: ": in progress",
        stateDone: ": done",
        stateFailed: ": failed",
        stateWarning: ": to check"
      }
    },
    history: {
      title: "History",
      subtitle: "Card {{name}}",
      reading: "Reading the history…",
      failed: "Your account's relays did not answer: the history cannot be shown.",
      legacyUnread:
        "Not all of your account's relays answered: older movements of the card may be missing.",
      ownOnly:
        "Your account's relays did not answer: payments made by your other phones may be missing.",
      walletFailed:
        "The card's wallet could not be read: its latest top-ups and withdrawals may be missing.",
      newer: "Some movements are only shown by a newer version of the app.",
      empty: "No movement for this card.",
      pendingGroup: "In progress",
      deposit: "Bitcoin deposit",
      depositConfirming: "Received · waiting for confirmation",
      depositClaiming: "Confirmed · being added to the balance",
      depositFees: "Waiting for lower fees: {{asked}} asked, {{max}} at most",
      depositFeesUnknown: "Waiting for lower fees: {{max}} sats at most",
      at: "{{time}} · {{what}}",
      paid: "Paid",
      refused: "Refused: {{reason}}",
      refusedPlain: "Refused",
      failedRow: "Failed: nothing left",
      uncertain: "Uncertain: may have left",
      sending: "Being sent",
      noName: "Card payment",
      recharge: "Top-up",
      recovered: "Funds recovered",
      return: "Withdrawal",
      toMain: "To my main balance",
      ways: {
        main: "From my main balance",
        invoice: "Lightning invoice",
        address: "Lightning address",
        onchain: "Bitcoin address",
        onchainFee: "Bitcoin address, fee {{fee}}",
        lnurl: "LNURL link",
        spark: "Spark address"
      },
      means: {
        main: "My main balance",
        invoice: "Lightning invoice",
        address: "Lightning address",
        onchain: "Bitcoin address",
        lnurl: "LNURL link",
        spark: "Spark address"
      },
      showMonth: "Show {{month}}",
      showMonthAll: "Show all of {{month}}",
      monthFailed: "This month could not be read: your account's relays did not answer.",
      monthIncomplete: "Part of the months shown could not be read.",
      legacy: {
        pinNeeded:
          "This card's history at Swiss Bitcoin Pay is protected by the PIN you gave it. Enter it to add it here.",
        open: "Get the history",
        failed: "This card's history at Swiss Bitcoin Pay could not be retrieved.",
        title: "Swiss Bitcoin Pay history",
        lead: "Enter the PIN you gave this card at Swiss Bitcoin Pay: its history is added to the card's.",
        pin: "PIN",
        submit: "Get it",
        note: "It is used once, to read the card's history at Swiss Bitcoin Pay: sattle.me does not keep it.",
        errors: {
          pinInvalid: "Wrong PIN",
          pinLocked:
            "Too many attempts: Swiss Bitcoin Pay refuses this PIN for a while. Try again later.",
          failed: "The history could not be retrieved. Check your connection and try again."
        }
      },
      reasons: {
        declined: "not confirmed on the phone",
        newPayee: "new merchant not confirmed",
        unidentifiedPayee: "unidentified merchant, not confirmed",
        unconfirmed: "not confirmed in time",
        insufficientBalance: "card balance too low",
        invalidInvoice: "invalid invoice",
        expired: "invoice expired",
        noAmount: "invoice without amount",
        alreadyPaid: "invoice already paid",
        outOfBounds: "amount out of bounds",
        aboveLimit: "above the per-payment limit",
        dayLimit: "24-hour limit reached",
        hourLimit: "too many payments this hour",
        suspended: "card paused",
        invalidTap: "invalid card read",
        failed: "payment failed",
        superseded: "replaced by another read",
        unavailable: "payment not processed"
      },
      motives: {
        declined: "Not confirmed on the phone",
        newPayee: "New merchant, not confirmed in time",
        unidentifiedPayee: "Unidentified merchant, not confirmed in time",
        unconfirmed: "Not confirmed in time",
        insufficientBalance: "Card balance too low",
        invalidInvoice: "Invalid invoice",
        expired: "Invoice expired",
        noAmount: "Invoice without amount",
        alreadyPaid: "Invoice already paid",
        outOfBounds: "Amount out of bounds",
        aboveLimit: "Above the per-payment limit",
        dayLimit: "24-hour limit reached",
        hourLimit: "Too many payments this hour",
        suspended: "Card paused",
        invalidTap: "Invalid card read",
        failed: "The card's wallet did not send it",
        superseded: "Replaced by another read of the card",
        unavailable: "The payment could not be processed"
      },
      detail: {
        payment: "Payment",
        refused: "Refused payment",
        failed: "Failed payment",
        paid: "Paid",
        paidWith: "Paid · {{payee}}",
        merchant: "Merchant",
        payee: {
          approved: "approved merchant",
          new: "new merchant",
          unidentified: "unidentified merchant",
          unchecked: "not checked (automatic mode)"
        },
        refusedPill: "Refused · nothing left",
        failedPill: "Failed · nothing left",
        uncertainPill: "Uncertain · may have left",
        sendingPill: "Being sent",
        refusedMotive: "Refused",
        failedMotive: "The card's wallet did not send it",
        date: "Date",
        value: "Value",
        valueThen: "At the time of the transaction: {{fiat}}",
        valueNow: "Now: {{fiat}}",
        valueNowReading: "Now: reading the rate",
        valueNowUnknown: "Now: rate unavailable",
        note: "Note",
        motive: "Reason",
        fees: "Fee",
        noFee: "None",
        feeDeducted: "{{fee}}, deducted",
        way: "Payment type",
        to: "To",
        mainBalance: "My main balance",
        received: "Received",
        description: "Description",
        transaction: "Transaction",
        copyTx: "Copy the transaction ID",
        txCopied: "Transaction ID copied",
        openTx: "View the transaction on {{explorer}}",
        approve: "Approve this merchant",
        approveNote:
          "You will be asked for your passkey. Its next payments will go through without confirmation, within the card's limits.",
        approved: "Merchant approved for this card",
        approvedNote:
          "Merchant approved: its next payments will go through without confirmation, within the card's limits.",
        approveFailed: "The merchant could not be approved. Try again.",
        homonym:
          "Same name as an approved merchant, but a different account: it can only be approved when you confirm a payment there, after checking on the spot."
      }
    },
    sheet: {
      close: "Close",
      nameInvalid: "One line of {{max}} characters at most.",
      save: "Save",
      ceilingInvalid: "A whole number of sats, from 1 to {{max}}.",
      hourInvalid: "A whole number, from 1 to {{max}}.",
      relayHint:
        "The relay wakes your phone when a till reads the card; it holds no key and no funds. The card will be reprogrammed: keep it at hand.",
      relayField: "Relay address",
      relayPlaceholder: "relay.example.com",
      program: "Program the card",
      back: "Back",
      done: "Done",
      failedTitle: "The operation did not complete",
      changeFailed: "The change could not be saved. Try again.",
      nfcSuccess: "Card ready",
      nfcFailure: "Operation interrupted"
    },
    delete: {
      card: {
        drainBody:
          "It still holds <strong>{{amount}}</strong>. Empty it to a lightning, bitcoin or Spark address before deleting it.",
        drainBodyArriving:
          "It still holds <strong>{{amount}}</strong>, and <strong>{{arriving}}</strong> are arriving on a Bitcoin address. Empty it, then again once these <strong>{{arriving}}</strong> are added.",
        drainBodyArrivingOnly:
          "<strong>{{arriving}}</strong> are arriving on a Bitcoin address of this card. Empty it once these sats are added, before deleting it."
      },
      drainTitle: "Empty <accent>{{name}}</accent> first",
      drainBody:
        "It still holds <strong>{{amount}}</strong>. Withdraw them to your main balance before deleting it.",
      drainBodyArriving:
        "It still holds <strong>{{amount}}</strong>, and <strong>{{arriving}}</strong> are on their way to a Bitcoin address. Withdraw its balance to your main balance, then these <strong>{{arriving}}</strong> once added.",
      drainBodyArrivingOnly:
        "<strong>{{arriving}}</strong> are on their way to a Bitcoin address of this card. Withdraw them to your main balance once added, before deleting it.",
      drainConfirm: "Withdraw",
      title: "Delete {{name}}",
      gone: "Erased for good",
      goneSettings: "Its name and settings, approved merchants included",
      goneHistory: "Its history",
      goneAddress: "Its Lightning address",
      inHand: "I have the card with me",
      inHandCaption: "Held to the phone, it becomes blank again",
      confirm: "Delete the card",
      withoutTitle: "Delete {{name}} without it?",
      withoutBody:
        "Its data are erased and it can never pay again. If you find it, “Add a card” will make it blank.",
      withoutConfirm: "Delete",
      cardLabel: "The card",
      withCard: "I have it with me",
      withCardCaption: "It becomes blank again",
      withoutCard: "I don't have it",
      withoutCardCaption: "It will never pay again",
      withoutNote: "If you find it, “Add a card”, in the app on your phone, will make it blank.",
      webUnder: "“{{inHand}}” stays checked.",
      webHoldCaption: "When the app asks for it.",
      understood: "Got it",
      deleting: "Deleting…",
      failedTitle: "The deletion did not go through",
      failedBody: "Try again; if this persists, contact support.",
      done: "{{name}} is deleted",
      pendingCaption:
        "Your account's relays have not recorded its deletion yet: it will finish at the next sync",
      steps: {
        screen: "Delete the card",
        label: "Steps of the deletion",
        prepTitle: "Preparing…",
        prepSubtitle: "Checking the card's balance",
        holdAndroid: "Hold {{name}} against the back of the phone",
        holdIos: "Hold {{name}} above the phone",
        holdSubtitle: "It becomes blank again, then its data are erased",
        keepTitle: "Keep the card in place",
        keepSubtitle: "It becomes blank again",
        almostTitle: "Almost done",
        almostSubtitle: "You can move the card away",
        doneSubtitle: "The card is blank: give it away, or add it as a new card",
        notThisTitle: "This is not {{name}}",
        notThisSubtitle: "Nothing was changed on the card held",
        notThisCaption:
          "Or it was programmed again elsewhere. Nothing was changed: hold the right card.",
        failedNothing: "Nothing was changed on the card",
        failedGoesOn: "It no longer pays: “Try again” finishes the deletion",
        emptied: "Balance withdrawn",
        emptiedTodo: "Balance check",
        emptiedRunning: "Checking the balance",
        emptiedFailed: "Balance not withdrawn",
        emptiedCaption: "The card is empty",
        unchecked: "Balance not checked",
        uncheckedCaption:
          "Its deletion was recorded already: sats that arrived since stay visible in “Cards”",
        held: "Card held to the phone",
        heldTodo: "Holding the card to the phone",
        heldRunning: "Waiting for the card",
        heldFailed: "Card not recognized",
        heldAndroid: "Against the back of the phone, until it vibrates",
        heldIos: "Above the phone, until the confirmation",
        blank: "Card made blank",
        blankTodo: "Card reset",
        blankRunning: "Resetting the card",
        blankFailed: "Card not reset",
        blankCaption: "Do not move the card",
        erased: "Data erased",
        erasedTodo: "Data erasure",
        erasedRunning: "Erasing the data",
        erasedFailed: "Data not erased",
        erasedCaption: "Its name, its settings, its history, its Lightning address",
        erasedLater: "Erasure to finish",
        erasedLaterCaption:
          "Not all your account's relays answered: the erasure will resume at the next sync",
        lost: "Card moved away too early",
        lostAndroid:
          "Hold it again and keep it in place until it vibrates: the deletion will resume where it stopped.",
        lostIos:
          "Hold it again and keep it in place until the confirmation: the deletion will resume where it stopped.",
        cancelled: "Card reading cancelled",
        failed: "The deletion failed: try again",
        noCard: "I don't have the card",
        finish: "Done",
        cancel: "Cancel",
        stateTodo: ": to come",
        stateRunning: ": in progress",
        stateDone: ": done",
        stateFailed: ": failed",
        stateWarning: ": to check"
      }
    },
    drain: {
      intro:
        "The card's whole balance goes to a lightning, bitcoin or Spark address: type it, paste it or scan it. The fees are taken from this balance.",
      introNoScan:
        "The card's whole balance goes to a lightning, bitcoin or Spark address: type it or paste it. The fees are taken from this balance.",
      placeholder: "Lightning, bitcoin or Spark address",
      invoice: "Use a lightning, bitcoin or Spark address",
      total: "Card balance",
      received: "Received by the recipient",
      feesAbove: "The fees exceed the card's balance at this speed",
      empty: "This card holds nothing to withdraw.",
      quoteFailed:
        "Emptying the card could not be prepared. Check the recipient and your internet connection, then try again.",
      done: "{{amount}} withdrawn: the card is empty.",
      pending: "Withdrawal of {{amount}} sent: it will arrive once it completes.",
      failed: "The withdrawal did not go through. Check the card's balance, then try again."
    },
    modifiedPhone: {
      title: "This phone is less safe",
      body: "It seems to have been modified (for example “rooted”). So that this card can pay without your confirmation, the app keeps on this phone what it needs to make it pay: a malicious app could use it to spend its balance. Keep few sats on this card, or choose “Always confirm”."
    },
    erasedFunds: {
      card: {
        body: "{{amount}} reached its wallet after it was deleted. Empty it to a lightning, bitcoin or Spark address.",
        bodyArriving:
          "{{amount}} reached its wallet after it was deleted, and {{arriving}} are still arriving on its Bitcoin address. Empty it to a lightning, bitcoin or Spark address.",
        arrivingOnly:
          "{{arriving}} are arriving on the Bitcoin address of a deleted card. You can withdraw them once they are added.",
        stoppedBody:
          "It comes back to “Cards”, with its balance, when you add it again. {{amount}} remain in its wallet: without the card, empty it to a lightning, bitcoin or Spark address.",
        stoppedBodyArriving:
          "It comes back to “Cards”, with its balance, when you add it again. {{amount}} remain in its wallet, and {{arriving}} are still arriving on its Bitcoin address: without the card, empty it to a lightning, bitcoin or Spark address."
      },
      title: "Sats reached a deleted card",
      titleArriving: "Sats are on their way to a deleted card",
      body: "{{amount}} reached its wallet after it was deleted. Withdraw them to your main balance.",
      bodyArriving:
        "{{amount}} reached its wallet after it was deleted, and {{arriving}} are still on their way to its Bitcoin address. Withdraw them to your main balance.",
      arrivingOnly:
        "{{arriving}} are on their way to a deleted card's Bitcoin address. You can withdraw them to your main balance once added.",
      returned: "{{amount}} withdrawn to your main balance",
      returnPending:
        "Withdrawal of {{amount}} sent: it will be added to your main balance as soon as it completes",
      failed: "The withdrawal did not go through. Check your internet connection, then try again.",
      stoppedTitle: "{{card}}: reprogramming stopped",
      stoppedBody:
        "It comes back to “Cards”, with its balance, when you add it again. {{amount}} remain in its wallet: without the card, withdraw them to your main balance.",
      stoppedBodyArriving:
        "It comes back to “Cards”, with its balance, when you add it again. {{amount}} remain in its wallet, and {{arriving}} are still on their way to its Bitcoin address: without the card, withdraw them to your main balance."
    },
    wallet: {
      balance: "Balance",
      pendingDeposit: "{{amount}} received on a Bitcoin address, not added to the balance yet",
      failed:
        "This card's wallet could not be read. Check your internet connection, then try again.",
      recharge: "Top up",
      return: "Withdraw to my main balance",
      rechargeCard: "Top up <accent>{{name}}</accent>",
      amountField: "Amount",
      rechargeAmount: "Top up {{amount}}",
      returnAmount: "Withdraw {{amount}}",
      copyInvoice: "Copy the invoice",
      copyAddress: "Copy the address",
      onchainOpenHere:
        "The credit is made when the card is open in “Cards”, here or on your phone.",
      fromMain: "From my main balance",
      invoice: "Lightning invoice",
      onchain: "Bitcoin address",
      continue: "Continue",
      invoiceCreate: "Create the invoice",
      invoiceDescription: "Card top-up",
      noFee: "None",
      working: "Transfer in progress…",
      recharged: "Card topped up with {{amount}}.",
      returned: "{{amount}} withdrawn to your main balance.",
      rechargePending:
        "Top-up of {{amount}} sent: it will be added to the card's balance as soon as it completes.",
      returnPending:
        "Withdrawal of {{amount}} sent: it will be added to your main balance as soon as it completes.",
      nothingToReturn: "This card holds nothing to withdraw.",
      prepareFailed:
        "The transfer could not be prepared: nothing was sent. Check your internet connection, then try again.",
      transferFailed:
        "The transfer did not go through. Check your internet connection, then try again: it will only be sent once.",
      transferRefused: "The transfer failed. Check the balances before starting again.",
      receiveFailed:
        "The address or invoice could not be created. Check your internet connection, then try again.",
      invoiceHint: "Payable once, from any Lightning wallet, until {{date}}.",
      readingMain: "Reading your main balance…",
      otherWallet: "Another wallet",
      confirmRecharge: "Confirm the top-up",
      mainAvailable: "{{amount}} available",
      change: "Change",
      mainShort: "Your main balance does not cover this amount",
      mainUnread: "Your main balance could not be read. Try again in a moment.",
      unit: "Unit",
      addressNote:
        "The card's permanent Lightning address: share it, the amount sent is added to the card's balance.",
      orAnyWallet: "or from any wallet",
      share: "Share",
      invoiceWaiting: "Waiting for the payment…",
      invoicePaid: "Invoice paid",
      invoiceAdded: "added to the card's balance",
      finish: "Finish",
      invoiceExpired: "Invoice expired",
      invoiceExpiredNote: "It was not paid before {{date}}: no one can pay it any more.",
      newInvoice: "New invoice",
      onchainConfirmations:
        "What you send to it is added to the card's balance after 1 to 3 confirmations, up to about thirty minutes.",
      onchainFee: "Fee: {{fee}} at most, deducted. If the network asks for more, the credit waits.",
      onchainOpen: "The credit is made when you open the card in “Cards”.",
      toMain: "To my main balance",
      fromCard: "From the card {{name}} · {{amount}}",
      cardHoldsOnly: "The card only holds {{amount}}",
      allOf: "The card's whole balance · {{fiat}}",
      wholeBalance: "The card's whole balance",
      partOf: "{{fiat}} · {{left}} will stay on the card",
      partOfSats: "{{left}} will stay on the card",
      emptyCard: "Empty the card",
      rowFrom: "From",
      rowTo: "To",
      rowFee: "Fee",
      rowAfter: "Card balance after",
      mainBalance: "My main balance",
      confirmPasskey: "Confirm with my passkey",
      copy: "Copy",
      copied: "Copied",
      copyFailed: "Copying failed"
    },
    payees: {
      approved: "Approved for this card",
      approvedCount: "$t(cards.payees.approved) · {{count}}",
      changeMode: "Change mode",
      modeBox: {
        automatic: {
          title: "Mode: automatic",
          caption: "Every valid tap is paid, within the limits"
        },
        approved: {
          title: "Mode: approved merchants",
          caption: "Elsewhere, your phone asks you to confirm"
        },
        confirm: {
          title: "Mode: always confirm",
          caption: "Every payment waits for your confirmation"
        }
      },
      changeLabel: "Change the confirmation mode of {{name}}",
      approveNote: "To add one, tick “$t(card.payment.approve)” when you confirm a payment there.",
      removeLabel: "Remove {{name}} from approved merchants",
      payments_one: "{{count}} payment",
      payments_other: "{{count}} payments",
      paymentsRecent_one: "{{count}} payment in 90 days",
      paymentsRecent_other: "{{count}} payments in 90 days",
      itsName: "Its name",
      itsNode: "Its node",
      nodeNote:
        "Approved by its Lightning node: if this node is shared (Spark, Wallet of Satoshi, Strike…), all its other users are paid without confirmation too, within the card's limits.",
      approvedAs: "Approved under the name",
      approvedOnLabel: "Approved on",
      paymentsLabel: "Payments",
      paymentsValue_one: "{{count}}, for {{amount}}",
      paymentsValue_other: "{{count}}, for {{amount}}",
      paymentsValueRecent_one: "{{count}} in 90 days, for {{amount}}",
      paymentsValueRecent_other: "{{count}} in 90 days, for {{amount}}",
      modesLabel: "Payment confirmation mode",
      recommended: "Recommended",
      confirmPasskey: "Confirm with my passkey",
      modes: {
        automatic: {
          title: "Automatic",
          body: "Every valid tap is paid, within the card's limits. The merchant is shown, without a check."
        },
        approved: {
          title: "Approved merchants",
          body: "Paid without confirmation at an identified merchant you approved; elsewhere, your phone asks you to confirm."
        },
        confirm: {
          title: "Always confirm",
          body: "Every payment waits for your confirmation."
        }
      },
      approvedEmpty: "No approved merchant",
      approvedEmptyLead:
        "When you confirm a payment with this card, tick “$t(card.payment.approve)”: its next payments will go without confirmation.",
      approvedOn: "approved on {{date}}",
      nameField: "Your name for this merchant",
      nameHint: "For you only. Left empty, the name declared by the merchant comes back.",
      remove: "Remove from approved merchants",
      removeHint:
        "You will be asked for your passkey. Its next payments will ask for your confirmation again.",
      saveFailed: "The change could not be saved. Try again.",
      pending: {
        phone:
          "Saved on this phone, not yet on your account's relays: your other devices do not see it yet.",
        web: "Not yet saved on your account's relays: this change will be lost if you leave the page."
      },
      failed: {
        newerApp:
          "A newer version of the app saved your approved merchants. Update the app: until then, your cards do not pay.",
        unreachable:
          "Your account's relays did not answer: your approved merchants cannot be shown.",
        failed: "Your approved merchants could not be read."
      }
    },
    probe: {
      group: "Tests (staging)",
      row: "iOS extension test",
      title: "iOS extension test",
      noPointOfSale:
        "This test pays the account's Lightning address: a cards-only account has none.",
      unavailable: "This test only exists in the staging app, on iPhone.",
      intro:
        "Measures whether a card can pay from a notification, with the app closed. The extension uses its own test wallet, never your account's: it only holds a few sats.",
      how: "After starting a test, lock the phone: the result shows in the notification, then here. Notifications must be allowed.",
      launchGroup: "Start a test",
      profile: "SDK configuration",
      profiles: {
        light: "Light",
        standard: "Standard"
      },
      modes: {
        sync: "Sync",
        receive: "Receive 100 sats",
        pay: "Pay 1 sat to your address",
        engine: "JS engine (no payment)",
        runtime: "JS runtime (network, data)",
        enginePay: "JS engine: pay 1 sat"
      },
      balance: "Test wallet balance, read at the last test: {{sats}} sats",
      sent: "Test notification sent",
      failed: {
        unavailable: "This phone does not have the notification extension",
        noApiKey: "This version of the app has no Breez API key",
        storage: "The test wallet could not be prepared",
        notifications: "Allow notifications to start a test",
        pushToken: "No notification token: the network, or no APNs credentials in the build",
        invoice: "Your Lightning address gave no invoice",
        push: "Expo's notification service refused to send it",
        unexpected: "The test could not start"
      },
      notification: {
        title: "Extension test",
        body: "If this text stays, the extension did not process the notification."
      },
      cardText: {
        group: "Card payment notification",
        intro:
          "Sends this phone a card payment's notification, as the relay does: its title must show in the iPhone's language. “sattle.me”: the extension did not process it.",
        launch: "Send a card notification",
        sent: "Card notification sent"
      },
      resultsGroup: "Results",
      empty: "No test yet.",
      outcome: {
        waiting: "Waiting",
        none: "No result",
        running: "Running ({{step}})",
        stopped: "Interrupted ({{step}})",
        ok: "Succeeded",
        failed: "Failed ({{step}})",
        expired: "Out of time ({{step}})"
      },
      peak: "peak {{mb}} MB",
      limit: "limit ≈ {{mb}} MB",
      seconds: "{{s}} s",
      copyInvoice: "Copy the invoice",
      invoiceCopied: "Invoice copied: pay it from “Send”",
      copy: "Copy the results",
      copied: "Results copied",
      copyFailed: "Copying failed",
      clear: "Clear the results"
    },
    wakes: {
      row: "Wake journal (Android)",
      title: "Wake journal",
      unavailable: "This journal only exists in the staging app, on Android.",
      intro:
        "Each time a card's relay woke this phone, with the app closed or in the background: when it came and how far the payment went. No amount, merchant or invoice.",
      how: "To test: swipe the app away from the recent apps (without “Force stop”), lock the phone, present the card to a point of sale, then come back here and copy the journal.",
      group: "Wakes",
      empty: "No wake yet.",
      outcome: {
        running: "Running ({{step}})",
        stopped: "Interrupted ({{step}})",
        notTaken: "Ignored",
        paid: "Paid",
        pending: "Sent, not confirmed",
        declined: "Declined by the holder",
        failed: "Failed ({{reason}})",
        letGo: "Let go ({{step}})",
        ended: "Ended ({{step}})"
      },
      received: "task started {{s}} s after receipt",
      js: "JS started {{s}} s before",
      silence: "longest silence {{s}} s",
      copy: "Copy the journal",
      copied: "Journal copied",
      copyFailed: "The copy failed",
      clear: "Clear the journal",
      newer: "This journal was written by a newer version of the app.",
      failed: "The journal could not be read."
    },
    socket: {
      group: "Persistent connection",
      row: "Persistent connection",
      caption: {
        on: "On",
        off: "Off"
      },
      intro:
        "The phone keeps its own connection to its cards' relay: a card payment wakes it with the app closed. It is on by default and uses some battery. Turned off, your cards pay only while the app is shown.",
      noRelay: "None of your cards' relays offers this connection yet.",
      state: {
        connecting: "connecting…",
        open: "connected",
        waiting: "waiting",
        stopped: "stopped"
      },
      since: "since {{time}}",
      lastMessage: "last message {{s}} s ago",
      opened_one: "{{count}} connection",
      opened_other: "{{count}} connections",
      failures_one: "{{count}} drop",
      failures_other: "{{count}} drops",
      lastFailure: "last drop: {{code}}",
      wakes_one: "{{count}} wake",
      wakes_other: "{{count}} wakes",
      battery: {
        applied: "Battery optimisation applies to the app: Android may cut the connection.",
        exempt: "Battery optimisation is off for the app.",
        settings: "Battery settings"
      },
      notice: {
        shown:
          "Android shows a notification while the connection is on. To hide it, turn off “Card connection” in the settings that open: the connection goes on.",
        hidden: "Notification hidden: the connection goes on.",
        hide: "Hide the notification",
        settings: "Notification settings"
      },
      service: {
        running: "Service running (started: {{reason}})",
        stopped: "Service stopped",
        error: "The service could not start ({{code}})",
        task: "Wake not handed to the app ({{code}})"
      },
      failed: "The persistent connection could not be changed",
      notification: {
        channel: "Card connection",
        title: "Card payments enabled",
        text: "Connected to your cards' relay to pay with the app closed",
        stop: "Stop"
      }
    }
  },
  pos: {
    title: "Point of Sale",
    subtitle: "Accept bitcoin into your account quickly.",
    addNote: "Add a note",
    editNote: "Edit the note “{{note}}”",
    charge: "Charge",
    keyboardHint: "Your keyboard's keys work too.",
    deleteKey: "Delete",
    satsLabel: "{{sats}} sats",
    rateLoading: "Loading the bitcoin price…",
    rateUnavailable: "Bitcoin price unavailable. Check your internet connection.",
    share: "Share the payment request",
    shareLink: {
      button: "Share",
      hint: "Sends the payment request to the customer.",
      copiedTitle: "Link copied",
      copied: "Paste it in a message to the customer.",
      publishFailedTitle: "Link not online",
      shareFailedTitle: "Link not shared",
      publishFailed:
        "The link could not be put online: the customer would not find it. Check your internet connection, then share it again.",
      shareFailed: "The link could not be shared. Try again."
    },
    backToPos: "Back to the Point of Sale",
    expiresIn: "Expires in",
    waiting: "Waiting for the payment",
    creating: "Creating the request…",
    checking: "Checking the Bitcoin payment…",
    checkingPayment: "Checking the payment…",
    lateCheck: {
      title: "Request expired",
      body: "A payment sent at the last second may still arrive.",
      endsIn: "Check ends in"
    },
    // A payment whose check lasts.
    settling: {
      title: "Payment received, being checked",
      body: "The check is taking longer than usual. It carries on by itself."
    },
    updatingRate: "Updating to this hour's rate…",
    networks: {
      scan: "Scan with your wallet",
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      or: "or"
    },
    onchainUnavailable: {
      explorer:
        "Bitcoin on-chain unavailable for this sale: {{explorer}} could not check the Bitcoin address in time. The customer can pay over Lightning.",
      pool: "Bitcoin on-chain unavailable for this sale: this device has no Bitcoin address ready. It prepares some at each unlock with your passkey, while connected to the internet. The customer can pay over Lightning.",
      lot: "Bitcoin on-chain unavailable for this sale: this device has no Bitcoin address available. The business owner gives it some when unlocking their app with their passkey, while connected to the internet. The customer can pay over Lightning."
    },
    note: {
      label: "Note for this payment",
      placeholder: "Table 12"
    },
    boltcard: {
      approach: "Or tap the BoltCard",
      tap: "Or touch here, then tap the BoltCard",
      alert: "Hold the BoltCard near the top of the phone.",
      paying: "Card payment in progress…",
      sent: "Card payment sent, waiting for its confirmation…",
      refusal: {
        refused: "Card declined",
        interrupted: "Card payment interrupted",
        unread: "Card not read",
        noReason:
          "The card's service gave no reason. Present the card again, or have the code scanned.",
        outOfRange: "The amount is outside the card's limits. Have the code scanned.",
        noAnswer:
          "The card's service did not answer. Present the card again, or have the code scanned.",
        unreadable:
          "This is not a payment card that can be read here. Present it again, or have the code scanned.",
        showCode: "Show the code"
      }
    },
    paid: {
      pill: "Paid",
      line: "Lightning · {{time}}",
      onchainLine: "Bitcoin · {{time}}",
      mixedLine: "Bitcoin + Lightning · {{time}}"
    },
    accepted: {
      notice: "The owner accepted the amount received: the sale is paid."
    },
    unconfirmed: {
      pill: "Confirming",
      notice:
        "The customer has paid. The network still has to confirm the transaction, allow about thirty minutes."
    },
    underpaid: {
      rest: "Left",
      received: "Received",
      restToPay: "Left to pay",
      // The accessible name of a transaction's link on the chain card (UnderpaidChain).
      txLink: "View transaction {{txid}} on {{explorer}}"
    },
    underpaidEnded: {
      pill: "Underpaid",
      missing: "Missing",
      received: "Payments received",
      confirmed: "Confirmed",
      confirming: "Confirming · {{done}}/{{required}}",
      notice: "The time to pay is over: {{missing}} sats are missing."
    },
    expired: {
      pill: "Expired",
      notice: "The customer did not pay in time. Nothing was charged.",
      recreate: "Create the request again"
    },
    disputed: {
      pill: "Payment to check",
      notice:
        "A payment was received, but another sale claims it too. Do not ask for a new payment: check it in “$t(navigation.destinations.wallet)”.",
      noticeMember:
        "A payment was received, but another sale claims it too. Do not ask for a new payment: the account holder checks it in “$t(navigation.destinations.wallet)”."
    },
    failed: {
      network:
        "The payment request could not be created. Check your internet connection, then try again.",
      invalid: "The payment service gave an unexpected answer. Try again.",
      limits: "This amount cannot be charged: only between {{min}} and {{max}} sats.",
      onchainOnly: {
        none: "Above {{max}} sats, this amount can only be paid on-chain, and on-chain payments are turned off.",
        explorer:
          "Above {{max}} sats, this amount can only be paid on-chain, and {{explorer}} could not check the Bitcoin address in time. Try again.",
        pool: "Above {{max}} sats, this amount can only be paid on-chain, and this device has no Bitcoin address ready. It prepares some at each unlock with your passkey, while connected to the internet.",
        lot: "Above {{max}} sats, this amount can only be paid on-chain, and this device has no Bitcoin address available. The business owner gives it some when unlocking their app with their passkey, while connected to the internet.",
        error:
          "Above {{max}} sats, this amount can only be paid on-chain, and this device's Bitcoin address could not be read. Try again."
      },
      retry: "Try again"
    },
    // The keypad or the articles: the header's segmented control.
    mode: {
      label: "Entry mode",
      amount: "Amount",
      articles: "Items",
      scan: "Scan"
    },
    articles: {
      hint: "Tap an item to add it",
      // Without articles, on the owner's device only (ArticlesPad.tsx).
      empty: {
        reading: "Reading your items…",
        unreadableTitle: "Items not read yet",
        unreadableBody:
          "Your items could not be read. Check your internet connection: they will be read again in a few minutes.",
        noneTitle: "No items yet",
        noneBody: "Add your items in “$t(navigation.destinations.articles)”: they will show here.",
        noneBodyScan:
          "Scan a product with “$t(pos.mode.scan)” to create it, or add your items in “$t(navigation.destinations.articles)”."
      },
      tile: "{{name}}, {{price}}",
      add: "Adds one to the basket",
      inBasket_one: "{{count}} in the basket",
      inBasket_other: "{{count}} in the basket"
    },
    basket: {
      title: "Basket",
      open: "View basket",
      charge_one: "Charge · {{count}} item",
      charge_other: "Charge · {{count}} items",
      total: "Total",
      empty: "The basket is empty.",
      tooLarge: "The total is over the largest amount that can be charged.",
      scanMore: "Scan more items",
      less: "Decrease the quantity of {{name}}",
      more: "Increase the quantity of {{name}}",
      quantity_one: "Quantity: {{count}}",
      quantity_other: "Quantity: {{count}}"
    },
    // The scan of the point of sale: the camera, the article read last, the basket.
    scan: {
      aim: "Aim at an item's barcode",
      lead: "Each item scanned is added to the total.",
      converted: "Price: {{price}}, converted",
      unknown: {
        title: "Unknown barcode",
        body: "None of your items has this code. Nothing was added."
      },
      // A code read before the catalogue was (ScanPad.tsx): nothing can be told of it.
      notRead: {
        title: "Items not read yet",
        body: "This code could not be looked up. Nothing was added: scan it again in a moment."
      }
    }
  },
  paymentLink: {
    // The page's switch of theme, in its header: what it does.
    themeToDark: "Switch to the dark theme",
    themeToLight: "Switch to the light theme",
    payableUntil: "Payable until {{date}}",
    loading: "Loading the payment request…",
    updatingRate: "Updating to this hour's rate…",
    openWallet: "Open my wallet",
    copyInvoice: "Copy the invoice",
    copied: "Invoice copied",
    copyFailed: "The invoice could not be copied. Open it in your wallet or scan the code.",
    retry: "Try again",
    notFound: {
      title: "Payment request not found",
      notice:
        "This payment request does not exist or has expired. Ask the merchant for a new link.",
      invalid:
        "This link is incomplete. Check that it was copied in full, or ask the merchant for a new one."
    },
    unreachable: {
      title: "Cannot connect",
      notice:
        "The payment request could not be loaded. Check your internet connection, then try again."
    },
    failed: {
      title: "Payment request unavailable",
      notice:
        "The merchant's payment service could not create the invoice. Try again in a moment, or ask the merchant for a new link.",
      onchainOnly:
        "This amount can only be paid on-chain, and this request offers no Bitcoin address. Ask {{business}} for another way to pay."
    },
    copyAddress: "Copy the address",
    addressCopied: "Address copied",
    addressCopyFailed: "The address could not be copied. Open it in your wallet or scan the code.",
    amountCopied: "Amount copied",
    amountCopyFailed:
      "The amount could not be copied. Open the request in your wallet or scan the code.",
    receipt: {
      invoice: "Lightning invoice",
      address: "Bitcoin address",
      amount: "Amount",
      copyAmount: "Copy the amount",
      invoiceCopied: "Copied",
      addressCopied: "Copied",
      amountCopied: "Copied",
      unit: "Unit: {{unit}}, switch to {{next}}"
    },
    unconfirmed: {
      notice:
        "Your payment has been sent. The network still has to confirm the transaction, allow about thirty minutes. You can close this page."
    },
    underpaid: {
      notice:
        "Your payment ({{received}} sats) does not cover the whole amount. Pay the rest over Lightning or Bitcoin.",
      noticeLightning:
        "Your payment ({{received}} sats) does not cover the whole amount. Pay the rest over Lightning."
    },
    underpaidEnded: {
      notice:
        "The time to pay is over: your payment ({{received}} sats) does not cover the whole amount, {{missing}} sats are missing. Contact {{business}} about the difference."
    },
    details: {
      title: "Payment details",
      business: "Recipient",
      method: "Method",
      methods: {
        lightning: "Lightning",
        onchain: "Bitcoin",
        mixed: "Bitcoin + Lightning"
      },
      createdAt: "Created on",
      transaction: "Transaction",
      transactionNumber: "Transaction {{number}}",
      confirmations_one: "{{count}} confirmation of {{required}}",
      confirmations_other: "{{count}} confirmations of {{required}}",
      confirmed: "Confirmed"
    },
    paid: {
      pill: "Paid",
      notice: "{{business}} has received your payment.",
      continue: "Continue to {{host}}"
    },
    accepted: {
      notice: "{{business}} accepted the amount received: your payment is settled."
    },
    expired: {
      pill: "Expired",
      notice:
        "The time to pay is over and no payment was received. Ask {{business}} for a new link."
    },
    canceled: {
      pill: "Canceled",
      notice:
        "{{business}} canceled this payment request: do not pay it. Ask {{business}} for a new link."
    },
    disputed: {
      pill: "To be checked",
      notice:
        "Your payment was received. {{business}} still has to check it: do not pay a second time, and contact {{business}} if needed."
    },
    checkout: {
      newer: {
        title: "Page to update",
        notice:
          "This payment link is of a newer format than this page. Reload the page, or update the app, then open the link again."
      },
      continue: "Continue",
      redirectTo: "Redirecting to {{target}}",
      unconfirmed: {
        notice:
          "Your payment has been sent. The network still has to confirm the transaction, allow about thirty minutes."
      },
      underpaid: {
        notice:
          "Your payment ({{received}} sats) does not cover the whole amount. Pay the rest over Bitcoin, to the same address."
      },
      expired: {
        notice:
          "The time to pay is over and no payment was received. Go back to {{business}}'s shop to ask for a new one.",
        late: "The time to pay is over: a payment came after it ended and does not count for this order. Contact {{business}}."
      }
    }
  },
  appLock: {
    title: "App locked",
    body: "Use this device's biometrics to open it.",
    unlock: "Unlock",
    prompt: "Unlock sattle.me",
    cancel: "Cancel"
  },
  navigation: {
    label: "Navigation",
    destinations: {
      pos: "Charge",
      wallet: "Wallet",
      cards: "Cards",
      articles: "Items",
      employees: "Employees",
      integrations: "Integrations",
      settings: "Settings"
    },
    memberWallet: "My activity",
    groups: {
      sales: "Sales",
      manage: "Manage",
      account: "Account"
    },
    more: "More",
    moreWith: "More, current screen: {{name}}",
    moreWithWait: "{{more}} ({{name}})",
    close: "Close",
    customize: "Customize",
    customizeTitle: "Customize the bar",
    done: "Done",
    customizeHint: "Tap a destination to replace <accent>{{name}}</accent>.",
    slotLabel: "{{name}}, slot {{index}}",
    swapLabel: "Put {{name}} in the bar",
    currentLabel: "{{name}}, current screen",
    pendingLabel: "{{name}}, invoice in progress",
    confirmingLabel: "{{name}}, payment confirming",
    lock: {
      tillMode: "Switch to till mode",
      lockApp: "Lock the app",
      unlock: "Unlock with your passkey",
      lockedLabel: "{{name}}, locked: unlock with your passkey",
      unlocking: "Unlocking…",
      preparing: "Preparing to unlock…",
      failedTitle: "Couldn't unlock",
      otherAccount: "This passkey opens another account than this device's.",
      autoLockTitle: "Locking in {{seconds}} s",
      autoLockBodyCard: "Without activity, the app locks.",
      autoLockBody: "Without activity, the app goes back to till mode."
    },
    loadFailure: {
      title: "Screen not loaded",
      body: "Check your internet connection, then reload the page. Reloading also gets the latest version of the app.",
      reload: "Reload the page"
    },
    update: {
      title: "New version available",
      body: "Updating reloads the page.",
      action: "Update"
    }
  },
  team: {
    invite: "Invite an employee",
    loading: "Loading your employees…",
    guide: {
      title: "Take payments as a team",
      lead: "Each employee takes payments with their own phone, for your business.",
      invite: {
        title: "Invite",
        caption: "Choose their name: the app prepares their invitation, a QR code and a link."
      },
      activate: {
        title: "Set up their phone",
        caption:
          "Your employee scans the QR code or opens the link: their phone becomes a point of sale for your business."
      },
      sales: {
        title: "Follow their sales",
        caption: "They arrive in your wallet, under their name; each employee sees only their own."
      }
    },
    noMatch: "No employees match the filters.",
    offline: "Cannot connect: the state of the invitations could not be checked.",
    rosterOffline:
      "No relay answered: the list of employees could not be read. Check the connection, then come back to this screen.",
    rosterPartial: "Not every relay answered: the list of employees may be incomplete.",
    newer: "Some employees come from a newer version of the app: update the app to see them.",
    invitations: "Pending invitations",
    employees: "Employees",
    columns: {
      name: "Name",
      state: "Status",
      date: "Date"
    },
    status: {
      invited: "Pending",
      joined: "Active",
      left: "Left",
      expired: "Expired"
    },
    detail: {
      invited: "Link created on {{date}}",
      joined: "Joined on {{date}}",
      left: "Left on {{date}}",
      expired: "Link expired on {{date}}"
    },
    // Where an employee's device joined (its record's platform), beside its row's date.
    platform: {
      ios: "on iPhone or iPad",
      android: "on Android",
      web: "in a web browser"
    },
    detailWithPlatform: "{{detail}}, {{platform}}",
    actions: {
      share: "Share the link",
      showQr: "Show the link and the code",
      renew: "Renew the invitation",
      deleteInvite: "Delete the invitation",
      removeAccess: "Remove access",
      removeLeft: "Remove from the list"
    },
    inviteSheet: {
      title: "Invite an employee",
      lead: "With this link, another device takes payments for your business: an employee's phone or a shared till. Payments go straight to your wallet.",
      can: "This device will be able to",
      canItems: {
        sell: "Take payments: amount, items and scan",
        methods: "Accept Lightning, on-chain or card payments",
        links: "Send a payment link to a customer",
        ownSales: "See its own sales"
      },
      cannot: "This device will not be able to",
      cannotItems: {
        wallet: "See your balance or send funds",
        settings: "Change your items, prices or settings",
        otherSales: "See the sales of other employees or tills",
        manage: "Manage the team, cards or integrations"
      },
      revoke: "You can remove its access at any time.",
      nameLabel: "Name",
      namePlaceholder: "E.g. Alice or Till 1",
      nameHint: "It shows next to its sales in your wallet.",
      create: "Create the link",
      notice:
        "The link will be valid for 48 hours and works only once. Give it only to the intended employee or till: the first person to open it can take their place."
    },
    qrSheet: {
      title: "Invitation for {{name}}",
      lead: "Scan this code with the device that will take payments, or send the link to that device.",
      leadDesktop:
        "Scan this code with the device that will take payments for {{business}}, or send the link to that device.",
      linkLabel: "Invitation link",
      copy: "Copy the link",
      share: "Share the link",
      copied: "Link copied",
      copyFailed: "The link could not be copied. Select it, then copy it.",
      done: "Done",
      notice:
        "This link works only once and expires on {{date}}. It is meant for {{name}} only: the first person to open it can take their place."
    },
    removeDialog: {
      title: "Remove {{name}}?",
      body: "{{name}} will no longer be able to take payments for {{business}}. Their past payments stay in the wallet, under their name.",
      confirm: "Remove access",
      doneTitle: "Access removed",
      doneBody: "{{name}} is no longer part of the {{business}} team."
    },
    removeLeftDialog: {
      title: "Remove {{name}} from the list?",
      body: "{{name}} left {{business}} on {{date}}. Their past payments stay in the wallet, under their name.",
      confirm: "Remove from the list",
      doneTitle: "Removed from the list",
      doneBody: "{{name}} no longer appears among {{business}}'s employees."
    },
    deleteInviteDialog: {
      title: "Delete {{name}}'s invitation?",
      body: "The link will stop working: {{name}} will not be able to join {{business}} with it.",
      confirm: "Delete the invitation",
      doneTitle: "Invitation link disabled",
      doneBody: "{{name}} can no longer join {{business}}."
    },
    cancelSalesDialog: {
      unknownLead: "The state of {{name}}'s invoices could not be checked.",
      linksLeft:
        "{{name}} is no longer part of {{business}}'s team. Their payment links that could not be canceled can still be paid until they end: their payments reach the wallet.",
      title: "Cancel {{name}}'s invoices?",
      lead: "Some of {{name}}'s invoices are not final yet.",
      links:
        "Their payment links that have received nothing yet will be canceled: their page will no longer show a code to pay. Those that were paid will be finalized.",
      invoices:
        "The invoices shown on their device will be canceled: the device stops showing them as soon as it receives the removal of their access.",
      end: "A customer who already scanned or copied an invoice can still pay it: the payment reaches the wallet. {{name}}'s access is then removed.",
      confirm: "Cancel and remove",
      progress: "Canceling {{name}}'s invoices…"
    },
    failedTitle: "Action not possible",
    unreachableTitle: "Cannot connect",
    errors: {
      noAccount: "Unlock this point of sale with your passkey to manage the team.",
      noWebApp: "Invitations are not available in this version of the app yet.",
      tooMany: "Your team already has 100 employees.",
      invalidName: "Enter the employee's name.",
      unreachable:
        "The invitation could not be published. Check your internet connection, then try again.",
      unpublished:
        "The employee is added to the list, but their invitation could not be published. Share their link from the list to try again.",
      removeUnreachable:
        "The removal could not be published. Check your internet connection, then try again.",
      removeFailed: "The removal could not be saved. Try again.",
      removalUnsaved:
        "This employee's access is cut off, but their removal could not be saved. Try again: it will also be saved the next time you open your account.",
      salesInProgress:
        "Some of this employee's invoices are not final yet. Try again once their final version is published (up to 3 hours after the end of an unpaid invoice).",
      integrationPending:
        "An integration has payments that are not final yet. Try again once they are.",
      exportNewer: "A newer version of the app changed this assistant. Update the app to change it",
      invoicesNewer:
        "A newer version of the app changed this assistant. Update the app to change it"
    },
    removedNotice: "This device is no longer part of the {{business}} team.",
    join: {
      title: "Join a team",
      scanLead: "Scan the invitation QR code the business owner shows you.",
      cameraAppLead: "Scan the invitation QR code with your phone's camera: it opens this page.",
      cameraNeeded: "The camera is used to scan the invitation QR code.",
      allowCamera: "Allow the camera",
      openSettings: "Open settings",
      pasteLabel: "Or paste the invitation link",
      checking: "Reading the invitation…",
      joining: "Joining the team…",
      as: "You will take payments for {{business}} as {{name}}.",
      rights:
        "This device will create invoices paid to {{business}}. It will have no access to the wallet, the settings or the other employees' sales.",
      confirm: "Join the team",
      scanAnother: "Scan another invitation",
      errors: {
        invalid: "This is not an invitation link. Check that it was copied in full.",
        notFound: "This invitation does not exist or has expired. Ask the owner for a new one.",
        closed: "This invitation has already been used. Ask the owner for a new one.",
        expired: "This invitation has expired. Ask the owner for a new one.",
        newer:
          "This invitation comes from a newer version of the app. Update the app, then try again.",
        unreachable: "Cannot connect. Check your internet connection, then try again.",
        removed: "The owner withdrew this invitation.",
        alreadySetUp: "This device already takes payments for a business: it cannot join a team."
      }
    }
  },
  integrations: {
    create: "Create an integration",
    loading: "Loading your integrations…",
    guide: {
      title: "Take payments in your online shop",
      lead: "An integration lets an online shop or a tool charge its customers on your account.",
      create: {
        title: "Create the integration",
        caption: "Choose your shop (WooCommerce, PrestaShop…) or your server's language."
      },
      key: {
        title: "Hand over the secret key",
        caption:
          "Paste it into your shop or give it to your developer. It stays on the server, never with your customers."
      },
      pay: {
        title: "Your customers pay",
        caption: "For each order, the shop shows the invoice. The payment arrives in your wallet."
      }
    },
    noMatch: "No integrations match the filters.",
    offline:
      "No relay answered: the list of integrations could not be read. Check the connection, then come back to this screen.",
    partial: "Not every relay answered: the list of integrations may be incomplete.",
    newer: "Some integrations come from a newer version of the app: update the app to see them.",
    columns: {
      name: "Name",
      date: "Created"
    },
    created: "Created on {{date}}",
    actions: {
      remove: "Remove the integration"
    },
    createSheet: {
      title: "New integration",
      lead: "Make your invoices with an AI, take payments on your online shop or from your own website.",
      invoices: "Invoices",
      shops: "Online shops",
      developers: "For developers",
      developersDetail_one: "SDK: {{names}} and {{count}} other",
      developersDetail_other: "SDK: {{names}} and {{count}} others",
      soon: "Coming soon",
      soonLabel: "{{name}}: coming soon",
      source: "Source code",
      sourceLabel: "{{name}}: source code on GitHub",
      oneShopTitle: "One key for one shop only",
      oneShop:
        "The servers of one shop share its key; two shops, never: their orders would mix, and one could pass for paid by the other's payment. For another shop, create another integration.",
      namePlaceholder: "Online shop"
    },
    sdk: {
      lead: "The {{name}} SDK creates the invoice of each order on your server and checks its payment.",
      package: "The package",
      open: "Open on {{site}}",
      openLabel: "Open {{name}} on {{site}}",
      readme: "Its README explains how to install and use it.",
      key: "The secret key"
    },
    files: {
      show: "Show the steps for {{name}}",
      copyName: "Copy the name {{name}}",
      nameCopied: "Name copied: {{name}}",
      copy: "Copy the content",
      copied: "Content copied",
      contentCopied: "Content of {{name}} copied",
      copyFailed: "It could not be copied. Try again.",
      readFailed: "The app could not read this file: close the guide, then open it again.",
      lastLine: "Once pasted, it ends on line {{line}}.",
      pasted: "Pasted",
      progress: "Pasted: {{count}} of {{total}}"
    },
    keyStep: {
      title: "Create this shop's key",
      leadShop: "Do it when the key's field is open in {{platform}}: it will be shown only once.",
      leadSdk:
        "Your server reads it from an environment variable, never from a web page or a code repository. It will be shown only once.",
      shopName: "Shop name",
      siteName: "Name of the site or tool",
      nameHint: "It shows next to its sales in your wallet.",
      create: "Create the key"
    },
    guides: {
      wix: {
        editor: {
          title: "Open your site's code",
          body: "On a computer, open your Wix site's editor. At the top, click “Dev Mode”, then “Turn on Dev Mode”: a column of icons shows on the editor's left. This guide shows the Wix Editor; in Wix Studio, the screens differ.",
          image: "The Wix Editor's “Dev Mode” menu and its “Turn on Dev Mode” button, framed."
        },
        packages: {
          title: "Open the packages",
          body: "In that column of icons, click the cube (“Packages & Apps”). Under “npm”, click “+ Install packages from npm”.",
          image:
            "Wix's “Packages & Apps” panel: the cube icon and the link “+ Install packages from npm”, framed."
        },
        install: {
          title: "Install two Wix packages",
          body: "A “Package Manager” window opens. In its search, type @wix/ecom, then click “Install” on the @wix/ecom line (not on another with a similar name). Wait until it is done, then do the same with @wix/essentials. Close the window: both packages are listed under “npm”. They are two Wix tools the plugin needs.",
          image:
            "The “Package Manager” window: @wix/ecom typed in its search, and the “Install” button of the @wix/ecom line, framed."
        },
        files: {
          title: "Make the 6 files",
          body: "In “Backend & Public” (the { } icon of the column), make each file in its place, in this order, then paste its content, copied from here: that of the plugin {{version}}, checked by the app.",
          where: {
            js: "Backend › + › Add .js file",
            file: "Backend › + › Add file",
            servicePlugin: "Service Plugins › + › Payment",
            servicePluginConfig: "Service Plugins › payment-provider › sattlemeCheckout"
          },
          how: {
            js: "Name it {{name}}, then paste its content. It is the largest: wait until Wix shows all of it before clicking elsewhere.",
            file: "Name it {{name}}. Wix puts an example in it: select all (Ctrl+A, or ⌘A on a Mac), then paste.",
            servicePlugin:
              "Name the plugin sattlemeCheckout, then “Add & Edit Code”: Wix makes this file and the next one. Check that the open tab is {{name}}, select all, then paste.",
            servicePluginConfig:
              "Wix made it with sattlemeCheckout.js: open it, select all, then paste."
          },
          sharedCode:
            "Your site already has its own {{name}}? Don't replace it: paste the copied content at the very end of yours, below its lines.",
          sharedJobs:
            "Your site already has its own {{name}}? Don't replace it: add the plugin's job (the block in braces in its “jobs” list) to the “jobs” list of yours, separated by a comma.",
          image:
            "Wix's “Backend & Public” panel: the + of “Backend”, and the “Add .js file” and “Add file” choices of its menu, framed."
        },
        secrets: {
          title: "Open the Secrets Manager",
          body: "In the site's dashboard, “Developer Tools” › “Secrets Manager”, then “+ Add Secret”. Name: sattleme-checkout-status-token. Value: a random value of 32 characters or more (from your password manager), the password of the plugin's status page. Then “Add Secret”. Click “+ Add Secret” again, and type sattleme-checkout-key as its name.",
          image:
            "Wix's Secrets Manager: “Secrets Manager” under “Developer Tools”, and the link “+ Add Secret”, framed."
        },
        save: {
          title: "Save the key",
          body: "Paste the key in “Value”, then click “Add Secret”. It stays in that secret: never type it anywhere else in Wix.",
          image:
            "Wix's “Add secret” window named sattleme-checkout-key: its empty “Value” field and its “Add Secret” button, framed."
        },
        publish: {
          title: "Publish once",
          body: "In the editor, click “Publish” only once: each click makes a publication.",
          image: "The top right of the Wix Editor: the “Publish” button, framed."
        },
        status: {
          title: "Open the status page",
          body: "Open your site's address followed by /_functions/sattlemeCheckoutStatus, enter the token (the value of the secret sattleme-checkout-status-token), then click “Show the status”. The page shows the plugin {{version}}. Do it before connecting: it keeps the site's address, where your customers pay.",
          image:
            "The plugin's status page: its token field and its “Show the status” button, framed."
        },
        connect: {
          title: "Connect the payment",
          body: "In the dashboard, “Settings” › “Accept Payments” › “Bitcoin (Lightning / on-chain)” › “Connect”. First field: sattleme-checkout-key, the secret's name, never the key itself. Second field: 15, the minutes to pay an invoice (1 to 60). Then “Connect”.",
          image:
            "Wix's connection form: sattleme-checkout-key in its first field, 15 in its second, and the “Connect” button, framed."
        },
        check: {
          title: "Test a payment",
          body: "Place an order on your site, on a test site first, and choose “Bitcoin (Lightning / on-chain)”: the plugin's payment page opens.",
          image:
            "The plugin's payment page: “Pay with Bitcoin”, the amount in sats and the time left to pay."
        }
      },
      bebop: {
        open: {
          title: "Open sattle.me's settings",
          body: "In be-BOP's administration, open “Payment Settings” → “sattle.me”. If it is not in the list, update be-BOP first.",
          image:
            "Screenshot of be-BOP: the administration's menu, “sattle.me” framed under “Payment Settings”"
        },
        save: {
          title: "Paste the key and save",
          body: "Paste the key into “Integration key (sattle.me app > Integrations)”. To also take on-chain payments, tick “Also take on-chain payments (Bitcoin method)”. Then click “Save”.",
          image:
            "Screenshot of be-BOP: the settings of sattle.me, the “Integration key” field, the “Also take on-chain payments” box and the “Save” button framed"
        },
        test: {
          title: "Test the connection",
          body: "Click “Test connection”: be-BOP reads the integration with its key, without making an invoice, and shows “Connection successful. sattle.me credentials are working.” With on-chain payments ticked, it also checks that the integration has Bitcoin addresses: this app gives it some when it is created, then at each unlock with your passkey, while connected to the internet. If the test fails, check the key, unlock this app, then test again.",
          image:
            "Screenshot of be-BOP: the settings of sattle.me, the “Test connection” button framed"
        },
        prefer: {
          title: "Put sattle.me first",
          body: "If another processor already takes Lightning or on-chain payments in your shop, open “Settings” → “General”. Under “Payment processor preferences”, choose “sattleme” as “Preferred Lightning processor” and “sattleme-onchain” as “Preferred Bitcoin on-chain processor”, then click “Update” at the bottom of the page.",
          image:
            "Screenshot of be-BOP: “Payment processor preferences”, sattleme-onchain and sattleme chosen and framed"
        },
        check: {
          title: "Check your shop",
          body: "At the payment step, your customers can now choose “Lightning” as “Payment method”, and “Onchain” too if you ticked on-chain payments: be-BOP offers it from 10,000 sats. Once the order is placed, they pay it by scanning a QR code. An on-chain payment pays the order after 3 confirmations, about 30 minutes, longer with a low fee. Every payment is a real bitcoin payment, to your wallet.",
          image:
            "Screenshot of a be-BOP shop: “Lightning” as the “Payment method” at the payment step"
        }
      },
      pretix: {
        plugins: {
          title: "Open your event's plugins",
          body: "In pretix's backend, open your event, then, in its menu, “Settings” → “Plugins”.",
          image: "Screenshot of pretix: the event's menu, “Plugins” framed under “Settings”"
        },
        enable: {
          title: "Enable the plugin",
          body: "Search for “sattle.me”, then click “Enable”.",
          image:
            "Screenshot of pretix: the plugins, searched for “sattle.me”, its “Enable” button framed"
        },
        open: {
          title: "Open its settings",
          body: "In “Settings” → “Payment”, click “Settings” next to “Bitcoin (sattle.me)”.",
          image:
            "Screenshot of pretix: the payment providers, the “Settings” button of “Bitcoin (sattle.me)” framed"
        },
        save: {
          title: "Paste the key and save",
          body: "Tick “Enable payment method”, paste the key into “Integration key”, then click “Save” at the bottom of the page: pretix checks it, then never shows it again. “Time to pay” is how long the customer has to pay an invoice: from 1 to 60 minutes, 15 by default.",
          image:
            "Screenshot of pretix: the settings of Bitcoin (sattle.me), the “Enable payment method” box and the “Integration key” field framed"
        },
        channels: {
          title: "Choose the sales channels",
          body: "On the same page, “Restrict to specific sales channels” says where your customers can pay in bitcoin: “Online shop” by default. Tick the other channels you want, then click “Save”.",
          image:
            "Screenshot of pretix: “Restrict to specific sales channels”, its “Online shop” box framed"
        },
        check: {
          title: "Check your shop",
          body: "At the payment step, your customers can now choose “Bitcoin”, then scan a QR code: in Lightning below about 1,000 sats, in Lightning or on-chain above. An on-chain payment shows as being confirmed within a minute and pays the order after 3 confirmations, about 30 minutes, longer with a low fee. When mempool.space is slow to answer, an invoice may be made in Lightning only. Even in pretix's test mode, every payment is a real bitcoin payment, to your wallet.",
          image: "Screenshot of a pretix shop: “Bitcoin” at the payment step"
        }
      },
      nopcommerce: {
        download: {
          title: "Download the plugin",
          body: "Download the plugin: a .zip archive, to keep as it is, without unzipping it. It needs nopCommerce 5.00.",
          link: "Open nopCommerce's marketplace",
          file: "Download version {{version}}"
        },
        plugins: {
          title: "Open the local plugins",
          body: "In nopCommerce's administration, open “Configuration” → “Local plugins”.",
          image: "Screenshot of nopCommerce: the administration's menu, “Local plugins” framed"
        },
        upload: {
          title: "Upload the archive",
          body: "Click “Upload plugin or theme”, choose the archive, then click “Upload plugin or theme” in the window that opens.",
          image:
            "Screenshot of nopCommerce: the “Upload plugin or theme” window, the archive chosen, its “Upload plugin or theme” button framed"
        },
        restart: {
          title: "Restart nopCommerce",
          body: "Click “Restart application to apply changes” at the top of the page, then wait for the page to show again: your shop does not answer while nopCommerce restarts. The plugin is in the list only after this restart.",
          image:
            "Screenshot of nopCommerce: “Local plugins”, its “Restart application to apply changes” button framed"
        },
        install: {
          title: "Install the plugin",
          body: "In the list, find “Bitcoin (sattle.me)”, in the group “Payment methods”, click “Install”, then “Restart application to apply changes” again.",
          image:
            "Screenshot of nopCommerce: the plugin Bitcoin (sattle.me) in the list, its “Install” button framed"
        },
        open: {
          title: "Open its settings",
          body: "Once nopCommerce has restarted, click “Configure” under “Bitcoin (sattle.me)”. You will also find it in “Configuration” → “Payment methods”.",
          image:
            "Screenshot of nopCommerce: the plugin Bitcoin (sattle.me), installed, its “Configure” button framed"
        },
        save: {
          title: "Paste the key and save",
          body: "Tick “Enabled”, paste the key into “Integration key”, then click “Save” at the bottom of the page: the plugin checks it, then never shows it again. “Time to pay (minutes)” is how long the customer has to pay an invoice: from 1 to 60 minutes, 15 by default.",
          image:
            "Screenshot of nopCommerce: the settings of Bitcoin (sattle.me), the “Enabled” box and the “Integration key” field framed"
        },
        check: {
          title: "Check your shop",
          body: "At the payment step, your customers can now choose “Bitcoin”. Once the order is confirmed, they pay it on a page of your shop by scanning a QR code: in Lightning below about 1,000 sats, in Lightning or on-chain above. An on-chain payment pays the order after 3 confirmations, about 30 minutes, longer with a low fee. Payments are also checked by nopCommerce's scheduled tasks, which must reach your store's URL. Every payment is a real bitcoin payment, to your wallet.",
          image: "Screenshot of a nopCommerce shop: “Bitcoin” at the payment step"
        },
        autoCancel: {
          title: "Exclude Bitcoin from auto-canceling",
          body: "If “Enable auto-canceling of unpaid orders” is ticked (“Configuration” → “Settings” → “Order settings”), add “Bitcoin (sattle.me)” to its “Excluded payment methods”, so that an order whose payment is being confirmed is not cancelled."
        }
      },
      woocommerce: {
        download: {
          title: "Download the plugin",
          body: "Download the plugin's file, sattleme-for-woocommerce-….zip, and keep it as it is, without unzipping it. The plugin needs WordPress 7.0, WooCommerce 11.1 and PHP 8.2, or newer.",
          link: "Open the plugin's GitHub page",
          file: "Download version {{version}}"
        },
        upload: {
          title: "Upload the file",
          body: "In WordPress's administration, open “Plugins” → “Add Plugin”, click “Upload Plugin” at the top of the page, choose the file, then click “Install Now”.",
          image:
            "Screenshot of WordPress: “Upload Plugin” and the file chosen, its “Upload Plugin” and “Install Now” buttons framed"
        },
        activate: {
          title: "Activate the plugin",
          body: "Once the plugin is installed, click “Activate Plugin”.",
          image:
            "Screenshot of WordPress: the plugin installed, its “Activate Plugin” button framed"
        },
        open: {
          title: "Open its settings",
          body: "In “Plugins”, under “sattle.me for WooCommerce”, click “Settings”. You also reach them through “WooCommerce” → “Settings” → “Payments”, as “sattle.me (Bitcoin)”.",
          image:
            "Screenshot of WordPress: the plugin sattle.me for WooCommerce in the list of plugins, its “Settings” link framed"
        },
        save: {
          title: "Paste the key and save",
          body: "Tick “Accept Bitcoin payments with sattle.me”, paste the key in “Integration key”, then click “Save changes” at the bottom of the page: the plugin checks the key, then never shows it again. The page then says “Connected to”, followed by your business's name. “Time to pay” is how long the customer has to pay an invoice: 1 to 60 minutes, 15 by default.",
          image:
            "Screenshot of WordPress: the settings of sattle.me (Bitcoin) saved, “Connected to” and the ticked box framed"
        },
        check: {
          title: "Check your shop",
          body: "At the payment step, your customers can now pay in bitcoin, with the sattle.me logo. Once the order is placed, they pay it on a page of your shop by scanning a QR code: in Lightning below about 1,000 sats, in Lightning or on-chain above. An on-chain payment pays the order after 3 confirmations, about 30 minutes, longer with a low fee. The plugin also checks payments every minute, even once the payment page is closed, with WordPress's scheduled tasks (WP-Cron): on a shop with few visitors, have your server's cron run them every minute, as the plugin's README explains. Every payment is a real bitcoin payment, to your wallet.",
          image: "Screenshot of a WooCommerce shop: the bitcoin payment at the payment step"
        }
      },
      grandnode: {
        download: {
          title: "Download the plugin",
          body: "Download the plugin's archive, Payments.Sattleme-….zip, and keep it as it is, without unzipping it. The plugin needs GrandNode 2.4.",
          link: "Open the plugin's GitHub page",
          file: "Download version {{version}}"
        },
        plugins: {
          title: "Open the local plugins",
          body: "In GrandNode's administration, open “Plugins” → “Local plugins”.",
          image:
            "Screenshot of GrandNode: the administration's “Plugins” menu, “Local plugins” framed"
        },
        upload: {
          title: "Upload the archive",
          body: "Click “Upload” at the top of the page, choose the archive, then click “Upload” in the window that opens. GrandNode shows “Plugin uploaded”, then stops to restart: reload the page in your browser (not with “Reload list of plugins”, which stops GrandNode again) until the list of plugins shows again; your shop does not answer meanwhile. If it still does not answer after a few minutes, restart GrandNode (its service or its container).",
          image:
            "Screenshot of GrandNode: the “Upload” window, the archive chosen, its “Upload” button framed"
        },
        install: {
          title: "Install the plugin",
          body: "In the list, find “Bitcoin (sattle.me)”, in the group “Payment methods”: its “Installed” label stays red until it is installed. Click “Install”: GrandNode restarts again. Reload the page the same way.",
          image:
            "Screenshot of GrandNode: the plugin Bitcoin (sattle.me) in the list, its “Install” button framed"
        },
        open: {
          title: "Open its settings",
          body: "Once “Configure” shows for “Bitcoin (sattle.me)”, click it. You will also find its settings in “Configuration” → “Payment” → “Payment methods”, under the name “Bitcoin”.",
          image:
            "Screenshot of GrandNode: the plugin Bitcoin (sattle.me), installed, its “Configure” button framed"
        },
        save: {
          title: "Paste the key and save",
          body: "Turn on “Enabled”, paste the key into “Integration key”, then click “Save” at the top of the page: the plugin checks it, then never shows it again. “Time to pay (minutes)” is how long the customer has to pay an invoice: from 1 to 60 minutes, 15 by default.",
          image:
            "Screenshot of GrandNode: the settings of Bitcoin (sattle.me), “Enabled”, the “Integration key” field and “Save” framed"
        },
        check: {
          title: "Check your shop",
          body: "At the payment step, your customers can now pay in bitcoin, with the sattle.me logo. Once the order is confirmed, they pay it on a page of your shop by scanning a QR code: in Lightning below about 1,000 sats, in Lightning or on-chain above. An on-chain payment pays the order after 3 confirmations, about 30 minutes, longer with a low fee. GrandNode also checks payments every minute, even once the payment page is closed. Every payment is a real bitcoin payment, to your wallet.",
          image: "Screenshot of a GrandNode shop: the bitcoin payment at the payment step"
        }
      },
      smartstore: {
        download: {
          title: "Download the plugin",
          body: "Download the plugin's package, Smartstore.Module.Sattleme.Bitcoin.….zip, and keep it as it is, without unzipping it. The plugin needs Smartstore 6.4.",
          link: "Open the plugin's GitHub page",
          file: "Download version {{version}}"
        },
        plugins: {
          title: "Open the plugins",
          body: "In Smartstore's administration, open “Plugins” → “Manage plugins”.",
          image:
            "Screenshot of Smartstore: the administration's “Plugins” menu, “Manage plugins” framed"
        },
        upload: {
          title: "Upload the package",
          body: "Click “Upload plugin” at the top of the page and choose the package: Smartstore uploads it at once and says it was uploaded and unzipped.",
          image: "Screenshot of Smartstore: the plugins page, its “Upload plugin” button framed"
        },
        reload: {
          title: "Reload the list of plugins",
          body: "Click “Edit” → “Reload list of plugins”. Smartstore restarts: wait for the page to show again, your shop does not answer meanwhile.",
          image: "Screenshot of Smartstore: the “Edit” menu, “Reload list of plugins” framed"
        },
        install: {
          title: "Install the plugin",
          body: "In the list, find “Bitcoin (sattle.me)” and click “Install”: Smartstore queues its installation.",
          image:
            "Screenshot of Smartstore: the plugin Bitcoin (sattle.me) in the list, its “Install” button framed"
        },
        execute: {
          title: "Run the installation",
          body: "Click “Execute tasks” at the top of the page, then “OK”. Smartstore restarts again and installs the plugin: wait for the page to show again.",
          image: "Screenshot of Smartstore: the plugins page, its “Execute tasks” button framed"
        },
        open: {
          title: "Open its settings",
          body: "Under “Bitcoin (sattle.me)”, click the gear button, then “Configure”. You will also find its settings in “Configuration” → “Payment methods”, under the name “Bitcoin”.",
          image:
            "Screenshot of Smartstore: the plugin Bitcoin (sattle.me), installed, its gear and “Configure” framed"
        },
        save: {
          title: "Paste the key and save",
          body: "Paste the key into “Integration key”, then click “Save” at the top of the page: the plugin checks it, then never shows it again. “Time to pay (minutes)” is how long the customer has to pay an invoice: from 1 to 60 minutes, 15 by default.",
          image:
            "Screenshot of Smartstore: the settings of Bitcoin (sattle.me), the “Integration key” field and “Save” framed"
        },
        activate: {
          title: "Activate the payment method",
          body: "Open “Configuration” → “Payment methods” and click “Activate” under “Bitcoin”: your shop offers it at checkout only once it is active.",
          image:
            "Screenshot of Smartstore: the payment methods, the “Activate” button of Bitcoin framed"
        },
        timezone: {
          title: "Set your shop's time zone",
          body: "In “Configuration” → “Settings”, choose your “Default store time zone” and save, so that the payment page shows until when to pay in your time zone. Without it, Smartstore uses its server's, often UTC."
        },
        check: {
          title: "Check your shop",
          body: "At the payment step, your customers can now choose “Bitcoin”. Once the order is confirmed, they pay it on a page of your shop by scanning a QR code: in Lightning below about 1,000 sats, in Lightning or on-chain above. An on-chain payment pays the order after 3 confirmations, about 30 minutes, longer with a low fee. Smartstore also checks payments every minute, even once the payment page is closed, as long as its scheduled tasks reach your store's URL. Every payment is a real bitcoin payment, to your wallet.",
          image: "Screenshot of a Smartstore shop: “Bitcoin” at the payment step"
        }
      },
      prestashop: {
        download: {
          title: "Download the module",
          body: "Download the module's file, sattleme.zip, and keep it as it is, without unzipping it. The module needs PrestaShop 9.0, 9.1 or 9.2, with PHP 8.2 to 8.5.",
          link: "Open the module's GitHub page",
          file: "Download version {{version}}"
        },
        upload: {
          title: "Open the Module Manager",
          body: "In PrestaShop's back office, open “Modules” → “Module Manager”, then click “Upload a module” at the top of the page.",
          image: "Screenshot of PrestaShop: the Module Manager, its “Upload a module” button framed"
        },
        drop: {
          title: "Upload the file",
          body: "Drop the file into the window, or click “select file” and choose it: PrestaShop uploads the module and installs it at once.",
          image:
            "Screenshot of PrestaShop: the “Upload a module” window, its area for the file framed"
        },
        open: {
          title: "Open its settings",
          body: "Once PrestaShop says “Module installed!”, click “Configure”. You will also find its settings in “Modules” → “Module Manager”, under “sattle.me”.",
          image: "Screenshot of PrestaShop: “Module installed!”, its “Configure” button framed"
        },
        save: {
          title: "Paste the key and save",
          body: "Turn on “Accept bitcoin payments”, paste the key into “Integration key”, then click “Save” at the bottom of the page: the module checks the key, then never shows it again. The page then says “The integration key of”, followed by your business's name. “Time to pay” is how long the customer has to pay an invoice: from 1 to 60 minutes, 15 by default.",
          image:
            "Screenshot of PrestaShop: the settings of sattle.me, “Accept bitcoin payments” and the “Integration key” field framed"
        },
        cron: {
          title: "Set up the background checks",
          body: "Under “Background checks”, the page gives a line for your server's crontab: add it to the crontab of the web server's user, or as a cron job in your hosting's panel, so that it runs every minute. The module then checks payments every minute, even once the payment page is closed. Until it has run, the page says “The background checks never ran: set up the cron.”",
          image:
            "Screenshot of PrestaShop: the settings of sattle.me saved, the crontab line under “Background checks” framed"
        },
        check: {
          title: "Check your shop",
          body: "At the payment step, your customers can now choose “Pay with bitcoin”. Once the order is placed, they pay it on a page of your shop by scanning a QR code: in Lightning below about 1,000 sats, in Lightning or on-chain above. An on-chain payment pays the order after 3 confirmations, about 30 minutes, longer with a low fee. Every payment is a real bitcoin payment, to your wallet.",
          image: "Screenshot of a PrestaShop shop: “Pay with bitcoin” at the payment step"
        }
      },
      magento: {
        install: {
          title: "Install the module",
          body: "On your Magento server, from Magento's root folder and as the web server's user, install the module from Packagist with Composer, then enable it with these commands. The module needs Magento Open Source 2.4.7, 2.4.8 or 2.4.9, with PHP 8.2 to 8.5. In developer mode, “setup:di:compile” and “setup:static-content:deploy” are not needed.",
          link: "Open the module's Packagist page"
        },
        open: {
          title: "Open its settings",
          body: "In Magento's admin, open “Stores” → “Configuration”, then “Sales” → “Payment Methods”, and expand “Bitcoin (sattle.me)”.",
          image: "Screenshot of Magento's admin: the payment methods, “Bitcoin (sattle.me)” framed"
        },
        save: {
          title: "Paste the key and save",
          body: "Set “Enabled” to “Yes”, paste the key into “Integration key”, then click “Save Config” at the top of the page: the module checks the key, then never shows it again. “Connected to” then shows your business's name. “Time to pay (minutes)” is how long the customer has to pay an invoice: from 1 to 60 minutes, 15 by default.",
          image:
            "Screenshot of Magento's admin: the settings of Bitcoin (sattle.me), “Enabled” and the “Integration key” field framed"
        },
        cron: {
          title: "Check Magento's cron",
          body: "The module checks payments every minute, even once the payment page is closed, through Magento's cron, which also cancels the orders left unpaid. A Magento in production already runs it; if yours does not, set it up from Magento's root, as the web server's user, with this command."
        },
        check: {
          title: "Check your shop",
          body: "At the payment step, your customers can now choose “Bitcoin”. Once the order is placed, they pay it on a page of your shop by scanning a QR code: in Lightning below about 1,000 sats, in Lightning or on-chain above. An on-chain payment pays the order after 3 confirmations, about 30 minutes, longer with a low fee. Every payment is a real bitcoin payment, to your wallet.",
          image: "Screenshot of a Magento shop: “Bitcoin” at the payment step"
        }
      }
    },
    assistant: {
      row: "AI assistant",
      rowDetail: "Claude, ChatGPT… make your invoices",
      title: "AI assistant",
      lead: "Your AI assistant makes your business's invoices, numbered with yours, with their payment link and PDF, and tells you when they are paid. It never spends anything.",
      hosted: {
        title: "In Claude, ChatGPT…",
        detail: "Ready to use, hosted by sattle.me",
        badge: "The simplest"
      },
      desktop: { title: "In Claude Desktop", detail: "The key stays on your computer" },
      selfHosted: {
        title: "On your own server",
        detail: "Its open-source code, on GitHub",
        badge: "For experts"
      },
      hostedSteps: {
        add: {
          title: "Add the connector",
          claude:
            "In Claude, this button opens the connector's form, already filled in: check it, then confirm.",
          other:
            "In ChatGPT or another AI app, add a custom connector (MCP server) with this address, exactly as it is:"
        },
        addClaude: "Add to Claude",
        openChatGpt: "Open ChatGPT",
        copy: "Copy the address",
        copied: "Address copied",
        copyFailed: "The address could not be copied",
        connect: {
          title: "Connect",
          body: "The app opens a sattle.me page that asks for the assistant's key. That page says where it will take you back: only continue if it is your AI app."
        }
      },
      desktopSteps: {
        download: {
          title: "Download the extension",
          body: "The “.mcpb” file of the latest release.",
          link: "The extension on github.com",
          file: "Download version {{version}}"
        },
        open: {
          title: "Open it",
          body: "Open the file: Claude Desktop installs the assistant and asks for its key."
        }
      },
      selfHostedSteps: {
        install: {
          title: "Install the server",
          body: "The same MCP server as sattle.me's, on a machine of yours or your provider's, with Docker. Its open-source code and installation guide are on GitHub.",
          link: "sattleme/mcp-server on github.com"
        },
        trust: {
          title: "This server sees your invoices",
          body: "Whoever runs it sees the assistant's key and the invoices it makes: your clients' names and addresses, amounts. If you stop trusting them, remove the assistant: it stops at once."
        },
        add: {
          title: "Add the connector",
          body: "Once the server is online, add its address as a custom connector in your AI app (Claude, ChatGPT…)."
        },
        connect: {
          title: "Connect",
          body: "The app opens a page of your server that asks for the assistant's key. That page says where it will take you back: only continue if it is your AI app."
        }
      },
      keyStep: {
        title: "Create the assistant's key",
        leadHosted: "Do it when the sattle.me page asks for it: it is shown only once.",
        leadDesktop: "Do it when Claude Desktop asks for it: it is shown only once.",
        leadSelfHosted: "Do it when your server's page asks for it: it is shown only once.",
        name: "Assistant's name",
        namePlaceholder: "Alice's Claude",
        nameHint: "It shows next to its invoices in your wallet.",
        permissionsTitle: "What this assistant may do",
        nonePicked: "Turn on at least one permission to create the key.",
        powerTitle: "It can never spend",
        power: {
          hosted: "Paste it only into the sattle.me page, never into a conversation.",
          desktop: "Paste it only into Claude Desktop, never into a conversation.",
          selfHosted: "Paste it only into your server's page, never into a conversation."
        }
      },
      keySheet: {
        once: "It is shown only once: copy it now. It can never be shown again, not even with your passkey. If it is lost, remove the assistant and create another one.",
        unpublished:
          "The assistant {{name}} could not be published to your relays yet. It will be at the next unlock with your passkey, while connected to the internet: until then, it can do nothing.",
        secret:
          "Keep it secret. If it leaked, remove the assistant and create another one: the invoices already made stay payable.",
        pasteHosted:
          "Paste it into the sattle.me page. Then ask, for example: “Make an invoice to Dupont SA for 3 days of consulting at CHF 1,200, due in 30 days.”",
        pasteDesktop:
          "Paste it into Claude Desktop's “Assistant key” field. Then ask, for example: “Make an invoice to Dupont SA for 3 days of consulting at CHF 1,200, due in 30 days.”",
        pasteSelfHosted:
          "Paste it into your server's page. Then ask, for example: “Make an invoice to Dupont SA for 3 days of consulting at CHF 1,200, due in 30 days.”",
        pasteHostedExport:
          "Paste it into the sattle.me page. Then ask, for example: “Export last month's transactions as a CSV for my accountant.”",
        pasteSelfHostedExport:
          "Paste it into your server's page. Then ask, for example: “Export last month's transactions as a CSV for my accountant.”",
        pasteDesktopExport:
          "Paste it into Claude Desktop's “Assistant key” field. Then ask, for example: “Export last month's transactions as a CSV for my accountant.”"
      },
      created: "AI assistant · created on {{date}}",
      createdExporting: "AI assistant · created on {{date}} · exports your transactions",
      createdExportOnly:
        "AI assistant · created on {{date}} · exports your transactions, no invoices",
      createdNoInvoices: "AI assistant · created on {{date}} · no invoices",
      invoicing: {
        switch: "Make invoices",
        switchHint:
          "By turning it on, you allow this AI assistant to make invoices in your business's name, numbered with yours, and to read the ones it made, with your clients' names and addresses. This choice cannot be changed later for this key."
      },
      export: {
        allow: "Allow exporting transactions",
        withdraw: "Stop exporting transactions",
        switch: "Access to your sales and payments sent",
        switchHint:
          "By turning it on, you allow this AI assistant to read your business's sales and payments sent, to export them. It can never spend.",
        suspended:
          "Temporarily unavailable: giving AI assistants access to your sales and payments sent will be offered again in a future version.",
        allowDialog: {
          title: "Allow {{name}} to export your transactions?",
          body: "{{name}} will be able to read the sales and the payments sent of {{business}} recorded on your relays, and export them as “$t(navigation.destinations.wallet) › $t(walletExport.open)” does. Payments received without a sale (straight to your Lightning address or your wallet) are not included. It can never spend. If you stop it, it will no longer export, but a copy of its key made until then could still read your sales recorded before.",
          confirm: "Allow"
        },
        withdrawDialog: {
          title: "Stop {{name}} exporting?",
          body: "{{name}} will no longer be able to export the transactions of {{business}}. What it already exported stays in your AI app.",
          confirm: "Stop exporting"
        },
        allowedTitle: "Export allowed",
        allowedBody: "{{name}} can export your transactions",
        withdrawnTitle: "Export stopped",
        withdrawnBody: "{{name}} can no longer export your transactions",
        unreachable:
          "The permission could not be published. Check your internet connection, then try again",
        createFailedTitle: "Export not allowed yet",
        createFailed:
          "{{name}} was created, but exporting could not be allowed. Try again from the integrations list"
      },
      remove: "Remove the assistant",
      removeDialog: {
        title: "Remove {{name}}?",
        body: "{{name}} will make no more invoices for {{business}}. Those it made stay payable until their due date, and in your wallet.",
        confirm: "Remove the assistant",
        doneTitle: "Assistant removed",
        doneBody: "{{name}} will make no more invoices."
      }
    },
    keySheet: {
      title: "Key for {{name}}",
      keyLabel: "Secret key",
      once: "It is shown only once: copy it now. It can never be shown again, not even with your passkey. If it is lost, remove the integration and create another one.",
      unpublished:
        "The integration {{name}} could not be published to your relays yet. It will be at the next unlock with your passkey, while connected to the internet: until then, its server cannot find it.",
      secret:
        "Keep it secret, on that shop's servers only: never in a web page, in an app nor for another shop. It cannot spend your funds. If it leaked, remove the integration and create another one.",
      copy: "Copy the key",
      copied: "Key copied",
      copyFailed: "The key could not be copied. Select it, then copy it.",
      done: "Done"
    },
    removeDialog: {
      title: "Remove {{name}}?",
      body: "Its key will no longer create payment requests for {{business}}. A request already shown can still be paid until it ends, and its past sales stay in the wallet.",
      confirm: "Remove the integration",
      doneTitle: "Integration removed",
      doneBody: "The key of {{name}} no longer creates payment requests."
    },
    pendingDialog: {
      title: "{{name}} has payments in progress",
      unknownTitle: "{{name}}'s payments could not be checked",
      lead: "Wait until {{name}}'s payments are final before removing it, so that each of its sales stays in its name.",
      unknownLead:
        "Whether {{name}}'s payments are final could not be checked. Wait until they are before removing it, so that each of its sales stays in its name.",
      open_one: "{{count}} payment request still open, until {{time}} at the latest.",
      open_other: "{{count}} payment requests still open, until {{time}} at the latest.",
      confirming_one:
        "{{count}} Bitcoin payment waiting for confirmation (3 confirmations, about thirty minutes).",
      confirming_other:
        "{{count}} Bitcoin payments waiting for confirmation (3 confirmations, about thirty minutes).",
      end: "Try again afterwards.",
      forceNote:
        "If you cannot wait (its key leaked, for example), remove it anyway: its payments still reach your wallet, but those it did not see before its removal will not be in its name.",
      force: "Remove anyway",
      retry: "Try again",
      close: "Close"
    },
    failedTitle: "Action not possible",
    unreachableTitle: "Cannot connect",
    errors: {
      noAccount: "Unlock this point of sale with your passkey to manage the integrations.",
      tooMany: "Your account already has {{max}} integrations. Remove one to create another.",
      tooManyAssistants:
        "Your account already has {{max}} assistants. Remove one to create another.",
      invalidName: "Enter the integration's name.",
      unreachable:
        "The integration could not be published. Check your internet connection, then try again.",
      removeUnreachable:
        "The removal could not be published. Check your internet connection, then try again.",
      removeFailed: "The removal could not be saved. Try again.",
      removalUnsaved:
        "This integration's key no longer creates payment requests, but its removal could not be saved. Try again: it will also be saved the next time you open your account.",
      exportNewer: "A newer version of the app changed this assistant. Update the app to change it"
    }
  },
  articles: {
    add: "Add an item",
    loading: "Loading your items…",
    guide: {
      title: "Sell in a few taps",
      lead: "Create your drinks, dishes and desserts once: they show on your point of sale and on your employees'.",
      create: {
        title: "Create your items",
        caption: "A name, a price, a photo. Scan a barcode to fill in the item faster.",
        captionNoScan: "A name, a price, a photo."
      },
      tap: {
        title: "Tap them at the point of sale",
        caption:
          "Switch to “$t(pos.mode.articles)”: each tap adds the item to the basket. In the app on a phone, you can also scan their barcode."
      },
      cash: {
        title: "Charge the basket",
        caption: "The total adds up by itself: your customer scans the QR code and pays."
      }
    },
    offline: "No relay answered. Check the connection, then come back to this screen.",
    newer: "Some items come from a newer version of the app: update the app to see them.",
    openHint: "Opens the item to change or delete it.",
    saved: {
      title: "Item saved",
      body: "{{name}} is in your items."
    },
    changed: {
      title: "Item updated",
      body: "{{name}} is up to date."
    },
    removed: {
      title: "Item deleted",
      body: "{{name}} is no longer in your items."
    },
    removeDialog: {
      title: "Delete {{name}}?",
      body: "The item disappears from your items, on all your devices. This cannot be undone.",
      confirm: "Delete the item"
    },
    form: {
      title: "New item",
      editTitle: "Edit the item",
      scan: "Scan",
      addPhoto: "Add a photo",
      changePhoto: "Change the photo",
      preparingPhoto: "Preparing the photo…",
      dropPhoto: "Drop a photo here",
      choosePhoto: "or choose a file",
      photoMenu: "Article photo",
      takePhoto: "Take a photo",
      pickPhoto: "Choose from your photos",
      nameLabel: "Name",
      namePlaceholder: "Item name",
      priceLabel: "Price",
      priceInvalid: "Enter a price such as 4.80",
      descriptionLabel: "Description",
      descriptionPlaceholder: "Ingredients, size, allergens",
      addDescription: "Add a description",
      fromOpenFoodFacts: "· from Open Food Facts",
      searching: "· looking it up on Open Food Facts",
      save: "Save the item",
      saveChanges: "Save the changes",
      remove: "Delete the item"
    },
    scanner: {
      title: "Scan a barcode",
      aim: "Aim at the barcode",
      lead: "The name and the photo come from Open Food Facts. You will only have to set the price.",
      leadNoLookup: "You will enter the name, the photo and the price.",
      manual: "Enter without a barcode",
      denied: "Allow the camera to scan a barcode.",
      // The web app: the browser's own settings (BarcodeScanner.tsx).
      deniedWeb:
        "Allow the camera for this site in your browser's settings (the padlock next to the address), then tap “Allow the camera”.",
      allow: "Allow the camera",
      settings: "Open settings",
      unavailable: "The camera could not start. This device may not have one.",
      engineFailed:
        "The barcode reader could not be loaded. Check your internet connection, then try again.",
      retry: "Try again",
      notFoundTitle: "Product not found",
      notFoundBody: "This barcode is not recognized. Enter the item's name.",
      unreachableTitle: "Product lookup failed",
      unreachableBody: "Scan again in a moment, or enter the item's name."
    },
    errors: {
      title: "Item not saved",
      changeTitle: "Item not updated",
      removeTitle: "Item not deleted",
      noAccount: "Unlock the app with your passkey, then try again.",
      invalid: "Enter a name and a price.",
      tooMany: "The catalogue is full: 500 items at most.",
      unreachable: "Too few relays answered. Check the connection, then try again.",
      photoDenied: "Allow access to your photos in the device settings, then try again.",
      cameraDenied: "The camera does not open. Allow it in the device settings, then try again.",
      photoUnreadable: "This image cannot be used. Choose another one."
    }
  },
  activity: {
    limited: "View limited to your own transactions",
    followUp: "To follow up",
    movements: "Transactions",
    yourMovements: "Your transactions",
    allMovements: "All transactions",
    allYourMovements: "All your transactions",
    dayNet: "Day's net: {{amount}}",
    clearFilter: "{{name}}, clear the filter",
    reading: "Loading sales and invoices…",
    loadFailed: "Your activity could not be read. Check your internet connection, then try again.",
    empty: "No transactions yet.",
    noMatch: "No transactions match the filters.",
    showExpired: "Show expired ({{count}})",
    hideExpired: "Hide expired",
    showMore: "Show more",
    arrivals_one: "{{count}} new transaction",
    arrivals_other: "{{count}} new transactions",
    expiredHidden: "Expired invoices are hidden.",
    pendingCredit: {
      awaiting: "not in balance yet",
      received: "Payment received",
      confirmed: "confirmed",
      credit: "Added to your balance",
      waiting: "pending",
      fees: "Crediting this payment to your balance currently costs more than {{fee}}, our limit. It will happen automatically once that cost no longer exceeds it, when you open your wallet.",
      feesQuoted:
        "Crediting this payment to your balance currently costs {{price}}, more than our limit of {{fee}}. It will happen automatically once that cost no longer exceeds it, when you open your wallet.",
      other:
        "The payment will be added automatically when you open your wallet. Fees to be deducted: {{fee}} at most."
    },
    followUps: {
      open: "Open",
      underpaid: "Underpaid",
      unconfirmed: "Confirming",
      draft: "Drafts"
    },
    followUpTitles: {
      open: "Open invoices",
      underpaid: "Underpaid invoices",
      unconfirmed: "Confirming",
      draft: "Drafts"
    },
    followUpLabel: "{{name}}: {{count}}, {{total}}",
    rest: "{{amount}} left",
    states: {
      open: "Open",
      underpaid: "Underpaid",
      unconfirmed: "Confirming",
      draft: "Draft",
      expired: "Expired",
      canceled: "Canceled",
      inProgress: "In progress",
      failed: "Failed"
    },
    done: {
      paid: "Paid",
      received: "Received",
      sent: "Sent"
    },
    sources: {
      pos: "Point of sale",
      link: "Invoice",
      integration: "Integration",
      receive: "Received",
      send: "Sent",
      recovered: "Recovery"
    },
    titles: {
      link: "Invoice",
      recovered: "Funds recovered",
      mtpSale: "Sale in {{currency}}",
      // Rows copied from the v2 account (src/features/activity/legacy-history.ts).
      payout: "Payout to your wallet",
      referral: "Referral fee"
    },
    mtpSale: {
      section: "Sale",
      received: "You receive",
      transferNowNote: "Transferred on its own, without waiting for your other sales",
      transferLaterNote: "In a grouped transfer with your other sales, from {{threshold}}",
      follow: "Track the sale",
      followLabel: "Order {{order}}, track the sale"
    },
    you: "You",
    stamp: "{{day}} · {{time}}",
    columns: {
      date: "Date",
      label: "Description",
      source: "Source",
      by: "By",
      state: "Status",
      amount: "Amount",
      sats: "sats"
    },
    detail: {
      date: "Date",
      takenBy: "Taken by",
      madeBy: "Created by",
      rest: "Left to pay",
      endsAt: "Payable until",
      payments: "Payments",
      link: "Payment link",
      openLink: "Open the invoice",
      copyLink: "Copy the link",
      linkCopied: "Link copied",
      accepted: "Accepted on",
      difference: "Difference accepted",
      acceptedLate:
        "Accepted too late to be sent to {{integration}}, which keeps the order expired. Check that it is marked paid in its back office."
    },
    accept: {
      action: "Accept the amount received",
      done: "Amount received accepted",
      dialog: {
        title: "Accept the amount received?",
        body: "The sale will be paid at {{received}}. The difference of {{difference}} will no longer be asked for. This is final.",
        bodyOrder:
          "The order will be paid at {{received}}: your shop will see it paid once the payment is confirmed. The difference of {{difference}} will no longer be asked for. This is final.",
        bodyLate:
          "The order will be paid at {{received}} and the difference of {{difference}} will no longer be asked for. This acceptance is not passed on to {{integration}}, which keeps the order expired: also mark it as paid in its back office. This is final.",
        confirm: "Accept",
        cancel: "Back"
      },
      late: {
        title: "This order's invoice has ended",
        body: "The order stays expired for {{integration}}, which will not see your acceptance. If you accept it here, also mark it as paid in its back office.",
        closingTitle: "This order's invoice is ending",
        closingBody:
          "It is too late for {{integration}} to receive your acceptance. If you accept it here, also mark it as paid in its back office.",
        lapsedBody:
          "Your acceptance did not reach a majority of your relays before the invoice ended: {{integration}} will not see it. If you accept it here, also mark it as paid in its back office.",
        yourShop: "your shop"
      },
      errors: {
        network: "The acceptance could not be saved, try again",
        already: "This sale is already accepted",
        ended: "Too late to send the acceptance to the shop: read again before accepting"
      },
      pending:
        "Acceptance being saved: it will count once a majority of your relays have received it, before the invoice ends.",
      blocked: {
        unread:
          "The app has not yet been able to check with a majority of your relays whether the amount received has already been accepted. “$t(activity.accept.action)” will appear here once this check is done. If it lasts, use “$t(relays.test)” in “$t(settings.relays)”.",
        unmet:
          "The amount received was accepted when it was {{received}}, but the app sees less today, for example after a transaction was replaced. The acceptance counts again as soon as this amount is reached: it is not made twice.",
        newer:
          "The amount received was accepted with a newer version of the app: update the app to see this acceptance."
      }
    }
  },
  table: {
    headerHint: "Sort and filter",
    sortedBy: "sorted: {{order}}",
    filtered: "filtered",
    menu: "{{name}}: sort and filter",
    sort: "Sort",
    orders: {
      text: { ascending: "A to Z", descending: "Z to A" },
      number: { ascending: "Smallest to largest", descending: "Largest to smallest" },
      date: { ascending: "Oldest to newest", descending: "Newest to oldest" }
    },
    show: "Show",
    selectAll: "Select all",
    periods: {
      thisWeek: "This week",
      lastWeek: "Last week",
      thisMonth: "This month",
      lastMonth: "Last month",
      thisYear: "This year",
      lastYear: "Last year",
      older: "Older"
    },
    value: "{{label}}, {{count}}",
    emptyValue: "Empty",
    clearFilters: "Clear filters"
  },
  wallet: {
    balance: "Balance",
    atLeast: "at least",
    discreet: "Discreet",
    hiddenAmount: "Amount hidden",
    received: "Received in 30 days",
    sent: "Sent in 30 days",
    send: "Send",
    sell: "Sell",
    sellFrom: "from {{amount}} sats",
    opening: "Opening your wallet…",
    loadFailed: "Your wallet could not be read. Check your internet connection, then try again.",
    retry: "Try again",
    empty: "No payments yet.",
    guide: {
      lead: "No transactions yet. Here is how they come in:",
      label: "How transactions come in",
      take: {
        title: "Take a payment",
        caption: "Enter an amount at the point of sale: your customer scans the QR code and pays."
      },
      receive: {
        title: "Receive",
        caption: "The payment arrives in your wallet and shows here, with who took it."
      },
      follow: {
        title: "Follow and send",
        caption:
          "Invoices, payment links, transfers: follow everything here. Send your sats whenever you like."
      }
    },
    syncing: "Updating…",
    syncingWallet: "Syncing your wallet…",
    syncLate:
      "Your wallet could not be updated: the balance and payments shown are this device's and may be incomplete. Check your internet connection.",
    syncLateBlank:
      "Your wallet could not be synced. Check your internet connection, then try again.",
    noRate: "Exchange rate unavailable: some amounts in sats only.",
    today: "Today",
    yesterday: "Yesterday",
    meta: "{{time}} · {{kind}}",
    kinds: {
      lightningReceipt: "Lightning receipt",
      lightningAddress: "Lightning address",
      lightningInvoice: "Lightning invoice",
      bitcoinAddress: "Bitcoin address",
      sparkTransfer: "Spark transfer"
    },
    titles: {
      deposit: "Deposit",
      withdrawal: "Withdrawal",
      receipt: "Received",
      sending: "Sent"
    },
    pills: {
      confirming: "Confirming",
      inProgress: "In progress",
      failed: "Failed"
    },
    networks: {
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      spark: "Spark"
    },
    detail: {
      date: "Date",
      network: "Network",
      fee: "Fees",
      sendFee: "Sending fees",
      noFee: "None",
      reference: "Reference",
      copy: "Copy the reference",
      copied: "Reference copied",
      recipient: "Recipient",
      copyAddress: "Copy the address",
      addressCopied: "Address copied",
      close: "Close"
    },
    sendSheet: {
      intro:
        "Type, paste or scan a Lightning address, a Lightning invoice, a bitcoin address or a Spark address.",
      introNoScan:
        "Type or paste a Lightning address, a Lightning invoice, a bitcoin address or a Spark address.",
      close: "Close",
      cancel: "Cancel",
      recipient: "Recipient",
      recipientPlaceholder: "Address or invoice",
      paste: "Paste",
      scan: "Scan a QR code",
      reading: "Reading the recipient…",
      kinds: {
        lightningAddress: "Lightning address",
        lnurlPay: "LNURL link",
        bolt11: "Lightning invoice",
        bitcoinAddress: "Bitcoin address",
        sparkAddress: "Spark address"
      },
      recipientErrors: {
        unrecognized: "Enter an address or an invoice",
        unsupported: "Enter an address or an invoice",
        otherNetwork: "Use an address on the main network",
        expired: "Ask for a new invoice",
        unreachable: "Check the Lightning address",
        lnurlUnreachable: "Try again: the LNURL link is not responding",
        failed: "Check your internet connection",
        pasteEmpty: "Copy an address or an invoice first",
        pasteFailed: "Paste into the field with the keyboard"
      },
      amount: "Amount",
      switchToSats: "Enter in sats",
      switchToFiat: "Enter in {{currency}}",
      available: "Available: {{amount}}",
      amountErrors: {
        invalid: "Enter a valid amount",
        belowMin: "Enter at least {{amount}}",
        aboveMax: "Enter at most {{amount}}",
        aboveBalance: "Enter at most the available balance",
        feesAboveBalance: "Lower the amount to cover the fees"
      },
      speed: "Speed",
      speeds: {
        fast: "Fast",
        medium: "Normal",
        slow: "Economy"
      },
      fee: "Estimated fees",
      feePreparing: "Calculating fees…",
      quoteFailed:
        "The fees could not be calculated. Check your internet connection, then try again.",
      balanceAfter: "Balance after sending",
      expiresIn: "Expires in",
      send: "Send {{amount}}",
      pay: "Pay {{amount}}",
      confirming: "Confirm with your passkey…",
      sending: "Sending…",
      sendFailed:
        "The payment did not go through. Check your internet connection, then try again: it will only be sent once.",
      recordFailed:
        "Your account's relays did not answer: nothing was sent. Check your internet connection, then try again.",
      noRate: "The bitcoin rate is unavailable: enter the amount in sats.",
      result: {
        completedTitle: "Payment sent",
        onchainTitle: "Payment sent",
        onchainBody:
          "The Bitcoin network still has to confirm the transaction: its status shows in the list of transactions.",
        pendingTitle: "Payment in progress",
        pendingBody:
          "The payment is on its way. This window updates by itself; closing it does not cancel the payment.",
        stalledTitle: "Still in progress",
        stalledBody: "Its final status will show in the list of transactions.",
        failedTitle: "The payment failed",
        failedBody: "Check the recipient and the balance, then try again.",
        recipientTo: "to {{recipient}}",
        recipientSent: "to {{recipient}}",
        done: "Done"
      },
      scanHint:
        "Aim at the QR code of a Lightning invoice, a Lightning address or a bitcoin address.",
      scanType: "Type",
      scanDenied: "Allow the camera to scan a QR code.",
      scanAllow: "Allow the camera",
      scanSettings: "Open settings"
    }
  },
  sell: {
    title: "Sell",
    back: "Back",
    retry: "Try again",
    busy: {
      starting: "Reading your Mt Pelerin account…",
      reading: "Reading your Mt Pelerin account…",
      signingIn: "Signing in to Mt Pelerin…",
      sendingCode: "Sending the code…",
      checkingCode: "Checking the code…",
      savingProfile: "Saving…",
      preparingInvoice: "Preparing the 1-sat payment…",
      confirming: "Confirming…",
      paying: "Paying…",
      addingAccount: "Adding the account…",
      savingAccount: "Saving the account…",
      loggingOut: "Logging out…"
    },
    failures: {
      offline: "The sale service is not answering. Check your internet connection, then try again",
      server: "The sale service sent an unreadable answer. Try again in a moment",
      refused: "The request was refused",
      codeRefused: "This code is not the right one",
      codeExpired: "This code has expired: ask for a new one",
      malformed: "The sale's invoice is not the one expected: nothing was paid",
      otherNetwork: "The sale's invoice is not the one expected: nothing was paid",
      otherAmount: "The sale's invoice is not the one expected: nothing was paid",
      expired: "The sale's invoice has expired: nothing was paid",
      payment: "The payment did not go out. Try again",
      record:
        "Your account's relays did not answer: nothing was sold. Check your internet connection, then try again",
      ibanTaken: "This IBAN is already registered on another Mt Pelerin account",
      accountKnown: "This account is already among your bank accounts, in this currency",
      accountUnchanged:
        "Mt Pelerin did not change this account: its details are still the ones shown. Contact Mt Pelerin to change them"
    },
    sessionLost: "Your Mt Pelerin session has expired: sign in again",
    intro: {
      title: "Sell with Mt Pelerin",
      lead: "Mt Pelerin, a Swiss financial intermediary, buys your sats and wires the francs to your bank account.",
      connectLead: "Your Mt Pelerin account opens with the key of your sattle.me account.",
      connect: "Sign in to Mt Pelerin",
      phoneLead: "Your Mt Pelerin account opens with your phone number.",
      phone: "Phone number",
      phoneHint: "Mt Pelerin sends you a code by SMS",
      sendCode: "Get the code",
      dialCountry: "Country of the number",
      dialCodeOf: "Country of the number: {{country}}, {{code}}"
    },
    code: {
      title: "Enter your code",
      lead: "Mt Pelerin just sent it to you by SMS at {{phone}}.",
      label: "6-digit code",
      notReceived: "Not received?",
      resend: "Send the code again",
      submit: "Confirm"
    },
    profile: {
      title: "Your e-mail",
      lead: "Mt Pelerin needs it to open your account. It sends the receipt of each sale there.",
      email: "E-mail",
      emailInvalid: "Enter a valid e-mail",
      phone: "Phone number",
      phoneInvalid: "Enter a valid number, with its dial code",
      phoneCaption: "The number of your Mt Pelerin account",
      submit: "Continue"
    },
    validation: {
      title: "Verify your wallet",
      lead: "Your wallet needs to be verified. Pay 1 sat ({{value}}) to complete this verification.",
      toPay: "To pay",
      fee: "Lightning fees",
      pay: "Pay 1 sat",
      unaffordable:
        "Your balance does not cover 1 sat and its fees. Come back after your next payment",
      leadNoRate: "Your wallet needs to be verified. Pay 1 sat to complete this verification.",
      lessThan: "less than {{amount}}",
      about: "about {{amount}}"
    },
    pending: {
      badge: "In progress",
      title: "Verifying your wallet",
      leadNoBank: "You can go on: your bank account does not depend on this check.",
      leadBank:
        "You can leave this screen: you can sell as soon as your wallet is verified (usually less than 15 minutes).",
      paid: "1 sat paid",
      toBank: "Add your bank account"
    },
    verified: {
      title: "Address verified",
      lead: "Your sat has arrived. Your sales will leave from {{address}}.",
      account: "Mt Pelerin account",
      address: "Lightning address",
      addressVerified: "Verified",
      bank: "Bank account",
      toBank: "Add your bank account",
      continue: "Continue",
      bankTodo: "To do"
    },
    bank: {
      title: "Where to wire your {{currency}}",
      lead: "The account your sales are wired to. It is yours or your company's.",
      none: "No bank account registered yet",
      add: "Add an account"
    },
    accountForm: {
      title: "Add an account",
      submit: "Add this account"
    },
    accountEdit: {
      title: "Edit the account",
      lead: "For another IBAN or another currency, add an account.",
      submit: "Save"
    },
    payoutCurrency: {
      label: "Payout currency",
      swift:
        "International transfer (SWIFT): one business day or more. Intermediary banks may charge fees, from a few dollars to several dozen"
    },
    accounts: {
      title: "Bank accounts",
      lead: "Your sales are wired to these accounts only.",
      add: "Add an account",
      fromSettings: "Settings",
      pending: "Pending",
      editHint: "Edit the holder's name and address",
      // Accounts Mt Pelerin listed that the app cannot read (guards.ts): never offered.
      unreadable_one: "{{count}} other account could not be read: it is not offered",
      unreadable_other: "{{count}} other accounts could not be read: they are not offered",
      // Mt Pelerin lacks a line of its holder's address: offered all the same.
      incompleteAddress: "Incomplete address"
    },
    addressTaken: {
      title: "Address already registered",
      body: "Your Lightning address is registered on another Mt Pelerin account. Sign in with that account's number.",
      switch: "Change account"
    },
    unavailable: "Selling sats over Lightning is not available for now",
    sale: {
      amount: "Amount",
      available: "Available: {{amount}}",
      change: "Change",
      fee: "Sale fees",
      receive: "You receive about",
      estimating: "Calculating…",
      estimateFailed: "Unavailable",
      pending: "Pending",
      pendingBalance: "Balance: {{amount}}",
      pendingSale: "This sale: {{amount}}",
      pendingGauge: "{{balance}} pending, plus {{sale}} from this sale, out of {{threshold}}",
      pendingGaugeHeld: "{{balance}} pending, out of {{threshold}}",
      limitsTitle: "Without identification",
      limitLeft: "{{left}} left of {{limit}}",
      seeLimits: "See my limits",
      settings: "Sale settings",
      quote: "See the quote",
      aboveMax: "Enter at most {{amount}}",
      aboveBalance: "Enter at most the available balance",
      tooSmall: "You must receive at least {{amount}}: increase the amount",
      transferFee: "Transfer fee",
      transfer: "Transfer",
      transferNow: "Immediate",
      transferNowNote: "{{fee}} transfer fee below {{threshold}}, free above",
      transferLater: "Deferred",
      transferLaterNote:
        "No transfer fee: in one grouped transfer with your other sales, once they reach {{threshold}}",
      equivalentOf: "the equivalent of {{amount}}",
      chooseAccount: "To which account?",
      addAccount: "Add an account"
    },
    quote: {
      title: "Quote",
      heading: "You receive {{amount}}",
      lead: "Your sats are sold and the francs wired to your bank account.",
      selling: "You sell",
      rate: "Rate",
      ratePrice: "1 BTC = {{price}}",
      fee: "Sale fees",
      lightningFee: "Lightning fees",
      account: "To the account",
      lockedUntil: "Rate guaranteed until {{time}}",
      expired: "The rate has expired: nothing was sold",
      refresh: "Refresh the quote",
      sell: "Sell {{amount}}",
      otherOrder: "The quote received is not the one asked for: nothing was paid",
      nothingWired: "This sale would transfer nothing to your account: nothing was paid",
      unaffordable: "Your balance does not cover this sale and its fees"
    },
    order: {
      heading: "{{amount}} to your bank",
      lead: "Sale of {{sats}}, {{date}}. You can leave this screen: the sale goes on.",
      leadDated: "Sale of {{date}}. You can leave this screen: the sale goes on.",
      received: "Sats received",
      receivedTodo: "Receipt of the sats",
      receivedNow: "Receiving the sats",
      receivedFailed: "Sats not received",
      transferred: "Transfer to your account",
      held: "This sale is being checked: look at your e-mails from Mt Pelerin",
      delayed: "The transfer is postponed: expect it within the week",
      refunded: "Your sats are being given back",
      failed: "This sale was refused",
      expired: "The quote expired: nothing was sold",
      reference: "Order number",
      outcomes: {
        awaitingPayment: "Awaiting payment",
        expired: "Expired",
        inProgress: "In progress",
        delayed: "Delayed",
        held: "Under review",
        sent: "Wired",
        refunded: "Refunded",
        failed: "Refused"
      },
      title: "Sale",
      soldTitle: "Sold successfully",
      soldLead: "Your {{sats}} are sold: {{amount}} will be wired to your account.",
      withOthers: "In a grouped transfer with your other sales, once they reach {{threshold}}",
      next: "What happens next",
      processing: "Processing of the sale",
      processingNow: "Being processed",
      processed: "Converted to {{currency}}",
      delayChf: "Within 1 business day (transfer in Switzerland, Monday to Friday)",
      delayEur: "Within 1 to 2 business days (SEPA transfer)",
      delaySwift: "One business day or more (international SWIFT transfer)",
      close: "Close",
      seeSales: "See your sales"
    },
    history: {
      title: "Your sales",
      empty: "No sale yet",
      unreadable: "Too many sales to list here"
    },
    split: {
      quoting: "Locking the rate of your sale…",
      receive: "You receive",
      title: "Split",
      lead: "Since {{date}}, your wallet has received {{received}}.",
      kept: "Kept in bitcoin ({{percent}})",
      share: "Share to sell ({{percent}})",
      sold: "Sold now: {{amount}}",
      lightningFee: "Lightning fees, on top",
      deferred:
        "Deferred sales are grouped and will be wired at once, as soon as they reach {{threshold}}.",
      balance:
        "Your balance only allows selling {{amount}}. The rest of the share will not be sold.",
      limit:
        "Without an identity verification, your sales are limited to {{limit}} a month. Sell {{amount}} now (the rest of the share will not be sold), or get verified first to sell the whole share.",
      sell: "Sell {{amount}}",
      identify: "Get verified at Mt Pelerin",
      identifyHeading: "Get verified to sell your share",
      identifyLead:
        "Your share to sell is {{due}}. Without an identity verification, your sales are limited to {{limit}} a month, and that limit is reached.",
      identifyHow:
        "Your identity is verified on Mt Pelerin's site, with the phone number of your account. Once your identity is verified, the whole share is offered to you here.",
      soldHeading: "Sold successfully",
      soldLead: "Your {{sats}} are sold for {{amount}}, which joins your sales awaiting transfer.",
      held: "Awaiting transfer",
      payout: {
        title: "Next transfer",
        threshold: "from {{threshold}}",
        held: "Already waiting",
        sale: "This sale",
        left: "<strong>{{left}}</strong> more in sales, then it will all be wired to your bank account.",
        reached: "The threshold is reached: it will all be wired to your bank account."
      },
      notice: "Split: {{amount}} to sell, about {{fiat}}.",
      noticeSell: "Sell",
      noticeIdentify: "Split: {{due}} to sell, once your identity is verified.",
      noticeSee: "View",
      setup: "Your split puts {{percent}} in {{currency}}. Set up selling to sell that share.",
      setupOpen: "Set up selling"
    },
    limits: {
      title: "Sale limits",
      lead: "Without an identity verification, you can sell at most:",
      perSale: "Per sale",
      month: "Last {{days}} days",
      year: "This year",
      leftUntil: "{{amount}} left until {{date}}",
      leftRolling: "{{amount}} left: a sale counts for {{days}} days",
      unknown: "Not calculated: a sale in a currency other than the franc",
      feesTitle: "Fees included",
      identified: "Your identity is verified at Mt Pelerin.",
      noLimit: "No limit",
      perMonth: "Per month",
      perYear: "Per year",
      identifyHow:
        "To sell more, have your identity verified on Mt Pelerin's site, with the phone number of your account.",
      fees: "What counts is the amount sold, before fees are deducted. Calculated from your sales."
    },
    settings: {
      title: "Sale settings",
      account: "Mt Pelerin account",
      byKey: "Mt Pelerin account · signed in with your account's key",
      lightning: "Lightning address",
      verified: "verified",
      pendingValidation: "pending",
      banks: "Bank accounts",
      limits: "Sale limits",
      history: "Your sales",
      logout: "Log out of Mt Pelerin",
      logoutTitle: "Log out of Mt Pelerin?",
      logoutBody:
        "On all your devices. Your accounts and your sales stay at Mt Pelerin: you will find them again when you sign in.",
      logoutConfirm: "Log out",
      cancel: "Cancel",
      banksCount_one: "{{count}} account",
      banksCount_other: "{{count}} accounts",
      left: "{{amount}} left",
      perSale: "{{amount}} per sale",
      salesCount_one: "{{count}} this year",
      salesCount_other: "{{count}} this year"
    },
    close: "Close",
    poweredBy: "Powered by"
  },
  walletExport: {
    open: "Export",
    title: "Export transactions",
    close: "Close",
    lead: "The period's completed transactions: paid sales, received and sent payments.",
    period: "Period",
    periods: {
      thisMonth: "This month",
      lastMonth: "Last month",
      thisYear: "This year",
      lastYear: "Last year",
      custom: "Specific dates"
    },
    days: "{{first}} – {{last}}",
    from: "From",
    to: "To",
    format: "Export type",
    formats: {
      pdf: "Simple (PDF)",
      csv: "Detailed (CSV)"
    },
    amounts: "Amounts",
    units: {
      fiat: "In {{currency}}",
      btc: "In BTC"
    },
    columnsTitle: "Columns",
    columnsTicked: "{{ticked}} of {{total}}",
    columns: {
      dateAndTime: "Date and time",
      label: "Description",
      source: "Source",
      by: "By",
      network: "Payment type",
      reference: "Reference",
      bitcoinAmount: "Amount in BTC",
      bitcoinFees: "Fees in BTC",
      fiatAmount: "Amount in {{currency}}",
      fiatFees: "Fees in {{currency}}",
      originalAmount: "Amount entered",
      originalCurrency: "Currency entered",
      bitcoinPrice: "Bitcoin price in {{currency}}",
      remark: "Remark"
    },
    remarks: {
      accepted: "Difference of {{fiat}} / {{btc}}, accepted by the owner on {{date}} at {{time}}",
      acceptedSats: "Difference of {{btc}}, accepted by the owner on {{date}} at {{time}}"
    },
    submit: "Export",
    errors: {
      unread: "Your sales could not be read. Check your internet connection, then try again.",
      receiving:
        "A bitcoin payment seen by a point of sale has not reached your wallet yet. Try again in a few minutes.",
      failed: "The export could not be made. Try again."
    },
    pdf: {
      title: "Transactions report",
      period: "From {{first}} to {{last}}",
      made: "Issued on {{date}}",
      summary: "Summary",
      count: "Number of transactions",
      countOf: {
        pos: "of which point of sale",
        link: "of which invoices",
        integration: "of which integrations",
        receive: "of which received",
        send: "of which sent"
      },
      received: "Total received",
      sent: "Total sent",
      fees: "Sending fees",
      lines: "Transaction details",
      none: "No completed transaction in this period.",
      amount: "Amount ({{unit}})",
      amountMixed: "Amount",
      valuesNote:
        "A sale counts at the amount entered, in its currency; any other transaction, at the value of its bitcoin at the price recorded when it was paid (source: CoinGecko). A transaction without a recorded price counts in BTC.",
      // Rows copied from a v2 account among them (src/features/activity/legacy-history.ts).
      valuesNoteImported:
        "A sale counts for the amount typed, in its currency; any other transaction, for the value of its bitcoin at the rate recorded at its payment (source: CoinGecko; for the history taken over from your former payment service, the rate it had recorded). A transaction without a recorded rate counts in BTC."
    }
  },
  settings: {
    recovery: {
      group: "Security",
      title: "Recovery phrase",
      description:
        "The 12 words that restore your wallet without a passkey, to write down on paper.",
      open: "Show",
      lead: "These 12 words are a copy of your wallet: with them, anyone can spend all its funds, without your passkey.",
      rulesTitle: "Before showing them",
      rules:
        "Write them down on paper, in order, and keep them somewhere safe. Do not photograph them or save them in any file or message. Never give them to anyone: sattle.me will never ask you for them.",
      reveal: "Show the phrase",
      hide: "Hide",
      shownNote:
        "Only you should see these words. They disappear as soon as you leave this screen or the app.",
      captureOpen:
        "Screenshots are not blocked here: do not take any, and do not record the screen.",
      noPhrase: "This wallet has no recovery phrase to show.",
      wordLabel: "Word {{index}}: {{word}}"
    },
    title: "Settings",
    business: "Business",
    businessDescription: "Name and logo seen by customers, on receipts and invoices.",
    businessName: "Business name",
    logo: "Business logo",
    changeLogo: "Change the business logo",
    logoChange: "Change the logo",
    merchant: {
      section: "Merchant profile",
      description:
        "Accept bitcoin payments with this app: point of sale, invoices, employees. Your main wallet is created at this step.",
      create: "Create my merchant profile",
      failedTitle: "Point of sale not prepared",
      doneTitle: "Merchant profile created",
      doneBody: "You can accept payments"
    },
    groups: {
      charging: "Payments",
      payouts: "Payouts",
      display: "Display",
      network: "Network",
      // "Account" of "Settings" (the session, the deletion).
      account: "Account"
    },
    // The phone's cards and the computer's tabs of "Settings".
    rubrics: {
      chargingBoth: "Lightning and on-chain",
      methods: "Payment methods",
      chargingDescription:
        "What the point of sale, your employees and your integrations offer the customer.",
      lightning: "Lightning",
      lightningCaption: "Always offered, up to {{limit}} per invoice; {{beyond}}",
      lightningCaptionUnknown: "Always offered, up to your Lightning address's ceiling; {{beyond}}",
      lightningLimitFiat: "{{btc}} (about {{fiat}})",
      lightningBeyond: {
        onchain: "above it, only the on-chain address is shown",
        refused:
          "above it, the point of sale refuses the sale while on-chain payments are turned off"
      },
      splitLabel: "Split: {{bitcoin}} in bitcoin, {{fiat}} in {{currency}}",
      editRelays: "Edit the relays"
    },
    unlock: {
      title: "Ask for biometrics to unlock the app",
      captionOn: "Each time the app opens",
      captionOff: "The app opens without biometrics",
      captionUnavailable: "No biometrics or passcode on this device",
      section: "App lock",
      description:
        "This device's biometrics, or its passcode, are asked for each time the app opens or you come back to it, on top of till mode.",
      saveFailed: "This choice could not be saved on this device. Try again."
    },
    locked: {
      title: "Till mode",
      titleCard: "App locked",
      body: "Unlock the app to change your settings.",
      unlock: "Unlock"
    },
    displayCurrency: "Reference currency",
    displayCurrencyCardDescription: "Your cards' amounts shown in the app.",
    displayCurrencyDescription: "Amounts entered at the point of sale and shown in the app.",
    amountUnit: {
      title: "Currency shown first",
      description:
        "In “Wallet” and your cards’ history, on this device. The other amount is shown below it.",
      sats: "sats",
      savedTitle: "Currency shown first saved",
      saveFailed: "This choice could not be saved on this device. Try again."
    },
    theme: {
      title: "Theme",
      description: "On this device. “Automatic” follows the device's light or dark setting.",
      light: "Light",
      dark: "Dark",
      system: "Automatic",
      // A rubric's card on a phone ("Display"): the theme chosen.
      summaryLight: "Light theme",
      summaryDark: "Dark theme",
      summarySystem: "Automatic theme",
      savedTitle: "Theme saved",
      saveFailed: "This choice could not be saved on this device. Try again."
    },
    onchain: "On-chain payments",
    onchainDescription:
      "Confirmed in 10 to 60 minutes. Applies to the point of sale, yours and your employees'. Your invoices and integrations always offer on-chain payment.",
    split: "Split",
    splitDescription:
      "sattle.me fee: {{bitcoin}} on everything you take in. Converted share: {{fiat}} Mt Pelerin sale fees on top, sold when you accept it in “Wallet”.",
    splitDescriptionFree:
      "sattle.me fee: {{free}} instead of {{bitcoin}} until {{date}}, on everything you take in. Converted share: {{fiat}} Mt Pelerin sale fees on top, sold when you accept it in “Wallet”.",
    splitShort: "{{percent}} in {{currency}}",
    allBitcoin: "All in bitcoin",
    bankAccount: "Bank account",
    noBankAccount: "None",
    bankAtMtPelerin: "At Mt Pelerin",
    relays: "Nostr relays",
    relaysCount_one: "{{count}} relay",
    relaysCount_other: "{{count}} relays",
    relaysDescription: "Nostr servers the app connects to, on every device of the business.",
    // "Bitcoin node" of "Network".
    node: {
      title: "Bitcoin node",
      description:
        "Where your devices and your employees' follow on-chain payments, and where your wallet reads the blockchain.",
      mempoolTitle: "mempool.space",
      mempoolDescription: "Public, nothing to install. Sees the addresses of your on-chain sales.",
      ownTitle: "My node",
      ownDescription: "Your own mempool: nobody else sees your addresses.",
      mempoolCaption: "Default",
      urlLabel: "Address of your mempool",
      urlHint: "The address of its page in your browser, for example on your Umbrel or Start9",
      errors: {
        empty: "Enter the address of your mempool",
        incomplete: "Incomplete address, for example https://mempool.example.ch",
        insecure:
          "Only an https:// address is accepted: with http://, the connection is not encrypted",
        device: "This address is this device: enter your node's"
      },
      legacyHttpTitle: "http:// address no longer used",
      legacyHttpBody:
        "For your security, the app now connects to your node over https:// only: with http://, someone connected to this Wi-Fi could pose as it and make an unpaid sale look paid. Until you enter an https:// address, your devices act as if your node did not answer.",
      test: "Test the connection",
      results: {
        ok: {
          title: "Node reachable and up to date",
          body: "Last block: {{height}}"
        },
        unreachable: {
          title: "Node unreachable",
          body: "Check the address, and that this device is on the same network as your node."
        },
        notMempool: {
          title: "No mempool at this address",
          body: "Something answers, but not mempool's API. Check the address and the port."
        },
        noAddressIndex: {
          title: "Addresses unreadable",
          body: "Your mempool cannot read addresses yet: its index (electrs or Fulcrum) is missing, or not built yet."
        },
        behind: {
          title: "Node behind",
          body: "Its last block is {{hours}} h old: it is not synced yet."
        }
      },
      fallbackTitle: "When it does not answer",
      fallbackMempool: "Use mempool.space",
      fallbackMempoolDescription:
        "Your on-chain sales go on; mempool.space then sees your addresses.",
      fallbackNone: "Lightning only",
      fallbackNoneDescription:
        "Nothing goes to mempool.space; the Point of Sale no longer offers Bitcoin meanwhile.",
      payersTitle: "Your customers' payment pages",
      payersLabel: "Pass my node on to the payers' pages",
      payersCaption:
        "Your customers' browser also follows their payment on your node, with the same fallback. Its address then appears in your payment links, and it receives your customers' IP address.",
      payersHttpsOnly:
        "Only for a node reachable from the Internet, over https:// with a domain name: your customers' browser cannot reach your local network.",
      publicNotePayers:
        "The time a payment was sent, which sets its rate, stays on mempool.space: the same for you and your customers.",
      publicNote:
        "Your customers' payment page and the time a payment was sent, which sets its rate, stay on mempool.space: the same for you and your customers.",
      savedTitle: "Bitcoin node saved",
      savedOwn: "Your devices read the blockchain on your node",
      savedMempool: "Your devices read the blockchain on mempool.space",
      confirmTitle: "Save this node?",
      confirmBody:
        "It does not answer properly from this device. From your business's network, it may.",
      confirmAction: "Save anyway"
    },
    // "Look up scanned products" of "Network".
    productLookup: {
      section: "Catalogue",
      title: "Look up scanned products",
      caption:
        "On Open Food Facts, which receives the barcode and the device's IP address. Off: you enter the name and the photo.",
      savedTitle: "Product lookup saved",
      savedOn: "A scanned product's name and photo come from Open Food Facts",
      savedOff: "A scanned product's name and photo are entered by hand"
    },
    save: "Save",
    close: "Close",
    logout: "Log out",
    logoutTitle: "Log out of this device?",
    logoutBody:
      "Your data and your funds stay in your account: your passkey logs you back in. Only the choices made on this device go back to their defaults: the navigation bar, “$t(wallet.discreet)” in the $t(navigation.destinations.wallet), “$t(settings.amountUnit.title)”, “$t(settings.theme.title)”, “$t(pos.mode.amount)” or “$t(pos.mode.articles)” in the $t(pos.title) and biometrics to unlock the app.",
    logoutBodyWeb:
      "Your data and your funds stay in your account: your passkey logs you back in. Only the choices made on this device go back to their defaults: the navigation bar, “$t(wallet.discreet)” in the $t(navigation.destinations.wallet), “$t(settings.amountUnit.title)”, “$t(settings.theme.title)” and “$t(pos.mode.amount)” or “$t(pos.mode.articles)” in the $t(pos.title).",
    logoutBodyCard:
      "Your data and your funds stay in your account: your passkey logs you back in. Only the choices “$t(settings.amountUnit.title)” and “$t(settings.theme.title)” made on this device go back to their defaults.",
    logoutConfirm: "Log out",
    support: {
      group: "Help",
      section: "Support",
      description:
        "A question, a problem: write to us. The app's log helps us understand what happened.",
      contact: "Contact support",
      attach: "Attach the app's log",
      attachCaption: "Technical events, no amounts or addresses",
      reports: "Send crash reports",
      reportsKinds: "Crashes and slowdowns",
      reportsCaption: "No amounts or payment addresses",
      reportsSaveFailed: "This choice could not be saved on this device. Try again.",
      subject: "sattle.me support",
      body: "Hello,\n\nYour question or problem:\n\n\n",
      downloaded:
        "The app's log has just been downloaded ({{file}}): please attach it to this message.",
      attachDownloaded: "Attach the downloaded log ({{file}})",
      notAttached: "Log not attached to the mail",
      deposited: "The app's log is sent encrypted to support, with the reference below.",
      notDeposited: "Log not sent",
      noMailTitle: "No Mail app on this device",
      addressCopied: "Support address copied: {{email}}",
      writeTo: "Write to us at {{email}}",
      shareTitle: "App log",
      shareFailed: "Log not shared",
      failedTitle: "Mail not opened"
    },
    delete: {
      section: "Delete account",
      description:
        "Erases the account from the Nostr relays and from this device, and gives up its Lightning address. The wallet must be empty.",
      button: "Delete account",
      employeesTitle_one: "You have {{count}} employee",
      employeesTitle_other: "You have {{count}} employees",
      employeesBody_one:
        "They will be removed from the business: their device will no longer take payments for it and will forget it the next time it connects.",
      employeesBody_other:
        "They will be removed from the business: their devices will no longer take payments for it and will forget it the next time they connect.",
      integrationsTitle_one: "You have {{count}} integration",
      integrationsTitle_other: "You have {{count}} integrations",
      integrationsBody_one:
        "It will be removed: its server will no longer be able to create invoices for the business.",
      integrationsBody_other:
        "They will be removed: their servers will no longer be able to create invoices for the business.",
      assistantsTitle_one: "You have {{count}} AI assistant",
      assistantsTitle_other: "You have {{count}} AI assistants",
      assistantsBody_one:
        "It will be removed: it will no longer be able to make invoices for the business.",
      assistantsBody_other:
        "They will be removed: they will no longer be able to make invoices for the business.",
      removeAndContinue: "Remove and continue",
      confirmTitle: "Delete the account?",
      confirmBody:
        "The settings, the team, the articles and the recorded sales are erased from the Nostr relays and from this device, and the Lightning address is given up. This cannot be undone. The wallet, empty, stays accessible with your passkey.",
      confirm: "Delete for good",
      progressTitle: "Deleting the account",
      progressHint: "Keep the app open until it is done.",
      steps: {
        wallet: "Checking the wallet",
        team: "Removing the team",
        reading: "Looking for data on the relays ({{done}}/{{total}})",
        deleting: "Erasing on the relays ({{done}}/{{total}})",
        checking: "Checking the erasure ({{done}}/{{total}})",
        device: "Erasing this device"
      },
      deleted: "Your account has been deleted",
      deletedElsewhere:
        "The account of {{business}} was deleted from another device: this device forgot it.",
      alreadyRemoved: "The Lightning address and the team are already removed.",
      card: {
        description:
          "Erases the account from the Nostr relays and from this device, and gives up your cards' Lightning addresses. The cards must be empty.",
        confirmBody:
          "The settings, the cards and their recorded payments are erased from the Nostr relays and from this device, and the cards' Lightning addresses are given up. This is permanent.",
        stepCards: "Checking the cards",
        alreadyRemoved: "The cards' Lightning addresses are already given up.",
        cardWallets:
          "The wallet of one of your cards, or of a deleted card, is not empty, or sats are still arriving. Send its balance elsewhere from “Cards”, then try again.",
        walletFailed:
          "A card's wallet could not be checked. Check your internet connection, then try again.",
        begun:
          "The deletion is not finished: the cards' Lightning addresses are already given up, nothing is erased on this device. Check your internet connection, then try again."
      },
      failedTitle: "Account not deleted",
      errors: {
        balance: "The wallet still holds {{sats}} sats. Send them elsewhere, then try again.",
        pendingPayments: "A payment of the wallet is in progress. Try again once it is done.",
        unclaimedDeposits:
          "An on-chain deposit is not credited to the wallet yet. Try again once it is.",
        cardWallets:
          "The wallet of one of your cards, or of a deleted card, is not empty, or sats are still on their way to it. Withdraw its balance to your main balance in “Cards”, then try again.",
        newerApp:
          "A newer version of the app recorded a card of this account. Update the app, then try again.",
        salesInProgress:
          "Some invoices of the business are not final yet. Try again once their final version is published (up to 3 h after the end of an unpaid invoice).",
        walletFailed:
          "The wallet could not be checked. Check your internet connection, then try again.",
        unreachable:
          "The Nostr relays did not answer. Check your internet connection, then try again.",
        notDeleted:
          "The Nostr relays did not confirm the erasure. Nothing is erased on this device: try again.",
        begun:
          "The deletion is not finished: the Lightning address and the team are already removed, nothing is erased on this device. Check your internet connection, then try again.",
        unfinished:
          "The deletion has begun but is not finished: the account's other devices may have forgotten it already. Check your internet connection, then try again to finish it.",
        deviceNotWiped:
          "The account is erased from the relays, but not everything the app kept on this device."
      }
    },
    yourProfile: "Your profile",
    nameLocked: "Name set by your employer",
    addPhoto: "Add a photo",
    changePhoto: "Change the photo",
    removePhoto: "Remove",
    relaysLocked: "Set by your employer",
    leave: "Leave the business",
    leaveTitle: "Leave {{business}}?",
    leaveBody:
      "This device will no longer take payments for this business. To come back, a new invitation will be needed.",
    back: "Back",
    splitSavedTitle: "Split saved",
    splitSavedBank: "IBAN checked · {{percent}} in {{currency}}",
    splitSavedBitcoin: "All in bitcoin",
    relaysSavedTitle: "Relays saved",
    relaysSavedBody: "The business's devices follow them from their next connection.",
    nameSavedTitle: "Name saved",
    currencySavedTitle: "Reference currency saved",
    onchainSavedTitle: "On-chain payments saved",
    onchainSavedOn: "Accepted at the point of sale, on top of Lightning",
    onchainSavedOff: "Lightning only at the point of sale",
    vatRate: "Default VAT",
    vatRateDescription: "The VAT rate of new invoice lines, which can be changed line by line.",
    vatRateField: "VAT rate (%)",
    vatRateHint: "Leave empty for the standard rate: {{rate}}",
    vatStandard: "{{rate}} (standard rate)",
    vatSavedTitle: "Default VAT saved",
    vatInvalid: "Enter a rate between 0 and 100%",
    tolerance: "Underpayment tolerance",
    toleranceDescription:
      "An on-chain payment missing at most this share of the amount counts as paid. If more is missing, the customer must pay the whole rest. Applied to your sales, invoices and payment links, including those of your employees, integrations and AI assistants. Never shown to your customers.",
    toleranceField: "Tolerance (%)",
    toleranceHint: "From 0 to 10%, to the tenth. Empty or 0: none.",
    toleranceNone: "None",
    toleranceSavedTitle: "Tolerance saved",
    toleranceSaved: "{{rate}} for the next sales and invoices",
    toleranceSavedNone: "None: the whole amount is asked",
    toleranceInvalid: "Enter a percentage between 0 and 10, to the tenth",
    logoSavedTitle: "Logo saved",
    address: {
      title: "Business address",
      description: "Written under the business name on your invoices.",
      street: "Street and number",
      postalCode: "Postcode",
      city: "City",
      country: "Country",
      savedTitle: "Address saved"
    },
    numbers: {
      title: "Business numbers",
      description:
        "Written on your invoices, under the business address. Their names follow the business's country.",
      savedTitle: "Number saved"
    },
    photoSavedTitle: "Photo saved",
    photoRemovedTitle: "Photo removed",
    saveFailedTitle: "Error while saving",
    failedTitle: "Setting not saved",
    errors: {
      unpublished:
        "Too few relays confirmed the change, so it was cancelled. Check the connection, then try again.",
      newerBackup:
        "A newer version of the app backed up this account, so the change was cancelled. Update the app, then try again.",
      noAccount: "Unlock the app with your passkey, then try again.",
      invalid: "Check the value entered, then try again.",
      unreachable: "Too few relays answered. Check the connection, then try again.",
      saveFailed: "The setting could not be saved on this device. Try again.",
      denied: "Allow access to your photos in the device settings, then try again.",
      unreadable: "This image cannot be used. Choose another one.",
      logoutFailed: "Logging out did not finish. Try again.",
      leaveFailed: "This device could not leave the business. Try again.",
      leaveUnreachable:
        "The business could not be told that you are leaving. Check your internet connection, then try again.",
      salesInProgress:
        "Some of the business's invoices are not final yet. Try again once their final version is published (up to 3 hours after the end of an unpaid invoice).",
      integrationsPending:
        "An integration has a payment in progress (an open payment request or a Bitcoin payment being confirmed). Try again once it is over."
    },
    splitLead: "The app will offer to sell this share of what you receive.",
    ibanRefused: "Check the IBAN's digits"
  },
  relays: {
    title: "Nostr relays",
    lead: "Nostr servers the app connects to, on every device of the business.",
    integrationsNotice:
      "This account's integrations follow at most {{moves}} changes of relays since they were created. Beyond that, their server can no longer find them: create them again and give the new keys to their integrators.",
    add: "Add a relay",
    addLead: "Enter the relay's address.",
    address: "Relay address",
    placeholder: "relay.example.com",
    addConfirm: "Add the relay",
    addShort: "Add",
    removeLabel: "Remove {{relay}}",
    keepOne: "Keep at least one relay.",
    tooMany: "Ten relays at most: remove one to add another.",
    removeUnreachable: "Remove the red relay to save.",
    restrictedRelay:
      "“Reading refused”: this relay lets only whoever wrote the data read it. Your tills, employees and customers could not read it: choose another one.",
    localNetworkBlocked:
      "The browser blocks this site's access to the local network: allow “Local network” in the site settings (icon left of the address), then test again.",
    localNetworkNotAllowed:
      "Local network access is not allowed for this site yet: test again, then allow it when the browser asks. If it asks nothing, this device cannot reach the relay: check that it is on the same network or on Tailscale.",
    test: "Test the connection",
    status: {
      reachable: "Connected",
      untested: "Not tested",
      testing: "Testing",
      unreachable: "Unreachable",
      restricted: "Reading refused"
    },
    statusLabel: "{{relay}}, {{status}}",
    statusDetail: "{{status}} · {{detail}}",
    noAnswer: "no answer in {{duration}}",
    milliseconds: "{{value}}\u00a0ms",
    seconds: "{{value}}\u00a0s",
    errors: {
      incomplete: "Enter a complete address",
      duplicate: "Enter a relay not in the list",
      local: "Enter a public relay's address: localhost is this device"
    },
    advanced: "Advanced settings",
    advancedLead:
      "Nostr relays where this device looks for your account and creates new ones. Once logged in, your account's relays are used.",
    // "Sign-up" of "Advanced settings".
    countryDetection: {
      section: "Sign-up",
      title: "Detect my country with country.is",
      caption:
        "Only when the time zone is not enough. country.is then receives this device's IP address. Off: the country comes from the device's settings.",
      saveFailed: "This choice could not be saved on this device. Try again."
    }
  },
  pending: {
    title: "Coming soon",
    description: "This screen has not been designed yet."
  },
  merchantSettings: {
    businessNameWord: "Merchant",
    saveFailed: "Your settings could not be saved on this device. Try again."
  },
  /** "New invoice". */
  invoices: {
    newInvoice: "New invoice",
    // "Wallet"'s button on a phone, beside "Sell" in half the width: one word, its "+" icon tells
    // "new".
    newInvoiceShort: "Invoice",
    // "Wallet"'s warning about an assistant (assistant-alerts.ts): "Remove the assistant" or "This
    // is expected" only.
    assistantAlert: {
      jumpTitle: "{{name}} skipped invoice numbers",
      jumpBody:
        "Its invoices stop at no. {{from}}, but its counter says no. {{to}}: the numbers in between were taken without an invoice. Unless you can explain it, remove this assistant.",
      jumpBodyNone:
        "It made no invoice in {{year}}, but its counter says no. {{to}}: these numbers were taken without an invoice. Unless you can explain it, remove this assistant.",
      blockedTitle: "{{name}} is blocking invoice numbers",
      blockedBody:
        "Its number counter is in a format this version of the app cannot read: no invoice can get a number. Update the app; if it is already up to date, remove this assistant.",
      burstTitle: "{{name}} made a lot of invoices",
      burstBody:
        "{{invoices}} invoices in 24 hours. If you did not ask for them, remove this assistant: its invoices stay in your wallet.",
      remove: "Remove the assistant",
      normal: "This is expected",
      removeFailedTitle: "Assistant not removed",
      removeFailed:
        "{{name}} could not be removed. Check your internet connection, then try again from the list of integrations"
    },
    title: "New invoice",
    back: "Back",
    saveDraft: "Save as draft",
    draftSaved: "Invoice saved as a draft",
    draftSavedBody: "Find it under “To follow up”",
    linkNote: "Invoice {{number}}",
    recipient: {
      title: "Who is the invoice for?",
      assistant: "Make your invoices with an AI",
      name: "Company name",
      street: "Street and number",
      postalCode: "Postcode",
      city: "City",
      country: "Country"
    },
    preview: {
      title: "PDF preview",
      invoice: "Invoice",
      date: "Date",
      due: "Due date"
    },
    lines: {
      title: "What are you invoicing?",
      empty: "No items on this invoice",
      emptyLead: "Add what you sell: an item from your catalogue or a line typed by hand.",
      add: "Add an item",
      name: "Description",
      quantity: "Quantity",
      quantityShort: "Qty",
      unitPrice: "Unit price",
      unitPriceShort: "Unit price",
      vatRate: "VAT rate",
      vat: "VAT",
      amount: "Amount",
      remove: "Remove",
      removeLine: "Remove the line",
      expand: "Edit the line",
      summary: "{{quantity}} · VAT {{rate}}",
      net: "Subtotal excl. VAT",
      vatOn: "VAT {{rate}} on {{base}}",
      total: "Total",
      quantityInvalid: "Enter a quantity",
      priceInvalid: "Enter a price",
      vatInvalid: "Enter a rate between 0 and 100%",
      tooLarge: "The total exceeds the largest amount of an invoice",
      incomplete: "To complete",
      save: "Save to my items",
      saved: "Saved to my items"
    },
    picker: {
      title: "Add an item",
      close: "Close",
      manual: "Enter an item",
      manualDescription: "Free description, quantity and price",
      catalog: "My items",
      loading: "Reading your items…",
      failed: "Your items could not be read. Check your internet connection, then try again.",
      retry: "Try again",
      empty: "No items yet. Add some in “Items”.",
      convertFailed: "The price could not be converted. Try again in a moment"
    },
    sameName: {
      title: "An item already has this name",
      close: "Close",
      lead: "Update it with this line's price, or create a second item with the same name.",
      otherCurrency:
        "This item is sold in {{currency}}: its price cannot take an amount in {{invoice}}. Create a second item with the same name.",
      newPrice: "Line price: {{price}}",
      update: "Update the item",
      duplicate: "Create a duplicate"
    },
    due: {
      title: "Payable until <accent>{{date}}</accent>",
      lead: "The payment link stays open until the due date.",
      label: "Due date",
      previousMonth: "Previous month",
      nextMonth: "Next month",
      close: "Close"
    },
    terms: {
      title: "Finally, the administrative notes",
      conditions: "Payment terms",
      legal: "Legal notices",
      addRedirect: "Add a redirect URL",
      redirect: "Redirect URL",
      redirectInvalid: "Enter an address starting with https://",
      redirectHint:
        "Once the invoice is paid, your customer can return to your website (thank-you page, order tracking…) in a single click."
    },
    review: {
      title: "Check the invoice",
      client: "Client",
      articles: "Items",
      due: "Due date",
      notices: "Administrative notes",
      noNotices: "No notes",
      editRecipient: "Edit the recipient",
      editLines: "Edit the items",
      editDue: "Edit the due date",
      editNotices: "Edit the administrative notes",
      create: "Create the invoice"
    },
    sent: {
      title: "Invoice {{number}} created",
      lead: "Send it to your client. The payment link stays open until {{date}}.",
      mail: "Send by email",
      copy: "Copy the link",
      copied: "Link copied",
      share: "Share",
      pdf: "Download the PDF",
      newInvoice: "New invoice",
      view: "View the invoice",
      close: "Close"
    },
    mail: {
      subject: "Invoice {{number}} · {{business}}",
      body: "Hello,\n\nPlease find below invoice {{number}} from {{business}}, for {{amount}}, payable until {{date}}.\n\nTo pay it in bitcoin: {{url}}\n\nKind regards\n{{business}}"
    },
    pdf: {
      invoice: "Invoice",
      date: "Date",
      due: "Due date",
      reference: "Your reference",
      billedTo: "Billed to",
      pay: "Pay in bitcoin",
      payHint: "Scan the QR code, or open the link.",
      title: "Invoice {{number}}"
    },
    detail: {
      totalDue: "Total due",
      paid: "Amount paid",
      due: "Due date",
      paidOn: "Paid on",
      rest: "Left to pay",
      createdBy: "Created by you",
      recipient: "Recipient",
      conditions: "Terms and notices",
      followUp: "Timeline",
      created: "Created",
      sent: "Sent",
      paidEvent: "Paid",
      more: "More actions",
      remind: "Send a reminder by email",
      copyLink: "Copy the payment link",
      duplicate: "Duplicate",
      pdf: "Download the PDF",
      cancel: "Cancel the invoice",
      title: "Invoice {{number}}",
      breadcrumb: "invoice {{number}}",
      notFound: "This invoice cannot be found. It may have been deleted on another device.",
      reading: "Loading the invoice…",
      readFailed: "The invoice could not be read. Check your internet connection, then try again.",
      cancelDialog: {
        title: "Cancel invoice {{number}}?",
        body: "The payment link will no longer offer to pay. A payment already received stays in your wallet.",
        confirm: "Cancel the invoice",
        keep: "Keep the invoice"
      },
      canceled: "Invoice canceled",
      cancelReceived: "This invoice has already received a payment: it can no longer be canceled",
      cancelFailed:
        "The invoice could not be canceled. Check your internet connection, then try again"
    },
    draftDetail: {
      edit: "Edit the draft",
      remove: "Delete the draft",
      removed: "Draft deleted",
      removeDialog: {
        title: "Delete draft {{number}}?",
        body: "It disappears from all your devices. Its number is not reused.",
        confirm: "Delete the draft",
        keep: "Keep the draft"
      }
    },
    errors: {
      noAccount: "Unlock the app, then try again",
      invalid: "Complete the invoice, then try again",
      number:
        "The invoice number could not be assigned. Check your internet connection, then try again",
      noWebApp: "Payment links are not available yet in this version of the app",
      noAddress:
        "Above {{max}} sats (the Lightning ceiling less a {{margin}} margin), an invoice needs an on-chain address, and no Bitcoin address is ready. Try again in a moment",
      unverified:
        "The invoice's Lightning ceiling could not be checked. Check your internet connection, then try again",
      unreachable: "The invoice could not be saved. Check your internet connection, then try again",
      mailFailed: "No mail app could be opened. Copy the payment link instead",
      pdfFailed: "The PDF could not be created. Try again",
      copyFailed: "The link could not be copied"
    }
  },
  documentLanguage: {
    title: {
      mail: "Email language",
      pdf: "PDF language",
      export: "Export language"
    },
    change: {
      mail: "Email language: {{language}}. Change",
      pdf: "PDF language: {{language}}. Change",
      export: "Export language: {{language}}. Change"
    },
    yours: "Your language"
  },
  currencies: {
    AUD: "Australian dollars",
    CAD: "Canadian dollars",
    CHF: "Swiss francs",
    CZK: "Czech korunas",
    DKK: "Danish kroner",
    EUR: "euros",
    GBP: "pounds sterling",
    HKD: "Hong Kong dollars",
    HUF: "Hungarian forints",
    JPY: "Japanese yen",
    MXN: "Mexican pesos",
    NOK: "Norwegian kroner",
    NZD: "New Zealand dollars",
    PLN: "Polish zlotys",
    SEK: "Swedish kronor",
    SGD: "Singapore dollars",
    USD: "US dollars",
    ZAR: "South African rand"
  },
  currencyNames: {
    AUD: "Australian dollars",
    CAD: "Canadian dollars",
    CHF: "Swiss francs",
    CZK: "Czech korunas",
    DKK: "Danish kroner",
    EUR: "Euros",
    GBP: "Pounds sterling",
    HKD: "Hong Kong dollars",
    HUF: "Hungarian forints",
    JPY: "Japanese yen",
    MXN: "Mexican pesos",
    NOK: "Norwegian kroner",
    NZD: "New Zealand dollars",
    PLN: "Polish zlotys",
    SEK: "Swedish kronor",
    SGD: "Singapore dollars",
    USD: "US dollars",
    ZAR: "South African rand"
  },
  businessNumbers: {
    company: {
      CH: "UID number",
      FR: "SIRET number",
      DE: "Tax number (Steuernummer)",
      IT: "Tax code (codice fiscale)",
      ES: "NIF",
      PT: "NIF",
      FI: "Business ID (Y-tunnus)",
      other: "Company number"
    },
    vat: {
      CH: "VAT number",
      EU: "VAT identification number",
      other: "VAT number"
    }
  },
  whatsNew: {
    title: "What's new",
    open: "What's new, {{build}}",
    openUnread: "What's new, unread, {{build}}",
    next: "Next version",
    new: "New",
    source: "Source code",
    close: "Close",
    empty: "What's new in each version will show here."
  }
};

export default en;
