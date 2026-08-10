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
  natureMonumentsOnRoute: [],
  reservesOnRoute: [],
  wildCampsOnRoute: [],
  customNights: [],
  osmClusterGroup: null,
  osmLayerGroups: {},
  globalMainLine: null,
  originalMainLine: null,
  customStartPoi: null,
  rabkaGreenLine: null,
  accessRoutesLayer: null
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
  
  if (appCtx.customStartPoi && appCtx.rabkaGreenLine) {
    const rabkaCoords = appCtx.rabkaGreenLine.geometry.coordinates;
    const msbCoords = appCtx.originalMainLine.geometry.coordinates;
    
    if (currentDirection === 'WEST_TO_EAST') {
        appCtx.globalMainLine = turf.lineString([...msbCoords, ...[...rabkaCoords].reverse()]);
    } else {
        appCtx.globalMainLine = turf.lineString([...rabkaCoords, ...[...msbCoords].reverse()]);
    }
  } else {
    appCtx.globalMainLine = currentDirection === 'EAST_TO_WEST' ? turf.lineReverse(appCtx.originalMainLine) : appCtx.originalMainLine;
  }
  
  recalculateRouteMetadata();
  renderMainPois();
  renderVariant(currentDays);
};

window.setCustomStart = function(type) {
  if (type === 'rabka') {
    if (!appCtx.rabkaGreenLine) {
        alert("Dane szlaku z Rabki nie zostały jeszcze wczytane. Odczekaj chwilę.");
        return;
    }
    appCtx.customStartPoi = { name: "Rabka-Zdrój (Szlak Zielony)" };
    currentDirection = 'EAST_TO_WEST'; 
    
    const rabkaCoords = appCtx.rabkaGreenLine.geometry.coordinates;
    const msbCoords = [...appCtx.originalMainLine.geometry.coordinates].reverse();
    appCtx.globalMainLine = turf.lineString([...rabkaCoords, ...msbCoords]);
    
  } else {
    appCtx.customStartPoi = null; 
    currentDirection = 'WEST_TO_EAST';
    appCtx.globalMainLine = appCtx.originalMainLine;
  }
  
  recalculateRouteMetadata();
  renderMainPois();
  renderVariant(currentDays);
};

// NOWE: Asynchroniczne wyznaczanie trasy przez API OSRM
window.toggleCustomNight = async function(id, name, lat, lon) {
    if(!appCtx.globalMainLine) return;
    
    const idx = appCtx.customNights.findIndex(n => n.id === id);
    if (idx > -1) {
        appCtx.customNights.splice(idx, 1);
    } else {
        const pt = turf.point([lon, lat]);
        const snapped = turf.nearestPointOnLine(appCtx.globalMainLine, pt, {units: 'kilometers'});
        const km = Math.round(snapped.properties.location * 10) / 10;
        
        const snappedLon = snapped.geometry.coordinates[0];
        const snappedLat = snapped.geometry.coordinates[1];
        
        const straightDistance = snapped.properties.dist;
        let extraDistance = 0;
        let routeGeoJson = null;
        let routedSuccessfully = false;

        // POZIOM 1: Zewnętrzne API OSRM
        try {
            const url = `https://router.project-osrm.org/route/v1/foot/${snappedLon},${snappedLat};${lon},${lat}?geometries=geojson`;
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.code === 'Ok' && data.routes.length > 0) {
                const osrmDistKm = data.routes[0].distance / 1000;
                if (osrmDistKm <= straightDistance * 4 || osrmDistKm <= 3) {
                    routeGeoJson = data.routes[0].geometry; 
                    extraDistance = osrmDistKm;
                    routedSuccessfully = true;
                }
            }
        } catch(e) {
            console.warn("OSRM niedostępny, przechodzę do PathFindera");
        }

        // POZIOM 2: Lokalny PathFinder po nowo wygenerowanej sieci (gdy OSRM zawiódł)
        if (!routedSuccessfully && pathFinder) {
            try {
                const startPointFeature = turf.point([snappedLon, snappedLat]);
                const endPointFeature = turf.point([lon, lat]);
                
                const routeResult = pathFinder.findPath(startPointFeature, endPointFeature);
                if (routeResult && routeResult.path) {
                    let pathCoords = [...routeResult.path];
                    
                    // FIX: Dociągnięcie ścieżki bezpośrednio do współrzędnych POI (ostatnia mila)
                    const lastCoord = pathCoords[pathCoords.length - 1];
                    if (lastCoord[0] !== lon || lastCoord[1] !== lat) {
                        pathCoords.push([lon, lat]);
                    }

                    routeGeoJson = turf.lineString(pathCoords).geometry;
                    const lineForDist = turf.lineString(pathCoords);
                    extraDistance = turf.length(lineForDist, {units: 'kilometers'});
                    routedSuccessfully = true;
                }
            } catch(e) {
                console.warn("PathFinder nie znalazł lokalnej ścieżki");
            }
        }

        // POZIOM 3: Ostateczny fallback (linia prosta / azymut)
        if (!routedSuccessfully) {
            extraDistance = straightDistance;
            routeGeoJson = turf.lineString([[snappedLon, snappedLat], [lon, lat]]).geometry;
        }

        appCtx.customNights.push({
            id, name: name || 'Wybrany punkt noclegu',
            lat: lat, lon: lon,
            snappedLat: snappedLat, snappedLon: snappedLon,
            km, extraDistance: Math.round(extraDistance * 10) / 10,
            routeGeoJson
        });
    }
    map.closePopup();
    renderVariant(currentDays);
    renderMainPois();
};

