import json
import re
from pathlib import Path
from thefuzz import process, fuzz

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_GOT_PATH = PROJECT_ROOT / 'scripts' / 'got_database_raw.json'
OSM_POIS_PATH = PROJECT_ROOT / 'public' / 'data' / 'pois_poland.json'
OUTPUT_DIR = PROJECT_ROOT / 'public' / 'data' / 'got'

# Dokładne odwzorowanie polskich kategorii
POLAND_CATEGORIES = {
    'T':  'TATRY_I_PODTATRZE',
    'BZ': 'BESKIDY_ZACHODNIE',
    'BW': 'BESKIDY_WSCHODNIE',
    'S':  'SUDETY',
    'Ś':  'GORY_SWIETOKRZYSKIE',
    'W':  'WYZYNY',
    'J':  'WYZYNY'
}

# Koordynaty (min_lat, max_lat, min_lon, max_lon)
POLAND_BOUNDS = {
    'T':  (49.15, 49.35, 19.70, 20.20),
    'BZ': (49.30, 50.10, 18.70, 20.80),
    'BW': (49.00, 49.90, 20.50, 23.00),
    'S':  (49.90, 51.30, 15.00, 17.80),
    'Ś':  (50.60, 51.20, 20.20, 21.60),
    # Brak definicji oznacza szukanie w całej Polsce
}


def normalize_name(name):
    if not name:
        return ''
    name = re.sub(r'\s*\([^)]*\)', '', name)
    # Agresywniejsze wycinanie przedrostków psujących odmianę
    prefixes = [r'^ze?\s+', r'^do\s+', r'^przez\s+', r'^w\s+', r'^na\s+', r'^z\s+']
    for p in prefixes:
        name = re.sub(p, '', name, flags=re.IGNORECASE)

    stop_words = [
        'schronisko', 'pttk', 'przełęcz', 'przeł', 'szczyt', 'góra', 'schr',
        'stacja', 'pkp', 'pks', 'węzeł', 'szlaków', 'hotel', 'górski',
        'baza', 'namiotowa', 'bacówka', 'dolina'
    ]
    pattern = r'\b(' + '|'.join(stop_words) + r')\b'
    cleaned = re.sub(pattern, ' ', name, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', cleaned).strip()


def match_poland_got():
    if not RAW_GOT_PATH.exists() or not OSM_POIS_PATH.exists():
        print('BŁĄD: Brak wymaganych plików .json w scripts/ lub public/data/!')
        return

    with open(RAW_GOT_PATH, 'r', encoding='utf-8') as f:
        got_data = json.load(f)

    with open(OSM_POIS_PATH, 'r', encoding='utf-8') as f:
        osm_pois = json.load(f)

    grouped_segments = {}
    
    # Obniżony próg uwzględniający polską gramatykę (np. Gąsienicowa vs Gąsienicowej)
    MATCH_THRESHOLD = 60  
    
    text_failed_count = 0

    print(f'[1/2] Przetwarzanie {len(got_data)} odcinków z tabel PTTK...')

    for seg in got_data:
        raw_code = seg.get('region_code', 'UNKNOWN')

        prefix_match = re.match(r'^([A-ZŚŻŹĆĄĘŁÓŃ]+)', raw_code)
        if prefix_match:
            prefix = prefix_match.group(1)
        else:
            prefix = 'UNKNOWN'

        category_name = POLAND_CATEGORIES.get(prefix, 'INNE')
        bounds = POLAND_BOUNDS.get(prefix)

        # Jeśli znamy bounds, tniemy listę OSM. Jeśli nie, szukamy w całej Polsce.
        if bounds:
            candidate_pois = [
                p for p in osm_pois
                if bounds[0] <= p['lat'] <= bounds[1]
                and bounds[2] <= p['lon'] <= bounds[3]
            ]
        else:
            candidate_pois = osm_pois

        if not candidate_pois:
            continue

        poi_clean_map = {
            normalize_name(p['name']): p
            for p in candidate_pois
            if normalize_name(p['name'])
        }
        poi_clean_names = list(poi_clean_map.keys())

        if not poi_clean_names:
            continue

        norm_start = normalize_name(seg['start_name'])
        norm_end = normalize_name(seg['end_name'])

        if not norm_start or not norm_end:
            continue

        best_start, start_score = process.extractOne(norm_start, poi_clean_names, scorer=fuzz.token_set_ratio)
        best_end, end_score = process.extractOne(norm_end, poi_clean_names, scorer=fuzz.token_set_ratio)

        if start_score >= MATCH_THRESHOLD and end_score >= MATCH_THRESHOLD:
            start_poi = poi_clean_map[best_start]
            end_poi = poi_clean_map[best_end]

            if start_poi['id'] != end_poi['id']:
                matched_item = {
                    'start_poi_id': start_poi['id'],
                    'start_name': start_poi['name'],
                    'start_coords': [start_poi['lat'], start_poi['lon']],
                    'end_poi_id': end_poi['id'],
                    'end_name': end_poi['name'],
                    'end_coords': [end_poi['lat'], end_poi['lon']],
                    'points_forward': seg['points_forward'],
                    'points_backward': seg['points_backward'],
                }

                if category_name not in grouped_segments:
                    grouped_segments[category_name] = []

                # Odrzucanie dubli
                if not any(
                    x['start_poi_id'] == start_poi['id']
                    and x['end_poi_id'] == end_poi['id']
                    for x in grouped_segments[category_name]
                ):
                    grouped_segments[category_name].append(matched_item)
        else:
            text_failed_count += 1

    print('[2/2] Zapisywanie wyników...')
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    total_matched = 0

    for category, segments in grouped_segments.items():
        out_file = OUTPUT_DIR / f'got_{category}.json'
        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(segments, f, ensure_ascii=False, indent=2)
        print(f'  ✓ {category}: zmapowano {len(segments)} odcinków -> {out_file.name}')
        total_matched += len(segments)

    print(f'\n[PODSUMOWANIE]')
    print(f'Poprawnie połączono z siecią OSM: {total_matched} odcinków.')
    print(f'Odrzucono ze względu na zbyt duże różnice w nazewnictwie: {text_failed_count} odcinków.')

if __name__ == '__main__':
    match_poland_got()