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

function getArtistName(record) {
  if (record["Name"]) return record["Name"];
  if (record["Org Name"]) return record["Org Name"];
  if (record["Organization Name"]) return record["Organization Name"];
  return "Unnamed Entity";
}

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
    console.error("Airtable Data Fetch Error:", err);
    return allRecords;
  }
}

map.on('load', async () => {
  const records = await fetchData();
  const data = records.map(r => ({ id: r.id, ...r.fields }));
  
  geoData = await fetch('2020_Neighborhood_Tabulation_Areas_(NTAs)_20260414.geojson').then(res => res.json());

  map.addSource('neighborhoods', { type: 'geojson', data: geoData });

  map.addLayer({
    id: 'neighborhood-fill',
    type: 'fill',
    source: 'neighborhoods',
    paint: {
      'fill-color': '#f2f0f7',
      'fill-opacity': 0.6
    }
  });

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

  // Ensure every feature explicitly gets a valid base number (never undefined or null)
  neighborhoods.features.forEach(f => { 
    const count = countsMap[f.properties.ntaname];
    f.properties.artistCount = typeof count === 'number' ? count : 0; 
  });
  
  // Re-push data changes into the Mapbox source so the update registers completely
  map.getSource('neighborhoods').setData(neighborhoods);

  const maxArtists = Math.max(...Object.values(countsMap), 1);

  // Strictly ascending dynamic bounds 
  const s1 = Math.max(1, Math.ceil(maxArtists * 0.2));
  const s2 = Math.max(s1 + 1, Math.ceil(maxArtists * 0.4));
  const s3 = Math.max(s2 + 1, Math.ceil(maxArtists * 0.6));
  const s4 = Math.max(s3 + 1, Math.ceil(maxArtists * 0.8));

  // Fix: wrapped ['get', 'artistCount'] inside a 'coalesce' statement. 
  // If the count is ever evaluated as null by Mapbox, it safely treats it as 0.
  const colorExpression = [
    'step',
    ['coalesce', ['get', 'artistCount'], 0],
    '#f2f0f7', // 0 artists
    1,          '#dadaeb', // Band 1: 1 to s1
    s1 + 1,     '#bcbddc', // Band 2: s1+1 to s2
    s2 + 1,     '#9e9ac8', // Band 3: s2+1 to s3
    s3 + 1,     '#756bb1', // Band 4: s3+1 to s4
    s4 + 1,     '#54278f'  // Band 5: High Value Peak
  ];

  map.setPaintProperty('neighborhood-fill', 'fill-color', colorExpression);

  const showPopup = (name, lngLat) => {
    const artists = artistGroups[name] || [];
    const BASE_LIST_PAGE = "https://elwanda52071.softr.app/artists";
    const DETAIL_SLUG = "/artists-details";

    const html = `
      <div style="padding:10px; max-height:250px; overflow-y:auto; font-family:sans-serif;">
        <h3 style="margin:0 0 5px 0;">${name}</h3>
        <p><strong>${artists.length}</strong> Listings Found</p>
        <hr style="border:0; border-top:1px solid #eee;">
        ${artists.map(a => {
          const displayName = getArtistName(a);
          const modalParam = encodeURIComponent(`${DETAIL_SLUG}?recordId=${a.id}`);
          return `<div style="margin-top:8px;">
                    <div style="font-weight:bold; font-size:13px;">${displayName}</div>
                    <a href="${BASE_LIST_PAGE}?modal=${modalParam}&modalSize=M&modalPlacement=end" target="_blank" style="color:#007bff; text-decoration:none; font-size:11px;">View Profile →</a>
                  </div>`;
        }).join('')}
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

  addSubwayLayers();
  updateSidebarAndLegend(artistGroups, neighborhoods, showPopup, {s1, s2, s3, s4});
  setupSearch(data);
}

function addSubwayLayers() {
  if (!map.getSource('subway-lines')) {
    map.addSource('subway-lines', { type: 'geojson', data: 'nyc-subway-routes.geojson' });
    map.addSource('subway-stops', { type: 'geojson', data: 'nyc-subway-stops.geojson' });
  }

  if (!map.getLayer('subway-lines-layer')) {
    map.addLayer({
      id: 'subway-lines-layer', type: 'line', source: 'subway-lines',
      paint: {
        'line-width': 2,
        'line-opacity': 0.4,
        'line-color': ['match', ['get', 'rt_symbol'], '1', '#EE352E', '2', '#EE352E', '3', '#EE352E', '4', '#00933C', '5', '#00933C', '6', '#00933C', 'A', '#2850AD', 'C', '#2850AD', 'E', '#2850AD', 'B', '#FF6319', 'D', '#FF6319', 'F', '#FF6319', 'M', '#FF6319', 'N', '#FCCC0A', 'Q', '#FCCC0A', 'R', '#FCCC0A', 'W', '#FCCC0A', 'L', '#A7A9AC', 'G', '#6CBE45', 'J', '#996633', 'Z', '#996633', '7', '#B933AD', '#000000']
      }
    });
  }

  if (!map.getLayer('subway-stations-stops')) {
    map.addLayer({
      id: 'subway-stations-stops', type: 'circle', source: 'subway-stops',
      paint: {
        'circle-radius': 3.5,
        'circle-color': '#fff',
        'circle-stroke-width': 1.2,
        'circle-stroke-color': '#000'
      }
    });
  }

  if (!map.getLayer('subway-labels')) {
    map.addLayer({
      id: 'subway-labels', 
      type: 'symbol', 
      source: 'subway-stops',
      minzoom: 12.5,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 10,
        'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
        'text-radial-offset': 0.6,
        'text-allow-overlap': false
      },
      paint: {
        'text-color': '#333',
        'text-halo-color': '#fff',
        'text-halo-width': 1.5
      }
    });
  }
}

function updateSidebarAndLegend(groups, neighborhoods, popupFn, stops) {
  const container = document.getElementById('legend');
  if (!container) return;
  
  container.innerHTML = `
    <div style="margin-bottom:15px; padding-bottom:10px; border-bottom:2px solid #eee;">
      <h4 style="margin:0 0 8px 0; font-size:12px; text-transform:uppercase; color:#666;">Artist Count</h4>
      <div style="display:flex; flex-direction:column; gap:4px;">
        <div style="display:flex; align-items:center;"><div style="width:16px; height:16px; background:#f2f0f7; margin-right:8px; border:1px solid #ccc;"></div><span style="font-size:11px;">0 Listings</span></div>
        <div style="display:flex; align-items:center;"><div style="width:16px; height:16px; background:#dadaeb; margin-right:8px; border:1px solid #ccc;"></div><span style="font-size:11px;">1 - ${stops.s1}</span></div>
        <div style="display:flex; align-items:center;"><div style="width:16px; height:16px; background:#bcbddc; margin-right:8px; border:1px solid #ccc;"></div><span style="font-size:11px;">${stops.s1 + 1} - ${stops.s2}</span></div>
        <div style="display:flex; align-items:center;"><div style="width:16px; height:16px; background:#9e9ac8; margin-right:8px; border:1px solid #ccc;"></div><span style="font-size:11px;">${stops.s2 + 1} - ${stops.s3}</span></div>
        <div style="display:flex; align-items:center;"><div style="width:16px; height:16px; background:#756bb1; margin-right:8px; border:1px solid #ccc;"></div><span style="font-size:11px;">${stops.s3 + 1} - ${stops.s4}</span></div>
        <div style="display:flex; align-items:center;"><div style="width:16px; height:16px; background:#54278f; margin-right:8px; border:1px solid #ccc;"></div><span style="font-size:11px;">${stops.s4 + 1}+</span></div>
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
      const feature = neighborhoods.features.find(f => f.properties.ntaname === name);
      if (feature) {
        const center = turf.center(feature).geometry.coordinates;
        map.flyTo({ center: center, zoom: 13.5 });
        popupFn(name, center);
      }
    };
    container.appendChild(item);
  });
}

