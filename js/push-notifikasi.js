// =====================================================================
// PELITAKU - PUSH NOTIFICATION (SISI MURID)
// Menangani: minta izin notifikasi browser, daftarkan service worker,
// simpan "alamat langganan" (push subscription) ke Supabase.
//
// GANTI nilai VAPID_PUBLIC_KEY di bawah dengan public key hasil
// `npx web-push generate-vapid-keys` milikmu sendiri sebelum dipakai.
// Public key ini AMAN untuk ditaruh di kode frontend (bukan rahasia),
// yang harus dirahasiakan adalah PRIVATE key-nya (jangan taruh di sini).
// =====================================================================

const VAPID_PUBLIC_KEY = "BERscVDwzJy5xmORr-_wqor_HUF3wpqdlq3Ae2Ba4Sr1VALjuZ45r7mSIcPGTYzKT0LZ0sassMyxWkatLXvLFWs";

/**
 * Utilitas wajib: Web Push API minta application server key dalam bentuk
 * Uint8Array, sedangkan VAPID key yang kita punya berbentuk base64url string.
 * Fungsi ini mengonversinya.
 */
function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Cek dukungan browser. Beberapa browser (misal Safari versi lama, atau
 * mode private tertentu) tidak mendukung Push API.
 */
function browserMendukungPush() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Alur utama: didaftarkan dari tombol "Aktifkan Notifikasi" di dashboard murid.
 * 1. Daftarkan service worker (kalau belum).
 * 2. Minta izin notifikasi ke user.
 * 3. Buat push subscription lewat browser.
 * 4. Simpan subscription itu ke tabel push_subscriptions di Supabase.
 */
async function aktifkanNotifikasiRenungan() {
    const tombol = document.getElementById("tombolAktifkanNotifikasi");
    const pesanEl = document.getElementById("pesanStatusNotifikasi");

    if (!browserMendukungPush()) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Browser ini tidak mendukung push notification. Coba pakai Chrome atau Edge terbaru.</p>`;
        return;
    }

    if (tombol) {
        tombol.disabled = true;
        tombol.textContent = "Memproses...";
    }

    try {
        const registrasi = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        const izin = await Notification.requestPermission();
        if (izin !== "granted") {
            pesanEl.innerHTML = `<p class="pesan-error mb-0">Izin notifikasi ditolak. Kamu bisa mengaktifkannya lagi lewat pengaturan browser.</p>`;
            if (tombol) { tombol.disabled = false; tombol.textContent = "Aktifkan Notifikasi"; }
            return;
        }

        let subscription = await registrasi.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registrasi.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }

        const subJson = subscription.toJSON();

        const { error } = await klienSupabase
            .from("push_subscriptions")
            .upsert({
                murid_id: profilMurid.id,
                endpoint: subJson.endpoint,
                p256dh: subJson.keys.p256dh,
                auth: subJson.keys.auth
            }, { onConflict: "murid_id,endpoint" });

        if (error) {
            pesanEl.innerHTML = `<p class="pesan-error mb-0">Gagal menyimpan langganan notifikasi: ${error.message}</p>`;
            if (tombol) { tombol.disabled = false; tombol.textContent = "Aktifkan Notifikasi"; }
            return;
        }

        pesanEl.innerHTML = `<p class="pesan-sukses mb-0">Notifikasi pengingat renungan berhasil diaktifkan di device ini.</p>`;
        if (tombol) { tombol.textContent = "Notifikasi Aktif ✓"; }
    } catch (kesalahan) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Terjadi kesalahan: ${kesalahan.message}</p>`;
        if (tombol) { tombol.disabled = false; tombol.textContent = "Aktifkan Notifikasi"; }
    }
}

/**
 * Dipanggil saat dashboard dimuat, untuk menyesuaikan teks tombol
 * jika murid sebelumnya SUDAH mengaktifkan notifikasi di device ini.
 */
async function perbaruiStatusTombolNotifikasi() {
    const tombol = document.getElementById("tombolAktifkanNotifikasi");
    if (!tombol || !browserMendukungPush()) return;

    if (Notification.permission === "granted") {
        try {
            const registrasi = await navigator.serviceWorker.getRegistration("/sw.js");
            const subscription = registrasi && await registrasi.pushManager.getSubscription();
            if (subscription) {
                tombol.textContent = "Notifikasi Aktif ✓";
            }
        } catch (e) {
            // biarkan tombol default kalau gagal cek, tidak fatal
        }
    } else if (Notification.permission === "denied") {
        tombol.textContent = "Notifikasi Diblokir Browser";
        tombol.disabled = true;
    }
}