import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
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
    'Pošli odkaz do skupinového chatu nebo ukaž QR kód. WhatsApp, Signal a další komunikátory zobrazí náhled s názvem a možnými dny. Nikdo nemusí nic instalovat.',
  'home.faq.privacy.q': 'Co se stane s našimi údaji?',
  'home.faq.privacy.a': `Ukládají se jen jména a dny, které zadáte: žádné e-mailové adresy, IP adresy ani cookies. Události se automaticky mažou, obvykle ${RETENTION_DAYS} dnů po poslední změně.`,
};
