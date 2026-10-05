import { describe, expect, it } from 'vitest';
import { shareData } from '../src/lib/shareData.ts';

const URL_ = 'https://owl.example.org/e/7gT4kPq2Wx9Z';

describe('shareData', () => {
  it('leaves the link in the text and out of url', () => {
    const data = shareData('Dinner', `Dinner — add your days: ${URL_}`, URL_);
    expect(data).toEqual({
      title: 'Dinner',
      text: `Dinner — add your days: ${URL_}`,
    });
    expect('url' in data).toBe(false);
  });

  it('adds url for a text without the link', () => {
    expect(shareData('Dinner', 'Add your days', URL_)).toEqual({
      title: 'Dinner',
      text: 'Add your days',
      url: URL_,
    });
    expect(shareData('', '', URL_).url).toBe(URL_);
  });
});
