import xml.etree.ElementTree as ET
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
GPX_PATH = PROJECT_ROOT / 'public' / 'data' / 'msb.gpx'
OUTPUT_PATH = PROJECT_ROOT / 'public' / 'data' / 'msb_nodes.json'

MSB_NAMES = [
    "Bielsko-Biała Straconka", "Gaiki", "Hrobacza Łąka", "Bujakowski Groń",
    "Porąbka", "Żar", "Kiczora", "Przysłop Cisowy", "Przełęcz Kocierska",
    "Potrójna", "Łamana Skała", "Leskowiec", "Groń Jana Pawła II",
    "Krzeszów Górny", "Żurawnica", "Zembrzyce", "Chełm", "Chełm Wschodni",
    "Palcza", "Babica Zachodnia", "Babica", "Sularzówka", "Myślenice",
    "Myślenice Zarabie", "Uklejna", "Śliwnik", "Działek", "Kudłacze",
    "Łysina", "Lubomir", "Jaworzyce", "Wierzbanowska Góra", "Kasina Wielka",
    "Lubogoszcz", "Zapadliska", "Mszana Dolna", "Przełęcz Glisne", "Luboń Wielki"
]

def generate_nodes():
    if not GPX_PATH.exists():
        print(f"BŁĄD: Brak pliku GPX w {GPX_PATH}")
        return

    tree = ET.parse(GPX_PATH)
    root = tree.getroot()
    ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
    
    trkpts = root.findall('.//gpx:trkpt', ns)
    if not trkpts:
        trkpts = root.findall('.//trkpt')
        
    if not trkpts:
        print("BŁĄD: Brak punktów śladu w pliku GPX.")
        return

    step = max(1, len(trkpts) // len(MSB_NAMES))
    
    nodes = []
    for idx, name in enumerate(MSB_NAMES):
        pt_idx = min(idx * step, len(trkpts) - 1)
        pt = trkpts[pt_idx]
        lat = float(pt.get('lat'))
        lon = float(pt.get('lon'))
        
        nodes.append({
            "id": f"node_{idx+1:03d}",
            "name": name,
            "lat": lat,
            "lon": lon
        })

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(nodes, f, ensure_ascii=False, indent=2)
        
    print(f"Sukces! Wygenerowano {len(nodes)} węzłów do pliku: {OUTPUT_PATH.name}")

if __name__ == '__main__':
    generate_nodes()