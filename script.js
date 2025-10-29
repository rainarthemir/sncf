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
    const res = await fetch(url, {
      headers: { Authorization: "Basic " + btoa(API_KEY + ":") }
    });

    if (!res.ok) {
      boardBody.innerHTML = `<div class="no-data">Erreur API: ${res.status}</div>`;
      return;
    }

    const json = await res.json();
    if (!json.departures) {
      boardBody.innerHTML = `<div class="no-data">Aucun départ trouvé</div>`;
      return;
    }

    lastDepartures = json.departures || [];
    renderBoard(lastDepartures);
  } catch (err) {
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
  function norm(s = "") {
    return s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  const COMM = norm([info.commercial_mode, info.physical_mode, info.network].filter(Boolean).join(' '));
  const LINE = norm([lineDisplay, info.code, info.label, info.name].filter(Boolean).join(' '));
  const TER_WORD = /(^|[^A-Z])TER([^A-Z]|$)/;

  let logoHtml = "", textHtml = "";

  // Intercités (только точные совпадения)
  if (["INTERCITES", "INTERCITES DE NUIT"].includes(LINE) || ["INTERCITES", "INTERCITES DE NUIT"].includes(COMM)) {
    logoHtml = '<img src="logo/intercites.svg" class="train-logo" alt="Intercités">';
    textHtml = 'Intercités';

  // TGV Inoui
  } else if (LINE.includes("INOUI") || COMM.includes("INOUI")) {
    logoHtml = '<img src="logo/inoui.svg" class="train-logo" alt="Inoui">';
    textHtml = 'TGV Inoui';

  // OUIGO (включая Classique)
  } else if (LINE.includes("OUIGO") || COMM.includes("OUIGO") || LINE.includes("CLASSIQUE")) {
    logoHtml = '<img src="logo/ouigo.svg" class="train-logo" alt="Ouigo">';
    textHtml = 'TGV Ouigo';

  // Eurostar
  } else if (LINE.includes("EUROSTAR") || COMM.includes("EUROSTAR")) {
    logoHtml = '<img src="logo/eurostar.svg" class="train-logo" alt="Eurostar">';
    textHtml = 'Eurostar';

  // DB SNCF
  } else if (LINE.includes("DB SNCF") || COMM.includes("DB")) {
    logoHtml = '<img src="logo/dbsncf.svg" class="train-logo" alt="DB SNCF">';
    textHtml = 'DB-SNCF';

// Transilien
} else if (LINE.includes("TRANSILIEN") || COMM.includes("TRANSILIEN") || COMM.includes("TRANS")) {
  logoHtml = '<img src="logo/transilien.svg" class="train-logo" alt="Transilien">';
  textHtml = 'Transilien';

  // RER
  } else if (LINE.includes("RER") || COMM.includes("RER") || /^RER[A-Z]$/.test(LINE)) {
    logoHtml = '<img src="logo/rer.svg" class="train-logo" alt="RER">';
    textHtml = 'RER';

  // TER
  } else if (TER_WORD.test(' ' + LINE + ' ') || TER_WORD.test(' ' + COMM + ' ')) {
    logoHtml = '<img src="logo/ter.svg" class="train-logo" alt="TER">';
    textHtml = 'TER';

  // По умолчанию
  } else {
    textHtml = escapeHtml(info.commercial_mode || lineDisplay || "Autre");
  }


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
