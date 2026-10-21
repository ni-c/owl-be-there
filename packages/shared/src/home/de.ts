import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
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
    'Ja. Wählt zwei oder mehr Tage am Stück, dann zeigt Owl Be There die Blöcke, an denen die meisten können – auf Wunsch mit einer Mindestzahl an Leuten.',
  'home.faq.messenger.q': 'Wie lade ich die Gruppe ein?',
  'home.faq.messenger.a':
    'Schick den Link in euren Gruppenchat oder zeig den QR-Code. WhatsApp, Signal und andere Messenger zeigen eine Vorschau mit dem Titel und den möglichen Tagen. Niemand muss etwas installieren.',
  'home.faq.privacy.q': 'Was passiert mit unseren Daten?',
  'home.faq.privacy.a': `Gespeichert werden nur die Namen und Tage, die ihr eintragt: keine E-Mail-Adressen, keine IP-Adressen, keine Cookies. Events löschen sich von selbst, meist ${RETENTION_DAYS} Tage nach der letzten Änderung.`,
};
