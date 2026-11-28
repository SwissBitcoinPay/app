import type { Translations } from "./fr";

const pt: Translations = {
  common: {
    back: "Voltar",
    continue: "Continuar",
    cancel: "Cancelar",
    startCharging: "Começar a receber",
    version: "Versão {{version}}"
  },
  welcome: {
    headline: "Pagamentos em <accent>bitcoin</accent>.",
    lead: "Ponto de venda, faturas e cartões NFC.",
    guarantees: {
      nonCustodial: "Sem custódia",
      noKyc: "Sem identificação KYC",
      oneMinute: "Em 1 minuto"
    },
    createAccount: "Criar a minha conta",
    login: "Iniciar sessão",
    joinInvitation: "Juntar-se por convite",
    alreadyHave: "Já tenho",
    have: {
      account: "Uma conta sattle.me",
      invitation: "Um convite",
      boltCard: "Um BoltCard"
    },
    manageBoltCard: "Gerir o meu BoltCard",
    boltCardApp: {
      computer:
        "Um computador não lê cartões NFC. Descarregue a app sattle.me no telemóvel: aí criará a sua conta e depois aproximará o cartão do telemóvel para o programar.",
      device:
        "Este dispositivo não lê cartões NFC. Descarregue a app sattle.me no telemóvel: aí criará a sua conta e depois aproximará o cartão do telemóvel para o programar.",
      browser:
        "Um navegador não consegue programar um cartão. Abra ou instale a app sattle.me neste telemóvel: aí criará a sua conta e depois aproximará o cartão do telemóvel para o programar.",
      iphone: "iPhone",
      android: "Android",
      codeIphone: "Código QR da app sattle.me na App Store",
      codeAndroid: "Código QR da app sattle.me no Google Play",
      scan: "Digitalize o código do seu telemóvel com a câmara dele."
    },
    terms: "Ao continuar, aceita as <link>condições gerais</link>."
  },
  legal: {
    terms: "Condições gerais",
    privacy: "Política de privacidade"
  },
  account: {
    passkeyWarning:
      "A sua passkey é a chave da sua carteira: apagá-la pode tornar os seus fundos inacessíveis.",
    progress: {
      creating: "A criar a sua passkey…",
      signingIn: "A iniciar sessão com a sua passkey…",
      preparing: "A preparar a sua conta…",
      restoring: "A recuperar as suas definições…",
      terminal: "A preparar o seu ponto de venda…"
    },
    cancelled: {
      title: "Passkey cancelada",
      body: "Toque novamente no botão para tentar outra vez."
    },
    errors: {
      recoveryOverdue:
        "Os seus pagamentos estão bloqueados: verifique primeiro as suas 12 palavras de recuperação.",
      rescueClosed:
        "O modo de socorro fechou-se: nada foi enviado. Abra-o novamente com as suas 12 palavras.",
      unsupported:
        "Este dispositivo ou navegador não pode usar uma passkey sattle.me. Use um navegador recente ou a app no iPhone, iPad ou Android.",
      prfUnsupported:
        "O seu gestor de passkeys não é compatível: use a app Palavras-passe da Apple ou o Gestor de Palavras-passe da Google.",
      notAssociated:
        "As passkeys ainda não estão ativadas nesta versão da app. Tente novamente mais tarde.",
      notConfigured: "Esta versão da app não está configurada para abrir uma carteira.",
      cancelled: "Passkey cancelada. Toque novamente no botão para tentar outra vez.",
      timedOut:
        "Tempo esgotado. Tente novamente e confirme com o rosto, a impressão digital ou o código do dispositivo.",
      noCredential:
        "Nenhuma passkey sattle.me foi proposta neste dispositivo. Verifique se as suas passkeys estão sincronizadas neste dispositivo.",
      noCredentialAndroid:
        "Nenhuma passkey sattle.me foi proposta neste dispositivo. Verifique se o seu gestor de palavras-passe não está limitado pela poupança de bateria.",
      alreadyExists: "Já existe uma passkey neste dispositivo: use «$t(welcome.login)».",
      createdNotDerived:
        "A sua passkey foi criada, mas não foi possível abrir a sua carteira. Toque em «$t(welcome.createAccount)» para concluir com esta passkey.",
      connectFailed:
        "Não foi possível abrir a sua carteira. Verifique a ligação à internet e tente novamente.",
      settingsTooNew:
        "As suas definições foram guardadas por uma versão mais recente da app. Atualize a app e tente novamente.",
      notFound:
        "Não foi encontrada nenhuma conta com esta passkey nos relays Nostr deste dispositivo.",
      terminalFailed:
        "Não foi possível preparar o seu ponto de venda. Verifique a sua ligação à internet e tente novamente.",
      deviceFailed: "Não foi possível preparar a sua conta neste dispositivo. Tente novamente.",
      failed: "Ocorreu um erro. Tente novamente."
    }
  },
  noAccount: {
    title: "Nenhuma conta encontrada",
    unreachableTitle: "Relays inacessíveis",
    answered: {
      all: "Nenhuma conta está associada a esta passkey nos relays Nostr abaixo.",
      some: "Nenhuma conta está associada a esta passkey nos relays Nostr abaixo que responderam. Outros não responderam: «$t(relays.test)» indica quais.",
      none: "Nenhum dos relays Nostr abaixo respondeu: não é possível saber se existe uma conta associada a esta passkey. Verifique a sua ligação à internet."
    },
    lead: "Escolheu relays personalizados para a sua conta? Adicione-os, guarde e depois toque em «$t(welcome.login)». Se tiver várias passkeys, verifique também se escolheu a correta."
  },
  // "Stay informed": the phone's notifications asked once, after the setup.
  notificationsOffer: {
    title: "Mantenha-se informado",
    lead: "Permita as notificações: a sattle.me avisa-o das informações importantes, mesmo com a app fechada.",
    words: "As suas 12 palavras",
    wordsBody: "Um lembrete anual para as verificar, para a sua segurança.",
    cards: "Os seus cartões",
    cardsBody: "Os pagamentos com cartão que aguardam a sua aprovação.",
    note: "Nunca publicidade. Poderá mudar de ideias nas definições do telefone.",
    allow: "Permitir as notificações",
    later: "Agora não"
  },
  recoveryCheck: {
    reminders: {
      channel: "Frase de recuperação",
      startTitle: "É altura de verificar as suas 12 palavras",
      startBody:
        "Passou um ano: volte a escrevê-las na sattle.me para confirmar que a sua folha continua correta.",
      weekTitle: "Os seus pagamentos serão bloqueados dentro de 7 dias",
      eveTitle: "Os seus pagamentos serão bloqueados amanhã",
      soonBody: "Verifique as suas 12 palavras na sattle.me para continuar a pagar.",
      dayTitle: "Os seus pagamentos estão bloqueados",
      dayBody: "Verifique as suas 12 palavras na sattle.me para voltar a pagar."
    },
    banner: {
      due: "A sua chave de reserva não está verificada",
      daysLeft: "D−{{count}}",
      daysLeftLabel_one: "Falta {{count}} dia",
      daysLeftLabel_other: "Faltam {{count}} dias",
      overdue: "Pagamentos bloqueados: verifique as suas 12 palavras",
      action: "Verificar as minhas 12 palavras"
    },
    title: "Verificar as suas 12 palavras",
    intro: {
      title: "Três casos em que só as suas 12 palavras ajudam",
      lost: "Telemóvel perdido ou roubado",
      passkey: "Passkey apagada",
      gone: "A sattle.me já não existe",
      lead: "Em cada um, as suas 12 palavras voltam a abrir a sua conta e os seus cartões. Sem elas, os fundos perdem-se.",
      key: "A passkey é a sua chave de todos os dias. As 12 palavras são a chave de reserva, guardada em casa: volte a escrevê-las a partir da sua folha.",
      due_one: "Falta {{count}} dia para o fazer.",
      due_other: "Faltam {{count}} dias para o fazer.",
      overdue: "Os seus pagamentos estão bloqueados até esta verificação.",
      optional: "Por agora nada é devido: esta verificação é uma boa prática, não bloqueia nada.",
      start: "Começar"
    },
    word: {
      progress: "Palavra {{index}} de 12",
      label: "Qual é a palavra {{index}}?",
      hint: "As palavras da lista que começam assim: nada diz qual é a certa.",
      unknown: "Esta palavra não está na lista: verifique como está escrita",
      next: "Palavra seguinte",
      previous: "Palavra anterior",
      check: "Verificar"
    },
    lost: "Já não as tenho",
    checking: "A verificar…",
    done: {
      title: "As suas 12 palavras estão verificadas",
      lead: "Guarde a sua folha num local seguro. A próxima verificação será daqui a um ano, se a sua conta ainda guardar mais de 1000 CHF.",
      finish: "Concluído"
    },
    wrong: {
      title: "Estas palavras não correspondem",
      lead: "Pelo menos uma palavra está errada, ou duas estão trocadas. Pegue novamente na sua folha e recomece, ou mostre as suas 12 palavras.",
      again: "Recomeçar"
    },
    saveFailed:
      "As suas palavras estão certas, mas não foi possível guardar a verificação. Verifique a sua ligação à internet e tente novamente.",
    retry: "Tentar novamente"
  },
  rescue: {
    section: "Recuperação",
    entry: "Abrir com as minhas 12 palavras",
    entryLead:
      "Se a sua passkey deixar de funcionar, as suas 12 palavras de recuperação abrem a sua conta para enviar os fundos para outro lugar.",
    words: {
      title: "Abrir com as suas 12 palavras",
      lead: "Escreva a frase de recuperação da sua conta, pela ordem.",
      only: "Escreva estas palavras apenas na app sattle.me. Ninguém lhas pedirá, nem por e-mail, nem por mensagem, nem por telefone.",
      label: "As suas 12 palavras",
      count_one: "{{count}} palavra de 12",
      count_other: "{{count}} palavras de 12",
      unknown: "A palavra {{position}} não está na lista: verifique como está escrita",
      checksum:
        "Estas 12 palavras não formam uma frase válida: verifique cada uma delas e a sua ordem",
      valid: "Frase completa e válida",
      submit: "Abrir a minha conta",
      opening: "A abrir a sua conta…",
      note: "As suas palavras não são guardadas nem enviadas: são esquecidas assim que fechar este ecrã.",
      failed:
        "Não foi possível abrir a sua conta. Verifique a sua ligação à internet e tente novamente."
    },
    badge: "Modo de socorro",
    funds: {
      title: "Os seus fundos",
      lead: "Conta aberta com as suas 12 palavras. Envie os seus fundos para outra carteira e depois feche.",
      leadWalletOnly:
        "Nenhum relay deste dispositivo conhece a sua conta: só a sua carteira se abre. Para encontrar os seus cartões, feche e depois mude de relays em «$t(relays.advanced)».",
      wallet: "Carteira",
      card: "Cartão «{{name}}»",
      cardUnnamed: "Cartão sem nome",
      former: "Antiga carteira do cartão «{{name}}»",
      formerUnnamed: "Antiga carteira de um cartão",
      reading: "A ler…",
      unread: "Ainda não lido",
      empty: "Vazio",
      arriving: "{{amount}} a caminho",
      send: "Esvaziar",
      retry: "$t(wallet.retry)",
      cardsUnread:
        "Não foi possível ler os seus cartões numa maioria dos seus relays: alguns podem faltar. Tente novamente mais tarde.",
      cardsFailed:
        "Não foi possível ler os seus cartões. Verifique a sua ligação à internet e tente novamente.",
      export: "Exportar o histórico",
      close: "Fechar",
      closeNote:
        "Ao fechar, este dispositivo esquece as suas 12 palavras. Os seus fundos ficam onde estão."
    },
    drain: {
      title: "Esvaziar a carteira",
      intro:
        "Todo o saldo da carteira vai para um endereço lightning, bitcoin ou Spark: escreva-o, cole-o ou digitalize-o. As taxas são retiradas desse saldo.",
      introNoScan:
        "Todo o saldo da carteira vai para um endereço lightning, bitcoin ou Spark: escreva-o ou cole-o. As taxas são retiradas desse saldo.",
      total: "Saldo da carteira",
      feesAbove: "As taxas excedem o saldo da carteira a esta velocidade",
      empty: "Esta carteira não contém nada para enviar.",
      confirm: "Enviar tudo",
      done: "{{amount}} enviados: a carteira está vazia.",
      pending: "Envio de {{amount}} a caminho: chegará assim que for concluído.",
      failed: "O envio não foi concluído. Verifique o saldo da carteira e tente novamente."
    },
    closed: "O modo de socorro fechou-se: abra-o novamente com as suas 12 palavras.",
    idle: {
      title: "Fecho em {{seconds}} s",
      body: "Sem atividade, o modo de socorro fecha-se e esquece as suas 12 palavras.",
      closed:
        "O modo de socorro fechou-se após 5 minutos sem atividade: escreva novamente as suas 12 palavras para o reabrir."
    }
  },
  migration: {
    amount: "{{btc}} (cerca de {{fiat}})",
    entry: "Migrar a minha conta Swiss\u00a0Bitcoin\u00a0Pay",
    // Before the brand's wordmark (MigrateAccountEntry); `entry` is what screen readers say.
    entryLead: "Migrar de",
    home: {
      badge: "A Swiss\u00a0Bitcoin\u00a0Pay passa a ser sattle.me",
      title: "Olá, {{business}}",
      titleUnnamed: "Olá",
      titleManual: "Migrar a sua conta Swiss\u00a0Bitcoin\u00a0Pay",
      leadFound: "Encontrámos a sua conta. Tudo passa para a sattle.me:",
      leadPassword:
        "Encontrámos a sua conta. Para manter os seus pagamentos, a sua palavra-passe Swiss\u00a0Bitcoin\u00a0Pay, uma última vez:",
      leadManual:
        "Inicie sessão uma última vez na sua conta Swiss\u00a0Bitcoin\u00a0Pay: o seu negócio e os seus pagamentos passam para a sattle.me, que não tem palavra-passe.",
      payoutsReading: "A ler…",
      payoutsAfterPassword: "Após a sua palavra-passe",
      read: "Lido na sua conta Swiss\u00a0Bitcoin\u00a0Pay",
      money: "O seu dinheiro acompanha-o: é transferido para a sua nova conta.",
      retry: "Tentar novamente",
      migrate: "Migrar"
    },
    login: {
      email: "E-mail",
      password: "Palavra-passe",
      checking: "A ligar à sua antiga conta…",
      forgotten: "Esqueceu a palavra-passe?",
      changed: "Já escolhi uma nova palavra-passe",
      note: "A sua palavra-passe é usada uma única vez e nunca é guardada.",
      errors: {
        refused: "E-mail ou palavra-passe incorretos",
        unreachable: "A sua antiga conta não responde. Verifique a ligação e tente novamente.",
        stopped:
          "Para não bloquear a sua antiga conta, deixámos de tentar com esta palavra-passe. Escolha uma nova: enviamos-lhe uma ligação por e-mail.",
        secondFactor:
          "A sua antiga conta pede um código de verificação, que a sattle.me não pode usar. Escreva-nos para {{email}}: ajudamos a atualizar a sua conta."
      }
    },
    forgot: {
      title: "Palavra-passe esquecida",
      lead: "Indique o e-mail da sua antiga conta Swiss\u00a0Bitcoin\u00a0Pay: enviamos-lhe uma ligação para escolher uma nova palavra-passe.",
      send: "Enviar a ligação",
      sending: "A enviar…",
      invalidEmail: "Este endereço de e-mail não é válido",
      failed: "Não foi possível pedir a ligação. Verifique a ligação à Internet e tente novamente.",
      sentTitle: "Verifique o seu e-mail",
      sent: "Se uma conta Swiss\u00a0Bitcoin\u00a0Pay usa {{email}}, acabou de lhe ser enviado um e-mail. Abra a ligação nele para escolher uma nova palavra-passe.",
      sentNote:
        "A ligação é válida durante 15 minutos. Não recebeu nada? Veja na pasta de spam, ou volte atrás para a pedir de novo.",
      choose: "Escolher uma nova palavra-passe"
    },
    password: {
      title: "Nova palavra-passe",
      lead: "Escolha a nova palavra-passe da sua antiga conta Swiss\u00a0Bitcoin\u00a0Pay.",
      label: "Nova palavra-passe",
      rules: {
        length: "Pelo menos 8 caracteres",
        letter: "Pelo menos uma letra",
        digit: "Pelo menos um algarismo"
      },
      met: "cumprido",
      unmet: "ainda não",
      save: "Guardar",
      saving: "A guardar…",
      rejected: "Esta palavra-passe não é aceite: verifique as regras abaixo",
      failed: "Não foi possível alterar a palavra-passe. Verifique a ligação e tente novamente.",
      expired:
        "Esta ligação já não é válida: já foi usada, ou os seus 15 minutos passaram. Peça uma nova.",
      again: "Receber uma nova ligação",
      doneTitle: "Palavra-passe alterada",
      done: "A sua nova palavra-passe está guardada. Inicie sessão com ela para atualizar a sua conta."
    },
    confirm: {
      currency: "Moeda",
      payouts: "Pagamentos",
      payoutsToChoose: "A escolher depois de criar a conta",
      split: "{{bitcoin}} bitcoin · {{bank}} banco",
      allBitcoin: "{{percent}} bitcoin",
      bank: "Conta bancária",
      holder: "Titular",
      freeze:
        "Quando a sua conta sattle.me for criada, a sua antiga conta deixa de receber pagamentos. Os sats que lhe deve são enviados de imediato por Lightning para a sua conta sattle.me, ou o mais tardar às 0:00\u00a0UTC se o envio não for logo concluído.",
      notMine: "Não é a minha conta",
      migratedTitle: "Conta já atualizada",
      migrated:
        "«{{business}}» passou para a sattle.me a {{date}}. Abra a sua conta sattle.me com a respetiva passkey.",
      logIn: "Iniciar sessão"
    },
    freeze: {
      settingTitle: "Antiga conta Swiss\u00a0Bitcoin\u00a0Pay",
      settingDescription:
        "Não foi possível congelar a sua antiga conta no fim da atualização: ainda recebe pagamentos, e o seu saldo não é pago na sattle.me. Congele-a agora.",
      settingLead:
        "Inicie sessão uma última vez na sua antiga conta Swiss\u00a0Bitcoin\u00a0Pay: é congelada, e os sats que lhe deve são enviados de imediato por Lightning para a sua conta sattle.me, ou o mais tardar às 0:00\u00a0UTC.",
      settingStart: "Congelar a minha antiga conta",
      running: "A fechar a sua antiga conta…",
      done: "A sua antiga conta Swiss\u00a0Bitcoin\u00a0Pay está congelada: já não recebe pagamentos. Fundos transferidos para a sua nova carteira sattle.me.",
      doneNone:
        "A sua antiga conta Swiss\u00a0Bitcoin\u00a0Pay está congelada: já não recebe pagamentos. Não há saldo a transferir.",
      donePending:
        "A sua antiga conta Swiss\u00a0Bitcoin\u00a0Pay está congelada: já não recebe pagamentos. Os fundos serão transferidos para a sua nova carteira sattle.me o mais tardar às 0:00\u00a0UTC.",
      conflict:
        "A sua antiga conta já tinha sido atualizada para outra conta sattle.me: é lá que o seu dinheiro é pago. Se não foi você, escreva-nos para {{email}}.",
      rejected:
        "Não foi possível congelar a sua antiga conta. Escreva-nos para {{email}}: fazemo-lo consigo.",
      failed:
        "Não foi possível congelar a sua antiga conta: ainda recebe pagamentos. Verifique a ligação e tente novamente.",
      lost: "Não foi possível congelar a sua antiga conta: ainda recebe pagamentos. Escreva-nos para {{email}}: fazemo-lo consigo."
    },
    transfer: {
      prompt: "Abrir a sua antiga carteira",
      running: "A transferir o seu dinheiro…",
      retry: "Tentar novamente",
      sentTitle: "{{amount}} a caminho da sua nova conta",
      sent: "Vão aparecer em «$t(navigation.destinations.wallet)» quando a rede os confirmar, normalmente numa hora. Taxa de rede: {{fee}}.",
      more: "Mais {{amount}} estão a caminho da sua antiga conta: poderá transferi-los em «$t(navigation.destinations.wallet)» quando chegarem.",
      empty: "A sua antiga carteira está vazia: nada a transferir.",
      waiting:
        "{{amount}} estão a chegar à sua antiga conta: poderá transferi-los em «$t(navigation.destinations.wallet)» quando chegarem.",
      tooSmall:
        "A sua antiga carteira contém {{amount}}, menos do que as taxas para os transferir. Por agora ficam onde estão.",
      unreadable:
        "O seu telemóvel não conseguiu abrir a sua antiga carteira. Tente novamente ou escreva as suas 12 palavras.",
      failed: "Não foi possível fazer a transferência. Verifique a ligação e tente novamente.",
      sheetTitle: "Transferir a sua antiga carteira?",
      from: "De",
      fromName: "Carteira Swiss Bitcoin Pay",
      fromCaption: "12 palavras, neste telemóvel",
      to: "Para",
      toName: "A sua carteira sattle.me",
      amountLabel: "Montante",
      amountUnknown: "Lido no momento da transferência",
      sats: "{{sats}} sats",
      fiat: "cerca de {{fiat}}",
      eraseNote:
        "Depois, as 12 palavras são apagadas da memória deste telemóvel, com ou sem transferência.",
      start: "Transferir",
      skip: "Não transferir",
      skipTitle: "Apagar sem transferir?",
      skipBody:
        "As 12 palavras da sua carteira Swiss Bitcoin Pay vão ser apagadas da memória do seu telemóvel. Os {{amount}} que contém só poderão ser recuperados com as suas 12 palavras anotadas em papel.",
      skipBodyUnknown:
        "As 12 palavras da sua carteira Swiss Bitcoin Pay vão ser apagadas da memória do seu telemóvel. O que contém só poderá ser recuperado com as suas 12 palavras anotadas em papel.",
      skipConfirm: "Tenho as 12 palavras,\napagar sem transferir",
      erased: "As 12 palavras foram apagadas deste telemóvel.",
      tooSmallErased:
        "A sua antiga carteira contém {{amount}}, menos do que as taxas para a transferir: fica onde está.",
      skipped:
        "As 12 palavras foram apagadas deste telemóvel, sem transferência. Com as suas 12 palavras anotadas em papel pode transferir o que contém.",
      eraseFailed: "Não foi possível apagar as 12 palavras deste telemóvel. Tente novamente."
    },
    done: {
      title: "A sua conta está atualizada",
      todoTitle: "Ainda por fazer, se se aplicar a si",
      employees: "Volte a convidar os seus funcionários",
      shop: "Migre a integração da sua loja online",
      changes: "O que muda",
      words:
        "Restam {{amount}} na sua antiga carteira Swiss\u00a0Bitcoin\u00a0Pay. Transfira-os com as 12 palavras anotadas na sua criação.",
      wordsUnknown:
        "Não foi possível verificar a sua antiga carteira Swiss\u00a0Bitcoin\u00a0Pay: pode ainda conter dinheiro. Transfira-o com as 12 palavras anotadas na sua criação.",
      checking: "A verificar a sua antiga carteira…",
      titleRunning: "A atualizar a sua conta",
      lead: "Normalmente alguns segundos.",
      // The steps of the migration's end (MigrationTimeline, end-steps.tsx).
      steps: {
        account: "Conta sattle.me criada",
        accountCaption: "«{{business}}» está pronto para receber pagamentos.",
        frozen: "Antiga conta congelada",
        frozenSent:
          "Já não recebe pagamentos. Fundos transferidos para a sua nova carteira sattle.me.",
        frozenNone: "Já não recebe pagamentos. Não há saldo a transferir.",
        frozenPending:
          "Já não recebe pagamentos. Os fundos serão transferidos para a sua nova carteira sattle.me o mais tardar às 0:00\u00a0UTC.",
        migratedElsewhere: "Antiga conta já atualizada",
        notFrozen: "Antiga conta não congelada",
        history: "Cópia do seu histórico",
        historyWaiting: "Assim que a sua antiga conta estiver congelada.",
        historyRunning: "A copiar o seu histórico…",
        historyRead_one: "{{formatted}} movimento lido",
        historyRead_other: "{{formatted}} movimentos lidos",
        historyWritten_one: "{{copied}}\u00a0/\u00a0{{total}} movimento",
        historyWritten_other: "{{copied}}\u00a0/\u00a0{{total}} movimentos",
        historyCopied: "Histórico copiado",
        historyCopiedCaption_one:
          "{{formatted}} movimento, visível em «$t(navigation.destinations.wallet)».",
        historyCopiedCaption_other:
          "{{formatted}} movimentos, visíveis em «$t(navigation.destinations.wallet)».",
        historyEmpty: "Nenhum movimento a copiar.",
        historyNotCopied: "Histórico não copiado",
        wallet: "Antiga carteira"
      }
    },
    changes: {
      title: "O que muda",
      lead: "Assim que a sua conta sattle.me é criada:",
      frozen:
        "Depois de congelada, a sua antiga conta Swiss\u00a0Bitcoin\u00a0Pay já não recebe nenhum pagamento, nem na caixa, nem online, nem no seu endereço Lightning.",
      items: {
        employees: {
          title: "Volte a convidar os seus funcionários",
          caption:
            "Os dispositivos deles já não recebem pagamentos na antiga conta. Convide-os em «$t(navigation.destinations.employees)»: digitalizam o seu código e recebem por si. Um dispositivo demasiado antigo para a sattle.me já não pode receber pagamentos."
        },
        shop: {
          title: "Migre a integração da sua loja online",
          caption:
            "A sua loja online já não recebe pagamentos na antiga conta. Crie uma integração em «$t(navigation.destinations.integrations)» e dê a chave dela à pessoa que gere o seu site."
        },
        limits: {
          title: "Sem mais limites",
          caption:
            "Graças à atualização sattle.me 3.0.0, deixa de haver limites ou restrições ligados à verificação de identidade."
        },
        money: {
          title: "O seu dinheiro acompanha-o",
          caption:
            "Os sats que a antiga conta lhe deve são enviados por Lightning para a sua conta sattle.me com a atualização, sejam quais forem as suas antigas definições; se o envio não for concluído, é repetido todas as noites às 0:00\u00a0UTC. Os que ainda chegarem depois seguem assim que forem liquidados. As transferências bancárias já em curso fazem-se como habitualmente."
        },
        cards: {
          title: "Transfira os seus cartões",
          caption:
            "Aproxime cada cartão Swiss\u00a0Bitcoin\u00a0Pay em «$t(navigation.destinations.cards)» para transferir o seu saldo. Um cartão ainda não transferido funciona até {{cardEnd}}."
        },
        history: {
          title: "O seu histórico é copiado",
          caption:
            "As suas vendas, levantamentos e comissões são copiados para «$t(navigation.destinations.wallet)», a título informativo. Estão nas suas exportações CSV e PDF. O histórico da sua antiga conta continua disponível para consulta e exportação em dashboard.swiss-bitcoin-pay.ch até {{merchantEnd}}."
        }
      }
    },
    // The copy of the v2 account's history (src/features/migration/history-import.ts).
    history: {
      running: "A copiar o seu histórico Swiss\u00a0Bitcoin\u00a0Pay em segundo plano…",
      // While reading the v2 server (its pages tell no total), then writing to the relays.
      reading_one:
        "A ler o seu histórico Swiss\u00a0Bitcoin\u00a0Pay: {{formatted}} movimento lido…",
      reading_other:
        "A ler o seu histórico Swiss\u00a0Bitcoin\u00a0Pay: {{formatted}} movimentos lidos…",
      writing_one:
        "A copiar o seu histórico Swiss\u00a0Bitcoin\u00a0Pay: {{copied}}\u00a0/\u00a0{{total}} movimento…",
      writing_other:
        "A copiar o seu histórico Swiss\u00a0Bitcoin\u00a0Pay: {{copied}}\u00a0/\u00a0{{total}} movimentos…",
      done_one:
        "O seu histórico foi copiado: {{formatted}} movimento, visível em «$t(navigation.destinations.wallet)».",
      done_other:
        "O seu histórico foi copiado: {{formatted}} movimentos, visíveis em «$t(navigation.destinations.wallet)».",
      failed:
        "A cópia do seu histórico não foi concluída. Volte a iniciá-la em «$t(settings.title)», secção «$t(settings.groups.account)».",
      settingTitle: "Histórico Swiss\u00a0Bitcoin\u00a0Pay",
      settingDescription:
        "Copie para o sattle.me as vendas, levantamentos e comissões da sua antiga conta, a título informativo. Possível até {{date}}.",
      start: "Importar o meu histórico",
      lead: "Inicie sessão uma última vez na sua antiga conta Swiss\u00a0Bitcoin\u00a0Pay: o seu histórico é copiado em segundo plano.",
      note: "A sua palavra-passe serve uma única vez e nunca é guardada.",
      errors: {
        secondFactor:
          "A sua antiga conta pede um código de verificação que o sattle.me não pode usar. Contacte o suporte.",
        stopped:
          "Para não bloquear a sua antiga conta, deixámos de tentar. Verifique a sua palavra-passe antes de tentar novamente mais tarde.",
        unreachable: "A sua antiga conta não responde. Verifique a sua ligação e tente novamente."
      }
    },
    words: {
      open: "Escrever as minhas 12 palavras",
      title: "A sua antiga carteira",
      lead: "Escreva por ordem as 12 palavras anotadas na criação da sua carteira na app Swiss Bitcoin Pay. O seu dinheiro será transferido para a sua conta sattle.me.",
      only: "Apenas estas 12 palavras: nunca escreva aqui as de outra carteira (Ledger, Trezor, BitBox ou outra).",
      label: "As suas 12 palavras",
      invalid: "Estas palavras não formam uma carteira: verifique cada uma delas e a sua ordem",
      mismatch:
        "Estas palavras não são as da sua carteira Swiss\u00a0Bitcoin\u00a0Pay: verifique cada uma delas e a sua ordem e escreva-as novamente",
      unused:
        "Estas palavras não correspondem a nenhuma carteira que alguma vez tenha recebido dinheiro: verifique cada uma delas e a sua ordem e escreva-as novamente",
      submit: "Transferir",
      done: "Concluído",
      note: "As suas palavras servem uma única vez e nunca são guardadas."
    },
    employee: {
      title: "A Swiss Bitcoin Pay passa a ser sattle.me",
      lead: "Este dispositivo recebia pagamentos para um negócio. Para continuar, peça ao responsável que o volte a convidar a partir da sattle.me e depois leia o código dele.",
      leadBusiness:
        "Este dispositivo recebia pagamentos para «{{business}}». Para continuar, peça ao responsável que o volte a convidar a partir da sattle.me e depois leia o código dele.",
      join: "Ler o convite",
      logIn: "Já tenho uma conta sattle.me",
      owner: "Sou o responsável por este negócio"
    },
    wallet: {
      unchecked:
        "A sua antiga carteira Swiss Bitcoin Pay está neste telemóvel. Verifique se ainda há dinheiro para transferir.",
      check: "Verificar e transferir",
      funds: "Restam {{amount}} na sua antiga conta, para transferir para aqui.",
      transfer: "Transferir",
      incoming:
        "{{amount}} estão a chegar à sua antiga conta: poderá transferi-los quando chegarem."
    }
  },
  split: {
    title: "Como quer ser pago?",
    description:
      "A app irá propor-lhe vender esta parte do que recebe. Pode alterá-lo a qualquer momento.",
    bitcoin: "Bitcoin",
    freeUntil: "Grátis até {{date}}",
    sattleFee: "Comissão da sattle.me",
    sattleFeeScope: "Sobre tudo o que recebe, convertido ou não",
    conversionFee: "Conversão em {{currency}}",
    conversionFeeScope: "Comissões de venda da Mt Pelerin, apenas sobre a parte convertida",
    extraFee: "+ {{fee}}",
    transferNote:
      "Transferência grátis a partir de {{threshold}}. Abaixo disso, as suas vendas são agrupadas até o atingirem, ou transferidas de imediato por {{fee}}.",
    waivedRate: "{{free}} em vez de {{fee}}",
    feeRange: "{{min}} a {{max}}",
    sliderLabel: "Parte em bitcoin",
    sliderValue: "{{bitcoin}} em bitcoin, {{fiat}} em {{currency}}",
    currencyButton: "Moeda da transferência: {{currency}}"
  },
  bank: {
    currentAccount: "A conta guardada",
    currentAccountSub: "Na Mt Pelerin, nesta moeda",
    editAccount: "Editar esta conta",
    title:
      "Para onde transferir os <accent>{{percent}}</accent> convertidos em <accent>{{currency}}</accent>?",
    transferSchedule: "As suas vendas são transferidas para lá, agrupadas numa transferência.",
    editableLater: "Pode alterar estes dados nas definições.",
    country: "País de residência",
    iban: "IBAN",
    ibanInvalid: "Verifique o IBAN",
    holderKind: "O titular é",
    person: "Uma pessoa",
    company: "Uma empresa",
    companyName: "Denominação social",
    firstname: "Nome próprio",
    lastname: "Apelido",
    address: "Morada",
    addressPlaceholder: "Rua e número",
    postalCode: "Código postal",
    postalCodePlaceholder: "1003",
    city: "Localidade",
    cityPlaceholder: "Lausanne",
    mtPelerin: {
      sheetTitle: "Conta Mt Pelerin",
      lead: "Esta parte é vendida ao nosso parceiro Mt Pelerin, intermediário financeiro suíço, que transfere o montante para a sua conta bancária.",
      accountTitle: "A sua conta no nosso parceiro",
      accountSms: "O seu número de telemóvel e um código recebido por SMS, depois o seu e-mail",
      accountKey: "A chave da sua conta sattle.me, depois o seu e-mail e o seu número",
      bankTitle: "A sua conta bancária",
      bankSub: "Registada no nosso parceiro, que lhe transfere para lá as suas vendas",
      saleTitle: "Nada é vendido sem si",
      saleSub:
        "A app propõe-lhe vender esta parte e confirma com a sua passkey. Antes da primeira venda, um pagamento de 1 sat verifica a sua carteira",
      connected: "Conta Mt Pelerin ligada: esta conta bancária será registada lá",
      create: "Criar a minha conta Mt Pelerin",
      existing: "Já tenho uma conta Mt Pelerin",
      createTitle: "Criar a sua conta",
      createLeadSms:
        "Com o seu número de telemóvel, depois o seu e-mail. Uma conta já aberta com este número é retomada.",
      createLeadKey: "Com a chave da sua conta sattle.me, depois o seu e-mail e o seu número.",
      existingTitle: "Ligar a sua conta",
      existingLeadSms: "Com o número de telemóvel da sua conta.",
      existingLeadKey: "Com a chave da sua conta sattle.me."
    }
  },
  setup: {
    title: "A configurar a sua conta…",
    description:
      "A preparar o seu endereço Lightning e o seu ponto de venda. Pode demorar alguns instantes.",
    cardDescription: "A preparar a sua conta neste dispositivo. Demora apenas um instante.",
    failedTitle: "Configuração interrompida",
    retry: "Tentar novamente"
  },
  appStores: {
    googlePlay: "Instalar a app no Google Play",
    appStore: "Instalar a app na App Store"
  },
  install: {
    banner: {
      name: "sattle.me",
      iphone: "A app para iPhone, na App Store",
      ipad: "A app para iPad, na App Store",
      android: "A app para Android, no Google Play",
      computer: "Numa janela própria, como uma app",
      get: "Obter",
      install: "Instalar",
      dock: "Adicionar à Dock",
      dismiss: "Fechar, não voltar a propor"
    },
    setting: {
      title: "Instalar a app",
      places: {
        iphone: "A app sattle.me para iPhone, na App Store.",
        ipad: "A app sattle.me para iPad, na App Store.",
        android: "A app sattle.me para Android, no Google Play.",
        computer: "sattle.me neste computador, numa janela própria, como uma app.",
        dock: "sattle.me na Dock deste Mac, numa janela própria, como uma app."
      },
      appStore: "App Store",
      googlePlay: "Google Play"
    },
    dock: {
      title: "Adicionar sattle.me à Dock",
      menu: "Na barra de menus do Safari, selecione <strong>Ficheiro > Adicionar à Dock</strong>.",
      add: "Clique em <strong>Adicionar</strong>: sattle.me abre a partir da Dock, numa janela própria.",
      requirement: "Com o Safari no macOS Sonoma ou posterior.",
      passkey:
        "A app da Dock guarda os seus próprios dados: da primeira vez, volte a iniciar sessão com a sua passkey.",
      done: "Compreendi"
    }
  },
  countryPicker: {
    search: "Pesquisar um país",
    noResult: "Nenhum país encontrado",
    close: "Fechar"
  },
  currencyPicker: {
    title: "Moeda da transferência",
    close: "Fechar"
  },
  card: {
    computerTitle: "Adicione o seu <accent>cartão</accent> a partir do telemóvel",
    computerDescription:
      "Um computador não lê cartões NFC. Digitalize este código com o telemóvel: abre a app, onde inicia sessão com a mesma passkey. Depois aproxime o cartão do telemóvel.",
    computerCode: "Código QR que abre este passo na app do seu telemóvel",
    computerWaiting:
      "À espera do telemóvel: esta página continua assim que o cartão for adicionado.",
    // The same in the app on a device that reads no card (an iPad, useReadsCards.ts).
    deviceDescription:
      "Este dispositivo não lê cartões NFC. Digitalize este código com o telemóvel: abre a app, onde inicia sessão com a mesma passkey. Depois aproxime o cartão do telemóvel.",
    deviceDescriptionNoCode:
      "Este dispositivo não lê cartões NFC. Abra a app no telemóvel e inicie sessão com a mesma passkey; depois aproxime o cartão do telemóvel.",
    deviceWaiting: "À espera do telemóvel: este ecrã continua assim que o cartão for adicionado.",
    addedTitle: "O seu <accent>cartão</accent> foi adicionado",
    addedDescription:
      "Adicionado a partir do telemóvel, também aparece aqui, em « Cartões ». Carregue-o para o usar.",
    webTitle: "Associe o seu <accent>BoltCard</accent> a partir da app",
    webDescription:
      "Um navegador não consegue programar um cartão. Abra a app sattle.me neste telemóvel e inicie sessão com a sua passkey: a associação continuará aí.",
    webDescriptionAndroid:
      "Um navegador não consegue programar um cartão. Abra a app Android sattle.me neste telemóvel, ou instale-a, e inicie sessão com a sua passkey: a associação continuará na app.",
    webDescriptionIphone:
      "Um navegador não consegue programar um cartão. Abra a app iPhone sattle.me neste telemóvel, ou instale-a, e inicie sessão com a sua passkey: a associação continuará na app.",
    retry: "Tentar novamente",
    openSettings: "Abrir as definições",
    activationPending:
      "O seu cartão está programado, mas o seu relay ainda não respondeu. Será ativado da próxima vez que abrir a app com ligação: até lá, não pode pagar.",
    activationNoPush:
      "O seu cartão está pronto, mas este telemóvel não recebe as notificações de pagamento: só paga enquanto a app está no ecrã. As notificações serão ativadas automaticamente se este telemóvel as puder receber.",
    failure: {
      noAccount:
        "A sua sessão está fechada. Inicie sessão novamente com a sua passkey e tente outra vez.",
      nfcUnavailable:
        "O NFC não está disponível ou está desativado neste dispositivo. Ative-o nas definições e tente novamente.",
      notificationsDenied:
        "Permita as notificações do sattle.me nas definições do telemóvel: é por elas que o telemóvel sabe que uma caixa está a ler o seu cartão.",
      relayUnreachable:
        "O relay do cartão não responde. Verifique a ligação e tente novamente. O seu cartão não foi alterado.",
      relayIncompatible:
        "O relay do cartão não usa a versão esperada. O seu cartão não foi alterado.",
      relayTooLong: "O endereço deste relay é demasiado longo para caber num cartão.",
      recordsUnreachable:
        "Respondem demasiado poucos relés da sua conta. Verifique a ligação e tente novamente. O seu cartão não foi alterado.",
      notConfirmed:
        "Os relés da sua conta não confirmaram esta alteração: ainda pode aplicar-se, ou não. Verifique a ligação e tente novamente.",
      notBlank: "Este cartão não está virgem. Peça primeiro ao seu emissor para o repor.",
      ownCard:
        "Este cartão já está em « Cartões ». Para o adicionar de novo, elimine-o primeiro, com o cartão na mão.",
      notThisCard:
        "Este não é o cartão escolhido, ou foi reprogramado noutro lado. Nada foi alterado: aproxime o cartão certo.",
      cardLost:
        "O cartão afastou-se demasiado cedo. Aproxime-o novamente e mantenha-o junto ao telemóvel até ao fim: a associação continuará onde parou.",
      notBoltCard: "Este cartão não é um BoltCard (NTAG 424 DNA).",
      verifyFailed:
        "O cartão foi programado, mas a sua verificação falhou. Aproxime-o novamente para tentar outra vez.",
      versionsExhausted:
        "Este cartão foi programado demasiadas vezes com esta carteira. Use outro cartão.",
      newerApp: "Uma versão mais recente da app guardou este cartão. Atualize a app.",
      walletNotEmpty:
        "A carteira deste cartão não está vazia, ou ainda lhe estão a chegar sats. Levante primeiro o seu saldo para o seu saldo principal: um cartão eliminado deixa de aparecer em qualquer lado, tal como os seus sats. O seu cartão não foi alterado.",
      walletUnavailable:
        "A carteira deste cartão não respondeu: um cartão só é eliminado quando se verifica que a sua carteira está vazia. Verifique a ligação e tente novamente. O seu cartão não foi alterado.",
      cardGone: "Este cartão já não está em « Cartões »: foi eliminado. Nada foi alterado.",
      deletionPending:
        "Os relés da sua conta ainda não registaram a eliminação: o cartão não ficou virgem.",
      migrationDrainFailed:
        "Desta vez não foi possível transferir o saldo deste cartão, e o cartão não foi alterado: tente novamente dentro de momentos.",
      migrationOverDailyLimit:
        "Esta transferência ultrapassa o limite do cartão: 1000 CHF por 24 horas, incluindo as despesas recentes. Nada foi transferido e o cartão não foi alterado: tente novamente quando o saldo estiver abaixo deste limite, ou contacte o suporte.",
      migrationReceiptPending:
        "A transferência foi pedida, mas não foi possível confirmar a tempo a sua chegada à nova carteira. Os seus sats podem já estar a caminho: « Cartões » mostra o cartão e a sua carteira. O cartão não foi alterado: aguarde um momento e tente novamente.",
      migrationMasterKey:
        "Não foi possível recodificar o cartão: a sua chave mestra não é a esperada. O que já foi transferido está na sua nova carteira, que « Cartões » mostra. Tente novamente; se o problema persistir, contacte o suporte.",
      migrationNotWiped:
        "Não foi possível repor o cartão. O que já foi transferido está na sua nova carteira, que « Cartões » mostra. Tente novamente; se o problema persistir, contacte o suporte.",
      migrationCardDisabled:
        "Este cartão está bloqueado no serviço anterior: não pode ser migrado. Se foi você a bloqueá-lo, desbloqueie-o primeiro; caso contrário, contacte o suporte. Nada foi alterado.",
      migrationPaymentPending:
        "Um pagamento deste cartão ainda está em curso no serviço anterior, muitas vezes a transferência acabada de fazer: ainda não pode ser apagado. O cartão não foi alterado: tente novamente dentro de instantes, a migração continuará onde parou.",
      migrationServerUnreachable:
        "A troca com o servidor da Swiss Bitcoin Pay, o único que pode abrir este cartão, não foi concluída. Verifique a sua ligação e mantenha o cartão junto ao telemóvel, depois tente novamente: a associação continuará onde parou.",
      cancelled: "Associação cancelada.",
      failed: "A associação falhou. Tente novamente."
    },
    nfcAlert: "Aproxime o seu BoltCard da parte de cima do telemóvel e mantenha-o no lugar.",
    nfcSuccess: "Cartão associado",
    nfcFailure: "Associação interrompida",
    notificationChannel: "Pagamentos com cartão",
    decline: {
      newPayee:
        "Novo comerciante: o titular deve aprová-lo na sua app sattle.me e voltar a apresentar o cartão.",
      unidentifiedPayee:
        "Comerciante não identificado: o titular deve confirmar o pagamento na sua app sattle.me.",
      unconfirmed: "Pagamento a confirmar pelo titular na sua app sattle.me.",
      notConfirmed: "Pagamento não confirmado no telemóvel do titular.",
      refused: "Pagamento recusado pelo titular do cartão.",
      insufficientBalance: "Saldo do cartão insuficiente.",
      aboveLimit: "Montante acima do limite por pagamento do cartão.",
      dayLimit: "Limite de 24 horas do cartão atingido.",
      hourLimit: "Demasiados pagamentos com este cartão na última hora.",
      suspended: "Cartão em pausa: o titular pode reativá-lo na sua app sattle.me.",
      invalidInvoice: "Fatura não válida para este cartão.",
      expired: "Fatura expirada: crie uma nova.",
      noAmount: "Fatura sem montante: o cartão só paga um montante fixo.",
      outOfBounds: "Montante fora dos limites do cartão (de 1 sat a 1 BTC).",
      alreadyPaid: "O cartão não paga esta fatura: já está liquidada.",
      invalidTap: "Leitura do cartão inválida: apresente o cartão novamente.",
      sendFailed: "O pagamento não saiu, nada foi pago. Apresente o cartão novamente.",
      uncertain:
        "Pagamento interrompido: ainda pode chegar, aguarde alguns segundos antes de tentar novamente.",
      updateApp: "O titular deve atualizar a sua app sattle.me.",
      superseded: "Uma leitura mais recente do cartão substituiu esta.",
      other: "Não foi possível processar o pagamento."
    },
    payment: {
      title: "Pagamento com cartão",
      close: "Fechar",
      waiting: "Cartão lido, à espera da fatura da caixa…",
      checking: "A verificar o comerciante…",
      delay: {
        minute: "num minuto",
        seconds_one: "em {{count}} segundo",
        seconds_other: "em {{count}} segundos"
      },
      note: {
        newPayee: "Novo comerciante: verifique o montante e o nome antes de pagar.",
        unidentifiedPayee:
          "A caixa não provou quem recebe este pagamento: verifique o montante com o comerciante.",
        unconfirmed: "Verifique o montante e o comerciante."
      },
      pay: "Pagar {{amount}}",
      decline: "Recusar",
      answerIn: "Responda dentro de {{seconds}} s",
      timeOut: "Tempo esgotado",
      timeLabel: "Tempo para responder",
      merchant: "Comerciante",
      noteLabel: "Nota",
      card: "Cartão",
      exactAmount: "Montante exato",
      approve: "Aprovar este comerciante",
      approveCaption: "Os seus próximos pagamentos sairão sem confirmação",
      joined: "{{first}} · {{second}}",
      ofCard: "cartão {{name}}",
      confirming: "Confirme com a sua passkey…",
      paying: "A enviar o pagamento…",
      payingAutomatically: "A enviar o pagamento, sem confirmação…",
      approved: "Este comerciante faz agora parte dos seus comerciantes aprovados.",
      done: "Concluir",
      doneIn: "Concluir ({{seconds}} s)",
      failedTitle: "Pagamento não efetuado",
      nothingPaid: "Nada foi pago.",
      result: {
        completedTitle: "Pagamento efetuado",
        completedBody: "{{amount}} pagos com o seu cartão.",
        completedBodyAutomatic: "{{amount}} pagos com o seu cartão, sem confirmação.",
        pendingTitle: "Pagamento enviado",
        pendingBody:
          "O pagamento de {{amount}} partiu. O seu estado aparece na lista de movimentos.",
        failedTitle: "Pagamento falhado",
        failedBody:
          "O pagamento de {{amount}} não foi concluído. O seu estado aparece na lista de movimentos.",
        declinedTitle: "Pagamento recusado",
        declinedBody: "Recusou este pagamento de {{amount}}. Nada foi pago; a caixa foi informada."
      },
      failure: {
        unreachable: "O relé do cartão não responde, ou este pagamento expirou. Nada foi pago.",
        ended:
          "A caixa já não espera por este pagamento. Nada foi pago: apresente o cartão de novo se necessário.",
        invalidInvoice:
          "A caixa enviou uma fatura que a sua carteira não pode pagar. Nada foi pago.",
        otherNetwork: "A fatura da caixa é de outra rede Bitcoin. Nada foi pago.",
        expired: "A fatura da caixa expirou. Nada foi pago.",
        noAmount: "A fatura da caixa não tem um montante em sats inteiros. Nada foi pago.",
        outOfBounds: "O montante está fora dos limites de um pagamento com cartão. Nada foi pago.",
        suspended: "Este cartão está em pausa. Nada foi pago.",
        alreadyPaid: "Esta fatura já foi paga. Nada foi pago de novo.",
        dayLimit: "Este pagamento ultrapassaria o limite de 24 horas do seu cartão. Nada foi pago.",
        hourLimit: "O seu cartão atingiu o número de pagamentos desta hora. Nada foi pago.",
        aboveLimit: "O montante ultrapassa o limite do seu cartão. Nada foi pago.",
        notYourCard: "Este pagamento não vem de uma leitura do seu cartão. Nada foi pago.",
        replayed: "Esta leitura do seu cartão já foi usada. Nada foi pago.",
        unlock: "O pagamento não foi confirmado. Nada foi pago.",
        insufficientBalance:
          "O saldo do seu cartão não chega para este pagamento e a sua taxa. Nada foi pago: carregue o cartão em « Cartões ».",
        sendFailed:
          "A sua carteira não conseguiu enviar este pagamento, por exemplo por falta de saldo. Nada partiu.",
        uncertain:
          "A sua carteira não confirmou o envio: o pagamento pode ter partido. Verifique a lista de movimentos antes de pagar de outra forma.",
        newerApp:
          "Uma versão mais recente da aplicação registou o seu cartão. Atualize a aplicação. Nada foi pago.",
        otherInvoice:
          "O serviço do comerciante não reconhece esta fatura: pode ter sido substituída pelo caminho. Nada foi pago.",
        settled:
          "O serviço do comerciante indica que esta fatura já está paga. Nada foi pago de novo.",
        newPayee:
          "Sem confirmação {{delay}}: nada foi pago. A caixa foi informada de que este novo comerciante deve ser aprovado na app.",
        newPayeeHomonym: "Sem confirmação {{delay}}: nada foi pago.",
        unidentifiedPayee:
          "Sem confirmação {{delay}}: nada foi pago. A caixa foi informada de que o comerciante não está identificado.",
        unconfirmed: "Sem confirmação {{delay}}: nada foi pago. A caixa foi informada.",
        late: "O pagamento não pôde partir {{delay}}. Nada foi pago.",
        failed: "Este pagamento não pôde ser processado. Nada foi pago."
      }
    },
    payee: {
      quoted: "«{{name}}»",
      unnamed: "Nome desconhecido",
      node: "Nó {{node}}",
      by: {
        address: "identificado pelo seu endereço Lightning",
        node: "identificado pelo seu nó Lightning"
      },
      nodeWarning:
        "Este comerciante é identificado pelo seu nó Lightning, não pelo seu endereço. Se este nó for partilhado (Spark, Wallet of Satoshi, Strike…), aprová-lo aprova também todos os seus outros utilizadores: seriam pagos sem confirmação, dentro dos limites do cartão.",
      formerName: "anteriormente «{{name}}»",
      localName: "nos seus comerciantes: «{{name}}»",
      homonym:
        "Mesmo nome que um comerciante já aprovado, mas conta diferente: verifique antes de pagar.",
      chip: {
        approved: "Aprovado em {{date}}",
        approvedUndated: "Aprovado",
        new: "Novo comerciante",
        unidentified: "Comerciante não identificado",
        unchecked: "Não controlado (modo automático)"
      },
      declaredName: "{{name}}, nome declarado pelo comerciante",
      declaredByNode: "{{name}}, nome declarado pelo nó"
    },
    notice: {
      title: "Pagamento com cartão: {{amount}}",
      body: "{{amount}} para {{name}}",
      askTitle: "Pendente: Pagamento com cartão",
      askBody: "{{amount}} para {{name}}. Clique para confirmar, a caixa está à espera.",
      askBodyUnchecked: "{{amount}}. Clique para confirmar, a caixa está à espera.",
      askBodyNoInvoice: "Clique para confirmar, a caixa está à espera.",
      refusedTitle: "Recusado: Pagamento com cartão ({{amount}} para {{name}})",
      refusedTitleUnchecked: "Recusado: Pagamento com cartão ({{amount}})",
      refusedTitleNoInvoice: "Recusado: Pagamento com cartão",
      pausedBody: "{{card}} está em pausa. Nada foi pago."
    }
  },
  cards: {
    title: "Cartões",
    locked: {
      title: "Os seus cartões estão bloqueados",
      body: "Desbloqueie a app com a sua passkey para ver e gerir os seus cartões."
    },
    pairOnPhone:
      "Para associar um cartão, abra a aplicação no telemóvel: é ele que o programa, com o cartão encostado.",
    pairOnAndroid:
      "Para associar um cartão, use a app Android sattle.me: é ela que o programa, com o cartão encostado ao telemóvel.",
    pairOnIphone:
      "Para associar um cartão, use a app iPhone sattle.me: é ela que o programa, com o cartão encostado ao telemóvel.",
    shop: {
      order: "Encomendar cartões",
      title: "Escolha o seu cartão",
      lead: "Vários designs, para encomendar na loja sattle.me."
    },
    loading: "A carregar os seus cartões…",
    failed: {
      noAccount:
        "A sua sessão está fechada. Desbloqueie a aplicação com a sua passkey e tente novamente.",
      unreachable:
        "Não foi possível ler os seus cartões: os relés da sua conta não respondem. Verifique a ligação e tente novamente."
    },
    retry: "Tentar novamente",
    map: {
      title: "Onde pagar com o seu cartão",
      source: "Lightning sem contacto · BTC Map",
      desktopSubtitle: "As lojas que aceitam pagamentos Lightning sem contacto · mapa do BTC Map",
      openSite: "Abrir btcmap.org",
      loading: "A carregar o mapa…",
      failedTitle: "O mapa não foi carregado",
      failedBody:
        "O BTC Map não responde, ou o dispositivo está offline. Verifique a ligação e tente novamente.",
      openInBrowser: "Abrir btcmap.org no navegador",
      frameTitle: "Mapa do BTC Map das lojas que aceitam pagamentos sem contacto"
    },
    unnamed: "Cartão {{id}}",
    carousel: "Os seus cartões",
    slot: "Cartão {{n}} de {{count}}: {{label}}",
    add: "Adicionar um cartão",
    cardOf: "Cartão {{name}}",
    order: {
      organize: "Organizar",
      organizeA11y: "Organizar os cartões",
      title: "Ordem dos cartões",
      lead: "Mantenha premida uma pega e arraste. O primeiro cartão aparece ao abrir «Cartões», em todos os seus dispositivos.",
      rowLead: "Arraste um cartão para o seu lugar (ou ← →). O primeiro aparece ao abrir.",
      save: "Guardar",
      cancel: "Cancelar",
      close: "Fechar",
      saved: "Ordem dos cartões guardada",
      failedTitle: "Ordem não guardada",
      unsaved: "Os relés da sua conta não responderam: verifique a ligação e tente novamente",
      newer: "Foi escolhida numa versão mais recente da aplicação: atualize-a para a alterar",
      moveUp: "Subir",
      moveDown: "Descer",
      moveLeft: "Mover para a esquerda",
      moveRight: "Mover para a direita",
      row: "{{label}}, {{n}} de {{count}}",
      moved: "{{label}}, agora {{n}} de {{count}}",
      previous: "Cartões anteriores",
      next: "Cartões seguintes"
    },
    // "Add a card", in "Cards" and the sign-up (AddCardFlow.tsx).
    adding: {
      guide: {
        title: "Antes de começar",
        subtitle: "Um BoltCard virgem. Um cartão da antiga app é migrado, com o seu saldo.",
        card: "Um BoltCard virgem",
        cardBody: "Um cartão da antiga app é migrado, com o seu saldo.",
        notifications: "As notificações",
        notificationsBody:
          "Permita-as quando o telemóvel pedir: é através delas que sabe que uma caixa lê o cartão.",
        start: "Começar"
      },
      web: {
        note: "Um computador não lê cartões NFC: um cartão adiciona-se na app, no telemóvel, com o cartão na mão.",
        noteDevice:
          "Este dispositivo não lê cartões NFC: um cartão adiciona-se na app, no telemóvel, com o cartão na mão.",
        noteAndroid:
          "Um navegador não consegue programar um cartão: um cartão adiciona-se na app Android sattle.me, com o cartão na mão.",
        noteIphone:
          "Um navegador não consegue programar um cartão: um cartão adiciona-se na app iPhone sattle.me, com o cartão na mão.",
        where: "Contra o telemóvel",
        whereBody: "Mantenha o cartão no lugar até ao fim, alguns segundos.",
        code: "Código QR que abre « Adicionar um cartão » na app do telemóvel",
        scan: "Digitalize este código com o telemóvel: abre « Adicionar um cartão » na app."
      },
      steps: {
        label: "Passos para adicionar o cartão",
        notifications: "Notificações permitidas",
        notificationsTodo: "Autorização das notificações",
        notificationsRunning: "A autorizar as notificações",
        notificationsFailed: "Notificações não permitidas",
        notificationsCaption: "É assim que o seu telemóvel sabe que uma caixa lê o cartão",
        relay: "Relé do cartão acessível",
        relayTodo: "Verificação do relé do cartão",
        relayRunning: "A verificar o relé do cartão",
        relayFailed: "Relé do cartão não verificado",
        card: "Cartão aproximado",
        cardTodo: "Aproximação do cartão",
        cardRunning: "À espera do cartão",
        cardFailed: "Cartão não reconhecido",
        cardIos: "Por cima do telemóvel, até à confirmação",
        cardAndroid: "Contra a parte de trás do telemóvel, até à vibração",
        programming: "Cartão programado",
        programmingTodo: "Programação do cartão",
        programmingRunning: "A programar o cartão",
        programmingFailed: "Cartão não programado",
        programmingCaption: "Não mexa o cartão",
        activating: "Cartão ativado",
        activatingTodo: "Ativação do cartão",
        activatingRunning: "A ativar o cartão",
        activatingFailed: "Cartão não ativado",
        activatingPending: "Ativação por concluir",
        activatingCaption: "O relé regista este telemóvel",
        prepTitle: "A preparar…",
        prepSubtitle: "Duas verificações antes do cartão",
        holdIos: "Segure o cartão por cima do telemóvel",
        holdAndroid: "Segure o cartão contra a parte de trás do telemóvel",
        holdSubtitle: "Um BoltCard virgem",
        keepTitle: "Mantenha o cartão no lugar",
        keepSubtitle: "Programação para a sua carteira",
        almostTitle: "Quase pronto",
        almostSubtitle: "Pode afastar o cartão",
        doneTitle: "Cartão adicionado",
        doneSubtitle: "Carregue-o para o usar",
        failedTitle: "Não foi possível adicionar o cartão",
        failedNothing: "Nada foi escrito no cartão",
        failedGoesOn: "Retomará onde parou",
        notificationsDenied: "Notificações recusadas",
        notificationsDeniedCaption: "Permita-as nas definições do telemóvel e tente novamente.",
        nfcUnavailable: "NFC indisponível",
        lost: "Cartão afastado demasiado cedo",
        lostIos:
          "Aproxime-o de novo e mantenha-o no lugar até à confirmação: a adição retomará onde parou.",
        lostAndroid:
          "Aproxime-o de novo e mantenha-o no lugar até à vibração: a adição retomará onde parou.",
        relayUnreachable: "Relé inacessível",
        relayUnreachableCaption:
          "{{host}} não responde: verifique a ligação deste telemóvel e tente novamente",
        relayIncompatible: "Relé incompatível",
        relayIncompatibleCaption:
          "{{host}} não fala a versão esperada: atualize a app e tente novamente",
        recordsUnreachable: "Relés da conta inacessíveis",
        recordsUnreachableCaption:
          "Respondem poucos relés da sua conta: verifique a ligação deste telemóvel e tente novamente",
        notBlank: "Cartão não virgem",
        notBoltCard: "Cartão não compatível",
        notBoltCardCaption:
          "Este cartão não é um BoltCard (NTAG 424 DNA): aproxime um BoltCard virgem",
        ownCard: "Cartão já adicionado",
        verifyFailed: "Verificação falhada",
        cancelled: "Leitura do cartão cancelada",
        failed: "Não foi possível adicionar o cartão: tente novamente",
        recharge: "Carregar o cartão",
        later: "Mais tarde",
        cancel: "Cancelar",
        stateTodo: ": por fazer",
        stateRunning: ": em curso",
        stateDone: ": feito",
        stateFailed: ": falhou",
        stateWarning: ": a verificar"
      },
      migration: {
        heading: "Migração do cartão",
        foundTitle: "Cartão Swiss Bitcoin Pay detetado",
        toTransfer: "Saldo a transferir",
        reading: "A ler o saldo…",
        amountA11y: "{{amount}} sats",
        whatLabel: "O que vai acontecer",
        whatTransfer: "O seu saldo é transferido para a carteira do cartão, na sua app.",
        whatErase:
          "Aproxima o cartão uma segunda vez: é apagado e depois programado para a sua carteira.",
        whatVisual: "Mantém a sua imagem e o seu número.",
        confirm: "Transferir e migrar",
        label: "Passos da migração",
        transferred: "Saldo transferido",
        transferTodo: "Transferência do saldo",
        transferRunning: "A transferir o saldo",
        recognized: "Cartão reconhecido",
        recognizedTodo: "Reconhecimento do cartão",
        recognizedRunning: "A reconhecer o cartão",
        recognizedFailed: "Cartão não reconhecido",
        recognizedCaption: "A sua carteira guarda o que já transferiu",
        nothingCaption: "Nenhum saldo a transferir",
        receivedCaption: "{{amount}} recebidos",
        sendingCaption: "{{amount}} a caminho",
        heldSecond: "Cartão aproximado uma segunda vez",
        heldSecondTodo: "Aproximação do cartão uma segunda vez",
        heldAgain: "Cartão aproximado mais uma vez",
        heldAgainTodo: "Aproximação do cartão mais uma vez",
        programmed: "Cartão apagado e programado",
        programmedTodo: "Apagamento e programação do cartão",
        programmedRunning: "A apagar e programar o cartão",
        activated: "Cartão ativado",
        doneTitle: "Cartão migrado",
        doneSubtitle: "Paga agora a partir da sua própria carteira, dentro dos seus limites.",
        doneSubtitleVisual:
          "Mantém a sua imagem e o seu número, e paga agora a partir da sua própria carteira, dentro dos seus limites.",
        failedTitle: "A migração não foi concluída",
        failedGoesOn: "Retomará onde parou",
        failed: "A migração falhou: tente novamente",
        notTransferred: "Saldo não transferido",
        transferUnconfirmed: "Transferência não confirmada",
        lostIos:
          "Aproxime-o de novo e mantenha-o no lugar até à confirmação: a migração retomará onde parou.",
        lostAndroid:
          "Aproxime-o de novo e mantenha-o no lugar até à vibração: a migração retomará onde parou.",
        transferTitle: "Transferência do saldo",
        transferSubtitle: "{{amount}} vão para a carteira do cartão. Mantenha o cartão à mão.",
        keepTitle: "Mantenha o cartão no lugar",
        keepSubtitle: "Apagamento e programação: não o mexa.",
        almostTitle: "Quase pronto",
        almostSubtitle: "Pode afastar o cartão.",
        holdSecond: "Aproxime o cartão uma segunda vez",
        holdAgain: "Aproxime o cartão mais uma vez",
        holdSubtitleIos:
          "Por cima do telemóvel, até à confirmação: vai ser apagado e depois programado.",
        holdSubtitleAndroid:
          "Contra a parte de trás do telemóvel, até à vibração: vai ser apagado e depois programado.",
        finish: "Concluir"
      }
    },
    // "Cards", the screen.
    home: {
      firstCard: "Adicione o seu primeiro cartão",
      newCard: "Novo cartão",
      addLead:
        "Um BoltCard virgem paga a partir da sua própria carteira de autocustódia, que carrega aqui.",
      steps: {
        program: {
          title: "Programe-o",
          caption: "Encoste o cartão virgem ao telemóvel: é ele que o programa."
        },
        recharge: {
          title: "Carregue-o",
          caption: "Tem a sua própria carteira: envie-lhe os sats que poderá gastar."
        },
        pay: {
          title: "Pague com um gesto",
          caption:
            "Aproxime-o do terminal de um comerciante: ele paga, dentro dos limites que escolher."
        }
      },
      reading: "A ler o saldo…",
      received: "{{amount}} recebidos",
      balanceA11y: "Saldo do cartão: {{amount}} sats",
      withdraw: "Levantar",
      withdrawA11y: "Levantar do cartão",
      history: "Histórico",
      rechargeA11y: "Carregar o cartão",
      historyCaption: "Todos os movimentos do cartão",
      withdrawEmpty: "Nada para levantar",
      sendCaption: "Para outra carteira",
      sendCaptionMain: "Para outra carteira ou o meu saldo principal",
      migratingNote:
        "A migração deste cartão não está concluída: ainda não paga. O que já transferiu está na sua carteira, abaixo.",
      finishMigration: "Concluir a migração",
      finishOnPhone: "Termine-a na aplicação do telemóvel, com o cartão encostado.",
      security: "Segurança",
      pause: "Pausar",
      pauseCaption: "Recusa qualquer pagamento, sem esquecer nada. O interruptor volta a ativá-lo.",
      limits: "Limites",
      payees: "Pagamentos sem confirmação",
      payeesReading: "A ler…",
      payeesPending: "ainda não nos relés",
      payeesUnread: "Ainda não lido",
      payeesNewer: "Atualize a app",
      card: "Cartão",
      customize: "Personalizar",
      customizeCaption: "Nome e aspeto",
      customizeIssuer: "Nome · imagem do emissor",
      relay: "Relé e programação",
      advanced: "Definições avançadas",
      advancedRelayReady: "Relé pronto",
      delete: "Eliminar o cartão",
      deleteCaption: "O cartão e todos os seus dados desaparecem da aplicação",
      deleteUnread: "Primeiro é preciso ler o seu saldo"
    },
    // "Limits".
    limits: {
      edit: "Alterar",
      back: "Voltar aos limites",
      reading: "A ler os pagamentos…",
      unread: "Os relés da sua conta não responderam: o que o cartão já pagou não é mostrado.",
      unreadPhone:
        "Não foi possível ler os pagamentos deste telemóvel: o que o cartão já pagou não é mostrado.",
      notePhone:
        "Segundo os pagamentos feitos por este telemóvel. As janelas deslizam: cada pagamento liberta-se 24 h (ou 1 h) depois.",
      noteWeb:
        "Segundo os pagamentos do cartão que os relés da sua conta guardam. As janelas deslizam: cada pagamento liberta-se 24 h (ou 1 h) depois.",
      at: "às {{time}}",
      tomorrowAt: "amanhã às {{time}}",
      on: "a {{date}}",
      confirm: "Confirmar com a minha passkey",
      fiatHint: "Ou seja {{fiat}} à taxa atual · {{max}} sats no máximo",
      satsHint: "{{max}} sats no máximo",
      countHint: "{{max}} no máximo",
      preview: {
        reached: "Limite atingido",
        hourLeft_one: "Ainda {{count}} pagamento",
        hourLeft_other: "Ainda {{count}} pagamentos",
        hourNext: "Próximo pagamento possível {{when}}"
      },
      day: {
        title: "Em 24 horas",
        of: "de {{max}} sats",
        limit: "Limite: {{max}} sats",
        left: "Ainda {{amount}} sats, ou seja {{fiat}}",
        leftSats: "Ainda {{amount}} sats",
        reached: "Limite atingido: o cartão recusa qualquer pagamento",
        release: "{{amount}} sats libertam-se {{when}}",
        lead: "Um pagamento que, com os das últimas 24 horas, ultrapassasse este limite é recusado.",
        used: "Já usado: {{amount}} sats.",
        field: "Limite em 24 horas",
        belowUsed:
          "Já usou {{amount}} sats: o cartão recusará qualquer pagamento até a janela se libertar.",
        belowPayment:
          "Inferior ao limite por pagamento ({{amount}} sats): é este limite de 24 h que limitará cada pagamento."
      },
      hour: {
        title: "Esta hora",
        of_one: "pagamento de {{max}}",
        of_other: "pagamentos de {{max}}",
        limit_one: "Limite: {{count}} pagamento por hora",
        limit_other: "Limite: {{count}} pagamentos por hora",
        release: "O pagamento das {{paid}} liberta-se {{when}}",
        reached: "Limite atingido: próximo pagamento possível {{when}}",
        formTitle: "Pagamentos por hora",
        lead: "Um pagamento que, com os da última hora, ultrapassasse este número é recusado.",
        used_one: "Já nesta hora: {{count}} pagamento.",
        used_other: "Já nesta hora: {{count}} pagamentos.",
        field: "Pagamentos por hora",
        belowUsed_one:
          "Já fez {{count}} pagamento nesta hora: o cartão recusará qualquer pagamento até a janela se libertar.",
        belowUsed_other:
          "Já fez {{count}} pagamentos nesta hora: o cartão recusará qualquer pagamento até a janela se libertar."
      },
      payment: {
        title: "Por pagamento",
        caption: "Um pagamento mais alto é recusado",
        lead: "Um pagamento superior a este limite é recusado.",
        field: "Limite por pagamento",
        aboveDay:
          "Superior ao limite em 24 horas ({{amount}} sats): é o limite de 24 h que limitará cada pagamento."
      }
    },
    // "Customize": a card's "Name" and "Look".
    customize: {
      title: "Personalizar o cartão",
      name: "Nome",
      clear: "Apagar o nome",
      taken:
        "Outro dos seus cartões já se chama {{name}}. Um nome diferente distingue-os no momento de pagar.",
      look: "Aspeto",
      lookKind: "Tipo de aspeto",
      color: "Cor",
      image: "Imagem",
      // Read by screen readers only.
      colors: {
        ink: "Tinta",
        night: "Noite",
        plum: "Ameixa",
        bordeaux: "Bordéus",
        fir: "Abeto",
        lagoon: "Lagoa",
        copper: "Cobre",
        bitcoin: "Bitcoin"
      },
      choosePhoto: "Escolher uma foto",
      chooseImage: "Escolher uma imagem",
      takePhoto: "Tirar uma foto",
      imageNote: "Depois irá enquadrá-la no formato do cartão. Substituirá a cor.",
      errors: {
        photoDenied:
          "Permita o acesso às suas fotos nas definições do dispositivo e tente novamente.",
        cameraDenied:
          "A câmara não abre. Permita-a nas definições do dispositivo e tente novamente.",
        unreadable: "Esta imagem não pode ser usada. Escolha outra.",
        imageUnpublished:
          "Não foi possível guardar a imagem nos relés da sua conta. Verifique a ligação e tente novamente.",
        failed: "Não foi possível alterar o cartão. Tente novamente."
      }
    },
    // "Frame the image".
    frame: {
      title: "Enquadrar a imagem",
      hint: "Arraste para mover, aperte ou use os botões para fazer zoom.",
      hintWeb: "Arraste a imagem para a mover; a roda ou os botões fazem zoom.",
      area: "Imagem a enquadrar",
      zoomValue: "Zoom {{zoom}}",
      zoomIn: "Aproximar",
      zoomOut: "Afastar",
      moveLeft: "Mover a imagem para a esquerda",
      moveRight: "Mover a imagem para a direita",
      moveUp: "Mover a imagem para cima",
      moveDown: "Mover a imagem para baixo",
      use: "Usar esta imagem"
    },
    status: {
      active: "Ativo",
      suspended: "Em pausa",
      migrating: "Migração por concluir"
    },
    sync: {
      ready: "Pronto",
      noPush: "Sem notificações",
      unreachable: "Relé inacessível",
      refused: "Erro do relé"
    },
    onPhone: {
      label: "No seu telemóvel",
      openApp: "Abra a sattle.me no seu telemóvel",
      openAppScan: "Ou digitalize este código com ele: abre « Cartões » na app.",
      hold: "Aproxime o cartão do telemóvel",
      code: "Código QR que abre « Cartões » na app no seu telemóvel"
    },
    relay: {
      checking: "A verificar o cartão…",
      readyTitle: "O cartão está pronto",
      readyBody:
        "O seu relé, {{host}}, acorda este telemóvel a cada pagamento. Não detém chaves nem fundos.",
      stateTitle: "Estado do cartão",
      reachable: "Relé acessível",
      defaultCaption: "{{host}}, relé predefinido",
      programmed: "Cartão programado para este relé",
      programmedCaption: "Os seus próximos toques são aí esperados",
      notWoken: "Este telemóvel não é acordado",
      notWokenCaption:
        "Notificações desativadas: o cartão só paga quando a app está aberta neste telemóvel.",
      noTokenCaption:
        "Este telemóvel não recebe as notificações de pagamento: o cartão só paga quando a app está aberta neste telemóvel.",
      enableNotifications: "Ativar as notificações",
      unreachable: "Relé inacessível",
      unreachableCaption:
        "{{host}} não respondeu a este telemóvel: o cartão não pode pagar enquanto não responder.",
      refused: "Erro do relé",
      refusedCaption: "{{host}} recusou o canal do cartão: não pode pagar enquanto o recusar.",
      uncheckedTitle: "Estado não verificado",
      uncheckedCaption:
        "Não foi possível ler o estado do cartão neste telemóvel. Tente novamente dentro de instantes.",
      change: "Mudar de relé",
      changeCaption: "Para um relé que aloja você mesmo",
      sourceLink: "sattleme/relay no github.com",
      webCaption: "Acorda o seu telemóvel a cada pagamento do cartão, sem deter chaves nem fundos.",
      webNote: "Um computador não lê cartões NFC: o cartão programa-se na app, num telemóvel.",
      webNoteAndroid:
        "Um navegador não consegue programar um cartão: programa-se na app Android sattle.me.",
      webNoteIphone:
        "Um navegador não consegue programar um cartão: programa-se na app iPhone sattle.me.",
      deviceNote:
        "Este dispositivo não lê cartões NFC: o cartão programa-se na app, num telemóvel.",
      webOnPhone: "No telemóvel",
      webStepsTitle: "No seu telemóvel, com o cartão na mão",
      webHoldCaption: "Quando a app o pedir, até ao fim dos passos.",
      defaultLink: "Relé predefinido",
      fieldInvalid: "Introduza um endereço completo",
      fieldLong: "Introduza um endereço com {{max}} caracteres no máximo",
      fieldUnreachable: "Relé inacessível: verifique o endereço",
      fieldIncompatible: "Relé incompatível com este cartão",
      moved: "O cartão passa agora por {{host}}",
      steps: {
        label: "Passos da mudança de relé",
        relay: "Novo relé acessível",
        relayTodo: "Verificação do novo relé",
        relayRunning: "A verificar o novo relé",
        relayFailed: "Novo relé não verificado",
        relayCaption: "{{host}}, versão esperada",
        card: "Cartão aproximado",
        cardTodo: "Aproximação do cartão",
        cardRunning: "À espera do cartão",
        cardFailed: "Cartão não reconhecido",
        cardAndroid: "Contra a parte de trás do telemóvel, até à vibração",
        cardIos: "Por cima do telemóvel, até à confirmação",
        programming: "Programado para este relé",
        programmingTodo: "Programação para este relé",
        programmingRunning: "A ser programado para este relé",
        programmingFailed: "Não programado para este relé",
        programmingCaption: "Não mexa o cartão",
        former: "Relé anterior esquecido",
        formerTodo: "Relé anterior a esquecer",
        formerRunning: "A esquecer o relé anterior",
        formerFailed: "Relé anterior não esquecido",
        formerCaption: "{{relay}} já não recebe os seus toques",
        formerDown: "Relé anterior inacessível",
        formerDownCaption: "{{relay}} não respondeu: o seu canal fica lá, sem efeito",
        formerRefused: "Relé anterior com erro",
        formerRefusedCaption: "{{relay}} recusou esquecer o seu canal: fica lá, sem efeito",
        formerUnknown: "Relé anterior a verificar",
        formerUnknownCaption:
          "{{relay}} respondeu sem o confirmar: o seu canal talvez tenha ficado lá, sem efeito",
        lost: "Cartão afastado demasiado cedo",
        lostAndroid:
          "Aproxime-o de novo e mantenha-o no lugar até à vibração: a mudança retomará onde parou.",
        lostIos:
          "Aproxime-o de novo e mantenha-o no lugar até à confirmação: a mudança retomará onde parou.",
        holdAndroid: "Segure {{name}} contra a parte de trás do telemóvel",
        holdIos: "Segure {{name}} por cima do telemóvel",
        holdSubtitle: "Vai passar por {{host}}",
        keepTitle: "Mantenha o cartão no lugar",
        keepSubtitle: "Programação para o novo relé",
        almostTitle: "Quase pronto",
        almostSubtitle: "Pode afastar o cartão",
        doneTitle: "O cartão passa por {{host}}",
        doneSubtitle: "Mantém o nome, o saldo e as definições",
        failedTitle: "A mudança não foi concluída",
        failedNothing: "Nada foi escrito neste cartão",
        failedGoesOn: "Retomará onde parou",
        checkingTitle: "A verificar o novo relé",
        relayUnreachable:
          "{{host}} não responde: verifique a ligação deste telemóvel e tente novamente",
        relayIncompatible: "{{host}} não fala a versão esperada",
        recordsUnreachable:
          "Respondem poucos relés da sua conta: verifique a ligação deste telemóvel e tente novamente",
        cancelled: "Leitura do cartão cancelada",
        failed: "A mudança falhou: tente novamente",
        resetNotice:
          "Enquanto a mudança não for concluída, o cartão deixa de pagar e de aparecer em « Cartões ». Com « Adicionar um cartão », volta no relé predefinido, com o seu saldo, o seu nome e os seus limites.",
        finish: "Concluir",
        cancel: "Cancelar",
        stateTodo: ": por fazer",
        stateRunning: ": em curso",
        stateDone: ": feito",
        stateFailed: ": falhou",
        stateWarning: ": a verificar"
      }
    },
    history: {
      title: "Histórico",
      subtitle: "Cartão {{name}}",
      reading: "A ler o histórico…",
      failed: "Os relés da sua conta não responderam: o histórico não pode ser mostrado.",
      legacyUnread:
        "Nem todos os relés da sua conta responderam: podem faltar movimentos antigos do cartão.",
      ownOnly:
        "Os relés da sua conta não responderam: podem faltar os pagamentos feitos pelos seus outros telemóveis.",
      walletFailed:
        "Não foi possível ler a carteira do cartão: os seus últimos carregamentos e levantamentos podem faltar.",
      newer: "Alguns movimentos só aparecem com uma versão mais recente da app.",
      empty: "Nenhum movimento para este cartão.",
      pendingGroup: "Em curso",
      deposit: "Depósito Bitcoin",
      depositConfirming: "Recebido · à espera de confirmação",
      depositClaiming: "Confirmado · a ser adicionado ao saldo",
      depositFees: "À espera de taxas mais baixas: {{asked}} pedidos, {{max}} no máximo",
      depositFeesUnknown: "À espera de taxas mais baixas: {{max}} sats no máximo",
      at: "{{time}} · {{what}}",
      paid: "Pago",
      refused: "Recusado: {{reason}}",
      refusedPlain: "Recusado",
      failedRow: "Falhou: nada saiu",
      uncertain: "Incerto: talvez tenha saído",
      sending: "A enviar",
      noName: "Pagamento com cartão",
      recharge: "Carregamento",
      recovered: "Fundos recuperados",
      return: "Levantamento",
      toMain: "Para o meu saldo principal",
      ways: {
        main: "Do meu saldo principal",
        invoice: "Fatura Lightning",
        address: "Endereço Lightning",
        onchain: "Endereço Bitcoin",
        onchainFee: "Endereço Bitcoin, taxa {{fee}}",
        lnurl: "Link LNURL",
        spark: "Endereço Spark"
      },
      means: {
        main: "O meu saldo principal",
        invoice: "Fatura Lightning",
        address: "Endereço Lightning",
        onchain: "Endereço Bitcoin",
        lnurl: "Link LNURL",
        spark: "Endereço Spark"
      },
      showMonth: "Mostrar {{month}}",
      showMonthAll: "Mostrar {{month}} completo",
      monthFailed: "Não foi possível ler este mês: os relays da sua conta não responderam.",
      monthIncomplete: "Não foi possível ler uma parte dos meses mostrados.",
      legacy: {
        pinNeeded:
          "O histórico deste cartão na Swiss Bitcoin Pay está protegido pelo PIN que lhe deu. Introduza-o para o adicionar aqui.",
        open: "Recuperar o histórico",
        failed: "Não foi possível recuperar o histórico deste cartão na Swiss Bitcoin Pay.",
        title: "Histórico da Swiss Bitcoin Pay",
        lead: "Introduza o PIN que deu a este cartão na Swiss Bitcoin Pay: o seu histórico junta-se ao do cartão.",
        pin: "PIN",
        submit: "Recuperar",
        note: "Serve uma única vez, para ler o histórico do cartão na Swiss Bitcoin Pay: a sattle.me não o guarda.",
        errors: {
          pinInvalid: "PIN incorreto",
          pinLocked:
            "Demasiadas tentativas: a Swiss Bitcoin Pay recusa este PIN durante algum tempo. Tente novamente mais tarde.",
          failed:
            "Não foi possível recuperar o histórico. Verifique a sua ligação e tente novamente."
        }
      },
      reasons: {
        declined: "não confirmado no telemóvel",
        newPayee: "novo comerciante não confirmado",
        unidentifiedPayee: "comerciante não identificado, não confirmado",
        unconfirmed: "não confirmado a tempo",
        insufficientBalance: "saldo do cartão insuficiente",
        invalidInvoice: "fatura inválida",
        expired: "fatura expirada",
        noAmount: "fatura sem montante",
        alreadyPaid: "fatura já paga",
        outOfBounds: "montante fora dos limites",
        aboveLimit: "acima do limite por pagamento",
        dayLimit: "limite de 24 horas atingido",
        hourLimit: "demasiados pagamentos nesta hora",
        suspended: "cartão em pausa",
        invalidTap: "leitura do cartão inválida",
        failed: "pagamento falhado",
        superseded: "substituído por outra leitura",
        unavailable: "pagamento não processado"
      },
      motives: {
        declined: "Não confirmado no telemóvel",
        newPayee: "Novo comerciante, não confirmado a tempo",
        unidentifiedPayee: "Comerciante não identificado, não confirmado a tempo",
        unconfirmed: "Não confirmado a tempo",
        insufficientBalance: "Saldo do cartão insuficiente",
        invalidInvoice: "Fatura inválida",
        expired: "Fatura expirada",
        noAmount: "Fatura sem montante",
        alreadyPaid: "Fatura já paga",
        outOfBounds: "Montante fora dos limites",
        aboveLimit: "Acima do limite por pagamento",
        dayLimit: "Limite de 24 horas atingido",
        hourLimit: "Demasiados pagamentos nesta hora",
        suspended: "Cartão em pausa",
        invalidTap: "Leitura do cartão inválida",
        failed: "A carteira do cartão não o enviou",
        superseded: "Substituído por outra leitura do cartão",
        unavailable: "Não foi possível processar o pagamento"
      },
      detail: {
        payment: "Pagamento",
        refused: "Pagamento recusado",
        failed: "Pagamento falhado",
        paid: "Pago",
        paidWith: "Pago · {{payee}}",
        merchant: "Comerciante",
        payee: {
          approved: "comerciante aprovado",
          new: "novo comerciante",
          unidentified: "comerciante não identificado",
          unchecked: "não controlado (modo automático)"
        },
        refusedPill: "Recusado · nada saiu",
        failedPill: "Falhou · nada saiu",
        uncertainPill: "Incerto · talvez tenha saído",
        sendingPill: "A enviar",
        refusedMotive: "Recusado",
        failedMotive: "A carteira do cartão não o enviou",
        date: "Data",
        value: "Valor",
        valueThen: "No momento da transação: {{fiat}}",
        valueNow: "Agora: {{fiat}}",
        valueNowReading: "Agora: a ler a cotação",
        valueNowUnknown: "Agora: cotação indisponível",
        note: "Nota",
        motive: "Motivo",
        fees: "Taxa",
        noFee: "Nenhuma",
        feeDeducted: "{{fee}}, deduzidos",
        way: "Tipo de pagamento",
        to: "Para",
        mainBalance: "O meu saldo principal",
        received: "Recebido",
        description: "Descrição",
        transaction: "Transação",
        copyTx: "Copiar o identificador da transação",
        txCopied: "Identificador da transação copiado",
        openTx: "Ver a transação em {{explorer}}",
        approve: "Aprovar este comerciante",
        approveNote:
          "Ser-lhe-á pedida a sua passkey. Os seus próximos pagamentos passarão sem confirmação, dentro dos limites do cartão.",
        approved: "Comerciante aprovado para este cartão",
        approvedNote:
          "Comerciante aprovado: os seus próximos pagamentos passarão sem confirmação, dentro dos limites do cartão.",
        approveFailed: "Não foi possível aprovar o comerciante. Tente novamente.",
        homonym:
          "Mesmo nome que um comerciante já aprovado, mas conta diferente: só pode ser aprovado ao confirmar um pagamento nele, depois de verificar no local."
      }
    },
    sheet: {
      close: "Fechar",
      nameInvalid: "Uma linha de {{max}} caracteres no máximo.",
      save: "Guardar",
      ceilingInvalid: "Um número inteiro de sats, de 1 a {{max}}.",
      hourInvalid: "Um número inteiro, de 1 a {{max}}.",
      relayHint:
        "O relé acorda o seu telemóvel quando uma caixa lê o cartão; não detém chaves nem fundos. O cartão será reprogramado: mantenha-o à mão.",
      relayField: "Endereço do relé",
      relayPlaceholder: "rele.example.com",
      program: "Programar o cartão",
      back: "Voltar",
      done: "Concluir",
      failedTitle: "A operação não foi concluída",
      changeFailed: "Não foi possível guardar a alteração. Tente novamente.",
      nfcSuccess: "Cartão pronto",
      nfcFailure: "Operação interrompida"
    },
    delete: {
      card: {
        drainBody:
          "Ainda contém <strong>{{amount}}</strong>. Esvazie-o para um endereço lightning, bitcoin ou Spark antes de o eliminar.",
        drainBodyArriving:
          "Ainda contém <strong>{{amount}}</strong>, e <strong>{{arriving}}</strong> estão a chegar a um endereço Bitcoin. Esvazie-o, e novamente quando estes <strong>{{arriving}}</strong> forem creditados.",
        drainBodyArrivingOnly:
          "<strong>{{arriving}}</strong> estão a chegar a um endereço Bitcoin deste cartão. Esvazie-o quando estes sats forem creditados, antes de o eliminar."
      },
      drainTitle: "Esvazie primeiro <accent>{{name}}</accent>",
      drainBody:
        "Ainda contém <strong>{{amount}}</strong>. Levante-os para o seu saldo principal antes de o eliminar.",
      drainBodyArriving:
        "Ainda contém <strong>{{amount}}</strong>, e <strong>{{arriving}}</strong> estão a chegar a um endereço Bitcoin. Levante o seu saldo para o seu saldo principal e depois estes <strong>{{arriving}}</strong>, uma vez adicionados.",
      drainBodyArrivingOnly:
        "<strong>{{arriving}}</strong> estão a chegar a um endereço Bitcoin deste cartão. Levante-os para o seu saldo principal, uma vez adicionados, antes de o eliminar.",
      drainConfirm: "Levantar",
      title: "Eliminar {{name}}",
      gone: "Apagado para sempre",
      goneSettings: "O seu nome e as suas definições, comerciantes aprovados incluídos",
      goneHistory: "O seu histórico",
      goneAddress: "O seu endereço Lightning",
      inHand: "Tenho o cartão comigo",
      inHandCaption: "Encostado ao telemóvel, volta a ficar virgem",
      confirm: "Eliminar o cartão",
      withoutTitle: "Eliminar {{name}} sem o cartão?",
      withoutBody:
        "Os seus dados são apagados e nunca mais poderá pagar. Se o encontrar, « Adicionar um cartão » torná-lo-á virgem.",
      withoutConfirm: "Eliminar",
      cardLabel: "O cartão",
      withCard: "Tenho-o comigo",
      withCardCaption: "Volta a ficar virgem",
      withoutCard: "Não o tenho",
      withoutCardCaption: "Nunca mais pagará",
      withoutNote:
        "Se o encontrar, « Adicionar um cartão », na app do seu telemóvel, torná-lo-á virgem.",
      webUnder: "« {{inHand}} » fica marcado.",
      webHoldCaption: "Quando a app o pedir.",
      understood: "Percebi",
      deleting: "A eliminar…",
      failedTitle: "A eliminação não foi concluída",
      failedBody: "Tente novamente; se o problema persistir, contacte o suporte.",
      done: "{{name}} foi eliminado",
      pendingCaption:
        "Os relés da sua conta ainda não registaram a sua eliminação: será concluída na próxima sincronização",
      steps: {
        screen: "Eliminar o cartão",
        label: "Passos da eliminação",
        prepTitle: "A preparar…",
        prepSubtitle: "A verificar o saldo do cartão",
        holdAndroid: "Segure {{name}} contra a parte de trás do telemóvel",
        holdIos: "Segure {{name}} por cima do telemóvel",
        holdSubtitle: "Volta a ficar virgem, depois os seus dados são apagados",
        keepTitle: "Mantenha o cartão no lugar",
        keepSubtitle: "Volta a ficar virgem",
        almostTitle: "Quase pronto",
        almostSubtitle: "Pode afastar o cartão",
        doneSubtitle: "O cartão está virgem: ofereça-o, ou adicione-o como novo",
        notThisTitle: "Não é {{name}}",
        notThisSubtitle: "Nada foi alterado no cartão apresentado",
        notThisCaption:
          "Ou foi reprogramado noutro sítio. Nada foi alterado: aproxime o cartão certo.",
        failedNothing: "Nada foi alterado no cartão",
        failedGoesOn: "Já não paga: « Tentar novamente » conclui a eliminação",
        emptied: "Saldo levantado",
        emptiedTodo: "Verificação do saldo",
        emptiedRunning: "A verificar o saldo",
        emptiedFailed: "Saldo não levantado",
        emptiedCaption: "O cartão está vazio",
        unchecked: "Saldo não verificado",
        uncheckedCaption:
          "A sua eliminação já estava registada: os sats recebidos desde então continuam visíveis em « Cartões »",
        held: "Cartão aproximado",
        heldTodo: "Aproximação do cartão",
        heldRunning: "À espera do cartão",
        heldFailed: "Cartão não reconhecido",
        heldAndroid: "Contra a parte de trás do telemóvel, até à vibração",
        heldIos: "Por cima do telemóvel, até à confirmação",
        blank: "Cartão virgem",
        blankTodo: "Reinicialização do cartão",
        blankRunning: "A reinicializar o cartão",
        blankFailed: "Cartão não reinicializado",
        blankCaption: "Não mexa o cartão",
        erased: "Dados apagados",
        erasedTodo: "Apagamento dos dados",
        erasedRunning: "A apagar os dados",
        erasedFailed: "Dados não apagados",
        erasedCaption: "O seu nome, as suas definições, o seu histórico, o seu endereço Lightning",
        erasedLater: "Apagamento por concluir",
        erasedLaterCaption:
          "Nem todos os relés da sua conta responderam: o apagamento continuará na próxima sincronização",
        lost: "Cartão afastado demasiado cedo",
        lostAndroid:
          "Aproxime-o de novo e mantenha-o no lugar até à vibração: a eliminação retomará onde parou.",
        lostIos:
          "Aproxime-o de novo e mantenha-o no lugar até à confirmação: a eliminação retomará onde parou.",
        cancelled: "Leitura do cartão cancelada",
        failed: "A eliminação falhou: tente novamente",
        noCard: "Não tenho o cartão",
        finish: "Concluir",
        cancel: "Cancelar",
        stateTodo: ": por fazer",
        stateRunning: ": em curso",
        stateDone: ": feito",
        stateFailed: ": falhou",
        stateWarning: ": a verificar"
      }
    },
    drain: {
      intro:
        "Todo o saldo do cartão vai para um endereço lightning, bitcoin ou Spark: escreva-o, cole-o ou digitalize-o. As comissões são tiradas deste saldo.",
      introNoScan:
        "Todo o saldo do cartão vai para um endereço lightning, bitcoin ou Spark: escreva-o ou cole-o. As comissões são tiradas deste saldo.",
      placeholder: "Endereço lightning, bitcoin ou Spark",
      invoice: "Use um endereço lightning, bitcoin ou Spark",
      total: "Saldo do cartão",
      received: "Recebido pelo destinatário",
      feesAbove: "As comissões ultrapassam o saldo do cartão a esta velocidade",
      empty: "Este cartão não contém nada para levantar.",
      quoteFailed:
        "Não foi possível preparar o esvaziamento. Verifique o destinatário e a sua ligação à internet e tente novamente.",
      done: "{{amount}} levantados: o cartão está vazio.",
      pending: "Levantamento de {{amount}} a caminho: chegará assim que for concluído.",
      failed: "O levantamento não foi concluído. Verifique o saldo do cartão e tente novamente."
    },
    modifiedPhone: {
      title: "Este telemóvel é menos seguro",
      body: "Parece ter sido modificado (por exemplo, com « root »). Para que este cartão pague sem a sua confirmação, a app guarda neste telemóvel o necessário para o fazer pagar: uma app maliciosa poderia usá-lo para gastar o seu saldo. Mantenha poucos sats neste cartão, ou escolha « Confirmar sempre »."
    },
    erasedFunds: {
      card: {
        body: "{{amount}} chegaram à sua carteira depois de ser eliminado. Esvazie-a para um endereço lightning, bitcoin ou Spark.",
        bodyArriving:
          "{{amount}} chegaram à sua carteira depois de ser eliminado, e {{arriving}} ainda estão a chegar ao seu endereço Bitcoin. Esvazie-a para um endereço lightning, bitcoin ou Spark.",
        arrivingOnly:
          "{{arriving}} estão a chegar ao endereço Bitcoin de um cartão eliminado. Poderá levantá-los quando forem creditados.",
        stoppedBody:
          "Volta a « Cartões », com o seu saldo, quando o adicionar novamente. {{amount}} ficam na sua carteira: sem o cartão, esvazie-a para um endereço lightning, bitcoin ou Spark.",
        stoppedBodyArriving:
          "Volta a « Cartões », com o seu saldo, quando o adicionar novamente. {{amount}} ficam na sua carteira, e {{arriving}} ainda estão a chegar ao seu endereço Bitcoin: sem o cartão, esvazie-a para um endereço lightning, bitcoin ou Spark."
      },
      title: "Chegaram sats a um cartão eliminado",
      titleArriving: "Estão a chegar sats a um cartão eliminado",
      body: "{{amount}} chegaram à sua carteira depois de ser eliminado. Levante-os para o seu saldo principal.",
      bodyArriving:
        "{{amount}} chegaram à sua carteira depois de ser eliminado, e {{arriving}} ainda estão a chegar ao seu endereço Bitcoin. Levante-os para o seu saldo principal.",
      arrivingOnly:
        "{{arriving}} estão a chegar ao endereço Bitcoin de um cartão eliminado. Poderá levantá-los para o seu saldo principal depois de adicionados.",
      returned: "{{amount}} levantados para o seu saldo principal",
      returnPending:
        "Levantamento de {{amount}} enviado: será adicionado ao seu saldo principal assim que for concluído",
      failed: "O levantamento não foi concluído. Verifique a ligação à internet e tente novamente.",
      stoppedTitle: "{{card}}: reprogramação interrompida",
      stoppedBody:
        "Volta a « Cartões », com o seu saldo, quando o adicionar de novo. {{amount}} continuam na sua carteira: sem o cartão, levante-os para o seu saldo principal.",
      stoppedBodyArriving:
        "Volta a « Cartões », com o seu saldo, quando o adicionar de novo. {{amount}} continuam na sua carteira, e {{arriving}} ainda estão a chegar ao seu endereço Bitcoin: sem o cartão, levante-os para o seu saldo principal."
    },
    wallet: {
      balance: "Saldo",
      pendingDeposit: "{{amount}} recebidos num endereço Bitcoin, ainda não adicionados ao saldo",
      failed:
        "Não foi possível ler a carteira deste cartão. Verifique a ligação à internet e tente novamente.",
      recharge: "Carregar",
      return: "Levantar para o meu saldo principal",
      rechargeCard: "Carregar <accent>{{name}}</accent>",
      amountField: "Montante",
      rechargeAmount: "Carregar {{amount}}",
      returnAmount: "Levantar {{amount}}",
      copyInvoice: "Copiar a fatura",
      copyAddress: "Copiar o endereço",
      onchainOpenHere:
        "O crédito é feito quando o cartão está aberto em « Cartões », aqui ou no telemóvel.",
      fromMain: "Do meu saldo principal",
      invoice: "Fatura Lightning",
      onchain: "Endereço Bitcoin",
      continue: "Continuar",
      invoiceCreate: "Criar a fatura",
      invoiceDescription: "Carregamento do cartão",
      noFee: "Nenhuma",
      working: "Transferência em curso…",
      recharged: "Cartão carregado com {{amount}}.",
      returned: "{{amount}} levantados para o seu saldo principal.",
      rechargePending:
        "Carregamento de {{amount}} enviado: será adicionado ao saldo do cartão assim que for concluído.",
      returnPending:
        "Levantamento de {{amount}} enviado: será adicionado ao seu saldo principal assim que for concluído.",
      nothingToReturn: "Este cartão não contém nada para levantar.",
      prepareFailed:
        "Não foi possível preparar a transferência: nada saiu. Verifique a ligação à internet e tente novamente.",
      transferFailed:
        "A transferência não foi concluída. Verifique a ligação à internet e tente novamente: só sairá uma vez.",
      transferRefused: "A transferência falhou. Verifique os saldos antes de recomeçar.",
      receiveFailed:
        "Não foi possível criar o endereço ou a fatura. Verifique a ligação à internet e tente novamente.",
      invoiceHint: "Pagável uma única vez, a partir de qualquer carteira Lightning, até {{date}}.",
      readingMain: "A ler o seu saldo principal…",
      otherWallet: "Outra carteira",
      confirmRecharge: "Confirmar o carregamento",
      mainAvailable: "{{amount}} disponíveis",
      change: "Alterar",
      mainShort: "O seu saldo principal não cobre este montante",
      mainUnread:
        "Não foi possível ler o seu saldo principal. Tente novamente dentro de instantes.",
      unit: "Unidade",
      addressNote:
        "O endereço Lightning permanente do cartão: partilhe-o, o montante enviado é adicionado ao saldo do cartão.",
      orAnyWallet: "ou a partir de qualquer carteira",
      share: "Partilhar",
      invoiceWaiting: "A aguardar o pagamento…",
      invoicePaid: "Fatura paga",
      invoiceAdded: "adicionados ao saldo do cartão",
      finish: "Terminar",
      invoiceExpired: "Fatura expirada",
      invoiceExpiredNote: "Não foi paga antes de {{date}}: já ninguém a pode pagar.",
      newInvoice: "Nova fatura",
      onchainConfirmations:
        "O que enviar é adicionado ao saldo do cartão após 1 a 3 confirmações, até cerca de trinta minutos.",
      onchainFee: "Taxa: {{fee}} no máximo, deduzida. Se a rede pedir mais, o crédito aguarda.",
      onchainOpen: "O crédito é feito quando abre o cartão em « Cartões ».",
      toMain: "Para o meu saldo principal",
      fromCard: "Do cartão {{name}} · {{amount}}",
      cardHoldsOnly: "O cartão só contém {{amount}}",
      allOf: "Todo o saldo do cartão · {{fiat}}",
      wholeBalance: "Todo o saldo do cartão",
      partOf: "{{fiat}} · ficarão {{left}} no cartão",
      partOfSats: "Ficarão {{left}} no cartão",
      emptyCard: "Esvaziar o cartão",
      rowFrom: "De",
      rowTo: "Para",
      rowFee: "Taxa",
      rowAfter: "Saldo do cartão depois",
      mainBalance: "O meu saldo principal",
      confirmPasskey: "Confirmar com a minha passkey",
      copy: "Copiar",
      copied: "Copiado",
      copyFailed: "Não foi possível copiar"
    },
    payees: {
      approved: "Aprovados para este cartão",
      approvedCount: "$t(cards.payees.approved) · {{count}}",
      changeMode: "Mudar de modo",
      modeBox: {
        automatic: {
          title: "Modo: automático",
          caption: "Cada tap válido é pago, dentro dos limites"
        },
        approved: {
          title: "Modo: comerciantes aprovados",
          caption: "Nos outros, o seu telefone pede-lhe que confirme"
        },
        confirm: {
          title: "Modo: confirmar sempre",
          caption: "Cada pagamento aguarda a sua confirmação"
        }
      },
      changeLabel: "Mudar o modo de confirmação de {{name}}",
      approveNote:
        "Para adicionar um, assinale «$t(card.payment.approve)» quando confirmar um pagamento nele.",
      removeLabel: "Retirar {{name}} dos comerciantes aprovados",
      payments_one: "{{count}} pagamento",
      payments_other: "{{count}} pagamentos",
      paymentsRecent_one: "{{count}} pagamento em 90 dias",
      paymentsRecent_other: "{{count}} pagamentos em 90 dias",
      itsName: "O seu nome",
      itsNode: "O seu nó",
      nodeNote:
        "Aprovado pelo seu nó Lightning: se este nó for partilhado (Spark, Wallet of Satoshi, Strike…), todos os seus outros utilizadores também são pagos sem confirmação, dentro dos limites do cartão.",
      approvedAs: "Aprovado com o nome",
      approvedOnLabel: "Aprovado em",
      paymentsLabel: "Pagamentos",
      paymentsValue_one: "{{count}}, por {{amount}}",
      paymentsValue_other: "{{count}}, por {{amount}}",
      paymentsValueRecent_one: "{{count}} em 90 dias, por {{amount}}",
      paymentsValueRecent_other: "{{count}} em 90 dias, por {{amount}}",
      modesLabel: "Modo de confirmação dos pagamentos",
      recommended: "Recomendado",
      confirmPasskey: "Confirmar com a minha passkey",
      modes: {
        automatic: {
          title: "Automático",
          body: "Cada toque válido é pago, dentro dos limites do cartão. O comerciante é mostrado, sem controlo."
        },
        approved: {
          title: "Comerciantes aprovados",
          body: "Pago sem confirmação num comerciante identificado que aprovou; nos outros, o seu telefone pede-lhe que confirme."
        },
        confirm: {
          title: "Confirmar sempre",
          body: "Cada pagamento aguarda a sua confirmação."
        }
      },
      approvedEmpty: "Nenhum comerciante aprovado",
      approvedEmptyLead:
        "Quando confirmar um pagamento com este cartão, assinale «$t(card.payment.approve)»: os seus próximos pagamentos sairão sem confirmação.",
      approvedOn: "aprovado em {{date}}",
      nameField: "O seu nome para este comerciante",
      nameHint: "Só para si. Se o deixar vazio, volta o nome declarado pelo comerciante.",
      remove: "Retirar dos comerciantes aprovados",
      removeHint:
        "Ser-lhe-á pedida a sua passkey. Os próximos pagamentos voltarão a pedir a sua confirmação.",
      saveFailed: "Não foi possível guardar a alteração. Tente novamente.",
      pending: {
        phone:
          "Guardado neste telemóvel, ainda não nos relés da sua conta: os seus outros dispositivos ainda não o veem.",
        web: "Ainda não guardado nos relés da sua conta: esta alteração perde-se se sair da página."
      },
      failed: {
        newerApp:
          "Uma versão mais recente da app guardou os seus comerciantes aprovados. Atualize a app: até lá, os seus cartões não pagam.",
        unreachable:
          "Os relés da sua conta não responderam: os seus comerciantes aprovados não podem ser mostrados.",
        failed: "Não foi possível ler os seus comerciantes aprovados."
      }
    },
    probe: {
      group: "Testes (staging)",
      row: "Teste da extensão iOS",
      title: "Teste da extensão iOS",
      noPointOfSale:
        "Este teste paga o endereço Lightning da conta: uma conta só de cartões não tem nenhum.",
      unavailable: "Este teste só existe na app de staging, no iPhone.",
      intro:
        "Mede se um cartão consegue pagar a partir de uma notificação, com a app fechada. A extensão usa a sua própria carteira de teste, nunca a da sua conta: guarda apenas alguns sats.",
      how: "Depois de iniciar um teste, bloqueie o telefone: o resultado aparece na notificação e depois aqui. As notificações têm de estar permitidas.",
      launchGroup: "Iniciar um teste",
      profile: "Configuração do SDK",
      profiles: {
        light: "Leve",
        standard: "Padrão"
      },
      modes: {
        sync: "Sincronizar",
        receive: "Receber 100 sats",
        pay: "Pagar 1 sat ao seu endereço",
        engine: "Motor JS (sem pagamento)",
        runtime: "Runtime JS (rede, dados)",
        enginePay: "Motor JS: pagar 1 sat"
      },
      balance: "Saldo da carteira de teste, lido no último teste: {{sats}} sats",
      sent: "Notificação de teste enviada",
      failed: {
        unavailable: "Este telefone não tem a extensão de notificações",
        noApiKey: "Esta versão da app não tem chave API da Breez",
        storage: "Não foi possível preparar a carteira de teste",
        notifications: "Permita as notificações para iniciar um teste",
        pushToken: "Sem token de notificação: a rede, ou faltam as credenciais APNs na build",
        invoice: "O seu endereço Lightning não deu nenhuma fatura",
        push: "O serviço de notificações da Expo recusou o envio",
        unexpected: "Não foi possível iniciar o teste"
      },
      notification: {
        title: "Teste da extensão",
        body: "Se este texto continuar visível, a extensão não processou a notificação."
      },
      cardText: {
        group: "Notificação de um pagamento com cartão",
        intro:
          "Envia a este telefone a notificação de um pagamento com cartão, como o relay: o título deve aparecer no idioma do iPhone. «sattle.me»: a extensão não a processou.",
        launch: "Enviar uma notificação de cartão",
        sent: "Notificação de cartão enviada"
      },
      resultsGroup: "Resultados",
      empty: "Ainda nenhum teste.",
      outcome: {
        waiting: "Em espera",
        none: "Sem resultado",
        running: "Em curso ({{step}})",
        stopped: "Interrompido ({{step}})",
        ok: "Concluído",
        failed: "Falhou ({{step}})",
        expired: "Tempo esgotado ({{step}})"
      },
      peak: "pico {{mb}} MB",
      limit: "limite ≈ {{mb}} MB",
      seconds: "{{s}} s",
      copyInvoice: "Copiar a fatura",
      invoiceCopied: "Fatura copiada: pague-a em « Enviar »",
      copy: "Copiar os resultados",
      copied: "Resultados copiados",
      copyFailed: "A cópia falhou",
      clear: "Apagar os resultados"
    },
    wakes: {
      row: "Registo de despertares (Android)",
      title: "Registo de despertares",
      unavailable: "Este registo só existe na app de staging, no Android.",
      intro:
        "Cada vez que o relay de um cartão acordou este telefone, com a app fechada ou em segundo plano: quando chegou e até onde foi o pagamento. Nem montante, nem comerciante, nem fatura.",
      how: "Para testar: deslize a app para fora das apps recentes (sem forçar a paragem), bloqueie o telefone, aproxime o cartão de uma caixa e depois volte aqui e copie o registo.",
      group: "Despertares",
      empty: "Ainda nenhum despertar.",
      outcome: {
        running: "Em curso ({{step}})",
        stopped: "Interrompido ({{step}})",
        notTaken: "Ignorado",
        paid: "Pago",
        pending: "Enviado, não confirmado",
        declined: "Recusado pelo titular",
        failed: "Falhou ({{reason}})",
        letGo: "Abandonado ({{step}})",
        ended: "Terminado ({{step}})"
      },
      received: "tarefa iniciada {{s}} s após a receção",
      js: "JS iniciado {{s}} s antes",
      silence: "silêncio mais longo {{s}} s",
      copy: "Copiar o registo",
      copied: "Registo copiado",
      copyFailed: "Não foi possível copiar",
      clear: "Apagar o registo",
      newer: "Este registo foi escrito por uma versão mais recente da app.",
      failed: "Não foi possível ler o registo."
    },
    socket: {
      group: "Ligação permanente",
      row: "Ligação permanente",
      caption: {
        on: "Ativa",
        off: "Desativada"
      },
      intro:
        "O telefone mantém a sua própria ligação ao relay dos seus cartões: um pagamento com cartão acorda-o com a app fechada. Está ativa por predefinição e gasta alguma bateria. Desativada, os seus cartões só pagam com a app aberta.",
      noRelay: "Nenhum relay dos seus cartões oferece ainda esta ligação.",
      state: {
        connecting: "a ligar…",
        open: "ligada",
        waiting: "em espera",
        stopped: "parada"
      },
      since: "desde {{time}}",
      lastMessage: "última mensagem há {{s}} s",
      opened_one: "{{count}} ligação",
      opened_other: "{{count}} ligações",
      failures_one: "{{count}} quebra",
      failures_other: "{{count}} quebras",
      lastFailure: "última quebra: {{code}}",
      wakes_one: "{{count}} despertar",
      wakes_other: "{{count}} despertares",
      battery: {
        applied: "A otimização da bateria aplica-se à app: o Android pode cortar a ligação.",
        exempt: "A otimização da bateria está desativada para a app.",
        settings: "Definições de bateria"
      },
      notice: {
        shown:
          "O Android mostra uma notificação enquanto a ligação está ativa. Para a ocultar, desative «Ligação dos cartões» nas definições que se abrem: a ligação continua.",
        hidden: "Notificação oculta: a ligação continua.",
        hide: "Ocultar a notificação",
        settings: "Definições da notificação"
      },
      service: {
        running: "Serviço ativo (iniciado: {{reason}})",
        stopped: "Serviço parado",
        error: "Não foi possível iniciar o serviço ({{code}})",
        task: "Despertar não entregue à app ({{code}})"
      },
      failed: "Não foi possível alterar a ligação permanente",
      notification: {
        channel: "Ligação dos cartões",
        title: "Pagamentos com cartão ativados",
        text: "Ligado ao relay dos seus cartões para pagar com a app fechada",
        stop: "Parar"
      }
    }
  },
  pos: {
    title: "Ponto de venda",
    subtitle: "Receba bitcoin na sua conta, rapidamente.",
    addNote: "Adicionar uma nota",
    editNote: "Editar a nota «{{note}}»",
    charge: "Cobrar",
    keyboardHint: "As teclas do teclado também funcionam.",
    deleteKey: "Apagar",
    satsLabel: "{{sats}} sats",
    rateLoading: "A carregar o preço do bitcoin…",
    rateUnavailable: "Preço do bitcoin indisponível. Verifique a sua ligação à internet.",
    share: "Partilhar o pedido de pagamento",
    shareLink: {
      button: "Partilhar",
      hint: "Envia o pedido de pagamento ao cliente.",
      copiedTitle: "Link copiado",
      copied: "Cole-o numa mensagem para o cliente.",
      publishFailedTitle: "Link não publicado",
      shareFailedTitle: "Link não partilhado",
      publishFailed:
        "Não foi possível pôr o link online: o cliente não o encontraria. Verifique a sua ligação à internet e partilhe-o novamente.",
      shareFailed: "Não foi possível partilhar o link. Tente novamente."
    },
    backToPos: "Voltar ao ponto de venda",
    expiresIn: "Expira em",
    waiting: "A aguardar o pagamento",
    creating: "A criar o pedido…",
    checking: "A verificar o pagamento em Bitcoin…",
    checkingPayment: "A verificar o pagamento…",
    lateCheck: {
      title: "Pedido expirado",
      body: "Um pagamento enviado no último segundo ainda pode chegar.",
      endsIn: "A verificação termina em"
    },
    // A payment whose check lasts.
    settling: {
      title: "Pagamento recebido, em verificação",
      body: "A verificação está a demorar mais do que o previsto. Continua sozinha."
    },
    updatingRate: "A atualizar para a taxa desta hora…",
    networks: {
      scan: "Leia com a sua carteira",
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      or: "ou"
    },
    onchainUnavailable: {
      explorer:
        "Bitcoin onchain indisponível para esta venda: {{explorer}} não conseguiu verificar o endereço Bitcoin a tempo. O cliente pode pagar via Lightning.",
      pool: "Bitcoin onchain indisponível para esta venda: este dispositivo não tem nenhum endereço Bitcoin pronto. Prepara novos a cada desbloqueio com a sua passkey, com ligação à internet. O cliente pode pagar via Lightning.",
      lot: "Bitcoin onchain indisponível para esta venda: este dispositivo não tem nenhum endereço Bitcoin disponível. O proprietário dá-lhe novos ao desbloquear a própria app com a passkey, com ligação à internet. O cliente pode pagar via Lightning."
    },
    note: {
      label: "Nota do pagamento",
      placeholder: "Mesa 12"
    },
    boltcard: {
      approach: "Ou aproxime o cartão BoltCard",
      tap: "Ou toque aqui e depois aproxime o cartão BoltCard",
      alert: "Aproxime o cartão BoltCard da parte de cima do telemóvel.",
      paying: "Pagamento com cartão em curso…",
      sent: "Pagamento com cartão enviado, a aguardar confirmação…",
      refusal: {
        refused: "Cartão recusado",
        interrupted: "Pagamento com cartão interrompido",
        unread: "Cartão não lido",
        noReason:
          "O serviço do cartão não indicou nenhum motivo. Apresente o cartão novamente ou peça para ler o código.",
        outOfRange: "O montante está fora dos limites do cartão. Peça para ler o código.",
        noAnswer:
          "O serviço do cartão não respondeu. Apresente o cartão novamente ou peça para ler o código.",
        unreadable:
          "Este não é um cartão de pagamento que possa ser lido aqui. Apresente-o novamente ou peça para ler o código.",
        showCode: "Mostrar o código"
      }
    },
    paid: {
      pill: "Recebido",
      line: "Lightning · {{time}}",
      onchainLine: "Bitcoin · {{time}}",
      mixedLine: "Bitcoin + Lightning · {{time}}"
    },
    accepted: {
      notice: "O proprietário aceitou o montante recebido: a venda está paga."
    },
    unconfirmed: {
      pill: "Em confirmação",
      notice:
        "O cliente pagou. A rede ainda tem de confirmar a transação, conte cerca de trinta minutos."
    },
    underpaid: {
      rest: "Resto",
      received: "Recebido",
      restToPay: "Falta pagar",
      // The accessible name of a transaction's link on the chain card (UnderpaidChain).
      txLink: "Ver a transação {{txid}} em {{explorer}}"
    },
    underpaidEnded: {
      pill: "Pagamento incompleto",
      missing: "Em falta",
      received: "Pagamentos recebidos",
      confirmed: "Confirmada",
      confirming: "Em confirmação · {{done}}/{{required}}",
      notice: "O prazo para pagar terminou: faltam {{missing}} sats."
    },
    expired: {
      pill: "Expirado",
      notice: "O cliente não pagou no prazo. Nada foi cobrado.",
      recreate: "Criar o pedido novamente"
    },
    disputed: {
      pill: "Pagamento a verificar",
      notice:
        "Foi recebido um pagamento, mas outra venda também o reclama. Não peça um novo pagamento: verifique-o em «$t(navigation.destinations.wallet)».",
      noticeMember:
        "Foi recebido um pagamento, mas outra venda também o reclama. Não peça um novo pagamento: o titular da conta verifica-o em «$t(navigation.destinations.wallet)»."
    },
    failed: {
      network:
        "Não foi possível criar o pedido de pagamento. Verifique a sua ligação à internet e tente novamente.",
      invalid: "O serviço de pagamento respondeu de forma inesperada. Tente novamente.",
      limits: "Este montante não pode ser cobrado: apenas entre {{min}} e {{max}} sats.",
      onchainOnly: {
        none: "Acima de {{max}} sats, este montante só pode ser pago onchain, e os pagamentos onchain estão desativados.",
        explorer:
          "Acima de {{max}} sats, este montante só pode ser pago onchain, e {{explorer}} não conseguiu verificar o endereço Bitcoin a tempo. Tente novamente.",
        pool: "Acima de {{max}} sats, este montante só pode ser pago onchain, e este dispositivo não tem nenhum endereço Bitcoin pronto. Prepara novos a cada desbloqueio com a sua passkey, com ligação à internet.",
        lot: "Acima de {{max}} sats, este montante só pode ser pago onchain, e este dispositivo não tem nenhum endereço Bitcoin disponível. O proprietário dá-lhe novos ao desbloquear a própria app com a passkey, com ligação à internet.",
        error:
          "Acima de {{max}} sats, este montante só pode ser pago onchain, e não foi possível ler o endereço Bitcoin deste dispositivo. Tente novamente."
      },
      retry: "Tentar novamente"
    },
    // The keypad or the articles: the header's segmented control.
    mode: {
      label: "Modo de introdução",
      amount: "Montante",
      articles: "Artigos",
      scan: "Ler"
    },
    articles: {
      hint: "Toque num artigo para o adicionar",
      // Without articles, on the owner's device only (ArticlesPad.tsx).
      empty: {
        reading: "A ler os seus artigos…",
        unreadableTitle: "Artigos ainda não lidos",
        unreadableBody:
          "Não foi possível ler os seus artigos. Verifique a ligação à internet: serão lidos de novo dentro de alguns minutos.",
        noneTitle: "Ainda sem artigos",
        noneBody:
          "Adicione os seus artigos em «$t(navigation.destinations.articles)»: aparecerão aqui.",
        noneBodyScan:
          "Leia um produto com «$t(pos.mode.scan)» para o criar, ou adicione os seus artigos em «$t(navigation.destinations.articles)»."
      },
      tile: "{{name}}, {{price}}",
      add: "Adiciona um ao cesto",
      inBasket_one: "{{count}} no cesto",
      inBasket_other: "{{count}} no cesto"
    },
    basket: {
      title: "Cesto",
      open: "Ver o cesto",
      charge_one: "Cobrar · {{count}} artigo",
      charge_other: "Cobrar · {{count}} artigos",
      total: "Total",
      empty: "O cesto está vazio.",
      tooLarge: "O total ultrapassa o montante máximo de uma cobrança.",
      scanMore: "Ler mais artigos",
      less: "Diminuir a quantidade de {{name}}",
      more: "Aumentar a quantidade de {{name}}",
      quantity_one: "Quantidade: {{count}}",
      quantity_other: "Quantidade: {{count}}"
    },
    // The scan of the point of sale: the camera, the article read last, the basket.
    scan: {
      aim: "Aponte para o código de barras de um artigo",
      lead: "Cada artigo lido é adicionado ao total.",
      converted: "Preço: {{price}}, convertido",
      unknown: {
        title: "Código de barras desconhecido",
        body: "Nenhum dos seus artigos tem este código. Nada foi adicionado."
      },
      // A code read before the catalogue was (ScanPad.tsx): nothing can be told of it.
      notRead: {
        title: "Artigos ainda não lidos",
        body: "Não foi possível procurar este código. Nada foi adicionado: leia-o de novo dentro de instantes."
      }
    }
  },
  paymentLink: {
    // The page's switch of theme, in its header: what it does.
    themeToDark: "Mudar para o tema escuro",
    themeToLight: "Mudar para o tema claro",
    payableUntil: "Pagável até {{date}}",
    loading: "A carregar o pedido de pagamento…",
    updatingRate: "A atualizar para a taxa desta hora…",
    openWallet: "Abrir a minha carteira",
    copyInvoice: "Copiar a fatura",
    copied: "Fatura copiada",
    copyFailed: "Não foi possível copiar a fatura. Abra-a na sua carteira ou leia o código.",
    retry: "Tentar novamente",
    notFound: {
      title: "Pedido não encontrado",
      notice: "Este pedido de pagamento não existe ou expirou. Peça um novo link ao comerciante.",
      invalid:
        "Este link está incompleto. Verifique se foi copiado por inteiro ou peça um novo ao comerciante."
    },
    unreachable: {
      title: "Sem ligação",
      notice:
        "Não foi possível carregar o pedido de pagamento. Verifique a sua ligação à internet e tente novamente."
    },
    failed: {
      title: "Pedido indisponível",
      notice:
        "O serviço de pagamento do comerciante não conseguiu criar a fatura. Tente novamente dentro de instantes ou peça um novo link ao comerciante.",
      onchainOnly:
        "Este montante só pode ser pago onchain, e este pedido não propõe nenhum endereço Bitcoin. Peça a {{business}} outro meio de pagamento."
    },
    copyAddress: "Copiar o endereço",
    addressCopied: "Endereço copiado",
    addressCopyFailed:
      "Não foi possível copiar o endereço. Abra-o na sua carteira ou leia o código.",
    amountCopied: "Montante copiado",
    amountCopyFailed:
      "Não foi possível copiar o montante. Abra o pedido na sua carteira ou leia o código.",
    receipt: {
      invoice: "Fatura Lightning",
      address: "Endereço Bitcoin",
      amount: "Montante",
      copyAmount: "Copiar o montante",
      invoiceCopied: "Copiada",
      addressCopied: "Copiado",
      amountCopied: "Copiado",
      unit: "Unidade: {{unit}}, mudar para {{next}}"
    },
    unconfirmed: {
      notice:
        "O seu pagamento foi enviado. A rede ainda tem de confirmar a transação, conte cerca de trinta minutos. Pode fechar esta página."
    },
    underpaid: {
      notice:
        "O seu pagamento ({{received}} sats) não cobre o valor total. Pague o resto via Lightning ou Bitcoin.",
      noticeLightning:
        "O seu pagamento ({{received}} sats) não cobre o valor total. Pague o resto via Lightning."
    },
    underpaidEnded: {
      notice:
        "O prazo para pagar terminou: o seu pagamento ({{received}} sats) não cobre o valor total, faltam {{missing}} sats. Contacte {{business}} para a diferença."
    },
    details: {
      title: "Detalhes do pagamento",
      business: "Beneficiário",
      method: "Método",
      methods: {
        lightning: "Lightning",
        onchain: "Bitcoin",
        mixed: "Bitcoin + Lightning"
      },
      createdAt: "Criada em",
      transaction: "Transação",
      transactionNumber: "Transação {{number}}",
      confirmations_one: "{{count}} confirmação de {{required}}",
      confirmations_other: "{{count}} confirmações de {{required}}",
      confirmed: "Confirmada"
    },
    paid: {
      pill: "Pago",
      notice: "{{business}} recebeu o seu pagamento.",
      continue: "Continuar para {{host}}"
    },
    accepted: {
      notice: "{{business}} aceitou o montante recebido: o seu pagamento está regularizado."
    },
    expired: {
      pill: "Expirado",
      notice:
        "O prazo para pagar terminou e não foi recebido nenhum pagamento. Peça um novo link a {{business}}."
    },
    canceled: {
      pill: "Anulada",
      notice:
        "{{business}} anulou este pedido de pagamento: não o pague. Peça uma nova ligação a {{business}}."
    },
    disputed: {
      pill: "A verificar",
      notice:
        "O seu pagamento foi recebido. {{business}} ainda tem de o verificar: não pague uma segunda vez e contacte {{business}} se necessário."
    },
    checkout: {
      newer: {
        title: "Página a atualizar",
        notice:
          "Este link de pagamento tem um formato mais recente do que esta página. Recarregue a página, ou atualize a app, e abra o link novamente."
      },
      continue: "Continuar",
      redirectTo: "Redirecionamento para {{target}}",
      unconfirmed: {
        notice:
          "O seu pagamento foi enviado. A rede ainda tem de confirmar a transação, conte cerca de trinta minutos."
      },
      underpaid: {
        notice:
          "O seu pagamento ({{received}} sats) não cobre o valor total. Pague o resto via Bitcoin, para o mesmo endereço."
      },
      expired: {
        notice:
          "O prazo de pagamento terminou e não foi recebido nenhum pagamento. Volte à loja de {{business}} para pedir um novo.",
        late: "O prazo de pagamento terminou: um pagamento chegou depois do fim e não conta para esta encomenda. Contacte {{business}}."
      }
    }
  },
  appLock: {
    title: "App bloqueada",
    body: "Use a biometria deste dispositivo para a abrir.",
    unlock: "Desbloquear",
    prompt: "Desbloquear sattle.me",
    cancel: "Cancelar"
  },
  navigation: {
    label: "Navegação",
    destinations: {
      pos: "Cobrar",
      wallet: "Carteira",
      cards: "Cartões",
      articles: "Artigos",
      employees: "Funcionários",
      integrations: "Integrações",
      settings: "Definições"
    },
    memberWallet: "A minha atividade",
    groups: {
      sales: "Vendas",
      manage: "Gerir",
      account: "Conta"
    },
    more: "Mais",
    moreWith: "Mais, ecrã atual: {{name}}",
    moreWithWait: "{{more}} ({{name}})",
    close: "Fechar",
    customize: "Personalizar",
    customizeTitle: "Personalizar a barra",
    done: "Concluir",
    customizeHint: "Toque num destino para substituir <accent>{{name}}</accent>.",
    slotLabel: "{{name}}, posição {{index}}",
    swapLabel: "Colocar {{name}} na barra",
    currentLabel: "{{name}}, ecrã atual",
    pendingLabel: "{{name}}, fatura em curso",
    confirmingLabel: "{{name}}, pagamento em confirmação",
    lock: {
      tillMode: "Passar ao modo caixa",
      lockApp: "Bloquear a app",
      unlock: "Desbloquear com a sua passkey",
      lockedLabel: "{{name}}, bloqueado: desbloquear com a sua passkey",
      unlocking: "A desbloquear…",
      preparing: "A preparar o desbloqueio…",
      failedTitle: "Não foi possível desbloquear",
      otherAccount: "Esta passkey abre outra conta que não a deste dispositivo.",
      autoLockTitle: "Bloqueio em {{seconds}} s",
      autoLockBodyCard: "Sem atividade, a app bloqueia-se.",
      autoLockBody: "Sem atividade, a app volta ao modo caixa."
    },
    loadFailure: {
      title: "Ecrã não carregado",
      body: "Verifique a sua ligação à internet e recarregue a página. Ao recarregar, obtém também a versão mais recente da app.",
      reload: "Recarregar a página"
    },
    update: {
      title: "Nova versão disponível",
      body: "A atualização recarrega a página.",
      action: "Atualizar"
    }
  },
  team: {
    invite: "Convidar um funcionário",
    loading: "A carregar os seus funcionários…",
    guide: {
      title: "Cobre em equipa",
      lead: "Cada funcionário cobra com o seu próprio telemóvel, para o seu negócio.",
      invite: {
        title: "Convide",
        caption: "Escolha o nome: a app prepara o convite, um código QR e uma ligação."
      },
      activate: {
        title: "Ative o telemóvel dele",
        caption:
          "O funcionário lê o código QR ou abre a ligação: o telemóvel dele torna-se uma caixa do seu negócio."
      },
      sales: {
        title: "Acompanhe as vendas dele",
        caption: "Chegam à sua carteira, em nome dele; cada funcionário só vê as próprias vendas."
      }
    },
    noMatch: "Nenhum funcionário corresponde aos filtros.",
    offline: "Sem ligação: não foi possível verificar o estado dos convites.",
    rosterOffline:
      "Nenhum relé respondeu: não foi possível ler a lista de funcionários. Verifique a ligação e volte a este ecrã.",
    rosterPartial: "Nem todos os relés responderam: a lista de funcionários pode estar incompleta.",
    newer: "Alguns funcionários vêm de uma versão mais recente da app: atualize a app para os ver.",
    invitations: "Convites pendentes",
    employees: "Funcionários",
    columns: {
      name: "Nome",
      state: "Estado",
      date: "Data"
    },
    status: {
      invited: "Pendente",
      joined: "Ativo",
      left: "Saiu",
      expired: "Expirado"
    },
    detail: {
      invited: "Ligação criada a {{date}}",
      joined: "Juntou-se a {{date}}",
      left: "Saiu a {{date}}",
      expired: "Ligação expirada a {{date}}"
    },
    // Where an employee's device joined (its record's platform), beside its row's date.
    platform: {
      ios: "num iPhone ou iPad",
      android: "no Android",
      web: "num navegador web"
    },
    detailWithPlatform: "{{detail}}, {{platform}}",
    actions: {
      share: "Partilhar a ligação",
      showQr: "Mostrar a ligação e o código",
      renew: "Renovar o convite",
      deleteInvite: "Eliminar o convite",
      removeAccess: "Retirar o acesso",
      removeLeft: "Remover da lista"
    },
    inviteSheet: {
      title: "Convidar um funcionário",
      lead: "Com esta ligação, outro dispositivo recebe pagamentos para o seu negócio: o telemóvel de um funcionário ou uma caixa partilhada. Os pagamentos chegam diretamente à sua carteira.",
      can: "Este dispositivo poderá",
      canItems: {
        sell: "Cobrar: montante, artigos e leitura de códigos",
        methods: "Receber em Lightning, on-chain ou por cartão",
        links: "Enviar uma ligação de pagamento a um cliente",
        ownSales: "Ver as próprias vendas"
      },
      cannot: "Este dispositivo não poderá",
      cannotItems: {
        wallet: "Ver o seu saldo nem enviar fundos",
        settings: "Alterar os seus artigos, preços ou definições",
        otherSales: "Ver as vendas dos outros funcionários ou caixas",
        manage: "Gerir a equipa, os cartões ou as integrações"
      },
      revoke: "Pode retirar-lhe o acesso a qualquer momento.",
      nameLabel: "Nome",
      namePlaceholder: "Ex.: Alice ou Caixa 1",
      nameHint: "Aparece na sua carteira ao lado das vendas dele.",
      create: "Criar a ligação",
      notice:
        "A ligação será válida durante 48 horas e só funciona uma vez. Entregue-a apenas ao funcionário ou à caixa previstos: a primeira pessoa que a abrir pode ocupar esse lugar."
    },
    qrSheet: {
      title: "Convite para {{name}}",
      lead: "Leia este código com o dispositivo que vai receber pagamentos, ou envie a ligação para esse dispositivo.",
      leadDesktop:
        "Leia este código com o dispositivo que vai receber pagamentos para {{business}}, ou envie a ligação para esse dispositivo.",
      linkLabel: "Ligação de convite",
      copy: "Copiar a ligação",
      share: "Partilhar a ligação",
      copied: "Ligação copiada",
      copyFailed: "Não foi possível copiar a ligação. Selecione-a e copie-a.",
      done: "Concluir",
      notice:
        "Esta ligação só funciona uma vez e expira a {{date}}. Destina-se apenas a {{name}}: a primeira pessoa que a abrir pode ocupar esse lugar."
    },
    removeDialog: {
      title: "Remover {{name}}?",
      body: "{{name}} deixará de poder receber pagamentos para {{business}}. Os pagamentos anteriores ficam na carteira, em seu nome.",
      confirm: "Retirar o acesso",
      doneTitle: "Acesso retirado",
      doneBody: "{{name}} já não faz parte da equipa de {{business}}."
    },
    removeLeftDialog: {
      title: "Remover {{name}} da lista?",
      body: "{{name}} saiu de {{business}} a {{date}}. Os pagamentos anteriores ficam na carteira, em seu nome.",
      confirm: "Remover da lista",
      doneTitle: "Lista de funcionários atualizada",
      doneBody: "{{name}} deixa de aparecer nela."
    },
    deleteInviteDialog: {
      title: "Eliminar o convite de {{name}}?",
      body: "A ligação deixará de funcionar: {{name}} não poderá juntar-se a {{business}} com ela.",
      confirm: "Eliminar o convite",
      doneTitle: "Ligação de convite desativada",
      doneBody: "{{name}} já não poderá juntar-se a {{business}}."
    },
    cancelSalesDialog: {
      unknownLead: "Não foi possível verificar o estado das faturas de {{name}}.",
      linksLeft:
        "{{name}} já não faz parte da equipa de {{business}}. As ligações de pagamento que não foi possível cancelar continuam a poder ser pagas até ao seu fim: os pagamentos chegam à carteira.",
      title: "Anular as faturas de {{name}}?",
      lead: "Algumas faturas de {{name}} ainda não são definitivas.",
      links:
        "As suas ligações de pagamento que ainda não receberam nada serão anuladas: a sua página deixará de mostrar um código para pagar. As que foram pagas serão finalizadas.",
      invoices:
        "As faturas mostradas no seu dispositivo serão anuladas: o dispositivo deixa de as mostrar assim que recebe a retirada do seu acesso.",
      end: "Um cliente que já digitalizou ou copiou uma fatura ainda pode pagá-la: o pagamento chega à carteira. Depois, o acesso de {{name}} é retirado.",
      confirm: "Anular e retirar",
      progress: "A anular as faturas de {{name}}…"
    },
    failedTitle: "Ação impossível",
    unreachableTitle: "Sem ligação",
    errors: {
      noAccount: "Desbloqueie este ponto de venda com a sua passkey para gerir a equipa.",
      noWebApp: "Os convites ainda não estão disponíveis nesta versão da app.",
      tooMany: "A sua equipa já tem 100 funcionários.",
      invalidName: "Introduza o nome do funcionário.",
      unreachable:
        "Não foi possível publicar o convite. Verifique a sua ligação à internet e tente novamente.",
      unpublished:
        "O funcionário foi adicionado à lista, mas não foi possível publicar o seu convite. Partilhe a sua ligação a partir da lista para tentar novamente.",
      removeUnreachable:
        "Não foi possível publicar a remoção. Verifique a sua ligação à internet e tente novamente.",
      removeFailed: "Não foi possível guardar a remoção. Tente novamente.",
      removalUnsaved:
        "O acesso deste funcionário foi cortado, mas não foi possível guardar a remoção. Tente novamente: também será guardada da próxima vez que abrir a sua conta.",
      salesInProgress:
        "Algumas faturas deste funcionário ainda não são definitivas. Tente novamente quando a sua versão final for publicada (até 3 horas após o fim de uma fatura não paga).",
      integrationPending:
        "Uma integração tem pagamentos ainda não definitivos. Tente novamente quando o forem.",
      exportNewer:
        "Uma versão mais recente da app alterou este assistente. Atualize a app para o alterar",
      invoicesNewer:
        "Uma versão mais recente da app alterou este assistente. Atualize a app para o alterar"
    },
    removedNotice: "Este dispositivo já não faz parte da equipa de {{business}}.",
    join: {
      title: "Juntar-se a uma equipa",
      scanLead: "Leia o código QR de convite que o proprietário do negócio lhe mostra.",
      cameraAppLead: "Leia o código QR de convite com a câmara do telemóvel: abre esta página.",
      cameraNeeded: "A câmara serve para ler o código QR de convite.",
      allowCamera: "Permitir a câmara",
      openSettings: "Abrir as definições",
      pasteLabel: "Ou cole a ligação de convite",
      checking: "A ler o convite…",
      joining: "A juntar-se à equipa…",
      as: "Vai receber pagamentos para {{business}} como {{name}}.",
      rights:
        "Este dispositivo vai criar faturas pagas a {{business}}. Não terá acesso à carteira, às definições nem às vendas dos outros funcionários.",
      confirm: "Juntar-se à equipa",
      scanAnother: "Ler outro convite",
      errors: {
        invalid: "Esta não é uma ligação de convite. Verifique se foi copiada na totalidade.",
        notFound: "Este convite não existe ou expirou. Peça um novo ao proprietário.",
        closed: "Este convite já foi utilizado. Peça um novo ao proprietário.",
        expired: "Este convite expirou. Peça um novo ao proprietário.",
        newer:
          "Este convite vem de uma versão mais recente da app. Atualize a app e tente novamente.",
        unreachable: "Sem ligação. Verifique a sua ligação à internet e tente novamente.",
        removed: "O proprietário retirou este convite.",
        alreadySetUp:
          "Este dispositivo já recebe pagamentos para um negócio: não pode juntar-se a uma equipa."
      }
    }
  },
  integrations: {
    create: "Criar uma integração",
    loading: "A carregar as suas integrações…",
    guide: {
      title: "Cobre na sua loja online",
      lead: "Uma integração permite a uma loja online ou a uma ferramenta cobrar aos seus clientes na sua conta.",
      create: {
        title: "Crie a integração",
        caption: "Escolha a sua loja (WooCommerce, PrestaShop…) ou a linguagem do seu servidor."
      },
      key: {
        title: "Entregue a chave secreta",
        caption:
          "Cole-a na sua loja ou confie-a ao seu programador. Fica no servidor, nunca com os seus clientes."
      },
      pay: {
        title: "Os seus clientes pagam",
        caption: "Em cada encomenda, a loja mostra a fatura. O pagamento chega à sua carteira."
      }
    },
    noMatch: "Nenhuma integração corresponde aos filtros.",
    offline:
      "Nenhum relé respondeu: não foi possível ler a lista de integrações. Verifique a ligação e volte a este ecrã.",
    partial: "Nem todos os relés responderam: a lista de integrações pode estar incompleta.",
    newer: "Algumas integrações vêm de uma versão mais recente da app: atualize a app para as ver.",
    columns: {
      name: "Nome",
      date: "Criada a"
    },
    created: "Criada a {{date}}",
    actions: {
      remove: "Retirar a integração"
    },
    createSheet: {
      title: "Nova integração",
      lead: "Faça as suas faturas com uma IA, receba na sua loja online ou a partir do seu próprio site.",
      invoices: "Faturas",
      shops: "Lojas online",
      developers: "Para programadores",
      developersDetail_one: "SDK: {{names}} e mais {{count}}",
      developersDetail_other: "SDK: {{names}} e mais {{count}}",
      soon: "Em breve",
      soonLabel: "{{name}}: em breve",
      source: "Código-fonte",
      sourceLabel: "{{name}}: código-fonte no GitHub",
      oneShopTitle: "Uma chave para uma só loja",
      oneShop:
        "Os servidores de uma mesma loja partilham a sua chave; duas lojas, nunca: as suas encomendas misturar-se-iam, e uma poderia passar por paga com o pagamento da outra. Para outra loja, crie outra integração.",
      namePlaceholder: "Loja online"
    },
    sdk: {
      lead: "O SDK {{name}} cria no seu servidor a fatura de cada encomenda e verifica o seu pagamento.",
      package: "O pacote",
      open: "Abrir em {{site}}",
      openLabel: "Abrir {{name}} em {{site}}",
      readme: "O seu README explica como instalá-lo e usá-lo.",
      key: "A chave secreta"
    },
    files: {
      show: "Mostrar os passos de {{name}}",
      copyName: "Copiar o nome {{name}}",
      nameCopied: "Nome copiado: {{name}}",
      copy: "Copiar o conteúdo",
      copied: "Conteúdo copiado",
      contentCopied: "Conteúdo de {{name}} copiado",
      copyFailed: "Não foi possível copiar. Tente novamente.",
      readFailed: "A app não conseguiu ler este ficheiro: feche o guia e abra-o novamente.",
      lastLine: "Depois de colado, termina na linha {{line}}.",
      pasted: "Colado",
      progress: "Colados: {{count}} de {{total}}"
    },
    keyStep: {
      title: "Criar a chave desta loja",
      leadShop:
        "Faça-o quando o campo da chave estiver aberto em {{platform}}: só será mostrada uma vez.",
      leadSdk:
        "O seu servidor lê-a de uma variável de ambiente, nunca de uma página web nem de um repositório de código. Só será mostrada uma vez.",
      shopName: "Nome da loja",
      siteName: "Nome do site ou da ferramenta",
      nameHint: "Aparece na sua carteira ao lado das vendas dela.",
      create: "Criar a chave"
    },
    guides: {
      wix: {
        editor: {
          title: "Abrir o código do site",
          body: "Num computador, abra o editor do seu site Wix. No topo, clique em «Dev Mode» e depois em «Turn on Dev Mode»: à esquerda do editor aparece uma coluna de ícones. Este guia mostra o Editor Wix; no Wix Studio os ecrãs são diferentes. Os nomes do Wix aqui são os ingleses.",
          image: "O menu «Dev Mode» do Editor Wix e o seu botão «Turn on Dev Mode», enquadrados."
        },
        packages: {
          title: "Abrir os pacotes",
          body: "Nessa coluna de ícones, clique no cubo («Packages & Apps»). Em «npm», clique em «+ Install packages from npm».",
          image:
            "O painel «Packages & Apps» do Wix: o ícone do cubo e a ligação «+ Install packages from npm», enquadrados."
        },
        install: {
          title: "Instalar dois pacotes do Wix",
          body: "Abre-se uma janela «Package Manager». Na sua pesquisa, escreva @wix/ecom e clique em «Install» na linha @wix/ecom (e não noutra de nome parecido). Espere que termine e faça o mesmo com @wix/essentials. Feche a janela: os dois pacotes aparecem em «npm». São duas ferramentas do Wix de que o plugin precisa.",
          image:
            "A janela «Package Manager»: @wix/ecom escrito na sua pesquisa e o botão «Install» da linha @wix/ecom, enquadrados."
        },
        files: {
          title: "Criar os 6 ficheiros",
          body: "Em «Backend & Public» (o ícone { } da coluna), crie cada ficheiro no seu lugar, por esta ordem, e cole o seu conteúdo, copiado daqui: o do plugin {{version}}, verificado pela app.",
          where: {
            js: "Backend › + › Add .js file",
            file: "Backend › + › Add file",
            servicePlugin: "Service Plugins › + › Payment",
            servicePluginConfig: "Service Plugins › payment-provider › sattlemeCheckout"
          },
          how: {
            js: "Chame-lhe {{name}} e cole o seu conteúdo. É o maior: espere que o Wix o mostre todo antes de clicar noutro sítio.",
            file: "Chame-lhe {{name}}. O Wix põe lá um exemplo: selecione tudo (Ctrl+A, ou ⌘A num Mac) e cole.",
            servicePlugin:
              "Chame ao plugin sattlemeCheckout e depois «Add & Edit Code»: o Wix cria este ficheiro e o seguinte. Verifique que o separador aberto é {{name}}, selecione tudo e cole.",
            servicePluginConfig:
              "O Wix criou-o com sattlemeCheckout.js: abra-o, selecione tudo e cole."
          },
          sharedCode:
            "O seu site já tem o seu próprio {{name}}? Não o substitua: cole o conteúdo copiado no fim do seu, por baixo das suas linhas.",
          sharedJobs:
            "O seu site já tem o seu próprio {{name}}? Não o substitua: acrescente a tarefa do plugin (o bloco entre chavetas da sua lista «jobs») à lista «jobs» do seu, separada por uma vírgula.",
          image:
            "O painel «Backend & Public» do Wix: o + de «Backend» e as opções «Add .js file» e «Add file» do seu menu, enquadrados."
        },
        secrets: {
          title: "Abrir o Secrets Manager",
          body: "No painel do site, «Developer Tools» › «Secrets Manager». Guarde um segredo chamado sattleme-checkout-status-token, com um valor aleatório de 32 caracteres ou mais (do seu gestor de palavras-passe): a palavra-passe da página de estado do plugin. Depois «+ Add Secret» outra vez, chamado sattleme-checkout-key.",
          image:
            "O Secrets Manager do Wix: «Secrets Manager» em «Developer Tools» e a ligação «+ Add Secret», enquadrados."
        },
        save: {
          title: "Guardar a chave",
          body: "Cole a chave como valor do segredo sattleme-checkout-key e guarde. Fica nesse segredo: não a escreva em mais nenhum lugar do Wix.",
          image:
            "A janela «Add secret» do Wix, chamada sattleme-checkout-key: o seu campo «Value» vazio e o seu botão «Add Secret», enquadrados."
        },
        publish: {
          title: "Publicar uma vez",
          body: "No editor, clique uma única vez em «Publish»: cada clique faz uma publicação.",
          image: "O topo do Editor Wix: o botão «Publish», enquadrado."
        },
        status: {
          title: "Abrir a página de estado",
          body: "Abra o endereço do seu site seguido de /_functions/sattlemeCheckoutStatus e introduza o token (o valor do segredo sattleme-checkout-status-token). A página mostra o plugin {{version}}. Faça-o antes de ligar: ela guarda o endereço do site, onde os seus clientes pagam.",
          image: "A página de estado do plugin: o seu campo do token e o seu botão, enquadrados."
        },
        connect: {
          title: "Ligar o pagamento",
          body: "No painel, «Settings» › «Accept Payments» › «Bitcoin (Lightning / on-chain)» › «Connect». Primeiro campo: sattleme-checkout-key, o nome do segredo, nunca a própria chave. Segundo campo: 15, os minutos para pagar uma fatura (de 1 a 60). Depois «Connect».",
          image:
            "O formulário de ligação do Wix: sattleme-checkout-key no primeiro campo, 15 no segundo e o botão «Connect», enquadrados."
        },
        check: {
          title: "Testar um pagamento",
          body: "Faça uma encomenda no seu site, primeiro num site de teste, e escolha «Bitcoin (Lightning / on-chain)»: abre-se a página de pagamento do plugin.",
          image:
            "A página de pagamento do plugin: «Pay with Bitcoin», o montante em sats e o tempo que falta para pagar."
        }
      },
      bebop: {
        open: {
          title: "Abrir as definições do sattle.me",
          body: "Na administração do be-BOP, abra «Pagamentos» → «sattle.me». Se não estiver na lista, atualize primeiro o be-BOP.",
          image:
            "Captura de ecrã do be-BOP: o menu da administração, «sattle.me» enquadrado sob «Payment Settings»"
        },
        save: {
          title: "Colar a chave e guardar",
          body: "Cole a chave em «Chave de integração (app sattle.me > Integrações)». Para aceitar também pagamentos onchain, marque «Aceitar também pagamentos on-chain (método Bitcoin)». Depois, clique em «Guardar».",
          image:
            "Captura de ecrã do be-BOP: as definições do sattle.me, o campo «Integration key», a caixa «Also take on-chain payments» e o botão «Save» enquadrados"
        },
        test: {
          title: "Testar a ligação",
          body: "Clique em «Testar a ligação»: o be-BOP lê a integração com a sua chave, sem fazer nenhuma fatura, e mostra «Ligação bem-sucedida. As credenciais sattle.me funcionam.». Se os pagamentos onchain estiverem marcados, verifica também que a integração tem endereços Bitcoin: esta app dá-lhos quando é criada e, depois, a cada desbloqueio com a sua passkey, com ligação à internet. Se o teste falhar, verifique a chave, desbloqueie esta app e teste de novo.",
          image:
            "Captura de ecrã do be-BOP: as definições do sattle.me, o botão «Test connection» enquadrado"
        },
        prefer: {
          title: "Pôr o sattle.me em primeiro lugar",
          body: "Se outro processador já aceita pagamentos Lightning ou onchain na sua loja, abra «Definições» → «Geral». Em «Preferências do processador de pagamento», escolha «sattleme» como «Processador Lightning preferido» e «sattleme-onchain» como «Processador Bitcoin on-chain preferido» e, depois, clique em «Atualizar» no fundo da página.",
          image:
            "Captura de ecrã do be-BOP: «Payment processor preferences», sattleme-onchain e sattleme escolhidos e enquadrados"
        },
        check: {
          title: "Verificar a sua loja",
          body: "No passo do pagamento, os seus clientes já podem escolher «Lightning» como «Método de pagamento», e também «Onchain» se marcou os pagamentos onchain: o be-BOP propõe-no a partir de 10 000 sats. Depois de feita a encomenda, pagam-na lendo um código QR. Um pagamento onchain paga a encomenda após 3 confirmações, cerca de 30 minutos, mais com comissões baixas. Cada pagamento é um pagamento real em bitcoin, para a sua carteira.",
          image:
            "Captura de ecrã de uma loja be-BOP: «Lightning» como «Payment method» no passo do pagamento"
        }
      },
      pretix: {
        plugins: {
          title: "Abrir os plugins do evento",
          body: "No backend do pretix, abra o seu evento e, depois, no menu dele, «Configurações» → «Plugins».",
          image: "Captura de ecrã do pretix: o menu do evento, «Plugins» destacado sob «Settings»"
        },
        enable: {
          title: "Ativar o plugin",
          body: "Procure «sattle.me» e clique em «Ativar».",
          image:
            "Captura de ecrã do pretix: os plugins, filtrados por «sattle.me», o botão «Enable» destacado"
        },
        open: {
          title: "Abrir as definições do plugin",
          body: "Em «Configurações» → «Pagamento», clique em «Configurações» ao lado de «Bitcoin (sattle.me)».",
          image:
            "Captura de ecrã do pretix: os meios de pagamento, o botão «Settings» de «Bitcoin (sattle.me)» destacado"
        },
        save: {
          title: "Colar a chave e guardar",
          body: "Marque «Habilitar método de pagamento», cole a chave em «Integration key» e clique em «Salve» no fundo da página: o pretix verifica-a e, depois, nunca mais a mostra. «Time to pay» é o tempo que o cliente tem para pagar uma fatura: de 1 a 60 minutos, 15 por predefinição.",
          image:
            "Captura de ecrã do pretix: as definições de Bitcoin (sattle.me), a caixa «Enable payment method» e o campo «Integration key» destacados"
        },
        channels: {
          title: "Escolher os canais de venda",
          body: "Na mesma página, «Restringir a canais de vendas específicos» indica onde os seus clientes podem pagar em bitcoin: «Loja online» por predefinição. Marque os outros canais que quiser e clique em «Salve».",
          image:
            "Captura de ecrã do pretix: «Restrict to specific sales channels», a caixa «Online shop» destacada"
        },
        check: {
          title: "Verificar a sua loja",
          body: "No passo do pagamento, os seus clientes já podem escolher «Bitcoin» e ler um código QR: em Lightning abaixo de cerca de 1000 sats, em Lightning ou onchain acima. Um pagamento onchain aparece em confirmação em menos de um minuto e paga a encomenda após 3 confirmações, cerca de 30 minutos, mais com comissões baixas. Quando o mempool.space demora a responder, uma fatura pode ser criada só em Lightning. Mesmo no modo de teste do pretix, cada pagamento é um pagamento real em bitcoin, para a sua carteira.",
          image: "Captura de ecrã de uma loja pretix: «Bitcoin» no passo do pagamento"
        }
      },
      nopcommerce: {
        download: {
          title: "Transferir o plugin",
          body: "Transfira o plugin: um arquivo .zip, a manter tal como está, sem o descomprimir. Requer o nopCommerce 5.00.",
          link: "Abrir o marketplace do nopCommerce",
          file: "Transferir a versão {{version}}"
        },
        plugins: {
          title: "Abrir os plugins locais",
          body: "Na administração do nopCommerce, abra «Configuration» → «Local plugins».",
          image:
            "Captura de ecrã do nopCommerce: o menu da administração, «Local plugins» destacado"
        },
        upload: {
          title: "Carregar o arquivo",
          body: "Clique em «Upload plugin or theme», escolha o arquivo e, depois, clique em «Upload plugin or theme» na janela que se abre.",
          image:
            "Captura de ecrã do nopCommerce: a janela «Upload plugin or theme», o arquivo escolhido, o botão «Upload plugin or theme» destacado"
        },
        restart: {
          title: "Reiniciar o nopCommerce",
          body: "Clique em «Restart application to apply changes» no topo da página e espere que a página volte a aparecer: a sua loja não responde enquanto o nopCommerce reinicia. O plugin só aparece na lista depois deste reinício.",
          image:
            "Captura de ecrã do nopCommerce: «Local plugins», o botão «Restart application to apply changes» destacado"
        },
        install: {
          title: "Instalar o plugin",
          body: "Na lista, encontre «Bitcoin (sattle.me)», no grupo «Payment methods», clique em «Install» e, depois, de novo em «Restart application to apply changes».",
          image:
            "Captura de ecrã do nopCommerce: o plugin Bitcoin (sattle.me) na lista, o botão «Install» destacado"
        },
        open: {
          title: "Abrir as definições",
          body: "Depois de o nopCommerce reiniciar, clique em «Configure» sob «Bitcoin (sattle.me)». Também o encontra em «Configuration» → «Payment methods».",
          image:
            "Captura de ecrã do nopCommerce: o plugin Bitcoin (sattle.me), instalado, o botão «Configure» destacado"
        },
        save: {
          title: "Colar a chave e guardar",
          body: "Marque «Enabled», cole a chave em «Integration key» e clique em «Save» no fundo da página: o plugin verifica-a e, depois, nunca mais a mostra. «Time to pay (minutes)» é o tempo que o cliente tem para pagar uma fatura: de 1 a 60 minutos, 15 por predefinição.",
          image:
            "Captura de ecrã do nopCommerce: as definições de Bitcoin (sattle.me), a caixa «Enabled» e o campo «Integration key» destacados"
        },
        check: {
          title: "Verificar a sua loja",
          body: "No passo do pagamento, os seus clientes já podem escolher «Bitcoin». Depois de confirmada a encomenda, pagam-na numa página da sua loja lendo um código QR: em Lightning abaixo de cerca de 1000 sats, em Lightning ou onchain acima. Um pagamento onchain paga a encomenda após 3 confirmações, cerca de 30 minutos, mais com comissões baixas. Os pagamentos também são verificados pelas tarefas agendadas do nopCommerce, que têm de conseguir chegar ao URL da sua loja. Cada pagamento é um pagamento real em bitcoin, para a sua carteira.",
          image: "Captura de ecrã de uma loja nopCommerce: «Bitcoin» no passo do pagamento"
        },
        autoCancel: {
          title: "Excluir Bitcoin do cancelamento automático",
          body: "Se «Enable auto-canceling of unpaid orders» estiver marcada («Configuration» → «Settings» → «Order settings»), adicione «Bitcoin (sattle.me)» aos seus «Excluded payment methods», para que uma encomenda cujo pagamento está em confirmação não seja cancelada."
        }
      },
      woocommerce: {
        download: {
          title: "Transferir o plugin",
          body: "Transfira o ficheiro do plugin, sattleme-for-woocommerce-….zip, e mantenha-o tal como está, sem o descomprimir. O plugin requer o WordPress 7.0, o WooCommerce 11.1 e o PHP 8.2, ou mais recentes.",
          link: "Abrir a página GitHub do plugin",
          file: "Transferir a versão {{version}}"
        },
        upload: {
          title: "Carregar o ficheiro",
          body: "Na administração do WordPress, abra «Plugins» → «Adicionar plugin», clique em «Carregar plugin» no topo da página, escolha o ficheiro e clique em «Instalar agora».",
          image:
            "Captura de ecrã do WordPress: «Upload Plugin» e o ficheiro escolhido, os botões «Upload Plugin» e «Install Now» destacados"
        },
        activate: {
          title: "Activar o plugin",
          body: "Depois de o plugin estar instalado, clique em «Activar plugin».",
          image:
            "Captura de ecrã do WordPress: o plugin instalado, o botão «Activate Plugin» destacado"
        },
        open: {
          title: "Abrir as suas definições",
          body: "Em «Plugins», sob «sattle.me for WooCommerce», clique em «Settings». Também lá chega por «WooCommerce» → «Configurações» → «Pagamentos», com o nome «sattle.me (Bitcoin)».",
          image:
            "Captura de ecrã do WordPress: o plugin sattle.me for WooCommerce na lista de plugins, a ligação «Settings» destacada"
        },
        save: {
          title: "Colar a chave e guardar",
          body: "Marque «Accept Bitcoin payments with sattle.me», cole a chave em «Integration key» e clique em «Guardar alterações» no fundo da página: o plugin verifica a chave e nunca mais a mostra. A página indica então «Connected to», seguido do nome da sua empresa. «Time to pay» é o tempo que o cliente tem para pagar uma fatura: de 1 a 60 minutos, 15 por predefinição.",
          image:
            "Captura de ecrã do WordPress: as definições de sattle.me (Bitcoin) guardadas, «Connected to» e a caixa marcada destacados"
        },
        check: {
          title: "Verificar a sua loja",
          body: "No passo do pagamento, os seus clientes já podem pagar em bitcoin, com o logótipo da sattle.me. Depois de feita a encomenda, pagam-na numa página da sua loja ao ler um código QR: em Lightning abaixo de cerca de 1000 sats, em Lightning ou onchain acima. Um pagamento onchain paga a encomenda após 3 confirmações, cerca de 30 minutos, mais com comissões baixas. O plugin também verifica os pagamentos a cada minuto, mesmo com a página de pagamento fechada, através das tarefas agendadas do WordPress (WP-Cron): numa loja com poucas visitas, faça com que o cron do seu servidor as execute a cada minuto, como explica o README do plugin. Cada pagamento é um pagamento real em bitcoin, para a sua carteira.",
          image:
            "Captura de ecrã de uma loja WooCommerce: o pagamento em bitcoin no passo do pagamento"
        }
      },
      grandnode: {
        download: {
          title: "Transferir o plugin",
          body: "Transfira o arquivo do plugin, Payments.Sattleme-….zip, e mantenha-o tal como está, sem o descomprimir. Requer o GrandNode 2.4.",
          link: "Abrir a página GitHub do plugin",
          file: "Transferir a versão {{version}}"
        },
        plugins: {
          title: "Abrir os plugins locais",
          body: "Na administração do GrandNode, abra «Plugins» → «Local plugins».",
          image:
            "Captura de ecrã do GrandNode: o menu «Plugins» da administração, «Local plugins» destacado"
        },
        upload: {
          title: "Carregar o arquivo",
          body: "Clique em «Upload» no topo da página, escolha o arquivo e, depois, clique em «Upload» na janela que se abre. O GrandNode mostra «Plugin uploaded» e, depois, desliga-se para reiniciar: recarregue a página no navegador (não com «Reload list of plugins», que volta a parar o GrandNode) até a lista de plugins voltar a aparecer; a sua loja não responde entretanto. Se continuar sem responder ao fim de alguns minutos, reinicie o GrandNode (o seu serviço ou o seu contentor).",
          image:
            "Captura de ecrã do GrandNode: a janela «Upload», o arquivo escolhido, o seu botão «Upload» destacado"
        },
        install: {
          title: "Instalar o plugin",
          body: "Na lista, encontre «Bitcoin (sattle.me)», no grupo «Payment methods»: a sua etiqueta «Installed» fica a vermelho enquanto não estiver instalado. Clique em «Install»: o GrandNode reinicia de novo. Recarregue a página da mesma forma.",
          image:
            "Captura de ecrã do GrandNode: o plugin Bitcoin (sattle.me) na lista, o seu botão «Install» destacado"
        },
        open: {
          title: "Abrir as definições",
          body: "Quando «Configure» aparecer junto a «Bitcoin (sattle.me)», clique nele. Também encontra as definições em «Configuration» → «Payment» → «Payment methods», com o nome «Bitcoin».",
          image:
            "Captura de ecrã do GrandNode: o plugin Bitcoin (sattle.me), instalado, o seu botão «Configure» destacado"
        },
        save: {
          title: "Colar a chave e guardar",
          body: "Ative «Enabled», cole a chave em «Integration key» e clique em «Save» no topo da página: o plugin verifica-a e, depois, nunca mais a mostra. «Time to pay (minutes)» é o tempo que o cliente tem para pagar uma fatura: de 1 a 60 minutos, 15 por predefinição.",
          image:
            "Captura de ecrã do GrandNode: as definições de Bitcoin (sattle.me), «Enabled», o campo «Integration key» e «Save» destacados"
        },
        check: {
          title: "Verificar a sua loja",
          body: "No passo do pagamento, os seus clientes já podem pagar em bitcoin, com o logótipo da sattle.me. Depois de confirmada a encomenda, pagam-na numa página da sua loja lendo um código QR: em Lightning abaixo de cerca de 1000 sats, em Lightning ou onchain acima. Um pagamento onchain paga a encomenda após 3 confirmações, cerca de 30 minutos, mais com comissões baixas. O GrandNode também verifica os pagamentos a cada minuto, mesmo com a página de pagamento fechada. Cada pagamento é um pagamento real em bitcoin, para a sua carteira.",
          image:
            "Captura de ecrã de uma loja GrandNode: o pagamento em bitcoin no passo do pagamento"
        }
      },
      smartstore: {
        download: {
          title: "Transferir o plugin",
          body: "Transfira o pacote do plugin, Smartstore.Module.Sattleme.Bitcoin.….zip, e mantenha-o tal como está, sem o descomprimir. O plugin requer o Smartstore 6.4.",
          link: "Abrir a página GitHub do plugin",
          file: "Transferir a versão {{version}}"
        },
        plugins: {
          title: "Abrir os plugins",
          body: "Na administração do Smartstore, abra «Plugins» → «Manage plugins».",
          image:
            "Captura de ecrã do Smartstore: o menu «Plugins» da administração, «Manage plugins» enquadrado"
        },
        upload: {
          title: "Carregar o pacote",
          body: "Clique em «Upload plugin» no topo da página e escolha o pacote: o Smartstore carrega-o de imediato e confirma que está carregado e descomprimido.",
          image:
            "Captura de ecrã do Smartstore: a página dos plugins, o seu botão «Upload plugin» enquadrado"
        },
        reload: {
          title: "Recarregar a lista de plugins",
          body: "Clique em «Edit» → «Reload list of plugins». O Smartstore reinicia: espere que a página volte a aparecer, a sua loja não responde entretanto.",
          image: "Captura de ecrã do Smartstore: o menu «Edit», «Reload list of plugins» enquadrado"
        },
        install: {
          title: "Instalar o plugin",
          body: "Na lista, encontre «Bitcoin (sattle.me)» e clique em «Install»: o Smartstore põe a sua instalação em espera.",
          image:
            "Captura de ecrã do Smartstore: o plugin Bitcoin (sattle.me) na lista, o seu botão «Install» enquadrado"
        },
        execute: {
          title: "Executar a instalação",
          body: "Clique em «Execute tasks» no topo da página e, depois, em «OK». O Smartstore reinicia de novo e instala o plugin: espere que a página volte a aparecer.",
          image:
            "Captura de ecrã do Smartstore: a página dos plugins, o seu botão «Execute tasks» enquadrado"
        },
        open: {
          title: "Abrir as definições",
          body: "Sob «Bitcoin (sattle.me)», clique no botão da roda dentada e, depois, em «Configure». Também encontra as suas definições em «Configuration» → «Payment methods», com o nome «Bitcoin».",
          image:
            "Captura de ecrã do Smartstore: o plugin Bitcoin (sattle.me), instalado, a sua roda dentada e «Configure» enquadrados"
        },
        save: {
          title: "Colar a chave e guardar",
          body: "Cole a chave em «Integration key» e clique em «Save» no topo da página: o plugin verifica-a e, depois, nunca mais a mostra. «Time to pay (minutes)» é o tempo que o cliente tem para pagar uma fatura: de 1 a 60 minutos, 15 por predefinição.",
          image:
            "Captura de ecrã do Smartstore: as definições de Bitcoin (sattle.me), o campo «Integration key» e «Save» enquadrados"
        },
        activate: {
          title: "Ativar o método de pagamento",
          body: "Abra «Configuration» → «Payment methods» e clique em «Activate» sob «Bitcoin»: a sua loja só o propõe no pagamento depois de ativado.",
          image:
            "Captura de ecrã do Smartstore: os métodos de pagamento, o botão «Activate» de Bitcoin enquadrado"
        },
        timezone: {
          title: "Definir o fuso horário da sua loja",
          body: "Em «Configuration» → «Settings», escolha o seu «Default store time zone» e guarde: a página de pagamento indica nele até quando o cliente pode pagar. Sem ele, o Smartstore usa o do seu servidor, muitas vezes UTC."
        },
        check: {
          title: "Verificar a sua loja",
          body: "No passo do pagamento, os seus clientes já podem escolher «Bitcoin». Depois de confirmada a encomenda, pagam-na numa página da sua loja lendo um código QR: em Lightning abaixo de cerca de 1000 sats, em Lightning ou onchain acima. Um pagamento onchain paga a encomenda após 3 confirmações, cerca de 30 minutos, mais com comissões baixas. O Smartstore também verifica os pagamentos a cada minuto, mesmo com a página de pagamento fechada, desde que as suas tarefas agendadas cheguem ao endereço da sua loja. Cada pagamento é um pagamento real em bitcoin, para a sua carteira.",
          image: "Captura de ecrã de uma loja Smartstore: «Bitcoin» no passo do pagamento"
        }
      },
      prestashop: {
        download: {
          title: "Transferir o módulo",
          body: "Transfira o ficheiro do módulo, sattleme.zip, e mantenha-o tal como está, sem o descomprimir. O módulo requer o PrestaShop 9.0, 9.1 ou 9.2, com PHP 8.2 a 8.5.",
          link: "Abrir a página GitHub do módulo",
          file: "Transferir a versão {{version}}"
        },
        upload: {
          title: "Abrir o gestor de módulos",
          body: "No back office do PrestaShop, abra «Modules» → «Module Manager» e, depois, clique em «Upload a module» no topo da página.",
          image:
            "Captura de ecrã do PrestaShop: o gestor de módulos, o seu botão «Upload a module» enquadrado"
        },
        drop: {
          title: "Carregar o ficheiro",
          body: "Largue o ficheiro na janela, ou clique em «select file» e escolha-o: o PrestaShop carrega o módulo e instala-o de imediato.",
          image:
            "Captura de ecrã do PrestaShop: a janela «Upload a module», a sua área para o ficheiro enquadrada"
        },
        open: {
          title: "Abrir as definições",
          body: "Quando o PrestaShop mostrar «Module installed!», clique em «Configure». Também encontra as suas definições em «Modules» → «Module Manager», sob «sattle.me».",
          image:
            "Captura de ecrã do PrestaShop: «Module installed!», o seu botão «Configure» enquadrado"
        },
        save: {
          title: "Colar a chave e guardar",
          body: "Ative «Accept bitcoin payments», cole a chave em «Integration key» e clique em «Save» no fundo da página: o módulo verifica a chave e, depois, nunca mais a mostra. A página indica então «The integration key of», seguido do nome do seu negócio. «Time to pay» é o tempo que o cliente tem para pagar uma fatura: de 1 a 60 minutos, 15 por predefinição.",
          image:
            "Captura de ecrã do PrestaShop: as definições de sattle.me, «Accept bitcoin payments» e o campo «Integration key» enquadrados"
        },
        cron: {
          title: "Agendar as verificações em segundo plano",
          body: "Sob «Background checks», a página dá uma linha para o crontab do seu servidor: adicione-a ao crontab do utilizador do servidor web, ou como tarefa cron no painel do seu alojamento, para que seja executada a cada minuto. O módulo verifica então os pagamentos a cada minuto, mesmo com a página de pagamento fechada. Enquanto não tiver sido executada, a página indica «The background checks never ran: set up the cron.».",
          image:
            "Captura de ecrã do PrestaShop: as definições de sattle.me guardadas, a linha de crontab sob «Background checks» enquadrada"
        },
        check: {
          title: "Verificar a sua loja",
          body: "No passo do pagamento, os seus clientes já podem escolher «Pay with bitcoin». Depois de feita a encomenda, pagam-na numa página da sua loja lendo um código QR: em Lightning abaixo de cerca de 1000 sats, em Lightning ou onchain acima. Um pagamento onchain paga a encomenda após 3 confirmações, cerca de 30 minutos, mais com comissões baixas. Cada pagamento é um pagamento real em bitcoin, para a sua carteira.",
          image: "Captura de ecrã de uma loja PrestaShop: «Pay with bitcoin» no passo do pagamento"
        }
      },
      magento: {
        install: {
          title: "Instalar o módulo",
          body: "No servidor do seu Magento, a partir da pasta raiz do Magento e com o utilizador do servidor web, instale o módulo a partir do Packagist com o Composer e ative-o com estes comandos. O módulo precisa do Magento Open Source 2.4.7, 2.4.8 ou 2.4.9, com PHP 8.2 a 8.5. No modo de programador, «setup:di:compile» e «setup:static-content:deploy» não são necessários.",
          link: "Abrir a página Packagist do módulo"
        },
        open: {
          title: "Abrir as definições",
          body: "No admin do Magento, abra «Stores» → «Configuration», depois «Sales» → «Payment Methods», e expanda «Bitcoin (sattle.me)».",
          image:
            "Captura de ecrã do admin do Magento: os métodos de pagamento, «Bitcoin (sattle.me)» destacado"
        },
        save: {
          title: "Colar a chave e guardar",
          body: "Defina «Enabled» como «Yes», cole a chave em «Integration key» e clique em «Save Config» no topo da página: o módulo verifica a chave e, depois, nunca mais a mostra. «Connected to» mostra então o nome do seu negócio. «Time to pay (minutes)» é o tempo que o cliente tem para pagar uma fatura: de 1 a 60 minutos, 15 por predefinição.",
          image:
            "Captura de ecrã do admin do Magento: as definições de Bitcoin (sattle.me), «Enabled» e o campo «Integration key» destacados"
        },
        cron: {
          title: "Verificar o cron do Magento",
          body: "O módulo verifica os pagamentos a cada minuto, mesmo com a página de pagamento fechada, através do cron do Magento, que também cancela as encomendas que ficaram por pagar. Um Magento em produção já o executa; se o seu não, instale-o a partir da pasta raiz do Magento, com o utilizador do servidor web, com este comando."
        },
        check: {
          title: "Verificar a sua loja",
          body: "No passo do pagamento, os seus clientes já podem escolher «Bitcoin». Depois de feita a encomenda, pagam-na numa página da sua loja lendo um código QR: em Lightning abaixo de cerca de 1000 sats, em Lightning ou onchain acima. Um pagamento onchain paga a encomenda após 3 confirmações, cerca de 30 minutos, mais com comissões baixas. Cada pagamento é um pagamento real em bitcoin, para a sua carteira.",
          image: "Captura de ecrã de uma loja Magento: «Bitcoin» no passo do pagamento"
        }
      }
    },
    assistant: {
      row: "Assistente de IA",
      rowDetail: "Claude, ChatGPT… fazem as suas faturas",
      title: "Assistente de IA",
      lead: "O seu assistente de IA faz as faturas do seu negócio, numeradas com as suas, com o link de pagamento e o PDF, e diz-lhe quando estão pagas. Nunca gasta nada.",
      hosted: {
        title: "No Claude, ChatGPT…",
        detail: "Pronto a usar, alojado pela sattle.me",
        badge: "O mais simples"
      },
      desktop: { title: "No Claude Desktop", detail: "A chave fica no seu computador" },
      selfHosted: {
        title: "No seu próprio servidor",
        detail: "O seu código aberto, no GitHub",
        badge: "Para especialistas"
      },
      hostedSteps: {
        add: {
          title: "Adicione o conector",
          claude:
            "No Claude, este botão abre a adição do conector, já preenchida: verifique-a e confirme.",
          other:
            "No ChatGPT ou noutra app de IA, adicione um conector personalizado (servidor MCP) com este endereço, tal como está:"
        },
        addClaude: "Adicionar ao Claude",
        openChatGpt: "Abrir o ChatGPT",
        copy: "Copiar o endereço",
        copied: "Endereço copiado",
        copyFailed: "Não foi possível copiar o endereço",
        connect: {
          title: "Ligue-se",
          body: "A app abre uma página da sattle.me que pede a chave do assistente. Essa página indica para onde o vai levar de volta: continue apenas se for a sua app de IA."
        }
      },
      desktopSteps: {
        download: {
          title: "Descarregue a extensão",
          body: "O ficheiro «.mcpb» da versão mais recente.",
          link: "A extensão em github.com",
          file: "Transferir a versão {{version}}"
        },
        open: {
          title: "Abra-a",
          body: "Abra o ficheiro: o Claude Desktop instala o assistente e pede a sua chave."
        }
      },
      selfHostedSteps: {
        install: {
          title: "Instale o servidor",
          body: "O mesmo servidor MCP da sattle.me, numa máquina sua ou do seu prestador, com Docker. O seu código aberto e o guia de instalação estão no GitHub.",
          link: "sattleme/mcp-server no github.com"
        },
        trust: {
          title: "Este servidor vê as suas faturas",
          body: "Quem o gere vê a chave do assistente e as faturas que faz: nomes e moradas dos seus clientes, montantes. Se deixar de confiar, remova o assistente: para de imediato."
        },
        add: {
          title: "Adicione o conector",
          body: "Quando o servidor estiver online, adicione o seu endereço como conector personalizado na sua app de IA (Claude, ChatGPT…)."
        },
        connect: {
          title: "Ligue-se",
          body: "A app abre uma página do seu servidor que pede a chave do assistente. Essa página indica para onde o vai levar de volta: continue apenas se for a sua app de IA."
        }
      },
      keyStep: {
        title: "Criar a chave do assistente",
        leadHosted: "Faça-o quando a página da sattle.me a pedir: só é mostrada uma vez.",
        leadDesktop: "Faça-o quando o Claude Desktop a pedir: só é mostrada uma vez.",
        leadSelfHosted: "Faça-o quando a página do seu servidor a pedir: só é mostrada uma vez.",
        name: "Nome do assistente",
        namePlaceholder: "Claude da Alice",
        nameHint: "Aparece na sua carteira ao lado das faturas dele.",
        permissionsTitle: "O que este assistente poderá fazer",
        nonePicked: "Ative pelo menos uma autorização para criar a chave.",
        powerTitle: "Nunca permite gastar",
        power: {
          hosted: "Cole-a apenas na página da sattle.me, nunca numa conversa.",
          desktop: "Cole-a apenas no Claude Desktop, nunca numa conversa.",
          selfHosted: "Cole-a apenas na página do seu servidor, nunca numa conversa."
        }
      },
      keySheet: {
        once: "Só é mostrada uma vez: copie-a agora. Não poderá voltar a ser mostrada, nem com a sua passkey. Se a perder, retire o assistente e crie outro.",
        unpublished:
          "Ainda não foi possível publicar o assistente {{name}} nos seus relays. Será publicado no próximo desbloqueio com a sua passkey, com ligação à internet: até lá, não pode fazer nada.",
        secret:
          "Mantenha-a secreta. Se tiver sido divulgada, retire o assistente e crie outro: as faturas já feitas continuam pagáveis.",
        pasteHosted:
          "Cole-a na página da sattle.me. Depois peça, por exemplo: «Faz uma fatura à Dupont SA por 3 dias de consultoria a 1200 CHF, com vencimento a 30 dias.»",
        pasteDesktop:
          "Cole-a no campo «Assistant key» do Claude Desktop. Depois peça, por exemplo: «Faz uma fatura à Dupont SA por 3 dias de consultoria a 1200 CHF, com vencimento a 30 dias.»",
        pasteSelfHosted:
          "Cole-a na página do seu servidor. Depois peça, por exemplo: «Faz uma fatura à Dupont SA por 3 dias de consultoria a 1200 CHF, com vencimento a 30 dias.»",
        pasteHostedExport:
          "Cole-a na página da sattle.me. Depois peça, por exemplo: «Exporta as transações do mês passado em CSV para o meu contabilista.»",
        pasteSelfHostedExport:
          "Cole-a na página do seu servidor. Depois peça, por exemplo: «Exporta as transações do mês passado em CSV para o meu contabilista.»",
        pasteDesktopExport:
          "Cole-a no campo «Assistant key» do Claude Desktop. Depois peça, por exemplo: «Exporta as transações do mês passado em CSV para o meu contabilista.»"
      },
      created: "Assistente de IA · criado a {{date}}",
      createdExporting: "Assistente de IA · criado a {{date}} · exporta as suas transações",
      createdExportOnly:
        "Assistente de IA · criado a {{date}} · exporta as suas transações, sem faturas",
      createdNoInvoices: "Assistente de IA · criado a {{date}} · sem faturas",
      invoicing: {
        switch: "Fazer faturas",
        switchHint:
          "Ao ativá-lo, autoriza este assistente de IA a fazer faturas em nome do seu negócio, numeradas com as suas, e a ler as que fez, com os nomes e moradas dos seus clientes. Esta escolha não poderá ser alterada para esta chave."
      },
      export: {
        allow: "Permitir exportar as transações",
        withdraw: "Retirar a exportação das transações",
        switch: "Acesso às suas vendas e envios",
        switchHint:
          "Ao ativá-lo, autoriza este assistente de IA a ler as vendas e os envios do seu negócio, para os exportar. Nunca poderá gastar.",
        suspended:
          "Temporariamente indisponível: o acesso dos assistentes de IA às suas vendas e envios voltará a ser oferecido numa próxima versão.",
        allowDialog: {
          title: "Permitir que {{name}} exporte as suas transações?",
          body: "{{name}} poderá ler as vendas e os envios de {{business}} registados nos seus relays e exportá-los como «$t(navigation.destinations.wallet) › $t(walletExport.open)». Os pagamentos recebidos sem venda (diretamente no seu endereço Lightning ou na sua carteira) não estão incluídos. Nunca poderá gastar. Se retirar a autorização, deixará de exportar, mas uma cópia da sua chave feita até lá poderá continuar a ler as suas vendas registadas antes.",
          confirm: "Permitir"
        },
        withdrawDialog: {
          title: "Retirar a exportação a {{name}}?",
          body: "{{name}} deixará de poder exportar as transações de {{business}}. O que já exportou fica na sua aplicação de IA.",
          confirm: "Retirar a exportação"
        },
        allowedTitle: "Exportação permitida",
        allowedBody: "{{name}} pode exportar as suas transações",
        withdrawnTitle: "Exportação retirada",
        withdrawnBody: "{{name}} já não pode exportar as suas transações",
        unreachable:
          "Não foi possível publicar a autorização. Verifique a sua ligação à internet e tente novamente",
        createFailedTitle: "Exportação ainda não permitida",
        createFailed:
          "{{name}} foi criado, mas não foi possível permitir a exportação. Tente novamente a partir da lista de integrações"
      },
      remove: "Retirar o assistente",
      removeDialog: {
        title: "Retirar {{name}}?",
        body: "{{name}} deixará de fazer faturas para {{business}}. As que fez continuam pagáveis até ao vencimento, e na sua carteira.",
        confirm: "Retirar o assistente",
        doneTitle: "Assistente retirado",
        doneBody: "{{name}} deixará de fazer faturas."
      }
    },
    keySheet: {
      title: "Chave de {{name}}",
      keyLabel: "Chave secreta",
      once: "Só é mostrada uma vez: copie-a agora. Não poderá voltar a ser mostrada, nem com a sua passkey. Se a perder, retire a integração e crie outra.",
      unpublished:
        "Ainda não foi possível publicar {{name}} nos seus relays. Será publicada no próximo desbloqueio com a sua passkey, com ligação à internet: até lá, o seu servidor não a encontra.",
      secret:
        "Mantenha-a secreta, só nos servidores dessa loja: nunca numa página web, numa app nem para outra loja. Não permite gastar os seus fundos. Se tiver sido divulgada, retire a integração e crie outra.",
      copy: "Copiar a chave",
      copied: "Chave copiada",
      copyFailed: "Não foi possível copiar a chave. Selecione-a e depois copie-a.",
      done: "Concluir"
    },
    removeDialog: {
      title: "Retirar {{name}}?",
      body: "A sua chave deixará de poder criar pedidos de pagamento para {{business}}. Um pedido já mostrado continua a poder ser pago até terminar, e as suas vendas passadas ficam na carteira.",
      confirm: "Retirar a integração",
      doneTitle: "Integração retirada",
      doneBody: "A chave de {{name}} já não cria pedidos de pagamento."
    },
    pendingDialog: {
      title: "{{name}} tem pagamentos em curso",
      unknownTitle: "Pagamentos de {{name}} não verificados",
      lead: "Aguarde que os pagamentos de {{name}} sejam definitivos antes de a retirar, para que cada uma das suas vendas fique em seu nome.",
      unknownLead:
        "Não foi possível verificar se os pagamentos de {{name}} são definitivos. Aguarde que o sejam antes de a retirar, para que cada uma das suas vendas fique em seu nome.",
      open_one: "{{count}} pedido de pagamento ainda aberto, até às {{time}} no máximo.",
      open_other: "{{count}} pedidos de pagamento ainda abertos, até às {{time}} no máximo.",
      confirming_one:
        "{{count}} pagamento Bitcoin a aguardar confirmação (3 confirmações, cerca de trinta minutos).",
      confirming_other:
        "{{count}} pagamentos Bitcoin a aguardar confirmação (3 confirmações, cerca de trinta minutos).",
      end: "Tente novamente depois.",
      forceNote:
        "Se não puder aguardar (a sua chave foi divulgada, por exemplo), retire-a mesmo assim: os seus pagamentos continuam a chegar à sua carteira, mas os que não viu antes de ser retirada não ficarão em seu nome.",
      force: "Retirar mesmo assim",
      retry: "Tentar novamente",
      close: "Fechar"
    },
    failedTitle: "Ação impossível",
    unreachableTitle: "Sem ligação",
    errors: {
      noAccount: "Desbloqueie este ponto de venda com a sua passkey para gerir as integrações.",
      tooMany: "A sua conta já tem {{max}} integrações. Retire uma para criar outra.",
      tooManyAssistants: "A sua conta já tem {{max}} assistentes. Retire um para criar outro.",
      invalidName: "Introduza o nome da integração.",
      unreachable:
        "Não foi possível publicar a integração. Verifique a sua ligação à internet e tente novamente.",
      removeUnreachable:
        "Não foi possível publicar a remoção. Verifique a sua ligação à internet e tente novamente.",
      removeFailed: "Não foi possível guardar a remoção. Tente novamente.",
      removalUnsaved:
        "A chave desta integração já não cria pedidos de pagamento, mas não foi possível guardar a remoção. Tente novamente: também será guardada da próxima vez que abrir a sua conta.",
      exportNewer:
        "Uma versão mais recente da app alterou este assistente. Atualize a app para o alterar"
    }
  },
  articles: {
    add: "Adicionar um artigo",
    loading: "A carregar os seus artigos…",
    guide: {
      title: "Venda com poucos toques",
      lead: "Crie uma vez as suas bebidas, pratos e sobremesas: aparecem na sua caixa e na dos seus funcionários.",
      create: {
        title: "Crie os seus artigos",
        caption:
          "Um nome, um preço, uma fotografia. Leia um código de barras para preencher a ficha mais depressa.",
        captionNoScan: "Um nome, um preço, uma fotografia."
      },
      tap: {
        title: "Toque-lhes na caixa",
        caption:
          "Passe para «$t(pos.mode.articles)»: cada toque junta o artigo ao cesto. Na app do telemóvel, também pode ler o seu código de barras."
      },
      cash: {
        title: "Cobre o cesto",
        caption: "O total calcula-se sozinho: o seu cliente lê o código QR e paga."
      }
    },
    offline: "Nenhum relé respondeu. Verifique a ligação e volte a este ecrã.",
    newer: "Alguns artigos vêm de uma versão mais recente da app: atualize a app para os ver.",
    openHint: "Abre o artigo para o alterar ou eliminar.",
    saved: {
      title: "Artigo guardado",
      body: "{{name}} está nos seus artigos."
    },
    changed: {
      title: "Artigo alterado",
      body: "{{name}} está atualizado."
    },
    removed: {
      title: "Artigo eliminado",
      body: "{{name}} já não está nos seus artigos."
    },
    removeDialog: {
      title: "Eliminar {{name}}?",
      body: "O artigo desaparece dos seus artigos, em todos os seus dispositivos. Esta ação é definitiva.",
      confirm: "Eliminar o artigo"
    },
    form: {
      title: "Novo artigo",
      editTitle: "Alterar o artigo",
      scan: "Digitalizar",
      addPhoto: "Adicionar uma foto",
      changePhoto: "Alterar a foto",
      preparingPhoto: "A preparar a foto…",
      dropPhoto: "Arraste uma foto para aqui",
      choosePhoto: "ou escolha um ficheiro",
      photoMenu: "Foto do artigo",
      takePhoto: "Tirar uma foto",
      pickPhoto: "Escolher das suas fotos",
      nameLabel: "Nome",
      namePlaceholder: "Nome do artigo",
      priceLabel: "Preço",
      priceInvalid: "Introduza um preço como 4,80",
      descriptionLabel: "Descrição",
      descriptionPlaceholder: "Ingredientes, formato, alergénios",
      addDescription: "Adicionar uma descrição",
      fromOpenFoodFacts: "· do Open Food Facts",
      searching: "· a procurar no Open Food Facts",
      save: "Guardar o artigo",
      saveChanges: "Guardar as alterações",
      remove: "Eliminar o artigo"
    },
    scanner: {
      title: "Digitalizar um código de barras",
      aim: "Aponte para o código de barras",
      lead: "O nome e a foto vêm do Open Food Facts. Só terá de definir o preço.",
      leadNoLookup: "Terá de introduzir o nome, a foto e o preço.",
      manual: "Introduzir sem código de barras",
      denied: "Permita o acesso à câmara para digitalizar um código de barras.",
      // The web app: the browser's own settings (BarcodeScanner.tsx).
      deniedWeb:
        "Permita a câmara para este site nas definições do navegador (o cadeado ao lado do endereço) e depois toque em «Permitir a câmara».",
      allow: "Permitir a câmara",
      settings: "Abrir as definições",
      unavailable: "Não foi possível iniciar a câmara. Este dispositivo pode não ter uma.",
      engineFailed:
        "Não foi possível carregar o leitor de códigos de barras. Verifique a ligação à internet e tente de novo.",
      retry: "Tentar de novo",
      notFoundTitle: "Produto não encontrado",
      notFoundBody: "Este código de barras não é reconhecido. Introduza o nome do artigo.",
      unreachableTitle: "Não foi possível procurar o produto",
      unreachableBody: "Digitalize novamente daqui a pouco ou introduza o nome do artigo."
    },
    errors: {
      title: "Artigo não guardado",
      changeTitle: "Artigo não alterado",
      removeTitle: "Artigo não eliminado",
      noAccount: "Desbloqueie a app com a sua passkey e tente novamente.",
      invalid: "Introduza um nome e um preço.",
      tooMany: "O catálogo está cheio: 500 artigos no máximo.",
      unreachable: "Responderam poucos relés. Verifique a ligação e tente novamente.",
      photoDenied:
        "Permita o acesso às suas fotos nas definições do dispositivo e tente novamente.",
      cameraDenied: "A câmara não abre. Permita-a nas definições do dispositivo e tente novamente.",
      photoUnreadable: "Esta imagem não pode ser usada. Escolha outra."
    }
  },
  activity: {
    limited: "Vista limitada às suas operações",
    followUp: "A acompanhar",
    movements: "Movimentos",
    yourMovements: "Os seus movimentos",
    allMovements: "Todos os movimentos",
    allYourMovements: "Todos os seus movimentos",
    dayNet: "Líquido do dia: {{amount}}",
    clearFilter: "{{name}}, retirar o filtro",
    reading: "A carregar as vendas e as faturas…",
    loadFailed:
      "Não foi possível ler a sua atividade. Verifique a sua ligação à internet e tente novamente.",
    empty: "Ainda sem movimentos.",
    noMatch: "Nenhum movimento corresponde aos filtros.",
    showExpired: "Mostrar as expiradas ({{count}})",
    hideExpired: "Ocultar as expiradas",
    showMore: "Ver mais",
    arrivals_one: "{{count}} movimento novo",
    arrivals_other: "{{count}} movimentos novos",
    expiredHidden: "As faturas expiradas estão ocultas.",
    pendingCredit: {
      awaiting: "ainda não no saldo",
      received: "Pagamento recebido",
      confirmed: "confirmado",
      credit: "Crédito no seu saldo",
      waiting: "pendente",
      fees: "O crédito deste pagamento no seu saldo custa neste momento mais de {{fee}}, o nosso limite. Será feito automaticamente quando esse custo já não o ultrapassar, quando abrir a sua carteira.",
      feesQuoted:
        "O crédito deste pagamento no seu saldo custa neste momento {{price}}, mais do que o nosso limite de {{fee}}. Será feito automaticamente quando esse custo já não o ultrapassar, quando abrir a sua carteira.",
      other:
        "O crédito será feito automaticamente quando abrir a sua carteira. Taxas a descontar: no máximo {{fee}}."
    },
    followUps: {
      open: "Abertas",
      underpaid: "Pagas a menos",
      unconfirmed: "Em confirmação",
      draft: "Rascunhos"
    },
    followUpTitles: {
      open: "Faturas abertas",
      underpaid: "Faturas pagas a menos",
      unconfirmed: "Em confirmação",
      draft: "Rascunhos"
    },
    followUpLabel: "{{name}}: {{count}}, {{total}}",
    rest: "faltam {{amount}}",
    states: {
      open: "Aberta",
      underpaid: "Paga a menos",
      unconfirmed: "Em confirmação",
      draft: "Rascunho",
      expired: "Expirada",
      canceled: "Anulada",
      inProgress: "Em curso",
      failed: "Falhou"
    },
    done: {
      paid: "Paga",
      received: "Recebido",
      sent: "Enviado"
    },
    sources: {
      pos: "Ponto de venda",
      link: "Fatura",
      integration: "Integração",
      receive: "Receção",
      send: "Envio",
      recovered: "Recuperação"
    },
    titles: {
      link: "Fatura",
      recovered: "Fundos recuperados",
      mtpSale: "Venda em {{currency}}",
      // Rows copied from the v2 account (src/features/activity/legacy-history.ts).
      payout: "Levantamento para a sua carteira",
      referral: "Comissão de indicação"
    },
    mtpSale: {
      section: "Venda",
      received: "Recebe",
      transferNowNote: "Transferida sozinha, sem esperar pelas outras vendas",
      transferLaterNote:
        "Numa transferência agrupada com as suas outras vendas, a partir de {{threshold}}",
      follow: "Acompanhar a venda",
      followLabel: "Ordem {{order}}, acompanhar a venda"
    },
    you: "Você",
    stamp: "{{day}} · {{time}}",
    columns: {
      date: "Data",
      label: "Descrição",
      source: "Origem",
      by: "Por",
      state: "Estado",
      amount: "Montante",
      sats: "sats"
    },
    detail: {
      date: "Data",
      takenBy: "Cobrado por",
      madeBy: "Criada por",
      rest: "Falta pagar",
      endsAt: "Pagável até",
      payments: "Pagamentos",
      link: "Ligação de pagamento",
      openLink: "Abrir a fatura",
      copyLink: "Copiar a ligação",
      linkCopied: "Ligação copiada",
      accepted: "Aceite em",
      difference: "Diferença aceite",
      acceptedLate:
        "Aceite tarde demais para ser enviada a {{integration}}: lá a encomenda continua expirada. Verifique que está marcada como paga no respetivo painel de administração."
    },
    accept: {
      action: "Aceitar o montante recebido",
      done: "Montante recebido aceite",
      dialog: {
        title: "Aceitar o montante recebido?",
        body: "A venda ficará paga com {{received}}. A diferença de {{difference}} deixará de ser pedida. É definitivo.",
        bodyOrder:
          "A encomenda ficará paga com {{received}}: a sua loja vê-la-á paga quando o pagamento for confirmado. A diferença de {{difference}} deixará de ser pedida. É definitivo.",
        bodyLate:
          "A encomenda ficará paga com {{received}} e a diferença de {{difference}} deixará de ser pedida. Esta aceitação não é transmitida: para {{integration}} a encomenda continua expirada, marque-a também como paga no respetivo painel de administração. É definitivo.",
        confirm: "Aceitar",
        cancel: "Voltar"
      },
      late: {
        title: "A fatura desta encomenda terminou",
        body: "Para {{integration}} a encomenda continua expirada e a sua aceitação não será vista. Se a aceitar aqui, marque-a também como paga no respetivo painel de administração.",
        closingTitle: "A fatura desta encomenda está a terminar",
        closingBody:
          "É tarde demais para que {{integration}} receba a sua aceitação. Se a aceitar aqui, marque-a também como paga no respetivo painel de administração.",
        lapsedBody:
          "A sua aceitação não chegou à maioria dos seus relays antes do fim da fatura: {{integration}} não a verá. Se a aceitar aqui, marque-a também como paga no respetivo painel de administração.",
        yourShop: "a sua loja"
      },
      errors: {
        network: "Não foi possível guardar a aceitação, tente novamente",
        already: "Esta venda já está aceite",
        ended: "Tarde demais para enviar a aceitação à loja: releia antes de aceitar"
      },
      pending:
        "Aceitação a ser guardada: contará quando a maioria dos seus relays a tiver recebido, antes do fim da fatura.",
      blocked: {
        unread:
          "A app ainda não conseguiu verificar junto da maioria dos seus relays se o montante recebido já foi aceite. «$t(activity.accept.action)» aparecerá aqui quando esta verificação estiver feita. Se demorar, use «$t(relays.test)» em «$t(settings.relays)».",
        unmet:
          "O montante recebido foi aceite quando era de {{received}}, mas hoje a app vê menos, por exemplo após a substituição de uma transação. A aceitação voltará a contar assim que este montante for atingido: não se repete.",
        newer:
          "O montante recebido foi aceite com uma versão mais recente da app: atualize a app para ver esta aceitação."
      }
    }
  },
  table: {
    headerHint: "Ordenar e filtrar",
    sortedBy: "ordenado: {{order}}",
    filtered: "filtrado",
    menu: "{{name}}: ordenar e filtrar",
    sort: "Ordenar",
    orders: {
      text: { ascending: "De A a Z", descending: "De Z a A" },
      number: { ascending: "Do menor para o maior", descending: "Do maior para o menor" },
      date: {
        ascending: "Do mais antigo para o mais recente",
        descending: "Do mais recente para o mais antigo"
      }
    },
    show: "Mostrar",
    selectAll: "Selecionar tudo",
    periods: {
      thisWeek: "Esta semana",
      lastWeek: "Semana passada",
      thisMonth: "Este mês",
      lastMonth: "Mês passado",
      thisYear: "Este ano",
      lastYear: "Ano passado",
      older: "Mais antigos"
    },
    value: "{{label}}, {{count}}",
    emptyValue: "Vazio",
    clearFilters: "Limpar os filtros"
  },
  wallet: {
    balance: "Saldo",
    atLeast: "pelo menos",
    discreet: "Discreto",
    hiddenAmount: "Valor oculto",
    received: "Recebido em 30 dias",
    sent: "Enviado em 30 dias",
    send: "Enviar",
    sell: "Vender",
    sellFrom: "a partir de {{amount}} sats",
    opening: "A abrir a sua carteira…",
    loadFailed:
      "Não foi possível ler a sua carteira. Verifique a sua ligação à internet e tente novamente.",
    retry: "Tentar novamente",
    empty: "Ainda sem movimentos.",
    guide: {
      lead: "Ainda sem movimentos. É assim que chegam:",
      label: "Como chegam os movimentos",
      take: {
        title: "Cobre",
        caption: "Introduza um montante na caixa: o seu cliente lê o código QR e paga."
      },
      receive: {
        title: "Receba",
        caption: "O pagamento chega à sua carteira e aparece aqui, com o nome de quem o cobrou."
      },
      follow: {
        title: "Acompanhe e envie",
        caption:
          "Faturas, ligações de pagamento, transferências: acompanhe tudo aqui. Envie os seus sats quando quiser."
      }
    },
    syncing: "A atualizar…",
    syncingWallet: "A sincronizar a sua carteira…",
    syncLate:
      "Não foi possível atualizar a sua carteira: o saldo e os movimentos apresentados são os deste dispositivo e podem estar incompletos. Verifique a sua ligação à internet.",
    syncLateBlank:
      "Não foi possível sincronizar a sua carteira. Verifique a sua ligação à internet e tente novamente.",
    noRate: "Taxa de câmbio indisponível: alguns montantes apenas em sats.",
    today: "Hoje",
    yesterday: "Ontem",
    meta: "{{time}} · {{kind}}",
    kinds: {
      lightningReceipt: "Receção lightning",
      lightningAddress: "Endereço lightning",
      lightningInvoice: "Fatura lightning",
      bitcoinAddress: "Endereço bitcoin",
      sparkTransfer: "Transferência Spark"
    },
    titles: {
      deposit: "Depósito",
      withdrawal: "Levantamento",
      receipt: "Receção",
      sending: "Envio"
    },
    pills: {
      confirming: "Em confirmação",
      inProgress: "Em curso",
      failed: "Falhou"
    },
    networks: {
      lightning: "Lightning",
      bitcoin: "Bitcoin",
      spark: "Spark"
    },
    detail: {
      date: "Data",
      network: "Rede",
      fee: "Comissões",
      sendFee: "Comissões de envio",
      noFee: "Nenhuma",
      reference: "Referência",
      copy: "Copiar a referência",
      copied: "Referência copiada",
      recipient: "Destinatário",
      copyAddress: "Copiar o endereço",
      addressCopied: "Endereço copiado",
      close: "Fechar"
    },
    sendSheet: {
      intro:
        "Escreva, cole ou digitalize um endereço lightning, uma fatura lightning, um endereço bitcoin ou um endereço Spark.",
      introNoScan:
        "Escreva ou cole um endereço lightning, uma fatura lightning, um endereço bitcoin ou um endereço Spark.",
      close: "Fechar",
      cancel: "Cancelar",
      recipient: "Destinatário",
      recipientPlaceholder: "Endereço ou fatura",
      paste: "Colar",
      scan: "Digitalizar um código QR",
      reading: "A ler o destinatário…",
      kinds: {
        lightningAddress: "Endereço lightning",
        lnurlPay: "Link LNURL",
        bolt11: "Fatura lightning",
        bitcoinAddress: "Endereço bitcoin",
        sparkAddress: "Endereço Spark"
      },
      recipientErrors: {
        unrecognized: "Escreva um endereço ou uma fatura",
        unsupported: "Escreva um endereço ou uma fatura",
        otherNetwork: "Use um endereço da rede principal",
        expired: "Peça uma nova fatura",
        unreachable: "Verifique o endereço lightning",
        lnurlUnreachable: "Tente novamente: o link LNURL não responde",
        failed: "Verifique a ligação à internet",
        pasteEmpty: "Copie primeiro um endereço ou uma fatura",
        pasteFailed: "Cole no campo com o teclado"
      },
      amount: "Montante",
      switchToSats: "Escrever em sats",
      switchToFiat: "Escrever em {{currency}}",
      available: "Disponível: {{amount}}",
      amountErrors: {
        invalid: "Escreva um montante válido",
        belowMin: "Escreva pelo menos {{amount}}",
        aboveMax: "Escreva no máximo {{amount}}",
        aboveBalance: "Escreva no máximo o saldo disponível",
        feesAboveBalance: "Reduza o montante para cobrir as taxas"
      },
      speed: "Velocidade",
      speeds: {
        fast: "Rápida",
        medium: "Normal",
        slow: "Económica"
      },
      fee: "Taxas estimadas",
      feePreparing: "A calcular as taxas…",
      quoteFailed:
        "Não foi possível calcular as taxas. Verifique a ligação à internet e tente novamente.",
      balanceAfter: "Saldo após o envio",
      expiresIn: "Expira em",
      send: "Enviar {{amount}}",
      pay: "Pagar {{amount}}",
      confirming: "Confirme com a sua passkey…",
      sending: "A enviar…",
      sendFailed:
        "O envio não foi concluído. Verifique a ligação à internet e tente novamente: o pagamento só sairá uma vez.",
      recordFailed:
        "Os relés da sua conta não responderam: nada foi enviado. Verifique a sua ligação à internet e tente novamente.",
      noRate: "A cotação do bitcoin está indisponível: escreva o montante em sats.",
      result: {
        completedTitle: "Envio efetuado",
        onchainTitle: "Pagamento enviado",
        onchainBody:
          "A rede Bitcoin ainda tem de confirmar a transação: o seu estado aparece na lista de movimentos.",
        pendingTitle: "Envio em curso",
        pendingBody:
          "O pagamento está a caminho. Esta janela atualiza-se sozinha; fechá-la não cancela o envio.",
        stalledTitle: "Ainda em curso",
        stalledBody: "O seu estado final aparecerá na lista de movimentos.",
        failedTitle: "O envio falhou",
        failedBody: "Verifique o destinatário e o saldo e tente novamente.",
        recipientTo: "para {{recipient}}",
        recipientSent: "para {{recipient}}",
        done: "Concluir"
      },
      scanHint:
        "Aponte para o código QR de uma fatura lightning, de um endereço lightning ou de um endereço bitcoin.",
      scanType: "Escrever",
      scanDenied: "Permita o acesso à câmara para digitalizar um código QR.",
      scanAllow: "Permitir a câmara",
      scanSettings: "Abrir as definições"
    }
  },
  sell: {
    title: "Vender",
    back: "Voltar",
    retry: "Tentar novamente",
    busy: {
      starting: "A ler a sua conta Mt Pelerin…",
      reading: "A ler a sua conta Mt Pelerin…",
      signingIn: "A ligar à Mt Pelerin…",
      sendingCode: "A enviar o código…",
      checkingCode: "A verificar o código…",
      savingProfile: "A guardar…",
      preparingInvoice: "A preparar o pagamento de 1 sat…",
      confirming: "A confirmar…",
      paying: "A pagar…",
      addingAccount: "A adicionar a conta…",
      savingAccount: "A guardar a conta…",
      loggingOut: "A terminar sessão…"
    },
    failures: {
      offline:
        "O serviço de venda não responde. Verifique a sua ligação à internet e tente novamente",
      server:
        "O serviço de venda enviou uma resposta ilegível. Tente novamente dentro de instantes",
      refused: "O pedido foi recusado",
      codeRefused: "Este código não é o correto",
      codeExpired: "Este código expirou: peça um novo",
      malformed: "A fatura da venda não é a esperada: nada foi pago",
      otherNetwork: "A fatura da venda não é a esperada: nada foi pago",
      otherAmount: "A fatura da venda não é a esperada: nada foi pago",
      expired: "A fatura da venda expirou: nada foi pago",
      payment: "O pagamento não saiu. Tente novamente",
      record:
        "Os relés da sua conta não responderam: nada foi vendido. Verifique a sua ligação à internet e tente novamente",
      ibanTaken: "Este IBAN já está registado noutra conta Mt Pelerin",
      accountKnown: "Esta conta já está entre as suas contas bancárias, nesta moeda",
      accountUnchanged:
        "A Mt Pelerin não alterou esta conta: os seus dados continuam a ser os apresentados. Contacte a Mt Pelerin para os alterar"
    },
    sessionLost: "A sua sessão Mt Pelerin expirou: volte a ligar-se",
    intro: {
      title: "Vender com a Mt Pelerin",
      lead: "A Mt Pelerin, intermediário financeiro suíço, compra os seus sats e transfere os francos para a sua conta bancária.",
      connectLead: "A sua conta Mt Pelerin abre-se com a chave da sua conta sattle.me.",
      connect: "Ligar-se à Mt Pelerin",
      phoneLead: "A sua conta Mt Pelerin abre-se com o seu número.",
      phone: "Número de telefone",
      phoneHint: "A Mt Pelerin envia-lhe um código por SMS",
      sendCode: "Receber o código",
      dialCountry: "País do número",
      dialCodeOf: "País do número: {{country}}, {{code}}"
    },
    code: {
      title: "Introduza o seu código",
      lead: "A Mt Pelerin acabou de lho enviar por SMS para o {{phone}}.",
      label: "Código de 6 dígitos",
      notReceived: "Não recebeu?",
      resend: "Reenviar o código",
      submit: "Validar"
    },
    profile: {
      title: "O seu e-mail",
      lead: "A Mt Pelerin precisa dele para abrir a sua conta. Envia-lhe para lá o recibo de cada venda.",
      email: "E-mail",
      emailInvalid: "Introduza um e-mail válido",
      phone: "Número de telefone",
      phoneInvalid: "Introduza um número válido, com o indicativo",
      phoneCaption: "O número da sua conta Mt Pelerin",
      submit: "Continuar"
    },
    validation: {
      title: "Verificar a sua carteira",
      lead: "A sua carteira tem de ser verificada. Pague 1 sat ({{value}}) para efetuar esta verificação.",
      toPay: "A pagar",
      fee: "Taxas Lightning",
      pay: "Pagar 1 sat",
      unaffordable: "O seu saldo não cobre 1 sat e as taxas. Volte após o seu próximo recebimento",
      leadNoRate:
        "A sua carteira tem de ser verificada. Pague 1 sat para efetuar esta verificação.",
      lessThan: "menos de {{amount}}",
      about: "cerca de {{amount}}"
    },
    pending: {
      badge: "Em curso",
      title: "Verificação da sua carteira",
      leadNoBank: "Pode continuar: a sua conta bancária não depende desta verificação.",
      leadBank:
        "Pode sair deste ecrã: poderá vender assim que a sua carteira estiver verificada (normalmente menos de 15 minutos).",
      paid: "1 sat pago",
      toBank: "Adicionar a sua conta bancária"
    },
    verified: {
      title: "Endereço verificado",
      lead: "O seu sat chegou. As suas vendas partirão de {{address}}.",
      account: "Conta Mt Pelerin",
      address: "Endereço Lightning",
      addressVerified: "Verificado",
      bank: "Conta bancária",
      toBank: "Adicionar a sua conta bancária",
      continue: "Continuar",
      bankTodo: "Por preencher"
    },
    bank: {
      title: "Para onde transferir os seus {{currency}}",
      lead: "A conta para onde as suas vendas são transferidas. É sua ou da sua empresa.",
      none: "Nenhuma conta bancária registada por agora",
      add: "Adicionar uma conta"
    },
    accountForm: {
      title: "Adicionar uma conta",
      submit: "Adicionar esta conta"
    },
    accountEdit: {
      title: "Editar a conta",
      lead: "Para outro IBAN ou outra moeda, adicione uma conta.",
      submit: "Guardar"
    },
    payoutCurrency: {
      label: "Moeda das transferências",
      swift:
        "Transferência internacional (SWIFT): um dia útil ou mais. Os bancos intermediários podem cobrar taxas, de alguns dólares a várias dezenas"
    },
    accounts: {
      title: "Contas bancárias",
      lead: "As suas vendas só são transferidas para estas contas.",
      add: "Adicionar uma conta",
      fromSettings: "Definições",
      pending: "Pendente",
      editHint: "Editar o nome e a morada do titular",
      // Accounts Mt Pelerin listed that the app cannot read (guards.ts): never offered.
      unreadable_one: "{{count}} outra conta não pôde ser lida: não é proposta",
      unreadable_other: "{{count}} outras contas não puderam ser lidas: não são propostas",
      // Mt Pelerin lacks a line of its holder's address: offered all the same.
      incompleteAddress: "Morada incompleta"
    },
    addressTaken: {
      title: "Endereço já registado",
      body: "O seu endereço Lightning está registado noutra conta Mt Pelerin. Ligue-se com o número dessa conta.",
      switch: "Mudar de conta"
    },
    unavailable: "A venda de sats por Lightning não está disponível por agora",
    sale: {
      amount: "Montante",
      available: "Disponível: {{amount}}",
      change: "Mudar",
      fee: "Taxas de venda",
      receive: "Recebe cerca de",
      estimating: "A calcular…",
      estimateFailed: "Indisponível",
      pending: "Pendente",
      pendingBalance: "Saldo: {{amount}}",
      pendingSale: "Esta venda: {{amount}}",
      pendingGauge: "{{balance}} pendentes, mais {{sale}} desta venda, de {{threshold}}",
      pendingGaugeHeld: "{{balance}} pendentes, de {{threshold}}",
      limitsTitle: "Sem identificação",
      limitLeft: "Restam {{left}} de {{limit}}",
      seeLimits: "Ver os meus limites",
      settings: "Definições da venda",
      quote: "Ver o orçamento",
      aboveMax: "Introduza no máximo {{amount}}",
      aboveBalance: "Introduza no máximo o saldo disponível",
      tooSmall: "Tem de receber pelo menos {{amount}}: aumente o montante",
      transferFee: "Taxa de transferência",
      transfer: "Transferência",
      transferNow: "Imediata",
      transferNowNote: "{{fee}} de taxa de transferência abaixo de {{threshold}}, grátis acima",
      transferLater: "Diferida",
      transferLaterNote:
        "Sem taxa de transferência: numa transferência agrupada com as suas outras vendas, quando atingem {{threshold}}",
      equivalentOf: "o equivalente a {{amount}}",
      chooseAccount: "Para que conta?",
      addAccount: "Adicionar uma conta"
    },
    quote: {
      title: "Orçamento",
      heading: "Recebe {{amount}}",
      lead: "Os seus sats são vendidos e os francos transferidos para a sua conta bancária.",
      selling: "Vende",
      rate: "Cotação",
      ratePrice: "1 BTC = {{price}}",
      fee: "Taxas de venda",
      lightningFee: "Taxas Lightning",
      account: "Para a conta",
      lockedUntil: "Cotação garantida até às {{time}}",
      expired: "A cotação expirou: nada foi vendido",
      refresh: "Atualizar o orçamento",
      sell: "Vender {{amount}}",
      otherOrder: "A cotação recebida não é a pedida: nada foi pago",
      nothingWired: "Esta venda não transferiria nada para a sua conta: nada foi pago",
      unaffordable: "O seu saldo não cobre esta venda e as suas taxas"
    },
    order: {
      heading: "{{amount}} para o seu banco",
      lead: "Venda de {{sats}}, {{date}}. Pode sair deste ecrã: a venda segue o seu curso.",
      leadDated: "Venda de {{date}}. Pode sair deste ecrã: a venda segue o seu curso.",
      received: "Sats recebidos",
      receivedTodo: "Receção dos sats",
      receivedNow: "A receber os sats",
      receivedFailed: "Sats não recebidos",
      transferred: "Transferência para a sua conta",
      held: "Esta venda está a ser verificada: consulte os seus e-mails da Mt Pelerin",
      delayed: "A transferência foi adiada: aguarde-a durante a semana",
      refunded: "Os seus sats estão a ser-lhe devolvidos",
      failed: "Esta venda foi recusada",
      expired: "O orçamento expirou: nada foi vendido",
      reference: "Número da ordem",
      outcomes: {
        awaitingPayment: "A aguardar pagamento",
        expired: "Expirada",
        inProgress: "Em curso",
        delayed: "Adiada",
        held: "Em verificação",
        sent: "Transferida",
        refunded: "Reembolsada",
        failed: "Recusada"
      },
      title: "Venda",
      soldTitle: "Vendido com sucesso",
      soldLead:
        "Os seus {{sats}} estão vendidos: {{amount}} vão ser transferidos para a sua conta.",
      withOthers:
        "Numa transferência agrupada com as suas outras vendas, quando atingem {{threshold}}",
      next: "E agora",
      processing: "Processamento da venda",
      processingNow: "Em processamento",
      processed: "Convertidos em {{currency}}",
      delayChf: "Em 1 dia útil (transferência na Suíça, de segunda a sexta-feira)",
      delayEur: "Em 1 a 2 dias úteis (transferência SEPA)",
      delaySwift: "Um dia útil ou mais (transferência internacional SWIFT)",
      close: "Fechar",
      seeSales: "Ver as suas vendas"
    },
    history: {
      title: "As suas vendas",
      empty: "Nenhuma venda por agora",
      unreadable: "Demasiadas vendas para as listar aqui"
    },
    split: {
      quoting: "A fixar a taxa da sua venda…",
      receive: "Recebe",
      title: "Repartição",
      lead: "Desde {{date}}, a sua carteira recebeu {{received}}.",
      kept: "Mantido em bitcoin ({{percent}})",
      share: "Parte a vender ({{percent}})",
      sold: "Vendido agora: {{amount}}",
      lightningFee: "Taxas Lightning, adicionais",
      deferred:
        "As vendas diferidas são agrupadas e serão transferidas de uma só vez, assim que atingirem {{threshold}}.",
      balance: "O seu saldo só permite vender {{amount}}. O resto da parte não será vendido.",
      limit:
        "Sem verificação de identidade, as suas vendas estão limitadas a {{limit}} por mês. Venda {{amount}} agora (o resto da parte não será vendido), ou identifique-se primeiro para vender a parte toda.",
      sell: "Vender {{amount}}",
      identify: "Identificar-me na Mt Pelerin",
      identifyHeading: "Identifique-se para vender a sua parte",
      identifyLead:
        "A sua parte a vender é de {{due}}. Sem verificação de identidade, as suas vendas estão limitadas a {{limit}} por mês, e esse limite foi atingido.",
      identifyHow:
        "A sua identidade é verificada no site da Mt Pelerin, com o número de telefone da sua conta. Depois de verificada a identidade, a parte toda é-lhe proposta aqui.",
      soldHeading: "Vendido com sucesso",
      soldLead:
        "Os seus {{sats}} foram vendidos por {{amount}}, que se juntam às suas vendas a aguardar transferência.",
      held: "A aguardar transferência",
      payout: {
        title: "Próxima transferência",
        threshold: "a partir de {{threshold}}",
        held: "Já em espera",
        sale: "Esta venda",
        left: "Faltam <strong>{{left}}</strong> de vendas; depois, tudo será transferido para a sua conta bancária.",
        reached: "O limiar foi atingido: tudo será transferido para a sua conta bancária."
      },
      notice: "Repartição: {{amount}} a vender, cerca de {{fiat}}.",
      noticeSell: "Vender",
      noticeIdentify: "Repartição: {{due}} a vender, depois de verificada a sua identidade.",
      noticeSee: "Ver",
      setup:
        "A sua repartição prevê {{percent}} em {{currency}}. Configure a venda para vender essa parte.",
      setupOpen: "Configurar a venda"
    },
    limits: {
      title: "Limites de venda",
      lead: "Sem verificação de identidade, pode vender no máximo:",
      perSale: "Por venda",
      month: "Últimos {{days}} dias",
      year: "Este ano",
      leftUntil: "Restam {{amount}} até {{date}}",
      leftRolling: "Restam {{amount}}: uma venda conta durante {{days}} dias",
      unknown: "Não calculado: uma venda numa moeda diferente do franco",
      feesTitle: "Taxas incluídas",
      identified: "A sua identidade está verificada na Mt Pelerin.",
      noLimit: "Sem limite",
      perMonth: "Por mês",
      perYear: "Por ano",
      identifyHow:
        "Para vender mais, faça verificar a sua identidade no site da Mt Pelerin, com o número de telefone da sua conta.",
      fees: "Conta o montante vendido, antes da dedução das taxas. Calculado a partir das suas vendas."
    },
    settings: {
      title: "Definições da venda",
      account: "Conta Mt Pelerin",
      byKey: "Conta Mt Pelerin · ligada com a chave da sua conta",
      lightning: "Endereço Lightning",
      verified: "verificada",
      pendingValidation: "pendente",
      banks: "Contas bancárias",
      limits: "Limites de venda",
      history: "As suas vendas",
      logout: "Terminar sessão na Mt Pelerin",
      logoutTitle: "Terminar sessão na Mt Pelerin?",
      logoutBody:
        "Em todos os seus dispositivos. As suas contas e vendas ficam na Mt Pelerin: voltará a encontrá-las ao ligar-se.",
      logoutConfirm: "Terminar sessão",
      cancel: "Cancelar",
      banksCount_one: "{{count}} conta",
      banksCount_other: "{{count}} contas",
      left: "Restam {{amount}}",
      perSale: "{{amount}} por venda",
      salesCount_one: "{{count}} este ano",
      salesCount_other: "{{count}} este ano"
    },
    close: "Fechar",
    poweredBy: "Powered by"
  },
  walletExport: {
    open: "Exportar",
    title: "Exportar as transações",
    close: "Fechar",
    lead: "As transações concluídas do período: vendas pagas, receções e envios.",
    period: "Período",
    periods: {
      thisMonth: "Este mês",
      lastMonth: "Mês passado",
      thisYear: "Este ano",
      lastYear: "Ano passado",
      custom: "Datas específicas"
    },
    days: "{{first}} – {{last}}",
    from: "De",
    to: "A",
    format: "Tipo de exportação",
    formats: {
      pdf: "Simples (PDF)",
      csv: "Detalhada (CSV)"
    },
    amounts: "Montantes",
    units: {
      fiat: "Em {{currency}}",
      btc: "Em BTC"
    },
    columnsTitle: "Colunas",
    columnsTicked: "{{ticked}} de {{total}}",
    columns: {
      dateAndTime: "Data e hora",
      label: "Descrição",
      source: "Origem",
      by: "Por",
      network: "Tipo de pagamento",
      reference: "Referência",
      bitcoinAmount: "Montante em BTC",
      bitcoinFees: "Comissões em BTC",
      fiatAmount: "Montante em {{currency}}",
      fiatFees: "Comissões em {{currency}}",
      originalAmount: "Montante introduzido",
      originalCurrency: "Moeda introduzida",
      bitcoinPrice: "Preço do bitcoin em {{currency}}",
      remark: "Observação"
    },
    remarks: {
      accepted: "Diferença de {{fiat}} / {{btc}}, aceite pelo proprietário em {{date}} às {{time}}",
      acceptedSats: "Diferença de {{btc}}, aceite pelo proprietário em {{date}} às {{time}}"
    },
    submit: "Exportar",
    errors: {
      unread:
        "Não foi possível ler as suas vendas. Verifique a sua ligação à internet e tente novamente.",
      receiving:
        "Um pagamento em bitcoin visto por um ponto de venda ainda não chegou à sua carteira. Tente novamente dentro de alguns minutos.",
      failed: "Não foi possível fazer a exportação. Tente novamente."
    },
    pdf: {
      title: "Relatório de transações",
      period: "De {{first}} a {{last}}",
      made: "Emitido a {{date}}",
      summary: "Resumo",
      count: "Número de transações",
      countOf: {
        pos: "das quais ponto de venda",
        link: "das quais faturas",
        integration: "das quais integrações",
        receive: "das quais receções",
        send: "das quais envios"
      },
      received: "Total recebido",
      sent: "Total enviado",
      fees: "Comissões de envio",
      lines: "Detalhe das transações",
      none: "Nenhuma transação concluída neste período.",
      amount: "Montante ({{unit}})",
      amountMixed: "Montante",
      valuesNote:
        "Uma venda conta pelo montante introduzido, na sua moeda; qualquer outra transação, pelo valor dos seus bitcoins ao preço registado no seu pagamento (fonte: CoinGecko). Uma transação sem preço registado conta em BTC.",
      // Rows copied from a v2 account among them (src/features/activity/legacy-history.ts).
      valuesNoteImported:
        "Uma venda conta pelo montante introduzido, na sua moeda; qualquer outra transação, pelo valor dos seus bitcoins à cotação registada no seu pagamento (fonte: CoinGecko; para o histórico recuperado do seu anterior serviço de pagamento, a cotação que este registou). Uma transação sem cotação registada conta em BTC."
    }
  },
  settings: {
    recovery: {
      group: "Segurança",
      title: "Frase de recuperação",
      description: "As 12 palavras que restauram a sua carteira sem passkey, para anotar em papel.",
      open: "Mostrar",
      lead: "Estas 12 palavras são uma cópia da sua carteira: com elas, qualquer pessoa pode gastar todos os seus fundos, sem a sua passkey.",
      rulesTitle: "Antes de as mostrar",
      rules:
        "Anote-as em papel, por ordem, e guarde-as num local seguro. Não as fotografe nem as guarde em nenhum ficheiro ou mensagem. Não as dê a ninguém: a sattle.me nunca lhas pedirá.",
      reveal: "Mostrar a frase",
      hide: "Ocultar",
      shownNote:
        "Só você deve ver estas palavras. Desaparecem assim que sair deste ecrã ou da aplicação.",
      captureOpen:
        "As capturas de ecrã não são bloqueadas aqui: não faça nenhuma e não grave o ecrã.",
      noPhrase: "Esta carteira não tem frase de recuperação para mostrar.",
      wordLabel: "Palavra {{index}}: {{word}}"
    },
    title: "Definições",
    business: "Comércio",
    businessDescription: "Nome e logótipo vistos pelo cliente, nos recibos e nas faturas.",
    businessName: "Nome do comércio",
    logo: "Logótipo do comércio",
    changeLogo: "Alterar o logótipo do comércio",
    logoChange: "Alterar o logótipo",
    merchant: {
      section: "Perfil de comerciante",
      description:
        "Receba pagamentos em bitcoin com esta app: ponto de venda, faturas, funcionários. A sua carteira principal é criada neste passo.",
      create: "Criar o meu perfil de comerciante",
      failedTitle: "Ponto de venda não preparado",
      doneTitle: "Perfil de comerciante criado",
      doneBody: "Já pode receber pagamentos"
    },
    groups: {
      charging: "Cobranças",
      payouts: "Transferências",
      display: "Visualização",
      network: "Rede",
      // "Account" of "Settings" (the session, the deletion).
      account: "Conta"
    },
    // The phone's cards and the computer's tabs of "Settings".
    rubrics: {
      chargingBoth: "Lightning e onchain",
      methods: "Métodos de pagamento",
      chargingDescription:
        "O que o ponto de venda, os seus funcionários e as suas integrações propõem ao cliente.",
      lightning: "Lightning",
      lightningCaption: "Sempre proposto, até {{limit}} por fatura; {{beyond}}",
      lightningCaptionUnknown:
        "Sempre proposto, até ao limite do seu endereço Lightning; {{beyond}}",
      lightningLimitFiat: "{{btc}} (cerca de {{fiat}})",
      lightningBeyond: {
        onchain: "acima disso, só é mostrado o endereço onchain",
        refused:
          "acima disso, o ponto de venda recusa a venda enquanto os pagamentos onchain estiverem desativados"
      },
      splitLabel: "Repartição: {{bitcoin}} em bitcoin, {{fiat}} em {{currency}}",
      editRelays: "Alterar os relays"
    },
    unlock: {
      title: "Pedir a biometria para desbloquear a app",
      captionOn: "Sempre que a app abre",
      captionOff: "A app abre sem biometria",
      captionUnavailable: "Nem biometria nem código neste dispositivo",
      section: "Bloqueio da app",
      description:
        "A biometria deste dispositivo, ou o seu código, é pedida sempre que a app abre e sempre que regressa a ela, além do modo caixa.",
      saveFailed: "Esta escolha não foi guardada neste dispositivo. Tente novamente."
    },
    locked: {
      title: "Modo caixa",
      titleCard: "App bloqueada",
      body: "Desbloqueie a app para alterar as suas definições.",
      unlock: "Desbloquear"
    },
    displayCurrency: "Moeda de referência",
    displayCurrencyCardDescription: "Montantes dos seus cartões mostrados na app.",
    displayCurrencyDescription: "Montantes introduzidos no ponto de venda e mostrados na app.",
    amountUnit: {
      title: "Moeda mostrada primeiro",
      description:
        "Em «Carteira» e no histórico dos seus cartões, neste dispositivo. O outro montante é mostrado por baixo.",
      sats: "sats",
      savedTitle: "Moeda mostrada primeiro guardada",
      saveFailed: "Esta escolha não foi guardada neste dispositivo. Tente novamente."
    },
    theme: {
      title: "Tema",
      description:
        "Neste dispositivo. «Automático» segue a definição clara ou escura do dispositivo.",
      light: "Claro",
      dark: "Escuro",
      system: "Automático",
      // A rubric's card on a phone ("Display"): the theme chosen.
      summaryLight: "Tema claro",
      summaryDark: "Tema escuro",
      summarySystem: "Tema automático",
      savedTitle: "Tema guardado",
      saveFailed: "Esta escolha não foi guardada neste dispositivo. Tente novamente."
    },
    onchain: "Pagamentos onchain",
    onchainDescription:
      "Confirmação em 10 a 60 minutos. Aplica-se ao ponto de venda, o seu e o dos seus funcionários. As suas faturas e integrações propõem sempre o pagamento onchain.",
    split: "Repartição",
    splitDescription:
      "Comissão da sattle.me: {{bitcoin}} sobre tudo o que recebe. Parte convertida: {{fiat}} de comissões de venda da Mt Pelerin adicionais, vendida quando a aceita em «Carteira».",
    splitDescriptionFree:
      "Comissão da sattle.me: {{free}} em vez de {{bitcoin}} até {{date}}, sobre tudo o que recebe. Parte convertida: {{fiat}} de comissões de venda da Mt Pelerin adicionais, vendida quando a aceita em «Carteira».",
    splitShort: "{{percent}} em {{currency}}",
    allBitcoin: "Tudo em bitcoin",
    bankAccount: "Conta bancária",
    noBankAccount: "Nenhuma",
    bankAtMtPelerin: "Na Mt Pelerin",
    relays: "Relays Nostr",
    relaysCount_one: "{{count}} relay",
    relaysCount_other: "{{count}} relays",
    relaysDescription:
      "Servidores Nostr aos quais a app se liga, em todos os dispositivos do comércio.",
    // "Bitcoin node" of "Network".
    node: {
      title: "Nó Bitcoin",
      description:
        "Onde os seus dispositivos e os dos seus funcionários acompanham os pagamentos onchain, e onde a sua carteira lê a blockchain.",
      mempoolTitle: "mempool.space",
      mempoolDescription: "Público, nada a instalar. Vê os endereços das suas vendas onchain.",
      ownTitle: "O meu nó",
      ownDescription: "O seu próprio mempool: mais ninguém vê os seus endereços.",
      mempoolCaption: "Predefinido",
      urlLabel: "Endereço do seu mempool",
      urlHint: "O endereço da sua página no navegador, por exemplo no seu Umbrel ou Start9",
      errors: {
        empty: "Introduza o endereço do seu mempool",
        incomplete: "Endereço incompleto, por exemplo https://mempool.example.ch",
        insecure: "Só é aceite um endereço https://: com http://, a ligação não é cifrada",
        device: "Este endereço é este dispositivo: introduza o do seu nó"
      },
      legacyHttpTitle: "Endereço http:// já não utilizado",
      legacyHttpBody:
        "Para sua segurança, a app passou a ligar-se ao seu nó apenas por https://: com http://, alguém ligado a este Wi-Fi poderia fazer-se passar por ele e fazer parecer paga uma venda que não o está. Enquanto não introduzir um endereço https://, os seus dispositivos agem como se o nó não respondesse.",
      test: "Testar a ligação",
      results: {
        ok: {
          title: "Nó acessível e atualizado",
          body: "Último bloco: {{height}}"
        },
        unreachable: {
          title: "Nó inacessível",
          body: "Verifique o endereço e se este dispositivo está na mesma rede que o seu nó."
        },
        notMempool: {
          title: "Nenhum mempool neste endereço",
          body: "Algo responde, mas não a API do mempool. Verifique o endereço e a porta."
        },
        noAddressIndex: {
          title: "Endereços ilegíveis",
          body: "O seu mempool ainda não lê os endereços: o seu índice (electrs ou Fulcrum) falta ou ainda não está construído."
        },
        behind: {
          title: "Nó atrasado",
          body: "O seu último bloco tem {{hours}} h: ainda não está sincronizado."
        }
      },
      fallbackTitle: "Quando não responde",
      fallbackMempool: "Passar pelo mempool.space",
      fallbackMempoolDescription:
        "As suas vendas onchain continuam; o mempool.space vê então os seus endereços.",
      fallbackNone: "Só Lightning",
      fallbackNoneDescription:
        "Nada vai para o mempool.space; entretanto, o Ponto de Venda deixa de propor Bitcoin.",
      payersTitle: "Páginas de pagamento dos seus clientes",
      payersLabel: "Transmitir o meu nó às páginas dos pagadores",
      payersCaption:
        "O navegador dos seus clientes também acompanha o pagamento no seu nó, com a mesma alternativa. O seu endereço passa a constar das suas ligações de pagamento, e recebe o endereço IP dos seus clientes.",
      payersHttpsOnly:
        "Só para um nó acessível pela Internet, em https:// com um nome de domínio: o navegador dos seus clientes não chega à sua rede local.",
      publicNotePayers:
        "A hora de envio de um pagamento, que fixa a sua cotação, fica no mempool.space: a mesma para si e para os seus clientes.",
      publicNote:
        "A página de pagamento dos seus clientes e a hora de envio de um pagamento, que fixa a sua cotação, ficam no mempool.space: a mesma para si e para os seus clientes.",
      savedTitle: "Nó Bitcoin guardado",
      savedOwn: "Os seus dispositivos leem a blockchain no seu nó",
      savedMempool: "Os seus dispositivos leem a blockchain no mempool.space",
      confirmTitle: "Guardar este nó?",
      confirmBody:
        "Não responde corretamente a partir deste dispositivo. A partir da rede do seu comércio, talvez responda.",
      confirmAction: "Guardar mesmo assim"
    },
    // "Look up scanned products" of "Network".
    productLookup: {
      section: "Catálogo",
      title: "Pesquisar os produtos digitalizados",
      caption:
        "No Open Food Facts, que recebe o código de barras e o endereço IP do dispositivo. Desativado: introduz o nome e a foto.",
      savedTitle: "Pesquisa de produtos guardada",
      savedOn: "O nome e a foto de um produto digitalizado vêm do Open Food Facts",
      savedOff: "O nome e a foto de um produto digitalizado são introduzidos à mão"
    },
    save: "Guardar",
    close: "Fechar",
    logout: "Terminar sessão",
    logoutTitle: "Terminar sessão neste dispositivo?",
    logoutBody:
      "Os seus dados e os seus fundos continuam na sua conta: a sua passkey volta a ligá-lo. Só as escolhas feitas neste dispositivo voltam ao valor predefinido: a barra de navegação, «$t(wallet.discreet)» na $t(navigation.destinations.wallet), «$t(settings.amountUnit.title)», «$t(settings.theme.title)», «$t(pos.mode.amount)» ou «$t(pos.mode.articles)» no $t(pos.title) e a biometria para desbloquear a app.",
    logoutBodyWeb:
      "Os seus dados e os seus fundos continuam na sua conta: a sua passkey volta a ligá-lo. Só as escolhas feitas neste dispositivo voltam ao valor predefinido: a barra de navegação, «$t(wallet.discreet)» na $t(navigation.destinations.wallet), «$t(settings.amountUnit.title)», «$t(settings.theme.title)» e «$t(pos.mode.amount)» ou «$t(pos.mode.articles)» no $t(pos.title).",
    logoutBodyCard:
      "Os seus dados e os seus fundos continuam na sua conta: a sua passkey volta a ligá-lo. Só as escolhas «$t(settings.amountUnit.title)» e «$t(settings.theme.title)» feitas neste dispositivo voltam ao valor predefinido.",
    logoutConfirm: "Terminar sessão",
    support: {
      group: "Ajuda",
      section: "Apoio",
      description:
        "Uma pergunta, um problema: escreva-nos. O registo da app ajuda-nos a perceber o que aconteceu.",
      contact: "Contactar o apoio",
      attach: "Anexar o registo da app",
      attachCaption: "Eventos técnicos, sem montantes nem endereços",
      reports: "Enviar relatórios de falhas",
      reportsKinds: "Falhas e lentidão",
      reportsCaption: "Nenhum montante nem endereço de pagamento",
      reportsSaveFailed: "Esta escolha não foi guardada neste dispositivo. Tente novamente.",
      subject: "Apoio sattle.me",
      body: "Olá,\n\nA sua pergunta ou o seu problema:\n\n\n",
      downloaded: "O registo da app acabou de ser transferido ({{file}}): anexe-o a esta mensagem.",
      attachDownloaded: "Anexe o registo transferido ({{file}})",
      notAttached: "Registo não anexado ao email",
      deposited: "O registo da app é enviado cifrado ao suporte, com a referência abaixo.",
      notDeposited: "Registo não enviado",
      noMailTitle: "Nenhuma app de Mail neste dispositivo",
      addressCopied: "Endereço do apoio copiado: {{email}}",
      writeTo: "Escreva-nos para {{email}}",
      shareTitle: "Registo da app",
      shareFailed: "Registo não partilhado",
      failedTitle: "Email não aberto"
    },
    delete: {
      section: "Eliminar a conta",
      description:
        "Apaga a conta dos relays Nostr e deste dispositivo, e abdica do seu endereço lightning. A carteira tem de estar vazia.",
      button: "Eliminar a conta",
      employeesTitle_one: "Tem {{count}} funcionário",
      employeesTitle_other: "Tem {{count}} funcionários",
      employeesBody_one:
        "Será retirado do negócio: o seu dispositivo deixará de cobrar para ele e esquecê-lo-á na próxima ligação.",
      employeesBody_other:
        "Serão retirados do negócio: os seus dispositivos deixarão de cobrar para ele e esquecê-lo-ão na próxima ligação.",
      integrationsTitle_one: "Tem {{count}} integração",
      integrationsTitle_other: "Tem {{count}} integrações",
      integrationsBody_one:
        "Será retirada: o seu servidor deixará de poder criar faturas para o negócio.",
      integrationsBody_other:
        "Serão retiradas: os seus servidores deixarão de poder criar faturas para o negócio.",
      assistantsTitle_one: "Tem {{count}} assistente de IA",
      assistantsTitle_other: "Tem {{count}} assistentes de IA",
      assistantsBody_one: "Será retirado: deixará de poder fazer faturas para o negócio.",
      assistantsBody_other: "Serão retirados: deixarão de poder fazer faturas para o negócio.",
      removeAndContinue: "Retirar e continuar",
      confirmTitle: "Eliminar a conta?",
      confirmBody:
        "As definições, a equipa, os artigos e as vendas registadas são apagados dos relays Nostr e deste dispositivo, e abdica-se do endereço lightning. É definitivo. A carteira, vazia, continua acessível com a sua passkey.",
      confirm: "Eliminar definitivamente",
      progressTitle: "A eliminar a conta",
      progressHint: "Mantenha a app aberta até ao fim.",
      steps: {
        wallet: "A verificar a carteira",
        team: "A retirar a equipa",
        reading: "A procurar dados nos relays ({{done}}/{{total}})",
        deleting: "A apagar nos relays ({{done}}/{{total}})",
        checking: "A verificar o apagamento ({{done}}/{{total}})",
        device: "A apagar este dispositivo"
      },
      deleted: "A sua conta foi eliminada",
      deletedElsewhere:
        "A conta de {{business}} foi eliminada a partir de outro dispositivo: este dispositivo esqueceu-a.",
      alreadyRemoved: "O endereço lightning e a equipa já foram retirados.",
      card: {
        description:
          "Apaga a conta dos relays Nostr e deste dispositivo, e abandona os endereços Lightning dos seus cartões. Os cartões têm de estar vazios.",
        confirmBody:
          "As definições, os cartões e os seus pagamentos registados são apagados dos relays Nostr e deste dispositivo, e os endereços Lightning dos cartões são abandonados. É definitivo.",
        stepCards: "Verificação dos cartões",
        alreadyRemoved: "Os endereços Lightning dos cartões já foram abandonados.",
        cardWallets:
          "A carteira de um dos seus cartões, ou de um cartão eliminado, não está vazia, ou ainda estão a chegar sats. Envie o seu saldo para outro lado a partir de « Cartões » e tente novamente.",
        walletFailed:
          "Não foi possível verificar a carteira de um cartão. Verifique a sua ligação à internet e tente novamente.",
        begun:
          "A eliminação não terminou: os endereços Lightning dos cartões já foram abandonados, nada foi apagado neste dispositivo. Verifique a sua ligação à internet e tente novamente."
      },
      failedTitle: "Conta não eliminada",
      errors: {
        balance:
          "A carteira ainda contém {{sats}} sats. Envie-os para outro lado e tente novamente.",
        pendingPayments:
          "Está em curso um pagamento da carteira. Tente novamente quando estiver concluído.",
        unclaimedDeposits:
          "Um depósito onchain ainda não foi creditado na carteira. Tente novamente quando estiver.",
        cardWallets:
          "A carteira de um dos seus cartões, ou de um cartão eliminado, não está vazia, ou ainda lhe estão a chegar sats. Levante o seu saldo para o seu saldo principal em « Cartões » e tente novamente.",
        newerApp:
          "Uma versão mais recente da aplicação registou um cartão desta conta. Atualize a aplicação e tente novamente.",
        salesInProgress:
          "Algumas faturas do negócio ainda não são definitivas. Tente novamente quando a versão final for publicada (até 3 h após o fim de uma fatura não paga).",
        walletFailed:
          "Não foi possível verificar a carteira. Verifique a ligação à internet e tente novamente.",
        unreachable:
          "Os relays Nostr não responderam. Verifique a ligação à internet e tente novamente.",
        notDeleted:
          "Os relays Nostr não confirmaram o apagamento. Nada foi apagado neste dispositivo: tente novamente.",
        begun:
          "A eliminação não está concluída: o endereço lightning e a equipa já foram retirados, nada foi apagado neste dispositivo. Verifique a ligação à internet e tente novamente.",
        unfinished:
          "A eliminação começou mas não está concluída: os outros dispositivos da conta podem já tê-la esquecido. Verifique a ligação à internet e tente novamente para a concluir.",
        deviceNotWiped:
          "A conta foi apagada dos relays, mas não tudo o que a app guardava neste dispositivo."
      }
    },
    yourProfile: "O seu perfil",
    nameLocked: "Nome definido pelo seu empregador",
    addPhoto: "Adicionar uma foto",
    changePhoto: "Alterar a foto",
    removePhoto: "Remover",
    relaysLocked: "Definidos pelo seu empregador",
    leave: "Sair do comércio",
    leaveTitle: "Sair de {{business}}?",
    leaveBody:
      "Este dispositivo deixará de cobrar para este comércio. Para voltar, será necessário um novo convite.",
    back: "Voltar",
    splitSavedTitle: "Repartição guardada",
    splitSavedBank: "IBAN verificado · {{percent}} em {{currency}}",
    splitSavedBitcoin: "Tudo em bitcoin",
    relaysSavedTitle: "Relays guardados",
    relaysSavedBody: "Os dispositivos do comércio seguem-nos a partir da próxima ligação.",
    nameSavedTitle: "Nome guardado",
    currencySavedTitle: "Moeda de referência guardada",
    onchainSavedTitle: "Pagamentos onchain guardados",
    onchainSavedOn: "Aceites no ponto de venda, além do Lightning",
    onchainSavedOff: "Apenas Lightning no ponto de venda",
    vatRate: "IVA predefinido",
    vatRateDescription: "A taxa de IVA das novas linhas de fatura, alterável linha a linha.",
    vatRateField: "Taxa de IVA (%)",
    vatRateHint: "Deixe vazio para a taxa normal: {{rate}}",
    vatStandard: "{{rate}} (taxa normal)",
    vatSavedTitle: "IVA predefinido guardado",
    vatInvalid: "Introduza uma taxa entre 0 e 100 %",
    tolerance: "Tolerância de pagamento insuficiente",
    toleranceDescription:
      "Um pagamento onchain a que falte no máximo esta percentagem do montante conta como pago. Se faltar mais, o cliente tem de pagar todo o resto. Aplicada às suas vendas, faturas e links de pagamento, incluindo os dos seus funcionários, integrações e assistentes de IA. Nunca mostrada aos seus clientes.",
    toleranceField: "Tolerância (%)",
    toleranceHint: "De 0 a 10 %, à décima. Vazio ou 0: nenhuma.",
    toleranceNone: "Nenhuma",
    toleranceSavedTitle: "Tolerância guardada",
    toleranceSaved: "{{rate}} para as próximas vendas e faturas",
    toleranceSavedNone: "Nenhuma: é pedido o montante completo",
    toleranceInvalid: "Introduza uma percentagem entre 0 e 10, à décima",
    logoSavedTitle: "Logótipo guardado",
    address: {
      title: "Morada do comércio",
      description: "Aparece sob o nome do comércio nas suas faturas.",
      street: "Rua e número",
      postalCode: "Código postal",
      city: "Localidade",
      country: "País",
      savedTitle: "Morada guardada"
    },
    numbers: {
      title: "Números do comércio",
      description:
        "Aparecem nas suas faturas, sob a morada do comércio. O seu nome segue o país do comércio.",
      savedTitle: "Número guardado"
    },
    photoSavedTitle: "Foto guardada",
    photoRemovedTitle: "Foto removida",
    saveFailedTitle: "Erro ao guardar",
    failedTitle: "Definição não guardada",
    errors: {
      unpublished:
        "Poucos relays confirmaram a alteração, que foi anulada. Verifique a ligação e tente novamente.",
      newerBackup:
        "Uma versão mais recente da app guardou esta conta, pelo que a alteração foi anulada. Atualize a app e tente novamente.",
      noAccount: "Desbloqueie a app com a sua passkey e tente novamente.",
      invalid: "Verifique o valor introduzido e tente novamente.",
      unreachable: "Responderam poucos relays. Verifique a ligação e tente novamente.",
      saveFailed: "Não foi possível guardar a definição neste dispositivo. Tente novamente.",
      denied: "Permita o acesso às suas fotos nas definições do dispositivo e tente novamente.",
      unreadable: "Esta imagem não pode ser usada. Escolha outra.",
      logoutFailed: "Não foi possível terminar a sessão. Tente novamente.",
      leaveFailed: "Este dispositivo não conseguiu sair do comércio. Tente novamente.",
      leaveUnreachable:
        "Não foi possível avisar o comércio da sua saída. Verifique a sua ligação à internet e tente novamente.",
      salesInProgress:
        "Algumas faturas do comércio ainda não são definitivas. Tente novamente quando a sua versão final for publicada (até 3 horas após o fim de uma fatura não paga).",
      integrationsPending:
        "Uma integração tem um pagamento em curso (um pedido de pagamento aberto ou um pagamento Bitcoin em confirmação). Tente novamente quando estiver concluído."
    },
    splitLead: "A app irá propor-lhe vender esta parte do que recebe.",
    ibanRefused: "Verifique os dígitos do IBAN"
  },
  relays: {
    title: "Relays Nostr",
    lead: "Servidores Nostr aos quais a app se liga, em todos os dispositivos do comércio.",
    integrationsNotice:
      "As integrações desta conta seguem no máximo {{moves}} alterações de relays desde a sua criação. Para além disso, o seu servidor deixa de as encontrar: crie-as de novo e dê as novas chaves aos seus integradores.",
    add: "Adicionar um relay",
    addLead: "Introduza o endereço do relay.",
    address: "Endereço do relay",
    placeholder: "relay.exemplo.ch",
    addConfirm: "Adicionar o relay",
    addShort: "Adicionar",
    removeLabel: "Remover {{relay}}",
    keepOne: "Mantenha pelo menos um relay.",
    tooMany: "No máximo dez relays: remova um para adicionar outro.",
    removeUnreachable: "Remova o relay a vermelho para guardar.",
    restrictedRelay:
      "« Leitura recusada »: este relay só deixa ler os dados a quem os escreveu. As suas caixas, os seus funcionários e os seus clientes não os poderiam ler: escolha outro.",
    localNetworkBlocked:
      "O navegador bloqueia o acesso deste site à rede local: permita « Rede local » nas definições do site (ícone à esquerda do endereço) e volte a testar.",
    localNetworkNotAllowed:
      "O acesso à rede local ainda não está permitido para este site: volte a testar e permita-o quando o navegador o pedir. Se não pedir nada, este dispositivo não chega ao relay: verifique se está na mesma rede ou no Tailscale.",
    test: "Testar a ligação",
    status: {
      reachable: "Ligado",
      untested: "Não testado",
      testing: "A testar",
      unreachable: "Inacessível",
      restricted: "Leitura recusada"
    },
    statusLabel: "{{relay}}, {{status}}",
    statusDetail: "{{status}} · {{detail}}",
    noAnswer: "sem resposta em {{duration}}",
    milliseconds: "{{value}}\u00a0ms",
    seconds: "{{value}}\u00a0s",
    errors: {
      incomplete: "Introduza um endereço completo",
      duplicate: "Introduza um relay que não esteja na lista",
      local: "Introduza o endereço de um relay público: localhost é este dispositivo"
    },
    advanced: "Definições avançadas",
    advancedLead:
      "Relays Nostr onde este dispositivo procura a sua conta e cria as novas. Depois de iniciar sessão, são usados os da sua conta.",
    // "Sign-up" of "Advanced settings".
    countryDetection: {
      section: "Registo",
      title: "Detetar o meu país com country.is",
      caption:
        "Só se o fuso horário não bastar. O country.is recebe então o endereço IP deste dispositivo. Desativado: o país vem das definições do dispositivo.",
      saveFailed: "Não foi possível guardar esta escolha neste dispositivo. Tente novamente."
    }
  },
  pending: {
    title: "Brevemente",
    description: "Este ecrã ainda não foi concebido."
  },
  merchantSettings: {
    businessNameWord: "Comerciante",
    saveFailed: "Não foi possível guardar as suas definições neste dispositivo. Tente novamente."
  },
  /** "New invoice". */
  invoices: {
    newInvoice: "Nova fatura",
    // "Wallet"'s button on a phone, beside "Sell" in half the width: one word, its "+" icon tells
    // "new".
    newInvoiceShort: "Fatura",
    // "Wallet"'s warning about an assistant (assistant-alerts.ts): "Remove the assistant" or "This
    // is expected" only.
    assistantAlert: {
      jumpTitle: "{{name}} saltou números de fatura",
      jumpBody:
        "As suas faturas vão até ao n.º {{from}}, mas o seu contador indica o n.º {{to}}: os números intermédios foram tomados sem fatura. Se não houver explicação, retire este assistente.",
      jumpBodyNone:
        "Não fez nenhuma fatura em {{year}}, mas o seu contador indica o n.º {{to}}: estes números foram tomados sem fatura. Se não houver explicação, retire este assistente.",
      blockedTitle: "{{name}} bloqueia a numeração",
      blockedBody:
        "O seu contador de números tem um formato que esta versão da app não consegue ler: nenhuma fatura pode receber número. Atualize a app; se já estiver atualizada, retire este assistente.",
      burstTitle: "{{name}} fez muitíssimas faturas",
      burstBody:
        "{{invoices}} faturas em 24 horas. Se não as pediu, retire este assistente: as suas faturas continuam na sua carteira.",
      remove: "Retirar o assistente",
      normal: "É normal",
      removeFailedTitle: "Assistente não retirado",
      removeFailed:
        "Não foi possível retirar {{name}}. Verifique a sua ligação à internet e tente novamente a partir da lista de integrações"
    },
    title: "Nova fatura",
    back: "Voltar",
    saveDraft: "Guardar como rascunho",
    draftSaved: "Fatura guardada como rascunho",
    draftSavedBody: "Encontre-a em «A acompanhar»",
    linkNote: "Fatura {{number}}",
    recipient: {
      title: "A quem se destina a fatura?",
      assistant: "Fazer as suas faturas com uma IA",
      name: "Denominação social",
      street: "Rua e número",
      postalCode: "Código postal",
      city: "Localidade",
      country: "País"
    },
    preview: {
      title: "Pré-visualização do PDF",
      invoice: "Fatura",
      date: "Data",
      due: "Vencimento"
    },
    lines: {
      title: "O que está a faturar?",
      empty: "Nenhum artigo nesta fatura",
      emptyLead: "Adicione o que vende: um artigo do seu catálogo ou uma linha escrita à mão.",
      add: "Adicionar um artigo",
      name: "Descrição",
      quantity: "Quantidade",
      quantityShort: "Qtd.",
      unitPrice: "Preço unitário",
      unitPriceShort: "Preço unit.",
      vatRate: "Taxa de IVA",
      vat: "IVA",
      amount: "Montante",
      remove: "Remover",
      removeLine: "Remover a linha",
      expand: "Alterar a linha",
      summary: "{{quantity}} · IVA {{rate}}",
      net: "Subtotal sem IVA",
      vatOn: "IVA {{rate}} sobre {{base}}",
      total: "Total",
      quantityInvalid: "Introduza uma quantidade",
      priceInvalid: "Introduza um preço",
      vatInvalid: "Introduza uma taxa entre 0 e 100 %",
      tooLarge: "O total excede o montante máximo de uma fatura",
      incomplete: "A completar",
      save: "Guardar nos meus artigos",
      saved: "Guardado nos meus artigos"
    },
    picker: {
      title: "Adicionar um artigo",
      close: "Fechar",
      manual: "Introduzir um artigo",
      manualDescription: "Descrição, quantidade e preço livres",
      catalog: "Os meus artigos",
      loading: "A ler os seus artigos…",
      failed:
        "Não foi possível ler os seus artigos. Verifique a ligação à internet e tente novamente.",
      retry: "Tentar novamente",
      empty: "Ainda não há artigos. Adicione-os em «Artigos».",
      convertFailed: "Não foi possível converter o preço. Tente novamente dentro de instantes"
    },
    sameName: {
      title: "Já existe um artigo com este nome",
      close: "Fechar",
      lead: "Atualize-o com o preço desta linha ou crie um segundo artigo com o mesmo nome.",
      otherCurrency:
        "Este artigo é vendido em {{currency}}: o seu preço não pode receber um montante em {{invoice}}. Crie um segundo artigo com o mesmo nome.",
      newPrice: "Preço da linha: {{price}}",
      update: "Atualizar o artigo",
      duplicate: "Criar um duplicado"
    },
    due: {
      title: "Pagável até <accent>{{date}}</accent>",
      lead: "O link de pagamento fica aberto até ao vencimento.",
      label: "Data de vencimento",
      previousMonth: "Mês anterior",
      nextMonth: "Mês seguinte",
      close: "Fechar"
    },
    terms: {
      title: "Para terminar, as menções administrativas",
      conditions: "Condições de pagamento",
      legal: "Menções legais",
      addRedirect: "Adicionar um URL de redirecionamento",
      redirect: "URL de redirecionamento",
      redirectInvalid: "Introduza um endereço que comece por https://",
      redirectHint:
        "Depois de a fatura ser paga, o seu cliente poderá voltar ao seu site (página de agradecimento, acompanhamento da encomenda…) com um simples clique."
    },
    review: {
      title: "Verificar a fatura",
      client: "Cliente",
      articles: "Artigos",
      due: "Vencimento",
      notices: "Menções administrativas",
      noNotices: "Nenhuma menção",
      editRecipient: "Alterar o destinatário",
      editLines: "Alterar os artigos",
      editDue: "Alterar o vencimento",
      editNotices: "Alterar as menções administrativas",
      create: "Criar a fatura"
    },
    sent: {
      title: "Fatura {{number}} criada",
      lead: "Envie-a ao seu cliente. O link de pagamento fica aberto até {{date}}.",
      mail: "Enviar por e-mail",
      copy: "Copiar o link",
      copied: "Link copiado",
      share: "Partilhar",
      pdf: "Transferir o PDF",
      newInvoice: "Nova fatura",
      view: "Ver a fatura",
      close: "Fechar"
    },
    mail: {
      subject: "Fatura {{number}} · {{business}}",
      body: "Olá,\n\nEncontra abaixo a fatura {{number}} de {{business}}, no montante de {{amount}}, pagável até {{date}}.\n\nPara a pagar em bitcoin: {{url}}\n\nCom os melhores cumprimentos\n{{business}}"
    },
    pdf: {
      invoice: "Fatura",
      date: "Data",
      due: "Vencimento",
      reference: "A sua referência",
      billedTo: "Faturado a",
      pay: "Pagar em bitcoin",
      payHint: "Leia o código QR ou abra o link.",
      title: "Fatura {{number}}"
    },
    detail: {
      totalDue: "Total em dívida",
      paid: "Montante pago",
      due: "Vencimento",
      paidOn: "Paga a",
      rest: "Falta pagar",
      createdBy: "Criada por si",
      recipient: "Destinatário",
      conditions: "Condições e menções",
      followUp: "Histórico",
      created: "Criada",
      sent: "Enviada",
      paidEvent: "Paga",
      more: "Mais ações",
      remind: "Lembrar por e-mail",
      copyLink: "Copiar o link de pagamento",
      duplicate: "Duplicar",
      pdf: "Transferir o PDF",
      cancel: "Anular a fatura",
      title: "Fatura {{number}}",
      breadcrumb: "fatura {{number}}",
      notFound: "Esta fatura não foi encontrada. Pode ter sido eliminada noutro dispositivo.",
      reading: "A carregar a fatura…",
      readFailed:
        "Não foi possível ler a fatura. Verifique a ligação à internet e tente novamente.",
      cancelDialog: {
        title: "Anular a fatura {{number}}?",
        body: "O link de pagamento deixará de propor o pagamento. Um pagamento já recebido fica na sua carteira.",
        confirm: "Anular a fatura",
        keep: "Manter a fatura"
      },
      canceled: "Fatura anulada",
      cancelReceived: "Esta fatura já recebeu um pagamento: já não pode ser anulada",
      cancelFailed:
        "Não foi possível anular a fatura. Verifique a ligação à internet e tente novamente"
    },
    draftDetail: {
      edit: "Alterar o rascunho",
      remove: "Eliminar o rascunho",
      removed: "Rascunho eliminado",
      removeDialog: {
        title: "Eliminar o rascunho {{number}}?",
        body: "Desaparece de todos os seus dispositivos. O seu número não é reatribuído.",
        confirm: "Eliminar o rascunho",
        keep: "Manter o rascunho"
      }
    },
    errors: {
      noAccount: "Desbloqueie a aplicação e tente novamente",
      invalid: "Complete a fatura e tente novamente",
      number:
        "Não foi possível atribuir o número da fatura. Verifique a ligação à internet e tente novamente",
      noWebApp: "Os links de pagamento ainda não estão disponíveis nesta versão da aplicação",
      noAddress:
        "Acima de {{max}} sats (o limite Lightning menos uma margem de {{margin}}), uma fatura precisa de um endereço onchain, e nenhum endereço Bitcoin está pronto. Tente novamente dentro de instantes",
      unverified:
        "Não foi possível verificar o limite Lightning da fatura. Verifique a ligação à internet e tente novamente",
      unreachable:
        "Não foi possível guardar a fatura. Verifique a ligação à internet e tente novamente",
      mailFailed:
        "Não foi possível abrir nenhuma aplicação de e-mail. Copie antes o link de pagamento",
      pdfFailed: "Não foi possível criar o PDF. Tente novamente",
      copyFailed: "Não foi possível copiar o link"
    }
  },
  documentLanguage: {
    title: {
      mail: "Idioma do e-mail",
      pdf: "Idioma do PDF",
      export: "Idioma da exportação"
    },
    change: {
      mail: "Idioma do e-mail: {{language}}. Alterar",
      pdf: "Idioma do PDF: {{language}}. Alterar",
      export: "Idioma da exportação: {{language}}. Alterar"
    },
    yours: "O seu idioma"
  },
  currencies: {
    AUD: "dólares australianos",
    CAD: "dólares canadianos",
    CHF: "francos suíços",
    CZK: "coroas checas",
    DKK: "coroas dinamarquesas",
    EUR: "euros",
    GBP: "libras esterlinas",
    HKD: "dólares de Hong Kong",
    HUF: "forints húngaros",
    JPY: "ienes japoneses",
    MXN: "pesos mexicanos",
    NOK: "coroas norueguesas",
    NZD: "dólares neozelandeses",
    PLN: "zlótis polacos",
    SEK: "coroas suecas",
    SGD: "dólares de Singapura",
    USD: "dólares americanos",
    ZAR: "rands sul-africanos"
  },
  currencyNames: {
    AUD: "Dólares australianos",
    CAD: "Dólares canadianos",
    CHF: "Francos suíços",
    CZK: "Coroas checas",
    DKK: "Coroas dinamarquesas",
    EUR: "Euros",
    GBP: "Libras esterlinas",
    HKD: "Dólares de Hong Kong",
    HUF: "Forints húngaros",
    JPY: "Ienes japoneses",
    MXN: "Pesos mexicanos",
    NOK: "Coroas norueguesas",
    NZD: "Dólares neozelandeses",
    PLN: "Zlótis polacos",
    SEK: "Coroas suecas",
    SGD: "Dólares de Singapura",
    USD: "Dólares americanos",
    ZAR: "Rands sul-africanos"
  },
  businessNumbers: {
    company: {
      CH: "Número UID",
      FR: "Número SIRET",
      DE: "Número fiscal (Steuernummer)",
      IT: "Código fiscal (codice fiscale)",
      ES: "NIF",
      PT: "NIF",
      FI: "Identificador da empresa (Y-tunnus)",
      other: "Número da empresa"
    },
    vat: {
      CH: "Número de IVA",
      EU: "Número de IVA intracomunitário",
      other: "Número de IVA"
    }
  },
  whatsNew: {
    title: "Novidades",
    open: "Novidades, {{build}}",
    openUnread: "Novidades, por ler, {{build}}",
    next: "Próxima versão",
    new: "Novo",
    source: "Código-fonte",
    close: "Fechar",
    empty: "As novidades de cada versão vão aparecer aqui."
  }
};

export default pt;
