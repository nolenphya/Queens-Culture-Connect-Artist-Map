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

// Global Application Reactive State Storage
let directoryRecords = [];
let neighborhoodGeoJSON = null;
let enabledNeighborhoods = new Set();
let activeMarkers = [];

// Color Palette configurations for the dynamic Choropleth setup
const colorSpectrum = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', 
  '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', 
  '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000'
];
const assignedColors = {};

// Asynchronous Request Manager - Airtable Directory Records Pull
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

// Asynchronous Request Manager - GeoJSON Boundary Outlines Fetcher
async function fetchBoundaries() {
  try {
    const asset = await fetch('queens_neighborhoods.geojson');
    return await asset.json();
  } catch (err) {
    console.error("GeoJSON boundaries database not found, initializing empty fallback geometry layer:", err);
    return { type: "FeatureCollection", features: [] };
  }
}

// Generate Pins onto Map layers 
function injectDirectoryMarkers() {
  // Clear any existing instances safely
  activeMarkers.forEach(m => m.remove());
  activeMarkers = [];

  directoryRecords.forEach(record => {
    const lat = parseFloat(record.Latitude);
    const lng = parseFloat(record.Longitude);
    const hood = record.Neighborhood || "";

    if (isNaN(lat) || isNaN(lng)) return;

    // Filter points contextually out if their parent neighborhood checkbox is hidden
    if (hood && !enabledNeighborhoods.has(hood)) return;

    // Build raw pin element node
    const markerEl = document.createElement('div');
    markerEl.style.width = '12px';
    markerEl.style.height = '12px';
    markerEl.style.backgroundColor = '#007bff';
    markerEl.style.borderRadius = '50%';
    markerEl.style.border = '2px solid white';
    markerEl.style.boxShadow = '0 0 4px rgba(0,0,0,0.4)';
    markerEl.style.cursor = 'pointer';

    const textLabel = record["Org Name"] || record["Name"] || "Unnamed Space";
    const infoPopup = new mapboxgl.Popup({ offset: 10 }).setHTML(`
      <div style="font-family: Arial, sans-serif; padding: 4px; max-width: 200px;">
        <h4 style="margin: 0 0 4px 0; font-size:13px; color:#111;">${textLabel}</h4>
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

// Map Loading Lifecycle
map.on('load', async () => {
  const [dataPayload, geoPayload] = await Promise.all([fetchDirectory(), fetchBoundaries()]);
  directoryRecords = dataPayload;
  neighborhoodGeoJSON = geoPayload;

  // Distribute specific distinct fill shade maps dynamically
  if (neighborhoodGeoJSON && neighborhoodGeoJSON.features) {
    neighborhoodGeoJSON.features.forEach((feat, index) => {
      const name = feat.properties.ntaname || "Unknown Area";
      assignedColors[name] = colorSpectrum[index % colorSpectrum.length];
      enabledNeighborhoods.add(name); // Default to selected state
    });
  }

  // Bind Polygon Layer Sources
  if (neighborhoodGeoJSON) {
    map.addSource('neighborhood-source', { type: 'geojson', data: neighborhoodGeoJSON });

    const colorExpression = ['match', ['get', 'ntaname']];
    Object.entries(assignedColors).forEach(([name, shade]) => {
      colorExpression.push(name, shade);
    });
    colorExpression.push('#cccccc'); // Fallback paint hex

    map.addLayer({
      id: 'neighborhood-layer-fill',
      type: 'fill',
      source: 'neighborhood-source',
      paint: { 'fill-color': colorExpression, 'fill-opacity': 0.35 }
    });

    map.addLayer({
      id: 'neighborhood-layer-stroke',
      type: 'line',
      source: 'neighborhood-source',
      paint: { 'line-color': '#444444', 'line-width': 1 }
    });
  }

  // --- RESTORE SUBWAY LINES & CLICKABLE POPUP STATIONS ---
  map.addSource('subway-routes', { type: 'geojson', data: 'nyc-subway-routes.geojson' });
  map.addSource('subway-stops', { type: 'geojson', data: 'nyc-subway-stops.geojson' });

  map.addLayer({
    id: 'subway-lines',
    type: 'line',
    source: 'subway-routes',
    paint: {
      'line-width': 2.5,
      'line-color': [
        'match', ['get', 'rt_symbol'],
        '1', '#EE352E', '2', '#EE352E', '3', '#EE352E',
        '4', '#00933C', '5', '#00933C', '6', '#00933C',
        'A', '#2850AD', 'C', '#2850AD', 'E', '#2850AD',
        'B', '#FF6319', 'D', '#FF6319', 'F', '#FF6319', 'M', '#FF6319',
        'N', '#FCCC0A', 'Q', '#FCCC0A', 'R', '#FCCC0A', 'W', '#FCCC0A',
        '7', '#B933AD', '#666666'
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
      'circle-stroke-color': '#222222'
    }
  });

  map.addLayer({
    id: 'subway-station-text',
    type: 'symbol',
    source: 'subway-stops',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'visibility': 'none' // Handled reactively by zoom level below
    },
    paint: {
      'text-color': '#333333',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2
    }
  });

  // Station pointer mouse updates
  map.on('mouseenter', 'subway-stations', () => map.getCanvas().style.cursor = 'pointer');
  map.on('mouseleave', 'subway-stations', () => map.getCanvas().style.cursor = '');

  // Click handler to open incoming lines popup summaries
  map.on('click', 'subway-stations', (e) => {
    if (!e.features.length) return;
    const props = e.features[0].properties;
    const name = props.name || "Station Hub";
    const routes = props.line || "Local Lines";

    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="font-family:sans-serif; padding:2px;">
          <h4 style="margin:0 0 4px 0; font-size:13px;">🚇 ${name}</h4>
          <p style="margin:0; font-size:11px; color:#444;"><b>Routes:</b> ${routes}</p>
        </div>
      `)
      .addTo(map);
  });

  // Sync initial setup states
  injectDirectoryMarkers();
  buildDynamicChecklistLegend();
});

