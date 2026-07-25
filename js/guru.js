// =====================================================================
// PELITAKU - LOGIKA DASHBOARD GURU
// =====================================================================

let profilGuru = null;
let hitungSoalKuisBaru = 0;
let jadwalAktifIdGuru = null; // id jadwal_mingguan yang sedang aktif

// =====================================================================
// INISIALISASI HALAMAN
// =====================================================================
(async function inisialisasiDashboardGuru() {
    profilGuru = await pastikanSudahLogin("guru");
    if (!profilGuru) return;

    document.getElementById("teksNamaGuru").textContent = profilGuru.nama_lengkap;

    renderFormAyatHarian();
    await muatDaftarMurid();
    await muatJadwalAktifGuru();
    await muatRenunganHarian(document.getElementById("pilihanHariRenungan").value);
    await muatDaftarKuis();
    tambahBarisSoal(); // mulai dengan 1 baris soal kosong

    pasangEventListenerGuru();
})();

function pasangEventListenerGuru() {
    document.getElementById("tombolAcakPin").addEventListener("click", () => {
        const pinAcak = Math.floor(1000 + Math.random() * 9000).toString();
        document.getElementById("inputPinBaru").value = pinAcak;
    });

    document.getElementById("formJadwalBaru").addEventListener("submit", tanganiSimpanJadwalBaru);
    document.getElementById("tombolTambahSoal").addEventListener("click", tambahBarisSoal);
    document.getElementById("formKuisBaru").addEventListener("submit", tanganiSimpanKuisBaru);

    document.getElementById("pilihanHariRenungan").addEventListener("change", (peristiwa) => {
        muatRenunganHarian(peristiwa.target.value);
    });
}

// =====================================================================
// BAGIAN DATA MURID & EVALUASI
// =====================================================================
async function muatDaftarMurid() {
    const { data: daftarMurid, error } = await klienSupabase
        .from("profil")
        .select("*")
        .eq("role", "murid")
        .order("nama_lengkap", { ascending: true });

    const tabel = document.getElementById("tabelDaftarMurid");

    if (error || !daftarMurid || daftarMurid.length === 0) {
        tabel.innerHTML = `<tr><td colspan="5" class="text-center teks-lembut">Belum ada data murid.</td></tr>`;
        return;
    }

    tabel.innerHTML = daftarMurid.map((murid) => `
        <tr>
            <td>${escapeHtmlGuru(murid.nama_lengkap)}</td>
            <td>${escapeHtmlGuru(murid.kelas || "-")}</td>
            <td>${murid.total_poin}</td>
            <td>${murid.streak_renungan}</td>
            <td>
                <button class="btn btn-pelitaku-outline btn-sm" onclick="bukaDetailMurid('${murid.id}', '${escapeHtmlGuru(murid.nama_lengkap)}')">
                    Lihat Detail
                </button>
            </td>
        </tr>
    `).join("");
}

