import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
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
    'Ja. Kies twee of meer dagen achter elkaar, dan zet Owl Be There de blokken op een rij waarop de meeste mensen kunnen – eventueel met een minimumaantal deelnemers.',
  'home.faq.messenger.q': 'Hoe nodig ik de groep uit?',
  'home.faq.messenger.a':
    'Stuur de link naar de groepschat of laat de QR-code zien. WhatsApp, Signal en andere messengers tonen een voorbeeld met de titel en de mogelijke dagen. Niemand hoeft iets te installeren.',
  'home.faq.privacy.q': 'Wat gebeurt er met onze gegevens?',
  'home.faq.privacy.a': `Alleen de namen en dagen die jullie invullen worden opgeslagen: geen e-mailadressen, geen IP-adressen, geen cookies. Evenementen verwijderen zichzelf, meestal ${RETENTION_DAYS} dagen na de laatste wijziging.`,
};
