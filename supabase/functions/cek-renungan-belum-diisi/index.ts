// =====================================================================
// PELITAKU - EDGE FUNCTION: cek-renungan-belum-diisi
// Dipanggil otomatis tiap hari oleh pg_cron (lihat database/migration_v3_push_notifikasi.sql).
// Tugas:
//   1. Cari ayat renungan untuk HARI INI (berdasarkan jadwal aktif).
//   2. Cari murid yang BELUM mengisi renungan untuk ayat hari ini.
//   3. Kirim push notification pengingat ke device murid tsb.
//
// Environment variables yang WAJIB diset (lewat `supabase secrets set`):
//   SUPABASE_URL               -> otomatis tersedia di semua Edge Function
//   SUPABASE_SERVICE_ROLE_KEY  -> otomatis tersedia di semua Edge Function
//   VAPID_PUBLIC_KEY           -> hasil `npx web-push generate-vapid-keys`
//   VAPID_PRIVATE_KEY          -> hasil `npx web-push generate-vapid-keys` (RAHASIA!)
//   VAPID_SUBJECT              -> contoh: "mailto:gurupembina@contoh.com"
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Nama hari sesuai kode 1-6 yang dipakai tabel ayat_harian (1=Senin ... 6=Sabtu)
const KODE_HARI: Record<string, number> = {
    "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6, "Sun": 0
};

/**
 * Ambil kode hari (1-6, atau 0 untuk Minggu) berdasarkan waktu LOKAL
 * Indonesia (Asia/Jakarta), bukan waktu UTC server.
 */
function ambilKodeHariIniWIB(): number {
    const namaHariPendek = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        weekday: "short"
    }).format(new Date());
    return KODE_HARI[namaHariPendek] ?? 0;
}

Deno.serve(async (_request: Request) => {
    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
        const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
        const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;

        const supabase = createClient(supabaseUrl, serviceRoleKey);

        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

        const kodeHariIni = ambilKodeHariIniWIB();
        if (kodeHariIni === 0) {
            return jsonResponse({ pesan: "Hari Minggu, tidak ada renungan harian. Tidak ada notifikasi dikirim." });
        }

        // 1. Cari jadwal minggu yang sedang aktif
        const { data: jadwalAktif, error: errorJadwal } = await supabase
            .from("jadwal_mingguan")
            .select("id")
            .eq("status_aktif", true)
            .limit(1)
            .maybeSingle();

        if (errorJadwal || !jadwalAktif) {
            return jsonResponse({ pesan: "Tidak ada jadwal minggu yang aktif. Tidak ada notifikasi dikirim." });
        }

        // 2. Cari ayat renungan untuk hari ini di jadwal aktif tsb
        const { data: ayatHariIni, error: errorAyat } = await supabase
            .from("ayat_harian")
            .select("id")
            .eq("jadwal_id", jadwalAktif.id)
            .eq("hari", kodeHariIni)
            .maybeSingle();

        if (errorAyat || !ayatHariIni) {
            return jsonResponse({ pesan: "Guru belum mengisi ayat renungan untuk hari ini. Tidak ada notifikasi dikirim." });
        }

        // 3. Ambil semua murid
        const { data: semuaMurid, error: errorMurid } = await supabase
            .from("profil")
            .select("id")
            .eq("role", "murid");

        if (errorMurid || !semuaMurid || semuaMurid.length === 0) {
            return jsonResponse({ pesan: "Tidak ada data murid." });
        }

        // 4. Ambil murid yang SUDAH mengisi renungan untuk ayat hari ini
        const { data: sudahIsi } = await supabase
            .from("renungan")
            .select("murid_id")
            .eq("ayat_harian_id", ayatHariIni.id);

        const idSudahIsi = new Set((sudahIsi || []).map((baris: { murid_id: string }) => baris.murid_id));
        const muridBelumIsi = semuaMurid.filter((murid: { id: string }) => !idSudahIsi.has(murid.id));

        if (muridBelumIsi.length === 0) {
            return jsonResponse({ pesan: "Semua murid sudah mengisi renungan hari ini. Tidak ada notifikasi dikirim." });
        }

        // 5. Ambil push subscription murid-murid yang belum isi
        const idMuridBelumIsi = muridBelumIsi.map((murid: { id: string }) => murid.id);
        const { data: daftarSubscription, error: errorSub } = await supabase
            .from("push_subscriptions")
            .select("*")
            .in("murid_id", idMuridBelumIsi);

        if (errorSub || !daftarSubscription || daftarSubscription.length === 0) {
            return jsonResponse({
                pesan: `${muridBelumIsi.length} murid belum isi renungan, tapi tidak ada satupun yang mengaktifkan notifikasi.`
            });
        }

        // 6. Kirim push notification ke tiap subscription
        let terkirim = 0;
        let gagal = 0;
        const subscriptionKedaluwarsa: string[] = [];

        const payload = JSON.stringify({
            judul: "Yuk isi renungan hari ini 📖",
            isi: "Renungan Alkitab kamu hari ini belum diisi. Jangan putus streak-nya ya!",
            url: "/dashboard-murid.html"
        });

        for (const sub of daftarSubscription) {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth }
                    },
                    payload
                );
                terkirim += 1;
            } catch (kesalahan) {
                gagal += 1;
                // 404/410 = subscription sudah tidak valid (browser di-uninstall/izin dicabut), bersihkan dari DB
                const statusCode = (kesalahan as { statusCode?: number })?.statusCode;
                if (statusCode === 404 || statusCode === 410) {
                    subscriptionKedaluwarsa.push(sub.id);
                }
            }
        }

        if (subscriptionKedaluwarsa.length > 0) {
            await supabase.from("push_subscriptions").delete().in("id", subscriptionKedaluwarsa);
        }

        return jsonResponse({
            pesan: `Selesai. ${muridBelumIsi.length} murid belum isi renungan.`,
            notifikasi_terkirim: terkirim,
            notifikasi_gagal: gagal,
            subscription_kedaluwarsa_dihapus: subscriptionKedaluwarsa.length
        });
    } catch (kesalahan) {
        return jsonResponse({ error: String(kesalahan) }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}