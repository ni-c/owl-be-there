import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
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
    'Owl Be There è pensato per giorni interi: ognuno segna i giorni in cui c’è e la mappa di calore mostra a colpo d’occhio il giorno migliore. Niente account, niente tracciamento, e gli eventi vecchi vengono eliminati da soli.',
  'home.faq.days.q': 'Possiamo cercare un intero weekend?',
  'home.faq.days.a':
    'Sì. Chiedete due o più giorni di fila e Owl Be There mette in ordine i blocchi in cui può venire più gente, con un numero minimo di persone se serve.',
  'home.faq.messenger.q': 'Come invito il gruppo?',
  'home.faq.messenger.a':
    'Manda il link nella chat del gruppo o mostra il codice QR. WhatsApp, Signal e le altre app di messaggistica mostrano un’anteprima con il titolo e i giorni proposti. Nessuno deve installare niente.',
  'home.faq.privacy.q': 'Che fine fanno i nostri dati?',
  'home.faq.privacy.a': `Vengono salvati solo i nomi e i giorni che inserite: niente indirizzi email, niente indirizzi IP, niente cookie. Gli eventi si eliminano da soli, di solito ${RETENTION_DAYS} giorni dopo l’ultima modifica.`,
};
