// Mapbox Setup
mapboxgl.accessToken = 'pk.eyJ1IjoiZmx1c2hpbmd0b3duaGFsbCIsImEiOiJjbWRmZHFxb2EwY2p3MmlxM3JoMmJwNDVrIn0.KDnT79yQuUeYVaqcKlmQGQ';
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-73.94, 40.73],
  zoom: 11
});

// Map Utilities and Navigation Controls
map.addControl(new mapboxgl.NavigationControl(), 'top-right');
map.addControl(new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
}), 'top-right');

// Airtable Configurations
const AIRTABLE_API_KEY = 'patboskAQTJUi9FlQ.1c30c3c632cd4d7bd03cf949e50edd922425aba8dcbf0c8a6002e98db67c74a3';
const BASE_ID = 'apppBx0a9hj0Z1ciw';
const TABLE_NAME = 'tbl9OiPT8QI8ss20e';
const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`;

// Reference Mapping Crosswalk
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
  } catch (err) {
    console.error("Data processing exception:", err);
    return allRecords;
  }
}

map.on('load', async () => {
  const records = await fetchData();
  const data = records.map(r => ({ id: r.id, ...r.fields }));
  
  geoData = await fetch('queens_neighborhoods.geojson').then(res => res.json());

  map.addSource('neighborhoods', { type: 'geojson', data: geoData });

  // Add Fill layer
  map.addLayer({
    id: 'neighborhood-fill',
    type: 'fill',
    source: 'neighborhoods',
    paint: {
      'fill-color': '#f2f0f7',
      'fill-opacity': 0.6
    }
  });

  // Add Boundary Outlines layer
  map.addLayer({
    id: 'neighborhood-outline',
    type: 'line',
    source: 'neighborhoods',
    paint: {
      'line-color': '#444',
      'line-width': 0.8,
      'line-opacity': 0.4
    }
  });

  createZipBasedChoropleth(data, geoData, artistGroups);
});

function createZipBasedChoropleth(data, neighborhoods, artistGroups) {
  const countsMap = {};
  const seenIds = new Set();

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

  // Map numbers cleanly to prevent WebGL runtime fallback crashes
  neighborhoods.features.forEach(f => { 
    const count = countsMap[f.properties.ntaname];
    f.properties.artistCount = typeof count === 'number' ? count : 0; 
  });
  
  map.getSource('neighborhoods').setData(neighborhoods);

  const maxArtists = Math.max(...Object.values(countsMap), 1);
  const s1 = Math.max(1, Math.ceil(maxArtists * 0.2));
  const s2 = Math.max(s1 + 1, Math.ceil(maxArtists * 0.4));
  const s3 = Math.max(s2 + 1, Math.ceil(maxArtists * 0.6));
  const s4 = Math.max(s3 + 1, Math.ceil(maxArtists * 0.8));

  const colorExpression = [
    'step',
    ['coalesce', ['get', 'artistCount'], 0],
    '#f2f0f7',
    1,          '#dadaeb',
    s1 + 1,     '#bcbddc',
    s2 + 1,     '#9e9ac8',
    s3 + 1,     '#756bb1',
    s4 + 1,     '#54278f'
  ];

  map.setPaintProperty('neighborhood-fill', 'fill-color', colorExpression);

  // CHANGE 1: Refactored Popups to point directly to filtered Softr views instead of list clutter
  const showPopup = (name, lngLat) => {
    const totalCount = artistGroups[name] ? artistGroups[name].length : 0;
    
    // Replace URL paths with your production configurations
    const BASE_SOFTR_DIRECTORY = "https://elwanda52071.softr.app/artists"; 
    
    // Direct link generated with dynamic neighborhood parameters targeting Softr parameters
    const filterLink = `${BASE_SOFTR_DIRECTORY}?filter-by-Neighborhood=${encodeURIComponent(name)}`;

    const html = `
      <div style="padding:12px; font-family:sans-serif; text-align:center; min-width:180px;">
        <h3 style="margin:0 0 4px 0; font-size:15px; color:#222;">${name}</h3>
        <p style="margin:0 0 12px 0; font-size:13px; color:#666;">
          <strong>${totalCount}</strong> Listings Registered
        </p>
        <a href="${filterLink}" target="_blank" style="
          display: inline-block;
          background: #007bff;
          color: white;
          padding: 6px 12px;
          border-radius: 4px;
          text-decoration: none;
          font-weight: bold;
          font-size: 12px;">
          View in Softr Directory →
        </a>
      </div>`;
    new mapboxgl.Popup().setLngLat(lngLat).setHTML(html).addTo(map);
  };

  map.on('click', 'neighborhood-fill', (e) => {
    if (e.features.length > 0) {
      showPopup(e.features[0].properties.ntaname, e.lngLat);
    }
  });

  map.on('mouseenter', 'neighborhood-fill', () => map.getCanvas().style.cursor = 'pointer');
  map.on('mouseleave', 'neighborhood-fill', () => map.getCanvas().style.cursor = '');

  // Initialize modular controls
  buildBottomLeftScale({s1, s2, s3, s4});
  setupLayerToggles();
  updateSidebarLists(artistGroups, neighborhoods, showPopup);
}

// CHANGE 2: Build the isolated Legend Scale in the Bottom-Left
function buildBottomLeftScale(stops) {
  const container = document.getElementById('choropleth-legend');
  if (!container) return;

  container.innerHTML = `
    <h4>Artist Count Scale</h4>
    <div class="scale-row"><div class="scale-color" style="background:#f2f0f7;"></div><span>0 Listings</span></div>
    <div class="scale-row"><div class="scale-color" style="background:#dadaeb;"></div><span>1 - ${stops.s1}</span></div>
    <div class="scale-row"><div class="scale-color" style="background:#bcbddc;"></div><span>${stops.s1 + 1} - ${stops.s2}</span></div>
    <div class="scale-row"><div class="scale-color" style="background:#9e9ac8;"></div><span>${stops.s2 + 1} - ${stops.s3}</span></div>
    <div class="scale-row"><div class="scale-color" style="background:#756bb1;"></div><span>${stops.s3 + 1} - ${stops.s4}</span></div>
    <div class="scale-row"><div class="scale-color" style="background:#54278f;"></div><span>${stops.s4 + 1}+</span></div>
  `;
}

// CHANGE 3: Interactive Layer Visibility Checkbox Controller
function setupLayerToggles() {
  const container = document.getElementById('layer-toggles');
  if (!container) return;

  container.innerHTML = `
    <label class="layer-checkbox-container">
      <input type="checkbox" id="toggle-choropleth-layer" checked />
      <span>Neighborhood Choropleth Map</span>
    </label>
  `;

  document.getElementById('toggle-choropleth-layer').addEventListener('change', (e) => {
    const visibility = e.target.checked ? 'visible' : 'none';
    
    if (map.getLayer('neighborhood-fill')) {
      map.setLayoutProperty('neighborhood-fill', 'visibility', visibility);
    }
    if (map.getLayer('neighborhood-outline')) {
      map.setLayoutProperty('neighborhood-outline', 'visibility', visibility);
    }
    
    // Sync the bottom-left float block visibility with the checklist value
    const bottomScale = document.getElementById('choropleth-legend');
    if (bottomScale) {
      bottomScale.style.display = e.target.checked ? 'block' : 'none';
    }
  });
}

// Render the Alphabetical Sidebar Directory Component
function updateSidebarLists(groups, neighborhoods, popupFn) {
  const container = document.getElementById('legend');
  if (!container) return;
  
  container.innerHTML = `<h3>Neighborhood Directory</h3>`;

  Object.keys(groups).sort().forEach(name => {
    const item = document.createElement('div');
    item.className = 'neighborhood-item';
    item.style = "cursor:pointer; padding:8px; border-bottom:1px solid #eee; font-size:13px;";
    item.innerHTML = `<strong>${name}</strong> (${groups[name].length})`;
    item.onclick = () => {
      const feature = neighborhoods.features.find(f => f.properties.ntaname === name);
      if (feature) {
        // Center calculation via turf parsing
        const center = turf.center(feature).geometry.coordinates;
        map.flyTo({ center: center, zoom: 13.5 });
        popupFn(name, center);
      }
    };
    container.appendChild(item);
  });
}

// Global UI Layout listeners 
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('legend-toggle');
  const resetBtn = document.getElementById('reset-legend');
  const overlay = document.getElementById('intro-overlay');
  const closeIntro = document.getElementById('close-intro');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const panel = document.getElementById('legend-panel');
      panel.classList.toggle('collapsed');
      toggleBtn.textContent = panel.classList.contains('collapsed') ? 'Show' : 'Hide';
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      map.flyTo({ center: [-73.94, 40.73], zoom: 11 });
    });
  }

  if (closeIntro && overlay) {
    closeIntro.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
  }
});