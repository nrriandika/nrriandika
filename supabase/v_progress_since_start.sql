-- Jalankan di project Supabase OTOMASI (SQL Editor).
-- Membungkus query "progress since start" jadi sebuah VIEW supaya bisa dibaca
-- oleh website lewat supabase-js: supabaseAutomation.from('v_progress_since_start').
-- Endpoint: GET /api/automation/progress

create or replace view v_progress_since_start as
with first_per_province as (
  select
    pm.province_name,
    pm.pemetaan_masuk     as lahan_start,
    pm.persen_pemetaan    as pct_pemetaan_start,
    pm.persen_pembangunan as pct_pembangunan_start,
    ds.wib_date           as start_date
  from province_metrics pm
  join v_daily_snapshot ds on ds.id = pm.snapshot_id
  where ds.wib_date = (select min(wib_date) from v_daily_snapshot)
)
select
  initcap(lower(v.province_name))                       as province,
  p.code                                                as bps_code,
  v.jumlah_desa,

  -- ===== POSISI AWAL (24 Mei) =====
  fs.start_date,
  fs.lahan_start,
  fs.pct_pemetaan_start,
  fs.pct_pembangunan_start,

  -- ===== POSISI SEKARANG =====
  v.wib_date                                            as latest_date,
  v.pemetaan_masuk                                      as lahan_now,
  v.persen_pemetaan                                     as pct_pemetaan_now,
  v.persen_pembangunan                                  as pct_pembangunan_now,

  -- ===== CUMULATIVE DELTA (sejak awal scrape) =====
  v.pemetaan_masuk - fs.lahan_start                     as delta_lahan_total,
  round((v.persen_pemetaan    - fs.pct_pemetaan_start)::numeric, 2)
    as delta_pp_pemetaan_total,
  round((v.persen_pembangunan - fs.pct_pembangunan_start)::numeric, 2)
    as delta_pp_pembangunan_total,

  -- ===== TIME WINDOW =====
  (v.wib_date - fs.start_date)                          as days_tracked,

  -- ===== VELOCITY rata-rata per hari =====
  round((v.pemetaan_masuk - fs.lahan_start)::numeric
        / nullif(v.wib_date - fs.start_date, 0)::numeric, 2)
    as lahan_per_day,
  round(((v.persen_pembangunan - fs.pct_pembangunan_start)
         / nullif(v.wib_date - fs.start_date, 0))::numeric, 3)
    as pp_pembangunan_per_day,

  -- ===== DELTA jangka pendek (untuk konteks tambahan) =====
  coalesce(v.delta_lahan_1d, 0)             as delta_lahan_1d,
  coalesce(v.delta_pp_pembangunan_1d, 0)    as delta_pp_pembangunan_1d,
  coalesce(v.delta_lahan_7d, 0)             as delta_lahan_7d,
  coalesce(v.delta_pp_pembangunan_7d, 0)    as delta_pp_pembangunan_7d,

  -- ===== STATUS LABEL berdasarkan cumulative =====
  case
    when (v.pemetaan_masuk - fs.lahan_start) > 0
      or (v.persen_pembangunan - fs.pct_pembangunan_start) > 1
      then 'BERGERAK'
    when (v.pemetaan_masuk - fs.lahan_start) = 0
      and (v.persen_pembangunan - fs.pct_pembangunan_start) < 0.1
      then 'STAGNAN'
    else 'PERLAHAN'
  end as status_since_start

from v_province_velocity_latest v
join provinces p             on p.name = v.province_name
join first_per_province fs   on fs.province_name = v.province_name
order by v.persen_pembangunan desc nulls last;