// Zoom Listener Loop to Toggle Station Labels dynamically past zoom level 14
map.on('zoom', () => {
  if (map.getLayer('subway-station-text')) {
    map.setLayoutProperty('subway-station-text', 'visibility', map.getZoom() >= 14 ? 'visible' : 'none');
  }
});

// --- INDIVIDUAL NEIGHBORHOOD CHECKBOX TOGGLE GENERATION ---
function buildDynamicChecklistLegend() {
  const container = document.getElementById('legend');
  if (!container) return;

  container.innerHTML = '<h3 style="margin: 0 0 10px 0; font-size:14px;">Neighborhood Toggles</h3>';

  Object.keys(assignedColors).sort().forEach(name => {
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
      refreshMapFiltersAndPins();
    });

    const swatch = document.createElement('div');
    swatch.className = 'neighborhood-color-swatch';
    swatch.style.backgroundColor = assignedColors[name];

    const labelSpan = document.createElement('span');
    labelSpan.className = 'neighborhood-text-link';
    labelSpan.textContent = name;

    // Use Turf computation values to pan directly onto regions when clicking names
    labelSpan.addEventListener('click', () => {
      if (neighborhoodGeoJSON) {
        const targetFeature = neighborhoodGeoJSON.features.find(f => (f.properties.ntaname || '').toLowerCase() === name.toLowerCase());
        if (targetFeature) {
          const boundingCenter = turf.center(targetFeature).geometry.coordinates;
          map.flyTo({ center: boundingCenter, zoom: 13.5, essential: true });
        }
      }
    });

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(labelSpan);
    container.appendChild(row);
  });
}

// Processes visibility filters on Mapbox layers using active arrays
function refreshMapFiltersAndPins() {
  if (!map.getLayer('neighborhood-layer-fill')) return;

  if (enabledNeighborhoods.size === 0) {
    const clearExpr = ['==', ['get', 'ntaname'], 'EMPTY_STATE_VALUE'];
    map.setFilter('neighborhood-layer-fill', clearExpr);
    map.setFilter('neighborhood-layer-stroke', clearExpr);
  } else {
    const activeList = Array.from(enabledNeighborhoods);
    const filterExpr = ['in', ['get', 'ntaname'], ['literal', activeList]];
    map.setFilter('neighborhood-layer-fill', filterExpr);
    map.setFilter('neighborhood-layer-stroke', filterExpr);
  }
  
  // Refresh map pins visibility
  injectDirectoryMarkers();
}

