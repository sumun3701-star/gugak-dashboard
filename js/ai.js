/* ai.js — Google Gemini API 래퍼 (전역 App.ai)
   설정의 Gemini API 키로 브라우저에서 직접 호출(CORS 허용). */
window.App = window.App || {};

App.ai = (function () {
  function s() { return App.settings.get(); }
  function key() { return (s().geminiKey || '').trim(); }
  function model() { return (s().geminiModel || 'gemini-2.5-flash').trim(); }
  function available() { return !!key(); }

  // prompt(string) -> Promise<string>. opts.json=true 면 JSON 응답 강제.
  function generate(prompt, opts) {
    opts = opts || {};
    if (!available()) return Promise.reject(new Error('Gemini API 키가 없습니다 (설정에서 입력하세요)'));
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model()) + ':generateContent';
    var body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: opts.temperature != null ? opts.temperature : 0.3 }
    };
    if (opts.json) body.generationConfig.responseMimeType = 'application/json';

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || j.error) {
          throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
        }
        var c = j.candidates && j.candidates[0];
        var text = c && c.content && c.content.parts &&
          c.content.parts.map(function (p) { return p.text || ''; }).join('');
        if (!text) throw new Error('빈 응답' + (c && c.finishReason ? ' (' + c.finishReason + ')' : ''));
        return text;
      });
    });
  }

  function generateJSON(prompt, opts) {
    return generate(prompt, Object.assign({ json: true, temperature: 0.2 }, opts || {}))
      .then(function (t) {
        t = String(t).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        return JSON.parse(t);
      });
  }

  return { available: available, generate: generate, generateJSON: generateJSON };
})();
