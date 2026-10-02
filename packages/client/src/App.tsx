import type { InstanceInfoData } from '@owl/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Owl } from './components/Owl.tsx';
import { I18nProvider, useI18n } from './i18n/index.tsx';
import { api } from './lib/api.ts';
import { readTheme, writeTheme, type ThemeChoice } from './lib/prefs.ts';
import { usePathname } from './hooks/usePathname.ts';
import { navigate, parseRoute } from './lib/route.ts';
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
  const { t } = useI18n();

  useEffect(() => {
    if (route.page !== 'event')
      document.title = `${t('app.name')} — ${t('app.tagline')}`;
  }, [route.page, t]);

  let page: ReactNode;
  switch (route.page) {
    case 'home':
      page = <HomePage instance={instance} />;
      break;
    case 'event':
      page = <EventPage key={route.id} id={route.id} />;
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
      <Footer instance={instance} />
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

function Footer({ instance }: { instance: InstanceInfoData | null }) {
  const { t, language, setLanguage } = useI18n();
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  const choose = (next: ThemeChoice) => {
    setTheme(next);
    writeTheme(next);
  };
  const selectClass =
    'min-h-10 rounded-full border-2 border-line bg-surface px-3 font-bold text-ink focus:border-focus focus:outline-none';
  return (
    <footer className="border-t border-line bg-sunken/60">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="font-bold">{t('footer.language')}</span>
            <select
              className={selectClass}
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value === 'de' ? 'de' : 'en')
              }
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="font-bold">{t('footer.theme')}</span>
            <select
              className={selectClass}
              value={theme}
              onChange={(event) => choose(event.target.value as ThemeChoice)}
            >
              <option value="system">{t('theme.system')}</option>
              <option value="light">{t('theme.light')}</option>
              <option value="dark">{t('theme.dark')}</option>
            </select>
          </label>
        </div>
        <nav className="flex flex-wrap items-center gap-4 font-bold">
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
