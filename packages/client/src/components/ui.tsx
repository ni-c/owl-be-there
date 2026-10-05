import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { useI18n } from '../i18n/index.tsx';
import { arrowTarget } from '../lib/roving.ts';
import { ChevronDownIcon, CloseIcon } from './icons.tsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover shadow-card',
  secondary:
    'bg-surface text-ink border-2 border-line hover:border-line-strong',
  // No text colour of its own: it inherits the ink, and a caller's `text-*`
  // class (a red delete button) is not left to lose a tie between utilities.
  ghost: 'hover:bg-sunken',
  danger: 'bg-danger text-danger-ink hover:opacity-90',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'min-h-11 px-3 text-sm gap-1.5',
    md: 'min-h-11 px-4 gap-2',
    lg: 'min-h-13 px-6 text-lg gap-2',
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center rounded-full font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-line bg-surface p-4 shadow-card sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

interface FieldProps {
  label: string;
  hint?: string | undefined;
  error?: string | null | undefined;
  children: (props: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
}

/** A labelled control with its hint and error wired up for screen readers. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="text-sm font-semibold text-danger"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-2xl border-2 border-line bg-surface px-4 py-2.5 text-ink placeholder:text-muted focus:border-focus focus:outline-none aria-[invalid=true]:border-danger';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`${inputClass} min-h-11 ${props.className ?? ''}`}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${inputClass} min-h-24 ${props.className ?? ''}`}
    />
  );
}

/**
 * A native select with its own arrow: the browser's arrow cannot be moved and
 * sat right against the rounded edge. The select keeps the keyboard, the
 * option list and the screen reader semantics of the platform.
 */
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative grid">
      <select
        {...props}
        className={`appearance-none pr-9 ${props.className ?? ''}`}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">
        <ChevronDownIcon size={16} />
      </span>
    </span>
  );
}

/** A row of mutually exclusive choices, as a radio group. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange(value: T): void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-full border-2 border-line bg-sunken p-1"
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              const index = options.findIndex((o) => o.value === value);
              const next = arrowTarget(event.key, index, options.length);
              if (next === null) return;
              event.preventDefault();
              onChange(options[next]!.value);
              // The focus follows the choice, as in a native radio group.
              const radios =
                event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                  '[role=radio]'
                );
              radios?.[next]?.focus();
            }}
            tabIndex={checked ? 0 : -1}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-bold transition ${
              checked
                ? 'bg-surface text-ink shadow-card'
                : 'text-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A button that stays pressed, like a filter chip. Without `pressed` it is a
 * plain action in the same look and announces no state.
 */
export function Chip({
  pressed,
  onClick,
  children,
  className = '',
  ...rest
}: {
  pressed?: boolean;
  onClick(): void;
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      {...rest}
      className={`inline-flex max-w-full min-w-0 min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 font-bold [overflow-wrap:anywhere] transition ${
        pressed
          ? 'border-brand bg-brand-soft text-ink'
          : 'border-line bg-surface text-muted hover:text-ink'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * A modal dialog on the native `<dialog>`: focus is trapped and returned, Escape
 * closes it, and a tap on the backdrop closes it too. On phones it rises from
 * the bottom like a sheet.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Whether the press began on the backdrop: a drag that starts inside and
  // ends outside is a text selection or a cancelled press, not a dismissal.
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  const { t } = useI18n();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    // The backdrop click is a shortcut for the pointer; keyboard users have
    // Escape (handled by the dialog itself) and the close button.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === ref.current && pressedBackdrop.current) onClose();
        pressedBackdrop.current = false;
      }}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl border border-line bg-surface p-0 text-ink shadow-card sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <h2 id={titleId} className="text-lg font-extrabold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="grid size-11 place-items-center rounded-full hover:bg-sunken"
              aria-label={t('day.close')}
            >
              <CloseIcon />
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success';
  children: ReactNode;
}) {
  const tones = {
    info: 'bg-sunken text-ink border-line',
    error: 'bg-danger-soft text-ink border-danger',
    success: 'bg-brand-soft text-ink border-line',
  };
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-2xl border px-4 py-3 ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
