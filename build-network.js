import fs from 'fs';
import path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import { gpx } from '@tmcw/togeojson';
import * as turf from '@turf/turf';

const GPX_PATH = './public/data/msb.gpx';
const RAW_OSM_PATH = './osm_paths_raw.geojson';
const OUTPUT_PATH = './public/data/connector_network.geojson';
const BUFFER_RADIUS_KM = 0.3; // Pas 300 m wokół szlaku MSB

console.log('1. Ładowanie i konwersja msb.gpx...');
const gpxRaw = fs.readFileSync(GPX_PATH, 'utf8');
const gpxDom = new DOMParser().parseFromString(gpxRaw, 'text/xml');
const msbGeoJSON = gpx(gpxDom);

console.log('2. Tworzenie bufora przestrzennego (300 m)...');
const msbBuffer = turf.buffer(msbGeoJSON, BUFFER_RADIUS_KM, { units: 'kilometers' });

console.log('3. Wczytywanie surowych danych OSM...');
const rawOsmData = JSON.parse(fs.readFileSync(RAW_OSM_PATH, 'utf8'));

console.log(`4. Filtrowanie ścieżek (przed: ${rawOsmData.features.length})...`);
const filteredFeatures = rawOsmData.features.filter((feature) => {
  if (!feature.geometry) return false;
  try {
    // Sprawdzamy czy ścieżka przecina pas 300m wokół MSB
    return turf.booleanIntersects(feature, msbBuffer);
  } catch (e) {
    return false;
  }
});

const outputGeoJSON = {
  type: 'FeatureCollection',
  features: filteredFeatures
};

console.log(`5. Zapisywanie wyczyszczonej siatki (po: ${filteredFeatures.length} elementów)...`);
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(outputGeoJSON));

console.log(`SUKCES! Zapisano gotowy plik: ${OUTPUT_PATH}`);