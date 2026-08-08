import json
import xml.etree.ElementTree as ET
from pathlib import Path
import osmium
from pyproj import Transformer
from shapely.geometry import LineString, Point
from shapely.ops import transform

PROJECT_ROOT = Path(__file__).resolve().parent.parent
GPX_PATH = PROJECT_ROOT / 'public' / 'data' / 'msb.gpx'

PBF_FILES = [
    PROJECT_ROOT / 'slaskie-260806.osm.pbf',
    PROJECT_ROOT / 'malopolskie-260806.osm.pbf'
]

OUTPUT_PATH = PROJECT_ROOT / 'public' / 'data' / 'msb_pois.json'

# ROZSZERZONE TAGI: Dodano firepit, picnic_table, guest_house, hostel, chalet
TARGET_TAGS = {
    'natural': ['peak', 'saddle', 'spring'],
    'tourism': ['alpine_hut', 'wilderness_hut', 'camp_site', 'picnic_site', 'viewpoint', 'guest_house', 'hostel', 'hotel', 'chalet'],
    'amenity': ['shelter', 'bench', 'drinking_water', 'restaurant', 'cafe', 'toilets'],
    'highway': ['bus_stop'],
    'historic': ['ruins', 'monument'],
    'leisure': ['firepit', 'picnic_table'],
    'shop': ['supermarket', 'convenience', 'bakery', 'general', 'grocery']
}

def get_gpx_line():
    if not GPX_PATH.exists():
        raise FileNotFoundError(f"Brak pliku GPX: {GPX_PATH}")
        
    tree = ET.parse(GPX_PATH)
    root = tree.getroot()
    ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
    
    trkpts = root.findall('.//gpx:trkpt', ns) or root.findall('.//trkpt')
    if not trkpts:
        raise ValueError("Plik GPX nie zawiera tagów trasy (trkpt)!")
        
    coords = [(float(pt.get('lon')), float(pt.get('lat'))) for pt in trkpts]
    return LineString(coords)

def create_buffer_polygon(line, distance_meters=300):
    project_to_meters = Transformer.from_crs("EPSG:4326", "EPSG:2180", always_xy=True).transform
    project_to_degrees = Transformer.from_crs("EPSG:2180", "EPSG:4326", always_xy=True).transform
    
    line_meters = transform(project_to_meters, line)
    buffer_meters = line_meters.buffer(distance_meters)
    return transform(project_to_degrees, buffer_meters)

class POIFilter(osmium.SimpleHandler):
    def __init__(self, buffer_poly):
        super(POIFilter, self).__init__()
        self.buffer_poly = buffer_poly
        self.pois = []
        self.processed_ids = set()
        self.min_lon, self.min_lat, self.max_lon, self.max_lat = buffer_poly.bounds

    def node(self, n):
        if not (self.min_lon <= n.location.lon <= self.max_lon and self.min_lat <= n.location.lat <= self.max_lat):
            return

        if not n.tags or n.id in self.processed_ids:
            return
            
        matched_category = None
        matched_type = None
        
        # Wykrywanie Pomników Przyrody
        is_natural_monument = n.tags.get('denotation') == 'natural_monument' or n.tags.get('natural_monument') == 'yes'
        
        if is_natural_monument:
            matched_category = 'historic'
            matched_type = 'nature_monument'
        else:
            for key, values in TARGET_TAGS.items():
                if key in n.tags and (n.tags[key] in values or n.tags[key] == 'yes'):
                    matched_category = key
                    matched_type = n.tags[key]
                    break
                
        if not matched_category:
            return

        pt = Point(n.location.lon, n.location.lat)
        if self.buffer_poly.contains(pt):
            self.pois.append({
                "id": f"osm_{n.id}",
                "category": matched_category,
                "type": matched_type,
                "name": n.tags.get('name', ''),
                "ele": n.tags.get('ele', ''),
                "lat": n.location.lat,
                "lon": n.location.lon
            })
            self.processed_ids.add(n.id)

def process():
    missing_files = [f.name for f in PBF_FILES if not f.exists()]
    if missing_files:
        print(f"BŁĄD: Brak plików w głównym folderze: {', '.join(missing_files)}")
        return

    print("Krok 1: Wczytywanie śladu z pliku GPX...")
    route_line = get_gpx_line()
    
    print("Krok 2: Generowanie strefy 300 metrów wokół szlaku...")
    route_buffer = create_buffer_polygon(route_line, distance_meters=300)
    
    handler = POIFilter(route_buffer)
    
    for pbf_file in PBF_FILES:
        print(f"Krok 3: Analiza pliku {pbf_file.name}...")
        handler.apply_file(str(pbf_file))
    
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(handler.pois, f, ensure_ascii=False, indent=2)
        
    print(f"GOTOWE. Znaleziono {len(handler.pois)} punktów w promieniu 300m od trasy.")
    print(f"Zapisano w: {OUTPUT_PATH}")

if __name__ == '__main__':
    process()