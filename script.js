const API_KEY = "e41a2be9-7450-4f1a-a7e6-eb429950186f";
const stationInput = document.getElementById("stationSearch");
const suggestionsBox = document.getElementById("suggestions");
const boardBody = document.getElementById("board-body");
const trainTypeSelect = document.getElementById("trainType");
const refreshBtn = document.getElementById("refreshBtn");

let currentStation = null;
let lastDepartures = [];

// Utility functions
function escapeHtml(s = "") {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatTimeFromNavitia(ts) {
    if (!ts || ts.length < 13) return "—";
    return ts.slice(9, 11) + "h" + ts.slice(11, 13);
}

function parseHHMMfromNavitia(ts) {
    if (!ts || ts.length < 13) return null;
    const hh = parseInt(ts.slice(9, 11), 10);
    const mm = parseInt(ts.slice(11, 13), 10);
    return (hh % 24) * 60 + (mm % 60);
}

// Station search
async function searchStations(q) {
    if (!q || q.trim().length < 2) return [];
    const url = `https://api.sncf.com/v1/coverage/sncf/places?q=${encodeURIComponent(q)}&type[]=stop_area&count=50`;
    try {
        const res = await fetch(url, { headers: { Authorization: "Basic " + btoa(API_KEY + ":") } });
        if (!res.ok) return [];
        const json = await res.json();
        return (json.places || []).map(p => ({ id: p.id, label: p.stop_area?.label || p.name || p.id }));
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

// Render board with clickable rows
function renderBoard(departures) {
    const typeFilter = trainTypeSelect.value;
    
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
        
        // CORRECTED: Get the vehicle_journey ID from the API
        let vehicleJourneyId = null;
        
        // Method 1: From vehicle_journey object
        if (dep.vehicle_journey && dep.vehicle_journey.id) {
            vehicleJourneyId = dep.vehicle_journey.id;
        }
        // Method 2: From links array
        else if (dep.links) {
            const vehicleJourneyLink = dep.links.find(link => link.type === "vehicle_journey");
            vehicleJourneyId = vehicleJourneyLink ? vehicleJourneyLink.id : null;
        }
        
        console.log("Departure:", dep); // Debug log
        console.log("Extracted vehicleJourneyId:", vehicleJourneyId); // Debug log

        const mission = info.headsign || info.code || info.trip_short_name || info.name || info.label || "—";
        const line = info.code || "?";
        const lineDisplay = line === "?" ? (info.commercial_mode || "—") : line;
        const destination = info.direction || (dep.terminus && dep.terminus.name) || "—";
        const color = info.color ? ("#" + info.color) : "#0052a3";
        const canceled = info.status && info.status.toLowerCase().includes("cancelled");

        // Time calculation
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
            const baseMinutes = parseHHMMfromNavitia(baseTs);
            newDisplay = baseMinutes !== null ? 
                `${String(Math.floor((baseMinutes + delayM) / 60)).padStart(2, '0')}h${String((baseMinutes + delayM) % 60).padStart(2, '0')}` : 
                formatTimeFromNavitia(realTs || baseTs);
        } else {
            delayed = false;
            originalDisplay = formatTimeFromNavitia(realTs || baseTs);
            newDisplay = null;
        }

        // Train type and logo
        const commercial = (info.commercial_mode || info.physical_mode || "").toString();
        const trainType = commercial || "Autre";
        
        let logoHtml = "", textHtml = "";
        if (trainType.toUpperCase().includes("TER")) {
            logoHtml = '<img src="logo/ter.svg" class="train-logo" alt="TER">';
            textHtml = '<span class="train-logo-text">TER</span>';
        } else if (trainType.toUpperCase().includes("TGV") && info.commercial_mode?.toUpperCase().includes("INOU")) {
            logoHtml = '<img src="logo/inoui.svg" class="train-logo" alt="Inoui">';
            textHtml = 'TGV Inoui';
        } else if (trainType.toUpperCase().includes("TGV") && info.commercial_mode?.toUpperCase().includes("OUI")) {
            logoHtml = '<img src="logo/ouigo.svg" class="train-logo" alt="Ouigo">';
            textHtml = 'TGV Ouigo';
        } else if (trainType.toUpperCase().includes("INTER")) {
            logoHtml = '<img src="logo/intercite.svg" class="train-logo" alt="Intercités">';
            textHtml = 'Intercités';
        } else if (trainType.toUpperCase().includes("RER")) {
            logoHtml = '<img src="logo/rer.svg" class="train-logo" alt="RER">';
            textHtml = 'RER';
        } else if (trainType.toUpperCase().includes("TRANS")) {
            logoHtml = '<img src="logo/transilien.svg" class="train-logo" alt="Transilien">';
            textHtml = 'Transilien';
        } else {
            textHtml = escapeHtml(trainType);
        }

        const timeCell = canceled ? 
            `<span class="canceled-time">${originalDisplay || "—"}</span>` :
            delayed ? 
                `<span class="original-time">${originalDisplay}</span><span class="delayed-time">${newDisplay}</span>` :
                `<span class="on-time">${originalDisplay}</span>`;

        const typeCell = logoHtml ? 
            `<div class="col-type">${logoHtml} ${textHtml}</div>` :
            `<div class="col-type">${textHtml}</div>`;

        const rowClass = index % 2 === 0 ? "train-row row-light" : "train-row row-dark";
        const clickableClass = vehicleJourneyId ? "clickable-train-row" : "";

        // Add data-vehicle-journey-id only if vehicleJourneyId exists
        const vehicleJourneyIdAttr = vehicleJourneyId ? `data-vehicle-journey-id="${vehicleJourneyId}"` : '';

        return `
            <div class="${rowClass} ${clickableClass}" ${vehicleJourneyIdAttr}>
                <div class="col-line"><span class="line-badge" style="background-color:${color}">${escapeHtml(lineDisplay)}</span></div>
                <div class="col-mission">${escapeHtml(mission)}</div>
                <div class="col-destination">${escapeHtml(destination)}</div>
                <div class="col-time"><div class="time-with-delay">${timeCell}</div></div>
                ${typeCell}
            </div>
        `;
    }).join("");

    // Add click event listeners - SIMPLE AND RELIABLE APPROACH
    const clickableRows = document.querySelectorAll('.clickable-train-row');
    clickableRows.forEach(row => {
        row.addEventListener('click', function() {
            const vehicleJourneyId = this.getAttribute('data-vehicle-journey-id');
            if (vehicleJourneyId) {
                // Use encodeURIComponent for proper URL encoding
                const encodedId = encodeURIComponent(vehicleJourneyId);
                window.location.href = `trip?${encodedId}`;
            }
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
    suggestionsBox.innerHTML = results.length ? 
        results.map(r => `<div class="suggestion-item" data-id="${r.id}">${r.label}</div>`).join("") : 
        '<div class="suggestion-empty">Aucun résultat</div>';
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
    if (lastDepartures.length > 0) {
        renderBoard(lastDepartures);
    }
});
