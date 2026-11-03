# Builds data/study-programs.json from snapshots of each college's official PGWP-eligible program page.
import re, html, json, os, sys, glob, hashlib, datetime
sys.path.insert(0, os.path.dirname(__file__))
from progs_gen import lines, pairs
D = sys.argv[1] if len(sys.argv) > 1 else 'pages/program-pages'
URLS = json.load(open(os.path.join(os.path.dirname(__file__), 'urls.json')))
P = {}  # school -> list of (name, credential)
def f(school, n=1, ext='html'): return f'{D}/{school}__{n}.{ext}'
def generic(school, *ns):
    out = []
    for n in ns or (1,): out += pairs(f(school, n))
    return out
P['fanshawe-college'] = generic('fanshawe-college')
P['niagara-college'] = generic('niagara-college')
P['st-clair-college'] = generic('st-clair-college')
P['loyalist-college'] = generic('loyalist-college')
P['sault-college'] = generic('sault-college', 2)
P['bow-valley-college'] = generic('bow-valley-college')
P['northwestern-polytechnic'] = generic('northwestern-polytechnic')
P['cambrian-college'] = [(re.sub(r'^\W+|\W+$', '', n), c) for n, c in generic('cambrian-college') if not re.fullmatch(r'[A-Z]{2,6}', n)]
# Conestoga: table rows with title / code / credential
rows = []
for fn in sorted(glob.glob(f'{D}/conestoga-college__*.html')):
    t = open(fn, encoding='utf-8').read()
    rows += [(html.unescape(m[1]).strip(), m[2].strip()) for m in re.finditer(r'<strong class="d-none">Program title</strong>\s*(?:<a[^>]*>)?\s*<span>([^<]+)</span>.*?Credential:</strong>\s*<span>([^<]+)</span>', t, re.S)]
P['conestoga-college'] = rows
# Mohawk: name (may wrap) - id, status, theme, credential, CIP
L = lines(f('mohawk-college')); rows = []; start = None
for i, l in enumerate(L):
    if l == 'CIP Code': start = i + 1
    if start and re.fullmatch(r'\d{2}\.\d{4}', l):
        seg = L[start:i]; start = i + 1
        st = next((k for k, x in enumerate(seg) if 'eligib' in x.lower()), None)
        if st is None or re.search(r'\bnot\b|no longer', seg[st], re.I): continue
        name = ' '.join(seg[:st]); name = re.sub(r'\s*-\s*\d+\s*$', '', name).strip(' -')
        rows.append((name, seg[-1]))
P['mohawk-college'] = rows

def txt(school, n=1): return open(f(school, n, 'txt'), encoding='utf-8', errors='ignore').read().splitlines()
CIP = {}  # (school, name) -> CIP code, for lists that need the IRCC field-of-study check
def cred_of(name):
    m = re.match(r'(Associate Degree|Associate of [A-Za-z]+|Post-Baccalaureate Diploma|Post-Degree Diploma|Graduate Diploma|Advanced Diploma|Diploma|Certificate|Bachelor of [A-Za-z ]+|Master of [A-Za-z ]+)', name)
    if m: return m[1]
    m = re.search(r'\b(Advanced Diploma|Post-Baccalaureate Diploma|Diploma|Certificate)\b', name)
    return m[1] if m else ''
# Douglas: "Program name ....... CIP" (reference list of every program; filtered by the IRCC field list below)
rows = []
for l in txt('douglas-college'):
    m = re.match(r'\s*(\S.*?\S)\s{3,}(\d{2}\.\d{4})\s*$', l)
    if m and not re.search(r'Douglas College (Program|Credential)', m[1]): rows.append((m[1], cred_of(m[1]))); CIP[('douglas-college', m[1])] = m[2]
P['douglas-college'] = rows
# MacEwan: "Credential  Name  CIP"
rows = []
for l in txt('macewan-university'):
    m = re.match(r'\s*(Diploma|Certificate|Post-Baccalaureate Diploma|Post-Baccalaureate Certificate|Bachelor of [A-Za-z ]+?|Degree|Bachelor)\s{2,}(\S.*?\S)\s{2,}(\d{2}\.\d{4})\s*$', l)
    if m: rows.append((m[2] if m[1].startswith(('Diploma','Certificate','Post')) else (m[1] + ' – ' + m[2] if not m[2].startswith('Bachelor') else m[2]), m[1])); CIP[('macewan-university', rows[-1][0])] = m[3]
