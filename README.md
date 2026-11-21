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
  - **Micro của máy (thử nghiệm):** micro của máy đóng vai micro MEMS trên đầu gắn. Micro chỉ bật khi bấm *Bắt đầu lượt* và tắt ngay khi lượt kết thúc, khi đặt lại, đổi chế độ hoặc rời màn hình (chuyển tab, khóa máy); lượt bị dừng giữa chừng thì không được lưu. Âm thanh xử lý ngay trên trình duyệt, không ghi lại, không gửi đi.
- **Đối chiếu:** đặt hai lượt (ca mẫu hoặc lượt tự tập) cạnh nhau và in phiếu A4 kèm biểu đồ. Mỗi lượt ghi rõ nguồn số liệu (ca mẫu dựng sẵn, giữ nút hay micro của máy) trên màn hình, trong bảng và trên phiếu in.
- **Đầu kẹp:** cấu phần, quy trình dùng trong buổi hướng dẫn, trình tự kiểm chứng và linh kiện dự kiến (khoảng 260.000 đ một bộ, giá bán lẻ tham khảo).

## Thuật toán kênh âm (chế độ micro)

Mã nằm trong `detector.js`, dùng chung cho trình duyệt và bàn thử.

1. Mỗi khung khoảng 43 ms (2.048 mẫu ở 48 kHz), cửa sổ Hann, FFT.
2. Hai đặc trưng: năng lượng trong dải 400–6.000 Hz và **độ phẳng phổ** (trung bình theo năng lượng của bốn dải con). Tiếng luồng khí giống tiếng xì nên phổ phẳng; tiếng nói hữu thanh, tiếng ngân, tiếng bíp có hài âm nên độ phẳng thấp.
3. Đo tiếng ồn nền trong 0,9 giây đầu; ngưỡng = nền + max(6 dB; 2,5 độ lệch chuẩn).
4. **Bắt đầu hít:** khung vượt ngưỡng và có độ phẳng phổ ≥ 0,35 liên tục 120 ms; sau đó dò ngược tới lúc âm vừa nhích khỏi nền (tối đa 400 ms) để bớt trễ. Đoạn bắt đầu sát mốc công tắc (−40 đến +250 ms) phải kéo dài 450 ms mới được tính, để không nhầm với tiếng xịt.
5. **Kết thúc hít:** năng lượng về dưới nền + 3 dB liên tục 300 ms. Đoạn ngắn hơn 0,5 s hoặc có hơn 20% khung có cao độ thì bỏ qua và nghe tiếp (thường là tiếng nói).
6. **Bỏ ngỏ (đèn tím)** khi: không thấy hơi hít; chỉ nghe tiếng nói hoặc âm có cao độ; có âm có cao độ trong ±500 ms quanh mốc hít; âm kéo dài không dứt hoặc quá 6 s; tiếng hít (phân vị 90) không cao hơn nền ít nhất 9 dB.

**Ngưỡng đánh giá:** khoảng 300 ms coi là "khớp nhịp" chỉ là tham số diễn thử, sẽ hiệu chỉnh trên bàn thử có tín hiệu luồng khí tham chiếu.

## Bàn thử tín hiệu tổng hợp

```
node bench/run-bench.js          # bộ ca kiểm tra, ghi bench/results.json, bench/KET-QUA.md, bench-results.js
node bench/run-bench.js --tune   # bộ ca hiệu chỉnh riêng, dùng để chọn ngưỡng độ phẳng phổ
```

`bench/synth.js` tạo âm thanh tổng hợp: tiếng hít (biên độ theo lưu lượng^1,5, mốc tham chiếu là lúc lưu lượng bắt đầu tăng), tiếng tách và tiếng xịt khi bấm, tiếng nói (hài âm theo formant, có tiếng hơi và âm xát), quạt, tiếng bíp, tiếng ngân, âm "xì". Mỗi ca 50 lượt, so thuật toán bản 20/11 (chỉ năng lượng) với bản hiện tại. Kết quả xem ở [bench/KET-QUA.md](bench/KET-QUA.md) và trong mục *Đầu kẹp* của demo.

Kết quả chính:
- Bản 20/11 nhận nhầm hơi hít ở 100% lượt chỉ có tiếng nói, tiếng bíp, tiếng ngân hoặc quạt bật giữa lượt; bản hiện tại 0% và bật đèn tím.
- Âm "xì" kéo dài vẫn bị nhận nhầm ở 94% lượt: chỉ dựa vào âm thanh thì không tách được âm xát với tiếng luồng khí.
- Khi tiếng hít chỉ cao hơn nền khoảng 6 dB (ví dụ phòng có quạt), 66–70% lượt bị bỏ ngỏ.
- Trong mô hình tổng hợp, mốc hít nhận được muộn khoảng 0,1 s so với lúc luồng khí bắt đầu tăng.

**Giới hạn:** đây là tín hiệu tổng hợp để thử logic, chưa phải ghi âm thật. Bước kế tiếp là ghi âm trên bình tập với tín hiệu luồng khí tham chiếu; nếu micro bỏ ngỏ quá nhiều, thử cảm biến chênh áp tại khe hút khí. Taylor và cộng sự (Sci Rep 2018;8:2164) ghi nhận tiếng hít qua pMDI khoảng 62 dBA khi gắn bộ tạo âm Flo-Tone, còn khoảng 35 dBA khi không gắn (60 L/phút).

## Số liệu nền

- Lỗi phối hợp bấm–hít chiếm 45% lượt dùng pMDI (Sanchis và cộng sự, Chest 2016).
- Bấm trước khi hít gặp ở 24,9% người dùng và đi kèm hen không kiểm soát, OR 1,55 (Price và cộng sự, J Allergy Clin Immunol Pract 2017).
- Tại Nghệ An, tỷ lệ người bệnh COPD làm đúng là 81,7% ngay sau hướng dẫn, nhưng còn 55% sau một tháng (Hoàng Thị Bé và cộng sự, 2021).

Phối cảnh [đầu gắn](assets/dau-kep.webp) được tạo bằng công cụ tạo ảnh và chỉ minh họa ý tưởng.
