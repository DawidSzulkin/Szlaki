import { gpx } from '@tmcw/togeojson';

export class DataLoader {
  static baseUrl = import.meta.env.BASE_URL;

  static async loadGpxTrack() {
    const response = await fetch(`${this.baseUrl}data/msb.gpx`);
    if (!response.ok) {
      throw new Error(`Błąd ładowania GPX (${response.status}): ${this.baseUrl}data/msb.gpx`);
    }

    const text = await response.text();
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    return gpx(dom);
  }

  static async loadRabkaGreenTrack() {
    const response = await fetch(`${this.baseUrl}data/rabka_zielony.gpx`);
    if (!response.ok) {
      throw new Error(`Błąd ładowania GPX Zielonego (${response.status}): ${this.baseUrl}data/rabka_zielony.gpx`);
    }

    const text = await response.text();
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    return gpx(dom);
  }

  static async loadRabkaBlueTrack() {
    const response = await fetch(`${this.baseUrl}data/rabka_niebieski.gpx`);
    if (!response.ok) {
      throw new Error(`Błąd ładowania GPX Niebieskiego (${response.status}): ${this.baseUrl}data/rabka_niebieski.gpx`);
    }

    const text = await response.text();
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    return gpx(dom);
  }

  static async loadPois() {
    const response = await fetch(`${this.baseUrl}data/pois.json`);
    if (!response.ok) {
      throw new Error(`Błąd ładowania POI (${response.status})`);
    }
    return await response.json();
  }

  static async loadOsmPois() {
    try {
      const response = await fetch(`${this.baseUrl}data/pois_osm.geojson`);
      if (!response.ok) {
        console.error(`[OSM POI Error] Plik nie istnieje na serwerze (${response.status})`);
        return { features: [] };
      }
      return await response.json();
    } catch (err) {
      console.error('[OSM POI Error] Błąd parsowania GeoJSON:', err);
      return { features: [] };
    }
  }

  static async loadConnectorNetwork() {
    try {
      const response = await fetch(`${this.baseUrl}data/connector_network.geojson`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  // === NOWE METODY: Kontrolowana baza węzłów i segmentów (MSB / GOT) ===

  static async loadMsbNodes() {
    try {
      const response = await fetch(`${this.baseUrl}data/msb_nodes.json`);
      if (!response.ok) throw new Error(`Błąd ładowania węzłów MSB (${response.status})`);
      return await response.json();
    } catch (err) {
      console.error('[DataLoader] Nie udało się załadować msb_nodes.json:', err);
      return [];
    }
  }

  static async loadMsbSegments() {
    try {
      const response = await fetch(`${this.baseUrl}data/msb_segments.json`);
      if (!response.ok) throw new Error(`Błąd ładowania odcinków MSB (${response.status})`);
      return await response.json();
    } catch (err) {
      console.error('[DataLoader] Nie udało się załadować msb_segments.json:', err);
      return [];
    }
  }
}