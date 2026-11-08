"""Bundle Segue into one self-contained HTML file: dist/segue.html.

index.html is published as a claude.ai artifact, which supplies the document
skeleton itself; the standalone file adds it back and inlines every script, so
the result opens from disk with a double click and can be attached anywhere.
"""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'index.html').read_text(encoding='utf-8')

def inline(m):
    js = (root / m.group(1)).read_text(encoding='utf-8').replace('</script', '<\\/script')
    return f'<script>\n{js}\n</script>'

body = re.sub(r'<script src="([^"]+)"></script>', inline, src)
head = ('<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n')
# everything before <header> is head material (title, fonts, style); the rest is the body
cut = body.index('<header')
out = head + body[:cut] + '</head>\n<body>\n' + body[cut:] + '\n</body>\n</html>\n'
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'segue.html').write_text(out, encoding='utf-8')
print(f'dist/segue.html  {len(out.encode()) / 1024:.0f} KB')
