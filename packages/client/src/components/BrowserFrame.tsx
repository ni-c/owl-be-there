import type { ReactNode } from 'react';

/**
 * The address the example's window shows. Not a URL the app builds — those
 * come from PUBLIC_URL alone — but part of the advertising, which shows the
 * project's own domain on every instance.
 */
export const SHOWN_HOST = 'owlbethere.app';

/**
 * A browser window around the example on the start page, so it reads as a
 * look into an event rather than as part of the page it sits on. The bar is
 * decoration only; what is inside is the real thing.
 */
export function BrowserFrame(props: {
  emoji: string;
  title: string;
  path: string;
  children: ReactNode;
}) {
  return (
    <div
      data-browser-frame
      className="overflow-hidden rounded-2xl border border-line-strong bg-sunken shadow-card"
    >
      <div aria-hidden="true" className="select-none">
        <div className="flex h-11 items-end gap-4 px-4">
          <div className="flex gap-2 self-center">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex h-9 max-w-xs min-w-0 items-center gap-2 rounded-t-xl bg-surface px-4 text-sm font-bold">
            <span>{props.emoji}</span>
            <span className="truncate">{props.title}</span>
          </div>
        </div>
        <div className="flex h-11 items-center border-b border-line bg-surface px-3">
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full bg-bg px-4 text-sm">
            <svg
              width="12"
              height="14"
              viewBox="0 0 12 14"
              className="shrink-0 text-muted"
            >
              <rect
                x="1"
                y="6"
                width="10"
                height="7.5"
                rx="2"
                fill="currentColor"
              />
              <path
                d="M3.2 6V4.4a2.8 2.8 0 0 1 5.6 0V6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
            <span className="truncate">
              <span className="font-bold">{SHOWN_HOST}</span>
              <span className="text-muted">{props.path}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="bg-bg p-3 sm:p-5">{props.children}</div>
    </div>
  );
}
