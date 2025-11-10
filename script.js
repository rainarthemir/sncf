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

// Нормализация текста: убирает акценты, лишние пробелы и приводит к верхнему регистру
function norm(str) {
  return str
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase() || "";
}

function formatTimeFromNavitia(ts) {
  if (!ts || ts.length < 16) return "—";
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

    // ИСПРАВЛЕННАЯ ЛОГИКА ВРЕМЕНИ И ЗАДЕРЖЕК
    const baseTs = st.base_departure_date_time; // Теоретическое время
    const realTs = st.departure_date_time; // Практическое время с задержками
    const delayM = Math.floor((st.departure_delay || 0) / 60); // Задержка в минутах

    // ВСЕГДА используем реальное время для отображения
    const displayedTime = formatTimeFromNavitia(realTs || baseTs);

    let timeCell;
    if (canceled) {
      timeCell = `<span class="canceled-time">${displayedTime}</span>`;
    } else if (delayM > 0) {
      // Показываем реальное время + индикатор задержки
      timeCell = `
        <div class="time-with-delay">
          <span class="delayed-time">${displayedTime}</span>
          <div class="delay-indicator">+${delayM} min</div>
        </div>
      `;
    } else {
      timeCell = `<span class="on-time">${displayedTime}</span>`;
    }

    // ===================== ЛОГОТИПЫ =====================
    function getTrainLogo(info) {
      let logoHtml = "";
      let textHtml = "";
      
      const commercialMode = norm(info.commercial_mode || "");

      if (commercialMode === "TGV" || commercialMode === "TGV INOUI") {
        logoHtml = '<img src="logo/inoui.svg" class="train-logo" alt="TGV Inoui">';
        textHtml = "TGV Inoui";
      }
      else if (commercialMode === "OUIGO" || commercialMode === "OUIGO TRAIN CLASSIQUE") {
        logoHtml = '<img src="logo/ouigo.svg" class="train-logo" alt="OUIGO">';
        textHtml = "OUIGO";
      }
      else if (commercialMode === "INTERCITES" || commercialMode === "INTERCITES DE NUIT") {
        logoHtml = '<img src="logo/intercites.svg" class="train-logo" alt="Intercités">';
        textHtml = "Intercités";
      }
      else if (commercialMode === "EUROSTAR") {
        logoHtml = '<img src="logo/eurostar.svg" class="train-logo" alt="Eurostar">';
        textHtml = "Eurostar";
      }
      else if (commercialMode === "DB SNCF") {
        logoHtml = '<img src="logo/dbsncf.svg" class="train-logo" alt="DB SNCF">';
        textHtml = "DB & SNCF";
      }
      else if (commercialMode === "BREIZHGO") {
        logoHtml = '<img src="logo/bretagne.svg" class="train-logo" alt="BreizhGo">';
        textHtml = "TER";
      }
      else if (commercialMode === "NOMAD") {
        logoHtml = '<img src="logo/nomad.svg" class="train-logo" alt="Nomad">';
        textHtml = "TER";
      }
      else if (commercialMode === "REGIONAURA") {
        logoHtml = '<img src="logo/ara.svg" class="train-logo" alt="TER AuRA">';
        textHtml = "TER";
      }
      else if (commercialMode === "ALEOP") {
        logoHtml = '<img src="logo/aleop.svg" class="train-logo" alt="ALÉOP">';
        textHtml = "TER";
      }
      else if (commercialMode === "LIO") {
        logoHtml = '<img src="logo/lio.svg" class="train-logo" alt="LiO">';
        textHtml = "TER";
      }
      else if (commercialMode === "REMI" || commercialMode === "REMI EXP") {
        logoHtml = '<img src="logo/remi.svg" class="train-logo" alt="Remi">';
        textHtml = "TER";
      }
      else if (commercialMode === "ZOU !") {
        logoHtml = '<img src="logo/zou.svg" class="train-logo" alt="Zou!">';
        textHtml = "TER";
      }
      else if (commercialMode === "FLUO") {
        logoHtml = '<img src="logo/fluo.svg" class="train-logo" alt="Fluo">';
        textHtml = "TER";
      }
      else if (commercialMode === "MOBIGO") {
        logoHtml = '<img src="logo/mobigo.svg" class="train-logo" alt="Mobigo">';
        textHtml = "TER";
      }
      else if (commercialMode === "TER HDF") {
        logoHtml = '<img src="logo/terhdf.svg" class="train-logo" alt="HDF">';
        textHtml = "TER";
      }
      else if (commercialMode === "TER NA") {
        logoHtml = '<img src="logo/na.svg" class="train-logo" alt="Nouvelle Aquitaine">';
        textHtml = "TER";
      }
      else if (commercialMode === "TER") {
        logoHtml = '<img src="logo/ter.svg" class="train-logo" alt="TER">';
        textHtml = "TER";
      }
      else if (commercialMode === "RER") {
        logoHtml = '<img src="logo/rer.svg" class="train-logo" alt="RER">';
        textHtml = "RER";
      }
      else if (commercialMode === "TRANSILIEN") {
        logoHtml = '<img src="logo/transilien.svg" class="train-logo" alt="Transilien">';
        textHtml = "Transilien";
      }
      else {
        textHtml = info.commercial_mode || "Autre";
      }
      return { logoHtml, textHtml };
    }

    const { logoHtml, textHtml } = getTrainLogo(info);

    const rowClass = index % 2 === 0 ? "train-row row-light" : "train-row row-dark";
    const clickableClass = vehicleJourneyId ? "clickable-train-row" : "";
    const vehicleAttr = vehicleJourneyId ? `data-vehicle-journey-id="${vehicleJourneyId}"` : "";

    return `
      <div class="${rowClass} ${clickableClass}" ${vehicleAttr}>
        <div class="col-line"><span class="line-badge" style="background-color:${color}">${escapeHtml(lineDisplay)}</span></div>
        <div class="col-mission">${escapeHtml(mission)}</div>
        <div class="col-destination">${escapeHtml(destination)}</div>
        <div class="col-time">${timeCell}</div>
        <div class="col-type">${logoHtml} <span class="train-logo-text">${textHtml}</span></div>
      </div>
    `;
  }).join("");

  // Добавляем кликабельность для поездов
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
