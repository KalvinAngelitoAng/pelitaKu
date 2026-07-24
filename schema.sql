-- =====================================================================
-- PELITAKU - SKEMA DATABASE SUPABASE (POSTGRESQL)
-- Jalankan seluruh script ini di Supabase SQL Editor secara berurutan.
-- =====================================================================

-- Ekstensi untuk membuat UUID otomatis
create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. TABEL PROFIL (terhubung ke auth.users)
-- =====================================================================
create table public.profil (
    id uuid primary key references auth.users (id) on delete cascade,
    nama_lengkap text not null,
    tanggal_lahir date,
    kelas text,
    role text not null check (role in ('murid', 'guru')),
    total_poin integer not null default 0,
    streak_renungan integer not null default 0,
    created_at timestamptz not null default now()
);

comment on table public.profil is 'Data profil setiap pengguna (murid & guru), 1 baris = 1 akun auth.users';

-- =====================================================================
-- 2. TABEL JADWAL MINGGUAN (PIN Absensi & Ayat Renungan)
-- =====================================================================
create table public.jadwal_mingguan (
    id uuid primary key default gen_random_uuid(),
    minggu_ke text not null, -- contoh: 'Minggu 1 - Juli 2026'
    pin_absensi text not null,
    ayat_referensi text not null, -- contoh: 'Yohanes 3:16'
    ayat_isi text not null,
    tanggal_mulai date not null,
    tanggal_selesai date not null,
    status_aktif boolean not null default true,
    dibuat_oleh uuid references public.profil (id),
    created_at timestamptz not null default now()
);

comment on table public.jadwal_mingguan is 'Pengaturan mingguan: PIN absensi & ayat renungan harian, dibuat oleh guru';

-- =====================================================================
-- 3. TABEL KEHADIRAN
-- =====================================================================
create table public.kehadiran (
    id uuid primary key default gen_random_uuid(),
    murid_id uuid not null references public.profil (id) on delete cascade,
    jadwal_id uuid not null references public.jadwal_mingguan (id) on delete cascade,
    status text not null check (status in ('hadir', 'izin')),
    alasan_izin text,
    created_at timestamptz not null default now(),
    unique (murid_id, jadwal_id)
);

comment on table public.kehadiran is 'Rekap absensi murid per minggu, satu murid hanya bisa absen sekali per minggu';

-- =====================================================================
-- 4. TABEL RENUNGAN
-- =====================================================================
create table public.renungan (
    id uuid primary key default gen_random_uuid(),
    murid_id uuid not null references public.profil (id) on delete cascade,
    jadwal_id uuid not null references public.jadwal_mingguan (id) on delete cascade,
    isi_renungan text not null,
    created_at timestamptz not null default now(),
    unique (murid_id, jadwal_id)
);

comment on table public.renungan is 'Isian renungan Alkitab murid, satu kali isi per minggu';

-- =====================================================================
-- 5. TABEL KUIS
-- =====================================================================
create table public.kuis (
    id uuid primary key default gen_random_uuid(),
    jadwal_id uuid references public.jadwal_mingguan (id) on delete set null,
    judul text not null,
    waktu_mulai timestamptz not null,
    waktu_selesai timestamptz not null,
    dibuat_oleh uuid references public.profil (id),
    created_at timestamptz not null default now()
);

comment on table public.kuis is 'Kuis mingguan yang dibuat guru, punya rentang waktu buka-tutup';

-- =====================================================================
-- 6. TABEL SOAL KUIS (berisi kunci jawaban - TIDAK BOLEH terekspos ke murid)
-- =====================================================================
create table public.soal_kuis (
    id uuid primary key default gen_random_uuid(),
    kuis_id uuid not null references public.kuis (id) on delete cascade,
    urutan integer not null default 1,
    pertanyaan text not null,
    opsi_a text not null,
    opsi_b text not null,
    opsi_c text not null,
    opsi_d text not null,
    kunci_jawaban text not null check (kunci_jawaban in ('a', 'b', 'c', 'd'))
);

comment on table public.soal_kuis is 'Daftar soal pilihan ganda, kolom kunci_jawaban hanya boleh diakses guru & fungsi RPC';

