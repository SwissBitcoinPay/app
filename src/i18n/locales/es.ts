import type { Translations } from "./fr";

const es: Translations = {
  common: {
    back: "Volver",
    continue: "Continuar",
    cancel: "Cancelar",
    startCharging: "Empezar a cobrar",
    version: "Versión {{version}}"
  },
  welcome: {
    headline: "Pagos en <accent>bitcoin</accent>.",
    lead: "Punto de venta, facturas y tarjetas NFC.",
    guarantees: {
      nonCustodial: "Sin custodia",
      noKyc: "Sin identificación KYC",
      oneMinute: "En 1 minuto"
    },
    createAccount: "Crear mi cuenta",
    login: "Iniciar sesión",
    joinInvitation: "Unirse por invitación",
    alreadyHave: "Ya tengo",
    have: {
      account: "Una cuenta sattle.me",
      invitation: "Una invitación",
      boltCard: "Una BoltCard"
    },
    manageBoltCard: "Gestionar mi BoltCard",
    boltCardApp: {
      computer:
        "Un ordenador no puede leer tarjetas NFC. Descarga la app sattle.me en tu teléfono: allí crearás tu cuenta y luego acercarás la tarjeta al teléfono para programarla.",
      device:
        "Este dispositivo no puede leer tarjetas NFC. Descarga la app sattle.me en tu teléfono: allí crearás tu cuenta y luego acercarás la tarjeta al teléfono para programarla.",
      browser:
        "Un navegador no puede programar una tarjeta. Abre o instala la app sattle.me en este teléfono: allí crearás tu cuenta y luego acercarás la tarjeta al teléfono para programarla.",
      iphone: "iPhone",
      android: "Android",
      codeIphone: "Código QR de la app sattle.me en App Store",
      codeAndroid: "Código QR de la app sattle.me en Google Play",
      scan: "Escanea el código de tu teléfono con su cámara."
    },
    terms: "Al continuar, aceptas las <link>condiciones generales</link>."
  },
  legal: {
    terms: "Condiciones generales",
    privacy: "Política de privacidad"
  },
  account: {
    passkeyWarning:
      "Tu passkey es la llave de tu monedero: eliminarla puede dejar tus fondos inaccesibles.",
    progress: {
      creating: "Creando tu passkey…",
      signingIn: "Iniciando sesión con tu passkey…",
      preparing: "Preparando tu cuenta…",
      restoring: "Recuperando tus ajustes…",
      terminal: "Preparando tu punto de venta…"
    },
    cancelled: {
      title: "Passkey cancelada",
      body: "Vuelve a tocar el botón para reintentarlo."
    },
    errors: {
      recoveryOverdue:
        "Tus pagos están bloqueados: verifica primero tus 12 palabras de recuperación.",
      rescueClosed:
        "El modo de rescate se cerró: no se envió nada. Vuelve a abrirlo con tus 12 palabras.",
      unsupported:
        "Este dispositivo o navegador no puede usar una passkey de sattle.me. Usa un navegador reciente o la app en iPhone, iPad o Android.",
      prfUnsupported:
        "Tu gestor de passkeys no es compatible: usa la app Contraseñas de Apple o el Gestor de contraseñas de Google.",
      notAssociated:
        "Las passkeys aún no están activadas para esta versión de la app. Inténtalo más tarde.",
      notConfigured: "Esta versión de la app no está configurada para abrir un monedero.",
      cancelled: "Passkey cancelada. Vuelve a tocar el botón para reintentarlo.",
      timedOut:
        "Tiempo agotado. Inténtalo de nuevo y confirma con tu cara, tu huella o el código del dispositivo.",
      noCredential:
        "No se ha ofrecido ninguna passkey de sattle.me en este dispositivo. Comprueba que tus passkeys estén sincronizadas en este dispositivo.",
      noCredentialAndroid:
        "No se ha ofrecido ninguna passkey de sattle.me en este dispositivo. Comprueba que tu gestor de contraseñas no esté limitado por el ahorro de batería.",
      alreadyExists: "Ya existe una passkey en este dispositivo: usa «$t(welcome.login)».",
      createdNotDerived:
        "Tu passkey se ha creado, pero no se ha podido abrir tu monedero. Toca «$t(welcome.createAccount)» para terminar con esta passkey.",
      connectFailed:
        "No se ha podido abrir tu monedero. Comprueba tu conexión a internet y vuelve a intentarlo.",
      settingsTooNew:
        "Tus ajustes se guardaron con una versión más reciente de la app. Actualiza la app y vuelve a intentarlo.",
      notFound:
        "No se encontró ninguna cuenta con esta passkey en los relés Nostr de este dispositivo.",
      terminalFailed:
        "No se pudo preparar tu punto de venta. Comprueba tu conexión a internet y vuelve a intentarlo.",
      deviceFailed: "No se pudo preparar tu cuenta en este dispositivo. Vuelve a intentarlo.",
      failed: "Se ha producido un error. Inténtalo de nuevo."
    }
  },
  noAccount: {
    title: "No se encontró ninguna cuenta",
    unreachableTitle: "Relés inaccesibles",
    answered: {
      all: "Ninguna cuenta está asociada a esta passkey en los relés Nostr de abajo.",
      some: "Ninguna cuenta está asociada a esta passkey en los relés Nostr de abajo que respondieron. Otros no respondieron: «$t(relays.test)» indica cuáles.",
      none: "Ninguno de los relés Nostr de abajo respondió: no se puede saber si hay una cuenta asociada a esta passkey. Comprueba tu conexión a internet."
    },
    lead: "¿Elegiste relés personalizados para tu cuenta? Añádelos, guarda y luego toca «$t(welcome.login)». Si tienes varias passkeys, comprueba también que elegiste la correcta."
  },
  // "Stay informed": the phone's notifications asked once, after the setup.
  notificationsOffer: {
    title: "Mantente informado",
    lead: "Permite las notificaciones: sattle.me te avisa de la información importante, incluso con la app cerrada.",
    words: "Tus 12 palabras",
    wordsBody: "Un recordatorio anual para verificarlas, por tu seguridad.",
    cards: "Tus tarjetas",
    cardsBody: "Los pagos con tarjeta que esperan tu aprobación.",
    note: "Nunca publicidad. Podrás cambiar de opinión en los ajustes del teléfono.",
    allow: "Permitir las notificaciones",
    later: "Ahora no"
  },
  recoveryCheck: {
    reminders: {
      channel: "Frase de recuperación",
      startTitle: "Es momento de verificar tus 12 palabras",
      startBody:
        "Ha pasado un año: vuelve a escribirlas en sattle.me para asegurarte de que tu hoja sigue siendo correcta.",
      weekTitle: "Tus pagos se bloquearán dentro de 7 días",
      eveTitle: "Tus pagos se bloquearán mañana",
      soonBody: "Verifica tus 12 palabras en sattle.me para seguir pagando.",
      dayTitle: "Tus pagos están bloqueados",
      dayBody: "Verifica tus 12 palabras en sattle.me para volver a pagar."
    },
    banner: {
      due: "Tu llave de repuesto no está verificada",
      daysLeft: "D−{{count}}",
      daysLeftLabel_one: "Queda {{count}} día",
      daysLeftLabel_other: "Quedan {{count}} días",
      overdue: "Pagos bloqueados: verifica tus 12 palabras",
      action: "Verificar mis 12 palabras"
    },
    title: "Verificar tus 12 palabras",
    intro: {
      title: "Tres casos en los que solo tus 12 palabras ayudan",
      lost: "Teléfono perdido o robado",
      passkey: "Passkey borrada",
      gone: "sattle.me ya no existe",
      lead: "En cada uno, tus 12 palabras vuelven a abrir tu cuenta y tus tarjetas. Sin ellas, los fondos se pierden.",
      key: "La passkey es tu llave de todos los días. Las 12 palabras son la llave de repuesto, guardada en casa: vuelve a escribirlas desde tu hoja.",
      due_one: "Queda {{count}} día para hacerlo.",
      due_other: "Quedan {{count}} días para hacerlo.",
      overdue: "Tus pagos están bloqueados hasta esta verificación.",
      optional:
        "Por ahora no hay nada pendiente: esta verificación es una buena práctica, no bloquea nada.",
      start: "Empezar"
    },
    word: {
      progress: "Palabra {{index}} de 12",
      label: "¿Cuál es la palabra {{index}}?",
      hint: "Las palabras de la lista que empiezan así: nada dice cuál es la correcta.",
      unknown: "Esta palabra no está en la lista: comprueba cómo está escrita",
      next: "Siguiente palabra",
      previous: "Palabra anterior",
      check: "Verificar"
    },
    lost: "Ya no las tengo",
    checking: "Verificando…",
    done: {
      title: "Tus 12 palabras están verificadas",
      lead: "Guarda tu hoja en un lugar seguro. La próxima verificación será dentro de un año, si tu cuenta sigue guardando más de 1000 CHF.",
      finish: "Hecho"
    },
    wrong: {
      title: "Estas palabras no coinciden",
      lead: "Al menos una palabra es incorrecta, o dos están invertidas. Vuelve a tomar tu hoja y empieza de nuevo, o muestra tus 12 palabras.",
      again: "Empezar de nuevo"
    },
    saveFailed:
      "Tus palabras son correctas, pero la verificación no se pudo guardar. Comprueba tu conexión a internet y vuelve a intentarlo.",
    retry: "Reintentar"
  },
  rescue: {
    section: "Recuperación",
    entry: "Abrir con mis 12 palabras",
    entryLead:
      "Si tu passkey ya no funciona, tus 12 palabras de recuperación abren tu cuenta para enviar sus fondos a otro lugar.",
    words: {
      title: "Abrir con tus 12 palabras",
      lead: "Escribe la frase de recuperación de tu cuenta, en orden.",
      only: "Escribe estas palabras solo en la app sattle.me. Nadie te las pedirá, ni por correo electrónico, ni por mensaje, ni por teléfono.",
      label: "Tus 12 palabras",
      count_one: "{{count}} palabra de 12",
      count_other: "{{count}} palabras de 12",
      unknown: "La palabra {{position}} no está en la lista: comprueba cómo está escrita",
      checksum:
        "Estas 12 palabras no forman una frase válida: comprueba cada una de ellas y su orden",
      valid: "Frase completa y válida",
      submit: "Abrir mi cuenta",
      opening: "Abriendo tu cuenta…",
      note: "Tus palabras no se guardan ni se envían: se olvidan en cuanto cierras esta pantalla.",
      failed: "No se pudo abrir tu cuenta. Comprueba tu conexión a internet y vuelve a intentarlo."
    },
    badge: "Modo de rescate",
    funds: {
      title: "Tus fondos",
      lead: "Cuenta abierta con tus 12 palabras. Envía tus fondos a otro monedero y luego cierra.",
      leadWalletOnly:
        "Ningún relé de este dispositivo conoce tu cuenta: solo se abre tu monedero. Para encontrar tus tarjetas, cierra y luego cambia de relés en «$t(relays.advanced)».",
      wallet: "Monedero",
      card: "Tarjeta «{{name}}»",
      cardUnnamed: "Tarjeta sin nombre",
      former: "Antiguo monedero de la tarjeta «{{name}}»",
      formerUnnamed: "Antiguo monedero de una tarjeta",
      reading: "Leyendo…",
      unread: "Aún sin leer",
      empty: "Vacío",
      arriving: "{{amount}} en camino",
      send: "Vaciar",
      retry: "$t(wallet.retry)",
      cardsUnread:
        "No se pudieron leer tus tarjetas en una mayoría de tus relés: puede faltar alguna. Vuelve a intentarlo más tarde.",
      cardsFailed:
        "No se pudieron leer tus tarjetas. Comprueba tu conexión a internet y vuelve a intentarlo.",
      export: "Exportar el historial",
      close: "Cerrar",
      closeNote:
        "Al cerrar, este dispositivo olvida tus 12 palabras. Tus fondos se quedan donde están."
    },
    drain: {
      title: "Vaciar el monedero",
      intro:
        "Todo el saldo del monedero va a una dirección lightning, bitcoin o Spark: escríbela, pégala o escanéala. Las comisiones se descuentan de ese saldo.",
      introNoScan:
        "Todo el saldo del monedero va a una dirección lightning, bitcoin o Spark: escríbela o pégala. Las comisiones se descuentan de ese saldo.",
      total: "Saldo del monedero",
      feesAbove: "Las comisiones superan el saldo del monedero a esta velocidad",
      empty: "Este monedero no contiene nada que enviar.",
      confirm: "Enviar todo",
      done: "{{amount}} enviados: el monedero está vacío.",
      pending: "Envío de {{amount}} en curso: llegará en cuanto se complete.",
      failed: "El envío no se completó. Comprueba el saldo del monedero y vuelve a intentarlo."
    },
    closed: "El modo de rescate se cerró: vuelve a abrirlo con tus 12 palabras.",
    idle: {
      title: "Cierre en {{seconds}} s",
      body: "Sin actividad, el modo de rescate se cierra y olvida tus 12 palabras.",
      closed:
        "El modo de rescate se cerró tras 5 minutos sin actividad: vuelve a escribir tus 12 palabras para abrirlo de nuevo."
    }
  },
  migration: {
    amount: "{{btc}} (unos {{fiat}})",
    entry: "Migrar mi cuenta Swiss\u00a0Bitcoin\u00a0Pay",
    // Before the brand's wordmark (MigrateAccountEntry); `entry` is what screen readers say.
    entryLead: "Migrar desde",
    home: {
      badge: "Swiss\u00a0Bitcoin\u00a0Pay se convierte en sattle.me",
      title: "Hola, {{business}}",
      titleUnnamed: "Hola",
      titleManual: "Migrar tu cuenta Swiss\u00a0Bitcoin\u00a0Pay",
      leadFound: "Hemos encontrado tu cuenta. Todo pasa a sattle.me:",
      leadPassword:
        "Hemos encontrado tu cuenta. Para conservar tus pagos, tu contraseña de Swiss\u00a0Bitcoin\u00a0Pay, una última vez:",
      leadManual:
        "Inicia sesión una última vez en tu cuenta Swiss\u00a0Bitcoin\u00a0Pay: tu negocio y tus pagos pasan a sattle.me, que no tiene contraseña.",
      payoutsReading: "Leyendo…",
      payoutsAfterPassword: "Tras tu contraseña",
      read: "Leído en tu cuenta Swiss\u00a0Bitcoin\u00a0Pay",
      money: "Tu dinero te sigue: se transfiere a tu nueva cuenta.",
      retry: "Reintentar",
      migrate: "Migrar"
    },
    login: {
      email: "Correo electrónico",
      password: "Contraseña",
      checking: "Conectando con tu antigua cuenta…",
      forgotten: "¿Olvidaste tu contraseña?",
      changed: "Ya elegí una nueva contraseña",
      note: "Tu contraseña se usa una sola vez y nunca se guarda.",
      errors: {
        refused: "Correo o contraseña incorrectos",
        unreachable: "Tu antigua cuenta no responde. Comprueba tu conexión y vuelve a intentarlo.",
        stopped:
          "Para no bloquear tu antigua cuenta, ya no lo intentamos con esta contraseña. Elige una nueva: te enviamos un enlace por correo.",
        secondFactor:
          "Tu antigua cuenta pide un código de verificación, que sattle.me no puede usar. Escríbenos a {{email}}: te ayudaremos a actualizar tu cuenta."
      }
    },
    forgot: {
      title: "Contraseña olvidada",
      lead: "Indica el correo de tu antigua cuenta Swiss\u00a0Bitcoin\u00a0Pay: te enviamos un enlace para elegir una nueva contraseña.",
      send: "Enviar el enlace",
      sending: "Enviando…",
      invalidEmail: "Esta dirección de correo no es válida",
      failed: "No se pudo pedir el enlace. Comprueba tu conexión y vuelve a intentarlo.",
      sentTitle: "Revisa tu correo",
      sent: "Si una cuenta Swiss\u00a0Bitcoin\u00a0Pay usa {{email}}, se le acaba de enviar un correo. Abre su enlace para elegir una nueva contraseña.",
      sentNote:
        "El enlace es válido 15 minutos. ¿No has recibido nada? Mira en tu carpeta de spam, o vuelve atrás para pedirlo de nuevo.",
      choose: "Elegir una nueva contraseña"
    },
    password: {
      title: "Nueva contraseña",
      lead: "Elige la nueva contraseña de tu antigua cuenta Swiss\u00a0Bitcoin\u00a0Pay.",
      label: "Nueva contraseña",
      rules: {
        length: "Al menos 8 caracteres",
        letter: "Al menos una letra",
        digit: "Al menos una cifra"
      },
      met: "cumplido",
      unmet: "todavía no",
      save: "Guardar",
      saving: "Guardando…",
      rejected: "Esta contraseña no se acepta: revisa las reglas de abajo",
      failed: "No se pudo cambiar la contraseña. Comprueba tu conexión y vuelve a intentarlo.",
      expired:
        "Este enlace ya no es válido: ya se usó, o sus 15 minutos han pasado. Pide uno nuevo.",
      again: "Recibir un nuevo enlace",
      doneTitle: "Contraseña cambiada",
      done: "Tu nueva contraseña está guardada. Inicia sesión con ella para actualizar tu cuenta."
    },
    confirm: {
      currency: "Moneda",
      payouts: "Pagos",
      payoutsToChoose: "A elegir tras crear la cuenta",
      split: "{{bitcoin}} bitcoin · {{bank}} banco",
      allBitcoin: "{{percent}} bitcoin",
      bank: "Cuenta bancaria",
      holder: "Titular",
      freeze:
        "Al crear tu cuenta sattle.me, tu antigua cuenta deja de cobrar. Los sats que te debe se envían enseguida por Lightning a tu cuenta sattle.me, o a más tardar a las 0:00\u00a0UTC si el envío no sale en el momento.",
      notMine: "No es mi cuenta",
      migratedTitle: "Cuenta ya actualizada",
      migrated:
        "«{{business}}» pasó a sattle.me el {{date}}. Abre tu cuenta sattle.me con su passkey.",
      logIn: "Iniciar sesión"
    },
    freeze: {
      settingTitle: "Antigua cuenta Swiss\u00a0Bitcoin\u00a0Pay",
      settingDescription:
        "No se pudo congelar tu antigua cuenta al final de la actualización: todavía cobra, y su saldo no se paga en sattle.me. Congélala ahora.",
      settingLead:
        "Inicia sesión una última vez en tu antigua cuenta Swiss\u00a0Bitcoin\u00a0Pay: se congela, y los sats que te debe se envían enseguida por Lightning a tu cuenta sattle.me, o a más tardar a las 0:00\u00a0UTC.",
      settingStart: "Congelar mi antigua cuenta",
      running: "Cerrando tu antigua cuenta…",
      done: "Tu antigua cuenta Swiss\u00a0Bitcoin\u00a0Pay está congelada: ya no cobra. Fondos transferidos a tu nuevo monedero sattle.me.",
      doneNone:
        "Tu antigua cuenta Swiss\u00a0Bitcoin\u00a0Pay está congelada: ya no cobra. No hay saldo que transferir.",
      donePending:
        "Tu antigua cuenta Swiss\u00a0Bitcoin\u00a0Pay está congelada: ya no cobra. Los fondos se transferirán a tu nuevo monedero sattle.me a más tardar a las 0:00\u00a0UTC.",
      conflict:
        "Tu antigua cuenta ya se había actualizado a otra cuenta sattle.me: es allí donde se paga su dinero. Si no fuiste tú, escríbenos a {{email}}.",
      rejected:
        "No se pudo congelar tu antigua cuenta. Escríbenos a {{email}}: lo haremos contigo.",
      failed:
        "No se pudo congelar tu antigua cuenta: todavía cobra. Comprueba tu conexión y vuelve a intentarlo.",
      lost: "No se pudo congelar tu antigua cuenta: todavía cobra. Escríbenos a {{email}}: lo haremos contigo."
    },
    transfer: {
      prompt: "Abrir tu antiguo monedero",
      running: "Transfiriendo tu dinero…",
      retry: "Reintentar",
      sentTitle: "{{amount}} en camino a tu nueva cuenta",
      sent: "Aparecerán en «$t(navigation.destinations.wallet)» cuando la red los confirme, normalmente en una hora. Comisión de red: {{fee}}.",
      more: "Otros {{amount}} van en camino a tu antigua cuenta: podrás transferirlos desde «$t(navigation.destinations.wallet)» cuando lleguen.",
      empty: "Tu antiguo monedero está vacío: nada que transferir.",
      waiting:
        "{{amount}} están llegando a tu antigua cuenta: podrás transferirlos desde «$t(navigation.destinations.wallet)» cuando lleguen.",
      tooSmall:
        "Tu antiguo monedero contiene {{amount}}, menos que las comisiones para transferirlos. Por ahora se quedan donde están.",
      unreadable:
        "Tu teléfono no pudo abrir tu antiguo monedero. Vuelve a intentarlo o escribe sus 12 palabras.",
      failed: "La transferencia no se pudo hacer. Comprueba tu conexión y vuelve a intentarlo.",
      sheetTitle: "¿Transferir tu antiguo monedero?",
      from: "De",
      fromName: "Monedero Swiss Bitcoin Pay",
      fromCaption: "12 palabras, en este teléfono",
      to: "A",
      toName: "Tu monedero sattle.me",
      amountLabel: "Importe",
      amountUnknown: "Se lee al transferir",
      sats: "{{sats}} sats",
      fiat: "unos {{fiat}}",
      eraseNote:
        "Después, las 12 palabras se borran de la memoria de este teléfono, se haga o no la transferencia.",
      start: "Transferir",
      skip: "No transferir",
      skipTitle: "¿Borrar sin transferir?",
      skipBody:
        "Las 12 palabras de tu monedero Swiss Bitcoin Pay se borrarán de la memoria de tu teléfono. Los {{amount}} que contiene solo podrán recuperarse con tus 12 palabras anotadas en papel.",
      skipBodyUnknown:
        "Las 12 palabras de tu monedero Swiss Bitcoin Pay se borrarán de la memoria de tu teléfono. Lo que contiene solo podrá recuperarse con tus 12 palabras anotadas en papel.",
      skipConfirm: "Tengo las 12 palabras,\nborrar sin transferir",
      erased: "Las 12 palabras se han borrado de este teléfono.",
      tooSmallErased:
        "Tu antiguo monedero contiene {{amount}}, menos que las comisiones para transferirlo: se queda donde está.",
      skipped:
        "Las 12 palabras se han borrado de este teléfono, sin transferencia. Con tus 12 palabras anotadas en papel puedes transferir lo que contiene.",
      eraseFailed: "No se han podido borrar las 12 palabras de este teléfono. Vuelve a intentarlo."
    },
    done: {
      title: "Tu cuenta está al día",
      todoTitle: "Aún por hacer, si te afecta",
      employees: "Vuelve a invitar a tus empleados",
      shop: "Migra la integración de tu tienda en línea",
      changes: "Qué cambia",
      words:
        "Quedan {{amount}} en tu antiguo monedero de Swiss\u00a0Bitcoin\u00a0Pay. Transfiérelos con las 12 palabras que anotaste al crearlo.",
      wordsUnknown:
        "No se pudo comprobar tu antiguo monedero de Swiss\u00a0Bitcoin\u00a0Pay: puede que aún contenga dinero. Transfiérelo con las 12 palabras que anotaste al crearlo.",
      checking: "Comprobando tu antiguo monedero…",
      titleRunning: "Actualizando tu cuenta",
      lead: "Normalmente unos segundos.",
      // The steps of the migration's end (MigrationTimeline, end-steps.tsx).
      steps: {
        account: "Cuenta sattle.me creada",
        accountCaption: "«{{business}}» está listo para cobrar.",
        frozen: "Antigua cuenta congelada",
        frozenSent: "Ya no cobra. Fondos transferidos a tu nuevo monedero sattle.me.",
        frozenNone: "Ya no cobra. No hay saldo que transferir.",
        frozenPending:
          "Ya no cobra. Los fondos se transferirán a tu nuevo monedero sattle.me a más tardar a las 0:00\u00a0UTC.",
        migratedElsewhere: "Antigua cuenta ya actualizada",
        notFrozen: "Antigua cuenta no congelada",
        history: "Copia de tu historial",
        historyWaiting: "En cuanto tu antigua cuenta esté congelada.",
        historyRunning: "Copiando tu historial…",
        historyRead_one: "{{formatted}} movimiento leído",
        historyRead_other: "{{formatted}} movimientos leídos",
        historyWritten_one: "{{copied}}\u00a0/\u00a0{{total}} movimiento",
        historyWritten_other: "{{copied}}\u00a0/\u00a0{{total}} movimientos",
        historyCopied: "Historial copiado",
        historyCopiedCaption_one:
          "{{formatted}} movimiento, visible en «$t(navigation.destinations.wallet)».",
        historyCopiedCaption_other:
          "{{formatted}} movimientos, visibles en «$t(navigation.destinations.wallet)».",
        historyEmpty: "Ningún movimiento que copiar.",
        historyNotCopied: "Historial no copiado",
        wallet: "Antiguo monedero"
      }
    },
    changes: {
      title: "Qué cambia",
      lead: "En cuanto se crea tu cuenta sattle.me:",
      frozen:
        "Una vez congelada, tu antigua cuenta Swiss\u00a0Bitcoin\u00a0Pay ya no cobra nada, ni en caja, ni en línea, ni en su dirección Lightning.",
      items: {
        employees: {
          title: "Vuelve a invitar a tus empleados",
          caption:
            "Sus dispositivos ya no cobran en la antigua cuenta. Invítalos en «$t(navigation.destinations.employees)»: escanean tu código y cobran para ti. Un dispositivo demasiado antiguo para sattle.me ya no puede cobrar."
        },
        shop: {
          title: "Migra la integración de tu tienda en línea",
          caption:
            "Tu tienda en línea ya no cobra en la antigua cuenta. Crea una integración en «$t(navigation.destinations.integrations)» y da su clave a la persona que gestiona tu sitio web."
        },
        limits: {
          title: "Se acabaron los límites",
          caption:
            "Gracias a la actualización sattle.me 3.0.0, ya no hay límites ni restricciones ligados a la verificación de identidad."
        },
        money: {
          title: "Tu dinero te sigue",
          caption:
            "Los sats que te debe la antigua cuenta se envían por Lightning a tu cuenta sattle.me con la actualización, sean cuales sean tus antiguos ajustes; si el envío no sale, se repite cada noche a las 0:00\u00a0UTC. Los que aún lleguen después siguen en cuanto se liquidan. Las transferencias bancarias ya en curso se hacen como siempre."
        },
        cards: {
          title: "Transfiere tus tarjetas",
          caption:
            "Acerca cada tarjeta Swiss\u00a0Bitcoin\u00a0Pay en «$t(navigation.destinations.cards)» para transferir su saldo. Una tarjeta aún no transferida funciona hasta el {{cardEnd}}."
        },
        history: {
          title: "Tu historial se copia",
          caption:
            "Tus ventas, retiros y comisiones se copian en «$t(navigation.destinations.wallet)», a título informativo. Están en sus exportaciones CSV y PDF. El historial de tu antigua cuenta sigue disponible para consultarlo y exportarlo en dashboard.swiss-bitcoin-pay.ch hasta el {{merchantEnd}}."
        }
      }
    },
    // The copy of the v2 account's history (src/features/migration/history-import.ts).
    history: {
      running: "Copiando tu historial de Swiss\u00a0Bitcoin\u00a0Pay en segundo plano…",
      // While reading the v2 server (its pages tell no total), then writing to the relays.
      reading_one:
        "Leyendo tu historial de Swiss\u00a0Bitcoin\u00a0Pay: {{formatted}} movimiento leído…",
      reading_other:
        "Leyendo tu historial de Swiss\u00a0Bitcoin\u00a0Pay: {{formatted}} movimientos leídos…",
      writing_one:
        "Copiando tu historial de Swiss\u00a0Bitcoin\u00a0Pay: {{copied}}\u00a0/\u00a0{{total}} movimiento…",
      writing_other:
        "Copiando tu historial de Swiss\u00a0Bitcoin\u00a0Pay: {{copied}}\u00a0/\u00a0{{total}} movimientos…",
      done_one:
        "Tu historial está copiado: {{formatted}} movimiento, visible en «$t(navigation.destinations.wallet)».",
      done_other:
        "Tu historial está copiado: {{formatted}} movimientos, visibles en «$t(navigation.destinations.wallet)».",
      failed:
        "La copia de tu historial no se completó. Vuelve a iniciarla desde «$t(settings.title)», sección «$t(settings.groups.account)».",
      settingTitle: "Historial de Swiss\u00a0Bitcoin\u00a0Pay",
      settingDescription:
        "Copia en sattle.me las ventas, retiros y comisiones de tu antigua cuenta, a título informativo. Posible hasta el {{date}}.",
      start: "Importar mi historial",
      lead: "Inicia sesión una última vez en tu antigua cuenta de Swiss\u00a0Bitcoin\u00a0Pay: tu historial se copia en segundo plano.",
      note: "Tu contraseña se usa una sola vez y nunca se guarda.",
      errors: {
        secondFactor:
          "Tu antigua cuenta pide un código de verificación que sattle.me no puede usar. Contacta con el soporte.",
        stopped:
          "Para no bloquear tu antigua cuenta, dejamos de intentarlo. Comprueba tu contraseña antes de volver a intentarlo más tarde.",
        unreachable: "Tu antigua cuenta no responde. Comprueba tu conexión y vuelve a intentarlo."
      }
    },
    words: {
      open: "Escribir mis 12 palabras",
      title: "Tu antiguo monedero",
      lead: "Escribe en orden las 12 palabras que anotaste al crear tu monedero en la app Swiss Bitcoin Pay. Su dinero se transferirá a tu cuenta sattle.me.",
      only: "Solo esas 12 palabras: nunca escribas aquí las de otro monedero (Ledger, Trezor, BitBox u otro).",
      label: "Tus 12 palabras",
      invalid: "Estas palabras no forman un monedero: revisa cada una y su orden",
      mismatch:
        "Estas palabras no son las de tu monedero de Swiss\u00a0Bitcoin\u00a0Pay: revisa cada una y su orden, y vuelve a escribirlas",
      unused:
        "Estas palabras no corresponden a ningún monedero que haya recibido dinero: revisa cada una y su orden, y vuelve a escribirlas",
      submit: "Transferir",
      done: "Listo",
      note: "Tus palabras se usan una sola vez y nunca se guardan."
    },
    employee: {
      title: "Swiss Bitcoin Pay se convierte en sattle.me",
      lead: "Este dispositivo cobraba para un negocio. Para continuar, pide al responsable que te vuelva a invitar desde sattle.me y escanea su código.",
      leadBusiness:
        "Este dispositivo cobraba para «{{business}}». Para continuar, pide al responsable que te vuelva a invitar desde sattle.me y escanea su código.",
      join: "Escanear la invitación",
      logIn: "Ya tengo una cuenta sattle.me",
      owner: "Soy el responsable de este negocio"
    },
    wallet: {
      unchecked:
        "Tu antiguo monedero de Swiss Bitcoin Pay está en este teléfono. Comprueba si queda dinero por transferir.",
      check: "Comprobar y transferir",
      funds: "Quedan {{amount}} en tu antigua cuenta, para transferir aquí.",
      transfer: "Transferir",
      incoming:
        "{{amount}} están llegando a tu antigua cuenta: podrás transferirlos cuando lleguen."
    }
  },
  split: {
    title: "¿Cómo quieres que te paguen?",
    description:
      "La app te propondrá vender esta parte de tus cobros. Modificable en cualquier momento.",
    bitcoin: "Bitcoin",
    freeUntil: "Gratis hasta el {{date}}",
    sattleFee: "Comisión de sattle.me",
    sattleFeeScope: "Sobre todo lo que cobras, convertido o no",
    conversionFee: "Conversión a {{currency}}",
    conversionFeeScope: "Comisiones de venta de Mt Pelerin, solo sobre la parte convertida",
    extraFee: "+ {{fee}}",
    transferNote:
      "Transferencia gratis desde {{threshold}}. Por debajo, tus ventas se agrupan hasta alcanzarlo, o se transfieren al instante por {{fee}}.",
    waivedRate: "{{free}} en lugar de {{fee}}",
    feeRange: "de {{min}} a {{max}}",
    sliderLabel: "Parte en bitcoin",
    sliderValue: "{{bitcoin}} en bitcoin, {{fiat}} en {{currency}}",
    currencyButton: "Moneda de la transferencia: {{currency}}"
  },
  bank: {
    currentAccount: "La cuenta guardada",
    currentAccountSub: "En Mt Pelerin, en esta moneda",
    editAccount: "Editar esta cuenta",
    title:
      "¿Dónde transferir el <accent>{{percent}}</accent> convertido a <accent>{{currency}}</accent>?",
    transferSchedule: "Tus ventas se transfieren allí, agrupadas en una transferencia.",
    editableLater: "Puedes modificar estos datos en los ajustes.",
    country: "País de residencia",
    iban: "IBAN",
    ibanInvalid: "Comprueba el IBAN",
    holderKind: "El titular es",
    person: "Una persona",
    company: "Una empresa",
    companyName: "Razón social",
    firstname: "Nombre",
    lastname: "Apellido",
    address: "Dirección",
    addressPlaceholder: "Calle y número",
    postalCode: "Código postal",
    postalCodePlaceholder: "1003",
    city: "Ciudad",
    cityPlaceholder: "Lausanne",
    mtPelerin: {
      sheetTitle: "Cuenta Mt Pelerin",
      lead: "Esta parte se vende a nuestro socio Mt Pelerin, intermediario financiero suizo, que transfiere el importe a tu cuenta bancaria.",
      accountTitle: "Tu cuenta con nuestro socio",
      accountSms: "Tu número de móvil y un código recibido por SMS, luego tu correo electrónico",
      accountKey: "La clave de tu cuenta sattle.me, luego tu correo electrónico y tu número",
      bankTitle: "Tu cuenta bancaria",
      bankSub: "Registrada con nuestro socio, que te transfiere allí tus ventas",
      saleTitle: "Nada se vende sin ti",
      saleSub:
        "La app te propone vender esta parte, tú confirmas con tu passkey. Antes de la primera venta, un pago de 1 sat verifica tu monedero",
      connected: "Cuenta Mt Pelerin conectada: esta cuenta bancaria se registrará allí",
      create: "Crear mi cuenta Mt Pelerin",
      existing: "Ya tengo una cuenta Mt Pelerin",
      createTitle: "Crear tu cuenta",
      createLeadSms:
        "Con tu número de móvil, luego tu correo electrónico. Se recupera la cuenta ya abierta con este número.",
      createLeadKey:
        "Con la clave de tu cuenta sattle.me, luego tu correo electrónico y tu número.",
      existingTitle: "Conectar tu cuenta",
      existingLeadSms: "Con el número de móvil de tu cuenta.",
      existingLeadKey: "Con la clave de tu cuenta sattle.me."
    }
  },
  setup: {
    title: "Configurando tu cuenta…",
    description:
      "Preparando tu dirección Lightning y tu punto de venta. Puede tardar unos instantes.",
    cardDescription: "Preparando tu cuenta en este dispositivo. Solo tarda un instante.",
    failedTitle: "Configuración interrumpida",
    retry: "Reintentar"
  },
  appStores: {
    googlePlay: "Instalar la app desde Google Play",
    appStore: "Instalar la app desde App Store"
  },
  install: {
    banner: {
      name: "sattle.me",
      iphone: "La app para iPhone, en el App Store",
      ipad: "La app para iPad, en el App Store",
      android: "La app para Android, en Google Play",
      computer: "En su propia ventana, como una app",
      get: "Obtener",
      install: "Instalar",
      dock: "Añadir al Dock",
      dismiss: "Cerrar, no volver a proponer"
    },
    setting: {
      title: "Instalar la app",
      places: {
        iphone: "La app sattle.me para iPhone, en el App Store.",
        ipad: "La app sattle.me para iPad, en el App Store.",
        android: "La app sattle.me para Android, en Google Play.",
        computer: "sattle.me en este ordenador, en su propia ventana, como una app.",
        dock: "sattle.me en el Dock de este Mac, en su propia ventana, como una app."
      },
      appStore: "App Store",
      googlePlay: "Google Play"
    },
    dock: {
      title: "Añadir sattle.me al Dock",
      menu: "En la barra de menús de Safari, elige <strong>Archivo > Añadir al Dock</strong>.",
      add: "Haz clic en <strong>Añadir</strong>: sattle.me se abre desde el Dock, en su propia ventana.",
      requirement: "Con Safari en macOS Sonoma o posterior.",
      passkey:
        "La app del Dock guarda sus propios datos: la primera vez, vuelve a iniciar sesión con tu passkey.",
      done: "Entendido"
    }
  },
  countryPicker: {
    search: "Buscar un país",
    noResult: "Ningún país encontrado",
    close: "Cerrar"
  },
  currencyPicker: {
    title: "Moneda de la transferencia",
    close: "Cerrar"
  },
  card: {
    computerTitle: "Añade tu <accent>tarjeta</accent> desde tu teléfono",
    computerDescription:
      "Un ordenador no puede leer tarjetas NFC. Escanea este código con tu teléfono: abre la aplicación, donde inicias sesión con la misma passkey. Luego acerca la tarjeta al teléfono.",
    computerCode: "Código QR que abre este paso en la aplicación de tu teléfono",
    computerWaiting: "Esperando a tu teléfono: esta página continúa en cuanto se añada la tarjeta.",
    // The same in the app on a device that reads no card (an iPad, useReadsCards.ts).
    deviceDescription:
      "Este dispositivo no puede leer tarjetas NFC. Escanea este código con tu teléfono: abre la aplicación, donde inicias sesión con la misma passkey. Luego acerca la tarjeta al teléfono.",
    deviceDescriptionNoCode:
      "Este dispositivo no puede leer tarjetas NFC. Abre la aplicación en tu teléfono e inicia sesión con la misma passkey; luego acerca la tarjeta al teléfono.",
    deviceWaiting: "Esperando a tu teléfono: esta pantalla continúa en cuanto se añada la tarjeta.",
    addedTitle: "Tu <accent>tarjeta</accent> está añadida",
    addedDescription:
      "Añadida desde tu teléfono, también aparece aquí, en « Tarjetas ». Recárgala para usarla.",
    webTitle: "Vincula tu <accent>BoltCard</accent> desde la app",
    webDescription:
      "Un navegador no puede programar una tarjeta. Abre la app sattle.me en este teléfono e inicia sesión con tu passkey: la vinculación continuará allí.",
    webDescriptionAndroid:
      "Un navegador no puede programar una tarjeta. Abre la app Android sattle.me en este teléfono, o instálala, y luego inicia sesión con tu passkey: la vinculación continuará en la app.",
    webDescriptionIphone:
      "Un navegador no puede programar una tarjeta. Abre la app iPhone sattle.me en este teléfono, o instálala, y luego inicia sesión con tu passkey: la vinculación continuará en la app.",
    retry: "Reintentar",
    openSettings: "Abrir los ajustes",
    activationPending:
      "Tu tarjeta está programada, pero su relé aún no ha respondido. Se activará la próxima vez que abras la app con conexión: hasta entonces no puede pagar.",
    activationNoPush:
      "Tu tarjeta está lista, pero este teléfono no recibe las notificaciones de pago: solo paga mientras la app está en pantalla. Las notificaciones se activarán solas si este teléfono puede recibirlas.",
    failure: {
      noAccount: "Tu sesión está cerrada. Vuelve a iniciar sesión con tu passkey y reinténtalo.",
      nfcUnavailable:
        "El NFC no está disponible o está desactivado en este dispositivo. Actívalo en los ajustes y reinténtalo.",
      notificationsDenied:
        "Permite las notificaciones de sattle.me en los ajustes del teléfono: así sabe tu teléfono que una caja está leyendo tu tarjeta.",
      relayUnreachable:
        "El relé de la tarjeta no responde. Comprueba tu conexión y reinténtalo. Tu tarjeta no se ha modificado.",
      relayIncompatible:
        "El relé de la tarjeta no usa la versión esperada. Tu tarjeta no se ha modificado.",
      relayTooLong: "La dirección de este relé es demasiado larga para una tarjeta.",
      recordsUnreachable:
        "Responden muy pocos relés de tu cuenta. Comprueba tu conexión y reinténtalo. Tu tarjeta no se ha modificado.",
      notConfirmed:
        "Los relés de tu cuenta no confirmaron este cambio: aún puede aplicarse, o no. Comprueba tu conexión y reinténtalo.",
      notBlank: "Esta tarjeta no está vacía. Pide primero a su emisor que la restablezca.",
      ownCard:
        "Esta tarjeta ya está en « Tarjetas ». Para añadirla de nuevo, elimínala primero, con la tarjeta en mano.",
      notThisCard:
        "No es la tarjeta elegida, o se ha reprogramado en otro lugar. No se ha modificado nada: acerca la tarjeta correcta.",
      cardLost:
        "La tarjeta se alejó demasiado pronto. Acércala de nuevo y mantenla contra el teléfono hasta el final: la vinculación continuará donde se detuvo.",
      notBoltCard: "Esta tarjeta no es una BoltCard (NTAG 424 DNA).",
      verifyFailed:
        "La tarjeta se ha programado, pero su verificación ha fallado. Acércala de nuevo para reintentarlo.",
      versionsExhausted:
        "Esta tarjeta se ha programado demasiadas veces con este monedero. Usa otra tarjeta.",
      newerApp: "Una versión más reciente de la app guardó esta tarjeta. Actualiza la app.",
      walletNotEmpty:
        "El monedero de esta tarjeta no está vacío, o aún le están llegando sats. Retira primero su saldo a tu saldo principal: una tarjeta eliminada ya no aparece en ningún sitio, ni sus sats. Tu tarjeta no se ha modificado.",
      walletUnavailable:
        "El monedero de esta tarjeta no ha respondido: una tarjeta solo se elimina cuando se comprueba que su monedero está vacío. Comprueba tu conexión y reinténtalo. Tu tarjeta no se ha modificado.",
      cardGone:
        "Esta tarjeta ya no está en « Tarjetas »: se ha eliminado. No se ha modificado nada.",
      deletionPending:
        "Los relés de tu cuenta aún no han registrado la eliminación: la tarjeta no se ha vaciado.",
      migrationDrainFailed:
        "Esta vez no se ha podido transferir el saldo de esta tarjeta, y la tarjeta no se ha modificado: reinténtalo en un momento.",
      migrationOverDailyLimit:
        "Esta transferencia supera el límite de la tarjeta: 1.000 CHF cada 24 horas, incluidos sus gastos recientes. No se ha transferido nada y la tarjeta no se ha modificado: reinténtalo cuando su saldo esté por debajo de este límite, o contacta con el soporte.",
      migrationReceiptPending:
        "La transferencia se solicitó, pero no se pudo confirmar a tiempo su llegada a la nueva cartera. Puede que tus sats ya estén en camino: « Tarjetas » muestra la tarjeta y su cartera. La tarjeta no se ha modificado: espera un momento y reinténtalo.",
      migrationMasterKey:
        "No se ha podido recodificar la tarjeta: su clave maestra no es la esperada. Lo que ya se ha transferido está en su nueva cartera, que « Tarjetas » muestra. Reinténtalo; si el problema persiste, contacta con el soporte.",
      migrationNotWiped:
        "No se ha podido restablecer la tarjeta. Lo que ya se ha transferido está en su nueva cartera, que « Tarjetas » muestra. Reinténtalo; si el problema persiste, contacta con el soporte.",
      migrationCardDisabled:
        "Esta tarjeta está bloqueada en el servicio anterior: no se puede migrar. Si la bloqueaste tú, desbloquéala primero; si no, contacta con el soporte. No se ha modificado nada.",
      migrationPaymentPending:
        "Un pago de esta tarjeta sigue en curso en el servicio anterior, a menudo la transferencia que se acaba de hacer: todavía no se puede borrar. La tarjeta no se ha modificado: reinténtalo en un momento, la migración continuará donde se detuvo.",
      migrationServerUnreachable:
        "El intercambio con el servidor de Swiss Bitcoin Pay, el único que puede abrir esta tarjeta, no se ha completado. Comprueba tu conexión y mantén la tarjeta contra el teléfono, luego reinténtalo: la vinculación continuará donde se detuvo.",
      cancelled: "Vinculación cancelada.",
      failed: "La vinculación ha fallado. Reinténtalo."
    },
    nfcAlert: "Acerca tu BoltCard a la parte superior del teléfono y mantenla en su sitio.",
    nfcSuccess: "Tarjeta vinculada",
    nfcFailure: "Vinculación interrumpida",
    notificationChannel: "Pagos con tarjeta",
    decline: {
      newPayee:
        "Comercio nuevo: el titular debe aprobarlo en su app sattle.me y volver a presentar la tarjeta.",
      unidentifiedPayee:
        "Comercio no identificado: el titular debe confirmar el pago en su app sattle.me.",
      unconfirmed: "Pago pendiente de confirmación por el titular en su app sattle.me.",
      notConfirmed: "Pago no confirmado en el teléfono del titular.",
      refused: "Pago rechazado por el titular de la tarjeta.",
      insufficientBalance: "Saldo de la tarjeta insuficiente.",
      aboveLimit: "Importe superior al límite por pago de la tarjeta.",
      dayLimit: "Límite de 24 horas de la tarjeta alcanzado.",
      hourLimit: "Demasiados pagos con esta tarjeta en la última hora.",
      suspended: "Tarjeta en pausa: el titular puede reactivarla en su app sattle.me.",
      invalidInvoice: "Factura no válida para esta tarjeta.",
      expired: "Factura caducada: crea una nueva.",
      noAmount: "Factura sin importe: la tarjeta solo paga un importe fijo.",
      outOfBounds: "Importe fuera de los límites de la tarjeta (de 1 sat a 1 BTC).",
      alreadyPaid: "La tarjeta no paga esta factura: ya está liquidada.",
      invalidTap: "Lectura de la tarjeta no válida: vuelve a presentar la tarjeta.",
      sendFailed: "El pago no ha salido, no se ha pagado nada. Vuelve a presentar la tarjeta.",
      uncertain:
        "Pago interrumpido: aún puede llegar, espera unos segundos antes de volver a intentarlo.",
      updateApp: "El titular debe actualizar su app sattle.me.",
      superseded: "Una lectura más reciente de la tarjeta ha sustituido a esta.",
      other: "No se ha podido procesar el pago."
    },
    payment: {
      title: "Pago con tarjeta",
      close: "Cerrar",
      waiting: "Tarjeta leída, esperando la factura de la caja…",
      checking: "Comprobando el comercio…",
      delay: {
        minute: "en un minuto",
        seconds_one: "en {{count}} segundo",
        seconds_other: "en {{count}} segundos"
      },
      note: {
        newPayee: "Comercio nuevo: comprueba el importe y el nombre antes de pagar.",
        unidentifiedPayee:
          "La caja no ha demostrado quién recibe este pago: comprueba el importe con el comercio.",
        unconfirmed: "Comprueba el importe y el comercio."
      },
      pay: "Pagar {{amount}}",
      decline: "Rechazar",
      answerIn: "Responde en {{seconds}} s",
      timeOut: "Tiempo agotado",
      timeLabel: "Tiempo para responder",
      merchant: "Comercio",
      noteLabel: "Nota",
      card: "Tarjeta",
      exactAmount: "Importe exacto",
      approve: "Aprobar este comercio",
      approveCaption: "Sus próximos pagos saldrán sin confirmación",
      joined: "{{first}} · {{second}}",
      ofCard: "tarjeta {{name}}",
      confirming: "Confirma con tu passkey…",
      paying: "Enviando el pago…",
      payingAutomatically: "Enviando el pago, sin confirmación…",
      approved: "Este comercio forma parte ahora de tus comercios aprobados.",
      done: "Terminar",
      doneIn: "Terminar ({{seconds}} s)",
      failedTitle: "Pago no realizado",
      nothingPaid: "No se ha pagado nada.",
      result: {
        completedTitle: "Pago realizado",
        completedBody: "{{amount}} pagados con tu tarjeta.",
        completedBodyAutomatic: "{{amount}} pagados con tu tarjeta, sin confirmación.",
        pendingTitle: "Pago enviado",
        pendingBody:
          "El pago de {{amount}} ha salido. Su estado aparece en la lista de movimientos.",
        failedTitle: "Pago fallido",
        failedBody:
          "El pago de {{amount}} no se ha completado. Su estado aparece en la lista de movimientos.",
        declinedTitle: "Pago rechazado",
        declinedBody:
          "Has rechazado este pago de {{amount}}. No se ha pagado nada; la caja está informada."
      },
      failure: {
        unreachable:
          "El relé de la tarjeta no responde, o este pago ha caducado. No se ha pagado nada.",
        ended:
          "La caja ya no espera este pago. No se ha pagado nada: presenta de nuevo tu tarjeta si es necesario.",
        invalidInvoice:
          "La caja ha enviado una factura que tu monedero no puede pagar. No se ha pagado nada.",
        otherNetwork: "La factura de la caja es de otra red Bitcoin. No se ha pagado nada.",
        expired: "La factura de la caja ha caducado. No se ha pagado nada.",
        noAmount:
          "La factura de la caja no tiene un importe en sats enteros. No se ha pagado nada.",
        outOfBounds:
          "El importe está fuera de los límites de un pago con tarjeta. No se ha pagado nada.",
        suspended: "Esta tarjeta está en pausa. No se ha pagado nada.",
        alreadyPaid: "Esta factura ya se pagó. No se ha pagado nada de nuevo.",
        dayLimit: "Este pago superaría el límite de 24 horas de tu tarjeta. No se ha pagado nada.",
        hourLimit:
          "Tu tarjeta ha alcanzado su número de pagos para esta hora. No se ha pagado nada.",
        aboveLimit: "El importe supera el límite de tu tarjeta. No se ha pagado nada.",
        notYourCard: "Este pago no viene de un toque de tu tarjeta. No se ha pagado nada.",
        replayed: "Este toque de tu tarjeta ya se ha usado. No se ha pagado nada.",
        unlock: "El pago no se ha confirmado. No se ha pagado nada.",
        insufficientBalance:
          "El saldo de tu tarjeta no alcanza para este pago y su comisión. No se ha pagado nada: recarga la tarjeta en « Tarjetas ».",
        sendFailed:
          "Tu monedero no ha podido enviar este pago, por ejemplo por falta de saldo. No ha salido nada.",
        uncertain:
          "Tu monedero no ha confirmado el envío: puede que el pago haya salido. Revisa la lista de movimientos antes de pagar de otra forma.",
        newerApp:
          "Una versión más reciente de la aplicación ha guardado tu tarjeta. Actualiza la aplicación. No se ha pagado nada.",
        otherInvoice:
          "El servicio del comercio no reconoce esta factura: puede haber sido sustituida por el camino. No se ha pagado nada.",
        settled:
          "El servicio del comercio indica que esta factura ya está pagada. No se ha pagado nada de nuevo.",
        newPayee:
          "Sin confirmación {{delay}}: no se ha pagado nada. Se ha informado a la caja de que este comercio nuevo debe aprobarse en la app.",
        newPayeeHomonym: "Sin confirmación {{delay}}: no se ha pagado nada.",
        unidentifiedPayee:
          "Sin confirmación {{delay}}: no se ha pagado nada. Se ha informado a la caja de que el comercio no está identificado.",
        unconfirmed: "Sin confirmación {{delay}}: no se ha pagado nada. Se ha informado a la caja.",
        late: "El pago no ha podido salir {{delay}}. No se ha pagado nada.",
        failed: "Este pago no se ha podido procesar. No se ha pagado nada."
      }
    },
    payee: {
      quoted: "«{{name}}»",
      unnamed: "Nombre desconocido",
      node: "Nodo {{node}}",
      by: {
        address: "identificado por su dirección Lightning",
        node: "identificado por su nodo Lightning"
      },
      nodeWarning:
        "Este comercio se identifica por su nodo Lightning, no por su dirección. Si este nodo es compartido (Spark, Wallet of Satoshi, Strike…), aprobarlo aprueba también a todos sus demás usuarios: se les pagaría sin confirmación, dentro de los límites de la tarjeta.",
      formerName: "antes «{{name}}»",
      localName: "en tus comercios: «{{name}}»",
      homonym:
        "Mismo nombre que un comercio ya aprobado, pero cuenta distinta: compruébalo antes de pagar.",
      chip: {
        approved: "Aprobado el {{date}}",
        approvedUndated: "Aprobado",
        new: "Comercio nuevo",
        unidentified: "Comercio no identificado",
        unchecked: "No controlado (modo automático)"
      },
      declaredName: "{{name}}, nombre declarado por el comercio",
      declaredByNode: "{{name}}, nombre declarado por el nodo"
    },
    notice: {
      title: "Pago con tarjeta: {{amount}}",
      body: "{{amount}} para {{name}}",
      askTitle: "Pendiente: Pago con tarjeta",
      askBody: "{{amount}} para {{name}}. Haz clic para confirmar, la caja está esperando.",
      askBodyUnchecked: "{{amount}}. Haz clic para confirmar, la caja está esperando.",
      askBodyNoInvoice: "Haz clic para confirmar, la caja está esperando.",
      refusedTitle: "Rechazado: Pago con tarjeta ({{amount}} para {{name}})",
      refusedTitleUnchecked: "Rechazado: Pago con tarjeta ({{amount}})",
      refusedTitleNoInvoice: "Rechazado: Pago con tarjeta",
      pausedBody: "{{card}} está en pausa. No se ha pagado nada."
    }
  },
  cards: {
    title: "Tarjetas",
    locked: {
      title: "Tus tarjetas están bloqueadas",
      body: "Desbloquea la app con tu passkey para ver y gestionar tus tarjetas."
    },
    pairOnPhone:
      "Para vincular una tarjeta, abre la aplicación en tu teléfono: es él quien la programa, con la tarjeta acercada.",
    pairOnAndroid:
      "Para vincular una tarjeta, usa la app Android sattle.me: es ella quien la programa, con la tarjeta acercada al teléfono.",
    pairOnIphone:
      "Para vincular una tarjeta, usa la app iPhone sattle.me: es ella quien la programa, con la tarjeta acercada al teléfono.",
    shop: {
      order: "Pedir tarjetas",
      title: "Elige tu tarjeta",
      lead: "Varios diseños, para pedir en la tienda sattle.me."
    },
    loading: "Cargando tus tarjetas…",
    failed: {
      noAccount:
        "Tu sesión está cerrada. Desbloquea la aplicación con tu passkey y vuelve a intentarlo.",
      unreachable:
        "No se han podido leer tus tarjetas: los relés de tu cuenta no responden. Comprueba tu conexión y vuelve a intentarlo."
    },
    retry: "Reintentar",
    map: {
      title: "Dónde pagar con tu tarjeta",
      source: "Lightning sin contacto · BTC Map",
      desktopSubtitle: "Los comercios que aceptan pagos Lightning sin contacto · mapa de BTC Map",
      openSite: "Abrir btcmap.org",
      loading: "Cargando el mapa…",
      failedTitle: "El mapa no se ha cargado",
      failedBody:
        "BTC Map no responde, o el dispositivo no tiene conexión. Comprueba tu conexión y vuelve a intentarlo.",
      openInBrowser: "Abrir btcmap.org en el navegador",
      frameTitle: "Mapa de BTC Map de los comercios que aceptan pagos sin contacto"
    },
    unnamed: "Tarjeta {{id}}",
    carousel: "Tus tarjetas",
    slot: "Tarjeta {{n}} de {{count}}: {{label}}",
    add: "Añadir una tarjeta",
    cardOf: "Tarjeta {{name}}",
    order: {
      organize: "Organizar",
      organizeA11y: "Organizar las tarjetas",
      title: "Orden de las tarjetas",
      lead: "Mantén pulsada un asa y arrastra. La primera tarjeta aparece al abrir «Tarjetas», en todos tus dispositivos.",
      rowLead: "Arrastra una tarjeta a su sitio (o ← →). La primera aparece al abrir.",
      save: "Guardar",
      cancel: "Cancelar",
      close: "Cerrar",
      saved: "Orden de las tarjetas guardado",
      failedTitle: "Orden no guardado",
      unsaved:
        "Los relés de tu cuenta no respondieron: comprueba tu conexión y vuelve a intentarlo",
      newer: "Se eligió en una versión más reciente de la aplicación: actualízala para cambiarlo",
      moveUp: "Subir",
      moveDown: "Bajar",
      moveLeft: "Mover a la izquierda",
      moveRight: "Mover a la derecha",
      row: "{{label}}, {{n}} de {{count}}",
      moved: "{{label}}, ahora {{n}} de {{count}}",
      previous: "Tarjetas anteriores",
      next: "Tarjetas siguientes"
    },
    // "Add a card", in "Cards" and the sign-up (AddCardFlow.tsx).
    adding: {
      guide: {
        title: "Antes de empezar",
        subtitle: "Una BoltCard vacía. Una tarjeta de la antigua app se migra, con su saldo.",
        card: "Una BoltCard vacía",
        cardBody: "Una tarjeta de la antigua app se migra, con su saldo.",
        notifications: "Las notificaciones",
        notificationsBody:
          "Permítelas cuando el teléfono lo pida: es por ellas que sabe que una caja lee la tarjeta.",
        start: "Empezar"
      },
      web: {
        note: "Un ordenador no puede leer tarjetas NFC: una tarjeta se añade desde la aplicación, en tu teléfono, con la tarjeta en la mano.",
        noteDevice:
          "Este dispositivo no puede leer tarjetas NFC: una tarjeta se añade desde la aplicación, en tu teléfono, con la tarjeta en la mano.",
        noteAndroid:
          "Un navegador no puede programar una tarjeta: una tarjeta se añade desde la app Android sattle.me, con la tarjeta en la mano.",
        noteIphone:
          "Un navegador no puede programar una tarjeta: una tarjeta se añade desde la app iPhone sattle.me, con la tarjeta en la mano.",
        where: "Contra el teléfono",
        whereBody: "Mantén la tarjeta quieta hasta el final, unos segundos.",
        code: "Código QR que abre « Añadir una tarjeta » en la aplicación de tu teléfono",
        scan: "Escanea este código con tu teléfono: abre « Añadir una tarjeta » en la aplicación."
      },
      steps: {
        label: "Pasos para añadir la tarjeta",
        notifications: "Notificaciones permitidas",
        notificationsTodo: "Permiso de notificaciones",
        notificationsRunning: "Autorizando las notificaciones",
        notificationsFailed: "Notificaciones no permitidas",
        notificationsCaption: "Así tu teléfono sabe que una caja lee la tarjeta",
        relay: "Relé de la tarjeta accesible",
        relayTodo: "Comprobación del relé de la tarjeta",
        relayRunning: "Comprobando el relé de la tarjeta",
        relayFailed: "Relé de la tarjeta no comprobado",
        card: "Tarjeta acercada",
        cardTodo: "Acercamiento de la tarjeta",
        cardRunning: "Esperando la tarjeta",
        cardFailed: "Tarjeta no reconocida",
        cardIos: "Encima del teléfono, hasta la confirmación",
        cardAndroid: "Contra la parte trasera del teléfono, hasta la vibración",
        programming: "Tarjeta programada",
        programmingTodo: "Programación de la tarjeta",
        programmingRunning: "Programando la tarjeta",
        programmingFailed: "Tarjeta no programada",
        programmingCaption: "No muevas la tarjeta",
        activating: "Tarjeta activada",
        activatingTodo: "Activación de la tarjeta",
        activatingRunning: "Activando la tarjeta",
        activatingFailed: "Tarjeta no activada",
        activatingPending: "Activación por terminar",
        activatingCaption: "El relé registra este teléfono",
        prepTitle: "Preparando…",
        prepSubtitle: "Dos comprobaciones antes de la tarjeta",
        holdIos: "Mantén la tarjeta encima del teléfono",
        holdAndroid: "Mantén la tarjeta contra la parte trasera del teléfono",
        holdSubtitle: "Una BoltCard vacía",
        keepTitle: "Mantén la tarjeta quieta",
        keepSubtitle: "Programación para tu cartera",
        almostTitle: "Casi listo",
        almostSubtitle: "Puedes alejar la tarjeta",
        doneTitle: "Tarjeta añadida",
        doneSubtitle: "Recárgala para usarla",
        failedTitle: "No se ha podido añadir la tarjeta",
        failedNothing: "No se ha escrito nada en la tarjeta",
        failedGoesOn: "Continuará donde se detuvo",
        notificationsDenied: "Notificaciones rechazadas",
        notificationsDeniedCaption: "Permítelas en los ajustes del teléfono y vuelve a intentarlo.",
        nfcUnavailable: "NFC no disponible",
        lost: "Tarjeta alejada demasiado pronto",
        lostIos:
          "Acércala de nuevo y mantenla quieta hasta la confirmación: añadirla continuará donde se detuvo.",
        lostAndroid:
          "Acércala de nuevo y mantenla quieta hasta la vibración: añadirla continuará donde se detuvo.",
        relayUnreachable: "Relé inaccesible",
        relayUnreachableCaption:
          "{{host}} no responde: comprueba la conexión de este teléfono y vuelve a intentarlo",
        relayIncompatible: "Relé incompatible",
        relayIncompatibleCaption:
          "{{host}} no habla la versión esperada: actualiza la app y vuelve a intentarlo",
        recordsUnreachable: "Relés de la cuenta inaccesibles",
        recordsUnreachableCaption:
          "Responden muy pocos relés de tu cuenta: comprueba la conexión de este teléfono y vuelve a intentarlo",
        notBlank: "Tarjeta no vacía",
        notBoltCard: "Tarjeta no compatible",
        notBoltCardCaption:
          "Esta tarjeta no es una BoltCard (NTAG 424 DNA): acerca una BoltCard vacía",
        ownCard: "Tarjeta ya añadida",
        verifyFailed: "Comprobación fallida",
        cancelled: "Lectura de la tarjeta cancelada",
        failed: "No se ha podido añadir la tarjeta: vuelve a intentarlo",
        recharge: "Recargar la tarjeta",
        later: "Más tarde",
        cancel: "Cancelar",
        stateTodo: ": pendiente",
        stateRunning: ": en curso",
        stateDone: ": hecho",
        stateFailed: ": fallido",
        stateWarning: ": por revisar"
      },
      migration: {
        heading: "Migración de la tarjeta",
        foundTitle: "Tarjeta Swiss Bitcoin Pay detectada",
        toTransfer: "Saldo a transferir",
        reading: "Leyendo el saldo…",
        amountA11y: "{{amount}} sats",
        whatLabel: "Lo que va a pasar",
        whatTransfer: "Su saldo se transfiere a la cartera de la tarjeta, en tu app.",
        whatErase:
          "Acercas la tarjeta una segunda vez: se borra y luego se programa para tu cartera.",
        whatVisual: "Conserva su diseño y su número.",
        confirm: "Transferir y migrar",
        label: "Pasos de la migración",
        transferred: "Saldo transferido",
        transferTodo: "Transferencia del saldo",
        transferRunning: "Transfiriendo el saldo",
        recognized: "Tarjeta reconocida",
        recognizedTodo: "Reconocimiento de la tarjeta",
        recognizedRunning: "Reconociendo la tarjeta",
        recognizedFailed: "Tarjeta no reconocida",
        recognizedCaption: "Su cartera conserva lo que ya ha transferido",
        nothingCaption: "Ningún saldo que transferir",
        receivedCaption: "{{amount}} recibidos",
        sendingCaption: "{{amount}} en camino",
        heldSecond: "Tarjeta acercada una segunda vez",
        heldSecondTodo: "Acercamiento de la tarjeta una segunda vez",
        heldAgain: "Tarjeta acercada una vez más",
        heldAgainTodo: "Acercamiento de la tarjeta una vez más",
        programmed: "Tarjeta borrada y programada",
        programmedTodo: "Borrado y programación de la tarjeta",
        programmedRunning: "Borrando y programando la tarjeta",
        activated: "Tarjeta activada",
        doneTitle: "Tarjeta migrada",
        doneSubtitle: "Ahora paga desde su propia cartera, dentro de sus límites.",
        doneSubtitleVisual:
          "Conserva su diseño y su número, y ahora paga desde su propia cartera, dentro de sus límites.",
        failedTitle: "La migración no se ha completado",
        failedGoesOn: "Continuará donde se detuvo",
        failed: "La migración ha fallado: vuelve a intentarlo",
        notTransferred: "Saldo no transferido",
        transferUnconfirmed: "Transferencia no confirmada",
        lostIos:
          "Acércala de nuevo y mantenla quieta hasta la confirmación: la migración continuará donde se detuvo.",
        lostAndroid:
          "Acércala de nuevo y mantenla quieta hasta la vibración: la migración continuará donde se detuvo.",
        transferTitle: "Transfiriendo el saldo",
        transferSubtitle: "{{amount}} van a la cartera de la tarjeta. Ten la tarjeta a mano.",
        keepTitle: "Mantén la tarjeta quieta",
        keepSubtitle: "Borrado y programación: no la muevas.",
        almostTitle: "Casi listo",
        almostSubtitle: "Puedes alejar la tarjeta.",
        holdSecond: "Acerca la tarjeta una segunda vez",
        holdAgain: "Acerca la tarjeta una vez más",
        holdSubtitleIos:
          "Encima del teléfono, hasta la confirmación: se va a borrar y luego programar.",
        holdSubtitleAndroid:
          "Contra la parte trasera del teléfono, hasta la vibración: se va a borrar y luego programar.",
        finish: "Terminar"
      }
    },
    // "Cards", the screen.
    home: {
      firstCard: "Añade tu primera tarjeta",
      newCard: "Nueva tarjeta",
      addLead:
        "Una BoltCard virgen paga desde su propio monedero de autocustodia, que recargas aquí.",
      steps: {
        program: {
          title: "Prográmala",
          caption: "Acerca la tarjeta virgen a tu teléfono: es él quien la programa."
        },
        recharge: {
          title: "Recárgala",
          caption: "Tiene su propio monedero: envíale los sats que podrá gastar."
        },
        pay: {
          title: "Paga con un gesto",
          caption: "Acércala al terminal de un comercio: paga, dentro de los límites que elijas."
        }
      },
      reading: "Leyendo el saldo…",
      received: "{{amount}} recibidos",
      balanceA11y: "Saldo de la tarjeta: {{amount}} sats",
      withdraw: "Retirar",
      withdrawA11y: "Retirar de la tarjeta",
      history: "Historial",
      rechargeA11y: "Recargar la tarjeta",
      historyCaption: "Todos los movimientos de la tarjeta",
      withdrawEmpty: "Nada que retirar",
      sendCaption: "A otro monedero",
      sendCaptionMain: "A otro monedero o a mi saldo principal",
      migratingNote:
        "La migración de esta tarjeta no ha terminado: todavía no paga. Lo que ya ha transferido está en su monedero, abajo.",
      finishMigration: "Terminar la migración",
      finishOnPhone: "Termínala en la aplicación de tu teléfono, con la tarjeta acercada.",
      security: "Seguridad",
      pause: "Pausar",
      pauseCaption: "Rechaza todo pago, sin olvidar nada. El interruptor la vuelve a activar.",
      limits: "Límites",
      payees: "Pagos sin confirmación",
      payeesReading: "Leyendo…",
      payeesPending: "aún no en los relés",
      payeesUnread: "Aún sin leer",
      payeesNewer: "Actualiza la app",
      card: "Tarjeta",
      customize: "Personalizar",
      customizeCaption: "Nombre y aspecto",
      customizeIssuer: "Nombre · diseño del emisor",
      relay: "Relé y programación",
      advanced: "Ajustes avanzados",
      advancedRelayReady: "Relé listo",
      delete: "Eliminar la tarjeta",
      deleteCaption: "La tarjeta y todos sus datos desaparecen de la aplicación",
      deleteUnread: "Primero hay que leer su saldo"
    },
    // "Limits".
    limits: {
      edit: "Modificar",
      back: "Volver a los límites",
      reading: "Leyendo los pagos…",
      unread: "Los relés de tu cuenta no respondieron: no se muestra lo que la tarjeta ya pagó.",
      unreadPhone:
        "No se pudieron leer los pagos de este teléfono: no se muestra lo que la tarjeta ya pagó.",
      notePhone:
        "Según los pagos hechos por este teléfono. Las ventanas se deslizan: cada pago se libera 24 h (o 1 h) después.",
      noteWeb:
        "Según los pagos de la tarjeta que guardan los relés de tu cuenta. Las ventanas se deslizan: cada pago se libera 24 h (o 1 h) después.",
      at: "a las {{time}}",
      tomorrowAt: "mañana a las {{time}}",
      on: "el {{date}}",
      confirm: "Confirmar con mi passkey",
      fiatHint: "Es decir {{fiat}} al tipo actual · {{max}} sats como máximo",
      satsHint: "{{max}} sats como máximo",
      countHint: "{{max}} como máximo",
      preview: {
        reached: "Límite alcanzado",
        hourLeft_one: "Queda {{count}} pago",
        hourLeft_other: "Quedan {{count}} pagos",
        hourNext: "Próximo pago posible {{when}}"
      },
      day: {
        title: "En 24 horas",
        of: "de {{max}} sats",
        limit: "Límite: {{max}} sats",
        left: "Quedan {{amount}} sats, es decir {{fiat}}",
        leftSats: "Quedan {{amount}} sats",
        reached: "Límite alcanzado: la tarjeta rechaza todo pago",
        release: "{{amount}} sats se liberan {{when}}",
        lead: "Un pago que, con los de las últimas 24 horas, superara este límite se rechaza.",
        used: "Ya usado: {{amount}} sats.",
        field: "Límite en 24 horas",
        belowUsed:
          "Ya has usado {{amount}} sats: la tarjeta rechazará todo pago hasta que la ventana se libere.",
        belowPayment:
          "Inferior al límite por pago ({{amount}} sats): será este límite de 24 h el que limite cada pago."
      },
      hour: {
        title: "Esta hora",
        of_one: "pago de {{max}}",
        of_other: "pagos de {{max}}",
        limit_one: "Límite: {{count}} pago por hora",
        limit_other: "Límite: {{count}} pagos por hora",
        release: "El pago de las {{paid}} se libera {{when}}",
        reached: "Límite alcanzado: próximo pago posible {{when}}",
        formTitle: "Pagos por hora",
        lead: "Un pago que, con los de la última hora, superara este número se rechaza.",
        used_one: "Ya esta hora: {{count}} pago.",
        used_other: "Ya esta hora: {{count}} pagos.",
        field: "Pagos por hora",
        belowUsed_one:
          "Ya has hecho {{count}} pago esta hora: la tarjeta rechazará todo pago hasta que la ventana se libere.",
        belowUsed_other:
          "Ya has hecho {{count}} pagos esta hora: la tarjeta rechazará todo pago hasta que la ventana se libere."
      },
      payment: {
        title: "Por pago",
        caption: "Un pago más alto se rechaza",
        lead: "Un pago superior a este límite se rechaza.",
        field: "Límite por pago",
        aboveDay:
          "Superior al límite en 24 horas ({{amount}} sats): será el límite de 24 h el que limite cada pago."
      }
    },
    // "Customize": a card's "Name" and "Look".
    customize: {
      title: "Personalizar la tarjeta",
      name: "Nombre",
      clear: "Borrar el nombre",
      taken:
        "Otra de tus tarjetas ya se llama {{name}}. Un nombre distinto las diferencia al pagar.",
      look: "Apariencia",
      lookKind: "Tipo de apariencia",
      color: "Color",
      image: "Imagen",
      // Read by screen readers only.
      colors: {
        ink: "Tinta",
        night: "Noche",
        plum: "Ciruela",
        bordeaux: "Burdeos",
        fir: "Abeto",
        lagoon: "Laguna",
        copper: "Cobre",
        bitcoin: "Bitcoin"
      },
      choosePhoto: "Elegir una foto",
      chooseImage: "Elegir una imagen",
      takePhoto: "Hacer una foto",
      imageNote: "Después la encuadrarás al formato de la tarjeta. Sustituirá el color.",
      errors: {
        photoDenied:
          "Permite el acceso a tus fotos en los ajustes del dispositivo y vuelve a intentarlo.",
        cameraDenied:
          "La cámara no se abre. Permítela en los ajustes del dispositivo y vuelve a intentarlo.",
        unreadable: "Esta imagen no se puede usar. Elige otra.",
        imageUnpublished:
          "No se pudo guardar la imagen en los relés de tu cuenta. Comprueba la conexión y vuelve a intentarlo.",
        failed: "No se pudo modificar la tarjeta. Vuelve a intentarlo."
      }
    },
    // "Frame the image".
    frame: {
      title: "Encuadrar la imagen",
      hint: "Arrastra para mover, pellizca o usa los botones para hacer zoom.",
      hintWeb: "Arrastra la imagen para moverla; la rueda o los botones hacen zoom.",
      area: "Imagen que encuadrar",
      zoomValue: "Zoom {{zoom}}",
      zoomIn: "Acercar",
      zoomOut: "Alejar",
      moveLeft: "Mover la imagen a la izquierda",
      moveRight: "Mover la imagen a la derecha",
      moveUp: "Mover la imagen hacia arriba",
      moveDown: "Mover la imagen hacia abajo",
      use: "Usar esta imagen"
    },
    status: {
      active: "Activa",
      suspended: "En pausa",
      migrating: "Migración por terminar"
    },
    sync: {
      ready: "Lista",
      noPush: "Sin notificaciones",
      unreachable: "Relé inalcanzable",
      refused: "Error del relé"
    },
    onPhone: {
      label: "En tu teléfono",
      openApp: "Abre sattle.me en tu teléfono",
      openAppScan: "O escanea este código con él: abre « Tarjetas » en la aplicación.",
      hold: "Acerca la tarjeta al teléfono",
      code: "Código QR que abre « Tarjetas » en la aplicación de tu teléfono"
    },
    relay: {
      checking: "Comprobando la tarjeta…",
      readyTitle: "La tarjeta está lista",
      readyBody:
        "Su relé, {{host}}, despierta este teléfono en cada pago. No tiene ni claves ni fondos.",
      stateTitle: "Estado de la tarjeta",
      reachable: "Relé accesible",
      defaultCaption: "{{host}}, relé por defecto",
      programmed: "Tarjeta programada para este relé",
      programmedCaption: "Allí se esperan sus próximos toques",
      notWoken: "Este teléfono no se despierta",
      notWokenCaption:
        "Notificaciones desactivadas: la tarjeta solo paga cuando la app está abierta en este teléfono.",
      noTokenCaption:
        "Este teléfono no recibe las notificaciones de pago: la tarjeta solo paga cuando la app está abierta en este teléfono.",
      enableNotifications: "Activar las notificaciones",
      unreachable: "Relé inaccesible",
      unreachableCaption:
        "{{host}} no ha respondido a este teléfono: la tarjeta no puede pagar mientras no responda.",
      refused: "Error del relé",
      refusedCaption:
        "{{host}} ha rechazado el canal de la tarjeta: no puede pagar mientras lo rechace.",
      uncheckedTitle: "Estado no comprobado",
      uncheckedCaption:
        "No se ha podido leer el estado de la tarjeta en este teléfono. Vuelve a intentarlo en un momento.",
      change: "Cambiar de relé",
      changeCaption: "Para un relé que alojas tú mismo",
      sourceLink: "sattleme/relay en github.com",
      webCaption: "Despierta tu teléfono en cada pago de la tarjeta, sin tener claves ni fondos.",
      webNote:
        "Un ordenador no puede leer tarjetas NFC: la tarjeta se programa desde la aplicación, en un teléfono.",
      webNoteAndroid:
        "Un navegador no puede programar una tarjeta: se programa desde la app Android sattle.me.",
      webNoteIphone:
        "Un navegador no puede programar una tarjeta: se programa desde la app iPhone sattle.me.",
      deviceNote:
        "Este dispositivo no puede leer tarjetas NFC: la tarjeta se programa desde la aplicación, en un teléfono.",
      webOnPhone: "En el teléfono",
      webStepsTitle: "En tu teléfono, con la tarjeta en la mano",
      webHoldCaption: "Cuando la aplicación te la pida, hasta el final de los pasos.",
      defaultLink: "Relé por defecto",
      fieldInvalid: "Introduce una dirección completa",
      fieldLong: "Introduce una dirección de {{max}} caracteres como máximo",
      fieldUnreachable: "Relé inaccesible: comprueba la dirección",
      fieldIncompatible: "Relé no compatible con esta tarjeta",
      moved: "Ahora la tarjeta pasa por {{host}}",
      steps: {
        label: "Pasos del cambio de relé",
        relay: "Nuevo relé accesible",
        relayTodo: "Comprobación del nuevo relé",
        relayRunning: "Comprobando el nuevo relé",
        relayFailed: "Nuevo relé no comprobado",
        relayCaption: "{{host}}, versión esperada",
        card: "Tarjeta acercada",
        cardTodo: "Acercamiento de la tarjeta",
        cardRunning: "Esperando la tarjeta",
        cardFailed: "Tarjeta no reconocida",
        cardAndroid: "Contra la parte trasera del teléfono, hasta la vibración",
        cardIos: "Encima del teléfono, hasta la confirmación",
        programming: "Programada para este relé",
        programmingTodo: "Programación para este relé",
        programmingRunning: "Programándose para este relé",
        programmingFailed: "No programada para este relé",
        programmingCaption: "No muevas la tarjeta",
        former: "Relé anterior olvidado",
        formerTodo: "Relé anterior por olvidar",
        formerRunning: "Olvidando el relé anterior",
        formerFailed: "Relé anterior no olvidado",
        formerCaption: "{{relay}} ya no recibe sus toques",
        formerDown: "Relé anterior inaccesible",
        formerDownCaption: "{{relay}} no ha respondido: su canal sigue allí, sin efecto",
        formerRefused: "Relé anterior con error",
        formerRefusedCaption: "{{relay}} se ha negado a olvidar su canal: sigue allí, sin efecto",
        formerUnknown: "Relé anterior por comprobar",
        formerUnknownCaption:
          "{{relay}} ha respondido sin confirmarlo: quizá su canal siga allí, sin efecto",
        lost: "Tarjeta alejada demasiado pronto",
        lostAndroid:
          "Acércala de nuevo y mantenla quieta hasta la vibración: el cambio continuará donde se detuvo.",
        lostIos:
          "Acércala de nuevo y mantenla quieta hasta la confirmación: el cambio continuará donde se detuvo.",
        holdAndroid: "Mantén {{name}} contra la parte trasera del teléfono",
        holdIos: "Mantén {{name}} encima del teléfono",
        holdSubtitle: "Pasará por {{host}}",
        keepTitle: "Mantén la tarjeta quieta",
        keepSubtitle: "Programación para el nuevo relé",
        almostTitle: "Casi listo",
        almostSubtitle: "Puedes alejar la tarjeta",
        doneTitle: "La tarjeta pasa por {{host}}",
        doneSubtitle: "Conserva su nombre, su saldo y sus ajustes",
        failedTitle: "El cambio no se ha completado",
        failedNothing: "No se ha escrito nada en esta tarjeta",
        failedGoesOn: "Continuará donde se detuvo",
        checkingTitle: "Comprobando el nuevo relé",
        relayUnreachable:
          "{{host}} no responde: comprueba la conexión de este teléfono y vuelve a intentarlo",
        relayIncompatible: "{{host}} no habla la versión esperada",
        recordsUnreachable:
          "Responden muy pocos relés de tu cuenta: comprueba la conexión de este teléfono y vuelve a intentarlo",
        cancelled: "Lectura de la tarjeta cancelada",
        failed: "El cambio ha fallado: vuelve a intentarlo",
        resetNotice:
          "Mientras el cambio no se complete, la tarjeta ya no paga y ya no aparece en « Tarjetas ». Con « Añadir una tarjeta », vuelve en el relé por defecto, con su saldo, su nombre y sus límites.",
        finish: "Terminar",
        cancel: "Cancelar",
        stateTodo: ": pendiente",
        stateRunning: ": en curso",
        stateDone: ": hecho",
        stateFailed: ": fallido",
        stateWarning: ": por revisar"
      }
    },
    history: {
      title: "Historial",
      subtitle: "Tarjeta {{name}}",
      reading: "Leyendo el historial…",
      failed: "Los relés de tu cuenta no han respondido: el historial no se puede mostrar.",
      legacyUnread:
        "No todos los relés de tu cuenta han respondido: pueden faltar movimientos antiguos de la tarjeta.",
      ownOnly:
        "Los relés de tu cuenta no han respondido: pueden faltar los pagos hechos por tus otros teléfonos.",
      walletFailed:
        "No se ha podido leer el monedero de la tarjeta: pueden faltar sus últimas recargas y retiros.",
      newer: "Algunos movimientos solo se muestran con una versión más reciente de la app.",
      empty: "Ningún movimiento para esta tarjeta.",
      pendingGroup: "En curso",
      deposit: "Depósito Bitcoin",
      depositConfirming: "Recibido · a la espera de confirmación",
      depositClaiming: "Confirmado · añadiéndose al saldo",
      depositFees: "A la espera de comisiones más bajas: {{asked}} pedidos, {{max}} como máximo",
      depositFeesUnknown: "A la espera de comisiones más bajas: {{max}} sats como máximo",
      at: "{{time}} · {{what}}",
      paid: "Pagado",
      refused: "Rechazado: {{reason}}",
      refusedPlain: "Rechazado",
      failedRow: "Fallido: no salió nada",
      uncertain: "Incierto: quizá salió",
      sending: "Enviándose",
      noName: "Pago con tarjeta",
      recharge: "Recarga",
      recovered: "Fondos recuperados",
      return: "Retiro",
      toMain: "A mi saldo principal",
      ways: {
        main: "Desde mi saldo principal",
        invoice: "Factura Lightning",
        address: "Dirección Lightning",
        onchain: "Dirección Bitcoin",
        onchainFee: "Dirección Bitcoin, comisión {{fee}}",
        lnurl: "Enlace LNURL",
        spark: "Dirección Spark"
      },
      means: {
        main: "Mi saldo principal",
        invoice: "Factura Lightning",
        address: "Dirección Lightning",
        onchain: "Dirección Bitcoin",
        lnurl: "Enlace LNURL",
        spark: "Dirección Spark"
      },
      showMonth: "Mostrar {{month}}",
      showMonthAll: "Mostrar todo {{month}}",
      monthFailed: "No se ha podido leer este mes: los relés de tu cuenta no han respondido.",
      monthIncomplete: "No se ha podido leer una parte de los meses mostrados.",
      legacy: {
        pinNeeded:
          "El historial de esta tarjeta en Swiss Bitcoin Pay está protegido por el PIN que le diste. Introdúcelo para añadirlo aquí.",
        open: "Recuperar el historial",
        failed: "No se ha podido recuperar el historial de esta tarjeta en Swiss Bitcoin Pay.",
        title: "Historial de Swiss Bitcoin Pay",
        lead: "Introduce el PIN que le diste a esta tarjeta en Swiss Bitcoin Pay: su historial se añade al de la tarjeta.",
        pin: "PIN",
        submit: "Recuperar",
        note: "Solo sirve una vez, para leer el historial de la tarjeta en Swiss Bitcoin Pay: sattle.me no lo guarda.",
        errors: {
          pinInvalid: "PIN incorrecto",
          pinLocked:
            "Demasiados intentos: Swiss Bitcoin Pay rechaza este PIN durante un tiempo. Vuelve a intentarlo más tarde.",
          failed:
            "No se ha podido recuperar el historial. Comprueba tu conexión y vuelve a intentarlo."
        }
      },
      reasons: {
        declined: "no confirmado en el teléfono",
        newPayee: "comercio nuevo no confirmado",
        unidentifiedPayee: "comercio no identificado, no confirmado",
        unconfirmed: "no confirmado a tiempo",
        insufficientBalance: "saldo de la tarjeta insuficiente",
        invalidInvoice: "factura no válida",
        expired: "factura caducada",
        noAmount: "factura sin importe",
        alreadyPaid: "factura ya pagada",
        outOfBounds: "importe fuera de los límites",
        aboveLimit: "por encima del límite por pago",
        dayLimit: "límite de 24 horas alcanzado",
        hourLimit: "demasiados pagos en esta hora",
        suspended: "tarjeta en pausa",
        invalidTap: "lectura de la tarjeta no válida",
        failed: "pago fallido",
        superseded: "sustituido por otra lectura",
        unavailable: "pago no procesado"
      },
      motives: {
        declined: "No confirmado en el teléfono",
        newPayee: "Comercio nuevo, no confirmado a tiempo",
        unidentifiedPayee: "Comercio no identificado, no confirmado a tiempo",
        unconfirmed: "No confirmado a tiempo",
        insufficientBalance: "Saldo de la tarjeta insuficiente",
        invalidInvoice: "Factura no válida",
        expired: "Factura caducada",
        noAmount: "Factura sin importe",
        alreadyPaid: "Factura ya pagada",
        outOfBounds: "Importe fuera de los límites",
        aboveLimit: "Por encima del límite por pago",
        dayLimit: "Límite de 24 horas alcanzado",
        hourLimit: "Demasiados pagos en esta hora",
        suspended: "Tarjeta en pausa",
        invalidTap: "Lectura de la tarjeta no válida",
        failed: "El monedero de la tarjeta no lo envió",
        superseded: "Sustituido por otra lectura de la tarjeta",
        unavailable: "No se ha podido procesar el pago"
      },
      detail: {
        payment: "Pago",
        refused: "Pago rechazado",
        failed: "Pago fallido",
        paid: "Pagado",
        paidWith: "Pagado · {{payee}}",
        merchant: "Comercio",
        payee: {
          approved: "comercio aprobado",
          new: "comercio nuevo",
          unidentified: "comercio no identificado",
          unchecked: "no controlado (modo automático)"
        },
        refusedPill: "Rechazado · no salió nada",
        failedPill: "Fallido · no salió nada",
        uncertainPill: "Incierto · quizá salió",
        sendingPill: "Enviándose",
        refusedMotive: "Rechazado",
        failedMotive: "El monedero de la tarjeta no lo envió",
        date: "Fecha",
        value: "Valor",
        valueThen: "En el momento de la transacción: {{fiat}}",
        valueNow: "Ahora: {{fiat}}",
        valueNowReading: "Ahora: leyendo el cambio",
        valueNowUnknown: "Ahora: cambio no disponible",
        note: "Nota",
        motive: "Motivo",
        fees: "Comisión",
        noFee: "Ninguna",
        feeDeducted: "{{fee}}, descontados",
        way: "Tipo de pago",
        to: "A",
        mainBalance: "Mi saldo principal",
        received: "Recibido",
        description: "Descripción",
        transaction: "Transacción",
        copyTx: "Copiar el identificador de la transacción",
        txCopied: "Identificador de la transacción copiado",
        openTx: "Ver la transacción en {{explorer}}",
        approve: "Aprobar este comercio",
        approveNote:
          "Se te pedirá tu passkey. Sus próximos pagos pasarán sin confirmación, dentro de los límites de la tarjeta.",
        approved: "Comercio aprobado para esta tarjeta",
        approvedNote:
          "Comercio aprobado: sus próximos pagos pasarán sin confirmación, dentro de los límites de la tarjeta.",
        approveFailed: "No se ha podido aprobar el comercio. Vuelve a intentarlo.",
        homonym:
          "Mismo nombre que un comercio ya aprobado, pero cuenta distinta: solo puede aprobarse al confirmar un pago en él, tras comprobarlo allí mismo."
      }
    },
    sheet: {
      close: "Cerrar",
      nameInvalid: "Una línea de {{max}} caracteres como máximo.",
      save: "Guardar",
      ceilingInvalid: "Un número entero de sats, de 1 a {{max}}.",
      hourInvalid: "Un número entero, de 1 a {{max}}.",
      relayHint:
        "El relé despierta tu teléfono cuando una caja lee la tarjeta; no tiene ni claves ni fondos. La tarjeta se reprogramará: tenla a mano.",
      relayField: "Dirección del relé",
      relayPlaceholder: "rele.example.com",
      program: "Programar la tarjeta",
      back: "Volver",
      done: "Terminado",
      failedTitle: "La operación no se ha completado",
      changeFailed: "No se ha podido guardar el cambio. Inténtalo de nuevo.",
      nfcSuccess: "Tarjeta lista",
      nfcFailure: "Operación interrumpida"
    },
    delete: {
      card: {
        drainBody:
          "Todavía contiene <strong>{{amount}}</strong>. Vacíala hacia una dirección lightning, bitcoin o Spark antes de eliminarla.",
        drainBodyArriving:
          "Todavía contiene <strong>{{amount}}</strong>, y <strong>{{arriving}}</strong> están llegando a una dirección Bitcoin. Vacíala, y de nuevo una vez añadidos estos <strong>{{arriving}}</strong>.",
        drainBodyArrivingOnly:
          "<strong>{{arriving}}</strong> están llegando a una dirección Bitcoin de esta tarjeta. Vacíala una vez añadidos estos sats, antes de eliminarla."
      },
      drainTitle: "Vacía primero <accent>{{name}}</accent>",
      drainBody:
        "Todavía contiene <strong>{{amount}}</strong>. Retíralos a tu saldo principal antes de eliminarla.",
      drainBodyArriving:
        "Todavía contiene <strong>{{amount}}</strong>, y <strong>{{arriving}}</strong> están llegando a una dirección Bitcoin. Retira su saldo a tu saldo principal, y luego estos <strong>{{arriving}}</strong> una vez añadidos.",
      drainBodyArrivingOnly:
        "<strong>{{arriving}}</strong> están llegando a una dirección Bitcoin de esta tarjeta. Retíralos a tu saldo principal una vez añadidos, antes de eliminarla.",
      drainConfirm: "Retirar",
      title: "Eliminar {{name}}",
      gone: "Borrado para siempre",
      goneSettings: "Su nombre y sus ajustes, comercios aprobados incluidos",
      goneHistory: "Su historial",
      goneAddress: "Su dirección Lightning",
      inHand: "Tengo la tarjeta conmigo",
      inHandCaption: "Acercada al teléfono, vuelve a quedar vacía",
      confirm: "Eliminar la tarjeta",
      withoutTitle: "¿Eliminar {{name}} sin ella?",
      withoutBody:
        "Sus datos se borran y nunca podrá volver a pagar. Si la encuentras, « Añadir una tarjeta » la dejará vacía.",
      withoutConfirm: "Eliminar",
      cardLabel: "La tarjeta",
      withCard: "La tengo conmigo",
      withCardCaption: "Vuelve a quedar vacía",
      withoutCard: "No la tengo",
      withoutCardCaption: "Nunca volverá a pagar",
      withoutNote:
        "Si la encuentras, « Añadir una tarjeta », en la aplicación de tu teléfono, la dejará vacía.",
      webUnder: "« {{inHand}} » sigue marcado.",
      webHoldCaption: "Cuando la aplicación te la pida.",
      understood: "Entendido",
      deleting: "Eliminando…",
      failedTitle: "La eliminación no se ha completado",
      failedBody: "Reinténtalo; si el problema persiste, contacta con el soporte.",
      done: "{{name}} se ha eliminado",
      pendingCaption:
        "Los relés de tu cuenta aún no han registrado su eliminación: terminará en la próxima sincronización",
      steps: {
        screen: "Eliminar la tarjeta",
        label: "Pasos de la eliminación",
        prepTitle: "Preparando…",
        prepSubtitle: "Comprobando el saldo de la tarjeta",
        holdAndroid: "Mantén {{name}} contra la parte trasera del teléfono",
        holdIos: "Mantén {{name}} encima del teléfono",
        holdSubtitle: "Vuelve a quedar vacía, y luego se borran sus datos",
        keepTitle: "Mantén la tarjeta quieta",
        keepSubtitle: "Vuelve a quedar vacía",
        almostTitle: "Casi listo",
        almostSubtitle: "Puedes alejar la tarjeta",
        doneSubtitle: "La tarjeta está vacía: regálala, o añádela como nueva",
        notThisTitle: "No es {{name}}",
        notThisSubtitle: "No se ha modificado nada en la tarjeta acercada",
        notThisCaption:
          "O se ha vuelto a programar en otro lugar. No se ha modificado nada: acerca la tarjeta correcta.",
        failedNothing: "No se ha modificado nada en la tarjeta",
        failedGoesOn: "Ya no paga: « Reintentar » termina la eliminación",
        emptied: "Saldo retirado",
        emptiedTodo: "Comprobación del saldo",
        emptiedRunning: "Comprobando el saldo",
        emptiedFailed: "Saldo no retirado",
        emptiedCaption: "La tarjeta está vacía",
        unchecked: "Saldo no comprobado",
        uncheckedCaption:
          "Su eliminación ya estaba registrada: los sats recibidos desde entonces siguen visibles en « Tarjetas »",
        held: "Tarjeta acercada",
        heldTodo: "Acercamiento de la tarjeta",
        heldRunning: "Esperando la tarjeta",
        heldFailed: "Tarjeta no reconocida",
        heldAndroid: "Contra la parte trasera del teléfono, hasta la vibración",
        heldIos: "Encima del teléfono, hasta la confirmación",
        blank: "Tarjeta vaciada",
        blankTodo: "Vaciado de la tarjeta",
        blankRunning: "Vaciando la tarjeta",
        blankFailed: "Tarjeta no vaciada",
        blankCaption: "No muevas la tarjeta",
        erased: "Datos borrados",
        erasedTodo: "Borrado de los datos",
        erasedRunning: "Borrando los datos",
        erasedFailed: "Datos no borrados",
        erasedCaption: "Su nombre, sus ajustes, su historial, su dirección Lightning",
        erasedLater: "Borrado por terminar",
        erasedLaterCaption:
          "No todos los relés de tu cuenta han respondido: el borrado continuará en la próxima sincronización",
        lost: "Tarjeta alejada demasiado pronto",
        lostAndroid:
          "Acércala de nuevo y mantenla quieta hasta la vibración: la eliminación continuará donde se detuvo.",
        lostIos:
          "Acércala de nuevo y mantenla quieta hasta la confirmación: la eliminación continuará donde se detuvo.",
        cancelled: "Lectura de la tarjeta cancelada",
        failed: "La eliminación ha fallado: vuelve a intentarlo",
        noCard: "No tengo la tarjeta",
        finish: "Terminar",
        cancel: "Cancelar",
        stateTodo: ": pendiente",
        stateRunning: ": en curso",
        stateDone: ": hecho",
        stateFailed: ": fallido",
        stateWarning: ": por revisar"
      }
    },
    drain: {
      intro:
        "Todo el saldo de la tarjeta va a una dirección lightning, bitcoin o Spark: escríbela, pégala o escanéala. Las comisiones se toman de este saldo.",
      introNoScan:
        "Todo el saldo de la tarjeta va a una dirección lightning, bitcoin o Spark: escríbela o pégala. Las comisiones se toman de este saldo.",
      placeholder: "Dirección lightning, bitcoin o Spark",
      invoice: "Usa una dirección lightning, bitcoin o Spark",
      total: "Saldo de la tarjeta",
      received: "Recibido por el destinatario",
      feesAbove: "Las comisiones superan el saldo de la tarjeta a esta velocidad",
      empty: "Esta tarjeta no contiene nada que retirar.",
      quoteFailed:
        "No se pudo preparar el vaciado. Comprueba el destinatario y tu conexión a internet y vuelve a intentarlo.",
      done: "{{amount}} retirados: la tarjeta está vacía.",
      pending: "Retiro de {{amount}} en camino: llegará en cuanto se complete.",
      failed: "El retiro no se completó. Revisa el saldo de la tarjeta y vuelve a intentarlo."
    },
    modifiedPhone: {
      title: "Este teléfono es menos seguro",
      body: "Parece haber sido modificado (por ejemplo, « rooteado »). Para que esta tarjeta pague sin tu confirmación, la app guarda en este teléfono lo necesario para hacerla pagar: una app maliciosa podría usarlo para gastar su saldo. Deja pocos sats en esta tarjeta, o elige « Confirmar siempre »."
    },
    erasedFunds: {
      card: {
        body: "{{amount}} llegaron a su monedero después de eliminarla. Vacíalo hacia una dirección lightning, bitcoin o Spark.",
        bodyArriving:
          "{{amount}} llegaron a su monedero después de eliminarla, y {{arriving}} todavía están llegando a su dirección Bitcoin. Vacíalo hacia una dirección lightning, bitcoin o Spark.",
        arrivingOnly:
          "{{arriving}} están llegando a la dirección Bitcoin de una tarjeta eliminada. Podrás retirarlos una vez añadidos.",
        stoppedBody:
          "Vuelve a « Tarjetas », con su saldo, cuando la añades de nuevo. {{amount}} quedan en su monedero: sin la tarjeta, vacíalo hacia una dirección lightning, bitcoin o Spark.",
        stoppedBodyArriving:
          "Vuelve a « Tarjetas », con su saldo, cuando la añades de nuevo. {{amount}} quedan en su monedero, y {{arriving}} todavía están llegando a su dirección Bitcoin: sin la tarjeta, vacíalo hacia una dirección lightning, bitcoin o Spark."
      },
      title: "Han llegado sats a una tarjeta eliminada",
      titleArriving: "Están llegando sats a una tarjeta eliminada",
      body: "{{amount}} llegaron a su monedero después de eliminarla. Retíralos a tu saldo principal.",
      bodyArriving:
        "{{amount}} llegaron a su monedero después de eliminarla, y {{arriving}} aún están llegando a su dirección Bitcoin. Retíralos a tu saldo principal.",
      arrivingOnly:
        "{{arriving}} están llegando a la dirección Bitcoin de una tarjeta eliminada. Podrás retirarlos a tu saldo principal una vez añadidos.",
      returned: "{{amount}} retirados a tu saldo principal",
      returnPending:
        "Retiro de {{amount}} enviado: se añadirá a tu saldo principal en cuanto se complete",
      failed: "El retiro no se completó. Revisa tu conexión a internet y vuelve a intentarlo.",
      stoppedTitle: "{{card}}: reprogramación interrumpida",
      stoppedBody:
        "Vuelve a « Tarjetas », con su saldo, cuando la añadas de nuevo. {{amount}} siguen en su monedero: sin la tarjeta, retíralos a tu saldo principal.",
      stoppedBodyArriving:
        "Vuelve a « Tarjetas », con su saldo, cuando la añadas de nuevo. {{amount}} siguen en su monedero, y {{arriving}} aún están llegando a su dirección Bitcoin: sin la tarjeta, retíralos a tu saldo principal."
    },
    wallet: {
      balance: "Saldo",
      pendingDeposit: "{{amount}} recibidos en una dirección Bitcoin, aún no añadidos al saldo",
      failed:
        "No se pudo leer el monedero de esta tarjeta. Revisa tu conexión a internet y vuelve a intentarlo.",
      recharge: "Recargar",
      return: "Retirar a mi saldo principal",
      rechargeCard: "Recargar <accent>{{name}}</accent>",
      amountField: "Importe",
      rechargeAmount: "Recargar {{amount}}",
      returnAmount: "Retirar {{amount}}",
      copyInvoice: "Copiar la factura",
      copyAddress: "Copiar la dirección",
      onchainOpenHere:
        "El abono se hace cuando la tarjeta está abierta en « Tarjetas », aquí o en tu teléfono.",
      fromMain: "Desde mi saldo principal",
      invoice: "Factura Lightning",
      onchain: "Dirección Bitcoin",
      continue: "Continuar",
      invoiceCreate: "Crear la factura",
      invoiceDescription: "Recarga de tarjeta",
      noFee: "Ninguna",
      working: "Transferencia en curso…",
      recharged: "Tarjeta recargada con {{amount}}.",
      returned: "{{amount}} retirados a tu saldo principal.",
      rechargePending:
        "Recarga de {{amount}} enviada: se añadirá al saldo de la tarjeta en cuanto se complete.",
      returnPending:
        "Retiro de {{amount}} enviado: se añadirá a tu saldo principal en cuanto se complete.",
      nothingToReturn: "Esta tarjeta no contiene nada que retirar.",
      prepareFailed:
        "No se pudo preparar la transferencia: no ha salido nada. Revisa tu conexión a internet y vuelve a intentarlo.",
      transferFailed:
        "La transferencia no se completó. Revisa tu conexión a internet y vuelve a intentarlo: solo saldrá una vez.",
      transferRefused:
        "La transferencia ha fallado. Comprueba los saldos antes de volver a empezar.",
      receiveFailed:
        "No se pudo crear la dirección o la factura. Revisa tu conexión a internet y vuelve a intentarlo.",
      invoiceHint:
        "Se puede pagar una sola vez, desde cualquier monedero Lightning, hasta el {{date}}.",
      readingMain: "Leyendo tu saldo principal…",
      otherWallet: "Otro monedero",
      confirmRecharge: "Confirmar la recarga",
      mainAvailable: "{{amount}} disponibles",
      change: "Cambiar",
      mainShort: "Tu saldo principal no cubre este importe",
      mainUnread: "No se ha podido leer tu saldo principal. Vuelve a intentarlo en un momento.",
      unit: "Unidad",
      addressNote:
        "La dirección Lightning permanente de la tarjeta: compártela, el importe enviado se suma al saldo de la tarjeta.",
      orAnyWallet: "o desde cualquier monedero",
      share: "Compartir",
      invoiceWaiting: "Esperando el pago…",
      invoicePaid: "Factura pagada",
      invoiceAdded: "añadidos al saldo de la tarjeta",
      finish: "Terminar",
      invoiceExpired: "Factura caducada",
      invoiceExpiredNote: "No se pagó antes del {{date}}: ya nadie puede pagarla.",
      newInvoice: "Nueva factura",
      onchainConfirmations:
        "Lo que envíes se suma al saldo de la tarjeta tras 1 a 3 confirmaciones, hasta unos treinta minutos.",
      onchainFee: "Comisión: {{fee}} como máximo, descontada. Si la red pide más, el abono espera.",
      onchainOpen: "El abono se hace cuando abres la tarjeta en « Tarjetas ».",
      toMain: "A mi saldo principal",
      fromCard: "Desde la tarjeta {{name}} · {{amount}}",
      cardHoldsOnly: "La tarjeta solo contiene {{amount}}",
      allOf: "Todo el saldo de la tarjeta · {{fiat}}",
      wholeBalance: "Todo el saldo de la tarjeta",
      partOf: "{{fiat}} · quedarán {{left}} en la tarjeta",
      partOfSats: "Quedarán {{left}} en la tarjeta",
      emptyCard: "Vaciar la tarjeta",
      rowFrom: "De",
      rowTo: "A",
      rowFee: "Comisión",
      rowAfter: "Saldo de la tarjeta después",
      mainBalance: "Mi saldo principal",
      confirmPasskey: "Confirmar con mi passkey",
      copy: "Copiar",
      copied: "Copiado",
      copyFailed: "No se pudo copiar"
    },
    payees: {
      approved: "Aprobados para esta tarjeta",
      approvedCount: "$t(cards.payees.approved) · {{count}}",
      changeMode: "Cambiar de modo",
      modeBox: {
        automatic: {
          title: "Modo: automático",
          caption: "Cada tap válido se paga, dentro de los límites"
        },
        approved: {
          title: "Modo: comercios aprobados",
          caption: "En los demás, tu teléfono te pide confirmar"
        },
        confirm: {
          title: "Modo: confirmar siempre",
          caption: "Cada pago espera tu confirmación"
        }
      },
      changeLabel: "Cambiar el modo de confirmación de {{name}}",
      approveNote:
        "Para añadir uno, marca «$t(card.payment.approve)» cuando confirmes un pago en él.",
      removeLabel: "Quitar {{name}} de los comercios aprobados",
      payments_one: "{{count}} pago",
      payments_other: "{{count}} pagos",
      paymentsRecent_one: "{{count}} pago en 90 días",
      paymentsRecent_other: "{{count}} pagos en 90 días",
      itsName: "Su nombre",
      itsNode: "Su nodo",
      nodeNote:
        "Aprobado por su nodo Lightning: si este nodo es compartido (Spark, Wallet of Satoshi, Strike…), a todos sus demás usuarios también se les paga sin confirmación, dentro de los límites de la tarjeta.",
      approvedAs: "Aprobado con el nombre",
      approvedOnLabel: "Aprobado el",
      paymentsLabel: "Pagos",
      paymentsValue_one: "{{count}}, por {{amount}}",
      paymentsValue_other: "{{count}}, por {{amount}}",
      paymentsValueRecent_one: "{{count}} en 90 días, por {{amount}}",
      paymentsValueRecent_other: "{{count}} en 90 días, por {{amount}}",
      modesLabel: "Modo de confirmación de los pagos",
      recommended: "Recomendado",
      confirmPasskey: "Confirmar con mi passkey",
      modes: {
        automatic: {
          title: "Automático",
          body: "Cada tap válido se paga, dentro de los límites de la tarjeta. El comercio se muestra, sin control."
        },
        approved: {
          title: "Comercios aprobados",
          body: "Pagado sin confirmación en un comercio identificado que has aprobado; en los demás, tu teléfono te pide confirmar."
        },
        confirm: {
          title: "Confirmar siempre",
          body: "Cada pago espera tu confirmación."
        }
      },
      approvedEmpty: "Ningún comercio aprobado",
      approvedEmptyLead:
        "Cuando confirmes un pago con esta tarjeta, marca «$t(card.payment.approve)»: sus próximos pagos saldrán sin confirmación.",
      approvedOn: "aprobado el {{date}}",
      nameField: "Tu nombre para este comercio",
      nameHint: "Solo para ti. Si lo dejas vacío, vuelve el nombre declarado por el comercio.",
      remove: "Quitar de los comercios aprobados",
      removeHint: "Se te pedirá tu passkey. Sus próximos pagos volverán a pedir tu confirmación.",
      saveFailed: "No se ha podido guardar el cambio. Inténtalo de nuevo.",
      pending: {
        phone:
          "Guardado en este teléfono, aún no en los relés de tu cuenta: tus otros dispositivos aún no lo ven.",
        web: "Aún no guardado en los relés de tu cuenta: este cambio se perderá si sales de la página."
      },
      failed: {
        newerApp:
          "Una versión más reciente de la app ha guardado tus comercios aprobados. Actualiza la app: hasta entonces, tus tarjetas no pagan.",
        unreachable:
          "Los relés de tu cuenta no han respondido: tus comercios aprobados no se pueden mostrar.",
        failed: "No se han podido leer tus comercios aprobados."
      }
    },
    probe: {
      group: "Pruebas (staging)",
      row: "Prueba de la extensión iOS",
      title: "Prueba de la extensión iOS",
      noPointOfSale:
        "Esta prueba paga a la dirección Lightning de la cuenta: una cuenta solo de tarjetas no tiene.",
      unavailable: "Esta prueba solo existe en la app de staging, en iPhone.",
      intro:
        "Mide si una tarjeta puede pagar desde una notificación, con la app cerrada. La extensión usa su propio monedero de prueba, nunca el de tu cuenta: solo guarda unos pocos sats.",
      how: "Tras iniciar una prueba, bloquea el teléfono: el resultado aparece en la notificación y luego aquí. Las notificaciones deben estar permitidas.",
      launchGroup: "Iniciar una prueba",
      profile: "Configuración del SDK",
      profiles: {
        light: "Ligera",
        standard: "Estándar"
      },
      modes: {
        sync: "Sincronizar",
        receive: "Recibir 100 sats",
        pay: "Pagar 1 sat a tu dirección",
        engine: "Motor JS (sin pago)",
        runtime: "Entorno JS (red, datos)",
        enginePay: "Motor JS: pagar 1 sat"
      },
      balance: "Saldo del monedero de prueba, leído en la última prueba: {{sats}} sats",
      sent: "Notificación de prueba enviada",
      failed: {
        unavailable: "Este teléfono no tiene la extensión de notificaciones",
        noApiKey: "Esta versión de la app no tiene clave API de Breez",
        storage: "No se pudo preparar el monedero de prueba",
        notifications: "Permite las notificaciones para iniciar una prueba",
        pushToken: "Sin token de notificación: la red, o faltan las credenciales APNs en la build",
        invoice: "Tu dirección Lightning no dio ninguna factura",
        push: "El servicio de notificaciones de Expo rechazó el envío",
        unexpected: "No se pudo iniciar la prueba"
      },
      notification: {
        title: "Prueba de la extensión",
        body: "Si este texto sigue visible, la extensión no procesó la notificación."
      },
      cardText: {
        group: "Notificación de un pago con tarjeta",
        intro:
          "Envía a este teléfono la notificación de un pago con tarjeta, como el relé: su título debe aparecer en el idioma del iPhone. «sattle.me»: la extensión no la procesó.",
        launch: "Enviar una notificación de tarjeta",
        sent: "Notificación de tarjeta enviada"
      },
      resultsGroup: "Resultados",
      empty: "Todavía ninguna prueba.",
      outcome: {
        waiting: "En espera",
        none: "Sin resultado",
        running: "En curso ({{step}})",
        stopped: "Interrumpida ({{step}})",
        ok: "Correcta",
        failed: "Fallida ({{step}})",
        expired: "Tiempo agotado ({{step}})"
      },
      peak: "pico {{mb}} MB",
      limit: "límite ≈ {{mb}} MB",
      seconds: "{{s}} s",
      copyInvoice: "Copiar la factura",
      invoiceCopied: "Factura copiada: págala desde « Enviar »",
      copy: "Copiar los resultados",
      copied: "Resultados copiados",
      copyFailed: "No se pudo copiar",
      clear: "Borrar los resultados"
    },
    wakes: {
      row: "Registro de despertares (Android)",
      title: "Registro de despertares",
      unavailable: "Este registro solo existe en la app de staging, en Android.",
      intro:
        "Cada vez que el relé de una tarjeta despertó este teléfono, con la app cerrada o en segundo plano: cuándo llegó y hasta dónde llegó el pago. Ni importe, ni comercio, ni factura.",
      how: "Para probar: desliza la app fuera de las apps recientes (sin forzar su detención), bloquea el teléfono, acerca la tarjeta a una caja y luego vuelve aquí y copia el registro.",
      group: "Despertares",
      empty: "Todavía no hay ningún despertar.",
      outcome: {
        running: "En curso ({{step}})",
        stopped: "Interrumpido ({{step}})",
        notTaken: "Ignorado",
        paid: "Pagado",
        pending: "Enviado, sin confirmar",
        declined: "Rechazado por el titular",
        failed: "Fallido ({{reason}})",
        letGo: "Abandonado ({{step}})",
        ended: "Terminado ({{step}})"
      },
      received: "tarea iniciada {{s}} s después de recibirlo",
      js: "JS iniciado {{s}} s antes",
      silence: "silencio más largo {{s}} s",
      copy: "Copiar el registro",
      copied: "Registro copiado",
      copyFailed: "No se ha podido copiar",
      clear: "Borrar el registro",
      newer: "Este registro lo escribió una versión más reciente de la app.",
      failed: "No se ha podido leer el registro."
    },
    socket: {
      group: "Conexión permanente",
      row: "Conexión permanente",
      caption: {
        on: "Activa",
        off: "Desactivada"
      },
      intro:
        "El teléfono mantiene su propia conexión con el relé de sus tarjetas: un pago con tarjeta lo despierta con la app cerrada. Está activa por defecto y gasta algo de batería. Desactivada, tus tarjetas solo pagan con la app abierta.",
      noRelay: "Ningún relé de tus tarjetas ofrece todavía esta conexión.",
      state: {
        connecting: "conectando…",
        open: "conectada",
        waiting: "en espera",
        stopped: "detenida"
      },
      since: "desde {{time}}",
      lastMessage: "último mensaje hace {{s}} s",
      opened_one: "{{count}} conexión",
      opened_other: "{{count}} conexiones",
      failures_one: "{{count}} corte",
      failures_other: "{{count}} cortes",
      lastFailure: "último corte: {{code}}",
      wakes_one: "{{count}} despertar",
      wakes_other: "{{count}} despertares",
      battery: {
        applied: "La optimización de batería se aplica a la app: Android puede cortar la conexión.",
        exempt: "La optimización de batería está desactivada para la app.",
        settings: "Ajustes de batería"
      },
      notice: {
        shown:
          "Android muestra una notificación mientras la conexión está activa. Para ocultarla, desactiva «Conexión de las tarjetas» en los ajustes que se abren: la conexión sigue.",
        hidden: "Notificación oculta: la conexión sigue.",
        hide: "Ocultar la notificación",
        settings: "Ajustes de la notificación"
      },
      service: {
        running: "Servicio activo (iniciado: {{reason}})",
        stopped: "Servicio detenido",
        error: "El servicio no pudo iniciarse ({{code}})",
        task: "Despertar no transmitido a la app ({{code}})"
      },
      failed: "No se pudo cambiar la conexión permanente",
      notification: {
        channel: "Conexión de las tarjetas",
        title: "Pagos con tarjeta activados",
        text: "Conectado al relé de tus tarjetas para pagar con la app cerrada",
        stop: "Detener"
      }
    }
  },
  pos: {
    title: "Punto de venta",
    subtitle: "Cobra en bitcoin en tu cuenta, rápidamente.",
    addNote: "Añadir una nota",
    editNote: "Editar la nota «{{note}}»",
    charge: "Cobrar",
    keyboardHint: "Las teclas del teclado también funcionan.",
    deleteKey: "Borrar",
    satsLabel: "{{sats}} sats",
    rateLoading: "Cargando el precio del bitcoin…",
    rateUnavailable: "Precio del bitcoin no disponible. Comprueba tu conexión a internet.",
    share: "Compartir la solicitud de pago",
    shareLink: {
      button: "Compartir",
      hint: "Envía la solicitud de pago al cliente.",
      copiedTitle: "Enlace copiado",
      copied: "Pégalo en un mensaje al cliente.",
      publishFailedTitle: "Enlace no publicado",
      shareFailedTitle: "Enlace no compartido",
      publishFailed:
        "No se pudo poner el enlace en línea: el cliente no lo encontraría. Comprueba tu conexión a internet y vuelve a compartirlo.",
      shareFailed: "No se pudo compartir el enlace. Vuelve a intentarlo."
    },
    backToPos: "Volver al punto de venta",
    expiresIn: "Caduca en",
    waiting: "Esperando el pago",
    creating: "Creando la solicitud…",
    checking: "Comprobando el pago en Bitcoin…",
    checkingPayment: "Comprobando el pago…",
    lateCheck: {
      title: "Solicitud caducada",
      body: "Un pago enviado en el último segundo aún puede llegar.",
      endsIn: "La comprobación termina en"
    },
    // A payment whose check lasts.
    settling: {
      title: "Pago recibido, en verificación",
      body: "La verificación tarda más de lo previsto. Continúa por sí sola."
    },
    updatingRate: "Actualizando al tipo de esta hora…",
    networks: {
      scan: "Escanea con tu monedero",
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      or: "o"
    },
    onchainUnavailable: {
      explorer:
        "Bitcoin onchain no disponible para esta venta: {{explorer}} no pudo comprobar la dirección Bitcoin a tiempo. El cliente puede pagar por Lightning.",
      pool: "Bitcoin onchain no disponible para esta venta: este dispositivo no tiene ninguna dirección Bitcoin lista. Prepara nuevas en cada desbloqueo con tu passkey, con conexión a internet. El cliente puede pagar por Lightning.",
      lot: "Bitcoin onchain no disponible para esta venta: este dispositivo no tiene ninguna dirección Bitcoin disponible. El propietario le da nuevas al desbloquear su app con su passkey, con conexión a internet. El cliente puede pagar por Lightning."
    },
    note: {
      label: "Nota del cobro",
      placeholder: "Mesa 12"
    },
    boltcard: {
      approach: "O acerca la tarjeta BoltCard",
      tap: "O toca aquí y luego acerca la tarjeta BoltCard",
      alert: "Acerca la tarjeta BoltCard a la parte superior del teléfono.",
      paying: "Pago con tarjeta en curso…",
      sent: "Pago con tarjeta enviado, esperando su confirmación…",
      refusal: {
        refused: "Tarjeta rechazada",
        interrupted: "Pago con tarjeta interrumpido",
        unread: "Tarjeta no leída",
        noReason:
          "El servicio de la tarjeta no ha dado ningún motivo. Vuelve a presentar la tarjeta o haz escanear el código.",
        outOfRange: "El importe está fuera de los límites de la tarjeta. Haz escanear el código.",
        noAnswer:
          "El servicio de la tarjeta no ha respondido. Vuelve a presentar la tarjeta o haz escanear el código.",
        unreadable:
          "No es una tarjeta de pago que se pueda leer aquí. Vuelve a presentarla o haz escanear el código.",
        showCode: "Mostrar el código"
      }
    },
    paid: {
      pill: "Cobrado",
      line: "Lightning · {{time}}",
      onchainLine: "Bitcoin · {{time}}",
      mixedLine: "Bitcoin + Lightning · {{time}}"
    },
    accepted: {
      notice: "El propietario aceptó el importe recibido: la venta está pagada."
    },
    unconfirmed: {
      pill: "En confirmación",
      notice:
        "El cliente ha pagado. La red aún debe confirmar la transacción, cuente unos treinta minutos."
    },
    underpaid: {
      rest: "Resto",
      received: "Recibido",
      restToPay: "Falta por pagar",
      // The accessible name of a transaction's link on the chain card (UnderpaidChain).
      txLink: "Ver la transacción {{txid}} en {{explorer}}"
    },
    underpaidEnded: {
      pill: "Pago incompleto",
      missing: "Falta",
      received: "Pagos recibidos",
      confirmed: "Confirmada",
      confirming: "En confirmación · {{done}}/{{required}}",
      notice: "El plazo para pagar ha terminado: faltan {{missing}} sats."
    },
    expired: {
      pill: "Caducado",
      notice: "El cliente no pagó a tiempo. No se ha cobrado nada.",
      recreate: "Volver a crear la solicitud"
    },
    disputed: {
      pill: "Pago por verificar",
      notice:
        "Se ha recibido un pago, pero otra venta también lo reclama. No pidas un nuevo pago: verifícalo en «$t(navigation.destinations.wallet)».",
      noticeMember:
        "Se ha recibido un pago, pero otra venta también lo reclama. No pidas un nuevo pago: el titular de la cuenta lo verifica en «$t(navigation.destinations.wallet)»."
    },
    failed: {
      network:
        "No se pudo crear la solicitud de pago. Comprueba tu conexión a internet y vuelve a intentarlo.",
      invalid: "El servicio de pago respondió de forma inesperada. Vuelve a intentarlo.",
      limits: "Este importe no se puede cobrar: solo entre {{min}} y {{max}} sats.",
      onchainOnly: {
        none: "Por encima de {{max}} sats, este importe solo se puede pagar onchain, y los pagos onchain están desactivados.",
        explorer:
          "Por encima de {{max}} sats, este importe solo se puede pagar onchain, y {{explorer}} no pudo comprobar la dirección Bitcoin a tiempo. Vuelve a intentarlo.",
        pool: "Por encima de {{max}} sats, este importe solo se puede pagar onchain, y este dispositivo no tiene ninguna dirección Bitcoin lista. Prepara nuevas en cada desbloqueo con tu passkey, con conexión a internet.",
        lot: "Por encima de {{max}} sats, este importe solo se puede pagar onchain, y este dispositivo no tiene ninguna dirección Bitcoin disponible. El propietario le da nuevas al desbloquear su app con su passkey, con conexión a internet.",
        error:
          "Por encima de {{max}} sats, este importe solo se puede pagar onchain, y no se pudo leer la dirección Bitcoin de este dispositivo. Vuelve a intentarlo."
      },
      retry: "Reintentar"
    },
    // The keypad or the articles: the header's segmented control.
    mode: {
      label: "Modo de entrada",
      amount: "Importe",
      articles: "Artículos",
      scan: "Escanear"
    },
    articles: {
      hint: "Toque un artículo para añadirlo",
      // Without articles, on the owner's device only (ArticlesPad.tsx).
      empty: {
        reading: "Leyendo sus artículos…",
        unreadableTitle: "Artículos aún no leídos",
        unreadableBody:
          "No se han podido leer sus artículos. Compruebe la conexión a internet: se volverán a leer en unos minutos.",
        noneTitle: "Aún no hay artículos",
        noneBody: "Añada sus artículos en «$t(navigation.destinations.articles)»: aparecerán aquí.",
        noneBodyScan:
          "Escanee un producto con «$t(pos.mode.scan)» para crearlo, o añada sus artículos en «$t(navigation.destinations.articles)»."
      },
      tile: "{{name}}, {{price}}",
      add: "Añade uno a la cesta",
      inBasket_one: "{{count}} en la cesta",
      inBasket_other: "{{count}} en la cesta"
    },
    basket: {
      title: "Cesta",
      open: "Ver la cesta",
      charge_one: "Cobrar · {{count}} artículo",
      charge_other: "Cobrar · {{count}} artículos",
      total: "Total",
      empty: "La cesta está vacía.",
      tooLarge: "El total supera el importe máximo de un cobro.",
      scanMore: "Escanear más artículos",
      less: "Reducir la cantidad de {{name}}",
      more: "Aumentar la cantidad de {{name}}",
      quantity_one: "Cantidad: {{count}}",
      quantity_other: "Cantidad: {{count}}"
    },
    // The scan of the point of sale: the camera, the article read last, the basket.
    scan: {
      aim: "Apunte al código de barras de un artículo",
      lead: "Cada artículo escaneado se añade al total.",
      converted: "Precio: {{price}}, convertido",
      unknown: {
        title: "Código de barras desconocido",
        body: "Ninguno de sus artículos tiene este código. No se ha añadido nada."
      },
      // A code read before the catalogue was (ScanPad.tsx): nothing can be told of it.
      notRead: {
        title: "Artículos aún no leídos",
        body: "No se ha podido buscar este código. No se ha añadido nada: vuelva a escanearlo en un momento."
      }
    }
  },
  paymentLink: {
    // The page's switch of theme, in its header: what it does.
    themeToDark: "Cambiar al tema oscuro",
    themeToLight: "Cambiar al tema claro",
    payableUntil: "Pagadero hasta el {{date}}",
    loading: "Cargando la solicitud de pago…",
    updatingRate: "Actualizando al tipo de esta hora…",
    openWallet: "Abrir mi monedero",
    copyInvoice: "Copiar la factura",
    copied: "Factura copiada",
    copyFailed: "No se pudo copiar la factura. Ábrela en tu monedero o escanea el código.",
    retry: "Reintentar",
    notFound: {
      title: "Solicitud no encontrada",
      notice: "Esta solicitud de pago no existe o ha caducado. Pide un nuevo enlace al comercio.",
      invalid:
        "Este enlace está incompleto. Comprueba que se copió entero o pide uno nuevo al comercio."
    },
    unreachable: {
      title: "No se puede conectar",
      notice:
        "No se pudo cargar la solicitud de pago. Comprueba tu conexión a internet y vuelve a intentarlo."
    },
    failed: {
      title: "Solicitud no disponible",
      notice:
        "El servicio de pago del comercio no pudo crear la factura. Vuelve a intentarlo en unos instantes o pide un nuevo enlace al comercio.",
      onchainOnly:
        "Este importe solo se puede pagar onchain, y esta solicitud no ofrece ninguna dirección Bitcoin. Pide a {{business}} otro medio de pago."
    },
    copyAddress: "Copiar la dirección",
    addressCopied: "Dirección copiada",
    addressCopyFailed: "No se pudo copiar la dirección. Ábrela en tu monedero o escanea el código.",
    amountCopied: "Importe copiado",
    amountCopyFailed:
      "No se pudo copiar el importe. Abre la solicitud en tu monedero o escanea el código.",
    receipt: {
      invoice: "Factura Lightning",
      address: "Dirección Bitcoin",
      amount: "Importe",
      copyAmount: "Copiar el importe",
      invoiceCopied: "Copiada",
      addressCopied: "Copiada",
      amountCopied: "Copiado",
      unit: "Unidad: {{unit}}, cambiar a {{next}}"
    },
    unconfirmed: {
      notice:
        "Tu pago se ha enviado. La red aún debe confirmar la transacción, cuenta unos treinta minutos. Puedes cerrar esta página."
    },
    underpaid: {
      notice:
        "Tu pago ({{received}} sats) no cubre todo el importe. Paga el resto por Lightning o Bitcoin.",
      noticeLightning:
        "Tu pago ({{received}} sats) no cubre todo el importe. Paga el resto por Lightning."
    },
    underpaidEnded: {
      notice:
        "El plazo para pagar ha terminado: tu pago ({{received}} sats) no cubre todo el importe, faltan {{missing}} sats. Contacta con {{business}} para la diferencia."
    },
    details: {
      title: "Detalles del pago",
      business: "Beneficiario",
      method: "Método",
      methods: {
        lightning: "Lightning",
        onchain: "Bitcoin",
        mixed: "Bitcoin + Lightning"
      },
      createdAt: "Creada el",
      transaction: "Transacción",
      transactionNumber: "Transacción {{number}}",
      confirmations_one: "{{count}} confirmación de {{required}}",
      confirmations_other: "{{count}} confirmaciones de {{required}}",
      confirmed: "Confirmada"
    },
    paid: {
      pill: "Pagado",
      notice: "{{business}} ha recibido tu pago.",
      continue: "Continuar a {{host}}"
    },
    accepted: {
      notice: "{{business}} aceptó el importe recibido: tu pago está liquidado."
    },
    expired: {
      pill: "Caducado",
      notice:
        "El plazo para pagar ha terminado y no se ha recibido ningún pago. Pide un nuevo enlace a {{business}}."
    },
    canceled: {
      pill: "Anulada",
      notice:
        "{{business}} ha anulado esta solicitud de pago: no la pagues. Pide un nuevo enlace a {{business}}."
    },
    disputed: {
      pill: "Por verificar",
      notice:
        "Tu pago se ha recibido. {{business}} aún debe verificarlo: no pagues una segunda vez y contacta con {{business}} si es necesario."
    },
    checkout: {
      newer: {
        title: "Página por actualizar",
        notice:
          "Este enlace de pago tiene un formato más reciente que esta página. Recarga la página, o actualiza la app, y vuelve a abrir el enlace."
      },
      continue: "Continuar",
      redirectTo: "Redirección a {{target}}",
      unconfirmed: {
        notice:
          "Tu pago se ha enviado. La red aún debe confirmar la transacción, cuenta unos treinta minutos."
      },
      underpaid: {
        notice:
          "Tu pago ({{received}} sats) no cubre todo el importe. Paga el resto por Bitcoin, a la misma dirección."
      },
      expired: {
        notice:
          "El plazo de pago ha vencido y no se ha recibido ningún pago. Vuelve a la tienda de {{business}} para pedir uno nuevo.",
        late: "El plazo de pago ha vencido: un pago llegó después de su fin y no cuenta para este pedido. Contacta con {{business}}."
      }
    }
  },
  appLock: {
    title: "App bloqueada",
    body: "Usa la biometría de este dispositivo para abrirla.",
    unlock: "Desbloquear",
    prompt: "Desbloquear sattle.me",
    cancel: "Cancelar"
  },
  navigation: {
    label: "Navegación",
    destinations: {
      pos: "Cobrar",
      wallet: "Monedero",
      cards: "Tarjetas",
      articles: "Artículos",
      employees: "Empleados",
      integrations: "Integraciones",
      settings: "Ajustes"
    },
    memberWallet: "Mi actividad",
    groups: {
      sales: "Ventas",
      manage: "Gestionar",
      account: "Cuenta"
    },
    more: "Más",
    moreWith: "Más, pantalla actual: {{name}}",
    moreWithWait: "{{more}} ({{name}})",
    close: "Cerrar",
    customize: "Personalizar",
    customizeTitle: "Personalizar la barra",
    done: "Listo",
    customizeHint: "Toque un destino para sustituir <accent>{{name}}</accent>.",
    slotLabel: "{{name}}, posición {{index}}",
    swapLabel: "Poner {{name}} en la barra",
    currentLabel: "{{name}}, pantalla actual",
    pendingLabel: "{{name}}, factura en curso",
    confirmingLabel: "{{name}}, pago en confirmación",
    lock: {
      tillMode: "Pasar al modo caja",
      lockApp: "Bloquear la app",
      unlock: "Desbloquear con su passkey",
      lockedLabel: "{{name}}, bloqueado: desbloquear con su passkey",
      unlocking: "Desbloqueando…",
      preparing: "Preparando el desbloqueo…",
      failedTitle: "No se pudo desbloquear",
      otherAccount: "Esta passkey abre otra cuenta distinta de la de este dispositivo.",
      autoLockTitle: "Bloqueo en {{seconds}} s",
      autoLockBodyCard: "Sin actividad, la app se bloquea.",
      autoLockBody: "Sin actividad, la app vuelve al modo caja."
    },
    loadFailure: {
      title: "Pantalla no cargada",
      body: "Comprueba tu conexión a internet y vuelve a cargar la página. Al recargarla también obtienes la última versión de la app.",
      reload: "Volver a cargar la página"
    },
    update: {
      title: "Nueva versión disponible",
      body: "Al actualizar, la página se vuelve a cargar.",
      action: "Actualizar"
    }
  },
  team: {
    invite: "Invitar a un empleado",
    loading: "Cargando tus empleados…",
    guide: {
      title: "Cobra en equipo",
      lead: "Cada empleado cobra con su propio teléfono, para tu negocio.",
      invite: {
        title: "Invita",
        caption: "Elige su nombre: la app prepara su invitación, un código QR y un enlace."
      },
      activate: {
        title: "Activa su teléfono",
        caption:
          "Tu empleado escanea el código QR o abre el enlace: su teléfono se convierte en una caja de tu negocio."
      },
      sales: {
        title: "Sigue sus ventas",
        caption: "Llegan a tu monedero, a su nombre; cada empleado solo ve las suyas."
      }
    },
    noMatch: "Ningún empleado coincide con los filtros.",
    offline: "No hay conexión: no se ha podido comprobar el estado de las invitaciones.",
    rosterOffline:
      "Ningún relé ha respondido: no se ha podido leer la lista de empleados. Comprueba la conexión y vuelve a esta pantalla.",
    rosterPartial:
      "No todos los relés han respondido: la lista de empleados puede estar incompleta.",
    newer:
      "Algunos empleados vienen de una versión más reciente de la app: actualiza la app para verlos.",
    invitations: "Invitaciones pendientes",
    employees: "Empleados",
    columns: {
      name: "Nombre",
      state: "Estado",
      date: "Fecha"
    },
    status: {
      invited: "Pendiente",
      joined: "Activo",
      left: "Salió",
      expired: "Caducada"
    },
    detail: {
      invited: "Enlace creado el {{date}}",
      joined: "Se unió el {{date}}",
      left: "Salió el {{date}}",
      expired: "Enlace caducado el {{date}}"
    },
    // Where an employee's device joined (its record's platform), beside its row's date.
    platform: {
      ios: "en iPhone o iPad",
      android: "en Android",
      web: "en un navegador web"
    },
    detailWithPlatform: "{{detail}}, {{platform}}",
    actions: {
      share: "Compartir el enlace",
      showQr: "Mostrar el enlace y el código",
      renew: "Renovar la invitación",
      deleteInvite: "Eliminar la invitación",
      removeAccess: "Retirar el acceso",
      removeLeft: "Quitar de la lista"
    },
    inviteSheet: {
      title: "Invitar a un empleado",
      lead: "Con este enlace, otro dispositivo cobra para tu negocio: el teléfono de un empleado o una caja compartida. Los pagos llegan directamente a tu monedero.",
      can: "Este dispositivo podrá",
      canItems: {
        sell: "Cobrar: importe, artículos y escaneo",
        methods: "Cobrar en Lightning, on-chain o con tarjeta",
        links: "Enviar un enlace de pago a un cliente",
        ownSales: "Ver sus propias ventas"
      },
      cannot: "Este dispositivo no podrá",
      cannotItems: {
        wallet: "Ver tu saldo ni enviar fondos",
        settings: "Modificar tus artículos, precios o ajustes",
        otherSales: "Ver las ventas de los demás empleados o cajas",
        manage: "Gestionar el equipo, las tarjetas o las integraciones"
      },
      revoke: "Podrás retirarle el acceso en cualquier momento.",
      nameLabel: "Nombre",
      namePlaceholder: "P. ej. Alice o Caja 1",
      nameHint: "Aparece en tu monedero junto a sus ventas.",
      create: "Crear el enlace",
      notice:
        "El enlace será válido 48 horas y solo funciona una vez. Dáselo solo al empleado o a la caja previstos: la primera persona que lo abra puede ocupar su lugar."
    },
    qrSheet: {
      title: "Invitación para {{name}}",
      lead: "Escanea este código con el dispositivo que cobrará, o envía el enlace a ese dispositivo.",
      leadDesktop:
        "Escanea este código con el dispositivo que cobrará para {{business}}, o envía el enlace a ese dispositivo.",
      linkLabel: "Enlace de invitación",
      copy: "Copiar el enlace",
      share: "Compartir el enlace",
      copied: "Enlace copiado",
      copyFailed: "No se ha podido copiar el enlace. Selecciónalo y cópialo.",
      done: "Terminar",
      notice:
        "Este enlace solo funciona una vez y caduca el {{date}}. Es solo para {{name}}: la primera persona que lo abra puede ocupar su lugar."
    },
    removeDialog: {
      title: "¿Retirar a {{name}}?",
      body: "{{name}} ya no podrá cobrar para {{business}}. Sus cobros anteriores permanecen en el monedero, a su nombre.",
      confirm: "Retirar el acceso",
      doneTitle: "Acceso retirado",
      doneBody: "{{name}} ya no forma parte del equipo de {{business}}."
    },
    removeLeftDialog: {
      title: "¿Quitar a {{name}} de la lista?",
      body: "{{name}} salió de {{business}} el {{date}}. Sus cobros anteriores permanecen en el monedero, a su nombre.",
      confirm: "Quitar de la lista",
      doneTitle: "Lista de empleados actualizada",
      doneBody: "{{name}} ya no aparece en ella."
    },
    deleteInviteDialog: {
      title: "¿Eliminar la invitación de {{name}}?",
      body: "El enlace dejará de funcionar: {{name}} no podrá unirse a {{business}} con él.",
      confirm: "Eliminar la invitación",
      doneTitle: "Enlace de invitación desactivado",
      doneBody: "{{name}} ya no podrá unirse a {{business}}."
    },
    cancelSalesDialog: {
      unknownLead: "No se ha podido comprobar el estado de las facturas de {{name}}.",
      linksLeft:
        "{{name}} ya no forma parte del equipo de {{business}}. Sus enlaces de pago que no se han podido cancelar siguen pudiendo pagarse hasta su fin: los pagos llegan al monedero.",
      title: "¿Anular las facturas de {{name}}?",
      lead: "Algunas facturas de {{name}} aún no son definitivas.",
      links:
        "Sus enlaces de pago que aún no han recibido nada se anularán: su página ya no mostrará un código para pagar. Los que se han pagado se finalizarán.",
      invoices:
        "Las facturas mostradas en su dispositivo se anularán: el dispositivo deja de mostrarlas en cuanto recibe la retirada de su acceso.",
      end: "Un cliente que ya escaneó o copió una factura aún puede pagarla: el pago llega a la billetera. Después se retira el acceso de {{name}}.",
      confirm: "Anular y retirar",
      progress: "Anulando las facturas de {{name}}…"
    },
    failedTitle: "Acción imposible",
    unreachableTitle: "No hay conexión",
    errors: {
      noAccount: "Desbloquea este punto de venta con tu passkey para gestionar el equipo.",
      noWebApp: "Las invitaciones aún no están disponibles en esta versión de la app.",
      tooMany: "Tu equipo ya tiene 100 empleados.",
      invalidName: "Introduce el nombre del empleado.",
      unreachable:
        "No se ha podido publicar la invitación. Comprueba tu conexión a internet y vuelve a intentarlo.",
      unpublished:
        "El empleado se ha añadido a la lista, pero no se ha podido publicar su invitación. Comparte su enlace desde la lista para volver a intentarlo.",
      removeUnreachable:
        "No se ha podido publicar la retirada. Comprueba tu conexión a internet y vuelve a intentarlo.",
      removeFailed: "No se ha podido guardar la retirada. Vuelve a intentarlo.",
      removalUnsaved:
        "El acceso de este empleado está cortado, pero no se ha podido guardar su retirada. Vuelve a intentarlo: también se guardará la próxima vez que abras tu cuenta.",
      salesInProgress:
        "Algunas facturas de este empleado aún no son definitivas. Vuelve a intentarlo cuando se publique su versión final (hasta 3 horas después del final de una factura no pagada).",
      integrationPending:
        "Una integración tiene pagos aún no definitivos. Vuelve a intentarlo cuando lo sean.",
      exportNewer:
        "Una versión más reciente de la app modificó este asistente. Actualiza la app para cambiarlo",
      invoicesNewer:
        "Una versión más reciente de la app modificó este asistente. Actualiza la app para cambiarlo"
    },
    removedNotice: "Este dispositivo ya no forma parte del equipo de {{business}}.",
    join: {
      title: "Unirse a un equipo",
      scanLead: "Escanea el código QR de invitación que te muestra el propietario del negocio.",
      cameraAppLead:
        "Escanea el código QR de invitación con la cámara de tu teléfono: abre esta página.",
      cameraNeeded: "La cámara sirve para escanear el código QR de invitación.",
      allowCamera: "Permitir la cámara",
      openSettings: "Abrir los ajustes",
      pasteLabel: "O pega el enlace de invitación",
      checking: "Leyendo la invitación…",
      joining: "Uniéndote al equipo…",
      as: "Cobrarás para {{business}} como {{name}}.",
      rights:
        "Este dispositivo creará facturas pagadas a {{business}}. No tendrá acceso ni al monedero, ni a los ajustes, ni a las ventas de los demás empleados.",
      confirm: "Unirse al equipo",
      scanAnother: "Escanear otra invitación",
      errors: {
        invalid: "Esto no es un enlace de invitación. Comprueba que se haya copiado entero.",
        notFound: "Esta invitación no existe o ha caducado. Pide una nueva al propietario.",
        closed: "Esta invitación ya se ha usado. Pide una nueva al propietario.",
        expired: "Esta invitación ha caducado. Pide una nueva al propietario.",
        newer:
          "Esta invitación viene de una versión más reciente de la app. Actualiza la app y vuelve a intentarlo.",
        unreachable: "Sin conexión. Comprueba tu conexión a internet y vuelve a intentarlo.",
        removed: "El propietario ha retirado esta invitación.",
        alreadySetUp: "Este dispositivo ya cobra para un negocio: no puede unirse a un equipo."
      }
    }
  },
  integrations: {
    create: "Crear una integración",
    loading: "Cargando tus integraciones…",
    guide: {
      title: "Cobra en tu tienda en línea",
      lead: "Una integración permite a una tienda en línea o a una herramienta cobrar a sus clientes en tu cuenta.",
      create: {
        title: "Crea la integración",
        caption: "Elige tu tienda (WooCommerce, PrestaShop…) o el lenguaje de tu servidor."
      },
      key: {
        title: "Entrega la clave secreta",
        caption:
          "Pégala en tu tienda o confíasela a tu desarrollador. Se queda en el servidor, nunca con tus clientes."
      },
      pay: {
        title: "Tus clientes pagan",
        caption: "En cada pedido, la tienda muestra la factura. El pago llega a tu monedero."
      }
    },
    noMatch: "Ninguna integración coincide con los filtros.",
    offline:
      "Ningún relé ha respondido: no se ha podido leer la lista de integraciones. Comprueba la conexión y vuelve a esta pantalla.",
    partial: "No todos los relés han respondido: la lista de integraciones puede estar incompleta.",
    newer:
      "Algunas integraciones vienen de una versión más reciente de la app: actualiza la app para verlas.",
    columns: {
      name: "Nombre",
      date: "Creada el"
    },
    created: "Creada el {{date}}",
    actions: {
      remove: "Retirar la integración"
    },
    createSheet: {
      title: "Nueva integración",
      lead: "Haz tus facturas con una IA, cobra en tu tienda en línea o desde tu propio sitio.",
      invoices: "Facturas",
      shops: "Tiendas en línea",
      developers: "Para desarrolladores",
      developersDetail_one: "SDK: {{names}} y {{count}} más",
      developersDetail_other: "SDK: {{names}} y {{count}} más",
      soon: "Próximamente",
      soonLabel: "{{name}}: próximamente",
      source: "Código fuente",
      sourceLabel: "{{name}}: código fuente en GitHub",
      oneShopTitle: "Una clave para una sola tienda",
      oneShop:
        "Los servidores de una misma tienda comparten su clave; dos tiendas, nunca: sus pedidos se mezclarían, y uno podría pasar por pagado con el pago del otro. Para otra tienda, crea otra integración.",
      namePlaceholder: "Tienda en línea"
    },
    sdk: {
      lead: "El SDK de {{name}} crea en tu servidor la factura de cada pedido y comprueba su pago.",
      package: "El paquete",
      open: "Abrir en {{site}}",
      openLabel: "Abrir {{name}} en {{site}}",
      readme: "Su README explica cómo instalarlo y usarlo.",
      key: "La clave secreta"
    },
    files: {
      show: "Mostrar los pasos de {{name}}",
      copyName: "Copiar el nombre {{name}}",
      nameCopied: "Nombre copiado: {{name}}",
      copy: "Copiar el contenido",
      copied: "Contenido copiado",
      contentCopied: "Contenido de {{name}} copiado",
      copyFailed: "No se pudo copiar. Inténtalo de nuevo.",
      readFailed: "La app no pudo leer este archivo: cierra la guía y vuelve a abrirla.",
      lastLine: "Una vez pegado, termina en la línea {{line}}.",
      pasted: "Pegado",
      progress: "Pegados: {{count}} de {{total}}"
    },
    keyStep: {
      title: "Crear la clave de esta tienda",
      leadShop:
        "Hazlo cuando el campo de la clave esté abierto en {{platform}}: solo se mostrará una vez.",
      leadSdk:
        "Tu servidor la lee de una variable de entorno, nunca de una página web ni de un repositorio de código. Solo se mostrará una vez.",
      shopName: "Nombre de la tienda",
      siteName: "Nombre del sitio o de la herramienta",
      nameHint: "Aparece en tu monedero junto a sus ventas.",
      create: "Crear la clave"
    },
    guides: {
      wix: {
        editor: {
          title: "Abrir el código del sitio",
          body: "En un ordenador, abre el editor de tu sitio Wix. Arriba, haz clic en «Dev Mode» y luego en «Turn on Dev Mode»: a la izquierda del editor aparece una columna de iconos. Esta guía muestra el Editor de Wix; en Wix Studio las pantallas son distintas. Los nombres de Wix aquí son los ingleses.",
          image: "El menú «Dev Mode» del Editor de Wix y su botón «Turn on Dev Mode», enmarcados."
        },
        packages: {
          title: "Abrir los paquetes",
          body: "En esa columna de iconos, haz clic en el cubo («Packages & Apps»). Bajo «npm», haz clic en «+ Install packages from npm».",
          image:
            "El panel «Packages & Apps» de Wix: el icono del cubo y el enlace «+ Install packages from npm», enmarcados."
        },
        install: {
          title: "Instalar dos paquetes de Wix",
          body: "Se abre una ventana «Package Manager». En su búsqueda, escribe @wix/ecom y haz clic en «Install» en la línea @wix/ecom (no en otra de nombre parecido). Espera a que termine y haz lo mismo con @wix/essentials. Cierra la ventana: los dos paquetes aparecen bajo «npm». Son dos herramientas de Wix que el plugin necesita.",
          image:
            "La ventana «Package Manager»: @wix/ecom escrito en su búsqueda y el botón «Install» de la línea @wix/ecom, enmarcados."
        },
        files: {
          title: "Crear los 6 archivos",
          body: "En «Backend & Public» (el icono { } de la columna), crea cada archivo en su lugar, en este orden, y pega su contenido, copiado desde aquí: el del plugin {{version}}, verificado por la app.",
          where: {
            js: "Backend › + › Add .js file",
            file: "Backend › + › Add file",
            servicePlugin: "Service Plugins › + › Payment",
            servicePluginConfig: "Service Plugins › payment-provider › sattlemeCheckout"
          },
          how: {
            js: "Llámalo {{name}} y pega su contenido. Es el más grande: espera a que Wix lo muestre entero antes de hacer clic en otro sitio.",
            file: "Llámalo {{name}}. Wix pone un ejemplo: selecciona todo (Ctrl+A, o ⌘A en un Mac) y pega.",
            servicePlugin:
              "Llama al plugin sattlemeCheckout y luego «Add & Edit Code»: Wix crea este archivo y el siguiente. Comprueba que la pestaña abierta es {{name}}, selecciona todo y pega.",
            servicePluginConfig:
              "Wix lo creó con sattlemeCheckout.js: ábrelo, selecciona todo y pega."
          },
          sharedCode:
            "¿Tu sitio ya tiene su propio {{name}}? No lo reemplaces: pega el contenido copiado al final del tuyo, debajo de sus líneas.",
          sharedJobs:
            "¿Tu sitio ya tiene su propio {{name}}? No lo reemplaces: añade la tarea del plugin (el bloque entre llaves de su lista «jobs») a la lista «jobs» del tuyo, separada por una coma.",
          image:
            "El panel «Backend & Public» de Wix: el + de «Backend» y las opciones «Add .js file» y «Add file» de su menú, enmarcados."
        },
        secrets: {
          title: "Abrir el Secrets Manager",
          body: "En el panel del sitio, «Developer Tools» › «Secrets Manager». Guarda un secreto llamado sattleme-checkout-status-token, con un valor aleatorio de 32 caracteres o más (de tu gestor de contraseñas): la contraseña de la página de estado del plugin. Luego «+ Add Secret» otra vez, llamado sattleme-checkout-key.",
          image:
            "El Secrets Manager de Wix: «Secrets Manager» bajo «Developer Tools» y el enlace «+ Add Secret», enmarcados."
        },
        save: {
          title: "Guardar la clave",
          body: "Pega la clave como valor del secreto sattleme-checkout-key y guarda. Se queda en ese secreto: no la escribas en ningún otro sitio de Wix.",
          image:
            "La ventana «Add secret» de Wix, llamada sattleme-checkout-key: su campo «Value» vacío y su botón «Add Secret», enmarcados."
        },
        publish: {
          title: "Publicar una vez",
          body: "En el editor, haz clic una sola vez en «Publish»: cada clic hace una publicación.",
          image: "La parte superior del Editor de Wix: el botón «Publish», enmarcado."
        },
        status: {
          title: "Abrir la página de estado",
          body: "Abre la dirección de tu sitio seguida de /_functions/sattlemeCheckoutStatus e introduce el token (el valor del secreto sattleme-checkout-status-token). La página muestra el plugin {{version}}. Hazlo antes de conectar: guarda la dirección del sitio, donde pagan tus clientes.",
          image: "La página de estado del plugin: su campo del token y su botón, enmarcados."
        },
        connect: {
          title: "Conectar el pago",
          body: "En el panel, «Settings» › «Accept Payments» › «Bitcoin (Lightning / on-chain)» › «Connect». Primer campo: sattleme-checkout-key, el nombre del secreto, nunca la clave. Segundo campo: 15, los minutos para pagar una factura (de 1 a 60). Luego «Connect».",
          image:
            "El formulario de conexión de Wix: sattleme-checkout-key en su primer campo, 15 en el segundo y el botón «Connect», enmarcados."
        },
        check: {
          title: "Probar un pago",
          body: "Haz un pedido en tu sitio, primero en un sitio de prueba, y elige «Bitcoin (Lightning / on-chain)»: se abre la página de pago del plugin.",
          image:
            "La página de pago del plugin: «Pay with Bitcoin», el importe en sats y el tiempo que queda para pagar."
        }
      },
      bebop: {
        open: {
          title: "Abrir los ajustes de sattle.me",
          body: "En la administración de be-BOP, abre «Pagos» → «sattle.me». Si no está en la lista, actualiza primero be-BOP.",
          image:
            "Captura de pantalla de be-BOP: el menú de la administración, «sattle.me» enmarcado bajo «Payment Settings»"
        },
        save: {
          title: "Pegar la clave y guardar",
          body: "Pega la clave en «Clave de integración (app sattle.me > Integraciones)». Para aceptar también pagos onchain, marca «Aceptar también pagos on-chain (método Bitcoin)». Luego haz clic en «Guardar».",
          image:
            "Captura de pantalla de be-BOP: los ajustes de sattle.me, el campo «Integration key», la casilla «Also take on-chain payments» y el botón «Save» enmarcados"
        },
        test: {
          title: "Probar la conexión",
          body: "Haz clic en «Probar la conexión»: be-BOP lee la integración con su clave, sin hacer ninguna factura, y muestra «Conexión exitosa. Las credenciales de sattle.me funcionan.». Si los pagos onchain están marcados, también comprueba que la integración tenga direcciones Bitcoin: esta app se las da al crearla y luego en cada desbloqueo con tu passkey, con conexión a internet. Si la prueba falla, comprueba la clave, desbloquea esta app y vuelve a probar.",
          image:
            "Captura de pantalla de be-BOP: los ajustes de sattle.me, el botón «Test connection» enmarcado"
        },
        prefer: {
          title: "Poner sattle.me en primer lugar",
          body: "Si otro procesador ya acepta pagos Lightning u onchain en tu tienda, abre «Configuración» → «General». En «Preferencias del procesador de pago», elige «sattleme» como «Procesador Lightning preferido» y «sattleme-onchain» como «Procesador Bitcoin on-chain preferido», y luego haz clic en «Actualizar» al final de la página.",
          image:
            "Captura de pantalla de be-BOP: «Payment processor preferences», sattleme-onchain y sattleme elegidos y enmarcados"
        },
        check: {
          title: "Comprobar tu tienda",
          body: "En el paso del pago, tus clientes ya pueden elegir «Lightning» como «Método de pago», y también «Onchain» si marcaste los pagos onchain: be-BOP lo ofrece a partir de 10 000 sats. Una vez hecho el pedido, lo pagan escaneando un código QR. Un pago onchain paga el pedido tras 3 confirmaciones, unos 30 minutos, más con comisiones bajas. Cada pago es un pago real en bitcoin, a tu monedero.",
          image:
            "Captura de pantalla de una tienda be-BOP: «Lightning» como «Payment method» en el paso del pago"
        }
      },
      pretix: {
        plugins: {
          title: "Abrir los plugins del evento",
          body: "En el backend de pretix, abre tu evento y luego, en su menú, «Ajustes» → «Plugins».",
          image:
            "Captura de pantalla de pretix: el menú del evento, «Plugins» enmarcado bajo «Settings»"
        },
        enable: {
          title: "Activar el plugin",
          body: "Busca «sattle.me» y haz clic en «Habilitar».",
          image:
            "Captura de pantalla de pretix: los plugins, filtrados por «sattle.me», su botón «Enable» enmarcado"
        },
        open: {
          title: "Abrir sus ajustes",
          body: "En «Ajustes» → «Pago», haz clic en «Ajustes» junto a «Bitcoin (sattle.me)».",
          image:
            "Captura de pantalla de pretix: los métodos de pago, el botón «Settings» de «Bitcoin (sattle.me)» enmarcado"
        },
        save: {
          title: "Pegar la clave y guardar",
          body: "Marca «Habilitar método de pago», pega la clave en «Integration key» y haz clic en «Guardar» al final de la página: pretix la comprueba y después no la vuelve a mostrar. «Time to pay» es el tiempo que tiene el cliente para pagar una factura: de 1 a 60 minutos, 15 por defecto.",
          image:
            "Captura de pantalla de pretix: los ajustes de Bitcoin (sattle.me), la casilla «Enable payment method» y el campo «Integration key» enmarcados"
        },
        channels: {
          title: "Elegir los canales de venta",
          body: "En la misma página, «Restringir a canales de venta específicos» indica dónde pueden pagar tus clientes en bitcoin: «Tienda en línea» por defecto. Marca los demás canales que quieras y haz clic en «Guardar».",
          image:
            "Captura de pantalla de pretix: «Restrict to specific sales channels», su casilla «Online shop» enmarcada"
        },
        check: {
          title: "Comprobar tu tienda",
          body: "En el paso del pago, tus clientes ya pueden elegir «Bitcoin» y escanear un código QR: en Lightning por debajo de unos 1000 sats, en Lightning u onchain por encima. Un pago onchain aparece en confirmación en menos de un minuto y paga el pedido tras 3 confirmaciones, unos 30 minutos, más con comisiones bajas. Cuando mempool.space tarda en responder, una factura puede crearse solo en Lightning. Incluso en el modo de prueba de pretix, cada pago es un pago real en bitcoin, a tu monedero.",
          image: "Captura de pantalla de una tienda pretix: «Bitcoin» en el paso del pago"
        }
      },
      nopcommerce: {
        download: {
          title: "Descargar el plugin",
          body: "Descarga el plugin: un archivo .zip, que debes conservar tal cual, sin descomprimirlo. Requiere nopCommerce 5.00.",
          link: "Abrir el marketplace de nopCommerce",
          file: "Descargar la versión {{version}}"
        },
        plugins: {
          title: "Abrir los plugins locales",
          body: "En la administración de nopCommerce, abre «Configuration» → «Local plugins».",
          image:
            "Captura de pantalla de nopCommerce: el menú de la administración, «Local plugins» enmarcado"
        },
        upload: {
          title: "Subir el archivo",
          body: "Haz clic en «Upload plugin or theme», elige el archivo y luego haz clic en «Upload plugin or theme» en la ventana que se abre.",
          image:
            "Captura de pantalla de nopCommerce: la ventana «Upload plugin or theme», el archivo elegido, su botón «Upload plugin or theme» enmarcado"
        },
        restart: {
          title: "Reiniciar nopCommerce",
          body: "Haz clic en «Restart application to apply changes» en la parte superior de la página y espera a que la página vuelva a mostrarse: tu tienda no responde mientras nopCommerce se reinicia. El plugin solo aparece en la lista después de este reinicio.",
          image:
            "Captura de pantalla de nopCommerce: «Local plugins», su botón «Restart application to apply changes» enmarcado"
        },
        install: {
          title: "Instalar el plugin",
          body: "En la lista, busca «Bitcoin (sattle.me)», en el grupo «Payment methods», haz clic en «Install» y luego otra vez en «Restart application to apply changes».",
          image:
            "Captura de pantalla de nopCommerce: el plugin Bitcoin (sattle.me) en la lista, su botón «Install» enmarcado"
        },
        open: {
          title: "Abrir sus ajustes",
          body: "Una vez reiniciado nopCommerce, haz clic en «Configure» bajo «Bitcoin (sattle.me)». También lo encuentras en «Configuration» → «Payment methods».",
          image:
            "Captura de pantalla de nopCommerce: el plugin Bitcoin (sattle.me), instalado, su botón «Configure» enmarcado"
        },
        save: {
          title: "Pegar la clave y guardar",
          body: "Marca «Enabled», pega la clave en «Integration key» y haz clic en «Save» al final de la página: el plugin la comprueba y después no la vuelve a mostrar. «Time to pay (minutes)» es el tiempo que tiene el cliente para pagar una factura: de 1 a 60 minutos, 15 por defecto.",
          image:
            "Captura de pantalla de nopCommerce: los ajustes de Bitcoin (sattle.me), la casilla «Enabled» y el campo «Integration key» enmarcados"
        },
        check: {
          title: "Comprobar tu tienda",
          body: "En el paso del pago, tus clientes ya pueden elegir «Bitcoin». Una vez confirmado el pedido, lo pagan en una página de tu tienda escaneando un código QR: en Lightning por debajo de unos 1000 sats, en Lightning u onchain por encima. Un pago onchain paga el pedido tras 3 confirmaciones, unos 30 minutos, más con comisiones bajas. Los pagos también los comprueban las tareas programadas de nopCommerce, que deben poder llegar a la URL de tu tienda. Cada pago es un pago real en bitcoin, a tu monedero.",
          image: "Captura de pantalla de una tienda nopCommerce: «Bitcoin» en el paso del pago"
        },
        autoCancel: {
          title: "Excluir Bitcoin de la cancelación automática",
          body: "Si «Enable auto-canceling of unpaid orders» está marcada («Configuration» → «Settings» → «Order settings»), añade «Bitcoin (sattle.me)» a sus «Excluded payment methods», para que no se cancele un pedido cuyo pago está en confirmación."
        }
      },
      woocommerce: {
        download: {
          title: "Descargar el plugin",
          body: "Descarga el archivo del plugin, sattleme-for-woocommerce-….zip, y consérvalo tal cual, sin descomprimirlo. El plugin requiere WordPress 7.0, WooCommerce 11.1 y PHP 8.2, o más recientes.",
          link: "Abrir la página de GitHub del plugin",
          file: "Descargar la versión {{version}}"
        },
        upload: {
          title: "Subir el archivo",
          body: "En la administración de WordPress, abre «Plugins» → «Añadir plugin», haz clic en «Subir plugin» arriba de la página, elige el archivo y luego haz clic en «Instalar ahora».",
          image:
            "Captura de pantalla de WordPress: «Upload Plugin» y el archivo elegido, sus botones «Upload Plugin» e «Install Now» enmarcados"
        },
        activate: {
          title: "Activar el plugin",
          body: "Una vez instalado el plugin, haz clic en «Activar plugin».",
          image:
            "Captura de pantalla de WordPress: el plugin instalado, su botón «Activate Plugin» enmarcado"
        },
        open: {
          title: "Abrir sus ajustes",
          body: "En «Plugins», bajo «sattle.me for WooCommerce», haz clic en «Settings». También llegas por «WooCommerce» → «Ajustes» → «Pagos», con el nombre «sattle.me (Bitcoin)».",
          image:
            "Captura de pantalla de WordPress: el plugin sattle.me for WooCommerce en la lista de plugins, su enlace «Settings» enmarcado"
        },
        save: {
          title: "Pegar la clave y guardar",
          body: "Marca «Accept Bitcoin payments with sattle.me», pega la clave en «Integration key» y luego haz clic en «Guardar cambios» al final de la página: el plugin comprueba la clave y ya no la vuelve a mostrar. La página indica entonces «Connected to», seguido del nombre de tu empresa. «Time to pay» es el tiempo que tiene el cliente para pagar una factura: de 1 a 60 minutos, 15 por defecto.",
          image:
            "Captura de pantalla de WordPress: los ajustes de sattle.me (Bitcoin) guardados, «Connected to» y la casilla marcada enmarcados"
        },
        check: {
          title: "Comprobar tu tienda",
          body: "En el paso del pago, tus clientes ya pueden pagar en bitcoin, con el logo de sattle.me. Una vez realizado el pedido, lo pagan en una página de tu tienda escaneando un código QR: en Lightning por debajo de unos 1.000 sats, en Lightning u onchain por encima. Un pago onchain paga el pedido tras 3 confirmaciones, unos 30 minutos, más con comisiones bajas. El plugin también comprueba los pagos cada minuto, incluso con la página de pago cerrada, con las tareas programadas de WordPress (WP-Cron): en una tienda con pocas visitas, haz que el cron de tu servidor las lance cada minuto, como explica el README del plugin. Cada pago es un pago real en bitcoin, a tu monedero.",
          image:
            "Captura de pantalla de una tienda WooCommerce: el pago en bitcoin en el paso del pago"
        }
      },
      grandnode: {
        download: {
          title: "Descargar el plugin",
          body: "Descarga el archivo del plugin, Payments.Sattleme-….zip, y consérvalo tal cual, sin descomprimirlo. Requiere GrandNode 2.4.",
          link: "Abrir la página de GitHub del plugin",
          file: "Descargar la versión {{version}}"
        },
        plugins: {
          title: "Abrir los plugins locales",
          body: "En la administración de GrandNode, abre «Plugins» → «Local plugins».",
          image:
            "Captura de pantalla de GrandNode: el menú «Plugins» de la administración, «Local plugins» enmarcado"
        },
        upload: {
          title: "Subir el archivo",
          body: "Haz clic en «Upload» en la parte superior de la página, elige el archivo y luego haz clic en «Upload» en la ventana que se abre. GrandNode muestra «Plugin uploaded» y luego se detiene para reiniciarse: recarga la página en tu navegador (no con «Reload list of plugins», que vuelve a detener GrandNode) hasta que vuelva a aparecer la lista de plugins; tu tienda no responde mientras tanto. Si sigue sin responder al cabo de unos minutos, reinicia GrandNode (su servicio o su contenedor).",
          image:
            "Captura de pantalla de GrandNode: la ventana «Upload», el archivo elegido, su botón «Upload» enmarcado"
        },
        install: {
          title: "Instalar el plugin",
          body: "En la lista, busca «Bitcoin (sattle.me)», en el grupo «Payment methods»: su etiqueta «Installed» sigue en rojo mientras no esté instalado. Haz clic en «Install»: GrandNode vuelve a reiniciarse. Recarga la página de la misma forma.",
          image:
            "Captura de pantalla de GrandNode: el plugin Bitcoin (sattle.me) en la lista, su botón «Install» enmarcado"
        },
        open: {
          title: "Abrir sus ajustes",
          body: "Cuando aparezca «Configure» junto a «Bitcoin (sattle.me)», haz clic en él. También encuentras sus ajustes en «Configuration» → «Payment» → «Payment methods», con el nombre «Bitcoin».",
          image:
            "Captura de pantalla de GrandNode: el plugin Bitcoin (sattle.me), instalado, su botón «Configure» enmarcado"
        },
        save: {
          title: "Pegar la clave y guardar",
          body: "Activa «Enabled», pega la clave en «Integration key» y haz clic en «Save» en la parte superior de la página: el plugin la comprueba y después no la vuelve a mostrar. «Time to pay (minutes)» es el tiempo que tiene el cliente para pagar una factura: de 1 a 60 minutos, 15 por defecto.",
          image:
            "Captura de pantalla de GrandNode: los ajustes de Bitcoin (sattle.me), «Enabled», el campo «Integration key» y «Save» enmarcados"
        },
        check: {
          title: "Comprobar tu tienda",
          body: "En el paso del pago, tus clientes ya pueden pagar en bitcoin, con el logo de sattle.me. Una vez confirmado el pedido, lo pagan en una página de tu tienda escaneando un código QR: en Lightning por debajo de unos 1000 sats, en Lightning u onchain por encima. Un pago onchain paga el pedido tras 3 confirmaciones, unos 30 minutos, más con comisiones bajas. GrandNode también comprueba los pagos cada minuto, incluso con la página de pago cerrada. Cada pago es un pago real en bitcoin, a tu monedero.",
          image:
            "Captura de pantalla de una tienda GrandNode: el pago en bitcoin en el paso del pago"
        }
      },
      smartstore: {
        download: {
          title: "Descargar el plugin",
          body: "Descarga el paquete del plugin, Smartstore.Module.Sattleme.Bitcoin.….zip, y consérvalo tal cual, sin descomprimirlo. El plugin requiere Smartstore 6.4.",
          link: "Abrir la página de GitHub del plugin",
          file: "Descargar la versión {{version}}"
        },
        plugins: {
          title: "Abrir los plugins",
          body: "En la administración de Smartstore, abre «Plugins» → «Manage plugins».",
          image:
            "Captura de pantalla de Smartstore: el menú «Plugins» de la administración, «Manage plugins» enmarcado"
        },
        upload: {
          title: "Subir el paquete",
          body: "Haz clic en «Upload plugin» en la parte superior de la página y elige el paquete: Smartstore lo sube al momento y confirma que está subido y descomprimido.",
          image:
            "Captura de pantalla de Smartstore: la página de los plugins, su botón «Upload plugin» enmarcado"
        },
        reload: {
          title: "Recargar la lista de plugins",
          body: "Haz clic en «Edit» → «Reload list of plugins». Smartstore se reinicia: espera a que la página vuelva a mostrarse, tu tienda no responde mientras tanto.",
          image:
            "Captura de pantalla de Smartstore: el menú «Edit», «Reload list of plugins» enmarcado"
        },
        install: {
          title: "Instalar el plugin",
          body: "En la lista, busca «Bitcoin (sattle.me)» y haz clic en «Install»: Smartstore pone su instalación en espera.",
          image:
            "Captura de pantalla de Smartstore: el plugin Bitcoin (sattle.me) en la lista, su botón «Install» enmarcado"
        },
        execute: {
          title: "Ejecutar la instalación",
          body: "Haz clic en «Execute tasks» en la parte superior de la página y luego en «OK». Smartstore vuelve a reiniciarse e instala el plugin: espera a que la página vuelva a mostrarse.",
          image:
            "Captura de pantalla de Smartstore: la página de los plugins, su botón «Execute tasks» enmarcado"
        },
        open: {
          title: "Abrir sus ajustes",
          body: "Bajo «Bitcoin (sattle.me)», haz clic en el botón del engranaje y luego en «Configure». También encuentras sus ajustes en «Configuration» → «Payment methods», con el nombre «Bitcoin».",
          image:
            "Captura de pantalla de Smartstore: el plugin Bitcoin (sattle.me), instalado, su engranaje y «Configure» enmarcados"
        },
        save: {
          title: "Pegar la clave y guardar",
          body: "Pega la clave en «Integration key» y haz clic en «Save» en la parte superior de la página: el plugin la comprueba y después no la vuelve a mostrar. «Time to pay (minutes)» es el tiempo que tiene el cliente para pagar una factura: de 1 a 60 minutos, 15 por defecto.",
          image:
            "Captura de pantalla de Smartstore: los ajustes de Bitcoin (sattle.me), el campo «Integration key» y «Save» enmarcados"
        },
        activate: {
          title: "Activar el método de pago",
          body: "Abre «Configuration» → «Payment methods» y haz clic en «Activate» bajo «Bitcoin»: tu tienda solo lo ofrece en el pago una vez activado.",
          image:
            "Captura de pantalla de Smartstore: los métodos de pago, el botón «Activate» de Bitcoin enmarcado"
        },
        timezone: {
          title: "Ajustar la zona horaria de tu tienda",
          body: "En «Configuration» → «Settings», elige tu «Default store time zone» y guarda: la página de pago indica en ella hasta cuándo puede pagar el cliente. Sin ella, Smartstore usa la de su servidor, a menudo UTC."
        },
        check: {
          title: "Comprobar tu tienda",
          body: "En el paso del pago, tus clientes ya pueden elegir «Bitcoin». Una vez confirmado el pedido, lo pagan en una página de tu tienda escaneando un código QR: en Lightning por debajo de unos 1000 sats, en Lightning u onchain por encima. Un pago onchain paga el pedido tras 3 confirmaciones, unos 30 minutos, más con comisiones bajas. Smartstore también comprueba los pagos cada minuto, incluso con la página de pago cerrada, siempre que sus tareas programadas lleguen a la dirección de tu tienda. Cada pago es un pago real en bitcoin, a tu monedero.",
          image: "Captura de pantalla de una tienda Smartstore: «Bitcoin» en el paso del pago"
        }
      },
      prestashop: {
        download: {
          title: "Descargar el módulo",
          body: "Descarga el archivo del módulo, sattleme.zip, y consérvalo tal cual, sin descomprimirlo. El módulo requiere PrestaShop 9.0, 9.1 o 9.2, con PHP 8.2 a 8.5.",
          link: "Abrir la página de GitHub del módulo",
          file: "Descargar la versión {{version}}"
        },
        upload: {
          title: "Abrir el gestor de módulos",
          body: "En el back office de PrestaShop, abre «Modules» → «Module Manager» y luego haz clic en «Upload a module» en la parte superior de la página.",
          image:
            "Captura de pantalla de PrestaShop: el gestor de módulos, su botón «Upload a module» enmarcado"
        },
        drop: {
          title: "Subir el archivo",
          body: "Suelta el archivo en la ventana, o haz clic en «select file» y elígelo: PrestaShop sube el módulo y lo instala al momento.",
          image:
            "Captura de pantalla de PrestaShop: la ventana «Upload a module», su zona para el archivo enmarcada"
        },
        open: {
          title: "Abrir sus ajustes",
          body: "Cuando PrestaShop muestre «Module installed!», haz clic en «Configure». También encuentras sus ajustes en «Modules» → «Module Manager», bajo «sattle.me».",
          image:
            "Captura de pantalla de PrestaShop: «Module installed!», su botón «Configure» enmarcado"
        },
        save: {
          title: "Pegar la clave y guardar",
          body: "Activa «Accept bitcoin payments», pega la clave en «Integration key» y haz clic en «Save» en la parte inferior de la página: el módulo comprueba la clave y después no la vuelve a mostrar. La página indica entonces «The integration key of», seguido del nombre de tu negocio. «Time to pay» es el tiempo que tiene el cliente para pagar una factura: de 1 a 60 minutos, 15 por defecto.",
          image:
            "Captura de pantalla de PrestaShop: los ajustes de sattle.me, «Accept bitcoin payments» y el campo «Integration key» enmarcados"
        },
        cron: {
          title: "Programar las comprobaciones en segundo plano",
          body: "Bajo «Background checks», la página da una línea para el crontab de tu servidor: añádela al crontab del usuario del servidor web, o como tarea cron en el panel de tu alojamiento, para que se ejecute cada minuto. El módulo comprueba entonces los pagos cada minuto, incluso con la página de pago cerrada. Mientras no se haya ejecutado, la página indica «The background checks never ran: set up the cron.».",
          image:
            "Captura de pantalla de PrestaShop: los ajustes de sattle.me guardados, la línea de crontab bajo «Background checks» enmarcada"
        },
        check: {
          title: "Comprobar tu tienda",
          body: "En el paso del pago, tus clientes ya pueden elegir «Pay with bitcoin». Una vez realizado el pedido, lo pagan en una página de tu tienda escaneando un código QR: en Lightning por debajo de unos 1000 sats, en Lightning u onchain por encima. Un pago onchain paga el pedido tras 3 confirmaciones, unos 30 minutos, más con comisiones bajas. Cada pago es un pago real en bitcoin, a tu monedero.",
          image:
            "Captura de pantalla de una tienda PrestaShop: «Pay with bitcoin» en el paso del pago"
        }
      },
      magento: {
        install: {
          title: "Instalar el módulo",
          body: "En el servidor de tu Magento, desde la carpeta raíz de Magento y con el usuario del servidor web, instala el módulo desde Packagist con Composer y actívalo con estos comandos. El módulo necesita Magento Open Source 2.4.7, 2.4.8 o 2.4.9, con PHP 8.2 a 8.5. En modo desarrollador, «setup:di:compile» y «setup:static-content:deploy» no son necesarios.",
          link: "Abrir la página de Packagist del módulo"
        },
        open: {
          title: "Abrir sus ajustes",
          body: "En el admin de Magento, abre «Stores» → «Configuration», luego «Sales» → «Payment Methods», y despliega «Bitcoin (sattle.me)».",
          image:
            "Captura de pantalla del admin de Magento: los métodos de pago, «Bitcoin (sattle.me)» enmarcado"
        },
        save: {
          title: "Pegar la clave y guardar",
          body: "Pon «Enabled» en «Yes», pega la clave en «Integration key» y haz clic en «Save Config» en la parte superior de la página: el módulo comprueba la clave y después no la vuelve a mostrar. «Connected to» muestra entonces el nombre de tu negocio. «Time to pay (minutes)» es el tiempo que tiene el cliente para pagar una factura: de 1 a 60 minutos, 15 por defecto.",
          image:
            "Captura de pantalla del admin de Magento: los ajustes de Bitcoin (sattle.me), «Enabled» y el campo «Integration key» enmarcados"
        },
        cron: {
          title: "Comprobar el cron de Magento",
          body: "El módulo comprueba los pagos cada minuto, incluso con la página de pago cerrada, mediante el cron de Magento, que también cancela los pedidos que quedan sin pagar. Un Magento en producción ya lo ejecuta; si el tuyo no, instálalo desde la carpeta raíz de Magento, con el usuario del servidor web, con este comando."
        },
        check: {
          title: "Comprobar tu tienda",
          body: "En el paso del pago, tus clientes ya pueden elegir «Bitcoin». Una vez realizado el pedido, lo pagan en una página de tu tienda escaneando un código QR: en Lightning por debajo de unos 1000 sats, en Lightning u onchain por encima. Un pago onchain paga el pedido tras 3 confirmaciones, unos 30 minutos, más con comisiones bajas. Cada pago es un pago real en bitcoin, a tu monedero.",
          image: "Captura de pantalla de una tienda Magento: «Bitcoin» en el paso del pago"
        }
      }
    },
    assistant: {
      row: "Asistente IA",
      rowDetail: "Claude, ChatGPT… hacen tus facturas",
      title: "Asistente IA",
      lead: "Tu asistente IA hace las facturas de tu negocio, numeradas junto con las tuyas, con su enlace de pago y su PDF, y te dice cuándo están pagadas. Nunca gasta nada.",
      hosted: {
        title: "En Claude, ChatGPT…",
        detail: "Listo para usar, alojado por sattle.me",
        badge: "Lo más sencillo"
      },
      desktop: { title: "En Claude Desktop", detail: "La clave se queda en tu ordenador" },
      selfHosted: {
        title: "En tu propio servidor",
        detail: "Su código abierto, en GitHub",
        badge: "Para expertos"
      },
      hostedSteps: {
        add: {
          title: "Añade el conector",
          claude:
            "En Claude, este botón abre el alta del conector, ya rellenada: revísala y confirma.",
          other:
            "En ChatGPT u otra app de IA, añade un conector personalizado (servidor MCP) con esta dirección, tal cual:"
        },
        addClaude: "Añadir a Claude",
        openChatGpt: "Abrir ChatGPT",
        copy: "Copiar la dirección",
        copied: "Dirección copiada",
        copyFailed: "No se pudo copiar la dirección",
        connect: {
          title: "Conéctate",
          body: "La app abre una página de sattle.me que pide la clave del asistente. Esa página indica adónde te devolverá: continúa solo si es tu app de IA."
        }
      },
      desktopSteps: {
        download: {
          title: "Descarga la extensión",
          body: "El archivo «.mcpb» de la última versión.",
          link: "La extensión en github.com",
          file: "Descargar la versión {{version}}"
        },
        open: {
          title: "Ábrela",
          body: "Abre el archivo: Claude Desktop instala el asistente y pide su clave."
        }
      },
      selfHostedSteps: {
        install: {
          title: "Instala el servidor",
          body: "El mismo servidor MCP que el de sattle.me, en una máquina tuya o de tu proveedor, con Docker. Su código abierto y su guía de instalación están en GitHub.",
          link: "sattleme/mcp-server en github.com"
        },
        trust: {
          title: "Este servidor ve tus facturas",
          body: "Quien lo gestiona ve la clave del asistente y las facturas que hace: nombres y direcciones de tus clientes, importes. Si dejas de confiar, elimina el asistente: se detiene enseguida."
        },
        add: {
          title: "Añade el conector",
          body: "Cuando el servidor esté en línea, añade su dirección como conector personalizado en tu app de IA (Claude, ChatGPT…)."
        },
        connect: {
          title: "Conéctate",
          body: "La app abre una página de tu servidor que pide la clave del asistente. Esa página indica adónde te devolverá: continúa solo si es tu app de IA."
        }
      },
      keyStep: {
        title: "Crea la clave del asistente",
        leadHosted: "Hazlo cuando la página de sattle.me la pida: solo se muestra una vez.",
        leadDesktop: "Hazlo cuando Claude Desktop la pida: solo se muestra una vez.",
        leadSelfHosted: "Hazlo cuando la página de tu servidor la pida: solo se muestra una vez.",
        name: "Nombre del asistente",
        namePlaceholder: "Claude de Alice",
        nameHint: "Aparece en tu monedero junto a sus facturas.",
        permissionsTitle: "Lo que podrá hacer este asistente",
        nonePicked: "Activa al menos un permiso para crear la clave.",
        powerTitle: "Nunca permite gastar",
        power: {
          hosted: "Pégala solo en la página de sattle.me, nunca en una conversación.",
          desktop: "Pégala solo en Claude Desktop, nunca en una conversación.",
          selfHosted: "Pégala solo en la página de tu servidor, nunca en una conversación."
        }
      },
      keySheet: {
        once: "Solo se muestra una vez: cópiala ahora. No podrá volver a mostrarse, ni siquiera con tu passkey. Si la pierdes, retira el asistente y crea otro.",
        unpublished:
          "Aún no se pudo publicar el asistente {{name}} en tus relés. Se publicará en el próximo desbloqueo con tu passkey, con conexión a internet: hasta entonces, no puede hacer nada.",
        secret:
          "Mantenla en secreto. Si se ha filtrado, retira el asistente y crea otro: las facturas ya hechas siguen siendo pagables.",
        pasteHosted:
          "Pégala en la página de sattle.me. Después pide, por ejemplo: «Haz una factura a Dupont SA por 3 días de consultoría a 1200 CHF, con vencimiento a 30 días.»",
        pasteDesktop:
          "Pégala en el campo «Assistant key» de Claude Desktop. Después pide, por ejemplo: «Haz una factura a Dupont SA por 3 días de consultoría a 1200 CHF, con vencimiento a 30 días.»",
        pasteSelfHosted:
          "Pégala en la página de tu servidor. Después pide, por ejemplo: «Haz una factura a Dupont SA por 3 días de consultoría a 1200 CHF, con vencimiento a 30 días.»",
        pasteHostedExport:
          "Pégala en la página de sattle.me. Después pide, por ejemplo: «Exporta las transacciones del mes pasado en CSV para mi contable.»",
        pasteSelfHostedExport:
          "Pégala en la página de tu servidor. Después pide, por ejemplo: «Exporta las transacciones del mes pasado en CSV para mi contable.»",
        pasteDesktopExport:
          "Pégala en el campo «Assistant key» de Claude Desktop. Después pide, por ejemplo: «Exporta las transacciones del mes pasado en CSV para mi contable.»"
      },
      created: "Asistente IA · creado el {{date}}",
      createdExporting: "Asistente IA · creado el {{date}} · exporta tus transacciones",
      createdExportOnly:
        "Asistente IA · creado el {{date}} · exporta tus transacciones, sin facturas",
      createdNoInvoices: "Asistente IA · creado el {{date}} · sin facturas",
      invoicing: {
        switch: "Hacer facturas",
        switchHint:
          "Al activarlo, autorizas a este asistente IA a hacer facturas en nombre de tu negocio, numeradas junto con las tuyas, y a leer las que ha hecho, con los nombres y direcciones de tus clientes. Esta elección ya no podrá cambiarse para esta clave."
      },
      export: {
        allow: "Permitir exportar las transacciones",
        withdraw: "Retirar la exportación de las transacciones",
        switch: "Acceso a tus ventas y envíos",
        switchHint:
          "Al activarlo, autorizas a este asistente IA a leer las ventas y los envíos de tu negocio, para exportarlos. Nunca podrá gastar.",
        suspended:
          "No disponible temporalmente: el acceso de los asistentes de IA a tus ventas y envíos se volverá a ofrecer en una próxima versión.",
        allowDialog: {
          title: "¿Permitir que {{name}} exporte tus transacciones?",
          body: "{{name}} podrá leer las ventas y los envíos de {{business}} registrados en tus relés y exportarlos como «$t(navigation.destinations.wallet) › $t(walletExport.open)». Los pagos recibidos sin venta (directamente en tu dirección Lightning o en tu monedero) no se incluyen. Nunca podrá gastar. Si retiras el permiso, ya no exportará, pero una copia de su clave hecha hasta entonces podría seguir leyendo tus ventas registradas antes.",
          confirm: "Permitir"
        },
        withdrawDialog: {
          title: "¿Retirar la exportación a {{name}}?",
          body: "{{name}} ya no podrá exportar las transacciones de {{business}}. Lo que ya exportó se queda en tu aplicación de IA.",
          confirm: "Retirar la exportación"
        },
        allowedTitle: "Exportación permitida",
        allowedBody: "{{name}} puede exportar tus transacciones",
        withdrawnTitle: "Exportación retirada",
        withdrawnBody: "{{name}} ya no puede exportar tus transacciones",
        unreachable:
          "No se pudo publicar el permiso. Comprueba tu conexión a internet y vuelve a intentarlo",
        createFailedTitle: "Exportación aún no permitida",
        createFailed:
          "{{name}} se creó, pero no se pudo permitir la exportación. Vuelve a intentarlo desde la lista de integraciones"
      },
      remove: "Retirar el asistente",
      removeDialog: {
        title: "¿Retirar a {{name}}?",
        body: "{{name}} ya no hará facturas para {{business}}. Las que hizo siguen siendo pagables hasta su vencimiento, y en tu monedero.",
        confirm: "Retirar el asistente",
        doneTitle: "Asistente retirado",
        doneBody: "{{name}} ya no hará facturas."
      }
    },
    keySheet: {
      title: "Clave de {{name}}",
      keyLabel: "Clave secreta",
      once: "Solo se muestra una vez: cópiala ahora. No podrá volver a mostrarse, ni siquiera con tu passkey. Si la pierdes, retira la integración y crea otra.",
      unpublished:
        "Aún no se pudo publicar {{name}} en tus relés. Se publicará en el próximo desbloqueo con tu passkey, con conexión a internet: hasta entonces, su servidor no la encuentra.",
      secret:
        "Mantenla en secreto, solo en los servidores de esa tienda: nunca en una página web, en una app ni para otra tienda. No permite gastar tus fondos. Si se ha filtrado, retira la integración y crea otra.",
      copy: "Copiar la clave",
      copied: "Clave copiada",
      copyFailed: "No se pudo copiar la clave. Selecciónala y luego cópiala.",
      done: "Terminar"
    },
    removeDialog: {
      title: "¿Retirar {{name}}?",
      body: "Su clave ya no podrá crear solicitudes de pago para {{business}}. Una solicitud ya mostrada se puede pagar hasta que termine, y sus ventas pasadas siguen en el monedero.",
      confirm: "Retirar la integración",
      doneTitle: "Integración retirada",
      doneBody: "La clave de {{name}} ya no crea solicitudes de pago."
    },
    pendingDialog: {
      title: "{{name}} tiene pagos en curso",
      unknownTitle: "Pagos de {{name}} no verificados",
      lead: "Espera a que los pagos de {{name}} sean definitivos antes de retirarla, para que cada una de sus ventas siga a su nombre.",
      unknownLead:
        "No se ha podido verificar si los pagos de {{name}} son definitivos. Espera a que lo sean antes de retirarla, para que cada una de sus ventas siga a su nombre.",
      open_one: "{{count}} solicitud de pago aún abierta, hasta las {{time}} como máximo.",
      open_other: "{{count}} solicitudes de pago aún abiertas, hasta las {{time}} como máximo.",
      confirming_one:
        "{{count}} pago en Bitcoin pendiente de confirmación (3 confirmaciones, unos treinta minutos).",
      confirming_other:
        "{{count}} pagos en Bitcoin pendientes de confirmación (3 confirmaciones, unos treinta minutos).",
      end: "Vuelve a intentarlo después.",
      forceNote:
        "Si no puedes esperar (su clave se ha filtrado, por ejemplo), retírala de todos modos: sus pagos seguirán llegando a tu monedero, pero los que no haya visto antes de su retirada no estarán a su nombre.",
      force: "Retirar de todos modos",
      retry: "Reintentar",
      close: "Cerrar"
    },
    failedTitle: "Acción imposible",
    unreachableTitle: "No hay conexión",
    errors: {
      noAccount: "Desbloquea este punto de venta con tu passkey para gestionar las integraciones.",
      tooMany: "Tu cuenta ya tiene {{max}} integraciones. Retira una para crear otra.",
      tooManyAssistants: "Tu cuenta ya tiene {{max}} asistentes. Retira uno para crear otro.",
      invalidName: "Introduce el nombre de la integración.",
      unreachable:
        "No se pudo publicar la integración. Comprueba tu conexión a internet y vuelve a intentarlo.",
      removeUnreachable:
        "No se ha podido publicar la retirada. Comprueba tu conexión a internet y vuelve a intentarlo.",
      removeFailed: "No se ha podido guardar la retirada. Vuelve a intentarlo.",
      removalUnsaved:
        "La clave de esta integración ya no crea solicitudes de pago, pero no se ha podido guardar su retirada. Vuelve a intentarlo: también se guardará la próxima vez que abras tu cuenta.",
      exportNewer:
        "Una versión más reciente de la app modificó este asistente. Actualiza la app para cambiarlo"
    }
  },
  articles: {
    add: "Añadir un artículo",
    loading: "Cargando tus artículos…",
    guide: {
      title: "Vende con unos toques",
      lead: "Crea una vez tus bebidas, platos y postres: aparecen en tu caja y en la de tus empleados.",
      create: {
        title: "Crea tus artículos",
        caption:
          "Un nombre, un precio, una foto. Escanea un código de barras para rellenar la ficha más rápido.",
        captionNoScan: "Un nombre, un precio, una foto."
      },
      tap: {
        title: "Tócalos en la caja",
        caption:
          "Pasa a «$t(pos.mode.articles)»: cada toque añade el artículo a la cesta. En la aplicación del teléfono, también puedes escanear su código de barras."
      },
      cash: {
        title: "Cobra la cesta",
        caption: "El total se calcula solo: tu cliente escanea el código QR y paga."
      }
    },
    offline: "Ningún relé ha respondido. Comprueba la conexión y vuelve a esta pantalla.",
    newer:
      "Algunos artículos vienen de una versión más reciente de la app: actualiza la app para verlos.",
    openHint: "Abre el artículo para modificarlo o eliminarlo.",
    saved: {
      title: "Artículo guardado",
      body: "{{name}} está en tus artículos."
    },
    changed: {
      title: "Artículo modificado",
      body: "{{name}} está actualizado."
    },
    removed: {
      title: "Artículo eliminado",
      body: "{{name}} ya no está en tus artículos."
    },
    removeDialog: {
      title: "¿Eliminar {{name}}?",
      body: "El artículo desaparece de tus artículos, en todos tus dispositivos. Esta acción es definitiva.",
      confirm: "Eliminar el artículo"
    },
    form: {
      title: "Nuevo artículo",
      editTitle: "Modificar el artículo",
      scan: "Escanear",
      addPhoto: "Añadir una foto",
      changePhoto: "Cambiar la foto",
      preparingPhoto: "Preparando la foto…",
      dropPhoto: "Arrastra una foto aquí",
      choosePhoto: "o elige un archivo",
      photoMenu: "Foto del artículo",
      takePhoto: "Hacer una foto",
      pickPhoto: "Elegir entre tus fotos",
      nameLabel: "Nombre",
      namePlaceholder: "Nombre del artículo",
      priceLabel: "Precio",
      priceInvalid: "Introduce un precio como 4,80",
      descriptionLabel: "Descripción",
      descriptionPlaceholder: "Ingredientes, formato, alérgenos",
      addDescription: "Añadir una descripción",
      fromOpenFoodFacts: "· de Open Food Facts",
      searching: "· buscando en Open Food Facts",
      save: "Guardar el artículo",
      saveChanges: "Guardar los cambios",
      remove: "Eliminar el artículo"
    },
    scanner: {
      title: "Escanear un código de barras",
      aim: "Apunta al código de barras",
      lead: "El nombre y la foto vienen de Open Food Facts. Solo te quedará fijar el precio.",
      leadNoLookup: "Te quedará introducir el nombre, la foto y el precio.",
      manual: "Introducir sin código de barras",
      denied: "Permite el acceso a la cámara para escanear un código de barras.",
      // The web app: the browser's own settings (BarcodeScanner.tsx).
      deniedWeb:
        "Permita la cámara para este sitio en los ajustes del navegador (el candado junto a la dirección) y luego toque «Permitir la cámara».",
      allow: "Permitir la cámara",
      settings: "Abrir los ajustes",
      unavailable: "No se ha podido iniciar la cámara. Puede que este dispositivo no tenga.",
      engineFailed:
        "No se ha podido cargar el lector de códigos de barras. Compruebe la conexión a internet y vuelva a intentarlo.",
      retry: "Reintentar",
      notFoundTitle: "Producto no encontrado",
      notFoundBody: "Este código de barras no se reconoce. Introduce el nombre del artículo.",
      unreachableTitle: "No se pudo buscar el producto",
      unreachableBody: "Vuelve a escanear dentro de un momento o introduce el nombre del artículo."
    },
    errors: {
      title: "Artículo no guardado",
      changeTitle: "Artículo no modificado",
      removeTitle: "Artículo no eliminado",
      noAccount: "Desbloquea la app con tu passkey y vuelve a intentarlo.",
      invalid: "Introduce un nombre y un precio.",
      tooMany: "El catálogo está lleno: 500 artículos como máximo.",
      unreachable: "Han respondido muy pocos relés. Comprueba la conexión y vuelve a intentarlo.",
      photoDenied:
        "Permite el acceso a tus fotos en los ajustes del dispositivo y vuelve a intentarlo.",
      cameraDenied:
        "La cámara no se abre. Permítela en los ajustes del dispositivo y vuelve a intentarlo.",
      photoUnreadable: "Esta imagen no se puede usar. Elige otra."
    }
  },
  activity: {
    limited: "Vista limitada a tus operaciones",
    followUp: "Pendiente",
    movements: "Movimientos",
    yourMovements: "Tus movimientos",
    allMovements: "Todos los movimientos",
    allYourMovements: "Todos tus movimientos",
    dayNet: "Neto del día: {{amount}}",
    clearFilter: "{{name}}, quitar el filtro",
    reading: "Cargando las ventas y las facturas…",
    loadFailed:
      "No se pudo leer tu actividad. Comprueba tu conexión a internet y vuelve a intentarlo.",
    empty: "Aún no hay movimientos.",
    noMatch: "Ningún movimiento coincide con los filtros.",
    showExpired: "Mostrar las caducadas ({{count}})",
    hideExpired: "Ocultar las caducadas",
    showMore: "Ver más",
    arrivals_one: "{{count}} movimiento nuevo",
    arrivals_other: "{{count}} movimientos nuevos",
    expiredHidden: "Las facturas caducadas están ocultas.",
    pendingCredit: {
      awaiting: "aún no en el saldo",
      received: "Pago recibido",
      confirmed: "confirmado",
      credit: "Abono en tu saldo",
      waiting: "pendiente",
      fees: "El abono de este pago en tu saldo cuesta en este momento más de {{fee}}, nuestro límite. Se hará automáticamente cuando ese coste ya no lo supere, cuando abras tu monedero.",
      feesQuoted:
        "El abono de este pago en tu saldo cuesta en este momento {{price}}, más que nuestro límite de {{fee}}. Se hará automáticamente cuando ese coste ya no lo supere, cuando abras tu monedero.",
      other:
        "El abono se hará automáticamente cuando abras tu monedero. Comisiones a descontar: {{fee}} como máximo."
    },
    followUps: {
      open: "Abiertas",
      underpaid: "Pagadas de menos",
      unconfirmed: "En confirmación",
      draft: "Borradores"
    },
    followUpTitles: {
      open: "Facturas abiertas",
      underpaid: "Facturas pagadas de menos",
      unconfirmed: "En confirmación",
      draft: "Borradores"
    },
    followUpLabel: "{{name}}: {{count}}, {{total}}",
    rest: "faltan {{amount}}",
    states: {
      open: "Abierta",
      underpaid: "Pagada de menos",
      unconfirmed: "En confirmación",
      draft: "Borrador",
      expired: "Caducada",
      canceled: "Anulada",
      inProgress: "En curso",
      failed: "Fallido"
    },
    done: {
      paid: "Pagada",
      received: "Recibido",
      sent: "Enviado"
    },
    sources: {
      pos: "Punto de venta",
      link: "Factura",
      integration: "Integración",
      receive: "Recepción",
      send: "Envío",
      recovered: "Recuperación"
    },
    titles: {
      link: "Factura",
      recovered: "Fondos recuperados",
      mtpSale: "Venta en {{currency}}",
      // Rows copied from the v2 account (src/features/activity/legacy-history.ts).
      payout: "Retiro a tu monedero",
      referral: "Comisión por referido"
    },
    mtpSale: {
      section: "Venta",
      received: "Recibes",
      transferNowNote: "Transferida sola, sin esperar a sus otras ventas",
      transferLaterNote: "En una transferencia agrupada con sus otras ventas, desde {{threshold}}",
      follow: "Seguir la venta",
      followLabel: "Orden {{order}}, seguir la venta"
    },
    you: "Tú",
    stamp: "{{day}} · {{time}}",
    columns: {
      date: "Fecha",
      label: "Concepto",
      source: "Origen",
      by: "Por",
      state: "Estado",
      amount: "Importe",
      sats: "sats"
    },
    detail: {
      date: "Fecha",
      takenBy: "Cobrado por",
      madeBy: "Creada por",
      rest: "Falta por pagar",
      endsAt: "Pagadera hasta",
      payments: "Pagos",
      link: "Enlace de pago",
      openLink: "Abrir la factura",
      copyLink: "Copiar el enlace",
      linkCopied: "Enlace copiado",
      accepted: "Aceptada el",
      difference: "Diferencia aceptada",
      acceptedLate:
        "Aceptada demasiado tarde para enviarse a {{integration}}: allí el pedido sigue caducado. Comprueba que esté marcado como pagado en su panel de administración."
    },
    accept: {
      action: "Aceptar el importe recibido",
      done: "Importe recibido aceptado",
      dialog: {
        title: "¿Aceptar el importe recibido?",
        body: "La venta quedará pagada con {{received}}. La diferencia de {{difference}} ya no se pedirá. Es definitivo.",
        bodyOrder:
          "El pedido quedará pagado con {{received}}: tu tienda lo verá pagado una vez confirmado el pago. La diferencia de {{difference}} ya no se pedirá. Es definitivo.",
        bodyLate:
          "El pedido quedará pagado con {{received}} y la diferencia de {{difference}} ya no se pedirá. Esta aceptación no se transmite: para {{integration}} el pedido sigue caducado, márcalo también como pagado en su panel de administración. Es definitivo.",
        confirm: "Aceptar",
        cancel: "Volver"
      },
      late: {
        title: "La factura de este pedido ha terminado",
        body: "Para {{integration}} el pedido sigue caducado y no verá tu aceptación. Si lo aceptas aquí, márcalo también como pagado en su panel de administración.",
        closingTitle: "La factura de este pedido está terminando",
        closingBody:
          "Es demasiado tarde para que {{integration}} reciba tu aceptación. Si lo aceptas aquí, márcalo también como pagado en su panel de administración.",
        lapsedBody:
          "Tu aceptación no llegó a la mayoría de tus relés antes del final de la factura: {{integration}} no la verá. Si lo aceptas aquí, márcalo también como pagado en su panel de administración.",
        yourShop: "tu tienda"
      },
      errors: {
        network: "No se pudo guardar la aceptación, inténtalo de nuevo",
        already: "Esta venta ya está aceptada",
        ended:
          "Demasiado tarde para enviar la aceptación a la tienda: vuelve a leer antes de aceptar"
      },
      pending:
        "Aceptación en curso de guardado: contará cuando la mayoría de tus relés la hayan recibido, antes del final de la factura.",
      blocked: {
        unread:
          "La app aún no ha podido comprobar con la mayoría de tus relés si el importe recibido ya se aceptó. «$t(activity.accept.action)» aparecerá aquí cuando se haga esta comprobación. Si tarda, usa «$t(relays.test)» en «$t(settings.relays)».",
        unmet:
          "El importe recibido se aceptó cuando era de {{received}}, pero hoy la app ve menos, por ejemplo tras la sustitución de una transacción. La aceptación volverá a contar en cuanto se alcance ese importe: no se repite.",
        newer:
          "El importe recibido se aceptó con una versión más reciente de la app: actualiza la app para ver esta aceptación."
      }
    }
  },
  table: {
    headerHint: "Ordenar y filtrar",
    sortedBy: "ordenado: {{order}}",
    filtered: "filtrado",
    menu: "{{name}}: ordenar y filtrar",
    sort: "Ordenar",
    orders: {
      text: { ascending: "De la A a la Z", descending: "De la Z a la A" },
      number: { ascending: "De menor a mayor", descending: "De mayor a menor" },
      date: {
        ascending: "Del más antiguo al más reciente",
        descending: "Del más reciente al más antiguo"
      }
    },
    show: "Mostrar",
    selectAll: "Seleccionar todo",
    periods: {
      thisWeek: "Esta semana",
      lastWeek: "Semana pasada",
      thisMonth: "Este mes",
      lastMonth: "Mes pasado",
      thisYear: "Este año",
      lastYear: "Año pasado",
      older: "Anteriores"
    },
    value: "{{label}}, {{count}}",
    emptyValue: "Vacío",
    clearFilters: "Borrar los filtros"
  },
  wallet: {
    balance: "Saldo",
    atLeast: "al menos",
    discreet: "Discreto",
    hiddenAmount: "Importe oculto",
    received: "Recibido en 30 días",
    sent: "Enviado en 30 días",
    send: "Enviar",
    sell: "Vender",
    sellFrom: "desde {{amount}} sats",
    opening: "Abriendo su monedero…",
    loadFailed:
      "No se pudo leer su monedero. Compruebe su conexión a internet y vuelva a intentarlo.",
    retry: "Reintentar",
    empty: "Aún no hay movimientos.",
    guide: {
      lead: "Aún no hay movimientos. Así es como llegan:",
      label: "Cómo llegan los movimientos",
      take: {
        title: "Cobra",
        caption: "Introduce un importe en la caja: tu cliente escanea el código QR y paga."
      },
      receive: {
        title: "Recibe",
        caption: "El pago llega a tu monedero y aparece aquí, con el nombre de quien lo cobró."
      },
      follow: {
        title: "Sigue y envía",
        caption:
          "Facturas, enlaces de pago, transferencias: todo se sigue aquí. Envía tus sats cuando quieras."
      }
    },
    syncing: "Actualizando…",
    syncingWallet: "Sincronizando su monedero…",
    syncLate:
      "No se pudo actualizar su monedero: el saldo y los movimientos mostrados son los de este dispositivo y podrían estar incompletos. Compruebe su conexión a internet.",
    syncLateBlank:
      "No se pudo sincronizar su monedero. Compruebe su conexión a internet y vuelva a intentarlo.",
    noRate: "Tipo de cambio no disponible: algunos importes solo en sats.",
    today: "Hoy",
    yesterday: "Ayer",
    meta: "{{time}} · {{kind}}",
    kinds: {
      lightningReceipt: "Recepción lightning",
      lightningAddress: "Dirección lightning",
      lightningInvoice: "Factura lightning",
      bitcoinAddress: "Dirección bitcoin",
      sparkTransfer: "Transferencia Spark"
    },
    titles: {
      deposit: "Depósito",
      withdrawal: "Retiro",
      receipt: "Recepción",
      sending: "Envío"
    },
    pills: {
      confirming: "En confirmación",
      inProgress: "En curso",
      failed: "Fallido"
    },
    networks: {
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      spark: "Spark"
    },
    detail: {
      date: "Fecha",
      network: "Red",
      fee: "Comisiones",
      sendFee: "Comisiones de envío",
      noFee: "Ninguna",
      reference: "Referencia",
      copy: "Copiar la referencia",
      copied: "Referencia copiada",
      recipient: "Destinatario",
      copyAddress: "Copiar la dirección",
      addressCopied: "Dirección copiada",
      close: "Cerrar"
    },
    sendSheet: {
      intro:
        "Escribe, pega o escanea una dirección lightning, una factura lightning, una dirección bitcoin o una dirección Spark.",
      introNoScan:
        "Escribe o pega una dirección lightning, una factura lightning, una dirección bitcoin o una dirección Spark.",
      close: "Cerrar",
      cancel: "Cancelar",
      recipient: "Destinatario",
      recipientPlaceholder: "Dirección o factura",
      paste: "Pegar",
      scan: "Escanear un código QR",
      reading: "Leyendo el destinatario…",
      kinds: {
        lightningAddress: "Dirección lightning",
        lnurlPay: "Enlace LNURL",
        bolt11: "Factura lightning",
        bitcoinAddress: "Dirección bitcoin",
        sparkAddress: "Dirección Spark"
      },
      recipientErrors: {
        unrecognized: "Escribe una dirección o una factura",
        unsupported: "Escribe una dirección o una factura",
        otherNetwork: "Usa una dirección de la red principal",
        expired: "Pide una nueva factura",
        unreachable: "Revisa la dirección lightning",
        lnurlUnreachable: "Reinténtalo: el enlace LNURL no responde",
        failed: "Revisa tu conexión a internet",
        pasteEmpty: "Copia primero una dirección o una factura",
        pasteFailed: "Pega en el campo con el teclado"
      },
      amount: "Importe",
      switchToSats: "Escribir en sats",
      switchToFiat: "Escribir en {{currency}}",
      available: "Disponible: {{amount}}",
      amountErrors: {
        invalid: "Escribe un importe válido",
        belowMin: "Escribe al menos {{amount}}",
        aboveMax: "Escribe como máximo {{amount}}",
        aboveBalance: "Escribe como máximo el saldo disponible",
        feesAboveBalance: "Reduce el importe para cubrir las comisiones"
      },
      speed: "Velocidad",
      speeds: {
        fast: "Rápida",
        medium: "Normal",
        slow: "Económica"
      },
      fee: "Comisiones estimadas",
      feePreparing: "Calculando las comisiones…",
      quoteFailed:
        "No se pudieron calcular las comisiones. Revisa tu conexión a internet y vuelve a intentarlo.",
      balanceAfter: "Saldo tras el envío",
      expiresIn: "Caduca en",
      send: "Enviar {{amount}}",
      pay: "Pagar {{amount}}",
      confirming: "Confirma con tu passkey…",
      sending: "Enviando…",
      sendFailed:
        "El envío no se completó. Revisa tu conexión a internet y vuelve a intentarlo: el pago solo saldrá una vez.",
      recordFailed:
        "Los relés de tu cuenta no han respondido: no se ha enviado nada. Comprueba tu conexión a internet y vuelve a intentarlo.",
      noRate: "La cotización del bitcoin no está disponible: escribe el importe en sats.",
      result: {
        completedTitle: "Envío realizado",
        onchainTitle: "Pago enviado",
        onchainBody:
          "La red Bitcoin aún debe confirmar la transacción: su estado aparece en la lista de movimientos.",
        pendingTitle: "Envío en curso",
        pendingBody:
          "El pago está en camino. Esta ventana se actualiza sola; cerrarla no cancela el envío.",
        stalledTitle: "Todavía en curso",
        stalledBody: "Su estado final aparecerá en la lista de movimientos.",
        failedTitle: "El envío ha fallado",
        failedBody: "Revisa el destinatario y el saldo, y vuelve a intentarlo.",
        recipientTo: "a {{recipient}}",
        recipientSent: "a {{recipient}}",
        done: "Terminar"
      },
      scanHint:
        "Apunta al código QR de una factura lightning, una dirección lightning o una dirección bitcoin.",
      scanType: "Escribir",
      scanDenied: "Permite el acceso a la cámara para escanear un código QR.",
      scanAllow: "Permitir la cámara",
      scanSettings: "Abrir los ajustes"
    }
  },
  sell: {
    title: "Vender",
    back: "Atrás",
    retry: "Reintentar",
    busy: {
      starting: "Leyendo tu cuenta Mt Pelerin…",
      reading: "Leyendo tu cuenta Mt Pelerin…",
      signingIn: "Conectando con Mt Pelerin…",
      sendingCode: "Enviando el código…",
      checkingCode: "Comprobando el código…",
      savingProfile: "Guardando…",
      preparingInvoice: "Preparando el pago de 1 sat…",
      confirming: "Confirmando…",
      paying: "Pagando…",
      addingAccount: "Añadiendo la cuenta…",
      savingAccount: "Guardando la cuenta…",
      loggingOut: "Cerrando sesión…"
    },
    failures: {
      offline:
        "El servicio de venta no responde. Comprueba tu conexión a internet y vuelve a intentarlo",
      server:
        "El servicio de venta ha enviado una respuesta ilegible. Vuelve a intentarlo en un momento",
      refused: "La solicitud ha sido rechazada",
      codeRefused: "Este código no es el correcto",
      codeExpired: "Este código ha caducado: pide uno nuevo",
      malformed: "La factura de la venta no es la esperada: no se ha pagado nada",
      otherNetwork: "La factura de la venta no es la esperada: no se ha pagado nada",
      otherAmount: "La factura de la venta no es la esperada: no se ha pagado nada",
      expired: "La factura de la venta ha caducado: no se ha pagado nada",
      payment: "El pago no ha salido. Vuelve a intentarlo",
      record:
        "Los relés de tu cuenta no han respondido: no se ha vendido nada. Comprueba tu conexión a internet y vuelve a intentarlo",
      ibanTaken: "Este IBAN ya está registrado en otra cuenta Mt Pelerin",
      accountKnown: "Esta cuenta ya está entre tus cuentas bancarias, en esta moneda",
      accountUnchanged:
        "Mt Pelerin no ha modificado esta cuenta: sus datos siguen siendo los mostrados. Contacta con Mt Pelerin para cambiarlos"
    },
    sessionLost: "Tu sesión Mt Pelerin ha caducado: vuelve a conectarte",
    intro: {
      title: "Vender con Mt Pelerin",
      lead: "Mt Pelerin, intermediario financiero suizo, compra tus sats y transfiere los francos a tu cuenta bancaria.",
      connectLead: "Tu cuenta Mt Pelerin se abre con la clave de tu cuenta sattle.me.",
      connect: "Conectarse a Mt Pelerin",
      phoneLead: "Tu cuenta Mt Pelerin se abre con tu número.",
      phone: "Número de teléfono",
      phoneHint: "Mt Pelerin te envía un código por SMS",
      sendCode: "Recibir el código",
      dialCountry: "País del número",
      dialCodeOf: "País del número: {{country}}, {{code}}"
    },
    code: {
      title: "Introduzca su código",
      lead: "Mt Pelerin acaba de enviárselo por SMS al {{phone}}.",
      label: "Código de 6 cifras",
      notReceived: "¿No lo has recibido?",
      resend: "Volver a enviar el código",
      submit: "Validar"
    },
    profile: {
      title: "Tu correo electrónico",
      lead: "Mt Pelerin lo necesita para abrir tu cuenta. Te envía allí el recibo de cada venta.",
      email: "Correo electrónico",
      emailInvalid: "Introduce un correo válido",
      phone: "Número de teléfono",
      phoneInvalid: "Introduce un número válido, con su prefijo",
      phoneCaption: "El número de tu cuenta Mt Pelerin",
      submit: "Continuar"
    },
    validation: {
      title: "Verificar su monedero",
      lead: "Su monedero debe ser verificado. Pague 1 sat ({{value}}) para realizar esta verificación.",
      toPay: "A pagar",
      fee: "Comisiones Lightning",
      pay: "Pagar 1 sat",
      unaffordable: "Tu saldo no cubre 1 sat y sus comisiones. Vuelve después de tu próximo cobro",
      leadNoRate: "Su monedero debe ser verificado. Pague 1 sat para realizar esta verificación.",
      lessThan: "menos de {{amount}}",
      about: "unos {{amount}}"
    },
    pending: {
      badge: "En curso",
      title: "Verificación de su monedero",
      leadNoBank: "Puedes continuar: tu cuenta bancaria no depende de esta verificación.",
      leadBank:
        "Puedes salir de esta pantalla: podrás vender en cuanto tu monedero esté verificado (normalmente menos de 15 minutos).",
      paid: "1 sat pagado",
      toBank: "Añadir tu cuenta bancaria"
    },
    verified: {
      title: "Dirección verificada",
      lead: "Tu sat ha llegado. Tus ventas saldrán de {{address}}.",
      account: "Cuenta Mt Pelerin",
      address: "Dirección Lightning",
      addressVerified: "Verificada",
      bank: "Cuenta bancaria",
      toBank: "Añadir tu cuenta bancaria",
      continue: "Continuar",
      bankTodo: "Por completar"
    },
    bank: {
      title: "Dónde transferir tus {{currency}}",
      lead: "La cuenta a la que se transfieren tus ventas. Es tuya o de tu empresa.",
      none: "Ninguna cuenta bancaria registrada por ahora",
      add: "Añadir una cuenta"
    },
    accountForm: {
      title: "Añadir una cuenta",
      submit: "Añadir esta cuenta"
    },
    accountEdit: {
      title: "Editar la cuenta",
      lead: "Para otro IBAN u otra moneda, añade una cuenta.",
      submit: "Guardar"
    },
    payoutCurrency: {
      label: "Moneda de las transferencias",
      swift:
        "Transferencia internacional (SWIFT): un día hábil o más. Los bancos intermediarios pueden cobrar comisiones, desde unos pocos dólares hasta varias decenas"
    },
    accounts: {
      title: "Cuentas bancarias",
      lead: "Tus ventas solo se transfieren a estas cuentas.",
      add: "Añadir una cuenta",
      fromSettings: "Ajustes",
      pending: "Pendiente",
      editHint: "Editar el nombre y la dirección del titular",
      // Accounts Mt Pelerin listed that the app cannot read (guards.ts): never offered.
      unreadable_one: "{{count}} otra cuenta no se ha podido leer: no se ofrece",
      unreadable_other: "{{count}} otras cuentas no se han podido leer: no se ofrecen",
      // Mt Pelerin lacks a line of its holder's address: offered all the same.
      incompleteAddress: "Dirección incompleta"
    },
    addressTaken: {
      title: "Dirección ya registrada",
      body: "Tu dirección Lightning está registrada en otra cuenta Mt Pelerin. Conéctate con el número de esa cuenta.",
      switch: "Cambiar de cuenta"
    },
    unavailable: "La venta de sats por Lightning no está disponible por ahora",
    sale: {
      amount: "Importe",
      available: "Disponible: {{amount}}",
      change: "Cambiar",
      fee: "Comisiones de venta",
      receive: "Recibes aproximadamente",
      estimating: "Calculando…",
      estimateFailed: "No disponible",
      pending: "Pendiente",
      pendingBalance: "Saldo: {{amount}}",
      pendingSale: "Esta venta: {{amount}}",
      pendingGauge: "{{balance}} pendientes, más {{sale}} de esta venta, de {{threshold}}",
      pendingGaugeHeld: "{{balance}} pendientes, de {{threshold}}",
      limitsTitle: "Sin identificación",
      limitLeft: "Quedan {{left}} de {{limit}}",
      seeLimits: "Ver mis límites",
      settings: "Ajustes de la venta",
      quote: "Ver el presupuesto",
      aboveMax: "Introduce como máximo {{amount}}",
      aboveBalance: "Introduce como máximo el saldo disponible",
      tooSmall: "Debes recibir al menos {{amount}}: aumenta el importe",
      transferFee: "Comisión de transferencia",
      transfer: "Transferencia",
      transferNow: "Inmediata",
      transferNowNote:
        "{{fee}} de comisión de transferencia por debajo de {{threshold}}, gratis por encima",
      transferLater: "Diferida",
      transferLaterNote:
        "Sin comisión de transferencia: en una transferencia agrupada con sus otras ventas, cuando alcanzan {{threshold}}",
      equivalentOf: "el equivalente de {{amount}}",
      chooseAccount: "¿A qué cuenta?",
      addAccount: "Añadir una cuenta"
    },
    quote: {
      title: "Presupuesto",
      heading: "Recibes {{amount}}",
      lead: "Tus sats se venden y los francos se transfieren a tu cuenta bancaria.",
      selling: "Vendes",
      rate: "Cotización",
      ratePrice: "1 BTC = {{price}}",
      fee: "Comisiones de venta",
      lightningFee: "Comisiones Lightning",
      account: "A la cuenta",
      lockedUntil: "Cotización garantizada hasta las {{time}}",
      expired: "La cotización ha caducado: no se ha vendido nada",
      refresh: "Actualizar el presupuesto",
      sell: "Vender {{amount}}",
      otherOrder: "El presupuesto recibido no es el solicitado: no se ha pagado nada",
      nothingWired: "Esta venta no transferiría nada a tu cuenta: no se ha pagado nada",
      unaffordable: "Tu saldo no cubre esta venta y sus comisiones"
    },
    order: {
      heading: "{{amount}} hacia tu banco",
      lead: "Venta de {{sats}}, {{date}}. Puedes salir de esta pantalla: la venta sigue su curso.",
      leadDated: "Venta del {{date}}. Puedes salir de esta pantalla: la venta sigue su curso.",
      received: "Sats recibidos",
      receivedTodo: "Recepción de los sats",
      receivedNow: "Recibiendo los sats",
      receivedFailed: "Sats no recibidos",
      transferred: "Transferencia a tu cuenta",
      held: "Esta venta se está verificando: revisa tus correos de Mt Pelerin",
      delayed: "La transferencia se ha aplazado: espérala durante la semana",
      refunded: "Se te devuelven tus sats",
      failed: "Esta venta ha sido rechazada",
      expired: "El presupuesto ha caducado: no se ha vendido nada",
      reference: "Número de orden",
      outcomes: {
        awaitingPayment: "Pendiente de pago",
        expired: "Caducada",
        inProgress: "En curso",
        delayed: "Aplazada",
        held: "En verificación",
        sent: "Transferida",
        refunded: "Reembolsada",
        failed: "Rechazada"
      },
      title: "Venta",
      soldTitle: "Vendido con éxito",
      soldLead: "Sus {{sats}} están vendidos: {{amount}} se transferirán a su cuenta.",
      withOthers:
        "En una transferencia agrupada con sus otras ventas, cuando alcanzan {{threshold}}",
      next: "Y ahora",
      processing: "Tramitación de la venta",
      processingNow: "En proceso",
      processed: "Convertidos a {{currency}}",
      delayChf: "En 1 día hábil (transferencia en Suiza, de lunes a viernes)",
      delayEur: "En 1 a 2 días hábiles (transferencia SEPA)",
      delaySwift: "Un día hábil o más (transferencia internacional SWIFT)",
      close: "Cerrar",
      seeSales: "Ver sus ventas"
    },
    history: {
      title: "Tus ventas",
      empty: "Ninguna venta por ahora",
      unreadable: "Demasiadas ventas para listarlas aquí"
    },
    split: {
      quoting: "Fijando el tipo de cambio de su venta…",
      receive: "Recibe",
      title: "Reparto",
      lead: "Desde el {{date}}, su monedero ha recibido {{received}}.",
      kept: "Guardado en bitcoin ({{percent}})",
      share: "Parte por vender ({{percent}})",
      sold: "Vendido ahora: {{amount}}",
      lightningFee: "Comisiones Lightning, adicionales",
      deferred:
        "Las ventas diferidas se agrupan y se transferirán de una vez, en cuanto alcancen {{threshold}}.",
      balance: "Su saldo solo permite vender {{amount}}. El resto de la parte no se venderá.",
      limit:
        "Sin verificación de identidad, sus ventas están limitadas a {{limit}} al mes. Venda {{amount}} ahora (el resto de la parte no se venderá), o identifíquese primero para vender toda la parte.",
      sell: "Vender {{amount}}",
      identify: "Identificarme en Mt Pelerin",
      identifyHeading: "Identifíquese para vender su parte",
      identifyLead:
        "Su parte por vender es de {{due}}. Sin verificación de identidad, sus ventas están limitadas a {{limit}} al mes, y ese límite se ha alcanzado.",
      identifyHow:
        "Su identidad se verifica en el sitio de Mt Pelerin, con el número de teléfono de su cuenta. Una vez verificada su identidad, se le propone aquí toda la parte.",
      soldHeading: "Vendido con éxito",
      soldLead:
        "Sus {{sats}} se han vendido por {{amount}}, que se suman a sus ventas pendientes de transferencia.",
      held: "Pendiente de transferencia",
      payout: {
        title: "Próxima transferencia",
        threshold: "desde {{threshold}}",
        held: "Ya en espera",
        sale: "Esta venta",
        left: "Faltan <strong>{{left}}</strong> de ventas; luego todo se transferirá a tu cuenta bancaria.",
        reached: "Se ha alcanzado el umbral: todo se transferirá a tu cuenta bancaria."
      },
      notice: "Reparto: {{amount}} por vender, aproximadamente {{fiat}}.",
      noticeSell: "Vender",
      noticeIdentify: "Reparto: {{due}} por vender, una vez verificada su identidad.",
      noticeSee: "Ver",
      setup:
        "Su reparto prevé el {{percent}} en {{currency}}. Configure la venta para vender esa parte.",
      setupOpen: "Configurar la venta"
    },
    limits: {
      title: "Límites de venta",
      lead: "Sin verificación de identidad, puede vender como máximo:",
      perSale: "Por venta",
      month: "Últimos {{days}} días",
      year: "Este año",
      leftUntil: "Quedan {{amount}} hasta el {{date}}",
      leftRolling: "Quedan {{amount}}: una venta cuenta durante {{days}} días",
      unknown: "No calculado: una venta en una moneda distinta del franco",
      feesTitle: "Comisiones incluidas",
      identified: "Su identidad está verificada en Mt Pelerin.",
      noLimit: "Sin límite",
      perMonth: "Por mes",
      perYear: "Por año",
      identifyHow:
        "Para vender más, haga verificar su identidad en el sitio de Mt Pelerin, con el número de teléfono de su cuenta.",
      fees: "Cuenta el importe vendido, antes de descontar las comisiones. Calculado a partir de tus ventas."
    },
    settings: {
      title: "Ajustes de la venta",
      account: "Cuenta Mt Pelerin",
      byKey: "Cuenta Mt Pelerin · conectada con la clave de su cuenta",
      lightning: "Dirección Lightning",
      verified: "verificada",
      pendingValidation: "pendiente",
      banks: "Cuentas bancarias",
      limits: "Límites de venta",
      history: "Tus ventas",
      logout: "Cerrar sesión en Mt Pelerin",
      logoutTitle: "¿Cerrar sesión en Mt Pelerin?",
      logoutBody:
        "En todos tus dispositivos. Tus cuentas y tus ventas se quedan en Mt Pelerin: las encontrarás al volver a conectarte.",
      logoutConfirm: "Cerrar sesión",
      cancel: "Cancelar",
      banksCount_one: "{{count}} cuenta",
      banksCount_other: "{{count}} cuentas",
      left: "Quedan {{amount}}",
      perSale: "{{amount}} por venta",
      salesCount_one: "{{count}} este año",
      salesCount_other: "{{count}} este año"
    },
    close: "Cerrar",
    poweredBy: "Powered by"
  },
  walletExport: {
    open: "Exportar",
    title: "Exportar las transacciones",
    close: "Cerrar",
    lead: "Las transacciones finalizadas del periodo: ventas pagadas, recepciones y envíos.",
    period: "Periodo",
    periods: {
      thisMonth: "Este mes",
      lastMonth: "Mes pasado",
      thisYear: "Este año",
      lastYear: "Año pasado",
      custom: "Fechas concretas"
    },
    days: "{{first}} – {{last}}",
    from: "Desde",
    to: "Hasta",
    format: "Tipo de exportación",
    formats: {
      pdf: "Simple (PDF)",
      csv: "Detallada (CSV)"
    },
    amounts: "Importes",
    units: {
      fiat: "En {{currency}}",
      btc: "En BTC"
    },
    columnsTitle: "Columnas",
    columnsTicked: "{{ticked}} de {{total}}",
    columns: {
      dateAndTime: "Fecha y hora",
      label: "Concepto",
      source: "Origen",
      by: "Por",
      network: "Tipo de pago",
      reference: "Referencia",
      bitcoinAmount: "Importe en BTC",
      bitcoinFees: "Comisiones en BTC",
      fiatAmount: "Importe en {{currency}}",
      fiatFees: "Comisiones en {{currency}}",
      originalAmount: "Importe introducido",
      originalCurrency: "Moneda introducida",
      bitcoinPrice: "Precio del bitcoin en {{currency}}",
      remark: "Observación"
    },
    remarks: {
      accepted:
        "Diferencia de {{fiat}} / {{btc}}, aceptada por el propietario el {{date}} a las {{time}}",
      acceptedSats: "Diferencia de {{btc}}, aceptada por el propietario el {{date}} a las {{time}}"
    },
    submit: "Exportar",
    errors: {
      unread:
        "No se pudieron leer tus ventas. Comprueba tu conexión a internet y vuelve a intentarlo.",
      receiving:
        "Un pago en bitcoin visto por un punto de venta aún no ha llegado a tu monedero. Vuelve a intentarlo en unos minutos.",
      failed: "No se pudo hacer la exportación. Vuelve a intentarlo."
    },
    pdf: {
      title: "Informe de transacciones",
      period: "Del {{first}} al {{last}}",
      made: "Emitido el {{date}}",
      summary: "Resumen",
      count: "Número de transacciones",
      countOf: {
        pos: "de ellas, punto de venta",
        link: "de ellas, facturas",
        integration: "de ellas, integraciones",
        receive: "de ellas, recepciones",
        send: "de ellas, envíos"
      },
      received: "Total cobrado",
      sent: "Total enviado",
      fees: "Comisiones de envío",
      lines: "Detalle de las transacciones",
      none: "Ninguna transacción finalizada en este periodo.",
      amount: "Importe ({{unit}})",
      amountMixed: "Importe",
      valuesNote:
        "Una venta cuenta por el importe introducido, en su moneda; cualquier otra transacción, por el valor de sus bitcoins al precio registrado en su pago (fuente: CoinGecko). Una transacción sin precio registrado cuenta en BTC.",
      // Rows copied from a v2 account among them (src/features/activity/legacy-history.ts).
      valuesNoteImported:
        "Una venta cuenta por el importe introducido, en su moneda; cualquier otra transacción, por el valor de sus bitcoins al cambio registrado en su pago (fuente: CoinGecko; para el historial recuperado de tu anterior servicio de pago, el cambio que este registró). Una transacción sin cambio registrado cuenta en BTC."
    }
  },
  settings: {
    recovery: {
      group: "Seguridad",
      title: "Frase de recuperación",
      description: "Las 12 palabras que restauran tu monedero sin passkey, para anotar en papel.",
      open: "Mostrar",
      lead: "Estas 12 palabras son una copia de tu monedero: con ellas, cualquiera puede gastar todos sus fondos, sin tu passkey.",
      rulesTitle: "Antes de mostrarlas",
      rules:
        "Anótalas en papel, en orden, y guárdalas en un lugar seguro. No las fotografíes ni las guardes en ningún archivo ni mensaje. No se las des a nadie: sattle.me nunca te las pedirá.",
      reveal: "Mostrar la frase",
      hide: "Ocultar",
      shownNote:
        "Solo tú debes ver estas palabras. Desaparecen en cuanto sales de esta pantalla o de la aplicación.",
      captureOpen:
        "Aquí no se bloquean las capturas de pantalla: no hagas ninguna y no grabes la pantalla.",
      noPhrase: "Este monedero no tiene frase de recuperación que mostrar.",
      wordLabel: "Palabra {{index}}: {{word}}"
    },
    title: "Ajustes",
    business: "Comercio",
    businessDescription: "Nombre y logotipo que ve el cliente, en los recibos y las facturas.",
    businessName: "Nombre del comercio",
    logo: "Logotipo del comercio",
    changeLogo: "Cambiar el logotipo del comercio",
    logoChange: "Cambiar el logotipo",
    merchant: {
      section: "Perfil de comerciante",
      description:
        "Cobra pagos en bitcoin con esta app: punto de venta, facturas, empleados. Tu monedero principal se crea en este paso.",
      create: "Crear mi perfil de comerciante",
      failedTitle: "Punto de venta no preparado",
      doneTitle: "Perfil de comerciante creado",
      doneBody: "Ya puedes cobrar pagos"
    },
    groups: {
      charging: "Cobros",
      payouts: "Transferencias",
      display: "Visualización",
      network: "Red",
      // "Account" of "Settings" (the session, the deletion).
      account: "Cuenta"
    },
    // The phone's cards and the computer's tabs of "Settings".
    rubrics: {
      chargingBoth: "Lightning y onchain",
      methods: "Métodos de pago",
      chargingDescription:
        "Lo que el punto de venta, tus empleados y tus integraciones ofrecen al cliente.",
      lightning: "Lightning",
      lightningCaption: "Siempre ofrecido, hasta {{limit}} por factura; {{beyond}}",
      lightningCaptionUnknown:
        "Siempre ofrecido, hasta el límite de tu dirección Lightning; {{beyond}}",
      lightningLimitFiat: "{{btc}} (unos {{fiat}})",
      lightningBeyond: {
        onchain: "por encima, solo se muestra la dirección onchain",
        refused:
          "por encima, el punto de venta rechaza la venta mientras los pagos onchain estén desactivados"
      },
      splitLabel: "Reparto: {{bitcoin}} en bitcoin, {{fiat}} en {{currency}}",
      editRelays: "Modificar los relés"
    },
    unlock: {
      title: "Pedir la biometría para desbloquear la app",
      captionOn: "Cada vez que se abre la app",
      captionOff: "La app se abre sin biometría",
      captionUnavailable: "Ni biometría ni código en este dispositivo",
      section: "Bloqueo de la app",
      description:
        "La biometría de este dispositivo, o su código, se pide cada vez que se abre la app y cada vez que vuelves a ella, además del modo caja.",
      saveFailed: "Esta elección no se ha podido guardar en este dispositivo. Vuelve a intentarlo."
    },
    locked: {
      title: "Modo caja",
      titleCard: "App bloqueada",
      body: "Desbloquea la app para cambiar tus ajustes.",
      unlock: "Desbloquear"
    },
    displayCurrency: "Moneda de referencia",
    displayCurrencyCardDescription: "Importes de tus tarjetas mostrados en la app.",
    displayCurrencyDescription: "Importes introducidos en el punto de venta y mostrados en la app.",
    amountUnit: {
      title: "Moneda mostrada primero",
      description:
        "En «Monedero» y en el historial de tus tarjetas, en este dispositivo. El otro importe se muestra debajo.",
      sats: "sats",
      savedTitle: "Moneda mostrada primero guardada",
      saveFailed: "Esta elección no se ha podido guardar en este dispositivo. Vuelve a intentarlo."
    },
    theme: {
      title: "Tema",
      description:
        "En este dispositivo. «Automático» sigue el ajuste claro u oscuro del dispositivo.",
      light: "Claro",
      dark: "Oscuro",
      system: "Automático",
      // A rubric's card on a phone ("Display"): the theme chosen.
      summaryLight: "Tema claro",
      summaryDark: "Tema oscuro",
      summarySystem: "Tema automático",
      savedTitle: "Tema guardado",
      saveFailed: "Esta elección no se ha podido guardar en este dispositivo. Vuelve a intentarlo."
    },
    onchain: "Pagos onchain",
    onchainDescription:
      "Confirmación en 10 a 60 minutos. Se aplica al punto de venta, el tuyo y el de tus empleados. Tus facturas e integraciones siempre ofrecen el pago onchain.",
    split: "Reparto",
    splitDescription:
      "Comisión de sattle.me: {{bitcoin}} sobre todo lo que cobras. Parte convertida: {{fiat}} de comisiones de venta de Mt Pelerin adicionales, vendida cuando la aceptas en «Monedero».",
    splitDescriptionFree:
      "Comisión de sattle.me: {{free}} en lugar de {{bitcoin}} hasta el {{date}}, sobre todo lo que cobras. Parte convertida: {{fiat}} de comisiones de venta de Mt Pelerin adicionales, vendida cuando la aceptas en «Monedero».",
    splitShort: "{{percent}} en {{currency}}",
    allBitcoin: "Todo en bitcoin",
    bankAccount: "Cuenta bancaria",
    noBankAccount: "Ninguna",
    bankAtMtPelerin: "En Mt Pelerin",
    relays: "Relés Nostr",
    relaysCount_one: "{{count}} relé",
    relaysCount_other: "{{count}} relés",
    relaysDescription:
      "Servidores Nostr a los que se conecta la app, en todos los dispositivos del comercio.",
    // "Bitcoin node" of "Network".
    node: {
      title: "Nodo Bitcoin",
      description:
        "Donde tus dispositivos y los de tus empleados siguen los pagos onchain, y donde tu monedero lee la blockchain.",
      mempoolTitle: "mempool.space",
      mempoolDescription:
        "Público, sin nada que instalar. Ve las direcciones de tus ventas onchain.",
      ownTitle: "Mi nodo",
      ownDescription: "Tu propio mempool: nadie más ve tus direcciones.",
      mempoolCaption: "Predeterminado",
      urlLabel: "Dirección de tu mempool",
      urlHint: "La dirección de su página en tu navegador, por ejemplo en tu Umbrel o Start9",
      errors: {
        empty: "Introduce la dirección de tu mempool",
        incomplete: "Dirección incompleta, por ejemplo https://mempool.example.ch",
        insecure: "Solo se acepta una dirección https://: con http://, la conexión no está cifrada",
        device: "Esta dirección es este dispositivo: introduce la de tu nodo"
      },
      legacyHttpTitle: "Dirección http:// ya no usada",
      legacyHttpBody:
        "Por tu seguridad, la app ya solo se conecta a tu nodo por https://: con http://, alguien conectado a este Wi-Fi podría hacerse pasar por él y hacer parecer pagada una venta que no lo está. Mientras no introduzcas una dirección https://, tus dispositivos actúan como si tu nodo no respondiera.",
      test: "Probar la conexión",
      results: {
        ok: {
          title: "Nodo accesible y al día",
          body: "Último bloque: {{height}}"
        },
        unreachable: {
          title: "Nodo inaccesible",
          body: "Comprueba la dirección y que este dispositivo esté en la misma red que tu nodo."
        },
        notMempool: {
          title: "No hay mempool en esta dirección",
          body: "Algo responde, pero no la API de mempool. Comprueba la dirección y el puerto."
        },
        noAddressIndex: {
          title: "Direcciones ilegibles",
          body: "Tu mempool aún no lee las direcciones: su índice (electrs o Fulcrum) falta o todavía no está construido."
        },
        behind: {
          title: "Nodo con retraso",
          body: "Su último bloque tiene {{hours}} h: todavía no está sincronizado."
        }
      },
      fallbackTitle: "Cuando no responde",
      fallbackMempool: "Pasar por mempool.space",
      fallbackMempoolDescription:
        "Tus ventas onchain continúan; mempool.space ve entonces tus direcciones.",
      fallbackNone: "Solo Lightning",
      fallbackNoneDescription:
        "Nada va a mempool.space; mientras tanto, el Punto de Venta ya no ofrece Bitcoin.",
      payersTitle: "Páginas de pago de tus clientes",
      payersLabel: "Transmitir mi nodo a las páginas de los pagadores",
      payersCaption:
        "El navegador de tus clientes también sigue su pago en tu nodo, con la misma alternativa. Su dirección aparece entonces en tus enlaces de pago, y recibe la dirección IP de tus clientes.",
      payersHttpsOnly:
        "Solo para un nodo accesible desde Internet, en https:// con un nombre de dominio: el navegador de tus clientes no llega a tu red local.",
      publicNotePayers:
        "La hora de envío de un pago, que fija su tipo de cambio, sigue en mempool.space: la misma para ti y tus clientes.",
      publicNote:
        "La página de pago de tus clientes y la hora de envío de un pago, que fija su tipo de cambio, siguen en mempool.space: la misma para ti y tus clientes.",
      savedTitle: "Nodo Bitcoin guardado",
      savedOwn: "Tus dispositivos leen la blockchain en tu nodo",
      savedMempool: "Tus dispositivos leen la blockchain en mempool.space",
      confirmTitle: "¿Guardar este nodo?",
      confirmBody:
        "No responde correctamente desde este dispositivo. Desde la red de tu comercio quizá sí.",
      confirmAction: "Guardar de todos modos"
    },
    // "Look up scanned products" of "Network".
    productLookup: {
      section: "Catálogo",
      title: "Buscar los productos escaneados",
      caption:
        "En Open Food Facts, que recibe el código de barras y la dirección IP del dispositivo. Desactivado: introduces tú el nombre y la foto.",
      savedTitle: "Búsqueda de productos guardada",
      savedOn: "El nombre y la foto de un producto escaneado vienen de Open Food Facts",
      savedOff: "El nombre y la foto de un producto escaneado se introducen a mano"
    },
    save: "Guardar",
    close: "Cerrar",
    logout: "Cerrar sesión",
    logoutTitle: "¿Cerrar sesión en este dispositivo?",
    logoutBody:
      "Tus datos y tus fondos siguen en tu cuenta: tu passkey te vuelve a conectar. Solo las opciones elegidas en este dispositivo vuelven a su valor predeterminado: la barra de navegación, «$t(wallet.discreet)» en el $t(navigation.destinations.wallet), «$t(settings.amountUnit.title)», «$t(settings.theme.title)», «$t(pos.mode.amount)» o «$t(pos.mode.articles)» en el $t(pos.title) y la biometría para desbloquear la app.",
    logoutBodyWeb:
      "Tus datos y tus fondos siguen en tu cuenta: tu passkey te vuelve a conectar. Solo las opciones elegidas en este dispositivo vuelven a su valor predeterminado: la barra de navegación, «$t(wallet.discreet)» en el $t(navigation.destinations.wallet), «$t(settings.amountUnit.title)», «$t(settings.theme.title)» y «$t(pos.mode.amount)» o «$t(pos.mode.articles)» en el $t(pos.title).",
    logoutBodyCard:
      "Tus datos y tus fondos siguen en tu cuenta: tu passkey te vuelve a conectar. Solo las opciones «$t(settings.amountUnit.title)» y «$t(settings.theme.title)» elegidas en este dispositivo vuelven a su valor predeterminado.",
    logoutConfirm: "Cerrar sesión",
    support: {
      group: "Ayuda",
      section: "Asistencia",
      description:
        "Una pregunta, un problema: escríbanos. El registro de la app nos ayuda a entender lo que ha pasado.",
      contact: "Contactar con asistencia",
      attach: "Adjuntar el registro de la app",
      attachCaption: "Eventos técnicos, sin importes ni direcciones",
      reports: "Enviar informes de fallos",
      reportsKinds: "Fallos y lentitud",
      reportsCaption: "Ningún importe ni dirección de pago",
      reportsSaveFailed:
        "Esta elección no se ha podido guardar en este dispositivo. Vuelve a intentarlo.",
      subject: "Asistencia sattle.me",
      body: "Hola:\n\nSu pregunta o su problema:\n\n\n",
      downloaded:
        "El registro de la app se acaba de descargar ({{file}}): adjúntelo a este mensaje.",
      attachDownloaded: "Adjunte el registro descargado ({{file}})",
      notAttached: "Registro no adjuntado al correo",
      deposited: "El registro de la app se envía cifrado al soporte, con la referencia de abajo.",
      notDeposited: "Registro no enviado",
      noMailTitle: "Ninguna app de Mail en este dispositivo",
      addressCopied: "Dirección de asistencia copiada: {{email}}",
      writeTo: "Escríbanos a {{email}}",
      shareTitle: "Registro de la app",
      shareFailed: "Registro no compartido",
      failedTitle: "Correo no abierto"
    },
    delete: {
      section: "Eliminar la cuenta",
      description:
        "Borra la cuenta de los relés Nostr y de este dispositivo, y renuncia a su dirección lightning. El monedero debe estar vacío.",
      button: "Eliminar la cuenta",
      employeesTitle_one: "Tiene {{count}} empleado",
      employeesTitle_other: "Tiene {{count}} empleados",
      employeesBody_one:
        "Se retirará del comercio: su dispositivo dejará de cobrar para él y lo olvidará en su próxima conexión.",
      employeesBody_other:
        "Se retirarán del comercio: sus dispositivos dejarán de cobrar para él y lo olvidarán en su próxima conexión.",
      integrationsTitle_one: "Tiene {{count}} integración",
      integrationsTitle_other: "Tiene {{count}} integraciones",
      integrationsBody_one: "Se retirará: su servidor ya no podrá crear facturas para el comercio.",
      integrationsBody_other:
        "Se retirarán: sus servidores ya no podrán crear facturas para el comercio.",
      assistantsTitle_one: "Tienes {{count}} asistente IA",
      assistantsTitle_other: "Tienes {{count}} asistentes IA",
      assistantsBody_one: "Se retirará: ya no podrá hacer facturas para el negocio.",
      assistantsBody_other: "Se retirarán: ya no podrán hacer facturas para el negocio.",
      removeAndContinue: "Retirar y continuar",
      confirmTitle: "¿Eliminar la cuenta?",
      confirmBody:
        "Los ajustes, el equipo, los artículos y las ventas registradas se borran de los relés Nostr y de este dispositivo, y se renuncia a la dirección lightning. Es definitivo. El monedero, vacío, sigue accesible con su passkey.",
      confirm: "Eliminar definitivamente",
      progressTitle: "Eliminando la cuenta",
      progressHint: "Mantenga la app abierta hasta el final.",
      steps: {
        wallet: "Comprobando el monedero",
        team: "Retirando el equipo",
        reading: "Buscando datos en los relés ({{done}}/{{total}})",
        deleting: "Borrando en los relés ({{done}}/{{total}})",
        checking: "Comprobando el borrado ({{done}}/{{total}})",
        device: "Borrando este dispositivo"
      },
      deleted: "Tu cuenta se ha eliminado",
      deletedElsewhere:
        "La cuenta de {{business}} se eliminó desde otro dispositivo: este dispositivo la ha olvidado.",
      alreadyRemoved: "La dirección lightning y el equipo ya se han retirado.",
      card: {
        description:
          "Borra la cuenta de los relays Nostr y de este dispositivo, y abandona las direcciones Lightning de tus tarjetas. Las tarjetas deben estar vacías.",
        confirmBody:
          "Los ajustes, las tarjetas y sus pagos registrados se borran de los relays Nostr y de este dispositivo, y las direcciones Lightning de las tarjetas se abandonan. Es definitivo.",
        stepCards: "Comprobando las tarjetas",
        alreadyRemoved: "Las direcciones Lightning de las tarjetas ya están abandonadas.",
        cardWallets:
          "El monedero de una de tus tarjetas, o de una tarjeta eliminada, no está vacío, o todavía le llegan sats. Envía su saldo a otro sitio desde « Tarjetas » y vuelve a intentarlo.",
        walletFailed:
          "No se pudo comprobar el monedero de una tarjeta. Comprueba tu conexión a internet y vuelve a intentarlo.",
        begun:
          "La eliminación no ha terminado: las direcciones Lightning de las tarjetas ya están abandonadas, no se ha borrado nada en este dispositivo. Comprueba tu conexión a internet y vuelve a intentarlo."
      },
      failedTitle: "Cuenta no eliminada",
      errors: {
        balance:
          "El monedero aún contiene {{sats}} sats. Envíelos a otro lugar y vuelva a intentarlo.",
        pendingPayments:
          "Hay un pago del monedero en curso. Vuelva a intentarlo cuando haya terminado.",
        unclaimedDeposits:
          "Un depósito onchain aún no se ha abonado al monedero. Vuelva a intentarlo cuando lo esté.",
        cardWallets:
          "El monedero de una de sus tarjetas, o de una tarjeta eliminada, no está vacío, o aún le están llegando sats. Retire su saldo a su saldo principal en « Tarjetas » y vuelva a intentarlo.",
        newerApp:
          "Una versión más reciente de la aplicación registró una tarjeta de esta cuenta. Actualice la aplicación y vuelva a intentarlo.",
        salesInProgress:
          "Algunas facturas del comercio aún no son definitivas. Vuelva a intentarlo cuando se publique su versión final (hasta 3 h después del fin de una factura no pagada).",
        walletFailed:
          "No se pudo comprobar el monedero. Compruebe su conexión a internet y vuelva a intentarlo.",
        unreachable:
          "Los relés Nostr no respondieron. Compruebe su conexión a internet y vuelva a intentarlo.",
        notDeleted:
          "Los relés Nostr no confirmaron el borrado. No se ha borrado nada en este dispositivo: vuelva a intentarlo.",
        begun:
          "La eliminación no ha terminado: la dirección lightning y el equipo ya se han retirado, no se ha borrado nada en este dispositivo. Compruebe su conexión a internet y vuelva a intentarlo.",
        unfinished:
          "La eliminación ha empezado pero no ha terminado: los otros dispositivos de la cuenta quizá ya la hayan olvidado. Compruebe su conexión a internet y vuelva a intentarlo para terminarla.",
        deviceNotWiped:
          "La cuenta se ha borrado de los relés, pero no todo lo que la app guardaba en este dispositivo."
      }
    },
    yourProfile: "Tu perfil",
    nameLocked: "Nombre definido por tu empleador",
    addPhoto: "Añadir una foto",
    changePhoto: "Cambiar la foto",
    removePhoto: "Quitar",
    relaysLocked: "Definidos por tu empleador",
    leave: "Dejar el comercio",
    leaveTitle: "¿Dejar {{business}}?",
    leaveBody:
      "Este dispositivo ya no cobrará para este comercio. Para volver, hará falta una nueva invitación.",
    back: "Volver",
    splitSavedTitle: "Reparto guardado",
    splitSavedBank: "IBAN comprobado · {{percent}} en {{currency}}",
    splitSavedBitcoin: "Todo en bitcoin",
    relaysSavedTitle: "Relés guardados",
    relaysSavedBody: "Los dispositivos del comercio los siguen desde su próxima conexión.",
    nameSavedTitle: "Nombre guardado",
    currencySavedTitle: "Moneda de referencia guardada",
    onchainSavedTitle: "Pagos onchain guardados",
    onchainSavedOn: "Aceptados en el punto de venta, además de Lightning",
    onchainSavedOff: "Solo Lightning en el punto de venta",
    vatRate: "IVA por defecto",
    vatRateDescription:
      "El tipo de IVA de las nuevas líneas de factura, modificable línea por línea.",
    vatRateField: "Tipo de IVA (%)",
    vatRateHint: "Déjalo vacío para el tipo general: {{rate}}",
    vatStandard: "{{rate}} (tipo general)",
    vatSavedTitle: "IVA por defecto guardado",
    vatInvalid: "Introduce un tipo entre 0 y 100 %",
    tolerance: "Tolerancia de pago insuficiente",
    toleranceDescription:
      "Un pago onchain al que le falta como máximo este porcentaje del importe cuenta como pagado. Si falta más, el cliente debe pagar todo el resto. Se aplica a tus ventas, facturas y enlaces de pago, incluidos los de tus empleados, integraciones y asistentes IA. Nunca se muestra a tus clientes.",
    toleranceField: "Tolerancia (%)",
    toleranceHint: "De 0 a 10 %, a la décima. Vacío o 0: ninguna.",
    toleranceNone: "Ninguna",
    toleranceSavedTitle: "Tolerancia guardada",
    toleranceSaved: "{{rate}} para las próximas ventas y facturas",
    toleranceSavedNone: "Ninguna: se pide el importe completo",
    toleranceInvalid: "Introduce un porcentaje entre 0 y 10, a la décima",
    logoSavedTitle: "Logotipo guardado",
    address: {
      title: "Dirección del comercio",
      description: "Aparece bajo el nombre del comercio en sus facturas.",
      street: "Calle y número",
      postalCode: "Código postal",
      city: "Localidad",
      country: "País",
      savedTitle: "Dirección guardada"
    },
    numbers: {
      title: "Números del comercio",
      description:
        "Aparecen en sus facturas, bajo la dirección del comercio. Su nombre sigue el país del comercio.",
      savedTitle: "Número guardado"
    },
    photoSavedTitle: "Foto guardada",
    photoRemovedTitle: "Foto quitada",
    saveFailedTitle: "Error al guardar",
    failedTitle: "Ajuste no guardado",
    errors: {
      unpublished:
        "Han confirmado el cambio muy pocos relés, así que se ha anulado. Comprueba la conexión y vuelve a intentarlo.",
      newerBackup:
        "Una versión más reciente de la app ha guardado esta cuenta, así que el cambio se ha anulado. Actualiza la app y vuelve a intentarlo.",
      noAccount: "Desbloquea la app con tu passkey y vuelve a intentarlo.",
      invalid: "Comprueba el valor introducido y vuelve a intentarlo.",
      unreachable: "Han respondido muy pocos relés. Comprueba la conexión y vuelve a intentarlo.",
      saveFailed: "No se ha podido guardar el ajuste en este dispositivo. Vuelve a intentarlo.",
      denied: "Permite el acceso a tus fotos en los ajustes del dispositivo y vuelve a intentarlo.",
      unreadable: "Esta imagen no se puede usar. Elige otra.",
      logoutFailed: "No se ha completado el cierre de sesión. Vuelve a intentarlo.",
      leaveFailed: "Este dispositivo no ha podido dejar el comercio. Vuelve a intentarlo.",
      leaveUnreachable:
        "No se ha podido avisar al comercio de tu salida. Comprueba tu conexión a internet y vuelve a intentarlo.",
      salesInProgress:
        "Algunas facturas del comercio aún no son definitivas. Vuelve a intentarlo cuando se publique su versión final (hasta 3 horas después del final de una factura no pagada).",
      integrationsPending:
        "Una integración tiene un pago en curso (una solicitud de pago abierta o un pago Bitcoin en confirmación). Vuelve a intentarlo cuando haya terminado."
    },
    splitLead: "La app te propondrá vender esta parte de tus cobros.",
    ibanRefused: "Comprueba los dígitos del IBAN"
  },
  relays: {
    title: "Relés Nostr",
    lead: "Servidores Nostr a los que se conecta la app, en todos los dispositivos del comercio.",
    integrationsNotice:
      "Las integraciones de esta cuenta siguen como máximo {{moves}} cambios de relés desde su creación. Más allá, su servidor ya no las encuentra: créalas de nuevo y da las nuevas claves a sus integradores.",
    add: "Añadir un relé",
    addLead: "Introduce la dirección del relé.",
    address: "Dirección del relé",
    placeholder: "rele.ejemplo.ch",
    addConfirm: "Añadir el relé",
    addShort: "Añadir",
    removeLabel: "Quitar {{relay}}",
    keepOne: "Mantén al menos un relé.",
    tooMany: "Diez relés como máximo: quita uno para añadir otro.",
    removeUnreachable: "Quita el relé en rojo para guardar.",
    restrictedRelay:
      "« Lectura denegada »: este relé solo deja leer los datos a quien los escribió. Tus cajas, tus empleados y tus clientes no podrían leerlos: elige otro.",
    localNetworkBlocked:
      "El navegador bloquea el acceso de este sitio a la red local: permite « Red local » en la configuración del sitio (icono a la izquierda de la dirección) y vuelve a probar.",
    localNetworkNotAllowed:
      "El acceso a la red local aún no está permitido para este sitio: vuelve a probar y permítelo cuando el navegador lo pida. Si no pide nada, este dispositivo no llega al relé: comprueba que esté en la misma red o en Tailscale.",
    test: "Probar la conexión",
    status: {
      reachable: "Conectado",
      untested: "Sin probar",
      testing: "Probando",
      unreachable: "Inaccesible",
      restricted: "Lectura denegada"
    },
    statusLabel: "{{relay}}, {{status}}",
    statusDetail: "{{status}} · {{detail}}",
    noAnswer: "sin respuesta en {{duration}}",
    milliseconds: "{{value}}\u00a0ms",
    seconds: "{{value}}\u00a0s",
    errors: {
      incomplete: "Introduce una dirección completa",
      duplicate: "Introduce un relé que no esté en la lista",
      local: "Introduce la dirección de un relé público: localhost es este dispositivo"
    },
    advanced: "Ajustes avanzados",
    advancedLead:
      "Relés Nostr donde este dispositivo busca tu cuenta y crea las nuevas. Una vez conectado, se usan los de tu cuenta.",
    // "Sign-up" of "Advanced settings".
    countryDetection: {
      section: "Registro",
      title: "Detectar mi país con country.is",
      caption:
        "Solo si la zona horaria no basta. country.is recibe entonces la dirección IP de este dispositivo. Desactivado: el país viene de los ajustes del dispositivo.",
      saveFailed: "No se pudo guardar esta elección en este dispositivo. Inténtalo de nuevo."
    }
  },
  pending: {
    title: "Próximamente",
    description: "Esta pantalla aún no está diseñada."
  },
  merchantSettings: {
    businessNameWord: "Comerciante",
    saveFailed: "No se han podido guardar tus ajustes en este dispositivo. Inténtalo de nuevo."
  },
  /** "New invoice". */
  invoices: {
    newInvoice: "Nueva factura",
    // "Wallet"'s button on a phone, beside "Sell" in half the width: one word, its "+" icon tells
    // "new".
    newInvoiceShort: "Factura",
    // "Wallet"'s warning about an assistant (assistant-alerts.ts): "Remove the assistant" or "This
    // is expected" only.
    assistantAlert: {
      jumpTitle: "{{name}} se ha saltado números de factura",
      jumpBody:
        "Sus facturas llegan hasta el n.º {{from}}, pero su contador indica el n.º {{to}}: los números intermedios se tomaron sin factura. Si no tiene explicación, retira este asistente.",
      jumpBodyNone:
        "No hizo ninguna factura en {{year}}, pero su contador indica el n.º {{to}}: esos números se tomaron sin factura. Si no tiene explicación, retira este asistente.",
      blockedTitle: "{{name}} bloquea la numeración",
      blockedBody:
        "Su contador de números tiene un formato que esta versión de la app no puede leer: ninguna factura puede recibir número. Actualiza la app; si ya está actualizada, retira este asistente.",
      burstTitle: "{{name}} ha hecho muchísimas facturas",
      burstBody:
        "{{invoices}} facturas en 24 horas. Si no las pediste tú, retira este asistente: sus facturas siguen en tu monedero.",
      remove: "Retirar el asistente",
      normal: "Es normal",
      removeFailedTitle: "Asistente no retirado",
      removeFailed:
        "No se pudo retirar a {{name}}. Comprueba tu conexión a internet y vuelve a intentarlo desde la lista de integraciones"
    },
    title: "Nueva factura",
    back: "Volver",
    saveDraft: "Guardar como borrador",
    draftSaved: "Factura guardada como borrador",
    draftSavedBody: "La encontrarás en «Pendiente»",
    linkNote: "Factura {{number}}",
    recipient: {
      title: "¿A quién va dirigida la factura?",
      assistant: "Hacer sus facturas con una IA",
      name: "Razón social",
      street: "Calle y número",
      postalCode: "Código postal",
      city: "Localidad",
      country: "País"
    },
    preview: {
      title: "Vista previa del PDF",
      invoice: "Factura",
      date: "Fecha",
      due: "Vencimiento"
    },
    lines: {
      title: "¿Qué facturas?",
      empty: "Ningún artículo en esta factura",
      emptyLead: "Añade lo que vendes: un artículo de tu catálogo o una línea escrita a mano.",
      add: "Añadir un artículo",
      name: "Descripción",
      quantity: "Cantidad",
      quantityShort: "Cant.",
      unitPrice: "Precio unitario",
      unitPriceShort: "Precio unit.",
      vatRate: "Tipo de IVA",
      vat: "IVA",
      amount: "Importe",
      remove: "Eliminar",
      removeLine: "Eliminar la línea",
      expand: "Modificar la línea",
      summary: "{{quantity}} · IVA {{rate}}",
      net: "Subtotal sin IVA",
      vatOn: "IVA {{rate}} sobre {{base}}",
      total: "Total",
      quantityInvalid: "Introduce una cantidad",
      priceInvalid: "Introduce un precio",
      vatInvalid: "Introduce un tipo entre 0 y 100 %",
      tooLarge: "El total supera el importe máximo de una factura",
      incomplete: "Por completar",
      save: "Guardar en mis artículos",
      saved: "Guardado en mis artículos"
    },
    picker: {
      title: "Añadir un artículo",
      close: "Cerrar",
      manual: "Introducir un artículo",
      manualDescription: "Descripción, cantidad y precio libres",
      catalog: "Mis artículos",
      loading: "Leyendo tus artículos…",
      failed:
        "No se han podido leer tus artículos. Comprueba tu conexión a internet y vuelve a intentarlo.",
      retry: "Reintentar",
      empty: "Todavía no hay artículos. Añádelos en «Artículos».",
      convertFailed: "No se ha podido convertir el precio. Vuelve a intentarlo en unos instantes"
    },
    sameName: {
      title: "Ya hay un artículo con este nombre",
      close: "Cerrar",
      lead: "Actualízalo con el precio de esta línea o crea un segundo artículo con el mismo nombre.",
      otherCurrency:
        "Este artículo se vende en {{currency}}: su precio no puede recibir un importe en {{invoice}}. Crea un segundo artículo con el mismo nombre.",
      newPrice: "Precio de la línea: {{price}}",
      update: "Actualizar el artículo",
      duplicate: "Crear un duplicado"
    },
    due: {
      title: "Pagadera hasta el <accent>{{date}}</accent>",
      lead: "El enlace de pago sigue abierto hasta el vencimiento.",
      label: "Fecha de vencimiento",
      previousMonth: "Mes anterior",
      nextMonth: "Mes siguiente",
      close: "Cerrar"
    },
    terms: {
      title: "Para terminar, las menciones administrativas",
      conditions: "Condiciones de pago",
      legal: "Menciones legales",
      addRedirect: "Añadir una URL de redirección",
      redirect: "URL de redirección",
      redirectInvalid: "Introduce una dirección que empiece por https://",
      redirectHint:
        "Una vez pagada la factura, tu cliente podrá volver a tu sitio web (página de agradecimiento, seguimiento del pedido…) con un solo clic."
    },
    review: {
      title: "Revisar la factura",
      client: "Cliente",
      articles: "Artículos",
      due: "Vencimiento",
      notices: "Menciones administrativas",
      noNotices: "Ninguna mención",
      editRecipient: "Modificar el destinatario",
      editLines: "Modificar los artículos",
      editDue: "Modificar el vencimiento",
      editNotices: "Modificar las menciones administrativas",
      create: "Crear la factura"
    },
    sent: {
      title: "Factura {{number}} creada",
      lead: "Envíala a tu cliente. El enlace de pago sigue abierto hasta el {{date}}.",
      mail: "Enviar por correo",
      copy: "Copiar el enlace",
      copied: "Enlace copiado",
      share: "Compartir",
      pdf: "Descargar el PDF",
      newInvoice: "Nueva factura",
      view: "Ver la factura",
      close: "Cerrar"
    },
    mail: {
      subject: "Factura {{number}} · {{business}}",
      body: "Hola:\n\nA continuación encontrará la factura {{number}} de {{business}}, por un importe de {{amount}}, pagadera hasta el {{date}}.\n\nPara pagarla en bitcoin: {{url}}\n\nUn saludo cordial\n{{business}}"
    },
    pdf: {
      invoice: "Factura",
      date: "Fecha",
      due: "Vencimiento",
      reference: "Su referencia",
      billedTo: "Facturado a",
      pay: "Pagar en bitcoin",
      payHint: "Escanee el código QR o abra el enlace.",
      title: "Factura {{number}}"
    },
    detail: {
      totalDue: "Total pendiente",
      paid: "Importe pagado",
      due: "Vencimiento",
      paidOn: "Pagada el",
      rest: "Falta por pagar",
      createdBy: "Creada por ti",
      recipient: "Destinatario",
      conditions: "Condiciones y menciones",
      followUp: "Historial",
      created: "Creada",
      sent: "Enviada",
      paidEvent: "Pagada",
      more: "Más acciones",
      remind: "Recordar por correo",
      copyLink: "Copiar el enlace de pago",
      duplicate: "Duplicar",
      pdf: "Descargar el PDF",
      cancel: "Anular la factura",
      title: "Factura {{number}}",
      breadcrumb: "factura {{number}}",
      notFound: "No se encuentra esta factura. Puede que se haya eliminado en otro dispositivo.",
      reading: "Cargando la factura…",
      readFailed:
        "No se ha podido leer la factura. Comprueba tu conexión a internet y vuelve a intentarlo.",
      cancelDialog: {
        title: "¿Anular la factura {{number}}?",
        body: "El enlace de pago dejará de ofrecer el pago. Un pago ya recibido se queda en tu monedero.",
        confirm: "Anular la factura",
        keep: "Conservar la factura"
      },
      canceled: "Factura anulada",
      cancelReceived: "Esta factura ya ha recibido un pago: ya no se puede anular",
      cancelFailed:
        "No se ha podido anular la factura. Comprueba tu conexión a internet y vuelve a intentarlo"
    },
    draftDetail: {
      edit: "Modificar el borrador",
      remove: "Eliminar el borrador",
      removed: "Borrador eliminado",
      removeDialog: {
        title: "¿Eliminar el borrador {{number}}?",
        body: "Desaparece de todos tus dispositivos. Su número no se reasigna.",
        confirm: "Eliminar el borrador",
        keep: "Conservar el borrador"
      }
    },
    errors: {
      noAccount: "Desbloquea la aplicación y vuelve a intentarlo",
      invalid: "Completa la factura y vuelve a intentarlo",
      number:
        "No se ha podido asignar el número de la factura. Comprueba tu conexión a internet y vuelve a intentarlo",
      noWebApp: "Los enlaces de pago aún no están disponibles en esta versión de la aplicación",
      noAddress:
        "Por encima de {{max}} sats (el límite Lightning menos un margen del {{margin}}), una factura necesita una dirección onchain, y no hay ninguna dirección Bitcoin lista. Vuelve a intentarlo en un momento",
      unverified:
        "No se pudo comprobar el límite Lightning de la factura. Comprueba tu conexión a internet y vuelve a intentarlo",
      unreachable:
        "No se ha podido guardar la factura. Comprueba tu conexión a internet y vuelve a intentarlo",
      mailFailed:
        "No se ha podido abrir ninguna aplicación de correo. Copia el enlace de pago en su lugar",
      pdfFailed: "No se ha podido crear el PDF. Vuelve a intentarlo",
      copyFailed: "No se ha podido copiar el enlace"
    }
  },
  documentLanguage: {
    title: {
      mail: "Idioma del correo",
      pdf: "Idioma del PDF",
      export: "Idioma de la exportación"
    },
    change: {
      mail: "Idioma del correo: {{language}}. Cambiar",
      pdf: "Idioma del PDF: {{language}}. Cambiar",
      export: "Idioma de la exportación: {{language}}. Cambiar"
    },
    yours: "Tu idioma"
  },
  currencies: {
    AUD: "dólares australianos",
    CAD: "dólares canadienses",
    CHF: "francos suizos",
    CZK: "coronas checas",
    DKK: "coronas danesas",
    EUR: "euros",
    GBP: "libras esterlinas",
    HKD: "dólares de Hong Kong",
    HUF: "forintos húngaros",
    JPY: "yenes japoneses",
    MXN: "pesos mexicanos",
    NOK: "coronas noruegas",
    NZD: "dólares neozelandeses",
    PLN: "esloti polacos",
    SEK: "coronas suecas",
    SGD: "dólares de Singapur",
    USD: "dólares estadounidenses",
    ZAR: "rands sudafricanos"
  },
  currencyNames: {
    AUD: "Dólares australianos",
    CAD: "Dólares canadienses",
    CHF: "Francos suizos",
    CZK: "Coronas checas",
    DKK: "Coronas danesas",
    EUR: "Euros",
    GBP: "Libras esterlinas",
    HKD: "Dólares de Hong Kong",
    HUF: "Forintos húngaros",
    JPY: "Yenes japoneses",
    MXN: "Pesos mexicanos",
    NOK: "Coronas noruegas",
    NZD: "Dólares neozelandeses",
    PLN: "Esloti polacos",
    SEK: "Coronas suecas",
    SGD: "Dólares de Singapur",
    USD: "Dólares estadounidenses",
    ZAR: "Rands sudafricanos"
  },
  businessNumbers: {
    company: {
      CH: "Número UID",
      FR: "Número SIRET",
      DE: "Número fiscal (Steuernummer)",
      IT: "Código fiscal (codice fiscale)",
      ES: "NIF",
      PT: "NIF",
      FI: "Identificador de empresa (Y-tunnus)",
      other: "Número de empresa"
    },
    vat: {
      CH: "Número de IVA",
      EU: "NIF-IVA",
      other: "Número de IVA"
    }
  },
  whatsNew: {
    title: "Novedades",
    open: "Novedades, {{build}}",
    openUnread: "Novedades, sin leer, {{build}}",
    next: "Próxima versión",
    new: "Nuevo",
    source: "Código fuente",
    close: "Cerrar",
    empty: "Aquí aparecerán las novedades de cada versión."
  }
};

export default es;
