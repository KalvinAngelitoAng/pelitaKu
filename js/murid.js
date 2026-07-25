// =====================================================================
// PELITAKU - LOGIKA DASHBOARD MURID
// =====================================================================

const KELIPATAN_POIN_REWARD = 20; // 1 level Susu Gratis = 20 poin (setara 2 minggu: 6 renungan + 4 kuis per minggu)

let profilMurid = null;
let jadwalAktif = null;
let statusAbsenSaatIni = null; // 'hadir' | 'izin' | null
let kuisAktif = null;
let daftarSoalKuis = [];
let daftarAyatHarianMinggu = []; // 6 ayat (Senin-Sabtu) untuk jadwal aktif
let ayatHarianAktif = null; // ayat untuk hari ini (null jika hari Minggu / belum diisi guru)

// =====================================================================
// INISIALISASI HALAMAN
// =====================================================================
(async function inisialisasiDashboardMurid() {
    profilMurid = await pastikanSudahLogin("murid");
    if (!profilMurid) return;

    document.getElementById("fotoProfilPlaceholder").innerHTML = SVG_FOTO_PROFIL;
    document.getElementById("teksNamaMurid").textContent = profilMurid.nama_lengkap;
    document.getElementById("teksKelasMurid").textContent = profilMurid.kelas || "-";
    document.getElementById("teksTanggalLahirMurid").textContent = formatTanggalIndonesia(profilMurid.tanggal_lahir);

    perbaruiTampilanPoin();

    await muatJadwalAktif();
    await muatStatusAbsensi();
    await muatAyatDanRenunganHarian();
    await muatKuis();

    pasangEventListener();
})();

function pasangEventListener() {
    document.getElementById("tombolAbsenHadir").addEventListener("click", tanganiAbsenHadir);
    document.getElementById("tombolBukaFormIzin").addEventListener("click", () => {
        document.getElementById("wadahFormIzin").style.display = "block";
    });
    document.getElementById("tombolKirimIzin").addEventListener("click", tanganiKirimIzin);

    // Catatan: listener untuk textarea & tombol renungan dipasang secara dinamis
    // di dalam muatAyatDanRenunganHarian(), karena form-nya berubah tiap hari.

    document.getElementById("tombolKlaimSusu").addEventListener("click", tanganiKlaimSusu);
}

// =====================================================================
// BAGIAN POIN & REWARD (BOTOL SUSU)
// =====================================================================
function perbaruiTampilanPoin() {
    const poinSaatIni = profilMurid.total_poin;
    document.getElementById("teksInfoPoin").textContent = `Poin kamu: ${poinSaatIni}`;

    muatReward(poinSaatIni);
}

async function muatReward(poinSaatIni) {
    const { data: klaimData } = await klienSupabase
        .from("reward_claims")
        .select("target_poin")
        .eq("murid_id", profilMurid.id);

    const jumlahSudahDiklaim = (klaimData || []).length;

    // Target berikutnya selalu kelipatan 20 berikutnya yang belum diklaim.
    // Contoh: belum pernah klaim -> target 20. Sudah klaim 1x -> target 40. Dst, tanpa batas atas.
    const targetBerikutnya = (jumlahSudahDiklaim + 1) * KELIPATAN_POIN_REWARD;

    const barProgres = document.getElementById("barProgresPoin");
    const teksTarget = document.getElementById("teksTargetPoin");
    const isiSusu = document.getElementById("isiSusu");
    const tombolKlaim = document.getElementById("tombolKlaimSusu");

    const persentase = Math.min(100, Math.round((poinSaatIni / targetBerikutnya) * 100));
    barProgres.style.width = `${persentase}%`;
    teksTarget.textContent = `${poinSaatIni} / ${targetBerikutnya} poin menuju Susu Gratis level ${jumlahSudahDiklaim + 1}`;

    const tinggiIsi = (persentase / 100) * 74;
    isiSusu.setAttribute("y", 100 - tinggiIsi);
    isiSusu.setAttribute("height", tinggiIsi);

    if (poinSaatIni >= targetBerikutnya) {
        tombolKlaim.className = "btn btn-pelitaku-kuning";
        tombolKlaim.disabled = false;
        tombolKlaim.textContent = "Claim Susu";
        tombolKlaim.dataset.target = targetBerikutnya;
    } else {
        tombolKlaim.className = "btn btn-pelitaku-nonaktif";
        tombolKlaim.disabled = true;
        tombolKlaim.textContent = "Claim Susu";
    }
}

