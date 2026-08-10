import L from 'leaflet';
import * as turf from '@turf/turf';
import { map, layers, ACCESS_TRACK_COLORS } from './MapConfig.js';
import { DataLoader } from './DataLoader.js';

export const OSM_CATEGORIES = {
  peak: { name: 'Szczyty i przełęcze', color: '#6a4c93', icon: '⛰️' },
  water: { name: 'Źródła wody', color: '#1982c4', icon: '💧' },
  shelter: { name: 'Wiaty i schrony', color: '#ffca3a', icon: '⛺' },
  sleep_indoor: { name: 'Schroniska i pensjonaty', color: '#457b9d', icon: '🛏️' },
  bench: { name: 'Ławki i stoły piknikowe', color: '#8ac926', icon: '🪑' },
  viewpoint: { name: 'Punkty widokowe', color: '#ff924c', icon: '👁️' },
  food: { name: 'Gastronomia', color: '#ff595e', icon: '🍽️' },
  bus: { name: 'Przystanki', color: '#4267B2', icon: '🚌' },
  historic: { name: 'Punkty historyczne', color: '#574b90', icon: '🏛️' },
  toilets: { name: 'Toalety', color: '#607d8b', icon: '🚻' },
  supply: { name: 'Sklepy i Zaopatrzenie', color: '#8338ec', icon: '🛒' },
  firepit: { name: 'Miejsca na ognisko', color: '#ff0054', icon: '🔥' },
  sleep_outdoor: { name: 'Pola namiotowe i biwaki', color: '#2a9d8f', icon: '⛺' },
  pharmacy: { name: 'Apteki', color: '#d90429', icon: '⚕️' },
  atm: { name: 'Bankomaty', color: '#0077b6', icon: '🏧' },
  info: { name: 'Drogowskazy i Tablice', color: '#8d99ae', icon: 'ℹ️' },
  nature_monument: { name: 'Pomniki Przyrody', color: '#2a9d8f', icon: '🍃' }
};

export class MapModules {
  static getOsmCatKey(poi) {
    if (poi.category === 'natural' && ['peak', 'saddle'].includes(poi.type)) return 'peak';
    if (poi.category === 'amenity' && poi.type === 'drinking_water') return 'water';
    if (poi.category === 'natural' && poi.type === 'spring') return 'water';
    if (poi.category === 'man_made' && poi.type === 'water_well') return 'water';
    if (poi.category === 'amenity' && poi.type === 'shelter') return 'shelter';
    if (poi.category === 'leisure' && poi.type === 'firepit') return 'firepit'; 
    if (poi.category === 'historic' && poi.type === 'nature_monument') return 'nature_monument';
    
    if (poi.category === 'tourism' && ['alpine_hut', 'guest_house', 'hostel', 'hotel', 'chalet', 'bed_and_breakfast', 'apartment', 'motel'].includes(poi.type)) return 'sleep_indoor';
    if (poi.category === 'tourism' && ['wilderness_hut', 'camp_site'].includes(poi.type)) return 'sleep_outdoor';
    
    if (poi.category === 'amenity' && poi.type === 'pharmacy') return 'pharmacy';
    if (poi.category === 'amenity' && poi.type === 'atm') return 'atm';
    if (poi.category === 'tourism' && poi.type === 'information') return 'info';

    if (poi.category === 'amenity' && poi.type === 'bench') return 'bench';
    if (poi.category === 'tourism' && poi.type === 'picnic_site') return 'bench';
    if (poi.category === 'leisure' && poi.type === 'picnic_table') return 'bench';
    if (poi.category === 'tourism' && poi.type === 'viewpoint') return 'viewpoint';
    if (poi.category === 'amenity' && ['restaurant', 'cafe', 'fast_food'].includes(poi.type)) return 'food';
    if (poi.category === 'highway' && poi.type === 'bus_stop') return 'bus';
    if (poi.category === 'historic' && poi.type !== 'nature_monument') return 'historic';
    if (poi.category === 'amenity' && poi.type === 'toilets') return 'toilets';
    if (poi.category === 'shop') return 'supply';
    return null;
  }