async function bukaDetailMurid(muridId, namaMurid) {
    document.getElementById("judulModalDetailMurid").textContent = `Detail: ${namaMurid}`;
    document.getElementById("isiModalDetailMurid").innerHTML = `<p class="teks-lembut">Memuat data...</p>`;

    const modal = new bootstrap.Modal(document.getElementById("modalDetailMurid"));
    modal.show();

    const [hasilKehadiran, hasilRenungan] = await Promise.all([
        klienSupabase
            .from("kehadiran")
            .select("*, jadwal_mingguan(minggu_ke, tanggal_mulai)")
            .eq("murid_id", muridId)
            .order("created_at", { ascending: false }),
        klienSupabase
            .from("renungan")
            .select("*, jadwal_mingguan(minggu_ke), ayat_harian(hari, ayat_referensi)")
            .eq("murid_id", muridId)
            .order("created_at", { ascending: false })
    ]);

    const daftarKehadiran = hasilKehadiran.data || [];
    const daftarRenungan = hasilRenungan.data || [];

    let htmlKehadiran = daftarKehadiran.length === 0
        ? `<p class="teks-lembut">Belum ada riwayat absensi.</p>`
        : `<ul class="list-unstyled">` + daftarKehadiran.map((absen) => `
            <li class="mb-2 pb-2" style="border-bottom: 1px solid var(--warna-abu-nonaktif);">
                <b>${escapeHtmlGuru(absen.jadwal_mingguan?.minggu_ke || "-")}</b> -
                ${absen.status === "hadir" ? '<span class="status-hadir">Hadir</span>' : '<span class="status-izin">Izin</span>'}
                ${absen.status === "izin" ? `<br><span class="teks-lembut">Alasan: ${escapeHtmlGuru(absen.alasan_izin || "-")}</span>` : ""}
            </li>
        `).join("") + `</ul>`;

    let htmlRenungan = daftarRenungan.length === 0
        ? `<p class="teks-lembut">Belum ada renungan yang dikirim.</p>`
        : daftarRenungan.map((renungan) => `
            <div class="mb-3 p-3" style="background-color: var(--warna-krem); border-radius: var(--radius-kecil);">
                <p class="fw-bold mb-1">
                    ${escapeHtmlGuru(renungan.jadwal_mingguan?.minggu_ke || "-")}
                    ${renungan.ayat_harian ? ` - ${NAMA_HARI_RENUNGAN[renungan.ayat_harian.hari] || ""} (${escapeHtmlGuru(renungan.ayat_harian.ayat_referensi)})` : ""}
                </p>
                <p class="mb-0" style="white-space: pre-wrap;">${escapeHtmlGuru(renungan.isi_renungan)}</p>
            </div>
        `).join("");

    document.getElementById("isiModalDetailMurid").innerHTML = `
        <h6 class="fw-bold mb-2">Riwayat Absensi</h6>
        ${htmlKehadiran}
        <div class="divider-pelitaku"></div>
        <h6 class="fw-bold mb-2">Riwayat Renungan</h6>
        ${htmlRenungan}
    `;
}

// =====================================================================
// BAGIAN JADWAL MINGGUAN, PIN & AYAT HARIAN
// =====================================================================

/**
 * Membuat 6 blok input ayat harian (Senin-Sabtu) di form "Buat Jadwal Minggu Baru".
 */
function renderFormAyatHarian() {
    const wadah = document.getElementById("wadahAyatHarianForm");
    wadah.innerHTML = [1, 2, 3, 4, 5, 6].map((kodeHari) => `
        <div class="mb-3 p-3" style="background-color: var(--warna-krem); border-radius: var(--radius-kecil);">
            <p class="fw-bold mb-2">${NAMA_HARI_RENUNGAN[kodeHari]}</p>
            <div class="mb-2">
                <input type="text" class="form-control form-control-pelitaku input-ayat-referensi-hari"
                    data-hari="${kodeHari}" placeholder="Referensi ayat, contoh: Yohanes 3:16" required>
            </div>
            <textarea class="form-control form-control-pelitaku input-ayat-isi-hari"
                data-hari="${kodeHari}" rows="2" placeholder="Isi ayat..." required></textarea>
        </div>
    `).join("");
}

