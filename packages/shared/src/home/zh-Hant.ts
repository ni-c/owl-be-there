import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
  'home.lead':
    '大家哪天有空？在日曆上標記方便的日期，找出適合大家的日子。無須註冊，也不會追蹤你。',
  'home.feature.heat.title': '一眼看出哪天最合適',
  'home.feature.heat.text':
    '日曆會變成熱度圖，顯示最多人能參加的日期。週末聚會或多日賽事也適用。',
  'home.feature.private.title': '無須帳號',
  'home.feature.private.text':
    '只要填上名字；無須電子郵件，也沒有 Cookie 或追蹤。舊活動會自動刪除。',
  'home.faq.title': '常見問題',
  'home.faq.free.q': '需要付費嗎？',
  'home.faq.free.a':
    '不用。Owl Be There 免費且開放原始碼，任何人都能自行架設。',
  'home.faq.account.q': '需要帳號嗎？',
  'home.faq.account.a':
    '不用。每個人選個名字即可；主辦人會收到管理活動的專用連結。',
  'home.faq.doodle.q': '和 Doodle 有什麼不同？',
  'home.faq.doodle.a':
    'Owl Be There 專為以整天為單位的日期安排設計：大家標記方便的日期，熱度圖就會顯示哪天最合適。無須帳號、不會追蹤，舊活動也會自動刪除。',
  'home.faq.days.q': '可以安排整個週末嗎？',
  'home.faq.days.a':
    '可以。設定連續兩天或更多天，Owl Be There 就會依可參加人數排列連續日期；需要時也能設定最低人數。',
  'home.faq.messenger.q': '怎麼邀請大家？',
  'home.faq.messenger.a':
    '把連結傳到群組聊天，或讓大家掃描 QR Code。WhatsApp、Signal 等通訊軟體會顯示活動名稱與候選日的預覽。大家都不必安裝任何 App。',
  'home.faq.privacy.q': '我們的資料會怎麼處理？',
  'home.faq.privacy.a': `只會儲存你填入的名字和日期；不儲存電子郵件地址、IP 位址或 Cookie。活動通常會在最後一次變更的 ${RETENTION_DAYS} 天後自動刪除。`,
};