-- =====================================================================
-- 7. TABEL JAWABAN KUIS (hasil pengerjaan & skor akhir)
-- =====================================================================
create table public.jawaban_kuis (
    id uuid primary key default gen_random_uuid(),
    murid_id uuid not null references public.profil (id) on delete cascade,
    kuis_id uuid not null references public.kuis (id) on delete cascade,
    jawaban_json jsonb not null, -- contoh: {"soal_id_1": "a", "soal_id_2": "c"}
    skor integer not null default 0,
    dikerjakan_pada timestamptz not null default now(),
    unique (murid_id, kuis_id)
);

comment on table public.jawaban_kuis is 'Hasil akhir pengerjaan kuis murid, skor dihitung di backend (RPC), bukan di frontend';

-- =====================================================================
-- 8. TABEL REWARD CLAIMS (klaim Susu Gratis)
-- =====================================================================
create table public.reward_claims (
    id uuid primary key default gen_random_uuid(),
    murid_id uuid not null references public.profil (id) on delete cascade,
    target_poin integer not null,
    tanggal_klaim timestamptz not null default now(),
    unique (murid_id, target_poin)
);

comment on table public.reward_claims is 'Riwayat klaim reward berdasarkan pencapaian target poin tertentu';

-- =====================================================================
-- FUNGSI BANTUAN: CEK APAKAH PENGGUNA SEDANG LOGIN ADALAH GURU
-- (SECURITY DEFINER agar tidak menyebabkan rekursi RLS pada tabel profil)
-- =====================================================================
create or replace function public.is_guru()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profil
        where id = auth.uid() and role = 'guru'
    );
$$;

-- =====================================================================
-- AKTIFKAN ROW LEVEL SECURITY DI SEMUA TABEL
-- =====================================================================
alter table public.profil enable row level security;
alter table public.jadwal_mingguan enable row level security;
alter table public.kehadiran enable row level security;
alter table public.renungan enable row level security;
alter table public.kuis enable row level security;
alter table public.soal_kuis enable row level security;
alter table public.jawaban_kuis enable row level security;
alter table public.reward_claims enable row level security;

-- =====================================================================
-- POLICY: PROFIL
-- Murid hanya bisa lihat profil sendiri, guru bisa lihat semua profil
-- =====================================================================
create policy "profil_select_sendiri_atau_guru"
on public.profil for select
using ( id = auth.uid() or public.is_guru() );

create policy "profil_update_terbatas_sendiri"
on public.profil for update
using ( id = auth.uid() )
with check ( id = auth.uid() );

create policy "profil_guru_kelola_semua"
on public.profil for all
using ( public.is_guru() )
with check ( public.is_guru() );

-- =====================================================================
-- POLICY: JADWAL MINGGUAN
-- Hanya guru yang boleh akses tabel asli secara langsung (termasuk PIN).
-- Murid mengakses lewat VIEW "jadwal_publik" di bawah (tanpa kolom PIN).
-- =====================================================================
create policy "jadwal_hanya_guru"
on public.jadwal_mingguan for all
using ( public.is_guru() )
with check ( public.is_guru() );

-- View aman untuk murid: TIDAK menampilkan kolom pin_absensi
create view public.jadwal_publik
with (security_invoker = false) as
select
    id, minggu_ke, ayat_referensi, ayat_isi,
    tanggal_mulai, tanggal_selesai, status_aktif, created_at
from public.jadwal_mingguan
where status_aktif = true;

grant select on public.jadwal_publik to authenticated;

-- =====================================================================
-- POLICY: KEHADIRAN
-- Murid boleh insert/lihat kehadiran miliknya sendiri saja.
-- Guru boleh lihat semua data kehadiran.
-- (Insert normal murid TETAP dipakai untuk fitur "Izin",
--  sedangkan absen "Hadir" WAJIB lewat RPC catat_kehadiran agar PIN tervalidasi)
-- =====================================================================
create policy "kehadiran_select_sendiri_atau_guru"
on public.kehadiran for select
using ( murid_id = auth.uid() or public.is_guru() );

create policy "kehadiran_insert_izin_sendiri"
on public.kehadiran for insert
with check ( murid_id = auth.uid() and status = 'izin' );

-- =====================================================================
-- POLICY: RENUNGAN
-- Murid lihat & insert milik sendiri, guru boleh lihat semua renungan murid
-- =====================================================================
create policy "renungan_select_sendiri_atau_guru"
on public.renungan for select
using ( murid_id = auth.uid() or public.is_guru() );

