import { DESCRIPTION_EN, type Language } from './texts.js';

/** The keys of the start page's own texts. */
export type HomeKey =
  | 'home.lead'
  | 'home.feature.heat.title'
  | 'home.feature.heat.text'
  | 'home.feature.private.title'
  | 'home.feature.private.text'
  | 'home.faq.title'
  | `home.faq.${FaqTopic}.q`
  | `home.faq.${FaqTopic}.a`;

/** The start page's questions, in the order they are shown. */
export const FAQ_TOPICS = [
  'free',
  'account',
  'doodle',
  'days',
  'messenger',
  'privacy',
] as const;

export type FaqTopic = (typeof FAQ_TOPICS)[number];

/**
 * The start page's texts in every language. The client's dictionaries spread
 * them in, and the server writes them into the HTML of the start page, so a
 * search engine that runs no JavaScript reads the same page people see.
 */
export const HOME_TEXTS: Record<Language, Record<HomeKey, string>> = {
  de: {
    'home.lead':
      'Wann könnt ihr alle? Markiert eure Tage im Kalender und findet es heraus. Ohne Anmeldung und Tracking.',
    'home.feature.heat.title': 'Seht, wann es passt',
    'home.feature.heat.text':
      'Der Kalender wird zur Heatmap und zeigt die Tage, an denen die meisten können – auch für Wochenenden oder mehrtägige Turniere.',
    'home.feature.private.title': 'Keine Konten',
    'home.feature.private.text':
      'Ein Name reicht. Keine E-Mail, keine Cookies, kein Tracking. Alte Events werden automatisch gelöscht.',
    'home.faq.title': 'Fragen',
    'home.faq.free.q': 'Kostet das etwas?',
    'home.faq.free.a':
      'Nein. Owl Be There ist kostenlos und Open Source, und jeder kann es auf einem eigenen Server betreiben.',
    'home.faq.account.q': 'Brauche ich ein Konto?',
    'home.faq.account.a':
      'Nein. Alle wählen einfach einen Namen. Wer das Event plant, bekommt einen privaten Link zum Verwalten.',
    'home.faq.doodle.q': 'Was ist anders als bei Doodle?',
    'home.faq.doodle.a':
      'Owl Be There ist für ganze Tage gemacht: Alle markieren die Tage, an denen sie können, und die Heatmap zeigt auf einen Blick, welcher Tag am besten passt. Es gibt keine Konten und kein Tracking, und alte Events werden automatisch gelöscht.',
    'home.faq.days.q': 'Können wir ein ganzes Wochenende suchen?',
    'home.faq.days.a':
      'Ja. Fragt nach zwei oder mehr Tagen am Stück, dann zeigt Owl Be There die Blöcke, an denen die meisten können – auf Wunsch mit einer Mindestzahl an Leuten.',
    'home.faq.messenger.q': 'Wie lade ich die Gruppe ein?',
    'home.faq.messenger.a':
      'Schick den Link in euren Gruppenchat oder zeig den QR-Code. WhatsApp, Signal und andere Messenger zeigen eine Vorschau mit dem Titel und den möglichen Tagen. Niemand muss etwas installieren.',
    'home.faq.privacy.q': 'Was passiert mit unseren Daten?',
    'home.faq.privacy.a':
      'Gespeichert werden nur die Namen und Tage, die ihr eintragt: keine E-Mail-Adressen, keine IP-Adressen, keine Cookies. Events löschen sich von selbst, meist 90 Tage nach der letzten Änderung.',
  },
  en: {
    'home.lead': DESCRIPTION_EN,
    'home.feature.heat.title': 'See what works',
    'home.feature.heat.text':
      'The calendar becomes a heatmap and shows the days most people can make — even for weekends or multi-day tournaments.',
    'home.feature.private.title': 'No accounts',
    'home.feature.private.text':
      'A name is enough. No email, cookies or tracking. Old events are deleted automatically.',
    'home.faq.title': 'Questions',
    'home.faq.free.q': 'Does it cost anything?',
    'home.faq.free.a':
      'No. Owl Be There is free and open source, and anyone can run it on their own server.',
    'home.faq.account.q': 'Do I need an account?',
    'home.faq.account.a':
      'No. Everyone just picks a name. Whoever plans the event gets a private link to manage it.',
    'home.faq.doodle.q': 'How is it different from Doodle?',
    'home.faq.doodle.a':
      'Owl Be There is made for whole days: everyone marks the days they can make it, and the heatmap shows at a glance which day works best. There are no accounts and no tracking, and old events are deleted automatically.',
    'home.faq.days.q': 'Can we look for a whole weekend?',
    'home.faq.days.a':
      'Yes. Ask for two or more days in a row, and Owl Be There ranks the blocks most people can make — with a minimum head count if you need one.',
    'home.faq.messenger.q': 'How do I invite the group?',
    'home.faq.messenger.a':
      'Send the link to your group chat or show the QR code. WhatsApp, Signal and other messengers show a preview with the title and the candidate days. Nobody has to install anything.',
    'home.faq.privacy.q': 'What happens to our data?',
    'home.faq.privacy.a':
      'Only the names and days you enter are stored: no email addresses, no IP addresses, no cookies. Events delete themselves, usually 90 days after the last change.',
  },
  es: {
    'home.lead':
      '¿Cuándo podéis quedar? Marcad vuestros días en el calendario y descubridlo. Sin registro ni seguimiento.',
    'home.feature.heat.title': 'Ved cuándo os viene bien',
    'home.feature.heat.text':
      'El calendario se convierte en un mapa de calor y muestra los días en que puede venir más gente. También sirve para fines de semana o torneos de varios días.',
    'home.feature.private.title': 'Sin cuentas',
    'home.feature.private.text':
      'Basta con tu nombre. Sin correo electrónico, cookies ni seguimiento. Los eventos antiguos se borran automáticamente.',
    'home.faq.title': 'Preguntas',
    'home.faq.free.q': '¿Cuesta algo?',
    'home.faq.free.a':
      'No. Owl Be There es gratuito y de código abierto, y cualquiera puede instalarlo en su propio servidor.',
    'home.faq.account.q': '¿Necesito una cuenta?',
    'home.faq.account.a':
      'No. Cada persona elige un nombre y listo. Quien organiza el evento recibe un enlace privado para gestionarlo.',
    'home.faq.doodle.q': '¿En qué se diferencia de Doodle?',
    'home.faq.doodle.a':
      'Owl Be There está pensado para días completos: cada persona marca los días en que puede y el mapa de calor muestra de un vistazo qué día va mejor. No hay cuentas ni rastreo, y los eventos antiguos se borran solos.',
    'home.faq.days.q': '¿Podemos buscar un fin de semana entero?',
    'home.faq.days.a':
      'Sí. Pedid dos o más días seguidos y Owl Be There ordena los bloques en los que puede más gente, con un mínimo de asistentes si lo necesitáis.',
    'home.faq.messenger.q': '¿Cómo invito al grupo?',
    'home.faq.messenger.a':
      'Envía el enlace al chat del grupo o enseña el código QR. WhatsApp, Signal y otras apps de mensajería muestran una vista previa con el título y los días posibles. Nadie tiene que instalar nada.',
    'home.faq.privacy.q': '¿Qué pasa con nuestros datos?',
    'home.faq.privacy.a':
      'Solo se guardan los nombres y los días que introducís: ni correos electrónicos, ni direcciones IP, ni cookies. Los eventos se borran solos, normalmente 90 días después del último cambio.',
  },
  fr: {
    'home.lead':
      'Quand est-ce que tout le monde est dispo ? Indiquez vos jours dans le calendrier et trouvez la bonne date. Sans compte ni suivi.',
    'home.feature.heat.title': 'Voyez les dates qui conviennent',
    'home.feature.heat.text':
      'Le calendrier devient une carte de chaleur et montre les jours où le plus de monde est disponible. Ça marche aussi pour les week-ends et les tournois sur plusieurs jours.',
    'home.feature.private.title': 'Pas de compte',
    'home.feature.private.text':
      'Ton prénom suffit. Pas d’adresse e-mail, de cookies ni de suivi. Les anciens événements sont supprimés automatiquement.',
    'home.faq.title': 'Questions',
    'home.faq.free.q': 'Est-ce payant ?',
    'home.faq.free.a':
      'Non. Owl Be There est gratuit et open source, et chacun peut l’installer sur son propre serveur.',
    'home.faq.account.q': 'Faut-il un compte ?',
    'home.faq.account.a':
      'Non. Chacun choisit simplement un nom. La personne qui organise reçoit un lien privé pour gérer l’événement.',
    'home.faq.doodle.q': 'Quelle différence avec Doodle ?',
    'home.faq.doodle.a':
      'Owl Be There est fait pour des journées entières : chacun marque les jours où il est libre, et la carte de chaleur montre d’un coup d’œil le meilleur jour. Pas de compte, pas de pistage, et les anciens événements sont supprimés automatiquement.',
    'home.faq.days.q': 'Peut-on chercher un week-end entier ?',
    'home.faq.days.a':
      'Oui. Demandez deux jours ou plus d’affilée, et Owl Be There classe les créneaux où le plus de monde est disponible, avec un nombre minimum de participants si besoin.',
    'home.faq.messenger.q': 'Comment inviter le groupe ?',
    'home.faq.messenger.a':
      'Envoyez le lien dans le chat du groupe ou montrez le QR code. WhatsApp, Signal et les autres messageries affichent un aperçu avec le titre et les jours proposés. Personne n’a rien à installer.',
    'home.faq.privacy.q': 'Que deviennent nos données ?',
    'home.faq.privacy.a':
      'Seuls les noms et les jours que vous indiquez sont enregistrés : pas d’adresse e-mail, pas d’adresse IP, pas de cookies. Les événements se suppriment d’eux-mêmes, en général 90 jours après la dernière modification.',
  },
  it: {
    'home.lead':
      'Quando ci siete tutti? Segnate i vostri giorni sul calendario e scopritelo. Senza registrazione né tracciamento.',
    'home.feature.heat.title': 'Scopri i giorni migliori',
    'home.feature.heat.text':
      'Il calendario diventa una mappa di calore e mostra i giorni in cui più persone sono libere. Funziona anche per i weekend e i tornei di più giorni.',
    'home.feature.private.title': 'Nessun account',
    'home.feature.private.text':
      'Basta un nome. Niente email, cookie o tracciamento. Gli eventi vecchi vengono eliminati automaticamente.',
    'home.faq.title': 'Domande',
    'home.faq.free.q': 'Costa qualcosa?',
    'home.faq.free.a':
      'No. Owl Be There è gratuito e open source, e chiunque può installarlo sul proprio server.',
    'home.faq.account.q': 'Serve un account?',
    'home.faq.account.a':
      'No. Ognuno sceglie solo un nome. Chi organizza riceve un link privato per gestire l’evento.',
    'home.faq.doodle.q': 'In cosa è diverso da Doodle?',
    'home.faq.doodle.a':
      'Owl Be There è pensato per giorni interi: ognuno segna i giorni in cui c’è e la heatmap mostra a colpo d’occhio il giorno migliore. Niente account, niente tracciamento, e gli eventi vecchi vengono cancellati da soli.',
    'home.faq.days.q': 'Possiamo cercare un intero weekend?',
    'home.faq.days.a':
      'Sì. Chiedete due o più giorni di fila e Owl Be There mette in ordine i blocchi in cui può venire più gente, con un numero minimo di persone se serve.',
    'home.faq.messenger.q': 'Come invito il gruppo?',
    'home.faq.messenger.a':
      'Manda il link nella chat del gruppo o mostra il codice QR. WhatsApp, Signal e le altre app di messaggistica mostrano un’anteprima con il titolo e i giorni proposti. Nessuno deve installare niente.',
    'home.faq.privacy.q': 'Che fine fanno i nostri dati?',
    'home.faq.privacy.a':
      'Vengono salvati solo i nomi e i giorni che inserite: niente indirizzi email, niente indirizzi IP, niente cookie. Gli eventi si cancellano da soli, di solito 90 giorni dopo l’ultima modifica.',
  },
  ja: {
    'home.lead':
      'みんな、いつなら空いてる？ カレンダーに都合のいい日を入れてみよう。登録も追跡もなし。',
    'home.feature.heat.title': '集まりやすい日がすぐわかる',
    'home.feature.heat.text':
      'カレンダーがヒートマップに。参加できる人が多い日がひと目でわかるよ。週末や数日間の大会にも使える。',
    'home.feature.private.title': 'アカウント不要',
    'home.feature.private.text':
      '名前だけでOK。メールもCookieも追跡もなし。古い予定は自動で削除されるよ。',
    'home.faq.title': 'よくある質問',
    'home.faq.free.q': 'お金はかかる？',
    'home.faq.free.a':
      '無料だよ。Owl Be There はオープンソースで、自分のサーバーでも動かせます。',
    'home.faq.account.q': 'アカウントは必要？',
    'home.faq.account.a':
      'いらないよ。名前を選ぶだけ。主催者は予定を管理するための専用リンクをもらえます。',
    'home.faq.doodle.q': 'Doodle との違いは？',
    'home.faq.doodle.a':
      'Owl Be There は日にち単位の日程調整向け。みんなが行ける日に印をつけるだけで、どの日がいちばん良いかヒートマップでひと目でわかります。アカウントもトラッキングもなく、古い予定は自動で削除されます。',
    'home.faq.days.q': '週末まるごと探せる？',
    'home.faq.days.a':
      'できるよ。2日以上の連続した日程を指定すると、参加できる人が多い順に候補を並べます。必要なら最低人数も設定できます。',
    'home.faq.messenger.q': 'グループへの招待はどうするの？',
    'home.faq.messenger.a':
      'グループチャットにリンクを送るか、QRコードを見せるだけ。LINEやWhatsAppなどのメッセージアプリでは、タイトルと候補日がプレビューで表示されます。アプリのインストールは不要です。',
    'home.faq.privacy.q': 'データはどうなるの？',
    'home.faq.privacy.a':
      '保存されるのは入力した名前と日にちだけ。メールアドレスもIPアドレスもCookieも保存しません。予定は自動で削除されます（通常は最後の変更から90日後）。',
  },
  nl: {
    'home.lead':
      'Wanneer kan iedereen? Zet je dagen in de kalender en ontdek het samen. Zonder aanmelding of tracking.',
    'home.feature.heat.title': 'Zie welke dagen passen',
    'home.feature.heat.text':
      'De kalender wordt een heatmap. Zo zie je wanneer de meeste mensen kunnen. Ook handig voor weekenden of toernooien van meerdere dagen.',
    'home.feature.private.title': 'Geen accounts',
    'home.feature.private.text':
      'Een naam is genoeg. Geen e-mail, cookies of tracking. Oude evenementen worden vanzelf verwijderd.',
    'home.faq.title': 'Vragen',
    'home.faq.free.q': 'Kost het iets?',
    'home.faq.free.a':
      'Nee. Owl Be There is gratis en open source, en iedereen kan het op een eigen server draaien.',
    'home.faq.account.q': 'Heb ik een account nodig?',
    'home.faq.account.a':
      'Nee. Iedereen kiest gewoon een naam. Wie het evenement plant, krijgt een privélink om het te beheren.',
    'home.faq.doodle.q': 'Wat is het verschil met Doodle?',
    'home.faq.doodle.a':
      'Owl Be There is gemaakt voor hele dagen: iedereen markeert de dagen waarop hij kan, en de heatmap laat in één oogopslag zien welke dag het beste past. Geen accounts, geen tracking, en oude evenementen worden vanzelf verwijderd.',
    'home.faq.days.q': 'Kunnen we een heel weekend zoeken?',
    'home.faq.days.a':
      'Ja. Vraag naar twee of meer dagen achter elkaar, dan zet Owl Be There de blokken op een rij waarop de meeste mensen kunnen – eventueel met een minimumaantal deelnemers.',
    'home.faq.messenger.q': 'Hoe nodig ik de groep uit?',
    'home.faq.messenger.a':
      'Stuur de link naar de groepschat of laat de QR-code zien. WhatsApp, Signal en andere messengers tonen een voorbeeld met de titel en de mogelijke dagen. Niemand hoeft iets te installeren.',
    'home.faq.privacy.q': 'Wat gebeurt er met onze gegevens?',
    'home.faq.privacy.a':
      'Alleen de namen en dagen die jullie invullen worden opgeslagen: geen e-mailadressen, geen IP-adressen, geen cookies. Evenementen verwijderen zichzelf, meestal 90 dagen na de laatste wijziging.',
  },
  pt: {
    'home.lead':
      'Quando é que todos podem? Marquem os vossos dias no calendário e descubram. Sem registo nem rastreio.',
    'home.feature.heat.title': 'Vejam os melhores dias',
    'home.feature.heat.text':
      'O calendário transforma-se num mapa de calor e mostra os dias em que mais pessoas podem. Também serve para fins de semana ou torneios de vários dias.',
    'home.feature.private.title': 'Sem contas',
    'home.feature.private.text':
      'Basta o teu nome. Sem e-mail, cookies nem rastreio. Os eventos antigos são apagados automaticamente.',
    'home.faq.title': 'Perguntas',
    'home.faq.free.q': 'Custa alguma coisa?',
    'home.faq.free.a':
      'Não. O Owl Be There é gratuito e de código aberto, e qualquer pessoa o pode instalar no seu próprio servidor.',
    'home.faq.account.q': 'Preciso de uma conta?',
    'home.faq.account.a':
      'Não. Cada pessoa escolhe só um nome. Quem organiza recebe um link privado para gerir o evento.',
    'home.faq.doodle.q': 'Qual é a diferença para o Doodle?',
    'home.faq.doodle.a':
      'O Owl Be There foi feito para dias inteiros: cada pessoa marca os dias em que pode e o mapa de calor mostra num instante qual é o melhor dia. Não há contas nem rastreio, e os eventos antigos são apagados automaticamente.',
    'home.faq.days.q': 'Podemos procurar um fim de semana inteiro?',
    'home.faq.days.a':
      'Sim. Peçam dois ou mais dias seguidos e o Owl Be There ordena os blocos em que mais pessoas podem, com um número mínimo de participantes se for preciso.',
    'home.faq.messenger.q': 'Como convido o grupo?',
    'home.faq.messenger.a':
      'Envia o link para o chat do grupo ou mostra o código QR. O WhatsApp, o Signal e outras apps de mensagens mostram uma pré-visualização com o título e os dias possíveis. Ninguém precisa de instalar nada.',
    'home.faq.privacy.q': 'O que acontece aos nossos dados?',
    'home.faq.privacy.a':
      'Só são guardados os nomes e os dias que introduzem: nada de e-mails, endereços IP ou cookies. Os eventos apagam-se sozinhos, normalmente 90 dias depois da última alteração.',
  },
};
