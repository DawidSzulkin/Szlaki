import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export const map = L.map('map').setView([49.75, 19.5], 10);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

export const layers = {
  stageLayersGroup: L.layerGroup().addTo(map),
  mainPoisLayer: L.layerGroup().addTo(map),
  waterPoisLayer: L.layerGroup().addTo(map),
  shelterPoisLayer: L.layerGroup().addTo(map),
  rabkaGreenLayer: L.layerGroup().addTo(map),
  rabkaBlueLayer: L.layerGroup().addTo(map),
  gotLayerGroup: L.layerGroup().addTo(map),
  naturePolygonsLayer: L.layerGroup().addTo(map), // ZIELONE REZERWATY
  wildCampPolygonsLayer: L.layerGroup().addTo(map) // STREFY NAMIOTOWE
};

function createPoiIcon(svgSymbol, bgColor, borderColor = '#1d3557', dimmed = false) {
  const opacity = dimmed ? 0.55 : 1;
  const filter = dimmed ? 'filter: grayscale(70%);' : '';

  return L.divIcon({
    className: 'custom-map-icon',
    html: `
      <div style="
        background-color: ${bgColor};
        border: 2.5px solid ${borderColor};
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 3px 6px rgba(0,0,0,0.35);
        opacity: ${opacity};
        ${filter}
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${svgSymbol}
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
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
  default: '<circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path>'
};

const POI_ICON_CONFIG = {
  transport: { symbol: SVG.transport, bg: '#1d3557', border: '#457b9d' },
  water: { symbol: SVG.water, bg: '#00b4d8', border: '#03045e' },
  supply: { symbol: SVG.supply, bg: '#6a4c93', border: '#3a0ca3' },
  sleep_indoor: { symbol: SVG.shelter, bg: '#457b9d', border: '#1d3557' },
  sleep_outdoor: { symbol: SVG.bivouac, bg: '#f77f00', border: '#d62828' },
  firepit: { symbol: SVG.firepit, bg: '#dc2f02', border: '#9d0208' },
  nature_monument: { symbol: SVG.nature, bg: '#2a9d8f', border: '#1f7a6f' }
};

export const icons = {
  shelter: createPoiIcon(SVG.shelter, '#457b9d'),
  water: createPoiIcon(SVG.water, '#00b4d8', '#03045e'),
  bivouac: createPoiIcon(SVG.bivouac, '#f77f00', '#d62828'),
  transport: createPoiIcon(SVG.transport, '#1d3557', '#457b9d'),
  supply: createPoiIcon(SVG.supply, '#6a4c93', '#3a0ca3'),
  firepit: createPoiIcon(SVG.firepit, '#dc2f02'),
  nature_monument: createPoiIcon(SVG.nature, '#2a9d8f')
};

export function getMainPoiIcon(poiType, isActive = true) {
  const config = POI_ICON_CONFIG[poiType] || { symbol: SVG.default, bg: '#6c757d', border: '#495057' };
  return createPoiIcon(config.symbol, config.bg, config.border, !isActive);
}

// Kolory linii dojść (bez zieleni — unikamy kolizji z oznakowaniem szlaków)
export const ACCESS_TRACK_COLORS = {
  rabkaGreen: '#8b6914',
  rabkaBlue: '#457b9d'
};