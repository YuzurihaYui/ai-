(function () {
  'use strict';

  var TIMEOUT = 15000;

  function isConfigured(settings) {
    if (!settings) return false;
    return !!(settings.aiEnabled && settings.apiKey && settings.baseUrl && settings.model);
  }

  function dateString(value) {
    var d = value ? new Date(value) : new Date();
    var month = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (month < 10 ? '0' + month : month) + '-' + (day < 10 ? '0' + day : day);
  }

  function normalizeBase(url) {
    var base = String(url || '').trim().replace(/\/+$/, '');
    if (/\/chat\/completions$/.test(base)) return base;
    return base + '/chat/completions';
  }

  function extractJSON(text) {
    if (!text) return null;
    var cleaned = String(text).replace(/```json/gi, '```').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (err) {}
    var start = cleaned.indexOf('{');
    var end = cleaned.lastIndexOf('}');
    if (start > -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (err2) {}
    }
    return null;
  }

  function callModel(settings, messages) {
    return new Promise(function (resolve, reject) {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('timeout'));
      }, TIMEOUT);

      fetch(normalizeBase(settings.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + settings.apiKey
        },
        body: JSON.stringify({
          model: settings.model,
          temperature: 0.2,
          messages: messages
        }),
        signal: controller ? controller.signal : undefined
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        clearTimeout(timer);
        var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!content) throw new Error('empty');
        resolve(content);
      }).catch(function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function parse(text, settings, now) {
    if (!isConfigured(settings)) return Promise.resolve(null);
    var today = dateString(now);
    var system = [
      '你是记账解析器。把用户的一句话解析成 JSON，只输出 JSON，不要解释。',
      '字段：type（income 或 expense）、amount（数字，元）、category（支出分类：餐饮/交通/购物/居住/娱乐/医疗/教育/通讯/人情/其他；收入分类：工资/奖金/红包/报销/退款/理财/兼职/其他）、note（简短备注，不超过 12 字）、date（YYYY-MM-DD）。',
      '今天是 ' + today + '。相对日期（昨天、前天、3天前）必须换算成具体日期。',
      '示例输入：昨天打车花了38块 输出：{"type":"expense","amount":38,"category":"交通","note":"打车","date":"' + today + '"}'
    ].join('\n');

    return callModel(settings, [
      { role: 'system', content: system },
      { role: 'user', content: String(text) }
    ]).then(function (content) {
      var json = extractJSON(content);
      if (!json) return null;
      var amount = Number(json.amount);
      if (!isFinite(amount) || amount <= 0) return null;
      var type = json.type === 'income' ? 'income' : 'expense';
      var date = typeof json.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(json.date) ? json.date : today;
      return {
        ok: true,
        raw: String(text),
        type: type,
        amount: Math.round(amount * 100) / 100,
        category: typeof json.category === 'string' && json.category ? json.category : '其他',
        note: typeof json.note === 'string' ? json.note.slice(0, 20) : '',
        date: date,
        confidence: 0.96,
        source: 'ai'
      };
    }).catch(function () {
      return null;
    });
  }

  function advise(summary, settings) {
    if (!isConfigured(settings)) return Promise.resolve(null);
    var system = '你是理财助手，语言简洁、具体、务实，不使用列表符号，不使用表情。';
    var user = [
      '本月支出 ' + summary.expense + ' 元，收入 ' + summary.income + ' 元，结余 ' + summary.balance + ' 元，共 ' + summary.count + ' 笔。',
      '最大支出分类：' + (summary.topCat || '无') + '，金额 ' + summary.topAmount + ' 元，占支出 ' + Math.round(summary.topShare * 100) + '%。',
      '上月支出 ' + summary.prevExpense + ' 元。',
      '请给出 80 字以内、可执行的中文消费建议。'
    ].join('');
    return callModel(settings, [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]).then(function (content) {
      return String(content).trim().slice(0, 200) || null;
    }).catch(function () {
      return null;
    });
  }

  var api = { isConfigured: isConfigured, parse: parse, advise: advise, callModel: callModel };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LedgerAI = api;
})();