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

// Globals
let allMarkers = [];
const artistGroups = {}; // Used for popups and sidebar

// Fetch data with Pagination
async function fetchData() {
  const filterFormula = encodeURIComponent("{Approved}=TRUE()");
  const viewName = encodeURIComponent("Artists");
  let allRecords = [];
  let offset = null;

  try {
    do {
      const fetchUrl = `${AIRTABLE_URL}?view=${viewName}&filterByFormula=${filterFormula}${
        offset ? `&offset=${offset}` : ""
      }`;

      const res = await fetch(fetchUrl, {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Airtable Error (${res.status}):`, errorText);
        return allRecords;
      }

      const data = await res.json();
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset || null;
    } while (offset);

    return allRecords;
  } catch (err) {
    console.error("Fetch failed:", err);
    return allRecords;
  }
}

// Map Load Logic
map.on('load', async () => {
  try {
    // 1. Fetch Data
    const records = await fetchData();
    const data = records.map(r => ({ id: r.id, ...r.fields }));

    // 2. Fetch GeoJSON
    const neighborhoods = await fetch('2020_Neighborhood_Tabulation_Areas_(NTAs)_20260414.geojson')
      .then(res => res.json());

    // 3. Standardize GeoJSON props
    neighborhoods.features.forEach(f => {
      f.properties.neighborhood = f.properties.ntaname;
    });

    // 4. Build Layers (Subway first so neighborhoods go under them)
    map.addSource('subway-lines', { type: 'geojson', data: 'nyc-subway-routes.geojson' });
    map.addLayer({
      id: 'subway-lines-layer',
      type: 'line',
      source: 'subway-lines',
      paint: {
        'line-width': 2,
        'line-color': ['match', ['get', 'rt_symbol'], '1', '#EE352E', '2', '#EE352E', '3', '#EE352E', '4', '#00933C', '5', '#00933C', '6', '#00933C', 'A', '#2850AD', 'C', '#2850AD', 'E', '#2850AD', 'B', '#FF6319', 'D', '#FF6319', 'F', '#FF6319', 'M', '#FF6319', 'N', '#FCCC0A', 'Q', '#FCCC0A', 'R', '#FCCC0A', 'W', '#FCCC0A', 'L', '#A7A9AC', 'G', '#6CBE45', 'J', '#996633', 'Z', '#996633', '7', '#B933AD', '#000000']
      }
    });

    // 5. Build Choropleth & Process Data
    createNeighborhoodChoropleth(data, neighborhoods, artistGroups);

  } catch (error) {
    console.error("Initialization failed:", error);
  }
});

function createNeighborhoodChoropleth(data, neighborhoods, artistGroups) {
  const countsMap = {};
  const seenIds = new Set(); // Prevents double-counting

  // Clear global to ensure fresh start
  for (let key in artistGroups) delete artistGroups[key];

  data.forEach(row => {
    if (seenIds.has(row.id)) return;
    seenIds.add(row.id);

    // Multi-neighborhood logic
    let ntas = row.LinkedNTA_Code;
    if (!ntas) return;
    if (!Array.isArray(ntas)) ntas = [ntas];

    ntas.forEach(n => {
      if (n && typeof n === 'string' && !n.startsWith('rec')) {
        const neighborhoodName = n.trim();
        countsMap[neighborhoodName] = (countsMap[neighborhoodName] || 0) + 1;
        
        if (!artistGroups[neighborhoodName]) artistGroups[neighborhoodName] = [];
        artistGroups[neighborhoodName].push(row);
      }
    });
  });

  neighborhoods.features.forEach(f => {
    const geoName = f.properties.ntaname;
    f.properties.artistCount = countsMap[geoName] || 0;
  });

  const counts = neighborhoods.features.map(f => f.properties.artistCount);
  const safeMax = Math.max(...counts) || 1;

  // Manage Map Source
  if (map.getSource('neighborhoods')) {
    map.getSource('neighborhoods').setData(neighborhoods);
  } else {
    map.addSource('neighborhoods', { type: 'geojson', data: neighborhoods });
  }

  // Manage Map Layers
  if (!map.getLayer('neighborhood-fill')) {
    map.addLayer({
      id: 'neighborhood-fill',
      type: 'fill',
      source: 'neighborhoods',
      paint: {
        'fill-color': [
          'interpolate', ['exponential', 0.5], ['get', 'artistCount'],
          0, '#f2f0f7',
          safeMax * 0.25, '#cbc9e2',
          safeMax * 0.5, '#9e9ac8',
          safeMax * 0.75, '#756bb1',
          safeMax, '#54278f'
        ],
        'fill-opacity': 0.7
      }
    }, 'subway-lines-layer'); // Place below subways

    map.addLayer({
      id: 'neighborhood-outline',
      type: 'line',
      source: 'neighborhoods',
      paint: { 'line-color': '#333', 'line-width': 1 }
    }, 'subway-lines-layer');
  }

  // Pop-up Logic
  map.off('click', 'neighborhood-fill');
  map.on('click', 'neighborhood-fill', (e) => {
    const feature = e.features[0];
    const name = feature.properties.ntaname;
    const artists = artistGroups[name] || [];

    const BASE_LIST_PAGE = "https://elwanda52071.softr.app/artists";
    const DETAIL_SLUG = "/artists-details";

    const html = `
      <div style="padding:10px; max-height:250px; overflow-y:auto; font-family:sans-serif;">
        <h3 style="margin:0 0 5px 0;">${name}</h3>
        <p style="margin:0 0 10px 0;"><strong>${artists.length}</strong> Artists</p>
        <hr style="border:0; border-top:1px solid #eee;">
        ${artists.map(a => {
          // Fix Unnamed Issue[cite: 2]
          const displayName = a["Name"] || a["Org Name"] || a["Artist Name"] || "Unnamed Artist";
          const modalParam = encodeURIComponent(`${DETAIL_SLUG}?recordId=${a.id}`);
          const finalUrl = `${BASE_LIST_PAGE}?modal=${modalParam}&modalSize=M&modalPlacement=end`;
          return `
            <div style="margin-top:8px;">
              <div style="font-weight:bold; font-size:14px;">${displayName}</div>
              <a href="${finalUrl}" target="_blank" style="color:#007bff; text-decoration:none; font-size:12px;">View Profile →</a>
            </div>`;
        }).join('')}
      </div>`;
    new mapboxgl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
  });

  // Update Legend and Sidebar
  updateLegendUI(safeMax);
  buildNeighborhoodSidebar(artistGroups, neighborhoods);
}

function updateLegendUI(safeMax) {
  const legendContainer = document.getElementById('legend');
  legendContainer.innerHTML = '<h3>Artist Density</h3>';
  const colors = ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f'];
  const grades = [0, Math.round(safeMax*0.25), Math.round(safeMax*0.5), Math.round(safeMax*0.75), safeMax];

  grades.forEach((grade, i) => {
    const item = document.createElement('div');
    item.innerHTML = `<span style="background:${colors[i]}; width:12px; height:12px; display:inline-block; margin-right:5px;"></span> ${grade}`;
    legendContainer.appendChild(item);
  });
}

function buildNeighborhoodSidebar(groups, neighborhoods) {
  const container = document.getElementById('legend'); // Appends to density legend
  const header = document.createElement('h3');
  header.innerText = "Neighborhoods";
  container.appendChild(header);

  Object.keys(groups).sort().forEach(name => {
    const count = groups[name].length;
    const div = document.createElement('div');
    div.style.cursor = 'pointer';
    div.style.marginBottom = '6px';
    div.innerHTML = `<strong>${name}</strong> (${count})`;

    div.onclick = () => {
      const feature = neighborhoods.features.find(f => f.properties.neighborhood === name);
      if (feature) {
        const bbox = turf.bbox(feature);
        map.fitBounds(bbox, { padding: 40 });
      }
    };
    container.appendChild(div);
  });
}

// Search Logic
document.getElementById('search-input').addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();
  const resultsContainer = document.getElementById('search-results');
  resultsContainer.innerHTML = '';

  if (!query) return;

  const matches = [];
  Object.values(artistGroups).flat().forEach(artist => {
    const name = (artist["Name"] || artist["Org Name"] || "").toLowerCase();
    if (name.includes(query) && !matches.some(m => m.id === artist.id)) {
      matches.push(artist);
    }
  });

  matches.forEach(artist => {
    const li = document.createElement('div');
    li.style.padding = '5px';
    li.style.cursor = 'pointer';
    li.style.borderBottom = '1px solid #eee';
    li.innerText = artist["Name"] || artist["Org Name"] || "Unnamed";
    li.onclick = () => {
        // Find first neighborhood this artist is in to zoom
        const hood = Array.isArray(artist.LinkedNTA_Code) ? artist.LinkedNTA_Code[0] : artist.LinkedNTA_Code;
        alert(`This artist is located in ${hood}. Click the neighborhood on the map to see details.`);
    };
    resultsContainer.appendChild(li);
  });
});