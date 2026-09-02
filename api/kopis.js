/* /api/kopis — KOPIS 오픈API(pblprfr 등) 프록시 */
'use strict';
const { passthrough } = require('./_util');

const BASE = 'http://www.kopis.or.kr/openApi/restful/';

module.exports = async (req, res) => {
  const q = req.query || {};
  const apiPath = String(q.path || 'pblprfr').replace(/[^a-z/]/gi, '') || 'pblprfr';
  const params = new URLSearchParams();
  Object.keys(q).forEach((k) => {
    if (k === 'path') return;
    const v = q[k];
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else params.append(k, v);
  });
  await passthrough(BASE + apiPath + '?' + params.toString(), res);
};
