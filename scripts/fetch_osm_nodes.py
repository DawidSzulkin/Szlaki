import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
GPX_NODES_PATH = PROJECT_ROOT / 'public' / 'data' / 'msb_nodes.json'
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

def map_names_to_gpx():
    if not GPX_NODES_PATH.exists():
        print("BŁĄD: Brak pliku msb_nodes.json. Uruchom najpierw ekstraktor GPX.")
        return

    with open(GPX_NODES_PATH, 'r', encoding='utf-8') as f:
        gpx_nodes = json.load(f)

    named_nodes = []
    for idx, name in enumerate(MSB_NAMES):
        if idx < len(gpx_nodes):
            named_nodes.append({
                "id": f"node_{idx+1:03d}",
                "name": name,
                "lat": gpx_nodes[idx]["lat"],
                "lon": gpx_nodes[idx]["lon"]
            })

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(named_nodes, f, ensure_ascii=False, indent=2)

    print(f"Sukces! Przypisano oficjalne nazwy do {len(named_nodes)} węzłów opartych na fizycznym śladzie GPX.")

if __name__ == '__main__':
    map_names_to_gpx()