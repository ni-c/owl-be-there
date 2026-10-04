import { EMOJIS, type InstanceInfoData } from '@owl/shared';
import { useRef, useState } from 'react';
import { Link } from '../App.tsx';
import { CreateWizard } from '../components/CreateWizard.tsx';
import { ExampleDemo } from '../components/ExampleDemo.tsx';
import { CloseIcon, LockIcon, StarIcon } from '../components/icons.tsx';
import { Owl } from '../components/Owl.tsx';
import { Button, Card, Notice } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { forgetEvent, readMyEvents, type MyEvent } from '../lib/prefs.ts';

export function HomePage({ instance }: { instance: InstanceInfoData | null }) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [myEvents, setMyEvents] = useState<MyEvent[]>(readMyEvents);
  const wizardRef = useRef<HTMLDivElement>(null);
  const creationDisabled = instance?.creationEnabled === false;

  const start = () => {
    setCreating(true);
    requestAnimationFrame(() =>
      wizardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  const features = [
    {
      icon: <StarIcon size={24} />,
      title: t('home.feature.heat.title'),
      text: t('home.feature.heat.text'),
    },
    {
      icon: <LockIcon size={24} />,
      title: t('home.feature.private.title'),
      text: t('home.feature.private.text'),
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <section className="grid items-center gap-6 pt-4 sm:grid-cols-[1fr_auto] sm:pt-10">
        <div className="flex flex-col gap-5">
          <h1 className="text-4xl leading-tight font-black tracking-tight sm:text-5xl">
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
                <Button variant="primary" size="lg" onClick={start}>
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
        <div ref={wizardRef} className="scroll-mt-4">
          <CreateWizard onCancel={() => setCreating(false)} />
        </div>
      )}

      {myEvents.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-extrabold">{t('home.myEvents')}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {myEvents.map((event) => (
              <li
                key={event.id}
                className="flex items-center gap-2 rounded-3xl border border-line bg-surface p-2 pl-4 shadow-card"
              >
                <Link
                  href={`/e/${event.id}`}
                  className="flex min-h-12 flex-1 items-center gap-3 font-bold"
                >
                  <span className="text-2xl" aria-hidden="true">
                    {EMOJIS[event.emoji]}
                  </span>
                  <span className="flex flex-col">
                    <span>{event.title}</span>
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
                  onClick={() => {
                    forgetEvent(event.id);
                    setMyEvents(readMyEvents());
                  }}
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <Card key={feature.title} className="flex flex-col gap-2">
            <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand">
              {feature.icon}
            </span>
            <h2 className="text-lg font-extrabold">{feature.title}</h2>
            <p className="leading-relaxed text-muted">{feature.text}</p>
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
    </div>
  );
}