P['macewan-university'] = [r for r in rows if 'exit' not in r[0]]
# TRU: section headers set the credential; rows with a check mark are PGWP eligible
rows = []; cred = ''
for l in txt('thompson-rivers-university'):
    h = re.match(r"\s*(Master's Degree|Bachelor's Degree|Diploma|Certificate|Post-Baccalaureate Diploma|Associate Degree|Graduate Certificate|Advanced Certificate|Post-Baccalaureate Certificate|Graduate Diploma)s?\s{3,}PGWP", l)
    if h: cred = h[1]; continue
    m = re.match(r'\s*(\S.*?\S)\s{3,}✓', l)
    if m: rows.append((m[1], cred or cred_of(m[1])))
P['thompson-rivers-university'] = rows
# Coast Mountain: numbered list "1. Name Diploma (CIP Code: 26.1302)"
t = '\n'.join(txt('coast-mountain-college')); rows = []
for m in re.finditer(r'\n\s*\d+\.\s+(.+?)\s*\(CIP(?: Code:)?\s*\n?\s*(\d{2}\.\d{4})\)', t):
    rows.append((re.sub(r'\s+', ' ', m[1]).strip(), cred_of(m[1].split('|')[-1].strip()) or cred_of(m[1])))
P['coast-mountain-college'] = rows
# SAIT: two columns of program names under school headings
rows = []; on = False
for l in txt('sait'):
    if 'PGWP ELIGIBLE DESIGNATED' in l: on = True; continue
    if not on: continue
    for part in re.split(r'\s{3,}', l.strip()):
        part = part.strip()
        if not part or part.isupper() or len(part) < 4 or re.search(r'sait\.ca|PGWP|^\*|Page \d', part): continue
        rows.append((part, cred_of(part) or ('Bachelor' if part.startswith('Bachelor') else 'Diploma')))
P['sait'] = [r for r in rows if 'qualify' not in r[0]]


CREDW = r'(Diploma|Certificate|Degree|Bachelor|Associate|Post-?Degree|Post-?Baccalaureate|Advanced Diploma)'
def between(L, start, stop):
    i = next((k for k, l in enumerate(L) if start(l)), None)
    if i is None: return []
    out = []
    for l in L[i + 1:]:
        if stop(l): break
        out.append(l)
    return out
# VCC: table of program names after "Program Duration"
L = lines(f('vancouver-community-college'))
seg = between(L, lambda l: l == 'Program Duration', lambda l: re.search(r'^(How to apply|Ready to apply|Related|Contact|Apply now)', l, re.I))
P['vancouver-community-college'] = [(l, cred_of(l) or l) for l in seg if re.search(CREDW, l, re.I) and len(l) < 110 and not re.search(r'\d+ (years?|months?)', l)]
# VIU: "Program: Name"
P['vancouver-island-university'] = [(m[1].strip(), m[1]) for l in lines(f('vancouver-island-university')) for m in [re.match(r'Program:\s*(.+)$', l)] if m]
# Selkirk: "Name - Credential" lines in the two PGWP lists
L = lines(f('selkirk-college'))
seg = between(L, lambda l: l.startswith('PGWP-Eligible Programs Accepting International Applications'), lambda l: l.startswith('*Bachelor'))
P['selkirk-college'] = [(l, l.rsplit(' - ', 1)[-1]) for l in seg if ' - ' in l and re.search(CREDW, l, re.I)]
# College of the Rockies: name then credential type
P['college-of-the-rockies'] = [r for r in generic('college-of-the-rockies') if not re.search(r'January|September|May|intake', r[0], re.I)]
# Okanagan: per-term PGWP tables; collect every program row, de-duplicated
L = lines(f('okanagan-college')); rows = []; on = False
for l in L:
    if re.search(r'Post Graduate Work Permit \(PGWP\) Eligible Programs', l): on = True; continue
    if on and re.search(r'^All other programs|^Programs not eligible|^Other programs', l, re.I): break
    if on and re.search(CREDW, l, re.I) and len(l) < 120 and not re.search(r'Program Availability|^PROGRAM$', l, re.I): rows.append((l, cred_of(l) or l))
P['okanagan-college'] = rows

