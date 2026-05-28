// Initialize Mapbox Engine
mapboxgl.accessToken = 'pk.eyJ1IjoiZmx1c2hpbmd0b3duaGFsbCIsImEiOiJjbWRmZHFxb2EwY2p3MmlxM3JoMmJwNDVrIn0.KDnT79yQuUeYVaqcKlmQGQ';
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-73.94, 40.73],
  zoom: 11
});

// Map Utilities Custom Bindings
map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
map.addControl(new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
}), 'top-right');

// Airtable Database Configuration Setup
const AIRTABLE_API_KEY = 'patboskAQTJUi9FlQ.1c30c3c632cd4d7bd03cf949e50edd922425aba8dcbf0c8a6002e98db67c74a3';
const BASE_ID = 'apppBx0a9hj0Z1ciw';
const TABLE_NAME = 'tblgqyoE5TZUzQDKw';
const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`;

// Zip Code Crosswalk to NTA Neighborhood Names
const ZIP_TO_NTA = {
  "11101": "Long Island City-Hunter's Point-Sunnyside Yards",
  "11102": "Astoria (Central)",
  "11103": "Astoria (East)-Steinway",
  "11104": "Sunnyside",
  "11105": "Astoria (North)-Ditmars-Steinway",
  "11106": "Astoria (West)",
  "11354": "Flushing",
  "11355": "Flushing",
  "11356": "College Point",
  "11357": "Whitestone",
  "11358": "Flushing",
  "11360": "Bayside-Bayside Hills",
  "11361": "Bayside-Bayside Hills",
  "11362": "Douglaston-Little Neck",
  "11363": "Douglaston-Little Neck",
  "11364": "Oakland Gardens",
  "11365": "Fresh Meadows-Utopia",
  "11366": "Fresh Meadows-Utopia",
  "11367": "Kew Gardens Hills",
  "11368": "Corona",
  "11369": "Airport",
  "11370": "Jackson Heights",
  "11371": "Airport",
  "11372": "Jackson Heights",
  "11373": "Elmhurst",
  "11374": "Rego Park",
  "11375": "Forest Hills",
  "11377": "Woodside",
  "11378": "Maspath",
  "11379": "Middle Village",
  "11385": "Ridgewood",
  "11411": "Cambria Heights",
  "11412": "St. Albans",
  "11413": "Laurelton",
  "11414": "Howard Beach-Ozone Park",
  "11415": "Kew Gardens",
  "11416": "Ozone Park",
  "11417": "Ozone Park",
  "11418": "Richmond Hill",
  "11419": "Richmond Hill",
  "11420": "South Ozone Park",
  "11421": "Woodhaven",
  "11422": "Rosedale",
  "11423": "Hollis",
  "11426": "Bellerose",
  "11427": "Queens Village",
  "11428": "Queens Village",
  "11429": "Queens Village",
  "11432": "Jamaica",
  "11433": "Jamaica",
  "11434": "Jamaica",
  "11435": "Jamaica",
  "11436": "Jamaica",
  "11691": "Far Rockaway-Bayswater",
  "11692": "Rockaway Beach-Arverne",
  "11693": "Rockaway Beach-Arverne",
  "11694": "Rockaway Park-Belle Harbor"
};

// Softr Neighborhood Links Routing Table
const SOFTR_LINKS = {
  "Flushing": "https://queensculturalmap.softr.app/flushing",
  "Astoria (Central)": "https://queensculturalmap.softr.app/astoria",
  "Astoria (East)-Steinway": "https://queensculturalmap.softr.app/astoria",
  "Astoria (West)": "https://queensculturalmap.softr.app/astoria",
  "Long Island City-Hunter's Point-Sunnyside Yards": "https://queensculturalmap.softr.app/lic",
  "Sunnyside": "https://queensculturalmap.softr.app/sunnyside",
  "Jamaica": "https://queensculturalmap.softr.app/jamaica",
  "Jackson Heights": "https://queensculturalmap.softr.app/jackson-heights",
  "Ridgewood": "https://queensculturalmap.softr.app/ridgewood",
  "Corona": "https://queensculturalmap.softr.app/corona",
  "Elmhurst": "https://queensculturalmap.softr.app/elmhurst",
  "Forest Hills": "https://queensculturalmap.softr.app/forest-hills",
  "Woodside": "https://queensculturalmap.softr.app/woodside"
};

// Global Reactive State Storage
let directoryRecords = [];
let activeMarkers = [];
let uniqueNeighborhoods = [];
let enabledNeighborhoods = new Set();
let geoData = null; // Store boundary layer reference globally

// Map colors dynamically onto metrics ranges
const colorSpectrum = ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'];
const assignedColors = {};

// Fetch Directory Records from Airtable API
async function fetchDirectory() {
  let entries = [];
  let token = null;
  const approvedFormula = encodeURIComponent("{Approved}=TRUE()");
  
  try {
    do {
      const endpoint = `${AIRTABLE_URL}?filterByFormula=${approvedFormula}${token ? `&offset=${token}` : ''}`;
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
      const payload = await response.json();
      entries = entries.concat(payload.records || []);
      token = payload.offset || null;
    } while (token);
    return entries.map(item => ({ id: item.id, ...item.fields }));
  } catch (err) {
    console.error("Directory context initialization failed:", err);
    return [];
  }
}

// Safely generate coordinates lookup helper using crosswalk matching mapping rules
function getNeighborhoodNameFromRecord(record) {
  if (record.Neighborhood) return record.Neighborhood;
  let zip = String(record.Zip_Code || record["Zip Code"] || "").trim();
  if (!zip && Array.isArray(record.Zip)) zip = String(record.Zip[0]);
  return ZIP_TO_NTA[zip] || "Other / Unassigned";
}

// Generate Pins onto Map layers contextually filtered by checkboxes
function injectDirectoryMarkers() {
  activeMarkers.forEach(m => m.remove());
  activeMarkers = [];

  directoryRecords.forEach(record => {
    const lat = parseFloat(record.Latitude);
    const lng = parseFloat(record.Longitude);
    const hood = getNeighborhoodNameFromRecord(record);

    if (isNaN(lat) || isNaN(lng)) return;
    if (!enabledNeighborhoods.has(hood)) return;

    const markerEl = document.createElement('div');
    markerEl.style.width = '14px';
    markerEl.style.height = '14px';
    markerEl.style.backgroundColor = '#ff4d4d'; // Stand out distinct pins overlaying shades
    markerEl.style.borderRadius = '50%';
    markerEl.style.border = '2px solid white';
    markerEl.style.boxShadow = '0 0 5px rgba(0,0,0,0.4)';
    markerEl.style.cursor = 'pointer';

    const textLabel = record["Org Name"] || record["Name"] || "Unnamed Space";
    const infoPopup = new mapboxgl.Popup({ offset: 12 }).setHTML(`
      <div style="font-family: Arial, sans-serif; padding: 4px; max-width: 220px;">
        <h4 style="margin: 0 0 4px 0; font-size:13px; color:#111; font-weight:bold;">${textLabel}</h4>
        <p style="margin: 0 0 2px 0; font-size:11px; color:#ff4d4d;">📍 ${hood}</p>
        <p style="margin: 0; font-size:11px; color:#555;">${record.Address || ''}</p>
      </div>
    `);

    const finalPin = new mapboxgl.Marker({ element: markerEl })
      .setLngLat([lng, lat])
      .setPopup(infoPopup)
      .addTo(map);

    activeMarkers.push(finalPin);
  });
}

// Refresh dynamic map filter conditions and polygon configurations
function updateMapChoroplethColors() {
  if (!map.getSource('queens-neighborhoods') || !geoData) return;

  const matchExpression = ['match', ['get', 'ntaname']];

  geoData.features.forEach(feature => {
    const name = feature.properties.ntaname;
    if (enabledNeighborhoods.has(name)) {
      matchExpression.push(name, assignedColors[name] || 'rgba(0,0,0,0)');
    } else {
      matchExpression.push(name, 'rgba(0,0,0,0)'); // Transparent if unchecked
    }
  });

  matchExpression.push('rgba(0,0,0,0)'); // Fallback condition rule parsing argument safely
  map.setPaintProperty('neighborhood-layer-fill', 'fill-color', matchExpression);
}

// Initialize Map loading processes completely
map.on('load', async () => {
  directoryRecords = await fetchDirectory();

  // Compute metrics allocations across matching regions
  const countsByNeighborhood = {};
  directoryRecords.forEach(r => {
    const hood = getNeighborhoodNameFromRecord(r);
    countsByNeighborhood[hood] = (countsByNeighborhood[hood] || 0) + 1;
  });

  // Keep checkbox lists filtered down explicitly to locations containing registered actors
  uniqueNeighborhoods = Object.keys(countsByNeighborhood).filter(n => n !== "Other / Unassigned").sort();
  uniqueNeighborhoods.forEach(n => enabledNeighborhoods.add(n));

  // Distribute color values cleanly across proportional density values ranges 
  uniqueNeighborhoods.forEach((name, index) => {
    const count = countsByNeighborhood[name] || 0;
    let colorIdx = 0;
    if (count > 25) colorIdx = 7;
    else if (count > 15) colorIdx = 6;
    else if (count > 10) colorIdx = 5;
    else if (count > 5) colorIdx = 4;
    else if (count > 3) colorIdx = 3;
    else if (count > 2) colorIdx = 2;
    else if (count > 1) colorIdx = 1;
    
    assignedColors[name] = colorSpectrum[colorIdx];
  });

  // Construct artificial bounds data fallback safely geometry mapping logic
  const generatedFeatures = uniqueNeighborhoods.map((name, i) => {
    const offset = i * 0.015;
    return {
      type: "Feature",
      properties: { ntaname: name, artist_count: countsByNeighborhood[name] || 0 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-73.95 + offset, 40.72 + offset],
          [-73.93 + offset, 40.72 + offset],
          [-73.93 + offset, 40.74 + offset],
          [-73.95 + offset, 40.74 + offset],
          [-73.95 + offset, 40.72 + offset]
        ]]
      }
    };
  });

  geoData = { type: "FeatureCollection", features: generatedFeatures };

  // Add Dynamic Geometry Datasets Layers directly
  map.addSource('queens-neighborhoods', { type: 'geojson', data: geoData });
  map.addLayer({
    id: 'neighborhood-layer-fill',
    type: 'fill',
    source: 'queens-neighborhoods',
    paint: { 'fill-opacity': 0.65 }
  });

  map.addLayer({
    id: 'neighborhood-layer-outline',
    type: 'line',
    source: 'queens-neighborhoods',
    paint: { 'line-color': '#4a4a4a', 'line-width': 1.2 }
  });

  // Polygon Click Events: Opens softr redirection links pop-ups safely
  map.on('click', 'neighborhood-layer-fill', (e) => {
    if (!e.features.length) return;
    const name = e.features[0].properties.ntaname;
    const count = e.features[0].properties.artist_count || 0;
    const redirectUrl = SOFTR_LINKS[name] || "https://queensculturalmap.softr.app";

    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="font-family:sans-serif; padding:6px; min-width:180px;">
          <h3 style="margin:0 0 4px 0; font-size:14px; color:#111;">${name}</h3>
          <p style="margin:0 0 8px 0; font-size:12px; color:#666;">Total Artists: <b>${count}</b></p>
          <a href="${redirectUrl}" target="_blank" style="display:inline-block; background:#007bff; color:white; padding:5px 10px; border-radius:4px; text-decoration:none; font-size:11px; font-weight:bold;">View Directory Directory List ↗</a>
        </div>
      `)
      .addTo(map);
  });

  map.on('mouseenter', 'neighborhood-layer-fill', () => map.getCanvas().style.cursor = 'pointer');
  map.on('mouseleave', 'neighborhood-layer-fill', () => map.getCanvas().style.cursor = '');

  // Setup Subway networks mapping layers configurations parameters
  map.addSource('subway-routes', { type: 'geojson', data: 'nyc-subway-routes.geojson' });
  map.addSource('subway-stops', { type: 'geojson', data: 'nyc-subway-stops.geojson' });

  map.addLayer({
    id: 'subway-lines',
    type: 'line',
    source: 'subway-routes',
    paint: {
      'line-width': 2,
      'line-color': [
        'match', ['get', 'rt_symbol'],
        '1', '#EE352E', '2', '#EE352E', '3', '#EE352E',
        '4', '#00933C', '5', '#00933C', '6', '#00933C',
        'A', '#2850AD', 'C', '#2850AD', 'E', '#2850AD',
        'B', '#FF6319', 'D', '#FF6319', 'F', '#FF6319', 'M', '#FF6319',
        'N', '#FCCC0A', 'Q', '#FCCC0A', 'R', '#FCCC0A', 'W', '#FCCC0A',
        '7', '#B933AD', '#777777'
      ]
    }
  });

  map.addLayer({
    id: 'subway-stations',
    type: 'circle',
    source: 'subway-stops',
    paint: {
      'circle-radius': 5,
      'circle-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#000000'
    }
  });

  injectDirectoryMarkers();
  updateMapChoroplethColors();
  buildDynamicChecklistLegend();
  initializeSearchAutoComplete();
});

