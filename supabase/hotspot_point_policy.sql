-- ─────────────────────────────────────────────────────────────────────
-- hotspot_point — akses baca publik untuk peta /maps/hotspot_monitoring
--
-- Konteks: web app membaca tabel ini memakai SUPABASE_ANON_KEY (role `anon`).
-- Tanpa policy SELECT, PostgREST tidak melempar error — dia mengembalikan
-- array kosong, sehingga peta tampak "tidak dapat data" padahal tabel terisi.
-- Dashboard Supabase tetap terlihat berisi karena memakai service-role
-- yang bypass RLS.
--
-- Jalankan di: Supabase Dashboard → SQL Editor (project fvvgkoibzoczpfavnaag)
-- Aman dijalankan berulang (idempoten).
-- ─────────────────────────────────────────────────────────────────────

-- 1) Diagnosa — jalankan dulu, lihat hasilnya sebelum lanjut
select count(*) as total_baris from public.hotspot_point;

select relrowsecurity as rls_aktif
  from pg_class
 where oid = 'public.hotspot_point'::regclass;

select policyname, cmd, roles, qual
  from pg_policies
 where schemaname = 'public'
   and tablename  = 'hotspot_point';

-- 2) Perbaikan — hanya perlu bila total_baris > 0 tapi peta masih kosong
alter table public.hotspot_point enable row level security;

drop policy if exists "hotspot_point public read" on public.hotspot_point;

create policy "hotspot_point public read"
  on public.hotspot_point
  for select
  to anon, authenticated
  using (true);

-- 3) Verifikasi — harus mengembalikan baris, bukan array kosong
--    (atau cek langsung: curl http://localhost:3000/api/hotspot/data)
select latitude, longitude, confidence_level, source, date, province, regency, satellite
  from public.hotspot_point
 order by date desc
 limit 5;