async function tanganiKlaimSusu() {
    const tombol = document.getElementById("tombolKlaimSusu");
    const target = parseInt(tombol.dataset.target, 10);
    const pesanEl = document.getElementById("pesanKlaimSusu");

    tombol.disabled = true;
    tombol.textContent = "Memproses...";

    const { data, error } = await klienSupabase.rpc("klaim_reward", { p_target_poin: target });

    if (error || !data.sukses) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">${(data && data.pesan) || "Gagal klaim reward."}</p>`;
        tombol.disabled = false;
        tombol.textContent = "Claim Susu";
        return;
    }

    pesanEl.innerHTML = `<p class="pesan-sukses mb-0">${data.pesan}</p>`;
    await muatReward(profilMurid.total_poin);
}

// =====================================================================
// BAGIAN JADWAL MINGGU AKTIF
// =====================================================================
async function muatJadwalAktif() {
    const { data, error } = await klienSupabase
        .from("jadwal_publik")
        .select("*")
        .eq("status_aktif", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) {
        document.getElementById("teksInfoMinggu").textContent = "Belum ada jadwal minggu ini. Hubungi guru pembina.";
        return;
    }

    jadwalAktif = data;
    document.getElementById("teksInfoMinggu").textContent = jadwalAktif.minggu_ke;
}

// =====================================================================
// BAGIAN ABSENSI
// =====================================================================
async function muatStatusAbsensi() {
    if (!jadwalAktif) {
        tampilkanKuncianKuis("Belum ada jadwal minggu ini.");
        return;
    }

    const { data } = await klienSupabase
        .from("kehadiran")
        .select("*")
        .eq("murid_id", profilMurid.id)
        .eq("jadwal_id", jadwalAktif.id)
        .maybeSingle();

    const badge = document.getElementById("badgeStatusAbsen");
    const wadahForm = document.getElementById("wadahFormAbsen");

    if (data) {
        statusAbsenSaatIni = data.status;
        if (data.status === "hadir") {
            badge.innerHTML = `<span class="status-hadir">Hadir</span>`;
        } else {
            badge.innerHTML = `<span class="status-izin">Izin</span>`;
        }
        wadahForm.innerHTML = `<p class="teks-lembut mb-0">Kamu sudah tercatat <b>${data.status === "hadir" ? "Hadir" : "Izin"}</b> untuk minggu ini.</p>`;
    } else {
        badge.innerHTML = `<span class="status-belum">Belum Absen</span>`;
    }
}

async function tanganiAbsenHadir() {
    const pin = document.getElementById("inputPinAbsen").value.trim();
    const pesanEl = document.getElementById("pesanStatusAbsen");

    if (!jadwalAktif) return;
    if (!pin) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Masukkan PIN terlebih dahulu.</p>`;
        return;
    }

    const { data, error } = await klienSupabase.rpc("catat_kehadiran", {
        p_jadwal_id: jadwalAktif.id,
        p_pin: pin
    });

    if (error || !data.sukses) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">${(data && data.pesan) || "Terjadi kesalahan."}</p>`;
        return;
    }

    pesanEl.innerHTML = `<p class="pesan-sukses mb-0">${data.pesan}</p>`;
    await muatStatusAbsensi();
    await muatKuis();
}

