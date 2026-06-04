let map = L.map("map").setView([52.1332, -106.6700], 12);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

let marker;

function getBlockRange(number) {
  number = parseInt(number);

  if (isNaN(number)) {
    return "Block number not found";
  }

  let start = Math.floor(number / 100) * 100;
  let end = start + 99;

  return `${start}-${end}`;
}

function showResult(lat, lon, address) {
  let houseNumber = address.house_number;
  let road = address.road || address.street || address.pedestrian || "Unknown street";
  let city = address.city || address.town || address.village || "Saskatoon";

  let blockRange = getBlockRange(houseNumber);

  document.getElementById("result").innerHTML =
    `Street: ${road}<br>
     Address number: ${houseNumber || "Not found"}<br>
     Block: ${blockRange} ${road}<br>
     City: ${city}`;

  if (marker) map.removeLayer(marker);

  marker = L.marker([lat, lon]).addTo(map)
    .bindPopup(`${blockRange} ${road}`)
    .openPopup();

  map.setView([lat, lon], 17);
}

async function reverseGeocode(lat, lon) {
  let url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1`;

  let response = await fetch(url);
  let data = await response.json();

  if (!data.address) {
    document.getElementById("result").innerHTML = "No address found here.";
    return;
  }

  showResult(lat, lon, data.address);
}

function useMyLocation() {
  if (!navigator.geolocation) {
    alert("Your browser does not support location.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      let lat = position.coords.latitude;
      let lon = position.coords.longitude;
      reverseGeocode(lat, lon);
    },
    () => {
      alert("Location permission denied.");
    }
  );
}

async function searchAddress() {
  let query = document.getElementById("searchBox").value;

  if (!query) {
    alert("Type an address first.");
    return;
  }

  let url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query + ", Saskatoon, Canada")}&addressdetails=1&limit=1`;

  let response = await fetch(url);
  let data = await response.json();

  if (data.length === 0) {
    document.getElementById("result").innerHTML = "Address not found.";
    return;
  }

  let place = data[0];
  showResult(place.lat, place.lon, place.address);
}