  static getOsmPoiIcon(catKey) {
    const cat = OSM_CATEGORIES[catKey] || { color: '#666', icon: '📍' };
    return L.divIcon({
      html: `<div style="background-color: ${cat.color}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); font-size: 13px;">${cat.icon}</div>`,
      className: '', iconSize: [24, 24], iconAnchor: [12, 12]
    });
  }

  static injectDirectionControlsUI() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const controlBox = document.createElement('div');
    controlBox.style.cssText = 'padding: 10px; background: #f1faee; border-radius: 8px; margin-bottom: 15px; border: 1px solid #a8dadc;';
    controlBox.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 6px; color: #1d3557; font-size:13px;">🧭 Kierunek i Brama Startowa</div>
      <div style="display: flex; gap: 6px; margin-bottom: 8px;">
        <button onclick="window.toggleDirection()" style="flex:1; padding:6px; background:#457b9d; color:white; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">🔄 Odwróć kierunek</button>
      </div>
      <div style="font-size: 12px; margin-bottom: 4px; color: #333; font-weight: 500;">Startuję z:</div>
      <div style="display: flex; gap: 6px;">
        <button onclick="window.setCustomStart('straconka')" style="flex:1; padding:6px; background:#1d3557; color:white; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Bielsko-Biała</button>
        <button onclick="window.setCustomStart('rabka')" style="flex:1; padding:6px; background:#2a9d8f; color:white; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Rabka-Zdrój</button>
      </div>
    `;
    const header = sidebar.querySelector('header') || sidebar.firstChild;
    sidebar.insertBefore(controlBox, header.nextSibling);
  }

  static setupGPS() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;
    
    const gpsBtn = document.createElement('button');
    gpsBtn.innerHTML = '📍';
    gpsBtn.title = "Pokaż moją lokalizację na szlaku";
    gpsBtn.style.cssText = 'position: absolute; bottom: 20px; right: 20px; z-index: 1000; background: white; border: 2px solid rgba(0,0,0,0.2); border-radius: 4px; width: 44px; height: 44px; font-size: 22px; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.15);';
    
    let userMarker = null;
    gpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) return;
      gpsBtn.innerHTML = '⌛'; 
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          gpsBtn.innerHTML = '📍';
          const { latitude, longitude } = pos.coords;
          if (!userMarker) {
            const radarIcon = L.divIcon({ className: 'gps-radar', html: '<div style="width:16px; height:16px; background:#007bff; border:3px solid white; border-radius:50%; box-shadow: 0 0 10px rgba(0,123,255,0.8);"></div>', iconSize: [16,16], iconAnchor: [8,8] });
            userMarker = L.marker([latitude, longitude], { icon: radarIcon }).addTo(map);
          } else {
            userMarker.setLatLng([latitude, longitude]);
          }
          map.setView([latitude, longitude], 14);
        },
        () => { gpsBtn.innerHTML = '❌'; setTimeout(() => gpsBtn.innerHTML = '📍', 3000); },
        { enableHighAccuracy: true }
      );
    });
    mapContainer.appendChild(gpsBtn);
  }

  static generateDynamicSidebar(categories, appCtx) {
    const toggleContainer = document.querySelector('.layer-toggles');
    if (!toggleContainer) return;
    toggleContainer.innerHTML = '';

    const createToggle = (labelHtml, layerToToggle, isOsmGroup = false) => {
      const label = document.createElement('label');
      label.className = 'toggle-item';
      label.innerHTML = `<input type="checkbox" checked /> ${labelHtml}`;
      toggleContainer.appendChild(label);
      label.querySelector('input').addEventListener('change', e => {
        if (isOsmGroup) {
          e.target.checked ? appCtx.osmClusterGroup.addLayer(layerToToggle) : appCtx.osmClusterGroup.removeLayer(layerToToggle);
        } else {
          e.target.checked ? map.addLayer(layerToToggle) : map.removeLayer(layerToToggle);
        }
      });
    };

    createToggle(`Główne Bazy / Start / Meta`, layers.mainPoisLayer);
    
    // Obsługa przełączników szlaków dojściowych w UX
    if (layers.rabkaGreenLayer) createToggle(`Dojście z Rabki (Szlak Zielony)`, layers.rabkaGreenLayer);
    if (layers.rabkaBlueLayer) createToggle(`Dojście z Rabki (Szlak Niebieski)`, layers.rabkaBlueLayer);

    createToggle(`Strefy 'Zanocuj w lesie'`, layers.wildCampPolygonsLayer);
    createToggle(`Rezerwaty Przyrody`, layers.naturePolygonsLayer);

    Object.keys(categories).forEach(key => {
      createToggle(categories[key].name, categories[key].layer, true);
    });

    createToggle(`Punkty GOT (MSB)`, layers.gotLayerGroup);
  }

  static async initMassiveOsmPois(osmPois, mainLine, appCtx) {
    try {
      appCtx.osmClusterGroup = L.markerClusterGroup({ disableClusteringAtZoom: 14, spiderfyOnMaxZoom: true, maxClusterRadius: 50, showCoverageOnHover: false });
      const categoriesMap = {};
      Object.keys(OSM_CATEGORIES).forEach(key => categoriesMap[key] = { name: OSM_CATEGORIES[key].name, layer: L.layerGroup() });

      appCtx.vitalLogisticsOnRoute = [];

      let flatCoords = [];
      turf.coordEach(appCtx.originalMainLine, c => flatCoords.push(c));

      osmPois.forEach(poi => {
        const lat = parseFloat(poi.lat);
        const lon = parseFloat(poi.lon);
        if (isNaN(lat) || isNaN(lon)) return;

        let catKey = this.getOsmCatKey(poi);
        if (!catKey) return;

        let maxDist = 0.15; 
        if (['supply', 'sleep_indoor', 'pharmacy', 'atm', 'bus', 'sleep_outdoor'].includes(catKey)) {
            maxDist = 3.0; 
        } else if (['water', 'food', 'toilets', 'shelter'].includes(catKey)) {
            maxDist = 1.0; 
        } else if (['historic', 'nature_monument', 'info'].includes(catKey)) {
            maxDist = 0.5; 
        }

        let isNear = false;
        for (let i = 0; i < flatCoords.length; i += 5) {
            const dLon = Math.abs(flatCoords[i][0] - lon);
            const dLat = Math.abs(flatCoords[i][1] - lat);
            if (dLon < 0.04 && dLat < 0.035) { 
                isNear = true;
                break;
            }
        }
        if (!isNear) return;

        const pt = turf.point([lon, lat]);
        const snapped = turf.nearestPointOnLine(appCtx.originalMainLine, pt, {units: 'kilometers'});
        
        if (snapped.properties.dist > maxDist) return;

        const cat = categoriesMap[catKey];
        if (cat) {
          let actionBtn = '';
          if (['shelter', 'bench', 'peak', 'firepit', 'sleep_outdoor', 'sleep_indoor', 'supply'].includes(catKey)) {
              const isSelected = appCtx.customNights.find(n => n.id === poi.id);
              const btnText = isSelected ? '➖ Usuń z planu' : '⛺ Zaplanuj nocleg tutaj';
              const btnColor = isSelected ? '#e63946' : '#2a9d8f';
              actionBtn = `<br/><button onclick="window.toggleCustomNight('${poi.id}', '${(poi.name||cat.name).replace(/'/g, "\\'")}', ${lat}, ${lon})" style="margin-top:10px; width:100%; padding:6px 10px; cursor:pointer; background:${btnColor}; color:#fff; border:none; border-radius:4px; font-weight:bold;">${btnText}</button>`;
          }

          const marker = L.marker([lat, lon], { icon: this.getOsmPoiIcon(catKey) });
          const distStr = snapped.properties.dist > 0.15 ? `<br/><small style="color:#666;">Zejście: ~${Math.round(snapped.properties.dist * 1000)} m</small>` : '';
          
          marker.bindPopup(`<strong>${poi.name || 'Punkt na trasie'}</strong><br/>Typ: ${cat.name}${distStr}${actionBtn}`);
          cat.layer.addLayer(marker);
        }

        if (['supply', 'water', 'food', 'pharmacy', 'atm'].includes(catKey)) {
          appCtx.vitalLogisticsOnRoute.push({
            name: poi.name || cat.name,
            catKey: catKey,
            originalLon: lon,
            originalLat: lat,
            km: 0
          });
        }
      });

      Object.keys(categoriesMap).forEach(key => {
        appCtx.osmLayerGroups[key] = categoriesMap[key].layer;
        appCtx.osmClusterGroup.addLayer(categoriesMap[key].layer);
      });

      map.addLayer(appCtx.osmClusterGroup);
      this.generateDynamicSidebar(categoriesMap, appCtx);

    } catch (err) {
      console.error("Błąd ładowania punktów OSM:", err);
    }
  }

  static async initMsbGotSystem(mainLine, osmPois, getPreciseLineSliceFn) {
    try {
      const nodes = await DataLoader.loadMsbNodes();
      const segments = await DataLoader.loadMsbSegments();

      if (!nodes.length || !segments.length) return;

      layers.gotLayerGroup.clearLayers();
      const snappedNodesMap = {};

      const normalizeName = (name) => {
        if (!name) return "";
        return name.toLowerCase().replace(/schronisko/g, '').replace(/pttk/g, '').replace(/przełęcz/g, '')
                   .replace(/szczyt/g, '').replace(/góra/g, '').replace(/pod/g, '').replace(/na/g, '').replace(/\s+/g, '').trim();
      };

      const gpxCoords = mainLine.geometry.type === 'MultiLineString' ? mainLine.geometry.coordinates.flat() : mainLine.geometry.coordinates;
      const startPoint = turf.point(gpxCoords[0]);
      const endPoint = turf.point(gpxCoords[gpxCoords.length - 1]);

      nodes.forEach(node => {
        let finalPoint = turf.point([parseFloat(node.lon), parseFloat(node.lat)]);
        const rawName = node.name.toLowerCase();

        if (rawName.includes('straconka')) finalPoint = startPoint;
        else if (rawName.includes('luboń')) finalPoint = endPoint;
        else {
          const nName = normalizeName(node.name);
          let minD = Infinity;

          if (osmPois && nName.length > 2) {
            osmPois.forEach(poi => {
              if (poi.name) {
                const pName = normalizeName(poi.name);
                if (pName.length > 2 && (nName.includes(pName) || pName.includes(nName))) {
                  const dist = turf.distance(turf.point([parseFloat(node.lon), parseFloat(node.lat)]), turf.point([parseFloat(poi.lon), parseFloat(poi.lat)]));
                  if (dist < 5 && dist < minD) {
                    minD = dist;
                    finalPoint = turf.point([parseFloat(poi.lon), parseFloat(poi.lat)]);
                  }
                }
              }
            });
          }
        }

        const snapped = turf.nearestPointOnLine(mainLine, finalPoint);
        snappedNodesMap[node.id] = { lat: snapped.geometry.coordinates[1], lon: snapped.geometry.coordinates[0], name: node.name };
      });

      segments.forEach(seg => {
        const fromNode = snappedNodesMap[seg.from_node];
        const toNode = snappedNodesMap[seg.to_node];

        if (fromNode && toNode) {
          try {
            const slicedSegment = getPreciseLineSliceFn([fromNode.lon, fromNode.lat], [toNode.lon, toNode.lat], mainLine);
            if (slicedSegment && slicedSegment.geometry) {
              L.geoJSON(slicedSegment, {
                style: { color: '#e63946', weight: 5, opacity: 0.8 },
                filter: (feature) => feature.geometry && ['LineString', 'MultiLineString'].includes(feature.geometry.type)
              }).bindPopup(`<strong>${seg.name}</strong><br/>Punkty GOT: → ${seg.points_forward} | ← ${seg.points_backward}`).addTo(layers.gotLayerGroup);
            }
          } catch (err) {}
        }
      });

      Object.keys(snappedNodesMap).forEach(nodeId => {
        const node = snappedNodesMap[nodeId];
        L.circleMarker([node.lat, node.lon], { radius: 4, fillColor: '#1d3557', color: '#ffffff', weight: 1, fillOpacity: 0.9 })
        .bindPopup(`<strong>${node.name}</strong><br/>Punkt GOT (MSB)`).addTo(layers.gotLayerGroup);
      });

    } catch (err) {
      console.error('Błąd inicjalizacji systemu GOT MSB:', err);
    }
  }
}