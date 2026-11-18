(function () {
  'use strict';

  var KEY = 'ai-ledger:v1';
  var DEFAULT_SETTINGS = {
    aiEnabled: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini'
  };

  var state = null;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function shift(base, days) {
    var d = new Date(base.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }
  function uid() {
    return 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function round2(n) { return Math.round(Number(n) * 100) / 100; }

  function buildDemo() {
    var now = new Date();
    now.setHours(12, 0, 0, 0);
    var lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0);
    var list = [
      { type: 'expense', amount: 28, category: '餐饮', note: '午餐', date: fmt(now) },
      { type: 'expense', amount: 36.5, category: '交通', note: '打车', date: fmt(shift(now, -1)) },
      { type: 'expense', amount: 128.8, category: '购物', note: '超市采购', date: fmt(shift(now, -2)) },
      { type: 'income', amount: 12000, category: '工资', note: '本月工资', date: fmt(shift(now, -3)) },
      { type: 'expense', amount: 2000, category: '居住', note: '上月房租', date: fmt(lastMonth) },
      { type: 'expense', amount: 136, category: '居住', note: '上月水电', date: fmt(new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 20, 12)) }
    ];
    return list.map(function (item) {
      return {
        id: uid(),
        type: item.type,
        amount: item.amount,
        category: item.category,
        note: item.note,
        date: item.date,
        createdAt: Date.now(),
        source: 'demo'
      };
    });
  }

  function normalizeEntry(e) {
    if (!e || typeof e !== 'object') return null;
    var amount = Number(e.amount);
    if (!isFinite(amount) || amount <= 0) return null;
    var type = e.type === 'income' ? 'income' : 'expense';
    var date = typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : fmt(new Date());
    return {
      id: typeof e.id === 'string' && e.id ? e.id : uid(),
      type: type,
      amount: round2(amount),
      category: typeof e.category === 'string' && e.category ? e.category.slice(0, 10) : '其他',
      note: typeof e.note === 'string' ? e.note.slice(0, 40) : '',
      date: date,
      createdAt: Number(e.createdAt) || Date.now(),
      source: typeof e.source === 'string' ? e.source.slice(0, 10) : 'manual'
    };
  }

  function readStorage() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.entries)) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      return false;
    }
  }

  function load() {
    var stored = readStorage();
    if (stored) {
      state = {
        version: 1,
        entries: stored.entries.map(normalizeEntry).filter(Boolean),
        settings: Object.assign({}, DEFAULT_SETTINGS, stored.settings || {}),
        demoSeeded: stored.demoSeeded !== false
      };
      state.settings.aiEnabled = !!state.settings.aiEnabled;
      return state;
    }
    state = {
      version: 1,
      entries: buildDemo(),
      settings: Object.assign({}, DEFAULT_SETTINGS),
      demoSeeded: true
    };
    persist();
    return state;
  }

  function get() {
    if (!state) load();
    return state;
  }

  function saveSettings(patch) {
    var s = get();
    s.settings = Object.assign({}, s.settings, patch || {});
    persist();
    return s.settings;
  }

  function addEntry(entry) {
    var s = get();
    var normalized = normalizeEntry(entry);
    if (!normalized) return null;
    normalized.id = uid();
    normalized.createdAt = Date.now();
    normalized.source = entry.source || 'manual';
    s.entries.push(normalized);
    persist();
    return normalized;
  }

  function removeEntry(id) {
    var s = get();
    var before = s.entries.length;
    s.entries = s.entries.filter(function (e) { return e.id !== id; });
    persist();
    return s.entries.length !== before;
  }

  function clearAll() {
    var s = get();
    s.entries = [];
    s.demoSeeded = true;
    persist();
    return true;
  }

  function exportJSON() {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: get().entries }, null, 2);
  }

  function importJSON(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { ok: false, message: '文件不是合法的 JSON' };
    }
    var entries = Array.isArray(parsed) ? parsed : parsed && parsed.entries;
    if (!Array.isArray(entries)) return { ok: false, message: '文件中没有账单数据' };
    var normalized = entries.map(normalizeEntry).filter(Boolean);
    if (!normalized.length) return { ok: false, message: '没有可导入的有效记录' };
    var s = get();
    s.entries = s.entries.concat(normalized);
    s.demoSeeded = true;
    var ok = persist();
    return { ok: ok, count: normalized.length, message: ok ? '成功导入 ' + normalized.length + ' 条记录' : '数据已导入但本地保存失败' };
  }

  function monthlyTotals(year, month) {
    var s = get();
    var prefix = year + '-' + pad(month + 1);
    var income = 0;
    var expense = 0;
    var count = 0;
    s.entries.forEach(function (e) {
      if (e.date.slice(0, 7) !== prefix) return;
      count += 1;
      if (e.type === 'income') income += e.amount;
      else expense += e.amount;
    });
    return { income: round2(income), expense: round2(expense), count: count };
  }

  var api = {
    KEY: KEY,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    uid: uid,
    get: get,
    load: load,
    persist: persist,
    saveSettings: saveSettings,
    addEntry: addEntry,
    removeEntry: removeEntry,
    clearAll: clearAll,
    exportJSON: exportJSON,
    importJSON: importJSON,
    monthlyTotals: monthlyTotals,
    normalizeEntry: normalizeEntry,
    fmt: fmt
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LedgerStore = api;
})();