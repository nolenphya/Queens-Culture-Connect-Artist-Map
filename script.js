// Mapbox Setup
mapboxgl.accessToken = 'pk.eyJ1IjoiZmx1c2hpbmd0b3duaGFsbCIsImEiOiJjbWRmZHFxb2EwY2p3MmlxM3JoMmJwNDVrIn0.KDnT79yQuUeYVaqcKlmQGQ';
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-73.94, 40.73],
  zoom: 11
});

// Control Utilities
map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
map.addControl(new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
}), 'top-right');

// Airtable Setup
const AIRTABLE_API_KEY = 'patboskAQTJUi9FlQ.1c30c3c632cd4d7bd03cf949e50edd922425aba8dcbf0c8a6002e98db67c74a3';
const BASE_ID = 'apppBx0a9hj0Z1ciw';
const TABLE_NAME = 'tblgqyoE5TZUzQDKw';
const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`;

// Icon mapping for tags
const iconMap = {
  'Community Garden': 'community-garden',
  'Gallery': 'gallery',
  'Museum/Cultural Institution': 'museum',
  'Music Group/Vocal Ensembles': 'music-group-vocal-ensemble',
  'Dance Company': 'dance-studio',
  'Multidisciplinary Arts Center': 'multidisciplinary-arts-center',
  'Community Center': 'community-center',
  'Theatre': 'theatre',
  'Video-Film Company': 'video-film-company',
  'Art Center-Studio': 'art-center-studio',
  'Cultural Arts Center': 'cultural-arts-center',
  'Historical Society-Preservation Group': 'archive'
};

// Global Memory State Variables
let allMarkers = [];
const colorMap = {};
const colorPalette = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8',
  '#f58231', '#911eb4', '#46f0f0', '#f032e6',
  '#bcf60c', '#fabebe', '#008080', '#e6beff'
];

// Tracking Set to define explicitly hidden tags for independent toggles
let hiddenTags = new Set();

function getColorFor(tag) {
  if (!colorMap[tag]) {
    const index = Object.keys(colorMap).length % colorPalette.length;
    colorMap[tag] = colorPalette[index];
  }
  return colorMap[tag];
}

// Data Fetch Engine
async function fetchData() {
  const filterFormula = encodeURIComponent("{Approved}=TRUE()");
  const viewName = encodeURIComponent("main");
  let allRecords = [];
  let offset = null;

  try {
    do {
      const fetchUrl = `${AIRTABLE_URL}?view=${viewName}&filterByFormula=${filterFormula}${offset ? `&offset=${offset}` : ""}`;
      const res = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });

      if (!res.ok) {
        console.error(`Airtable Error (${res.status}):`, await res.text());
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

// Marker Creator and Legend Bind Utility
function createMarkers(data) {
  allMarkers.forEach(m => m.remove());
  allMarkers = [];

  const tagGroups = {};

  data.forEach((row) => {
    const lat = parseFloat(row.Latitude);
    const lng = parseFloat(row.Longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    const tags = (row.Tags || "").split(',').map(t => t.trim()).filter(Boolean);
    const primaryTag = tags[0] || 'Uncategorized';
    const iconKey = iconMap[primaryTag] || 'default';

    const el = document.createElement('div');
    el.style.backgroundImage = `url(icons/${iconKey}.png)`;
    el.style.width = '32px';
    el.style.height = '32px';
    el.style.backgroundSize = 'contain';
    el.style.backgroundRepeat = 'no-repeat';

    const label = document.createElement('div');
    label.className = 'marker-label';
    label.innerText = row["Org Name"] || "Unnamed";
    label.style.position = 'absolute';
    label.style.top = '36px';
    label.style.left = '50%';
    label.style.transform = 'translateX(-50%)';
    label.style.whiteSpace = 'nowrap';
    label.style.backgroundColor = 'rgba(255,255,255,0.8)';
    label.style.padding = '2px 6px';
    label.style.borderRadius = '4px';
    label.style.fontSize = '12px';
    label.style.display = 'none';
    el.appendChild(label);

    const imageUrl = Array.isArray(row.Image) && row.Image.length > 0 ? row.Image[0].url : '';

    const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
      <div style="max-width: 250px;">
        ${imageUrl ? `<img src="${imageUrl}" alt="${row["Org Name"]}" style="width: 100%; margin-bottom: 10px;">` : ''}
        <h3>${row["Org Name"] || "Untitled"}</h3>
        ${row.Description ? `<p>${row.Description}</p>` : ''}
        ${row.Address ? `<p><b>Address:</b><br>${row.Address}</p>` : ''}
        ${row.Email ? `<p><b>Email:</b> <a href="mailto:${row.Email}">${row.Email}</a></p>` : ''}
        ${row.Website ? `<p><a href="${row.Website}" target="_blank">Website</a></p>` : ''}
        ${row.Social ? `<p><a href="${row.Social}" target="_blank">Social</a></p>` : ''}
      </div>
    `);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(map);

    marker.labelElement = label;
    marker.rowData = row;
    allMarkers.push(marker);

    tags.forEach(tag => {
      if (!tagGroups[tag]) tagGroups[tag] = [];
      tagGroups[tag].push(marker);
    });
  });

  buildLegend(tagGroups);
}

