import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
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
};
