const API_PROXY = "https://api.dmytrothemir.workers.dev";

// Get vehicle_journey ID from URL
function getVehicleJourneyIdFromURL() {
    const search = window.location.search;
    if (!search) return null;
    const vehicleJourneyId = search.substring(1); // Remove '?'
    console.log("Raw vehicle_journey ID from URL:", vehicleJourneyId);
    return vehicleJourneyId;
}

const vehicleJourneyId = getVehicleJourneyIdFromURL();

// DOM elements
const tripNumberElement = document.getElementById('tripNumber');
const tripNameElement = document.getElementById('tripName');
const tripRouteElement = document.getElementById('tripRoute');
const tripTypeElement = document.getElementById('tripType');
const coachInfoElement = document.getElementById('coachInfo');
const timelineStopsElement = document.getElementById('timelineStops');
const statusBadgeElement = document.getElementById('statusBadge');
const nextStopElement = document.getElementById('nextStop');

// Utility functions
function escapeHtml(s = "") {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// HHMMSS → HH:MM
function formatTimeFromHHMMSS(ts) {
    if (!ts || ts.length < 6) return "--:--";
    const hh = ts.slice(0,2);
    const mm = ts.slice(2,4);
    return `${hh}:${mm}`;
}

// HHMMSS → minutes since midnight
function parseHHMMfromHHMMSS(ts) {
    if (!ts || ts.length < 6) return null;
    const hh = parseInt(ts.slice(0,2), 10);
    const mm = parseInt(ts.slice(2,4), 10);
    return hh * 60 + mm;
}

// Calculate delay
function getDelayStatus(baseTime, actualTime) {
    if (!baseTime || !actualTime) return { status: 'unknown', delay: 0 };
    const baseMinutes = parseHHMMfromHHMMSS(baseTime);
    const actualMinutes = parseHHMMfromHHMMSS(actualTime);
    if (baseMinutes === null || actualMinutes === null) return { status: 'unknown', delay: 0 };

    let delay = actualMinutes - baseMinutes;
    if (delay < -12 * 60) delay += 24 * 60;
    if (delay > 12 * 60) delay -= 24 * 60;

    if (delay === 0) return { status: 'on-time', delay: 0 };
    if (delay > 0) return { status: 'delayed', delay };
    return { status: 'early', delay: Math.abs(delay) };
}

function getStatusText(status, delay) {
    switch (status) {
        case 'on-time': return 'À l\'heure';
        case 'delayed': return `+${delay} min`;
        case 'early': return `-${delay} min`;
        case 'canceled': return 'Supprimé';
        default: return 'Information manquante';
    }
}

function getStatusClass(status) {
    switch (status) {
        case 'on-time': return 'status-on-time';
        case 'delayed': return 'status-delayed';
        case 'early': return 'status-early';
        case 'canceled': return 'status-canceled';
        default: return '';
    }
}

// Fetch vehicle journey details
async function fetchVehicleJourneyDetails(vehicleJourneyId) {
    if (!vehicleJourneyId) {
        showError('ID de vehicle journey manquant');
        return;
    }

    try {
        console.log("Fetching vehicle journey details for:", vehicleJourneyId);

        // Proxy URL, no encoding
        const vehicleJourneyUrl = `${API_PROXY}?id=${vehicleJourneyId}`;
        console.log("Proxy API URL:", vehicleJourneyUrl);

        const vehicleJourneyRes = await fetch(vehicleJourneyUrl);
        if (!vehicleJourneyRes.ok) {
            throw new Error(`Erreur API: ${vehicleJourneyRes.status} - ${await vehicleJourneyRes.text()}`);
        }

        const vehicleJourneyData = await vehicleJourneyRes.json();
        const vehicleJourney = vehicleJourneyData.vehicle_journeys?.[0];

        if (!vehicleJourney) {
            throw new Error('Vehicle journey non trouvé');
        }

        console.log("Found vehicle journey:", vehicleJourney);

        // Display stops directly from vehicle_journey object
        displayVehicleJourneyInfo(vehicleJourney, vehicleJourney);
    } catch (error) {
        console.error('Error fetching vehicle journey details:', error);
        showError(error.message);
    }
}

// Display info
function displayVehicleJourneyInfo(vehicleJourney, stopTimesData) {
    const name = vehicleJourney.name || 'Train sans nom';
    const number = vehicleJourney.code || vehicleJourney.name || '--';
    const commercialMode = vehicleJourney.commercial_mode?.name || 'Train';

    tripNumberElement.textContent = number;
    tripNameElement.textContent = name;
    tripTypeElement.textContent = commercialMode;

    if (vehicleJourney.codes) {
        const coachCountCode = vehicleJourney.codes.find(c => c.type === 'coach_count');
        coachInfoElement.textContent = coachCountCode ? `${coachCountCode.value} voitures` : 'Info voitures non disponible';
    } else {
        coachInfoElement.textContent = 'Info voitures non disponible';
    }

    const stopTimes = processStopTimes(vehicleJourney.stop_times || []);
    displayStopTimes(stopTimes);
    updateOverallStatus(stopTimes);

    if (stopTimes.length >= 2) {
        tripRouteElement.textContent = `${stopTimes[0].stopName} → ${stopTimes[stopTimes.length-1].stopName}`;
    }
}

// Process stop_times array
function processStopTimes(stopTimesArray) {
    return stopTimesArray.map(stopTime => {
        const stopPoint = stopTime.stop_point || {};
        const stopName = stopPoint.name || stopPoint.label || 'Arrêt inconnu';
        const baseArrival = stopTime.arrival_time;
        const baseDeparture = stopTime.departure_time;
        const actualArrival = baseArrival; // No separate realtime for now
        const actualDeparture = baseDeparture;

        return {
            stopName,
            baseArrival,
            baseDeparture,
            actualArrival,
            actualDeparture,
            arrivalStatus: getDelayStatus(baseArrival, actualArrival),
            departureStatus: getDelayStatus(baseDeparture, actualDeparture),
            platform: stopPoint.platform_code || '--'
        };
    });
}

// Display stops in DOM
function displayStopTimes(stopTimes) {
    if (!stopTimes.length) {
        timelineStopsElement.innerHTML = '<div class="text-center py-4">Aucun horaire disponible</div>';
        return;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    let foundCurrent = false;

    timelineStopsElement.innerHTML = stopTimes.map((stop, index) => {
        const isFirst = index === 0;
        const isLast = index === stopTimes.length - 1;

        let isCurrent = false;
        let markerClass = 'future';

        if (!foundCurrent) {
            const departureTime = parseHHMMfromHHMMSS(stop.actualDeparture || stop.baseDeparture);
            if (departureTime !== null && currentTime <= departureTime) {
                isCurrent = true;
                foundCurrent = true;
                markerClass = 'current';
            } else {
                markerClass = 'passed';
            }
        }

        const arrivalTime = formatTimeFromHHMMSS(stop.actualArrival || stop.baseArrival);
        const departureTime = formatTimeFromHHMMSS(stop.actualDeparture || stop.baseDeparture);

        const arrivalStatus = getStatusText(stop.arrivalStatus.status, stop.arrivalStatus.delay);
        const departureStatus = getStatusText(stop.departureStatus.status, stop.departureStatus.delay);
        const arrivalStatusClass = getStatusClass(stop.arrivalStatus.status);
        const departureStatusClass = getStatusClass(stop.departureStatus.status);

        return `
            <div class="timeline-stop">
                <div class="stop-marker ${markerClass}"></div>
                <div class="stop-content ${isCurrent ? 'current' : ''}">
                    <div class="stop-header">
                        <div class="stop-name">${escapeHtml(stop.stopName)}</div>
                        <div class="stop-time">
                            ${isFirst ? `Départ: ${departureTime}` : 
                              isLast ? `Arrivée: ${arrivalTime}` :
                              `${arrivalTime} - ${departureTime}`}
                        </div>
                    </div>
                    <div class="stop-details">
                        <div class="stop-platform">Voie ${stop.platform}</div>
                        <div class="stop-status">
                            ${isFirst ? 
                                `<span class="${departureStatusClass}">${departureStatus}</span>` :
                              isLast ?
                                `<span class="${arrivalStatusClass}">${arrivalStatus}</span>` :
                                `<span class="${arrivalStatusClass}">${arrivalStatus}</span> / 
                                 <span class="${departureStatusClass}">${departureStatus}</span>`}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Update status badge
function updateOverallStatus(stopTimes) {
    if (!stopTimes.length) {
        statusBadgeElement.textContent = 'Information manquante';
        return;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    let nextStop = null;

    for (let stop of stopTimes) {
        const depTime = parseHHMMfromHHMMSS(stop.actualDeparture || stop.baseDeparture);
        if (depTime !== null && depTime >= currentTime) {
            nextStop = stop;
            break;
        }
    }

    if (nextStop) {
        nextStopElement.textContent = `Prochain arrêt: ${nextStop.stopName} (${formatTimeFromHHMMSS(nextStop.actualDeparture || nextStop.baseDeparture)})`;
    } else {
        nextStopElement.textContent = 'Fin du trajet';
    }
}

// Show error
function showError(msg) {
    timelineStopsElement.innerHTML = `<div class="text-center py-4 text-red-500 font-bold">${escapeHtml(msg)}</div>`;
}

// Start
fetchVehicleJourneyDetails(vehicleJourneyId);
