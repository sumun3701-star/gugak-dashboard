/* /api/kopis-detail — KOPIS 공연 상세(예매 URL 등) 프록시 */
'use strict';
const { passthrough } = require('./_util');

module.exports = async (req, res) => {
  const q = req.query || {};
  const id = String(q.id || '');
  const service = String(q.service || '');
  const target = 'http://www.kopis.or.kr/openApi/restful/pblprfr/' +
    encodeURIComponent(id) + '?service=' + encodeURIComponent(service);
  await passthrough(target, res);
};
