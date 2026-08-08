import L from 'leaflet';
window.L = L;
import 'leaflet.markercluster';
import * as turf from '@turf/turf';
import PathFinder from 'geojson-path-finder';
import { DataLoader } from './DataLoader.js';
import { RouteController } from './RouteController.js';
import { map, layers, getUniversalIcon, ACCESS_TRACK_COLORS } from './MapConfig.js';
import { calculateHikingTime, calculateElevationStats } from './GeoUtils.js';
import { MapModules } from './MapModules.js';

export const appCtx = {
  vitalLogisticsOnRoute: [],
  customNights: [],
  osmClusterGroup: null,
  osmLayerGroups: {},
  globalMainLine: null,
  originalMainLine: null,
  customStartPoi: null,
  rabkaAccessLengthKm: 0
};

let rawPoisData = [];
let activeProfilePois = [];
let fullTrackGeoJson = null;
let pathFinder = null;
let currentProfile = 'standard';
let currentDays = 5;
let currentDirection = 'WEST_TO_EAST'; 
let globalLineStart = null;
let startPoiGlobal = null;
let endPoiGlobal = null;

window.toggleDirection = function() {
  if (!appCtx.originalMainLine) return;
  currentDirection = currentDirection === 'WEST_TO_EAST' ? 'EAST_TO_WEST' : 'WEST_TO_EAST';
  
  if (currentDirection === 'EAST_TO_WEST') {
    appCtx.globalMainLine = turf.lineReverse(appCtx.originalMainLine);
  } else {
    appCtx.globalMainLine = appCtx.originalMainLine;
  }
  
  recalculateRouteMetadata();
  renderMainPois();
  renderVariant(currentDays);
};

window.setCustomStart = function(type) {
  if (type === 'rabka') {
    appCtx.customStartPoi = { name: "Rabka-Zdrój (Dojście szlakiem)", lat: 49.609, lon: 19.965, km: 0 };
  } else {
    appCtx.customStartPoi = null; 
  }
  recalculateRouteMetadata();
  renderMainPois();
  renderVariant(currentDays);
};

window.toggleCustomNight = function(id, name, lat, lon) {
    if(!appCtx.globalMainLine) return;
    
    const idx = appCtx.customNights.findIndex(n => n.id === id);
    if (idx > -1) {
        appCtx.customNights.splice(idx, 1);
    } else {
        const pt = turf.point([lon, lat]);
        const snapped = turf.nearestPointOnLine(appCtx.globalMainLine, pt, {units: 'kilometers'});
        
        const accessOffset = appCtx.customStartPoi ? appCtx.rabkaAccessLengthKm : 0;
        const km = Math.round((accessOffset + snapped.properties.location) * 10) / 10;
        
        appCtx.customNights.push({
            id, name: name || 'Wybrany punkt noclegu',
            lat: snapped.geometry.coordinates[1],
            lon: snapped.geometry.coordinates[0], km
        });
    }
    map.closePopup();
    renderVariant(currentDays);
    renderMainPois();
};

window.clearCustomPlan = function() {
    appCtx.customNights = [];
    renderVariant(currentDays);
    renderMainPois();
};

export function getPreciseLineSlice(startCoords, endCoords, lineFeature) {
  try {
    if (startCoords[0] === endCoords[0] && startCoords[1] === endCoords[1]) return null;

    let startPt = turf.point(startCoords);
    let endPt = turf.point(endCoords);
    let startSnapped = turf.nearestPointOnLine(lineFeature, startPt);
    let endSnapped = turf.nearestPointOnLine(lineFeature, endPt);
    
    if (startSnapped.properties.location > endSnapped.properties.location) {
        const temp = startSnapped;
        startSnapped = endSnapped;
        endSnapped = temp;
    }
    return turf.lineSlice(startSnapped, endSnapped, lineFeature);
  } catch(e) { return null; }
}

