import { Link } from '../App.tsx';
import { Owl } from '../components/Owl.tsx';
import { useI18n } from '../i18n/index.tsx';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <Owl mood="confused" size={160} />
      <h1 className="text-3xl font-black">{t('notFound.title')}</h1>
      <Link
        href="/"
        className="rounded-full bg-brand px-6 py-3 font-bold text-brand-ink"
      >
        {t('notFound.home')}
      </Link>
    </div>
  );
}