// Build Dynamic Checklist Component layout mapping
function buildDynamicChecklistLegend() {
  const container = document.getElementById('legend');
  if (!container) return;

  container.innerHTML = '<h3 style="margin: 0 0 10px 0; font-size:13px; border-bottom:1px solid #eee; padding-bottom:4px; color:#333;">Filter Neighborhoods</h3>';

  uniqueNeighborhoods.forEach(name => {
    const row = document.createElement('div');
    row.className = 'neighborhood-legend-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'neighborhood-checkbox';
    checkbox.checked = enabledNeighborhoods.has(name);

    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        enabledNeighborhoods.add(name);
      } else {
        enabledNeighborhoods.delete(name);
      }
      injectDirectoryMarkers();
      updateMapChoroplethColors();
    });

    const swatch = document.createElement('div');
    swatch.className = 'neighborhood-color-swatch';
    swatch.style.backgroundColor = assignedColors[name] || '#ccc';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'neighborhood-text-link';
    labelSpan.textContent = name;

    labelSpan.addEventListener('click', () => {
      const targetPoint = directoryRecords.find(r => getNeighborhoodNameFromRecord(r) === name && !isNaN(parseFloat(r.Latitude)));
      if (targetPoint) {
        map.flyTo({ center: [parseFloat(targetPoint.Longitude), parseFloat(targetPoint.Latitude)], zoom: 13.5, essential: true });
      }
    });

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(labelSpan);
    container.appendChild(row);
  });
}

