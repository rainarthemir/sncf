const API_KEY = "e41a2be9-7450-4f1a-a7e6-eb429950186f";
const stationInput = document.getElementById("stationSearch");
const suggestionsBox = document.getElementById("suggestions");
const boardBody = document.getElementById("board-body");
const trainTypeSelect = document.getElementById("trainType");
const refreshBtn = document.getElementById("refreshBtn");

let currentStation = null;
let lastDepartures = [];

// ===================== UTILS =====================
function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function formatTimeFromNavitia(ts) {
  if (!ts || ts.length < 13) return "—";
  return ts.slice(9, 11) + "h" + ts.slice(11, 13);
}

// ===================== SEARCH =====================
async function searchStations(q) {
  if (!q || q.trim().length < 2) return [];
  const url = `https://api.sncf.com/v1/coverage/sncf/places?q=${encodeURIComponent(q)}&type[]=stop_area&count=50`;
  try {
    const res = await fetch(url, { headers: { Authorization: "Basic " + btoa(API_KEY + ":") } });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.places || []).map(p => ({
      id: p.id,
      label: p.stop_area?.label || p.name || p.id
    }));
  } catch {
    return [];
  }
}

// ===================== FETCH =====================
async function fetchDepartures(stopId) {
  if (!stopId) return;
  const now = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Paris" })
    .replace(/[-:T ]/g, "")
    .slice(0, 14);

  const url = `https://api.sncf.com/v1/coverage/sncf/stop_areas/${encodeURIComponent(stopId)}/departures?datetime=${now}&count=200`;

  try {
    console.log("🔹 Requête SNCF:", url);
    const res = await fetch(url, {
      headers: { Authorization: "Basic " + btoa(API_KEY + ":") }
    });

    console.log("🔹 Statut HTTP:", res.status);
    const text = await res.text();
    console.log("🔹 Réponse brute:", text.slice(0, 300)); // первые 300 символов

    if (!res.ok) {
      boardBody.innerHTML = `<div class="no-data">Erreur API: ${res.status}</div>`;
      return;
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      console.error("❌ JSON invalide:", err);
      boardBody.innerHTML = `<div class="no-data">Réponse non-JSON (${err.message})</div>`;
      return;
    }

    if (!json.departures) {
      console.warn("⚠️ Structure inattendue:", json);
    }

    console.log("✅ JSON reçu avec succès:", json);
    console.log("👉 Départs:", json.departures?.length);

    lastDepartures = json.departures || [];
    renderBoard(lastDepartures);

  } catch (err) {
    console.error("❌ FETCH FAILED:", err);
    boardBody.innerHTML = `<div class="no-data">Erreur de connexion<br>${err.message}</div>`;
  }
}


