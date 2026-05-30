-- ================================================================
-- Koordinat & Bendera — kunjungan_prabowo
-- Jalankan SETELAH import CSV selesai.
--
-- PENTING — Nonaktifkan RLS terlebih dulu (jalankan sendiri, satu per satu):
--   ALTER TABLE kunjungan_prabowo DISABLE ROW LEVEL SECURITY;
-- ================================================================

-- ── Koordinat (lat/lon) per kota ─────────────────────────────────
UPDATE kunjungan_prabowo SET lat =  39.9042, lon = 116.4074 WHERE kota = 'Beijing';
UPDATE kunjungan_prabowo SET lat =  38.9072, lon = -77.0369 WHERE kota = 'Washington, D.C.';
UPDATE kunjungan_prabowo SET lat = -12.0464, lon = -77.0428 WHERE kota = 'Lima; Cusco';
UPDATE kunjungan_prabowo SET lat = -22.9068, lon = -43.1729 WHERE kota = 'Rio de Janeiro';
UPDATE kunjungan_prabowo SET lat =  51.5074, lon =  -0.1278 WHERE kota = 'London';
UPDATE kunjungan_prabowo SET lat =  24.4539, lon =  54.3773 WHERE kota = 'Abu Dhabi';
UPDATE kunjungan_prabowo SET lat =  30.0444, lon =  31.2357 WHERE kota = 'Kairo';
UPDATE kunjungan_prabowo SET lat =   3.1390, lon = 101.6869 WHERE kota = 'Kuala Lumpur';
UPDATE kunjungan_prabowo SET lat =  28.6139, lon =  77.2090 WHERE kota = 'New Delhi';
UPDATE kunjungan_prabowo SET lat =   2.9264, lon = 101.6964 WHERE kota = 'Putrajaya';
UPDATE kunjungan_prabowo SET lat =  39.9334, lon =  32.8597 WHERE kota = 'Ankara';
UPDATE kunjungan_prabowo SET lat =  25.2854, lon =  51.5310 WHERE kota = 'Doha';
UPDATE kunjungan_prabowo SET lat =  31.9516, lon =  35.9239 WHERE kota = 'Amman';
UPDATE kunjungan_prabowo SET lat =   4.9031, lon = 114.9398 WHERE kota = 'Bandar Seri Begawan';
UPDATE kunjungan_prabowo SET lat =  13.7563, lon = 100.5018 WHERE kota = 'Bangkok';
UPDATE kunjungan_prabowo SET lat =   1.3521, lon = 103.8198 WHERE kota = 'Singapura';
UPDATE kunjungan_prabowo SET lat =  50.0755, lon =  14.4378 WHERE kota = 'Praha';
UPDATE kunjungan_prabowo SET lat =  59.9311, lon =  30.3609 WHERE kota = 'Sankt-Peterburg';
UPDATE kunjungan_prabowo SET lat =  21.4858, lon =  39.1925 WHERE kota = 'Jeddah';
UPDATE kunjungan_prabowo SET lat =  50.8503, lon =   4.3517 WHERE kota = 'Brussel';
UPDATE kunjungan_prabowo SET lat =  48.8566, lon =   2.3522 WHERE kota = 'Paris';
UPDATE kunjungan_prabowo SET lat =  54.0374, lon =  27.7432 WHERE kota = 'Ozyorny';
UPDATE kunjungan_prabowo SET lat =  35.8562, lon = 129.2247 WHERE kota = 'Gyeongju';
UPDATE kunjungan_prabowo SET lat =  45.4215, lon = -75.6972 WHERE kota = 'Ottawa';
UPDATE kunjungan_prabowo SET lat =  52.3676, lon =   4.9041 WHERE kota = 'Amsterdam';
UPDATE kunjungan_prabowo SET lat =  27.9158, lon =  34.3300 WHERE kota = 'Sharm El-Sheikh';
UPDATE kunjungan_prabowo SET lat = -33.8688, lon = 151.2093 WHERE kota = 'Sydney';
UPDATE kunjungan_prabowo SET lat =  33.6844, lon =  73.0479 WHERE kota = 'Islamabad';
UPDATE kunjungan_prabowo SET lat =  55.7558, lon =  37.6173 WHERE kota = 'Moskow';
UPDATE kunjungan_prabowo SET lat =  46.8132, lon =   9.8376 WHERE kota = 'Davos';
UPDATE kunjungan_prabowo SET lat =  34.6937, lon = 135.5023 WHERE kota = 'Osaka';
UPDATE kunjungan_prabowo SET lat =  40.7128, lon = -74.0060 WHERE kota = 'New York';
UPDATE kunjungan_prabowo SET lat =  37.5665, lon = 126.9780 WHERE kota = 'Seoul';
UPDATE kunjungan_prabowo SET lat =  35.6762, lon = 139.6503 WHERE kota = 'Tokyo';
UPDATE kunjungan_prabowo SET lat =  10.3157, lon = 123.8854 WHERE kota = 'Cebu';

