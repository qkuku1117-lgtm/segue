#!/usr/bin/env python3
"""Segue, played on your own computer.

    python3 tools/serve.py            # opens http://localhost:8765/

Serves the single-file build and, when the Claude command-line tool is installed
and signed in on this computer, lets the page's coach ask it questions. No API key:
the questions go through your own Claude, exactly as if you had typed them.

What the coach endpoint will and will not do:
  - it listens on 127.0.0.1 only, and answers only pages it served itself
  - Claude runs with every tool switched off: it can read the question and write
    an answer, nothing else (no files, no shell, no web, no MCP servers)
  - nothing is stored: no session is written to disk

Options (environment):
  SEGUE_PORT   port to listen on (default 8765)
  SEGUE_MODEL  model alias or id passed to `claude --model` (default: sonnet, for quick answers)
"""
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get('SEGUE_PORT', '8765'))
MODEL = os.environ.get('SEGUE_MODEL', 'sonnet')
CLAUDE = shutil.which('claude')
HOSTS = {f'localhost:{PORT}', f'127.0.0.1:{PORT}', f'[::1]:{PORT}'}
SYSTEM = ('你是 Segue 的 AI 混音教练。严格按照用户消息里给出的角色、数据和输出格式回答，'
          '不要寒暄，不要解释你在做什么，不要使用任何工具。')
MAX_BODY = 200_000
# one question at a time is plenty for a single player, and keeps a stuck page from piling up processes
GATE = threading.Semaphore(2)
WORK = tempfile.mkdtemp(prefix='segue-coach-')


def ask_claude(messages):
    """Hand a short conversation to the local Claude and return its answer as text."""
    turns = [m for m in messages if isinstance(m, dict) and m.get('role') in ('user', 'assistant') and isinstance(m.get('content'), str)]
    if not turns or turns[-1]['role'] != 'user':
        raise ValueError('the conversation must end with a question')
    if len(turns) == 1:
        prompt = turns[0]['content']
    else:
        said = '\n\n'.join(('学员：' if t['role'] == 'user' else '教练：') + t['content'] for t in turns[:-1])
        prompt = f'这是到目前为止的对话：\n\n{said}\n\n学员接着问：{turns[-1]["content"]}\n\n请直接给出教练的下一句回答。'
    # a clean environment: the page must get the same answer whether the launcher was started from a terminal or from an app
    env = {k: os.environ[k] for k in ('HOME', 'PATH', 'USER', 'LANG', 'LC_ALL', 'TMPDIR') if k in os.environ}
    cmd = [CLAUDE, '-p', '--model', MODEL, '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--system-prompt', SYSTEM]
    out = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=90, cwd=WORK, env=env)
    if out.returncode != 0:
        raise RuntimeError((out.stderr or out.stdout or 'claude exited with an error').strip()[:300])
    return out.stdout.strip()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if self.path.startswith('/api/'):
            sys.stderr.write('coach  ' + (fmt % args) + '\n')

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def ours(self):
        # only a page served from here may ask: the Host must be this server, and the custom header
        # cannot be sent by another website without a permission this server never grants
        return self.headers.get('Host') in HOSTS and self.headers.get('X-Segue') == '1'

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            self.send_response(302)
            self.send_header('Location', '/dist/segue.html')
            self.end_headers()
        elif self.path == '/api/coach':
            if not self.ours():
                return self.send_json(403, {'ok': False})
            self.send_json(200, {'ok': bool(CLAUDE), 'model': MODEL})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path != '/api/coach':
            return self.send_json(404, {'error': 'not found'})
        if not self.ours():
            return self.send_json(403, {'error': 'this page was not served by the launcher'})
        if not CLAUDE:
            return self.send_json(503, {'code': 'unavailable', 'error': 'the claude command is not installed'})
        try:
            n = int(self.headers.get('Content-Length', '0'))
            if n <= 0 or n > MAX_BODY:
                return self.send_json(413, {'error': 'question too long'})
            messages = json.loads(self.rfile.read(n).decode('utf-8')).get('messages')
            if not isinstance(messages, list):
                raise ValueError('messages missing')
        except (ValueError, UnicodeDecodeError) as e:
            return self.send_json(400, {'error': str(e)})
        if not GATE.acquire(timeout=30):
            return self.send_json(429, {'code': 'rate_limited', 'error': 'the coach is still answering'})
        try:
            self.send_json(200, {'text': ask_claude(messages)})
        except subprocess.TimeoutExpired:
            self.send_json(504, {'code': 'failed', 'error': 'the coach took too long'})
        except Exception as e:  # the page falls back to the built-in coach on any failure
            self.send_json(502, {'code': 'failed', 'error': str(e)})
        finally:
            GATE.release()


def main():
    if not os.path.exists(os.path.join(ROOT, 'dist', 'segue.html')):
        sys.exit('dist/segue.html is missing: run  python3 tools/build.py  first')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    url = f'http://localhost:{PORT}/'
    print(f'Segue  {url}')
    print(f'coach  {"your Claude (" + MODEL + ")" if CLAUDE else "built-in (install and sign in to the claude command to get Claude)"}')
    print('stop   Ctrl+C')
    if '--no-open' not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        shutil.rmtree(WORK, ignore_errors=True)


if __name__ == '__main__':
    main()
