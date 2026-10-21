import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
  'home.lead':
    '¿Cuándo podéis quedar? Marcad vuestros días en el calendario y descubridlo. Sin registro ni seguimiento.',
  'home.feature.heat.title': 'Ved cuándo os viene bien',
  'home.feature.heat.text':
    'El calendario se convierte en un mapa de calor y muestra los días en que puede venir más gente. También sirve para fines de semana o torneos de varios días.',
  'home.feature.private.title': 'Sin cuentas',
  'home.feature.private.text':
    'Basta con un nombre. Sin correo electrónico, cookies ni seguimiento. Los eventos antiguos se borran automáticamente.',
  'home.faq.title': 'Preguntas',
  'home.faq.free.q': '¿Cuesta algo?',
  'home.faq.free.a':
    'No. Owl Be There es gratuito y de código abierto, y cualquiera puede instalarlo en su propio servidor.',
  'home.faq.account.q': '¿Necesito una cuenta?',
  'home.faq.account.a':
    'No. Cada persona elige un nombre y listo. Quien organiza el evento recibe un enlace privado para gestionarlo.',
  'home.faq.doodle.q': '¿En qué se diferencia de Doodle?',
  'home.faq.doodle.a':
    'Owl Be There está pensado para días completos: cada persona marca los días en que puede y el mapa de calor muestra de un vistazo qué día va mejor. No hay cuentas ni seguimiento, y los eventos antiguos se borran solos.',
  'home.faq.days.q': '¿Podemos buscar un fin de semana entero?',
  'home.faq.days.a':
    'Sí. Pedid dos o más días seguidos y Owl Be There ordena los bloques en los que puede más gente, con un mínimo de asistentes si lo necesitáis.',
  'home.faq.messenger.q': '¿Cómo invito al grupo?',
  'home.faq.messenger.a':
    'Envía el enlace al chat del grupo o enseña el código QR. WhatsApp, Signal y otras apps de mensajería muestran una vista previa con el título y los días posibles. Nadie tiene que instalar nada.',
  'home.faq.privacy.q': '¿Qué pasa con nuestros datos?',
  'home.faq.privacy.a': `Solo se guardan los nombres y los días que introducís: ni correos electrónicos, ni direcciones IP, ni cookies. Los eventos se borran solos, normalmente ${RETENTION_DAYS} días después del último cambio.`,
};
