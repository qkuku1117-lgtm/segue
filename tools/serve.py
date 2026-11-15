#!/usr/bin/env python3
"""Segue, played on your own computer.

    python3 tools/serve.py            # opens http://localhost:8765/dist/segue.html

A plain static server for the single-file build, bound to this computer only.
Nothing here talks to an AI: the coach is Gemini, called by the page itself with
the API key you enter in it. Double-clicking dist/segue.html works just as well;
the server only gives the page a stable address, so the browser remembers your
key and your practice history between visits.

    SEGUE_PORT   port to listen on (default 8765)
"""
import http.server
import os
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get('SEGUE_PORT', '8765'))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        # always the page as it is on disk, never a copy the browser kept from before a rebuild
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            self.send_response(302)
            self.send_header('Location', '/dist/segue.html')
            self.end_headers()
        else:
            super().do_GET()


def main():
    if not os.path.exists(os.path.join(ROOT, 'dist', 'segue.html')):
        sys.exit('dist/segue.html is missing: run  python3 tools/build.py  first')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    url = f'http://localhost:{PORT}/dist/segue.html'
    print(f'Segue  {url}')
    print('stop   Ctrl+C')
    if '--no-open' not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
