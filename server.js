/*
 * server.js — 국악 대시보드 로컬 서버 (의존성 없음, Node 14+)
 *
 *   node server.js
 *   → http://localhost:5173 접속
 *
 * 하는 일:
 *   1) 현재 폴더의 정적 파일(index.html 등) 서빙
 *   2) /api/kopis, /api/kopis-detail  → KOPIS 오픈API 프록시 (브라우저 CORS 우회)
 *   3) /api/youtube-rss               → 유튜브 채널 RSS 프록시
 *
 * 이 서버는 "선택 사항"입니다. index.html 을 그냥 열어도 수동 입력·샘플로 동작하지만,
 * KOPIS 자동수집을 쓰려면 이 서버가 필요합니다.
 */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = process.env.PORT || 5173;
const KOPIS_BASE = 'http://www.kopis.or.kr/openApi/restful';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8'
};

function proxy(target, res) {
  let mod;
  try {
    mod = new URL(target).protocol === 'https:' ? https : http;
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'bad target' }));
  }
  const req = mod.get(target, { headers: { 'User-Agent': 'gugak-dashboard/1.0', 'Accept': '*/*' } }, r => {
    const chunks = [];
    r.on('data', c => chunks.push(c));
    r.on('end', () => {
      const buf = Buffer.concat(chunks);
      res.writeHead(r.statusCode || 200, {
        'Content-Type': r.headers['content-type'] || 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      });
      res.end(buf);
    });
  });
  req.on('error', e => {
    res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'proxy failed', detail: String(e) }));
  });
  req.setTimeout(15000, () => req.destroy(new Error('timeout')));
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
function metaContent(html, attr, val) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const re = new RegExp(attr + '=["\']' + val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']', 'i');
  for (const tag of tags) {
    if (re.test(tag)) {
      const c = tag.match(/content=["']([^"']*)["']/i);
      if (c) return decodeEntities(c[1].trim());
    }
  }
  return '';
}
function fetchMeta(target, res, depth) {
  depth = depth || 0;
  let mod;
  try { mod = new URL(target).protocol === 'https:' ? https : http; }
  catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ error: 'bad url' }));
  }
  const req = mod.get(target, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; gugak-dashboard/1.0)', 'Accept': 'text/html,*/*' } }, r => {
    if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && depth < 4) {
      r.destroy();
      return fetchMeta(new URL(r.headers.location, target).href, res, depth + 1);
    }
    let data = '';
    r.setEncoding('utf8');
    r.on('data', c => { data += c; if (data.length > 250000) r.destroy(); });
    const done = () => {
      const title = metaContent(data, 'property', 'og:title')
        || metaContent(data, 'name', 'twitter:title')
        || (data.match(/<title[^>]*>([^<]*)<\/title>/i) ? decodeEntities(RegExp.$1.trim()) : '');
      const description = metaContent(data, 'property', 'og:description')
        || metaContent(data, 'name', 'description');
      const siteName = metaContent(data, 'property', 'og:site_name');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ title, description, siteName }));
    };
    r.on('end', done);
    r.on('close', () => { if (data) done(); });
  });
  req.on('error', e => {
    res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'fetch failed', detail: String(e) }));
  });
  req.setTimeout(12000, () => req.destroy(new Error('timeout')));
}

// 페이지 본문을 태그 제거한 평문으로 (스크랩 AI 정리용)
function fetchText(target, res, depth) {
  depth = depth || 0;
  let mod;
  try { mod = new URL(target).protocol === 'https:' ? https : http; }
  catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end('bad url');
  }
  const req = mod.get(target, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; gugak-dashboard/1.0)', 'Accept': 'text/html,*/*' } }, r => {
    if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && depth < 4) {
      r.destroy();
      return fetchText(new URL(r.headers.location, target).href, res, depth + 1);
    }
    let data = '';
    r.setEncoding('utf8');
    r.on('data', c => { data += c; if (data.length > 800000) r.destroy(); });
    const done = () => {
      let t = data
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<\/(p|div|li|h[1-6]|br|tr|section|article)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ');
      t = decodeEntities(t).replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim().slice(0, 14000);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(t);
    };
    r.on('end', done);
    r.on('close', () => { if (data) done(); });
  });
  req.on('error', e => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end('fetch failed: ' + String(e));
  });
  req.setTimeout(12000, () => req.destroy(new Error('timeout')));
}

function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const fp = path.join(ROOT, path.normalize(rel));
  if (!fp.startsWith(ROOT)) {
    res.writeHead(403); return res.end('forbidden');
  }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); }
  catch (e) { res.writeHead(400); return res.end('bad request'); }
  const q = u.searchParams;

  if (u.pathname === '/api/kopis') {
    const apiPath = q.get('path') || 'pblprfr';
    const params = [];
    q.forEach((v, k) => { if (k !== 'path') params.push(encodeURIComponent(k) + '=' + encodeURIComponent(v)); });
    return proxy(KOPIS_BASE + '/' + apiPath + '?' + params.join('&'), res);
  }

  if (u.pathname === '/api/kopis-detail') {
    const id = q.get('id') || '';
    const service = q.get('service') || '';
    return proxy(KOPIS_BASE + '/pblprfr/' + encodeURIComponent(id) + '?service=' + encodeURIComponent(service), res);
  }

  if (u.pathname === '/api/youtube-rss') {
    const ch = q.get('channel_id') || '';
    return proxy('https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(ch), res);
  }

  if (u.pathname === '/api/fetch-meta') {
    const target = q.get('url') || '';
    if (!/^https?:\/\//i.test(target)) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ error: 'bad url' }));
    }
    return fetchMeta(target, res);
  }

  if (u.pathname === '/api/fetch-text') {
    const target = q.get('url') || '';
    if (!/^https?:\/\//i.test(target)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end('bad url');
    }
    return fetchText(target, res);
  }

  return serveStatic(u.pathname, res);
});

server.listen(PORT, () => {
  console.log('\n  국악 대시보드 실행 중');
  console.log('  → http://localhost:' + PORT + '\n');
  console.log('  종료: Ctrl+C\n');
});
