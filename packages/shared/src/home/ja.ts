import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
  'home.lead':
    'みんな、いつなら空いてる？ カレンダーに都合のいい日を入れてみよう。登録も追跡もなし。',
  'home.feature.heat.title': '集まりやすい日がすぐわかる',
  'home.feature.heat.text':
    'カレンダーがヒートマップに。参加できる人が多い日がひと目でわかるよ。週末や数日間の大会にも使える。',
  'home.feature.private.title': 'アカウント不要',
  'home.feature.private.text':
    '名前だけでOK。メールもCookieも追跡もなし。古い予定は自動で削除されるよ。',
  'home.faq.title': 'よくある質問',
  'home.faq.free.q': 'お金はかかる？',
  'home.faq.free.a':
    '無料だよ。Owl Be There はオープンソースで、自分のサーバーでも動かせます。',
  'home.faq.account.q': 'アカウントは必要？',
  'home.faq.account.a':
    'いらないよ。名前を選ぶだけ。主催者は予定を管理するための専用リンクをもらえます。',
  'home.faq.doodle.q': 'Doodle との違いは？',
  'home.faq.doodle.a':
    'Owl Be There は日にち単位の日程調整向け。みんなが行ける日に印をつけるだけで、どの日がいちばん良いかヒートマップでひと目でわかります。アカウントもトラッキングもなく、古い予定は自動で削除されます。',
  'home.faq.days.q': '週末まるごと探せる？',
  'home.faq.days.a':
    'できるよ。2日以上の連続した日程を指定すると、参加できる人が多い順に候補を並べます。必要なら最低人数も設定できます。',
  'home.faq.messenger.q': 'グループへの招待はどうするの？',
  'home.faq.messenger.a':
    'グループチャットにリンクを送るか、QRコードを見せるだけ。LINEやWhatsAppなどのメッセージアプリでは、タイトルと候補日がプレビューで表示されます。アプリのインストールは不要です。',
  'home.faq.privacy.q': 'データはどうなるの？',
  'home.faq.privacy.a': `保存されるのは入力した名前と日にちだけ。メールアドレスもIPアドレスもCookieも保存しません。予定は自動で削除されます（通常は最後の変更から${RETENTION_DAYS}日後）。`,
};