function setupSearch(data) {
  const searchInput = document.getElementById('search-input');
  const resultsBox = document.getElementById('search-results');
  if (!searchInput || !resultsBox) return;

  let currentFocus = -1;

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    resultsBox.innerHTML = '';
    currentFocus = -1;
    if (!val) return;

    const matches = data.filter(r => {
      const nameMatch = getArtistName(r).toLowerCase().includes(val);
      const tagMatch = String(r["Artistic Disciplines"] || "").toLowerCase().includes(val);
      return nameMatch || tagMatch;
    }).slice(0, 10);

    matches.forEach((m, idx) => {
      const div = document.createElement('div');
      div.className = "search-item";
      div.style = "padding:8px; cursor:pointer; border-bottom:1px solid #ddd; background:#fff; font-size:13px;";
      div.innerHTML = `<b>${getArtistName(m)}</b><br><small>${m["Artistic Disciplines"] || ""}</small>`;
      
      div.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
        navigateToArtist(m);
      });
      resultsBox.appendChild(div);
    });
  });

  searchInput.addEventListener('keydown', (e) => {
    const items = resultsBox.getElementsByClassName('search-item');
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      currentFocus++;
      if (currentFocus >= items.length) currentFocus = 0;
      highlight(items);
    } else if (e.key === "ArrowUp") {
      currentFocus--;
      if (currentFocus < 0) currentFocus = items.length - 1;
      highlight(items);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (currentFocus > -1 && items[currentFocus]) {
        items[currentFocus].dispatchEvent(new Event('mousedown'));
      }
    }
  });

  function highlight(items) {
    Array.from(items).forEach((el, i) => {
      el.style.background = i === currentFocus ? "#f0f0f0" : "#fff";
    });
  }

  function navigateToArtist(m) {
    let zip = String((Array.isArray(m.Zip_Code) ? m.Zip_Code[0] : m.Zip_Code) || "").trim();
    const hood = ZIP_TO_NTA[zip];
    if (hood && geoData) {
      const feat = geoData.features.find(f => f.properties.ntaname === hood);
      if (feat) {
        map.flyTo({ center: turf.center(feat).geometry.coordinates, zoom: 14.5 });
      }
    }
    resultsBox.innerHTML = '';
    searchInput.value = '';
  }
}

// Global Layout Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('legend-toggle');
  const resetBtn = document.getElementById('reset-legend');
  const infoBtn = document.getElementById('info-button');
  const overlay = document.getElementById('intro-overlay');

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

  if (infoBtn && overlay) {
    infoBtn.addEventListener('click', () => {
      overlay.style.display = 'block';
    });
  }
  
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.intro-content') === null) {
        overlay.style.display = 'none';
      }
    });
  }
});