-- Insert renungan langsung TIDAK diizinkan; wajib lewat RPC submit_renungan
-- agar validasi minimal 50 karakter & pemberian poin konsisten di server.

-- =====================================================================
-- POLICY: KUIS
-- Murid boleh lihat kuis yang jadwalnya masih dalam rentang waktu aktif
-- Guru boleh kelola semua kuis
-- =====================================================================
create policy "kuis_select_aktif_atau_guru"
on public.kuis for select
using (
    public.is_guru()
    or now() between waktu_mulai and waktu_selesai
);

create policy "kuis_guru_kelola"
on public.kuis for all
using ( public.is_guru() )
with check ( public.is_guru() );

-- =====================================================================
-- POLICY: SOAL KUIS
-- Tabel asli (dengan kunci_jawaban) HANYA bisa diakses guru.
-- Murid mengakses lewat VIEW "soal_kuis_publik" (tanpa kunci_jawaban).
-- =====================================================================
create policy "soal_kuis_hanya_guru"
on public.soal_kuis for all
using ( public.is_guru() )
with check ( public.is_guru() );

create view public.soal_kuis_publik
with (security_invoker = false) as
select
    sk.id, sk.kuis_id, sk.urutan, sk.pertanyaan,
    sk.opsi_a, sk.opsi_b, sk.opsi_c, sk.opsi_d
from public.soal_kuis sk
join public.kuis k on k.id = sk.kuis_id
where now() between k.waktu_mulai and k.waktu_selesai;

grant select on public.soal_kuis_publik to authenticated;

-- =====================================================================
-- POLICY: JAWABAN KUIS
-- Murid hanya bisa lihat jawaban miliknya sendiri (insert lewat RPC saja)
-- Guru boleh lihat semua hasil kuis
-- =====================================================================
create policy "jawaban_kuis_select_sendiri_atau_guru"
on public.jawaban_kuis for select
using ( murid_id = auth.uid() or public.is_guru() );

-- =====================================================================
-- POLICY: REWARD CLAIMS
-- Murid lihat klaim miliknya, guru lihat semua (insert lewat RPC saja)
-- =====================================================================
create policy "reward_claims_select_sendiri_atau_guru"
on public.reward_claims for select
using ( murid_id = auth.uid() or public.is_guru() );

