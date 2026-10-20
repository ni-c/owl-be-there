import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
  'home.lead':
    'Khi nào cả nhóm đều rảnh? Đánh dấu ngày của các bạn trên lịch và cùng tìm ra. Không cần đăng ký, không theo dõi.',
  'home.feature.heat.title': 'Xem ngày nào hợp',
  'home.feature.heat.text':
    'Lịch biến thành bản đồ nhiệt, cho thấy những ngày nhiều người đi được nhất — kể cả cho cuối tuần hay giải đấu kéo dài nhiều ngày.',
  'home.feature.private.title': 'Không cần tài khoản',
  'home.feature.private.text':
    'Chỉ cần một cái tên. Không email, không cookie, không theo dõi. Sự kiện cũ tự động bị xóa.',
  'home.faq.title': 'Câu hỏi thường gặp',
  'home.faq.free.q': 'Có mất phí không?',
  'home.faq.free.a':
    'Không. Owl Be There miễn phí và là mã nguồn mở, ai cũng có thể tự chạy trên máy chủ của mình.',
  'home.faq.account.q': 'Tôi có cần tài khoản không?',
  'home.faq.account.a':
    'Không. Mỗi người chỉ cần chọn một cái tên. Người tổ chức sự kiện nhận được một liên kết riêng để quản lý.',
  'home.faq.doodle.q': 'Khác gì so với Doodle?',
  'home.faq.doodle.a':
    'Owl Be There được làm cho trọn ngày: mọi người đánh dấu những ngày mình đi được, và bản đồ nhiệt cho thấy ngay ngày nào hợp nhất. Không có tài khoản, không theo dõi, và sự kiện cũ tự động bị xóa.',
  'home.faq.days.q': 'Có thể tìm trọn một cuối tuần không?',
  'home.faq.days.a':
    'Có. Hãy chọn hai ngày liên tiếp trở lên, Owl Be There sẽ xếp hạng các khoảng ngày nhiều người đi được nhất — kèm số người tối thiểu nếu các bạn cần.',
  'home.faq.messenger.q': 'Làm sao để mời cả nhóm?',
  'home.faq.messenger.a':
    'Gửi liên kết vào nhóm chat hoặc cho xem mã QR. Zalo, Messenger và các ứng dụng nhắn tin khác hiển thị bản xem trước với tên sự kiện và các ngày đề xuất. Không ai phải cài đặt gì cả.',
  'home.faq.privacy.q': 'Dữ liệu của chúng tôi sẽ ra sao?',
  'home.faq.privacy.a': `Chỉ những tên và ngày các bạn nhập được lưu lại: không địa chỉ email, không địa chỉ IP, không cookie. Sự kiện tự xóa, thường là ${RETENTION_DAYS} ngày sau lần thay đổi cuối cùng.`,
};
