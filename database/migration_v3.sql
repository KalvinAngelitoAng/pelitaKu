-- =====================================================================
-- PELITAKU - MIGRASI V3
-- Jalankan script ini di SQL Editor Supabase project kamu yang sudah
-- berjalan (yang sudah punya migration_v2.sql sebelumnya).
-- Script ini TIDAK menghapus data lama kamu.
--
-- Fitur baru:
-- Push notification pengingat "Renungan hari ini belum diisi", dikirim
-- ke browser murid meskipun tab web sudah ditutup.
-- =====================================================================

-- =====================================================================
-- BAGIAN 1: TABEL PENYIMPAN "ALAMAT" PUSH NOTIFICATION BROWSER MURID
-- Satu murid bisa punya lebih dari satu baris kalau dia login dari
-- beberapa device/browser berbeda (HP, laptop, dst).
-- =====================================================================
create table if not exists public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    murid_id uuid not null references public.profil (id) on delete cascade,
    endpoint text not null,
    p256dh text not null,
    auth text not null,
    dibuat_pada timestamptz not null default now(),
    unique (murid_id, endpoint)
);

comment on table public.push_subscriptions is 'Data langganan Web Push tiap browser/device murid, dipakai Edge Function untuk mengirim notifikasi pengingat renungan';

alter table public.push_subscriptions enable row level security;

-- Murid hanya boleh kelola langganan miliknya sendiri (daftar & hapus dari device sendiri)
drop policy if exists "push_subscriptions_kelola_sendiri" on public.push_subscriptions;
create policy "push_subscriptions_kelola_sendiri"
on public.push_subscriptions for all
using ( murid_id = auth.uid() )
with check ( murid_id = auth.uid() );

-- Guru tidak perlu akses tabel ini. Edge Function pengirim notifikasi
-- memakai SERVICE ROLE KEY (bukan anon key), yang otomatis melewati RLS,
-- jadi tidak perlu policy tambahan untuk itu.

-- =====================================================================
-- BAGIAN 2: PENJADWALAN OTOMATIS (pg_cron + pg_net)
-- Ini yang memicu Edge Function "cek-renungan-belum-diisi" setiap hari
-- pada jam tertentu, TANPA perlu server tambahan di luar Supabase.
--
-- WAJIB DIISI MANUAL sebelum dijalankan:
--   1. GANTI <PROJECT_REF>       -> ref project Supabase kamu
--                                    (lihat di URL dashboard: https://supabase.com/dashboard/project/<PROJECT_REF>)
--   2. GANTI <SERVICE_ROLE_KEY>  -> Service Role Key project kamu
--                                    (Project Settings > API > service_role secret)
--   3. Atur jam kirim di baris "select cron.schedule" (format cron, waktu dalam UTC).
--      Contoh: '0 12 * * 1-6' = jam 12:00 UTC = jam 19:00 WIB, Senin-Sabtu.
-- =====================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
    'pengingat-renungan-harian',   -- nama job, dipakai kalau mau hapus/ubah nanti
    '0 2 * * 1-6',                 -- jam 12:00 UTC (≈19:00 WIB) tiap Senin-Sabtu, SESUAIKAN sendiri
    $$
    select net.http_post(
        url := 'https://<SERVICE_ROLE_KEY>.supabase.co/functions/v1/cek-renungan-belum-diisi',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer <SERVICE_API>'
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Kalau suatu saat mau MATIKAN jadwal ini, jalankan:
-- select cron.unschedule('pengingat-renungan-harian');

-- Kalau mau ganti jamnya, cukup unschedule dulu lalu jalankan ulang
-- select cron.schedule(...) dengan jam yang baru.