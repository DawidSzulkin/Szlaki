import { gpx } from '@tmcw/togeojson';

export class DataLoader {
  static async loadGpxTrack() {
    const baseUrl = import.meta.env.BASE_URL;
    const response = await fetch(`${baseUrl}data/msb.gpx`);
    const gpxText = await response.text();
    const xmlDoc = new DOMParser().parseFromString(gpxText, 'text/xml');
    return gpx(xmlDoc);
  }

  static async loadPois() {
    const baseUrl = import.meta.env.BASE_URL;
    const response = await fetch(`${baseUrl}data/pois.json`);
    return await response.json();
  }

  static async loadOsmPois() {
    const baseUrl = import.meta.env.BASE_URL;
    try {
      const response = await fetch(`${baseUrl}data/pois_osm.geojson`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  static async loadConnectorNetwork() {
    const baseUrl = import.meta.env.BASE_URL;
    try {
      const response = await fetch(`${baseUrl}data/connector_network.geojson`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
}