/* /api/fetch-text — 대상 페이지 본문을 태그 제거한 평문으로 반환 (스크랩 AI 정리용) */
'use strict';
const { ALLOW, decodeEntities } = require('./_util');

module.exports = async (req, res) => {
  const target = String((req.query && req.query.url) || '');
  if (!/^https?:\/\//i.test(target)) {
    res.writeHead(400, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, ALLOW));
    return res.end('bad url');
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; gugak-dashboard/1.0)', 'Accept': 'text/html,*/*' },
      redirect: 'follow',
      signal: ctl.signal
    });
    let data = (await r.text()).slice(0, 800000);
    let out = data
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|li|h[1-6]|br|tr|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
    out = decodeEntities(out)
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim()
      .slice(0, 14000);
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, ALLOW));
    res.end(out);
  } catch (e) {
    res.writeHead(502, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, ALLOW));
    res.end('fetch failed: ' + String((e && e.message) || e));
  } finally {
    clearTimeout(timer);
  }
};
