const API_BASE_URL = 'http://localhost:5000/api';

let map;
let markers = {};
let binsData = {};
let currentPolyline = null;
let garbageMarkers = [];
let currentBinIndex = 0;
let selectedStartLocation = null;
let debounceTimer;

// ♻️ Real Garbage Centers
const GARBAGE_CENTERS = [
    { name: "Uruli Devachi Landfill - Pune", lat: 18.4621, lng: 73.9669 },
    { name: "PMC Shivajinagar Waste Hub - Pune", lat: 18.5226, lng: 73.8488 },
    { name: "Nashik Waste Management Plant", lat: 19.9929, lng: 73.7853 },
    { name: "Pathardi Compost Depot - Nashik", lat: 19.9570, lng: 73.7900 },
    { name: "Sinnar Waste Processing Site", lat: 20.0540, lng: 73.9460 }
];

document.addEventListener('DOMContentLoaded', function () {
    initMap();
    setupEventListeners();
    listenToBinsRealtime();
    setupLocationAutocomplete();
});

function initMap() {
    const puneCenter = [18.5204, 73.8567];
    map = L.map('map').setView(puneCenter, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    displayGarbageCenters();
}

// ================= Garbage Centers =================

function displayGarbageCenters() {
    garbageMarkers.forEach(marker => map.removeLayer(marker));
    garbageMarkers = [];

    GARBAGE_CENTERS.forEach(center => {
        const recycleIcon = L.divIcon({
            className: '',
            html: `
                <div style="
                    font-size:24px;
                    background:white;
                    border-radius:50%;
                    padding:6px;
                    box-shadow:0 0 6px rgba(0,0,0,0.4);
                ">♻️</div>
            `,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        const marker = L.marker([center.lat, center.lng], { icon: recycleIcon })
            .bindPopup(`<strong>Garbage Collection Center</strong><br>${center.name}`)
            .addTo(map);

        garbageMarkers.push(marker);
    });
}

// ================= Firebase Listener =================

function listenToBinsRealtime() {
    const binsRef = firebaseRef(firebaseDatabase, 'bins');

    firebaseOnValue(binsRef, (snapshot) => {
        const data = snapshot.val() || {};
        binsData = {};

        Object.keys(data).forEach(key => {
            binsData[key] = { ...data[key], binID: key };
        });

        updateDashboard();
    });
}

function updateDashboard() {
    let binsArray = Object.values(binsData);
    binsArray.sort((a, b) => (b.currentFillLevel || 0) - (a.currentFillLevel || 0));

    updateStatistics(binsArray);
    displayBinsOnMap(binsArray);
    displayBinsList(binsArray);
    populateBinDropdown(binsArray);
}

function updateStatistics(bins) {
    document.getElementById('totalBins').textContent = bins.length;
    document.getElementById('criticalBins').textContent =
        bins.filter(b => (b.currentFillLevel || 0) >= 80).length;
    document.getElementById('needsCollection').textContent =
        bins.filter(b => (b.currentFillLevel || 0) >= 70 && (b.currentFillLevel || 0) < 80).length;
    document.getElementById('normalBins').textContent =
        bins.filter(b => (b.currentFillLevel || 0) < 70).length;
}

// ================= BIN MARKERS =================

function displayBinsOnMap(bins) {

    Object.values(markers).forEach(marker => map.removeLayer(marker));
    markers = {};

    bins.forEach(bin => {

        if (!bin.location) return;

        const position = [bin.location.lat, bin.location.lng];

        let color = "#27ae60";
        if (bin.status === "critical") color = "#e74c3c";
        else if (bin.status === "needs_collection") color = "#f39c12";

        const icon = L.divIcon({
            className: '',
            html: `<div style="
                background:${color};
                width:22px;
                height:22px;
                border-radius:50%;
                border:3px solid white;
                box-shadow:0 0 8px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });

        const marker = L.marker(position, { icon })
            .bindPopup(`
                <strong>${bin.binName || "Unnamed Bin"}</strong><br>
                Status: ${bin.status}<br>
                Fill: ${bin.currentFillLevel || 0}%
            `)
            .addTo(map);

        markers[bin.binID] = marker;
    });
}

// ================= BIN LIST =================

function displayBinsList(bins) {
    const container = document.getElementById("binsList");

    if (!bins.length) {
        container.innerHTML = "<p>No bins found</p>";
        return;
    }

    container.innerHTML = bins.map(bin => {

        const fill = bin.currentFillLevel || 0;

        let barColor = "#27ae60";
        if (fill >= 80) barColor = "#e74c3c";
        else if (fill >= 70) barColor = "#f39c12";

        return `
        <div class="bin-item">
            <div class="bin-header">
                <span class="bin-id">${bin.binName || "Unnamed Bin"}</span>
                <span class="bin-status">${bin.status}</span>
            </div>

            <p><strong>Fill Level:</strong> ${fill}%</p>

            <div style="
                width:100%;
                background:#eee;
                border-radius:10px;
                overflow:hidden;
                margin-bottom:10px;
            ">
                <div style="
                    width:${fill}%;
                    background:${barColor};
                    height:12px;
                    transition:0.5s;
                "></div>
            </div>

            <button class="btn btn-danger delete-btn" data-id="${bin.binID}">
                Delete
            </button>
        </div>
        `;
    }).join("");

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            deleteBin(this.getAttribute('data-id'));
        });
    });
}

async function deleteBin(binID) {
    if (!confirm("Are you sure you want to delete this bin?")) return;

    await fetch(`${API_BASE_URL}/bins/${binID}`, {
        method: 'DELETE'
    });
}

// ================= DROPDOWN =================

function populateBinDropdown(bins) {
    const dropdown = document.getElementById('sensorBinID');
    dropdown.innerHTML = '<option value="">-- Select Bin --</option>';

    bins.forEach(bin => {
        const option = document.createElement('option');
        option.value = bin.binID;
        option.textContent = bin.binName || "Unnamed Bin";
        dropdown.appendChild(option);
    });
}

// ================= ROUTE UTIL =================

function clearExistingRoute() {
    if (currentPolyline) {
        map.removeLayer(currentPolyline);
        currentPolyline = null;
    }
}

// ================= NORMAL ROUTE =================

async function generateRoute() {

    clearExistingRoute();

    try {

        const checkResponse = await fetch(`${API_BASE_URL}/optimize-route`);
        const checkResult = await checkResponse.json();

        if (!checkResult.success) {
            alert(checkResult.message);
            return;
        }

        let locationName;
        let startLat;
        let startLng;

        if (selectedStartLocation) {
            locationName = selectedStartLocation.name;
            startLat = selectedStartLocation.lat;
            startLng = selectedStartLocation.lng;
        } else {
            locationName = prompt("Enter Starting Location:");
            if (!locationName) return;

            const geo = await getCoordinatesFromLocation(locationName);
            if (!geo) return;

            startLat = geo.lat;
            startLng = geo.lng;
        }

        const response = await fetch(
            `${API_BASE_URL}/optimize-route?startLat=${startLat}&startLng=${startLng}&startName=${encodeURIComponent(locationName)}`
        );

        const result = await response.json();
        if (!result.success) {
            alert(result.message);
            return;
        }

        drawOptimizedRoute(result.route);

    } catch (error) {
        console.error(error);
        alert("Server error while optimizing route");
    }
}

// ================= CHANGE ROUTE (UPDATED) =================

async function changeRoute() {

    clearExistingRoute();

    try {

        let locationName;
        let startLat;
        let startLng;

        if (selectedStartLocation) {
            locationName = selectedStartLocation.name;
            startLat = selectedStartLocation.lat;
            startLng = selectedStartLocation.lng;
        } else {
            locationName = prompt("Enter Current Truck Location:");
            if (!locationName) return;

            const geo = await getCoordinatesFromLocation(locationName);
            if (!geo) return;

            startLat = geo.lat;
            startLng = geo.lng;
        }

        const response = await fetch(
            `${API_BASE_URL}/optimize-route?startLat=${startLat}&startLng=${startLng}&startName=${encodeURIComponent(locationName)}`
        );

        const result = await response.json();
        if (!result.success) {
            alert(result.message);
            return;
        }

        drawOptimizedRoute(result.route);
        alert("Route Re-Optimized Successfully!");

    } catch (error) {
        console.error(error);
        alert("Server error while re-optimizing route");
    }
}

// ================= TRUCK FULL (UPDATED) =================

async function truckFullRoute() {

    clearExistingRoute();

    try {

        let locationName;
        let startLat;
        let startLng;

        if (selectedStartLocation) {
            locationName = selectedStartLocation.name;
            startLat = selectedStartLocation.lat;
            startLng = selectedStartLocation.lng;
        } else {
            locationName = prompt("Enter Truck Current Location:");
            if (!locationName) return;

            const geo = await getCoordinatesFromLocation(locationName);
            if (!geo) return;

            startLat = geo.lat;
            startLng = geo.lng;
        }

        const response = await fetch(
            `${API_BASE_URL}/truck-full-route?lat=${startLat}&lng=${startLng}&name=${encodeURIComponent(locationName)}`
        );

        const result = await response.json();
        if (!result.success) {
            alert(result.message);
            return;
        }

        drawOptimizedRoute(result.route);

    } catch (error) {
        console.error(error);
        alert("Server error");
    }
}

// ================= OSRM =================

async function drawOptimizedRoute(routeBins) {

    const coordinates = routeBins
        .filter(bin => bin.location)
        .map(bin => `${bin.location.lng},${bin.location.lat}`)
        .join(";");

    const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`
    );

    const data = await response.json();

    if (!data.routes || !data.routes.length) {
        alert("Road route not found");
        return;
    }

    // ✅ KEEPING YOUR ORIGINAL LOGIC
    const routeGeo = data.routes[0].geometry;

    currentPolyline = L.geoJSON(routeGeo, {
        style: { color: "blue", weight: 5 }
    }).addTo(map);

    map.fitBounds(currentPolyline.getBounds());

    // ===============================
    // 🔥 ADDED: ROUTE SUMMARY UPDATE
    // ===============================

    try {

        const route = data.routes[0];

        const distanceKm = (route.distance / 1000).toFixed(2);
        const timeMin = Math.ceil(route.duration / 60);

        // Exclude depot if present
        const binsToCollect = routeBins.filter(b => b.binID !== "DEPOT").length;

        // Basic estimation formulas
        const fuelUsed = (distanceKm / 8).toFixed(2);   // 8 km per liter
        const co2 = (fuelUsed * 2.68).toFixed(2);       // Diesel emission factor

        document.getElementById("routeBins").textContent = binsToCollect;
        document.getElementById("routeDistance").textContent = distanceKm + " km";
        document.getElementById("routeTime").textContent = timeMin + " min";
        document.getElementById("routeFuel").textContent = fuelUsed + " L";
        document.getElementById("routeCO2").textContent = co2 + " kg";

    } catch (err) {
        console.error("Route summary update error:", err);
    }
}

// ================= FIND BIN =================

function findNextBin() {
    const binsArray = Object.values(binsData);
    if (!binsArray.length) {
        alert("No bins available");
        return;
    }

    binsArray.sort((a, b) =>
        (a.binName || "").localeCompare(b.binName || "")
    );

    const bin = binsArray[currentBinIndex];
    if (!bin.location) return;

    map.setView([bin.location.lat, bin.location.lng], 17);

    L.popup()
        .setLatLng([bin.location.lat, bin.location.lng])
        .setContent(`
            <strong>${bin.binName}</strong><br>
            Status: ${bin.status}<br>
            Fill: ${bin.currentFillLevel || 0}%
        `)
        .openOn(map);

    currentBinIndex++;
    if (currentBinIndex >= binsArray.length) currentBinIndex = 0;
}

// ================= EVENT LISTENERS =================

function setupEventListeners() {

    // ================= ADD BIN FORM (FIXED) =================
    const addForm = document.getElementById('addBinForm');
    if (addForm) {
        addForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const binName = document.getElementById('binName')?.value;
            const latitude = parseFloat(document.getElementById('latitude')?.value);
            const longitude = parseFloat(document.getElementById('longitude')?.value);
            const address = document.getElementById('address')?.value;
            const capacity = parseInt(document.getElementById('capacity')?.value);

            if (!binName || isNaN(latitude) || isNaN(longitude) || !address || isNaN(capacity)) {
                alert("Please fill all fields correctly.");
                return;
            }

            await fetch(`${API_BASE_URL}/bins`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    binName: binName,
                    location: {
                        lat: latitude,
                        lng: longitude
                    },
                    address: address,
                    capacity: capacity
                })
            });

            this.reset();
        });
    }

    // ================= EXISTING BUTTONS (UNCHANGED) =================
    document.getElementById('findBinBtn')?.addEventListener('click', findNextBin);
    document.getElementById('generateRouteBtn')?.addEventListener('click', generateRoute);
    document.getElementById('truckFullBtn')?.addEventListener('click', truckFullRoute);
    document.getElementById('changeRouteBtn')?.addEventListener('click', changeRoute);

    // ================= SENSOR FORM (UNCHANGED) =================
    const sensorForm = document.getElementById('simulateSensorForm');
    if (sensorForm) {
        sensorForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const binID = document.getElementById('sensorBinID').value;
            const fillLevel = parseInt(document.getElementById('fillLevel').value);

            if (!binID) {
                alert("Please select a bin");
                return;
            }

            if (isNaN(fillLevel) || fillLevel < 0 || fillLevel > 100) {
                alert("Fill level must be between 0 and 100");
                return;
            }

            await fetch(`${API_BASE_URL}/sensor-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    binID: binID,
                    fillLevel: fillLevel
                })
            });

            this.reset();
        });
    }
}

// ================= AUTOCOMPLETE =================

function setupLocationAutocomplete() {

    const input = document.getElementById('startLocationInput');
    const suggestionsBox = document.getElementById('locationSuggestions');

    if (!input || !suggestionsBox) return;

    input.addEventListener('input', function () {

        const query = input.value.trim();
        selectedStartLocation = null;

        if (query.length < 3) {
            suggestionsBox.style.display = "none";
            return;
        }

        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(async () => {

            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(query)}`
                );

                const data = await response.json();
                suggestionsBox.innerHTML = "";

                if (!data.length) {
                    suggestionsBox.style.display = "none";
                    return;
                }

                data.slice(0, 5).forEach(place => {

                    const item = document.createElement('div');
                    item.style.padding = "8px";
                    item.style.cursor = "pointer";
                    item.style.borderBottom = "1px solid #eee";
                    item.textContent = place.display_name;

                    item.addEventListener('click', function () {

                        input.value = place.display_name;

                        selectedStartLocation = {
                            name: place.display_name,
                            lat: parseFloat(place.lat),
                            lng: parseFloat(place.lon)
                        };

                        suggestionsBox.style.display = "none";
                    });

                    suggestionsBox.appendChild(item);
                });

                suggestionsBox.style.display = "block";

            } catch (error) {
                console.error("Autocomplete error:", error);
            }

        }, 500);

    });

    document.addEventListener('click', function (e) {
        if (!input.contains(e.target)) {
            suggestionsBox.style.display = "none";
        }
    });
}

// ================= GEO HELPER =================

async function getCoordinatesFromLocation(locationName) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(locationName)}`
        );

        const data = await response.json();

        if (!data.length) {
            alert("Location not found");
            return null;
        }

        return {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon)
        };

    } catch (error) {
        console.error("Geocoding error:", error);
        alert("Error fetching location coordinates");
        return null;
    }
}