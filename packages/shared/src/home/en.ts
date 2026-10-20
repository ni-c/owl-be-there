import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';
import { DESCRIPTION_EN } from '../texts.js';

export const HOME: HomeTexts = {
  'home.lead': DESCRIPTION_EN,
  'home.feature.heat.title': 'See what works',
  'home.feature.heat.text':
    'The calendar becomes a heatmap and shows the days most people can make — even for weekends or multi-day tournaments.',
  'home.feature.private.title': 'No accounts',
  'home.feature.private.text':
    'A name is enough. No email, cookies or tracking. Old events are deleted automatically.',
  'home.faq.title': 'Questions',
  'home.faq.free.q': 'Does it cost anything?',
  'home.faq.free.a':
    'No. Owl Be There is free and open source, and anyone can run it on their own server.',
  'home.faq.account.q': 'Do I need an account?',
  'home.faq.account.a':
    'No. Everyone just picks a name. Whoever plans the event gets a private link to manage it.',
  'home.faq.doodle.q': 'How is it different from Doodle?',
  'home.faq.doodle.a':
    'Owl Be There is made for whole days: everyone marks the days they can make it, and the heatmap shows at a glance which day works best. There are no accounts and no tracking, and old events are deleted automatically.',
  'home.faq.days.q': 'Can we look for a whole weekend?',
  'home.faq.days.a':
    'Yes. Ask for two or more days in a row, and Owl Be There ranks the blocks most people can make — with a minimum head count if you need one.',
  'home.faq.messenger.q': 'How do I invite the group?',
  'home.faq.messenger.a':
    'Send the link to your group chat or show the QR code. WhatsApp, Signal and other messengers show a preview with the title and the candidate days. Nobody has to install anything.',
  'home.faq.privacy.q': 'What happens to our data?',
  'home.faq.privacy.a': `Only the names and days you enter are stored: no email addresses, no IP addresses, no cookies. Events delete themselves, usually ${RETENTION_DAYS} days after the last change.`,
};
