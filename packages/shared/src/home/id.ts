import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
  'home.lead':
    'Kapan kalian semua bisa? Tandai hari kalian di kalender dan temukan jawabannya. Tanpa pendaftaran dan pelacakan.',
  'home.feature.heat.title': 'Lihat hari yang paling cocok',
  'home.feature.heat.text':
    'Kalender berubah menjadi peta panas yang menunjukkan hari saat paling banyak orang bisa hadir, termasuk untuk akhir pekan atau turnamen beberapa hari.',
  'home.feature.private.title': 'Tanpa akun',
  'home.feature.private.text':
    'Cukup nama saja. Tanpa alamat email, cookie, atau pelacakan. Acara lama dihapus secara otomatis.',
  'home.faq.title': 'Pertanyaan umum',
  'home.faq.free.q': 'Apakah layanan ini berbayar?',
  'home.faq.free.a':
    'Tidak. Owl Be There gratis dan bersumber terbuka; siapa pun bisa menjalankannya di server sendiri.',
  'home.faq.account.q': 'Apakah saya perlu akun?',
  'home.faq.account.a':
    'Tidak. Setiap orang cukup memilih nama. Penyelenggara acara mendapat tautan pribadi untuk mengelolanya.',
  'home.faq.doodle.q': 'Apa bedanya dengan Doodle?',
  'home.faq.doodle.a':
    'Owl Be There dirancang untuk merencanakan berdasarkan hari, bukan jam: setiap orang menandai hari saat bisa hadir, dan peta panas langsung menunjukkan hari yang paling cocok. Tidak perlu akun, tidak ada pelacakan, dan acara lama dihapus secara otomatis.',
  'home.faq.days.q': 'Bisakah kami mencari satu akhir pekan penuh?',
  'home.faq.days.a':
    'Bisa. Pilih dua hari berturut-turut atau lebih; Owl Be There mengurutkan rentang hari berdasarkan jumlah orang yang bisa hadir. Kalian juga bisa menetapkan jumlah minimum peserta.',
  'home.faq.messenger.q': 'Bagaimana cara mengundang grup?',
  'home.faq.messenger.a':
    'Kirim tautan ke obrolan grup atau tunjukkan kode QR. WhatsApp, Signal, dan aplikasi pesan lain menampilkan pratinjau berisi judul acara dan hari-hari usulan. Tidak ada yang perlu memasang aplikasi.',
  'home.faq.privacy.q': 'Apa yang terjadi pada data kami?',
  'home.faq.privacy.a': `Hanya nama dan hari yang kalian masukkan yang disimpan: tanpa alamat email, alamat IP, atau cookie. Acara terhapus otomatis, biasanya ${RETENTION_DAYS} hari setelah perubahan terakhir.`,
};
