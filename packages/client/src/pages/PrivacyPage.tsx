import { RETENTION_DAYS } from '@owl/shared';
import { Card, Notice } from '../components/ui.tsx';
import { Owl } from '../components/Owl.tsx';
import { useI18n } from '../i18n/index.tsx';
import { instanceNotice, type InstanceState } from '../lib/instanceStore.ts';
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
  const section = (
    title: string,
    ...paragraphs: (string | false | null | undefined)[]
  ) => (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-extrabold">{title}</h2>
      {paragraphs.filter(Boolean).map((text) => (
        <p key={text as string} className="leading-relaxed">
          {text}
        </p>
      ))}
    </section>
  );
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-4">
        <Owl mood="thinking" size={88} />
        <h1 className="text-3xl font-black">{t('privacy.title')}</h1>
      </div>
      <Card className="flex flex-col gap-6">
        <p className="text-lg leading-relaxed">{t('privacy.intro')}</p>
        {section(
          t('privacy.stored.title'),
          t('privacy.stored.event'),
          t('privacy.stored.person'),
          t('privacy.stored.nothingElse')
        )}
        {section(t('privacy.visible.title'), t('privacy.visible.text'))}
        {section(t('privacy.device.title'), t('privacy.device.text'))}
        {section(
          t('privacy.retention.title'),
          t('privacy.retention.text', {
            days: instance?.retentionDays ?? RETENTION_DAYS,
          }),
          retention('privacy.logs', instance?.logRetentionDays),
          retention('privacy.backups', instance?.backupRetentionDays)
        )}
        {status !== 'loaded' && (
          <Notice tone={status === 'failed' ? 'error' : 'info'}>
            {t(
              status === 'failed'
                ? 'privacy.instance.failed'
                : 'privacy.instance.loading'
            )}
          </Notice>
        )}
        {(instance?.operatorName || instance?.operatorContact) &&
          section(
            t('privacy.operator.title'),
            instance.operatorName,
            instance.operatorContact &&
              t('privacy.operator.contact', {
                contact: instance.operatorContact,
              })
          )}
        <p className="text-muted">{t('privacy.source')}</p>
      </Card>
    </div>
  );
}
