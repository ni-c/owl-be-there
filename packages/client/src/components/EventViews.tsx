import { useEffect, useId, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { Card } from './ui.tsx';

export type EventTab = 'mine' | 'group';

/** Wide enough for the two views side by side (56rem). */
function useWide(): boolean {
  const query = '(min-width: 56rem)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setWide(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);
  return wide;
}

/**
 * "My days" and "Group": side by side where there is room, as two tabs on
 * a phone. Used by the event page and by the example on the start page, which
 * sits under a heading of its own and so starts a level lower.
 */
export function EventViews(props: {
  mine: ReactNode;
  group: ReactNode;
  answered: number;
  tab: EventTab;
  onTab(tab: EventTab): void;
  headingLevel?: 2 | 3;
}) {
  const { mine, group, answered, tab, onTab } = props;
  const { t, tn } = useI18n();
  const wide = useWide();
  const id = useId();
  const Heading = props.headingLevel === 3 ? 'h3' : 'h2';
  const tabId = (value: EventTab) => `${id}-tab-${value}`;

  if (wide) {
    return (
      <div className="grid grid-cols-2 items-start gap-5">
        <Card>
          <Heading className="mb-4 text-xl font-extrabold">
            {t('event.tabMine')}
          </Heading>
          {mine}
        </Card>
        <Card>
          <Heading className="mb-4 text-xl font-extrabold">
            {t('event.tabGroup')}{' '}
            <span className="text-base font-bold text-muted">
              · {tn('event.answers', answered)}
            </span>
          </Heading>
          {group}
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={t('event.tabs')}
        className="grid grid-cols-2 rounded-full border-2 border-line bg-sunken p-1"
      >
        {(['mine', 'group'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={tabId(value)}
            aria-selected={tab === value}
            aria-controls={`${id}-panel`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => onTab(value)}
            onKeyDown={(keyEvent) => {
              if (
                keyEvent.key === 'ArrowRight' ||
                keyEvent.key === 'ArrowLeft'
              ) {
                keyEvent.preventDefault();
                const next = value === 'mine' ? 'group' : 'mine';
                onTab(next);
                document.getElementById(tabId(next))?.focus();
              }
            }}
            className={`min-h-11 rounded-full font-extrabold transition ${tab === value ? 'bg-surface shadow-card' : 'text-muted'}`}
          >
            {value === 'mine' ? (
              t('event.tabMine')
            ) : (
              <>
                {t('event.tabGroup')}
                <span
                  aria-hidden="true"
                  className="ml-1.5 inline-grid min-w-6 place-items-center rounded-full bg-line px-1.5 text-sm text-ink"
                >
                  {answered}
                </span>
                <span className="sr-only">
                  , {tn('event.answers', answered)}
                </span>
              </>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={tabId(tab)}>
        <Card>{tab === 'mine' ? mine : group}</Card>
      </div>
    </div>
  );
}