window.clearCustomPlan = function() {
    appCtx.customNights = [];
    if(appCtx.accessRoutesLayer) appCtx.accessRoutesLayer.clearLayers();
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
  globalLineStart = turf.point(gpxCoords[0]);
  const totalKm = Math.round(turf.length(appCtx.globalMainLine, {units: 'kilometers'})*10)/10;
  
  if (appCtx.customStartPoi) {
     startPoiGlobal = { name: currentDirection === 'EAST_TO_WEST' ? "Rabka-Zdrój (Start)" : "Straconka (Start)", lat: gpxCoords[0][1], lon: gpxCoords[0][0], km: 0 };
     endPoiGlobal = { name: currentDirection === 'EAST_TO_WEST' ? "Straconka (Meta)" : "Rabka-Zdrój (Meta)", lat: gpxCoords[gpxCoords.length - 1][1], lon: gpxCoords[gpxCoords.length - 1][0], km: totalKm };
  } else {
     startPoiGlobal = { name: currentDirection === 'WEST_TO_EAST' ? "Straconka (Start)" : "Luboń Wielki (Start)", lat: gpxCoords[0][1], lon: gpxCoords[0][0], km: 0 };
     endPoiGlobal = { name: currentDirection === 'WEST_TO_EAST' ? "Luboń Wielki (Meta)" : "Straconka (Meta)", lat: gpxCoords[gpxCoords.length - 1][1], lon: gpxCoords[gpxCoords.length - 1][0], km: totalKm };
  }

  rawPoisData.forEach((poi) => {
    const pt = turf.point([parseFloat(poi.originalLon || poi.lon), parseFloat(poi.originalLat || poi.lat)]);
    const snapped = turf.nearestPointOnLine(appCtx.globalMainLine, pt, {units: 'kilometers'});
    poi.km = Math.round(snapped.properties.location * 10) / 10;
  });
  
  rawPoisData.sort((a, b) => a.km - b.km);

  appCtx.vitalLogisticsOnRoute.forEach(logPoi => {
    const pt = turf.point([logPoi.originalLon, logPoi.originalLat]);
    const snapped = turf.nearestPointOnLine(appCtx.globalMainLine, pt, {units: 'kilometers'});
    logPoi.km = Math.round(snapped.properties.location * 10) / 10;
  });
}

function syncLayerToggles() {
  const toggles = document.querySelectorAll('.layer-toggles input[type="checkbox"]');
  toggles.forEach(cb => {
    const parentLabel = cb.parentElement;
    if (parentLabel) {
      const labelText = parentLabel.textContent.toLowerCase();
      // Ochrona szlaków dojściowych przed wyczyszczeniem przy starcie
      if (!labelText.includes('bazy') && !labelText.includes('start') && !labelText.includes('dojście')) {
        cb.checked = false; 
        cb.dispatchEvent(new Event('change'));
      } else {
        cb.checked = true;
      }
    }
  });
}

