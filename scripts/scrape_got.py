import json
import re
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_RAW_PATH = PROJECT_ROOT / 'scripts' / 'got_database_raw.json'

PAGE_CATEGORY_MAP = {
    'tatry_wysokie.html': 'T', 'podtatrze.html': 'T', 'tatry_sl_zach.html': 'T',
    'b_slaski-a.html': 'BZ', 'zywiecki.html': 'BZ', 'b_maly.html': 'BZ',
    'b_sredni.html': 'BZ', 'gorce.html': 'BZ', 'b_wyspowy.html': 'BZ', 'orawa.html': 'BZ',
    'pieniny_spisz.html': 'BW', 'b_sadecki.html': 'BW', 'p_wielickie.html': 'BW',
    'p_wisnickie.html': 'BW', 'p_roznowskie.html': 'BW', 'p_ciezkowickie.html': 'BW',
    'niski-zachod.html': 'BW', 'niski-wschod.html': 'BW', 'bieszczady.html': 'BW',
    'p_strzyzowsko-dynowskie.html': 'BW', 'p_przemyskie.html': 'BW',
    'swietokrzyskie-l02.html': 'Ś', 'swietokrzyskie-l03.html': 'Ś',
    'swietokrzyskie-l04.html': 'Ś', 'swietokrzyskie-l05.html': 'Ś',
}

def clean_str(s):
    if not s: return ''
    s = s.replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', s).strip()

def fetch_and_clean_soup(url):
    headers = {'User-Agent': 'Mozilla/5.0'}
    res = requests.get(url, headers=headers, timeout=15)
    if res.encoding is None or res.encoding.lower() in ['iso-8859-1', 'us-ascii']:
        res.encoding = 'iso-8859-2'
    html = res.text.replace('<br>', '\n').replace('<BR>', '\n')
    return BeautifulSoup(html, 'html.parser')

def parse_page_segments(soup, category_code):
    segments = []

    for table in soup.find_all('table'):
        current_start_name = "" 
        
        for row in table.find_all('tr'):
            cols = row.find_all(['td', 'th'])
            if not cols: continue

            col_lines = []
            for td in cols:
                lines = [clean_str(line) for line in td.get_text().split('\n') if clean_str(line)]
                col_lines.append(lines)

            if len(col_lines) > 0 and len(col_lines[0]) > 0:
                candidate = col_lines[0][0]
                if not re.search(r'\d/\d', candidate) and len(candidate) > 2:
                    current_start_name = candidate

            for c_idx, lines in enumerate(col_lines):
                for l_idx, line in enumerate(lines):
                    pts_match = re.search(r'^(\d{1,2})\s*/\s*(\d{1,2})$', line)
                    if pts_match:
                        pts_fwd = int(pts_match.group(1))
                        pts_bwd = int(pts_match.group(2))

                        end_name = ""
                        if l_idx > 0:
                            end_name = lines[l_idx - 1]
                        elif c_idx > 0 and len(col_lines[c_idx - 1]) > 0:
                            end_name = col_lines[c_idx - 1][-1]

                        if end_name and current_start_name:
                            if not re.search(r'\d/\d', end_name) and not re.search(r'\d/\d', current_start_name):
                                if current_start_name != end_name:
                                    segments.append({
                                        'region_code': category_code,
                                        'start_name': current_start_name,
                                        'end_name': end_name,
                                        'points_forward': pts_fwd,
                                        'points_backward': pts_bwd,
                                    })
    return segments

def run_full_scraper():
    base_url = 'https://pttkhts.hg.pl/ktg/komisja-tg/got/got.html'
    print(f'[1/3] Pobieranie indeksu stron GOT: {base_url}')
    try:
        main_soup = fetch_and_clean_soup(base_url)
    except Exception as e:
        print(f'BŁĄD: {e}')
        return

    sub_links = []
    for a in main_soup.find_all('a', href=True):
        href = a['href']
        if href.endswith(('.html', '.htm')) and href != 'got.html':
            filename = href.split('/')[-1]
            cat = PAGE_CATEGORY_MAP.get(filename, 'S' if '-s' in filename or 's0' in filename or 's1' in filename or 's2' in filename else 'UNKNOWN')
            if cat != 'UNKNOWN':
                full_url = urljoin(base_url, href)
                sub_links.append((full_url, cat))

    print(f'[2/3] Skanowanie {len(sub_links)} zaklasyfikowanych podstron PTTK...')
    all_segments = []
    for link, cat in sub_links:
        try:
            soup = fetch_and_clean_soup(link)
            parsed = parse_page_segments(soup, cat)
            if parsed:
                all_segments.extend(parsed)
        except Exception as e:
            print(f'   ✗ Błąd przy {link}: {e}')

    unique_segments = []
    seen = set()
    for s in all_segments:
        key = (s['region_code'], s['start_name'].lower(), s['end_name'].lower())
        if key not in seen:
            seen.add(key)
            unique_segments.append(s)

    print(f'\n[3/3] Zapisano {len(unique_segments)} czystych odcinków do weryfikacji przez OSM.')
    OUTPUT_RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_RAW_PATH, 'w', encoding='utf-8') as f:
        json.dump(unique_segments, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    run_full_scraper()