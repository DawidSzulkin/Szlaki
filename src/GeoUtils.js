import * as turf from '@turf/turf';
import L from 'leaflet';

export function calculateHikingTime(distanceKm, ascentMeters) {
  const totalHours = (distanceKm / 4.0) + (ascentMeters / 400.0);
  const hours = Math.floor(totalHours);
  const minutes = Math.round((totalHours - hours) * 60);
  return `${hours}h ${minutes === 60 ? 0 : minutes}m`;
}

export function calculateElevationStats(geojsonLine) {
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

export function drawRoutedPath(startCoords, endCoords, layerGroup, style, pathFinder) {
  // Funkcja została wyłączona na życzenie użytkownika, aby usunąć zbędne linie przerywane łączące punkty ze szlakiem.
  return;
}