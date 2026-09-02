/* /api/fetch-meta — 대상 페이지의 og:title / description 추출 (스크랩 "정보 가져오기") */
'use strict';
const { ALLOW, decodeEntities, metaContent } = require('./_util');

module.exports = async (req, res) => {
  const target = String((req.query && req.query.url) || '');
  if (!/^https?:\/\//i.test(target)) {
    res.writeHead(400, Object.assign({ 'Content-Type': 'application/json' }, ALLOW));
    return res.end(JSON.stringify({ error: 'bad url' }));
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; gugak-dashboard/1.0)', 'Accept': 'text/html,*/*' },
      redirect: 'follow',
      signal: ctl.signal
    });
    const html = (await r.text()).slice(0, 300000);
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const result = {
      title: metaContent(html, 'property', 'og:title')
        || metaContent(html, 'name', 'twitter:title')
        || (titleTag ? decodeEntities(titleTag[1].trim()) : ''),
      description: metaContent(html, 'property', 'og:description')
        || metaContent(html, 'name', 'description'),
      siteName: metaContent(html, 'property', 'og:site_name')
    };
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, ALLOW));
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(502, Object.assign({ 'Content-Type': 'application/json' }, ALLOW));
    res.end(JSON.stringify({ error: 'fetch failed', detail: String((e && e.message) || e) }));
  } finally {
    clearTimeout(timer);
  }
};
