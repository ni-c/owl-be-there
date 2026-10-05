import {
  isLanguage,
  LANGUAGE_NAMES,
  languagesByName,
  type InstanceInfoData,
} from '@owl/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Owl } from './components/Owl.tsx';
import { Select } from './components/ui.tsx';
import { I18nProvider, useI18n } from './i18n/index.tsx';
import { api } from './lib/api.ts';
import { OWL_ICON, setFavicon } from './lib/favicon.ts';
import { readTheme, writeTheme, type ThemeChoice } from './lib/prefs.ts';
import { usePathname } from './hooks/usePathname.ts';
import { navigate, parseRoute, type Route } from './lib/route.ts';
import { EventPage } from './pages/EventPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { PrivacyPage } from './pages/PrivacyPage.tsx';

export function App() {
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}

/** What the instance says about itself, fetched once and shared. */
function useInstance(): InstanceInfoData | null {
  const [info, setInfo] = useState<InstanceInfoData | null>(null);
  useEffect(() => {
    api.instance().then(setInfo, () => setInfo(null));
  }, []);
  return info;
}

function Shell() {
  const route = parseRoute(usePathname());
  const instance = useInstance();
  const { t, language, setLanguage } = useI18n();

  // `/fr` reached by the back button or a link: the page follows the address.
  const pathLanguage = route.page === 'home' ? route.language : undefined;
  useEffect(() => {
    if (pathLanguage && pathLanguage !== language) setLanguage(pathLanguage);
  }, [pathLanguage, language, setLanguage]);

  useEffect(() => {
    if (route.page !== 'event') {
      document.title = `${t('app.name')} — ${t('app.tagline')}`;
      setFavicon(OWL_ICON);
    }
  }, [route.page, t]);

  let page: ReactNode;
  switch (route.page) {
    case 'home':
      page = <HomePage instance={instance} />;
      break;
    case 'event':
      page = (
        <EventPage
          key={route.id}
          id={route.id}
          publicUrl={instance?.publicUrl ?? null}
        />
      );
      break;
    case 'privacy':
      page = <PrivacyPage instance={instance} />;
      break;
    default:
      page = <NotFoundPage />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-12 sm:px-6">
        {page}
      </main>
      <Footer instance={instance} route={route} />
    </div>
  );
}

/** An internal link that changes the page without reloading it. */
export function Link({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        )
          return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

function Header() {
  const { t } = useI18n();
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-3 sm:px-6">
      <Link
        href="/"
        className="flex items-center gap-2 rounded-full pr-3 font-black"
      >
        <Owl size={40} />
        <span className="text-xl tracking-tight">{t('app.name')}</span>
      </Link>
    </header>
  );
}

function Footer({
  instance,
  route,
}: {
  instance: InstanceInfoData | null;
  route: Route;
}) {
  const { t, language, setLanguage } = useI18n();
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  const choose = (next: ThemeChoice) => {
    setTheme(next);
    writeTheme(next);
  };
  const selectClass =
    'min-h-10 rounded-full border-2 border-line bg-surface pl-3 font-bold text-ink focus:border-focus focus:outline-none';
  return (
    <footer className="border-t border-line bg-sunken/60">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="font-bold">{t('footer.language')}</span>
            <Select
              className={selectClass}
              value={language}
              onChange={(event) => {
                const next = event.target.value;
                if (!isLanguage(next)) return;
                setLanguage(next);
                // On `/de`, choosing French moves to `/fr` rather than
                // leaving a German address with a French page.
                if (route.page === 'home' && route.language)
                  navigate(`/${next}`, { replace: true, keepScroll: true });
              }}
            >
              {languagesByName().map((code) => (
                <option key={code} value={code} lang={code}>
                  {LANGUAGE_NAMES[code]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2">
            <span className="font-bold">{t('footer.theme')}</span>
            <Select
              className={selectClass}
              value={theme}
              onChange={(event) => choose(event.target.value as ThemeChoice)}
            >
              <option value="system">{t('theme.system')}</option>
              <option value="light">{t('theme.light')}</option>
              <option value="dark">{t('theme.dark')}</option>
            </Select>
          </label>
        </div>
        <nav className="flex flex-wrap items-center gap-4 font-bold">
          {route.page !== 'home' && (
            <Link href="/" className="underline-offset-4 hover:underline">
              {t('home.cta')}
            </Link>
          )}
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            {t('footer.privacy')}
          </Link>
          {instance?.imprintUrl && (
            <a
              href={instance.imprintUrl}
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {t('footer.imprint')}
            </a>
          )}
          <a
            href="https://github.com/ni-c/owl-be-there"
            rel="noopener noreferrer"
            className="underline-offset-4 hover:underline"
          >
            {t('footer.source')}
          </a>
        </nav>
      </div>
    </footer>
  );
}
