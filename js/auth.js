// =====================================================================
// PELITAKU - LOGIKA LOGIN & REDIRECT BERDASARKAN ROLE
// =====================================================================

const formLogin = document.getElementById("formLogin");
const pesanStatusLogin = document.getElementById("pesanStatusLogin");
const tombolMasuk = document.getElementById("tombolMasuk");

// Jika pengguna sudah punya sesi aktif, langsung arahkan ke dashboard yang sesuai
(async function cekSesiAwal() {
    const { data } = await klienSupabase.auth.getSession();
    if (data.session) {
        await arahkanSesuaiRole(data.session.user.id);
    } else {
        // Berhasil "mendarat" di halaman login dengan benar (memang belum login) ->
        // hapus penghitung anti-loop, supaya proteksinya tetap normal untuk sesi berikutnya.
        sessionStorage.removeItem("pelitaku_percobaan_redirect");
    }
})();

formLogin.addEventListener("submit", async (peristiwa) => {
    peristiwa.preventDefault();

    const email = document.getElementById("inputEmail").value.trim();
    const password = document.getElementById("inputPassword").value;

    pesanStatusLogin.innerHTML = "";
    tombolMasuk.disabled = true;
    tombolMasuk.textContent = "Memeriksa akun...";

    const { data, error } = await klienSupabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        pesanStatusLogin.innerHTML = `<p class="pesan-error mb-0">Email atau kata sandi salah. Silakan coba lagi.</p>`;
        tombolMasuk.disabled = false;
        tombolMasuk.textContent = "Masuk";
        return;
    }

    await arahkanSesuaiRole(data.user.id);
});

/**
 * Membaca role dari tabel profil, lalu mengarahkan ke dashboard yang tepat.
 */
async function arahkanSesuaiRole(idPengguna) {
    const { data: profil, error } = await klienSupabase
        .from("profil")
        .select("role")
        .eq("id", idPengguna)
        .single();

    if (error || !profil) {
        pesanStatusLogin.innerHTML = `<p class="pesan-error mb-0">Data profil belum tersedia. Hubungi guru pembina.</p>`;
        await klienSupabase.auth.signOut();
        tombolMasuk.disabled = false;
        tombolMasuk.textContent = "Masuk";
        return;
    }

    // Bersihkan huruf besar/kecil & spasi supaya "Murid"/" murid " tetap terbaca benar.
    const roleBersih = (profil.role || "").trim().toLowerCase();

    // Pengaman anti-infinite-loop: kalau tab ini sudah 2x bolak-balik redirect
    // tanpa pernah berhasil "mendarat" (misal karena sesi belum sempat terbaca),
    // hentikan paksa dan tampilkan pesan jelas -- bukan reload berulang tanpa henti.
    const kunciPenghitung = "pelitaku_percobaan_redirect";
    const sudahCoba = parseInt(sessionStorage.getItem(kunciPenghitung) || "0", 10);

    if (sudahCoba >= 2) {
        sessionStorage.removeItem(kunciPenghitung);
        pesanStatusLogin.innerHTML = `<p class="pesan-error mb-0">Terjadi masalah saat memuat sesi login. Silakan coba login ulang.</p>`;
        await klienSupabase.auth.signOut();
        tombolMasuk.disabled = false;
        tombolMasuk.textContent = "Masuk";
        return;
    }

    if (roleBersih === "guru") {
        sessionStorage.setItem(kunciPenghitung, String(sudahCoba + 1));
        window.location.href = "dashboard-guru.html";
    } else if (roleBersih === "murid") {
        sessionStorage.setItem(kunciPenghitung, String(sudahCoba + 1));
        window.location.href = "dashboard-murid.html";
    } else {
        // Role tidak dikenali sama sekali (kosong/typo) -- JANGAN asumsikan "murid" begitu saja,
        // supaya tidak mengarahkan ke dashboard yang salah dan berpotensi memicu redirect loop di sana.
        pesanStatusLogin.innerHTML = `<p class="pesan-error mb-0">Peran akun kamu ("${profil.role || "kosong"}") tidak dikenali. Hubungi guru pembina.</p>`;
        await klienSupabase.auth.signOut();
        tombolMasuk.disabled = false;
        tombolMasuk.textContent = "Masuk";
    }
}