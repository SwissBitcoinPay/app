import type { Translations } from "./fr";

const fi: Translations = {
  common: {
    back: "Takaisin",
    continue: "Jatka",
    cancel: "Peruuta",
    startCharging: "Aloita maksujen vastaanotto",
    version: "Versio {{version}}"
  },
  welcome: {
    headline: "Maksut <accent>bitcoinilla</accent>.",
    lead: "Kassajärjestelmä, laskut ja NFC-kortit.",
    guarantees: {
      nonCustodial: "Ei säilytyspalvelua",
      noKyc: "Ilman KYC-tunnistautumista",
      oneMinute: "Minuutissa"
    },
    createAccount: "Luo tili",
    login: "Kirjaudu",
    joinInvitation: "Liity kutsulla",
    alreadyHave: "Minulla on jo",
    have: {
      account: "sattle.me-tili",
      invitation: "Kutsu",
      boltCard: "BoltCard"
    },
    manageBoltCard: "Hallitse BoltCardiani",
    boltCardApp: {
      computer:
        "Tietokone ei voi lukea NFC-kortteja. Lataa sattle.me-sovellus puhelimeesi: luot siellä tilisi ja tuot sitten kortin puhelimen lähelle ohjelmoidaksesi sen.",
      device:
        "Tämä laite ei voi lukea NFC-kortteja. Lataa sattle.me-sovellus puhelimeesi: luot siellä tilisi ja tuot sitten kortin puhelimen lähelle ohjelmoidaksesi sen.",
      browser:
        "Selain ei voi ohjelmoida korttia. Avaa tai asenna sattle.me-sovellus tällä puhelimella: luot siellä tilisi ja tuot sitten kortin puhelimen lähelle ohjelmoidaksesi sen.",
      iphone: "iPhone",
      android: "Android",
      codeIphone: "sattle.me-sovelluksen QR-koodi App Storessa",
      codeAndroid: "sattle.me-sovelluksen QR-koodi Google Playssa",
      scan: "Skannaa puhelimesi koodi sen kameralla."
    },
    terms: "Jatkamalla hyväksyt <link>käyttöehdot</link>."
  },
  legal: {
    terms: "Käyttöehdot",
    privacy: "Tietosuojaseloste"
  },
  account: {
    passkeyWarning:
      "Pääsyavaimesi on lompakkosi avain: sen poistaminen voi tehdä varoistasi saavuttamattomia.",
    progress: {
      creating: "Luodaan pääsyavainta…",
      signingIn: "Kirjaudutaan pääsyavaimella…",
      preparing: "Valmistellaan tiliäsi…",
      restoring: "Haetaan asetuksiasi…",
      terminal: "Valmistellaan kassaasi…"
    },
    cancelled: {
      title: "Pääsyavain peruttiin",
      body: "Yritä uudelleen napauttamalla painiketta."
    },
    errors: {
      recoveryOverdue: "Maksusi on estetty: tarkista ensin 12 palautussanaasi.",
      rescueClosed: "Pelastustila sulkeutui: mitään ei lähetetty. Avaa se uudelleen 12 sanallasi.",
      unsupported:
        "Tällä laitteella tai selaimella ei voi käyttää sattle.me-pääsyavainta. Käytä uutta selainta tai sovellusta iPhonella, iPadilla tai Androidilla.",
      prfUnsupported:
        "Pääsyavainten hallintasovelluksesi ei ole yhteensopiva: käytä Applen Salasanat-appia tai Googlen salasanojen ylläpitoa.",
      notAssociated:
        "Pääsyavaimet eivät ole vielä käytössä tässä sovelluksen versiossa. Yritä myöhemmin uudelleen.",
      notConfigured: "Tätä sovelluksen versiota ei ole määritetty avaamaan lompakkoa.",
      cancelled: "Pääsyavain peruttiin. Yritä uudelleen napauttamalla painiketta.",
      timedOut:
        "Aikakatkaisu. Yritä uudelleen ja vahvista kasvoillasi, sormenjäljelläsi tai laitteen pääsykoodilla.",
      noCredential:
        "Tällä laitteella ei tarjottu sattle.me-pääsyavainta. Tarkista, että pääsyavaimesi on synkronoitu tähän laitteeseen.",
      noCredentialAndroid:
        "Tällä laitteella ei tarjottu sattle.me-pääsyavainta. Tarkista, ettei virransäästö rajoita salasanojen hallintasovellustasi.",
      alreadyExists: "Tällä laitteella on jo pääsyavain: käytä kohtaa ”$t(welcome.login)”.",
      createdNotDerived:
        "Pääsyavaimesi luotiin, mutta lompakkoa ei voitu avata. Viimeistele napauttamalla ”$t(welcome.createAccount)” tällä pääsyavaimella.",
      connectFailed: "Lompakkoa ei voitu avata. Tarkista internetyhteytesi ja yritä uudelleen.",
      settingsTooNew:
        "Asetuksesi on tallennettu sovelluksen uudemmalla versiolla. Päivitä sovellus ja yritä uudelleen.",
      notFound: "Tällä pääsyavaimella ei löytynyt tiliä tämän laitteen Nostr-releistä.",
      terminalFailed: "Kassaasi ei voitu valmistella. Tarkista internetyhteys ja yritä uudelleen.",
      deviceFailed: "Tiliäsi ei voitu valmistella tälle laitteelle. Yritä uudelleen.",
      failed: "Tapahtui virhe. Yritä uudelleen."
    }
  },
  noAccount: {
    title: "Tiliä ei löytynyt",
    unreachableTitle: "Releet eivät vastaa",
    answered: {
      all: "Tähän pääsyavaimeen ei ole liitetty tiliä alla olevissa Nostr-releissä.",
      some: "Tähän pääsyavaimeen ei ole liitetty tiliä niissä alla olevissa Nostr-releissä, jotka vastasivat. Osa ei vastannut: ”$t(relays.test)” näyttää, mitkä.",
      none: "Mikään alla olevista Nostr-releistä ei vastannut: ei voida tietää, onko tähän pääsyavaimeen liitetty tiliä. Tarkista internetyhteytesi."
    },
    lead: "Valitsitko tilillesi omat releet? Lisää ne, tallenna ja napauta sitten ”$t(welcome.login)”. Jos sinulla on useita pääsyavaimia, tarkista myös, että valitsit oikean."
  },
  // "Stay informed": the phone's notifications asked once, after the setup.
  notificationsOffer: {
    title: "Pysy ajan tasalla",
    lead: "Salli ilmoitukset: sattle.me kertoo sinulle tärkeistä asioista, myös kun sovellus on suljettu.",
    words: "12 sanaasi",
    wordsBody: "Vuosittainen muistutus tarkistaa ne turvallisuutesi vuoksi.",
    cards: "Korttisi",
    cardsBody: "Korttimaksut, jotka odottavat hyväksyntääsi.",
    note: "Ei koskaan mainoksia. Voit muuttaa mielesi puhelimen asetuksissa.",
    allow: "Salli ilmoitukset",
    later: "Ei nyt"
  },
  recoveryCheck: {
    reminders: {
      channel: "Palautuslause",
      startTitle: "Aika tarkistaa 12 sanaasi",
      startBody:
        "Vuosi on kulunut: kirjoita ne uudelleen sattle.me-sovellukseen varmistaaksesi, että paperisi on yhä oikein.",
      weekTitle: "Maksusi estetään 7 päivän kuluttua",
      eveTitle: "Maksusi estetään huomenna",
      soonBody: "Tarkista 12 sanaasi sattle.me-sovelluksessa, jotta voit jatkaa maksamista.",
      dayTitle: "Maksusi on estetty",
      dayBody: "Tarkista 12 sanaasi sattle.me-sovelluksessa, jotta voit taas maksaa."
    },
    banner: {
      due: "Vara-avaintasi ei ole tarkistettu",
      daysLeft: "P−{{count}}",
      daysLeftLabel_one: "{{count}} päivä jäljellä",
      daysLeftLabel_other: "{{count}} päivää jäljellä",
      overdue: "Maksut estetty: tarkista 12 sanaasi",
      action: "Tarkista 12 sanaani"
    },
    title: "Tarkista 12 sanaasi",
    intro: {
      title: "Kolme tilannetta, joissa vain 12 sanaasi auttavat",
      lost: "Puhelin kadonnut tai varastettu",
      passkey: "Pääsyavain poistettu",
      gone: "sattle.me ei ole enää olemassa",
      lead: "Jokaisessa niistä 12 sanaasi avaavat tilisi ja korttisi uudelleen. Ilman niitä varat menetetään.",
      key: "Pääsyavain on jokapäiväinen avaimesi. 12 sanaa ovat vara-avain, kotona tallessa: kirjoita ne uudelleen paperiltasi.",
      due_one: "{{count}} päivä aikaa tehdä se.",
      due_other: "{{count}} päivää aikaa tehdä se.",
      overdue: "Maksusi on estetty, kunnes tämä tarkistus on tehty.",
      optional: "Mitään ei ole nyt erääntynyt: tämä tarkistus on hyvä käytäntö eikä estä mitään.",
      start: "Aloita"
    },
    word: {
      progress: "Sana {{index}}/12",
      label: "Mikä on sana {{index}}?",
      hint: "Listan sanat, jotka alkavat näin: mikään ei kerro, mikä on oikea.",
      unknown: "Tämä sana ei ole listalla: tarkista sen kirjoitusasu",
      next: "Seuraava sana",
      previous: "Edellinen sana",
      check: "Tarkista"
    },
    lost: "Minulla ei ole niitä enää",
    checking: "Tarkistetaan…",
    done: {
      title: "12 sanaasi on tarkistettu",
      lead: "Säilytä paperisi turvallisessa paikassa. Seuraava tarkistus on vuoden kuluttua, jos tililläsi on silloin yhä yli 1000 CHF.",
      finish: "Valmis"
    },
    wrong: {
      title: "Nämä sanat eivät täsmää",
      lead: "Vähintään yksi sana on väärin tai kaksi on vaihtanut paikkaa. Ota paperisi uudelleen ja aloita alusta, tai näytä 12 sanaasi.",
      again: "Aloita alusta"
    },
    saveFailed:
      "Sanasi ovat oikein, mutta tarkistusta ei voitu tallentaa. Tarkista internetyhteytesi ja yritä sitten uudelleen.",
    retry: "Yritä uudelleen"
  },
  rescue: {
    section: "Palautus",
    entry: "Avaa 12 sanallani",
    entryLead:
      "Jos pääsyavaimesi ei enää toimi, 12 palautussanaasi avaavat tilisi, jotta voit lähettää sen varat muualle.",
    words: {
      title: "Avaa 12 sanallasi",
      lead: "Kirjoita tilisi palautuslause oikeassa järjestyksessä.",
      only: "Kirjoita nämä sanat vain sattle.me-sovellukseen. Kukaan ei kysy niitä sinulta sähköpostitse, viestillä eikä puhelimitse.",
      label: "12 sanaasi",
      count_one: "{{count}} sana 12:sta",
      count_other: "{{count}} sanaa 12:sta",
      unknown: "Sana {{position}} ei ole listalla: tarkista sen kirjoitusasu",
      checksum:
        "Nämä 12 sanaa eivät muodosta kelvollista lausetta: tarkista jokainen sana ja niiden järjestys",
      valid: "Lause on täydellinen ja kelvollinen",
      submit: "Avaa tilini",
      opening: "Tiliäsi avataan…",
      note: "Sanojasi ei tallenneta eikä lähetetä: ne unohdetaan heti, kun suljet tämän näkymän.",
      failed: "Tiliäsi ei voitu avata. Tarkista internetyhteytesi ja yritä sitten uudelleen."
    },
    badge: "Pelastustila",
    funds: {
      title: "Varasi",
      lead: "Tili avattu 12 sanallasi. Lähetä varasi toiseen lompakkoon ja sulje sitten.",
      leadWalletOnly:
        "Mikään tämän laitteen rele ei tunne tiliäsi: vain lompakkosi avautuu. Löytääksesi korttisi sulje ja vaihda sitten releet kohdassa ”$t(relays.advanced)”.",
      wallet: "Lompakko",
      card: "Kortti ”{{name}}”",
      cardUnnamed: "Nimetön kortti",
      former: "Kortin ”{{name}}” aiempi lompakko",
      formerUnnamed: "Kortin aiempi lompakko",
      reading: "Luetaan…",
      unread: "Ei vielä luettu",
      empty: "Tyhjä",
      arriving: "{{amount}} matkalla",
      send: "Tyhjennä",
      retry: "$t(wallet.retry)",
      cardsUnread:
        "Korttejasi ei voitu lukea useimmista releistäsi: osa saattaa puuttua. Yritä myöhemmin uudelleen.",
      cardsFailed:
        "Korttejasi ei voitu lukea. Tarkista internetyhteytesi ja yritä sitten uudelleen.",
      export: "Vie historia",
      close: "Sulje",
      closeNote:
        "Sulkeminen unohtaa 12 sanaasi tällä laitteella. Varasi pysyvät siellä, missä ne ovat."
    },
    drain: {
      title: "Tyhjennä lompakko",
      intro:
        "Lompakon koko saldo lähtee lightning-, bitcoin- tai Spark-osoitteeseen: kirjoita, liitä tai skannaa se. Maksut otetaan tästä saldosta.",
      introNoScan:
        "Lompakon koko saldo lähtee lightning-, bitcoin- tai Spark-osoitteeseen: kirjoita tai liitä se. Maksut otetaan tästä saldosta.",
      total: "Lompakon saldo",
      feesAbove: "Maksut ylittävät lompakon saldon tällä nopeudella",
      empty: "Tässä lompakossa ei ole mitään lähetettävää.",
      confirm: "Lähetä kaikki",
      done: "{{amount}} lähetetty: lompakko on tyhjä.",
      pending: "{{amount}} on lähtenyt: se saapuu, kun maksu on valmis.",
      failed: "Maksu ei onnistunut. Tarkista lompakon saldo ja yritä sitten uudelleen."
    },
    closed: "Pelastustila sulkeutui: avaa se uudelleen 12 sanallasi.",
    idle: {
      title: "Sulkeutuu {{seconds}} s kuluttua",
      body: "Ilman toimintaa pelastustila sulkeutuu ja unohtaa 12 sanaasi.",
      closed:
        "Pelastustila sulkeutui 5 minuutin toimettomuuden jälkeen: kirjoita 12 sanaasi uudelleen avataksesi sen."
    }
  },
  migration: {
    amount: "{{btc}} (noin {{fiat}})",
    entry: "Siirrä Swiss\u00a0Bitcoin\u00a0Pay -tilini",
    // Before the brand's wordmark (MigrateAccountEntry); `entry` is what screen readers say.
    entryLead: "Tuo tili",
    home: {
      badge: "Swiss\u00a0Bitcoin\u00a0Pay on nyt sattle.me",
      title: "Hei, {{business}}",
      titleUnnamed: "Hei",
      titleManual: "Siirrä Swiss\u00a0Bitcoin\u00a0Pay -tilisi",
      leadFound: "Löysimme tilisi. Kaikki siirtyy sattle.me-palveluun:",
      leadPassword:
        "Löysimme tilisi. Jotta maksusi siirtyvät, anna Swiss\u00a0Bitcoin\u00a0Pay -salasanasi vielä kerran:",
      leadManual:
        "Kirjaudu Swiss\u00a0Bitcoin\u00a0Pay -tilillesi vielä kerran: yrityksesi ja maksusi siirtyvät sattle.me-palveluun, jossa ei ole salasanaa.",
      payoutsReading: "Luetaan…",
      payoutsAfterPassword: "Salasanasi jälkeen",
      read: "Luettu Swiss\u00a0Bitcoin\u00a0Pay -tililtäsi",
      money: "Rahasi seuraavat mukana: ne siirretään uudelle tilillesi.",
      retry: "Yritä uudelleen",
      migrate: "Siirrä"
    },
    login: {
      email: "Sähköposti",
      password: "Salasana",
      checking: "Kirjaudutaan vanhalle tilillesi…",
      forgotten: "Unohditko salasanan?",
      changed: "Valitsin jo uuden salasanan",
      note: "Salasanaasi käytetään vain kerran, eikä sitä tallenneta.",
      errors: {
        refused: "Väärä sähköposti tai salasana",
        unreachable: "Vanha tilisi ei vastaa. Tarkista yhteys ja yritä uudelleen.",
        stopped:
          "Jotta vanhaa tiliäsi ei lukittaisi, emme enää yritä tällä salasanalla. Valitse uusi: lähetämme sinulle linkin sähköpostitse.",
        secondFactor:
          "Vanha tilisi pyytää vahvistuskoodia, jota sattle.me ei voi käyttää. Kirjoita meille osoitteeseen {{email}}: autamme päivittämään tilisi."
      }
    },
    forgot: {
      title: "Unohtunut salasana",
      lead: "Anna vanhan Swiss\u00a0Bitcoin\u00a0Pay -tilisi sähköposti: lähetämme linkin uuden salasanan valitsemiseen.",
      send: "Lähetä linkki",
      sending: "Lähetetään…",
      invalidEmail: "Tämä sähköpostiosoite ei kelpaa",
      failed: "Linkkiä ei voitu pyytää. Tarkista yhteys ja yritä uudelleen.",
      sentTitle: "Tarkista sähköpostisi",
      sent: "Jos jokin Swiss\u00a0Bitcoin\u00a0Pay -tili käyttää osoitetta {{email}}, sinne lähetettiin juuri sähköposti. Avaa sen linkki valitaksesi uuden salasanan.",
      sentNote:
        "Linkki on voimassa 15 minuuttia. Eikö mitään tullut? Katso roskapostikansiosta, tai palaa takaisin pyytääksesi sen uudelleen.",
      choose: "Valitse uusi salasana"
    },
    password: {
      title: "Uusi salasana",
      lead: "Valitse vanhan Swiss\u00a0Bitcoin\u00a0Pay -tilisi uusi salasana.",
      label: "Uusi salasana",
      rules: {
        length: "Vähintään 8 merkkiä",
        letter: "Vähintään yksi kirjain",
        digit: "Vähintään yksi numero"
      },
      met: "täyttyy",
      unmet: "ei vielä",
      save: "Tallenna",
      saving: "Tallennetaan…",
      rejected: "Tätä salasanaa ei hyväksytä: tarkista alla olevat säännöt",
      failed: "Salasanaa ei voitu vaihtaa. Tarkista yhteys ja yritä uudelleen.",
      expired:
        "Tämä linkki ei ole enää voimassa: sitä on jo käytetty, tai sen 15 minuuttia on kulunut. Pyydä uusi.",
      again: "Hae uusi linkki",
      doneTitle: "Salasana vaihdettu",
      done: "Uusi salasanasi on tallennettu. Kirjaudu sillä päivittääksesi tilisi."
    },
    confirm: {
      currency: "Valuutta",
      payouts: "Maksut sinulle",
      payoutsToChoose: "Valitaan tilin luomisen jälkeen",
      split: "{{bitcoin}} bitcoin · {{bank}} pankki",
      allBitcoin: "{{percent}} bitcoin",
      bank: "Pankkitili",
      holder: "Tilinhaltija",
      freeze:
        "Kun sattle.me-tilisi luodaan, vanha tilisi lakkaa ottamasta maksuja vastaan. Sen sinulle velkaa olevat satsit lähetetään heti Lightningilla sattle.me-tilillesi, tai viimeistään klo 0.00\u00a0UTC, jos siirto ei onnistu heti.",
      notMine: "Tämä ei ole minun tilini",
      migratedTitle: "Tili on jo päivitetty",
      migrated:
        "« {{business}} » siirtyi sattle.me:hen {{date}}. Avaa sattle.me-tilisi sen pääsyavaimella.",
      logIn: "Kirjaudu"
    },
    freeze: {
      settingTitle: "Vanha Swiss\u00a0Bitcoin\u00a0Pay -tili",
      settingDescription:
        "Vanhaa tiliäsi ei voitu jäädyttää päivityksen lopussa: se ottaa yhä maksuja vastaan, eikä sen saldoa makseta sattle.me:hen. Jäädytä se nyt.",
      settingLead:
        "Kirjaudu vielä kerran vanhalle Swiss\u00a0Bitcoin\u00a0Pay -tilillesi: se jäädytetään, ja sen sinulle velkaa olevat satsit lähetetään heti Lightningilla sattle.me-tilillesi, tai viimeistään klo 0.00\u00a0UTC.",
      settingStart: "Jäädytä vanha tilini",
      running: "Vanhaa tiliäsi suljetaan…",
      done: "Vanha Swiss\u00a0Bitcoin\u00a0Pay -tilisi on jäädytetty: se ei enää ota maksuja vastaan. Varat siirretty uuteen sattle.me-lompakkoosi.",
      doneNone:
        "Vanha Swiss\u00a0Bitcoin\u00a0Pay -tilisi on jäädytetty: se ei enää ota maksuja vastaan. Siirrettävää saldoa ei ole.",
      donePending:
        "Vanha Swiss\u00a0Bitcoin\u00a0Pay -tilisi on jäädytetty: se ei enää ota maksuja vastaan. Varat siirretään uuteen sattle.me-lompakkoosi viimeistään klo 0.00\u00a0UTC.",
      conflict:
        "Vanha tilisi oli jo päivitetty toiselle sattle.me-tilille: sen rahat maksetaan sinne. Jos se et ollut sinä, kirjoita meille osoitteeseen {{email}}.",
      rejected:
        "Vanhaa tiliäsi ei voitu jäädyttää. Kirjoita meille osoitteeseen {{email}}: teemme sen kanssasi.",
      failed:
        "Vanhaa tiliäsi ei voitu jäädyttää: se ottaa yhä maksuja vastaan. Tarkista yhteys ja yritä uudelleen.",
      lost: "Vanhaa tiliäsi ei voitu jäädyttää: se ottaa yhä maksuja vastaan. Kirjoita meille osoitteeseen {{email}}: teemme sen kanssasi."
    },
    transfer: {
      prompt: "Avaa vanha lompakkosi",
      running: "Rahojasi siirretään…",
      retry: "Yritä uudelleen",
      sentTitle: "{{amount}} matkalla uudelle tilillesi",
      sent: "Summa näkyy kohdassa « $t(navigation.destinations.wallet) », kun verkko on vahvistanut sen, yleensä tunnin kuluessa. Verkkomaksu: {{fee}}.",
      more: "Vielä {{amount}} on matkalla vanhalle tilillesi: voit siirtää sen kohdasta « $t(navigation.destinations.wallet) », kun se on perillä.",
      empty: "Vanha lompakkosi on tyhjä: ei mitään siirrettävää.",
      waiting:
        "{{amount}} on saapumassa vanhalle tilillesi: voit siirtää sen kohdasta « $t(navigation.destinations.wallet) », kun se on perillä.",
      tooSmall:
        "Vanhassa lompakossasi on {{amount}}, vähemmän kuin siirron maksut. Se jää toistaiseksi paikalleen.",
      unreadable:
        "Puhelimesi ei voinut avata vanhaa lompakkoasi. Yritä uudelleen tai kirjoita sen 12 sanaa.",
      failed: "Siirto ei onnistunut. Tarkista yhteys ja yritä uudelleen.",
      sheetTitle: "Siirretäänkö vanha lompakkosi?",
      from: "Mistä",
      fromName: "Swiss Bitcoin Pay -lompakko",
      fromCaption: "12 sanaa, tässä puhelimessa",
      to: "Mihin",
      toName: "sattle.me-lompakkosi",
      amountLabel: "Summa",
      amountUnknown: "Luetaan siirron yhteydessä",
      sats: "{{sats}} satsia",
      fiat: "noin {{fiat}}",
      eraseNote: "12 sanaa poistetaan sen jälkeen tämän puhelimen muistista, siirrettiin tai ei.",
      start: "Siirrä",
      skip: "Älä siirrä",
      skipTitle: "Poistetaanko siirtämättä?",
      skipBody:
        "Swiss Bitcoin Pay -lompakkosi 12 sanaa poistetaan puhelimesi muistista. Sen sisältämät {{amount}} voi sen jälkeen palauttaa vain paperille kirjoittamillasi 12 sanalla.",
      skipBodyUnknown:
        "Swiss Bitcoin Pay -lompakkosi 12 sanaa poistetaan puhelimesi muistista. Sen sisällön voi sen jälkeen palauttaa vain paperille kirjoittamillasi 12 sanalla.",
      skipConfirm: "Minulla on 12 sanaa,\npoista siirtämättä",
      erased: "12 sanaa poistettiin tästä puhelimesta.",
      tooSmallErased:
        "Vanhassa lompakossasi on {{amount}}, vähemmän kuin siirron kulut: se jää paikalleen.",
      skipped:
        "12 sanaa poistettiin tästä puhelimesta ilman siirtoa. Paperille kirjoittamillasi 12 sanalla voit siirtää sen sisällön.",
      eraseFailed: "12 sanaa ei voitu poistaa tästä puhelimesta. Yritä uudelleen."
    },
    done: {
      title: "Tilisi on ajan tasalla",
      todoTitle: "Vielä tehtävää, jos se koskee sinua",
      employees: "Kutsu työntekijäsi uudelleen",
      shop: "Siirrä verkkokauppasi integraatio",
      changes: "Mikä muuttuu",
      words:
        "Vanhassa Swiss\u00a0Bitcoin\u00a0Pay -lompakossasi on vielä {{amount}}. Siirrä ne 12 sanalla, jotka kirjoitit muistiin sitä luodessasi.",
      wordsUnknown:
        "Vanhaa Swiss\u00a0Bitcoin\u00a0Pay -lompakkoasi ei voitu tarkistaa: siinä voi vielä olla rahaa. Siirrä se 12 sanalla, jotka kirjoitit muistiin sitä luodessasi.",
      checking: "Vanhaa lompakkoasi tarkistetaan…",
      titleRunning: "Tiliäsi päivitetään",
      lead: "Yleensä muutama sekunti.",
      // The steps of the migration's end (MigrationTimeline, end-steps.tsx).
      steps: {
        account: "sattle.me-tili luotu",
        accountCaption: "«\u00a0{{business}}\u00a0» on valmis ottamaan maksuja vastaan.",
        frozen: "Vanha tili jäädytetty",
        frozenSent: "Se ei enää ota maksuja vastaan. Varat siirretty uuteen sattle.me-lompakkoosi.",
        frozenNone: "Se ei enää ota maksuja vastaan. Siirrettävää saldoa ei ole.",
        frozenPending:
          "Se ei enää ota maksuja vastaan. Varat siirretään uuteen sattle.me-lompakkoosi viimeistään klo 0.00\u00a0UTC.",
        migratedElsewhere: "Vanha tili jo päivitetty",
        notFrozen: "Vanhaa tiliä ei jäädytetty",
        history: "Historiasi kopiointi",
        historyWaiting: "Heti kun vanha tilisi on jäädytetty.",
        historyRunning: "Historiaasi kopioidaan…",
        historyRead_one: "{{formatted}} tapahtuma luettu",
        historyRead_other: "{{formatted}} tapahtumaa luettu",
        historyWritten_one: "{{copied}}\u00a0/\u00a0{{total}} tapahtuma",
        historyWritten_other: "{{copied}}\u00a0/\u00a0{{total}} tapahtumaa",
        historyCopied: "Historia kopioitu",
        historyCopiedCaption_one:
          "{{formatted}} tapahtuma, näkyy kohdassa ”$t(navigation.destinations.wallet)”.",
        historyCopiedCaption_other:
          "{{formatted}} tapahtumaa, näkyvät kohdassa ”$t(navigation.destinations.wallet)”.",
        historyEmpty: "Ei kopioitavia tapahtumia.",
        historyNotCopied: "Historiaa ei kopioitu",
        wallet: "Vanha lompakko"
      }
    },
    changes: {
      title: "Mikä muuttuu",
      lead: "Heti kun sattle.me-tilisi on luotu:",
      frozen:
        "Jäädytettynä vanha Swiss\u00a0Bitcoin\u00a0Pay -tilisi ei enää ota vastaan mitään maksuja, ei kassalla, ei verkossa eikä Lightning-osoitteessaan.",
      items: {
        employees: {
          title: "Kutsu työntekijäsi uudelleen",
          caption:
            "Heidän laitteensa eivät enää ota maksuja vanhalle tilille. Kutsu heidät kohdassa « $t(navigation.destinations.employees) »: he skannaavat koodisi ja ottavat maksuja puolestasi. sattle.me:lle liian vanha laite ei voi enää ottaa maksuja."
        },
        shop: {
          title: "Siirrä verkkokauppasi integraatio",
          caption:
            "Verkkokauppasi ei enää ota maksuja vanhalle tilille. Luo integraatio kohdassa «\u00a0$t(navigation.destinations.integrations)\u00a0» ja anna sen avain sivustoasi hoitavalle henkilölle."
        },
        limits: {
          title: "Ei enää rajoja",
          caption:
            "sattle.me 3.0.0 -päivityksen ansiosta henkilöllisyyden vahvistamiseen liittyviä rajoja tai rajoituksia ei enää ole."
        },
        money: {
          title: "Rahasi seuraavat sinua",
          caption:
            "Vanhan tilin sinulle velkaa olevat satsit lähetetään Lightningilla sattle.me-tilillesi päivityksen yhteydessä vanhoista asetuksistasi riippumatta; jos siirto ei onnistu, sitä yritetään uudelleen joka yö klo 0.00\u00a0UTC. Myöhemmin vielä saapuvat seuraavat heti selvityksensä jälkeen. Jo käynnissä olevat pankkisiirrot tehdään tavalliseen tapaan."
        },
        cards: {
          title: "Siirrä korttisi",
          caption:
            "Näytä jokainen Swiss\u00a0Bitcoin\u00a0Pay -kortti kohdassa « $t(navigation.destinations.cards) » siirtääksesi sen saldon. Vielä siirtämätön kortti toimii {{cardEnd}} asti."
        },
        history: {
          title: "Historiasi kopioidaan",
          caption:
            "Myyntisi, nostosi ja palkkiosi kopioidaan kohtaan « $t(navigation.destinations.wallet) » tiedoksi. Ne ovat sen CSV- ja PDF-vienneissä. Vanhan tilisi historia on katsottavissa ja vietävissä osoitteessa dashboard.swiss-bitcoin-pay.ch {{merchantEnd}} asti."
        }
      }
    },
    // The copy of the v2 account's history (src/features/migration/history-import.ts).
    history: {
      running: "Swiss\u00a0Bitcoin\u00a0Pay -historiaasi kopioidaan taustalla…",
      // While reading the v2 server (its pages tell no total), then writing to the relays.
      reading_one:
        "Swiss\u00a0Bitcoin\u00a0Pay -historiaasi luetaan: {{formatted}} tapahtuma luettu…",
      reading_other:
        "Swiss\u00a0Bitcoin\u00a0Pay -historiaasi luetaan: {{formatted}} tapahtumaa luettu…",
      writing_one:
        "Swiss\u00a0Bitcoin\u00a0Pay -historiaasi kopioidaan: {{copied}}\u00a0/\u00a0{{total}} tapahtuma…",
      writing_other:
        "Swiss\u00a0Bitcoin\u00a0Pay -historiaasi kopioidaan: {{copied}}\u00a0/\u00a0{{total}} tapahtumaa…",
      done_one:
        "Historiasi on kopioitu: {{formatted}} tapahtuma, näkyy kohdassa ”$t(navigation.destinations.wallet)”.",
      done_other:
        "Historiasi on kopioitu: {{formatted}} tapahtumaa, näkyvät kohdassa ”$t(navigation.destinations.wallet)”.",
      failed:
        "Historiasi kopiointi ei onnistunut. Aloita se uudelleen kohdasta ”$t(settings.title)”, osio ”$t(settings.groups.account)”.",
      settingTitle: "Swiss\u00a0Bitcoin\u00a0Pay -historia",
      settingDescription:
        "Kopioi vanhan tilisi myynnit, nostot ja palkkiot sattle.me-sovellukseen tiedoksi. Mahdollista {{date}} asti.",
      start: "Tuo historiani",
      lead: "Kirjaudu viimeisen kerran vanhaan Swiss\u00a0Bitcoin\u00a0Pay -tiliisi: historiasi kopioidaan taustalla.",
      note: "Salasanaasi käytetään vain kerran, eikä sitä koskaan tallenneta.",
      errors: {
        secondFactor:
          "Vanha tilisi pyytää vahvistuskoodia, jota sattle.me ei voi käyttää. Ota yhteyttä tukeen.",
        stopped:
          "Jotta vanhaa tiliäsi ei lukittaisi, emme yritä enää. Tarkista salasanasi ennen kuin yrität myöhemmin uudelleen.",
        unreachable: "Vanha tilisi ei vastaa. Tarkista yhteytesi ja yritä uudelleen."
      }
    },
    words: {
      open: "Kirjoita 12 sanaani",
      title: "Vanha lompakkosi",
      lead: "Kirjoita järjestyksessä 12 sanaa, jotka kirjoitit muistiin luodessasi lompakkosi Swiss Bitcoin Pay -sovelluksessa. Sen rahat siirretään sattle.me-tilillesi.",
      only: "Vain nämä 12 sanaa: älä koskaan kirjoita tähän toisen lompakon sanoja (Ledger, Trezor, BitBox tai muu).",
      label: "12 sanaasi",
      invalid: "Nämä sanat eivät muodosta lompakkoa: tarkista jokainen sana ja niiden järjestys",
      mismatch:
        "Nämä sanat eivät ole Swiss\u00a0Bitcoin\u00a0Pay -lompakkosi sanoja: tarkista jokainen sana ja niiden järjestys ja kirjoita ne uudelleen",
      unused:
        "Nämä sanat eivät vastaa yhtään lompakkoa, joka olisi koskaan saanut rahaa: tarkista jokainen sana ja niiden järjestys ja kirjoita ne uudelleen",
      submit: "Siirrä",
      done: "Valmis",
      note: "Sanojasi käytetään vain kerran, eikä niitä koskaan tallenneta."
    },
    employee: {
      title: "Swiss Bitcoin Paystä tulee sattle.me",
      lead: "Tämä laite otti maksuja vastaan yritykselle. Jatkaaksesi pyydä vastaavaa kutsumaan sinut uudelleen sattle.me:stä ja skannaa hänen koodinsa.",
      leadBusiness:
        "Tämä laite otti maksuja vastaan yritykselle « {{business}} ». Jatkaaksesi pyydä vastaavaa kutsumaan sinut uudelleen sattle.me:stä ja skannaa hänen koodinsa.",
      join: "Skannaa kutsu",
      logIn: "Minulla on jo sattle.me-tili",
      owner: "Vastaan tästä yrityksestä"
    },
    wallet: {
      unchecked:
        "Vanha Swiss Bitcoin Pay -lompakkosi on tässä puhelimessa. Tarkista, onko siinä vielä siirrettävää rahaa.",
      check: "Tarkista ja siirrä",
      funds: "Vanhalla tililläsi on vielä {{amount}}, jonka voit siirtää tänne.",
      transfer: "Siirrä",
      incoming: "{{amount}} on saapumassa vanhalle tilillesi: voit siirtää sen, kun se on perillä."
    }
  },
  split: {
    title: "Miten haluat saada maksusi?",
    description:
      "Sovellus ehdottaa tämän osuuden myymistä vastaanottamistasi maksuista. Voit muuttaa sitä milloin tahansa.",
    bitcoin: "Bitcoin",
    freeUntil: "Maksuton {{date}} asti",
    sattleFee: "sattle.me-palkkio",
    sattleFeeScope: "Kaikesta, mitä vastaanotat, muunnettuna tai ei",
    conversionFee: "Muunto {{currency}}",
    conversionFeeScope: "Mt Pelerinin myyntikulut, vain muunnetusta osuudesta",
    extraFee: "+ {{fee}}",
    transferNote:
      "Tilisiirto maksuton alkaen {{threshold}}. Sitä pienemmät myyntisi kootaan, kunnes summa täyttyy, tai siirretään heti hintaan {{fee}}.",
    waivedRate: "{{free}}, muuten {{fee}}",
    feeRange: "{{min}}–{{max}}",
    sliderLabel: "Bitcoin-osuus",
    sliderValue: "{{bitcoin}} bitcoinina, {{fiat}} muunnetaan {{currency}}",
    currencyButton: "Tilisiirron valuutta: {{currency}}"
  },
  bank: {
    currentAccount: "Tallennettu tili",
    currentAccountSub: "Mt Pelerinillä, tässä valuutassa",
    editAccount: "Muokkaa tätä tiliä",
    title: "Minne <accent>{{currency}}</accent> muunnettu <accent>{{percent}}</accent> maksetaan?",
    transferSchedule: "Myyntisi siirretään sinne yhtenä tilisiirtona.",
    editableLater: "Voit muuttaa näitä tietoja asetuksissa.",
    country: "Asuinmaa",
    iban: "IBAN",
    ibanInvalid: "Tarkista IBAN",
    holderKind: "Tilinhaltija on",
    person: "Henkilö",
    company: "Yritys",
    companyName: "Toiminimi",
    firstname: "Etunimi",
    lastname: "Sukunimi",
    address: "Osoite",
    addressPlaceholder: "Katu ja numero",
    postalCode: "Postinumero",
    postalCodePlaceholder: "1003",
    city: "Kaupunki",
    cityPlaceholder: "Lausanne",
    mtPelerin: {
      sheetTitle: "Mt Pelerin -tili",
      lead: "Tämä osuus myydään kumppanillemme Mt Pelerinille, sveitsiläiselle rahoituksen välittäjälle, joka siirtää summan pankkitilillesi.",
      accountTitle: "Tilisi kumppanillamme",
      accountSms:
        "Matkapuhelinnumerosi ja tekstiviestillä saatu koodi, sitten sähköpostiosoitteesi",
      accountKey: "sattle.me-tilisi avain, sitten sähköpostiosoitteesi ja numerosi",
      bankTitle: "Pankkitilisi",
      bankSub: "Rekisteröity kumppanillemme, joka siirtää myyntisi sinne",
      saleTitle: "Mitään ei myydä ilman sinua",
      saleSub:
        "Sovellus ehdottaa tämän osuuden myyntiä, ja vahvistat sen pääsyavaimellasi. Ennen ensimmäistä myyntiä lompakkosi vahvistetaan 1 satin maksulla",
      connected: "Mt Pelerin -tili yhdistetty: tämä pankkitili rekisteröidään sinne",
      create: "Luo Mt Pelerin -tilini",
      existing: "Minulla on jo Mt Pelerin -tili",
      createTitle: "Luo tilisi",
      createLeadSms:
        "Matkapuhelinnumerollasi, sitten sähköpostiosoitteellasi. Tällä numerolla jo avattu tili otetaan käyttöön.",
      createLeadKey: "sattle.me-tilisi avaimella, sitten sähköpostiosoitteellasi ja numerollasi.",
      existingTitle: "Yhdistä tilisi",
      existingLeadSms: "Tilisi matkapuhelinnumerolla.",
      existingLeadKey: "sattle.me-tilisi avaimella."
    }
  },
  setup: {
    title: "Tiliäsi määritetään…",
    description: "Lightning-osoitettasi ja kassaasi valmistellaan. Tämä voi kestää hetken.",
    cardDescription: "Tiliäsi valmistellaan tälle laitteelle. Tämä vie vain hetken.",
    failedTitle: "Määritys keskeytyi",
    retry: "Yritä uudelleen"
  },
  appStores: {
    googlePlay: "Asenna sovellus Google Playsta",
    appStore: "Asenna sovellus App Storesta"
  },
  install: {
    banner: {
      name: "sattle.me",
      iphone: "Sovellus iPhonelle, App Storessa",
      ipad: "Sovellus iPadille, App Storessa",
      android: "Sovellus Androidille, Google Playssa",
      computer: "Omassa ikkunassaan, kuin sovellus",
      get: "Hae",
      install: "Asenna",
      dock: "Lisää Dockiin",
      dismiss: "Sulje, älä tarjoa uudelleen"
    },
    setting: {
      title: "Asenna sovellus",
      places: {
        iphone: "sattle.me-sovellus iPhonelle, App Storessa.",
        ipad: "sattle.me-sovellus iPadille, App Storessa.",
        android: "sattle.me-sovellus Androidille, Google Playssa.",
        computer: "sattle.me tälle tietokoneelle, omaan ikkunaansa, kuin sovellus.",
        dock: "sattle.me tämän Macin Dockiin, omaan ikkunaansa, kuin sovellus."
      },
      appStore: "App Store",
      googlePlay: "Google Play"
    },
    dock: {
      title: "Lisää sattle.me Dockiin",
      menu: "Valitse Safarin valikkoriviltä <strong>Tiedosto > Lisää Dockiin</strong>.",
      add: "Klikkaa <strong>Lisää</strong>: sattle.me avautuu Dockista omaan ikkunaansa.",
      requirement: "Safarilla, macOS Sonoma tai uudempi.",
      passkey:
        "Dockin sovelluksella on omat tietonsa: kirjaudu ensimmäisellä kerralla uudelleen passkeylläsi.",
      done: "Selvä"
    }
  },
  countryPicker: {
    search: "Hae maata",
    noResult: "Maata ei löytynyt",
    close: "Sulje"
  },
  currencyPicker: {
    title: "Tilisiirron valuutta",
    close: "Sulje"
  },
  card: {
    computerTitle: "Lisää <accent>korttisi</accent> puhelimella",
    computerDescription:
      "Tietokone ei voi lukea NFC-kortteja. Skannaa tämä koodi puhelimella: se avaa sovelluksen, johon kirjaudut samalla passkeylla. Tuo sitten kortti puhelimen lähelle.",
    computerCode: "QR-koodi, joka avaa tämän vaiheen puhelimesi sovelluksessa",
    computerWaiting: "Odotetaan puhelinta: tämä sivu jatkuu heti, kun kortti on lisätty.",
    // The same in the app on a device that reads no card (an iPad, useReadsCards.ts).
    deviceDescription:
      "Tämä laite ei voi lukea NFC-kortteja. Skannaa tämä koodi puhelimella: se avaa sovelluksen, johon kirjaudut samalla passkeylla. Tuo sitten kortti puhelimen lähelle.",
    deviceDescriptionNoCode:
      "Tämä laite ei voi lukea NFC-kortteja. Avaa sovellus puhelimessasi ja kirjaudu samalla passkeylla. Tuo sitten kortti puhelimen lähelle.",
    deviceWaiting: "Odotetaan puhelinta: tämä näkymä jatkuu heti, kun kortti on lisätty.",
    addedTitle: "<accent>Korttisi</accent> on lisätty",
    addedDescription:
      "Puhelimella lisättynä se näkyy myös täällä, kohdassa « Kortit ». Lataa se käyttääksesi sitä.",
    webTitle: "Yhdistä <accent>BoltCard</accent>-korttisi sovelluksessa",
    webDescription:
      "Selain ei voi ohjelmoida korttia. Avaa sattle.me-sovellus tällä puhelimella ja kirjaudu sisään pääsyavaimellasi: yhdistäminen jatkuu siellä.",
    webDescriptionAndroid:
      "Selain ei voi ohjelmoida korttia. Avaa tai asenna sattle.me:n Android-sovellus tällä puhelimella ja kirjaudu sisään pääsyavaimellasi: yhdistäminen jatkuu sovelluksessa.",
    webDescriptionIphone:
      "Selain ei voi ohjelmoida korttia. Avaa tai asenna sattle.me:n iPhone-sovellus tällä puhelimella ja kirjaudu sisään pääsyavaimellasi: yhdistäminen jatkuu sovelluksessa.",
    retry: "Yritä uudelleen",
    openSettings: "Avaa asetukset",
    activationPending:
      "Korttisi on ohjelmoitu, mutta sen rele ei ole vielä vastannut. Kortti aktivoidaan, kun avaat sovelluksen seuraavan kerran verkkoyhteyden kanssa: siihen asti sillä ei voi maksaa.",
    activationNoPush:
      "Korttisi on valmis, mutta tämä puhelin ei saa maksuilmoituksia: kortilla voi maksaa vain, kun sovellus on näytöllä. Ilmoitukset otetaan käyttöön itsestään, jos puhelin voi vastaanottaa ne.",
    failure: {
      noAccount:
        "Istuntosi on suljettu. Kirjaudu uudelleen pääsyavaimellasi ja yritä sitten uudelleen.",
      nfcUnavailable:
        "NFC ei ole käytettävissä tai se on pois päältä tässä laitteessa. Ota se käyttöön asetuksista ja yritä uudelleen.",
      notificationsDenied:
        "Salli sattle.me-sovelluksen ilmoitukset puhelimen asetuksista: niiden avulla puhelimesi saa tiedon, kun kassa lukee korttiasi.",
      relayUnreachable:
        "Kortin rele ei vastaa. Tarkista yhteys ja yritä uudelleen. Korttiasi ei muutettu.",
      relayIncompatible: "Kortin rele ei käytä odotettua versiota. Korttiasi ei muutettu.",
      relayTooLong: "Tämän releen osoite on liian pitkä korttiin.",
      recordsUnreachable:
        "Liian harva tilisi rele vastaa. Tarkista yhteys ja yritä uudelleen. Korttiasi ei muutettu.",
      notConfirmed:
        "Tilisi releet eivät vahvistaneet tätä muutosta: se voi vielä tulla voimaan, tai ei. Tarkista yhteys ja yritä uudelleen.",
      notBlank: "Tämä kortti ei ole tyhjä. Pyydä ensin sen myöntäjää nollaamaan se.",
      ownCard:
        "Tämä kortti on jo kohdassa « Kortit ». Lisätäksesi sen uudelleen poista se ensin, kortti kädessä.",
      notThisCard:
        "Tämä ei ole valittu kortti, tai se on ohjelmoitu uudelleen muualla. Mitään ei muutettu: tuo oikea kortti puhelimen lähelle.",
      cardLost:
        "Kortti siirtyi pois liian aikaisin. Tuo se uudelleen puhelimen luo ja pidä sitä paikallaan loppuun asti: yhdistäminen jatkuu siitä, mihin se jäi.",
      notBoltCard: "Tämä kortti ei ole BoltCard (NTAG 424 DNA).",
      verifyFailed:
        "Kortti ohjelmoitiin, mutta sen tarkistus epäonnistui. Tuo se uudelleen puhelimen luo yrittääksesi uudelleen.",
      versionsExhausted:
        "Tämä kortti on ohjelmoitu liian monta kertaa tällä lompakolla. Käytä toista korttia.",
      newerApp: "Sovelluksen uudempi versio on tallentanut tämän kortin. Päivitä sovellus.",
      walletNotEmpty:
        "Tämän kortin lompakko ei ole tyhjä, tai sille on vielä tulossa satseja. Nosta ensin sen saldo pääsaldoosi: poistettu kortti ei enää näy missään, eivätkä sen satsit. Korttiasi ei muutettu.",
      walletUnavailable:
        "Tämän kortin lompakko ei vastannut: kortti poistetaan vasta, kun sen lompakko on todettu tyhjäksi. Tarkista yhteys ja yritä uudelleen. Korttiasi ei muutettu.",
      cardGone: "Tämä kortti ei ole enää kohdassa « Kortit »: se poistettiin. Mitään ei muutettu.",
      deletionPending:
        "Tilisi releet eivät ole vielä tallentaneet poistoa: korttia ei tyhjennetty.",
      migrationDrainFailed:
        "Tämän kortin saldoa ei voitu siirtää tällä kertaa, eikä korttia muutettu: yritä hetken päästä uudelleen.",
      migrationOverDailyLimit:
        "Tämä siirto ylittää kortin rajan: 1 000 CHF 24 tunnissa, viimeaikaiset ostot mukaan lukien. Mitään ei siirretty eikä korttia muutettu: yritä uudelleen, kun saldo on rajan alla, tai ota yhteyttä tukeen.",
      migrationReceiptPending:
        "Siirto pyydettiin, mutta sen saapumista uuteen lompakkoon ei voitu vahvistaa ajoissa. Satsisi saattavat olla jo matkalla: « Kortit » näyttää kortin ja sen lompakon. Korttia ei muutettu: odota hetki ja yritä uudelleen.",
      migrationMasterKey:
        "Korttia ei voitu koodata uudelleen: sen pääavain ei ole odotettu. Se, mitä on jo siirretty, on sen uudessa lompakossa, jonka « Kortit » näyttää. Yritä uudelleen; jos ongelma jatkuu, ota yhteyttä tukeen.",
      migrationNotWiped:
        "Korttia ei voitu nollata. Se, mitä on jo siirretty, on sen uudessa lompakossa, jonka « Kortit » näyttää. Yritä uudelleen; jos ongelma jatkuu, ota yhteyttä tukeen.",
      migrationCardDisabled:
        "Tämä kortti on lukittu tai estetty aiemmassa palvelussa: sitä ei voi siirtää. Jos lukitsit sen itse, avaa lukitus ensin; muussa tapauksessa ota yhteyttä tukeen. Mitään ei muutettu.",
      migrationPaymentPending:
        "Tämän kortin maksu on yhä kesken aiemmassa palvelussa, usein juuri tehty siirto: korttia ei voi vielä tyhjentää. Korttia ei muutettu: yritä hetken päästä uudelleen, siirto jatkuu siitä, mihin se jäi.",
      migrationServerUnreachable:
        "Yhteys Swiss Bitcoin Payn palvelimeen, joka ainoana voi avata tämän kortin, ei onnistunut. Tarkista yhteytesi ja pidä kortti puhelinta vasten, yritä sitten uudelleen: yhdistäminen jatkuu siitä, mihin se jäi.",
      cancelled: "Yhdistäminen peruttu.",
      failed: "Yhdistäminen epäonnistui. Yritä uudelleen."
    },
    nfcAlert: "Tuo BoltCard puhelimen yläosan lähelle ja pidä se paikallaan.",
    nfcSuccess: "Kortti yhdistetty",
    nfcFailure: "Yhdistäminen keskeytyi",
    notificationChannel: "Korttimaksut",
    decline: {
      newPayee:
        "Uusi kauppias: kortin haltijan on hyväksyttävä se sattle.me-sovelluksessaan ja näytettävä kortti uudelleen.",
      unidentifiedPayee:
        "Kauppiasta ei tunnistettu: kortin haltijan on vahvistettava maksu sattle.me-sovelluksessaan.",
      unconfirmed: "Kortin haltijan on vahvistettava maksu sattle.me-sovelluksessaan.",
      notConfirmed: "Maksua ei vahvistettu kortin haltijan puhelimessa.",
      refused: "Kortin haltija hylkäsi maksun.",
      insufficientBalance: "Kortin saldo ei riitä.",
      aboveLimit: "Summa ylittää kortin maksukohtaisen rajan.",
      dayLimit: "Kortin 24 tunnin raja on täynnä.",
      hourLimit: "Liian monta maksua tällä kortilla tunnin sisällä.",
      suspended:
        "Kortti on tauolla: kortin haltija voi ottaa sen uudelleen käyttöön sattle.me-sovelluksessaan.",
      invalidInvoice: "Lasku ei kelpaa tälle kortille.",
      expired: "Lasku on vanhentunut: luo uusi.",
      noAmount: "Laskussa ei ole summaa: kortti maksaa vain kiinteän summan.",
      outOfBounds: "Summa on kortin rajojen ulkopuolella (1 sat – 1 BTC).",
      alreadyPaid: "Kortti ei maksa tätä laskua: se on jo maksettu.",
      invalidTap: "Kortin luku ei kelpaa: näytä kortti uudelleen.",
      sendFailed: "Maksu ei lähtenyt, mitään ei maksettu. Näytä kortti uudelleen.",
      uncertain:
        "Maksu keskeytyi: se voi vielä saapua. Odota muutama sekunti ennen kuin yrität uudelleen.",
      updateApp: "Kortin haltijan on päivitettävä sattle.me-sovelluksensa.",
      superseded: "Kortin uudempi luku korvasi tämän.",
      other: "Maksua ei voitu käsitellä."
    },
    payment: {
      title: "Korttimaksu",
      close: "Sulje",
      waiting: "Kortti luettu, odotetaan kassan laskua…",
      checking: "Kauppiasta tarkistetaan…",
      delay: {
        minute: "minuutissa",
        seconds_one: "{{count}} sekunnissa",
        seconds_other: "{{count}} sekunnissa"
      },
      note: {
        newPayee: "Uusi kauppias: tarkista summa ja nimi ennen maksamista.",
        unidentifiedPayee:
          "Kassa ei osoittanut, kuka tämän maksun saa: tarkista summa kauppiaan kanssa.",
        unconfirmed: "Tarkista summa ja kauppias."
      },
      pay: "Maksa {{amount}}",
      decline: "Hylkää",
      answerIn: "Vastaa {{seconds}} s kuluessa",
      timeOut: "Aika loppui",
      timeLabel: "Aikaa vastata",
      merchant: "Kauppias",
      noteLabel: "Viesti",
      card: "Kortti",
      exactAmount: "Tarkka summa",
      approve: "Hyväksy tämä kauppias",
      approveCaption: "Sen seuraavat maksut lähtevät ilman vahvistusta",
      joined: "{{first}} · {{second}}",
      ofCard: "kortti {{name}}",
      confirming: "Vahvista pääsyavaimellasi…",
      paying: "Maksua lähetetään…",
      payingAutomatically: "Maksua lähetetään ilman vahvistusta…",
      approved: "Tämä kauppias on nyt hyväksyttyjen kauppiaidesi joukossa.",
      done: "Valmis",
      doneIn: "Valmis ({{seconds}} s)",
      failedTitle: "Maksua ei tehty",
      nothingPaid: "Mitään ei maksettu.",
      result: {
        completedTitle: "Maksu tehty",
        completedBody: "{{amount}} maksettu kortillasi.",
        completedBodyAutomatic: "{{amount}} maksettu kortillasi ilman vahvistusta.",
        pendingTitle: "Maksu lähetetty",
        pendingBody: "Maksu {{amount}} on lähtenyt. Sen tila näkyy tapahtumaluettelossa.",
        failedTitle: "Maksu epäonnistui",
        failedBody: "Maksu {{amount}} ei mennyt läpi. Sen tila näkyy tapahtumaluettelossa.",
        declinedTitle: "Maksu hylätty",
        declinedBody:
          "Hylkäsit tämän maksun {{amount}}. Mitään ei maksettu; kassalle on ilmoitettu."
      },
      failure: {
        unreachable: "Kortin rele ei vastaa, tai tämä maksu on vanhentunut. Mitään ei maksettu.",
        ended:
          "Kassa ei enää odota tätä maksua. Mitään ei maksettu: näytä korttisi uudelleen tarvittaessa.",
        invalidInvoice: "Kassa lähetti laskun, jota lompakkosi ei voi maksaa. Mitään ei maksettu.",
        otherNetwork: "Kassan lasku on toisen Bitcoin-verkon. Mitään ei maksettu.",
        expired: "Kassan lasku on vanhentunut. Mitään ei maksettu.",
        noAmount: "Kassan laskulla ei ole summaa kokonaisina satseina. Mitään ei maksettu.",
        outOfBounds: "Summa on korttimaksun rajojen ulkopuolella. Mitään ei maksettu.",
        suspended: "Tämä kortti on tauolla. Mitään ei maksettu.",
        alreadyPaid: "Tämä lasku on jo maksettu. Mitään ei maksettu uudelleen.",
        dayLimit: "Tämä maksu ylittäisi korttisi 24 tunnin rajan. Mitään ei maksettu.",
        hourLimit:
          "Korttisi on saavuttanut tämän tunnin maksujen enimmäismäärän. Mitään ei maksettu.",
        aboveLimit: "Summa ylittää korttisi rajan. Mitään ei maksettu.",
        notYourCard: "Tämä maksu ei tule korttisi napautuksesta. Mitään ei maksettu.",
        replayed: "Tämä korttisi napautus on jo käytetty. Mitään ei maksettu.",
        unlock: "Maksua ei vahvistettu. Mitään ei maksettu.",
        insufficientBalance:
          "Korttisi saldo ei riitä tähän maksuun ja sen kuluun. Mitään ei maksettu: lataa korttia kohdassa « Kortit ».",
        sendFailed:
          "Lompakkosi ei voinut lähettää tätä maksua, esimerkiksi saldon puutteen vuoksi. Mitään ei lähtenyt.",
        uncertain:
          "Lompakkosi ei vahvistanut lähetystä: maksu on ehkä lähtenyt. Tarkista tapahtumaluettelo ennen kuin maksat muulla tavalla.",
        newerApp:
          "Sovelluksen uudempi versio tallensi korttisi. Päivitä sovellus. Mitään ei maksettu.",
        otherInvoice:
          "Kauppiaan palvelu ei tunnista tätä laskua: se on voitu vaihtaa matkalla. Mitään ei maksettu.",
        settled:
          "Kauppiaan palvelun mukaan tämä lasku on jo maksettu. Mitään ei maksettu uudelleen.",
        newPayee:
          "Ei vahvistusta {{delay}}: mitään ei maksettu. Kassalle ilmoitettiin, että tämä uusi kauppias on hyväksyttävä sovelluksessa.",
        newPayeeHomonym: "Ei vahvistusta {{delay}}: mitään ei maksettu.",
        unidentifiedPayee:
          "Ei vahvistusta {{delay}}: mitään ei maksettu. Kassalle ilmoitettiin, ettei kauppiasta ole tunnistettu.",
        unconfirmed: "Ei vahvistusta {{delay}}: mitään ei maksettu. Kassalle ilmoitettiin.",
        late: "Maksu ei ehtinyt lähteä {{delay}}. Mitään ei maksettu.",
        failed: "Tätä maksua ei voitu käsitellä. Mitään ei maksettu."
      }
    },
    payee: {
      quoted: "”{{name}}”",
      unnamed: "Tuntematon nimi",
      node: "Solmu {{node}}",
      by: {
        address: "tunnistettu Lightning-osoitteestaan",
        node: "tunnistettu Lightning-solmustaan"
      },
      nodeWarning:
        "Tämä kauppias on tunnistettu Lightning-solmustaan, ei osoitteestaan. Jos solmu on jaettu (Spark, Wallet of Satoshi, Strike…), sen hyväksyminen hyväksyy myös kaikki sen muut käyttäjät: heille maksettaisiin ilman vahvistusta kortin rajoissa.",
      formerName: "aiemmin ”{{name}}”",
      localName: "kauppiaissasi: ”{{name}}”",
      homonym:
        "Sama nimi kuin hyväksytyllä kauppiaalla, mutta eri tili: tarkista ennen maksamista.",
      chip: {
        approved: "Hyväksytty {{date}}",
        approvedUndated: "Hyväksytty",
        new: "Uusi kauppias",
        unidentified: "Tunnistamaton kauppias",
        unchecked: "Ei tarkistettu (automaattinen tila)"
      },
      declaredName: "{{name}}, kauppiaan ilmoittama nimi",
      declaredByNode: "{{name}}, solmun ilmoittama nimi"
    },
    notice: {
      title: "Korttimaksu: {{amount}}",
      body: "{{amount}} saajalle {{name}}",
      askTitle: "Odottaa: Korttimaksu",
      askBody: "{{amount}} saajalle {{name}}. Vahvista napsauttamalla, kassa odottaa.",
      askBodyUnchecked: "{{amount}}. Vahvista napsauttamalla, kassa odottaa.",
      askBodyNoInvoice: "Vahvista napsauttamalla, kassa odottaa.",
      refusedTitle: "Hylätty: Korttimaksu ({{amount}} saajalle {{name}})",
      refusedTitleUnchecked: "Hylätty: Korttimaksu ({{amount}})",
      refusedTitleNoInvoice: "Hylätty: Korttimaksu",
      pausedBody: "{{card}} on tauolla. Mitään ei maksettu."
    }
  },
  cards: {
    title: "Kortit",
    locked: {
      title: "Korttisi on lukittu",
      body: "Avaa sovellus pääsyavaimellasi nähdäksesi ja hallitaksesi korttejasi."
    },
    pairOnPhone:
      "Yhdistä kortti avaamalla sovellus puhelimessasi: se ohjelmoi kortin, kun pidät korttia sitä vasten.",
    pairOnAndroid:
      "Yhdistä kortti käyttämällä sattle.me:n Android-sovellusta: se ohjelmoi kortin, kun pidät korttia puhelinta vasten.",
    pairOnIphone:
      "Yhdistä kortti käyttämällä sattle.me:n iPhone-sovellusta: se ohjelmoi kortin, kun pidät korttia puhelinta vasten.",
    shop: {
      order: "Tilaa kortteja",
      title: "Valitse korttisi",
      lead: "Useita malleja, tilattavissa sattle.me-kaupasta."
    },
    loading: "Kortteja ladataan…",
    failed: {
      noAccount: "Istuntosi on suljettu. Avaa sovellus pääsyavaimellasi ja yritä sitten uudelleen.",
      unreachable:
        "Korttejasi ei voitu lukea: tilisi releet eivät vastaa. Tarkista yhteys ja yritä sitten uudelleen."
    },
    retry: "Yritä uudelleen",
    map: {
      title: "Missä maksaa kortillasi",
      source: "Lightning-lähimaksu · BTC Map",
      desktopSubtitle: "Liikkeet, jotka hyväksyvät Lightning-lähimaksut · BTC Mapin kartta",
      openSite: "Avaa btcmap.org",
      loading: "Karttaa ladataan…",
      failedTitle: "Kartta ei latautunut",
      failedBody:
        "BTC Map ei vastaa, tai laite on offline-tilassa. Tarkista yhteys ja yritä sitten uudelleen.",
      openInBrowser: "Avaa btcmap.org selaimessa",
      frameTitle: "BTC Mapin kartta liikkeistä, jotka hyväksyvät lähimaksut"
    },
    unnamed: "Kortti {{id}}",
    carousel: "Korttisi",
    slot: "Kortti {{n}}/{{count}}: {{label}}",
    add: "Lisää kortti",
    cardOf: "Kortti {{name}}",
    order: {
      organize: "Järjestä",
      organizeA11y: "Järjestä kortit",
      title: "Korttien järjestys",
      lead: "Pidä kahvaa painettuna ja vedä. Ensimmäinen kortti näkyy, kun avaat ”Kortit”-näkymän, kaikilla laitteillasi.",
      rowLead: "Vedä kortti paikalleen (tai ← →). Ensimmäinen näkyy avattaessa.",
      save: "Tallenna",
      cancel: "Peruuta",
      close: "Sulje",
      saved: "Korttien järjestys tallennettu",
      failedTitle: "Järjestystä ei tallennettu",
      unsaved: "Tilisi releet eivät vastanneet: tarkista yhteytesi ja yritä uudelleen",
      newer: "Se valittiin sovelluksen uudemmassa versiossa: päivitä sovellus muuttaaksesi sitä",
      moveUp: "Siirrä ylös",
      moveDown: "Siirrä alas",
      moveLeft: "Siirrä vasemmalle",
      moveRight: "Siirrä oikealle",
      row: "{{label}}, {{n}}/{{count}}",
      moved: "{{label}}, nyt {{n}}/{{count}}",
      previous: "Edelliset kortit",
      next: "Seuraavat kortit"
    },
    // "Add a card", in "Cards" and the sign-up (AddCardFlow.tsx).
    adding: {
      guide: {
        title: "Ennen kuin aloitat",
        subtitle: "Tyhjä BoltCard. Vanhan sovelluksen kortti migratoidaan saldoineen.",
        card: "Tyhjä BoltCard",
        cardBody: "Vanhan sovelluksen kortti migratoidaan saldoineen.",
        notifications: "Ilmoitukset",
        notificationsBody:
          "Salli ne, kun puhelin kysyy: niiden kautta se tietää, että kassa lukee kortin.",
        start: "Aloita"
      },
      web: {
        note: "Tietokone ei voi lukea NFC-kortteja: kortti lisätään puhelimesi sovelluksessa, kortti kädessä.",
        noteDevice:
          "Tämä laite ei voi lukea NFC-kortteja: kortti lisätään puhelimesi sovelluksessa, kortti kädessä.",
        noteAndroid:
          "Selain ei voi ohjelmoida korttia: kortti lisätään sattle.me:n Android-sovelluksessa, kortti kädessä.",
        noteIphone:
          "Selain ei voi ohjelmoida korttia: kortti lisätään sattle.me:n iPhone-sovelluksessa, kortti kädessä.",
        where: "Puhelinta vasten",
        whereBody: "Pidä kortti paikallaan loppuun asti, muutaman sekunnin.",
        code: "QR-koodi, joka avaa puhelimesi sovelluksessa toiminnon « Lisää kortti »",
        scan: "Skannaa tämä koodi puhelimellasi: se avaa sovelluksessa toiminnon « Lisää kortti »."
      },
      steps: {
        label: "Kortin lisäämisen vaiheet",
        notifications: "Ilmoitukset sallittu",
        notificationsTodo: "Ilmoitusten salliminen",
        notificationsRunning: "Ilmoituksia sallitaan",
        notificationsFailed: "Ilmoituksia ei sallittu",
        notificationsCaption: "Näin puhelimesi tietää, että kassa lukee kortin",
        relay: "Kortin rele tavoitettavissa",
        relayTodo: "Kortin releen tarkistus",
        relayRunning: "Kortin relettä tarkistetaan",
        relayFailed: "Kortin relettä ei tarkistettu",
        card: "Kortti tuotu lähelle",
        cardTodo: "Kortin tuominen lähelle",
        cardRunning: "Odotetaan korttia",
        cardFailed: "Korttia ei tunnistettu",
        cardIos: "Puhelimen yläpuolella, kunnes vahvistus näkyy",
        cardAndroid: "Puhelimen takapuolta vasten, kunnes se värisee",
        programming: "Kortti ohjelmoitu",
        programmingTodo: "Kortin ohjelmointi",
        programmingRunning: "Korttia ohjelmoidaan",
        programmingFailed: "Korttia ei ohjelmoitu",
        programmingCaption: "Älä liikuta korttia",
        activating: "Kortti aktivoitu",
        activatingTodo: "Kortin aktivointi",
        activatingRunning: "Korttia aktivoidaan",
        activatingFailed: "Korttia ei aktivoitu",
        activatingPending: "Aktivointi kesken",
        activatingCaption: "Rele rekisteröi tämän puhelimen",
        prepTitle: "Valmistellaan…",
        prepSubtitle: "Kaksi tarkistusta ennen korttia",
        holdIos: "Pidä korttia puhelimen yläpuolella",
        holdAndroid: "Pidä korttia puhelimen takapuolta vasten",
        holdSubtitle: "Tyhjä BoltCard",
        keepTitle: "Pidä kortti paikallaan",
        keepSubtitle: "Ohjelmointi lompakollesi",
        almostTitle: "Melkein valmista",
        almostSubtitle: "Voit siirtää kortin pois",
        doneTitle: "Kortti lisätty",
        doneSubtitle: "Lataa se, jotta voit käyttää sitä",
        failedTitle: "Lisääminen ei onnistunut",
        failedNothing: "Korttiin ei kirjoitettu mitään",
        failedGoesOn: "Se jatkuu siitä, mihin se jäi",
        notificationsDenied: "Ilmoitukset estetty",
        notificationsDeniedCaption: "Salli ne puhelimen asetuksissa ja yritä uudelleen.",
        nfcUnavailable: "NFC ei käytettävissä",
        lost: "Kortti siirrettiin pois liian aikaisin",
        lostIos:
          "Tuo se uudelleen lähelle ja pidä paikallaan, kunnes vahvistus näkyy: lisääminen jatkuu siitä, mihin se jäi.",
        lostAndroid:
          "Tuo se uudelleen lähelle ja pidä paikallaan, kunnes puhelin värisee: lisääminen jatkuu siitä, mihin se jäi.",
        relayUnreachable: "Rele ei tavoitettavissa",
        relayUnreachableCaption:
          "{{host}} ei vastaa: tarkista tämän puhelimen yhteys ja yritä uudelleen",
        relayIncompatible: "Rele ei yhteensopiva",
        relayIncompatibleCaption:
          "{{host}} ei puhu odotettua versiota: päivitä sovellus ja yritä uudelleen",
        recordsUnreachable: "Tilin releet eivät vastaa",
        recordsUnreachableCaption:
          "Liian harva tilisi rele vastaa: tarkista tämän puhelimen yhteys ja yritä uudelleen",
        notBlank: "Kortti ei ole tyhjä",
        notBoltCard: "Kortti ei ole yhteensopiva",
        notBoltCardCaption:
          "Tämä kortti ei ole BoltCard (NTAG 424 DNA): tuo lähelle tyhjä BoltCard",
        ownCard: "Kortti on jo lisätty",
        verifyFailed: "Tarkistus epäonnistui",
        cancelled: "Kortin luku peruttu",
        failed: "Lisääminen epäonnistui: yritä uudelleen",
        recharge: "Lataa kortti",
        later: "Myöhemmin",
        cancel: "Peruuta",
        stateTodo: ": tulossa",
        stateRunning: ": käynnissä",
        stateDone: ": valmis",
        stateFailed: ": epäonnistui",
        stateWarning: ": tarkistettava"
      },
      migration: {
        heading: "Kortin siirto",
        foundTitle: "Swiss Bitcoin Pay -kortti havaittu",
        toTransfer: "Siirrettävä saldo",
        reading: "Saldoa luetaan…",
        amountA11y: "{{amount}} sats",
        whatLabel: "Mitä tapahtuu",
        whatTransfer: "Sen saldo siirretään kortin lompakkoon sovelluksessasi.",
        whatErase:
          "Tuot kortin lähelle toisen kerran: se tyhjennetään ja ohjelmoidaan sitten lompakollesi.",
        whatVisual: "Se säilyttää kuvansa ja numeronsa.",
        confirm: "Siirrä ja migratoi",
        label: "Migratoinnin vaiheet",
        transferred: "Saldo siirretty",
        transferTodo: "Saldon siirto",
        transferRunning: "Saldoa siirretään",
        recognized: "Kortti tunnistettu",
        recognizedTodo: "Kortin tunnistus",
        recognizedRunning: "Korttia tunnistetaan",
        recognizedFailed: "Korttia ei tunnistettu",
        recognizedCaption: "Sen lompakko säilyttää sen, minkä se on jo siirtänyt",
        nothingCaption: "Ei siirrettävää saldoa",
        receivedCaption: "{{amount}} vastaanotettu",
        sendingCaption: "{{amount}} matkalla",
        heldSecond: "Kortti tuotu lähelle toisen kerran",
        heldSecondTodo: "Kortin tuominen lähelle toisen kerran",
        heldAgain: "Kortti tuotu lähelle vielä kerran",
        heldAgainTodo: "Kortin tuominen lähelle vielä kerran",
        programmed: "Kortti tyhjennetty ja ohjelmoitu",
        programmedTodo: "Kortin tyhjennys ja ohjelmointi",
        programmedRunning: "Korttia tyhjennetään ja ohjelmoidaan",
        activated: "Kortti aktivoitu",
        doneTitle: "Kortti migratoitu",
        doneSubtitle: "Se maksaa nyt omasta lompakostaan, rajojensa puitteissa.",
        doneSubtitleVisual:
          "Se säilyttää kuvansa ja numeronsa, ja maksaa nyt omasta lompakostaan, rajojensa puitteissa.",
        failedTitle: "Migratointi ei onnistunut",
        failedGoesOn: "Se jatkuu siitä, mihin se jäi",
        failed: "Migratointi epäonnistui: yritä uudelleen",
        notTransferred: "Saldoa ei siirretty",
        transferUnconfirmed: "Siirtoa ei vahvistettu",
        lostIos:
          "Tuo se uudelleen lähelle ja pidä paikallaan, kunnes vahvistus näkyy: migratointi jatkuu siitä, mihin se jäi.",
        lostAndroid:
          "Tuo se uudelleen lähelle ja pidä paikallaan, kunnes puhelin värisee: migratointi jatkuu siitä, mihin se jäi.",
        transferTitle: "Saldon siirto",
        transferSubtitle: "{{amount}} siirtyy kortin lompakkoon. Pidä kortti käden ulottuvilla.",
        keepTitle: "Pidä kortti paikallaan",
        keepSubtitle: "Tyhjennys ja ohjelmointi: älä liikuta sitä.",
        almostTitle: "Melkein valmista",
        almostSubtitle: "Voit siirtää kortin pois.",
        holdSecond: "Tuo kortti lähelle toisen kerran",
        holdAgain: "Tuo kortti lähelle vielä kerran",
        holdSubtitleIos:
          "Puhelimen yläpuolella, kunnes vahvistus näkyy: se tyhjennetään ja ohjelmoidaan sitten.",
        holdSubtitleAndroid:
          "Puhelimen takapuolta vasten, kunnes se värisee: se tyhjennetään ja ohjelmoidaan sitten.",
        finish: "Valmis"
      }
    },
    // "Cards", the screen.
    home: {
      firstCard: "Lisää ensimmäinen korttisi",
      newCard: "Uusi kortti",
      addLead: "Tyhjä BoltCard maksaa omasta itsehallinnoidusta lompakostaan, jonka lataat täällä.",
      steps: {
        program: {
          title: "Ohjelmoi se",
          caption: "Pidä tyhjää korttia puhelintasi vasten: puhelin ohjelmoi sen."
        },
        recharge: {
          title: "Lataa se",
          caption: "Kortilla on oma lompakkonsa: lähetä sille satsit, joita se voi käyttää."
        },
        pay: {
          title: "Maksa yhdellä eleellä",
          caption:
            "Vie kortti kauppiaan maksupäätteen lähelle: se maksaa valitsemiesi rajojen puitteissa."
        }
      },
      reading: "Saldoa luetaan…",
      received: "{{amount}} vastaanotettu",
      balanceA11y: "Kortin saldo: {{amount}} satsia",
      withdraw: "Nosta",
      withdrawA11y: "Nosta kortilta",
      history: "Historia",
      rechargeA11y: "Lataa kortti",
      historyCaption: "Kaikki kortin tapahtumat",
      withdrawEmpty: "Ei nostettavaa",
      sendCaption: "Toiseen lompakkoon",
      sendCaptionMain: "Toiseen lompakkoon tai pääsaldooni",
      migratingNote:
        "Tämän kortin migratointi on kesken: se ei vielä maksa. Se, minkä se on jo siirtänyt, on sen lompakossa alla.",
      finishMigration: "Viimeistele migratointi",
      finishOnPhone: "Viimeistele se puhelimesi sovelluksessa, kortti sitä vasten.",
      security: "Turvallisuus",
      pause: "Aseta tauolle",
      pauseCaption: "Se hylkää kaikki maksut unohtamatta mitään. Kytkin ottaa sen taas käyttöön.",
      limits: "Rajat",
      payees: "Maksut ilman vahvistusta",
      payeesReading: "Luetaan…",
      payeesPending: "ei vielä releillä",
      payeesUnread: "Ei vielä luettu",
      payeesNewer: "Päivitä sovellus",
      card: "Kortti",
      customize: "Mukauta",
      customizeCaption: "Nimi ja ulkoasu",
      customizeIssuer: "Nimi · myöntäjän kuva",
      relay: "Rele ja ohjelmointi",
      advanced: "Lisäasetukset",
      advancedRelayReady: "Rele valmis",
      delete: "Poista kortti",
      deleteCaption: "Kortti ja kaikki sen tiedot poistuvat sovelluksesta",
      deleteUnread: "Sen saldo on ensin luettava"
    },
    // "Limits".
    limits: {
      edit: "Muuta",
      back: "Takaisin rajoihin",
      reading: "Maksuja luetaan…",
      unread: "Tilisi releet eivät vastanneet: kortin jo maksamaa ei näytetä.",
      unreadPhone: "Tämän puhelimen maksuja ei voitu lukea: kortin jo maksamaa ei näytetä.",
      notePhone:
        "Tämän puhelimen maksujen mukaan. Ikkunat liukuvat: jokainen maksu vapautuu 24 h (tai 1 h) sen jälkeen.",
      noteWeb:
        "Tilisi releiden säilyttämien kortin maksujen mukaan. Ikkunat liukuvat: jokainen maksu vapautuu 24 h (tai 1 h) sen jälkeen.",
      at: "klo {{time}}",
      tomorrowAt: "huomenna klo {{time}}",
      on: "{{date}}",
      confirm: "Vahvista pääsyavaimellani",
      fiatHint: "Eli {{fiat}} nykyisellä kurssilla · enintään {{max}} satsia",
      satsHint: "Enintään {{max}} satsia",
      countHint: "Enintään {{max}}",
      preview: {
        reached: "Raja saavutettu",
        hourLeft_one: "Jäljellä {{count}} maksu",
        hourLeft_other: "Jäljellä {{count}} maksua",
        hourNext: "Seuraava maksu mahdollinen {{when}}"
      },
      day: {
        title: "24 tunnissa",
        of: "/ {{max}} satsia",
        limit: "Raja: {{max}} satsia",
        left: "Jäljellä {{amount}} satsia eli {{fiat}}",
        leftSats: "Jäljellä {{amount}} satsia",
        reached: "Raja saavutettu: kortti hylkää kaikki maksut",
        release: "{{amount}} satsia vapautuu {{when}}",
        lead: "Maksu, joka viimeisten 24 tunnin maksujen kanssa ylittäisi tämän rajan, hylätään.",
        used: "Jo käytetty: {{amount}} satsia.",
        field: "Raja 24 tunnissa",
        belowUsed:
          "Olet jo käyttänyt {{amount}} satsia: kortti hylkää kaikki maksut, kunnes ikkuna vapautuu.",
        belowPayment:
          "Pienempi kuin maksukohtainen raja ({{amount}} satsia): tämä 24 tunnin raja rajoittaa jokaista maksua."
      },
      hour: {
        title: "Tämä tunti",
        of_one: "maksu / {{max}}",
        of_other: "maksua / {{max}}",
        limit_one: "Raja: {{count}} maksu tunnissa",
        limit_other: "Raja: {{count}} maksua tunnissa",
        release: "Klo {{paid}} tehty maksu vapautuu {{when}}",
        reached: "Raja saavutettu: seuraava maksu mahdollinen {{when}}",
        formTitle: "Maksuja tunnissa",
        lead: "Maksu, joka viimeisen tunnin maksujen kanssa ylittäisi tämän määrän, hylätään.",
        used_one: "Jo tällä tunnilla: {{count}} maksu.",
        used_other: "Jo tällä tunnilla: {{count}} maksua.",
        field: "Maksuja tunnissa",
        belowUsed_one:
          "Olet jo tehnyt {{count}} maksun tällä tunnilla: kortti hylkää kaikki maksut, kunnes ikkuna vapautuu.",
        belowUsed_other:
          "Olet jo tehnyt {{count}} maksua tällä tunnilla: kortti hylkää kaikki maksut, kunnes ikkuna vapautuu."
      },
      payment: {
        title: "Maksua kohden",
        caption: "Suurempi maksu hylätään",
        lead: "Tätä rajaa suurempi maksu hylätään.",
        field: "Maksukohtainen raja",
        aboveDay:
          "Suurempi kuin 24 tunnin raja ({{amount}} satsia): 24 tunnin raja rajoittaa jokaista maksua."
      }
    },
    // "Customize": a card's "Name" and "Look".
    customize: {
      title: "Muokkaa korttia",
      name: "Nimi",
      clear: "Tyhjennä nimi",
      taken: "Toisen korttisi nimi on jo {{name}}. Eri nimi erottaa ne toisistaan maksettaessa.",
      look: "Ulkoasu",
      lookKind: "Ulkoasun tyyppi",
      color: "Väri",
      image: "Kuva",
      // Read by screen readers only.
      colors: {
        ink: "Muste",
        night: "Yö",
        plum: "Luumu",
        bordeaux: "Viininpunainen",
        fir: "Kuusi",
        lagoon: "Laguuni",
        copper: "Kupari",
        bitcoin: "Bitcoin"
      },
      choosePhoto: "Valitse valokuva",
      chooseImage: "Valitse kuva",
      takePhoto: "Ota kuva",
      imageNote: "Rajaat sen sen jälkeen kortin muotoon. Se korvaa värin.",
      errors: {
        photoDenied: "Salli kuvien käyttö laitteen asetuksista ja yritä uudelleen.",
        cameraDenied: "Kamera ei avaudu. Salli se laitteen asetuksista ja yritä uudelleen.",
        unreadable: "Tätä kuvaa ei voi käyttää. Valitse toinen.",
        imageUnpublished:
          "Kuvaa ei voitu tallentaa tilisi releille. Tarkista yhteys ja yritä uudelleen.",
        failed: "Korttia ei voitu muuttaa. Yritä uudelleen."
      }
    },
    // "Frame the image".
    frame: {
      title: "Rajaa kuva",
      hint: "Siirrä vetämällä, zoomaa nipistämällä tai painikkeilla.",
      hintWeb: "Siirrä kuvaa vetämällä; rulla tai painikkeet zoomaavat sitä.",
      area: "Rajattava kuva",
      zoomValue: "Zoomaus {{zoom}}",
      zoomIn: "Lähennä",
      zoomOut: "Loitonna",
      moveLeft: "Siirrä kuvaa vasemmalle",
      moveRight: "Siirrä kuvaa oikealle",
      moveUp: "Siirrä kuvaa ylös",
      moveDown: "Siirrä kuvaa alas",
      use: "Käytä tätä kuvaa"
    },
    status: {
      active: "Aktiivinen",
      suspended: "Tauolla",
      migrating: "Migratointi kesken"
    },
    sync: {
      ready: "Valmis",
      noPush: "Ei ilmoituksia",
      unreachable: "Rele ei vastaa",
      refused: "Releen virhe"
    },
    onPhone: {
      label: "Puhelimessasi",
      openApp: "Avaa sattle.me puhelimessasi",
      openAppScan: "Tai skannaa tämä koodi puhelimella: se avaa « Kortit » sovelluksessa.",
      hold: "Tuo kortti puhelimen lähelle",
      code: "QR-koodi, joka avaa « Kortit » puhelimesi sovelluksessa"
    },
    relay: {
      checking: "Korttia tarkistetaan…",
      readyTitle: "Kortti on valmis",
      readyBody:
        "Sen rele, {{host}}, herättää tämän puhelimen jokaisessa maksussa. Sillä ei ole avaimia eikä varoja.",
      stateTitle: "Kortin tila",
      reachable: "Rele tavoitettavissa",
      defaultCaption: "{{host}}, oletusrele",
      programmed: "Kortti ohjelmoitu tälle releelle",
      programmedCaption: "Sen seuraavia napautuksia odotetaan siellä",
      notWoken: "Tätä puhelinta ei herätetä",
      notWokenCaption:
        "Ilmoitukset pois päältä: kortti maksaa vain, kun sovellus on auki tässä puhelimessa.",
      noTokenCaption:
        "Tämä puhelin ei saa maksuilmoituksia: kortti maksaa vain, kun sovellus on auki tässä puhelimessa.",
      enableNotifications: "Ota ilmoitukset käyttöön",
      unreachable: "Rele ei vastaa",
      unreachableCaption:
        "{{host}} ei vastannut tälle puhelimelle: kortti ei voi maksaa, ennen kuin se vastaa.",
      refused: "Releen virhe",
      refusedCaption:
        "{{host}} hylkäsi kortin kanavan: kortti ei voi maksaa niin kauan kuin rele hylkää sen.",
      uncheckedTitle: "Tilaa ei tarkistettu",
      uncheckedCaption:
        "Kortin tilaa ei voitu lukea tällä puhelimella. Yritä hetken kuluttua uudelleen.",
      change: "Vaihda rele",
      changeCaption: "Releelle, jota ylläpidät itse",
      sourceLink: "sattleme/relay github.comissa",
      webCaption: "Se herättää puhelimesi jokaisella kortin maksulla, ilman avaimia tai varoja.",
      webNote:
        "Tietokone ei voi lukea NFC-kortteja: kortti ohjelmoidaan sovelluksessa puhelimella.",
      webNoteAndroid:
        "Selain ei voi ohjelmoida korttia: se ohjelmoidaan sattle.me:n Android-sovelluksessa.",
      webNoteIphone:
        "Selain ei voi ohjelmoida korttia: se ohjelmoidaan sattle.me:n iPhone-sovelluksessa.",
      deviceNote:
        "Tämä laite ei voi lukea NFC-kortteja: kortti ohjelmoidaan sovelluksessa puhelimella.",
      webOnPhone: "Puhelimessa",
      webStepsTitle: "Puhelimessasi, kortti kädessä",
      webHoldCaption: "Kun sovellus pyytää sitä, vaiheiden loppuun asti.",
      defaultLink: "Oletusrele",
      fieldInvalid: "Anna täydellinen osoite",
      fieldLong: "Anna enintään {{max}} merkin osoite",
      fieldUnreachable: "Rele ei vastaa: tarkista osoite",
      fieldIncompatible: "Rele ei sovi tälle kortille",
      moved: "Kortti kulkee nyt releen {{host}} kautta",
      steps: {
        label: "Releen vaihdon vaiheet",
        relay: "Uusi rele tavoitettavissa",
        relayTodo: "Uuden releen tarkistus",
        relayRunning: "Uutta relettä tarkistetaan",
        relayFailed: "Uutta relettä ei tarkistettu",
        relayCaption: "{{host}}, odotettu versio",
        card: "Kortti tuotu lähelle",
        cardTodo: "Kortin tuominen lähelle",
        cardRunning: "Odotetaan korttia",
        cardFailed: "Korttia ei tunnistettu",
        cardAndroid: "Puhelimen takapuolta vasten, kunnes se värisee",
        cardIos: "Puhelimen yläpuolella, kunnes vahvistus näkyy",
        programming: "Ohjelmoitu tälle releelle",
        programmingTodo: "Ohjelmointi tälle releelle",
        programmingRunning: "Ohjelmoidaan tälle releelle",
        programmingFailed: "Ei ohjelmoitu tälle releelle",
        programmingCaption: "Älä liikuta korttia",
        former: "Edellinen rele unohdettu",
        formerTodo: "Edellisen releen unohtaminen",
        formerRunning: "Edellistä relettä unohdetaan",
        formerFailed: "Edellistä relettä ei unohdettu",
        formerCaption: "{{relay}} ei enää saa sen napautuksia",
        formerDown: "Edellinen rele ei vastaa",
        formerDownCaption: "{{relay}} ei vastannut: sen kanava jää sinne, ilman vaikutusta",
        formerRefused: "Edellinen rele virhetilassa",
        formerRefusedCaption:
          "{{relay}} kieltäytyi unohtamasta sen kanavaa: se jää sinne, ilman vaikutusta",
        formerUnknown: "Edellinen rele tarkistettava",
        formerUnknownCaption:
          "{{relay}} vastasi vahvistamatta sitä: sen kanava saattoi jäädä sinne, ilman vaikutusta",
        lost: "Kortti siirrettiin pois liian aikaisin",
        lostAndroid:
          "Tuo se uudelleen lähelle ja pidä paikallaan, kunnes puhelin värisee: vaihto jatkuu siitä, mihin se jäi.",
        lostIos:
          "Tuo se uudelleen lähelle ja pidä paikallaan, kunnes vahvistus näkyy: vaihto jatkuu siitä, mihin se jäi.",
        holdAndroid: "Pidä {{name}} puhelimen takapuolta vasten",
        holdIos: "Pidä {{name}} puhelimen yläpuolella",
        holdSubtitle: "Se kulkee releen {{host}} kautta",
        keepTitle: "Pidä kortti paikallaan",
        keepSubtitle: "Ohjelmointi uudelle releelle",
        almostTitle: "Melkein valmista",
        almostSubtitle: "Voit siirtää kortin pois",
        doneTitle: "Kortti kulkee releen {{host}} kautta",
        doneSubtitle: "Se säilyttää nimensä, saldonsa ja asetuksensa",
        failedTitle: "Vaihto ei onnistunut",
        failedNothing: "Tähän korttiin ei kirjoitettu mitään",
        failedGoesOn: "Se jatkuu siitä, mihin se jäi",
        checkingTitle: "Uutta relettä tarkistetaan",
        relayUnreachable: "{{host}} ei vastaa: tarkista tämän puhelimen yhteys ja yritä uudelleen",
        relayIncompatible: "{{host}} ei puhu odotettua versiota",
        recordsUnreachable:
          "Liian harva tilisi rele vastaa: tarkista tämän puhelimen yhteys ja yritä uudelleen",
        cancelled: "Kortin luku peruttu",
        failed: "Vaihto epäonnistui: yritä uudelleen",
        resetNotice:
          "Kunnes vaihto onnistuu, kortti ei enää maksa eikä näy kohdassa « Kortit ». Toiminnolla « Lisää kortti » se palaa oletusreleelle saldonsa, nimensä ja rajojensa kanssa.",
        finish: "Valmis",
        cancel: "Peruuta",
        stateTodo: ": tulossa",
        stateRunning: ": käynnissä",
        stateDone: ": valmis",
        stateFailed: ": epäonnistui",
        stateWarning: ": tarkistettava"
      }
    },
    history: {
      title: "Historia",
      subtitle: "Kortti {{name}}",
      reading: "Luetaan historiaa…",
      failed: "Tilisi releet eivät vastanneet: historiaa ei voida näyttää.",
      legacyUnread:
        "Kaikki tilisi releet eivät vastanneet: kortin vanhempia tapahtumia voi puuttua.",
      ownOnly: "Tilisi releet eivät vastanneet: muiden puhelimiesi tekemiä maksuja voi puuttua.",
      walletFailed:
        "Kortin lompakkoa ei voitu lukea: sen viimeisimmät lataukset ja nostot voivat puuttua.",
      newer: "Jotkin tapahtumat näkyvät vain sovelluksen uudemmassa versiossa.",
      empty: "Tällä kortilla ei ole tapahtumia.",
      pendingGroup: "Käynnissä",
      deposit: "Bitcoin-talletus",
      depositConfirming: "Vastaanotettu · odottaa vahvistusta",
      depositClaiming: "Vahvistettu · lisätään saldoon",
      depositFees: "Odottaa pienempiä kuluja: pyydetty {{asked}}, enintään {{max}}",
      depositFeesUnknown: "Odottaa pienempiä kuluja: enintään {{max}} satsia",
      at: "{{time}} · {{what}}",
      paid: "Maksettu",
      refused: "Hylätty: {{reason}}",
      refusedPlain: "Hylätty",
      failedRow: "Epäonnistui: mitään ei lähtenyt",
      uncertain: "Epävarma: saattoi lähteä",
      sending: "Lähetetään",
      noName: "Korttimaksu",
      recharge: "Lataus",
      recovered: "Palautetut varat",
      return: "Nosto",
      toMain: "Pääsaldooni",
      ways: {
        main: "Pääsaldostani",
        invoice: "Lightning-lasku",
        address: "Lightning-osoite",
        onchain: "Bitcoin-osoite",
        onchainFee: "Bitcoin-osoite, kulut {{fee}}",
        lnurl: "LNURL-linkki",
        spark: "Spark-osoite"
      },
      means: {
        main: "Pääsaldoni",
        invoice: "Lightning-lasku",
        address: "Lightning-osoite",
        onchain: "Bitcoin-osoite",
        lnurl: "LNURL-linkki",
        spark: "Spark-osoite"
      },
      showMonth: "Näytä {{month}}",
      showMonthAll: "Näytä koko {{month}}",
      monthFailed: "Tätä kuukautta ei voitu lukea: tilisi releet eivät vastanneet.",
      monthIncomplete: "Osaa näytetyistä kuukausista ei voitu lukea.",
      legacy: {
        pinNeeded:
          "Tämän kortin Swiss Bitcoin Pay -historia on suojattu PIN-koodilla, jonka annoit sille. Syötä se, niin historia lisätään tähän.",
        open: "Hae historia",
        failed: "Tämän kortin Swiss Bitcoin Pay -historiaa ei voitu hakea.",
        title: "Swiss Bitcoin Pay -historia",
        lead: "Syötä PIN-koodi, jonka annoit tälle kortille Swiss Bitcoin Payssa: sen historia lisätään kortin historiaan.",
        pin: "PIN-koodi",
        submit: "Hae",
        note: "Sitä käytetään vain kerran kortin historian lukemiseen Swiss Bitcoin Payssa: sattle.me ei tallenna sitä.",
        errors: {
          pinInvalid: "Väärä PIN-koodi",
          pinLocked:
            "Liian monta yritystä: Swiss Bitcoin Pay hylkää tämän PIN-koodin hetkeksi. Yritä myöhemmin uudelleen.",
          failed: "Historiaa ei voitu hakea. Tarkista yhteys ja yritä uudelleen."
        }
      },
      reasons: {
        declined: "ei vahvistettu puhelimessa",
        newPayee: "uutta kauppiasta ei vahvistettu",
        unidentifiedPayee: "tunnistamaton kauppias, ei vahvistettu",
        unconfirmed: "ei vahvistettu ajoissa",
        insufficientBalance: "kortin saldo ei riitä",
        invalidInvoice: "virheellinen lasku",
        expired: "lasku vanhentunut",
        noAmount: "lasku ilman summaa",
        alreadyPaid: "lasku jo maksettu",
        outOfBounds: "summa rajojen ulkopuolella",
        aboveLimit: "maksukohtaisen rajan yli",
        dayLimit: "24 tunnin raja saavutettu",
        hourLimit: "liian monta maksua tällä tunnilla",
        suspended: "kortti tauolla",
        invalidTap: "virheellinen kortin luku",
        failed: "maksu epäonnistui",
        superseded: "korvattu toisella luvulla",
        unavailable: "maksua ei käsitelty"
      },
      motives: {
        declined: "Ei vahvistettu puhelimessa",
        newPayee: "Uusi kauppias, ei vahvistettu ajoissa",
        unidentifiedPayee: "Tunnistamaton kauppias, ei vahvistettu ajoissa",
        unconfirmed: "Ei vahvistettu ajoissa",
        insufficientBalance: "Kortin saldo ei riitä",
        invalidInvoice: "Virheellinen lasku",
        expired: "Lasku vanhentunut",
        noAmount: "Lasku ilman summaa",
        alreadyPaid: "Lasku jo maksettu",
        outOfBounds: "Summa rajojen ulkopuolella",
        aboveLimit: "Maksukohtaisen rajan yli",
        dayLimit: "24 tunnin raja saavutettu",
        hourLimit: "Liian monta maksua tällä tunnilla",
        suspended: "Kortti tauolla",
        invalidTap: "Virheellinen kortin luku",
        failed: "Kortin lompakko ei lähettänyt sitä",
        superseded: "Korvattu toisella kortin luvulla",
        unavailable: "Maksua ei voitu käsitellä"
      },
      detail: {
        payment: "Maksu",
        refused: "Hylätty maksu",
        failed: "Epäonnistunut maksu",
        paid: "Maksettu",
        paidWith: "Maksettu · {{payee}}",
        merchant: "Kauppias",
        payee: {
          approved: "hyväksytty kauppias",
          new: "uusi kauppias",
          unidentified: "tunnistamaton kauppias",
          unchecked: "ei tarkistettu (automaattinen tila)"
        },
        refusedPill: "Hylätty · mitään ei lähtenyt",
        failedPill: "Epäonnistui · mitään ei lähtenyt",
        uncertainPill: "Epävarma · saattoi lähteä",
        sendingPill: "Lähetetään",
        refusedMotive: "Hylätty",
        failedMotive: "Kortin lompakko ei lähettänyt sitä",
        date: "Päivämäärä",
        value: "Arvo",
        valueThen: "Tapahtumahetkellä: {{fiat}}",
        valueNow: "Nyt: {{fiat}}",
        valueNowReading: "Nyt: luetaan kurssia",
        valueNowUnknown: "Nyt: kurssi ei saatavilla",
        note: "Viesti",
        motive: "Syy",
        fees: "Kulut",
        noFee: "Ei kuluja",
        feeDeducted: "{{fee}}, vähennetty",
        way: "Maksutapa",
        to: "Kohde",
        mainBalance: "Pääsaldoni",
        received: "Vastaanotettu",
        description: "Kuvaus",
        transaction: "Transaktio",
        copyTx: "Kopioi transaktion tunniste",
        txCopied: "Transaktion tunniste kopioitu",
        openTx: "Näytä transaktio palvelussa {{explorer}}",
        approve: "Hyväksy tämä kauppias",
        approveNote:
          "Pääsyavaintasi pyydetään. Sen seuraavat maksut menevät läpi ilman vahvistusta kortin rajoissa.",
        approved: "Kauppias hyväksytty tälle kortille",
        approvedNote:
          "Kauppias hyväksytty: sen seuraavat maksut menevät läpi ilman vahvistusta kortin rajoissa.",
        approveFailed: "Kauppiasta ei voitu hyväksyä. Yritä uudelleen.",
        homonym:
          "Sama nimi kuin hyväksytyllä kauppiaalla, mutta eri tili: sen voi hyväksyä vain vahvistamalla maksun siellä, paikan päällä tarkistettuasi."
      }
    },
    sheet: {
      close: "Sulje",
      nameInvalid: "Yksi rivi, enintään {{max}} merkkiä.",
      save: "Tallenna",
      ceilingInvalid: "Kokonaisluku satseja, 1–{{max}}.",
      hourInvalid: "Kokonaisluku, 1–{{max}}.",
      relayHint:
        "Rele herättää puhelimesi, kun kassa lukee kortin; sillä ei ole avaimia eikä varoja. Kortti ohjelmoidaan uudelleen: pidä se käden ulottuvilla.",
      relayField: "Releen osoite",
      relayPlaceholder: "rele.example.com",
      program: "Ohjelmoi kortti",
      back: "Takaisin",
      done: "Valmis",
      failedTitle: "Toiminto ei onnistunut",
      changeFailed: "Muutosta ei voitu tallentaa. Yritä uudelleen.",
      nfcSuccess: "Kortti valmis",
      nfcFailure: "Toiminto keskeytyi"
    },
    delete: {
      card: {
        drainBody:
          "Siinä on vielä <strong>{{amount}}</strong>. Tyhjennä se lightning-, bitcoin- tai Spark-osoitteeseen ennen poistamista.",
        drainBodyArriving:
          "Siinä on vielä <strong>{{amount}}</strong>, ja <strong>{{arriving}}</strong> on saapumassa Bitcoin-osoitteeseen. Tyhjennä se, ja uudelleen kun nämä <strong>{{arriving}}</strong> on lisätty.",
        drainBodyArrivingOnly:
          "<strong>{{arriving}}</strong> on saapumassa tämän kortin Bitcoin-osoitteeseen. Tyhjennä se, kun nämä satsit on lisätty, ennen poistamista."
      },
      drainTitle: "Tyhjennä ensin <accent>{{name}}</accent>",
      drainBody:
        "Siinä on vielä <strong>{{amount}}</strong>. Nosta ne pääsaldoosi ennen kuin poistat sen.",
      drainBodyArriving:
        "Siinä on vielä <strong>{{amount}}</strong>, ja <strong>{{arriving}}</strong> on tulossa Bitcoin-osoitteeseen. Nosta sen saldo pääsaldoosi ja sitten nämä <strong>{{arriving}}</strong>, kun ne on lisätty.",
      drainBodyArrivingOnly:
        "<strong>{{arriving}}</strong> on tulossa tämän kortin Bitcoin-osoitteeseen. Nosta ne pääsaldoosi, kun ne on lisätty, ennen kuin poistat sen.",
      drainConfirm: "Nosta",
      title: "Poista {{name}}",
      gone: "Poistetaan pysyvästi",
      goneSettings: "Sen nimi ja asetukset, hyväksytyt kauppiaat mukaan lukien",
      goneHistory: "Sen historia",
      goneAddress: "Sen Lightning-osoite",
      inHand: "Kortti on minulla",
      inHandCaption: "Puhelinta vasten pidettynä siitä tulee taas tyhjä",
      confirm: "Poista kortti",
      withoutTitle: "Poistetaanko {{name}} ilman korttia?",
      withoutBody:
        "Sen tiedot poistetaan, eikä sillä voi enää koskaan maksaa. Jos löydät sen, « Lisää kortti » tekee siitä tyhjän.",
      withoutConfirm: "Poista",
      cardLabel: "Kortti",
      withCard: "Se on minulla",
      withCardCaption: "Siitä tulee taas tyhjä",
      withoutCard: "Se ei ole minulla",
      withoutCardCaption: "Se ei maksa enää koskaan",
      withoutNote: "Jos löydät sen, « Lisää kortti » puhelimesi sovelluksessa tekee siitä tyhjän.",
      webUnder: "« {{inHand}} » pysyy valittuna.",
      webHoldCaption: "Kun sovellus pyytää sitä.",
      understood: "Selvä",
      deleting: "Poistetaan…",
      failedTitle: "Poisto ei onnistunut",
      failedBody: "Yritä uudelleen; jos ongelma jatkuu, ota yhteyttä tukeen.",
      done: "{{name}} on poistettu",
      pendingCaption:
        "Tilisi releet eivät ole vielä tallentaneet sen poistoa: se viimeistellään seuraavassa synkronoinnissa",
      steps: {
        screen: "Poista kortti",
        label: "Poiston vaiheet",
        prepTitle: "Valmistellaan…",
        prepSubtitle: "Kortin saldoa tarkistetaan",
        holdAndroid: "Pidä {{name}} puhelimen takapuolta vasten",
        holdIos: "Pidä {{name}} puhelimen yläpuolella",
        holdSubtitle: "Siitä tulee taas tyhjä, sitten sen tiedot poistetaan",
        keepTitle: "Pidä kortti paikallaan",
        keepSubtitle: "Siitä tulee taas tyhjä",
        almostTitle: "Melkein valmista",
        almostSubtitle: "Voit siirtää kortin pois",
        doneSubtitle: "Kortti on tyhjä: anna se pois, tai lisää se uutena korttina",
        notThisTitle: "Tämä ei ole {{name}}",
        notThisSubtitle: "Esitettyyn korttiin ei tehty muutoksia",
        notThisCaption:
          "Tai se on ohjelmoitu uudelleen muualla. Mitään ei muutettu: tuo oikea kortti lähelle.",
        failedNothing: "Korttiin ei tehty muutoksia",
        failedGoesOn: "Se ei enää maksa: « Yritä uudelleen » viimeistelee poiston",
        emptied: "Saldo nostettu",
        emptiedTodo: "Saldon tarkistus",
        emptiedRunning: "Saldoa tarkistetaan",
        emptiedFailed: "Saldoa ei nostettu",
        emptiedCaption: "Kortti on tyhjä",
        unchecked: "Saldoa ei tarkistettu",
        uncheckedCaption:
          "Sen poisto oli jo tallennettu: sen jälkeen saapuneet satsit näkyvät yhä kohdassa « Kortit »",
        held: "Kortti tuotu lähelle",
        heldTodo: "Kortin tuominen lähelle",
        heldRunning: "Odotetaan korttia",
        heldFailed: "Korttia ei tunnistettu",
        heldAndroid: "Puhelimen takapuolta vasten, kunnes se värisee",
        heldIos: "Puhelimen yläpuolella, kunnes vahvistus näkyy",
        blank: "Kortti tyhjennetty",
        blankTodo: "Kortin tyhjennys",
        blankRunning: "Korttia tyhjennetään",
        blankFailed: "Korttia ei tyhjennetty",
        blankCaption: "Älä liikuta korttia",
        erased: "Tiedot poistettu",
        erasedTodo: "Tietojen poisto",
        erasedRunning: "Tietoja poistetaan",
        erasedFailed: "Tietoja ei poistettu",
        erasedCaption: "Sen nimi, asetukset, historia ja Lightning-osoite",
        erasedLater: "Poisto kesken",
        erasedLaterCaption:
          "Kaikki tilisi releet eivät vastanneet: poisto jatkuu seuraavassa synkronoinnissa",
        lost: "Kortti siirrettiin pois liian aikaisin",
        lostAndroid:
          "Tuo se uudelleen lähelle ja pidä paikallaan, kunnes puhelin värisee: poisto jatkuu siitä, mihin se jäi.",
        lostIos:
          "Tuo se uudelleen lähelle ja pidä paikallaan, kunnes vahvistus näkyy: poisto jatkuu siitä, mihin se jäi.",
        cancelled: "Kortin luku peruttu",
        failed: "Poisto epäonnistui: yritä uudelleen",
        noCard: "Kortti ei ole minulla",
        finish: "Valmis",
        cancel: "Peruuta",
        stateTodo: ": tulossa",
        stateRunning: ": käynnissä",
        stateDone: ": valmis",
        stateFailed: ": epäonnistui",
        stateWarning: ": tarkistettava"
      }
    },
    drain: {
      intro:
        "Kortin koko saldo lähtee lightning-, bitcoin- tai Spark-osoitteeseen: kirjoita, liitä tai skannaa se. Kulut otetaan tästä saldosta.",
      introNoScan:
        "Kortin koko saldo lähtee lightning-, bitcoin- tai Spark-osoitteeseen: kirjoita tai liitä se. Kulut otetaan tästä saldosta.",
      placeholder: "Lightning-, bitcoin- tai Spark-osoite",
      invoice: "Käytä lightning-, bitcoin- tai Spark-osoitetta",
      total: "Kortin saldo",
      received: "Vastaanottaja saa",
      feesAbove: "Kulut ylittävät kortin saldon tällä nopeudella",
      empty: "Kortilla ei ole mitään nostettavaa.",
      quoteFailed:
        "Tyhjennystä ei voitu valmistella. Tarkista vastaanottaja ja internetyhteys ja yritä uudelleen.",
      done: "{{amount}} nostettu: kortti on tyhjä.",
      pending: "{{amount}} nosto on lähtenyt: se saapuu, kun se on valmis.",
      failed: "Nosto ei onnistunut. Tarkista kortin saldo ja yritä uudelleen."
    },
    modifiedPhone: {
      title: "Tämä puhelin on vähemmän turvallinen",
      body: "Se näyttää olevan muokattu (esimerkiksi « rootattu »). Jotta tämä kortti voi maksaa ilman vahvistustasi, sovellus säilyttää tässä puhelimessa sen, mitä maksamiseen tarvitaan: haitallinen sovellus voisi käyttää sitä kortin saldon kuluttamiseen. Pidä tällä kortilla vähän satseja tai valitse « Vahvista aina »."
    },
    erasedFunds: {
      card: {
        body: "{{amount}} saapui sen lompakkoon poistamisen jälkeen. Tyhjennä se lightning-, bitcoin- tai Spark-osoitteeseen.",
        bodyArriving:
          "{{amount}} saapui sen lompakkoon poistamisen jälkeen, ja {{arriving}} on vielä saapumassa sen Bitcoin-osoitteeseen. Tyhjennä se lightning-, bitcoin- tai Spark-osoitteeseen.",
        arrivingOnly:
          "{{arriving}} on saapumassa poistetun kortin Bitcoin-osoitteeseen. Voit nostaa ne, kun ne on lisätty.",
        stoppedBody:
          "Se palaa kohtaan « Kortit » saldoineen, kun lisäät sen uudelleen. {{amount}} jää sen lompakkoon: ilman korttia tyhjennä se lightning-, bitcoin- tai Spark-osoitteeseen.",
        stoppedBodyArriving:
          "Se palaa kohtaan « Kortit » saldoineen, kun lisäät sen uudelleen. {{amount}} jää sen lompakkoon, ja {{arriving}} on vielä saapumassa sen Bitcoin-osoitteeseen: ilman korttia tyhjennä se lightning-, bitcoin- tai Spark-osoitteeseen."
      },
      title: "Poistetulle kortille on tullut satseja",
      titleArriving: "Poistetulle kortille on tulossa satseja",
      body: "{{amount}} saapui sen lompakkoon poistamisen jälkeen. Nosta ne pääsaldoosi.",
      bodyArriving:
        "{{amount}} saapui sen lompakkoon poistamisen jälkeen, ja {{arriving}} on vielä tulossa sen Bitcoin-osoitteeseen. Nosta ne pääsaldoosi.",
      arrivingOnly:
        "{{arriving}} on tulossa poistetun kortin Bitcoin-osoitteeseen. Voit nostaa ne pääsaldoosi, kun ne on lisätty.",
      returned: "{{amount}} nostettiin pääsaldoosi",
      returnPending: "{{amount}} nosto lähetetty: se lisätään pääsaldoosi heti, kun se on valmis",
      failed: "Nosto ei onnistunut. Tarkista internetyhteys ja yritä uudelleen.",
      stoppedTitle: "{{card}}: uudelleenohjelmointi keskeytyi",
      stoppedBody:
        "Se palaa kohtaan « Kortit » saldoineen, kun lisäät sen uudelleen. {{amount}} on yhä sen lompakossa: ilman korttia nosta ne pääsaldoosi.",
      stoppedBodyArriving:
        "Se palaa kohtaan « Kortit » saldoineen, kun lisäät sen uudelleen. {{amount}} on yhä sen lompakossa, ja {{arriving}} on vielä tulossa sen Bitcoin-osoitteeseen: ilman korttia nosta ne pääsaldoosi."
    },
    wallet: {
      balance: "Saldo",
      pendingDeposit: "{{amount}} vastaanotettu Bitcoin-osoitteeseen, ei vielä lisätty saldoon",
      failed: "Tämän kortin lompakkoa ei voitu lukea. Tarkista internetyhteys ja yritä uudelleen.",
      recharge: "Lataa",
      return: "Nosta pääsaldooni",
      rechargeCard: "Lataa <accent>{{name}}</accent>",
      amountField: "Summa",
      rechargeAmount: "Lataa {{amount}}",
      returnAmount: "Nosta {{amount}}",
      copyInvoice: "Kopioi lasku",
      copyAddress: "Kopioi osoite",
      onchainOpenHere:
        "Lisäys tehdään, kun kortti on auki kohdassa « Kortit », täällä tai puhelimessasi.",
      fromMain: "Pääsaldostani",
      invoice: "Lightning-lasku",
      onchain: "Bitcoin-osoite",
      continue: "Jatka",
      invoiceCreate: "Luo lasku",
      invoiceDescription: "Kortin lataus",
      noFee: "Ei kuluja",
      working: "Siirto käynnissä…",
      recharged: "Korttia ladattiin {{amount}}.",
      returned: "{{amount}} nostettiin pääsaldoosi.",
      rechargePending:
        "{{amount}} lataus lähetetty: se lisätään kortin saldoon heti, kun se on valmis.",
      returnPending: "{{amount}} nosto lähetetty: se lisätään pääsaldoosi heti, kun se on valmis.",
      nothingToReturn: "Kortilla ei ole mitään nostettavaa.",
      prepareFailed:
        "Siirtoa ei voitu valmistella: mitään ei lähetetty. Tarkista internetyhteys ja yritä uudelleen.",
      transferFailed:
        "Siirto ei onnistunut. Tarkista internetyhteys ja yritä uudelleen: se lähtee vain kerran.",
      transferRefused: "Siirto epäonnistui. Tarkista saldot ennen kuin aloitat uudelleen.",
      receiveFailed:
        "Osoitetta tai laskua ei voitu luoda. Tarkista internetyhteys ja yritä uudelleen.",
      invoiceHint: "Maksettavissa kerran, mistä tahansa Lightning-lompakosta, {{date}} asti.",
      readingMain: "Luetaan pääsaldoasi…",
      otherWallet: "Muu lompakko",
      confirmRecharge: "Vahvista lataus",
      mainAvailable: "{{amount}} käytettävissä",
      change: "Vaihda",
      mainShort: "Pääsaldosi ei riitä tähän summaan",
      mainUnread: "Pääsaldoasi ei voitu lukea. Yritä hetken kuluttua uudelleen.",
      unit: "Yksikkö",
      addressNote:
        "Kortin pysyvä Lightning-osoite: jaa se, lähetetty summa lisätään kortin saldoon.",
      orAnyWallet: "tai mistä tahansa lompakosta",
      share: "Jaa",
      invoiceWaiting: "Odotetaan maksua…",
      invoicePaid: "Lasku maksettu",
      invoiceAdded: "lisätty kortin saldoon",
      finish: "Valmis",
      invoiceExpired: "Lasku vanhentunut",
      invoiceExpiredNote: "Sitä ei maksettu ennen {{date}}: kukaan ei voi enää maksaa sitä.",
      newInvoice: "Uusi lasku",
      onchainConfirmations:
        "Sinne lähettämäsi summa lisätään kortin saldoon 1–3 vahvistuksen jälkeen, enintään noin puolessa tunnissa.",
      onchainFee:
        "Kulut: enintään {{fee}}, vähennetään. Jos verkko vaatii enemmän, lisäys odottaa.",
      onchainOpen: "Lisäys tehdään, kun avaat kortin kohdassa « Kortit ».",
      toMain: "Pääsaldooni",
      fromCard: "Kortilta {{name}} · {{amount}}",
      cardHoldsOnly: "Kortilla on vain {{amount}}",
      allOf: "Kortin koko saldo · {{fiat}}",
      wholeBalance: "Kortin koko saldo",
      partOf: "{{fiat}} · kortille jää {{left}}",
      partOfSats: "Kortille jää {{left}}",
      emptyCard: "Tyhjennä kortti",
      rowFrom: "Mistä",
      rowTo: "Minne",
      rowFee: "Kulut",
      rowAfter: "Kortin saldo jälkeen",
      mainBalance: "Pääsaldoni",
      confirmPasskey: "Vahvista passkeylläni",
      copy: "Kopioi",
      copied: "Kopioitu",
      copyFailed: "Kopiointi epäonnistui"
    },
    payees: {
      approved: "Tälle kortille hyväksytyt",
      approvedCount: "$t(cards.payees.approved) · {{count}}",
      changeMode: "Vaihda tilaa",
      modeBox: {
        automatic: {
          title: "Tila: automaattinen",
          caption: "Jokainen kelvollinen tap maksetaan rajojen puitteissa"
        },
        approved: {
          title: "Tila: hyväksytyt kauppiaat",
          caption: "Muualla puhelin pyytää vahvistustasi"
        },
        confirm: {
          title: "Tila: vahvista aina",
          caption: "Jokainen maksu odottaa vahvistustasi"
        }
      },
      changeLabel: "Vaihda kortin {{name}} vahvistustila",
      approveNote:
        "Lisää kauppias valitsemalla ”$t(card.payment.approve)”, kun vahvistat maksun hänelle.",
      removeLabel: "Poista {{name}} hyväksytyistä kauppiaista",
      payments_one: "{{count}} maksu",
      payments_other: "{{count}} maksua",
      paymentsRecent_one: "{{count}} maksu 90 päivässä",
      paymentsRecent_other: "{{count}} maksua 90 päivässä",
      itsName: "Sen nimi",
      itsNode: "Sen solmu",
      nodeNote:
        "Hyväksytty Lightning-solmunsa perusteella: jos solmu on jaettu (Spark, Wallet of Satoshi, Strike…), myös kaikille sen muille käyttäjille maksetaan ilman vahvistusta kortin rajoissa.",
      approvedAs: "Hyväksytty nimellä",
      approvedOnLabel: "Hyväksytty",
      paymentsLabel: "Maksut",
      paymentsValue_one: "{{count}}, yhteensä {{amount}}",
      paymentsValue_other: "{{count}}, yhteensä {{amount}}",
      paymentsValueRecent_one: "{{count}} 90 päivässä, yhteensä {{amount}}",
      paymentsValueRecent_other: "{{count}} 90 päivässä, yhteensä {{amount}}",
      modesLabel: "Maksujen vahvistustila",
      recommended: "Suositeltu",
      confirmPasskey: "Vahvista passkeylläni",
      modes: {
        automatic: {
          title: "Automaattinen",
          body: "Jokainen kelvollinen napautus maksetaan kortin rajojen puitteissa. Kauppias näytetään ilman tarkistusta."
        },
        approved: {
          title: "Hyväksytyt kauppiaat",
          body: "Maksetaan ilman vahvistusta tunnistetulle kauppiaalle, jonka olet hyväksynyt; muualla puhelin pyytää vahvistustasi."
        },
        confirm: {
          title: "Vahvista aina",
          body: "Jokainen maksu odottaa vahvistustasi."
        }
      },
      approvedEmpty: "Ei hyväksyttyjä kauppiaita",
      approvedEmptyLead:
        "Kun vahvistat maksun tällä kortilla, valitse ”$t(card.payment.approve)”: sen seuraavat maksut lähtevät ilman vahvistusta.",
      approvedOn: "hyväksytty {{date}}",
      nameField: "Oma nimesi tälle kauppiaalle",
      nameHint: "Vain sinulle. Tyhjänä palautuu kauppiaan ilmoittama nimi.",
      remove: "Poista hyväksytyistä kauppiaista",
      removeHint: "Pääsyavaintasi pyydetään. Sen seuraavat maksut pyytävät taas vahvistustasi.",
      saveFailed: "Muutosta ei voitu tallentaa. Yritä uudelleen.",
      pending: {
        phone:
          "Tallennettu tähän puhelimeen, ei vielä tilisi releille: muut laitteesi eivät vielä näe sitä.",
        web: "Ei vielä tallennettu tilisi releille: tämä muutos katoaa, jos poistut sivulta."
      },
      failed: {
        newerApp:
          "Sovelluksen uudempi versio tallensi hyväksytyt kauppiaasi. Päivitä sovellus: siihen asti korttisi eivät maksa.",
        unreachable: "Tilisi releet eivät vastanneet: hyväksyttyjä kauppiaitasi ei voida näyttää.",
        failed: "Hyväksyttyjä kauppiaitasi ei voitu lukea."
      }
    },
    probe: {
      group: "Testit (staging)",
      row: "iOS-laajennuksen testi",
      title: "iOS-laajennuksen testi",
      noPointOfSale:
        "Tämä testi maksaa tilin Lightning-osoitteeseen: pelkkien korttien tilillä ei ole sellaista.",
      unavailable: "Tämä testi on vain staging-sovelluksessa iPhonella.",
      intro:
        "Mittaa, voiko kortti maksaa ilmoituksesta sovelluksen ollessa suljettuna. Laajennus käyttää omaa testilompakkoaan, ei koskaan tilisi lompakkoa: siinä on vain muutama sats.",
      how: "Lukitse puhelin testin käynnistämisen jälkeen: tulos näkyy ilmoituksessa ja sitten täällä. Ilmoitusten on oltava sallittuja.",
      launchGroup: "Käynnistä testi",
      profile: "SDK:n asetukset",
      profiles: {
        light: "Kevyt",
        standard: "Vakio"
      },
      modes: {
        sync: "Synkronoi",
        receive: "Vastaanota 100 satsia",
        pay: "Maksa 1 sats osoitteeseesi",
        engine: "JS-moottori (ei maksua)",
        runtime: "JS-ajoympäristö (verkko, tiedot)",
        enginePay: "JS-moottori: maksa 1 sat"
      },
      balance: "Testilompakon saldo viimeisessä testissä: {{sats}} satsia",
      sent: "Testi-ilmoitus lähetetty",
      failed: {
        unavailable: "Tässä puhelimessa ei ole ilmoituslaajennusta",
        noApiKey: "Tässä sovellusversiossa ei ole Breezin API-avainta",
        storage: "Testilompakkoa ei voitu valmistella",
        notifications: "Salli ilmoitukset käynnistääksesi testin",
        pushToken: "Ei ilmoitustunnusta: verkko, tai buildista puuttuvat APNs-tunnukset",
        invoice: "Lightning-osoitteesi ei antanut laskua",
        push: "Expon ilmoituspalvelu hylkäsi lähetyksen",
        unexpected: "Testiä ei voitu käynnistää"
      },
      notification: {
        title: "Laajennuksen testi",
        body: "Jos tämä teksti jää näkyviin, laajennus ei käsitellyt ilmoitusta."
      },
      cardText: {
        group: "Korttimaksun ilmoitus",
        intro:
          "Lähettää tähän puhelimeen korttimaksun ilmoituksen, kuten välityspalvelin: sen otsikon on näyttävä iPhonen kielellä. ”sattle.me”: laajennus ei käsitellyt sitä.",
        launch: "Lähetä korttimaksun ilmoitus",
        sent: "Korttimaksun ilmoitus lähetetty"
      },
      resultsGroup: "Tulokset",
      empty: "Ei vielä testejä.",
      outcome: {
        waiting: "Odottaa",
        none: "Ei tulosta",
        running: "Käynnissä ({{step}})",
        stopped: "Keskeytyi ({{step}})",
        ok: "Onnistui",
        failed: "Epäonnistui ({{step}})",
        expired: "Aika loppui ({{step}})"
      },
      peak: "huippu {{mb}} Mt",
      limit: "raja ≈ {{mb}} Mt",
      seconds: "{{s}} s",
      copyInvoice: "Kopioi lasku",
      invoiceCopied: "Lasku kopioitu: maksa se kohdasta « Lähetä »",
      copy: "Kopioi tulokset",
      copied: "Tulokset kopioitu",
      copyFailed: "Kopiointi epäonnistui",
      clear: "Tyhjennä tulokset"
    },
    wakes: {
      row: "Herätysloki (Android)",
      title: "Herätysloki",
      unavailable: "Tämä loki on vain staging-sovelluksessa Androidilla.",
      intro:
        "Jokainen kerta, kun kortin välitin herätti tämän puhelimen sovelluksen ollessa suljettuna tai taustalla: milloin herätys tuli ja kuinka pitkälle maksu eteni. Ei summaa, kauppiasta eikä laskua.",
      how: "Testaaminen: pyyhkäise sovellus pois viimeisimmistä sovelluksista (pakottamatta sitä lopettamaan), lukitse puhelin, vie kortti kassalle, palaa sitten tänne ja kopioi loki.",
      group: "Herätykset",
      empty: "Ei vielä herätyksiä.",
      outcome: {
        running: "Käynnissä ({{step}})",
        stopped: "Keskeytetty ({{step}})",
        notTaken: "Ohitettu",
        paid: "Maksettu",
        pending: "Lähetetty, ei vahvistettu",
        declined: "Haltija hylkäsi",
        failed: "Epäonnistui ({{reason}})",
        letGo: "Luovuttu ({{step}})",
        ended: "Päättynyt ({{step}})"
      },
      received: "tehtävä käynnistyi {{s}} s vastaanoton jälkeen",
      js: "JS käynnistetty {{s}} s aiemmin",
      silence: "pisin hiljaisuus {{s}} s",
      copy: "Kopioi loki",
      copied: "Loki kopioitu",
      copyFailed: "Kopiointi epäonnistui",
      clear: "Tyhjennä loki",
      newer: "Tämän lokin kirjoitti sovelluksen uudempi versio.",
      failed: "Lokia ei voitu lukea."
    },
    socket: {
      group: "Pysyvä yhteys",
      row: "Pysyvä yhteys",
      caption: {
        on: "Päällä",
        off: "Pois"
      },
      intro:
        "Puhelin pitää oman yhteyden korttiensa välittimeen: korttimaksu herättää sen sovelluksen ollessa suljettuna. Yhteys on oletuksena päällä ja kuluttaa hieman akkua. Pois päältä korttisi maksavat vain sovelluksen ollessa auki.",
      noRelay: "Mikään korttiesi välittimistä ei vielä tarjoa tätä yhteyttä.",
      state: {
        connecting: "yhdistetään…",
        open: "yhdistetty",
        waiting: "odottaa",
        stopped: "pysäytetty"
      },
      since: "{{time}} alkaen",
      lastMessage: "viimeisin viesti {{s}} s sitten",
      opened_one: "{{count}} yhteys",
      opened_other: "{{count}} yhteyttä",
      failures_one: "{{count}} katkos",
      failures_other: "{{count}} katkosta",
      lastFailure: "viimeisin katkos: {{code}}",
      wakes_one: "{{count}} herätys",
      wakes_other: "{{count}} herätystä",
      battery: {
        applied: "Akun optimointi koskee sovellusta: Android voi katkaista yhteyden.",
        exempt: "Akun optimointi on pois päältä sovellukselta.",
        settings: "Akkuasetukset"
      },
      notice: {
        shown:
          "Android näyttää ilmoituksen niin kauan kuin yhteys on päällä. Piilota se kytkemällä ”Korttien yhteys” pois päältä avautuvista asetuksista: yhteys jatkuu.",
        hidden: "Ilmoitus piilotettu: yhteys jatkuu.",
        hide: "Piilota ilmoitus",
        settings: "Ilmoituksen asetukset"
      },
      service: {
        running: "Palvelu käynnissä (käynnistetty: {{reason}})",
        stopped: "Palvelu pysäytetty",
        error: "Palvelua ei voitu käynnistää ({{code}})",
        task: "Herätystä ei välitetty sovellukselle ({{code}})"
      },
      failed: "Pysyvää yhteyttä ei voitu muuttaa",
      notification: {
        channel: "Korttien yhteys",
        title: "Korttimaksut käytössä",
        text: "Yhdistetty korttiesi välittimeen maksamaan sovelluksen ollessa suljettuna",
        stop: "Pysäytä"
      }
    }
  },
  pos: {
    title: "Kassa",
    subtitle: "Ota bitcoinia vastaan tilillesi nopeasti.",
    addNote: "Lisää muistiinpano",
    editNote: "Muokkaa muistiinpanoa ”{{note}}”",
    charge: "Veloita",
    keyboardHint: "Myös näppäimistön näppäimet toimivat.",
    deleteKey: "Poista",
    satsLabel: "{{sats}} satsia",
    rateLoading: "Ladataan bitcoinin hintaa…",
    rateUnavailable: "Bitcoinin hinta ei ole saatavilla. Tarkista internetyhteys.",
    share: "Jaa maksupyyntö",
    shareLink: {
      button: "Jaa",
      hint: "Lähettää maksupyynnön asiakkaalle.",
      copiedTitle: "Linkki kopioitu",
      copied: "Liitä se viestiin asiakkaalle.",
      publishFailedTitle: "Linkkiä ei julkaistu",
      shareFailedTitle: "Linkkiä ei jaettu",
      publishFailed:
        "Linkkiä ei voitu julkaista verkkoon, joten asiakas ei löytäisi sitä. Tarkista internetyhteys ja jaa se uudelleen.",
      shareFailed: "Linkkiä ei voitu jakaa. Yritä uudelleen."
    },
    backToPos: "Takaisin kassaan",
    expiresIn: "Vanhenee",
    waiting: "Odotetaan maksua",
    creating: "Luodaan pyyntöä…",
    checking: "Tarkistetaan Bitcoin-maksua…",
    checkingPayment: "Maksua tarkistetaan…",
    lateCheck: {
      title: "Pyyntö vanhentunut",
      body: "Viime hetkellä lähetetty maksu voi vielä saapua.",
      endsIn: "Tarkistus päättyy"
    },
    // A payment whose check lasts.
    settling: {
      title: "Maksu vastaanotettu, tarkistetaan",
      body: "Tarkistus kestää tavallista kauemmin. Se jatkuu itsestään."
    },
    updatingRate: "Päivitetään tämän tunnin kurssiin…",
    networks: {
      scan: "Skannaa lompakollasi",
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      or: "tai"
    },
    onchainUnavailable: {
      explorer:
        "Bitcoin onchain ei ole käytettävissä tässä myynnissä: {{explorer}} ei pystynyt tarkistamaan Bitcoin-osoitetta ajoissa. Asiakas voi maksaa Lightning-verkossa.",
      pool: "Bitcoin onchain ei ole käytettävissä tässä myynnissä: tällä laitteella ei ole valmiita Bitcoin-osoitteita. Se valmistelee uusia aina, kun avaat lukituksen pääsyavaimellasi internetyhteyden ollessa päällä. Asiakas voi maksaa Lightning-verkossa.",
      lot: "Bitcoin onchain ei ole käytettävissä tässä myynnissä: tällä laitteella ei ole käytettävissä olevia Bitcoin-osoitteita. Yrityksen omistaja antaa sille uusia, kun hän avaa oman sovelluksensa lukituksen pääsyavaimellaan internetyhteyden ollessa päällä. Asiakas voi maksaa Lightning-verkossa."
    },
    note: {
      label: "Maksun muistiinpano",
      placeholder: "Pöytä 12"
    },
    boltcard: {
      approach: "Tai näytä BoltCard-korttia",
      tap: "Tai napauta tästä ja näytä sitten BoltCard-korttia",
      alert: "Pidä BoltCard-korttia puhelimen yläosan lähellä.",
      paying: "Korttimaksu käynnissä…",
      sent: "Korttimaksu lähetetty, odotetaan vahvistusta…",
      refusal: {
        refused: "Kortti hylätty",
        interrupted: "Korttimaksu keskeytyi",
        unread: "Korttia ei luettu",
        noReason:
          "Kortin palvelu ei kertonut syytä. Näytä kortti uudelleen tai pyydä skannaamaan koodi.",
        outOfRange: "Summa on kortin rajojen ulkopuolella. Pyydä skannaamaan koodi.",
        noAnswer:
          "Kortin palvelu ei vastannut. Näytä kortti uudelleen tai pyydä skannaamaan koodi.",
        unreadable:
          "Tämä ei ole täällä luettava maksukortti. Näytä se uudelleen tai pyydä skannaamaan koodi.",
        showCode: "Näytä koodi"
      }
    },
    paid: {
      pill: "Maksettu",
      line: "Lightning · {{time}}",
      onchainLine: "Bitcoin · {{time}}",
      mixedLine: "Bitcoin + Lightning · {{time}}"
    },
    accepted: {
      notice: "Omistaja hyväksyi vastaanotetun summan: myynti on maksettu."
    },
    unconfirmed: {
      pill: "Vahvistetaan",
      notice:
        "Asiakas on maksanut. Verkon on vielä vahvistettava tapahtuma, varaa noin puoli tuntia."
    },
    underpaid: {
      rest: "Jäljellä",
      received: "Vastaanotettu",
      restToPay: "Maksamatta",
      // The accessible name of a transaction's link on the chain card (UnderpaidChain).
      txLink: "Näytä tapahtuma {{txid}} palvelussa {{explorer}}"
    },
    underpaidEnded: {
      pill: "Osittain maksettu",
      missing: "Puuttuu",
      received: "Vastaanotetut maksut",
      confirmed: "Vahvistettu",
      confirming: "Vahvistetaan · {{done}}/{{required}}",
      notice: "Maksuaika on päättynyt: {{missing}} sats puuttuu."
    },
    expired: {
      pill: "Vanhentunut",
      notice: "Asiakas ei maksanut ajoissa. Mitään ei veloitettu.",
      recreate: "Luo pyyntö uudelleen"
    },
    disputed: {
      pill: "Tarkistettava maksu",
      notice:
        "Maksu vastaanotettiin, mutta myös toinen myynti vaatii sitä. Älä pyydä uutta maksua: tarkista se kohdassa ”$t(navigation.destinations.wallet)”.",
      noticeMember:
        "Maksu vastaanotettiin, mutta myös toinen myynti vaatii sitä. Älä pyydä uutta maksua: tilin haltija tarkistaa sen kohdassa ”$t(navigation.destinations.wallet)”."
    },
    failed: {
      network: "Maksupyyntöä ei voitu luoda. Tarkista internetyhteys ja yritä uudelleen.",
      invalid: "Maksupalvelu vastasi odottamattomasti. Yritä uudelleen.",
      limits: "Tätä summaa ei voi veloittaa: vain {{min}}–{{max}} satsia.",
      onchainOnly: {
        none: "Yli {{max}} satsin summan voi maksaa vain onchain, ja onchain-maksut on poistettu käytöstä.",
        explorer:
          "Yli {{max}} satsin summan voi maksaa vain onchain, ja {{explorer}} ei pystynyt tarkistamaan Bitcoin-osoitetta ajoissa. Yritä uudelleen.",
        pool: "Yli {{max}} satsin summan voi maksaa vain onchain, ja tällä laitteella ei ole valmiita Bitcoin-osoitteita. Se valmistelee uusia aina, kun avaat lukituksen pääsyavaimellasi internetyhteyden ollessa päällä.",
        lot: "Yli {{max}} satsin summan voi maksaa vain onchain, ja tällä laitteella ei ole käytettävissä olevia Bitcoin-osoitteita. Yrityksen omistaja antaa sille uusia, kun hän avaa oman sovelluksensa lukituksen pääsyavaimellaan internetyhteyden ollessa päällä.",
        error:
          "Yli {{max}} satsin summan voi maksaa vain onchain, ja tämän laitteen Bitcoin-osoitetta ei voitu lukea. Yritä uudelleen."
      },
      retry: "Yritä uudelleen"
    },
    // The keypad or the articles: the header's segmented control.
    mode: {
      label: "Syöttötapa",
      amount: "Summa",
      articles: "Tuotteet",
      scan: "Skannaa"
    },
    articles: {
      hint: "Lisää tuote napauttamalla sitä",
      // Without articles, on the owner's device only (ArticlesPad.tsx).
      empty: {
        reading: "Tuotteitasi luetaan…",
        unreadableTitle: "Tuotteita ei ole vielä luettu",
        unreadableBody:
          "Tuotteitasi ei voitu lukea. Tarkista internetyhteys: ne luetaan uudelleen muutaman minuutin kuluttua.",
        noneTitle: "Ei vielä tuotteita",
        noneBody:
          "Lisää tuotteesi kohdassa ”$t(navigation.destinations.articles)”: ne näkyvät sitten tässä.",
        noneBodyScan:
          "Skannaa tuote kohdassa ”$t(pos.mode.scan)” luodaksesi sen, tai lisää tuotteesi kohdassa ”$t(navigation.destinations.articles)”."
      },
      tile: "{{name}}, {{price}}",
      add: "Lisää yhden ostoskoriin",
      inBasket_one: "{{count}} ostoskorissa",
      inBasket_other: "{{count}} ostoskorissa"
    },
    basket: {
      title: "Ostoskori",
      open: "Näytä ostoskori",
      charge_one: "Veloita · {{count}} tuote",
      charge_other: "Veloita · {{count}} tuotetta",
      total: "Yhteensä",
      empty: "Ostoskori on tyhjä.",
      tooLarge: "Summa ylittää suurimman veloitettavan määrän.",
      scanMore: "Skannaa lisää tuotteita",
      less: "Vähennä tuotteen {{name}} määrää",
      more: "Lisää tuotteen {{name}} määrää",
      quantity_one: "Määrä: {{count}}",
      quantity_other: "Määrä: {{count}}"
    },
    // The scan of the point of sale: the camera, the article read last, the basket.
    scan: {
      aim: "Kohdista tuotteen viivakoodiin",
      lead: "Jokainen skannattu tuote lisätään summaan.",
      converted: "Hinta: {{price}}, muunnettu",
      unknown: {
        title: "Tuntematon viivakoodi",
        body: "Millään tuotteellasi ei ole tätä koodia. Mitään ei lisätty."
      },
      // A code read before the catalogue was (ScanPad.tsx): nothing can be told of it.
      notRead: {
        title: "Tuotteita ei ole vielä luettu",
        body: "Tätä koodia ei voitu hakea. Mitään ei lisätty: skannaa se uudelleen hetken kuluttua."
      }
    }
  },
  paymentLink: {
    // The page's switch of theme, in its header: what it does.
    themeToDark: "Vaihda tummaan teemaan",
    themeToLight: "Vaihda vaaleaan teemaan",
    payableUntil: "Maksettava viimeistään {{date}}",
    loading: "Maksupyyntöä ladataan…",
    updatingRate: "Päivitetään tämän tunnin kurssiin…",
    openWallet: "Avaa lompakkoni",
    copyInvoice: "Kopioi lasku",
    copied: "Lasku kopioitu",
    copyFailed: "Laskua ei voitu kopioida. Avaa se lompakossasi tai skannaa koodi.",
    retry: "Yritä uudelleen",
    notFound: {
      title: "Maksupyyntöä ei löydy",
      notice:
        "Tätä maksupyyntöä ei ole olemassa tai se on vanhentunut. Pyydä kauppiaalta uusi linkki.",
      invalid:
        "Tämä linkki on puutteellinen. Tarkista, että se kopioitiin kokonaan, tai pyydä kauppiaalta uusi."
    },
    unreachable: {
      title: "Ei yhteyttä",
      notice: "Maksupyyntöä ei voitu ladata. Tarkista internetyhteys ja yritä uudelleen."
    },
    failed: {
      title: "Maksupyyntö ei ole käytettävissä",
      notice:
        "Kauppiaan maksupalvelu ei pystynyt luomaan laskua. Yritä hetken päästä uudelleen tai pyydä kauppiaalta uusi linkki.",
      onchainOnly:
        "Tämän summan voi maksaa vain onchain, eikä tässä maksupyynnössä ole Bitcoin-osoitetta. Pyydä yritykseltä {{business}} toista maksutapaa."
    },
    copyAddress: "Kopioi osoite",
    addressCopied: "Osoite kopioitu",
    addressCopyFailed: "Osoitetta ei voitu kopioida. Avaa se lompakossasi tai skannaa koodi.",
    amountCopied: "Summa kopioitu",
    amountCopyFailed: "Summaa ei voitu kopioida. Avaa pyyntö lompakossasi tai skannaa koodi.",
    receipt: {
      invoice: "Lightning-lasku",
      address: "Bitcoin-osoite",
      amount: "Summa",
      copyAmount: "Kopioi summa",
      invoiceCopied: "Kopioitu",
      addressCopied: "Kopioitu",
      amountCopied: "Kopioitu",
      unit: "Yksikkö: {{unit}}, vaihda: {{next}}"
    },
    unconfirmed: {
      notice:
        "Maksusi on lähetetty. Verkon on vielä vahvistettava tapahtuma, varaa noin puoli tuntia. Voit sulkea tämän sivun."
    },
    underpaid: {
      notice:
        "Maksusi ({{received}} sats) ei kata koko summaa. Maksa loput Lightning- tai Bitcoin-verkossa.",
      noticeLightning:
        "Maksusi ({{received}} sats) ei kata koko summaa. Maksa loput Lightning-verkossa."
    },
    underpaidEnded: {
      notice:
        "Maksuaika on päättynyt: maksusi ({{received}} sats) ei kata koko summaa, {{missing}} sats puuttuu. Ota yhteyttä kauppiaaseen ({{business}}) erotuksen maksamiseksi."
    },
    details: {
      title: "Maksun tiedot",
      business: "Saaja",
      method: "Maksutapa",
      methods: {
        lightning: "Lightning",
        onchain: "Bitcoin",
        mixed: "Bitcoin + Lightning"
      },
      createdAt: "Luotu",
      transaction: "Transaktio",
      transactionNumber: "Transaktio {{number}}",
      confirmations_one: "Vahvistuksia {{count}}/{{required}}",
      confirmations_other: "Vahvistuksia {{count}}/{{required}}",
      confirmed: "Vahvistettu"
    },
    paid: {
      pill: "Maksettu",
      notice: "{{business}} on vastaanottanut maksusi.",
      continue: "Jatka sivustolle {{host}}"
    },
    accepted: {
      notice: "{{business}} hyväksyi vastaanotetun summan: maksusi on suoritettu."
    },
    expired: {
      pill: "Vanhentunut",
      notice:
        "Maksuaika on päättynyt, eikä maksua vastaanotettu. Pyydä uusi linkki kauppiaalta ({{business}})."
    },
    canceled: {
      pill: "Peruttu",
      notice:
        "{{business}} perui tämän maksupyynnön: älä maksa sitä. Pyydä uusi linkki kauppiaalta ({{business}})."
    },
    disputed: {
      pill: "Tarkistettavana",
      notice:
        "Maksusi vastaanotettiin. {{business}} tarkistaa sen vielä: älä maksa toista kertaa, ja ota tarvittaessa yhteyttä: {{business}}."
    },
    checkout: {
      newer: {
        title: "Päivitä sivu",
        notice:
          "Tämä maksulinkki on tätä sivua uudempaa muotoa. Lataa sivu uudelleen tai päivitä sovellus ja avaa linkki sitten uudelleen."
      },
      continue: "Jatka",
      redirectTo: "Uudelleenohjaus: {{target}}",
      unconfirmed: {
        notice:
          "Maksusi on lähetetty. Verkon on vielä vahvistettava tapahtuma, varaa noin puoli tuntia."
      },
      underpaid: {
        notice:
          "Maksusi ({{received}} sats) ei kata koko summaa. Maksa loput Bitcoin-verkossa samaan osoitteeseen."
      },
      expired: {
        notice:
          "Maksuaika on päättynyt eikä maksua vastaanotettu. Palaa yrityksen {{business}} kauppaan pyytämään uusi.",
        late: "Maksuaika on päättynyt: maksu saapui määräajan jälkeen eikä se koske tätä tilausta. Ota yhteyttä kauppiaaseen ({{business}})."
      }
    }
  },
  appLock: {
    title: "Sovellus lukittu",
    body: "Avaa se tämän laitteen biometriikalla.",
    unlock: "Avaa lukitus",
    prompt: "Avaa sattle.me",
    cancel: "Peruuta"
  },
  navigation: {
    label: "Navigointi",
    destinations: {
      pos: "Veloita",
      wallet: "Lompakko",
      cards: "Kortit",
      articles: "Tuotteet",
      employees: "Työntekijät",
      integrations: "Integraatiot",
      settings: "Asetukset"
    },
    memberWallet: "Oma toimintani",
    groups: {
      sales: "Myynti",
      manage: "Hallinta",
      account: "Tili"
    },
    more: "Lisää",
    moreWith: "Lisää, nykyinen näkymä: {{name}}",
    moreWithWait: "{{more}} ({{name}})",
    close: "Sulje",
    customize: "Muokkaa",
    customizeTitle: "Muokkaa palkkia",
    done: "Valmis",
    customizeHint: "Napauta kohdetta korvataksesi <accent>{{name}}</accent>.",
    slotLabel: "{{name}}, paikka {{index}}",
    swapLabel: "Lisää {{name}} palkkiin",
    currentLabel: "{{name}}, nykyinen näkymä",
    pendingLabel: "{{name}}, lasku kesken",
    confirmingLabel: "{{name}}, maksua vahvistetaan",
    lock: {
      tillMode: "Siirry kassatilaan",
      lockApp: "Lukitse sovellus",
      unlock: "Avaa pääsyavaimellasi",
      lockedLabel: "{{name}}, lukittu: avaa pääsyavaimellasi",
      unlocking: "Avataan…",
      preparing: "Avausta valmistellaan…",
      failedTitle: "Lukitusta ei voitu avata",
      otherAccount: "Tämä pääsyavain avaa eri tilin kuin tämän laitteen.",
      autoLockTitle: "Lukitus {{seconds}} s kuluttua",
      autoLockBodyCard: "Ilman toimintaa sovellus lukittuu.",
      autoLockBody: "Ilman toimintaa sovellus palaa kassatilaan."
    },
    loadFailure: {
      title: "Näkymää ei ladattu",
      body: "Tarkista internetyhteys ja lataa sivu uudelleen. Samalla saat sovelluksen uusimman version.",
      reload: "Lataa sivu uudelleen"
    },
    update: {
      title: "Uusi versio saatavilla",
      body: "Päivitys lataa sivun uudelleen.",
      action: "Päivitä"
    }
  },
  team: {
    invite: "Kutsu työntekijä",
    loading: "Työntekijöitä ladataan…",
    guide: {
      title: "Veloittakaa yhdessä",
      lead: "Jokainen työntekijä veloittaa omalla puhelimellaan yrityksesi puolesta.",
      invite: {
        title: "Kutsu",
        caption: "Valitse hänen nimensä: sovellus valmistelee kutsun, QR-koodin ja linkin."
      },
      activate: {
        title: "Ota hänen puhelimensa käyttöön",
        caption:
          "Työntekijä skannaa QR-koodin tai avaa linkin: hänen puhelimestaan tulee yrityksesi kassa."
      },
      sales: {
        title: "Seuraa hänen myyntejään",
        caption: "Ne tulevat lompakkoosi hänen nimellään; jokainen työntekijä näkee vain omansa."
      }
    },
    noMatch: "Yksikään työntekijä ei vastaa suodattimia.",
    offline: "Ei yhteyttä: kutsujen tilaa ei voitu tarkistaa.",
    rosterOffline:
      "Yksikään välityspalvelin ei vastannut: työntekijöiden luetteloa ei voitu lukea. Tarkista yhteys ja palaa tähän näkymään.",
    rosterPartial:
      "Kaikki välityspalvelimet eivät vastanneet: työntekijöiden luettelo voi olla puutteellinen.",
    newer:
      "Osa työntekijöistä on sovelluksen uudemmasta versiosta: päivitä sovellus nähdäksesi heidät.",
    invitations: "Avoimet kutsut",
    employees: "Työntekijät",
    columns: {
      name: "Nimi",
      state: "Tila",
      date: "Päivä"
    },
    status: {
      invited: "Odottaa",
      joined: "Aktiivinen",
      left: "Poistunut",
      expired: "Vanhentunut"
    },
    detail: {
      invited: "Linkki luotu {{date}}",
      joined: "Liittyi {{date}}",
      left: "Poistui {{date}}",
      expired: "Linkki vanhentui {{date}}"
    },
    // Where an employee's device joined (its record's platform), beside its row's date.
    platform: {
      ios: "iPhonella tai iPadilla",
      android: "Androidilla",
      web: "verkkoselaimella"
    },
    detailWithPlatform: "{{detail}}, {{platform}}",
    actions: {
      share: "Jaa linkki",
      showQr: "Näytä linkki ja koodi",
      renew: "Uusi kutsu",
      deleteInvite: "Poista kutsu",
      removeAccess: "Poista käyttöoikeus",
      removeLeft: "Poista listalta"
    },
    inviteSheet: {
      title: "Kutsu työntekijä",
      lead: "Tällä linkillä toinen laite veloittaa yrityksellesi: työntekijän puhelin tai yhteinen kassa. Maksut tulevat suoraan lompakkoosi.",
      can: "Tämä laite voi",
      canItems: {
        sell: "Veloittaa: summa, tuotteet ja skannaus",
        methods: "Ottaa vastaan Lightning-, on-chain- ja korttimaksuja",
        links: "Lähettää asiakkaalle maksulinkin",
        ownSales: "Nähdä omat myyntinsä"
      },
      cannot: "Tämä laite ei voi",
      cannotItems: {
        wallet: "Nähdä saldoasi eikä lähettää varoja",
        settings: "Muuttaa tuotteitasi, hintojasi tai asetuksiasi",
        otherSales: "Nähdä muiden työntekijöiden tai kassojen myyntejä",
        manage: "Hallita tiimiä, kortteja tai integraatioita"
      },
      revoke: "Voit poistaa käyttöoikeuden milloin tahansa.",
      nameLabel: "Nimi",
      namePlaceholder: "Esim. Alice tai Kassa 1",
      nameHint: "Nimi näkyy lompakossasi sen myyntien vieressä.",
      create: "Luo linkki",
      notice:
        "Linkki on voimassa 48 tuntia ja toimii vain kerran. Anna se vain työntekijälle tai kassalle, jolle se on tarkoitettu: ensimmäinen sen avaaja voi ottaa sen paikan."
    },
    qrSheet: {
      title: "Kutsu: {{name}}",
      lead: "Skannaa tämä koodi laitteella, joka ottaa maksuja vastaan, tai lähetä linkki sille laitteelle.",
      leadDesktop:
        "Skannaa tämä koodi laitteella, joka ottaa vastaan maksuja yritykselle {{business}}, tai lähetä linkki sille laitteelle.",
      linkLabel: "Kutsulinkki",
      copy: "Kopioi linkki",
      share: "Jaa linkki",
      copied: "Linkki kopioitu",
      copyFailed: "Linkkiä ei voitu kopioida. Valitse se ja kopioi se.",
      done: "Valmis",
      notice:
        "Tämä linkki toimii vain kerran ja vanhenee {{date}}. Se on tarkoitettu vain kohteelle {{name}}: ensimmäinen sen avaaja voi ottaa sen paikan."
    },
    removeDialog: {
      title: "Poistetaanko {{name}}?",
      body: "{{name}} ei voi enää ottaa vastaan maksuja yritykselle {{business}}. Aiemmat maksut jäävät lompakkoon hänen nimellään.",
      confirm: "Poista käyttöoikeus",
      doneTitle: "Käyttöoikeus poistettu",
      doneBody: "{{name}} ei enää kuulu yrityksen {{business}} tiimiin."
    },
    removeLeftDialog: {
      title: "Poistetaanko {{name}} listalta?",
      body: "{{name}} poistui yrityksestä {{business}} {{date}}. Aiemmat maksut jäävät lompakkoon hänen nimellään.",
      confirm: "Poista listalta",
      doneTitle: "Poistettu listalta",
      doneBody: "{{name}} ei enää näy yrityksen {{business}} työntekijöissä."
    },
    deleteInviteDialog: {
      title: "Poistetaanko kutsu ({{name}})?",
      body: "Linkki lakkaa toimimasta: {{name}} ei voi liittyä yritykseen {{business}} sillä.",
      confirm: "Poista kutsu",
      doneTitle: "Kutsulinkki poistettu käytöstä",
      doneBody: "{{name}} ei voi enää liittyä yritykseen {{business}}."
    },
    cancelSalesDialog: {
      unknownLead: "Henkilön {{name}} laskujen tilaa ei voitu tarkistaa.",
      linksLeft:
        "{{name}} ei enää kuulu yrityksen {{business}} tiimiin. Maksulinkit, joita ei voitu perua, voi yhä maksaa niiden päättymiseen asti: maksut tulevat lompakkoon.",
      title: "Perutaanko laskut ({{name}})?",
      lead: "Osa laskuista ({{name}}) ei ole vielä lopullisia.",
      links:
        "Maksulinkit, jotka eivät ole vielä vastaanottaneet mitään, perutaan: niiden sivu ei enää näytä maksukoodia. Maksetut linkit viimeistellään.",
      invoices:
        "Laitteella näytetyt laskut perutaan: laite lakkaa näyttämästä niitä heti, kun se saa tiedon käyttöoikeuden poistosta.",
      end: "Asiakas, joka on jo skannannut tai kopioinut laskun, voi yhä maksaa sen: maksu tulee lompakkoon. Sen jälkeen käyttöoikeus ({{name}}) poistetaan.",
      confirm: "Peru ja poista",
      progress: "Laskuja perutaan ({{name}})…"
    },
    failedTitle: "Toiminto ei onnistu",
    unreachableTitle: "Ei yhteyttä",
    errors: {
      noAccount: "Avaa tämä myyntipiste passkeylläsi hallitaksesi tiimiä.",
      noWebApp: "Kutsut eivät ole vielä käytettävissä tässä sovelluksen versiossa.",
      tooMany: "Tiimissäsi on jo 100 työntekijää.",
      invalidName: "Kirjoita työntekijän nimi.",
      unreachable: "Kutsua ei voitu julkaista. Tarkista internetyhteys ja yritä uudelleen.",
      unpublished:
        "Työntekijä on lisätty luetteloon, mutta hänen kutsuaan ei voitu julkaista. Jaa hänen linkkinsä luettelosta yrittääksesi uudelleen.",
      removeUnreachable: "Poistoa ei voitu julkaista. Tarkista internetyhteys ja yritä uudelleen.",
      removeFailed: "Poistoa ei voitu tallentaa. Yritä uudelleen.",
      removalUnsaved:
        "Tämän työntekijän pääsy on katkaistu, mutta poistoa ei voitu tallentaa. Yritä uudelleen: se tallennetaan myös, kun avaat tilisi seuraavan kerran.",
      salesInProgress:
        "Osa tämän työntekijän laskuista ei ole vielä lopullisia. Yritä uudelleen, kun niiden lopullinen versio on julkaistu (enintään 3 tuntia maksamattoman laskun päättymisen jälkeen).",
      integrationPending:
        "Integraatiolla on maksuja, jotka eivät ole vielä lopullisia. Yritä uudelleen, kun ne ovat.",
      exportNewer:
        "Sovelluksen uudempi versio muutti tätä avustajaa. Päivitä sovellus muuttaaksesi sitä",
      invoicesNewer:
        "Sovelluksen uudempi versio muutti tätä avustajaa. Päivitä sovellus muuttaaksesi sitä"
    },
    removedNotice: "Tämä laite ei enää kuulu yrityksen {{business}} tiimiin.",
    join: {
      title: "Liity tiimiin",
      scanLead: "Skannaa kutsun QR-koodi, jonka yrityksen omistaja näyttää sinulle.",
      cameraAppLead: "Skannaa kutsun QR-koodi puhelimesi kameralla: se avaa tämän sivun.",
      cameraNeeded: "Kameraa tarvitaan kutsun QR-koodin skannaamiseen.",
      allowCamera: "Salli kamera",
      openSettings: "Avaa asetukset",
      pasteLabel: "Tai liitä kutsulinkki",
      checking: "Kutsua luetaan…",
      joining: "Liitytään tiimiin…",
      as: "Otat vastaan maksuja yritykselle {{business}} nimellä {{name}}.",
      rights:
        "Tämä laite luo laskuja, jotka maksetaan yritykselle {{business}}. Sillä ei ole pääsyä lompakkoon, asetuksiin eikä muiden työntekijöiden myynteihin.",
      confirm: "Liity tiimiin",
      scanAnother: "Skannaa toinen kutsu",
      errors: {
        invalid: "Tämä ei ole kutsulinkki. Tarkista, että se on kopioitu kokonaan.",
        notFound: "Tätä kutsua ei ole tai se on vanhentunut. Pyydä omistajalta uusi.",
        closed: "Tämä kutsu on jo käytetty. Pyydä omistajalta uusi.",
        expired: "Tämä kutsu on vanhentunut. Pyydä omistajalta uusi.",
        newer:
          "Tämä kutsu on sovelluksen uudemmasta versiosta. Päivitä sovellus ja yritä uudelleen.",
        unreachable: "Ei yhteyttä. Tarkista internetyhteytesi ja yritä uudelleen.",
        removed: "Omistaja on perunut tämän kutsun.",
        alreadySetUp: "Tämä laite ottaa jo vastaan maksuja yritykselle: se ei voi liittyä tiimiin."
      }
    }
  },
  integrations: {
    create: "Luo integraatio",
    loading: "Integraatioita ladataan…",
    guide: {
      title: "Veloita verkkokaupassasi",
      lead: "Integraation avulla verkkokauppa tai työkalu voi veloittaa asiakkaitaan tililläsi.",
      create: {
        title: "Luo integraatio",
        caption:
          "Valitse verkkokauppasi (WooCommerce, PrestaShop…) tai palvelimesi ohjelmointikieli."
      },
      key: {
        title: "Anna salainen avain",
        caption:
          "Liitä se verkkokauppaasi tai anna se kehittäjällesi. Se pysyy palvelimella, ei koskaan asiakkaillasi."
      },
      pay: {
        title: "Asiakkaasi maksavat",
        caption: "Jokaisesta tilauksesta kauppa näyttää laskun. Maksu tulee lompakkoosi."
      }
    },
    noMatch: "Yksikään integraatio ei vastaa suodattimia.",
    offline:
      "Yksikään välityspalvelin ei vastannut: integraatioiden luetteloa ei voitu lukea. Tarkista yhteys ja palaa tähän näkymään.",
    partial:
      "Kaikki välityspalvelimet eivät vastanneet: integraatioiden luettelo voi olla puutteellinen.",
    newer:
      "Osa integraatioista on sovelluksen uudemmasta versiosta: päivitä sovellus nähdäksesi ne.",
    columns: {
      name: "Nimi",
      date: "Luotu"
    },
    created: "Luotu {{date}}",
    actions: {
      remove: "Poista integraatio"
    },
    createSheet: {
      title: "Uusi integraatio",
      lead: "Tee laskusi tekoälyllä, ota maksuja verkkokaupassasi tai omalla sivustollasi.",
      invoices: "Laskut",
      shops: "Verkkokaupat",
      developers: "Kehittäjille",
      developersDetail_one: "SDK: {{names}} ja {{count}} muu",
      developersDetail_other: "SDK: {{names}} ja {{count}} muuta",
      soon: "Tulossa",
      soonLabel: "{{name}}: tulossa",
      source: "Lähdekoodi",
      sourceLabel: "{{name}}: lähdekoodi GitHubissa",
      oneShopTitle: "Yksi avain vain yhdelle kaupalle",
      oneShop:
        "Saman kaupan palvelimet jakavat sen avaimen, kaksi kauppaa ei koskaan: niiden tilaukset sekoittuisivat, ja toisen tilaus voisi näyttää maksetulta toisen maksulla. Luo toiselle kaupalle oma integraatio.",
      namePlaceholder: "Verkkokauppa"
    },
    sdk: {
      lead: "{{name}}-SDK luo palvelimellasi jokaisen tilauksen laskun ja tarkistaa sen maksun.",
      package: "Paketti",
      open: "Avaa sivustolla {{site}}",
      openLabel: "Avaa {{name}} sivustolla {{site}}",
      readme: "Sen README kertoo, miten se asennetaan ja miten sitä käytetään.",
      key: "Salainen avain"
    },
    files: {
      show: "Näytä tiedoston {{name}} vaiheet",
      copyName: "Kopioi nimi {{name}}",
      nameCopied: "Nimi kopioitu: {{name}}",
      copy: "Kopioi sisältö",
      copied: "Sisältö kopioitu",
      contentCopied: "Tiedoston {{name}} sisältö kopioitu",
      copyFailed: "Kopiointi ei onnistunut. Yritä uudelleen.",
      readFailed: "Sovellus ei pystynyt lukemaan tätä tiedostoa: sulje opas ja avaa se uudelleen.",
      lastLine: "Liitettynä se päättyy riville {{line}}.",
      pasted: "Liitetty",
      progress: "Liitetty: {{count}}/{{total}}"
    },
    keyStep: {
      title: "Luo tämän kaupan avain",
      leadShop:
        "Tee se, kun avaimen kenttä on auki kohteessa {{platform}}: se näytetään vain kerran.",
      leadSdk:
        "Palvelimesi lukee sen ympäristömuuttujasta, ei koskaan verkkosivulta eikä koodivarastosta. Se näytetään vain kerran.",
      shopName: "Kaupan nimi",
      siteName: "Sivuston tai työkalun nimi",
      nameHint: "Nimi näkyy lompakossasi sen myyntien vieressä.",
      create: "Luo avain"
    },
    guides: {
      wix: {
        editor: {
          title: "Avaa sivuston koodi",
          body: "Avaa tietokoneella Wix-sivustosi editori. Napsauta ylhäältä ”Dev Mode” ja sitten ”Turn on Dev Mode”: editorin vasempaan reunaan tulee kuvakesarake. Tämä opas näyttää Wix Editorin; Wix Studiossa näkymät ovat erilaiset. Wixin nimet ovat tässä englanniksi.",
          image: "Wix Editorin valikko ”Dev Mode” ja sen painike ”Turn on Dev Mode” kehystettyinä."
        },
        packages: {
          title: "Avaa paketit",
          body: "Napsauta siinä kuvakesarakkeessa kuutiota (”Packages & Apps”). Napsauta kohdan ”npm” alla ”+ Install packages from npm”.",
          image:
            "Wixin paneeli ”Packages & Apps”: kuutiokuvake ja linkki ”+ Install packages from npm” kehystettyinä."
        },
        install: {
          title: "Asenna kaksi Wixin pakettia",
          body: "Avautuu ikkuna ”Package Manager”. Kirjoita sen hakuun @wix/ecom ja napsauta rivillä @wix/ecom ”Install” (älä toisella samannäköisellä nimellä). Odota, että se valmistuu, ja tee sama paketille @wix/essentials. Sulje ikkuna: molemmat paketit näkyvät kohdan ”npm” alla. Ne ovat kaksi Wixin työkalua, joita lisäosa tarvitsee.",
          image:
            "Ikkuna ”Package Manager”: @wix/ecom kirjoitettuna sen hakuun ja rivin @wix/ecom painike ”Install” kehystettyinä."
        },
        files: {
          title: "Luo 6 tiedostoa",
          body: "Luo kohdassa ”Backend & Public” (sarakkeen kuvake { }) jokainen tiedosto paikalleen tässä järjestyksessä ja liitä sitten sen sisältö täältä kopioituna: lisäosan {{version}} sisältö, sovelluksen tarkistama.",
          where: {
            js: "Backend › + › Add .js file",
            file: "Backend › + › Add file",
            servicePlugin: "Service Plugins › + › Payment",
            servicePluginConfig: "Service Plugins › payment-provider › sattlemeCheckout"
          },
          how: {
            js: "Anna nimeksi {{name}} ja liitä sen sisältö. Se on suurin: odota, että Wix näyttää sen kokonaan, ennen kuin napsautat muualle.",
            file: "Anna nimeksi {{name}}. Wix laittaa siihen esimerkin: valitse kaikki (Ctrl+A, Macissa ⌘A) ja liitä.",
            servicePlugin:
              "Anna lisäosan nimeksi sattlemeCheckout ja valitse ”Add & Edit Code”: Wix luo tämän ja seuraavan tiedoston. Tarkista, että avoin välilehti on {{name}}, valitse kaikki ja liitä.",
            servicePluginConfig:
              "Wix loi sen tiedoston sattlemeCheckout.js kanssa: avaa se, valitse kaikki ja liitä."
          },
          sharedCode:
            "Onko sivustollasi jo oma {{name}}? Älä korvaa sitä: liitä kopioitu sisältö omasi loppuun, sen rivien alle.",
          sharedJobs:
            "Onko sivustollasi jo oma {{name}}? Älä korvaa sitä: lisää lisäosan tehtävä (aaltosulkeiden välinen lohko sen ”jobs”-listasta) omasi ”jobs”-listaan pilkulla erotettuna.",
          image:
            "Wixin paneeli ”Backend & Public”: kohdan ”Backend” + sekä sen valikon vaihtoehdot ”Add .js file” ja ”Add file” kehystettyinä."
        },
        secrets: {
          title: "Avaa Secrets Manager",
          body: "Sivuston hallintapaneelissa ”Developer Tools” › ”Secrets Manager”. Tallenna salaisuus nimeltä sattleme-checkout-status-token, satunnainen vähintään 32 merkin arvo (salasanojen hallinnasta): lisäosan tilasivun salasana. Sitten uudelleen ”+ Add Secret”, nimeltä sattleme-checkout-key.",
          image:
            "Wixin Secrets Manager: ”Secrets Manager” kohdan ”Developer Tools” alla ja linkki ”+ Add Secret” kehystettyinä."
        },
        save: {
          title: "Tallenna avain",
          body: "Liitä avain salaisuuden sattleme-checkout-key arvoksi ja tallenna. Se pysyy siinä salaisuudessa: älä kirjoita sitä mihinkään muualle Wixissä.",
          image:
            "Wixin ikkuna ”Add secret” nimellä sattleme-checkout-key: sen tyhjä kenttä ”Value” ja painike ”Add Secret” kehystettyinä."
        },
        publish: {
          title: "Julkaise kerran",
          body: "Napsauta editorissa ”Publish” vain kerran: jokainen napsautus tekee julkaisun.",
          image: "Wix Editorin yläreuna: painike ”Publish” kehystettynä."
        },
        status: {
          title: "Avaa tilasivu",
          body: "Avaa sivustosi osoite ja sen perään /_functions/sattlemeCheckoutStatus, ja syötä tunnus (salaisuuden sattleme-checkout-status-token arvo). Sivu näyttää lisäosan {{version}}. Tee se ennen yhdistämistä: se muistaa sivuston osoitteen, jossa asiakkaasi maksavat.",
          image: "Lisäosan tilasivu: sen tunnuskenttä ja painike kehystettyinä."
        },
        connect: {
          title: "Yhdistä maksu",
          body: "Hallintapaneelissa ”Settings” › ”Accept Payments” › ”Bitcoin (Lightning / on-chain)” › ”Connect”. Ensimmäinen kenttä: sattleme-checkout-key, salaisuuden nimi, ei koskaan itse avain. Toinen kenttä: 15, minuutit laskun maksamiseen (1–60). Sitten ”Connect”.",
          image:
            "Wixin yhdistämislomake: sattleme-checkout-key ensimmäisessä kentässä, 15 toisessa ja painike ”Connect” kehystettyinä."
        },
        check: {
          title: "Testaa maksu",
          body: "Tee tilaus sivustollasi, ensin testisivustolla, ja valitse ”Bitcoin (Lightning / on-chain)”: lisäosan maksusivu avautuu.",
          image:
            "Lisäosan maksusivu: ”Pay with Bitcoin”, summa satoshina ja maksuun jäljellä oleva aika."
        }
      },
      bebop: {
        open: {
          title: "Avaa sattle.me:n asetukset",
          body: "Avaa be-BOPin hallinnassa ”Payment Settings” → ”sattle.me”. Jos sitä ei ole luettelossa, päivitä ensin be-BOP.",
          image:
            "Kuvakaappaus be-BOPista: hallinnan valikko, ”sattle.me” kehystettynä kohdan ”Payment Settings” alla"
        },
        save: {
          title: "Liitä avain ja tallenna",
          body: "Liitä avain kenttään ”Integration key (sattle.me app > Integrations)”. Jos haluat ottaa vastaan myös onchain-maksuja, valitse ”Also take on-chain payments (Bitcoin method)”. Napsauta sitten ”Save”.",
          image:
            "Kuvakaappaus be-BOPista: sattle.me:n asetukset, kenttä ”Integration key”, valintaruutu ”Also take on-chain payments” ja painike ”Save” kehystettyinä"
        },
        test: {
          title: "Testaa yhteys",
          body: "Napsauta ”Test connection”: be-BOP lukee integraation sen avaimella tekemättä laskua ja näyttää ”Connection successful. sattle.me credentials are working.” Jos onchain-maksut on valittu, se tarkistaa myös, että integraatiolla on Bitcoin-osoitteita: tämä sovellus antaa niitä sille, kun se luodaan, ja sitten aina, kun avaat lukituksen pääsyavaimellasi internetyhteyden ollessa päällä. Jos testi epäonnistuu, tarkista avain, avaa tämän sovelluksen lukitus ja testaa uudelleen.",
          image:
            "Kuvakaappaus be-BOPista: sattle.me:n asetukset, painike ”Test connection” kehystettynä"
        },
        prefer: {
          title: "Aseta sattle.me ensimmäiseksi",
          body: "Jos jokin toinen käsittelijä ottaa jo vastaan Lightning- tai onchain-maksuja kaupassasi, avaa ”Settings” → ”General”. Valitse kohdassa ”Payment processor preferences” ”sattleme” kohtaan ”Preferred Lightning processor” ja ”sattleme-onchain” kohtaan ”Preferred Bitcoin on-chain processor” ja napsauta sitten sivun alareunassa ”Update”.",
          image:
            "Kuvakaappaus be-BOPista: ”Payment processor preferences”, sattleme-onchain ja sattleme valittuina ja kehystettyinä"
        },
        check: {
          title: "Tarkista kauppasi",
          body: "Maksuvaiheessa asiakkaasi voivat nyt valita kohdassa ”Payment method” ”Lightning”, ja myös ”Onchain”, jos valitsit onchain-maksut: be-BOP tarjoaa sitä 10 000 satsista alkaen. Kun tilaus on tehty, he maksavat sen skannaamalla QR-koodin. Onchain-maksu maksaa tilauksen 3 vahvistuksen jälkeen, noin 30 minuutissa, matalalla palkkiolla pidempään. Jokainen maksu on oikea bitcoin-maksu lompakkoosi.",
          image:
            "Kuvakaappaus be-BOP-kaupasta: ”Lightning” kohdassa ”Payment method” maksuvaiheessa"
        }
      },
      pretix: {
        plugins: {
          title: "Avaa tapahtuman lisäosat",
          body: "Avaa pretixin hallinnassa tapahtumasi ja sitten sen valikosta ”Asetukset” → ”Lisäosat”.",
          image:
            "Kuvakaappaus pretixistä: tapahtuman valikko, ”Plugins” kehystettynä kohdan ”Settings” alla"
        },
        enable: {
          title: "Ota lisäosa käyttöön",
          body: "Hae ”sattle.me” ja napsauta ”Enable”.",
          image:
            "Kuvakaappaus pretixistä: lisäosat haulla ”sattle.me”, sen ”Enable”-painike kehystettynä"
        },
        open: {
          title: "Avaa sen asetukset",
          body: "Napsauta kohdassa ”Asetukset” → ”Maksut” painiketta ”Asetukset” rivillä ”Bitcoin (sattle.me)”.",
          image:
            "Kuvakaappaus pretixistä: maksutavat, rivin ”Bitcoin (sattle.me)” ”Settings”-painike kehystettynä"
        },
        save: {
          title: "Liitä avain ja tallenna",
          body: "Valitse ”Ota maksutapa käyttöön”, liitä avain kenttään ”Integration key” ja napsauta sitten sivun alareunassa ”Tallenna”: pretix tarkistaa avaimen eikä näytä sitä enää koskaan. ”Time to pay” on aika, jonka asiakas saa laskun maksamiseen: 1–60 minuuttia, oletuksena 15.",
          image:
            "Kuvakaappaus pretixistä: Bitcoin (sattle.me) -asetukset, ”Enable payment method” -valintaruutu ja ”Integration key” -kenttä kehystettyinä"
        },
        channels: {
          title: "Valitse myyntikanavat",
          body: "Samalla sivulla ”Rajoita tiettyihin myyntikanaviin” kertoo, missä asiakkaasi voivat maksaa bitcoinilla: oletuksena ”Verkkokauppa”. Valitse muut haluamasi kanavat ja napsauta ”Tallenna”.",
          image:
            "Kuvakaappaus pretixistä: ”Restrict to specific sales channels”, sen ”Online shop” -valintaruutu kehystettynä"
        },
        check: {
          title: "Tarkista kauppasi",
          body: "Maksuvaiheessa asiakkaasi voivat nyt valita ”Bitcoin” ja skannata QR-koodin: alle noin 1 000 satsin summat Lightningilla, sitä suuremmat Lightningilla tai onchain. Onchain-maksu näkyy vahvistettavana alle minuutissa ja maksaa tilauksen 3 vahvistuksen jälkeen, noin 30 minuutissa, matalalla palkkiolla pidempään. Kun mempool.space vastaa hitaasti, lasku voidaan luoda vain Lightningille. Myös pretixin testitilassa jokainen maksu on oikea bitcoin-maksu lompakkoosi.",
          image: "Kuvakaappaus pretix-kaupasta: ”Bitcoin” maksuvaiheessa"
        }
      },
      nopcommerce: {
        download: {
          title: "Lataa lisäosa",
          body: "Lataa lisäosa: .zip-arkisto, jota et pura vaan säilytät sellaisenaan. Se vaatii nopCommerce 5.00:n.",
          link: "Avaa nopCommercen marketplace",
          file: "Lataa versio {{version}}"
        },
        plugins: {
          title: "Avaa paikalliset lisäosat",
          body: "Avaa nopCommercen hallinnassa ”Configuration” → ”Local plugins”.",
          image: "Kuvakaappaus nopCommercesta: hallinnan valikko, ”Local plugins” kehystettynä"
        },
        upload: {
          title: "Lähetä arkisto",
          body: "Napsauta ”Upload plugin or theme”, valitse arkisto ja napsauta sitten avautuvassa ikkunassa ”Upload plugin or theme”.",
          image:
            "Kuvakaappaus nopCommercesta: ikkuna ”Upload plugin or theme”, arkisto valittuna, sen ”Upload plugin or theme” -painike kehystettynä"
        },
        restart: {
          title: "Käynnistä nopCommerce uudelleen",
          body: "Napsauta sivun yläosassa ”Restart application to apply changes” ja odota, että sivu näkyy taas: kauppasi ei vastaa, kun nopCommerce käynnistyy uudelleen. Lisäosa näkyy luettelossa vasta tämän uudelleenkäynnistyksen jälkeen.",
          image:
            "Kuvakaappaus nopCommercesta: ”Local plugins”, sen ”Restart application to apply changes” -painike kehystettynä"
        },
        install: {
          title: "Asenna lisäosa",
          body: "Etsi luettelosta ”Bitcoin (sattle.me)” ryhmästä ”Payment methods”, napsauta ”Install” ja sitten uudelleen ”Restart application to apply changes”.",
          image:
            "Kuvakaappaus nopCommercesta: lisäosa Bitcoin (sattle.me) luettelossa, sen ”Install”-painike kehystettynä"
        },
        open: {
          title: "Avaa sen asetukset",
          body: "Kun nopCommerce on käynnistynyt uudelleen, napsauta ”Configure” kohdan ”Bitcoin (sattle.me)” alla. Löydät sen myös kohdasta ”Configuration” → ”Payment methods”.",
          image:
            "Kuvakaappaus nopCommercesta: asennettu lisäosa Bitcoin (sattle.me), sen ”Configure”-painike kehystettynä"
        },
        save: {
          title: "Liitä avain ja tallenna",
          body: "Valitse ”Enabled”, liitä avain kenttään ”Integration key” ja napsauta sitten sivun alareunassa ”Save”: lisäosa tarkistaa avaimen eikä näytä sitä enää koskaan. ”Time to pay (minutes)” on aika, jonka asiakas saa laskun maksamiseen: 1–60 minuuttia, oletuksena 15.",
          image:
            "Kuvakaappaus nopCommercesta: Bitcoin (sattle.me) -asetukset, ”Enabled”-valintaruutu ja ”Integration key” -kenttä kehystettyinä"
        },
        check: {
          title: "Tarkista kauppasi",
          body: "Maksuvaiheessa asiakkaasi voivat nyt valita ”Bitcoin”. Kun tilaus on vahvistettu, he maksavat sen kauppasi sivulla skannaamalla QR-koodin: alle noin 1 000 satsin summat Lightningilla, sitä suuremmat Lightningilla tai onchain. Onchain-maksu maksaa tilauksen 3 vahvistuksen jälkeen, noin 30 minuutissa, matalalla palkkiolla pidempään. Maksuja tarkistavat myös nopCommercen ajastetut tehtävät, joiden täytyy tavoittaa kauppasi URL-osoite. Jokainen maksu on oikea bitcoin-maksu lompakkoosi.",
          image: "Kuvakaappaus nopCommerce-kaupasta: ”Bitcoin” maksuvaiheessa"
        },
        autoCancel: {
          title: "Jätä Bitcoin automaattisen peruutuksen ulkopuolelle",
          body: "Jos ”Enable auto-canceling of unpaid orders” on valittuna (”Configuration” → ”Settings” → ”Order settings”), lisää ”Bitcoin (sattle.me)” sen kohtaan ”Excluded payment methods”, jotta tilausta, jonka maksua vahvistetaan, ei peruta."
        }
      },
      woocommerce: {
        download: {
          title: "Lataa lisäosa",
          body: "Lataa lisäosan tiedosto sattleme-for-woocommerce-….zip ja säilytä se sellaisenaan, purkamatta sitä. Lisäosa vaatii WordPress 7.0:n, WooCommerce 11.1:n ja PHP 8.2:n tai uudemmat.",
          link: "Avaa lisäosan GitHub-sivu",
          file: "Lataa versio {{version}}"
        },
        upload: {
          title: "Lähetä tiedosto",
          body: "Avaa WordPressin hallinnassa ”Lisäosat” → ”Asenna lisäosa”, napsauta sivun yläosassa ”Lataa lisäosa”, valitse tiedosto ja napsauta sitten ”Asenna nyt”.",
          image:
            "Kuvakaappaus WordPressistä: ”Upload Plugin” ja valittu tiedosto, painikkeet ”Upload Plugin” ja ”Install Now” kehystettyinä"
        },
        activate: {
          title: "Ota lisäosa käyttöön",
          body: "Kun lisäosa on asennettu, napsauta ”Ota lisäosa käyttöön”.",
          image:
            "Kuvakaappaus WordPressistä: asennettu lisäosa, sen painike ”Activate Plugin” kehystettynä"
        },
        open: {
          title: "Avaa sen asetukset",
          body: "Napsauta ”Lisäosat”-sivulla kohdan ”sattle.me for WooCommerce” alla ”Settings”. Pääset niihin myös kautta ”WooCommerce” → ”Asetukset” → ”Maksut”, nimellä ”sattle.me (Bitcoin)”.",
          image:
            "Kuvakaappaus WordPressistä: lisäosa sattle.me for WooCommerce lisäosien luettelossa, sen linkki ”Settings” kehystettynä"
        },
        save: {
          title: "Liitä avain ja tallenna",
          body: "Valitse ”Accept Bitcoin payments with sattle.me”, liitä avain kenttään ”Integration key” ja napsauta sitten sivun alaosassa ”Tallenna muutokset”: lisäosa tarkistaa avaimen eikä näytä sitä enää koskaan. Sivulla lukee sitten ”Connected to” ja yrityksesi nimi. ”Time to pay” on aika, joka asiakkaalla on laskun maksamiseen: 1–60 minuuttia, oletuksena 15.",
          image:
            "Kuvakaappaus WordPressistä: tallennetut sattle.me (Bitcoin) -asetukset, ”Connected to” ja valittu ruutu kehystettyinä"
        },
        check: {
          title: "Tarkista kauppasi",
          body: "Maksuvaiheessa asiakkaasi voivat nyt maksaa bitcoineilla, sattle.me-logon kanssa. Kun tilaus on tehty, he maksavat sen kauppasi sivulla skannaamalla QR-koodin: alle noin 1 000 satsin summat Lightningilla, sitä suuremmat Lightningilla tai onchain. Onchain-maksu maksaa tilauksen 3 vahvistuksen jälkeen, noin 30 minuutissa, matalalla palkkiolla pidempään. Lisäosa tarkistaa maksut myös minuutin välein, vaikka maksusivu olisi suljettu, WordPressin ajastettujen tehtävien (WP-Cron) avulla: jos kaupassasi käy vähän vierailijoita, anna palvelimesi cronin ajaa ne minuutin välein, kuten lisäosan README neuvoo. Jokainen maksu on oikea bitcoin-maksu lompakkoosi.",
          image: "Kuvakaappaus WooCommerce-kaupasta: bitcoin-maksu maksuvaiheessa"
        }
      },
      grandnode: {
        download: {
          title: "Lataa lisäosa",
          body: "Lataa lisäosan arkisto Payments.Sattleme-….zip ja säilytä se sellaisenaan, purkamatta sitä. Lisäosa vaatii GrandNode 2.4:n.",
          link: "Avaa lisäosan GitHub-sivu",
          file: "Lataa versio {{version}}"
        },
        plugins: {
          title: "Avaa paikalliset lisäosat",
          body: "Avaa GrandNoden hallinnassa ”Plugins” → ”Local plugins”.",
          image:
            "Kuvakaappaus GrandNodesta: hallinnan ”Plugins”-valikko, ”Local plugins” kehystettynä"
        },
        upload: {
          title: "Lähetä arkisto",
          body: "Napsauta sivun yläosassa ”Upload”, valitse arkisto ja napsauta sitten avautuvassa ikkunassa ”Upload”. GrandNode näyttää ”Plugin uploaded” ja pysähtyy sitten käynnistyäkseen uudelleen: lataa sivu uudelleen selaimessa (ei painikkeella ”Reload list of plugins”, joka pysäyttää GrandNoden uudelleen), kunnes lisäosaluettelo näkyy taas; kauppasi ei vastaa sillä välin. Jos se ei vieläkään vastaa muutaman minuutin kuluttua, käynnistä GrandNode uudelleen (sen palvelu tai kontti).",
          image:
            "Kuvakaappaus GrandNodesta: ikkuna ”Upload”, arkisto valittuna, sen painike ”Upload” kehystettynä"
        },
        install: {
          title: "Asenna lisäosa",
          body: "Etsi luettelosta ”Bitcoin (sattle.me)” ryhmästä ”Payment methods”: sen merkintä ”Installed” pysyy punaisena, kunnes lisäosa on asennettu. Napsauta ”Install”: GrandNode käynnistyy taas uudelleen. Lataa sivu uudelleen samalla tavalla.",
          image:
            "Kuvakaappaus GrandNodesta: lisäosa Bitcoin (sattle.me) luettelossa, sen painike ”Install” kehystettynä"
        },
        open: {
          title: "Avaa sen asetukset",
          body: "Kun lisäosan ”Bitcoin (sattle.me)” painike ”Configure” näkyy, napsauta sitä. Löydät sen asetukset myös kohdasta ”Configuration” → ”Payment” → ”Payment methods” nimellä ”Bitcoin”.",
          image:
            "Kuvakaappaus GrandNodesta: lisäosa Bitcoin (sattle.me) asennettuna, sen painike ”Configure” kehystettynä"
        },
        save: {
          title: "Liitä avain ja tallenna",
          body: "Kytke ”Enabled” päälle, liitä avain kenttään ”Integration key” ja napsauta sitten sivun yläosassa ”Save”: lisäosa tarkistaa avaimen eikä näytä sitä enää koskaan. ”Time to pay (minutes)” on aika, jonka asiakas saa laskun maksamiseen: 1–60 minuuttia, oletuksena 15.",
          image:
            "Kuvakaappaus GrandNodesta: Bitcoin (sattle.me) -asetukset, ”Enabled”, kenttä ”Integration key” ja ”Save” kehystettyinä"
        },
        check: {
          title: "Tarkista kauppasi",
          body: "Maksuvaiheessa asiakkaasi voivat nyt maksaa bitcoineilla, sattle.me-logon kanssa. Kun tilaus on vahvistettu, he maksavat sen kauppasi sivulla skannaamalla QR-koodin: alle noin 1 000 satsin summat Lightningilla, sitä suuremmat Lightningilla tai onchain. Onchain-maksu maksaa tilauksen 3 vahvistuksen jälkeen, noin 30 minuutissa, matalalla palkkiolla pidempään. GrandNode tarkistaa maksut myös minuutin välein, vaikka maksusivu olisi suljettu. Jokainen maksu on oikea bitcoin-maksu lompakkoosi.",
          image: "Kuvakaappaus GrandNode-kaupasta: bitcoin-maksu maksuvaiheessa"
        }
      },
      smartstore: {
        download: {
          title: "Lataa lisäosa",
          body: "Lataa lisäosan paketti Smartstore.Module.Sattleme.Bitcoin.….zip ja säilytä se sellaisenaan, purkamatta sitä. Lisäosa vaatii Smartstore 6.4:n.",
          link: "Avaa lisäosan GitHub-sivu",
          file: "Lataa versio {{version}}"
        },
        plugins: {
          title: "Avaa lisäosat",
          body: "Avaa Smartstoren hallinnassa ”Plugins” → ”Manage plugins”.",
          image:
            "Kuvakaappaus Smartstoresta: hallinnan valikko ”Plugins”, ”Manage plugins” kehystettynä"
        },
        upload: {
          title: "Lähetä paketti",
          body: "Napsauta sivun yläosassa ”Upload plugin” ja valitse paketti: Smartstore lähettää sen heti ja vahvistaa, että se on lähetetty ja purettu.",
          image:
            "Kuvakaappaus Smartstoresta: lisäosien sivu, sen painike ”Upload plugin” kehystettynä"
        },
        reload: {
          title: "Lataa lisäosien luettelo uudelleen",
          body: "Napsauta ”Edit” → ”Reload list of plugins”. Smartstore käynnistyy uudelleen: odota, että sivu näkyy taas, kauppasi ei vastaa sillä välin.",
          image: "Kuvakaappaus Smartstoresta: valikko ”Edit”, ”Reload list of plugins” kehystettynä"
        },
        install: {
          title: "Asenna lisäosa",
          body: "Etsi luettelosta ”Bitcoin (sattle.me)” ja napsauta ”Install”: Smartstore asettaa sen asennuksen jonoon.",
          image:
            "Kuvakaappaus Smartstoresta: lisäosa Bitcoin (sattle.me) luettelossa, sen painike ”Install” kehystettynä"
        },
        execute: {
          title: "Suorita asennus",
          body: "Napsauta sivun yläosassa ”Execute tasks” ja sitten ”OK”. Smartstore käynnistyy taas uudelleen ja asentaa lisäosan: odota, että sivu näkyy taas.",
          image:
            "Kuvakaappaus Smartstoresta: lisäosien sivu, sen painike ”Execute tasks” kehystettynä"
        },
        open: {
          title: "Avaa sen asetukset",
          body: "Napsauta kohdan ”Bitcoin (sattle.me)” alla rataspainiketta ja sitten ”Configure”. Löydät sen asetukset myös kohdasta ”Configuration” → ”Payment methods” nimellä ”Bitcoin”.",
          image:
            "Kuvakaappaus Smartstoresta: lisäosa Bitcoin (sattle.me) asennettuna, sen ratas ja ”Configure” kehystettyinä"
        },
        save: {
          title: "Liitä avain ja tallenna",
          body: "Liitä avain kenttään ”Integration key” ja napsauta sitten sivun yläosassa ”Save”: lisäosa tarkistaa avaimen eikä näytä sitä enää koskaan. ”Time to pay (minutes)” on aika, jonka asiakas saa laskun maksamiseen: 1–60 minuuttia, oletuksena 15.",
          image:
            "Kuvakaappaus Smartstoresta: Bitcoin (sattle.me) -asetukset, kenttä ”Integration key” ja ”Save” kehystettyinä"
        },
        activate: {
          title: "Ota maksutapa käyttöön",
          body: "Avaa ”Configuration” → ”Payment methods” ja napsauta ”Activate” kohdan ”Bitcoin” alla: kauppasi tarjoaa sitä kassalla vasta, kun se on käytössä.",
          image: "Kuvakaappaus Smartstoresta: maksutavat, Bitcoinin painike ”Activate” kehystettynä"
        },
        timezone: {
          title: "Aseta kauppasi aikavyöhyke",
          body: "Valitse kohdassa ”Configuration” → ”Settings” kauppasi ”Default store time zone” ja tallenna: maksusivu näyttää siinä, mihin asti asiakas voi maksaa. Ilman sitä Smartstore käyttää palvelimensa aikavyöhykettä, usein UTC:tä."
        },
        check: {
          title: "Tarkista kauppasi",
          body: "Maksuvaiheessa asiakkaasi voivat nyt valita ”Bitcoin”. Kun tilaus on vahvistettu, he maksavat sen kauppasi sivulla skannaamalla QR-koodin: alle noin 1 000 satsin summat Lightningilla, sitä suuremmat Lightningilla tai onchain. Onchain-maksu maksaa tilauksen 3 vahvistuksen jälkeen, noin 30 minuutissa, matalalla palkkiolla pidempään. Smartstore tarkistaa maksut myös minuutin välein, vaikka maksusivu olisi suljettu, kunhan sen ajastetut tehtävät tavoittavat kauppasi osoitteen. Jokainen maksu on oikea bitcoin-maksu lompakkoosi.",
          image: "Kuvakaappaus Smartstore-kaupasta: ”Bitcoin” maksuvaiheessa"
        }
      },
      prestashop: {
        download: {
          title: "Lataa moduuli",
          body: "Lataa moduulin tiedosto sattleme.zip ja säilytä se sellaisenaan, purkamatta sitä. Moduuli vaatii PrestaShop 9.0:n, 9.1:n tai 9.2:n ja PHP 8.2–8.5:n.",
          link: "Avaa moduulin GitHub-sivu",
          file: "Lataa versio {{version}}"
        },
        upload: {
          title: "Avaa moduulien hallinta",
          body: "Avaa PrestaShopin hallintapaneelissa ”Modules” → ”Module Manager” ja napsauta sitten sivun yläosassa ”Upload a module”.",
          image:
            "Kuvakaappaus PrestaShopista: moduulien hallinta, sen painike ”Upload a module” kehystettynä"
        },
        drop: {
          title: "Lähetä tiedosto",
          body: "Pudota tiedosto ikkunaan tai napsauta ”select file” ja valitse se: PrestaShop lähettää moduulin ja asentaa sen heti.",
          image:
            "Kuvakaappaus PrestaShopista: ikkuna ”Upload a module”, sen tiedostoalue kehystettynä"
        },
        open: {
          title: "Avaa sen asetukset",
          body: "Kun PrestaShop näyttää ”Module installed!”, napsauta ”Configure”. Löydät sen asetukset myös kohdasta ”Modules” → ”Module Manager”, nimen ”sattle.me” alta.",
          image:
            "Kuvakaappaus PrestaShopista: ”Module installed!”, sen painike ”Configure” kehystettynä"
        },
        save: {
          title: "Liitä avain ja tallenna",
          body: "Ota käyttöön ”Accept bitcoin payments”, liitä avain kenttään ”Integration key” ja napsauta sitten sivun alaosassa ”Save”: moduuli tarkistaa avaimen eikä näytä sitä enää koskaan. Sivu näyttää sitten ”The integration key of” ja yrityksesi nimen. ”Time to pay” on aika, jonka asiakas saa laskun maksamiseen: 1–60 minuuttia, oletuksena 15.",
          image:
            "Kuvakaappaus PrestaShopista: sattle.me-asetukset, ”Accept bitcoin payments” ja kenttä ”Integration key” kehystettyinä"
        },
        cron: {
          title: "Ajasta taustatarkistukset",
          body: "Kohdan ”Background checks” alla sivu antaa rivin palvelimesi crontabiin: lisää se verkkopalvelimen käyttäjän crontabiin tai cron-tehtäväksi palveluntarjoajasi hallintapaneelissa, niin että se suoritetaan minuutin välein. Moduuli tarkistaa silloin maksut minuutin välein, vaikka maksusivu olisi suljettu. Ennen ensimmäistä suoritusta sivu näyttää ”The background checks never ran: set up the cron.”",
          image:
            "Kuvakaappaus PrestaShopista: sattle.me-asetukset tallennettuina, crontab-rivi kohdan ”Background checks” alla kehystettynä"
        },
        check: {
          title: "Tarkista kauppasi",
          body: "Maksuvaiheessa asiakkaasi voivat nyt valita ”Pay with bitcoin”. Kun tilaus on tehty, he maksavat sen kauppasi sivulla skannaamalla QR-koodin: alle noin 1 000 satsin summat Lightningilla, sitä suuremmat Lightningilla tai onchain. Onchain-maksu maksaa tilauksen 3 vahvistuksen jälkeen, noin 30 minuutissa, matalalla palkkiolla pidempään. Jokainen maksu on oikea bitcoin-maksu lompakkoosi.",
          image: "Kuvakaappaus PrestaShop-kaupasta: ”Pay with bitcoin” maksuvaiheessa"
        }
      },
      magento: {
        install: {
          title: "Asenna moduuli",
          body: "Asenna moduuli Magento-palvelimellasi Magenton juurikansiosta ja verkkopalvelimen käyttäjänä Packagistista Composerilla, ja ota se sitten käyttöön näillä komennoilla. Moduuli tarvitsee Magento Open Source 2.4.7:n, 2.4.8:n tai 2.4.9:n ja PHP 8.2–8.5:n. Kehitystilassa ”setup:di:compile” ja ”setup:static-content:deploy” eivät ole tarpeen.",
          link: "Avaa moduulin Packagist-sivu"
        },
        open: {
          title: "Avaa sen asetukset",
          body: "Avaa Magenton hallinnassa ”Stores” → ”Configuration”, sitten ”Sales” → ”Payment Methods”, ja avaa ”Bitcoin (sattle.me)”.",
          image: "Kuvakaappaus Magenton hallinnasta: maksutavat, ”Bitcoin (sattle.me)” kehystettynä"
        },
        save: {
          title: "Liitä avain ja tallenna",
          body: "Aseta ”Enabled” arvoon ”Yes”, liitä avain kenttään ”Integration key” ja napsauta sitten sivun yläosassa ”Save Config”: moduuli tarkistaa avaimen eikä näytä sitä enää koskaan. ”Connected to” näyttää sitten yrityksesi nimen. ”Time to pay (minutes)” on aika, jonka asiakas saa laskun maksamiseen: 1–60 minuuttia, oletuksena 15.",
          image:
            "Kuvakaappaus Magenton hallinnasta: Bitcoin (sattle.me) -asetukset, ”Enabled” ja kenttä ”Integration key” kehystettyinä"
        },
        cron: {
          title: "Tarkista Magenton cron",
          body: "Moduuli tarkistaa maksut joka minuutti, myös kun maksusivu on suljettu, Magenton cronin avulla, joka myös peruu maksamatta jääneet tilaukset. Tuotannossa oleva Magento ajaa sitä jo; jos sinun ei aja, ota se käyttöön Magenton juurikansiosta verkkopalvelimen käyttäjänä tällä komennolla."
        },
        check: {
          title: "Tarkista kauppasi",
          body: "Maksuvaiheessa asiakkaasi voivat nyt valita ”Bitcoin”. Kun tilaus on tehty, he maksavat sen kauppasi sivulla skannaamalla QR-koodin: alle noin 1 000 satsin summat Lightningilla, sitä suuremmat Lightningilla tai onchain. Onchain-maksu maksaa tilauksen 3 vahvistuksen jälkeen, noin 30 minuutissa, matalalla palkkiolla pidempään. Jokainen maksu on oikea bitcoin-maksu lompakkoosi.",
          image: "Kuvakaappaus Magento-kaupasta: ”Bitcoin” maksuvaiheessa"
        }
      }
    },
    assistant: {
      row: "Tekoälyavustaja",
      rowDetail: "Claude, ChatGPT… tekevät laskusi",
      title: "Tekoälyavustaja",
      lead: "Tekoälyavustajasi tekee yrityksesi laskut, numeroituina samaan sarjaan omiesi kanssa, maksulinkkeineen ja PDF-tiedostoineen, ja kertoo sinulle, kun ne on maksettu. Se ei koskaan käytä rahaa.",
      hosted: {
        title: "Claudessa, ChatGPT:ssä…",
        detail: "Valmis käyttöön, sattle.me ylläpitää",
        badge: "Helpoin"
      },
      desktop: { title: "Claude Desktopissa", detail: "Avain pysyy tietokoneellasi" },
      selfHosted: {
        title: "Omalla palvelimellasi",
        detail: "Sen avoin lähdekoodi GitHubissa",
        badge: "Asiantuntijoille"
      },
      hostedSteps: {
        add: {
          title: "Lisää liitin",
          claude:
            "Tämä painike avaa Claudessa liittimen lisäyksen valmiiksi täytettynä: tarkista se ja vahvista.",
          other:
            "Lisää ChatGPT:ssä tai muussa tekoälysovelluksessa mukautettu liitin (MCP-palvelin) tällä osoitteella sellaisenaan:"
        },
        addClaude: "Lisää Claudeen",
        openChatGpt: "Avaa ChatGPT",
        copy: "Kopioi osoite",
        copied: "Osoite kopioitu",
        copyFailed: "Osoitetta ei voitu kopioida",
        connect: {
          title: "Yhdistä",
          body: "Sovellus avaa sattle.me-sivun, joka pyytää avustajan avainta. Sivu kertoo, minne se palauttaa sinut: jatka vain, jos se on tekoälysovelluksesi."
        }
      },
      desktopSteps: {
        download: {
          title: "Lataa laajennus",
          body: "Uusimman version ”.mcpb”-tiedosto.",
          link: "Laajennus github.comissa",
          file: "Lataa versio {{version}}"
        },
        open: {
          title: "Avaa se",
          body: "Avaa tiedosto: Claude Desktop asentaa avustajan ja pyytää sen avainta."
        }
      },
      selfHostedSteps: {
        install: {
          title: "Asenna palvelin",
          body: "Sama MCP-palvelin kuin sattle.me:llä, omalla tai palveluntarjoajasi koneella, Dockerilla. Sen avoin lähdekoodi ja asennusohje ovat GitHubissa.",
          link: "sattleme/mcp-server github.comissa"
        },
        trust: {
          title: "Tämä palvelin näkee laskusi",
          body: "Sen ylläpitäjä näkee avustajan avaimen ja sen tekemät laskut: asiakkaidesi nimet ja osoitteet, summat. Jos et enää luota siihen, poista avustaja: se lakkaa toimimasta heti."
        },
        add: {
          title: "Lisää liitin",
          body: "Kun palvelin on verkossa, lisää sen osoite mukautettuna liittimenä tekoälysovellukseesi (Claude, ChatGPT…)."
        },
        connect: {
          title: "Yhdistä",
          body: "Sovellus avaa palvelimesi sivun, joka pyytää avustajan avainta. Sivu kertoo, minne se palauttaa sinut: jatka vain, jos se on tekoälysovelluksesi."
        }
      },
      keyStep: {
        title: "Luo avustajan avain",
        leadHosted: "Tee se, kun sattle.me-sivu pyytää sitä: se näytetään vain kerran.",
        leadDesktop: "Tee se, kun Claude Desktop pyytää sitä: se näytetään vain kerran.",
        leadSelfHosted: "Tee se, kun palvelimesi sivu pyytää sitä: se näytetään vain kerran.",
        name: "Avustajan nimi",
        namePlaceholder: "Alicen Claude",
        nameHint: "Nimi näkyy lompakossasi sen laskujen vieressä.",
        permissionsTitle: "Mitä tämä avustaja saa tehdä",
        nonePicked: "Ota käyttöön vähintään yksi lupa luodaksesi avaimen.",
        powerTitle: "Sillä ei voi koskaan käyttää rahaa",
        power: {
          hosted: "Liitä se vain sattle.me-sivulle, ei koskaan keskusteluun.",
          desktop: "Liitä se vain Claude Desktopiin, ei koskaan keskusteluun.",
          selfHosted: "Liitä se vain palvelimesi sivulle, ei koskaan keskusteluun."
        }
      },
      keySheet: {
        once: "Se näytetään vain kerran: kopioi se nyt. Sitä ei voi enää näyttää, ei edes pääsyavaimellasi. Jos se katoaa, poista avustaja ja luo uusi.",
        unpublished:
          "Avustajaa {{name}} ei vielä voitu julkaista releillesi. Se julkaistaan, kun seuraavan kerran avaat lukituksen pääsyavaimellasi internetyhteyden ollessa päällä: siihen asti se ei voi tehdä mitään.",
        secret:
          "Pidä se salassa. Jos se on vuotanut, poista avustaja ja luo uusi: jo tehdyt laskut ovat yhä maksettavissa.",
        pasteHosted:
          "Liitä se sattle.me-sivulle. Pyydä sitten esimerkiksi: ”Tee lasku Dupont SA:lle kolmen päivän konsultoinnista, 1200 CHF päivä, eräpäivä 30 päivän päästä.”",
        pasteDesktop:
          "Liitä se Claude Desktopin kenttään ”Assistant key”. Pyydä sitten esimerkiksi: ”Tee lasku Dupont SA:lle kolmen päivän konsultoinnista, 1200 CHF päivä, eräpäivä 30 päivän päästä.”",
        pasteSelfHosted:
          "Liitä se palvelimesi sivulle. Pyydä sitten esimerkiksi: ”Tee lasku Dupont SA:lle kolmen päivän konsultoinnista, 1200 CHF päivä, eräpäivä 30 päivän päästä.”",
        pasteHostedExport:
          "Liitä se sattle.me-sivulle. Pyydä sitten esimerkiksi: ”Vie viime kuun tapahtumat CSV-tiedostona kirjanpitäjälleni.”",
        pasteSelfHostedExport:
          "Liitä se palvelimesi sivulle. Pyydä sitten esimerkiksi: ”Vie viime kuun tapahtumat CSV-tiedostona kirjanpitäjälleni.”",
        pasteDesktopExport:
          "Liitä se Claude Desktopin kenttään ”Assistant key”. Pyydä sitten esimerkiksi: ”Vie viime kuun tapahtumat CSV-tiedostona kirjanpitäjälleni.”"
      },
      created: "Tekoälyavustaja · luotu {{date}}",
      createdExporting: "Tekoälyavustaja · luotu {{date}} · vie tapahtumasi",
      createdExportOnly: "Tekoälyavustaja · luotu {{date}} · vie tapahtumasi, ei laskuja",
      createdNoInvoices: "Tekoälyavustaja · luotu {{date}} · ei laskuja",
      invoicing: {
        switch: "Laskujen tekeminen",
        switchHint:
          "Kun otat tämän käyttöön, sallit tämän tekoälyavustajan tehdä laskuja yrityksesi nimissä, samaan numerosarjaan kuin omasi, ja lukea tekemiään laskuja asiakkaidesi nimineen ja osoitteineen. Tätä valintaa ei voi myöhemmin muuttaa tälle avaimelle."
      },
      export: {
        allow: "Salli tapahtumien vienti",
        withdraw: "Lopeta tapahtumien vienti",
        switch: "Pääsy myynteihisi ja lähetettyihin maksuihin",
        switchHint:
          "Kun otat tämän käyttöön, sallit tämän tekoälyavustajan lukea yrityksesi myynnit ja lähetetyt maksut niiden viemiseksi. Se ei voi koskaan käyttää rahaa.",
        suspended:
          "Tilapäisesti poissa käytöstä: tekoälyavustajien pääsy myynteihisi ja lähetyksiisi tarjotaan uudelleen tulevassa versiossa.",
        allowDialog: {
          title: "Sallitaanko avustajan {{name}} viedä tapahtumasi?",
          body: "{{name}} voi lukea releillesi tallennetut yrityksen {{business}} myynnit ja lähetetyt maksut ja viedä ne kuten « $t(navigation.destinations.wallet) › $t(walletExport.open) ». Ilman myyntiä vastaanotetut maksut (suoraan Lightning-osoitteeseesi tai lompakkoosi) eivät ole mukana. Se ei voi koskaan kuluttaa varoja. Jos lopetat luvan, se ei enää vie tapahtumia, mutta siihen asti tehty kopio sen avaimesta voisi yhä lukea sitä ennen kirjatut myyntisi.",
          confirm: "Salli"
        },
        withdrawDialog: {
          title: "Lopetetaanko avustajan {{name}} vienti?",
          body: "{{name}} ei voi enää viedä yrityksen {{business}} tapahtumia. Jo viety jää tekoälysovellukseesi.",
          confirm: "Lopeta vienti"
        },
        allowedTitle: "Vienti sallittu",
        allowedBody: "{{name}} voi viedä tapahtumasi",
        withdrawnTitle: "Vienti lopetettu",
        withdrawnBody: "{{name}} ei voi enää viedä tapahtumiasi",
        unreachable: "Lupaa ei voitu julkaista. Tarkista internetyhteys ja yritä uudelleen",
        createFailedTitle: "Vientiä ei vielä sallittu",
        createFailed:
          "{{name}} luotiin, mutta vientiä ei voitu sallia. Yritä uudelleen integraatioiden luettelosta"
      },
      remove: "Poista avustaja",
      removeDialog: {
        title: "Poistetaanko {{name}}?",
        body: "{{name}} ei enää tee laskuja yritykselle {{business}}. Sen tekemät laskut ovat maksettavissa eräpäiväänsä asti ja näkyvät lompakossasi.",
        confirm: "Poista avustaja",
        doneTitle: "Avustaja poistettu",
        doneBody: "{{name}} ei enää tee laskuja."
      }
    },
    keySheet: {
      title: "Integraation {{name}} avain",
      keyLabel: "Salainen avain",
      once: "Se näytetään vain kerran: kopioi se nyt. Sitä ei voi enää näyttää, ei edes pääsyavaimellasi. Jos se katoaa, poista integraatio ja luo uusi.",
      unpublished:
        "Integraatiota {{name}} ei vielä voitu julkaista releillesi. Se julkaistaan, kun seuraavan kerran avaat lukituksen pääsyavaimellasi internetyhteyden ollessa päällä: siihen asti sen palvelin ei löydä sitä.",
      secret:
        "Pidä se salassa, vain tämän kaupan palvelimilla: ei koskaan verkkosivulla, sovelluksessa eikä toiselle kaupalle. Sillä ei voi käyttää varojasi. Jos se on vuotanut, poista integraatio ja luo uusi.",
      copy: "Kopioi avain",
      copied: "Avain kopioitu",
      copyFailed: "Avainta ei voitu kopioida. Valitse se ja kopioi se sitten.",
      done: "Valmis"
    },
    removeDialog: {
      title: "Poistetaanko {{name}}?",
      body: "Sen avaimella ei voi enää luoda maksupyyntöjä yritykselle {{business}}. Jo näytetyn pyynnön voi maksaa sen loppuun asti, ja sen aiemmat myynnit jäävät lompakkoon.",
      confirm: "Poista integraatio",
      doneTitle: "Integraatio poistettu",
      doneBody: "Integraation {{name}} avain ei enää luo maksupyyntöjä."
    },
    pendingDialog: {
      title: "Integraatiolla {{name}} on keskeneräisiä maksuja",
      unknownTitle: "Integraation {{name}} maksuja ei voitu tarkistaa",
      lead: "Odota, kunnes integraation {{name}} maksut ovat lopullisia, ennen kuin poistat sen, jotta jokainen sen myynti pysyy sen nimissä.",
      unknownLead:
        "Integraation {{name}} maksujen lopullisuutta ei voitu tarkistaa. Odota, kunnes ne ovat lopullisia, ennen kuin poistat sen, jotta jokainen sen myynti pysyy sen nimissä.",
      open_one: "{{count}} maksupyyntö on yhä avoinna, viimeistään klo {{time}} asti.",
      open_other: "{{count}} maksupyyntöä on yhä avoinna, viimeistään klo {{time}} asti.",
      confirming_one:
        "{{count}} Bitcoin-maksu odottaa vahvistusta (3 vahvistusta, noin puoli tuntia).",
      confirming_other:
        "{{count}} Bitcoin-maksua odottaa vahvistusta (3 vahvistusta, noin puoli tuntia).",
      end: "Yritä sen jälkeen uudelleen.",
      forceNote:
        "Jos et voi odottaa (esimerkiksi sen avain on vuotanut), poista se silti: sen maksut tulevat yhä lompakkoosi, mutta ne, joita se ei nähnyt ennen poistoaan, eivät ole sen nimissä.",
      force: "Poista silti",
      retry: "Yritä uudelleen",
      close: "Sulje"
    },
    failedTitle: "Toiminto ei onnistu",
    unreachableTitle: "Ei yhteyttä",
    errors: {
      noAccount: "Avaa tämä myyntipiste passkeylläsi hallitaksesi integraatioita.",
      tooMany: "Tililläsi on jo {{max}} integraatiota. Poista yksi luodaksesi uuden.",
      tooManyAssistants: "Tililläsi on jo {{max}} avustajaa. Poista yksi luodaksesi uuden.",
      invalidName: "Kirjoita integraation nimi.",
      unreachable: "Integraatiota ei voitu julkaista. Tarkista internetyhteys ja yritä uudelleen.",
      removeUnreachable: "Poistoa ei voitu julkaista. Tarkista internetyhteys ja yritä uudelleen.",
      removeFailed: "Poistoa ei voitu tallentaa. Yritä uudelleen.",
      removalUnsaved:
        "Tämän integraation avain ei enää luo maksupyyntöjä, mutta poistoa ei voitu tallentaa. Yritä uudelleen: se tallennetaan myös, kun avaat tilisi seuraavan kerran.",
      exportNewer:
        "Sovelluksen uudempi versio muutti tätä avustajaa. Päivitä sovellus muuttaaksesi sitä"
    }
  },
  articles: {
    add: "Lisää tuote",
    loading: "Tuotteita ladataan…",
    guide: {
      title: "Myy muutamalla napautuksella",
      lead: "Luo juomat, ruoat ja jälkiruoat kerran: ne näkyvät kassassasi ja työntekijöidesi kassoissa.",
      create: {
        title: "Luo tuotteesi",
        caption: "Nimi, hinta ja kuva. Skannaa viivakoodi, niin tiedot täyttyvät nopeammin.",
        captionNoScan: "Nimi, hinta ja kuva."
      },
      tap: {
        title: "Napauta niitä kassalla",
        caption:
          "Siirry kohtaan « $t(pos.mode.articles) »: jokainen napautus lisää tuotteen ostoskoriin. Puhelimen sovelluksessa voit myös skannata niiden viivakoodin."
      },
      cash: {
        title: "Veloita ostoskori",
        caption: "Kokonaissumma lasketaan itsestään: asiakkaasi skannaa QR-koodin ja maksaa."
      }
    },
    offline: "Yksikään välityspalvelin ei vastannut. Tarkista yhteys ja palaa tähän näkymään.",
    newer: "Osa tuotteista on sovelluksen uudemmasta versiosta: päivitä sovellus nähdäksesi ne.",
    openHint: "Avaa tuotteen muokattavaksi tai poistettavaksi.",
    saved: {
      title: "Tuote tallennettu",
      body: "{{name}} on tuotteissasi."
    },
    changed: {
      title: "Tuote muutettu",
      body: "{{name}} on ajan tasalla."
    },
    removed: {
      title: "Tuote poistettu",
      body: "{{name}} ei ole enää tuotteissasi."
    },
    removeDialog: {
      title: "Poistetaanko {{name}}?",
      body: "Tuote katoaa tuotteistasi kaikilla laitteillasi. Toimintoa ei voi perua.",
      confirm: "Poista tuote"
    },
    form: {
      title: "Uusi tuote",
      editTitle: "Muokkaa tuotetta",
      scan: "Skannaa",
      addPhoto: "Lisää kuva",
      changePhoto: "Vaihda kuva",
      preparingPhoto: "Valmistellaan kuvaa…",
      dropPhoto: "Vedä kuva tähän",
      choosePhoto: "tai valitse tiedosto",
      photoMenu: "Tuotteen kuva",
      takePhoto: "Ota kuva",
      pickPhoto: "Valitse kuvistasi",
      nameLabel: "Nimi",
      namePlaceholder: "Tuotteen nimi",
      priceLabel: "Hinta",
      priceInvalid: "Anna hinta, esimerkiksi 4,80",
      descriptionLabel: "Kuvaus",
      descriptionPlaceholder: "Ainesosat, koko, allergeenit",
      addDescription: "Lisää kuvaus",
      fromOpenFoodFacts: "· Open Food Factsista",
      searching: "· haetaan Open Food Factsista",
      save: "Tallenna tuote",
      saveChanges: "Tallenna muutokset",
      remove: "Poista tuote"
    },
    scanner: {
      title: "Skannaa viivakoodi",
      aim: "Kohdista viivakoodiin",
      lead: "Nimi ja kuva haetaan Open Food Factsista. Sinun tarvitsee vain asettaa hinta.",
      leadNoLookup: "Syötät nimen, kuvan ja hinnan itse.",
      manual: "Syötä ilman viivakoodia",
      denied: "Salli kameran käyttö viivakoodin skannaamiseksi.",
      // The web app: the browser's own settings (BarcodeScanner.tsx).
      deniedWeb:
        "Salli kamera tälle sivustolle selaimen asetuksista (lukko osoitteen vieressä) ja napauta sitten ”Salli kamera”.",
      allow: "Salli kamera",
      settings: "Avaa asetukset",
      unavailable: "Kameraa ei voitu käynnistää. Tässä laitteessa ei ehkä ole kameraa.",
      engineFailed:
        "Viivakoodinlukijaa ei voitu ladata. Tarkista internetyhteys ja yritä uudelleen.",
      retry: "Yritä uudelleen",
      notFoundTitle: "Tuotetta ei löytynyt",
      notFoundBody: "Tätä viivakoodia ei tunnistettu. Syötä tuotteen nimi.",
      unreachableTitle: "Tuotetta ei voitu hakea",
      unreachableBody: "Skannaa uudelleen hetken päästä tai syötä tuotteen nimi."
    },
    errors: {
      title: "Tuotetta ei tallennettu",
      changeTitle: "Tuotetta ei muutettu",
      removeTitle: "Tuotetta ei poistettu",
      noAccount: "Avaa sovellus pääsyavaimellasi ja yritä uudelleen.",
      invalid: "Anna nimi ja hinta.",
      tooMany: "Luettelo on täynnä: enintään 500 tuotetta.",
      unreachable: "Liian harva välityspalvelin vastasi. Tarkista yhteys ja yritä uudelleen.",
      photoDenied: "Salli kuvien käyttö laitteen asetuksista ja yritä uudelleen.",
      cameraDenied: "Kamera ei avaudu. Salli se laitteen asetuksista ja yritä uudelleen.",
      photoUnreadable: "Tätä kuvaa ei voi käyttää. Valitse toinen."
    }
  },
  activity: {
    limited: "Näkymä rajattu omiin tapahtumiisi",
    followUp: "Seurattavat",
    movements: "Tapahtumat",
    yourMovements: "Omat tapahtumasi",
    allMovements: "Kaikki tapahtumat",
    allYourMovements: "Kaikki omat tapahtumasi",
    dayNet: "Päivän nettosumma: {{amount}}",
    clearFilter: "{{name}}, poista suodatin",
    reading: "Ladataan myyntejä ja laskuja…",
    loadFailed: "Toimintaasi ei voitu lukea. Tarkista internetyhteys ja yritä uudelleen.",
    empty: "Ei vielä tapahtumia.",
    noMatch: "Mikään tapahtuma ei vastaa suodattimia.",
    showExpired: "Näytä vanhentuneet ({{count}})",
    hideExpired: "Piilota vanhentuneet",
    showMore: "Näytä lisää",
    arrivals_one: "{{count}} uusi tapahtuma",
    arrivals_other: "{{count}} uutta tapahtumaa",
    expiredHidden: "Vanhentuneet laskut on piilotettu.",
    pendingCredit: {
      awaiting: "ei vielä saldossa",
      received: "Maksu vastaanotettu",
      confirmed: "vahvistettu",
      credit: "Lisäys saldoosi",
      waiting: "odottaa",
      fees: "Tämän maksun lisääminen saldoosi maksaa juuri nyt yli {{fee}}, joka on rajamme. Se tehdään automaattisesti, kun avaat lompakkosi ja kustannus ei enää ylitä sitä.",
      feesQuoted:
        "Tämän maksun lisääminen saldoosi maksaa juuri nyt {{price}}, enemmän kuin rajamme {{fee}}. Se tehdään automaattisesti, kun avaat lompakkosi ja kustannus ei enää ylitä sitä.",
      other:
        "Lisäys tehdään automaattisesti, kun avaat lompakkosi. Vähennettävät maksut: enintään {{fee}}."
    },
    followUps: {
      open: "Avoimet",
      underpaid: "Alimaksetut",
      unconfirmed: "Vahvistetaan",
      draft: "Luonnokset"
    },
    followUpTitles: {
      open: "Avoimet laskut",
      underpaid: "Alimaksetut laskut",
      unconfirmed: "Vahvistetaan",
      draft: "Luonnokset"
    },
    followUpLabel: "{{name}}: {{count}}, {{total}}",
    rest: "jäljellä {{amount}}",
    states: {
      open: "Avoin",
      underpaid: "Alimaksettu",
      unconfirmed: "Vahvistetaan",
      draft: "Luonnos",
      expired: "Vanhentunut",
      canceled: "Peruttu",
      inProgress: "Käynnissä",
      failed: "Epäonnistui"
    },
    done: {
      paid: "Maksettu",
      received: "Vastaanotettu",
      sent: "Lähetetty"
    },
    sources: {
      pos: "Kassa",
      link: "Lasku",
      integration: "Integraatio",
      receive: "Vastaanotettu",
      send: "Lähetetty",
      recovered: "Palautus"
    },
    titles: {
      link: "Lasku",
      recovered: "Palautetut varat",
      mtpSale: "Myynti ({{currency}})",
      // Rows copied from the v2 account (src/features/activity/legacy-history.ts).
      payout: "Nosto lompakkoosi",
      referral: "Suosittelupalkkio"
    },
    mtpSale: {
      section: "Myynti",
      received: "Saat",
      transferNowNote: "Siirretään yksin, odottamatta muita myyntejäsi",
      transferLaterNote: "Koottuna tilisiirtona muiden myyntiesi kanssa, alkaen {{threshold}}",
      follow: "Seuraa myyntiä",
      followLabel: "Toimeksianto {{order}}, seuraa myyntiä"
    },
    you: "Sinä",
    stamp: "{{day}} · {{time}}",
    columns: {
      date: "Päivä",
      label: "Kuvaus",
      source: "Lähde",
      by: "Tekijä",
      state: "Tila",
      amount: "Summa",
      sats: "sats"
    },
    detail: {
      date: "Päivä",
      takenBy: "Veloittaja",
      madeBy: "Luoja",
      rest: "Maksettavaa jäljellä",
      endsAt: "Maksettavissa asti",
      payments: "Maksut",
      link: "Maksulinkki",
      openLink: "Avaa lasku",
      copyLink: "Kopioi linkki",
      linkCopied: "Linkki kopioitu",
      accepted: "Hyväksytty",
      difference: "Hyväksytty erotus",
      acceptedLate:
        "Hyväksytty liian myöhään lähetettäväksi kauppaan ({{integration}}): tilaus pysyy siellä vanhentuneena. Tarkista, että se on merkitty maksetuksi kaupan hallintapaneelissa."
    },
    accept: {
      action: "Hyväksy vastaanotettu summa",
      done: "Vastaanotettu summa hyväksytty",
      dialog: {
        title: "Hyväksytäänkö vastaanotettu summa?",
        body: "Myynti merkitään maksetuksi summalla {{received}}. Erotusta {{difference}} ei enää pyydetä. Tämä on lopullinen.",
        bodyOrder:
          "Tilaus merkitään maksetuksi summalla {{received}}: kauppasi näkee sen maksettuna, kun maksu on vahvistettu. Erotusta {{difference}} ei enää pyydetä. Tämä on lopullinen.",
        bodyLate:
          "Tilaus merkitään maksetuksi summalla {{received}}, eikä erotusta {{difference}} enää pyydetä. Hyväksyntää ei välitetä kaupalle ({{integration}}), jossa tilaus pysyy vanhentuneena: merkitse se maksetuksi myös kaupan hallintapaneelissa. Tämä on lopullinen.",
        confirm: "Hyväksy",
        cancel: "Takaisin"
      },
      late: {
        title: "Tämän tilauksen lasku on päättynyt",
        body: "Tilaus pysyy vanhentuneena kaupan puolella ({{integration}}), eikä hyväksyntäsi näy siellä. Jos hyväksyt sen täällä, merkitse se maksetuksi myös kaupan hallintapaneelissa.",
        closingTitle: "Tämän tilauksen lasku on päättymässä",
        closingBody:
          "On liian myöhäistä, jotta kauppa ({{integration}}) saisi hyväksyntäsi. Jos hyväksyt sen täällä, merkitse se maksetuksi myös kaupan hallintapaneelissa.",
        lapsedBody:
          "Hyväksyntäsi ei ehtinyt useimpiin releihisi ennen laskun päättymistä: kauppa ({{integration}}) ei näe sitä. Jos hyväksyt sen täällä, merkitse se maksetuksi myös kaupan hallintapaneelissa.",
        yourShop: "verkkokauppasi"
      },
      errors: {
        network: "Hyväksyntää ei voitu tallentaa, yritä uudelleen",
        already: "Tämä myynti on jo hyväksytty",
        ended: "Liian myöhäistä lähettää hyväksyntää kauppaan: lue varoitus ennen hyväksymistä"
      },
      pending:
        "Hyväksyntää tallennetaan: se lasketaan, kun useimmat releistäsi ovat vastaanottaneet sen ennen laskun päättymistä.",
      blocked: {
        unread:
          "Sovellus ei ole vielä voinut tarkistaa useimmilta releiltäsi, onko vastaanotettu summa jo hyväksytty. ”$t(activity.accept.action)” näkyy tässä, kun tarkistus on tehty. Jos se kestää, käytä toimintoa ”$t(relays.test)” kohdassa ”$t(settings.relays)”.",
        unmet:
          "Vastaanotettu summa hyväksyttiin, kun se oli {{received}}, mutta sovellus näkee nyt vähemmän, esimerkiksi kun jokin transaktio on korvattu. Hyväksyntä on taas voimassa heti, kun tämä summa saavutetaan: sitä ei tehdä uudelleen.",
        newer:
          "Vastaanotettu summa hyväksyttiin sovelluksen uudemmalla versiolla: päivitä sovellus nähdäksesi tämän hyväksynnän."
      }
    }
  },
  table: {
    headerHint: "Lajittele ja suodata",
    sortedBy: "lajiteltu: {{order}}",
    filtered: "suodatettu",
    menu: "{{name}}: lajittele ja suodata",
    sort: "Lajittele",
    orders: {
      text: { ascending: "A–Ö", descending: "Ö–A" },
      number: { ascending: "Pienimmästä suurimpaan", descending: "Suurimmasta pienimpään" },
      date: { ascending: "Vanhimmasta uusimpaan", descending: "Uusimmasta vanhimpaan" }
    },
    show: "Näytä",
    selectAll: "Valitse kaikki",
    periods: {
      thisWeek: "Tällä viikolla",
      lastWeek: "Viime viikolla",
      thisMonth: "Tässä kuussa",
      lastMonth: "Viime kuussa",
      thisYear: "Tänä vuonna",
      lastYear: "Viime vuonna",
      older: "Vanhemmat"
    },
    value: "{{label}}, {{count}}",
    emptyValue: "Tyhjä",
    clearFilters: "Tyhjennä suodattimet"
  },
  wallet: {
    balance: "Saldo",
    atLeast: "vähintään",
    discreet: "Huomaamaton",
    hiddenAmount: "Summa piilotettu",
    received: "Vastaanotettu 30 päivässä",
    sent: "Lähetetty 30 päivässä",
    send: "Lähetä",
    sell: "Myy",
    sellFrom: "alkaen {{amount}} satia",
    opening: "Lompakkoasi avataan…",
    loadFailed: "Lompakkoasi ei voitu lukea. Tarkista internetyhteys ja yritä uudelleen.",
    retry: "Yritä uudelleen",
    empty: "Ei vielä tapahtumia.",
    guide: {
      lead: "Ei vielä tapahtumia. Näin ne syntyvät:",
      label: "Miten tapahtumat syntyvät",
      take: {
        title: "Ota maksu",
        caption: "Syötä summa kassalla: asiakkaasi skannaa QR-koodin ja maksaa."
      },
      receive: {
        title: "Vastaanota",
        caption:
          "Maksu tulee lompakkoosi ja näkyy täällä yhdessä sen ottaneen henkilön nimen kanssa."
      },
      follow: {
        title: "Seuraa ja lähetä",
        caption:
          "Laskut, maksulinkit, siirrot: seuraa kaikkea täällä. Lähetä satsisi milloin haluat."
      }
    },
    syncing: "Päivitetään…",
    syncingWallet: "Lompakkoasi synkronoidaan…",
    syncLate:
      "Lompakkoasi ei voitu päivittää: näytetty saldo ja tapahtumat ovat tämän laitteen tietoja ja voivat olla puutteellisia. Tarkista internetyhteys.",
    syncLateBlank: "Lompakkoasi ei voitu synkronoida. Tarkista internetyhteys ja yritä uudelleen.",
    noRate: "Vaihtokurssi ei saatavilla: osa summista vain satseina.",
    today: "Tänään",
    yesterday: "Eilen",
    meta: "{{time}} · {{kind}}",
    kinds: {
      lightningReceipt: "Lightning-maksu vastaanotettu",
      lightningAddress: "Lightning-osoite",
      lightningInvoice: "Lightning-lasku",
      bitcoinAddress: "Bitcoin-osoite",
      sparkTransfer: "Spark-siirto"
    },
    titles: {
      deposit: "Talletus",
      withdrawal: "Nosto",
      receipt: "Vastaanotettu",
      sending: "Lähetetty"
    },
    pills: {
      confirming: "Vahvistetaan",
      inProgress: "Käynnissä",
      failed: "Epäonnistui"
    },
    networks: {
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      spark: "Spark"
    },
    detail: {
      date: "Päivämäärä",
      network: "Verkko",
      fee: "Kulut",
      sendFee: "Lähetyskulut",
      noFee: "Ei kuluja",
      reference: "Viite",
      copy: "Kopioi viite",
      copied: "Viite kopioitu",
      recipient: "Vastaanottaja",
      copyAddress: "Kopioi osoite",
      addressCopied: "Osoite kopioitu",
      close: "Sulje"
    },
    sendSheet: {
      intro:
        "Kirjoita, liitä tai skannaa Lightning-osoite, Lightning-lasku, Bitcoin-osoite tai Spark-osoite.",
      introNoScan:
        "Kirjoita tai liitä Lightning-osoite, Lightning-lasku, Bitcoin-osoite tai Spark-osoite.",
      close: "Sulje",
      cancel: "Peruuta",
      recipient: "Vastaanottaja",
      recipientPlaceholder: "Osoite tai lasku",
      paste: "Liitä",
      scan: "Skannaa QR-koodi",
      reading: "Luetaan vastaanottajaa…",
      kinds: {
        lightningAddress: "Lightning-osoite",
        lnurlPay: "LNURL-linkki",
        bolt11: "Lightning-lasku",
        bitcoinAddress: "Bitcoin-osoite",
        sparkAddress: "Spark-osoite"
      },
      recipientErrors: {
        unrecognized: "Kirjoita osoite tai lasku",
        unsupported: "Kirjoita osoite tai lasku",
        otherNetwork: "Käytä pääverkon osoitetta",
        expired: "Pyydä uusi lasku",
        unreachable: "Tarkista Lightning-osoite",
        lnurlUnreachable: "Yritä uudelleen: LNURL-linkki ei vastaa",
        failed: "Tarkista internetyhteys",
        pasteEmpty: "Kopioi ensin osoite tai lasku",
        pasteFailed: "Liitä kenttään näppäimistöllä"
      },
      amount: "Summa",
      switchToSats: "Syötä satseina",
      switchToFiat: "Syötä valuutassa {{currency}}",
      available: "Käytettävissä: {{amount}}",
      amountErrors: {
        invalid: "Syötä kelvollinen summa",
        belowMin: "Syötä vähintään {{amount}}",
        aboveMax: "Syötä enintään {{amount}}",
        aboveBalance: "Syötä enintään käytettävissä oleva saldo",
        feesAboveBalance: "Pienennä summaa kulujen kattamiseksi"
      },
      speed: "Nopeus",
      speeds: {
        fast: "Nopea",
        medium: "Normaali",
        slow: "Edullinen"
      },
      fee: "Arvioidut kulut",
      feePreparing: "Lasketaan kuluja…",
      quoteFailed: "Kuluja ei voitu laskea. Tarkista internetyhteys ja yritä sitten uudelleen.",
      balanceAfter: "Saldo lähetyksen jälkeen",
      expiresIn: "Vanhenee",
      send: "Lähetä {{amount}}",
      pay: "Maksa {{amount}}",
      confirming: "Vahvista pääsyavaimellasi…",
      sending: "Lähetetään…",
      sendFailed:
        "Lähetys ei onnistunut. Tarkista internetyhteys ja yritä uudelleen: maksu lähtee vain kerran.",
      recordFailed:
        "Tilisi releet eivät vastanneet: mitään ei lähetetty. Tarkista internetyhteytesi ja yritä uudelleen.",
      noRate: "Bitcoinin kurssi ei ole saatavilla: syötä summa satseina.",
      result: {
        completedTitle: "Maksu lähetetty",
        onchainTitle: "Maksu lähetetty",
        onchainBody:
          "Bitcoin-verkon on vielä vahvistettava tapahtuma: sen tila näkyy tapahtumaluettelossa.",
        pendingTitle: "Maksu käynnissä",
        pendingBody:
          "Maksu on matkalla. Tämä ikkuna päivittyy itsestään; sen sulkeminen ei peruuta maksua.",
        stalledTitle: "Yhä käynnissä",
        stalledBody: "Sen lopullinen tila näkyy tapahtumaluettelossa.",
        failedTitle: "Maksu epäonnistui",
        failedBody: "Tarkista vastaanottaja ja saldo ja yritä sitten uudelleen.",
        recipientTo: "Vastaanottajalle {{recipient}}",
        recipientSent: "Vastaanottajalle {{recipient}}",
        done: "Valmis"
      },
      scanHint: "Osoita Lightning-laskun, Lightning-osoitteen tai Bitcoin-osoitteen QR-koodia.",
      scanType: "Kirjoita",
      scanDenied: "Salli kameran käyttö QR-koodin skannaamiseksi.",
      scanAllow: "Salli kamera",
      scanSettings: "Avaa asetukset"
    }
  },
  sell: {
    title: "Myy",
    back: "Takaisin",
    retry: "Yritä uudelleen",
    busy: {
      starting: "Mt Pelerin -tiliäsi luetaan…",
      reading: "Mt Pelerin -tiliäsi luetaan…",
      signingIn: "Kirjaudutaan Mt Pelerinille…",
      sendingCode: "Koodia lähetetään…",
      checkingCode: "Koodia tarkistetaan…",
      savingProfile: "Tallennetaan…",
      preparingInvoice: "1 satin maksua valmistellaan…",
      confirming: "Vahvistetaan…",
      paying: "Maksetaan…",
      addingAccount: "Tiliä lisätään…",
      savingAccount: "Tiliä tallennetaan…",
      loggingOut: "Kirjaudutaan ulos…"
    },
    failures: {
      offline: "Myyntipalvelu ei vastaa. Tarkista internetyhteys ja yritä uudelleen",
      server: "Myyntipalvelu lähetti lukukelvottoman vastauksen. Yritä hetken kuluttua uudelleen",
      refused: "Pyyntö hylättiin",
      codeRefused: "Tämä koodi ei ole oikea",
      codeExpired: "Tämä koodi on vanhentunut: pyydä uusi",
      malformed: "Myynnin lasku ei ole odotettu: mitään ei maksettu",
      otherNetwork: "Myynnin lasku ei ole odotettu: mitään ei maksettu",
      otherAmount: "Myynnin lasku ei ole odotettu: mitään ei maksettu",
      expired: "Myynnin lasku on vanhentunut: mitään ei maksettu",
      payment: "Maksu ei lähtenyt. Yritä uudelleen",
      record:
        "Tilisi releet eivät vastanneet: mitään ei myyty. Tarkista internetyhteytesi ja yritä uudelleen",
      ibanTaken: "Tämä IBAN on jo rekisteröity toiselle Mt Pelerin -tilille",
      accountKnown: "Tämä tili on jo pankkitileissäsi tässä valuutassa",
      accountUnchanged:
        "Mt Pelerin ei muuttanut tätä tiliä: sen tiedot ovat yhä näytetyt. Ota yhteyttä Mt Peleriniin muuttaaksesi niitä"
    },
    sessionLost: "Mt Pelerin -istuntosi on vanhentunut: kirjaudu uudelleen",
    intro: {
      title: "Myy Mt Pelerinin kautta",
      lead: "Mt Pelerin, sveitsiläinen rahoituksen välittäjä, ostaa satisi ja siirtää frangit pankkitilillesi.",
      connectLead: "Mt Pelerin -tilisi avautuu sattle.me-tilisi avaimella.",
      connect: "Kirjaudu Mt Pelerinille",
      phoneLead: "Mt Pelerin -tilisi avautuu puhelinnumerollasi.",
      phone: "Puhelinnumero",
      phoneHint: "Mt Pelerin lähettää sinulle koodin tekstiviestillä",
      sendCode: "Vastaanota koodi",
      dialCountry: "Numeron maa",
      dialCodeOf: "Numeron maa: {{country}}, {{code}}"
    },
    code: {
      title: "Syötä koodisi",
      lead: "Mt Pelerin lähetti sen juuri tekstiviestillä numeroon {{phone}}.",
      label: "6-numeroinen koodi",
      notReceived: "Etkö saanut sitä?",
      resend: "Lähetä koodi uudelleen",
      submit: "Vahvista"
    },
    profile: {
      title: "Sähköpostisi",
      lead: "Mt Pelerin tarvitsee sen tilisi avaamiseen. Se lähettää sinne jokaisen myynnin kuitin.",
      email: "Sähköposti",
      emailInvalid: "Anna kelvollinen sähköposti",
      phone: "Puhelinnumero",
      phoneInvalid: "Anna kelvollinen numero suuntanumeroineen",
      phoneCaption: "Mt Pelerin -tilisi numero",
      submit: "Jatka"
    },
    validation: {
      title: "Vahvista lompakkosi",
      lead: "Lompakkosi on vahvistettava. Maksa 1 sat ({{value}}) vahvistuksen tekemiseksi.",
      toPay: "Maksettava",
      fee: "Lightning-kulut",
      pay: "Maksa 1 sat",
      unaffordable: "Saldosi ei kata 1 satia ja sen kuluja. Palaa seuraavan maksusi jälkeen",
      leadNoRate: "Lompakkosi on vahvistettava. Maksa 1 sat vahvistuksen tekemiseksi.",
      lessThan: "alle {{amount}}",
      about: "noin {{amount}}"
    },
    pending: {
      badge: "Käynnissä",
      title: "Lompakkoasi vahvistetaan",
      leadNoBank: "Voit jatkaa: pankkitilisi ei riipu tästä tarkistuksesta.",
      leadBank:
        "Voit poistua tästä näkymästä: voit myydä heti, kun lompakkosi on vahvistettu (yleensä alle 15 minuuttia).",
      paid: "1 sat maksettu",
      toBank: "Lisää pankkitilisi"
    },
    verified: {
      title: "Osoite tarkistettu",
      lead: "Satisi on saapunut. Myyntisi lähtevät osoitteesta {{address}}.",
      account: "Mt Pelerin -tili",
      address: "Lightning-osoite",
      addressVerified: "Tarkistettu",
      bank: "Pankkitili",
      toBank: "Lisää pankkitilisi",
      continue: "Jatka",
      bankTodo: "Täytettävä"
    },
    bank: {
      title: "Minne {{currency}}-varasi siirretään",
      lead: "Tili, jolle myyntisi siirretään. Se on sinun tai yrityksesi.",
      none: "Ei vielä rekisteröityä pankkitiliä",
      add: "Lisää tili"
    },
    accountForm: {
      title: "Lisää tili",
      submit: "Lisää tämä tili"
    },
    accountEdit: {
      title: "Muokkaa tiliä",
      lead: "Jos haluat toisen IBANin tai toisen valuutan, lisää tili.",
      submit: "Tallenna"
    },
    payoutCurrency: {
      label: "Siirtojen valuutta",
      swift:
        "Kansainvälinen tilisiirto (SWIFT): yksi pankkipäivä tai enemmän. Välittäjäpankit voivat periä maksuja muutamasta dollarista useisiin kymmeniin"
    },
    accounts: {
      title: "Pankkitilit",
      lead: "Myyntisi siirretään vain näille tileille.",
      add: "Lisää tili",
      fromSettings: "Asetukset",
      pending: "Odottaa",
      editHint: "Muokkaa tilinhaltijan nimeä ja osoitetta",
      // Accounts Mt Pelerin listed that the app cannot read (guards.ts): never offered.
      unreadable_one: "{{count}} muu tili ei ollut luettavissa: sitä ei tarjota",
      unreadable_other: "{{count}} muuta tiliä ei voitu lukea: niitä ei tarjota",
      // Mt Pelerin lacks a line of its holder's address: offered all the same.
      incompleteAddress: "Osoite puutteellinen"
    },
    addressTaken: {
      title: "Osoite on jo rekisteröity",
      body: "Lightning-osoitteesi on rekisteröity toiselle Mt Pelerin -tilille. Kirjaudu sen tilin numerolla.",
      switch: "Vaihda tiliä"
    },
    unavailable: "Sattien myynti Lightningin kautta ei ole toistaiseksi saatavilla",
    sale: {
      amount: "Summa",
      available: "Käytettävissä: {{amount}}",
      change: "Vaihda",
      fee: "Myyntikulut",
      receive: "Saat noin",
      estimating: "Lasketaan…",
      estimateFailed: "Ei saatavilla",
      pending: "Odottaa",
      pendingBalance: "Saldo: {{amount}}",
      pendingSale: "Tämä myynti: {{amount}}",
      pendingGauge: "Odottaa {{balance}} ja tästä myynnistä {{sale}}, raja {{threshold}}",
      pendingGaugeHeld: "Odottaa {{balance}}, raja {{threshold}}",
      limitsTitle: "Ilman tunnistamista",
      limitLeft: "Jäljellä {{left}} / {{limit}}",
      seeLimits: "Näytä rajani",
      settings: "Myynnin asetukset",
      quote: "Näytä tarjous",
      aboveMax: "Anna enintään {{amount}}",
      aboveBalance: "Anna enintään käytettävissä oleva saldo",
      tooSmall: "Sinun on saatava vähintään {{amount}}: suurenna summaa",
      transferFee: "Tilisiirtokulu",
      transfer: "Tilisiirto",
      transferNow: "Välitön",
      transferNowNote: "Tilisiirtokulu {{fee}} alle {{threshold}}, sen yli maksuton",
      transferLater: "Lykätty",
      transferLaterNote:
        "Ei tilisiirtokulua: yhtenä koottuna tilisiirtona muiden myyntiesi kanssa, kun ne yltävät {{threshold}}",
      equivalentOf: "{{amount}} vasta-arvo",
      chooseAccount: "Mille tilille?",
      addAccount: "Lisää tili"
    },
    quote: {
      title: "Tarjous",
      heading: "Saat {{amount}}",
      lead: "Satisi myydään ja frangit siirretään pankkitilillesi.",
      selling: "Myyt",
      rate: "Kurssi",
      ratePrice: "1 BTC = {{price}}",
      fee: "Myyntikulut",
      lightningFee: "Lightning-kulut",
      account: "Tilille",
      lockedUntil: "Kurssi taattu klo {{time}} asti",
      expired: "Kurssi on vanhentunut: mitään ei myyty",
      refresh: "Päivitä tarjous",
      sell: "Myy {{amount}}",
      otherOrder: "Saatu tarjous ei ole pyydetty: mitään ei maksettu",
      nothingWired: "Tämä myynti ei siirtäisi tilillesi mitään: mitään ei maksettu",
      unaffordable: "Saldosi ei kata tätä myyntiä ja sen kuluja"
    },
    order: {
      heading: "{{amount}} pankkiisi",
      lead: "Myynti {{sats}}, {{date}}. Voit poistua tästä näkymästä: myynti jatkuu.",
      leadDated: "Myynti {{date}}. Voit poistua tästä näkymästä: myynti jatkuu.",
      received: "Satsit vastaanotettu",
      receivedTodo: "Satsien vastaanotto",
      receivedNow: "Satseja vastaanotetaan",
      receivedFailed: "Satseja ei vastaanotettu",
      transferred: "Siirto tilillesi",
      held: "Tätä myyntiä tarkistetaan: katso Mt Pelerinin sähköpostit",
      delayed: "Tilisiirto on siirtynyt: odota sitä viikon kuluessa",
      refunded: "Satisi palautetaan sinulle",
      failed: "Tämä myynti hylättiin",
      expired: "Tarjous vanhentui: mitään ei myyty",
      reference: "Toimeksiannon numero",
      outcomes: {
        awaitingPayment: "Odottaa maksua",
        expired: "Vanhentunut",
        inProgress: "Käynnissä",
        delayed: "Viivästynyt",
        held: "Tarkistettavana",
        sent: "Siirretty",
        refunded: "Hyvitetty",
        failed: "Hylätty"
      },
      title: "Myynti",
      soldTitle: "Myyty onnistuneesti",
      soldLead: "{{sats}} on myyty: {{amount}} siirretään tilillesi.",
      withOthers: "Koottuna tilisiirtona muiden myyntiesi kanssa, kun ne yltävät {{threshold}}",
      next: "Mitä seuraavaksi",
      processing: "Myynnin käsittely",
      processingNow: "Käsittelyssä",
      processed: "Muunnettu valuuttaan {{currency}}",
      delayChf: "1 pankkipäivän kuluessa (siirto Sveitsissä, maanantaista perjantaihin)",
      delayEur: "1–2 pankkipäivän kuluessa (SEPA-siirto)",
      delaySwift: "Yksi pankkipäivä tai enemmän (kansainvälinen SWIFT-siirto)",
      close: "Sulje",
      seeSales: "Katso myyntisi"
    },
    history: {
      title: "Myyntisi",
      empty: "Ei vielä myyntejä",
      unreadable: "Liian monta myyntiä listattavaksi tässä"
    },
    split: {
      quoting: "Myyntisi kurssia lukitaan…",
      receive: "Saat",
      title: "Jako",
      lead: "Lompakkosi on vastaanottanut {{received}} {{date}} lähtien.",
      kept: "Pidetään bitcoineina ({{percent}})",
      share: "Myytävä osuus ({{percent}})",
      sold: "Myydään nyt: {{amount}}",
      lightningFee: "Lightning-kulut, lisäksi",
      deferred: "Lykätyt myynnit yhdistetään ja siirretään kerralla, kun ne yltävät {{threshold}}.",
      balance: "Saldosi riittää vain {{amount}} myyntiin. Loppuosaa osuudesta ei myydä.",
      limit:
        "Ilman henkilöllisyyden vahvistamista myyntisi on rajoitettu {{limit}} kuukaudessa. Myy {{amount}} nyt (loppuosaa osuudesta ei myydä) tai vahvista ensin henkilöllisyytesi myydäksesi koko osuuden.",
      sell: "Myy {{amount}}",
      identify: "Vahvista henkilöllisyys Mt Pelerinissä",
      identifyHeading: "Vahvista henkilöllisyytesi myydäksesi osuutesi",
      identifyLead:
        "Myytävä osuutesi on {{due}}. Ilman henkilöllisyyden vahvistamista myyntisi on rajoitettu {{limit}} kuukaudessa, ja tämä raja on täynnä.",
      identifyHow:
        "Henkilöllisyys vahvistetaan Mt Pelerinin sivustolla tilisi puhelinnumerolla. Kun henkilöllisyytesi on vahvistettu, koko osuutta tarjotaan sinulle täällä.",
      soldHeading: "Myynti onnistui",
      soldLead:
        "{{sats}} on myyty hintaan {{amount}}, joka lisätään siirtoa odottaviin myynteihisi.",
      held: "Odottaa siirtoa",
      payout: {
        title: "Seuraava tilisiirto",
        threshold: "alkaen {{threshold}}",
        held: "Jo odottamassa",
        sale: "Tämä myynti",
        left: "Vielä <strong>{{left}}</strong> myyntiä, sitten kaikki siirretään pankkitilillesi.",
        reached: "Raja on saavutettu: kaikki siirretään pankkitilillesi."
      },
      notice: "Jako: {{amount}} myytävänä, noin {{fiat}}.",
      noticeSell: "Myy",
      noticeIdentify: "Jako: {{due}} myytävänä, kun henkilöllisyytesi on vahvistettu.",
      noticeSee: "Näytä",
      setup:
        "Jakosi mukaan {{percent}} on valuutassa {{currency}}. Ota myynti käyttöön myydäksesi tämän osuuden.",
      setupOpen: "Ota myynti käyttöön"
    },
    limits: {
      title: "Myyntirajat",
      lead: "Ilman henkilöllisyyden vahvistamista voit myydä enintään:",
      perSale: "Myyntiä kohden",
      month: "Viimeiset {{days}} päivää",
      year: "Tänä vuonna",
      leftUntil: "Jäljellä {{amount}} {{date}} asti",
      leftRolling: "Jäljellä {{amount}}: myynti lasketaan mukaan {{days}} päivän ajan",
      unknown: "Ei laskettu: myynti muussa valuutassa kuin frangeissa",
      feesTitle: "Kulut mukaan lukien",
      identified: "Henkilöllisyytesi on vahvistettu Mt Pelerinillä.",
      noLimit: "Ei rajaa",
      perMonth: "Kuukaudessa",
      perYear: "Vuodessa",
      identifyHow:
        "Myydäksesi enemmän vahvista henkilöllisyytesi Mt Pelerinin sivustolla tilisi puhelinnumerolla.",
      fees: "Ratkaisevaa on myyty summa ennen kulujen vähentämistä. Laskettu myyntiesi perusteella."
    },
    settings: {
      title: "Myynnin asetukset",
      account: "Mt Pelerin -tili",
      byKey: "Mt Pelerin -tili · yhdistetty tilisi avaimella",
      lightning: "Lightning-osoite",
      verified: "vahvistettu",
      pendingValidation: "odottaa",
      banks: "Pankkitilit",
      limits: "Myyntirajat",
      history: "Myyntisi",
      logout: "Kirjaudu ulos Mt Pelerinistä",
      logoutTitle: "Kirjaudutaanko ulos Mt Pelerinistä?",
      logoutBody:
        "Kaikilla laitteillasi. Tilisi ja myyntisi pysyvät Mt Pelerinillä: löydät ne, kun kirjaudut uudelleen.",
      logoutConfirm: "Kirjaudu ulos",
      cancel: "Peruuta",
      banksCount_one: "{{count}} tili",
      banksCount_other: "{{count}} tiliä",
      left: "Jäljellä {{amount}}",
      perSale: "{{amount}} myyntiä kohden",
      salesCount_one: "{{count}} tänä vuonna",
      salesCount_other: "{{count}} tänä vuonna"
    },
    close: "Sulje",
    poweredBy: "Powered by"
  },
  walletExport: {
    open: "Vie",
    title: "Vie tapahtumat",
    close: "Sulje",
    lead: "Aikavälin päättyneet tapahtumat: maksetut myynnit, vastaanotetut ja lähetetyt maksut.",
    period: "Aikaväli",
    periods: {
      thisMonth: "Tässä kuussa",
      lastMonth: "Viime kuussa",
      thisYear: "Tänä vuonna",
      lastYear: "Viime vuonna",
      custom: "Tarkat päivät"
    },
    days: "{{first}} – {{last}}",
    from: "Alkaen",
    to: "Asti",
    format: "Vientityyppi",
    formats: {
      pdf: "Yksinkertainen (PDF)",
      csv: "Yksityiskohtainen (CSV)"
    },
    amounts: "Summat",
    units: {
      fiat: "Valuutassa {{currency}}",
      btc: "Bitcoineina (BTC)"
    },
    columnsTitle: "Sarakkeet",
    columnsTicked: "{{ticked}}/{{total}}",
    columns: {
      dateAndTime: "Päivä ja aika",
      label: "Kuvaus",
      source: "Lähde",
      by: "Tekijä",
      network: "Maksutapa",
      reference: "Viite",
      bitcoinAmount: "Summa (BTC)",
      bitcoinFees: "Kulut (BTC)",
      fiatAmount: "Summa ({{currency}})",
      fiatFees: "Kulut ({{currency}})",
      originalAmount: "Syötetty summa",
      originalCurrency: "Syötetty valuutta",
      bitcoinPrice: "Bitcoinin kurssi ({{currency}})",
      remark: "Huomautus"
    },
    remarks: {
      accepted: "Erotus {{fiat}} / {{btc}}, omistaja hyväksyi {{date}} klo {{time}}",
      acceptedSats: "Erotus {{btc}}, omistaja hyväksyi {{date}} klo {{time}}"
    },
    submit: "Vie",
    errors: {
      unread: "Myyntejäsi ei voitu lukea. Tarkista internetyhteys ja yritä uudelleen.",
      receiving:
        "Kassan näkemä bitcoin-maksu ei ole vielä saapunut lompakkoosi. Yritä uudelleen muutaman minuutin kuluttua.",
      failed: "Vientiä ei voitu tehdä. Yritä uudelleen."
    },
    pdf: {
      title: "Tapahtumaraportti",
      period: "{{first}} – {{last}}",
      made: "Laadittu {{date}}",
      summary: "Yhteenveto",
      count: "Tapahtumien määrä",
      countOf: {
        pos: "joista kassa",
        link: "joista laskut",
        integration: "joista integraatiot",
        receive: "joista vastaanotetut",
        send: "joista lähetetyt"
      },
      received: "Vastaanotettu yhteensä",
      sent: "Lähetetty yhteensä",
      fees: "Lähetyskulut",
      lines: "Tapahtumat eriteltyinä",
      none: "Ei päättyneitä tapahtumia tällä aikavälillä.",
      amount: "Summa ({{unit}})",
      amountMixed: "Summa",
      valuesNote:
        "Myynti lasketaan syötetyllä summalla, omassa valuutassaan; muut tapahtumat bitcoiniensa arvolla maksuhetkellä tallennetulla kurssilla (lähde: CoinGecko). Tapahtuma ilman tallennettua kurssia lasketaan bitcoineina (BTC).",
      // Rows copied from a v2 account among them (src/features/activity/legacy-history.ts).
      valuesNoteImported:
        "Myynti lasketaan syötetyn summan mukaan sen valuutassa; muut tapahtumat bitcoiniensa arvon mukaan maksuhetkellä kirjatulla kurssilla (lähde: CoinGecko; aiemmasta maksupalvelustasi siirretyn historian osalta sen kirjaama kurssi). Tapahtuma ilman kirjattua kurssia lasketaan BTC:nä."
    }
  },
  settings: {
    recovery: {
      group: "Turvallisuus",
      title: "Palautuslause",
      description:
        "12 sanaa, jotka palauttavat lompakkosi ilman pääsyavainta. Kirjoita ne paperille.",
      open: "Näytä",
      lead: "Nämä 12 sanaa ovat kopio lompakostasi: niillä kuka tahansa voi käyttää kaikki sen varat ilman pääsyavaintasi.",
      rulesTitle: "Ennen kuin näytät ne",
      rules:
        "Kirjoita ne paperille järjestyksessä ja säilytä ne turvallisessa paikassa. Älä valokuvaa niitä äläkä tallenna niitä mihinkään tiedostoon tai viestiin. Älä anna niitä kenellekään: sattle.me ei koskaan pyydä niitä sinulta.",
      reveal: "Näytä lause",
      hide: "Piilota",
      shownNote:
        "Vain sinun pitää nähdä nämä sanat. Ne katoavat heti, kun poistut tästä näkymästä tai sovelluksesta.",
      captureOpen: "Kuvakaappauksia ei estetä täällä: älä ota niitä äläkä tallenna näyttöä.",
      noPhrase: "Tällä lompakolla ei ole näytettävää palautuslausetta.",
      wordLabel: "Sana {{index}}: {{word}}"
    },
    title: "Asetukset",
    business: "Yritys",
    businessDescription: "Nimi ja logo, jotka asiakas näkee kuiteissa ja laskuissa.",
    businessName: "Yrityksen nimi",
    logo: "Yrityksen logo",
    changeLogo: "Vaihda yrityksen logo",
    logoChange: "Vaihda logo",
    merchant: {
      section: "Kauppiasprofiili",
      description:
        "Ota vastaan bitcoin-maksuja tällä sovelluksella: kassa, laskut, työntekijät. Päälompakkosi luodaan tässä vaiheessa.",
      create: "Luo kauppiasprofiilini",
      failedTitle: "Kassaa ei valmisteltu",
      doneTitle: "Kauppiasprofiili luotu",
      doneBody: "Voit nyt ottaa vastaan maksuja"
    },
    groups: {
      charging: "Maksujen vastaanotto",
      payouts: "Tilisiirrot",
      display: "Näyttö",
      network: "Verkko",
      // "Account" of "Settings" (the session, the deletion).
      account: "Tili"
    },
    // The phone's cards and the computer's tabs of "Settings".
    rubrics: {
      chargingBoth: "Lightning ja onchain",
      methods: "Maksutavat",
      chargingDescription: "Mitä kassa, työntekijäsi ja integraatiosi tarjoavat asiakkaalle.",
      lightning: "Lightning",
      lightningCaption: "Aina tarjolla, enintään {{limit}} laskua kohden; {{beyond}}",
      lightningCaptionUnknown: "Aina tarjolla Lightning-osoitteesi ylärajaan asti; {{beyond}}",
      lightningLimitFiat: "{{btc}} (noin {{fiat}})",
      lightningBeyond: {
        onchain: "sen yli näytetään vain onchain-osoite",
        refused: "sen yli kassa hylkää myynnin niin kauan kuin onchain-maksut ovat pois käytöstä"
      },
      splitLabel: "Jako: {{bitcoin}} bitcoinina, {{fiat}} valuuttana {{currency}}",
      editRelays: "Muokkaa releitä"
    },
    unlock: {
      title: "Pyydä biometriikkaa sovelluksen avaamiseen",
      captionOn: "Aina kun sovellus avataan",
      captionOff: "Sovellus avautuu ilman biometriikkaa",
      captionUnavailable: "Laitteessa ei ole biometriikkaa eikä tunnuslukua",
      section: "Sovelluksen lukitus",
      description:
        "Tämän laitteen biometriikkaa tai tunnuslukua pyydetään aina, kun sovellus avataan tai siihen palataan, kassatilan lisäksi.",
      saveFailed: "Valintaa ei voitu tallentaa tälle laitteelle. Yritä uudelleen."
    },
    locked: {
      title: "Kassatila",
      titleCard: "Sovellus lukittu",
      body: "Avaa sovelluksen lukitus muuttaaksesi asetuksiasi.",
      unlock: "Avaa lukitus"
    },
    displayCurrency: "Viitevaluutta",
    displayCurrencyCardDescription: "Korttiesi summat sovelluksessa.",
    displayCurrencyDescription: "Kassalla syötetyt ja sovelluksessa näytetyt summat.",
    amountUnit: {
      title: "Ensin näytettävä valuutta",
      description:
        "Näkymässä « Lompakko » ja korttiesi historiassa, tällä laitteella. Toinen summa näkyy sen alla.",
      sats: "sats",
      savedTitle: "Ensin näytettävä valuutta tallennettu",
      saveFailed: "Valintaa ei voitu tallentaa tälle laitteelle. Yritä uudelleen."
    },
    theme: {
      title: "Teema",
      description:
        "Tällä laitteella. « Automaattinen » seuraa laitteen vaaleaa tai tummaa asetusta.",
      light: "Vaalea",
      dark: "Tumma",
      system: "Automaattinen",
      // A rubric's card on a phone ("Display"): the theme chosen.
      summaryLight: "Vaalea teema",
      summaryDark: "Tumma teema",
      summarySystem: "Automaattinen teema",
      savedTitle: "Teema tallennettu",
      saveFailed: "Valintaa ei voitu tallentaa tälle laitteelle. Yritä uudelleen."
    },
    onchain: "Onchain-maksut",
    onchainDescription:
      "Vahvistus 10–60 minuutissa. Koskee omaa kassaasi ja työntekijöidesi kassoja. Laskusi ja integraatiosi tarjoavat aina onchain-maksun.",
    split: "Jako",
    splitDescription:
      "sattle.me-palkkio: {{bitcoin}} kaikesta, mitä vastaanotat. Muunnettu osuus: {{fiat}} Mt Pelerinin myyntikuluja lisäksi, myydään, kun hyväksyt sen Lompakossa.",
    splitDescriptionFree:
      "sattle.me-palkkio: {{free}} {{date}} asti, muuten {{bitcoin}}, kaikesta, mitä vastaanotat. Muunnettu osuus: {{fiat}} Mt Pelerinin myyntikuluja lisäksi, myydään, kun hyväksyt sen Lompakossa.",
    splitShort: "{{percent}} valuutassa {{currency}}",
    allBitcoin: "Kaikki bitcoinina",
    bankAccount: "Pankkitili",
    noBankAccount: "Ei tiliä",
    bankAtMtPelerin: "Mt Pelerinillä",
    relays: "Nostr-releet",
    relaysCount_one: "{{count}} rele",
    relaysCount_other: "{{count}} relettä",
    relaysDescription: "Nostr-palvelimet, joihin sovellus yhdistää kaikilla yrityksen laitteilla.",
    // "Bitcoin node" of "Network".
    node: {
      title: "Bitcoin-solmu",
      description:
        "Missä sinun ja työntekijöidesi laitteet seuraavat onchain-maksuja ja missä lompakkosi lukee lohkoketjua.",
      mempoolTitle: "mempool.space",
      mempoolDescription: "Julkinen, ei asennettavaa. Näkee onchain-myyntiesi osoitteet.",
      ownTitle: "Oma solmu",
      ownDescription: "Oma mempoolisi: kukaan muu ei näe osoitteitasi.",
      mempoolCaption: "Oletus",
      urlLabel: "Mempoolisi osoite",
      urlHint: "Sen sivun osoite selaimessasi, esimerkiksi Umbrelissa tai Start9:ssä",
      errors: {
        empty: "Syötä mempoolisi osoite",
        incomplete: "Osoite on vajaa, esimerkiksi https://mempool.example.ch",
        insecure: "Vain https://-osoite hyväksytään: http://-yhteys ei ole salattu",
        device: "Tämä osoite on tämä laite: syötä solmusi osoite"
      },
      legacyHttpTitle: "http://-osoitetta ei enää käytetä",
      legacyHttpBody:
        "Turvallisuutesi vuoksi sovellus yhdistää solmuusi enää vain https://-osoitteella: http://-yhteydellä joku tähän Wi-Fi-verkkoon yhdistetty voisi esiintyä solmunasi ja saada maksamattoman myynnin näyttämään maksetulta. Kunnes syötät https://-osoitteen, laitteesi toimivat kuin solmusi ei vastaisi.",
      test: "Testaa yhteys",
      results: {
        ok: {
          title: "Solmu tavoitettavissa ja ajan tasalla",
          body: "Viimeisin lohko: {{height}}"
        },
        unreachable: {
          title: "Solmua ei tavoiteta",
          body: "Tarkista osoite ja että tämä laite on samassa verkossa kuin solmusi."
        },
        notMempool: {
          title: "Tässä osoitteessa ei ole mempoolia",
          body: "Jokin vastaa, mutta ei mempoolin API. Tarkista osoite ja portti."
        },
        noAddressIndex: {
          title: "Osoitteita ei voi lukea",
          body: "Mempoolisi ei vielä lue osoitteita: sen indeksi (electrs tai Fulcrum) puuttuu tai ei ole vielä valmis."
        },
        behind: {
          title: "Solmu on jäljessä",
          body: "Sen viimeisin lohko on {{hours}} h vanha: se ei ole vielä synkronoitu."
        }
      },
      fallbackTitle: "Kun se ei vastaa",
      fallbackMempool: "Käytä mempool.spacea",
      fallbackMempoolDescription:
        "Onchain-myyntisi jatkuvat; mempool.space näkee silloin osoitteesi.",
      fallbackNone: "Vain Lightning",
      fallbackNoneDescription:
        "Mitään ei lähetetä mempool.spaceen; kassa ei sillä välin tarjoa Bitcoinia.",
      payersTitle: "Asiakkaidesi maksusivut",
      payersLabel: "Välitä solmuni maksajien sivuille",
      payersCaption:
        "Myös asiakkaidesi selain seuraa maksua solmustasi, samalla varakeinolla. Sen osoite näkyy silloin maksulinkeissäsi, ja se saa asiakkaidesi IP-osoitteen.",
      payersHttpsOnly:
        "Vain internetistä tavoitettavalle solmulle, https://-osoitteella ja verkkotunnuksella: asiakkaidesi selain ei tavoita lähiverkkoasi.",
      publicNotePayers:
        "Maksun lähetysaika, joka määrää sen kurssin, pysyy mempool.spacessa: sama sinulle ja asiakkaillesi.",
      publicNote:
        "Asiakkaidesi maksusivu ja maksun lähetysaika, joka määrää sen kurssin, pysyvät mempool.spacessa: sama sinulle ja asiakkaillesi.",
      savedTitle: "Bitcoin-solmu tallennettu",
      savedOwn: "Laitteesi lukevat lohkoketjua solmustasi",
      savedMempool: "Laitteesi lukevat lohkoketjua mempool.spacesta",
      confirmTitle: "Tallennetaanko tämä solmu?",
      confirmBody: "Se ei vastaa oikein tästä laitteesta. Yrityksesi verkosta se ehkä vastaa.",
      confirmAction: "Tallenna silti"
    },
    // "Look up scanned products" of "Network".
    productLookup: {
      section: "Tuotevalikoima",
      title: "Hae skannattuja tuotteita",
      caption:
        "Open Food Factsista, joka saa viivakoodin ja laitteen IP-osoitteen. Pois päältä: syötät nimen ja kuvan itse.",
      savedTitle: "Tuotehaku tallennettu",
      savedOn: "Skannatun tuotteen nimi ja kuva tulevat Open Food Factsista",
      savedOff: "Skannatun tuotteen nimi ja kuva syötetään käsin"
    },
    save: "Tallenna",
    close: "Sulje",
    logout: "Kirjaudu ulos",
    logoutTitle: "Kirjaudutaanko ulos tältä laitteelta?",
    logoutBody:
      "Tietosi ja varasi pysyvät tililläsi: pääsyavaimellasi kirjaudut takaisin. Vain tällä laitteella tehdyt valinnat palautuvat oletuksiin: navigointipalkki, « $t(wallet.discreet) » kohdassa « $t(navigation.destinations.wallet) », « $t(settings.amountUnit.title) », « $t(settings.theme.title) », « $t(pos.mode.amount) » tai « $t(pos.mode.articles) » kohdassa « $t(pos.title) » sekä biometriikka sovelluksen avaamiseen.",
    logoutBodyWeb:
      "Tietosi ja varasi pysyvät tililläsi: pääsyavaimellasi kirjaudut takaisin. Vain tällä laitteella tehdyt valinnat palautuvat oletuksiin: navigointipalkki, « $t(wallet.discreet) » kohdassa « $t(navigation.destinations.wallet) », « $t(settings.amountUnit.title) », « $t(settings.theme.title) » sekä « $t(pos.mode.amount) » tai « $t(pos.mode.articles) » kohdassa « $t(pos.title) ».",
    logoutBodyCard:
      "Tietosi ja varasi pysyvät tililläsi: pääsyavaimellasi kirjaudut takaisin. Vain tällä laitteella tehdyt valinnat « $t(settings.amountUnit.title) » ja « $t(settings.theme.title) » palautuvat oletuksiin.",
    logoutConfirm: "Kirjaudu ulos",
    support: {
      group: "Ohje",
      section: "Tuki",
      description:
        "Kysymys tai ongelma: kirjoita meille. Sovelluksen loki auttaa meitä ymmärtämään, mitä tapahtui.",
      contact: "Ota yhteyttä tukeen",
      attach: "Liitä sovelluksen loki",
      attachCaption: "Teknisiä tapahtumia, ei summia eikä osoitteita",
      reports: "Lähetä kaatumisraportit",
      reportsKinds: "Kaatumiset ja hidastelut",
      reportsCaption: "Ei summia eikä maksuosoitteita",
      reportsSaveFailed: "Valintaa ei voitu tallentaa tälle laitteelle. Yritä uudelleen.",
      subject: "sattle.me-tuki",
      body: "Hei,\n\nKysymyksesi tai ongelmasi:\n\n\n",
      downloaded: "Sovelluksen loki ladattiin juuri ({{file}}): liitä se tähän viestiin.",
      attachDownloaded: "Liitä ladattu loki ({{file}})",
      notAttached: "Lokia ei liitetty viestiin",
      deposited: "Sovelluksen loki lähetetään salattuna tuelle, viite on alla.",
      notDeposited: "Lokia ei lähetetty",
      noMailTitle: "Tällä laitteella ei ole Mail-sovellusta",
      addressCopied: "Tuen osoite kopioitu: {{email}}",
      writeTo: "Kirjoita meille osoitteeseen {{email}}",
      shareTitle: "Sovelluksen loki",
      shareFailed: "Lokia ei jaettu",
      failedTitle: "Sähköpostia ei avattu"
    },
    delete: {
      section: "Poista tili",
      description:
        "Poistaa tilin Nostr-releiltä ja tältä laitteelta ja luopuu sen Lightning-osoitteesta. Lompakon on oltava tyhjä.",
      button: "Poista tili",
      employeesTitle_one: "Sinulla on {{count}} työntekijä",
      employeesTitle_other: "Sinulla on {{count}} työntekijää",
      employeesBody_one:
        "Hänet poistetaan yrityksestä: hänen laitteensa ei enää veloita yrityksen puolesta ja unohtaa sen seuraavalla yhteyskerralla.",
      employeesBody_other:
        "Heidät poistetaan yrityksestä: heidän laitteensa eivät enää veloita yrityksen puolesta ja unohtavat sen seuraavalla yhteyskerralla.",
      integrationsTitle_one: "Sinulla on {{count}} integraatio",
      integrationsTitle_other: "Sinulla on {{count}} integraatiota",
      integrationsBody_one: "Se poistetaan: sen palvelin ei voi enää luoda laskuja yritykselle.",
      integrationsBody_other:
        "Ne poistetaan: niiden palvelimet eivät voi enää luoda laskuja yritykselle.",
      assistantsTitle_one: "Sinulla on {{count}} tekoälyavustaja",
      assistantsTitle_other: "Sinulla on {{count}} tekoälyavustajaa",
      assistantsBody_one: "Se poistetaan: se ei voi enää tehdä laskuja yritykselle.",
      assistantsBody_other: "Ne poistetaan: ne eivät voi enää tehdä laskuja yritykselle.",
      removeAndContinue: "Poista ja jatka",
      confirmTitle: "Poistetaanko tili?",
      confirmBody:
        "Asetukset, tiimi, tuotteet ja tallennetut myynnit poistetaan Nostr-releiltä ja tältä laitteelta, ja Lightning-osoitteesta luovutaan. Tätä ei voi perua. Tyhjä lompakko on edelleen käytettävissä pääsyavaimellasi.",
      confirm: "Poista pysyvästi",
      progressTitle: "Tiliä poistetaan",
      progressHint: "Pidä sovellus auki loppuun asti.",
      steps: {
        wallet: "Lompakkoa tarkistetaan",
        team: "Tiimiä poistetaan",
        reading: "Tietoja haetaan releiltä ({{done}}/{{total}})",
        deleting: "Poistetaan releiltä ({{done}}/{{total}})",
        checking: "Poistoa tarkistetaan ({{done}}/{{total}})",
        device: "Tätä laitetta tyhjennetään"
      },
      deleted: "Tilisi on poistettu",
      deletedElsewhere:
        "Yrityksen {{business}} tili poistettiin toiselta laitteelta: tämä laite unohti sen.",
      alreadyRemoved: "Lightning-osoite ja tiimi on jo poistettu.",
      card: {
        description:
          "Poistaa tilin Nostr-releistä ja tältä laitteelta sekä luopuu korttiesi Lightning-osoitteista. Korttien on oltava tyhjiä.",
        confirmBody:
          "Asetukset, kortit ja niiden tallennetut maksut poistetaan Nostr-releistä ja tältä laitteelta, ja korttien Lightning-osoitteista luovutaan. Tätä ei voi perua.",
        stepCards: "Korttien tarkistus",
        alreadyRemoved: "Korttien Lightning-osoitteista on jo luovuttu.",
        cardWallets:
          "Jonkin korttisi tai poistetun kortin lompakko ei ole tyhjä, tai sinne on vielä tulossa satseja. Lähetä sen saldo muualle kohdasta « Kortit » ja yritä sitten uudelleen.",
        walletFailed:
          "Kortin lompakkoa ei voitu tarkistaa. Tarkista internetyhteys ja yritä uudelleen.",
        begun:
          "Poisto ei ole valmis: korttien Lightning-osoitteista on jo luovuttu, tältä laitteelta ei ole poistettu mitään. Tarkista internetyhteys ja yritä uudelleen."
      },
      failedTitle: "Tiliä ei poistettu",
      errors: {
        balance: "Lompakossa on vielä {{sats}} sats. Lähetä ne muualle ja yritä uudelleen.",
        pendingPayments: "Lompakon maksu on kesken. Yritä uudelleen, kun se on valmis.",
        unclaimedDeposits:
          "Onchain-talletusta ei ole vielä hyvitetty lompakkoon. Yritä uudelleen, kun se on.",
        cardWallets:
          "Yhden korttisi tai poistetun kortin lompakko ei ole tyhjä, tai sille on vielä tulossa satseja. Nosta sen saldo pääsaldoosi kohdassa « Kortit » ja yritä uudelleen.",
        newerApp:
          "Sovelluksen uudempi versio on tallentanut tämän tilin kortin. Päivitä sovellus ja yritä uudelleen.",
        salesInProgress:
          "Osa yrityksen laskuista ei ole vielä lopullisia. Yritä uudelleen, kun niiden lopullinen versio on julkaistu (enintään 3 h maksamattoman laskun päättymisen jälkeen).",
        walletFailed: "Lompakkoa ei voitu tarkistaa. Tarkista internetyhteys ja yritä uudelleen.",
        unreachable: "Nostr-releet eivät vastanneet. Tarkista internetyhteys ja yritä uudelleen.",
        notDeleted:
          "Nostr-releet eivät vahvistaneet poistoa. Tältä laitteelta ei ole poistettu mitään: yritä uudelleen.",
        begun:
          "Poisto ei ole valmis: Lightning-osoite ja tiimi on jo poistettu, tältä laitteelta ei ole poistettu mitään. Tarkista internetyhteys ja yritä uudelleen.",
        unfinished:
          "Poisto on alkanut mutta ei ole valmis: tilin muut laitteet ovat ehkä jo unohtaneet sen. Tarkista internetyhteys ja yritä uudelleen viedäksesi sen loppuun.",
        deviceNotWiped:
          "Tili on poistettu releiltä, mutta ei kaikkea, mitä sovellus säilytti tällä laitteella."
      }
    },
    yourProfile: "Profiilisi",
    nameLocked: "Työnantajasi määrittämä nimi",
    addPhoto: "Lisää kuva",
    changePhoto: "Vaihda kuva",
    removePhoto: "Poista",
    relaysLocked: "Työnantajasi määrittämät",
    leave: "Poistu yrityksestä",
    leaveTitle: "Poistutaanko yrityksestä {{business}}?",
    leaveBody:
      "Tämä laite ei enää vastaanota maksuja tälle yritykselle. Palaamiseen tarvitaan uusi kutsu.",
    back: "Takaisin",
    splitSavedTitle: "Jako tallennettu",
    splitSavedBank: "IBAN tarkistettu · {{percent}} valuutassa {{currency}}",
    splitSavedBitcoin: "Kaikki bitcoinina",
    relaysSavedTitle: "Releet tallennettu",
    relaysSavedBody: "Yrityksen laitteet ottavat ne käyttöön seuraavalla yhteydellään.",
    nameSavedTitle: "Nimi tallennettu",
    currencySavedTitle: "Viitevaluutta tallennettu",
    onchainSavedTitle: "Onchain-maksut tallennettu",
    onchainSavedOn: "Hyväksytään kassalla Lightningin lisäksi",
    onchainSavedOff: "Kassalla vain Lightning",
    vatRate: "Oletus-ALV",
    vatRateDescription: "Uusien laskurivien ALV-kanta, muutettavissa rivikohtaisesti.",
    vatRateField: "ALV-kanta (%)",
    vatRateHint: "Jätä tyhjäksi, niin käytetään yleistä verokantaa: {{rate}}",
    vatStandard: "{{rate}} (yleinen verokanta)",
    vatSavedTitle: "Oletus-ALV tallennettu",
    vatInvalid: "Anna verokanta väliltä 0–100 %",
    tolerance: "Vajaamaksun toleranssi",
    toleranceDescription:
      "Onchain-maksu, josta puuttuu enintään tämä osuus summasta, katsotaan maksetuksi. Jos puuttuu enemmän, asiakkaan on maksettava koko loppusumma. Koskee myyntejäsi, laskujasi ja maksulinkkejäsi, myös työntekijöidesi, integraatioidesi ja tekoälyavustajiesi. Asiakkaillesi sitä ei koskaan näytetä.",
    toleranceField: "Toleranssi (%)",
    toleranceHint: "0–10 %, kymmenyksen tarkkuudella. Tyhjä tai 0: ei toleranssia.",
    toleranceNone: "Ei toleranssia",
    toleranceSavedTitle: "Toleranssi tallennettu",
    toleranceSaved: "{{rate}} seuraaville myynneille ja laskuille",
    toleranceSavedNone: "Ei toleranssia: koko summa pyydetään",
    toleranceInvalid: "Anna prosentti väliltä 0–10, kymmenyksen tarkkuudella",
    logoSavedTitle: "Logo tallennettu",
    address: {
      title: "Yrityksen osoite",
      description: "Näkyy laskuissasi yrityksen nimen alla.",
      street: "Katu ja numero",
      postalCode: "Postinumero",
      city: "Postitoimipaikka",
      country: "Maa",
      savedTitle: "Osoite tallennettu"
    },
    numbers: {
      title: "Yrityksen tunnukset",
      description:
        "Näkyvät laskuissasi yrityksen osoitteen alla. Niiden nimi määräytyy yrityksen maan mukaan.",
      savedTitle: "Tunnus tallennettu"
    },
    photoSavedTitle: "Kuva tallennettu",
    photoRemovedTitle: "Kuva poistettu",
    saveFailedTitle: "Virhe tallennettaessa",
    failedTitle: "Asetusta ei tallennettu",
    errors: {
      unpublished:
        "Liian harva rele vahvisti muutoksen, joten se peruttiin. Tarkista yhteys ja yritä uudelleen.",
      newerBackup:
        "Sovelluksen uudempi versio on varmuuskopioinut tämän tilin, joten muutos peruttiin. Päivitä sovellus ja yritä uudelleen.",
      noAccount: "Avaa sovellus pääsyavaimellasi ja yritä uudelleen.",
      invalid: "Tarkista syötetty arvo ja yritä uudelleen.",
      unreachable: "Liian harva rele vastasi. Tarkista yhteys ja yritä uudelleen.",
      saveFailed: "Asetusta ei voitu tallentaa tälle laitteelle. Yritä uudelleen.",
      denied: "Salli kuviesi käyttö laitteen asetuksissa ja yritä uudelleen.",
      unreadable: "Tätä kuvaa ei voi käyttää. Valitse toinen.",
      logoutFailed: "Uloskirjautuminen ei onnistunut. Yritä uudelleen.",
      leaveFailed: "Tämä laite ei voinut poistua yrityksestä. Yritä uudelleen.",
      leaveUnreachable:
        "Yritykselle ei voitu ilmoittaa lähdöstäsi. Tarkista internetyhteys ja yritä uudelleen.",
      salesInProgress:
        "Osa yrityksen laskuista ei ole vielä lopullisia. Yritä uudelleen, kun niiden lopullinen versio on julkaistu (enintään 3 tuntia maksamattoman laskun päättymisen jälkeen).",
      integrationsPending:
        "Integraatiolla on keskeneräinen maksu (avoin maksupyyntö tai vahvistettavana oleva Bitcoin-maksu). Yritä uudelleen, kun se on valmis."
    },
    splitLead: "Sovellus ehdottaa tämän osuuden myymistä vastaanottamistasi maksuista.",
    ibanRefused: "Tarkista IBANin numerot"
  },
  relays: {
    title: "Nostr-releet",
    lead: "Nostr-palvelimet, joihin sovellus yhdistää kaikilla yrityksen laitteilla.",
    integrationsNotice:
      "Tämän tilin integraatiot seuraavat enintään {{moves}} releiden muutosta luomisestaan lähtien. Sen jälkeen niiden palvelin ei enää löydä niitä: luo ne uudelleen ja anna uudet avaimet niiden integroijille.",
    add: "Lisää rele",
    addLead: "Syötä releen osoite.",
    address: "Releen osoite",
    placeholder: "rele.esimerkki.ch",
    addConfirm: "Lisää rele",
    addShort: "Lisää",
    removeLabel: "Poista {{relay}}",
    keepOne: "Säilytä vähintään yksi rele.",
    tooMany: "Enintään kymmenen relettä: poista yksi lisätäksesi toisen.",
    removeUnreachable: "Poista punainen rele tallentaaksesi.",
    restrictedRelay:
      "« Lukeminen estetty »: tämä rele antaa tiedot luettavaksi vain niiden kirjoittajalle. Kassasi, työntekijäsi ja asiakkaasi eivät voisi lukea niitä: valitse toinen rele.",
    localNetworkBlocked:
      "Selain estää tämän sivuston pääsyn paikallisverkkoon: salli « Paikallinen verkko » sivuston asetuksissa (osoitteen vasemmalla puolella oleva kuvake) ja testaa uudelleen.",
    localNetworkNotAllowed:
      "Pääsyä paikallisverkkoon ei ole vielä sallittu tälle sivustolle: testaa uudelleen ja salli se, kun selain kysyy. Jos selain ei kysy mitään, tämä laite ei tavoita relettä: tarkista, että se on samassa verkossa tai Tailscalessa.",
    test: "Testaa yhteys",
    status: {
      reachable: "Yhdistetty",
      untested: "Ei testattu",
      testing: "Testataan",
      unreachable: "Ei tavoitettavissa",
      restricted: "Lukeminen estetty"
    },
    statusLabel: "{{relay}}, {{status}}",
    statusDetail: "{{status}} · {{detail}}",
    noAnswer: "ei vastausta (aikaraja {{duration}})",
    milliseconds: "{{value}}\u00a0ms",
    seconds: "{{value}}\u00a0s",
    errors: {
      incomplete: "Syötä täydellinen osoite",
      duplicate: "Syötä rele, joka ei ole luettelossa",
      local: "Syötä julkisen releen osoite: localhost on tämä laite"
    },
    advanced: "Lisäasetukset",
    advancedLead:
      "Nostr-releet, joista tämä laite etsii tilisi ja joihin se luo uudet. Kirjautumisen jälkeen käytetään tilisi releitä.",
    // "Sign-up" of "Advanced settings".
    countryDetection: {
      section: "Rekisteröityminen",
      title: "Tunnista maani country.isin avulla",
      caption:
        "Vain jos aikavyöhyke ei riitä. country.is saa silloin tämän laitteen IP-osoitteen. Pois päältä: maa tulee laitteen asetuksista.",
      saveFailed: "Valintaa ei voitu tallentaa tälle laitteelle. Yritä uudelleen."
    }
  },
  pending: {
    title: "Tulossa pian",
    description: "Tätä näkymää ei ole vielä suunniteltu."
  },
  merchantSettings: {
    businessNameWord: "Kauppias",
    saveFailed: "Asetuksiasi ei voitu tallentaa tähän laitteeseen. Yritä uudelleen."
  },
  /** "New invoice". */
  invoices: {
    newInvoice: "Uusi lasku",
    // "Wallet"'s button on a phone, beside "Sell" in half the width: one word, its "+" icon tells
    // "new".
    newInvoiceShort: "Lasku",
    // "Wallet"'s warning about an assistant (assistant-alerts.ts): "Remove the assistant" or "This
    // is expected" only.
    assistantAlert: {
      jumpTitle: "{{name}} ohitti laskunumeroita",
      jumpBody:
        "Sen laskut päättyvät numeroon {{from}}, mutta sen laskuri näyttää numeroa {{to}}: välissä olevat numerot on otettu ilman laskua. Jos tälle ei ole selitystä, poista tämä avustaja.",
      jumpBodyNone:
        "Se ei tehnyt yhtään laskua vuonna {{year}}, mutta sen laskuri näyttää numeroa {{to}}: nämä numerot on otettu ilman laskua. Jos tälle ei ole selitystä, poista tämä avustaja.",
      blockedTitle: "{{name}} estää laskujen numeroinnin",
      blockedBody:
        "Sen numerolaskurin muotoa tämä sovelluksen versio ei osaa lukea: mikään lasku ei voi saada numeroa. Päivitä sovellus; jos se on jo ajan tasalla, poista tämä avustaja.",
      burstTitle: "{{name}} teki hyvin paljon laskuja",
      burstBody:
        "{{invoices}} laskua 24 tunnissa. Jos et pyytänyt niitä, poista tämä avustaja: sen laskut pysyvät lompakossasi.",
      remove: "Poista avustaja",
      normal: "Tämä on odotettua",
      removeFailedTitle: "Avustajaa ei poistettu",
      removeFailed:
        "Avustajaa {{name}} ei voitu poistaa. Tarkista internetyhteytesi ja yritä sitten uudelleen integraatioiden luettelosta"
    },
    title: "Uusi lasku",
    back: "Takaisin",
    saveDraft: "Tallenna luonnoksena",
    draftSaved: "Lasku tallennettu luonnoksena",
    draftSavedBody: "Löydät sen kohdasta ”Seurattavat”",
    linkNote: "Lasku {{number}}",
    recipient: {
      title: "Kenelle lasku lähetetään?",
      assistant: "Tee laskusi tekoälyllä",
      name: "Yrityksen nimi",
      street: "Katu ja numero",
      postalCode: "Postinumero",
      city: "Postitoimipaikka",
      country: "Maa"
    },
    preview: {
      title: "PDF-esikatselu",
      invoice: "Lasku",
      date: "Päiväys",
      due: "Eräpäivä"
    },
    lines: {
      title: "Mitä laskutat?",
      empty: "Tällä laskulla ei ole tuotteita",
      emptyLead: "Lisää myymäsi: tuote luettelostasi tai käsin kirjoitettu rivi.",
      add: "Lisää tuote",
      name: "Kuvaus",
      quantity: "Määrä",
      quantityShort: "Määrä",
      unitPrice: "Yksikköhinta",
      unitPriceShort: "Yks. hinta",
      vatRate: "ALV-kanta",
      vat: "ALV",
      amount: "Summa",
      remove: "Poista",
      removeLine: "Poista rivi",
      expand: "Muokkaa riviä",
      summary: "{{quantity}} · ALV {{rate}}",
      net: "Välisumma ilman ALV:tä",
      vatOn: "ALV {{rate}} summasta {{base}}",
      total: "Yhteensä",
      quantityInvalid: "Anna määrä",
      priceInvalid: "Anna hinta",
      vatInvalid: "Anna verokanta väliltä 0–100 %",
      tooLarge: "Summa ylittää laskun enimmäismäärän",
      incomplete: "Täydennettävä",
      save: "Tallenna omiin tuotteisiin",
      saved: "Tallennettu omiin tuotteisiin"
    },
    picker: {
      title: "Lisää tuote",
      close: "Sulje",
      manual: "Syötä tuote",
      manualDescription: "Vapaa kuvaus, määrä ja hinta",
      catalog: "Omat tuotteet",
      loading: "Luetaan tuotteitasi…",
      failed: "Tuotteitasi ei voitu lukea. Tarkista internetyhteys ja yritä uudelleen.",
      retry: "Yritä uudelleen",
      empty: "Ei vielä tuotteita. Lisää niitä kohdassa ”Tuotteet”.",
      convertFailed: "Hintaa ei voitu muuntaa. Yritä hetken päästä uudelleen"
    },
    sameName: {
      title: "Tällä nimellä on jo tuote",
      close: "Sulje",
      lead: "Päivitä se tämän rivin hinnalla tai luo toinen samanniminen tuote.",
      otherCurrency:
        "Tätä tuotetta myydään valuutassa {{currency}}: sen hintaan ei voi asettaa summaa valuutassa {{invoice}}. Luo toinen samanniminen tuote.",
      newPrice: "Rivin hinta: {{price}}",
      update: "Päivitä tuote",
      duplicate: "Luo kaksoiskappale"
    },
    due: {
      title: "Maksettava viimeistään <accent>{{date}}</accent>",
      lead: "Maksulinkki on avoinna eräpäivään asti.",
      label: "Eräpäivä",
      previousMonth: "Edellinen kuukausi",
      nextMonth: "Seuraava kuukausi",
      close: "Sulje"
    },
    terms: {
      title: "Lopuksi hallinnolliset tiedot",
      conditions: "Maksuehdot",
      legal: "Oikeudelliset tiedot",
      addRedirect: "Lisää uudelleenohjauksen URL",
      redirect: "Uudelleenohjauksen URL",
      redirectInvalid: "Anna osoite, joka alkaa https://",
      redirectHint:
        "Kun lasku on maksettu, asiakkaasi pääsee yhdellä napsautuksella takaisin sivustollesi (kiitossivu, tilauksen seuranta…)."
    },
    review: {
      title: "Tarkista lasku",
      client: "Asiakas",
      articles: "Tuotteet",
      due: "Eräpäivä",
      notices: "Hallinnolliset tiedot",
      noNotices: "Ei tietoja",
      editRecipient: "Muokkaa vastaanottajaa",
      editLines: "Muokkaa tuotteita",
      editDue: "Muokkaa eräpäivää",
      editNotices: "Muokkaa hallinnollisia tietoja",
      create: "Luo lasku"
    },
    sent: {
      title: "Lasku {{number}} luotu",
      lead: "Lähetä se asiakkaallesi. Maksulinkki on avoinna {{date}} asti.",
      mail: "Lähetä sähköpostilla",
      copy: "Kopioi linkki",
      copied: "Linkki kopioitu",
      share: "Jaa",
      pdf: "Lataa PDF",
      newInvoice: "Uusi lasku",
      view: "Näytä lasku",
      close: "Sulje"
    },
    mail: {
      subject: "Lasku {{number}} · {{business}}",
      body: "Hei,\n\nAlla on lasku {{number}} yritykseltä {{business}}, summa {{amount}}, maksettava viimeistään {{date}}.\n\nMaksa bitcoineilla: {{url}}\n\nYstävällisin terveisin\n{{business}}"
    },
    pdf: {
      invoice: "Lasku",
      date: "Päiväys",
      due: "Eräpäivä",
      reference: "Viitteenne",
      billedTo: "Laskun saaja",
      pay: "Maksa bitcoineilla",
      payHint: "Skannaa QR-koodi tai avaa linkki.",
      title: "Lasku {{number}}"
    },
    detail: {
      totalDue: "Maksettava yhteensä",
      paid: "Maksettu summa",
      due: "Eräpäivä",
      paidOn: "Maksettu",
      rest: "Maksamatta",
      createdBy: "Sinun luomasi",
      recipient: "Vastaanottaja",
      conditions: "Ehdot ja tiedot",
      followUp: "Tapahtumat",
      created: "Luotu",
      sent: "Lähetetty",
      paidEvent: "Maksettu",
      more: "Lisää toimintoja",
      remind: "Muistuta sähköpostilla",
      copyLink: "Kopioi maksulinkki",
      duplicate: "Monista",
      pdf: "Lataa PDF",
      cancel: "Peruuta lasku",
      title: "Lasku {{number}}",
      breadcrumb: "lasku {{number}}",
      notFound: "Laskua ei löydy. Se on ehkä poistettu toisella laitteella.",
      reading: "Laskua ladataan…",
      readFailed: "Laskua ei voitu lukea. Tarkista internetyhteys ja yritä uudelleen.",
      cancelDialog: {
        title: "Peruutetaanko lasku {{number}}?",
        body: "Maksulinkki ei enää tarjoa maksamista. Jo vastaanotettu maksu jää lompakkoosi.",
        confirm: "Peruuta lasku",
        keep: "Säilytä lasku"
      },
      canceled: "Lasku peruutettu",
      cancelReceived: "Tähän laskuun on jo saapunut maksu: sitä ei voi enää peruuttaa",
      cancelFailed: "Laskua ei voitu peruuttaa. Tarkista internetyhteys ja yritä uudelleen"
    },
    draftDetail: {
      edit: "Muokkaa luonnosta",
      remove: "Poista luonnos",
      removed: "Luonnos poistettu",
      removeDialog: {
        title: "Poistetaanko luonnos {{number}}?",
        body: "Se katoaa kaikilta laitteiltasi. Sen numeroa ei käytetä uudelleen.",
        confirm: "Poista luonnos",
        keep: "Säilytä luonnos"
      }
    },
    errors: {
      noAccount: "Avaa sovelluksen lukitus ja yritä uudelleen",
      invalid: "Täydennä lasku ja yritä uudelleen",
      number: "Laskun numeroa ei voitu antaa. Tarkista internetyhteys ja yritä uudelleen",
      noWebApp: "Maksulinkit eivät ole vielä käytettävissä tässä sovelluksen versiossa",
      noAddress:
        "Yli {{max}} satsin laskulla (Lightning-yläraja vähennettynä marginaalilla {{margin}}) on oltava onchain-osoite, eikä yksikään Bitcoin-osoite ole valmiina. Yritä hetken päästä uudelleen",
      unverified:
        "Laskun Lightning-ylärajaa ei voitu tarkistaa. Tarkista internetyhteys ja yritä uudelleen",
      unreachable: "Laskua ei voitu tallentaa. Tarkista internetyhteys ja yritä uudelleen",
      mailFailed: "Mitään sähköpostisovellusta ei voitu avata. Kopioi maksulinkki sen sijaan",
      pdfFailed: "PDF-tiedostoa ei voitu luoda. Yritä uudelleen",
      copyFailed: "Linkkiä ei voitu kopioida"
    }
  },
  documentLanguage: {
    title: {
      mail: "Sähköpostin kieli",
      pdf: "PDF:n kieli",
      export: "Viennin kieli"
    },
    change: {
      mail: "Sähköpostin kieli: {{language}}. Vaihda",
      pdf: "PDF:n kieli: {{language}}. Vaihda",
      export: "Viennin kieli: {{language}}. Vaihda"
    },
    yours: "Sinun kielesi"
  },
  currencies: {
    AUD: "Australian dollareiksi",
    CAD: "Kanadan dollareiksi",
    CHF: "Sveitsin frangeiksi",
    CZK: "Tšekin korunoiksi",
    DKK: "Tanskan kruunuiksi",
    EUR: "euroiksi",
    GBP: "Englannin punniksi",
    HKD: "Hongkongin dollareiksi",
    HUF: "Unkarin forinteiksi",
    JPY: "Japanin jeneiksi",
    MXN: "Meksikon pesoiksi",
    NOK: "Norjan kruunuiksi",
    NZD: "Uuden-Seelannin dollareiksi",
    PLN: "Puolan zlotyiksi",
    SEK: "Ruotsin kruunuiksi",
    SGD: "Singaporen dollareiksi",
    USD: "Yhdysvaltain dollareiksi",
    ZAR: "Etelä-Afrikan randeiksi"
  },
  currencyNames: {
    AUD: "Australian dollarit",
    CAD: "Kanadan dollarit",
    CHF: "Sveitsin frangit",
    CZK: "Tšekin korunat",
    DKK: "Tanskan kruunut",
    EUR: "Eurot",
    GBP: "Englannin punnat",
    HKD: "Hongkongin dollarit",
    HUF: "Unkarin forintit",
    JPY: "Japanin jenit",
    MXN: "Meksikon pesot",
    NOK: "Norjan kruunut",
    NZD: "Uuden-Seelannin dollarit",
    PLN: "Puolan zlotyt",
    SEK: "Ruotsin kruunut",
    SGD: "Singaporen dollarit",
    USD: "Yhdysvaltain dollarit",
    ZAR: "Etelä-Afrikan randit"
  },
  businessNumbers: {
    company: {
      CH: "UID-tunnus",
      FR: "SIRET-numero",
      DE: "Veronumero (Steuernummer)",
      IT: "Verokoodi (codice fiscale)",
      ES: "NIF",
      PT: "NIF",
      FI: "Y-tunnus",
      other: "Yritystunnus"
    },
    vat: {
      CH: "ALV-numero",
      EU: "ALV-tunniste",
      other: "ALV-numero"
    }
  },
  whatsNew: {
    title: "Uutta",
    open: "Uutta, {{build}}",
    openUnread: "Uutta, lukematta, {{build}}",
    next: "Seuraava versio",
    new: "Uusi",
    source: "Lähdekoodi",
    close: "Sulje",
    empty: "Jokaisen version uudistukset näkyvät tässä."
  }
};

export default fi;