// UPDATE 2: Individual Category/Neighborhood Tag Level Checkbox Control Logic
function buildLegend(tagGroups) {
  const container = document.getElementById('legend');
  if (!container) return;
  container.innerHTML = '<h3>Categories Directory</h3>';

  Object.entries(tagGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([tag, markers]) => {
      const iconKey = iconMap[tag] || 'default';

      const section = document.createElement('div');
      section.className = 'legend-category';

      const headerDiv = document.createElement('div');
      headerDiv.className = 'legend-category-header';

      // Checklist control targeting specifically this tag group layout status
      const categoryCheckbox = document.createElement('input');
      categoryCheckbox.type = 'checkbox';
      categoryCheckbox.checked = !hiddenTags.has(tag);
      categoryCheckbox.style.cursor = 'pointer';

      const arrowSpan = document.createElement('span');
      arrowSpan.className = 'arrow';
      arrowSpan.textContent = '▾ ';
      arrowSpan.style.cursor = 'pointer';

      const titleLabel = document.createElement('span');
      titleLabel.textContent = `${tag} (${markers.length})`;
      titleLabel.style.cursor = 'pointer';

      headerDiv.appendChild(categoryCheckbox);
      headerDiv.appendChild(arrowSpan);
      headerDiv.appendChild(titleLabel);

      const list = document.createElement('ul');
      list.className = 'legend-org-list';
      list.style.display = 'block';

      // Sort alpha
      markers.sort((a, b) => {
        const nameA = (a.rowData["Org Name"] || "").toLowerCase();
        const nameB = (b.rowData["Org Name"] || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });

      markers.forEach(marker => {
        const li = document.createElement('li');

        const icon = document.createElement('img');
        icon.src = `icons/${iconKey}.png`;
        icon.style.width = '18px';
        icon.style.height = '18px';
        icon.style.verticalAlign = 'middle';

        const label = document.createElement('span');
        label.textContent = marker.rowData["Org Name"] || "Unnamed";
        label.style.cursor = 'pointer';
        label.style.textDecoration = 'underline';

        label.addEventListener('click', () => {
          map.flyTo({ center: marker.getLngLat(), zoom: 15, essential: true });
          marker.togglePopup();
        });

        li.appendChild(icon);
        li.appendChild(label);
        list.appendChild(li);
      });

      // Update marker state based on selection change
      categoryCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          hiddenTags.delete(tag);
        } else {
          hiddenTags.add(tag);
        }
        updateMarkerVisibility();
      });

      // Collapse click events bound onto text strings elements
      const toggleCollapse = () => {
        const collapsed = list.style.display === 'none';
        list.style.display = collapsed ? 'block' : 'none';
        arrowSpan.textContent = collapsed ? '▾ ' : '▸ ';
      };
      
      titleLabel.addEventListener('click', toggleCollapse);
      arrowSpan.addEventListener('click', toggleCollapse);

      section.appendChild(headerDiv);
      section.appendChild(list);
      container.appendChild(section);
    });
}

