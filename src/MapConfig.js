import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export const map = L.map('map').setView([49.75, 19.5], 10);

// --- TWORZENIE WARSTW Z WŁASNYM Z-INDEX (PANES) ---
map.createPane('polygonsPane');
map.getPane('polygonsPane').style.zIndex = 400; // Najniżej: Lasy i rezerwaty

map.createPane('linesPane');
map.getPane('linesPane').style.zIndex = 450; // Środek: Linie GPX i ślady

// Ikony (Markery) mają domyślnie z-index = 600, więc będą na samej górze.

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

export const layers = {
  stageLayersGroup: L.layerGroup().addTo(map), // SZLAK (Zostawiamy włączony)
  mainPoisLayer: L.layerGroup().addTo(map),    // GŁÓWNE BAZY (Zostawiamy włączone)
  rabkaGreenLayer: L.layerGroup(),             // WYŁĄCZONE w tle
  rabkaBlueLayer: L.layerGroup(),              // WYŁĄCZONE w tle
  gotLayerGroup: L.layerGroup(),               // WYŁĄCZONE w tle
  naturePolygonsLayer: L.layerGroup(),         // WYŁĄCZONE w tle
  wildCampPolygonsLayer: L.layerGroup()        // WYŁĄCZONE w tle
};

function createUniversalIcon(svgSymbol, bgColor, borderColor = '#1d3557', isMain = false, dimmed = false) {
  const size = isMain ? 36 : 28;
  const opacity = dimmed ? 0.55 : 1;
  const filter = dimmed ? 'filter: grayscale(70%);' : '';
  const zIndex = isMain ? 'z-index: 1000;' : '';

  return L.divIcon({
    className: 'custom-map-icon',
    html: `
      <div style="
        background-color: ${bgColor};
        border: 2.5px solid ${borderColor};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 3px 6px rgba(0,0,0,0.35);
        opacity: ${opacity};
        ${filter}
        ${zIndex}
      ">
        <svg width="${size - 14}" height="${size - 14}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${svgSymbol}
        </svg>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)]
  });
}

const SVG = {
  shelter: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
  water: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>',
  bivouac: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M6 6h12"></path><path d="M6 10h12"></path>',
  transport: '<rect width="16" height="16" x="4" y="4" rx="2"></rect><path d="M4 11h16"></path><path d="M12 4v7"></path><path d="m9 18-2 2"></path><path d="m15 18 2 2"></path>',
  supply: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><line x1="3" x2="21" y1="6" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path>',
  firepit: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path><path d="M14 20l-4-4m0 0l-4 4"></path>',
  nature: '<path d="M12 22v-7"/><path d="M12 15c-3.5-3-6-6-6-9 0-3 2.5-4 5.5-4 2 0 4.5 2 4.5 4 0 2.5-1.5 5-4 9z"/>',
  peak: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  bench: '<path d="M4 18v-4"/><path d="M20 18v-4"/><path d="M2 14h20"/><path d="M7 14V9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5"/>',
  viewpoint: '<circle cx="12" cy="12" r="3"/><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  historic: '<path d="M3 22v-3"/><path d="M21 22v-3"/><path d="M4 19V5"/><path d="M20 19V5"/><path d="M4 5l8-3 8 3"/><path d="M12 22V5"/>',
  toilets: '<path d="M9 13V2m0 11v9m-4-9h8m-9-3c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v3H5v-3Zm10-2v12m0-12c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v5h-6"/>',
  default: '<circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path>'
};

export const POI_CONFIG = {
  sleep_indoor: { symbol: SVG.shelter, bg: '#457b9d', border: '#1d3557', isMain: true },
  sleep_outdoor: { symbol: SVG.bivouac, bg: '#f77f00', border: '#d62828', isMain: true },
  transport: { symbol: SVG.transport, bg: '#1d3557', border: '#457b9d', isMain: true },
  waypoint: { symbol: SVG.default, bg: '#6c757d', border: '#495057', isMain: true },
  
  water: { name: 'Źródła wody', symbol: SVG.water, bg: '#00b4d8', border: '#03045e', isMain: false },
  shelter: { name: 'Wiaty', symbol: SVG.shelter, bg: '#e09f3e', border: '#9e2a2b', isMain: false },
  firepit: { name: 'Miejsca na ognisko', symbol: SVG.firepit, bg: '#dc2f02', border: '#9d0208', isMain: false },
  supply: { name: 'Sklepy', symbol: SVG.supply, bg: '#6a4c93', border: '#3a0ca3', isMain: false },
  nature_monument: { name: 'Pomniki Przyrody', symbol: SVG.nature, bg: '#2a9d8f', border: '#1f7a6f', isMain: false },
  peak: { name: 'Szczyty', symbol: SVG.peak, bg: '#8d99ae', border: '#2b2d42', isMain: false },
  bench: { name: 'Ławki', symbol: SVG.bench, bg: '#607d8b', border: '#37474f', isMain: false },
  viewpoint: { name: 'Punkty widokowe', symbol: SVG.viewpoint, bg: '#ffb703', border: '#fb8500', isMain: false },
  food: { name: 'Gastronomia', symbol: SVG.food, bg: '#e63946', border: '#a8dadc', isMain: false },
  historic: { name: 'Miejsca historyczne', symbol: SVG.historic, bg: '#9c6644', border: '#7f4f24', isMain: false },
  toilets: { name: 'Toalety', symbol: SVG.toilets, bg: '#7f8c8d', border: '#2c3e50', isMain: false },
  bus: { name: 'Przystanki autobusowe', symbol: SVG.transport, bg: '#1d3557', border: '#457b9d', isMain: false }
};

export function getUniversalIcon(poiType, isMain = false, dimmed = false) {
  const config = POI_CONFIG[poiType] || { symbol: SVG.default, bg: '#6c757d', border: '#495057' };
  return createUniversalIcon(config.symbol, config.bg, config.border, isMain, dimmed);
}

export const ACCESS_TRACK_COLORS = {
  rabkaGreen: '#8b6914',
  rabkaBlue: '#457b9d'
};