function recalculateRouteMetadata() {
  if (!appCtx.globalMainLine) return;
  
  const gpxCoords = appCtx.globalMainLine.geometry.coordinates;
  const gpxStart = appCtx.customStartPoi ? [appCtx.customStartPoi.lon, appCtx.customStartPoi.lat] : gpxCoords[0];
  const gpxEnd = gpxCoords[gpxCoords.length - 1];
  
  globalLineStart = turf.point(gpxStart);
  
  const baseMainKm = Math.round(turf.length(appCtx.globalMainLine, {units: 'kilometers'})*10)/10;
  const accessOffset = appCtx.customStartPoi ? appCtx.rabkaAccessLengthKm : 0;
  const totalKm = Math.round((baseMainKm + accessOffset)*10)/10;
  
  if (currentDirection === 'WEST_TO_EAST') {
    startPoiGlobal = { name: appCtx.customStartPoi ? appCtx.customStartPoi.name : "Początek MSB (Straconka)", lat: gpxStart[1], lon: gpxStart[0], km: 0 };
    endPoiGlobal = { name: "Koniec MSB (Luboń Wielki)", lat: gpxEnd[1], lon: gpxEnd[0], km: totalKm };
  } else {
    startPoiGlobal = { name: "Początek MSB (Luboń Wielki)", lat: gpxStart[1], lon: gpxStart[0], km: 0 };
    endPoiGlobal = { name: "Koniec MSB (Straconka)", lat: gpxEnd[1], lon: gpxEnd[0], km: totalKm };
  }

  rawPoisData.forEach((poi) => {
    const pt = turf.point([parseFloat(poi.originalLon || poi.lon), parseFloat(poi.originalLat || poi.lat)]);
    const snapped = turf.nearestPointOnLine(appCtx.globalMainLine, pt, {units: 'kilometers'});
    poi.lon = snapped.geometry.coordinates[0];
    poi.lat = snapped.geometry.coordinates[1];
    poi.km = Math.round((accessOffset + snapped.properties.location) * 10) / 10;
  });
  
  rawPoisData.sort((a, b) => a.km - b.km);

  appCtx.vitalLogisticsOnRoute.forEach(logPoi => {
    const pt = turf.point([logPoi.originalLon, logPoi.originalLat]);
    const snapped = turf.nearestPointOnLine(appCtx.globalMainLine, pt, {units: 'kilometers'});
    logPoi.km = Math.round((accessOffset + snapped.properties.location) * 10) / 10;
  });
}

