# Kết quả bàn thử tín hiệu tổng hợp

Sinh bởi `node bench/run-bench.js` ngày 2026-11-21. 50 lượt mỗi ca, tín hiệu tổng hợp 24 kHz, khung 1024 mẫu, bước 400 mẫu, seed 5000. Ngưỡng độ phẳng phổ 0.35 được chọn trên bộ ca hiệu chỉnh riêng (`--tune`), không phải bộ ca dưới đây.

**Đây là tín hiệu tổng hợp để thử logic, chưa phải ghi âm thật trên đầu kẹp.** Mốc tham chiếu là lúc lưu lượng tổng hợp bắt đầu tăng. v1 = thuật toán bản 20/11 (chỉ năng lượng); v2 = bản 21/11 (thêm độ phẳng phổ, dò ngược mốc hít, chặn tiếng xịt sát mốc bấm, bỏ qua đoạn giống tiếng nói, bỏ ngỏ khi có âm lạ quanh mốc hít).

## Ca có hơi hít

| Ca | v1 phân loại sai | v2 phân loại sai | v2 bỏ ngỏ | v2 phân loại đúng | v2 lệch mốc hít (trung vị / P90 trị tuyệt đối) |
|---|---:|---:|---:|---:|---:|
| Phòng yên, có tiếng tách khi bấm | 2% | 0% | 0% | 100% | 101 / 135 ms |
| Có tiếng xịt của bình tập | 24% | 0% | 2% | 98% | 99 / 137 ms |
| Quạt chạy suốt lượt | 22% | 2% | 66% | 32% | 163 / 190 ms |
| Có người nói trước lúc hít | 100% | 8% | 6% | 86% | 116 / 139 ms |
| Có người nói chen đúng lúc bắt đầu hít | 20% | 2% | 80% | 18% | 80 / 323 ms |

## Ca không có hơi hít

| Ca | v1 nhận nhầm | v2 nhận nhầm | v2 bỏ ngỏ |
|---|---:|---:|---:|
| Chỉ có tiếng nói, không hít | 100% | 0% | 100% |
| Chỉ bấm và xịt, không hít | 66% | 0% | 100% |
| Quạt bật giữa lượt | 100% | 0% | 100% |
| Tiếng bíp kéo dài | 100% | 0% | 100% |
| Ngân dài “a…” hoặc “ừm…” | 100% | 0% | 100% |
| Âm “xì…” kéo dài | 100% | 94% | 6% |

## Theo độ lớn tiếng hít so với nền

| Tiếng hít so với nền | v2 phân loại đúng | v2 phân loại sai | v2 bỏ ngỏ | v2 lệch mốc hít (trung vị) |
|---:|---:|---:|---:|---:|
| +20 dB | 98% | 2% | 0% | 85 ms |
| +12 dB | 96% | 4% | 0% | 104 ms |
| +6 dB | 22% | 8% | 70% | 120 ms |
| +3 dB | 0% | 0% | 100% | — |
| 0 dB | 0% | 0% | 100% | — |
| -3 dB | 0% | 0% | 100% | — |
| -6 dB | 0% | 0% | 100% | — |

Lệch mốc hít: dương là máy nhận muộn hơn mốc tham chiếu. Phân loại: bấm sớm, khớp nhịp (≤ 300 ms, tham số diễn thử), bấm muộn.
