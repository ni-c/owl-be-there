import {
  EMOJIS,
  FAQ_TOPICS,
  FEATURES,
  type Feature,
  type InstanceInfoData,
} from '@owl/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from '../App.tsx';
import { CreateWizard } from '../components/CreateWizard.tsx';
import { ExampleDemo } from '../components/ExampleDemo.tsx';
import { CloseIcon, LockIcon, StarIcon } from '../components/icons.tsx';
import { Owl } from '../components/Owl.tsx';
import { Button, Card, Dialog, Notice } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { isolate } from '../lib/bidi.ts';
import { scrollBehavior } from '../lib/motion.ts';
import { forgetEvent, readMyEvents, type MyEvent } from '../lib/prefs.ts';

// A missing icon is a compile error when a feature is added to FEATURES.
const FEATURE_ICONS: Record<Feature, ReactNode> = {
  heat: <StarIcon size={24} />,
  private: <LockIcon size={24} />,
};

export function HomePage({ instance }: { instance: InstanceInfoData | null }) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [myEvents, setMyEvents] = useState<MyEvent[]>(readMyEvents);
  // The organiser key lives only in this browser: forgetting such an event
  // asks first, and a plain list entry goes at once.
  const [forgetting, setForgetting] = useState<MyEvent | null>(null);
  const wizardRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const forgottenAt = useRef(0);
  const cancelled = useRef(false);
  const creationDisabled = instance?.creationEnabled === false;

  const start = () => {
    setCreating(true);
    requestAnimationFrame(() => {
      wizardRef.current?.focus({ preventScroll: true });
      wizardRef.current?.scrollIntoView({
        behavior: scrollBehavior(),
        block: 'start',
      });
    });
  };

  // The start button is gone while the wizard is open: give focus back to it.
  useEffect(() => {
    if (!creating && cancelled.current) {
      cancelled.current = false;
      startRef.current?.focus();
    }
  }, [creating]);

  const forget = (event: MyEvent) => {
    forgottenAt.current = myEvents.findIndex((mine) => mine.id === event.id);
    forgetEvent(event.id);
    setMyEvents(readMyEvents());
    // A one-tap removal has no dialog to return focus: land on the neighbour.
    if (event.role !== 'organiser') {
      requestAnimationFrame(() =>
        (afterForget() ?? document.querySelector<HTMLElement>('main'))?.focus()
      );
    }
  };

  // The opener is gone: the entry that took its place, else the last one.
  const afterForget = () => {
    const links = listRef.current?.querySelectorAll<HTMLElement>('li > a');
    return links?.item(Math.min(forgottenAt.current, links.length - 1)) ?? null;
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="grid items-center gap-6 pt-4 sm:grid-cols-[1fr_auto] sm:pt-10">
        <div className="flex flex-col gap-5">
          <h1 className="text-4xl leading-tight font-black sm:text-5xl ltr:tracking-tight rtl:leading-normal [&:lang(vi)]:leading-snug">
            {t('app.tagline')}
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted">
            {t('home.lead')}
          </p>
          {creationDisabled ? (
            <Notice>{t('home.creationDisabled')}</Notice>
          ) : (
            !creating && (
              <div>
                <Button
                  ref={startRef}
                  variant="primary"
                  size="lg"
                  onClick={start}
                >
                  {t('home.cta')}
                </Button>
              </div>
            )
          )}
        </div>
        {/* On a phone the owl greets first, above the heading; beside it on wider screens. */}
        <div className="order-first justify-self-center sm:order-none">
          <Owl mood="happy" size={190} bob />
        </div>
      </section>

      {creating && !creationDisabled && (
        <div
          ref={wizardRef}
          tabIndex={-1}
          role="region"
          aria-label={t('create.title')}
          className="scroll-mt-4 outline-none"
        >
          <CreateWizard
            onCancel={() => {
              cancelled.current = true;
              setCreating(false);
            }}
          />
        </div>
      )}

      {myEvents.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-extrabold">{t('home.myEvents')}</h2>
          <ul ref={listRef} className="grid gap-3 sm:grid-cols-2">
            {myEvents.map((event) => (
              <li
                key={event.id}
                className="flex items-center gap-2 rounded-3xl border border-line bg-surface p-2 ps-4 shadow-card"
              >
                <Link
                  href={`/e/${event.id}`}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 font-bold"
                >
                  <span className="text-2xl" aria-hidden="true">
                    {EMOJIS[event.emoji]}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="wrap-anywhere" dir="auto">
                      {event.title}
                    </span>
                    {event.role === 'organiser' && (
                      <span className="text-sm font-semibold text-muted">
                        {t('home.organiser')}
                      </span>
                    )}
                  </span>
                </Link>
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink"
                  aria-label={t('home.forget', { title: event.title })}
                  onClick={() =>
                    event.role === 'organiser'
                      ? setForgetting(event)
                      : forget(event)
                  }
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog
        open={forgetting !== null}
        onClose={() => setForgetting(null)}
        title={t('home.forgetOrganiser.title')}
        returnFocus={afterForget}
      >
        <div className="flex flex-col gap-5">
          <p className="leading-relaxed wrap-anywhere">
            {forgetting &&
              t('home.forgetOrganiser.text', {
                title: isolate(forgetting.title),
              })}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setForgetting(null)}>
              {t('mine.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (forgetting) forget(forgetting);
                setForgetting(null);
              }}
            >
              {t('home.forgetOrganiser.yes')}
            </Button>
          </div>
        </div>
      </Dialog>

      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <Card key={feature} className="flex flex-col gap-2">
            <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand">
              {FEATURE_ICONS[feature]}
            </span>
            <h2 className="text-lg font-extrabold">
              {t(`home.feature.${feature}.title`)}
            </h2>
            <p className="leading-relaxed text-muted">
              {t(`home.feature.${feature}.text`)}
            </p>
          </Card>
        ))}
      </section>

      {/* The real thing, with made-up people: next month's team dinner. Out of
          the way while someone plans their own event. */}
      {!creating && (
        <section className="flex flex-col gap-4 rounded-3xl bg-sunken p-4 sm:p-8">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-extrabold">
              {t('home.example.title')}
            </h2>
            <p className="leading-relaxed text-muted">
              {t('home.example.text')}
            </p>
          </div>
          <ExampleDemo />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-extrabold">{t('home.faq.title')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FAQ_TOPICS.map((topic) => (
            <Card key={topic} className="flex flex-col gap-2">
              <h3 className="text-lg font-extrabold">
                {t(`home.faq.${topic}.q`)}
              </h3>
              <p className="leading-relaxed text-muted">
                {t(`home.faq.${topic}.a`)}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