async function tanganiKirimIzin() {
    const alasan = document.getElementById("inputAlasanIzin").value.trim();
    const pesanEl = document.getElementById("pesanStatusAbsen");

    if (!jadwalAktif) return;
    if (!alasan) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Alasan izin wajib diisi.</p>`;
        return;
    }

    const { error } = await klienSupabase.from("kehadiran").insert({
        murid_id: profilMurid.id,
        jadwal_id: jadwalAktif.id,
        status: "izin",
        alasan_izin: alasan
    });

    if (error) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Gagal mengirim izin. Kamu mungkin sudah absen minggu ini.</p>`;
        return;
    }

    pesanEl.innerHTML = `<p class="pesan-sukses mb-0">Izin berhasil dicatat.</p>`;
    await muatStatusAbsensi();
    await muatKuis();
}

// =====================================================================
// BAGIAN RENUNGAN
// =====================================================================
function perbaruiJumlahKarakterRenungan() {
    const isi = document.getElementById("inputRenungan").value.trim();
    const teksJumlah = document.getElementById("teksJumlahKarakter");
    const tombolKirim = document.getElementById("tombolKirimRenungan");

    teksJumlah.textContent = `${isi.length} / 50 karakter minimal`;

    if (isi.length >= 50) {
        tombolKirim.disabled = false;
        teksJumlah.className = "pesan-sukses mb-2 mt-1";
    } else {
        tombolKirim.disabled = true;
        teksJumlah.className = "teks-lembut mb-2 mt-1";
        teksJumlah.style.fontSize = "0.85rem";
    }
}

/**
 * Memuat 6 ayat harian (Senin-Sabtu) minggu ini, menampilkan pelacak progres,
 * lalu menampilkan ayat & form renungan sesuai hari berjalan saat ini.
 */