// ===================== RENDER =====================
function renderBoard(departures) {
  const typeFilter = trainTypeSelect.value;
  const isMobile = window.innerWidth < 768;

  if (!departures.length) {
    boardBody.innerHTML = `<div class="no-data">Aucun départ trouvé</div>`;
    return;
  }

  const filtered = departures.filter(dep => {
    if (typeFilter === "all") return true;
    const commercial = (dep.display_informations?.commercial_mode || "").toUpperCase();
    return commercial.includes(typeFilter.toUpperCase());
  });

  if (!filtered.length) {
    boardBody.innerHTML = `<div class="no-data">Aucun départ après filtrage</div>`;
    return;
  }

  boardBody.innerHTML = filtered.map((dep, index) => {
    const info = dep.display_informations || {};
    const st = dep.stop_date_time || {};

    let vehicleJourneyId = dep.vehicle_journey?.id;
    if (!vehicleJourneyId && dep.links) {
      const link = dep.links.find(l => l.type === "vehicle_journey");
      if (link) vehicleJourneyId = link.id;
    }

    const mission = info.headsign || info.code || info.trip_short_name || info.name || info.label || "—";
    const line = info.code || "?";
    const lineDisplay = line === "?" ? (info.commercial_mode || "—") : line;

    let destination = info.direction || (dep.terminus && dep.terminus.name) || "—";
    if (isMobile && destination.includes("(")) {
      destination = destination.replace(/\s*\([^)]*\)/g, "").trim();
    }

    const color = info.color ? ("#" + info.color) : "#0052a3";
    const canceled = info.status && info.status.toLowerCase().includes("cancelled");

    const baseTs = st.base_departure_date_time || null;
    const realTs = st.departure_date_time || null;
    const delayM = Math.floor((st.departure_delay || 0) / 60);

    let delayed = false, originalDisplay = null, newDisplay = null;
    if (baseTs && realTs && baseTs !== realTs) {
      delayed = true;
      originalDisplay = formatTimeFromNavitia(baseTs);
      newDisplay = formatTimeFromNavitia(realTs);
    } else if (baseTs && delayM > 0) {
      delayed = true;
      originalDisplay = formatTimeFromNavitia(baseTs);
      const baseMinutes = parseInt(baseTs.slice(9, 11)) * 60 + parseInt(baseTs.slice(11, 13));
      const delayedMinutes = baseMinutes + delayM;
      newDisplay = `${String(Math.floor(delayedMinutes / 60)).padStart(2, '0')}h${String(delayedMinutes % 60).padStart(2, '0')}`;
    } else {
      delayed = false;
      originalDisplay = formatTimeFromNavitia(realTs || baseTs);
    }

    // === LOGO DETECTION ===
    // === LOGO DETECTION (исправленный порядок и логика) ===
  // === LOGO DETECTION — надёжная версия с нормализацией и логами ===
  function norm(s = "") {
    // убираем диакритики, в UPPERCASE, схлопываем пробелы
    return s
      .normalize('NFD')                 // разложить символы с диакритикой
      .replace(/\p{Diacritic}/gu, '')   // убрать диакритики
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  const commercialRaw = [info.commercial_mode, info.physical_mode, info.network].filter(Boolean).join(' ');
  const codeRaw        = [lineDisplay, info.code, info.label, info.name].filter(Boolean).join(' ');
  const COMM = norm(commercialRaw);
  const LINE = norm(codeRaw);

  // Регэксп, чтобы ловить TER как отдельное слово, а не внутри INTERCITES
  const TER_WORD = /(^|[^A-Z])TER([^A-Z]|$)/;

  // Приоритет: INTERCITES → INOUI → OUIGO → EUROSTAR → DB SNCF → TRANSILIEN → RER → TER → текст
  let logoHtml = "", textText = "";

  // 1) Intercités: ищем в ЛИНИИ (как ты и хотел), плюс в commercial на всякий
  if (LINE.includes("INTERCIT") || COMM.includes("INTERCIT")) {
    logoHtml = '<img src="logo/intercites.svg" class="train-logo" alt="Intercités">';
    textText = 'Intercités';

  // 2) TGV Inoui
  } else if (LINE.includes("INOUI") || COMM.includes("INOUI")) {
    logoHtml = '<img src="logo/inoui.svg" class="train-logo" alt="Inoui">';
    textText = 'TGV Inoui';

  // 3) OUIGO (включая Classique / Train Classique / GV)
  } else if (LINE.includes("OUIGO") || COMM.includes("OUIGO") || LINE.includes("CLASSIQUE")) {
    logoHtml = '<img src="logo/ouigo.svg" class="train-logo" alt="Ouigo">';
    textText = 'TGV Ouigo';

  // 4) Eurostar
  } else if (LINE.includes("EUROSTAR") || COMM.includes("EUROSTAR")) {
    logoHtml = '<img src="logo/eurostar.svg" class="train-logo" alt="Eurostar">';
    textText = 'Eurostar';

  // 5) DB SNCF
  } else if (LINE.includes("DB SNCF") || COMM.includes("DB")) {
    logoHtml = '<img src="logo/dbsncf.svg" class="train-logo" alt="DB SNCF">';
    textText = 'DB-SNCF';

  // 6) Transilien
  } else if (LINE.includes("TRANSILIEN") || COMM.includes("TRANSILIEN") || COMM.includes("TRANS")) {
    logoHtml = '<img src="logo/transilien.svg" class="train-logo" alt="Transilien">';
    textText = 'Transilien';

  // 7) RER
  } else if (LINE.includes(" RER ") || COMM.includes("RER") || /^RER[A-Z]$/.test(LINE)) {
    logoHtml = '<img src="logo/rer.svg" class="train-logo" alt="RER">';
    textText = 'RER';

  // 8) TER — только как отдельное слово, чтобы не ловить INTERCITES
  } else if (TER_WORD.test(' ' + LINE + ' ') || TER_WORD.test(' ' + COMM + ' ')) {
    logoHtml = '<img src="logo/ter.svg" class="train-logo" alt="TER">';
    textText = 'TER';

  // 9) Фоллбек — просто текст (commercial_mode или Ligne)
  } else {
    textText = escapeHtml(info.commercial_mode || lineDisplay || "Autre");
  }

  // Для диагностики в консоль:
  console.debug('[TYPE PICKED]', {
    lineDisplay,
    commercial_mode: info.commercial_mode,
    label: info.label,
    picked: textText
  });

// и далее уже используем:
// <div class="col-type">${logoHtml} <span class="train-logo-text">${textText}</span></div>


    const timeCell = canceled
      ? `<span class="canceled-time">${originalDisplay || "—"}</span>`
      : delayed
      ? `<span class="original-time">${originalDisplay}</span><span class="delayed-time">${newDisplay}</span>`
      : `<span class="on-time">${originalDisplay}</span>`;

    const rowClass = index % 2 === 0 ? "train-row row-light" : "train-row row-dark";
    const clickableClass = vehicleJourneyId ? "clickable-train-row" : "";
    const vehicleAttr = vehicleJourneyId ? `data-vehicle-journey-id="${vehicleJourneyId}"` : "";

    return `
      <div class="${rowClass} ${clickableClass}" ${vehicleAttr}>
        <div class="col-line"><span class="line-badge" style="background-color:${color}">${escapeHtml(lineDisplay)}</span></div>
        <div class="col-mission">${escapeHtml(mission)}</div>
        <div class="col-destination">${escapeHtml(destination)}</div>
        <div class="col-time"><div class="time-with-delay">${timeCell}</div></div>
        <div class="col-type">${logoHtml} <span class="train-logo-text">${textHtml}</span></div>
      </div>
    `;
  }).join("");

  document.querySelectorAll('.clickable-train-row').forEach(row => {
    const clone = row.cloneNode(true);
    row.parentNode.replaceChild(clone, row);
    clone.addEventListener('click', function() {
      const id = this.getAttribute('data-vehicle-journey-id');
      if (id) window.location.href = `trip?${id}`;
    });
  });
}

// ===================== EVENTS =====================
stationInput.addEventListener("input", async e => {
  const val = e.target.value;
  if (!val) {
    suggestionsBox.style.display = "none";
    return;
  }
  const results = await searchStations(val);
  suggestionsBox.innerHTML = results.length
    ? results.map(r => `<div class="suggestion-item" data-id="${r.id}">${r.label}</div>`).join("")
    : '<div class="suggestion-empty">Aucun résultat</div>';
  suggestionsBox.style.display = "block";
});

suggestionsBox.addEventListener("click", e => {
  const item = e.target.closest(".suggestion-item");
  if (!item) return;
  currentStation = item.dataset.id;
  stationInput.value = item.textContent;
  suggestionsBox.style.display = "none";
  fetchDepartures(currentStation);
});

refreshBtn.addEventListener("click", () => {
  if (currentStation) fetchDepartures(currentStation);
});

trainTypeSelect.addEventListener("change", () => {
  if (lastDepartures.length > 0) renderBoard(lastDepartures);
});
