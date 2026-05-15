// Mapbox Setup
mapboxgl.accessToken = 'pk.eyJ1IjoiZmx1c2hpbmd0b3duaGFsbCIsImEiOiJjbWRmZHFxb2EwY2p3MmlxM3JoMmJwNDVrIn0.KDnT79yQuUeYVaqcKlmQGQ';
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-73.94, 40.73],
  zoom: 11
});

// --- Add Navigation & Geolocation Controls ---
map.addControl(new mapboxgl.NavigationControl(), 'top-right');
map.addControl(new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
}), 'top-right');

// Airtable Setup
const AIRTABLE_API_KEY = 'patboskAQTJUi9FlQ.1c30c3c632cd4d7bd03cf949e50edd922425aba8dcbf0c8a6002e98db67c74a3';
const BASE_ID = 'apppBx0a9hj0Z1ciw';
const TABLE_NAME = 'tbl9OiPT8QI8ss20e';
const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`;

// Zip Code Crosswalk
const ZIP_TO_NTA = {
  "11101": "Long Island City-Hunters Point", "11102": "Old Astoria-Hallets Point", "11103": "Astoria (Central)",
  "11104": "Sunnyside", "11105": "Astoria (North)-Ditmars-Steinway", "11106": "Astoria (East)-Woodside (North)",
  "11354": "Flushing-Willets Point", "11355": "Flushing-Willets Point", "11356": "College Point",
  "11357": "Whitestone-Beechhurst", "11358": "Auburndale", "11360": "Bay Terrace-Clearview",
  "11361": "Bayside", "11362": "Douglaston-Little Neck", "11363": "Douglaston-Little Neck",
  "11364": "Oakland Gardens-Hollis Hills", "11365": "Fresh Meadows-Utopia", "11366": "Fresh Meadows-Utopia",
  "11367": "Kew Gardens Hills", "11368": "Corona", "11369": "East Elmhurst", "11370": "East Elmhurst",
  "11372": "Jackson Heights", "11373": "Elmhurst", "11374": "Rego Park", "11375": "Forest Hills",
  "11377": "Woodside", "11378": "Maspeth", "11379": "Middle Village", "11385": "Ridgewood",
  "11411": "Cambria Heights", "11412": "St. Albans", "11413": "Laurelton", "11414": "Howard Beach-Lindenwood",
  "11415": "Kew Gardens", "11416": "Ozone Park", "11417": "Ozone Park", "11418": "Richmond Hill",
  "11419": "South Richmond Hill", "11420": "South Ozone Park", "11421": "Woodhaven", "11422": "Rosedale",
  "11423": "Hollis", "11426": "Bellerose", "11427": "Queens Village", "11428": "Queens Village",
  "11429": "Queens Village", "11432": "Jamaica Estates-Holliswood", "11433": "Jamaica", "11434": "South Jamaica",
  "11435": "Jamaica Hills-Briarwood", "11436": "South Jamaica", "11691": "Far Rockaway-Bayswater",
  "11692": "Rockaway Beach-Arverne-Edgemere", "11693": "Breezy Point-Belle Harbor-Rockaway Park-Broad Channel",
  "11694": "Breezy Point-Belle Harbor-Rockaway Park-Broad Channel"
};

const artistGroups = {};
let geoData = null;

async function fetchData() {
  const filterFormula = encodeURIComponent("{Approved}=TRUE()");
  let allRecords = [];
  let offset = null;
  try {
    do {
      const fetchUrl = `${AIRTABLE_URL}?filterByFormula=${filterFormula}${offset ? `&offset=${offset}` : ""}`;
      const res = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
      const data = await res.json();
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset || null;
    } while (offset);
    return allRecords;
  } catch (err) { return allRecords; }
}

map.on('load', async () => {
  const records = await fetchData();
  const data = records.map(r => ({ id: r.id, ...r.fields }));
  geoData = await fetch('2020_Neighborhood_Tabulation_Areas_(NTAs)_20260414.geojson').then(res => res.json());

  map.addSource('neighborhoods', { type: 'geojson', data: geoData });

  // 1. ADD FILL LAYER (Initially Transparent)
  map.addLayer({
    id: 'neighborhood-fill',
    type: 'fill',
    source: 'neighborhoods',
    paint: {
      'fill-color': 'rgba(242, 240, 247, 0.5)', // Default very light faint purple
      'fill-opacity': 0.7
    }
  });

  // 2. ADD OUTLINES (Always Visible)
  map.addLayer({
    id: 'neighborhood-outline',
    type: 'line',
    source: 'neighborhoods',
    paint: {
      'line-color': '#444',
      'line-width': 0.8,
      'line-opacity': 0.3
    }
  });

  createZipBasedChoropleth(data, geoData, artistGroups);
});

function createZipBasedChoropleth(data, neighborhoods, artistGroups) {
  const countsMap = {};
  const seenIds = new Set();

  // 1. Map Airtable data to Neighborhood names
  data.forEach(row => {
    if (seenIds.has(row.id)) return;
    seenIds.add(row.id);
    let zip = String((Array.isArray(row.Zip_Code) ? row.Zip_Code[0] : row.Zip_Code) || "").trim();
    const neighborhoodName = ZIP_TO_NTA[zip];
    if (neighborhoodName) {
      countsMap[neighborhoodName] = (countsMap[neighborhoodName] || 0) + 1;
      if (!artistGroups[neighborhoodName]) artistGroups[neighborhoodName] = [];
      artistGroups[neighborhoodName].push(row);
    }
  });

  // 2. Calculate Density (Artists per Sq Mile)
  neighborhoods.features.forEach(f => {
    const artistCount = countsMap[f.properties.ntaname] || 0;
    // Calculate area in square miles using Turf
    const areaSqMeters = turf.area(f);
    const areaSqMiles = areaSqMeters * 0.000000386102;
    const density = artistCount / areaSqMiles;
    
    f.properties.artistCount = artistCount;
    f.properties.density = density;
  });

  // 3. Define 4 Density Bands
  // You can adjust these thresholds based on your specific data distribution
  const lowThreshold = 2;   // Example: 2 artists per sq mile
  const medThreshold = 10;  // Example: 10 artists per sq mile
  const highThreshold = 25; // Example: 25+ artists per sq mile

  const colorExpression = [
    'step',
    ['get', 'density'],
    'rgba(242, 240, 247, 0.5)', // No Artists (0 density)
    0.00001, '#dadaeb',         // Low Density (starts just above 0)
    lowThreshold, '#9e9ac8',    // Medium Density
    medThreshold, '#756bb1',    // High Density
    highThreshold, '#54278f'    // Very High Density
  ];

  map.setPaintProperty('neighborhood-fill', 'fill-color', colorExpression);
  map.setPaintProperty('neighborhood-fill', 'fill-opacity', 0.8);

  // Ensure subway layers are always on top
  addSubwayLayers();

  // Re-use your existing popup logic...
  const showPopup = (name, lngLat) => {
    const artists = artistGroups[name] || [];
    const BASE_LIST_PAGE = "https://elwanda52071.softr.app/artists";
    const DETAIL_SLUG = "/artists-details";

    const html = `
      <div style="padding:10px; max-height:250px; overflow-y:auto; font-family:sans-serif;">
        <h3 style="margin:0 0 5px 0;">${name}</h3>
        <p><strong>${artists.length}</strong> Artists (${(countsMap[name] / (turf.area(neighborhoods.features.find(f => f.properties.ntaname === name)) * 0.000000386102)).toFixed(1)}/sq mi)</p>
        <hr style="border:0; border-top:1px solid #eee;">
        ${artists.map(a => {
          const displayName = a["Name"] || a["Org Name"] || "Unnamed Artist";
          const modalParam = encodeURIComponent(`${DETAIL_SLUG}?recordId=${a.id}`);
          return `<div style="margin-top:8px;">
                    <div style="font-weight:bold; font-size:14px;">${displayName}</div>
                    <a href="${BASE_LIST_PAGE}?modal=${modalParam}&modalSize=M&modalPlacement=end" target="_blank" style="color:#007bff; text-decoration:none; font-size:12px;">View Profile →</a>
                  </div>`;
        }).join('')}
      </div>`;
    new mapboxgl.Popup().setLngLat(lngLat).setHTML(html).addTo(map);
  };

  map.on('click', 'neighborhood-fill', (e) => showPopup(e.features[0].properties.ntaname, e.lngLat));
  updateSidebarAndLegend(artistGroups, neighborhoods, showPopup, highThreshold);
  setupSearch(data);
}

function addSubwayLayers() {
  if (!map.getSource('subway-lines')) {
    map.addSource('subway-lines', { type: 'geojson', data: 'nyc-subway-routes.geojson' });
    map.addSource('subway-stops', { type: 'geojson', data: 'nyc-subway-stops.geojson' });
  }

  // Remove layers if they exist to re-add them on top
  if (map.getLayer('subway-lines-layer')) map.removeLayer('subway-lines-layer');
  if (map.getLayer('subway-stations-stops')) map.removeLayer('subway-stations-stops');
  if (map.getLayer('subway-labels')) map.removeLayer('subway-labels');

  map.addLayer({
    id: 'subway-lines-layer', type: 'line', source: 'subway-lines',
    paint: {
      'line-width': 1.5,
      'line-color': ['match', ['get', 'rt_symbol'], '1', '#EE352E', '2', '#EE352E', '3', '#EE352E', '4', '#00933C', '5', '#00933C', '6', '#00933C', 'A', '#2850AD', 'C', '#2850AD', 'E', '#2850AD', 'B', '#FF6319', 'D', '#FF6319', 'F', '#FF6319', 'M', '#FF6319', 'N', '#FCCC0A', 'Q', '#FCCC0A', 'R', '#FCCC0A', 'W', '#FCCC0A', 'L', '#A7A9AC', 'G', '#6CBE45', 'J', '#996633', 'Z', '#996633', '7', '#B933AD', '#000000']
    }
  });

  map.addLayer({
    id: 'subway-stations-stops', type: 'circle', source: 'subway-stops',
    paint: { 'circle-radius': 3, 'circle-color': '#fff', 'circle-stroke-width': 1, 'circle-stroke-color': '#000' }
  });

  map.addLayer({
    id: 'subway-labels', type: 'symbol', source: 'subway-stops',
    minzoom: 12, // Lowered minzoom so they appear sooner
    layout: {
      'text-field': ['get', 'stop_name'],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Regular'],
      'text-size': 10,
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
      'text-radial-offset': 0.5,
      'text-allow-overlap': false, // Set to false to prevent clutter, but true if you MUST see them
      'text-ignore-placement': false
    },
    paint: { 'text-color': '#333', 'text-halo-color': '#fff', 'text-halo-width': 1.5 }
  });
}

function updateSidebarAndLegend(groups, neighborhoods, popupFn, safeMax) {
  const container = document.getElementById('legend');
  container.innerHTML = `
    <div style="margin-bottom:15px; padding-bottom:10px; border-bottom:2px solid #eee;">
      <h4 style="margin:0 0 8px 0; font-size:12px; text-transform:uppercase; color:#666;">Artist Density</h4>
      <div style="display:flex; align-items:center; justify-content:space-between; padding-right:10px;">
        <div style="text-align:center"><div style="width:20px; height:20px; background:#f2f0f7; border:1px solid #ccc;"></div><span style="font-size:10px;">0</span></div>
        <div style="text-align:center"><div style="width:20px; height:20px; background:#9e9ac8; border:1px solid #ccc;"></div><span style="font-size:10px;">${Math.round(safeMax/2)}</span></div>
        <div style="text-align:center"><div style="width:20px; height:20px; background:#54278f; border:1px solid #ccc;"></div><span style="font-size:10px;">${safeMax}</span></div>
      </div>
    </div>
    <h3>Artist Neighborhoods</h3>
  `;

  Object.keys(groups).sort().forEach(name => {
    const item = document.createElement('div');
    item.className = 'neighborhood-item';
    item.style = "cursor:pointer; padding:8px; border-bottom:1px solid #eee; font-size:13px;";
    item.innerHTML = `<strong>${name}</strong> (${groups[name].length})`;
    item.onclick = () => {
      const feat = neighborhoods.features.find(f => f.properties.ntaname === name);
      if (feat) {
        const center = turf.center(feat).geometry.coordinates;
        map.flyTo({ center, zoom: 13.5 });
        popupFn(name, center);
      }
    };
    container.appendChild(item);
  });
}

function setupSearch(data) {
  const searchInput = document.getElementById('search-input');
  const resultsBox = document.getElementById('search-results');
  let currentFocus = -1;

  searchInput.addEventListener('input', () => {
    const val = searchInput.value.toLowerCase();
    resultsBox.innerHTML = '';
    currentFocus = -1;
    if (!val) return;

    const matches = data.filter(r => {
      const name = (r["Name"] || r["Org Name"] || "").toLowerCase();
      const disc = String(r["Artistic Disciplines"] || "").toLowerCase();
      return name.includes(val) || disc.includes(val);
    }).slice(0, 10);

    matches.forEach((m, i) => {
      const div = document.createElement('div');
      div.className = 'search-item';
      div.style = "padding:10px; cursor:pointer; border-bottom:1px solid #ddd; background:#fff; font-size:13px;";
      div.innerHTML = `<b>${m["Name"] || m["Org Name"]}</b><br><small>${m["Artistic Disciplines"] || ""}</small>`;
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        navigateToArtist(m);
      });
      resultsBox.appendChild(div);
    });
  });

  searchInput.addEventListener('keydown', (e) => {
    const items = resultsBox.getElementsByClassName('search-item');
    if (e.key === "ArrowDown") {
      currentFocus = (currentFocus + 1) % items.length;
      highlight(items);
    } else if (e.key === "ArrowUp") {
      currentFocus = (currentFocus - 1 + items.length) % items.length;
      highlight(items);
    } else if (e.key === "Enter" && currentFocus > -1) {
      items[currentFocus].dispatchEvent(new Event('mousedown'));
    }
  });

  function highlight(items) {
    Array.from(items).forEach((el, i) => el.style.background = i === currentFocus ? "#f0f0f0" : "#fff");
  }

  function navigateToArtist(m) {
    let zip = String((Array.isArray(m.Zip_Code) ? m.Zip_Code[0] : m.Zip_Code) || "").trim();
    const hood = ZIP_TO_NTA[zip];
    if (hood && geoData) {
      const feat = geoData.features.find(f => f.properties.ntaname === hood);
      if (feat) map.flyTo({ center: turf.center(feat).geometry.coordinates, zoom: 14.5 });
    }
    resultsBox.innerHTML = '';
    searchInput.value = '';
  }
}

// Button Listeners
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('legend-toggle');
  const resetBtn = document.getElementById('reset-legend');
  const infoBtn = document.getElementById('info-button');
  const overlay = document.getElementById('map-guide-overlay');

  if (toggleBtn) toggleBtn.addEventListener('click', () => {
    const panel = document.getElementById('legend-panel');
    panel.classList.toggle('collapsed');
    toggleBtn.textContent = panel.classList.contains('collapsed') ? 'Show' : 'Hide';
  });

  if (resetBtn) resetBtn.addEventListener('click', () => map.flyTo({ center: [-73.94, 40.73], zoom: 11 }));
  if (infoBtn) infoBtn.addEventListener('click', () => overlay.style.display = 'flex');
  if (document.getElementById('map-guide-close')) {
    document.getElementById('map-guide-close').addEventListener('click', () => overlay.style.display = 'none');
  }
});