async function muatAyatDanRenunganHarian() {
    const wadahAyat = document.getElementById("wadahAyatRenungan");
    const wadahForm = document.getElementById("wadahFormRenungan");
    const wadahPelacak = document.getElementById("wadahPelacakMingguan");

    if (!jadwalAktif) {
        wadahAyat.innerHTML = `<p class="teks-lembut mb-0">Belum ada jadwal minggu ini.</p>`;
        wadahForm.innerHTML = "";
        wadahPelacak.innerHTML = "";
        return;
    }

    const { data: ayatMinggu, error: errorAyat } = await klienSupabase
        .from("ayat_harian_publik")
        .select("*")
        .eq("jadwal_id", jadwalAktif.id)
        .order("hari", { ascending: true });

    daftarAyatHarianMinggu = ayatMinggu || [];

    const { data: renunganTerkirim } = await klienSupabase
        .from("renungan")
        .select("ayat_harian_id, isi_renungan")
        .eq("murid_id", profilMurid.id)
        .eq("jadwal_id", jadwalAktif.id);

    const petaRenunganTerkirim = {};
    (renunganTerkirim || []).forEach((baris) => {
        petaRenunganTerkirim[baris.ayat_harian_id] = baris.isi_renungan;
    });

    // Render chip pelacak progres Senin-Sabtu
    wadahPelacak.innerHTML = [1, 2, 3, 4, 5, 6].map((kodeHari) => {
        const ayatHari = daftarAyatHarianMinggu.find((a) => a.hari === kodeHari);
        const sudahSelesai = ayatHari && petaRenunganTerkirim[ayatHari.id];
        const kelas = sudahSelesai ? "status-hadir" : "status-belum";
        return `<span class="${kelas}" style="font-size: 0.75rem;">${NAMA_HARI_RENUNGAN[kodeHari]}</span>`;
    }).join(" ");

    if (errorAyat) {
        wadahAyat.innerHTML = `<p class="teks-lembut mb-0">Gagal memuat ayat renungan.</p>`;
        wadahForm.innerHTML = "";
        return;
    }

    const kodeHariIni = ambilKodeHariRenunganHariIni();

    if (kodeHariIni === null) {
        wadahAyat.innerHTML = `<p class="mb-0 fw-bold">Hari ini hari Minggu.</p><p class="mb-0 teks-lembut">Waktunya beribadah dan absen di Sekolah Minggu. Renungan harian dibuka lagi besok Senin.</p>`;
        wadahForm.innerHTML = "";
        return;
    }

    ayatHarianAktif = daftarAyatHarianMinggu.find((a) => a.hari === kodeHariIni);

    if (!ayatHarianAktif) {
        wadahAyat.innerHTML = `<p class="mb-0 teks-lembut">Ayat untuk hari ${NAMA_HARI_RENUNGAN[kodeHariIni]} belum diisi oleh guru pembina. Coba cek lagi nanti.</p>`;
        wadahForm.innerHTML = "";
        return;
    }

    wadahAyat.innerHTML = `
        <p class="teks-lembut mb-1" style="font-size: 0.8rem;">Renungan hari ${NAMA_HARI_RENUNGAN[kodeHariIni]}</p>
        <p class="fw-bold mb-1">${escapeHtml(ayatHarianAktif.ayat_referensi)}</p>
        <p class="mb-0 fst-italic">${escapeHtml(ayatHarianAktif.ayat_isi)}</p>
    `;

    const isiSudahDikirim = petaRenunganTerkirim[ayatHarianAktif.id];

    if (isiSudahDikirim) {
        wadahForm.innerHTML = `
            <p class="pesan-sukses mb-2">Renungan hari ${NAMA_HARI_RENUNGAN[kodeHariIni]} sudah dikumpulkan.</p>
            <div class="p-3" style="background-color: var(--warna-krem); border-radius: var(--radius-kecil);">
                <p class="mb-0" style="white-space: pre-wrap;">${escapeHtml(isiSudahDikirim)}</p>
            </div>
        `;
    } else {
        wadahForm.innerHTML = `
            <textarea id="inputRenungan" class="form-control form-control-pelitaku" rows="4"
                placeholder="Tuliskan renungan kamu tentang ayat di atas (minimal 50 karakter)..."></textarea>
            <p class="teks-lembut mb-2 mt-1" id="teksJumlahKarakter" style="font-size: 0.85rem;">0 / 50 karakter minimal</p>
            <button class="btn btn-pelitaku-primer" id="tombolKirimRenungan" disabled>Kirim Renungan</button>
            <div id="pesanStatusRenungan" class="mt-3"></div>
        `;
        document.getElementById("inputRenungan").addEventListener("input", perbaruiJumlahKarakterRenungan);
        document.getElementById("tombolKirimRenungan").addEventListener("click", tanganiKirimRenungan);
    }
}

async function tanganiKirimRenungan() {
    const isi = document.getElementById("inputRenungan").value.trim();
    const pesanEl = document.getElementById("pesanStatusRenungan");

    if (!ayatHarianAktif) return;
    if (isi.length < 50) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Renungan minimal 50 karakter.</p>`;
        return;
    }

    const tombol = document.getElementById("tombolKirimRenungan");
    tombol.disabled = true;
    tombol.textContent = "Mengirim...";

    const { data, error } = await klienSupabase.rpc("submit_renungan", {
        p_ayat_harian_id: ayatHarianAktif.id,
        p_isi_renungan: isi
    });

    if (error || !data.sukses) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">${(data && data.pesan) || "Gagal mengirim renungan."}</p>`;
        tombol.disabled = false;
        tombol.textContent = "Kirim Renungan";
        return;
    }

    profilMurid.total_poin += 1;
    perbaruiTampilanPoin();
    await muatAyatDanRenunganHarian();
}

// =====================================================================
// BAGIAN KUIS
// =====================================================================
function tampilkanKuncianKuis(alasan) {
    document.getElementById("wadahKuis").innerHTML = `
        <div class="terkunci">
            <p class="teks-lembut mb-0">Kuis terkunci. ${alasan}</p>
        </div>
    `;
}

