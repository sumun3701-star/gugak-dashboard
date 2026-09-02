#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
server.py - 국악 대시보드 로컬 서버 (표준 라이브러리만 사용, Python 3.7+)

    python server.py
    -> http://localhost:5173 접속

server.js(Node) 와 동일한 역할의 Python 버전입니다. 둘 중 편한 것을 쓰세요.
  1) 현재 폴더의 정적 파일 서빙
  2) /api/kopis, /api/kopis-detail  -> KOPIS 오픈API 프록시 (CORS 우회)
  3) /api/youtube-rss               -> 유튜브 채널 RSS 프록시

이 서버는 선택 사항입니다. index.html 을 그냥 열어도 수동 입력·샘플로 동작하지만,
KOPIS 자동수집을 쓰려면 이 서버(또는 server.js)가 필요합니다.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from html import unescape as _unescape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "5173"))
KOPIS_BASE = "http://www.kopis.or.kr/openApi/restful"

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # 조용하게
        pass

    def _proxy(self, target):
        try:
            req = urllib.request.Request(target, headers={"User-Agent": "gugak-dashboard/1.0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                body = r.read()
                ctype = r.headers.get("Content-Type", "text/plain; charset=utf-8")
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:  # noqa
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(('{"error":"proxy failed","detail":%r}' % str(e)).encode("utf-8"))

    def _static(self, path):
        rel = urllib.parse.unquote(path)
        if rel in ("/", ""):
            rel = "/index.html"
        fp = os.path.normpath(os.path.join(ROOT, rel.lstrip("/")))
        if not fp.startswith(ROOT) or not os.path.isfile(fp):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"not found")
            return
        ext = os.path.splitext(fp)[1].lower()
        with open(fp, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/api/kopis":
            api_path = q.get("path", ["pblprfr"])[0]
            params = {k: v[0] for k, v in q.items() if k != "path"}
            target = KOPIS_BASE + "/" + api_path + "?" + urllib.parse.urlencode(params)
            return self._proxy(target)

        if parsed.path == "/api/kopis-detail":
            mt = q.get("id", [""])[0]
            service = q.get("service", [""])[0]
            target = KOPIS_BASE + "/pblprfr/" + urllib.parse.quote(mt) + "?service=" + urllib.parse.quote(service)
            return self._proxy(target)

        if parsed.path == "/api/youtube-rss":
            ch = q.get("channel_id", [""])[0]
            return self._proxy("https://www.youtube.com/feeds/videos.xml?channel_id=" + urllib.parse.quote(ch))

        if parsed.path == "/api/fetch-meta":
            return self._fetch_meta(q.get("url", [""])[0])

        return self._static(parsed.path)

    def _fetch_meta(self, target):
        if not re.match(r"^https?://", target or "", re.I):
            self._json(400, {"error": "bad url"})
            return
        try:
            req = urllib.request.Request(
                target, headers={"User-Agent": "Mozilla/5.0 (compatible; gugak-dashboard/1.0)"}
            )
            with urllib.request.urlopen(req, timeout=12) as r:
                charset = r.headers.get_content_charset() or "utf-8"
                raw = r.read(250000)
            html = raw.decode(charset, "replace")
        except Exception as e:  # noqa
            self._json(502, {"error": "fetch failed", "detail": str(e)})
            return

        def meta(attr, val):
            for tag in re.findall(r"<meta\b[^>]*>", html, re.I):
                if re.search(attr + r'=["\']' + re.escape(val) + r'["\']', tag, re.I):
                    m = re.search(r'content=["\']([^"\']*)["\']', tag, re.I)
                    if m:
                        return _unescape(m.group(1).strip())
            return ""

        tm = re.search(r"<title[^>]*>([^<]*)</title>", html, re.I)
        result = {
            "title": meta("property", "og:title") or meta("name", "twitter:title")
            or (_unescape(tm.group(1).strip()) if tm else ""),
            "description": meta("property", "og:description") or meta("name", "description"),
            "siteName": meta("property", "og:site_name"),
        }
        self._json(200, result)

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("\n  국악 대시보드 실행 중")
    print("  -> http://localhost:%d\n" % PORT)
    print("  종료: Ctrl+C\n")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()
