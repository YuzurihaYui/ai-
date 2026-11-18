(function () {
  'use strict';

  var EXPENSE_CATEGORIES = {
    '餐饮': ['早餐', '午餐', '晚餐', '夜宵', '外卖', '咖啡', '奶茶', '火锅', '烧烤', '快餐', '食堂', '麦当劳', '肯德基', '星巴克', '瑞幸', '零食', '水果', '饮料', '聚餐', '吃饭', '餐费'],
    '交通': ['打车', '滴滴', '出租车', '地铁', '公交', '高铁', '火车', '机票', '飞机', '加油', '停车', '过路费', '共享单车', '单车', '车费', '船票'],
    '购物': ['淘宝', '京东', '拼多多', '超市', '衣服', '裤', '鞋', '化妆品', '护肤', '数码', '手机', '耳机', '日用品', '网购', '商场', '快递'],
    '居住': ['房租', '租金', '水费', '电费', '燃气', '物业', '宽带', '维修', '家具', '装修', '房贷'],
    '娱乐': ['电影', '游戏', 'KTV', '旅游', '门票', '演唱会', '健身', '会员', '桌游', '密室', '剧本杀', '酒吧'],
    '医疗': ['医院', '挂号', '体检', '门诊', '药', '牙医', '看病', '医保'],
    '教育': ['课程', '学费', '培训', '考试', '网课', '文具', '资料', '书本', '书'],
    '通讯': ['话费', '流量', '手机费', '充话费'],
    '人情': ['礼物', '份子', '送礼', '请客', '捐赠', '发红包'],
    '其他': []
  };

  var INCOME_CATEGORIES = {
    '工资': ['工资', '薪水', '月薪', '发薪'],
    '奖金': ['奖金', '年终奖', '提成', '绩效'],
    '红包': ['红包', '压岁钱'],
    '报销': ['报销'],
    '退款': ['退款', '退货'],
    '理财': ['利息', '分红', '收益', '理财'],
    '兼职': ['兼职', '稿费', '外快', '副业'],
    '其他': []
  };

  var INCOME_HINTS = ['工资', '薪水', '月薪', '发薪', '奖金', '年终奖', '提成', '绩效', '收到', '收入', '赚了', '赚到', '进账', '到账', '报销', '退款', '利息', '分红', '收益', '兼职', '稿费', '外快', '补贴', '中奖', '还款', '压岁钱'];
  var EXPENSE_HINTS = ['花了', '花掉', '消费', '支付', '付款', '支出', '买了', '请客', '缴纳', '交了'];

  var DIGITS = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  var UNITS = { '十': 10, '百': 100, '千': 1000 };

  function cnToNumber(input) {
    if (input === null || input === undefined) return null;
    var s = String(input).replace(/\s+/g, '');
    if (!s) return null;
    if (s.indexOf('点') > -1) {
      var parts = s.split('点');
      var intVal = cnToNumber(parts[0]) || 0;
      var dec = '';
      var decChars = parts[1] || '';
      for (var i = 0; i < decChars.length; i++) {
        var d = DIGITS[decChars[i]];
        if (d === undefined) break;
        dec += String(d);
      }
      return Number(String(intVal) + '.' + (dec || '0'));
    }
    var total = 0;
    var section = 0;
    var num = 0;
    var lastUnit = 0;
    var sawUnit = false;
    for (var j = 0; j < s.length; j++) {
      var ch = s[j];
      if (DIGITS[ch] !== undefined) {
        num = DIGITS[ch];
      } else if (UNITS[ch]) {
        var u = UNITS[ch];
        section += (num || 1) * u;
        num = 0;
        lastUnit = u;
        sawUnit = true;
      } else if (ch === '万') {
        section = (section + num) * 10000;
        total += section;
        section = 0;
        num = 0;
        lastUnit = 10000;
        sawUnit = true;
      } else {
        return null;
      }
    }
    if (num > 0 && lastUnit >= 100) {
      var prev = s.slice(-2, -1);
      if (UNITS[prev] || prev === '万') num = num * (lastUnit / 10);
    }
    var result = total + section + num;
    return isNaN(result) ? null : result;
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function fmtDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function shiftDays(base, days) {
    var d = new Date(base.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  function parseDate(text, now) {
    var today = new Date(now || Date.now());
    today.setHours(0, 0, 0, 0);
    var m;
    if (/大前天/.test(text)) return fmtDate(shiftDays(today, -3));
    if (/前天/.test(text)) return fmtDate(shiftDays(today, -2));
    if (/昨天|昨日/.test(text)) return fmtDate(shiftDays(today, -1));
    if (/今天|今日|刚刚/.test(text)) return fmtDate(today);

    m = text.match(/(\d+)\s*天前/);
    if (m) return fmtDate(shiftDays(today, -parseInt(m[1], 10)));

    m = text.match(/(\d{4})\s*[-\/年]\s*(\d{1,2})\s*[-\/月]\s*(\d{1,2})\s*[日号]?/);
    if (m) {
      var y = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10) - 1;
      var da = parseInt(m[3], 10);
      var full = new Date(y, mo, da);
      if (!isNaN(full.getTime())) return fmtDate(full);
    }

    m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
    if (m) {
      var mm = parseInt(m[1], 10) - 1;
      var dd = parseInt(m[2], 10);
      var target = new Date(today.getFullYear(), mm, dd);
      if (target.getTime() - today.getTime() > 86400000) {
        target = new Date(today.getFullYear() - 1, mm, dd);
      }
      return fmtDate(target);
    }

    m = text.match(/(\d{1,2})\s*[日号](?!\d)/);
    if (m) {
      var day = parseInt(m[1], 10);
      var cur = new Date(today.getFullYear(), today.getMonth(), day);
      if (cur.getTime() - today.getTime() > 86400000) {
        cur = new Date(today.getFullYear(), today.getMonth() - 1, day);
      }
      return fmtDate(cur);
    }

    var weekMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
    m = text.match(/上周([一二三四五六日天])/);
    if (m) {
      var lw = weekMap[m[1]];
      var base = new Date(today.getTime());
      var curDow = base.getDay();
      var diff = lw - curDow;
      base = shiftDays(base, diff - 7);
      return fmtDate(base);
    }
    m = text.match(/(?:周|星期)([一二三四五六日天])/);
    if (m) {
      var w = weekMap[m[1]];
      var d2 = new Date(today.getTime());
      var diff2 = w - d2.getDay();
      if (diff2 >= 0) diff2 -= 7;
      d2 = shiftDays(d2, diff2);
      return fmtDate(d2);
    }
    return fmtDate(today);
  }

  function findAmount(text) {
    var masked = text;
    masked = masked.replace(/\d{4}\s*[-\/年]\s*\d{1,2}\s*[-\/月]\s*\d{1,2}\s*[日号]?/g, function (m) { return new Array(m.length + 1).join(' '); });
    masked = masked.replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]?/g, function (m) { return new Array(m.length + 1).join(' '); });
    masked = masked.replace(/\d+\s*天前/g, function (m) { return new Array(m.length + 1).join(' '); });
    masked = masked.replace(/\d{1,2}\s*[日号](?!\d)/g, function (m) { return new Array(m.length + 1).join(' '); });
    masked = masked.replace(/(?:周|星期)[一二三四五六日天]/g, function (m) { return new Array(m.length + 1).join(' '); });

    var candidates = [];
    var re = /(\d+(?:\.\d{1,2})?)/g;
    var m;
    while ((m = re.exec(masked)) !== null) {
      var before = masked.slice(Math.max(0, m.index - 4), m.index);
      var after = masked.slice(m.index + m[0].length, m.index + m[0].length + 4);
      var score = 0;
      if (/[¥￥]/.test(before) || /^\s*(元|块|块钱|rmb)/i.test(after)) score += 6;
      if (/(花|付|收|赚|到账|工资|买|消费|支付|充|退|报销|给)/.test(before)) score += 3;
      if (/^\s*(杯|个|件|次|天|人|瓶|份|张|只|斤|克|公里|km|小时)/.test(after)) score -= 4;
      if (m.index === 0) score += 1;
      candidates.push({ value: parseFloat(m[0]), score: score, index: m.index });
    }

    var cnRe = /([零一二两三四五六七八九十百千万点]{1,8})\s*(?:元|块钱|块)/g;
    while ((m = cnRe.exec(masked)) !== null) {
      var cv = cnToNumber(m[1]);
      if (cv !== null && cv > 0) {
        candidates.push({ value: cv, score: 7, index: m.index });
      }
    }

    var verbRe = /(?:花了|花掉|付了|收到|赚了|收入|消费了?|用了|充了)\s*([零一二两三四五六七八九十百千万点]{1,8})/g;
    while ((m = verbRe.exec(masked)) !== null) {
      var vv = cnToNumber(m[1]);
      if (vv !== null && vv > 0) {
        candidates.push({ value: vv, score: 5, index: m.index + m[0].length });
      }
    }

    var tailRe = /([零一二两三四五六七八九十百千万]{2,6})(?=\s*$|[，。,.!！?？])/g;
    while ((m = tailRe.exec(masked)) !== null) {
      var tailVal = cnToNumber(m[1]);
      if (tailVal !== null && tailVal > 0) {
        candidates.push({ value: tailVal, score: 4, index: m.index });
      }
    }

    var ctxRe = /(?:吃|喝|买|花|付|打|充|收|赚|餐|饭|咖啡|奶茶|打车|加油|房租|水电|工资)\s*([零一二两三四五六七八九十百千万]{1,6})/g;
    while ((m = ctxRe.exec(masked)) !== null) {
      var nextChar = masked.charAt(m.index + m[0].length);
      if (/[杯个件次天瓶份张只斤两]/.test(nextChar)) continue;
      var ctxVal = cnToNumber(m[1]);
      if (ctxVal !== null && ctxVal > 0) {
        candidates.push({ value: ctxVal, score: 3, index: m.index + m[0].length });
      }
    }

    if (!candidates.length) return null;
    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return b.index - a.index;
    });
    var best = candidates[0];
    if (!isFinite(best.value) || best.value <= 0) return null;
    return Math.round(best.value * 100) / 100;
  }

  function detectType(text) {
    if (/(发|给|送|包)\s*(个|一个)?\s*(红包|礼)/.test(text)) return 'expense';
    if (/(请客|送礼)/.test(text)) return 'expense';
    for (var i = 0; i < INCOME_HINTS.length; i++) {
      if (text.indexOf(INCOME_HINTS[i]) > -1) return 'income';
    }
    return 'expense';
  }

  function detectCategory(text, type) {
    var dict = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    var best = { category: '', length: 0, index: Infinity };
    for (var cat in dict) {
      var words = dict[cat];
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        var idx = text.indexOf(w);
        if (idx > -1) {
          if (w.length > best.length || (w.length === best.length && idx < best.index)) {
            best = { category: cat, length: w.length, index: idx };
          }
        }
      }
    }
    if (!best.category) return '其他';
    return best.category;
  }

  function extractNote(text, category, type) {
    var s = text;
    s = s.replace(/\d{4}\s*[-\/年]\s*\d{1,2}\s*[-\/月]\s*\d{1,2}\s*[日号]?/g, ' ');
    s = s.replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]?/g, ' ');
    s = s.replace(/\d+\s*天前/g, ' ');
    s = s.replace(/\d{1,2}\s*[日号](?!\d)/g, ' ');
    s = s.replace(/(今天|今日|昨天|昨日|前天|大前天|刚刚|上周[一二三四五六日天]|(?:周|星期)[一二三四五六日天])/g, ' ');
    s = s.replace(/[¥￥]\s*\d+(?:\.\d+)?/g, ' ');
    s = s.replace(/\d+(?:\.\d{1,2})?\s*(?:元|块钱|块|rmb)/gi, ' ');
    s = s.replace(/[¥￥]?\s*\d+(?:\.\d{1,2})?(?=\s*$)/g, ' ');
    s = s.replace(/[零一二两三四五六七八九十百千万点]{1,8}\s*(?:元|块钱|块)/g, ' ');
    s = s.replace(/(花了|花掉|消费了?|支付了?|付款|支出了?|买了|收入|收到|到账|赚了|报销了?|退款了?|发了|请客|充了?)/g, ' ');
    s = s.replace(/[，。,.!！?？、:：;；]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) return category || (type === 'income' ? '收入' : '支出');
    return s.slice(0, 20);
  }

  function parse(text, now) {
    var raw = String(text || '').trim();
    if (!raw) {
      return { ok: false, reason: 'empty', raw: raw, amount: null, type: 'expense', category: '其他', note: '', date: fmtDate(new Date()), confidence: 0, source: 'local' };
    }
    var type = detectType(raw);
    var amount = findAmount(raw);
    var category = detectCategory(raw, type);
    var note = extractNote(raw, category, type);
    var date = parseDate(raw, now);
    var hasUnit = /[¥￥]|\d\s*(?:元|块|块钱|rmb)/i.test(raw) || /[零一二两三四五六七八九十百千万点]\s*(?:元|块|块钱)/.test(raw);
    var confidence = amount ? (hasUnit || category !== '其他' ? 0.92 : 0.78) : 0.25;
    return {
      ok: !!amount,
      reason: amount ? '' : 'amount',
      raw: raw,
      type: type,
      amount: amount,
      category: category,
      note: note,
      date: date,
      confidence: confidence,
      source: 'local'
    };
  }

  var api = {
    parse: parse,
    cnToNumber: cnToNumber,
    parseDate: parseDate,
    findAmount: findAmount,
    detectType: detectType,
    detectCategory: detectCategory,
    EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
    INCOME_CATEGORIES: INCOME_CATEGORIES,
    INCOME_LIST: Object.keys(INCOME_CATEGORIES),
    EXPENSE_LIST: Object.keys(EXPENSE_CATEGORIES)
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LedgerParser = api;
})();