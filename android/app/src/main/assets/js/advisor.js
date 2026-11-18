(function () {
  'use strict';

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function money(n) {
    return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(n) { return Math.round(n * 1000) / 10; }

  function summarize(entries, now) {
    var today = now ? new Date(now) : new Date();
    var curKey = monthKey(today);
    var prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);
    var prevKey = monthKey(prevDate);
    var cur = { income: 0, expense: 0, count: 0, byCat: {}, entries: [] };
    var prev = { income: 0, expense: 0, count: 0 };
    var maxEntry = null;
    var catCounts = {};

    (entries || []).forEach(function (e) {
      var key = String(e.date).slice(0, 7);
      if (key === curKey) {
        cur.count += 1;
        cur.entries.push(e);
        if (e.type === 'income') cur.income += e.amount;
        else {
          cur.expense += e.amount;
          cur.byCat[e.category] = (cur.byCat[e.category] || 0) + e.amount;
          catCounts[e.category] = (catCounts[e.category] || 0) + 1;
        }
        if (e.type === 'expense' && (!maxEntry || e.amount > maxEntry.amount)) maxEntry = e;
      } else if (key === prevKey) {
        prev.count += 1;
        if (e.type === 'income') prev.income += e.amount;
        else prev.expense += e.amount;
      }
    });

    cur.income = round2(cur.income);
    cur.expense = round2(cur.expense);
    prev.expense = round2(prev.expense);

    var topCat = null;
    var topAmount = 0;
    Object.keys(cur.byCat).forEach(function (cat) {
      if (cur.byCat[cat] > topAmount) {
        topAmount = cur.byCat[cat];
        topCat = cat;
      }
    });

    return {
      curKey: curKey,
      prevKey: prevKey,
      income: cur.income,
      expense: cur.expense,
      balance: round2(cur.income - cur.expense),
      count: cur.count,
      prevExpense: prev.expense,
      byCat: cur.byCat,
      catCounts: catCounts,
      topCat: topCat,
      topAmount: round2(topAmount),
      topShare: cur.expense > 0 ? topAmount / cur.expense : 0,
      maxEntry: maxEntry,
      savingsRate: cur.income > 0 ? (cur.income - cur.expense) / cur.income : null
    };
  }

  function insights(entries, now) {
    var s = summarize(entries, now);
    var out = [];

    if (!s.count) {
      return [{
        level: 'info',
        title: '本月还没有记录',
        text: '试试在上方输入「午餐 25」或「昨天打车花了 38 块」，一句话就能完成记账。'
      }];
    }

    if (s.prevExpense > 0) {
      var delta = (s.expense - s.prevExpense) / s.prevExpense;
      if (delta > 0.2) {
        out.push({
          level: 'warn',
          title: '支出环比上涨 ' + pct(delta) + '%',
          text: '本月已支出 ' + money(s.expense) + '，上月同期为 ' + money(s.prevExpense) + '。建议查看占比最高的分类，控制非必要开销。'
        });
      } else if (delta < -0.1) {
        out.push({
          level: 'good',
          title: '支出比上月减少 ' + pct(Math.abs(delta)) + '%',
          text: '本月支出 ' + money(s.expense) + '，比上月同期更省，保持这个节奏。'
        });
      }
    }

    if (s.topCat && s.topShare >= 0.4 && s.expense > 0) {
      out.push({
        level: s.topShare >= 0.55 ? 'warn' : 'info',
        title: (s.topCat === '餐饮' || s.topCat === '购物' ? '「' + s.topCat + '」是本月最大开销' : s.topCat + '支出占比偏高'),
        text: '「' + s.topCat + '」共 ' + money(s.topAmount) + '，占本月支出的 ' + pct(s.topShare) + '%。' +
          (s.topCat === '餐饮' ? '可以尝试把每周外卖次数控制在 3 次以内。' : '先确认这笔开销是否值得，再决定是否继续。')
      });
    }

    if (s.maxEntry && s.maxEntry.type === 'expense' && s.maxEntry.amount >= Math.max(200, s.expense * 0.25)) {
      out.push({
        level: 'info',
        title: '单笔大额：' + money(s.maxEntry.amount),
        text: '「' + (s.maxEntry.note || s.maxEntry.category) + '」占本月支出的 ' + pct(s.maxEntry.amount / s.expense) + '%。大额消费建议单独设预算上限。'
      });
    }

    if (s.savingsRate !== null) {
      if (s.savingsRate < 0) {
        out.push({
          level: 'warn',
          title: '本月收不抵支',
          text: '支出比收入多 ' + money(Math.abs(s.balance)) + '。建议先砍掉占比最高的非刚需分类，再安排后续消费。'
        });
      } else if (s.savingsRate < 0.2) {
        out.push({
          level: 'warn',
          title: '储蓄率仅 ' + pct(s.savingsRate) + '%',
          text: '收入 ' + money(s.income) + '，结余 ' + money(s.balance) + '。建议把结余率提到 20% 以上，例如每月先存下收入的 1/5。'
        });
      } else if (s.savingsRate >= 0.5) {
        out.push({
          level: 'good',
          title: '储蓄率 ' + pct(s.savingsRate) + '%，表现优秀',
          text: '本月结余 ' + money(s.balance) + '。可以考虑把结余的一部分转入定期或指数基金。'
        });
      }
    } else if (s.expense > 0) {
      out.push({
        level: 'info',
        title: '本月只有支出记录',
        text: '已支出 ' + money(s.expense) + '。补充一笔收入记录，才能算出真实的结余和储蓄率。'
      });
    }

    if ((s.catCounts['餐饮'] || 0) >= 8) {
      out.push({
        level: 'info',
        title: '本月餐饮记录 ' + s.catCounts['餐饮'] + ' 笔',
        text: '高频小额餐饮容易累积成大头，按笔均 ' + money(s.byCat['餐饮'] / s.catCounts['餐饮']) + ' 估算，减少 2 次就能省下一笔。'
      });
    }

    if (!out.length) {
      out.push({
        level: 'good',
        title: '本月收支平稳',
        text: '已记录 ' + s.count + ' 笔，支出 ' + money(s.expense) + '，暂无明显风险点。继续保持每日记账习惯。'
      });
    }

    return out.slice(0, 4);
  }

  function toPrompt(summary) {
    return [
      '本月支出 ' + summary.expense + ' 元，收入 ' + summary.income + ' 元，结余 ' + summary.balance + ' 元，共 ' + summary.count + ' 笔。',
      '最大支出分类：' + (summary.topCat || '无') + '，金额 ' + summary.topAmount + ' 元，占比 ' + pct(summary.topShare) + '%。',
      '上月支出 ' + summary.prevExpense + ' 元。',
      '请给出 80 字以内、具体可执行的中文消费建议，不要使用列表符号。'
    ].join('');
  }

  var api = { summarize: summarize, insights: insights, toPrompt: toPrompt, money: money };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LedgerAdvisor = api;
})();