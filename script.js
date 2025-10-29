const API_KEY = "e41a2be9-7450-4f1a-a7e6-eb429950186f";
const stationInput = document.getElementById("stationSearch");
const suggestionsBox = document.getElementById("suggestions");
const boardBody = document.getElementById("board-body");
const trainTypeSelect = document.getElementById("trainType");
const refreshBtn = document.getElementById("refreshBtn");

let currentStation = null;
let lastDepartures = [];

// Utility
function escapeHtml(s = "") {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatTimeFromNavitia(ts) {
    if (!ts || ts.length < 13) return "—";
    return ts.slice(9, 11) + "h" + ts.slice(11, 13);
}

// Search station
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
    } catch (e) {
        console.error(e);
        return [];
    }
}

// Fetch departures
async function fetchDepartures(stopId) {
    if (!stopId) return;
    const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0];
    const url = `https://api.sncf.com/v1/coverage/sncf/stop_areas/${encodeURIComponent(stopId)}/departures?datetime=${now}&count=200`;

    try {
        const res = await fetch(url, { headers: { Authorization: "Basic " + btoa(API_KEY + ":") } });
        if (!res.ok) {
            boardBody.innerHTML = `<div class="no-data">Erreur API: ${res.status}</div>`;
            return;
        }
        const json = await res.json();
        lastDepartures = json.departures || [];
        renderBoard(lastDepartures);
    } catch (e) {
        console.error(e);
        boardBody.innerHTML = `<div class="no-data">Erreur de connexion</div>`;
    }
}

// Render departures board
function renderBoard(departures) {
    const typeFilter = trainTypeSelect.value;
    const isMobile = window.innerWidth < 768;

    if (!departures.length) {
        boardBody.innerHTML = `<div class="no-data">Aucun départ trouvé</div>`;
        return;
    }

    const filteredDepartures = departures.filter(dep => {
        if (typeFilter === "all") return true;
        const commercial = (dep.display_informations?.commercial_mode || "").toString();
        return commercial && commercial.toUpperCase().includes(typeFilter.toUpperCase());
    });

    if (!filteredDepartures.length) {
        boardBody.innerHTML = `<div class="no-data">Aucun départ après filtrage</div>`;
        return;
    }

    boardBody.innerHTML = filteredDepartures.map((dep, index) => {
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

        // Clean destination for mobile (remove parentheses)
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
        const trainMode = (info.commercial_mode || info.physical_mode || info.network || "").toUpperCase();
        let logoHtml = "", textHtml = "";

        if (trainMode.includes("TER")) {
            logoHtml = '<img src="logo/ter.svg" class="train-logo" alt="TER">';
            textHtml = '<span class="train-logo-text">TER</span>';
        } else if (trainMode.includes("INOUI")) {
            logoHtml = '<img src="logo/inoui.svg" class="train-logo" alt="TGV Inoui">';
            textHtml = '<span class="train-logo-text">TGV Inoui</span>';
        } else if (trainMode.includes("OUIGO") || trainMode.includes("CLASSIQUE")) {
            logoHtml = '<img src="logo/ouigo.svg" class="train-logo" alt="Ouigo">';
            textHtml = '<span class="train-logo-text">TGV Ouigo</span>';
        } else if (trainMode.includes("INTERCIT")) {
            logoHtml = '<img src="logo/intercites.svg" class="train-logo" alt="Intercités">';
            textHtml = '<span class="train-logo-text">Intercités</span>';
        } else if (trainMode.includes("TRANS")) {
            logoHtml = '<img src="logo/transilien.svg" class="train-logo" alt="Transilien">';
            textHtml = '<span class="train-logo-text">Transilien</span>';
        } else if (trainMode.includes("RER")) {
            logoHtml = '<img src="logo/rer.svg" class="train-logo" alt="RER">';
            textHtml = '<span class="train-logo-text">RER</span>';
        } else if (trainMode.includes("DB")) {
            logoHtml = '<img src="logo/dbsncf.svg" class="train-logo" alt="DB SNCF">';
            textHtml = '<span class="train-logo-text">DB-SNCF</span>';
        } else if (trainMode.includes("EUROSTAR")) {
            logoHtml = '<img src="logo/eurostar.svg" class="train-logo" alt="Eurostar">';
            textHtml = '<span class="train-logo-text">Eurostar</span>';
        } else {
            textHtml = `<span class="train-logo-text">${escapeHtml(info.commercial_mode || "Autre")}</span>`;
        }

        const timeCell = canceled
            ? `<span class="canceled-time">${originalDisplay || "—"}</span>`
            : delayed
                ? `<span class="original-time">${originalDisplay}</span><span class="delayed-time">${newDisplay}</span>`
                : `<span class="on-time">${originalDisplay}</span>`;

        const rowClass = index % 2 === 0 ? "train-row row-light" : "train-row row-dark";
        const clickableClass = vehicleJourneyId ? "clickable-train-row" : "";
        const vehicleJourneyIdAttr = vehicleJourneyId ? `data-vehicle-journey-id="${vehicleJourneyId}"` : '';

        return `
            <div class="${rowClass} ${clickableClass}" ${vehicleJourneyIdAttr}>
                <div class="col-line"><span class="line-badge" style="background-color:${color}">${escapeHtml(lineDisplay)}</span></div>
                <div class="col-mission">${escapeHtml(mission)}</div>
                <div class="col-destination">${escapeHtml(destination)}</div>
                <div class="col-time"><div class="time-with-delay">${timeCell}</div></div>
                <div class="col-type">${logoHtml} ${textHtml}</div>
            </div>
        `;
    }).join("");

    // Make rows clickable
    document.querySelectorAll('.clickable-train-row').forEach(row => {
        const newRow = row.cloneNode(true);
        row.parentNode.replaceChild(newRow, row);
        newRow.addEventListener('click', function () {
            const vehicleJourneyId = this.getAttribute('data-vehicle-journey-id');
            if (vehicleJourneyId) window.location.href = `trip?${vehicleJourneyId}`;
        });
    });
}

// Event listeners
stationInput.addEventListener("input", async (e) => {
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

suggestionsBox.addEventListener("click", (e) => {
    const target = e.target.closest(".suggestion-item");
    if (!target) return;
    const id = target.dataset.id;
    const label = target.textContent;
    stationInput.value = label;
    suggestionsBox.style.display = "none";
    currentStation = id;
    fetchDepartures(id);
});

refreshBtn.addEventListener("click", () => {
    if (currentStation) fetchDepartures(currentStation);
});

trainTypeSelect.addEventListener("change", () => {
    if (lastDepartures.length > 0) renderBoard(lastDepartures);
});
