import type { HomeTexts } from './home.js';
import { HOME as ar } from './home/ar.js';
import { HOME as cs } from './home/cs.js';
import { HOME as de } from './home/de.js';
import { HOME as en } from './home/en.js';
import { HOME as es } from './home/es.js';
import { HOME as es419 } from './home/es-419.js';
import { HOME as fa } from './home/fa.js';
import { HOME as fi } from './home/fi.js';
import { HOME as fr } from './home/fr.js';
import { HOME as id } from './home/id.js';
import { HOME as it } from './home/it.js';
import { HOME as ja } from './home/ja.js';
import { HOME as ko } from './home/ko.js';
import { HOME as nb } from './home/nb.js';
import { HOME as nl } from './home/nl.js';
import { HOME as pl } from './home/pl.js';
import { HOME as pt } from './home/pt.js';
import { HOME as ptBR } from './home/pt-BR.js';
import { HOME as ru } from './home/ru.js';
import { HOME as sv } from './home/sv.js';
import { HOME as tr } from './home/tr.js';
import { HOME as uk } from './home/uk.js';
import { HOME as ur } from './home/ur.js';
import { HOME as vi } from './home/vi.js';
import { HOME as zhHans } from './home/zh-Hans.js';
import { HOME as zhHant } from './home/zh-Hant.js';
import type { Language } from './texts.js';

/**
 * The start page's texts in every language, for the server: it writes them
 * into the HTML of the start page, so a search engine that runs no JavaScript
 * reads the same page people see. The client takes one language at a time from
 * `home/<code>.ts` instead, and so loads only the languages it shows; this
 * module is therefore not exported from the package index.
 */
export const HOME_TEXTS: Record<Language, HomeTexts> = {
  ar,
  cs,
  de,
  en,
  es,
  'es-419': es419,
  fa,
  fi,
  fr,
  id,
  it,
  ja,
  ko,
  nb,
  nl,
  pl,
  pt,
  'pt-BR': ptBR,
  ru,
  sv,
  tr,
  uk,
  ur,
  vi,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
};
