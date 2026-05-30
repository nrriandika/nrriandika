-- ================================================================
-- Tabel: kunjungan_prabowo
-- Jalankan SEBELUM import CSV.
-- ================================================================

CREATE TABLE IF NOT EXISTS kunjungan_prabowo (
  no              INTEGER          PRIMARY KEY,
  tahun           SMALLINT         NOT NULL,
  negara          TEXT             NOT NULL,
  kawasan         TEXT,
  kota            TEXT,
  tanggal_mulai   DATE,
  tanggal_selesai DATE,
  jenis_kunjungan TEXT,
  rincian         TEXT,
  sumber_media    TEXT,
  sumber_url      TEXT,
  -- kolom tambahan (diisi via kunjungan_coords.sql setelah import)
  flag            TEXT,
  lat             DOUBLE PRECISION,
  lon             DOUBLE PRECISION
);
