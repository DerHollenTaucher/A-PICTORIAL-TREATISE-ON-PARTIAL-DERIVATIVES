import re, sys, os, io

p = r'e:\Partial Drivative\_dump.html'
out = io.open(r'e:\Partial Drivative\_check.txt', 'w', encoding='utf-8')
if not os.path.exists(p):
    out.write('no dump\n'); out.close(); sys.exit()
raw = open(p, 'rb').read()
txt = raw.decode('utf-8-sig', errors='replace')

def grab(pat, n=1):
    m = re.findall(pat, txt, re.S)
    return [re.sub(r'\s+', ' ', x)[:600] for x in m[:n]]

out.write('length: %d\n' % len(txt))
for k, pat in [
    ('title', r'<title>(.*?)</title>'),
    ('selftest attr', r'data-selftest="([a-z]+)"'),
    ('engine', r'id="engineTag">(.*?)</div>'),
    ('figTitle', r'id="figTitle">(.*?)</span>'),
    ('readouts', r'id="readouts">(.*?)</aside>'),
    ('note', r'id="figNote">(.*?)</figcaption>'),
]:
    out.write('%s: %s\n' % (k, grab(pat)))

s = re.search(r'(?s)<pre id="selftest"[^>]*>(.*?)</pre>', txt)
if s:
    body = s.group(1).replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    out.write('---- selftest ----\n' + body + '\n')
else:
    out.write('no selftest block\n')
out.write('labels: %d\n' % len(re.findall(r'class="stage-label', txt)))
for m in re.finditer(r'<button class="([^"]*)"[^>]*role="tab"[^>]*data-chapter="([0-9])"[^>]*aria-selected="([a-z]+)"', txt):
    out.write('tab %s class=[%s] sel=%s\n' % (m.group(2), m.group(1), m.group(3)))
for m in re.finditer(r'<article class="prose"[^>]*data-chapter-content="([0-9])"([^>]*)>', txt):
    out.write('prose %s attrs=[%s]\n' % (m.group(1), m.group(2)))
out.close()
print('ok')

