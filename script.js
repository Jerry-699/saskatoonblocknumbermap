let map = L.map("map").setView([52.1332, -106.6700], 12);

let lightTiles = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
let darkTiles = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels_under/{z}/{x}/{y}{r}.png";
let labelTiles = null;

let tileLayer = L.tileLayer(lightTiles, {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

let marker;
let dark = false;
let cache = {};

let drawingRoute = false;
let routePoints = [];
let routeLine = null;
let routeMarkers = [];

setTimeout(() => {
  map.invalidateSize();
}, 500);

function toggleDark() {
  dark = !dark;
  document.body.classList.toggle("dark", dark);

  map.removeLayer(tileLayer);

  if (labelTiles) {
    map.removeLayer(labelTiles);
    labelTiles = null;
  }

  if (dark) {
    tileLayer = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels_under/{z}/{x}/{y}{r}.png",
      { attribution: "&copy; OpenStreetMap contributors" }
    ).addTo(map);

    labelTiles = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
      { attribution: "&copy; OpenStreetMap contributors", pane: "overlayPane" }
    ).addTo(map);

  } else {
    tileLayer = L.tileLayer(lightTiles, {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
  }
}

function startRoute() {
  drawingRoute = true;
  routePoints = [];

  if (routeLine) map.removeLayer(routeLine);
  routeMarkers.forEach(m => map.removeLayer(m));
  routeMarkers = [];

  document.getElementById("result").innerHTML =
    "Route mode ON. Tap points on the map to draw your route.";
}

function finishRoute() {
  drawingRoute = false;

  let distance = getRouteDistance();

  document.getElementById("result").innerHTML =
    `Route finished<br>Distance: ${distance.toFixed(2)} km`;
}

function clearRoute() {
  drawingRoute = false;
  routePoints = [];

  if (routeLine) map.removeLayer(routeLine);
  routeMarkers.forEach(m => map.removeLayer(m));

  routeLine = null;
  routeMarkers = [];

  document.getElementById("result").innerHTML =
    "Route cleared. Tap a street to find block.";
}

function addRoutePoint(lat, lon) {
  let point = L.latLng(lat, lon);
  routePoints.push(point);

  let dot = L.circleMarker(point, {
    radius: 5
  }).addTo(map);

  routeMarkers.push(dot);

  if (routeLine) map.removeLayer(routeLine);

  routeLine = L.polyline(routePoints, {
    weight: 5
  }).addTo(map);

  let distance = getRouteDistance();

  document.getElementById("result").innerHTML =
    `Drawing route...<br>Distance: ${distance.toFixed(2)} km`;
}

function getRouteDistance() {
  let total = 0;

  for (let i = 0; i < routePoints.length - 1; i++) {
    total += routePoints[i].distanceTo(routePoints[i + 1]);
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
  let url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&zoom=18`;

  let res = await fetch(url);
  let data = await res.json();

  let a = data.address || {};

  return {
    road: a.road || a.street || a.residential || a.pedestrian || "Street unknown",
    house: a.house_number || null
  };
}

async function getNearbyAddressFast(lat, lon, roadName) {
  let key = roadName + "_" + lat.toFixed(3) + "_" + lon.toFixed(3);

  if (cache[key]) return cache[key];

  let query = `
    [out:json][timeout:8];
    (
      node["addr:housenumber"]["addr:street"="${roadName}"](around:180,${lat},${lon});
      way["addr:housenumber"]["addr:street"="${roadName}"](around:180,${lat},${lon});
    );
    out center tags 20;
  `;

  let url =
    "https://overpass-api.de/api/interpreter?data=" +
    encodeURIComponent(query);

  try {
    let res = await fetch(url);
    let data = await res.json();

    let numbers = [];

    data.elements.forEach(el => {
      let n = parseInt(el.tags?.["addr:housenumber"]);
      if (!isNaN(n)) numbers.push(n);
    });

    numbers.sort((a, b) => a - b);
    cache[key] = numbers;

    return numbers;
  } catch {
    return [];
  }
}

async function checkBlock(lat, lon) {
  document.getElementById("result").innerHTML = "Checking...";

  let info = await reverseGeocode(lat, lon);

  let block = "Block unknown";
  let usedNumber = "Not found";

  if (info.house) {
    block = blockRange(info.house);
    usedNumber = info.house;
  } else {
    let nums = await getNearbyAddressFast(lat, lon, info.road);

    if (nums.length > 0) {
      let middle = nums[Math.floor(nums.length / 2)];
      block = blockRange(middle);
      usedNumber = middle;
    }
  }

  document.getElementById("result").innerHTML =
    `Street: ${info.road}<br>
     Block: ${block} ${info.road}<br>
     Address used: ${usedNumber}`;

  if (marker) map.removeLayer(marker);

  marker = L.marker([lat, lon]).addTo(map)
    .bindPopup(`${block} ${info.road}`)
    .openPopup();

  map.setView([lat, lon], 17);
}

map.on("click", function(e) {
  let lat = e.latlng.lat;
  let lon = e.latlng.lng;

  if (drawingRoute) {
    addRoutePoint(lat, lon);
  } else {
    checkBlock(lat, lon);
  }
});

function useMyLocation() {
  if (!navigator.geolocation) {
    alert("Your browser does not support location.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      let lat = pos.coords.latitude;
      let lon = pos.coords.longitude;

      map.setView([lat, lon], 17);
      checkBlock(lat, lon);
    },
    () => alert("Please allow location permission.")
  );
}

async function searchPlace() {
  let text = document.getElementById("searchBox").value.trim();

  if (!text) {
    alert("Type street or address first.");
    return;
  }

  let url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(text + ", Saskatoon, Canada")}&limit=1`;

  let res = await fetch(url);
  let data = await res.json();

  if (!data.length) {
    document.getElementById("result").innerHTML = "Place not found.";
    return;
  }

  let lat = parseFloat(data[0].lat);
  let lon = parseFloat(data[0].lon);

  map.setView([lat, lon], 17);
  checkBlock(lat, lon);
}
