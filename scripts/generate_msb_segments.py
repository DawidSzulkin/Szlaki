import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
NODES_PATH = PROJECT_ROOT / 'public' / 'data' / 'msb_nodes.json'
OUTPUT_PATH = PROJECT_ROOT / 'public' / 'data' / 'msb_segments.json'

# Oficjalne punkty GOT (tam, z powrotem) dla kolejnych 37 odcinków MSB
SEGMENT_POINTS = [
    (7, 5), (4, 4), (2, 3), (4, 7), (7, 3), (3, 2), (4, 3), (6, 7),
    (6, 4), (4, 3), (7, 7), (1, 1), (7, 10), (4, 3), (7, 11), (10, 7),
    (3, 3), (4, 6), (5, 4), (2, 2), (7, 8), (7, 9), (2, 2), (9, 5),
    (1, 1), (4, 2), (4, 2), (2, 2), (3, 6), (6, 3), (5, 7), (10, 5),
    (3, 6), (4, 7), (8, 6), (6, 2), (6, 2)
]

def generate_segments():
    if not NODES_PATH.exists():
        print("BŁĄD: Brak pliku msb_nodes.json.")
        return

    with open(NODES_PATH, 'r', encoding='utf-8') as f:
        nodes = json.load(f)

    segments = []
    for i in range(len(nodes) - 1):
        from_node = nodes[i]
        to_node = nodes[i+1]
        pts_fwd, pts_bwd = SEGMENT_POINTS[i] if i < len(SEGMENT_POINTS) else (3, 3)

        segments.append({
            "id": f"seg_{i+1:03d}",
            "from_node": from_node["id"],
            "to_node": to_node["id"],
            "name": f"{from_node['name']} – {to_node['name']}",
            "points_forward": pts_fwd,
            "points_backward": pts_bwd
        })

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(segments, f, ensure_ascii=False, indent=2)

    print(f"Sukces! Wygenerowano {len(segments)} segmentów do pliku: {OUTPUT_PATH.name}")

if __name__ == '__main__':
    generate_segments()