// =====================================================================
// PELITAKU - SERVICE WORKER
// File ini WAJIB berada di root folder website (sejajar dengan index.html),
// BUKAN di dalam folder js/. Ini batasan browser: scope service worker
// dibatasi sejauh mana file ini diletakkan.
// =====================================================================

// Muncul saat server (Edge Function) mengirim push notification
self.addEventListener("push", (peristiwa) => {
    let data = { judul: "Pelitaku", isi: "Kamu punya pengingat baru.", url: "/dashboard-murid.html" };

    try {
        if (peristiwa.data) {
            data = peristiwa.data.json();
        }
    } catch (e) {
        // kalau payload bukan JSON valid, pakai data default di atas
    }

    const opsiNotifikasi = {
        body: data.isi,
        icon: "icon-192.png",       // opsional: taruh file ikon 192x192 di root, kalau tidak ada browser pakai ikon default
        badge: "icon-192.png",
        data: { url: data.url || "/dashboard-murid.html" },
        tag: "pengingat-renungan",  // biar notifikasi lama ke-replace, tidak numpuk
        renotify: true
    };

    peristiwa.waitUntil(
        self.registration.showNotification(data.judul, opsiNotifikasi)
    );
});

// Saat notifikasi diklik, arahkan/fokuskan ke tab dashboard murid
self.addEventListener("notificationclick", (peristiwa) => {
    peristiwa.notification.close();
    const urlTujuan = (peristiwa.notification.data && peristiwa.notification.data.url) || "/dashboard-murid.html";

    peristiwa.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((daftarClient) => {
            for (const client of daftarClient) {
                if (client.url.includes("dashboard-murid.html") && "focus" in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlTujuan);
            }
        })
    );
});