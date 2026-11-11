#!/usr/bin/env python3
"""
Dev server for Lege Lux.
Serves all static files normally, but substitutes placeholder tokens
in a handful of specific files using environment variables.
Source files are NEVER modified — git status stays clean.
"""
import os
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 5000
HOST = '0.0.0.0'

BUILD_ID   = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S') + '-dev'
BUILD_INFO = f'dev · {BUILD_ID}'

REPLACEMENTS = {
    '__FIREBASE_API_KEY__':             os.environ.get('FIREBASE_API_KEY', '__FIREBASE_API_KEY__'),
    '__FIREBASE_APP_ID__':              os.environ.get('FIREBASE_APP_ID', '__FIREBASE_APP_ID__'),
    '__FIREBASE_MESSAGING_SENDER_ID__': os.environ.get('FIREBASE_MESSAGING_SENDER_ID', '__FIREBASE_MESSAGING_SENDER_ID__'),
    '__BUILD_ID__':                     BUILD_ID,
    '__BUILD_INFO__':                   BUILD_INFO,
}

SUBSTITUTED = {
    'index.html',
    'sw.js',
    'config/firebase-config.js',
    'config/firebase-config.bundle.js',
}

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
    '.txt':  'text/plain; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
}

class DevHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0].split('#')[0].lstrip('/')
        if not path:
            path = 'index.html'

        if path in SUBSTITUTED and os.path.isfile(path):
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            for token, value in REPLACEMENTS.items():
                content = content.replace(token, value)
            encoded = content.encode('utf-8')
            ext = '.' + path.rsplit('.', 1)[-1] if '.' in path else ''
            mime = MIME.get(ext, 'text/plain')
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
        else:
            super().do_GET()

    def log_message(self, fmt, *args):
        pass  # suppress per-request noise


if __name__ == '__main__':
    firebase_key = os.environ.get('FIREBASE_API_KEY', '')
    firebase_ok  = bool(firebase_key and not firebase_key.startswith('__'))

    print(f'Lege Lux dev server  →  http://{HOST}:{PORT}')
    print(f'BUILD_ID : {BUILD_ID}')
    print(f'Firebase : {"configured ✓" if firebase_ok else "not configured (add FIREBASE_API_KEY, FIREBASE_APP_ID, FIREBASE_MESSAGING_SENDER_ID secrets)"}')

    HTTPServer((HOST, PORT), DevHandler).serve_forever()
