// Mapbox Setup
mapboxgl.accessToken = 'pk.eyJ1IjoiZmx1c2hpbmd0b3duaGFsbCIsImEiOiJjbWRmZHFxb2EwY2p3MmlxM3JoMmJwNDVrIn0.KDnT79yQuUeYVaqcKlmQGQ';
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-73.94, 40.73],
  zoom: 11
});

// --- Map Controls ---
map.addControl(new mapboxgl.NavigationControl(), 'top-right');
map.addControl(new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
}), 'top-right');

const AIRTABLE_API_KEY = 'patboskAQTJUi9FlQ.1c30c3c632cd4d7bd03cf949e50edd922425aba8dcbf0c8a6002e98db67c74a3';
const BASE_ID = 'apppBx0a9hj0Z1ciw';
const TABLE_NAME = 'tbl9OiPT8QI8ss20e';
const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`;

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

  // 2. CLICK FIX: Add fill layer on top of others to ensure click events fire
  map.addLayer({
    id: 'neighborhood-fill',
    type: 'fill',
    source: 'neighborhoods',
    paint: {
      'fill-color': '#f2f0f7', // Default base color
      'fill-opacity': 0.7
    }
  });

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

  neighborhoods.features.forEach(f => { 
    f.properties.artistCount = Number(countsMap[nta]) || 0;
  });
  
const maxArtists = Math.max(...Object.values(countsMap), 1);

const stop1 = Math.max(1, Math.ceil(maxArtists * 0.2));
const stop2 = Math.max(stop1 + 1, Math.ceil(maxArtists * 0.4));
const stop3 = Math.max(stop2 + 1, Math.ceil(maxArtists * 0.6));
const stop4 = Math.max(stop3 + 1, Math.ceil(maxArtists * 0.8));
const stop5 = Math.max(stop4 + 1, maxArtists);

const colorExpression = [
  'step',
  ['to-number', ['get', 'artistCount']],

  '#f2f0f7', // 0 artists
  1, '#dadaeb',
  3, '#bcbddc',
  5, '#9e9ac8',
  8, '#756bb1',
  12, '#54278f'
];

map.setPaintProperty(
  'neighborhood-fill',
  'fill-color',
  colorExpression
);

map.setPaintProperty(
  'neighborhood-fill',
  'fill-opacity',
  0.7
);
  
  addSubwayLayers();

  const showPopup = (name, lngLat) => {
    const artists = artistGroups[name] || [];
    const BASE_LIST_PAGE = "https://elwanda52071.softr.app/artists";
    const DETAIL_SLUG = "/artists-details";

    const html = `
      <div style="padding:10px; max-height:250px; overflow-y:auto; font-family:sans-serif;">
        <h3 style="margin:0 0 5px 0;">${name}</h3>
        <p><strong>${artists.length}</strong> Artists</p>
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

  // Ensure click listener is explicitly on the fill layer
  map.on('click', 'neighborhood-fill', (e) => {
    if (e.features.length > 0) {
      showPopup(e.features[0].properties.ntaname, e.lngLat);
    }
  });

  // Change cursor to pointer on hover
  map.on('mouseenter', 'neighborhood-fill', () => map.getCanvas().style.cursor = 'pointer');
  map.on('mouseleave', 'neighborhood-fill', () => map.getCanvas().style.cursor = '');

  updateSidebarAndLegend(artistGroups, neighborhoods, showPopup, maxArtists);
  setupSearch(data);
}
function setupSearch(data) {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  input.addEventListener('input', () => {
    const term = input.value.toLowerCase().trim();

    results.innerHTML = '';

    if (!term) return;

    const matches = data.filter(item => {
      const name = (item.Name || item['Org Name'] || '').toLowerCase();
      const tags = (item.Tags || '').toString().toLowerCase();

      return name.includes(term) || tags.includes(term);
    });

    matches.slice(0, 20).forEach(match => {
      const div = document.createElement('div');
      div.className = 'search-item';
      div.style = `
        padding:8px;
        border-bottom:1px solid #eee;
        cursor:pointer;
        font-size:12px;
      `;

      div.innerHTML = `
        <strong>${match.Name || match['Org Name'] || 'Unnamed'}</strong>
      `;

      div.onclick = () => {
        const zip = String(match.Zip_Code || '').trim();
        const nta = ZIP_TO_NTA[zip];

        if (!nta) return;

        const feature = geoData.features.find(
          f => f.properties.ntaname === nta
        );

        if (!feature) return;

        const center = turf.center(feature).geometry.coordinates;

        map.flyTo({
          center,
          zoom: 14
        });

        new mapboxgl.Popup()
          .setLngLat(center)
          .setHTML(`
            <div>
              <strong>${match.Name || match['Org Name']}</strong>
            </div>
          `)
          .addTo(map);
      };

      results.appendChild(div);
    });
  });
}

