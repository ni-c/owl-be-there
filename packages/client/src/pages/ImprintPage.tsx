import { addressLines } from '@owl/shared';
import { LegalPage, LegalSection } from '../components/LegalPage.tsx';
import { useI18n } from '../i18n/index.tsx';
import { instanceNotice, type InstanceState } from '../lib/instanceStore.ts';
import { imprintOperator, mailtoHref } from '../lib/imprint.ts';
import { NotFoundPage } from './NotFoundPage.tsx';

/**
 * The legal notice: who runs this instance, how to reach them, and a few
 * statements the law asks for. The operator's details come from the
 * configuration; an instance that states none of them has no such page, so
 * the path is an unknown one there.
 */
export function ImprintPage({ instance: state }: { instance: InstanceState }) {
  const { t } = useI18n();
  const status = instanceNotice(state);
  if (status !== 'loaded') {
    return (
      <LegalPage
        title={t('imprint.title')}
        notice={{
          tone: status === 'failed' ? 'error' : 'info',
          text: t(
            status === 'failed'
              ? 'privacy.instance.failed'
              : 'privacy.instance.loading'
          ),
        }}
      />
    );
  }
  const operator = imprintOperator(state.info);
  if (!operator) return <NotFoundPage />;
  const mailto = mailtoHref(operator.contact);
  return (
    <LegalPage title={t('imprint.title')}>
      <LegalSection
        title={t('imprint.provider.title')}
        paragraphs={[
          <>
            <bdi>{operator.name}</bdi>
            {addressLines(operator.address).map((line, index) => (
              <bdi key={index} className="block">
                {line}
              </bdi>
            ))}
          </>,
        ]}
      />
      <LegalSection
        title={t('imprint.contact.title')}
        paragraphs={[
          mailto ? (
            <>
              {t('imprint.contact.label')}{' '}
              <a href={mailto} className="underline underline-offset-4">
                <bdi>{operator.contact}</bdi>
              </a>
            </>
          ) : (
            <bdi>{operator.contact}</bdi>
          ),
        ]}
      />
      <LegalSection
        title={t('imprint.about.title')}
        paragraphs={[t('imprint.about.text')]}
      />
      <LegalSection
        title={t('imprint.dispute.title')}
        paragraphs={[t('imprint.dispute.text')]}
      />
      <LegalSection
        title={t('imprint.liability.title')}
        paragraphs={[t('imprint.liability.text')]}
      />
    </LegalPage>
  );
}