// Instant Drop-Down Auto-Suggestion Search Repair Fix
function initializeSearchAutoComplete() {
  const inputElement = document.getElementById('search-input');
  const feedbackContainer = document.getElementById('search-results');

  if (!inputElement || !feedbackContainer) return;

  inputElement.addEventListener('input', (e) => {
    const searchString = e.target.value.trim().toLowerCase();
    feedbackContainer.innerHTML = '';

    if (!searchString) return;

    // Fuzzy matching scanning logic parameters fields validation parsing rules
    const matchedRecords = directoryRecords.filter(item => {
      const name = (item["Org Name"] || item["Name"] || "").toLowerCase();
      const tags = (item["Tags"] || item["Artistic Disciplines"] || "").toLowerCase();
      const location = getNeighborhoodNameFromRecord(item).toLowerCase();
      return name.includes(searchString) || tags.includes(searchString) || location.includes(searchString);
    });

    if (matchedRecords.length === 0) {
      const emptyRow = document.createElement('div');
      emptyRow.className = 'search-suggestion-item';
      emptyRow.style.color = '#999';
      emptyRow.textContent = 'No matching listings found';
      feedbackContainer.appendChild(emptyRow);
      return;
    }

    matchedRecords.slice(0, 8).forEach(item => {
      const optionNode = document.createElement('div');
      optionNode.className = 'search-suggestion-item';
      
      const title = item["Org Name"] || item["Name"] || "Unknown Space";
      const subInfo = getNeighborhoodNameFromRecord(item);
      optionNode.innerHTML = `<strong>${title}</strong> <span style="float:right; font-size:11px; color:#777;">${subInfo}</span>`;

      optionNode.addEventListener('click', () => {
        inputElement.value = title;
        feedbackContainer.innerHTML = '';

        const recordLat = parseFloat(item.Latitude);
        const recordLng = parseFloat(item.Longitude);

        if (!isNaN(recordLat) && !isNaN(recordLng)) {
          if (!enabledNeighborhoods.has(subInfo)) {
            enabledNeighborhoods.add(subInfo);
            buildDynamicChecklistLegend();
            updateMapChoroplethColors();
            injectDirectoryMarkers();
          }

          map.flyTo({ center: [recordLng, recordLat], zoom: 15, essential: true });

          new mapboxgl.Popup()
            .setLngLat([recordLng, recordLat])
            .setHTML(`
              <div style="font-family:sans-serif; max-width:200px; padding:2px;">
                <h3 style="margin:0 0 4px 0; font-size:13px; font-weight:bold;">${title}</h3>
                <p style="margin:0; font-size:11px; color:#666;">${item.Address || subInfo}</p>
              </div>
            `)
            .addTo(map);
        }
      });

      feedbackContainer.appendChild(optionNode);
    });
  });

  document.addEventListener('click', (event) => {
    if (!document.getElementById('address-search').contains(event.target)) {
      feedbackContainer.innerHTML = '';
    }
  });
}

// Component Actions Event Setup Bindings
document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('legend-panel');
  const toggleBtn = document.getElementById('legend-toggle');
  const resetBtn = document.getElementById('reset-legend');
  const introBtn = document.getElementById('close-intro');
  const guideBox = document.getElementById('map-guide-overlay');
  const guideClose = document.getElementById('map-guide-close');

  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      toggleBtn.textContent = panel.classList.contains('collapsed') ? 'Show' : 'Hide';
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      enabledNeighborhoods.clear();
      uniqueNeighborhoods.forEach(n => enabledNeighborhoods.add(n));
      buildDynamicChecklistLegend();
      updateMapChoroplethColors();
      injectDirectoryMarkers();
      if (document.getElementById('search-input')) document.getElementById('search-input').value = '';
      map.flyTo({ center: [-73.94, 40.73], zoom: 11 });
    });
  }

  if (introBtn) {
    introBtn.addEventListener('click', () => {
      document.getElementById('intro-overlay').style.display = 'none';
      if (guideBox) guideBox.style.display = 'flex';
    });
  }

  if (guideClose && guideBox) {
    guideClose.addEventListener('click', () => {
      guideBox.style.display = 'none';
    });
  }
});