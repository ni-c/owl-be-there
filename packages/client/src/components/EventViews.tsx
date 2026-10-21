import {
  createContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';
import { useI18n } from '../i18n/index.tsx';
import { rovingKeyDown } from '../lib/roving.ts';
import { Card } from './ui.tsx';

/** The level of the panel headings, so what is inside starts one lower. */
export const PanelHeadingLevel = createContext<2 | 3>(2);

export type EventTab = 'mine' | 'group';
const TABS: readonly EventTab[] = ['mine', 'group'];

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
  const { t, tn, number } = useI18n();
  const wide = useWide();
  const id = useId();
  const level = props.headingLevel === 3 ? 3 : 2;
  const Heading = level === 3 ? 'h3' : 'h2';
  const tabId = (value: EventTab) => `${id}-tab-${value}`;
  const panelId = (value: EventTab) => `${id}-panel-${value}`;

  // One tree for both layouts, so crossing the breakpoint keeps both panels
  // mounted: "My days" owns the save queue and the form input, and a panel
  // that remounts loses a save that is still retrying. Only attributes and
  // the tab strip change. In the narrow layout the heading is for screen
  // readers, the tab already names the panel.
  const headingClass = wide ? 'mb-4 text-xl font-extrabold' : 'sr-only';
  const heading = (value: EventTab) => (
    <Heading className={headingClass}>
      {value === 'mine' ? t('event.tabMine') : t('event.tabGroup')}
      {wide && value === 'group' && (
        // The dot is language-neutral; the count is a translated phrase.
        <span className="text-base font-bold text-muted">
          {' '}
          · {tn('event.answers', answered)}
        </span>
      )}
    </Heading>
  );

  return (
    <PanelHeadingLevel.Provider value={level}>
      <div
        className={
          wide ? 'grid grid-cols-2 items-start gap-5' : 'flex flex-col gap-4'
        }
      >
        {!wide && (
          <div
            role="tablist"
            aria-label={t('event.tabs')}
            className="grid grid-cols-2 rounded-full border-2 border-line bg-sunken p-1"
          >
            {TABS.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={tabId(value)}
                aria-selected={tab === value}
                aria-controls={panelId(value)}
                tabIndex={tab === value ? 0 : -1}
                onClick={() => onTab(value)}
                onKeyDown={(keyEvent) =>
                  rovingKeyDown(
                    keyEvent,
                    TABS.indexOf(value),
                    TABS.length,
                    (next) => onTab(TABS[next]!),
                    false
                  )
                }
                className={`min-h-11 rounded-full font-extrabold transition ${tab === value ? 'bg-surface shadow-card' : 'text-muted'}`}
              >
                {value === 'mine' ? (
                  t('event.tabMine')
                ) : (
                  <>
                    {t('event.tabGroup')}
                    <span
                      aria-hidden="true"
                      className="ms-1.5 inline-grid min-w-6 place-items-center rounded-full bg-line px-1.5 text-sm text-ink"
                    >
                      {number(answered)}
                    </span>
                    <span className="sr-only">
                      {' '}
                      {tn('event.answers', answered)}
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}
        {TABS.map((value) => (
          <div
            key={value}
            role={wide ? undefined : 'tabpanel'}
            id={wide ? undefined : panelId(value)}
            aria-labelledby={wide ? undefined : tabId(value)}
            hidden={!wide && tab !== value}
          >
            <Card>
              {heading(value)}
              {value === 'mine' ? mine : group}
            </Card>
          </div>
        ))}
      </div>
    </PanelHeadingLevel.Provider>
  );
}