async function muatJadwalAktifGuru() {
    const { data, error } = await klienSupabase
        .from("jadwal_mingguan")
        .select("*")
        .eq("status_aktif", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    const wadah = document.getElementById("wadahJadwalAktifGuru");

    if (error || !data) {
        wadah.innerHTML = `<p class="teks-lembut">Belum ada jadwal aktif.</p>`;
        jadwalAktifIdGuru = null;
        return;
    }

    jadwalAktifIdGuru = data.id;

    const { data: daftarAyat } = await klienSupabase
        .from("ayat_harian")
        .select("*")
        .eq("jadwal_id", data.id)
        .order("hari", { ascending: true });

    const htmlAyat = (daftarAyat || []).map((ayat) => `
        <li><b>${NAMA_HARI_RENUNGAN[ayat.hari]}</b>: ${escapeHtmlGuru(ayat.ayat_referensi)}</li>
    `).join("");

    wadah.innerHTML = `
        <p class="fw-bold mb-1">${escapeHtmlGuru(data.minggu_ke)}</p>
        <p class="mb-1">PIN Absensi: <span class="fw-bold" style="letter-spacing: 2px;">${escapeHtmlGuru(data.pin_absensi)}</span></p>
        <p class="teks-lembut mb-2" style="font-size: 0.85rem;">
            Periode: ${formatTanggalIndonesia(data.tanggal_mulai)} - ${formatTanggalIndonesia(data.tanggal_selesai)}
        </p>
        <p class="mb-1 fw-bold" style="font-size: 0.9rem;">Ayat Harian (${(daftarAyat || []).length}/6 terisi)</p>
        <ul class="mb-0" style="font-size: 0.9rem;">${htmlAyat || "<li class='teks-lembut'>Belum ada ayat harian.</li>"}</ul>
    `;
}

async function tanganiSimpanJadwalBaru(peristiwa) {
    peristiwa.preventDefault();
    const pesanEl = document.getElementById("pesanStatusJadwal");

    const inputReferensi = document.querySelectorAll(".input-ayat-referensi-hari");
    const inputIsi = document.querySelectorAll(".input-ayat-isi-hari");

    const daftarAyatHarian = [];
    for (let i = 0; i < inputReferensi.length; i++) {
        const referensi = inputReferensi[i].value.trim();
        const isi = inputIsi[i].value.trim();
        const hari = parseInt(inputReferensi[i].dataset.hari, 10);

        if (!referensi || !isi) {
            pesanEl.innerHTML = `<p class="pesan-error mb-0">Lengkapi ayat untuk hari ${NAMA_HARI_RENUNGAN[hari]}.</p>`;
            return;
        }

        daftarAyatHarian.push({ hari, ayat_referensi: referensi, ayat_isi: isi });
    }

    const dataJadwalBaru = {
        minggu_ke: document.getElementById("inputMingguKe").value.trim(),
        pin_absensi: document.getElementById("inputPinBaru").value.trim(),
        tanggal_mulai: document.getElementById("inputTanggalMulai").value,
        tanggal_selesai: document.getElementById("inputTanggalSelesai").value,
        dibuat_oleh: profilGuru.id,
        status_aktif: true
    };

    const tombolSimpan = document.querySelector("#formJadwalBaru button[type=submit]");
    tombolSimpan.disabled = true;
    tombolSimpan.textContent = "Menyimpan...";

    // Nonaktifkan jadwal-jadwal sebelumnya agar hanya ada 1 jadwal aktif
    await klienSupabase.from("jadwal_mingguan").update({ status_aktif: false }).eq("status_aktif", true);

    const { data: jadwalBaru, error: errorJadwal } = await klienSupabase
        .from("jadwal_mingguan")
        .insert(dataJadwalBaru)
        .select()
        .single();

    if (errorJadwal || !jadwalBaru) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Gagal menyimpan jadwal: ${errorJadwal ? errorJadwal.message : "tidak diketahui"}</p>`;
        tombolSimpan.disabled = false;
        tombolSimpan.textContent = "Simpan Jadwal & Aktifkan";
        return;
    }

    const ayatHarianDenganJadwalId = daftarAyatHarian.map((ayat) => ({ ...ayat, jadwal_id: jadwalBaru.id }));
    const { error: errorAyat } = await klienSupabase.from("ayat_harian").insert(ayatHarianDenganJadwalId);

    tombolSimpan.disabled = false;
    tombolSimpan.textContent = "Simpan Jadwal & Aktifkan";

    if (errorAyat) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Jadwal tersimpan, tetapi gagal menyimpan ayat harian: ${errorAyat.message}</p>`;
        return;
    }

    pesanEl.innerHTML = `<p class="pesan-sukses mb-0">Jadwal baru & 6 ayat harian berhasil disimpan dan diaktifkan.</p>`;
    document.getElementById("formJadwalBaru").reset();
    renderFormAyatHarian();
    await muatJadwalAktifGuru();
    await muatRenunganHarian(document.getElementById("pilihanHariRenungan").value);
}

