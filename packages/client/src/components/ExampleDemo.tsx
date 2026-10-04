import {
  EMOJIS,
  exampleSnapshot,
  marksOf,
  monthAfter,
  othersOnDays,
  PEOPLE,
  sameMarks,
  todayLocal,
  type Marks,
} from '@owl/shared';
import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { firstWeekdayFor } from '../lib/locale.ts';
import { BrowserFrame } from './BrowserFrame.tsx';
import { EventViews, type EventTab } from './EventViews.tsx';
import { GroupView } from './GroupView.tsx';
import { MarksEditor } from './MarksEditor.tsx';
import { Button } from './ui.tsx';

/**
 * The example on the start page: ten people planning a team dinner over next
 * month, built from the same parts as an event page. A visitor paints as Anna
 * and sees the group's calendar follow. Nothing leaves the page — no request,
 * no storage — and a reload or "Start over" brings the example back.
 */
export function ExampleDemo() {
  const { t } = useI18n();
  const today = useMemo(() => todayLocal(), []);
  const firstWeekday = useMemo(() => firstWeekdayFor(navigator.language), []);
  const days = useMemo(() => monthAfter(today), [today]);
  const start = useMemo(() => marksOf(PEOPLE[0]!.rule, days), [days]);
  const [anna, setAnna] = useState<Marks>(start);
  const [tab, setTab] = useState<EventTab>('mine');
  // A new key starts the editor afresh, its undo history included.
  const [round, setRound] = useState(0);

  const title = t('home.example.eventTitle');
  const data = useMemo(
    () => exampleSnapshot({ today, title, anna }),
    [today, title, anna]
  );
  const annaId = data.participants[0]!.id;
  const hints = useMemo(
    () => othersOnDays(data.event.days, data.participants, annaId),
    [data, annaId]
  );
  const answered = data.participants.filter((p) => p.answered).length;
  const changed = !sameMarks(anna, start);

  const mine = (
    <div className="flex flex-col gap-3">
      <p className="text-lg font-extrabold">
        {t('mine.hello', { name: 'Anna' })}
      </p>
      <MarksEditor
        key={round}
        days={data.event.days}
        marks={anna}
        onMarksChange={setAnna}
        hints={hints}
        firstWeekday={firstWeekday}
        today={today}
        label={t('event.tabMine')}
      />
    </div>
  );
  const group = (
    <GroupView
      data={data}
      adminToken={null}
      firstWeekday={firstWeekday}
      today={today}
    />
  );

  return (
    <BrowserFrame
      emoji={EMOJIS[data.event.emoji]}
      title={`${title} · ${t('app.name')}`}
      path={`/e/${data.event.id}`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-muted">
            {t('home.example.hint')}
          </p>
          <Button
            size="sm"
            variant="ghost"
            disabled={!changed}
            onClick={() => {
              setAnna(start);
              setRound((n) => n + 1);
            }}
          >
            {t('home.example.reset')}
          </Button>
        </div>
        <EventViews
          mine={mine}
          group={group}
          answered={answered}
          tab={tab}
          onTab={setTab}
          headingLevel={3}
        />
      </div>
    </BrowserFrame>
  );
}
