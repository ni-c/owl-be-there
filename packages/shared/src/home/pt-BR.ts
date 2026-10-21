import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
  'home.lead':
    'Quando todo mundo pode? Marquem seus dias no calendário e descubram. Sem cadastro nem rastreamento.',
  'home.feature.heat.title': 'Vejam quando dá certo',
  'home.feature.heat.text':
    'O calendário vira um mapa de calor e mostra os dias em que mais gente pode — também para fins de semana ou torneios de vários dias.',
  'home.feature.private.title': 'Sem contas',
  'home.feature.private.text':
    'Basta um nome. Sem e-mail, cookies nem rastreamento. Eventos antigos são excluídos automaticamente.',
  'home.faq.title': 'Perguntas',
  'home.faq.free.q': 'Custa alguma coisa?',
  'home.faq.free.a':
    'Não. O Owl Be There é gratuito e de código aberto, e qualquer pessoa pode hospedá-lo no próprio servidor.',
  'home.faq.account.q': 'Preciso de uma conta?',
  'home.faq.account.a':
    'Não. Cada pessoa só escolhe um nome. Quem organiza o evento recebe um link privado para gerenciá-lo.',
  'home.faq.doodle.q': 'Qual é a diferença para o Doodle?',
  'home.faq.doodle.a':
    'O Owl Be There foi feito para dias inteiros: cada pessoa marca os dias em que pode, e o mapa de calor mostra de relance qual dia funciona melhor. Não há contas nem rastreamento, e eventos antigos são excluídos automaticamente.',
  'home.faq.days.q': 'Dá para procurar um fim de semana inteiro?',
  'home.faq.days.a':
    'Sim. Peçam dois ou mais dias seguidos, e o Owl Be There ordena os blocos em que mais gente pode — com um número mínimo de pessoas, se precisarem.',
  'home.faq.messenger.q': 'Como eu convido o grupo?',
  'home.faq.messenger.a':
    'Mande o link no chat do grupo ou mostre o código QR. O WhatsApp, o Signal e outros apps de mensagem mostram uma prévia com o título e os dias possíveis. Ninguém precisa instalar nada.',
  'home.faq.privacy.q': 'O que acontece com os nossos dados?',
  'home.faq.privacy.a': `Só ficam salvos os nomes e os dias que vocês informam: nada de e-mails, endereços IP ou cookies. Os eventos são excluídos automaticamente, normalmente ${RETENTION_DAYS} dias depois da última alteração.`,
};
