# Hơi Thở

Đầu gắn ngoài cho bình xịt định liều (pMDI), giúp người bệnh hen và COPD tập bấm thuốc đúng lúc bắt đầu hít trong buổi hướng dẫn với nhân viên y tế. Đây là nguyên mẫu web; phần cứng chưa được chế tạo.

**Demo:** https://btphuong3011.github.io/hoi-tho/ (hoặc mở `index.html` để chạy ngoại tuyến).

## Trong demo có gì

- **Bốn ca mẫu:** bấm sớm, khớp nhịp, bấm muộn, nhiễu nền. Mỗi ca hiển thị tiếng luồng hít (kênh âm) và mốc bấm (công tắc) trên cùng một trục thời gian, kèm bốn chỉ số:
  - bắt đầu hít;
  - bấm;
  - độ lệch bấm–hít;
  - thời gian hít tiếp sau khi bấm.
- **Tự tập:** có hai cách nhập tín hiệu.
  - **Giữ nút:** giữ nút *Hít vào* trong lúc hít, bấm *Bấm bình* đúng lúc muốn xịt. Trên điện thoại dùng hai ngón; trên máy tính giữ phím cách để hít, phím B để bấm.
  - **Micro của máy (thử nghiệm):** micro của máy đóng vai micro MEMS trên đầu gắn. Thuật toán chạy ngay trên trình duyệt; âm thanh không được ghi lại hay gửi đi.
- **Đối chiếu:** đặt hai lượt (ca mẫu hoặc lượt tự tập) cạnh nhau và in phiếu A4 kèm biểu đồ.
- **Đầu kẹp:** cấu phần, quy trình dùng trong buổi hướng dẫn, trình tự kiểm chứng và linh kiện dự kiến (khoảng 260.000 đ một bộ, giá bán lẻ tham khảo).

## Thuật toán kênh âm (chế độ micro)

Thuật toán làm theo các bước sau:
1. Lọc dải 400–6.000 Hz.
2. Tính năng lượng RMS theo khung hình.
3. Đo tiếng ồn nền trong 0,9 giây đầu.
4. **Bắt đầu hít:** năng lượng vượt nền + max(6 dB; 2,5 độ lệch chuẩn) liên tục 120 ms.
5. **Kết thúc hít:** năng lượng về dưới nền + 3 dB liên tục 300 ms.
6. **Từ chối kết luận:** nếu đỉnh tín hiệu không cao hơn nền ít nhất 9 dB, hệ thống để trống mốc hít và độ lệch thay vì đoán.

**Ngưỡng đánh giá:** khoảng 300 ms coi là "khớp nhịp" chỉ là tham số diễn thử, sẽ hiệu chỉnh trên bàn thử có tín hiệu luồng khí tham chiếu.

## Số liệu nền

- Lỗi phối hợp bấm–hít chiếm 45% lượt dùng pMDI (Sanchis và cộng sự, Chest 2016).
- Bấm trước khi hít gặp ở 24,9% người dùng và đi kèm hen không kiểm soát, OR 1,55 (Price và cộng sự, J Allergy Clin Immunol Pract 2017).
- Tại Nghệ An, tỷ lệ người bệnh COPD làm đúng là 81,7% ngay sau hướng dẫn, nhưng còn 55% sau một tháng (Hoàng Thị Bé và cộng sự, 2021).

Phối cảnh [đầu gắn](assets/dau-kep.webp) được tạo bằng công cụ tạo ảnh và chỉ minh họa ý tưởng.
