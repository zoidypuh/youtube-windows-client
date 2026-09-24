#!/usr/bin/env python3
import ssl
import httpx
from http.server import HTTPServer, BaseHTTPRequestHandler

TARGET = "http://127.0.0.1:8767"

class ProxyHandler(BaseHTTPRequestHandler):
    def forward(self, method):
        path = self.path.split('?', 1)[0]
        qs = '?' + self.path.split('?', 1)[1] if '?' in self.path else ''
        url = TARGET + path + qs
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ['host', 'content-length']}
        try:
            with httpx.stream(method, url, headers=headers, content=self.rfile.read(int(self.headers.get('Content-Length', 0))) if method in ['POST','PUT'] else None) as r:
                self.send_response(r.status_code)
                for k, v in r.headers.items():
                    if k.lower() not in ['transfer-encoding']:
                        self.send_header(k, v)
                self.end_headers()
                for chunk in r.iter_bytes(8192):
                    self.wfile.write(chunk)
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(e).encode())
    def do_GET(self): self.forward('GET')
    def do_POST(self): self.forward('POST')
    def do_PUT(self): self.forward('PUT')
    def do_DELETE(self): self.forward('DELETE')
    def log_message(self, format, *a): pass

ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
ctx.load_cert_chain('/mnt/c/dev/yt-music-client/cert.pem', '/mnt/c/dev/yt-music-client/key.pem')
srv = HTTPServer(('127.0.0.1', 8768), ProxyHandler)
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
print('HTTPS proxy on 127.0.0.1:8768 →', TARGET)
srv.serve_forever()