// --- RESTORE AUTO-SUGGESTION SEARCH DROPDOWN ENGINE ---
const inputElement = document.getElementById('search-input');
const feedbackContainer = document.getElementById('search-results');

if (inputElement && feedbackContainer) {
  inputElement.addEventListener('input', (e) => {
    const searchString = e.target.value.trim().toLowerCase();
    feedbackContainer.innerHTML = ''; // Flush preceding list items

    if (!searchString) return;

    const matchedRecords = directoryRecords.filter(item => {
      const name = (item["Org Name"] || item["Name"] || "").toLowerCase();
      const tags = (item["Tags"] || "").toLowerCase();
      const location = (item["Neighborhood"] || "").toLowerCase();
      return name.includes(searchString) || tags.includes(searchString) || location.includes(searchString);
    });

    if (matchedRecords.length === 0) {
      const emptyRow = document.createElement('div');
      emptyRow.className = 'search-suggestion-item';
      emptyRow.style.color = '#888';
      emptyRow.textContent = 'No matching spaces found';
      feedbackContainer.appendChild(emptyRow);
      return;
    }

    // Render slice maximum limit of 8 items for a clean overlay layout
    matchedRecords.slice(0, 8).forEach(item => {
      const optionNode = document.createElement('div');
      optionNode.className = 'search-suggestion-item';
      
      const title = item["Org Name"] || item["Name"] || "Unknown Space";
      const subInfo = item["Neighborhood"] || "Queens";
      optionNode.innerHTML = `<strong>${title}</strong> <span style="float:right; font-size:11px; color:#777;">${subInfo}</span>`;

      // Handle item selection clicks
      optionNode.addEventListener('click', () => {
        inputElement.value = title;
        feedbackContainer.innerHTML = '';

        const recordLat = parseFloat(item.Latitude);
        const recordLng = parseFloat(item.Longitude);

        if (!isNaN(recordLat) && !isNaN(recordLng)) {
          map.flyTo({ center: [recordLng, recordLat], zoom: 15, essential: true });

          new mapboxgl.Popup()
            .setLngLat([recordLng, recordLat])
            .setHTML(`
              <div style="font-family:sans-serif; max-width:200px;">
                <h3 style="margin:0 0 4px 0; font-size:13px;">${title}</h3>
                ${item.Address ? `<p style="margin:0; font-size:11px; color:#555;">${item.Address}</p>` : ''}
              </div>
            `)
            .addTo(map);
        }
      });

      feedbackContainer.appendChild(optionNode);
    });
  });
}

// Click listener to close the dropdown list overlay automatically when clicking out-of-bounds
document.addEventListener('click', (event) => {
  if (feedbackContainer && !document.getElementById('address-search').contains(event.target)) {
    feedbackContainer.innerHTML = '';
  }
});

// Layout Overlay Transitions and General Reset Event Wireframes
document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('legend-panel');
  const toggleBtn = document.getElementById('legend-toggle');
  const resetBtn = document.getElementById('reset-legend');
  const introBtn = document.getElementById('close-intro');
  const guideBox = document.getElementById('map-guide-overlay');
  const guideClose = document.getElementById('map-guide-close');
  const infoFab = document.getElementById('info-button');

  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      toggleBtn.textContent = panel.classList.contains('collapsed') ? 'Show' : 'Hide';
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      enabledNeighborhoods.clear();
      Object.keys(assignedColors).forEach(n => enabledNeighborhoods.add(n));
      buildDynamicChecklistLegend();
      refreshMapFiltersAndPins();

      if (inputElement) inputElement.value = '';
      if (feedbackContainer) feedbackContainer.innerHTML = '';

      map.flyTo({ center: [-73.94, 40.73], zoom: 11 });
    });
  }

  if (introBtn) {
    introBtn.addEventListener('click', () => {
      document.getElementById('intro-overlay').style.display = 'none';
      if (guideBox) guideBox.style.display = 'flex';
    });
  }

  if (infoFab && guideBox) {
    infoFab.addEventListener('click', () => {
      guideBox.style.display = 'flex';
    });
  }

  if (guideClose && guideBox) {
    guideClose.addEventListener('click', () => {
      guideBox.style.display = 'none';
    });
  }
});