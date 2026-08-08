import L from 'leaflet';
import { layers } from './MapConfig.js';

export class GotController {
  static async loadRegion(regionName) {
    try {
      const response = await fetch(`./data/got/got_${regionName}.json`);
      if (!response.ok) throw new Error(`Brak pliku got_${regionName}.json`);
      
      const segments = await response.json();
      
      segments.forEach(segment => {
        const polyline = L.polyline([segment.start_coords, segment.end_coords], {
          color: '#e63946',
          weight: 3,
          opacity: 0.8,
          dashArray: '6, 6'
        });
        
        polyline.bindPopup(`
          <div style="font-family: sans-serif; font-size: 13px;">
            <strong style="color: #2b2d42;">Odcinek GOT PTTK</strong><br/>
            <b>Start:</b> ${segment.start_name}<br/>
            <b>Koniec:</b> ${segment.end_name}
            <hr style="margin: 6px 0; border: 0; border-top: 1px solid #ccc;"/>
            <b>Punkty GOT:</b> tam ${segment.points_forward} / powrót ${segment.points_backward}
          </div>
        `);
        
        polyline.on('mouseover', function () {
          this.setStyle({ weight: 6, color: '#d90429', opacity: 1 });
        });
        polyline.on('mouseout', function () {
          this.setStyle({ weight: 3, color: '#e63946', opacity: 0.8 });
        });
        
        layers.gotLayerGroup.addLayer(polyline);
      });
      
      console.log(`✓ Załadowano GOT: ${regionName} (${segments.length} odcinków)`);
    } catch (error) {
      console.error(`✗ Błąd ładowania GOT ${regionName}:`, error);
    }
  }
}