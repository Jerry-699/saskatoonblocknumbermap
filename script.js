const SASKATOON = [52.1332, -106.67];

let map = L.map("map").setView(SASKATOON, 12);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
  maxZoom: 19
}).addTo(map);

let marker = null;
let accuracyCircle = null;
let dark = false;

let drawMode = false;
let drawPoints = [];
let drawLine = null;
let drawDots = [];

let recording = false;
let paused = false;
let watchId = null;
let recPoints = [];
let recLine = null;

let oldRouteLine = null;

function selectedColor() {
  return document.getElementById("color").value;
}

function setResult(text) {
  document.getElementById("result").innerHTML = text;
}

function toggleDark() {
  dark = !dark;
  document.body.classList.toggle("dark", dark);

  setResult(
    dark
      ? "Night mode ON. Map stays light so street names and house numbers stay readable."
      : "Night mode OFF."
  );
}

function distanceKm(points) {
  let total = 0;

  for (let i = 0; i < points.length - 1; i++) {
    total += points[i].distanceTo(points[i + 1]);
  }

  return total / 1000;
}

function blockRange(num) {
  num = parseInt(num);

  if (isNaN(num)) return "Block unknown";

  let start = Math.floor(num / 100) * 100;
  let end = start + 99;

  return `${start}-${end}`;
}

