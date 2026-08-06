import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import * as turf from '@turf/turf';
import PathFinder from 'geojson-path-finder';
import { DataLoader } from './DataLoader.js';
import { RouteController } from './RouteController.js';

const map = L.map('map').setView([49.75, 19.5], 10);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let rawPoisData = [];
let activeProfilePois = [];
let fullTrackGeoJson = null;
let pathFinder = null;
let currentProfile = 'standard';
let currentDays = 5;

// Grupy warstw
const stageLayersGroup = L.layerGroup().addTo(map);
const mainPoisLayer = L.layerGroup().addTo(map);
const waterPoisLayer = L.layerGroup().addTo(map);
const shelterPoisLayer = L.layerGroup().addTo(map);

async function initApp() {
  try {
    fullTrackGeoJson = await DataLoader.loadGpxTrack();
    rawPoisData = await DataLoader.loadPois();
    const osmData = await DataLoader.loadOsmPois();
    const networkGeoJson = await DataLoader.loadConnectorNetwork();

    if (networkGeoJson) {
      pathFinder = new PathFinder(networkGeoJson, { tolerance: 0.0005 });
    }

    const mainLine = fullTrackGeoJson.features[0];
    const gpxCoords = mainLine.geometry.coordinates;
    const gpxStart = gpxCoords[0];
    const gpxEnd = gpxCoords[gpxCoords.length - 1];

    // Dociąganie i przeliczanie skrajnych punktów
    rawPoisData = rawPoisData.map((poi, index) => {
      let trueLon = poi.lon;
      let trueLat = poi.lat;

      if (index === 0) {
        trueLon = gpxStart[0];
        trueLat = gpxStart[1];
      } else if (index === rawPoisData.length - 1) {
        trueLon = gpxEnd[0];
        trueLat = gpxEnd[1];
      }

      const poiPoint = turf.point([trueLon, trueLat]);
      const snapped = turf.nearestPointOnLine(mainLine, poiPoint);
      const distMeters = Math.round(turf.distance(poiPoint, snapped, { units: 'meters' }));

      return {
        ...poi,
        lat: trueLat,
        lon: trueLon,
        snappedLon: snapped.geometry.coordinates[0],
        snappedLat: snapped.geometry.coordinates[1],
        offTrackMeters: distMeters
      };
    });

    if (osmData && osmData.features) {
      processOsmPois(osmData, mainLine);
    }

    const fullTrackLayer = L.geoJSON(fullTrackGeoJson);
    map.fitBounds(fullTrackLayer.getBounds());

    setupEvents();
    updateProfile(currentProfile);

  } catch (error) {
    console.error('Błąd podczas ładowania danych trasy:', error);
  }
}

function updateProfile(profileKey) {
  currentProfile = profileKey;
  activeProfilePois = RouteController.getPoisForProfile(rawPoisData, currentProfile);

  if (currentProfile === 'fast_light') {
    currentDays = 3;
  } else if (currentDays < 4) {
    currentDays = 5;
  }

  updateDaysButtonsUI();
  renderMainPois();
  renderVariant(currentDays);
}

function renderMainPois() {
  mainPoisLayer.clearLayers();

  activeProfilePois.forEach(poi => {
    if (poi.offTrackMeters > 15) {
      drawConnectorPath(poi);
    }

    const marker = L.circleMarker([poi.lat, poi.lon], {
      radius: 6,
      fillColor: '#ffffff',
      color: '#1d3557',
      weight: 2,
      opacity: 1,
      fillOpacity: 1,
      className: 'poi-main'
    }).addTo(mainPoisLayer);

    const offTrackInfo = poi.offTrackMeters > 15 ? `<br/><em>Zejście ze szlaku: ~${poi.offTrackMeters} m</em>` : '';
    const desc = poi.description ? `<br/><small style="color:#555;">${poi.description}</small>` : '';

    marker.bindPopup(`<strong>${poi.name}</strong><br/>KM szlaku: ${poi.km}${offTrackInfo}${desc}`);
  });
}

