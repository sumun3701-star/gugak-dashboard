/* kopis.js — 공연 정보 자동수집 (전역 App.kopis) */
window.App = window.App || {};

App.kopis = (function () {
  var CACHE_KEY = 'kopisCache';
  var CACHE_TTL = 12 * 60 * 60 * 1000; // 12시간 (CAL-10: 최소 1일 1회 이상 갱신)
  var METRO = ['서울', '경기', '인천'];

  function s() { return App.settings.get(); }

  /* ---------- 요청 URL ---------- */
  function listUrl(params) {
    var qs = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    if (App.util.proxyAvailable()) {
      return App.util.proxyBase() + '/api/kopis?path=pblprfr&' + qs;
    }
    // 프록시 없이 직접 (대개 CORS 로 실패) — 시도만
    return 'http://www.kopis.or.kr/openApi/restful/pblprfr?' + qs;
  }
  function detailUrl(id) {
    if (App.util.proxyAvailable()) {
      return App.util.proxyBase() + '/api/kopis-detail?id=' + encodeURIComponent(id) +
        '&service=' + encodeURIComponent(s().kopisKey);
    }
    return 'http://www.kopis.or.kr/openApi/restful/pblprfr/' + encodeURIComponent(id) +
      '?service=' + encodeURIComponent(s().kopisKey);
  }
  function publicView(id) {
    return 'http://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20id=' + encodeURIComponent(id);
  }

  /* ---------- XML 파싱 ---------- */
  function text(node, tag) {
    var el = node.getElementsByTagName(tag)[0];
    return el ? (el.textContent || '').trim() : '';
  }

  function classifyGroup(venueName) {
    var kws = s().designatedVenues || [];
    for (var i = 0; i < kws.length; i++) {
      if (kws[i] && venueName.indexOf(kws[i]) !== -1) return 'designated';
    }
    return 'discovered';
  }
  function isMetro(area) {
    for (var i = 0; i < METRO.length; i++) if ((area || '').indexOf(METRO[i]) !== -1) return true;
    return false;
  }

  function parseList(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('KOPIS 응답 파싱 실패');
    var dbs = doc.getElementsByTagName('db');
    var out = [];
    for (var i = 0; i < dbs.length; i++) {
      var n = dbs[i];
      var id = text(n, 'mt20id');
      if (!id) continue;
      var venue = text(n, 'fcltynm');
      var area = text(n, 'area');
      out.push({
        id: id,
        name: text(n, 'prfnm'),
        venue: venue,
        area: area,
        dateFrom: normDate(text(n, 'prfpdfrom')),
        dateTo: normDate(text(n, 'prfpdto')),
        poster: text(n, 'poster'),
        genre: text(n, 'genrenm') || '국악',
        state: text(n, 'prfstate'),
        url: publicView(id),
        source: 'kopis',
        group: classifyGroup(venue),
        metro: isMetro(area)
      });
    }
    return out;
  }
  function normDate(str) {
    var d = App.util.parseDate(str);
    return d ? App.util.ymd(d) : str;
  }

  /* ---------- 목록 수집 ---------- */
  function fetchAll(onProgress) {
    var cfg = s();
    if (!cfg.kopisKey) return Promise.reject({ code: 'NOKEY' });

    var start = App.util.addDays(new Date(), -7);
    var end = App.util.addDays(new Date(), cfg.rangeDays || 90);
    var base = {
      service: cfg.kopisKey,
      stdate: App.util.ymdCompact(start),
      eddate: App.util.ymdCompact(end),
      rows: 100,
      shcate: cfg.genreCode || 'CCCC'
    };

    var acc = [];
    var page = 1;
    var maxPages = cfg.maxPages || 10;

    function next() {
      var params = Object.assign({}, base, { cpage: page });
      onProgress && onProgress('공연 목록 조회 중… (' + page + '페이지)');
      return fetch(listUrl(params)).then(function (r) {
        if (!r.ok) throw { code: 'HTTP', status: r.status };
        return r.text();
      }).then(function (t) {
        var rows = parseList(t);
        acc = acc.concat(rows);
        if (rows.length >= 100 && page < maxPages) { page++; return next(); }
        return acc;
      });
    }

    return next().then(function (rows) {
      var merged = dedupe(rows);
      var payload = { fetchedAt: Date.now(), items: merged };
      App.store.set(CACHE_KEY, payload);
      return payload;
    }).catch(function (err) {
      if (err && err.code) throw err;
      throw { code: 'NETWORK', message: String(err && err.message || err) };
    });
  }

  function dedupe(rows) {
    var map = {};
    rows.forEach(function (r) {
      var ex = map[r.id];
      if (!ex) { map[r.id] = r; return; }
      // 지정 공연장 분류를 우선 유지
      if (ex.group !== 'designated' && r.group === 'designated') map[r.id] = r;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /* ---------- 캐시 ---------- */
  function getCache() { return App.store.get(CACHE_KEY, null); }
  function cacheFresh() {
    var c = getCache();
    return !!(c && (Date.now() - c.fetchedAt) < CACHE_TTL);
  }

  /* ---------- 통합 조회: 캐시 + 수동 + (필요시) 샘플 ---------- */
  function loadPerformances(opts) {
    opts = opts || {};
    var cfg = s();
    var manual = App.store.get('manualPerfs', []).map(function (p) {
      return {
        id: p.id, name: p.name, venue: p.venue, area: '',
        dateFrom: p.dateFrom, dateTo: p.dateTo || p.dateFrom,
        poster: '', genre: '국악', state: '', url: p.url || '',
        source: 'manual', group: p.group || classifyGroup(p.venue), metro: true
      };
    });

    // 자동수집 여부 판단
    var canAuto = !!cfg.kopisKey;
    var cache = getCache();

    function combine(autoItems, note) {
      var all = dedupe(autoItems.concat(manual));
      return { items: all, note: note, source: (autoItems === SAMPLE ? 'sample' : (canAuto ? 'kopis' : 'manual')) };
    }

    if (!canAuto) {
      // 키 없음 → 수동 + 샘플
      return Promise.resolve({
        items: dedupe(SAMPLE.concat(manual)),
        note: 'KOPIS 인증키가 없어 샘플 공연과 수동 등록 공연만 표시합니다. 설정에서 키를 입력하세요.',
        source: 'sample'
      });
    }

    if (!opts.force && cache && cacheFresh()) {
      return Promise.resolve(combine(cache.items, null));
    }

    return fetchAll(opts.onProgress).then(function (payload) {
      return combine(payload.items, null);
    }).catch(function (err) {
      // 실패 시 마지막 캐시라도
      if (cache) {
        return combine(cache.items, '자동 갱신 실패 — 마지막으로 받은 데이터를 표시합니다 (' + errMsg(err) + ')');
      }
      return {
        items: dedupe(SAMPLE.concat(manual)),
        note: '자동 수집 실패 (' + errMsg(err) + '). 샘플·수동 데이터를 표시합니다.',
        source: 'sample'
      };
    });
  }

  function errMsg(err) {
    if (!err) return '알 수 없는 오류';
    if (err.code === 'NOKEY') return 'KOPIS 인증키 없음';
    if (err.code === 'HTTP') return 'HTTP ' + err.status;
    if (err.code === 'NETWORK') return App.util.proxyAvailable() ? ('네트워크/프록시 오류: ' + (err.message || '')) : 'CORS 차단 — server.js 를 실행하세요';
    return err.message || String(err);
  }

  /* ---------- 상세(예매) URL 지연 조회 ---------- */
  function fetchDetailUrl(id) {
    if (!s().kopisKey || !App.util.proxyAvailable()) return Promise.resolve(null);
    return fetch(detailUrl(id)).then(function (r) { return r.text(); }).then(function (t) {
      var doc = new DOMParser().parseFromString(t, 'application/xml');
      var rel = doc.getElementsByTagName('relateurl');
      for (var i = 0; i < rel.length; i++) {
        var u = (rel[i].textContent || '').trim();
        if (/^https?:\/\//.test(u)) return u;
      }
      return null;
    }).catch(function () { return null; });
  }

  /* ---------- 샘플 데이터 (키/프록시 없이도 화면 확인용) ---------- */
  var _today = new Date();
  function d(offset) { return App.util.ymd(App.util.addDays(_today, offset)); }
  var SAMPLE = [
    { id: 'sample:1', name: '토요명품공연', venue: '국립국악원 우면당', area: '서울특별시', dateFrom: d(2), dateTo: d(2), poster: '', genre: '국악', state: '공연예정', url: 'https://www.gugak.go.kr', source: 'sample', group: 'designated', metro: true },
    { id: 'sample:2', name: '수요춤전 — 전통의 오늘', venue: '국립극장 달오름', area: '서울특별시', dateFrom: d(5), dateTo: d(5), poster: '', genre: '국악', state: '공연예정', url: 'https://www.ntok.go.kr', source: 'sample', group: 'designated', metro: true },
    { id: 'sample:3', name: '남산골 국악한마당', venue: '서울남산국악당', area: '서울특별시', dateFrom: d(7), dateTo: d(9), poster: '', genre: '국악', state: '공연예정', url: 'https://www.hanokmaeul.or.kr', source: 'sample', group: 'designated', metro: true },
    { id: 'sample:4', name: '가야금 산조의 밤', venue: '김희수아트센터 김희수홀', area: '서울특별시', dateFrom: d(12), dateTo: d(12), poster: '', genre: '국악', state: '공연예정', url: 'https://www.kimheesooartcenter.com', source: 'sample', group: 'designated', metro: true },
    { id: 'sample:5', name: '경기소리 정기공연', venue: '돈화문국악당', area: '서울특별시', dateFrom: d(3), dateTo: d(3), poster: '', genre: '국악', state: '공연예정', url: 'https://www.sdtt.or.kr', source: 'sample', group: 'discovered', metro: true },
    { id: 'sample:6', name: '판소리 다섯바탕 — 흥보가', venue: '경기아트센터 소극장', area: '경기도', dateFrom: d(9), dateTo: d(9), poster: '', genre: '국악', state: '공연예정', url: 'https://www.ggac.or.kr', source: 'sample', group: 'discovered', metro: true },
    { id: 'sample:7', name: '전주세계소리축제 개막공연', venue: '한국소리문화의전당', area: '전라북도', dateFrom: d(18), dateTo: d(20), poster: '', genre: '국악', state: '공연예정', url: 'https://www.sorifestival.com', source: 'sample', group: 'discovered', metro: false },
    { id: 'sample:8', name: '영남풍류 — 대구 국악관현악', venue: '대구문화예술회관', area: '대구광역시', dateFrom: d(15), dateTo: d(15), poster: '', genre: '국악', state: '공연예정', url: 'https://artcenter.daegu.go.kr', source: 'sample', group: 'discovered', metro: false }
  ];

  return {
    loadPerformances: loadPerformances,
    fetchDetailUrl: fetchDetailUrl,
    getCache: getCache,
    cacheFresh: cacheFresh,
    errMsg: errMsg
  };
})();
