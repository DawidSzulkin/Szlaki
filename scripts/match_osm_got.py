import json
import re
import math
from pathlib import Path
from thefuzz import process, fuzz

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_GOT_PATH = PROJECT_ROOT / 'scripts' / 'got_database_raw.json'
OSM_POIS_PATH = PROJECT_ROOT / 'public' / 'data' / 'pois_poland.json'
OUTPUT_DIR = PROJECT_ROOT / 'public' / 'data' / 'got'
FAILED_LOG_PATH = PROJECT_ROOT / 'scripts' / 'failed_matches.json'

POLAND_CATEGORIES = {
    'T':  'TATRY_I_PODTATRZE',
    'BZ': 'BESKIDY_ZACHODNIE',
    'BW': 'BESKIDY_WSCHODNIE',
    'S':  'SUDETY',
    'Ś':  'GORY_SWIETOKRZYSKIE',
}

POLAND_BOUNDS = {
    'T':  (49.10, 49.50, 19.50, 20.30),
    'BZ': (49.30, 50.20, 18.50, 20.80),
    'BW': (49.00, 50.00, 20.40, 23.00),
    'S':  (49.80, 51.30, 14.80, 17.90),
    'Ś':  (50.50, 51.30, 20.00, 21.80),
}

def get_distance_km(lat1, lon1, lat2, lon2):
    """Oblicza odległość w linii prostej na kuli ziemskiej (wzór Haversine'a)."""
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def stem_polish_word(word):
    if len(word) <= 4:
        return word
    suffixes = ['ego', 'ych', 'ich', 'ej', 'em', 'am', 'ach', 'ami', 'om', 'owi', 'iu', 'ie', 'owi', 'em', 'a', 'u', 'o', 'y', 'i']
    for suf in suffixes:
        if word.endswith(suf) and len(word) - len(suf) >= 3:
            return word[:-len(suf)]
    return word

def normalize_name(name):
    if not name: return ''
    name = re.sub(r'\s*\([^)]*\)', '', name)
    prefixes = [r'^ze?\s+', r'^do\s+', r'^przez\s+', r'^w\s+', r'^na\s+', r'^z\s+']
    for p in prefixes:
        name = re.sub(p, '', name, flags=re.IGNORECASE)

    stop_words = [
        'schronisko', 'pttk', 'przełęcz', 'przeł', 'szczyt', 'góra', 'schr',
        'stacja', 'pkp', 'pks', 'węzeł', 'szlaków', 'hotel', 'górski',
        'baza', 'namiotowa', 'bacówka', 'dolina', 'polana'
    ]
    pattern = r'\b(' + '|'.join(stop_words) + r')\b'
    cleaned = re.sub(pattern, ' ', name, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip().lower()

    tokens = cleaned.split()
    stemmed_tokens = [stem_polish_word(t) for t in tokens]
    return ' '.join(stemmed_tokens)

def match_poland_got():
    if not RAW_GOT_PATH.exists() or not OSM_POIS_PATH.exists():
        print('BŁĄD: Brak plików .json!')
        return

    with open(RAW_GOT_PATH, 'r', encoding='utf-8') as f:
        got_data = json.load(f)

    with open(OSM_POIS_PATH, 'r', encoding='utf-8') as f:
        osm_pois = json.load(f)

    grouped_segments = {}
    failed_segments = []
    
    MATCH_THRESHOLD = 60

    print(f'[1/2] Przetwarzanie {len(got_data)} odcinków z filtrem topologicznym...')

    for seg in got_data:
        code = seg.get('region_code', 'UNKNOWN')
        if code not in POLAND_CATEGORIES:
            continue

        category_name = POLAND_CATEGORIES[code]
        bounds = POLAND_BOUNDS[code]

        candidate_pois = [
            p for p in osm_pois
            if bounds[0] <= p['lat'] <= bounds[1] and bounds[2] <= p['lon'] <= bounds[3]
        ]

        if not candidate_pois:
            continue

        poi_clean_map = {}
        for p in candidate_pois:
            norm = normalize_name(p['name'])
            if norm:
                poi_clean_map[norm] = p
                
        poi_clean_names = list(poi_clean_map.keys())

        if not poi_clean_names:
            continue

        norm_start = normalize_name(seg['start_name'])
        norm_end = normalize_name(seg['end_name'])

        if not norm_start or not norm_end:
            continue

        best_start, start_score = process.extractOne(norm_start, poi_clean_names, scorer=fuzz.token_sort_ratio)
        best_end, end_score = process.extractOne(norm_end, poi_clean_names, scorer=fuzz.token_sort_ratio)

        if start_score >= MATCH_THRESHOLD and end_score >= MATCH_THRESHOLD:
            start_poi = poi_clean_map[best_start]
            end_poi = poi_clean_map[best_end]

            if start_poi['id'] != end_poi['id']:
                dist = get_distance_km(start_poi['lat'], start_poi['lon'], end_poi['lat'], end_poi['lon'])
                if dist > 30.0:
                    failed_segments.append({
                        'region': category_name,
                        'error': f'Odrzucono przez dystans: {dist:.1f} km',
                        'raw_start': seg['start_name'],
                        'raw_end': seg['end_name']
                    })
                    continue

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

                if not any(
                    x['start_poi_id'] == start_poi['id'] and x['end_poi_id'] == end_poi['id']
                    for x in grouped_segments[category_name]
                ):
                    grouped_segments[category_name].append(matched_item)
        else:
            failed_segments.append({
                'region': category_name,
                'error': 'Niski wynik dopasowania tekstowego',
                'raw_start': seg['start_name'],
                'start_score': start_score,
                'raw_end': seg['end_name'],
                'end_score': end_score
            })

    print('[2/2] Zapisywanie wyników...')
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    total_matched = 0

    for category, segments in grouped_segments.items():
        out_file = OUTPUT_DIR / f'got_{category}.json'
        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(segments, f, ensure_ascii=False, indent=2)
        print(f'  ✓ {category}: zmapowano {len(segments)} odcinków -> {out_file.name}')
        total_matched += len(segments)

    with open(FAILED_LOG_PATH, 'w', encoding='utf-8') as f:
        json.dump(failed_segments, f, ensure_ascii=False, indent=2)

    print(f'\n[PODSUMOWANIE]')
    print(f'Pomyślnie zmapowano: {total_matched} odcinków.')
    print(f'Odrzucono: {len(failed_segments)} odcinków.')

if __name__ == '__main__':
    match_poland_got()