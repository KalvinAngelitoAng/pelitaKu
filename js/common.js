// =====================================================================
// FUNGSI UTAMA
// Dipake di dashboard-murid.html dan dashboard-guru.html
// =====================================================================

// SVG siluet sederhana untuk foto profil (hardcode, tidak bisa diganti user)
const SVG_FOTO_PROFIL = `
<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2.5c-3.3 0-10 1.7-10 5V22h20v-2.5c0-3.3-6.7-5-10-5z"/>
</svg>`;

/**
 * Memastikan pengguna sudah login. Jika belum, arahkan ke halaman login.
 * Mengembalikan objek profil (dari tabel profil) jika berhasil.
  @param {string} peranWajib
 */
async function pastikanSudahLogin(peranWajib) {
    const { data: sesiData } = await klienSupabase.auth.getSession();

    if (!sesiData.session) {
        window.location.href = "index.html";
        return null;
    }

    const idPengguna = sesiData.session.user.id;

    const { data: profil, error } = await klienSupabase
        .from("profil")
        .select("*")
        .eq("id", idPengguna)
        .single();

    if (error || !profil) {
        alert("Data profil tidak ditemukan. Silakan hubungi guru pembina.");
        await klienSupabase.auth.signOut();
        window.location.href = "index.html";
        return null;
    }

    if (profil.role !== peranWajib) {
        // Jika role tidak sesuai halaman arahkan ke dashboard yang benar
        window.location.href = profil.role === "guru" ? "dashboard-guru.html" : "dashboard-murid.html";
        return null;
    }

    return profil;
}

// Menangani Logout
async function tanganiLogout() {
    await klienSupabase.auth.signOut();
    window.location.href = "index.html";
}


 // Format tanggal

function formatTanggalIndonesia(tanggalString) {
    if (!tanggalString) return "-";
    const opsi = { day: "numeric", month: "long", year: "numeric" };
    return new Date(tanggalString).toLocaleDateString("id-ID", opsi);
}
