import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
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
};