async function initApp() {
  try {
    MapModules.setupGPS();
    MapModules.injectDirectionControlsUI();
    
    appCtx.accessRoutesLayer = L.layerGroup().addTo(map);

    fullTrackGeoJson = await DataLoader.loadGpxTrack();
    const mainLineRaw = fullTrackGeoJson.features.find(f => f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'));
    if (!mainLineRaw) return;
    
    let flatCoords = [];
    turf.coordEach(mainLineRaw, c => flatCoords.push(c));
    const mainLine = turf.lineString(flatCoords);

    appCtx.originalMainLine = mainLine;
    appCtx.globalMainLine = mainLine;

    const baseTrackLayer = L.geoJSON(fullTrackGeoJson, {
      pane: 'linesPane',
      style: { color: '#e63946', weight: 4, opacity: 0.6 },
      filter: (feature) => feature.geometry && ['LineString', 'MultiLineString'].includes(feature.geometry.type)
    }).addTo(map);
    map.fitBounds(baseTrackLayer.getBounds());

    const [networkGeoJson, originalPois, osmRes] = await Promise.all([
      DataLoader.loadConnectorNetwork(),
      DataLoader.loadPois(),
      fetch(`${DataLoader.baseUrl}data/msb_pois.json`),
      loadRabkaAccessTracks(),
      loadPolygons(),
      loadNatureMonuments(mainLine)
    ]);

    if (networkGeoJson) pathFinder = new PathFinder(networkGeoJson, { tolerance: 0.0005 });
    
    let osmPois = [];
    if (osmRes.ok) osmPois = await osmRes.json();

    const normalizeName = (name) => {
      if(!name) return "";
      return name.toLowerCase().replace(/schronisko/g, '').replace(/pttk/g, '').replace(/przełęcz/g, '')
                 .replace(/szczyt/g, '').replace(/góra/g, '').replace(/pod/g, '').replace(/na/g, '').replace(/\s+/g, '').trim();
    };

    rawPoisData = originalPois.map((poi, index) => {
      let bestLon = poi.lon;
      let bestLat = poi.lat;

      if (index !== 0 && index !== originalPois.length - 1) {
        const nName = normalizeName(poi.name);
        let match = null;
        if (nName.length > 2 && Array.isArray(osmPois)) {
            match = osmPois.find(op => op.name && normalizeName(op.name).includes(nName));
        }
        if (match) {
            bestLon = match.lon;
            bestLat = match.lat;
        }
      }

      return {
        ...poi, 
        originalLon: bestLon, 
        originalLat: bestLat,
        km: 0,
        lon: bestLon, 
        lat: bestLat
      };
    });

    if (Array.isArray(osmPois)) {
      const commercialNights = osmPois.filter(p => 
        p.category === 'tourism' && 
        ['guest_house', 'hostel', 'hotel', 'chalet', 'alpine_hut', 'wilderness_hut', 'bed_and_breakfast', 'apartment', 'motel'].includes(p.type)
      );

      commercialNights.forEach(cn => {
        const isDuplicate = rawPoisData.some(rp => turf.distance([rp.lon, rp.lat], [cn.lon, cn.lat], {units: 'kilometers'}) < 0.2);
        if (!isDuplicate) {
          rawPoisData.push({
            id: `osm_${cn.id}`,
            name: cn.name || 'Kwatera / Pensjonat',
            lat: cn.lat,
            lon: cn.lon,
            originalLat: cn.lat,
            originalLon: cn.lon,
            type: 'sleep_indoor',
            profiles: ['standard', 'wild'] 
          });
        }
      });
    }
    
    if(Array.isArray(osmPois) && osmPois.length > 0) {
      await MapModules.initMassiveOsmPois(osmPois, mainLine, appCtx);
      await MapModules.initMsbGotSystem(mainLine, osmPois, getPreciseLineSlice);
    }

    Object.values(appCtx.osmLayerGroups || {}).forEach(layerGroup => {
        if (map.hasLayer(layerGroup)) map.removeLayer(layerGroup);
    });

    recalculateRouteMetadata();
    setupEvents();
    updateProfile(currentProfile);

    setTimeout(() => {
        syncLayerToggles();
    }, 150);

  } catch (error) { console.error('Błąd podczas ładowania danych trasy:', error); }
}

async function loadPolygons() {
  try {
    let bufferedTrail = null;
    
    if (appCtx.globalMainLine) {
      try {
        bufferedTrail = turf.buffer(appCtx.globalMainLine, 0.4, { units: 'kilometers', steps: 8 });
      } catch (e) {
        bufferedTrail = appCtx.globalMainLine; 
      }
    }

    appCtx.reservesOnRoute = [];
    appCtx.wildCampsOnRoute = [];

    const [reserves, bdl] = await Promise.all([
      fetch(`${DataLoader.baseUrl}data/obszary_chronione.geojson`).then(r => r.ok ? r.json() : null),
      fetch(`${DataLoader.baseUrl}data/zanocuj_w_lesie_ready.geojson`).then(r => r.ok ? r.json() : null)
    ]);

    if (reserves) {
      L.geoJSON(reserves, { 
        pane: 'polygonsPane',
        style: { fillColor: '#2a9d8f', fillOpacity: 0.3, color: '#1f7a6f', weight: 2 },
        filter: (feature) => {
          if (!bufferedTrail) return true;
          try { return turf.booleanIntersects(bufferedTrail, feature); } catch (e) { return false; }
        },
        onEachFeature: (feature, layer) => {
           let name = feature.properties.name || "Obszar chroniony";
           let type = feature.properties.boundary === 'protected_area' ? "Park / Rezerwat" : "Rezerwat przyrody";
           layer.bindPopup(`<strong>🌳 ${name}</strong><br/>Typ: ${type}`);

           try {
             const centroid = turf.centroid(feature);
             const snapped = turf.nearestPointOnLine(appCtx.globalMainLine, centroid, {units: 'kilometers'});
             const km = Math.round(snapped.properties.location * 10) / 10;
             appCtx.reservesOnRoute.push({ name, km });
           } catch(err) {}
        }
      }).addTo(layers.naturePolygonsLayer);
    }

    if (bdl && bdl.features && bdl.features.length > 0) {
      L.geoJSON(bdl, {
        pane: 'polygonsPane',
        style: { fillColor: '#f4a261', fillOpacity: 0.3, color: '#e76f51', weight: 2, dashArray: '5,5' },
        filter: (feature) => {
          if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return false;
          if (!bufferedTrail) return true;
          try { return turf.booleanIntersects(bufferedTrail, feature); } catch (e) { return false; }
        },
        onEachFeature: (feature, layer) => {
           layer.bindPopup(`<strong>⛺ Strefa "Zanocuj w lesie"</strong><br/>Legalne biwakowanie (Lasy Państwowe)`);
           try {
             const centroid = turf.centroid(feature);
             const snapped = turf.nearestPointOnLine(appCtx.globalMainLine, centroid, {units: 'kilometers'});
             const km = Math.round(snapped.properties.location * 10) / 10;
             appCtx.wildCampsOnRoute.push({ name: 'Strefa "Zanocuj w lesie"', km });
           } catch(err) {}
        }
      }).addTo(layers.wildCampPolygonsLayer);
    }
  } catch(e) { console.warn("Błąd ładowania poligonów:", e); }
}

async function loadNatureMonuments(mainLine) {
  try {
    const response = await fetch(`${DataLoader.baseUrl}data/pomniki_przyrody.geojson`);
    if (!response.ok) return;
    const geojson = await response.json();

    const leafIcon = MapModules.getOsmPoiIcon('nature_monument');
    appCtx.natureMonumentsOnRoute = [];

    geojson.features.forEach(feature => {
      if (!feature.geometry || feature.geometry.type !== 'Point') return;
      
      const lon = feature.geometry.coordinates[0];
      const lat = feature.geometry.coordinates[1];
      const pt = turf.point([lon, lat]);
      
      const snapped = turf.nearestPointOnLine(appCtx.globalMainLine || mainLine, pt, {units: 'kilometers'});
      
      if (snapped.properties.dist <= 2.5) { 
        const name = feature.properties.name || "Pomnik Przyrody";
        const distanceStr = Math.round(snapped.properties.dist * 1000);
        const km = Math.round(snapped.properties.location * 10) / 10;

        appCtx.natureMonumentsOnRoute.push({ name, km });
        
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
      const mainFeature = greenGeoJson.features.find(f => f.geometry && ['LineString', 'MultiLineString'].includes(f.geometry.type));
      if (mainFeature) {
        let flatCoords = [];
        turf.coordEach(mainFeature, c => flatCoords.push(c));
        appCtx.rabkaGreenLine = turf.lineString(flatCoords);
      }

      L.geoJSON(greenGeoJson, {
        pane: 'linesPane',
        style: { color: ACCESS_TRACK_COLORS.rabkaGreen, weight: 5, dashArray: '6, 6', opacity: 0.9 },
        filter: (f) => f.geometry && ['LineString', 'MultiLineString'].includes(f.geometry.type)
      }).bindPopup(`<strong>Dojście z Rabki (Szlak Zielony)</strong>`).addTo(layers.rabkaGreenLayer);
    }
  } catch (e) {}

  try {
    const blueGeoJson = await DataLoader.loadRabkaBlueTrack();
    if (blueGeoJson) {
      L.geoJSON(blueGeoJson, {
        pane: 'linesPane',
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
      const isStart = poi.km === 0; 
      const isEnd = poi.km === Math.max(...rawPoisData.map(p => p.km));
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

        if (isStart) marker.bindPopup(`<strong>${poi.name}</strong><br/>▶ Punkt na trasie<br/>KM: ${poi.km}${actionBtn}`);
        else if (isEnd) marker.bindPopup(`<strong>${poi.name}</strong><br/>🏁 Punkt na trasie<br/>KM: ${poi.km}${actionBtn}`);
        else marker.bindPopup(`<strong>${poi.name}</strong><br/>Baza Noclegowa<br/>KM: ${poi.km}${tentNote}${actionBtn}`);
      }
    });
  }
}

function renderVariant(daysCount) {
  if (!appCtx.globalMainLine || (!activeProfilePois.length && appCtx.customNights.length === 0)) return;

  layers.stageLayersGroup.clearLayers();
  if (appCtx.accessRoutesLayer) appCtx.accessRoutesLayer.clearLayers();
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

      // NOWE: Renderowanie przerywanych linii wyznaczonych przez OSRM
      appCtx.customNights.forEach(cn => {
          if (cn.routeGeoJson) {
              L.geoJSON(cn.routeGeoJson, {
                  pane: 'linesPane',
                  style: { color: '#2a9d8f', weight: 4, dashArray: '5, 8', opacity: 0.9 }
              }).bindPopup(`<strong>Dojście do: ${cn.name}</strong><br/>Dystans poza szlakiem: ${cn.extraDistance} km`).addTo(appCtx.accessRoutesLayer);
          }
      });

      const baseStages = RouteController.getVariantStages(currentDays, activeProfilePois);
      let autoNights = [];
      for (let i = 0; i < baseStages.length - 1; i++) {
          autoNights.push({
              name: baseStages[i].endPoi.name, lat: baseStages[i].endPoi.lat, lon: baseStages[i].endPoi.lon, km: baseStages[i].endPoi.km, isCustom: false
          });
      }

      let combinedNights = [...autoNights];
      appCtx.customNights.forEach(cn => {
          const exists = combinedNights.some(an => Math.abs(an.km - cn.km) < 0.5);
          if (!exists) {
              combinedNights.push({
                  name: cn.name, lat: cn.lat, lon: cn.lon, km: cn.km,
                  isCustom: true, extraDistance: cn.extraDistance,
                  snappedLat: cn.snappedLat, snappedLon: cn.snappedLon
              });
          }
      });

      combinedNights.sort((a,b) => a.km - b.km);
      const waypoints = [startPoiGlobal, ...combinedNights, endPoiGlobal];
      
      for(let i=0; i<waypoints.length-1; i++) {
          let dist = Math.abs(waypoints[i+1].km - waypoints[i].km);
          
          // Doliczanie ekstra odległości z OSRM do całodniowego dystansu
          if (waypoints[i].isCustom) dist += waypoints[i].extraDistance;
          if (waypoints[i+1].isCustom) dist += waypoints[i+1].extraDistance;

          const startLon = waypoints[i].isCustom ? waypoints[i].snappedLon : waypoints[i].lon;
          const startLat = waypoints[i].isCustom ? waypoints[i].snappedLat : waypoints[i].lat;
          const endLon = waypoints[i+1].isCustom ? waypoints[i+1].snappedLon : waypoints[i+1].lon;
          const endLat = waypoints[i+1].isCustom ? waypoints[i+1].snappedLat : waypoints[i+1].lat;

          normalizedStages.push({
              day: i+1, startName: waypoints[i].name, endName: waypoints[i+1].name, 
              startLat: startLat, startLon: startLon,
              endLat: endLat, endLon: endLon, 
              startKm: waypoints[i].km, endKm: waypoints[i+1].km,
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

    const minKm = Math.min(stage.startKm, stage.endKm);
    const maxKm = Math.max(stage.startKm, stage.endKm);

    const stageLogistics = appCtx.vitalLogisticsOnRoute.filter(p => p.km > minKm && p.km < maxKm);
    const shopsCount = stageLogistics.filter(p => p.catKey === 'supply' || p.catKey === 'food').length;
    const waterCount = stageLogistics.filter(p => p.catKey === 'water').length;
    const atmCount = stageLogistics.filter(p => p.catKey === 'atm').length;

    const stageMonuments = appCtx.natureMonumentsOnRoute.filter(p => p.km >= minKm && p.km <= maxKm);
    const stageReserves = appCtx.reservesOnRoute.filter(p => p.km >= minKm && p.km <= maxKm);
    const stageWildCamps = appCtx.wildCampsOnRoute.filter(p => p.km >= minKm && p.km <= maxKm);

    try {
      const slicedSegment = getPreciseLineSlice([stage.startLon, stage.startLat], [stage.endLon, stage.endLat], appCtx.globalMainLine);
      
      if (slicedSegment && slicedSegment.geometry) {
        eleStats = calculateElevationStats(slicedSegment);
        hikingTime = calculateHikingTime(stage.distanceKm, eleStats.ascent);

        L.geoJSON(slicedSegment, {
          pane: 'linesPane',
          style: { color: stage.color, weight: 6, opacity: 0.9 },
          filter: (feature) => feature.geometry && ['LineString', 'MultiLineString'].includes(feature.geometry.type)
        }).bindPopup(`
          <strong>Dzień ${stage.day}</strong><br/>
          ${stage.startName} → ${stage.endName}<br/>
          Dystans: ${stage.distanceKm} km<br/>
          Podejścia (oś główna): +${eleStats.ascent} m | Zejścia: -${eleStats.descent} m<br/>
          ⏱ Czas: ~${hikingTime}
        `).addTo(layers.stageLayersGroup);
      }
    } catch (err) {}

    if(container) {
      const el = document.createElement('div');
      el.className = 'stage-item';
      el.style.borderColor = stage.color;
      
      let badgesHtml = '';
      if (shopsCount > 0) badgesHtml += `<span style="background: #8338ec; color: white; padding: 3px 6px; border-radius: 4px; font-weight: 500; font-size: 11px;">🛒 Sklepy: ${shopsCount}</span>`;
      if (waterCount > 0) badgesHtml += `<span style="background: #00b4d8; color: white; padding: 3px 6px; border-radius: 4px; font-weight: 500; font-size: 11px;">💧 Woda: ${waterCount}</span>`;
      if (atmCount > 0) badgesHtml += `<span style="background: #0077b6; color: white; padding: 3px 6px; border-radius: 4px; font-weight: 500; font-size: 11px;">🏧 Bankomaty: ${atmCount}</span>`;
      
      if (stageMonuments.length > 0) badgesHtml += `<span style="background: #2a9d8f; color: white; padding: 3px 6px; border-radius: 4px; font-weight: 500; font-size: 11px;" title="${stageMonuments.map(m=>m.name).join(', ')}">🍃 Pomniki: ${stageMonuments.length}</span>`;
      if (stageReserves.length > 0) badgesHtml += `<span style="background: #1f7a6f; color: white; padding: 3px 6px; border-radius: 4px; font-weight: 500; font-size: 11px;" title="${stageReserves.map(r=>r.name).join(', ')}">🌳 Rezerwaty: ${stageReserves.length}</span>`;
      if (stageWildCamps.length > 0) badgesHtml += `<span style="background: #f4a261; color: white; padding: 3px 6px; border-radius: 4px; font-weight: 500; font-size: 11px;">⛺ Strefy biwaku: ${stageWildCamps.length}</span>`;

      el.innerHTML = `
        <header style="color: ${stage.color}; font-weight:bold;">Etap ${stage.day}: ${stage.distanceKm} km</header>
        <div class="details" style="font-size: 14px; margin-top:5px;">${stage.startName} <br/>⬇<br/> ${stage.endName}</div>
        <div class="details" style="font-weight: 600; color: #444; margin-top: 8px; font-size: 13px; background: #f8f9fa; padding: 6px; border-radius: 4px;">
          ▲ +${eleStats.ascent}m &nbsp; ▼ -${eleStats.descent}m &nbsp;|&nbsp; ⏱ ~${hikingTime}
        </div>
        <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">${badgesHtml}</div>
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
    let touchStartY = 0;
    
    sidebarToggle.addEventListener('click', () => {
      if (window.innerWidth < 768) {
        sidebar.classList.toggle('collapsed');
        setTimeout(() => map.invalidateSize(), 300);
      }
    });

    sidebarToggle.addEventListener('touchstart', (e) => {
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    sidebarToggle.addEventListener('touchend', (e) => {
      const touchEndY = e.changedTouches[0].screenY;
      if (touchEndY - touchStartY > 40 && !sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
        setTimeout(() => map.invalidateSize(), 300);
      } 
      else if (touchStartY - touchEndY > 40 && sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
      }
    }, { passive: true });
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