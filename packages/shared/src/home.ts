import { RETENTION_DAYS } from './limits.js';
import { DESCRIPTION_EN, type Language } from './texts.js';

/** The keys of the start page's own texts. */
export type HomeKey =
  | 'home.lead'
  | `home.feature.${Feature}.title`
  | `home.feature.${Feature}.text`
  | 'home.faq.title'
  | `home.faq.${FaqTopic}.q`
  | `home.faq.${FaqTopic}.a`;

/** The start page's feature cards, in the order they are shown. */
export const FEATURES = ['heat', 'private'] as const;

export type Feature = (typeof FEATURES)[number];

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
  ar: {
    'home.lead':
      'متى يستطيع الجميع الحضور؟ حدّد الأيام المناسبة لك في التقويم واعثر على الموعد الأنسب. بلا تسجيل أو تتبّع.',
    'home.feature.heat.title': 'اعرف الأيام الأنسب',
    'home.feature.heat.text':
      'يتحوّل التقويم إلى خريطة حرارية تُظهر الأيام التي يستطيع معظم الأشخاص الحضور فيها، حتى لعطلات نهاية الأسبوع والبطولات الممتدة لأيام.',
    'home.feature.private.title': 'بلا حسابات',
    'home.feature.private.text':
      'يكفي الاسم. لا بريد إلكتروني ولا ملفات تعريف ارتباط ولا تتبّع. تُحذف الأحداث القديمة تلقائياً.',
    'home.faq.title': 'أسئلة شائعة',
    'home.faq.free.q': 'هل الخدمة مجانية؟',
    'home.faq.free.a':
      'نعم. Owl Be There مجاني ومفتوح المصدر، ويمكن لأي شخص تشغيله على خادمه الخاص.',
    'home.faq.account.q': 'هل أحتاج إلى حساب؟',
    'home.faq.account.a':
      'لا. يختار كل شخص اسماً فحسب. ويحصل منظّم الحدث على رابط خاص لإدارته.',
    'home.faq.doodle.q': 'بم يختلف عن Doodle؟',
    'home.faq.doodle.a':
      'صُمّم Owl Be There للتخطيط لأيام كاملة: يحدّد الجميع الأيام التي تناسبهم، وتُظهر الخريطة الحرارية أفضل يوم بنظرة واحدة. لا حسابات ولا تتبّع، وتُحذف الأحداث القديمة تلقائياً.',
    'home.faq.days.q': 'هل يمكننا التخطيط لعطلة نهاية أسبوع كاملة؟',
    'home.faq.days.a':
      'نعم. اطلب يومين متتاليين أو أكثر، وسيرتّب Owl Be There الفترات بحسب عدد الأشخاص المتاحين. ويمكنك تحديد حدّ أدنى للمشاركين.',
    'home.faq.messenger.q': 'كيف أدعو المجموعة؟',
    'home.faq.messenger.a':
      'أرسل الرابط في دردشة المجموعة أو اعرض رمز QR. تُظهر تطبيقات مثل WhatsApp وSignal معاينة بعنوان الحدث والأيام المقترحة. لا يحتاج أحد إلى تثبيت شيء.',
    'home.faq.privacy.q': 'ماذا يحدث لبياناتنا؟',
    'home.faq.privacy.a': `لا تُخزَّن إلا الأسماء والأيام التي تُدخلونها: بلا عناوين بريد إلكتروني أو عناوين IP أو ملفات تعريف ارتباط. تُحذف الأحداث تلقائياً، عادةً بعد ${RETENTION_DAYS} يوماً من آخر تعديل.`,
  },
  cs: {
    'home.lead':
      'Kdy mohou všichni? Označte v kalendáři dny, kdy máte čas, a najděte vhodný termín. Bez registrace a sledování.',
    'home.feature.heat.title': 'Zjistěte, který den vyhovuje nejlépe',
    'home.feature.heat.text':
      'Kalendář se promění v přehlednou mapu, která ukáže dny, kdy může přijít nejvíc lidí — i pro víkendy nebo vícedenní turnaje.',
    'home.feature.private.title': 'Bez účtů',
    'home.feature.private.text':
      'Stačí jméno. Žádný e-mail, cookies ani sledování. Staré události se automaticky mažou.',
    'home.faq.title': 'Otázky a odpovědi',
    'home.faq.free.q': 'Je to zdarma?',
    'home.faq.free.a':
      'Ano. Owl Be There je zdarma a má otevřený zdrojový kód. Kdokoli si jej může provozovat na vlastním serveru.',
    'home.faq.account.q': 'Potřebuji účet?',
    'home.faq.account.a':
      'Ne. Každý si jen zvolí jméno. Pořadatel dostane soukromý odkaz ke správě události.',
    'home.faq.doodle.q': 'V čem se liší od Doodlu?',
    'home.faq.doodle.a':
      'Owl Be There slouží k plánování celých dnů: každý označí dny, kdy má čas, a barevný přehled hned ukáže nejvhodnější termín. Bez účtů a sledování; staré události se automaticky mažou.',
    'home.faq.days.q': 'Můžeme naplánovat celý víkend?',
    'home.faq.days.a':
      'Ano. Zadejte dva nebo více po sobě jdoucích dnů a Owl Be There seřadí úseky podle počtu dostupných lidí. Případně můžete nastavit i minimální počet účastníků.',
    'home.faq.messenger.q': 'Jak pozvu ostatní?',
    'home.faq.messenger.a':
      'Pošli odkaz do skupinového chatu nebo ukaž QR kód. WhatsApp, Signal a další komunikátory zobrazí náhled s názvem a možnými termíny. Nikdo nemusí nic instalovat.',
    'home.faq.privacy.q': 'Co se stane s našimi údaji?',
    'home.faq.privacy.a': `Ukládají se jen jména a dny, které zadáte: žádné e-mailové adresy, IP adresy ani cookies. Události se automaticky mažou, obvykle ${RETENTION_DAYS} dnů po poslední změně.`,
  },
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
    'home.faq.privacy.a': `Gespeichert werden nur die Namen und Tage, die ihr eintragt: keine E-Mail-Adressen, keine IP-Adressen, keine Cookies. Events löschen sich von selbst, meist ${RETENTION_DAYS} Tage nach der letzten Änderung.`,
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
    'home.faq.privacy.a': `Only the names and days you enter are stored: no email addresses, no IP addresses, no cookies. Events delete themselves, usually ${RETENTION_DAYS} days after the last change.`,
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
    'home.faq.privacy.a': `Solo se guardan los nombres y los días que introducís: ni correos electrónicos, ni direcciones IP, ni cookies. Los eventos se borran solos, normalmente ${RETENTION_DAYS} días después del último cambio.`,
  },
  'es-419': {
    'home.lead':
      '¿Cuándo pueden juntarse todos? Marquen sus días en el calendario y descúbranlo. Sin registro ni rastreo.',
    'home.feature.heat.title': 'Vean qué día les queda mejor',
    'home.feature.heat.text':
      'El calendario se convierte en un mapa de calor y muestra los días en que puede venir más gente. También sirve para fines de semana o torneos de varios días.',
    'home.feature.private.title': 'Sin cuentas',
    'home.feature.private.text':
      'Basta con tu nombre. Sin correo electrónico, cookies ni rastreo. Los eventos viejos se eliminan solos.',
    'home.faq.title': 'Preguntas',
    'home.faq.free.q': '¿Cuesta algo?',
    'home.faq.free.a':
      'No. Owl Be There es gratuito y de código abierto, y cualquiera puede instalarlo en su propio servidor.',
    'home.faq.account.q': '¿Necesito una cuenta?',
    'home.faq.account.a':
      'No. Cada persona elige un nombre y listo. Quien organiza el evento recibe un enlace privado para administrarlo.',
    'home.faq.doodle.q': '¿En qué se diferencia de Doodle?',
    'home.faq.doodle.a':
      'Owl Be There está pensado para días completos: cada persona marca los días en que puede y el mapa de calor muestra de un vistazo qué día queda mejor. No hay cuentas ni rastreo, y los eventos viejos se eliminan solos.',
    'home.faq.days.q': '¿Podemos buscar un fin de semana completo?',
    'home.faq.days.a':
      'Sí. Pidan dos o más días seguidos y Owl Be There ordena los bloques en los que puede más gente, con un mínimo de asistentes si lo necesitan.',
    'home.faq.messenger.q': '¿Cómo invito al grupo?',
    'home.faq.messenger.a':
      'Envía el enlace al chat del grupo o muestra el código QR. WhatsApp, Telegram y otras apps de mensajería muestran una vista previa con el título y los días posibles. Nadie tiene que instalar nada.',
    'home.faq.privacy.q': '¿Qué pasa con nuestros datos?',
    'home.faq.privacy.a': `Solo se guardan los nombres y los días que ingresan: ni correos electrónicos, ni direcciones IP, ni cookies. Los eventos se eliminan solos, normalmente ${RETENTION_DAYS} días después del último cambio.`,
  },
  fa: {
    'home.lead':
      'همهٔ شما کی می‌توانید؟ روزهایتان را در تقویم علامت بزنید و پیدایش کنید. بدون ثبت‌نام و بدون ردیابی.',
    'home.feature.heat.title': 'ببینید کی جور درمی‌آید',
    'home.feature.heat.text':
      'تقویم به نقشهٔ حرارتی تبدیل می‌شود و روزهایی را نشان می‌دهد که بیشترِ افراد می‌توانند؛ حتی برای آخر هفته‌ها یا مسابقه‌های چندروزه.',
    'home.feature.private.title': 'بدون حساب کاربری',
    'home.feature.private.text':
      'یک نام کافی است. بدون ایمیل، کوکی یا ردیابی. رویدادهای قدیمی خودکار پاک می‌شوند.',
    'home.faq.title': 'پرسش‌ها',
    'home.faq.free.q': 'هزینه‌ای دارد؟',
    'home.faq.free.a':
      'نه. Owl Be There رایگان و متن‌باز است و هر کسی می‌تواند آن را روی سرور خودش اجرا کند.',
    'home.faq.account.q': 'به حساب کاربری نیاز دارم؟',
    'home.faq.account.a':
      'نه. هر کس فقط یک نام انتخاب می‌کند. کسی که رویداد را برنامه‌ریزی می‌کند، یک لینک خصوصی برای مدیریت آن می‌گیرد.',
    'home.faq.doodle.q': 'چه فرقی با Doodle دارد؟',
    'home.faq.doodle.a':
      'Owl Be There برای روزهای کامل ساخته شده است: همه روزهایی را که می‌توانند علامت می‌زنند و نقشهٔ حرارتی با یک نگاه نشان می‌دهد کدام روز بهتر است. نه حساب کاربری در کار است و نه ردیابی، و رویدادهای قدیمی خودکار پاک می‌شوند.',
    'home.faq.days.q': 'می‌توانیم دنبال یک آخر هفتهٔ کامل بگردیم؟',
    'home.faq.days.a':
      'بله. دو روز یا بیشتر پشت سر هم بخواهید تا Owl Be There بازه‌هایی را که بیشترِ افراد می‌توانند به ترتیب نشان دهد؛ اگر لازم باشد با حداقل تعداد نفرات.',
    'home.faq.messenger.q': 'گروه را چطور دعوت کنم؟',
    'home.faq.messenger.a':
      'لینک را در گروه چت بفرست یا کد QR را نشان بده. واتس‌اپ، تلگرام و پیام‌رسان‌های دیگر پیش‌نمایشی با عنوان و روزهای پیشنهادی نشان می‌دهند. لازم نیست کسی چیزی نصب کند.',
    'home.faq.privacy.q': 'با داده‌های ما چه می‌شود؟',
    'home.faq.privacy.a': `فقط نام‌ها و روزهایی که وارد می‌کنید ذخیره می‌شوند: نه نشانی ایمیل، نه نشانی IP، نه کوکی. رویدادها خودشان پاک می‌شوند، معمولاً ${RETENTION_DAYS} روز پس از آخرین تغییر.`,
  },
  fi: {
    'home.lead':
      'Milloin kaikille sopii? Merkitse sopivat päivät kalenteriin ja ota selvää. Ei rekisteröitymistä eikä seurantaa.',
    'home.feature.heat.title': 'Näe, mitkä päivät sopivat',
    'home.feature.heat.text':
      'Kalenterista muodostuu lämpökartta, joka näyttää päivät, joina mahdollisimman moni pääsee mukaan — myös viikonloppuja ja monipäiväisiä turnauksia varten.',
    'home.feature.private.title': 'Ei käyttäjätilejä',
    'home.feature.private.text':
      'Pelkkä nimi riittää. Ei sähköpostia, evästeitä eikä seurantaa. Vanhat tapahtumat poistetaan automaattisesti.',
    'home.faq.title': 'Kysymyksiä',
    'home.faq.free.q': 'Maksaako käyttö jotain?',
    'home.faq.free.a':
      'Ei. Owl Be There on maksuton ja avoimen lähdekoodin palvelu, jota kuka tahansa voi ylläpitää omalla palvelimellaan.',
    'home.faq.account.q': 'Tarvitsenko käyttäjätilin?',
    'home.faq.account.a':
      'Et. Jokainen valitsee vain nimen. Tapahtuman järjestäjä saa yksityisen linkin tapahtuman hallintaan.',
    'home.faq.doodle.q': 'Miten tämä eroaa Doodlesta?',
    'home.faq.doodle.a':
      'Owl Be There on tarkoitettu kokonaisten päivien sopimiseen: jokainen merkitsee päivät, joina pääsee mukaan, ja lämpökartta näyttää yhdellä silmäyksellä parhaan päivän. Käyttäjätilejä tai seurantaa ei ole, ja vanhat tapahtumat poistetaan automaattisesti.',
    'home.faq.days.q': 'Voimmeko etsiä koko viikonlopun?',
    'home.faq.days.a':
      'Kyllä. Valitse vähintään kaksi peräkkäistä päivää, niin Owl Be There järjestää jaksot sen mukaan, kuinka moni pääsee mukaan. Voit myös asettaa osallistujien vähimmäismäärän.',
    'home.faq.messenger.q': 'Miten kutsun ryhmän mukaan?',
    'home.faq.messenger.a':
      'Lähetä linkki ryhmäkeskusteluun tai näytä QR-koodi. WhatsApp, Signal ja muut viestisovellukset näyttävät esikatselun, jossa on tapahtuman nimi ja mahdolliset päivät. Kenenkään ei tarvitse asentaa mitään.',
    'home.faq.privacy.q': 'Mitä tiedoillemme tapahtuu?',
    'home.faq.privacy.a': `Vain syötetyt nimet ja päivät tallennetaan: ei sähköposti- tai IP-osoitteita eikä evästeitä. Tapahtumat poistetaan automaattisesti, yleensä ${RETENTION_DAYS} päivän kuluttua viimeisestä muutoksesta.`,
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
    'home.faq.privacy.a': `Seuls les noms et les jours que vous indiquez sont enregistrés : pas d’adresse e-mail, pas d’adresse IP, pas de cookies. Les événements se suppriment d’eux-mêmes, en général ${RETENTION_DAYS} jours après la dernière modification.`,
  },
  id: {
    'home.lead':
      'Kapan kalian semua bisa? Tandai hari kalian di kalender dan temukan jawabannya. Tanpa pendaftaran dan pelacakan.',
    'home.feature.heat.title': 'Lihat hari yang paling cocok',
    'home.feature.heat.text':
      'Kalender berubah menjadi peta panas yang menunjukkan hari saat paling banyak orang bisa hadir, termasuk untuk akhir pekan atau turnamen beberapa hari.',
    'home.feature.private.title': 'Tanpa akun',
    'home.feature.private.text':
      'Cukup nama saja. Tanpa alamat email, cookie, atau pelacakan. Acara lama dihapus secara otomatis.',
    'home.faq.title': 'Pertanyaan umum',
    'home.faq.free.q': 'Apakah layanan ini berbayar?',
    'home.faq.free.a':
      'Tidak. Owl Be There gratis dan bersumber terbuka; siapa pun bisa menjalankannya di server sendiri.',
    'home.faq.account.q': 'Apakah saya perlu akun?',
    'home.faq.account.a':
      'Tidak. Setiap orang cukup memilih nama. Penyelenggara acara mendapat tautan pribadi untuk mengelolanya.',
    'home.faq.doodle.q': 'Apa bedanya dengan Doodle?',
    'home.faq.doodle.a':
      'Owl Be There dirancang untuk merencanakan berdasarkan hari, bukan jam: setiap orang menandai hari saat bisa hadir, dan peta panas langsung menunjukkan hari yang paling cocok. Tidak perlu akun, tidak ada pelacakan, dan acara lama dihapus secara otomatis.',
    'home.faq.days.q': 'Bisakah kami mencari satu akhir pekan penuh?',
    'home.faq.days.a':
      'Bisa. Pilih dua hari berturut-turut atau lebih; Owl Be There mengurutkan rentang hari berdasarkan jumlah orang yang bisa hadir. Kalian juga bisa menetapkan jumlah minimum peserta.',
    'home.faq.messenger.q': 'Bagaimana cara mengundang grup?',
    'home.faq.messenger.a':
      'Kirim tautan ke obrolan grup atau tunjukkan kode QR. WhatsApp, Signal, dan aplikasi pesan lain menampilkan pratinjau berisi judul acara dan hari-hari usulan. Tidak ada yang perlu memasang aplikasi.',
    'home.faq.privacy.q': 'Apa yang terjadi pada data kami?',
    'home.faq.privacy.a': `Hanya nama dan hari yang kalian masukkan yang disimpan: tanpa alamat email, alamat IP, atau cookie. Acara terhapus otomatis, biasanya ${RETENTION_DAYS} hari setelah perubahan terakhir.`,
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
    'home.faq.privacy.a': `Vengono salvati solo i nomi e i giorni che inserite: niente indirizzi email, niente indirizzi IP, niente cookie. Gli eventi si cancellano da soli, di solito ${RETENTION_DAYS} giorni dopo l’ultima modifica.`,
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
    'home.faq.privacy.a': `保存されるのは入力した名前と日にちだけ。メールアドレスもIPアドレスもCookieも保存しません。予定は自動で削除されます（通常は最後の変更から${RETENTION_DAYS}日後）。`,
  },
  ko: {
    'home.lead':
      '다 같이 언제 모일 수 있을까요? 캘린더에 각자 가능한 날짜를 표시해 보세요. 가입도 추적도 없어요.',
    'home.feature.heat.title': '언제가 좋은지 한눈에',
    'home.feature.heat.text':
      '캘린더가 히트맵이 되어 가장 많은 사람이 가능한 날짜를 보여 줘요. 주말이나 며칠짜리 대회에도 쓸 수 있어요.',
    'home.feature.private.title': '계정 없이',
    'home.feature.private.text':
      '이름만 있으면 돼요. 이메일도, 쿠키도, 추적도 없어요. 오래된 모임은 자동으로 삭제돼요.',
    'home.faq.title': '자주 묻는 질문',
    'home.faq.free.q': '돈이 드나요?',
    'home.faq.free.a':
      '아니요. Owl Be There는 무료 오픈 소스이고, 누구나 자기 서버에서 운영할 수 있어요.',
    'home.faq.account.q': '계정이 필요한가요?',
    'home.faq.account.a':
      '아니요. 각자 이름만 고르면 돼요. 모임을 계획하는 사람은 관리용 개인 링크를 받아요.',
    'home.faq.doodle.q': 'Doodle과 무엇이 다른가요?',
    'home.faq.doodle.a':
      'Owl Be There는 하루 단위로 날짜를 정하도록 만들어졌어요. 모두 가능한 날짜를 표시하면, 어느 날이 가장 좋은지 히트맵으로 한눈에 보여요. 계정도 추적도 없고, 오래된 모임은 자동으로 삭제돼요.',
    'home.faq.days.q': '주말 전체를 찾을 수도 있나요?',
    'home.faq.days.a':
      '네. 연속으로 이틀 이상을 요청하면 Owl Be There가 가장 많은 사람이 가능한 기간 순으로 보여 줘요. 필요하면 최소 인원도 정할 수 있어요.',
    'home.faq.messenger.q': '그룹은 어떻게 초대하나요?',
    'home.faq.messenger.a':
      '그룹 채팅방에 링크를 보내거나 QR 코드를 보여 주세요. 카카오톡, WhatsApp, Signal 같은 메신저에서는 제목과 후보 날짜가 담긴 미리보기가 보여요. 아무것도 설치할 필요가 없어요.',
    'home.faq.privacy.q': '우리 데이터는 어떻게 되나요?',
    'home.faq.privacy.a': `입력한 이름과 날짜만 저장돼요. 이메일 주소도, IP 주소도, 쿠키도 저장하지 않아요. 모임은 보통 마지막 변경 후 ${RETENTION_DAYS}일이 지나면 자동으로 삭제돼요.`,
  },
  nb: {
    'home.lead':
      'Når kan alle møtes? Marker dagene som passer i kalenderen, og finn ut av det. Ingen registrering eller sporing.',
    'home.feature.heat.title': 'Se hvilke dager som passer',
    'home.feature.heat.text':
      'Kalenderen blir et varmekart som viser dagene da flest kan delta — også for helger og turneringer som varer flere dager.',
    'home.feature.private.title': 'Ingen kontoer',
    'home.feature.private.text':
      'Et navn er nok. Ingen e-post, informasjonskapsler eller sporing. Gamle arrangementer slettes automatisk.',
    'home.faq.title': 'Spørsmål',
    'home.faq.free.q': 'Koster det noe?',
    'home.faq.free.a':
      'Nei. Owl Be There er gratis og har åpen kildekode. Alle kan kjøre det på sin egen server.',
    'home.faq.account.q': 'Trenger jeg en konto?',
    'home.faq.account.a':
      'Nei. Alle velger bare et navn. Den som planlegger arrangementet, får en privat lenke for å administrere det.',
    'home.faq.doodle.q': 'Hva er forskjellen fra Doodle?',
    'home.faq.doodle.a':
      'Owl Be There er laget for hele dager: Alle markerer dagene de kan, og varmekartet viser med et øyekast hvilken dag som passer best. Det er ingen kontoer eller sporing, og gamle arrangementer slettes automatisk.',
    'home.faq.days.q': 'Kan vi finne en hel helg?',
    'home.faq.days.a':
      'Ja. Velg to eller flere dager på rad, så rangerer Owl Be There periodene flest kan delta på. Dere kan også angi et minsteantall deltakere.',
    'home.faq.messenger.q': 'Hvordan inviterer jeg gruppen?',
    'home.faq.messenger.a':
      'Send lenken til gruppechatten, eller vis QR-koden. WhatsApp, Signal og andre meldingstjenester viser en forhåndsvisning med tittelen og de mulige dagene. Ingen trenger å installere noe.',
    'home.faq.privacy.q': 'Hva skjer med opplysningene våre?',
    'home.faq.privacy.a': `Bare navnene og dagene dere oppgir, lagres: ingen e-postadresser, IP-adresser eller informasjonskapsler. Arrangementer slettes automatisk, vanligvis ${RETENTION_DAYS} dager etter siste endring.`,
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
    'home.faq.privacy.a': `Alleen de namen en dagen die jullie invullen worden opgeslagen: geen e-mailadressen, geen IP-adressen, geen cookies. Evenementen verwijderen zichzelf, meestal ${RETENTION_DAYS} dagen na de laatste wijziging.`,
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
    'home.faq.privacy.a': `Só são guardados os nomes e os dias que introduzem: nada de e-mails, endereços IP ou cookies. Os eventos apagam-se sozinhos, normalmente ${RETENTION_DAYS} dias depois da última alteração.`,
  },
  'pt-BR': {
    'home.lead':
      'Quando todo mundo pode? Marquem seus dias no calendário e descubram. Sem cadastro nem rastreamento.',
    'home.feature.heat.title': 'Vejam quando dá certo',
    'home.feature.heat.text':
      'O calendário vira um mapa de calor e mostra os dias em que mais gente pode — também para fins de semana ou torneios de vários dias.',
    'home.feature.private.title': 'Sem contas',
    'home.feature.private.text':
      'Basta um nome. Sem e-mail, cookies nem rastreamento. Eventos antigos são excluídos automaticamente.',
    'home.faq.title': 'Perguntas',
    'home.faq.free.q': 'Custa alguma coisa?',
    'home.faq.free.a':
      'Não. O Owl Be There é gratuito e de código aberto, e qualquer pessoa pode hospedá-lo no próprio servidor.',
    'home.faq.account.q': 'Preciso de uma conta?',
    'home.faq.account.a':
      'Não. Cada pessoa só escolhe um nome. Quem organiza o evento recebe um link privado para gerenciá-lo.',
    'home.faq.doodle.q': 'Qual é a diferença para o Doodle?',
    'home.faq.doodle.a':
      'O Owl Be There foi feito para dias inteiros: cada pessoa marca os dias em que pode, e o mapa de calor mostra de relance qual dia funciona melhor. Não há contas nem rastreamento, e eventos antigos são excluídos automaticamente.',
    'home.faq.days.q': 'Dá para procurar um fim de semana inteiro?',
    'home.faq.days.a':
      'Sim. Peçam dois ou mais dias seguidos, e o Owl Be There ordena os blocos em que mais gente pode — com um número mínimo de pessoas, se precisarem.',
    'home.faq.messenger.q': 'Como eu convido o grupo?',
    'home.faq.messenger.a':
      'Mande o link no chat do grupo ou mostre o código QR. O WhatsApp, o Signal e outros apps de mensagem mostram uma prévia com o título e os dias possíveis. Ninguém precisa instalar nada.',
    'home.faq.privacy.q': 'O que acontece com os nossos dados?',
    'home.faq.privacy.a': `Só ficam salvos os nomes e os dias que vocês informam: nada de e-mails, endereços IP ou cookies. Os eventos se excluem sozinhos, normalmente ${RETENTION_DAYS} dias depois da última alteração.`,
  },
  ru: {
    'home.lead':
      'Когда всем удобно? Отметьте подходящие дни в календаре и найдите лучший вариант. Без регистрации и отслеживания.',
    'home.feature.heat.title': 'Найдите подходящие дни',
    'home.feature.heat.text':
      'Календарь становится тепловой картой и показывает дни, когда может прийти больше всего людей — даже если вы планируете выходные или многодневный турнир.',
    'home.feature.private.title': 'Без учётных записей',
    'home.feature.private.text':
      'Достаточно имени. Никакой электронной почты, файлов cookie и отслеживания. Старые события удаляются автоматически.',
    'home.faq.title': 'Вопросы и ответы',
    'home.faq.free.q': 'Это платно?',
    'home.faq.free.a':
      'Нет. Owl Be There бесплатен и распространяется с открытым исходным кодом. Любой может запустить его на своём сервере.',
    'home.faq.account.q': 'Нужна ли учётная запись?',
    'home.faq.account.a':
      'Нет. Каждый просто выбирает имя. Организатор получает приватную ссылку для управления событием.',
    'home.faq.doodle.q': 'Чем это отличается от Doodle?',
    'home.faq.doodle.a':
      'Owl Be There предназначен для выбора целых дней: каждый отмечает дни, когда может прийти, а тепловая карта сразу показывает лучший вариант. Учётные записи и отслеживание не нужны, а старые события удаляются автоматически.',
    'home.faq.days.q': 'Можно выбрать целые выходные?',
    'home.faq.days.a':
      'Да. Укажите два или больше дней подряд, и Owl Be There покажет периоды, когда может прийти больше всего людей. При необходимости можно задать минимальное число участников.',
    'home.faq.messenger.q': 'Как пригласить группу?',
    'home.faq.messenger.a':
      'Отправь ссылку в общий чат или покажи QR-код. WhatsApp, Signal и другие мессенджеры покажут предпросмотр с названием и возможными днями. Никому ничего не нужно устанавливать.',
    'home.faq.privacy.q': 'Что происходит с нашими данными?',
    'home.faq.privacy.a': `Сохраняются только указанные вами имена и дни: без адресов электронной почты, IP-адресов и файлов cookie. События удаляются автоматически, обычно через ${RETENTION_DAYS} дней после последнего изменения.`,
  },
  sv: {
    'home.lead':
      'När kan alla? Markera de dagar som passar i kalendern och ta reda på det. Ingen registrering eller spårning.',
    'home.feature.heat.title': 'Se vilka dagar som passar',
    'home.feature.heat.text':
      'Kalendern blir en värmekarta som visar vilka dagar flest kan delta — även för helger och turneringar som pågår i flera dagar.',
    'home.feature.private.title': 'Inga konton',
    'home.feature.private.text':
      'Ett namn räcker. Ingen e-post, inga kakor och ingen spårning. Gamla evenemang raderas automatiskt.',
    'home.faq.title': 'Frågor',
    'home.faq.free.q': 'Kostar det något?',
    'home.faq.free.a':
      'Nej. Owl Be There är gratis och har öppen källkod. Vem som helst kan köra det på sin egen server.',
    'home.faq.account.q': 'Behöver jag ett konto?',
    'home.faq.account.a':
      'Nej. Alla väljer bara ett namn. Den som planerar evenemanget får en privat länk för att hantera det.',
    'home.faq.doodle.q': 'Hur skiljer det sig från Doodle?',
    'home.faq.doodle.a':
      'Owl Be There är gjort för hela dagar: alla markerar dagarna de kan, och värmekartan visar direkt vilken dag som passar bäst. Det finns inga konton eller någon spårning, och gamla evenemang raderas automatiskt.',
    'home.faq.days.q': 'Kan vi hitta en hel helg?',
    'home.faq.days.a':
      'Ja. Välj två eller fler dagar i rad, så rangordnar Owl Be There de sammanhängande perioder då flest kan delta. Ni kan också ange ett minsta antal deltagare.',
    'home.faq.messenger.q': 'Hur bjuder jag in gruppen?',
    'home.faq.messenger.a':
      'Skicka länken till gruppchatten eller visa QR-koden. WhatsApp, Signal och andra meddelandetjänster visar en förhandsvisning med titeln och de föreslagna dagarna. Ingen behöver installera något.',
    'home.faq.privacy.q': 'Vad händer med våra uppgifter?',
    'home.faq.privacy.a': `Endast namnen och dagarna ni anger sparas: inga e-postadresser, IP-adresser eller kakor. Evenemang raderas automatiskt, vanligtvis ${RETENTION_DAYS} dagar efter den senaste ändringen.`,
  },
  tr: {
    'home.lead':
      'Hepiniz ne zaman gelebilirsiniz? Günlerinizi takvimde işaretleyin ve görün. Kayıt yok, takip yok.',
    'home.feature.heat.title': 'En uygun günleri görün',
    'home.feature.heat.text':
      'Takvim bir ısı haritasına dönüşür ve en çok kişinin katılabildiği günleri gösterir. Hafta sonları ve birkaç gün süren turnuvalar için de uygundur.',
    'home.feature.private.title': 'Hesap yok',
    'home.feature.private.text':
      'Bir ad yeterli. E-posta adresi, çerez veya takip yok. Eski etkinlikler otomatik olarak silinir.',
    'home.faq.title': 'Sık sorulan sorular',
    'home.faq.free.q': 'Ücretli mi?',
    'home.faq.free.a':
      'Hayır. Owl Be There ücretsiz ve açık kaynaklıdır; isteyen kendi sunucusunda çalıştırabilir.',
    'home.faq.account.q': 'Hesap açmam gerekiyor mu?',
    'home.faq.account.a':
      'Hayır. Herkes yalnızca bir ad seçer. Etkinliği planlayan kişi, onu yönetmek için özel bir bağlantı alır.',
    'home.faq.doodle.q': 'Doodle’dan farkı nedir?',
    'home.faq.doodle.a':
      'Owl Be There, gün bazında planlama yapmak için tasarlandı: herkes uygun olduğu günleri işaretler, ısı haritası da en uygun günü bir bakışta gösterir. Hesap ve takip yoktur; eski etkinlikler otomatik olarak silinir.',
    'home.faq.days.q': 'Bütün bir hafta sonunu planlayabilir miyiz?',
    'home.faq.days.a':
      'Evet. Art arda iki veya daha fazla gün seçin; Owl Be There, en çok kişinin katılabildiği gün aralıklarını sıralar. Gerekirse asgari katılımcı sayısı da belirleyebilirsiniz.',
    'home.faq.messenger.q': 'Grubu nasıl davet ederim?',
    'home.faq.messenger.a':
      'Bağlantıyı grup sohbetine gönder veya QR kodunu göster. WhatsApp, Signal ve diğer mesajlaşma uygulamaları etkinlik başlığını ve aday günleri içeren bir önizleme gösterir. Kimsenin bir şey yüklemesi gerekmez.',
    'home.faq.privacy.q': 'Verilerimize ne oluyor?',
    'home.faq.privacy.a': `Yalnızca girdiğiniz adlar ve günler saklanır: e-posta adresi, IP adresi veya çerez saklanmaz. Etkinlikler genellikle son değişiklikten ${RETENTION_DAYS} gün sonra kendiliğinden silinir.`,
  },
  uk: {
    'home.lead':
      'Коли ви всі можете? Позначте свої дні в календарі — і дізнаєтеся. Без реєстрації та стеження.',
    'home.feature.heat.title': 'Побачте, коли всім зручно',
    'home.feature.heat.text':
      'Календар перетворюється на теплову карту й показує дні, коли може найбільше людей, — навіть для вихідних чи багатоденних турнірів.',
    'home.feature.private.title': 'Без облікових записів',
    'home.feature.private.text':
      'Достатньо імені. Без електронної пошти, cookie і стеження. Старі події видаляються автоматично.',
    'home.faq.title': 'Запитання',
    'home.faq.free.q': 'Це платно?',
    'home.faq.free.a':
      'Ні. Owl Be There безплатний і має відкритий код, а запустити його на власному сервері може кожен.',
    'home.faq.account.q': 'Чи потрібен обліковий запис?',
    'home.faq.account.a':
      'Ні. Кожен просто обирає ім’я. Той, хто планує подію, отримує приватне посилання, щоб нею керувати.',
    'home.faq.doodle.q': 'Чим це відрізняється від Doodle?',
    'home.faq.doodle.a':
      'Owl Be There створений для цілих днів: кожен позначає дні, коли може, а теплова карта одразу показує, який день підходить найкраще. Тут немає облікових записів і стеження, а старі події видаляються автоматично.',
    'home.faq.days.q': 'Чи можна шукати цілі вихідні?',
    'home.faq.days.a':
      'Так. Попросіть два або більше днів поспіль, і Owl Be There покаже періоди, коли може найбільше людей, — за потреби з мінімальною кількістю учасників.',
    'home.faq.messenger.q': 'Як запросити групу?',
    'home.faq.messenger.a':
      'Надішли посилання в груповий чат або покажи QR-код. WhatsApp, Signal та інші месенджери показують попередній перегляд із назвою і можливими днями. Нікому нічого не треба встановлювати.',
    'home.faq.privacy.q': 'Що відбувається з нашими даними?',
    'home.faq.privacy.a': `Зберігаються лише імена й дні, які ви вводите: жодних адрес електронної пошти, IP-адрес чи cookie. Події видаляються самі, зазвичай через ${RETENTION_DAYS} днів після останньої зміни.`,
  },
  ur: {
    'home.lead':
      'آپ سب کب آ سکتے ہیں؟ کیلنڈر پر اپنے دن نشان زد کریں اور جان لیں۔ نہ رجسٹریشن، نہ ٹریکنگ۔',
    'home.feature.heat.title': 'دیکھیں کب بات بنتی ہے',
    'home.feature.heat.text':
      'کیلنڈر ہیٹ میپ بن جاتا ہے اور وہ دن دکھاتا ہے جن میں زیادہ تر لوگ آ سکیں، ویک اینڈ یا کئی دن کے ٹورنامنٹ کے لیے بھی۔',
    'home.feature.private.title': 'کوئی اکاؤنٹ نہیں',
    'home.feature.private.text':
      'ایک نام کافی ہے۔ نہ ای میل، نہ کوکیز، نہ ٹریکنگ۔ پرانے ایونٹس خود بخود مٹ جاتے ہیں۔',
    'home.faq.title': 'سوالات',
    'home.faq.free.q': 'کیا اس کی کوئی قیمت ہے؟',
    'home.faq.free.a':
      'نہیں۔ Owl Be There مفت اور اوپن سورس ہے، اور کوئی بھی اسے اپنے سرور پر چلا سکتا ہے۔',
    'home.faq.account.q': 'کیا اکاؤنٹ ضروری ہے؟',
    'home.faq.account.a':
      'نہیں۔ ہر کوئی بس ایک نام چنتا ہے۔ ایونٹ پلان کرنے والے کو اسے سنبھالنے کے لیے ایک نجی لنک ملتا ہے۔',
    'home.faq.doodle.q': 'یہ Doodle سے کیسے مختلف ہے؟',
    'home.faq.doodle.a':
      'Owl Be There پورے دنوں کے لیے بنا ہے: ہر کوئی وہ دن نشان زد کرتا ہے جن میں وہ آ سکے، اور ہیٹ میپ ایک نظر میں دکھاتا ہے کہ کون سا دن سب سے بہتر ہے۔ نہ اکاؤنٹ ہیں نہ ٹریکنگ، اور پرانے ایونٹس خود بخود مٹ جاتے ہیں۔',
    'home.faq.days.q': 'کیا ہم پورا ویک اینڈ تلاش کر سکتے ہیں؟',
    'home.faq.days.a':
      'جی ہاں۔ مسلسل دو یا زیادہ دن مانگیں، اور Owl Be There وہ سلسلے ترتیب سے دکھاتا ہے جن میں زیادہ تر لوگ آ سکیں، چاہیں تو کم از کم تعداد کے ساتھ۔',
    'home.faq.messenger.q': 'میں گروپ کو کیسے بلاؤں؟',
    'home.faq.messenger.a':
      'لنک اپنے گروپ چیٹ میں بھیجیں یا QR کوڈ دکھائیں۔ WhatsApp، Signal اور دوسرے میسنجر عنوان اور ممکنہ دنوں کے ساتھ پیش منظر دکھاتے ہیں۔ کسی کو کچھ انسٹال نہیں کرنا پڑتا۔',
    'home.faq.privacy.q': 'ہمارے ڈیٹا کا کیا ہوتا ہے؟',
    'home.faq.privacy.a': `صرف وہ نام اور دن محفوظ ہوتے ہیں جو آپ درج کریں: نہ ای میل پتے، نہ IP پتے، نہ کوکیز۔ ایونٹس عام طور پر آخری تبدیلی کے ${RETENTION_DAYS} دن بعد خود بخود مٹ جاتے ہیں۔`,
  },
  vi: {
    'home.lead':
      'Khi nào cả nhóm đều rảnh? Đánh dấu ngày của các bạn trên lịch và cùng tìm ra. Không cần đăng ký, không theo dõi.',
    'home.feature.heat.title': 'Xem ngày nào hợp',
    'home.feature.heat.text':
      'Lịch biến thành bản đồ nhiệt, cho thấy những ngày nhiều người đi được nhất — kể cả cho cuối tuần hay giải đấu kéo dài nhiều ngày.',
    'home.feature.private.title': 'Không cần tài khoản',
    'home.feature.private.text':
      'Chỉ cần một cái tên. Không email, không cookie, không theo dõi. Sự kiện cũ tự động bị xóa.',
    'home.faq.title': 'Câu hỏi thường gặp',
    'home.faq.free.q': 'Có mất phí không?',
    'home.faq.free.a':
      'Không. Owl Be There miễn phí và là mã nguồn mở, ai cũng có thể tự chạy trên máy chủ của mình.',
    'home.faq.account.q': 'Tôi có cần tài khoản không?',
    'home.faq.account.a':
      'Không. Mỗi người chỉ cần chọn một cái tên. Người tổ chức sự kiện nhận được một liên kết riêng để quản lý.',
    'home.faq.doodle.q': 'Khác gì so với Doodle?',
    'home.faq.doodle.a':
      'Owl Be There được làm cho trọn ngày: mọi người đánh dấu những ngày mình đi được, và bản đồ nhiệt cho thấy ngay ngày nào hợp nhất. Không có tài khoản, không theo dõi, và sự kiện cũ tự động bị xóa.',
    'home.faq.days.q': 'Có thể tìm trọn một cuối tuần không?',
    'home.faq.days.a':
      'Có. Hãy chọn hai ngày liên tiếp trở lên, Owl Be There sẽ xếp hạng các khoảng ngày nhiều người đi được nhất — kèm số người tối thiểu nếu các bạn cần.',
    'home.faq.messenger.q': 'Làm sao để mời cả nhóm?',
    'home.faq.messenger.a':
      'Gửi liên kết vào nhóm chat hoặc cho xem mã QR. Zalo, Messenger và các ứng dụng nhắn tin khác hiển thị bản xem trước với tên sự kiện và các ngày đề xuất. Không ai phải cài đặt gì cả.',
    'home.faq.privacy.q': 'Dữ liệu của chúng tôi sẽ ra sao?',
    'home.faq.privacy.a': `Chỉ những tên và ngày các bạn nhập được lưu lại: không địa chỉ email, không địa chỉ IP, không cookie. Sự kiện tự xóa, thường là ${RETENTION_DAYS} ngày sau lần thay đổi cuối cùng.`,
  },
  'zh-Hans': {
    'home.lead':
      '大家什么时候有空？在日历上标记方便的日期，找到适合大家的日子。无需注册，也不会追踪你。',
    'home.feature.heat.title': '一眼看出哪天最合适',
    'home.feature.heat.text':
      '日历会变成热力图，显示最多人能参加的日期，周末聚会或多日赛事也适用。',
    'home.feature.private.title': '无需账号',
    'home.feature.private.text':
      '只要填上名字，无需邮箱，也没有 Cookie 或追踪。旧活动会自动删除。',
    'home.faq.title': '常见问题',
    'home.faq.free.q': '需要付费吗？',
    'home.faq.free.a': '不用。Owl Be There 免费且开源，任何人都可以自行部署。',
    'home.faq.account.q': '需要账号吗？',
    'home.faq.account.a':
      '不用。每个人只需选一个名字，组织者会得到管理活动的专用链接。',
    'home.faq.doodle.q': '和 Doodle 有什么不同？',
    'home.faq.doodle.a':
      'Owl Be There 专为以整天为单位安排日期而设计：大家标记方便的日期，热力图就会显示哪天最合适。无需账号、没有追踪，旧活动也会自动删除。',
    'home.faq.days.q': '可以安排整个周末吗？',
    'home.faq.days.a':
      '可以。设置连续两天或更多天，Owl Be There 就会按可参加人数排列连续日期；需要时也能设置最低人数。',
    'home.faq.messenger.q': '怎样邀请大家？',
    'home.faq.messenger.a':
      '把链接发到群聊，或让大家扫描二维码。WhatsApp、Signal 等聊天软件会显示活动名称和候选日期的预览。大家都不用安装任何东西。',
    'home.faq.privacy.q': '我们的数据会怎样处理？',
    'home.faq.privacy.a': `只会保存你输入的名字和日期；不保存邮箱地址、IP 地址或 Cookie。活动通常会在最后一次修改的 ${RETENTION_DAYS} 天后自动删除。`,
  },
  'zh-Hant': {
    'home.lead':
      '大家哪天有空？在日曆上標記方便的日期，找出適合大家的日子。無須註冊，也不會追蹤你。',
    'home.feature.heat.title': '一眼看出哪天最合適',
    'home.feature.heat.text':
      '日曆會變成熱度圖，顯示最多人能參加的日期。週末聚會或多日賽事也適用。',
    'home.feature.private.title': '無須帳號',
    'home.feature.private.text':
      '只要填上名字；無須電子郵件，也沒有 Cookie 或追蹤。舊活動會自動刪除。',
    'home.faq.title': '常見問題',
    'home.faq.free.q': '需要付費嗎？',
    'home.faq.free.a':
      '不用。Owl Be There 免費且開放原始碼，任何人都能自行架設。',
    'home.faq.account.q': '需要帳號嗎？',
    'home.faq.account.a':
      '不用。每個人選個名字即可；主辦人會收到管理活動的專用連結。',
    'home.faq.doodle.q': '和 Doodle 有什麼不同？',
    'home.faq.doodle.a':
      'Owl Be There 專為以整天為單位的日期安排設計：大家標記方便的日期，熱度圖就會顯示哪天最合適。無須帳號、不會追蹤，舊活動也會自動刪除。',
    'home.faq.days.q': '可以安排整個週末嗎？',
    'home.faq.days.a':
      '可以。設定連續兩天或更多天，Owl Be There 就會依可參加人數排列連續日期；需要時也能設定最低人數。',
    'home.faq.messenger.q': '怎麼邀請大家？',
    'home.faq.messenger.a':
      '把連結傳到群組聊天，或讓大家掃描 QR Code。WhatsApp、Signal 等通訊軟體會顯示活動名稱與候選日期的預覽。大家都不必安裝任何 App。',
    'home.faq.privacy.q': '我們的資料會怎麼處理？',
    'home.faq.privacy.a': `只會儲存你填入的名字和日期；不儲存電子郵件地址、IP 位址或 Cookie。活動通常會在最後一次變更的 ${RETENTION_DAYS} 天後自動刪除。`,
  },
  pl: {
    'home.lead':
      'Kiedy wszyscy mają czas? Zaznacz dostępne dni w kalendarzu i znajdź dogodny termin. Bez rejestracji i śledzenia.',
    'home.feature.heat.title': 'Zobacz, który dzień pasuje',
    'home.feature.heat.text':
      'Kalendarz zmienia się w mapę dostępności i pokazuje dni, w które może przyjść najwięcej osób. Sprawdzi się też przy planowaniu weekendu lub kilkudniowego turnieju.',
    'home.feature.private.title': 'Bez konta',
    'home.feature.private.text':
      'Wystarczy imię. Bez adresu e-mail, plików cookie i śledzenia. Stare wydarzenia są automatycznie usuwane.',
    'home.faq.title': 'Pytania i odpowiedzi',
    'home.faq.free.q': 'Czy to coś kosztuje?',
    'home.faq.free.a':
      'Nie. Owl Be There jest bezpłatne i ma otwarty kod źródłowy. Każdy może uruchomić je na własnym serwerze.',
    'home.faq.account.q': 'Czy potrzebuję konta?',
    'home.faq.account.a':
      'Nie. Każdy wybiera tylko imię. Osoba organizująca wydarzenie otrzymuje prywatny link do zarządzania nim.',
    'home.faq.doodle.q': 'Czym to się różni od Doodle?',
    'home.faq.doodle.a':
      'Owl Be There służy do planowania całych dni: każdy zaznacza dni, w które może przyjść, a mapa dostępności od razu pokazuje najlepszy termin. Bez kont i śledzenia; stare wydarzenia są usuwane automatycznie.',
    'home.faq.days.q': 'Czy możemy zaplanować cały weekend?',
    'home.faq.days.a':
      'Tak. Wybierz co najmniej dwa kolejne dni, a Owl Be There uszereguje okresy, w których może przyjść najwięcej osób. W razie potrzeby ustaw też minimalną liczbę uczestników.',
    'home.faq.messenger.q': 'Jak zaprosić grupę?',
    'home.faq.messenger.a':
      'Wyślij link na czat grupowy lub pokaż kod QR. WhatsApp, Signal i inne komunikatory wyświetlą podgląd z nazwą wydarzenia i proponowanymi dniami. Nikt nie musi niczego instalować.',
    'home.faq.privacy.q': 'Co się dzieje z naszymi danymi?',
    'home.faq.privacy.a': `Przechowujemy tylko wpisane imiona i dni: bez adresów e-mail, adresów IP i plików cookie. Wydarzenia są usuwane automatycznie, zwykle ${RETENTION_DAYS} dni po ostatniej zmianie.`,
  },
};
