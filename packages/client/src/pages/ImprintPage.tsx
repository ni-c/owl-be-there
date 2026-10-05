import { addressLines, hasImprint } from '@owl/shared';
import { Card, Notice } from '../components/ui.tsx';
import { Owl } from '../components/Owl.tsx';
import { useI18n } from '../i18n/index.tsx';
import { instanceNotice, type InstanceState } from '../lib/instanceStore.ts';
import { mailtoHref } from '../lib/imprint.ts';
import { NotFoundPage } from './NotFoundPage.tsx';

/**
 * The legal notice: who runs this instance, how to reach them, and a few
 * statements the law asks for. The operator's details come from the
 * configuration; an instance that states none of them has no such page, so
 * the path is an unknown one there.
 */
export function ImprintPage({ instance: state }: { instance: InstanceState }) {
  const { t } = useI18n();
  const instance = state.info;
  const status = instanceNotice(state);
  if (status !== 'loaded') {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Notice tone={status === 'failed' ? 'error' : 'info'}>
          {t(
            status === 'failed'
              ? 'privacy.instance.failed'
              : 'privacy.instance.loading'
          )}
        </Notice>
      </div>
    );
  }
  if (
    !instance?.operatorName ||
    !instance.operatorAddress ||
    !instance.operatorContact ||
    !hasImprint(instance)
  ) {
    return <NotFoundPage />;
  }
  const mailto = mailtoHref(instance.operatorContact);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-4">
        <Owl mood="thinking" size={88} />
        <h1 className="text-3xl font-black">{t('imprint.title')}</h1>
      </div>
      <Card className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">
            {t('imprint.provider.title')}
          </h2>
          <p className="leading-relaxed">
            {instance.operatorName}
            {addressLines(instance.operatorAddress).map((line, index) => (
              <span key={index} className="block">
                {line}
              </span>
            ))}
          </p>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">
            {t('imprint.contact.title')}
          </h2>
          <p className="leading-relaxed">
            {t('imprint.contact.label')}{' '}
            {mailto ? (
              <a href={mailto} className="underline underline-offset-4">
                {instance.operatorContact}
              </a>
            ) : (
              instance.operatorContact
            )}
          </p>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">{t('imprint.about.title')}</h2>
          <p className="leading-relaxed">{t('imprint.about.text')}</p>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">
            {t('imprint.dispute.title')}
          </h2>
          <p className="leading-relaxed">{t('imprint.dispute.text')}</p>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">
            {t('imprint.liability.title')}
          </h2>
          <p className="leading-relaxed">{t('imprint.liability.text')}</p>
        </section>
      </Card>
    </div>
  );
}
