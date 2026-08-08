import json
import time
import requests
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
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

def fetch_nodes_safely():
    print("[INFO] Pobieranie dokładnych współrzędnych z Overpass API...")
    bbox = "49.5,18.9,50.0,20.2"
    overpass_url = "http://overpass-api.de/api/interpreter"
    nodes = []

    for idx, name in enumerate(MSB_NAMES):
        query = f"""
        [out:json][timeout:15];
        (
          node["name"~"^{name}$", i]({bbox});
          way["name"~"^{name}$", i]({bbox});
        );
        out body;
        >;
        out skel qt;
        """
        
        try:
            response = requests.post(overpass_url, data={'data': query}, timeout=15)
            
            if response.status_code != 200:
                print(f"  ✗ Błąd HTTP {response.status_code} dla: {name}")
                time.sleep(3)
                continue
            
            if 'application/json' not in response.headers.get('content-type', ''):
                print(f"  ✗ Ostrzeżenie: Przekroczono limit zapytań (Rate Limit) dla: {name}. Czekam...")
                time.sleep(10)
                continue

            data = response.json()
            elements = data.get('elements', [])
            
            lat, lon = None, None
            for el in elements:
                if el.get('type') == 'node':
                    lat, lon = el.get('lat'), el.get('lon')
                    break
                elif el.get('type') == 'way' and 'center' in el:
                    lat, lon = el.get('center', {}).get('lat'), el.get('center', {}).get('lon')
                    break
            
            if lat and lon:
                nodes.append({
                    "id": f"node_{idx+1:03d}",
                    "name": name,
                    "lat": lat,
                    "lon": lon
                })
                print(f"  ✓ [{idx+1}/38] {name} -> ({lat}, {lon})")
            else:
                print(f"  ✗ Brak punktu w OSM dla: {name}")
            
            # Wymagana przerwa, aby Overpass nie zablokował skryptu
            time.sleep(1.5)
            
        except Exception as e:
            print(f"  ! Błąd techniczny dla {name}: {e}")
            time.sleep(3)

    if nodes:
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(nodes, f, ensure_ascii=False, indent=2)
        print(f"\nSukces! Zapisano {len(nodes)} realnych węzłów do {OUTPUT_PATH.name}")
    else:
        print("\nBŁĄD: Nie udało się pobrać żadnych węzłów.")

if __name__ == '__main__':
    fetch_nodes_safely()