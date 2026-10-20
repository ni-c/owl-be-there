import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
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
};