# Bachelor's degrees checked by hand on official pages (Nov 2026). Bachelor's degrees at public institutions need no
# field-of-study match for a PGWP. intakes = what the school publishes for international students.
UFV = 'https://international.ufv.ca/future-students/programs/'
KPU_NOTE = 'KPU international deadlines: January intake closes Nov 1; May intake open until Mar 1 (limited-intake deadline Dec 1). Check program availability.'
MANUAL = [('university-of-the-fraser-valley', n, i, UFV, 'UFV lists this as PGWP-eligible for international students. May 2027 and Sept 2027 applications open (Nov 2026).') for n, i in [
    ('Bachelor of Arts', 'Sep, Jan, May'), ('Bachelor of Arts in Global Development Studies', 'Sep, Jan, May'), ('Bachelor of Arts (Criminal Justice)', 'Sep, Jan'),
    ('Bachelor of Agricultural Science', 'Sep, Jan, May'), ('Bachelor of Business Administration', 'Sep, Jan'), ('Bachelor of Business Administration in Aviation', 'Sep, Jan, May'),
    ('Bachelor of Computer Information Systems', 'Sep, Jan, May'), ('Bachelor of Environmental Studies', 'Sep, Jan, May'), ('Bachelor of Fine Arts', 'Sep, Jan'),
    ('Bachelor of Integrated Studies', 'Sep, Jan, May'), ('Bachelor of Kinesiology', 'Sep, Jan, May'), ('Bachelor of Media Arts', 'Sep, Jan'),
    ('Bachelor of Regional & Community Planning', 'Sep, Jan, May'), ('Bachelor of Science', 'Sep, Jan, May'), ('Bachelor of Social Work', 'Sep')]] + [
  ('kwantlen-polytechnic-university', 'Bachelor of Arts, Major in General Studies', 'Sep, Jan, May', 'https://calendar.kpu.ca/programs-az/arts/general-studies/general-studies-ba/general-studies-ba.pdf', KPU_NOTE),
  ('kwantlen-polytechnic-university', 'Bachelor of Arts, Major in English', 'Sep, Jan, May', 'https://calendar.kpu.ca/programs-az/arts/english/english-ba/english-ba.pdf', KPU_NOTE),
  ('university-of-northern-british-columbia', 'Bachelor of Arts, Major in General Studies', 'Sep, Jan, May', 'https://www.unbc.ca/programs-and-admissions/undergraduate/undergraduate-application-deadlines', 'International deadlines: January Nov 8, May Mar 9, September Jul 11 (seats permitting). CNC Associate of Arts transfer pathways published by UNBC.'),
  ('university-of-northern-british-columbia', 'Bachelor of Arts, Major in English', 'Sep, Jan, May', 'https://www.unbc.ca/programs-and-admissions/undergraduate/undergraduate-application-deadlines', 'International deadlines: January Nov 8, May Mar 9, September Jul 11 (seats permitting). CNC Associate of Arts transfer pathways published by UNBC.'),
  ('university-of-northern-british-columbia', 'Bachelor of Arts, Joint Major in Global and International Studies & Political Science', 'Sep, Jan, May', 'https://www.unbc.ca/programs-and-admissions/undergraduate/undergraduate-application-deadlines', 'International deadlines: January Nov 8, May Mar 9, September Jul 11 (seats permitting). CNC Associate of Arts transfer pathways published by UNBC.'),
  ('capilano-university', 'Bachelor of Arts, Major in Interdisciplinary Studies', '', 'https://www.capilanou.ca/programs--courses/capu-for-you/international-students/international-program-availability-status/', 'Check CapU international program availability for the intake.'),
  ('vancouver-island-university', 'Bachelor of Arts (General)', '', 'https://connect.viu.ca/january-intake', 'VIU runs a January intake for international students; check program availability.'),
]

IRCC = json.load(open(os.path.join(os.path.dirname(__file__), 'ircc_cip.json')))
OK_CIP = {c for c, v in IRCC.items() if v['pgwp'].startswith(('Your field of study is eligible', 'Your CIP code is eligible'))}
def level(name, cred):
    n = name.lower().strip()  # the program's own name wins over a section heading
    if re.match(r'(honours )?bachelor|applied bachelor|baccalaureate', n): return 'bachelors'
    if re.match(r'master|mba\b|juris doctor', n): return 'masters'
    if re.match(r'associate', n): return 'diploma'
    t = (cred + ' ' + name).lower()
    if re.search(r"\bmaster|\bmba\b|juris doctor|\bm\.?eng", t): return 'masters'
    if re.search(r"graduate certificate|graduate diploma|post[- ]?(baccalaureate|degree|diploma|graduate)|postgraduate", t): return 'pg-cert'
    if re.search(r"bachelor|\bdegree\b|honours|baccalaureate|\bb\.?(sc|a|ba|com|tech)\b|applied degree", t) and 'associate' not in t: return 'bachelors'
    if 'advanced diploma' in t: return 'advanced-diploma'
    if re.search(r'diploma|associate', t): return 'diploma'
    if 'certificate' in t: return 'certificate'
    return 'diploma'
