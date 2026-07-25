-- =====================================================================
-- PELITAKU - MIGRASI V2
-- Jalankan script ini di SQL Editor Supabase pada project yang SUDAH
-- berjalan (yang sudah punya data murid, jadwal, dll).
-- Script ini TIDAK menghapus data lama kamu.
--
-- Perbaikan:
-- 1. Ayat renungan sekarang per HARI (Senin-Sabtu), bukan per minggu.
-- 2. Guru bisa melihat daftar kuis + soal yang sudah dibuat.
-- 3. Guru bisa membaca renungan murid per hari (bukan hanya per murid).
-- 4. Murid mendapat info status kuis yang lebih jelas.
-- =====================================================================

-- =====================================================================
-- BAGIAN 1: TABEL AYAT HARIAN (BARU)
-- =====================================================================
create table if not exists public.ayat_harian (
    id uuid primary key default gen_random_uuid(),
    jadwal_id uuid not null references public.jadwal_mingguan (id) on delete cascade,
    hari smallint not null check (hari between 1 and 6), -- 1=Senin, 2=Selasa, 3=Rabu, 4=Kamis, 5=Jumat, 6=Sabtu
    ayat_referensi text not null,
    ayat_isi text not null,
    created_at timestamptz not null default now(),
    unique (jadwal_id, hari)
);

comment on table public.ayat_harian is 'Ayat renungan per hari (Senin-Sabtu) untuk satu minggu jadwal. Absensi tetap di hari Minggu.';

alter table public.ayat_harian enable row level security;

drop policy if exists "ayat_harian_hanya_guru" on public.ayat_harian;
create policy "ayat_harian_hanya_guru"
on public.ayat_harian for all
using ( public.is_guru() )
with check ( public.is_guru() );

-- View aman untuk murid: hanya ayat dari jadwal yang sedang aktif
drop view if exists public.ayat_harian_publik;
create view public.ayat_harian_publik
with (security_invoker = false) as
select ah.id, ah.jadwal_id, ah.hari, ah.ayat_referensi, ah.ayat_isi
from public.ayat_harian ah
join public.jadwal_mingguan jm on jm.id = ah.jadwal_id
where jm.status_aktif = true;

grant select on public.ayat_harian_publik to authenticated;

-- =====================================================================
-- BAGIAN 2: KOLOM AYAT LAMA DI jadwal_mingguan TIDAK DIPAKAI LAGI
-- (Tidak dihapus/tidak mengganggu data lama, hanya dibuat boleh kosong
--  karena form baru tidak akan mengisinya lagi)
-- =====================================================================
alter table public.jadwal_mingguan alter column ayat_referensi drop not null;
alter table public.jadwal_mingguan alter column ayat_isi drop not null;

-- =====================================================================
-- BAGIAN 3: UBAH TABEL renungan AGAR TERKAIT KE AYAT HARIAN
-- =====================================================================
alter table public.renungan add column if not exists ayat_harian_id uuid references public.ayat_harian (id);

-- Hapus batasan lama "1 renungan per minggu" (nama constraint mengikuti hasil auto-generate Postgres)
alter table public.renungan drop constraint if exists renungan_murid_id_jadwal_id_key;

-- Batasan baru: 1 renungan per hari (index parsial, tidak menyentuh data lama yang ayat_harian_id-nya kosong)
create unique index if not exists renungan_unik_per_hari
on public.renungan (murid_id, ayat_harian_id)
where ayat_harian_id is not null;

-- =====================================================================
-- BAGIAN 4: GANTI RPC submit_renungan AGAR BEKERJA PER HARI
-- =====================================================================
create or replace function public.submit_renungan(
    p_ayat_harian_id uuid,
    p_isi_renungan text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_jadwal_id uuid;
    v_sudah_ada integer;
begin
    if length(trim(p_isi_renungan)) < 50 then
        return json_build_object('sukses', false, 'pesan', 'Renungan minimal harus 50 karakter.');
    end if;

    select jadwal_id into v_jadwal_id
    from public.ayat_harian
    where id = p_ayat_harian_id;

    if v_jadwal_id is null then
        return json_build_object('sukses', false, 'pesan', 'Ayat harian tidak ditemukan.');
    end if;

    select count(*) into v_sudah_ada
    from public.renungan
    where murid_id = auth.uid() and ayat_harian_id = p_ayat_harian_id;

    if v_sudah_ada > 0 then
        return json_build_object('sukses', false, 'pesan', 'Renungan untuk hari ini sudah pernah diisi.');
    end if;

    insert into public.renungan (murid_id, jadwal_id, ayat_harian_id, isi_renungan)
    values (auth.uid(), v_jadwal_id, p_ayat_harian_id, trim(p_isi_renungan));

    update public.profil
    set total_poin = total_poin + 1,
        streak_renungan = streak_renungan + 1
    where id = auth.uid();

    return json_build_object('sukses', true, 'pesan', 'Renungan berhasil disimpan. Kamu mendapat 1 poin.');
end;
$$;

-- Catatan: fungsi lama submit_renungan(p_jadwal_id uuid, p_isi_renungan text) otomatis
-- tergantikan karena tipe parameter (uuid, text) sama persis -> Postgres menimpanya
-- dengan CREATE OR REPLACE di atas. Tidak perlu DROP FUNCTION manual.

-- =====================================================================
-- BAGIAN 5: VIEW STATUS KUIS UNTUK MURID (perbaikan Bug 2)
-- Menampilkan info kuis (judul & waktu) walau kuis belum/sudah tidak aktif,
-- TANPA membocorkan isi soal atau kunci jawaban (itu tetap lewat
-- soal_kuis_publik yang hanya terbuka saat jendela waktu aktif).
-- =====================================================================
drop view if exists public.kuis_status_publik;
create view public.kuis_status_publik
with (security_invoker = false) as
select k.id, k.judul, k.waktu_mulai, k.waktu_selesai, k.jadwal_id
from public.kuis k
join public.jadwal_mingguan jm on jm.id = k.jadwal_id
where jm.status_aktif = true;

grant select on public.kuis_status_publik to authenticated;

-- =====================================================================
-- SELESAI. Setelah menjalankan script ini:
-- 1. Guru akan mengisi 6 ayat (Senin-Sabtu) saat membuat jadwal minggu baru.
-- 2. Murid akan melihat ayat sesuai hari berjalan otomatis.
-- 3. Guru bisa melihat daftar kuis yang sudah dibuat + isi soalnya.
-- 4. Guru bisa melihat renungan semua murid per hari lewat tab baru.
-- =====================================================================