-- ── Bendera (flag emoji) per negara ──────────────────────────────
UPDATE kunjungan_prabowo SET flag = '🇨🇳' WHERE negara = 'Tiongkok';
UPDATE kunjungan_prabowo SET flag = '🇺🇸' WHERE negara = 'Amerika Serikat';
UPDATE kunjungan_prabowo SET flag = '🇵🇪' WHERE negara = 'Peru';
UPDATE kunjungan_prabowo SET flag = '🇧🇷' WHERE negara = 'Brasil';
UPDATE kunjungan_prabowo SET flag = '🇬🇧' WHERE negara = 'Britania Raya';
UPDATE kunjungan_prabowo SET flag = '🇦🇪' WHERE negara = 'Uni Emirat Arab';
UPDATE kunjungan_prabowo SET flag = '🇪🇬' WHERE negara = 'Mesir';
UPDATE kunjungan_prabowo SET flag = '🇲🇾' WHERE negara = 'Malaysia';
UPDATE kunjungan_prabowo SET flag = '🇮🇳' WHERE negara = 'India';
UPDATE kunjungan_prabowo SET flag = '🇹🇷' WHERE negara = 'Turki';
UPDATE kunjungan_prabowo SET flag = '🇶🇦' WHERE negara = 'Qatar';
UPDATE kunjungan_prabowo SET flag = '🇯🇴' WHERE negara = 'Yordania';
UPDATE kunjungan_prabowo SET flag = '🇧🇳' WHERE negara = 'Brunei Darussalam';
UPDATE kunjungan_prabowo SET flag = '🇹🇭' WHERE negara = 'Thailand';
UPDATE kunjungan_prabowo SET flag = '🇸🇬' WHERE negara = 'Singapura';
UPDATE kunjungan_prabowo SET flag = '🇨🇿' WHERE negara = 'Ceko';
UPDATE kunjungan_prabowo SET flag = '🇷🇺' WHERE negara = 'Rusia';
UPDATE kunjungan_prabowo SET flag = '🇸🇦' WHERE negara = 'Arab Saudi';
UPDATE kunjungan_prabowo SET flag = '🇧🇪' WHERE negara = 'Belgia';
UPDATE kunjungan_prabowo SET flag = '🇫🇷' WHERE negara = 'Prancis';
UPDATE kunjungan_prabowo SET flag = '🇧🇾' WHERE negara = 'Belarus';
UPDATE kunjungan_prabowo SET flag = '🇯🇵' WHERE negara = 'Jepang';
UPDATE kunjungan_prabowo SET flag = '🇨🇦' WHERE negara = 'Kanada';
UPDATE kunjungan_prabowo SET flag = '🇳🇱' WHERE negara = 'Belanda';
UPDATE kunjungan_prabowo SET flag = '🇦🇺' WHERE negara = 'Australia';
UPDATE kunjungan_prabowo SET flag = '🇵🇰' WHERE negara = 'Pakistan';
UPDATE kunjungan_prabowo SET flag = '🇰🇷' WHERE negara = 'Korea Selatan';
UPDATE kunjungan_prabowo SET flag = '🇨🇭' WHERE negara = 'Swiss';
UPDATE kunjungan_prabowo SET flag = '🇵🇭' WHERE negara = 'Filipina';

-- ── Verifikasi ────────────────────────────────────────────────────
SELECT no, negara, kota, lat, lon, flag
FROM   kunjungan_prabowo
WHERE  lat IS NULL OR lon IS NULL OR flag IS NULL
ORDER  BY no;
-- Jika query ini mengembalikan 0 baris, semua data sudah lengkap.
