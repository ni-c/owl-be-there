import { EMOJIS, encodeQr, type EventViewData } from '@owl/shared';
import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { CopyIcon, ShareIcon } from './icons.tsx';
import { Owl } from './Owl.tsx';
import { Button, Dialog, Notice } from './ui.tsx';
import { eventLink } from '../lib/links.ts';

/** Copy text, falling back to selecting it where the clipboard is refused. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const id = `copy-${label.replace(/\W/g, '')}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={value}
          onFocus={(event) => event.target.select()}
          className="min-h-11 min-w-0 flex-1 rounded-2xl border-2 border-line bg-sunken px-3 text-sm"
        />
        <Button
          onClick={async () => {
            if (await copy(value)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } else {
              (
                document.getElementById(id) as HTMLInputElement | null
              )?.select();
            }
          }}
          aria-label={`${t('share.copy')}: ${label}`}
        >
          <CopyIcon size={18} />
          <span aria-live="polite">
            {copied ? t('share.copied') : t('share.copy')}
          </span>
        </Button>
      </div>
    </div>
  );
}

/** The event link as a QR code, drawn as one SVG path. */
export function QrCode({ text, size = 200 }: { text: string; size?: number }) {
  const path = useMemo(() => {
    const matrix = encodeQr(text);
    let d = '';
    matrix.modules.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x + 4} ${y + 4}h1v1h-1z`;
      })
    );
    return { d, size: matrix.size + 8 };
  }, [text]);
  return (
    <svg
      viewBox={`0 0 ${path.size} ${path.size}`}
      width={size}
      height={size}
      role="img"
      aria-label={text}
      shapeRendering="crispEdges"
      className="rounded-2xl"
    >
      {/* A QR code needs dark on light in every theme. */}
      <rect width={path.size} height={path.size} fill="#ffffff" />
      <path d={path.d} fill="#1b140d" />
    </svg>
  );
}

export function ShareDialog({
  open,
  onClose,
  event,
  adminToken,
  justCreated,
  publicUrl,
}: {
  open: boolean;
  onClose(): void;
  event: EventViewData;
  adminToken: string | null;
  justCreated: boolean;
  publicUrl: string | null;
}) {
  const { t } = useI18n();
  const url = eventLink(publicUrl, event.id, window.location.origin);
  const invitation = t('share.inviteText', {
    emoji: EMOJIS[event.emoji],
    title: event.title,
    url,
  });
  const canShare = typeof navigator.share === 'function';
  return (
    <Dialog open={open} onClose={onClose} title={t('share.title')}>
      <div className="flex flex-col gap-5">
        {justCreated && (
          <div className="flex items-center gap-3">
            <Owl mood="celebrating" size={72} />
            <p className="font-extrabold">{t('share.created')}</p>
          </div>
        )}
        {canShare && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              navigator
                .share({ title: event.title, text: invitation, url })
                .catch(() => undefined);
            }}
          >
            <ShareIcon />
            {t('share.native')}
          </Button>
        )}
        <CopyField label={t('share.link')} value={url} />
        <figure className="flex flex-col items-center gap-2">
          <QrCode text={url} />
          <figcaption className="text-sm font-bold text-muted">
            {t('share.qr')}
          </figcaption>
        </figure>
        {adminToken && (
          <div className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-line-strong p-4">
            <CopyField
              label={t('share.adminTitle')}
              value={`${url}#admin=${adminToken}`}
            />
            <Notice>{t('share.adminWarning')}</Notice>
          </div>
        )}
      </div>
    </Dialog>
  );
}
