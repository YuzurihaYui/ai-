(function () {
  'use strict';

  var Store = window.LedgerStore;
  var Parser = window.LedgerParser;
  var AI = window.LedgerAI;
  var Voice = window.LedgerVoice;
  var Charts = window.LedgerCharts;
  var Advisor = window.LedgerAdvisor;

  function $(id) {
    return document.getElementById(id);
  }

  if (!Store || !Parser || !Charts || !Advisor) {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">页面脚本加载失败，请确认 js 目录完整后刷新。</p>';
    return;
  }

  var state = Store.load();
  var pending = null;
  var manualType = 'expense';
  var aiAdviceCache = '';
  var filters = { type: 'all', month: 'all', keyword: '' };
  var monthSignature = '';
  var resizeTimer = null;

  var CAT_COLORS = {
    '餐饮': '#2ec4a6',
    '交通': '#4d8dff',
    '购物': '#f4a261',
    '居住': '#9b7bff',
    '娱乐': '#ff7d9c',
    '医疗': '#38bdf8',
    '教育': '#a3b18a',
    '通讯': '#f7b267',
    '人情': '#f4978e',
    '其他': '#9aa5b1',
    '工资': '#1fae92',
    '奖金': '#4d8dff',
    '红包': '#ff7d9c',
    '报销': '#f4a261',
    '退款': '#9b7bff',
    '理财': '#38bdf8',
    '兼职': '#a3b18a'
  };
  var FALLBACK_COLORS = ['#2ec4a6', '#4d8dff', '#f4a261', '#9b7bff', '#ff7d9c', '#38bdf8', '#f7b267', '#a3b18a'];

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(n) {
    return '¥' + Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function moneyCompact(n) {
    var value = Number(n || 0);
    var text = value >= 10000
      ? Math.round(value / 100) / 100 + '万'
      : Math.round(value).toLocaleString('zh-CN');
    return '¥' + text;
  }

  function percentText(rate) {
    return (Math.round(rate * 1000) / 10) + '%';
  }

  function shortDate(dateStr) {
    var parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    return Number(parts[1]) + '月' + Number(parts[2]) + '日';
  }

  var toastTimer = null;
  function toast(message) {
    var node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('show');
    }, 2600);
  }

  function compareText(current, previous) {
    if (!previous) return '上月暂无数据';
    var rate = (current - previous) / previous;
    if (!isFinite(rate)) return '上月暂无数据';
    if (Math.abs(rate) < 0.005) return '与上月持平';
    return '较上月' + (rate > 0 ? '增长 ' : '减少 ') + percentText(Math.abs(rate));
  }

  function fillCategory(select, type, selected) {
    var list = type === 'income' ? Parser.INCOME_LIST : Parser.EXPENSE_LIST;
    select.innerHTML = list.map(function (cat) {
      return '<option value="' + esc(cat) + '">' + esc(cat) + '</option>';
    }).join('');
    select.value = selected && list.indexOf(selected) > -1 ? selected : list[0];
  }

  function renderStats() {
    var now = new Date();
    var current = Store.monthlyTotals(now.getFullYear(), now.getMonth());
    var prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var previous = Store.monthlyTotals(prevDate.getFullYear(), prevDate.getMonth());

    $('statIncome').textContent = money(current.income);
    $('statExpense').textContent = money(current.expense);

    var balance = Math.round((current.income - current.expense) * 100) / 100;
    var balanceNode = $('statBalance');
    balanceNode.textContent = (balance < 0 ? '-' : '') + money(Math.abs(balance));
    balanceNode.classList.toggle('negative', balance < 0);

    $('statCount').textContent = current.count + ' 笔';
    $('statIncomeDelta').textContent = compareText(current.income, previous.income);
    $('statExpenseDelta').textContent = compareText(current.expense, previous.expense);

    if (current.income > 0 && current.count > 0) {
      var rate = (current.income - current.expense) / current.income;
      $('statBalanceNote').textContent = '储蓄率 ' + (rate < 0 ? '-' : '') + percentText(Math.abs(rate));
    } else if (current.count > 0) {
      $('statBalanceNote').textContent = '补充收入后可计算储蓄率';
    } else {
      $('statBalanceNote').textContent = '本月还没有记录';
    }

    var days = {};
    state.entries.forEach(function (e) {
      if (e.date.slice(0, 7) === now.getFullYear() + '-' + pad(now.getMonth() + 1)) days[e.date] = true;
    });
    $('statCountNote').textContent = current.count ? '覆盖 ' + Object.keys(days).length + ' 天' : '用一句话开始记账';
  }

  function renderCharts() {
    var now = new Date();
    var monthKey = now.getFullYear() + '-' + pad(now.getMonth() + 1);
    var byCat = {};
    var total = 0;

    state.entries.forEach(function (entry) {
      if (entry.type !== 'expense' || entry.date.slice(0, 7) !== monthKey) return;
      byCat[entry.category] = (byCat[entry.category] || 0) + entry.amount;
      total += entry.amount;
    });

    var items = Object.keys(byCat).map(function (cat, index) {
      return {
        label: cat,
        value: Math.round(byCat[cat] * 100) / 100,
        color: CAT_COLORS[cat] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]
      };
    }).sort(function (a, b) {
      return b.value - a.value;
    });

    $('chartRange').textContent = (now.getMonth() + 1) + ' 月';
    Charts.donut($('donutCanvas'), items, {
      centerTop: '本月支出',
      centerBottom: moneyCompact(total)
    });

    if (!items.length) {
      $('donutLegend').innerHTML = '<li class="legend-empty">本月暂无支出记录</li>';
    } else {
      $('donutLegend').innerHTML = items.slice(0, 6).map(function (item) {
        var share = total > 0 ? item.value / total : 0;
        return '<li><i style="background:' + item.color + '"></i><span>' + esc(item.label) + '</span>' +
          '<strong>' + money(item.value) + '</strong><em>' + percentText(share) + '</em></li>';
      }).join('');
    }

    var months = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var totals = Store.monthlyTotals(d.getFullYear(), d.getMonth());
      months.push({ label: (d.getMonth() + 1) + '月', income: totals.income, expense: totals.expense });
    }
    Charts.bars($('barCanvas'), months);
  }

  function renderAdvice() {
    var list = Advisor.insights(state.entries, new Date());
    $('adviceList').innerHTML = list.map(function (item) {
      return '<li class="advice ' + item.level + '"><strong>' + esc(item.title) + '</strong><p>' + esc(item.text) + '</p></li>';
    }).join('');

    var button = $('aiAdviceBtn');
    button.hidden = !AI.isConfigured(state.settings);

    var box = $('aiAdviceText');
    if (aiAdviceCache) {
      box.hidden = false;
      box.textContent = 'AI 点评：' + aiAdviceCache;
    } else {
      box.hidden = true;
      box.textContent = '';
    }
  }

  function syncMonthOptions() {
    var months = {};
    state.entries.forEach(function (entry) {
      months[entry.date.slice(0, 7)] = true;
    });
    var keys = Object.keys(months).sort().reverse();
    var signature = keys.join(',');
    if (filters.month !== 'all' && keys.indexOf(filters.month) === -1) filters.month = 'all';

    var select = $('filterMonth');
    if (signature !== monthSignature) {
      monthSignature = signature;
      select.innerHTML = '<option value="all">全部月份</option>' + keys.map(function (key) {
        var parts = key.split('-');
        return '<option value="' + key + '">' + parts[0] + ' 年 ' + Number(parts[1]) + ' 月</option>';
      }).join('');
    }
    select.value = filters.month;
  }

  function renderList() {
    syncMonthOptions();

    var keyword = filters.keyword.trim().toLowerCase();
    var list = state.entries.filter(function (entry) {
      if (filters.type !== 'all' && entry.type !== filters.type) return false;
      if (filters.month !== 'all' && entry.date.slice(0, 7) !== filters.month) return false;
      if (keyword) {
        var haystack = (entry.note + ' ' + entry.category).toLowerCase();
        if (haystack.indexOf(keyword) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return b.createdAt - a.createdAt;
    });

    var income = 0;
    var expense = 0;
    list.forEach(function (entry) {
      if (entry.type === 'income') income += entry.amount;
      else expense += entry.amount;
    });

    $('listSummary').textContent = '共 ' + list.length + ' 笔 · 收入 ' + money(income) + ' · 支出 ' + money(expense);

    $('entryList').innerHTML = list.map(function (entry) {
      var color = CAT_COLORS[entry.category] || '#9aa5b1';
      var sign = entry.type === 'income' ? '+' : '-';
      var sourceTag = entry.source === 'ai' ? ' · AI' : '';
      return '<li class="entry">' +
        '<span class="cat-dot" style="background:' + color + '"></span>' +
        '<div class="entry-main">' +
        '<strong>' + esc(entry.note || entry.category) + '</strong>' +
        '<span class="entry-meta">' + esc(entry.category) + ' · ' + shortDate(entry.date) + sourceTag + '</span>' +
        '</div>' +
        '<div class="entry-right">' +
        '<span class="entry-amount ' + entry.type + '">' + sign + money(entry.amount) + '</span>' +
        '<button class="icon-btn" type="button" data-delete="' + esc(entry.id) + '" aria-label="删除" title="删除这条记录">×</button>' +
        '</div>' +
        '</li>';
    }).join('');

    $('emptyState').hidden = list.length > 0;
  }

  function renderAiBadge() {
    var badge = $('aiBadge');
    var enabled = AI.isConfigured(state.settings);
    badge.classList.toggle('on', enabled);
    badge.innerHTML = '<i></i>' + (enabled ? 'AI 增强已开启' : '本地解析');
  }

  function renderAll() {
    renderStats();
    renderCharts();
    renderAdvice();
    renderList();
    renderAiBadge();
  }

  function setNlBusy(busy) {
    var button = $('nlSubmit');
    button.disabled = busy;
    button.textContent = busy ? 'AI 解析中…' : '智能记账';
  }

  function closePreview() {
    pending = null;
    $('previewBox').hidden = true;
    $('previewBox').innerHTML = '';
  }

  function renderPreview(parsed) {
    pending = parsed;
    var sourceLabel = parsed.source === 'ai' ? 'AI 解析' : '本地解析';
    var sourceClass = parsed.source === 'ai' ? 'ai' : 'local';
    var confidence = Math.round((parsed.confidence || 0) * 100);

    var box = $('previewBox');
    box.hidden = false;
    box.innerHTML = '' +
      '<div class="preview-head">' +
      '<span>识别结果 <em class="tag ' + sourceClass + '">' + sourceLabel + '</em></span>' +
      '<span class="confidence">置信度 ' + confidence + '%</span>' +
      '</div>' +
      '<div class="preview-grid">' +
      '<label class="field"><span>类型</span><select id="pvType"><option value="expense">支出</option><option value="income">收入</option></select></label>' +
      '<label class="field"><span>金额</span><input id="pvAmount" type="number" min="0.01" step="0.01" value="' + (parsed.amount || '') + '"></label>' +
      '<label class="field"><span>分类</span><select id="pvCategory"></select></label>' +
      '<label class="field"><span>日期</span><input id="pvDate" type="date" value="' + esc(parsed.date) + '"></label>' +
      '</div>' +
      '<label class="field"><span>备注</span><input id="pvNote" type="text" maxlength="20" value="' + esc(parsed.note) + '"></label>' +
      (parsed.ok ? '' : '<p class="preview-warn">没有识别到金额，请补充后再确认。</p>') +
      '<div class="preview-actions">' +
      '<button class="btn ghost" type="button" id="pvCancel">取消</button>' +
      '<button class="btn primary" type="button" id="pvConfirm">确认记账</button>' +
      '</div>';

    $('pvType').value = parsed.type;
    fillCategory($('pvCategory'), parsed.type, parsed.category);
    $('pvType').addEventListener('change', function () {
      fillCategory($('pvCategory'), this.value, '');
    });
    $('pvCancel').addEventListener('click', closePreview);
    $('pvConfirm').addEventListener('click', confirmPreview);

    if (!parsed.amount) $('pvAmount').focus();
  }

  function confirmPreview() {
    var amount = Number($('pvAmount').value);
    if (!(amount > 0)) {
      toast('金额需要大于 0');
      $('pvAmount').focus();
      return;
    }
    var date = $('pvDate').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast('请选择有效日期');
      return;
    }
    var category = $('pvCategory').value;
    var entry = Store.addEntry({
      type: $('pvType').value,
      amount: amount,
      category: category,
      date: date,
      note: ($('pvNote').value || '').trim() || category,
      source: pending && pending.source === 'ai' ? 'ai' : 'nl'
    });
    if (!entry) {
      toast('记账失败，请检查输入');
      return;
    }
    var saved = Store.persist();
    closePreview();
    $('nlInput').value = '';
    aiAdviceCache = '';
    renderAll();
    toast('已记一笔：' + (entry.type === 'income' ? '收入 ' : '支出 ') + money(entry.amount));
    if (!saved) {
      setTimeout(function () {
        toast('本地存储不可用，数据仅保留在当前页面');
      }, 1400);
    }
  }

  function parseText(text) {
    var value = String(text || '').trim();
    if (!value) {
      toast('先输入一句话，例如「午餐 25」');
      return;
    }
    $('nlInput').value = value;

    if (!AI.isConfigured(state.settings)) {
      renderPreview(Parser.parse(value, new Date()));
      return;
    }

    setNlBusy(true);
    AI.parse(value, state.settings).then(function (result) {
      setNlBusy(false);
      if (result) {
        renderPreview(result);
        toast('AI 解析完成，确认后入账');
      } else {
        renderPreview(Parser.parse(value, new Date()));
        toast('AI 解析未返回结果，已回退本地规则');
      }
    });
  }

  function setVoiceStatus(text) {
    var node = $('voiceStatus');
    node.hidden = !text;
    node.textContent = text || '';
  }

  function handleVoice() {
    if (!Voice || !Voice.isSupported()) {
      toast('当前浏览器不支持语音识别，建议使用 Chrome 或 Edge');
      return;
    }
    if (Voice.isListening()) {
      Voice.stop();
      return;
    }
    var failed = false;
    Voice.start({
      lang: 'zh-CN',
      onStart: function () {
        $('micBtn').classList.add('listening');
        setVoiceStatus('正在聆听，请说出账单，例如「午餐二十五」…');
      },
      onPartial: function (text) {
        if (text) $('nlInput').value = text;
      },
      onFinal: function (text) {
        if (text) $('nlInput').value = text;
      },
      onError: function (error) {
        failed = true;
        $('micBtn').classList.remove('listening');
        var messages = {
          'not-allowed': '麦克风权限被拒绝，请在浏览器允许麦克风后重试',
          'service-not-allowed': '麦克风权限被拒绝，请在浏览器允许麦克风后重试',
          'no-speech': '没有听到声音，请靠近麦克风再试一次',
          'audio-capture': '没有检测到麦克风设备',
          'network': '语音服务网络异常，请检查网络后重试',
          'unsupported': '当前浏览器不支持语音识别',
          'start-failed': '语音识别启动失败，请重试'
        };
        var message = messages[error] || '语音识别失败，请重试';
        setVoiceStatus(message);
        toast(message);
      },
      onEnd: function (text) {
        $('micBtn').classList.remove('listening');
        if (!failed) setVoiceStatus('');
        if (text) {
          $('nlInput').value = text;
          parseText(text);
        }
      }
    });
  }

  function openSettings() {
    var settings = state.settings;
    $('setAiEnabled').checked = !!settings.aiEnabled;
    $('setBaseUrl').value = settings.baseUrl || '';
    $('setApiKey').value = settings.apiKey || '';
    $('setModel').value = settings.model || '';
    var dialog = $('settingsDialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeSettings() {
    var dialog = $('settingsDialog');
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function requestAiAdvice() {
    if (!AI.isConfigured(state.settings)) {
      toast('请先在设置中开启 AI 增强并填写密钥');
      openSettings();
      return;
    }
    var button = $('aiAdviceBtn');
    button.disabled = true;
    button.textContent = '生成中…';
    var summary = Advisor.summarize(state.entries, new Date());
    AI.advise(summary, state.settings).then(function (text) {
      button.disabled = false;
      button.textContent = 'AI 点评';
      if (text) {
        aiAdviceCache = text;
        renderAdvice();
      } else {
        toast('AI 点评生成失败，已保留本地洞察');
      }
    });
  }

  function exportData() {
    var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'ledger-' + todayStr() + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    toast('已导出 JSON 备份');
  }

  function bindEvents() {
    $('nlForm').addEventListener('submit', function (event) {
      event.preventDefault();
      parseText($('nlInput').value);
    });

    $('nlChips').addEventListener('click', function (event) {
      var chip = event.target.closest('[data-text]');
      if (!chip) return;
      var text = chip.getAttribute('data-text');
      $('nlInput').value = text;
      parseText(text);
    });

    $('micBtn').addEventListener('click', handleVoice);

    $('typeSwitch').addEventListener('click', function (event) {
      var button = event.target.closest('button[data-type]');
      if (!button) return;
      manualType = button.getAttribute('data-type');
      Array.prototype.forEach.call(this.querySelectorAll('button'), function (item) {
        item.classList.toggle('active', item === button);
      });
      fillCategory($('mCategory'), manualType, '');
    });

    $('manualForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var amount = Number($('mAmount').value);
      if (!(amount > 0)) {
        toast('请输入大于 0 的金额');
        return;
      }
      var category = $('mCategory').value;
      var entry = Store.addEntry({
        type: manualType,
        amount: amount,
        category: category,
        date: $('mDate').value || todayStr(),
        note: ($('mNote').value || '').trim() || category,
        source: 'manual'
      });
      if (!entry) {
        toast('记账失败，请检查输入');
        return;
      }
      Store.persist();
      $('mAmount').value = '';
      $('mNote').value = '';
      aiAdviceCache = '';
      renderAll();
      toast('已添加一笔' + (entry.type === 'income' ? '收入' : '支出'));
    });

    $('entryList').addEventListener('click', function (event) {
      var button = event.target.closest('[data-delete]');
      if (!button) return;
      var id = button.getAttribute('data-delete');
      var target = state.entries.filter(function (item) {
        return item.id === id;
      })[0];
      if (!target) return;
      if (!window.confirm('删除「' + (target.note || target.category) + '」这条记录？')) return;
      Store.removeEntry(id);
      aiAdviceCache = '';
      renderAll();
      toast('已删除这条记录');
    });

    $('filterType').addEventListener('change', function () {
      filters.type = this.value;
      renderList();
    });

    $('filterMonth').addEventListener('change', function () {
      filters.month = this.value;
      renderList();
    });

    $('searchInput').addEventListener('input', function () {
      filters.keyword = this.value;
      renderList();
    });

    $('aiAdviceBtn').addEventListener('click', requestAiAdvice);
    $('openSettings').addEventListener('click', openSettings);
    $('closeSettings').addEventListener('click', closeSettings);
    $('cancelSettings').addEventListener('click', closeSettings);

    $('settingsForm').addEventListener('submit', function (event) {
      event.preventDefault();
      Store.saveSettings({
        aiEnabled: $('setAiEnabled').checked,
        baseUrl: $('setBaseUrl').value.trim() || Store.DEFAULT_SETTINGS.baseUrl,
        apiKey: $('setApiKey').value.trim(),
        model: $('setModel').value.trim() || Store.DEFAULT_SETTINGS.model
      });
      closeSettings();
      renderAiBadge();
      renderAdvice();
      toast(AI.isConfigured(state.settings) ? 'AI 增强已开启' : '设置已保存，当前使用本地解析');
    });

    $('exportBtn').addEventListener('click', exportData);

    $('importBtn').addEventListener('click', function () {
      $('importFile').click();
    });

    $('importFile').addEventListener('change', function () {
      var input = this;
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var result = Store.importJSON(String(reader.result || ''));
        toast(result.message);
        if (result.ok) {
          aiAdviceCache = '';
          renderAll();
        }
        input.value = '';
      };
      reader.onerror = function () {
        toast('文件读取失败，请重试');
        input.value = '';
      };
      reader.readAsText(file);
    });

    $('clearBtn').addEventListener('click', function () {
      if (!window.confirm('确定清空全部账单？此操作不可撤销，建议先导出备份。')) return;
      Store.clearAll();
      aiAdviceCache = '';
      closePreview();
      renderAll();
      toast('已清空全部账单');
    });

    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderCharts, 180);
    });
  }

  function init() {
    $('mDate').value = todayStr();
    fillCategory($('mCategory'), manualType, '');
    bindEvents();
    renderAll();
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  init();
  registerServiceWorker();
})();