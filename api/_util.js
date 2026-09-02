/* api/_util.js — Vercel 서버리스 함수 공용 유틸 (라우트 아님: '_' 접두사) */
'use strict';

const ALLOW = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

// 대상 URL 응답을 그대로 흘려보냄 (KOPIS·유튜브 RSS 등)
async function passthrough(target, res, opts) {
  opts = opts || {};
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeout || 15000);
  try {
    const r = await fetch(target, {
      headers: Object.assign({ 'User-Agent': 'gugak-dashboard/1.0', 'Accept': '*/*' }, opts.headers || {}),
      redirect: 'follow',
      signal: ctl.signal
    });
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status || 200, Object.assign({
      'Content-Type': r.headers.get('content-type') || 'text/plain; charset=utf-8'
    }, ALLOW));
    res.end(buf);
  } catch (e) {
    res.writeHead(502, Object.assign({ 'Content-Type': 'application/json' }, ALLOW));
    res.end(JSON.stringify({ error: 'proxy failed', detail: String((e && e.message) || e) }));
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); });
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

module.exports = { ALLOW, passthrough, decodeEntities, metaContent };
