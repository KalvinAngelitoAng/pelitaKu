// =====================================================================
// LOGIKA LOGIN & REDIRECT BERDASARKAN ROLE
// =====================================================================

const formLogin = document.getElementById("formLogin");
const pesanStatusLogin = document.getElementById("pesanStatusLogin");
const tombolMasuk = document.getElementById("tombolMasuk");

// Jika pengguna sudah punya sesi aktif langsung arahkan ke dashboard yang sesuai
(async function cekSesiAwal() {
    const { data } = await klienSupabase.auth.getSession();
    if (data.session) {
        await arahkanSesuaiRole(data.session.user.id);
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


// Membaca role dari tabel profil lalu mengarahkan ke dashboard yang tepat.

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

    if (profil.role === "guru") {
        window.location.href = "dashboard-guru.html";
    } else {
        window.location.href = "dashboard-murid.html";
    }
}
