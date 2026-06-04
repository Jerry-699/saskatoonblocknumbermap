let map = L.map("map").setView([52.1332, -106.6700], 12);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

let marker;

function getBlockRange(number) {
  number = parseInt(number);
  if (isNaN(number)) return "Block unknown";

  let start = Math.floor(number / 100) * 100;
  let end = start + 99;
  return `${start}-${end}`;
}

async function getRoadName(lat, lon) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1`;

  const res = await fetch(url);
  const data = await res.json();

  const address = data.address || {};
  return address.road || address.street || address.residential || address.pedestrian || null;
}

async function getNearbyAddressNumbers(lat, lon, roadName) {
  const query = `
    [out:json][timeout:25];
    (
      node["addr:housenumber"]["addr:street"="${roadName}"](around:250,${lat},${lon});
      way["addr:housenumber"]["addr:street"="${roadName}"](around:250,${lat},${lon});
      relation["addr:housenumber"]["addr:street"="${roadName}"](around:250,${lat},${lon});
    );
    out center tags;
  `;

  const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

  const res = await fetch(url);
  const data = await res.json();

  let numbers = [];

  data.elements.forEach(item => {
    if (item.tags && item.tags["addr:housenumber"]) {
      let num = parseInt(item.tags["addr:housenumber"]);
      if (!isNaN(num)) numbers.push(num);
    }
  });

  return numbers;
}

async function findBlockFromClick(lat, lon) {
  document.getElementById("result").innerHTML = "Checking street block...";

  const roadName = await getRoadName(lat, lon);

  if (!roadName) {
    document.getElementById("result").innerHTML =
      "Street name not found. Try clicking closer to the road.";
    return;
  }

  const numbers = await getNearbyAddressNumbers(lat, lon, roadName);

  let blockText = "Block unknown";

  if (numbers.length > 0) {
    numbers.sort((a, b) => a - b);

    let closestNumber = numbers[0];
    let smallestDiff = Math.abs(numbers[0] - numbers[0]);

    numbers.forEach(num => {
      let diff = Math.abs(num - numbers[0]);
      if (diff < smallestDiff) {
        smallestDiff = diff;
        closestNumber = num;
      }
    });

    blockText = getBlockRange(closestNumber);
  }

  document.getElementById("result").innerHTML =
    `Street: ${roadName}<br>
     Block: ${blockText} ${roadName}<br>
     Nearby address numbers found: ${numbers.join(", ") || "None"}`;

  if (marker) map.removeLayer(marker);

  marker = L.marker([lat, lon]).addTo(map)
    .bindPopup(`${blockText} ${roadName}`)
    .openPopup();
}

map.on("click", function(e) {
  findBlockFromClick(e.latlng.lat, e.latlng.lng);
});