async function initApp() {
  try {
    MapModules.setupGPS();
    MapModules.injectDirectionControlsUI();

    fullTrackGeoJson = await DataLoader.loadGpxTrack();
    const networkGeoJson = await DataLoader.loadConnectorNetwork();

    if (networkGeoJson) pathFinder = new PathFinder(networkGeoJson, { tolerance: 0.0005 });

    const mainLineRaw = fullTrackGeoJson.features.find(f => f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'));
    if (!mainLineRaw) return;
    
    let flatCoords = [];
    turf.coordEach(mainLineRaw, c => flatCoords.push(c));
    const mainLine = turf.lineString(flatCoords);

    appCtx.originalMainLine = mainLine;
    appCtx.globalMainLine = mainLine;

    const gpxCoords = mainLine.geometry.coordinates;
    const gpxStart = gpxCoords[0];
    const gpxEnd = gpxCoords[gpxCoords.length - 1];

    const originalPois = await DataLoader.loadPois();
    const response = await fetch(`${DataLoader.baseUrl}data/msb_pois.json`);
    let osmPois = [];
    if (response.ok) osmPois = await response.json();

    const normalizeName = (name) => {
      if(!name) return "";
      return name.toLowerCase().replace(/schronisko/g, '').replace(/pttk/g, '').replace(/przełęcz/g, '')
                 .replace(/szczyt/g, '').replace(/góra/g, '').replace(/pod/g, '').replace(/na/g, '').replace(/\s+/g, '').trim();
    };

    rawPoisData = originalPois.map((poi, index) => {
      let finalLon = poi.lon;
      let finalLat = poi.lat;

      if (index === 0) {
        finalLon = gpxStart[0];
        finalLat = gpxStart[1];
      } else if (index === originalPois.length - 1) {
        finalLon = gpxEnd[0];
        finalLat = gpxEnd[1];
      } else {
        const nName = normalizeName(poi.name);
        let match = null;
        if (nName.length > 2) match = osmPois.find(op => op.name && normalizeName(op.name).includes(nName));
        
        let targetPt = match ? turf.point([parseFloat(match.lon), parseFloat(match.lat)]) : turf.point([parseFloat(poi.lon), parseFloat(poi.lat)]);
        const snapped = turf.nearestPointOnLine(mainLine, targetPt);
        finalLon = snapped.geometry.coordinates[0];
        finalLat = snapped.geometry.coordinates[1];
      }

      return {
        ...poi, originalLon: poi.lon, originalLat: poi.lat, km: parseFloat(poi.km) || 0, lon: finalLon, lat: finalLat
      };
    });
    
    await loadRabkaAccessTracks();
    await loadPolygons(); // Zmieniona funkcja z inteligentnym buforem i importem ArcGIS!
    await loadNatureMonuments(mainLine); // Pomniki filtrowane 2.5km
    
    await MapModules.initMassiveOsmPois(osmPois, mainLine, appCtx);
    await MapModules.initMsbGotSystem(mainLine, osmPois, getPreciseLineSlice);

    recalculateRouteMetadata();

    const fullTrackLayer = L.geoJSON(fullTrackGeoJson, {
      filter: (feature) => feature.geometry && ['LineString', 'MultiLineString'].includes(feature.geometry.type)
    });
    map.fitBounds(fullTrackLayer.getBounds());

    setupEvents();
    updateProfile(currentProfile);

  } catch (error) { console.error('Błąd podczas ładowania danych trasy:', error); }
}

async function loadPolygons() {
  try {
    let bufferedTrail = null;
    let msbBounds = null;
    
    if (appCtx.globalMainLine) {
      try {
        // Zmniejszona jakość zaokrągleń (steps:8) przyspiesza wczytywanie na wolnych urządzeniach
        bufferedTrail = turf.buffer(appCtx.globalMainLine, 0.4, { units: 'kilometers', steps: 8 });
        msbBounds = turf.bbox(appCtx.globalMainLine);
      } catch (e) {
        bufferedTrail = appCtx.globalMainLine; 
      }
    }

    // 1. ŁADOWANIE REZERWATÓW
    const reserves = await fetch(`${DataLoader.baseUrl}data/obszary_chronione.geojson`).then(r => r.ok ? r.json() : null);
    if (reserves) {
      L.geoJSON(reserves, { 
        style: { fillColor: '#2a9d8f', fillOpacity: 0.3, color: '#1f7a6f', weight: 2 },
        filter: (feature) => {
          if (!bufferedTrail) return true;
          try { return turf.booleanIntersects(bufferedTrail, feature); } catch (e) { return false; }
        },
        onEachFeature: (feature, layer) => {
           let name = feature.properties.name || "Obszar chroniony";
           let type = feature.properties.boundary === 'protected_area' ? "Park / Rezerwat" : "Rezerwat przyrody";
           layer.bindPopup(`<strong>🌳 ${name}</strong><br/>Typ: ${type}`);
        }
      }).addTo(layers.naturePolygonsLayer);
    }

    // 2. ŁADOWANIE "ZANOCUJ W LESIE" W LOCIE Z SERWERA RZĄDOWEGO (Tylko poligony wokół szlaku)
    if (msbBounds) {
      const bboxStr = msbBounds.join(',');
      
      const fetchLayer = async (layerId) => {
         const url = `https://mapserver.bdl.lasy.gov.pl/arcgis/rest/services/WMS_BDL_Mapa_turystyczna/MapServer/${layerId}/query?f=geojson&geometry=${bboxStr}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326`;
         return fetch(url).then(r => r.ok ? r.json() : null);
      };

      // Pobieramy warstwy 17 i 22 z Lasów Państwowych
      const [layer22, layer17] = await Promise.all([fetchLayer(22), fetchLayer(17)]);
      const allFeatures = [];
      if (layer22 && layer22.features) allFeatures.push(...layer22.features);
      if (layer17 && layer17.features) allFeatures.push(...layer17.features);

      if (allFeatures.length > 0) {
        L.geoJSON({ type: 'FeatureCollection', features: allFeatures }, {
          style: { fillColor: '#f4a261', fillOpacity: 0.3, color: '#e76f51', weight: 2, dashArray: '5,5' },
          filter: (feature) => {
            // Odrzucamy luźne ikonki - interesują nas tylko wielkie strefy leśne (Poligony)
            if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return false;
            if (!bufferedTrail) return true;
            try { return turf.booleanIntersects(bufferedTrail, feature); } catch (e) { return false; }
          },
          onEachFeature: (feature, layer) => {
             layer.bindPopup(`<strong>⛺ Strefa "Zanocuj w lesie"</strong><br/>Legalne biwakowanie (Lasy Państwowe)`);
          }
        }).addTo(layers.wildCampPolygonsLayer);
      }
    }
  } catch(e) { console.warn("Błąd ładowania poligonów:", e); }
}

async function loadNatureMonuments(mainLine) {
  try {
    const response = await fetch(`${DataLoader.baseUrl}data/pomniki_przyrody.geojson`);
    if (!response.ok) return;
    const geojson = await response.json();

    const leafIcon = MapModules.getOsmPoiIcon('nature_monument');

    geojson.features.forEach(feature => {
      if (!feature.geometry || feature.geometry.type !== 'Point') return;
      
      const lon = feature.geometry.coordinates[0];
      const lat = feature.geometry.coordinates[1];
      const pt = turf.point([lon, lat]);
      
      const snapped = turf.nearestPointOnLine(mainLine, pt, {units: 'kilometers'});
      
      if (snapped.properties.dist <= 2.5) { // Tylko 2.5km od szlaku!
        const name = feature.properties.name || "Pomnik Przyrody";
        const distanceStr = Math.round(snapped.properties.dist * 1000);
        
        L.marker([lat, lon], { icon: leafIcon })
         .bindPopup(`<strong>🍃 ${name}</strong><br/>Odległość od szlaku: ~${distanceStr} m`)
         .addTo(layers.naturePolygonsLayer); 
      }
    });
  } catch (err) {}
}

async function loadRabkaAccessTracks() {
  try {
    const greenGeoJson = await DataLoader.loadRabkaGreenTrack();
    if (greenGeoJson) {
      appCtx.rabkaAccessLengthKm = Math.round(turf.length(greenGeoJson, {units: 'kilometers'}) * 10) / 10;
      L.geoJSON(greenGeoJson, {
        style: { color: ACCESS_TRACK_COLORS.rabkaGreen, weight: 5, dashArray: '6, 6', opacity: 0.9 },
        filter: (f) => f.geometry && ['LineString', 'MultiLineString'].includes(f.geometry.type)
      }).bindPopup(`<strong>Dojście z Rabki (Szlak Zielony)</strong><br/>Dystans dojściowy: ${appCtx.rabkaAccessLengthKm} km`).addTo(layers.rabkaGreenLayer);
    }
  } catch (e) {}

  try {
    const blueGeoJson = await DataLoader.loadRabkaBlueTrack();
    if (blueGeoJson) {
      L.geoJSON(blueGeoJson, {
        style: { color: ACCESS_TRACK_COLORS.rabkaBlue, weight: 5, dashArray: '6, 6', opacity: 0.9 },
        filter: (f) => f.geometry && ['LineString', 'MultiLineString'].includes(f.geometry.type)
      }).bindPopup('<strong>Dojście na szlak z Rabki (Niebieski)</strong>').addTo(layers.rabkaBlueLayer);
    }
  } catch (e) {}
}

function updateProfile(profileKey) {
  currentProfile = profileKey;
  activeProfilePois = RouteController.getPoisForProfile(rawPoisData, currentProfile);
  updateDaysButtonsUI();
  renderMainPois();
  renderVariant(currentDays);
}

function renderMainPois() {
  layers.mainPoisLayer.clearLayers();

  if (rawPoisData.length > 0) {
    rawPoisData.forEach((poi, index) => {
      const isStart = index === 0;
      const isEnd = index === rawPoisData.length - 1;
      const iconType = poi.type || 'waypoint';

      if(isStart || isEnd || iconType.includes('sleep')) {
        const marker = L.marker([poi.lat, poi.lon], { icon: getUniversalIcon(iconType, true) }).addTo(layers.mainPoisLayer);

        const isWildAllowed = currentProfile === 'wild' && poi.profiles && poi.profiles.includes('wild');
        const tentNote = (iconType === 'sleep_indoor' && isWildAllowed) ? `<br/><span style="color:#d62828;">⛺ Możliwość rozbicia namiotu</span>` : '';

        const isSelected = appCtx.customNights.find(n => n.id === poi.id);
        const btnText = isSelected ? '➖ Usuń z planu' : '⛺ Zaplanuj nocleg tutaj';
        const btnColor = isSelected ? '#e63946' : '#2a9d8f';
        let actionBtn = `<br/><button onclick="window.toggleCustomNight('${poi.id || `main_${index}`}', '${poi.name.replace(/'/g, "\\'")}', ${poi.lat}, ${poi.lon})" style="margin-top:10px; width:100%; padding:6px 10px; cursor:pointer; background:${btnColor}; color:#fff; border:none; border-radius:4px; font-weight:bold;">${btnText}</button>`;
        if (isStart || isEnd) actionBtn = ''; 

        if (isStart) marker.bindPopup(`<strong>${poi.name}</strong><br/>▶ Początek trasy<br/>KM: ${poi.km}${actionBtn}`);
        else if (isEnd) marker.bindPopup(`<strong>${poi.name}</strong><br/>🏁 Koniec trasy<br/>KM: ${poi.km}${actionBtn}`);
        else marker.bindPopup(`<strong>${poi.name}</strong><br/>Baza Noclegowa<br/>KM: ${poi.km}${tentNote}${actionBtn}`);
      }
    });
  }
}

function renderVariant(daysCount) {
  if (!appCtx.globalMainLine || (!activeProfilePois.length && appCtx.customNights.length === 0)) return;

  layers.stageLayersGroup.clearLayers();
  const container = document.getElementById('stages-summary');
  if(container) container.innerHTML = '';

  let normalizedStages = [];
  const stageColors = ['#e63946', '#457b9d', '#8a2be2', '#f77f00', '#2a9d8f', '#d62828', '#1d3557', '#6a4c93'];

  if (appCtx.customNights.length > 0) {
      if(container) {
          container.innerHTML = `
              <div style="padding: 12px; background: #d4edda; color: #155724; border-radius: 8px; margin-bottom: 15px; border: 1px solid #c3e6cb; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <strong>⛺ Smart Insertion (Własne noclegi)</strong><br/>
                  <div style="font-size:12px; margin-top:4px; margin-bottom:8px;">Wstrzyknięto ${appCtx.customNights.length} własne punkty noclegowe</div>
                  <button onclick="window.clearCustomPlan()" style="width: 100%; padding: 6px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight:bold;">Wróć do automatu</button>
              </div>
          `;
          document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
      }

      const baseStages = RouteController.getVariantStages(currentDays, activeProfilePois);
      let autoNights = [];
      for (let i = 0; i < baseStages.length - 1; i++) {
          autoNights.push({
              name: baseStages[i].endPoi.name, lat: baseStages[i].endPoi.lat, lon: baseStages[i].endPoi.lon, km: baseStages[i].endPoi.km
          });
      }

      let combinedNights = [...autoNights];
      appCtx.customNights.forEach(cn => {
          const exists = combinedNights.some(an => Math.abs(an.km - cn.km) < 0.5);
          if (!exists) combinedNights.push({ name: cn.name, lat: cn.lat, lon: cn.lon, km: cn.km });
      });

      combinedNights.sort((a,b) => a.km - b.km);
      const waypoints = [startPoiGlobal, ...combinedNights, endPoiGlobal];
      
      for(let i=0; i<waypoints.length-1; i++) {
          const dist = Math.abs(waypoints[i+1].km - waypoints[i].km);
          normalizedStages.push({
              day: i+1, startName: waypoints[i].name, endName: waypoints[i+1].name, startLat: waypoints[i].lat, startLon: waypoints[i].lon,
              endLat: waypoints[i+1].lat, endLon: waypoints[i+1].lon, startKm: waypoints[i].km, endKm: waypoints[i+1].km,
              distanceKm: Math.round(dist * 10) / 10, color: stageColors[i % stageColors.length]
          });
      }
  } else {
      updateDaysButtonsUI();
      const rawStages = RouteController.getVariantStages(daysCount, activeProfilePois);
      normalizedStages = rawStages.map((s) => ({
          day: s.day, startName: s.startName, endName: s.endName, startLat: s.startPoi.lat, startLon: s.startPoi.lon,
          endLat: s.endPoi.lat, endLon: s.endPoi.lon, startKm: s.startPoi.km, endKm: s.endPoi.km,
          distanceKm: Math.round(Math.abs(s.distanceKm) * 10) / 10, color: s.color
      }));
  }

  normalizedStages.forEach(stage => {
    let eleStats = { ascent: 0, descent: 0 };
    let hikingTime = '0h 0m';

    const stageLogistics = appCtx.vitalLogisticsOnRoute.filter(p => p.km > Math.min(stage.startKm, stage.endKm) && p.km < Math.max(stage.startKm, stage.endKm));
    const shopsCount = stageLogistics.filter(p => p.catKey === 'supply' || p.catKey === 'food').length;
    const waterCount = stageLogistics.filter(p => p.catKey === 'water').length;

    try {
      const slicedSegment = getPreciseLineSlice([stage.startLon, stage.startLat], [stage.endLon, stage.endLat], appCtx.globalMainLine);
      
      if (slicedSegment && slicedSegment.geometry) {
        eleStats = calculateElevationStats(slicedSegment);
        hikingTime = calculateHikingTime(stage.distanceKm, eleStats.ascent);

        L.geoJSON(slicedSegment, {
          style: { color: stage.color, weight: 6, opacity: 0.9 },
          filter: (feature) => feature.geometry && ['LineString', 'MultiLineString'].includes(feature.geometry.type)
        }).bindPopup(`
          <strong>Dzień ${stage.day}</strong><br/>
          ${stage.startName} → ${stage.endName}<br/>
          Dystans: ${stage.distanceKm} km<br/>
          Podejścia: +${eleStats.ascent} m | Zejścia: -${eleStats.descent} m<br/>
          ⏱ Czas: ~${hikingTime}
        `).addTo(layers.stageLayersGroup);
      }
    } catch (err) {}

    if(container) {
      const el = document.createElement('div');
      el.className = 'stage-item';
      el.style.borderColor = stage.color;
      
      let badgesHtml = '';
      if (shopsCount > 0) badgesHtml += `<span style="background: #8338ec; color: white; padding: 3px 6px; border-radius: 4px; font-weight: 500;">🛒 Sklepy: ${shopsCount}</span>`;
      if (waterCount > 0) badgesHtml += `<span style="background: #00b4d8; color: white; padding: 3px 6px; border-radius: 4px; font-weight: 500;">💧 Ujęcia wody: ${waterCount}</span>`;

      el.innerHTML = `
        <header style="color: ${stage.color}; font-weight:bold;">Etap ${stage.day}: ${stage.distanceKm} km</header>
        <div class="details" style="font-size: 14px; margin-top:5px;">${stage.startName} <br/>⬇<br/> ${stage.endName}</div>
        <div class="details" style="font-weight: 600; color: #444; margin-top: 8px; font-size: 13px; background: #f8f9fa; padding: 6px; border-radius: 4px;">
          ▲ +${eleStats.ascent}m &nbsp; ▼ -${eleStats.descent}m &nbsp;|&nbsp; ⏱ ~${hikingTime}
        </div>
        <div style="margin-top: 8px; display: flex; gap: 6px; font-size: 11px;">${badgesHtml}</div>
      `;
      container.appendChild(el);
    }
  });
}

function updateDaysButtonsUI() {
  if (appCtx.customNights.length > 0) return; 
  document.querySelectorAll('.day-btn').forEach(btn => {
    const days = parseInt(btn.dataset.days);
    if (days === currentDays) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function setupEvents() {
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      if (window.innerWidth < 768) {
        sidebar.classList.toggle('collapsed');
        setTimeout(() => map.invalidateSize(), 300);
      }
    });
  }

  document.querySelectorAll('.profile-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.target.closest('.profile-btn');
      if (!targetBtn) return;
      document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
      targetBtn.classList.add('active');
      updateProfile(targetBtn.dataset.profile);
    });
  });

  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.target.closest('.day-btn');
      if (!targetBtn) return;
      
      const newDays = parseInt(targetBtn.dataset.days);
      if (!isNaN(newDays)) {
        window.clearCustomPlan();
        document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
        targetBtn.classList.add('active');
        currentDays = newDays;
        renderVariant(currentDays);
      }
    });
  });
}

initApp();