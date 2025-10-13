const API_KEY = "e41a2be9-7450-4f1a-a7e6-eb429950186f";

// Get vehicle_journey ID from URL
function getVehicleJourneyIdFromURL() {
    const search = window.location.search;
    if (!search) return null;
    
    // Remove the '?' and get the vehicleJourneyId
    let vehicleJourneyId = search.substring(1);
    
    // Decode the URL component
    vehicleJourneyId = decodeURIComponent(vehicleJourneyId);
    
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

function formatTimeFromNavitia(ts) {
    if (!ts || ts.length < 13) return "--:--";
    return ts.slice(9, 11) + ":" + ts.slice(11, 13);
}

function parseHHMMfromNavitia(ts) {
    if (!ts || ts.length < 13) return null;
    const hh = parseInt(ts.slice(9, 11), 10);
    const mm = parseInt(ts.slice(11, 13), 10);
    return (hh % 24) * 60 + (mm % 60);
}

function getDelayStatus(baseTime, actualTime) {
    if (!baseTime || !actualTime) return { status: 'unknown', delay: 0 };
    
    const baseMinutes = parseHHMMfromNavitia(baseTime);
    const actualMinutes = parseHHMMfromNavitia(actualTime);
    
    if (baseMinutes === null || actualMinutes === null) return { status: 'unknown', delay: 0 };
    
    let delay = actualMinutes - baseMinutes;
    // Handle overnight trips
    if (delay < -12 * 60) delay += 24 * 60;
    if (delay > 12 * 60) delay -= 24 * 60;
    
    if (delay === 0) return { status: 'on-time', delay: 0 };
    if (delay > 0) return { status: 'delayed', delay };
    if (delay < 0) return { status: 'early', delay: Math.abs(delay) };
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
        // Use vehicle_journeys endpoint instead of trips
        const vehicleJourneyUrl = `https://api.sncf.com/v1/coverage/sncf/vehicle_journeys/${encodeURIComponent(vehicleJourneyId)}`;
        const vehicleJourneyRes = await fetch(vehicleJourneyUrl, {
            headers: { Authorization: "Basic " + btoa(API_KEY + ":") }
        });

        if (!vehicleJourneyRes.ok) {
            throw new Error(`Erreur API: ${vehicleJourneyRes.status}`);
        }

        const vehicleJourneyData = await vehicleJourneyRes.json();
        const vehicleJourney = vehicleJourneyData.vehicle_journeys?.[0];

        if (!vehicleJourney) {
            throw new Error('Vehicle journey non trouvé');
        }

        // Get route schedules for stop times
        const schedulesUrl = `https://api.sncf.com/v1/coverage/sncf/vehicle_journeys/${encodeURIComponent(vehicleJourneyId)}/route_schedules?count=100`;
        const schedulesRes = await fetch(schedulesUrl, {
            headers: { Authorization: "Basic " + btoa(API_KEY + ":") }
        });

        if (!schedulesRes.ok) {
            throw new Error(`Erreur API horaires: ${schedulesRes.status}`);
        }

        const schedulesData = await schedulesRes.json();
        
        displayVehicleJourneyInfo(vehicleJourney, schedulesData);
    } catch (error) {
        console.error('Error fetching vehicle journey details:', error);
        showError(error.message);
    }
}

function displayVehicleJourneyInfo(vehicleJourney, schedulesData) {
    // Basic vehicle journey info
    const name = vehicleJourney.name || 'Train sans nom';
    const number = vehicleJourney.code || '--';
    const commercialMode = vehicleJourney.commercial_mode?.name || 'Train';
    
    tripNumberElement.textContent = number;
    tripNameElement.textContent = name;
    tripTypeElement.textContent = commercialMode;

    // Try to get coach information
    if (vehicleJourney.codes) {
        const coachCountCode = vehicleJourney.codes.find(c => c.type === 'coach_count');
        if (coachCountCode) {
            coachInfoElement.textContent = `${coachCountCode.value} voitures`;
        } else {
            coachInfoElement.textContent = 'Info voitures non disponible';
        }
    } else {
        coachInfoElement.textContent = 'Info voitures non disponible';
    }

    // Process stop times
    const stopTimes = processStopTimes(schedulesData);
    displayStopTimes(stopTimes);
    updateOverallStatus(stopTimes);
    
    // Set route info
    if (stopTimes.length >= 2) {
        const origin = stopTimes[0].stopName;
        const destination = stopTimes[stopTimes.length - 1].stopName;
        tripRouteElement.textContent = `${origin} → ${destination}`;
    }
}

