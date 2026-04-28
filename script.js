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

// Globals
let allMarkers = [];
const colorMap = {};
const colorPalette = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8',
  '#f58231', '#911eb4', '#46f0f0', '#f032e6',
  '#bcf60c', '#fabebe', '#008080', '#e6beff'
];

function getColorFor(tag) {
  if (!colorMap[tag]) {
    const index = Object.keys(colorMap).length % colorPalette.length;
    colorMap[tag] = colorPalette[index];
  }
  return colorMap[tag];
}

// Fetch data
// =======================
// Data Fetching (with Pagination)
// =======================
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
      offset = data.offset || null; // Airtable gives a new offset if more pages exist
    } while (offset);

    return allRecords;

  } catch (err) {
    console.error("Fetch failed:", err);
    return allRecords;
  }
}

map.on('zoom', () => {
  const zoomLevel = map.getZoom();
  allMarkers.forEach(marker => {
    if (marker.labelElement) {
      marker.labelElement.style.display = zoomLevel >= 14 ? 'block' : 'none';
    }
  });
});


document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const query = e.target.value.trim().toLowerCase();
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = ''; // Clear old results

    if (!query) return;

    const matches = allMarkers.filter(marker => {
      const name = (marker.rowData["Org Name"] || "").toLowerCase();
      const tags = (marker.rowData.Tags || "").toLowerCase();
      return name.includes(query) || tags.includes(query);
    });

    if (matches.length === 0) {
      resultsContainer.innerHTML = '<p>No matches found.</p>';
      return;
    }

    // Optional: Zoom to first match
    const first = matches[0];
    map.flyTo({ center: first.getLngLat(), zoom: 14, essential: true });
    first.togglePopup();

    // Show results
    const list = document.createElement('ul');
    list.style.padding = '0';
    list.style.listStyle = 'none';

    matches.forEach(marker => {
      const li = document.createElement('li');
      li.style.marginBottom = '6px';

      const link = document.createElement('a');
      link.href = '#';
      link.textContent = marker.rowData["Org Name"] || "Unnamed";
      link.style.textDecoration = 'underline';
      link.style.color = '#007bff';
      link.addEventListener('click', (ev) => {
        ev.preventDefault();
        map.flyTo({ center: marker.getLngLat(), zoom: 15, essential: true });
        marker.togglePopup();
      });

      li.appendChild(link);
      list.appendChild(li);
    });

    resultsContainer.appendChild(list);
  }
});

document.getElementById('search-input').addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();
  const resultsContainer = document.getElementById('search-results');
  resultsContainer.innerHTML = ''; // Clear previous results

  if (!query) return;

  const matches = allMarkers.filter(marker => {
    const name = (marker.rowData["Org Name"] || "").toLowerCase();
    const tags = (marker.rowData.Tags || "").toLowerCase();
    return name.includes(query) || tags.includes(query);
  });

  if (matches.length === 0) {
    resultsContainer.innerHTML = '<p>No matches found.</p>';
    return;
  }

  const list = document.createElement('ul');
  list.style.padding = '0';
  list.style.listStyle = 'none';

  matches.forEach(marker => {
    const li = document.createElement('li');
    li.style.marginBottom = '6px';

    const link = document.createElement('a');
    link.href = '#';
    link.textContent = marker.rowData["Org Name"] || "Unnamed";
    link.style.textDecoration = 'underline';
    link.style.color = '#007bff';

    link.addEventListener('click', (ev) => {
      ev.preventDefault();
      map.flyTo({ center: marker.getLngLat(), zoom: 15, essential: true });
      marker.togglePopup();
    });

    li.appendChild(link);
    list.appendChild(li);
  });

  resultsContainer.appendChild(list);
});



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
      match.togglePopup(); // ensure popup is toggled open
    } else {
      alert("No matching organization or tag found.");
    }
  }
});


function buildNeighborhoodSidebar(groups, neighborhoods) {
  const container = document.getElementById('legend'); // reuse your legend div
  container.innerHTML = '<h3>Neighborhoods</h3>';

  Object.keys(groups).forEach(name => {
    const count = groups[name].length;

    const div = document.createElement('div');
    div.style.cursor = 'pointer';
    div.style.marginBottom = '6px';

    div.innerHTML = `<strong>${name}</strong> (${count})`;

    div.onclick = () => {
      const feature = neighborhoods.features.find(
        f => f.properties.neighborhood === name
      );

      const bbox = turf.bbox(feature);
      map.fitBounds(bbox, { padding: 20 });

      const center = turf.center(feature).geometry.coordinates;

      map.fire('click', {
        lngLat: { lng: center[0], lat: center[1] },
        features: [feature]
      });
    };

    container.appendChild(div);
  });
}