function drawConnectorPath(poi) {
  const startCoords = [poi.snappedLon, poi.snappedLat];
  const endCoords = [poi.lon, poi.lat];

  drawRoutedPath(startCoords, endCoords, mainPoisLayer, {
    color: '#495057',
    weight: 3,
    dashArray: '4, 6',
    opacity: 0.9
  });
}

function processOsmPois(osmGeoJson, mainLine) {
  osmGeoJson.features.forEach(feature => {
    let coords = null;
    if (feature.geometry.type === 'Point') {
      coords = feature.geometry.coordinates;
    } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'LineString') {
      coords = turf.center(feature).geometry.coordinates;
    }
    if (!coords) return;

    const osmPoint = turf.point([coords[0], coords[1]]);
    const snappedToMain = turf.nearestPointOnLine(mainLine, osmPoint);
    const distanceToTrail = Math.round(turf.distance(osmPoint, snappedToMain, { units: 'meters' }));

    // Odrzucamy punkty dalej niż 300m od szlaku
    if (distanceToTrail > 300) return;

    // Ignorujemy punkty OSM leżące w promieniu 150m od głównych węzłów
    const isMainPoiNearby = rawPoisData.some(mainPoi => {
      const mainPoint = turf.point([mainPoi.lon, mainPoi.lat]);
      return turf.distance(osmPoint, mainPoint, { units: 'meters' }) < 150;
    });

    if (isMainPoiNearby) return;

    const props = feature.properties || {};
    const snappedCoords = snappedToMain.geometry.coordinates;

    if (props.natural === 'spring' || props.amenity === 'drinking_water') {
      if (distanceToTrail > 10) {
        drawRoutedPath(snappedCoords, coords, waterPoisLayer, {
          color: '#00b4d8',
          weight: 2,
          dashArray: '3, 4',
          opacity: 0.9
        });
      }

      const marker = L.circleMarker([coords[1], coords[0]], {
        radius: 4,
        fillColor: '#00b4d8',
        color: '#03045e',
        weight: 1,
        opacity: 0.9,
        fillOpacity: 0.9
      }).addTo(waterPoisLayer);

      const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
      marker.bindPopup(`${name}Typ: Źródło wody<br/><em>Zejście ze szlaku: ~${distanceToTrail} m</em>`);

    } else if (props.amenity === 'shelter') {
      if (distanceToTrail > 10) {
        drawRoutedPath(snappedCoords, coords, shelterPoisLayer, {
          color: '#f77f00',
          weight: 2,
          dashArray: '3, 4',
          opacity: 0.9
        });
      }

      const marker = L.circleMarker([coords[1], coords[0]], {
        radius: 5,
        fillColor: '#f77f00',
        color: '#d62828',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.9
      }).addTo(shelterPoisLayer);

      const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
      marker.bindPopup(`${name}Typ: Wiata / Schron<br/><em>Zejście ze szlaku: ~${distanceToTrail} m</em>`);
    }
  });
}

function drawRoutedPath(startCoords, endCoords, layerGroup, style) {
  const startPoint = turf.point(startCoords);
  const endPoint = turf.point(endCoords);
  let pathFound = false;

  if (pathFinder) {
    const pathResult = pathFinder.findPath(startPoint, endPoint);
    if (pathResult && pathResult.path && pathResult.path.length > 0) {
      const leafletCoords = pathResult.path.map(coord => [coord[1], coord[0]]);
      L.polyline(leafletCoords, style).addTo(layerGroup);
      pathFound = true;
    }
  }

  // Fallback: linia prosta, jeśli sieć ścieżek jest niedostępna lub nieaktywna
  if (!pathFound) {
    L.polyline([
      [startCoords[1], startCoords[0]],
      [endCoords[1], endCoords[0]]
    ], style).addTo(layerGroup);
  }
}

function calculateHikingTime(distanceKm, ascentMeters) {
  const totalHours = (distanceKm / 4.0) + (ascentMeters / 400.0);
  const hours = Math.floor(totalHours);
  const minutes = Math.round((totalHours - hours) * 60);
  return `${hours}h ${minutes === 60 ? 0 : minutes}m`;
}