// Visibility manager assessing intersection conditions across active checklists
function updateMarkerVisibility() {
  allMarkers.forEach(marker => {
    const tags = (marker.rowData.Tags || "").split(',').map(t => t.trim()).filter(Boolean);
    // Hide if ALL tags assigned to this entry are explicitly turned off by checkbox arrays
    const missingAllVisibility = tags.every(t => hiddenTags.has(t));
    
    marker.getElement().style.display = missingAllVisibility ? 'none' : 'block';
  });
}

// UPDATE 3: Instant Suggestion Dropdown Auto-Complete Setup Listener Loop
document.getElementById('search-input').addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();
  const resultsContainer = document.getElementById('search-results');
  resultsContainer.innerHTML = '';

  if (!query) return;

  const matches = allMarkers.filter(marker => {
    const name = (marker.rowData["Org Name"] || "").toLowerCase();
    const tags = (marker.rowData.Tags || "").toLowerCase();
    return name.includes(query) || tags.includes(query);
  });

  if (matches.length === 0) {
    const noResult = document.createElement('div');
    noResult.className = 'search-suggestion-item';
    noResult.style.color = '#888';
    noResult.textContent = 'No matches found.';
    resultsContainer.appendChild(noResult);
    return;
  }

  // Create fly-to anchor links dynamically inside suggestion drop list
  matches.slice(0, 10).forEach(marker => {
    const item = document.createElement('div');
    item.className = 'search-suggestion-item';
    item.textContent = marker.rowData["Org Name"] || "Unnamed";
    
    item.addEventListener('click', () => {
      map.flyTo({ center: marker.getLngLat(), zoom: 15, essential: true });
      marker.togglePopup();
      resultsContainer.innerHTML = ''; // Clear after select action
      document.getElementById('search-input').value = marker.rowData["Org Name"] || "";
    });
    resultsContainer.appendChild(item);
  });
});

// Close suggestions dropdown when user clicks away
document.addEventListener('click', (e) => {
  if (!document.getElementById('address-search').contains(e.target)) {
    document.getElementById('search-results').innerHTML = '';
  }
});

// Keydown listener tracking direct Enter interactions
document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const query = e.target.value.trim().toLowerCase();
    if (!query) return;

    const match = allMarkers.find(marker => {
      const name = (marker.rowData["Org Name"] || "").toLowerCase();
      const tags = (marker.rowData.Tags || "").toLowerCase();
      return name.includes(query) || tags.includes(query);
    });

    if (match) {
      map.flyTo({ center: match.getLngLat(), zoom: 15, essential: true });
      match.togglePopup();
      document.getElementById('search-results').innerHTML = '';
    }
  }
});

