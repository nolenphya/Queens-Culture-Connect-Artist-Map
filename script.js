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

// --- ZIP TO NTA CROSSWALK ---
const ZIP_TO_NTA = {
  "11101": "Long Island City-Hunters Point",
  "11102": "Old Astoria-Hallets Point",
  "11103": "Astoria (Central)",
  "11104": "Sunnyside",
  "11105": "Astoria (North)-Ditmars-Steinway",
  "11106": "Astoria (East)-Woodside (North)",
  "11354": "Flushing-Willets Point",
  "11355": "Flushing-Willets Point",
  "11356": "College Point",
  "11357": "Whitestone-Beechhurst",
  "11358": "Auburndale",
  "11360": "Bay Terrace-Clearview",
  "11361": "Bayside",
  "11362": "Douglaston-Little Neck",
  "11363": "Douglaston-Little Neck",
  "11364": "Oakland Gardens-Hollis Hills",
  "11365": "Fresh Meadows-Utopia",
  "11366": "Fresh Meadows-Utopia",
  "11367": "Kew Gardens Hills",
  "11368": "Corona",
  "11369": "East Elmhurst",
  "11370": "East Elmhurst",
  "11372": "Jackson Heights",
  "11373": "Elmhurst",
  "11374": "Rego Park",
  "11375": "Forest Hills",
  "11377": "Woodside",
  "11378": "Maspeth",
  "11379": "Middle Village",
  "11385": "Ridgewood",
  "11411": "Cambria Heights",
  "11412": "St. Albans",
  "11413": "Laurelton",
  "11414": "Howard Beach-Lindenwood",
  "11415": "Kew Gardens",
  "11416": "Ozone Park",
  "11417": "Ozone Park",
  "11418": "Richmond Hill",
  "11419": "South Richmond Hill",
  "11420": "South Ozone Park",
  "11421": "Woodhaven",
  "11422": "Rosedale",
  "11423": "Hollis",
  "11426": "Bellerose",
  "11427": "Queens Village",
  "11428": "Queens Village",
  "11429": "Queens Village",
  "11432": "Jamaica Estates-Holliswood",
  "11433": "Jamaica",
  "11434": "South Jamaica",
  "11435": "Jamaica Hills-Briarwood",
  "11436": "South Jamaica",
  "11691": "Far Rockaway-Bayswater",
  "11692": "Rockaway Beach-Arverne-Edgemere",
  "11693": "Breezy Point-Belle Harbor-Rockaway Park-Broad Channel",
  "11694": "Breezy Point-Belle Harbor-Rockaway Park-Broad Channel"
};

const artistGroups = {};

async function fetchData() {
  const filterFormula = encodeURIComponent("{Approved}=TRUE()");
  const viewName = encodeURIComponent("Artists");
  let allRecords = [];
  let offset = null;

  try {
    do {
      const fetchUrl = `${AIRTABLE_URL}?view=${viewName}&filterByFormula=${filterFormula}${offset ? `&offset=${offset}` : ""}`;
      const res = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
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

map.on('load', async () => {
  try {
    const records = await fetchData();
    const data = records.map(r => ({ id: r.id, ...r.fields }));
    const neighborhoods = await fetch('2020_Neighborhood_Tabulation_Areas_(NTAs)_20260414.geojson').then(res => res.json());

    // 1. Subway Lines (Colored)[cite: 2]
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

    // 2. Subway Stops[cite: 2]
    map.addSource('subway-stops', { type: 'geojson', data: 'nyc-subway-stops.geojson' });
    map.addLayer({
      id: 'subway-stations-stops',
      type: 'circle',
      source: 'subway-stops',
      paint: { 'circle-radius': 2, 'circle-color': '#ffffff', 'circle-stroke-width': 1, 'circle-stroke-color': '#000' }
    });

    createZipBasedChoropleth(data, neighborhoods, artistGroups);
  } catch (error) {
    console.error("Initialization failed:", error);
  }
});

function createZipBasedChoropleth(data, neighborhoods, artistGroups) {
  const countsMap = {};
  const seenIds = new Set();

  for (let key in artistGroups) delete artistGroups[key];

  data.forEach(row => {
    if (seenIds.has(row.id)) return;
    seenIds.add(row.id);

    let rawZip = Array.isArray(row.Zip_Code) ? row.Zip_Code[0] : row.Zip_Code;
    const zip = String(rawZip || "").trim();
    const neighborhoodName = ZIP_TO_NTA[zip];

    if (neighborhoodName) {
      countsMap[neighborhoodName] = (countsMap[neighborhoodName] || 0) + 1;
      if (!artistGroups[neighborhoodName]) artistGroups[neighborhoodName] = [];
      artistGroups[neighborhoodName].push(row);
    }
  });

  neighborhoods.features.forEach(f => {
    const geoName = f.properties.ntaname;
    f.properties.artistCount = countsMap[geoName] || 0;
  });

  const counts = neighborhoods.features.map(f => f.properties.artistCount);
  const safeMax = Math.max(...counts) || 1;

  if (map.getSource('neighborhoods')) {
    map.getSource('neighborhoods').setData(neighborhoods);
  } else {
    map.addSource('neighborhoods', { type: 'geojson', data: neighborhoods });
  }

  // 3. Persistent Outlines (Even if 0 artists)[cite: 2]
  if (!map.getLayer('neighborhood-outline')) {
    map.addLayer({
      id: 'neighborhood-outline',
      type: 'line',
      source: 'neighborhoods',
      paint: { 'line-color': '#333', 'line-width': 0.8, 'line-opacity': 0.5 }
    }, 'subway-lines-layer');
  }

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
    }, 'neighborhood-outline');
  }

  // 4. Softr Popup Integration[cite: 2]
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
        <p style="margin:0 0 10px 0;"><strong>${artists.length}</strong> Artists (by Zip)</p>
        <hr style="border:0; border-top:1px solid #eee;">
        ${artists.map(a => {
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

  updateLegendUI(safeMax);
}

function updateLegendUI(safeMax) {
  const legend = document.getElementById('legend');
  legend.innerHTML = `<h3>Artist Density</h3>`;
  const colors = ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f'];
  const grades = [0, Math.round(safeMax*0.25), Math.round(safeMax*0.5), Math.round(safeMax*0.75), safeMax];

  grades.forEach((grade, i) => {
    const item = document.createElement('div');
    item.innerHTML = `<span style="background:${colors[i]}; width:12px; height:12px; display:inline-block; margin-right:5px;"></span> ${grade}`;
    legend.appendChild(item);
  });
}