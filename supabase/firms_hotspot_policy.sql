-- ─────────────────────────────────────────────────────────────────────
-- firms_hotspot — akses baca publik untuk peta /maps/hotspot_monitoring
--
-- Peta membaca view `firms_hotspot_wib` memakai SUPABASE_ANON_KEY (role `anon`).
-- Kondisi saat ini: request ke view balas HTTP 200 tapi 0 baris. Artinya GRANT
-- SELECT ke anon sudah ada (kalau tidak, jawabannya 401/permission denied),
-- yang belum adalah policy RLS di TABEL DASARNYA.
--
-- Policy harus dipasang di tabel dasar (`firms_hotspot`), bukan di view —
-- view tidak punya RLS sendiri.
--
-- Jalankan di: Supabase Dashboard → SQL Editor (project fvvgkoibzoczpfavnaag)
-- Aman dijalankan berulang (idempoten).
-- ─────────────────────────────────────────────────────────────────────

-- 1) Diagnosa — pastikan mana yang table dan mana yang view
select table_name, table_type
  from information_schema.tables
 where table_schema = 'public'
   and table_name like 'firms_hotspot%'
 order by table_name;

select count(*) as total_baris from public.firms_hotspot;

select relrowsecurity as rls_aktif
  from pg_class
 where oid = 'public.firms_hotspot'::regclass;

select policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and tablename  = 'firms_hotspot';

-- 2) Perbaikan — policy baca publik di tabel dasar
alter table public.firms_hotspot enable row level security;

drop policy if exists "firms_hotspot public read" on public.firms_hotspot;

create policy "firms_hotspot public read"
  on public.firms_hotspot
  for select
  to anon, authenticated
  using (true);

-- 3) Pastikan anon boleh membaca view-nya juga
grant select on public.firms_hotspot_wib to anon, authenticated;

-- 4) Verifikasi — harus mengembalikan baris, bukan array kosong
--    (atau cek langsung: curl http://localhost:3000/api/hotspot/data)
select id, latitude, longitude, province, regency,
       acq_datetime_wib, satellite, instrument,
       confidence_level, frp_mw, daynight
  from public.firms_hotspot_wib
 order by acq_datetime_wib desc
 limit 5;

-- ── Catatan kalau langkah 2 sudah dijalankan tapi peta tetap kosong ──
-- Berarti view-nya dibuat dengan security_invoker sehingga RLS dievaluasi
-- sebagai anon. Cek dengan:
--   select c.relname, c.reloptions from pg_class c
--    where c.relname = 'firms_hotspot_wib';
-- Kalau reloptions memuat security_invoker=true, policy di langkah 2 memang
-- yang menentukan — pastikan `using (true)` benar-benar tersimpan.