async function muatKuis() {
    if (!statusAbsenSaatIni) {
        tampilkanKuncianKuis("Kamu harus absen Hadir atau Izin terlebih dahulu sebelum bisa mengerjakan kuis.");
        return;
    }

    // Ambil status kuis (judul & waktu) dari view publik, terlepas dari jendela waktu,
    // supaya murid tahu persis kenapa kuis belum/tidak bisa dikerjakan.
    const { data: daftarKuis, error } = await klienSupabase
        .from("kuis_status_publik")
        .select("*")
        .order("waktu_mulai", { ascending: false })
        .limit(1);

    if (error || !daftarKuis || daftarKuis.length === 0) {
        document.getElementById("wadahKuis").innerHTML = `<p class="teks-lembut mb-0">Belum ada kuis yang dijadwalkan untuk minggu ini.</p>`;
        return;
    }

    kuisAktif = daftarKuis[0];
    const status = tentukanStatusKuis(kuisAktif.waktu_mulai, kuisAktif.waktu_selesai);

    // Cek apakah sudah pernah submit (berlaku untuk status apa pun, termasuk sudah berakhir)
    const { data: hasilKuis } = await klienSupabase
        .from("jawaban_kuis")
        .select("*")
        .eq("murid_id", profilMurid.id)
        .eq("kuis_id", kuisAktif.id)
        .maybeSingle();

    if (hasilKuis) {
        document.getElementById("wadahKuis").innerHTML = `
            <p class="pesan-sukses mb-0">Kamu sudah mengumpulkan kuis "${escapeHtml(kuisAktif.judul)}". Skor: ${hasilKuis.skor}</p>
        `;
        hapusProgresLocalStorage();
        return;
    }

    if (status === "akan_datang") {
        document.getElementById("wadahKuis").innerHTML = `
            <p class="teks-lembut mb-0">Kuis "${escapeHtml(kuisAktif.judul)}" akan dibuka pada ${new Date(kuisAktif.waktu_mulai).toLocaleString("id-ID")}. Kembali lagi nanti ya.</p>
        `;
        return;
    }

    if (status === "berakhir") {
        document.getElementById("wadahKuis").innerHTML = `
            <p class="teks-lembut mb-0">Waktu pengerjaan kuis "${escapeHtml(kuisAktif.judul)}" sudah berakhir pada ${new Date(kuisAktif.waktu_selesai).toLocaleString("id-ID")}.</p>
        `;
        return;
    }

    // status === 'aktif'
    const { data: soal, error: errorSoal } = await klienSupabase
        .from("soal_kuis_publik")
        .select("*")
        .eq("kuis_id", kuisAktif.id)
        .order("urutan", { ascending: true });

    if (errorSoal || !soal || soal.length === 0) {
        document.getElementById("wadahKuis").innerHTML = `<p class="teks-lembut mb-0">Kuis "${escapeHtml(kuisAktif.judul)}" sedang aktif, tetapi soal belum tersedia. Hubungi guru pembina.</p>`;
        return;
    }

    daftarSoalKuis = soal;
    renderFormKuis();
}

function kunciLocalStorageKuis() {
    return `pelitaku_progres_kuis_${kuisAktif.id}_${profilMurid.id}`;
}

function ambilProgresLocalStorage() {
    try {
        const data = localStorage.getItem(kunciLocalStorageKuis());
        return data ? JSON.parse(data) : {};
    } catch (kesalahan) {
        return {};
    }
}

function simpanProgresLocalStorage(jawabanSaatIni) {
    localStorage.setItem(kunciLocalStorageKuis(), JSON.stringify(jawabanSaatIni));
}

function hapusProgresLocalStorage() {
    if (kuisAktif) {
        localStorage.removeItem(kunciLocalStorageKuis());
    }
}