function addSubwayLayers() {
  // 1. REINSTATE SUBWAY STOPS: Manually adding layers from GeoJSON
  if (!map.getSource('subway-lines')) {
    map.addSource('subway-lines', { type: 'geojson', data: 'nyc-subway-routes.geojson' });
    map.addSource('subway-stops', { type: 'geojson', data: 'nyc-subway-stops.geojson' });
  }

  // Lines
  if (!map.getLayer('subway-lines-layer')) {
    map.addLayer({
      id: 'subway-lines-layer', type: 'line', source: 'subway-lines',
      paint: {
        'line-width': 2,
        'line-opacity': 0.5,
        'line-color': ['match', ['get', 'rt_symbol'], '1', '#EE352E', '2', '#EE352E', '3', '#EE352E', '4', '#00933C', '5', '#00933C', '6', '#00933C', 'A', '#2850AD', 'C', '#2850AD', 'E', '#2850AD', 'B', '#FF6319', 'D', '#FF6319', 'F', '#FF6319', 'M', '#FF6319', 'N', '#FCCC0A', 'Q', '#FCCC0A', 'R', '#FCCC0A', 'W', '#FCCC0A', 'L', '#A7A9AC', 'G', '#6CBE45', 'J', '#996633', 'Z', '#996633', '7', '#B933AD', '#000000']
      }
    });
  }

  // Station Circles
  if (!map.getLayer('subway-stations-stops')) {
    map.addLayer({
      id: 'subway-stations-stops', type: 'circle', source: 'subway-stops',
      paint: {
        'circle-radius': 3,
        'circle-color': '#fff',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#000'
      }
    });
  }

  // Station Labels
 if (!map.getLayer('subway-labels')) {
  map.addLayer({
    id: 'subway-labels',
    type: 'symbol',
    source: 'subway-stops',
    minzoom: 16,

    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': 10,
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
      'text-radial-offset': 0.5,
      'text-allow-overlap': true
    },

    paint: {
      'text-color': '#222',
      'text-halo-color': '#fff',
      'text-halo-width': 1.5
    }
  });
}
}

function updateSidebarAndLegend(groups, neighborhoods, popupFn, maxArtists) {
  const container = document.getElementById('legend');
  const interval = Math.ceil(maxArtists / 5);
  
  container.innerHTML = `
    <div style="margin-bottom:15px; padding-bottom:10px; border-bottom:2px solid #eee;">
      <h4 style="margin:0 0 8px 0; font-size:12px; text-transform:uppercase; color:#666;">Artist Count</h4>
      <div style="display:flex; flex-direction:column; gap:4px;">
        <div style="display:flex; align-items:center;"><div style="width:16px; height:16px; background:#f2f0f7; margin-right:8px; border:1px solid #ccc;"></div><span style="font-size:11px;">0 Artists</span></div>
        <div style="display:flex; align-items:center;"><div style="width:16px; height:16px; background:#dadaeb; margin-right:8px; border:1px solid #ccc;"></div><span style="font-size:11px;">1 - ${interval}</span></div>
        <div style="display:flex; align-items:center;"><div style="width:16px; height:16px; background:#bcbddc; margin-right:8px; border:1px solid #ccc;"></div><span style="font-size:11px;">${interval + 1} - ${interval * 2}</span></div>
        <div style="display:flex; align-items:center;"><div style="width:16px; height:16px; background:#9e9ac8; margin-right:8px; border:1px solid #ccc;"></div><span style="font-size:11px;">${interval * 2 + 1} - ${interval * 3}</span></div>
        <div style="display:flex; align-items:center;"><div style="width:16px; height:16px; background:#756bb1; margin-right:8px; border:1px solid #ccc;"></div><span style="font-size:11px;">${interval * 3 + 1} - ${interval * 4}</span></div>
        <div style="display:flex; align-items:center;"><div style="width:16px; height:16px; background:#54278f; margin-right:8px; border:1px solid #ccc;"></div><span style="font-size:11px;">${interval * 4 + 1}+</span></div>
      </div>
    </div>
    <h3>Neighborhoods</h3>
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

// =========================
// LEGEND TOGGLE
// =========================

const legendPanel = document.getElementById('legend-panel');
const legendToggle = document.getElementById('legend-toggle');

legendToggle.addEventListener('click', () => {
  legendPanel.classList.toggle('collapsed');

  if (legendPanel.classList.contains('collapsed')) {
    legendToggle.textContent = 'Show';
  } else {
    legendToggle.textContent = 'Hide';
  }
});

// =========================
// RESET BUTTON
// =========================

document.getElementById('reset-legend').addEventListener('click', () => {
  map.flyTo({
    center: [-73.94, 40.73],
    zoom: 11
  });

  // clear search
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
});