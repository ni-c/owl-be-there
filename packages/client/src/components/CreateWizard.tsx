import {
  addDays,
  compareISODate,
  diffDays,
  EMOJI_KEYS,
  EMOJIS,
  expandRange,
  formatDay,
  isValidISODate,
  LIMITS,
  todayLocal,
  WEEKDAYS,
  type EmojiKey,
  type ISODate,
  type Mark,
  type Weekday,
} from '@owl/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { daysProblem, type Problem } from '../lib/dayEdit.ts';
import { errorMessage } from '../lib/errors.ts';
import { checkMinCount, parseRoster, radioTarget } from '../lib/forms.ts';
import { firstWeekdayFor } from '../lib/locale.ts';
import { rememberEvent, writeAdminToken } from '../lib/prefs.ts';
import { navigate } from '../lib/route.ts';
import { CalendarGrid } from './CalendarGrid.tsx';
import { Button, Card, Field, Notice, TextArea, TextInput } from './ui.tsx';

const STEPS = 3;

/**
 * Three steps: what, when, who. The days are chosen as a range and a set of
 * weekdays, then fine-tuned by painting in the same calendar the participants
 * will use — so the organiser has used it once before sending the link.
 */
export function CreateWizard({ onCancel }: { onCancel(): void }) {
  const { t, tn, language, locale } = useI18n();
  const today = todayLocal();
  const firstWeekday = useMemo(() => firstWeekdayFor(navigator.language), []);

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState<EmojiKey>('owl');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [from, setFrom] = useState(addDays(today, 1));
  const [to, setTo] = useState(addDays(today, 28));
  const [weekdays, setWeekdays] = useState<Set<Weekday>>(new Set());
  const [manual, setManual] = useState<Map<ISODate, Mark> | null>(null);
  const [duration, setDuration] = useState(1);
  const [roster, setRoster] = useState('');
  const [minCount, setMinCount] = useState('');
  // The steps the organiser has tried to leave: their problems show from then
  // on and follow the input, so a fixed field loses its message at once.
  const [tried, setTried] = useState<ReadonlySet<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const rangeProblem = useMemo(() => {
    if (!isValidISODate(from) || !isValidISODate(to)) return t('error.noDays');
    if (compareISODate(from, today) < 0) return t('error.past');
    if (compareISODate(to, addDays(today, LIMITS.horizon)) > 0)
      return t('error.tooFar');
    if (compareISODate(to, from) < 0) return t('error.range');
    if (diffDays(from, to) + 1 > LIMITS.span) return t('error.rangeTooLong');
    return null;
  }, [from, to, today, t]);

  const rangeDays = useMemo(
    () => (rangeProblem ? [] : expandRange(from, to)),
    [from, to, rangeProblem]
  );
  const automatic = useMemo(
    () => (rangeProblem ? [] : expandRange(from, to, weekdays)),
    [from, to, weekdays, rangeProblem]
  );
  const marks = useMemo(
    () => manual ?? new Map(automatic.map((day) => [day, 'yes' as Mark])),
    [manual, automatic]
  );
  const candidates = useMemo(() => [...marks.keys()].sort(), [marks]);

  const resetDays = () => {
    setManual(null);
  };

  const dayProblem = (): string | null => {
    if (rangeProblem) return rangeProblem;
    const problem = daysProblem(candidates, duration);
    return problem && t(problem.key, problem.params);
  };
  const minCountProblem = checkMinCount(minCount).problem;
  const parsedRoster = parseRoster(roster);
  const text = (problem: Problem | null) =>
    problem && t(problem.key, problem.params);

  const titleError =
    tried.has(1) && title.trim() === '' ? t('error.titleRequired') : null;
  const daysError = tried.has(2) ? dayProblem() : rangeProblem;
  const minCountError = tried.has(3) ? text(minCountProblem) : null;
  const rosterError = tried.has(3) ? text(parsedRoster.problem) : null;

  const validate = (which: number): boolean => {
    setTried((current) => new Set(current).add(which));
    if (which === 1) return title.trim() !== '';
    if (which === 2) return dayProblem() === null;
    return minCountProblem === null && parsedRoster.problem === null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (step < STEPS) {
      if (validate(step)) setStep(step + 1);
      return;
    }
    if (!validate(1) || !validate(2) || !validate(3)) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const names = parsedRoster.names;
      const created = await api.createEvent({
        title,
        emoji,
        language,
        durationDays: duration,
        days: candidates,
        ...(description.trim() && { description }),
        ...(location.trim() && { location }),
        ...(creatorName.trim() && { creatorName }),
        ...(minCount.trim() && { minCount: Number(minCount) }),
        ...(names.length > 0 && { roster: names }),
      });
      writeAdminToken(created.id, created.adminToken);
      rememberEvent(
        { id: created.id, title: title.trim(), emoji },
        'organiser'
      );
      navigate(`/e/${created.id}`, { state: { created: true } });
    } catch (error) {
      setSubmitError(errorMessage(error, t));
      setSubmitting(false);
    }
  };

  const weekdayOrder = WEEKDAYS.map(
    (offset) => ((firstWeekday + offset) % 7) as Weekday
  );
  const weekdayName = (weekday: Weekday, style: 'short' | 'long') =>
    formatDay(addDays('2024-01-01', weekday), locale, { weekday: style });

  return (
    <Card>
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="flex flex-col gap-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-black">{t('create.title')}</h2>
          <p className="font-bold text-muted">
            {t('create.step', { current: step, total: STEPS })}
          </p>
        </div>
        <div className="flex gap-2" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-brand' : 'bg-line'}`}
            />
          ))}
        </div>

        {step === 1 && (
          <fieldset className="flex flex-col gap-5">
            <legend className="mb-4 text-xl font-extrabold">
              {t('create.what')}
            </legend>
            <Field label={t('create.titleLabel')} error={titleError}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  value={title}
                  maxLength={LIMITS.title}
                  placeholder={t('create.titlePlaceholder')}
                  onChange={(event) => setTitle(event.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  required
                />
              )}
            </Field>
            <div className="flex flex-col gap-2">
              <span className="font-bold" id="emoji-label">
                {t('create.emoji')}
              </span>
              <div
                role="radiogroup"
                aria-labelledby="emoji-label"
                className="flex flex-wrap gap-1.5"
              >
                {EMOJI_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={emoji === key}
                    aria-label={t(`emoji.${key}`)}
                    title={t(`emoji.${key}`)}
                    data-emoji={key}
                    // One stop in the tab order; the arrow keys move within.
                    tabIndex={emoji === key ? 0 : -1}
                    onClick={() => setEmoji(key)}
                    onKeyDown={(event) => {
                      const target = radioTarget(EMOJI_KEYS, emoji, event.key);
                      if (!target) return;
                      event.preventDefault();
                      setEmoji(target);
                      event.currentTarget.parentElement
                        ?.querySelector<HTMLElement>(`[data-emoji="${target}"]`)
                        ?.focus();
                    }}
                    className={`grid size-11 place-items-center rounded-2xl text-2xl transition ${
                      emoji === key
                        ? 'bg-brand-soft ring-2 ring-brand'
                        : 'hover:bg-sunken'
                    }`}
                  >
                    {EMOJIS[key]}
                  </button>
                ))}
              </div>
            </div>
            <Field
              label={t('create.description')}
              hint={t('create.descriptionHint')}
            >
              {({ id, describedBy }) => (
                <TextArea
                  id={id}
                  value={description}
                  maxLength={LIMITS.description}
                  onChange={(event) => setDescription(event.target.value)}
                  aria-describedby={describedBy}
                />
              )}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('create.location')}>
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={location}
                    maxLength={LIMITS.location}
                    placeholder={t('create.locationPlaceholder')}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                )}
              </Field>
              <Field label={t('create.creator')} hint={t('create.creatorHint')}>
                {({ id, describedBy }) => (
                  <TextInput
                    id={id}
                    value={creatorName}
                    maxLength={LIMITS.creatorName}
                    autoComplete="name"
                    onChange={(event) => setCreatorName(event.target.value)}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
            </div>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset className="flex flex-col gap-5">
            <legend className="mb-4 text-xl font-extrabold">
              {t('create.when')}
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('create.from')}>
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="date"
                    value={from}
                    min={today}
                    onChange={(event) => {
                      setFrom(event.target.value);
                      if (
                        isValidISODate(event.target.value) &&
                        compareISODate(to, event.target.value) < 0
                      ) {
                        setTo(event.target.value);
                      }
                      resetDays();
                    }}
                  />
                )}
              </Field>
              <Field label={t('create.to')}>
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="date"
                    value={to}
                    min={from}
                    onChange={(event) => {
                      setTo(event.target.value);
                      resetDays();
                    }}
                  />
                )}
              </Field>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-bold" id="weekdays-label">
                {t('create.weekdays')}
              </span>
              <div
                role="group"
                aria-labelledby="weekdays-label"
                className="flex flex-wrap gap-1.5"
              >
                {weekdayOrder.map((weekday) => {
                  const on = weekdays.has(weekday);
                  return (
                    <button
                      key={weekday}
                      type="button"
                      aria-pressed={on}
                      aria-label={weekdayName(weekday, 'long')}
                      onClick={() => {
                        const next = new Set(weekdays);
                        if (on) next.delete(weekday);
                        else next.add(weekday);
                        setWeekdays(next);
                        resetDays();
                      }}
                      className={`min-h-11 min-w-12 rounded-full border-2 px-3 font-bold ${
                        on
                          ? 'border-brand bg-brand-soft'
                          : 'border-line bg-surface text-muted'
                      }`}
                    >
                      {weekdayName(weekday, 'short')}
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-muted">{t('create.weekdaysHint')}</p>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-bold" id="duration-label">
                {t('create.duration')}
              </span>
              <div
                className="flex items-center gap-3"
                role="group"
                aria-labelledby="duration-label"
              >
                <Button
                  onClick={() => setDuration(Math.max(1, duration - 1))}
                  disabled={duration <= 1}
                  aria-label={t('create.durationLess')}
                >
                  −
                </Button>
                <output
                  className="min-w-8 text-center text-2xl font-black"
                  aria-live="polite"
                >
                  {duration}
                </output>
                <Button
                  onClick={() =>
                    setDuration(Math.min(LIMITS.durationDays, duration + 1))
                  }
                  disabled={duration >= LIMITS.durationDays}
                  aria-label={t('create.durationMore')}
                >
                  +
                </Button>
              </div>
              <p className="text-sm text-muted">{t('create.durationHint')}</p>
            </div>
            {rangeDays.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">{t('create.fineTune')}</p>
                <CalendarGrid
                  mode="candidates"
                  days={rangeDays}
                  marks={marks}
                  brush="yes"
                  onChange={(next) => setManual(next)}
                  firstWeekday={firstWeekday}
                  today={today}
                  label={t('cal.label')}
                />
                <p className="font-bold" aria-live="polite">
                  {tn('create.dayCount', candidates.length)}
                </p>
              </div>
            )}
            {daysError && <Notice tone="error">{daysError}</Notice>}
          </fieldset>
        )}

        {step === 3 && (
          <fieldset className="flex flex-col gap-5">
            <legend className="mb-4 text-xl font-extrabold">
              {t('create.who')}
            </legend>
            <Field
              label={t('create.roster')}
              hint={t('create.rosterHint')}
              error={rosterError}
            >
              {({ id, describedBy, invalid }) => (
                <TextArea
                  id={id}
                  value={roster}
                  rows={5}
                  onChange={(event) => setRoster(event.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                />
              )}
            </Field>
            <Field
              label={t('create.minCount')}
              hint={t('create.minCountHint')}
              error={minCountError}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  inputMode="numeric"
                  value={minCount}
                  onChange={(event) =>
                    setMinCount(event.target.value.replace(/\D/g, ''))
                  }
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className="max-w-32"
                />
              )}
            </Field>
          </fieldset>
        )}

        {submitError && <Notice tone="error">{submitError}</Notice>}

        <div className="flex flex-wrap justify-between gap-3">
          <Button onClick={() => (step === 1 ? onCancel() : setStep(step - 1))}>
            {t('create.back')}
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {step < STEPS
              ? t('create.next')
              : submitting
                ? t('create.creating')
                : t('create.submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