function renderFormKuis() {
    const progresTersimpan = ambilProgresLocalStorage();

    let htmlSoal = `
        <p class="fw-bold mb-1">${escapeHtml(kuisAktif.judul)}</p>
        <p class="teks-lembut mb-3" style="font-size: 0.85rem;">Batas pengerjaan: ${new Date(kuisAktif.waktu_selesai).toLocaleString("id-ID")}</p>
        <form id="formKuis">
    `;

    daftarSoalKuis.forEach((butirSoal, indeks) => {
        const jawabanTersimpan = progresTersimpan[butirSoal.id] || "";
        htmlSoal += `
            <div class="mb-4">
                <p class="fw-bold mb-2">${indeks + 1}. ${escapeHtml(butirSoal.pertanyaan)}</p>
                ${["a", "b", "c", "d"].map((opsi) => `
                    <div class="form-check">
                        <input class="form-check-input input-jawaban-kuis" type="radio"
                            name="soal_${butirSoal.id}" value="${opsi}" data-soal-id="${butirSoal.id}"
                            id="soal_${butirSoal.id}_${opsi}" ${jawabanTersimpan === opsi ? "checked" : ""}>
                        <label class="form-check-label" for="soal_${butirSoal.id}_${opsi}">
                            ${opsi.toUpperCase()}. ${escapeHtml(butirSoal["opsi_" + opsi])}
                        </label>
                    </div>
                `).join("")}
            </div>
        `;
    });

    htmlSoal += `
            <button type="submit" class="btn btn-pelitaku-primer">Kumpulkan Kuis</button>
            <div id="pesanStatusKuis" class="mt-3"></div>
        </form>
    `;

    document.getElementById("wadahKuis").innerHTML = htmlSoal;

    // Simpan progres tiap kali murid memilih jawaban (agar tidak hilang jika koneksi putus)
    document.querySelectorAll(".input-jawaban-kuis").forEach((elemenInput) => {
        elemenInput.addEventListener("change", (peristiwa) => {
            const progres = ambilProgresLocalStorage();
            progres[peristiwa.target.dataset.soalId] = peristiwa.target.value;
            simpanProgresLocalStorage(progres);
        });
    });

    document.getElementById("formKuis").addEventListener("submit", tanganiSubmitKuis);
}

async function tanganiSubmitKuis(peristiwa) {
    peristiwa.preventDefault();

    const progres = ambilProgresLocalStorage();
    const pesanEl = document.getElementById("pesanStatusKuis");

    if (Object.keys(progres).length < daftarSoalKuis.length) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Jawab semua soal terlebih dahulu.</p>`;
        return;
    }

    const jawabanArray = Object.entries(progres).map(([soalId, jawaban]) => ({
        soal_id: soalId,
        jawaban: jawaban
    }));

    const tombolSubmit = document.querySelector("#formKuis button[type=submit]");
    tombolSubmit.disabled = true;
    tombolSubmit.textContent = "Mengirim...";

    const { data, error } = await klienSupabase.rpc("submit_kuis", {
        p_kuis_id: kuisAktif.id,
        p_jawaban: jawabanArray
    });

    if (error || !data.sukses) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">${(data && data.pesan) || "Gagal mengumpulkan kuis."}</p>`;
        tombolSubmit.disabled = false;
        tombolSubmit.textContent = "Kumpulkan Kuis";
        return;
    }

    hapusProgresLocalStorage();
    profilMurid.total_poin += data.skor;
    perbaruiTampilanPoin();

    document.getElementById("wadahKuis").innerHTML = `
        <p class="pesan-sukses mb-0">Kuis berhasil dikumpulkan. Skor kamu: ${data.skor} / ${data.total_soal}</p>
    `;
}

// =====================================================================
// UTILITAS
// =====================================================================
function escapeHtml(teks) {
    const elemen = document.createElement("div");
    elemen.textContent = teks;
    return elemen.innerHTML;
}