// =====================================================================
// FUNGSI BERSAMA
// Dipakai di dashboard-murid.html dan dashboard-guru.html
// =====================================================================

// SVG siluet sederhana untuk foto profil (hardcode, tidak bisa diganti user)
const SVG_FOTO_PROFIL = `
<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2.5c-3.3 0-10 1.7-10 5V22h20v-2.5c0-3.3-6.7-5-10-5z"/>
</svg>`;

/**
 * Memastikan pengguna sudah login. Jika belum, arahkan ke halaman login.
 * Mengembalikan objek profil (dari tabel profil) jika berhasil.
 * @param {string} peranWajib - 'murid' atau 'guru', untuk proteksi akses halaman.
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
        // Jika role tidak sesuai halaman, arahkan ke dashboard yang benar
        window.location.href = profil.role === "guru" ? "dashboard-guru.html" : "dashboard-murid.html";
        return null;
    }

    return profil;
}

/**
 * Menangani proses logout dari tombol "Keluar" di navbar.
 */
async function tanganiLogout() {
    await klienSupabase.auth.signOut();
    window.location.href = "index.html";
}

/**
 * Format tanggal ke format Indonesia yang mudah dibaca.
 */
function formatTanggalIndonesia(tanggalString) {
    if (!tanggalString) return "-";
    const opsi = { day: "numeric", month: "long", year: "numeric" };
    return new Date(tanggalString).toLocaleDateString("id-ID", opsi);
}

// Nama hari untuk renungan (indeks 1 = Senin ... 6 = Sabtu, sesuai kolom "hari" di ayat_harian)
const NAMA_HARI_RENUNGAN = {
    1: "Senin",
    2: "Selasa",
    3: "Rabu",
    4: "Kamis",
    5: "Jumat",
    6: "Sabtu"
};

/**
 * Mengubah hasil JS Date.getDay() (0=Minggu...6=Sabtu) menjadi kode hari
 * renungan PelitaKu (1=Senin...6=Sabtu). Mengembalikan null untuk hari Minggu,
 * karena hari Minggu dipakai untuk absensi, bukan renungan.
 */
function ambilKodeHariRenunganHariIni() {
    const hariJs = new Date().getDay(); // 0=Minggu, 1=Senin, ..., 6=Sabtu
    if (hariJs === 0) return null;
    return hariJs; // kebetulan 1=Senin...6=Sabtu sama persis dengan kode hari kita
}

/**
 * Menentukan status kuis berdasarkan waktu_mulai & waktu_selesai.
 * Mengembalikan salah satu: 'akan_datang', 'aktif', 'berakhir'.
 */
function tentukanStatusKuis(waktuMulai, waktuSelesai) {
    const sekarang = new Date();
    const mulai = new Date(waktuMulai);
    const selesai = new Date(waktuSelesai);

    if (sekarang < mulai) return "akan_datang";
    if (sekarang > selesai) return "berakhir";
    return "aktif";
}