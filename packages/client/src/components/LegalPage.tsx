import type { ReactNode } from 'react';
import { Owl } from './Owl.tsx';
import { Card, Notice } from './ui.tsx';

/**
 * The frame of the legal pages: the owl and the heading, which may wrap and
 * shrink on a phone, then either the notice that the instance's details are
 * still loading (or failed to) in place of the card, or the card itself.
 */
export function LegalPage({
  title,
  notice,
  children,
}: {
  title: string;
  /** Replaces the card when set. */
  notice?: { tone: 'info' | 'error'; text: string } | null;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Owl mood="thinking" size={88} />
        <h1 className="min-w-0 flex-1 text-2xl font-black wrap-anywhere sm:text-3xl">
          {title}
        </h1>
      </div>
      {notice ? (
        <Notice tone={notice.tone}>{notice.text}</Notice>
      ) : (
        <Card className="flex flex-col gap-6">{children}</Card>
      )}
    </div>
  );
}

/** A titled section of a legal page; every paragraph falsy is left out. */
export function LegalSection({
  title,
  paragraphs,
}: {
  title: string;
  paragraphs: (ReactNode | false | null | undefined)[];
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="text-xl font-extrabold wrap-anywhere">{title}</h2>
      {paragraphs.map((content, index) =>
        content ? (
          <p key={index} className="leading-relaxed wrap-anywhere">
            {content}
          </p>
        ) : null
      )}
    </section>
  );
}
