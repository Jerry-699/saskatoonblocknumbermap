let map = L.map("map").setView([52.1332, -106.6700], 12);

let lightTiles = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
let darkTiles = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

let tileLayer = L.tileLayer(lightTiles, {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

let marker;
let dark = false;

function toggleDark() {
  dark = !dark;
  document.body.classList.toggle("dark");
  map.removeLayer(tileLayer);

  tileLayer = L.tileLayer(dark ? darkTiles : lightTiles, {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

function blockRange(num) {
  num = parseInt(num);
  if (isNaN(num)) return "Block unknown";

  let start = Math.floor(num / 100) * 100;
  let end = start + 99;
  return `${start}-${end}`;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  let R = 6371000;
  let dLat = (lat2 - lat1) * Math.PI / 180;
  let dLon = (lon2 - lon1) * Math.PI / 180;

  let a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getNearestRoad(lat, lon) {
  let query = `
    [out:json][timeout:25];
    way["highway"]["name"](around:40,${lat},${lon});
    out geom tags;
  `;

  let url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);
  let res = await fetch(url);
  let data = await res.json();

  if (!data.elements || data.elements.length === 0) return null;

  let bestRoad = null;
  let bestDistance = Infinity;

  data.elements.forEach(way => {
    if (!way.geometry || !way.tags.name) return;

    way.geometry.forEach(point => {
      let d = distanceMeters(lat, lon, point.lat, point.lon);
      if (d < bestDistance) {
        bestDistance = d;
        bestRoad = {
          name: way.tags.name,
          type: way.tags.highway,
          distance: d
        };
      }
    });
  });

  return bestRoad;
}

async function getNearbyAddresses(lat, lon, streetName) {
  let query = `
    [out:json][timeout:25];
    (
      node["addr:housenumber"]["addr:street"="${streetName}"](around:500,${lat},${lon});
      way["addr:housenumber"]["addr:street"="${streetName}"](around:500,${lat},${lon});
      relation["addr:housenumber"]["addr:street"="${streetName}"](around:500,${lat},${lon});
    );
    out center tags;
  `;

  let url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);
  let res = await fetch(url);
  let data = await res.json();

  let list = [];

  data.elements.forEach(el => {
    let raw = el.tags?.["addr:housenumber"];
    let num = parseInt(raw);
    let aLat = el.lat || el.center?.lat;
    let aLon = el.lon || el.center?.lon;

    if (!isNaN(num) && aLat && aLon) {
      list.push({
        number: num,
        distance: distanceMeters(lat, lon, aLat, aLon)
      });
    }
  });

  list.sort((a, b) => a.distance - b.distance);
  return list;
}

async function checkBlock(lat, lon) {
  document.getElementById("result").innerHTML = "Checking...";

  try {
    let road = await getNearestRoad(lat, lon);

    if (!road) {
      document.getElementById("result").innerHTML =
        "No street found. Tap closer to the road.";
      return;
    }

    let addresses = await getNearbyAddresses(lat, lon, road.name);

    let nearestNumber = addresses.length ? addresses[0].number : null;
    let block = nearestNumber ? blockRange(nearestNumber) : "Block unknown";

    document.getElementById("result").innerHTML =
      `Street: ${road.name}<br>
       Block: ${block} ${road.name}<br>
       Nearest address used: ${nearestNumber || "Not found"}<br>
       Distance from road: ${Math.round(road.distance)} m`;

    if (marker) map.removeLayer(marker);

    marker = L.marker([lat, lon]).addTo(map)
      .bindPopup(`${block} ${road.name}`)
      .openPopup();

    map.setView([lat, lon], 17);

  } catch (err) {
    document.getElementById("result").innerHTML =
      "Error checking block. Try again.";
    console.error(err);
  }
}

map.on("click", e => {
  checkBlock(e.latlng.lat, e.latlng.lng);
});

function useMyLocation() {
  navigator.geolocation.getCurrentPosition(
    pos => {
      let lat = pos.coords.latitude;
      let lon = pos.coords.longitude;
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