-- =====================================================================
-- RPC 1: CATAT KEHADIRAN "HADIR" (validasi PIN di server)
-- =====================================================================
create or replace function public.catat_kehadiran(
    p_jadwal_id uuid,
    p_pin text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pin_asli text;
    v_sudah_ada integer;
begin
    select pin_absensi into v_pin_asli
    from public.jadwal_mingguan
    where id = p_jadwal_id and status_aktif = true;

    if v_pin_asli is null then
        return json_build_object('sukses', false, 'pesan', 'Jadwal minggu ini tidak ditemukan atau tidak aktif.');
    end if;

    if v_pin_asli <> p_pin then
        return json_build_object('sukses', false, 'pesan', 'PIN yang kamu masukkan salah.');
    end if;

    select count(*) into v_sudah_ada
    from public.kehadiran
    where murid_id = auth.uid() and jadwal_id = p_jadwal_id;

    if v_sudah_ada > 0 then
        return json_build_object('sukses', false, 'pesan', 'Kamu sudah melakukan absensi minggu ini.');
    end if;

    insert into public.kehadiran (murid_id, jadwal_id, status)
    values (auth.uid(), p_jadwal_id, 'hadir');

    return json_build_object('sukses', true, 'pesan', 'Absensi Hadir berhasil dicatat.');
end;
$$;

-- =====================================================================
-- RPC 2: SUBMIT RENUNGAN (validasi panjang teks & pemberian poin di server)
-- =====================================================================
create or replace function public.submit_renungan(
    p_jadwal_id uuid,
    p_isi_renungan text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_sudah_ada integer;
begin
    if length(trim(p_isi_renungan)) < 50 then
        return json_build_object('sukses', false, 'pesan', 'Renungan minimal harus 50 karakter.');
    end if;

    select count(*) into v_sudah_ada
    from public.renungan
    where murid_id = auth.uid() and jadwal_id = p_jadwal_id;

    if v_sudah_ada > 0 then
        return json_build_object('sukses', false, 'pesan', 'Renungan minggu ini sudah pernah diisi.');
    end if;

    insert into public.renungan (murid_id, jadwal_id, isi_renungan)
    values (auth.uid(), p_jadwal_id, trim(p_isi_renungan));

    update public.profil
    set total_poin = total_poin + 1,
        streak_renungan = streak_renungan + 1
    where id = auth.uid();

    return json_build_object('sukses', true, 'pesan', 'Renungan berhasil disimpan. Kamu mendapat 1 poin.');
end;
$$;

-- =====================================================================
-- RPC 3: SUBMIT JAWABAN KUIS & HITUNG SKOR DI SERVER
-- p_jawaban berformat: [{"soal_id": "uuid", "jawaban": "a"}, ...]
-- =====================================================================
create or replace function public.submit_kuis(
    p_kuis_id uuid,
    p_jawaban jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_kuis record;
    v_sudah_ada integer;
    v_item jsonb;
    v_kunci text;
    v_skor integer := 0;
    v_total_soal integer := 0;
begin
    select * into v_kuis from public.kuis where id = p_kuis_id;

    if v_kuis is null then
        return json_build_object('sukses', false, 'pesan', 'Kuis tidak ditemukan.');
    end if;

    if now() < v_kuis.waktu_mulai or now() > v_kuis.waktu_selesai then
        return json_build_object('sukses', false, 'pesan', 'Waktu pengerjaan kuis sudah berakhir atau belum dibuka.');
    end if;

    select count(*) into v_sudah_ada
    from public.jawaban_kuis
    where murid_id = auth.uid() and kuis_id = p_kuis_id;

    if v_sudah_ada > 0 then
        return json_build_object('sukses', false, 'pesan', 'Kamu sudah pernah mengumpulkan kuis ini.');
    end if;

    select count(*) into v_total_soal from public.soal_kuis where kuis_id = p_kuis_id;

    for v_item in select * from jsonb_array_elements(p_jawaban)
    loop
        select kunci_jawaban into v_kunci
        from public.soal_kuis
        where id = (v_item->>'soal_id')::uuid and kuis_id = p_kuis_id;

        if v_kunci is not null and v_kunci = (v_item->>'jawaban') then
            v_skor := v_skor + 1;
        end if;
    end loop;

    insert into public.jawaban_kuis (murid_id, kuis_id, jawaban_json, skor)
    values (auth.uid(), p_kuis_id, p_jawaban, v_skor);

    update public.profil
    set total_poin = total_poin + v_skor
    where id = auth.uid();

    return json_build_object(
        'sukses', true,
        'pesan', 'Kuis berhasil dikumpulkan.',
        'skor', v_skor,
        'total_soal', v_total_soal
    );
end;
$$;

-- =====================================================================
-- RPC 4: KLAIM REWARD SUSU GRATIS
-- =====================================================================
create or replace function public.klaim_reward(
    p_target_poin integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_poin_saat_ini integer;
    v_sudah_klaim integer;
begin
    select total_poin into v_poin_saat_ini from public.profil where id = auth.uid();

    if v_poin_saat_ini < p_target_poin then
        return json_build_object('sukses', false, 'pesan', 'Poin kamu belum mencukupi target ini.');
    end if;

    select count(*) into v_sudah_klaim
    from public.reward_claims
    where murid_id = auth.uid() and target_poin = p_target_poin;

    if v_sudah_klaim > 0 then
        return json_build_object('sukses', false, 'pesan', 'Reward untuk target ini sudah pernah diklaim.');
    end if;

    insert into public.reward_claims (murid_id, target_poin)
    values (auth.uid(), p_target_poin);

    return json_build_object('sukses', true, 'pesan', 'Klaim Susu Gratis berhasil.');
end;
$$;

-- =====================================================================
-- CATATAN PENTING UNTUK GURU/ADMIN (dilakukan manual di Supabase Dashboard):
-- 1. Buat user baru lewat menu Authentication > Users > Add User.
-- 2. Salin UUID user tersebut, lalu jalankan INSERT manual ke tabel profil:
--
--    insert into public.profil (id, nama_lengkap, tanggal_lahir, kelas, role)
--    values ('UUID_DARI_AUTH_USERS', 'Nama Lengkap', '2015-05-10', 'Kelas Kecil', 'murid');
--
-- 3. Untuk akun guru, gunakan role = 'guru'.
-- =====================================================================
