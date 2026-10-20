import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
  'home.lead':
    'Hepiniz ne zaman gelebilirsiniz? Günlerinizi takvimde işaretleyin ve görün. Kayıt yok, takip yok.',
  'home.feature.heat.title': 'En uygun günleri görün',
  'home.feature.heat.text':
    'Takvim bir ısı haritasına dönüşür ve en çok kişinin katılabildiği günleri gösterir. Hafta sonları ve birkaç gün süren turnuvalar için de uygundur.',
  'home.feature.private.title': 'Hesap yok',
  'home.feature.private.text':
    'Bir ad yeterli. E-posta adresi, çerez veya takip yok. Eski etkinlikler otomatik olarak silinir.',
  'home.faq.title': 'Sık sorulan sorular',
  'home.faq.free.q': 'Ücretli mi?',
  'home.faq.free.a':
    'Hayır. Owl Be There ücretsiz ve açık kaynaklıdır; isteyen kendi sunucusunda çalıştırabilir.',
  'home.faq.account.q': 'Hesap açmam gerekiyor mu?',
  'home.faq.account.a':
    'Hayır. Herkes yalnızca bir ad seçer. Etkinliği planlayan kişi, onu yönetmek için özel bir bağlantı alır.',
  'home.faq.doodle.q': 'Doodle’dan farkı nedir?',
  'home.faq.doodle.a':
    'Owl Be There, gün bazında planlama yapmak için tasarlandı: herkes uygun olduğu günleri işaretler, ısı haritası da en uygun günü bir bakışta gösterir. Hesap ve takip yoktur; eski etkinlikler otomatik olarak silinir.',
  'home.faq.days.q': 'Bütün bir hafta sonunu planlayabilir miyiz?',
  'home.faq.days.a':
    'Evet. Art arda iki veya daha fazla gün seçin; Owl Be There, en çok kişinin katılabildiği gün aralıklarını sıralar. Gerekirse asgari katılımcı sayısı da belirleyebilirsiniz.',
  'home.faq.messenger.q': 'Grubu nasıl davet ederim?',
  'home.faq.messenger.a':
    'Bağlantıyı grup sohbetine gönder veya QR kodunu göster. WhatsApp, Signal ve diğer mesajlaşma uygulamaları etkinlik başlığını ve aday günleri içeren bir önizleme gösterir. Kimsenin bir şey yüklemesi gerekmez.',
  'home.faq.privacy.q': 'Verilerimize ne oluyor?',
  'home.faq.privacy.a': `Yalnızca girdiğiniz adlar ve günler saklanır: e-posta adresi, IP adresi veya çerez saklanmaz. Etkinlikler genellikle son değişiklikten ${RETENTION_DAYS} gün sonra kendiliğinden silinir.`,
};
