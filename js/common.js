// =====================================================================
// PELITAKU - FUNGSI BERSAMA
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

// =====================================================================
// TOAST NOTIFICATION
// =====================================================================

/**
 * Menampilkan notifikasi popup di pojok kanan bawah layar.
 * Dipakai untuk semua pesan sukses/error yang sifatnya sementara
 * (bukan status permanen seperti "sudah dikumpulkan" yang harus tetap terlihat).
 * @param {string} pesan - Teks yang ditampilkan.
 * @param {"sukses"|"error"} tipe - Menentukan warna toast.
 */
function tampilkanToast(pesan, tipe = "sukses") {
    let wadah = document.getElementById("wadahToastPelitaku");

    if (!wadah) {
        wadah = document.createElement("div");
        wadah.id = "wadahToastPelitaku";
        wadah.className = "toast-container position-fixed bottom-0 end-0 p-3";
        wadah.style.zIndex = "1080";
        document.body.appendChild(wadah);
    }

    const idToast = "toast-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    const kelasWarna = tipe === "error" ? "toast-pelitaku-error" : "toast-pelitaku-sukses";

    const elemenToast = document.createElement("div");
    elemenToast.id = idToast;
    elemenToast.className = `toast toast-pelitaku ${kelasWarna}`;
    elemenToast.setAttribute("role", "alert");
    elemenToast.setAttribute("aria-live", "assertive");
    elemenToast.setAttribute("aria-atomic", "true");
    elemenToast.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="toast-body">${pesan}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Tutup"></button>
        </div>
    `;
    wadah.appendChild(elemenToast);

    const instansiToast = new bootstrap.Toast(elemenToast, { delay: 4500 });
    instansiToast.show();

    elemenToast.addEventListener("hidden.bs.toast", () => elemenToast.remove());
}

// =====================================================================
// LOADING SKELETON
// =====================================================================

/**
 * Menghasilkan HTML kotak shimmer sebagai pengganti teks "Memuat..." polos.
 * @param {number} jumlahBaris - Berapa baris skeleton yang mau ditampilkan.
 */
function skeletonHtml(jumlahBaris = 3) {
    let html = "";
    for (let i = 0; i < jumlahBaris; i++) {
        html += `<div class="skeleton skeleton-baris"></div>`;
    }
    return html;
}

/**
 * Skeleton khusus bentuk baris tabel (dipakai di tabelDaftarMurid / tabelDaftarKuis).
 * @param {number} jumlahKolom - Jumlah kolom pada tabel.
 * @param {number} jumlahBaris - Jumlah baris skeleton yang ditampilkan.
 */
function skeletonTabelHtml(jumlahKolom, jumlahBaris = 3) {
    let html = "";
    for (let b = 0; b < jumlahBaris; b++) {
        html += "<tr>";
        for (let k = 0; k < jumlahKolom; k++) {
            html += `<td><div class="skeleton skeleton-baris"></div></td>`;
        }
        html += "</tr>";
    }
    return html;
}

// =====================================================================
// PENANGANAN ERROR JARINGAN
// =====================================================================

/**
 * Mengubah pesan error teknis dari Supabase/browser jadi pesan ramah anak.
 * Khusus mendeteksi kegagalan karena masalah jaringan/koneksi.
 */
function pesanRamahDariError(error) {
    if (!error) return "Terjadi kesalahan. Coba lagi.";
    const pesanAsli = (error.message || "").toLowerCase();

    if (pesanAsli.includes("fetch") || pesanAsli.includes("network") || pesanAsli.includes("connection") || !navigator.onLine) {
        return "Koneksi ke server terputus. Periksa internet kamu lalu coba lagi.";
    }

    return error.message || "Terjadi kesalahan. Coba lagi.";
}

// Beri tahu pengguna kalau koneksi internet mereka putus/tersambung lagi,
// supaya tidak bingung kenapa tombol tiba-tiba tidak merespons.
window.addEventListener("offline", () => {
    tampilkanToast("Koneksi internet terputus. Beberapa fitur mungkin tidak berfungsi sampai internet kembali.", "error");
});

window.addEventListener("online", () => {
    tampilkanToast("Koneksi internet tersambung kembali.", "sukses");
});

// =====================================================================
// FUNGSI HASIL REFACTOR FASE 2
// (sebelumnya duplikat/mirip di murid.js dan guru.js)
// =====================================================================

/**
 * Membersihkan teks dari karakter HTML berbahaya sebelum dimasukkan ke innerHTML,
 * supaya isian murid/guru (misal nama, renungan, jawaban kuis) tidak bisa
 * menyisipkan tag HTML/script (XSS). Dipakai di murid.js dan guru.js.
 */
function escapeHtml(teks) {
    const elemen = document.createElement("div");
    elemen.textContent = teks;
    return elemen.innerHTML;
}

/**
 * Mengambil jadwal minggu yang sedang aktif (status_aktif = true).
 * Dipakai baik oleh murid.js (lewat view "jadwal_publik", tanpa PIN)
 * maupun guru.js (lewat tabel asli "jadwal_mingguan", termasuk PIN).
 * @param {string} namaSumber - "jadwal_publik" untuk murid, "jadwal_mingguan" untuk guru.
 */
async function ambilJadwalMingguAktif(namaSumber) {
    return await klienSupabase
        .from(namaSumber)
        .select("*")
        .eq("status_aktif", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
}

/**
 * Menangani pola respons standar dari pemanggilan RPC Supabase:
 * - Kalau ada error koneksi/server -> tampilkan toast error ramah, kembalikan false.
 * - Kalau RPC berhasil dipanggil tapi hasilnya { sukses: false, pesan: ... } -> tampilkan toast error, kembalikan false.
 * - Kalau berhasil -> tampilkan toast sukses, kembalikan true.
 * Dipakai di semua pemanggilan RPC (catat_kehadiran, submit_renungan, submit_kuis, klaim_reward).
 * @param {object} data - Hasil `data` dari `klienSupabase.rpc(...)`.
 * @param {object} error - Hasil `error` dari `klienSupabase.rpc(...)`.
 * @param {string} pesanFallbackGagal - Pesan default kalau `data.pesan` tidak ada.
 * @param {string} [pesanSuksesKustom] - Kalau diisi, dipakai sebagai teks toast sukses
 *   menggantikan `data.pesan` bawaan (misal untuk menyisipkan skor kuis).
 * @returns {boolean} true kalau operasi berhasil (sukses === true).
 */
function prosesResponRpc(data, error, pesanFallbackGagal, pesanSuksesKustom) {
    if (error) {
        tampilkanToast(pesanRamahDariError(error), "error");
        return false;
    }

    if (!data || !data.sukses) {
        tampilkanToast((data && data.pesan) || pesanFallbackGagal || "Terjadi kesalahan.", "error");
        return false;
    }

    tampilkanToast(pesanSuksesKustom || data.pesan, "sukses");
    return true;
}