// =====================================================================
// BAGIAN RENUNGAN HARIAN (guru membaca jawaban murid per hari)
// =====================================================================
async function muatRenunganHarian(hariTerpilihString) {
    const hariTerpilih = parseInt(hariTerpilihString, 10);
    const wadahAyat = document.getElementById("wadahAyatHariTerpilih");
    const wadahRenungan = document.getElementById("wadahRenunganHarian");

    if (!jadwalAktifIdGuru) {
        wadahAyat.innerHTML = `<p class="teks-lembut mb-0">Belum ada jadwal minggu aktif.</p>`;
        wadahRenungan.innerHTML = "";
        return;
    }

    const { data: ayatHari } = await klienSupabase
        .from("ayat_harian")
        .select("*")
        .eq("jadwal_id", jadwalAktifIdGuru)
        .eq("hari", hariTerpilih)
        .maybeSingle();

    if (!ayatHari) {
        wadahAyat.innerHTML = `<p class="teks-lembut mb-0">Ayat untuk hari ${NAMA_HARI_RENUNGAN[hariTerpilih]} belum diisi pada jadwal minggu ini.</p>`;
        wadahRenungan.innerHTML = "";
        return;
    }

    wadahAyat.innerHTML = `
        <p class="fw-bold mb-1">${escapeHtmlGuru(ayatHari.ayat_referensi)}</p>
        <p class="mb-0 fst-italic">${escapeHtmlGuru(ayatHari.ayat_isi)}</p>
    `;

    wadahRenungan.innerHTML = `<p class="teks-lembut">Memuat renungan murid...</p>`;

    const { data: daftarRenungan, error } = await klienSupabase
        .from("renungan")
        .select("*, profil(nama_lengkap, kelas)")
        .eq("ayat_harian_id", ayatHari.id)
        .order("created_at", { ascending: true });

    if (error || !daftarRenungan || daftarRenungan.length === 0) {
        wadahRenungan.innerHTML = `<p class="teks-lembut mb-0">Belum ada murid yang mengisi renungan untuk hari ini.</p>`;
        return;
    }

    wadahRenungan.innerHTML = daftarRenungan.map((renungan) => `
        <div class="mb-3 p-3" style="background-color: var(--warna-krem); border-radius: var(--radius-kecil);">
            <p class="fw-bold mb-1">${escapeHtmlGuru(renungan.profil?.nama_lengkap || "Murid")} <span class="teks-lembut fw-normal">(${escapeHtmlGuru(renungan.profil?.kelas || "-")})</span></p>
            <p class="mb-0" style="white-space: pre-wrap;">${escapeHtmlGuru(renungan.isi_renungan)}</p>
        </div>
    `).join("");
}

