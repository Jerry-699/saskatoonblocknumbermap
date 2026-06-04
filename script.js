let map = L.map("map").setView([52.1332, -106.6700], 12);

let lightTiles = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
let darkTiles = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

let tileLayer = L.tileLayer(lightTiles, {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

let marker;
let dark = false;
let cache = {};

// route drawing layer
let drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

let drawControl = new L.Control.Draw({
  draw: {
    polygon: false,
    rectangle: false,
    circle: false,
    circlemarker: false,
    marker: false,
    polyline: {
      shapeOptions: {
        weight: 5
      }
    }
  },
  edit: {
    featureGroup: drawnItems,
    remove: true
  }
});

map.addControl(drawControl);

map.on(L.Draw.Event.CREATED, function (event) {
  let layer = event.layer;
  drawnItems.addLayer(layer);

  let distance = calculateLineDistance(layer);
  document.getElementById("result").innerHTML =
    `Route drawn<br>Distance: ${distance.toFixed(2)} km`;
});

function calculateLineDistance(layer) {
  let points = layer.getLatLngs();
  let total = 0;

  for (let i = 0; i < points.length - 1; i++) {
    total += points[i].distanceTo(points[i + 1]);
  }

  return total / 1000;
}

// night mode
function toggleDark() {
  dark = !dark;

  document.body.classList.toggle("dark", dark);
  localStorage.setItem("darkMode", dark ? "yes" : "no");

  map.removeLayer(tileLayer);

  tileLayer = L.tileLayer(dark ? darkTiles : lightTiles, {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

if (localStorage.getItem("darkMode") === "yes") {
  dark = false;
  toggleDark();
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

map.on("click", e => {
  checkBlock(e.latlng.lat, e.latlng.lng);
});

function useMyLocation() {
  navigator.geolocation.getCurrentPosition(
    pos => checkBlock(pos.coords.latitude, pos.coords.longitude),
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

  checkBlock(parseFloat(data[0].lat), parseFloat(data[0].lon));
}