document.getElementById('reset-legend').addEventListener('click', () => {
  // Check all checkboxes
  document.querySelectorAll('.legend-org-list input[type="checkbox"]').forEach(checkbox => {
    checkbox.checked = true;
  });

  // Show all markers
  allMarkers.forEach(marker => {
    marker.getElement().style.display = 'block';
  });
});


// Map load


map.on('load', async () => {
  try {
    // 1. Fetch Airtable Data first
    const records = await fetchData();
    const data = records.map(r => ({
      id: r.id,
      ...r.fields
    }));

    // 2. Fetch GeoJSON second
    const neighborhoods = await fetch('2020_Neighborhood_Tabulation_Areas_(NTAs)_20260414.geojson')
      .then(res => res.json());

    // 3. Process the artistGroups (Standardize the keys)
    const artistGroups = {};
    data.forEach(row => {
      // Handle the Linked Record array vs string
      const rawNta = Array.isArray(row.LinkedNTAs) ? row.LinkedNTAs[0] : row.LinkedNTAs;
      if (!rawNta) return;
      
      // We keep the case as-is because ntaname in your GeoJSON is usually Title Case
      const n = rawNta.trim(); 
      if (!artistGroups[n]) artistGroups[n] = [];
      artistGroups[n].push(row);
    });

    // 4. Standardize GeoJSON properties for matching
    neighborhoods.features.forEach(f => {
      f.properties.neighborhood = f.properties.ntaname;
    });

    // 5. NOW call the map building functions
    createNeighborhoodChoropleth(data, neighborhoods, artistGroups);

  } catch (error) {
    console.error("Initialization failed:", error);
  }
});


  // ✅ Build choropleth
  function createNeighborhoodChoropleth(data, neighborhoods, artistGroups) {

  // 1. Build counts
  const countsMap = {};

  data.forEach(row => {
    const n = row.LinkedNTAs;
    if (!n) return;
    countsMap[n] = (countsMap[n] || 0) + 1;
  });

  // 2. Assign to GeoJSON
 // Ensure you are counting names, not IDs!
neighborhoods.features.forEach(f => {
    const geoName = f.properties.ntaname;
    // This looks for "Flushing" in the countsMap
    f.properties.artistCount = countsMap[geoName] || 0; 
});

  // 3. Compute max
  const counts = neighborhoods.features.map(f => f.properties.artistCount);
  const maxCount = Math.max(...counts);
  const safeMax = maxCount > 0 ? maxCount : 1;

  // 4. Add source
  map.addSource('neighborhoods', {
    type: 'geojson',
    data: neighborhoods
  });

  // 5. Add layer (USES safeMax here)
  map.addLayer({
    id: 'neighborhood-fill',
    type: 'fill',
    source: 'neighborhoods',
    paint: {
      'fill-color': [
        'interpolate',
        ['exponential', 0.5],
        ['get', 'artistCount'],
        0, '#f2f0f7',
        safeMax * 0.25, '#cbc9e2',
        safeMax * 0.5, '#9e9ac8',
        safeMax * 0.75, '#756bb1',
        safeMax, '#54278f'
      ],
      'fill-opacity': 0.7
    }
  });

  
  // outline
  map.addLayer({
    id: 'neighborhood-outline',
    type: 'line',
    source: 'neighborhoods',
    paint: {
      'line-color': '#333',
      'line-width': 1
    }
  });
  
  // Softr Pop-up Logic
  map.on('click', 'neighborhood-fill', (e) => {
    const feature = e.features[0];
    const name = feature.properties.ntaname;
    const artists = artistGroups[name] || [];
    const SOFTR_URL = "https://elwanda52071.softr.app/artist-details";

    const html = `
      <div style="padding:10px;">
        <h3>${name}</h3>
        <p><strong>${artists.length}</strong> Artists</p>
        ${artists.map(a => `
          <div>
            <strong>${a["Org Name"] || "Unnamed"}</strong><br>
            <a href="${SOFTR_URL}?recordId=${a.id}" target="_blank">View Profile →</a>
          </div>
        `).join('')}
      </div>`;

    new mapboxgl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
  });
  // click popup
 

const legendContainer = document.getElementById('legend');
  legendContainer.innerHTML = '<h3>Artist Density</h3>';

  const layers = [
    '0', 
    `1 - ${Math.round(safeMax * 0.25)}`, 
    `${Math.round(safeMax * 0.25) + 1} - ${Math.round(safeMax * 0.5)}`, 
    `${Math.round(safeMax * 0.5) + 1} - ${Math.round(safeMax * 0.75)}`, 
    `${Math.round(safeMax * 0.75) + 1}+`
  ];
  
  const colors = ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f'];

  layers.forEach((layer, i) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <span class="color-key" style="background-color: ${colors[i]};"></span>
      <span>${layer}</span>
    `;
    legendContainer.appendChild(item);
  });
  
  // Call the sidebar builder
  buildNeighborhoodSidebar(artistGroups, LinkedNTAs);
}

  // =======================
  // Subway Lines Source + Layer
  // =======================
  map.addSource('subway-lines', {
    type: 'geojson',
    data: 'nyc-subway-routes.geojson'
  });

  map.addLayer({
    id: 'subway-lines-layer',
    type: 'line',
    source: 'subway-lines',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-width': 2,
      'line-color': [
        'match',
        ['get', 'rt_symbol'],
        '1', '#EE352E', '2', '#EE352E', '3', '#EE352E',
        '4', '#00933C', '5', '#00933C', '6', '#00933C',
        'A', '#2850AD', 'C', '#2850AD', 'E', '#2850AD',
        'B', '#FF6319', 'D', '#FF6319', 'F', '#FF6319', 'M', '#FF6319',
        'N', '#FCCC0A', 'Q', '#FCCC0A', 'R', '#FCCC0A', 'W', '#FCCC0A',
        'L', '#A7A9AC', 'G', '#6CBE45', 'J', '#996633', 'Z', '#996633',
        '7', '#B933AD',
        '#000000'
      ]
    }
  });

  // =======================
  // Subway Stops Source + Layers
  // =======================
  map.addSource('subway-stops', {
    type: 'geojson',
    data: 'nyc-subway-stops.geojson'
  });

  // Stop Circles
  map.addLayer({
    id: 'subway-stations-stops',
    type: 'circle',
    source: 'subway-stops',
    paint: {
      'circle-radius': 1,
      'circle-color': '#ffffff',
      'circle-stroke-width': 1,
      'circle-stroke-color': '#000000'
    }
  });

  // Station Labels (Initially Hidden)
  map.addLayer({
    id: 'subway-station-labels',
    type: 'symbol',
    source: 'subway-stops',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 12,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'visibility': 'none'
    },
    paint: {
      'text-color': '#000000',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1
=
} catch (error) {
    console.error("Initialization failed:", error);
  }
});

// =======================
// Zoom-based Label Visibility
// =======================
map.on('zoom', () => {
  const zoomLevel = map.getZoom();
  map.setLayoutProperty(
    'subway-station-labels',
    'visibility',
    zoomLevel >= 14 ? 'visible' : 'none'
  );

  // Show marker labels at same zoom level
  allMarkers.forEach(marker => {
    if (marker.labelElement) {
      marker.labelElement.style.display = zoomLevel >= 14 ? 'block' : 'none';
    }
  });
});



// UI toggle logic
map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');

// Hide by default
document.getElementById('map-guide-overlay').style.display = 'none';

// When intro is closed, show the info box
document.getElementById('close-intro').addEventListener('click', () => {
  document.getElementById('intro-overlay').style.display = 'none';
  document.getElementById('map-guide-overlay').style.display = 'flex';
});


const intro = document.getElementById('intro-overlay');
intro.addEventListener('touchmove', (e) => {
  if (intro.scrollTop > 100) {
    intro.style.display = 'none';
  }
});



document.addEventListener('DOMContentLoaded', () => {
  const legendPanel = document.getElementById('legend-panel');
const legendToggle = document.getElementById('legend-toggle');

legendToggle.addEventListener('click', () => {
  legendPanel.classList.toggle('collapsed');
  legendToggle.textContent = legendPanel.classList.contains('collapsed') ? 'Show' : 'Hide';
});
})

document.addEventListener('DOMContentLoaded', () => {
  const mapGuideOverlay = document.getElementById('map-guide-overlay');
  const mapGuideClose = document.getElementById('map-guide-close');
  const infoButton = document.getElementById('info-button');

  // Open
  if (infoButton) {
    infoButton.addEventListener('click', () => {
      mapGuideOverlay.style.display = 'flex';
    });
  }

  // Close
  if (mapGuideClose) {
    mapGuideClose.addEventListener('click', () => {
      mapGuideOverlay.style.display = 'none';
    });
  }
});


const legendPanel = document.getElementById('legend-panel');
const legendHeader = legendPanel.querySelector('.legend-header');

legendHeader.addEventListener('click', () => {
  legendPanel.classList.toggle('expanded');
});

document.addEventListener('click', (e) => {
  const legendPanel = document.getElementById('legend-panel');
  if (legendPanel.classList.contains('expanded') && !legendPanel.contains(e.target)) {
    legendPanel.classList.remove('expanded');
  }
});