// =====================================================================
// BAGIAN DAFTAR & DETAIL KUIS
// =====================================================================
async function muatDaftarKuis() {
    const { data: daftarKuis, error } = await klienSupabase
        .from("kuis")
        .select("*")
        .order("waktu_mulai", { ascending: false });

    const tabel = document.getElementById("tabelDaftarKuis");

    if (error || !daftarKuis || daftarKuis.length === 0) {
        tabel.innerHTML = `<tr><td colspan="5" class="text-center teks-lembut">Belum ada kuis yang dibuat.</td></tr>`;
        return;
    }

    tabel.innerHTML = daftarKuis.map((kuis) => {
        const status = tentukanStatusKuis(kuis.waktu_mulai, kuis.waktu_selesai);
        const labelStatus = status === "aktif"
            ? '<span class="status-hadir">Sedang Berlangsung</span>'
            : status === "akan_datang"
                ? '<span class="status-belum">Akan Datang</span>'
                : '<span class="status-izin">Sudah Berakhir</span>';

        return `
            <tr>
                <td>${escapeHtmlGuru(kuis.judul)}</td>
                <td>${new Date(kuis.waktu_mulai).toLocaleString("id-ID")}</td>
                <td>${new Date(kuis.waktu_selesai).toLocaleString("id-ID")}</td>
                <td>${labelStatus}</td>
                <td>
                    <button class="btn btn-pelitaku-outline btn-sm" onclick="bukaDetailSoalKuis('${kuis.id}', '${escapeHtmlGuru(kuis.judul)}')">
                        Lihat Soal
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

async function bukaDetailSoalKuis(kuisId, judulKuis) {
    document.getElementById("judulModalDetailKuis").textContent = `Soal: ${judulKuis}`;
    document.getElementById("isiModalDetailKuis").innerHTML = `<p class="teks-lembut">Memuat soal...</p>`;

    const modal = new bootstrap.Modal(document.getElementById("modalDetailKuis"));
    modal.show();

    const { data: daftarSoal, error } = await klienSupabase
        .from("soal_kuis")
        .select("*")
        .eq("kuis_id", kuisId)
        .order("urutan", { ascending: true });

    if (error || !daftarSoal || daftarSoal.length === 0) {
        document.getElementById("isiModalDetailKuis").innerHTML = `<p class="teks-lembut mb-0">Belum ada soal untuk kuis ini.</p>`;
        return;
    }

    document.getElementById("isiModalDetailKuis").innerHTML = daftarSoal.map((soal, indeks) => `
        <div class="mb-4">
            <p class="fw-bold mb-2">${indeks + 1}. ${escapeHtmlGuru(soal.pertanyaan)}</p>
            ${["a", "b", "c", "d"].map((opsi) => `
                <p class="mb-1 ${soal.kunci_jawaban === opsi ? "pesan-sukses fw-bold" : ""}">
                    ${opsi.toUpperCase()}. ${escapeHtmlGuru(soal["opsi_" + opsi])}
                    ${soal.kunci_jawaban === opsi ? " (Kunci Jawaban)" : ""}
                </p>
            `).join("")}
        </div>
    `).join("");
}

// =====================================================================
// BAGIAN BUAT KUIS
// =====================================================================
function tambahBarisSoal() {
    hitungSoalKuisBaru += 1;
    const idUnikSoal = hitungSoalKuisBaru; // hanya dipakai sebagai ID DOM, bukan nomor tampilan

    const div = document.createElement("div");
    div.className = "mb-3 p-3";
    div.style.cssText = "background-color: var(--warna-krem); border-radius: var(--radius-kecil);";
    div.id = `barisSoal_${idUnikSoal}`;

    div.innerHTML = `
        <div class="d-flex justify-content-between mb-2">
            <b class="label-nomor-soal">Soal</b>
            <button type="button" class="btn btn-sm btn-pelitaku-outline" onclick="hapusBarisSoal(${idUnikSoal})">Hapus</button>
        </div>
        <div class="mb-2">
            <input type="text" class="form-control form-control-pelitaku input-pertanyaan-soal" placeholder="Tulis pertanyaan..." required>
        </div>
        <div class="row g-2">
            ${["a", "b", "c", "d"].map((opsi) => `
                <div class="col-6">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">${opsi.toUpperCase()}</span>
                        <input type="text" class="form-control input-opsi-${opsi}" placeholder="Opsi ${opsi.toUpperCase()}" required>
                    </div>
                </div>
            `).join("")}
        </div>
        <div class="mt-2">
            <label class="form-label mb-1" style="font-size: 0.85rem;">Kunci Jawaban Benar</label><br>
            ${["a", "b", "c", "d"].map((opsi) => `
                <div class="form-check form-check-inline">
                    <input class="form-check-input input-kunci-jawaban" type="radio" name="kunci_soal_${idUnikSoal}" value="${opsi}" required>
                    <label class="form-check-label">${opsi.toUpperCase()}</label>
                </div>
            `).join("")}
        </div>
    `;

    document.getElementById("wadahDaftarSoalForm").appendChild(div);
    perbaruiNomorSoalTampilan();
}

function hapusBarisSoal(idUnikSoal) {
    const elemen = document.getElementById(`barisSoal_${idUnikSoal}`);
    if (elemen) elemen.remove();
    perbaruiNomorSoalTampilan();
}

/**
 * Menghitung ulang label "Soal 1", "Soal 2", dst berdasarkan urutan tampil
 * saat ini di layar -- bukan dari ID internal yang terus bertambah.
 * Dipanggil setiap kali ada baris soal ditambah atau dihapus.
 */
function perbaruiNomorSoalTampilan() {
    const semuaLabel = document.querySelectorAll("#wadahDaftarSoalForm .label-nomor-soal");
    semuaLabel.forEach((label, indeks) => {
        label.textContent = `Soal ${indeks + 1}`;
    });
}

async function tanganiSimpanKuisBaru(peristiwa) {
    peristiwa.preventDefault();
    const pesanEl = document.getElementById("pesanStatusKuisBaru");

    const judul = document.getElementById("inputJudulKuis").value.trim();
    const waktuMulai = document.getElementById("inputWaktuMulai").value;
    const waktuSelesai = document.getElementById("inputWaktuSelesai").value;

    if (!waktuMulai || !waktuSelesai || new Date(waktuSelesai) <= new Date(waktuMulai)) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Waktu selesai harus setelah waktu mulai.</p>`;
        return;
    }

    const barisSoal = document.querySelectorAll("#wadahDaftarSoalForm > div");
    if (barisSoal.length === 0) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Tambahkan minimal 1 soal.</p>`;
        return;
    }

    const daftarSoalUntukDisimpan = [];
    for (const baris of barisSoal) {
        const pertanyaan = baris.querySelector(".input-pertanyaan-soal").value.trim();
        const opsiA = baris.querySelector(".input-opsi-a").value.trim();
        const opsiB = baris.querySelector(".input-opsi-b").value.trim();
        const opsiC = baris.querySelector(".input-opsi-c").value.trim();
        const opsiD = baris.querySelector(".input-opsi-d").value.trim();
        const kunciTerpilih = baris.querySelector(".input-kunci-jawaban:checked");

        if (!pertanyaan || !opsiA || !opsiB || !opsiC || !opsiD || !kunciTerpilih) {
            pesanEl.innerHTML = `<p class="pesan-error mb-0">Lengkapi semua soal, opsi, dan kunci jawaban.</p>`;
            return;
        }

        daftarSoalUntukDisimpan.push({
            pertanyaan, opsi_a: opsiA, opsi_b: opsiB, opsi_c: opsiC, opsi_d: opsiD,
            kunci_jawaban: kunciTerpilih.value
        });
    }

    const tombolSimpan = document.querySelector("#formKuisBaru button[type=submit]");
    tombolSimpan.disabled = true;
    tombolSimpan.textContent = "Menyimpan...";

    const { data: kuisBaru, error: errorKuis } = await klienSupabase
        .from("kuis")
        .insert({
            judul,
            jadwal_id: jadwalAktifIdGuru,
            waktu_mulai: new Date(waktuMulai).toISOString(),
            waktu_selesai: new Date(waktuSelesai).toISOString(),
            dibuat_oleh: profilGuru.id
        })
        .select()
        .single();

    if (errorKuis || !kuisBaru) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Gagal membuat kuis: ${errorKuis ? errorKuis.message : "tidak diketahui"}</p>`;
        tombolSimpan.disabled = false;
        tombolSimpan.textContent = "Simpan Kuis";
        return;
    }

    const soalDenganKuisId = daftarSoalUntukDisimpan.map((soal, indeks) => ({
        ...soal,
        kuis_id: kuisBaru.id,
        urutan: indeks + 1
    }));

    const { error: errorSoal } = await klienSupabase.from("soal_kuis").insert(soalDenganKuisId);

    tombolSimpan.disabled = false;
    tombolSimpan.textContent = "Simpan Kuis";

    if (errorSoal) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Kuis tersimpan, tetapi gagal menyimpan soal: ${errorSoal.message}</p>`;
        return;
    }

    pesanEl.innerHTML = `<p class="pesan-sukses mb-0">Kuis "${escapeHtmlGuru(judul)}" berhasil dibuat dengan ${soalDenganKuisId.length} soal.</p>`;
    document.getElementById("formKuisBaru").reset();
    document.getElementById("wadahDaftarSoalForm").innerHTML = "";
    hitungSoalKuisBaru = 0;
    tambahBarisSoal();
    await muatDaftarKuis();
}

// =====================================================================
// UTILITAS
// =====================================================================
function escapeHtmlGuru(teks) {
    const elemen = document.createElement("div");
    elemen.textContent = teks;
    return elemen.innerHTML;
}