function calculateElevationStats(geojsonLine) {
  let ascent = 0;
  let descent = 0;
  const coords = geojsonLine.geometry.coordinates;

  for (let i = 1; i < coords.length; i++) {
    const prevEle = coords[i - 1][2];
    const currEle = coords[i][2];
    if (prevEle !== undefined && currEle !== undefined) {
      const diff = currEle - prevEle;
      if (diff > 0) ascent += diff;
      else descent += Math.abs(diff);
    }
  }
  return { ascent: Math.round(ascent), descent: Math.round(descent) };
}

function renderVariant(daysCount) {
  if (!fullTrackGeoJson || !activeProfilePois.length) return;

  stageLayersGroup.clearLayers();
  const stages = RouteController.getVariantStages(daysCount, activeProfilePois);
  const container = document.getElementById('stages-summary');
  container.innerHTML = '';

  const mainLine = fullTrackGeoJson.features[0];

  stages.forEach(stage => {
    const startPoint = turf.point([stage.startPoi.snappedLon, stage.startPoi.snappedLat]);
    const endPoint = turf.point([stage.endPoi.snappedLon, stage.endPoi.snappedLat]);

    let eleStats = { ascent: 0, descent: 0 };
    let hikingTime = '0h 0m';

    try {
      const slicedSegment = turf.lineSlice(startPoint, endPoint, mainLine);
      eleStats = calculateElevationStats(slicedSegment);
      hikingTime = calculateHikingTime(stage.distanceKm, eleStats.ascent);

      L.geoJSON(slicedSegment, {
        style: { color: stage.color, weight: 6, opacity: 0.9 }
      }).bindPopup(`
        <strong>Dzień ${stage.day}</strong><br/>
        ${stage.startName} → ${stage.endName}<br/>
        Dystans: ${stage.distanceKm} km<br/>
        Podejścia: +${eleStats.ascent} m | Zejścia: -${eleStats.descent} m<br/>
        ⏱ Czas: ~${hikingTime}
      `).addTo(stageLayersGroup);

    } catch (err) {
      console.warn(`Błąd wycinania odcinka:`, err);
    }

    const el = document.createElement('div');
    el.className = 'stage-item';
    el.style.borderColor = stage.color;
    el.innerHTML = `
      <header style="color: ${stage.color}">Dzień ${stage.day}: ${stage.distanceKm} km</header>
      <div class="details">${stage.startName} → ${stage.endName}</div>
      <div class="details" style="font-weight: 600; color: #333; margin-top: 4px;">
        ▲ +${eleStats.ascent} m &nbsp; ▼ -${eleStats.descent} m &nbsp;|&nbsp; ⏱ ~${hikingTime}
      </div>
    `;
    container.appendChild(el);
  });
}

function updateDaysButtonsUI() {
  const dayButtons = document.querySelectorAll('.day-btn');
  dayButtons.forEach(btn => {
    const days = parseInt(btn.dataset.days);
    if (currentProfile === 'fast_light' && days > 4) {
      btn.style.display = 'none';
    } else {
      btn.style.display = 'inline-block';
    }

    if (days === currentDays) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function setupEvents() {
  const profileButtons = document.querySelectorAll('.profile-btn');
  profileButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      profileButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      updateProfile(e.target.dataset.profile);
    });
  });

  const dayButtons = document.querySelectorAll('.day-btn');
  dayButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      dayButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentDays = parseInt(e.target.dataset.days);
      renderVariant(currentDays);
    });
  });

  const toggleMain = document.getElementById('toggle-main-pois');
  if (toggleMain) {
    toggleMain.addEventListener('change', (e) => {
      if (e.target.checked) map.addLayer(mainPoisLayer);
      else map.removeLayer(mainPoisLayer);
    });
  }

  const toggleWater = document.getElementById('toggle-water');
  if (toggleWater) {
    toggleWater.addEventListener('change', (e) => {
      if (e.target.checked) map.addLayer(waterPoisLayer);
      else map.removeLayer(waterPoisLayer);
    });
  }

  const toggleShelters = document.getElementById('toggle-shelters');
  if (toggleShelters) {
    toggleShelters.addEventListener('change', (e) => {
      if (e.target.checked) map.addLayer(shelterPoisLayer);
      else map.removeLayer(shelterPoisLayer);
    });
  }
}

initApp();