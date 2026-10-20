import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
  'home.lead':
    '다 같이 언제 모일 수 있을까요? 캘린더에 각자 가능한 날짜를 표시해 보세요. 가입도 추적도 없어요.',
  'home.feature.heat.title': '언제가 좋은지 한눈에',
  'home.feature.heat.text':
    '캘린더가 히트맵이 되어 가장 많은 사람이 가능한 날짜를 보여 줘요. 주말이나 며칠짜리 대회에도 쓸 수 있어요.',
  'home.feature.private.title': '계정 없이',
  'home.feature.private.text':
    '이름만 있으면 돼요. 이메일도, 쿠키도, 추적도 없어요. 오래된 모임은 자동으로 삭제돼요.',
  'home.faq.title': '자주 묻는 질문',
  'home.faq.free.q': '돈이 드나요?',
  'home.faq.free.a':
    '아니요. Owl Be There는 무료 오픈 소스이고, 누구나 자기 서버에서 운영할 수 있어요.',
  'home.faq.account.q': '계정이 필요한가요?',
  'home.faq.account.a':
    '아니요. 각자 이름만 고르면 돼요. 모임을 계획하는 사람은 관리용 개인 링크를 받아요.',
  'home.faq.doodle.q': 'Doodle과 무엇이 다른가요?',
  'home.faq.doodle.a':
    'Owl Be There는 하루 단위로 날짜를 정하도록 만들어졌어요. 모두 가능한 날짜를 표시하면, 어느 날이 가장 좋은지 히트맵으로 한눈에 보여요. 계정도 추적도 없고, 오래된 모임은 자동으로 삭제돼요.',
  'home.faq.days.q': '주말 전체를 찾을 수도 있나요?',
  'home.faq.days.a':
    '네. 연속으로 이틀 이상을 요청하면 Owl Be There가 가장 많은 사람이 가능한 기간 순으로 보여 줘요. 필요하면 최소 인원도 정할 수 있어요.',
  'home.faq.messenger.q': '그룹은 어떻게 초대하나요?',
  'home.faq.messenger.a':
    '그룹 채팅방에 링크를 보내거나 QR 코드를 보여 주세요. 카카오톡, WhatsApp, Signal 같은 메신저에서는 제목과 후보 날짜가 담긴 미리보기가 보여요. 아무것도 설치할 필요가 없어요.',
  'home.faq.privacy.q': '우리 데이터는 어떻게 되나요?',
  'home.faq.privacy.a': `입력한 이름과 날짜만 저장돼요. 이메일 주소도, IP 주소도, 쿠키도 저장하지 않아요. 모임은 보통 마지막 변경 후 ${RETENTION_DAYS}일이 지나면 자동으로 삭제돼요.`,
};
