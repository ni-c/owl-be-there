import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
  'home.lead':
    '大家什么时候有空？在日历上标记方便的日期，找到适合大家的日子。无需注册，也不会追踪你。',
  'home.feature.heat.title': '一眼看出哪天最合适',
  'home.feature.heat.text':
    '日历会变成热力图，显示最多人能参加的日期，周末聚会或多日赛事也适用。',
  'home.feature.private.title': '无需账号',
  'home.feature.private.text':
    '只要填上名字，无需邮箱，也没有 Cookie 或追踪。旧活动会自动删除。',
  'home.faq.title': '常见问题',
  'home.faq.free.q': '需要付费吗？',
  'home.faq.free.a': '不用。Owl Be There 免费且开源，任何人都可以自行部署。',
  'home.faq.account.q': '需要账号吗？',
  'home.faq.account.a':
    '不用。每个人只需选一个名字，组织者会得到管理活动的专用链接。',
  'home.faq.doodle.q': '和 Doodle 有什么不同？',
  'home.faq.doodle.a':
    'Owl Be There 专为以整天为单位安排日期而设计：大家标记方便的日期，热力图就会显示哪天最合适。无需账号、没有追踪，旧活动也会自动删除。',
  'home.faq.days.q': '可以安排整个周末吗？',
  'home.faq.days.a':
    '可以。设置连续两天或更多天，Owl Be There 就会按可参加人数排列连续日期；需要时也能设置最低人数。',
  'home.faq.messenger.q': '怎样邀请大家？',
  'home.faq.messenger.a':
    '把链接发到群聊，或让大家扫描二维码。WhatsApp、Signal 等聊天软件会显示活动名称和候选日期的预览。大家都不用安装任何东西。',
  'home.faq.privacy.q': '我们的数据会怎样处理？',
  'home.faq.privacy.a': `只会保存你输入的名字和日期；不保存邮箱地址、IP 地址或 Cookie。活动通常会在最后一次修改的 ${RETENTION_DAYS} 天后自动删除。`,
};
