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
    f.properties.artistCount = Number(countsMap[f.properties.ntaname]) || 0; 
  });
  
  const maxArtists = Math.max(...Object.values(countsMap), 1);

  // SAFE MATH: Ensures stops are strictly ascending even with low data counts
  const stop1 = Math.max(1, Math.ceil(maxArtists * 0.2));
  const stop2 = Math.max(stop1 + 1, Math.ceil(maxArtists * 0.4));
  const stop3 = Math.max(stop2 + 1, Math.ceil(maxArtists * 0.6));
  const stop4 = Math.max(stop3 + 1, Math.ceil(maxArtists * 0.8));

  const colorExpression = [
    'step',
    ['get', 'artistCount'],
    '#f2f0f7', // 0 artists
    1,          '#dadaeb', // Band 1
    stop1 + 1,  '#bcbddc', // Band 2
    stop2 + 1,  '#9e9ac8', // Band 3
    stop3 + 1,  '#756bb1', // Band 4
    stop4 + 1,  '#54278f'  // Band 5
  ];

  map.setPaintProperty('neighborhood-fill', 'fill-color', colorExpression);
  
  // --- DEFINE SHOWPOPUP HERE ---
  const showPopup = (name, lngLat) => {
    const artists = artistGroups[name] || [];
    const html = `
      <div style="padding:10px; max-height:200px; overflow-y:auto;">
        <h3 style="margin:0;">${name}</h3>
        <p><strong>${artists.length}</strong> Artists</p>
        ${artists.map(a => `<div>• ${a.Name || a['Org Name']}</div>`).join('')}
      </div>`;
    new mapboxgl.Popup().setLngLat(lngLat).setHTML(html).addTo(map);
  };

  // Add click listener for the map
  map.on('click', 'neighborhood-fill', (e) => {
    const name = e.features[0].properties.ntaname;
    showPopup(name, e.lngLat);
  });

  addSubwayLayers();
  updateSidebarAndLegend(artistGroups, neighborhoods, showPopup, {stop1, stop2, stop3, stop4, maxArtists});
  setupSearch(data);
}