import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
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
};