JS = open(os.path.join(os.path.dirname(__file__), '..', '..', 'functions', '_study.js'), encoding='utf-8').read()
FW = {k: v.split() for k, v in re.findall(r'^\s+(\w+): "([a-z0-9 .+]+)",?$', JS[JS.find('const FIELD_WORDS'):JS.find('};', JS.find('const FIELD_WORDS'))], re.M)}
EXTRA = {'health': 'brain disorders disorder clinical medical rehabilitation gerontology dementia mental paramedic acupuncture massage pharmacy radiography imaging mri sonography respiratory dental veterinary therapist therapy kinesiology psw', 'it': 'cyber software programming web game cloud network computing data', 'engineering': 'technician technology electrical mechanical civil electronics manufacturing cnc automation instrumentation power process petroleum biomedical architecture geosciences', 'trades': 'carpentry welding plumbing electrician motive millwright woodworking', 'community': 'autism behavioural addiction child youth developmental services', 'science': 'geological geology geoscience geosciences chemistry biology biotechnology', 'accounting': 'financial accounting finance', 'environment': 'ecology environmental ecosystem horticulture forestry fish wildlife agri', 'arts': 'animation video graphic film photography music theatre visual', 'hospitality': 'culinary chef baking hospitality tourism'}
for k, v in EXTRA.items(): FW[k] = FW.get(k, []) + v.split()
def field(name):
    t = ' ' + re.sub(r'[^a-z0-9.+ ]+', ' ', name.lower()) + ' '; best = ('other', 0)
    if re.search(r'health|nurs|medical|clinical|brain|\bmental\b|disorder|therap|pharm|paramedic|care aide', t): return 'health'
    for k, ws in FW.items():
        sc = sum((2 if len(w) > 3 else 1) for w in ws if w != 'services' and (' ' + w + ' ' in t or (len(w) > 5 and w in t)))
        if sc > best[1]: best = (k, sc)
    return best[0]
def build():
    out, schools = [], {}
    for sch, rows in P.items():
        src = URLS.get(sch, [''])[0]; seen = set()
        for name, cred in rows:
            name = re.sub(r'\s+', ' ', name).strip(' *-–'); lv = level(name, cred or '')
            c = CIP.get((sch, name))
            if c and lv not in ('bachelors', 'masters') and c not in OK_CIP: continue  # field not on IRCC's list
            key = (name.lower(), lv)
            if key in seen or len(name) < 4: continue
            seen.add(key)
            pid = 'c-' + hashlib.sha1(f'{sch}|{name}|{lv}'.encode()).hexdigest()[:12]
            out.append({'id': pid, 'school': sch, 'name': name, 'level': lv, 'field': field(name), 'pgwp': 'yes', 'link': src, 'source': src,
                        'note': (f'CIP {c}. ' if c else '') + 'Listed as PGWP-eligible on the college\'s official page.'})
    for sch, name, intakes, link, note in MANUAL:
        pid = 'c-' + hashlib.sha1(f'{sch}|{name}|bachelors'.encode()).hexdigest()[:12]
        out.append({'id': pid, 'school': sch, 'name': name, 'level': 'bachelors', 'field': field(name), 'pgwp': 'yes', 'intakes': intakes, 'link': link, 'source': link, 'note': note})
    for p in out:  # TRU: Bachelor of Arts programs take September, January and May intakes (tru.ca BA page)
        if p['school'] == 'thompson-rivers-university' and p['name'].startswith('Bachelor of Arts'):
            p['intakes'] = 'Sep, Jan, May'; p['link'] = 'https://www.tru.ca/programs/catalogue/bachelor-arts.html'
    return out
if __name__ == '__main__' and len(sys.argv) > 2 and sys.argv[2] == 'json':
    progs = build()
    print(json.dumps({'version': datetime.date.today().isoformat() + '-' + hashlib.sha1(json.dumps(progs).encode()).hexdigest()[:8], 'checked': datetime.date.today().isoformat(), 'programs': progs}, ensure_ascii=False, indent=0))
    sys.exit()
if __name__ == '__main__':
    for k, v in P.items(): print(k.ljust(28), len(v), '|', '; '.join(n for n, _ in v[:4]))
