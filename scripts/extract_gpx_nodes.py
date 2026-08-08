import xml.etree.ElementTree as ET
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
GPX_PATH = PROJECT_ROOT / 'public' / 'data' / 'msb.gpx'
OUTPUT_PATH = PROJECT_ROOT / 'public' / 'data' / 'msb_nodes.json'

def extract_nodes_from_gpx():
    if not GPX_PATH.exists():
        print(f'BŁĄD: Brak pliku GPX pod ścieżką: {GPX_PATH}')
        return

    tree = ET.parse(GPX_PATH)
    root = tree.getroot()
    
    # Obsługa przestrzeni nazw GPX w XML
    ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
    
    nodes = []
    
    # 1. Najpierw szukamy dedykowanych punktów węzłowych (<wpt>)
    waypoints = root.findall('gpx:wpt', ns)
    if not waypoints:
        waypoints = root.findall('wpt') # Fallback bez namespace
        
    if waypoints:
        print('[INFO] Wykryto waypointy (<wpt>) w pliku GPX.')
        for idx, wpt in enumerate(waypoints):
            lat = float(wpt.get('lat'))
            lon = float(wpt.get('lon'))
            name_el = wpt.find('gpx:name', ns)
            if name_el is None:
                name_el = wpt.find('name')
            name = name_el.text if name_el is not None else f"Węzeł {idx+1}"
            
            nodes.append({
                "id": f"node_{idx+1:03d}",
                "name": name.strip(),
                "lat": lat,
                "lon": lon
            })
    else:
        # 2. Jeśli brak waypointów, bierzemy punkty ze śladu (<trkpt>) i próbkujemy je
        print('[INFO] Brak waypointów. Próbkowanie punktów ze śladu głównego (<trkpt>).')
        trkpts = root.findall('.//gpx:trkpt', ns)
        if not trkpts:
            trkpts = root.findall('.//trkpt')
            
        # Co enty punkt, żeby nie zasyfić bazy tysiącami punktów co metr
        step = max(1, len(trkpts) // 40) # Dzieli trasę na ~40 kluczowych punktów
        
        for idx, pt in enumerate(trkpts[::step]):
            lat = float(pt.get('lat'))
            lon = float(pt.get('lon'))
            nodes.append({
                "id": f"node_{len(nodes)+1:03d}",
                "name": f"Punkt kontrolny {len(nodes)+1}",
                "lat": lat,
                "lon": lon
            })

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(nodes, f, ensure_ascii=False, indent=2)
        
    print(f'Sukces! Wygenerowano automatycznie {len(nodes)} węzłów do pliku: {OUTPUT_PATH.name}')

if __name__ == '__main__':
    extract_nodes_from_gpx()