async function reverseGeocode(lat, lon) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&zoom=18`;

  const res = await fetch(url);
  const data = await res.json();

  const a = data.address || {};

  return {
    road: a.road || a.street || a.residential || a.pedestrian || "Street unknown",
    house: a.house_number || null
  };
}

async function checkBlock(lat, lon) {
  setResult("Checking block...");

  try {
    const info = await reverseGeocode(lat, lon);
    const block = info.house ? blockRange(info.house) : "Block unknown";

    setResult(
      `Street: ${info.road}<br>
       Block: ${block} ${info.road}<br>
       Address used: ${info.house || "Not found"}`
    );

    if (marker) map.removeLayer(marker);

    marker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: "labelBox",
        html: `${info.house || ""}<br>${block}<br>${info.road}`,
        iconSize: [160, 70],
        iconAnchor: [80, 35]
      })
    }).addTo(map);

    map.setView([lat, lon], 18);
  } catch {
    setResult("Address not found. Try tapping closer to the street.");
  }
}

function useMyLocation() {
  if (!navigator.geolocation) {
    alert("GPS is not supported on this phone/browser.");
    return;
  }

  setResult("Getting best GPS accuracy... wait 5–10 seconds.");

  let best = null;
  let tries = 0;

  const tempWatch = navigator.geolocation.watchPosition(
    pos => {
      tries++;

      if (!best || pos.coords.accuracy < best.coords.accuracy) {
        best = pos;
      }

      setResult(
        `Improving GPS...<br>
         Current accuracy: ±${Math.round(pos.coords.accuracy)} m`
      );

      if (pos.coords.accuracy <= 8 || tries >= 8) {
        navigator.geolocation.clearWatch(tempWatch);

        const lat = best.coords.latitude;
        const lon = best.coords.longitude;
        const acc = Math.round(best.coords.accuracy);

        if (accuracyCircle) map.removeLayer(accuracyCircle);

        accuracyCircle = L.circle([lat, lon], {
          radius: acc,
          weight: 1,
          fillOpacity: 0.12
        }).addTo(map);

        map.setView([lat, lon], 18);
        checkBlock(lat, lon);

        setTimeout(() => {
          setResult(
            `Best GPS location found.<br>
             GPS accuracy: ±${acc} m`
          );
        }, 900);
      }
    },
    () => alert("Please allow location permission."),
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    }
  );
}

function startDraw() {
  drawMode = true;
  drawPoints = [];
  clearDrawOnly();
  setResult("Draw mode ON. Tap points on the map.");
}

function finishDraw() {
  drawMode = false;
  setResult(`Draw route finished.<br>Distance: ${distanceKm(drawPoints).toFixed(2)} km`);
}

function clearDrawOnly() {
  if (drawLine) map.removeLayer(drawLine);

  drawDots.forEach(dot => map.removeLayer(dot));

  drawLine = null;
  drawDots = [];
}

function clearDraw() {
  drawMode = false;
  drawPoints = [];
  clearDrawOnly();
  setResult("Draw route cleared.");
}

function addDrawPoint(lat, lon) {
  const point = L.latLng(lat, lon);
  drawPoints.push(point);

  const dot = L.circleMarker(point, {
    radius: 5,
    color: selectedColor(),
    fillColor: selectedColor(),
    fillOpacity: 0.7
  }).addTo(map);

  drawDots.push(dot);

  if (drawLine) map.removeLayer(drawLine);

  drawLine = L.polyline(drawPoints, {
    color: selectedColor(),
    weight: 7,
    opacity: 0.45
  }).addTo(map);

  setResult(`Drawing route...<br>Distance: ${distanceKm(drawPoints).toFixed(2)} km`);
}

function startRecording() {
  if (!navigator.geolocation) {
    alert("GPS is not supported.");
    return;
  }

  recording = true;
  paused = false;
  recPoints = [];

  if (recLine) map.removeLayer(recLine);

  watchId = navigator.geolocation.watchPosition(
    pos => {
      if (!recording || paused) return;

      const p = L.latLng(pos.coords.latitude, pos.coords.longitude);
      recPoints.push(p);

      if (recLine) map.removeLayer(recLine);

      recLine = L.polyline(recPoints, {
        color: selectedColor(),
        weight: 8,
        opacity: 0.55
      }).addTo(map);

      map.setView(p, 18);

      setResult(
        `Recording...<br>
         Distance: ${distanceKm(recPoints).toFixed(2)} km<br>
         GPS accuracy: ±${Math.round(pos.coords.accuracy)} m`
      );
    },
    () => alert("Please allow location permission."),
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }
  );

  setResult("Recording started.");
}

function pauseRecording() {
  if (!recording) return;

  paused = true;
  setResult("Recording paused.");
}

function resumeRecording() {
  if (!recording) return;

  paused = false;
  setResult("Recording resumed.");
}

function stopRecording() {
  recording = false;
  paused = false;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  setResult(
    `Recording stopped.<br>
     Distance: ${distanceKm(recPoints).toFixed(2)} km<br>
     Press Save to keep this route.`
  );
}

function saveRecording() {
  if (recPoints.length < 2) {
    alert("Not enough route points to save.");
    return;
  }

  const name = prompt("Route name:");

  if (!name) return;

  const routes = JSON.parse(localStorage.getItem("routes") || "[]");

  routes.push({
    name,
    date: new Date().toLocaleString(),
    color: selectedColor(),
    points: recPoints.map(p => [p.lat, p.lng])
  });

  localStorage.setItem("routes", JSON.stringify(routes));
  refreshRoutes();

  setResult(`Saved route: ${name}`);
}

function refreshRoutes() {
  const select = document.getElementById("savedRoutes");
  select.innerHTML = '<option value="">Select old route</option>';

  const routes = JSON.parse(localStorage.getItem("routes") || "[]");

  routes.forEach((route, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = `${route.name} - ${route.date}`;
    select.appendChild(option);
  });
}

function loadRoute() {
  const index = document.getElementById("savedRoutes").value;

  if (index === "") return;

  const routes = JSON.parse(localStorage.getItem("routes") || "[]");
  const route = routes[index];

  if (!route) return;

  if (oldRouteLine) map.removeLayer(oldRouteLine);

  const points = route.points.map(p => L.latLng(p[0], p[1]));

  oldRouteLine = L.polyline(points, {
    color: route.color || "#4da6ff",
    weight: 9,
    opacity: 0.35,
    dashArray: "8,8"
  }).addTo(map);

  map.fitBounds(oldRouteLine.getBounds());

  setResult(
    `Old route loaded: ${route.name}<br>
     You can record a new route while the old route stays visible.`
  );
}

function deleteRoute() {
  const index = document.getElementById("savedRoutes").value;

  if (index === "") {
    alert("Select a route first.");
    return;
  }

  const routes = JSON.parse(localStorage.getItem("routes") || "[]");
  routes.splice(index, 1);

  localStorage.setItem("routes", JSON.stringify(routes));

  if (oldRouteLine) map.removeLayer(oldRouteLine);

  oldRouteLine = null;
  refreshRoutes();
  setResult("Route deleted.");
}

async function searchPlace() {
  const text = document.getElementById("searchBox").value.trim();

  if (!text) {
    alert("Type address or street first.");
    return;
  }

  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(text + ", Saskatoon, Canada")}&limit=1`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.length) {
    setResult("Place not found.");
    return;
  }

  const lat = parseFloat(data[0].lat);
  const lon = parseFloat(data[0].lon);

  map.setView([lat, lon], 18);
  checkBlock(lat, lon);
}

map.on("click", e => {
  if (drawMode) {
    addDrawPoint(e.latlng.lat, e.latlng.lng);
  } else {
    checkBlock(e.latlng.lat, e.latlng.lng);
  }
});

refreshRoutes();

setTimeout(() => {
  map.invalidateSize();
}, 500);
