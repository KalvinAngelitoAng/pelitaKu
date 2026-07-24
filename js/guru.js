// =====================================================================
// LOGIKA DASHBOARD GURU
// =====================================================================

let profilGuru = null;
let hitungSoalKuisBaru = 0;

// =====================================================================
// INISIALISASI HALAMAN
// =====================================================================
(async function inisialisasiDashboardGuru() {
    profilGuru = await pastikanSudahLogin("guru");
    if (!profilGuru) return;

    document.getElementById("teksNamaGuru").textContent = profilGuru.nama_lengkap;

    await muatDaftarMurid();
    await muatJadwalAktifGuru();
    tambahBarisSoal();

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
            .select("*, jadwal_mingguan(minggu_ke, ayat_referensi)")
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
                <p class="fw-bold mb-1">${escapeHtmlGuru(renungan.jadwal_mingguan?.minggu_ke || "-")} - ${escapeHtmlGuru(renungan.jadwal_mingguan?.ayat_referensi || "-")}</p>
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
// BAGIAN JADWAL MINGGUAN & PIN
// =====================================================================
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
        return;
    }

    wadah.innerHTML = `
        <p class="fw-bold mb-1">${escapeHtmlGuru(data.minggu_ke)}</p>
        <p class="mb-1">PIN Absensi: <span class="fw-bold" style="letter-spacing: 2px;">${escapeHtmlGuru(data.pin_absensi)}</span></p>
        <p class="mb-1">Ayat: ${escapeHtmlGuru(data.ayat_referensi)}</p>
        <p class="teks-lembut mb-0" style="font-size: 0.85rem;">
            Periode: ${formatTanggalIndonesia(data.tanggal_mulai)} - ${formatTanggalIndonesia(data.tanggal_selesai)}
        </p>
    `;
}

async function tanganiSimpanJadwalBaru(peristiwa) {
    peristiwa.preventDefault();
    const pesanEl = document.getElementById("pesanStatusJadwal");

    const dataBaru = {
        minggu_ke: document.getElementById("inputMingguKe").value.trim(),
        pin_absensi: document.getElementById("inputPinBaru").value.trim(),
        ayat_referensi: document.getElementById("inputAyatReferensi").value.trim(),
        ayat_isi: document.getElementById("inputAyatIsi").value.trim(),
        tanggal_mulai: document.getElementById("inputTanggalMulai").value,
        tanggal_selesai: document.getElementById("inputTanggalSelesai").value,
        dibuat_oleh: profilGuru.id,
        status_aktif: true
    };

    // Nonaktifkan jadwal yg sebelumnya agar hanya ada 1 jadwal aktif
    await klienSupabase.from("jadwal_mingguan").update({ status_aktif: false }).eq("status_aktif", true);

    const { error } = await klienSupabase.from("jadwal_mingguan").insert(dataBaru);

    if (error) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Gagal menyimpan jadwal: ${error.message}</p>`;
        return;
    }

    pesanEl.innerHTML = `<p class="pesan-sukses mb-0">Jadwal baru berhasil disimpan dan diaktifkan.</p>`;
    document.getElementById("formJadwalBaru").reset();
    await muatJadwalAktifGuru();
}

// =====================================================================
// BAGIAN BUAT KUIS
// =====================================================================
function tambahBarisSoal() {
    hitungSoalKuisBaru += 1;
    const indeksSoal = hitungSoalKuisBaru;

    const div = document.createElement("div");
    div.className = "mb-3 p-3";
    div.style.cssText = "background-color: var(--warna-krem); border-radius: var(--radius-kecil);";
    div.id = `barisSoal_${indeksSoal}`;

    div.innerHTML = `
        <div class="d-flex justify-content-between mb-2">
            <b>Soal ${indeksSoal}</b>
            <button type="button" class="btn btn-sm btn-pelitaku-outline" onclick="hapusBarisSoal(${indeksSoal})">Hapus</button>
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
                    <input class="form-check-input input-kunci-jawaban" type="radio" name="kunci_soal_${indeksSoal}" value="${opsi}" required>
                    <label class="form-check-label">${opsi.toUpperCase()}</label>
                </div>
            `).join("")}
        </div>
    `;

    document.getElementById("wadahDaftarSoalForm").appendChild(div);
}

function hapusBarisSoal(indeksSoal) {
    const elemen = document.getElementById(`barisSoal_${indeksSoal}`);
    if (elemen) elemen.remove();
}

async function tanganiSimpanKuisBaru(peristiwa) {
    peristiwa.preventDefault();
    const pesanEl = document.getElementById("pesanStatusKuisBaru");

    const judul = document.getElementById("inputJudulKuis").value.trim();
    const waktuMulai = document.getElementById("inputWaktuMulai").value;
    const waktuSelesai = document.getElementById("inputWaktuSelesai").value;

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

    // Ambil jadwal aktif untuk dikaitkan dengan kuis
    const { data: jadwalAktif } = await klienSupabase
        .from("jadwal_mingguan")
        .select("id")
        .eq("status_aktif", true)
        .maybeSingle();

    const { data: kuisBaru, error: errorKuis } = await klienSupabase
        .from("kuis")
        .insert({
            judul,
            jadwal_id: jadwalAktif ? jadwalAktif.id : null,
            waktu_mulai: new Date(waktuMulai).toISOString(),
            waktu_selesai: new Date(waktuSelesai).toISOString(),
            dibuat_oleh: profilGuru.id
        })
        .select()
        .single();

    if (errorKuis || !kuisBaru) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Gagal membuat kuis: ${errorKuis ? errorKuis.message : "tidak diketahui"}</p>`;
        return;
    }

    const soalDenganKuisId = daftarSoalUntukDisimpan.map((soal, indeks) => ({
        ...soal,
        kuis_id: kuisBaru.id,
        urutan: indeks + 1
    }));

    const { error: errorSoal } = await klienSupabase.from("soal_kuis").insert(soalDenganKuisId);

    if (errorSoal) {
        pesanEl.innerHTML = `<p class="pesan-error mb-0">Kuis tersimpan, tetapi gagal menyimpan soal: ${errorSoal.message}</p>`;
        return;
    }

    pesanEl.innerHTML = `<p class="pesan-sukses mb-0">Kuis "${escapeHtmlGuru(judul)}" berhasil dibuat dengan ${soalDenganKuisId.length} soal.</p>`;
    document.getElementById("formKuisBaru").reset();
    document.getElementById("wadahDaftarSoalForm").innerHTML = "";
    hitungSoalKuisBaru = 0;
    tambahBarisSoal();
}

// =====================================================================
// UTILITAS
// =====================================================================
function escapeHtmlGuru(teks) {
    const elemen = document.createElement("div");
    elemen.textContent = teks;
    return elemen.innerHTML;
}