function processStopTimes(schedulesData) {
    const stopTimes = [];
    const routeSchedule = schedulesData.route_schedules?.[0];
    
    if (!routeSchedule || !routeSchedule.table || !routeSchedule.table.rows) {
        return stopTimes;
    }

    routeSchedule.table.rows.forEach(row => {
        const stopPoint = row.stop_point;
        const dateTimes = row.date_times?.[0];
        
        if (!stopPoint || !dateTimes) return;

        const stopName = stopPoint.name || stopPoint.label || 'Arrêt inconnu';
        const baseArrival = dateTimes.base_arrival_date_time;
        const baseDeparture = dateTimes.base_departure_date_time;
        const actualArrival = dateTimes.arrival_date_time;
        const actualDeparture = dateTimes.departure_date_time;
        
        const arrivalStatus = getDelayStatus(baseArrival, actualArrival);
        const departureStatus = getDelayStatus(baseDeparture, actualDeparture);
        
        stopTimes.push({
            stopName,
            baseArrival,
            baseDeparture,
            actualArrival,
            actualDeparture,
            arrivalStatus,
            departureStatus,
            platform: dateTimes.stop_point?.platform_code || '--'
        });
    });

    return stopTimes;
}

function displayStopTimes(stopTimes) {
    if (stopTimes.length === 0) {
        timelineStopsElement.innerHTML = '<div class="text-center py-4">Aucun horaire disponible</div>';
        return;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    let foundCurrent = false;
    
    timelineStopsElement.innerHTML = stopTimes.map((stop, index) => {
        const isFirst = index === 0;
        const isLast = index === stopTimes.length - 1;
        
        // Determine if this is the current stop
        let isCurrent = false;
        let markerClass = 'future';
        
        if (!foundCurrent) {
            const departureTime = parseHHMMfromNavitia(stop.actualDeparture || stop.baseDeparture);
            if (departureTime !== null && currentTime <= departureTime) {
                isCurrent = true;
                foundCurrent = true;
                markerClass = 'current';
            } else {
                markerClass = 'passed';
            }
        }
        
        const arrivalTime = formatTimeFromNavitia(stop.actualArrival || stop.baseArrival);
        const departureTime = formatTimeFromNavitia(stop.actualDeparture || stop.baseDeparture);
        
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
                                 <span class="${departureStatusClass}">${departureStatus}</span>`
                            }
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function updateOverallStatus(stopTimes) {
    if (stopTimes.length === 0) {
        statusBadgeElement.textContent = 'Information manquante';
        return;
    }

    // Find current or next stop
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    let currentStop = null;
    let nextStop = null;
    
    for (let i = 0; i < stopTimes.length; i++) {
        const stop = stopTimes[i];
        const departureTime = parseHHMMfromNavitia(stop.actualDeparture || stop.baseDeparture);
        
        if (departureTime !== null && currentTime <= departureTime) {
            nextStop = stop;
            if (i > 0) {
                currentStop = stopTimes[i - 1];
            }
            break;
        }
    }
    
    // Update status badge
    if (nextStop) {
        const status = nextStop.departureStatus.status;
        const delay = nextStop.departureStatus.delay;
        
        switch (status) {
            case 'on-time':
                statusBadgeElement.textContent = 'À l\'heure';
                statusBadgeElement.style.background = '#00b341';
                break;
            case 'delayed':
                statusBadgeElement.textContent = `Retardé (+${delay} min)`;
                statusBadgeElement.style.background = '#ff9500';
                break;
            case 'early':
                statusBadgeElement.textContent = `En avance (-${delay} min)`;
                statusBadgeElement.style.background = '#00b4ff';
                break;
            default:
                statusBadgeElement.textContent = 'En circulation';
                statusBadgeElement.style.background = '#0052a3';
        }
    } else {
        statusBadgeElement.textContent = 'Terminé';
        statusBadgeElement.style.background = '#666';
    }
    
    // Update next stop
    if (nextStop) {
        nextStopElement.textContent = nextStop.stopName;
    } else if (stopTimes.length > 0) {
        nextStopElement.textContent = 'Terminus - ' + stopTimes[stopTimes.length - 1].stopName;
    }
}

function showError(message) {
    timelineStopsElement.innerHTML = `
        <div class="text-center py-4">
            <div class="error-message" style="color: #ff6b6b; font-weight: 600;">
                ${escapeHtml(message)}
            </div>
            <button onclick="window.history.back()" class="btn btn-outline-light mt-3">
                Retour aux départs
            </button>
        </div>
    `;
}

// Initialize the page
if (vehicleJourneyId) {
    console.log("Loading vehicle journey details for:", vehicleJourneyId);
    fetchVehicleJourneyDetails(vehicleJourneyId);
} else {
    showError('Aucun identifiant de vehicle journey spécifié');
    console.log("No vehicle journey ID found in URL");
}