// Map Engine Layer Initializer
map.on('load', () => {
  // Load Icons
  Object.values(iconMap).forEach(iconName => {
    map.loadImage(`icons/${iconName}.png`, (error, image) => {
      if (!error && !map.hasImage(iconName)) map.addImage(iconName, image);
    });
  });

  // Fetch Markers
  fetchData().then(records => {
    const data = records.map(r => ({ id: r.id, ...r.fields }));
    createMarkers(data);
  });

  // UPDATE 1a: Restore Subway GeoJSON Data Sources
  map.addSource('subway-lines', { type: 'geojson', data: 'nyc-subway-routes.geojson' });
  map.addSource('subway-stops', { type: 'geojson', data: 'nyc-subway-stops.geojson' });

  // Add Subway Line Styles
  map.addLayer({
    id: 'subway-lines-layer',
    type: 'line',
    source: 'subway-lines',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-width': 2,
      'line-color': [
        'match', ['get', 'rt_symbol'],
        '1', '#EE352E', '2', '#EE352E', '3', '#EE352E',
        '4', '#00933C', '5', '#00933C', '6', '#00933C',
        'A', '#2850AD', 'C', '#2850AD', 'E', '#2850AD',
        'B', '#FF6319', 'D', '#FF6319', 'F', '#FF6319', 'M', '#FF6319',
        'N', '#FCCC0A', 'Q', '#FCCC0A', 'R', '#FCCC0A', 'W', '#FCCC0A',
        'L', '#A7A9AC', 'G', '#6CBE45', 'J', '#996633', 'Z', '#996633',
        '7', '#B933AD', '#000000'
      ]
    }
  });

  // Add Stop Circles Layer
  map.addLayer({
    id: 'subway-stations-stops',
    type: 'circle',
    source: 'subway-stops',
    paint: {
      'circle-radius': 5,
      'circle-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#000000'
    }
  });

  // Station Text Label Layer Configuration
  map.addLayer({
    id: 'subway-station-labels',
    type: 'symbol',
    source: 'subway-stops',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'visibility': 'none'
    },
    paint: {
      'text-color': '#333333',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5
    }
  });

  // UPDATE 1b: Interactivity - Display station popups with full route details on user click
  map.on('click', 'subway-stations-stops', (e) => {
    if (!e.features.length) return;
    
    const props = e.features[0].properties;
    const name = props.name || "Unknown Station";
    const lines = props.line || "No route info";

    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="font-family: Arial, sans-serif; padding: 4px;">
          <h4 style="margin: 0 0 4px 0; color: #222; font-size:14px;">🚇 ${name}</h4>
          <p style="margin: 0; font-size: 12px; color: #555;"><b>Routes served:</b> ${lines}</p>
        </div>
      `)
      .addTo(map);
  });

  // Mouse hover feedback on stations
  map.on('mouseenter', 'subway-stations-stops', () => map.getCanvas().style.cursor = 'pointer');
  map.on('mouseleave', 'subway-stations-stops', () => map.getCanvas().style.cursor = '');
});

// Zoom level logic managing display updates for labels
map.on('zoom', () => {
  const zoomLevel = map.getZoom();
  
  if (map.getLayer('subway-station-labels')) {
    map.setLayoutProperty('subway-station-labels', 'visibility', zoomLevel >= 14 ? 'visible' : 'none');
  }

  allMarkers.forEach(marker => {
    if (marker.labelElement) {
      marker.labelElement.style.display = zoomLevel >= 14 ? 'block' : 'none';
    }
  });
});

// Setup Generic Global Reset Buttons View State
document.getElementById('reset-legend').addEventListener('click', () => {
  hiddenTags.clear();
  updateMarkerVisibility();
  
  // Re-check all checkboxes visually
  document.querySelectorAll('.legend-category-header input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
  });
  
  map.flyTo({ center: [-73.94, 40.73], zoom: 11 });
});

// Structural Interface UI Event Bindings
document.addEventListener('DOMContentLoaded', () => {
  const legendPanel = document.getElementById('legend-panel');
  const legendToggle = document.getElementById('legend-toggle');
  const mapGuideOverlay = document.getElementById('map-guide-overlay');
  const mapGuideClose = document.getElementById('map-guide-close');
  const infoButton = document.getElementById('info-button');

  if (legendToggle) {
    legendToggle.addEventListener('click', () => {
      legendPanel.classList.toggle('collapsed');
      legendToggle.textContent = legendPanel.classList.contains('collapsed') ? 'Show' : 'Hide';
    });
  }

  document.getElementById('close-intro').addEventListener('click', () => {
    document.getElementById('intro-overlay').style.display = 'none';
    if (mapGuideOverlay) mapGuideOverlay.style.display = 'flex';
  });

  if (infoButton) {
    infoButton.addEventListener('click', () => {
      if (mapGuideOverlay) mapGuideOverlay.style.display = 'flex';
    });
  }

  if (mapGuideClose) {
    mapGuideClose.addEventListener('click', () => {
      mapGuideOverlay.style.display = 'none';
    });
  }
});