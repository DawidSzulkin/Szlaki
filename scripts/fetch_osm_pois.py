import json
from pathlib import Path
import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_POIS = PROJECT_ROOT / 'public' / 'data' / 'pois_poland.json'

OVERPASS_SERVERS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter',
]

OVERPASS_QUERY = """
[out:json][timeout:180];
// Wyszukiwanie ograniczone do południowej Polski (BBOX: min_lat, min_lon, max_lat, max_lon)
(
  node["information"="guidepost"](49.0, 14.8, 51.5, 23.0);
  node["tourism"="alpine_hut"](49.0, 14.8, 51.5, 23.0);
  node["natural"="peak"](49.0, 14.8, 51.5, 23.0);
  node["natural"="saddle"](49.0, 14.8, 51.5, 23.0);
  node["place"="village"](49.0, 14.8, 51.5, 23.0);
  node["place"="town"](49.0, 14.8, 51.5, 23.0);
);
out body;
"""


def fetch_all_poland_pois():
    print('[1/2] Pobieranie węzłów górskich dla całej Polski z OpenStreetMap...')

    headers = {
        'User-Agent': (
            'SzlakiApp/1.0 (https://github.com/szulkin/szlaki-app;'
            ' contact@szlaki.app)'
        ),
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    }

    data = None
    for server in OVERPASS_SERVERS:
        print(f'   Próba połączenia z: {server} ...')
        try:
            response = requests.post(
                server,
                data={'data': OVERPASS_QUERY},
                headers=headers,
                timeout=180,
            )
            response.raise_for_status()
            data = response.json()
            print('   ✓ Połączenie udane!')
            break
        except Exception as e:
            print(f'   ✗ Błąd dla {server}: {e}')

    if not data:
        print('BŁĄD: Żaden z serwerów Overpass nie odpowiedział poprawnie.')
        return

    pois = []
    elements = data.get('elements', [])

    for elem in elements:
        tags = elem.get('tags', {})
        name = tags.get('name')
        if name:
            pois.append({
                'id': f"osm_{elem['id']}",
                'name': name,
                'lat': elem['lat'],
                'lon': elem['lon'],
                'type': tags.get('tourism')
                or tags.get('information')
                or tags.get('natural'),
            })

    print(f'[2/2] Pobrano {len(pois)} zweryfikowanych punktów GPS.')

    OUTPUT_POIS.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_POIS, 'w', encoding='utf-8') as f:
        json.dump(pois, f, ensure_ascii=False, indent=2)

    print(f'Baza punktów Polski zapisana w: {OUTPUT_POIS}')


if __name__ == '__main__':
    fetch_all_poland_pois()