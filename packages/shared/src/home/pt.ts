import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
  'home.lead':
    'Quando é que todos podem? Marquem os vossos dias no calendário e descubram. Sem registo nem rastreio.',
  'home.feature.heat.title': 'Vejam os melhores dias',
  'home.feature.heat.text':
    'O calendário transforma-se num mapa de calor e mostra os dias em que mais pessoas podem. Também serve para fins de semana ou torneios de vários dias.',
  'home.feature.private.title': 'Sem contas',
  'home.feature.private.text':
    'Basta o teu nome. Sem e-mail, cookies nem rastreio. Os eventos antigos são apagados automaticamente.',
  'home.faq.title': 'Perguntas',
  'home.faq.free.q': 'Custa alguma coisa?',
  'home.faq.free.a':
    'Não. O Owl Be There é gratuito e de código aberto, e qualquer pessoa o pode instalar no seu próprio servidor.',
  'home.faq.account.q': 'Preciso de uma conta?',
  'home.faq.account.a':
    'Não. Cada pessoa escolhe só um nome. Quem organiza recebe um link privado para gerir o evento.',
  'home.faq.doodle.q': 'Qual é a diferença para o Doodle?',
  'home.faq.doodle.a':
    'O Owl Be There foi feito para dias inteiros: cada pessoa marca os dias em que pode e o mapa de calor mostra num instante qual é o melhor dia. Não há contas nem rastreio, e os eventos antigos são apagados automaticamente.',
  'home.faq.days.q': 'Podemos procurar um fim de semana inteiro?',
  'home.faq.days.a':
    'Sim. Peçam dois ou mais dias seguidos e o Owl Be There ordena os blocos em que mais pessoas podem, com um número mínimo de participantes se for preciso.',
  'home.faq.messenger.q': 'Como convido o grupo?',
  'home.faq.messenger.a':
    'Envia o link para o chat do grupo ou mostra o código QR. O WhatsApp, o Signal e outras apps de mensagens mostram uma pré-visualização com o título e os dias possíveis. Ninguém precisa de instalar nada.',
  'home.faq.privacy.q': 'O que acontece aos nossos dados?',
  'home.faq.privacy.a': `Só são guardados os nomes e os dias que introduzem: nada de e-mails, endereços IP ou cookies. Os eventos apagam-se sozinhos, normalmente ${RETENTION_DAYS} dias depois da última alteração.`,
};
