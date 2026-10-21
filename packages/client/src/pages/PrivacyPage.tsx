import { RETENTION_DAYS } from '@owl/shared';
import { LegalPage, LegalSection } from '../components/LegalPage.tsx';
import { Notice } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { instanceNotice, type InstanceState } from '../lib/instanceStore.ts';
import { isolate } from '../lib/bidi.ts';
import { retentionNote } from '../lib/retentionText.ts';

/**
 * What is stored and for how long. The parts that depend on the instance —
 * who runs it, how long its proxy keeps logs and its backups last — come from
 * the operator's configuration and are left out when the operator states
 * nothing. While they are still loading, or could not be loaded, the page
 * says so instead of passing for complete.
 */
export function PrivacyPage({ instance: state }: { instance: InstanceState }) {
  const { t, tn } = useI18n();
  const instance = state.info;
  const status = instanceNotice(state);
  const retention = (
    key: 'privacy.logs' | 'privacy.backups',
    days: number | null | undefined
  ) => {
    const note = retentionNote(days);
    if (!note) return null;
    return note.kind === 'none' ? t(`${key}.none`) : tn(key, note.days);
  };
  return (
    <LegalPage title={t('privacy.title')}>
      <p className="text-lg leading-relaxed">{t('privacy.intro')}</p>
      <LegalSection
        title={t('privacy.stored.title')}
        paragraphs={[
          t('privacy.stored.event'),
          t('privacy.stored.person'),
          t('privacy.stored.nothingElse'),
        ]}
      />
      <LegalSection
        title={t('privacy.visible.title')}
        paragraphs={[t('privacy.visible.text')]}
      />
      <LegalSection
        title={t('privacy.device.title')}
        paragraphs={[t('privacy.device.text')]}
      />
      <LegalSection
        title={t('privacy.retention.title')}
        paragraphs={[
          t('privacy.retention.text', {
            days: instance?.retentionDays ?? RETENTION_DAYS,
          }),
          retention('privacy.logs', instance?.logRetentionDays),
          retention('privacy.backups', instance?.backupRetentionDays),
        ]}
      />
      {status !== 'loaded' && (
        <Notice tone={status === 'failed' ? 'error' : 'info'}>
          {t(
            status === 'failed'
              ? 'privacy.instance.failed'
              : 'privacy.instance.loading'
          )}
        </Notice>
      )}
      {(instance?.operatorName || instance?.operatorContact) && (
        <LegalSection
          title={t('privacy.operator.title')}
          paragraphs={[
            instance.operatorName && <bdi>{instance.operatorName}</bdi>,
            instance.operatorContact &&
              t('privacy.operator.contact', {
                contact: isolate(instance.operatorContact),
              }),
          ]}
        />
      )}
      <p className="text-muted break-words">{t('privacy.source')}</p>
    </LegalPage>
  );
}
