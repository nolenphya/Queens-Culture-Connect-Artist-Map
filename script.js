// Mapbox Setup
mapboxgl.accessToken = 'pk.eyJ1IjoiZmx1c2hpbmd0b3duaGFsbCIsImEiOiJjbWRmZHFxb2EwY2p3MmlxM3JoMmJwNDVrIn0.KDnT79yQuUeYVaqcKlmQGQ';
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-73.94, 40.73],
  zoom: 11
});

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
let geoData = null; // Store geojson globally for zoom logic

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

  // Subway Lines
  map.addSource('subway-lines', { type: 'geojson', data: 'nyc-subway-routes.geojson' });
  map.addLayer({
    id: 'subway-lines-layer', type: 'line', source: 'subway-lines',
    paint: {
      'line-width': 2,
      'line-color': ['match', ['get', 'rt_symbol'], '1', '#EE352E', '2', '#EE352E', '3', '#EE352E', '4', '#00933C', '5', '#00933C', '6', '#00933C', 'A', '#2850AD', 'C', '#2850AD', 'E', '#2850AD', 'B', '#FF6319', 'D', '#FF6319', 'F', '#FF6319', 'M', '#FF6319', 'N', '#FCCC0A', 'Q', '#FCCC0A', 'R', '#FCCC0A', 'W', '#FCCC0A', 'L', '#A7A9AC', 'G', '#6CBE45', 'J', '#996633', 'Z', '#996633', '7', '#B933AD', '#000000']
    }
  });

  // Subway Stops & Labels
  map.addSource('subway-stops', { type: 'geojson', data: 'nyc-subway-stops.geojson' });
  map.addLayer({
    id: 'subway-stations-stops', type: 'circle', source: 'subway-stops',
    paint: { 'circle-radius': 2.5, 'circle-color': '#fff', 'circle-stroke-width': 1, 'circle-stroke-color': '#000' }
  });
  map.addLayer({
    id: 'subway-labels', type: 'symbol', source: 'subway-stops',
    minzoom: 13,
    layout: { 'text-field': ['get', 'stop_name'], 'text-font': ['Open Sans Semibold'], 'text-size': 10, 'text-offset': [0, 0.6], 'text-anchor': 'top' },
    paint: { 'text-color': '#333', 'text-halo-color': '#fff', 'text-halo-width': 1 }
  });

  createZipBasedChoropleth(data, geoData, artistGroups);
});

function createZipBasedChoropleth(data, neighborhoods, artistGroups) {
  const countsMap = {};
  const seenIds = new Set();
  for (let key in artistGroups) delete artistGroups[key];

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

  neighborhoods.features.forEach(f => { f.properties.artistCount = countsMap[f.properties.ntaname] || 0; });
  const safeMax = Math.max(...neighborhoods.features.map(f => f.properties.artistCount)) || 1;

  if (!map.getSource('neighborhoods')) {
    map.addSource('neighborhoods', { type: 'geojson', data: neighborhoods });
  } else {
    map.getSource('neighborhoods').setData(neighborhoods);
  }

  if (!map.getLayer('neighborhood-outline')) {
    map.addLayer({ id: 'neighborhood-outline', type: 'line', source: 'neighborhoods', paint: { 'line-color': '#333', 'line-width': 0.8, 'line-opacity': 0.4 } }, 'subway-lines-layer');
    map.addLayer({
      id: 'neighborhood-fill', type: 'fill', source: 'neighborhoods',
      paint: { 'fill-color': ['interpolate', ['exponential', 0.5], ['get', 'artistCount'], 0, '#f2f0f7', safeMax * 0.5, '#9e9ac8', safeMax, '#54278f'], 'fill-opacity': 0.7 }
    }, 'neighborhood-outline');
  }

  const showPopup = (name, lngLat) => {
    const artists = artistGroups[name] || [];
    const html = `<div style="padding:10px; max-height:200px; overflow-y:auto;"><h3>${name}</h3><p><strong>${artists.length}</strong> Artists</p><hr>
      ${artists.map(a => `<div style="margin-bottom:5px; font-weight:bold;">${a["Name"] || a["Org Name"] || "Unnamed"}</div>`).join('')}</div>`;
    new mapboxgl.Popup().setLngLat(lngLat).setHTML(html).addTo(map);
  };

  map.on('click', 'neighborhood-fill', (e) => showPopup(e.features[0].properties.ntaname, e.lngLat));

  updateSidebarAndLegend(artistGroups, neighborhoods, showPopup);
  setupSearch(data);
}

function updateSidebarAndLegend(groups, neighborhoods, popupFn) {
  const container = document.getElementById('legend');
  container.innerHTML = '<h3>Artist Neighborhoods</h3>';

  Object.keys(groups).sort().forEach(name => {
    const item = document.createElement('div');
    item.className = 'sidebar-item';
    item.style = "cursor:pointer; padding:5px; border-bottom:1px solid #eee; font-size:13px;";
    item.innerHTML = `<strong>${name}</strong> (${groups[name].length})`;

    item.onclick = () => {
      const feature = neighborhoods.features.find(f => f.properties.ntaname === name);
      if (feature) {
        const center = turf.center(feature).geometry.coordinates;
        map.flyTo({ center: center, zoom: 13 });
        popupFn(name, center);
      }
    };
    container.appendChild(item);
  });
}

function setupSearch(data) {
  const searchInput = document.getElementById('search-input');
  const resultsBox = document.getElementById('search-results');

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    resultsBox.innerHTML = '';
    if (!val) return;

    const matches = data.filter(r => (r["Name"] || r["Org Name"] || "").toLowerCase().includes(val)).slice(0, 10);
    matches.forEach(m => {
      const div = document.createElement('div');
      div.style = "padding:8px; cursor:pointer; border-bottom:1px solid #ddd; background:#fff;";
      div.innerText = m["Name"] || m["Org Name"] || "Unnamed";
      div.onclick = () => {
        let zip = String((Array.isArray(m.Zip_Code) ? m.Zip_Code[0] : m.Zip_Code) || "").trim();
        const hoodName = ZIP_TO_NTA[zip];
        if (hoodName) {
           const feat = geoData.features.find(f => f.properties.ntaname === hoodName);
           if (feat) {
             const center = turf.center(feat).geometry.coordinates;
             map.flyTo({ center, zoom: 14 });
           }
        }
        resultsBox.innerHTML = '';
        searchInput.value = div.innerText;
      };
      resultsBox.appendChild(div);
    });
  });
}