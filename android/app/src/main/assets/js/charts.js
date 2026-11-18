(function () {
  'use strict';

  var FONT = '12px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

  function setup(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    return { ctx: ctx, w: rect.width, h: rect.height };
  }

  function emptyState(ctx, w, h) {
    ctx.font = FONT;
    ctx.fillStyle = '#9aada6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂无数据', w / 2, h / 2);
  }

  function donut(canvas, items, opts) {
    var stage = setup(canvas);
    if (!stage) return;
    var ctx = stage.ctx;
    var w = stage.w;
    var h = stage.h;
    opts = opts || {};

    var data = (items || []).filter(function (item) { return item.value > 0; });
    var total = data.reduce(function (sum, item) { return sum + item.value; }, 0);
    var cx = w / 2;
    var cy = h / 2;
    var radius = Math.min(w, h) / 2 - 12;
    var thickness = Math.max(14, radius * 0.32);

    if (!total) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius - thickness / 2, 0, Math.PI * 2);
      ctx.lineWidth = thickness;
      ctx.strokeStyle = '#edf3f1';
      ctx.stroke();
      ctx.fillStyle = '#9aada6';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无支出', cx, cy);
      return;
    }

    var angle = -Math.PI / 2;
    var gap = data.length > 1 ? 0.035 : 0;
    data.forEach(function (item) {
      var sweep = (item.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - thickness / 2, angle + gap / 2, angle + sweep - gap / 2);
      ctx.lineWidth = thickness;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = item.color || '#2ec4a6';
      ctx.stroke();
      angle += sweep;
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#7d938c';
    ctx.fillText(opts.centerTop || '本月支出', cx, cy - 14);
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillStyle = '#16302a';
    ctx.fillText(opts.centerBottom || '', cx, cy + 10);
  }

  function niceMax(value) {
    if (!value) return 100;
    var magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    var normalized = value / magnitude;
    var step = normalized <= 1.2 ? 1.2 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    return step * magnitude;
  }

  function shortMoney(n) {
    if (n >= 10000) return (Math.round(n / 1000) / 10) + '万';
    if (n >= 1000) return (Math.round(n / 100) / 10) + 'k';
    return String(Math.round(n));
  }

  function bars(canvas, items) {
    var stage = setup(canvas);
    if (!stage) return;
    var ctx = stage.ctx;
    var w = stage.w;
    var h = stage.h;

    var data = items || [];
    if (!data.length) {
      emptyState(ctx, w, h);
      return;
    }

    var padLeft = 42;
    var padRight = 8;
    var padTop = 16;
    var padBottom = 26;
    var plotW = w - padLeft - padRight;
    var plotH = h - padTop - padBottom;
    if (plotW <= 10 || plotH <= 10) return;

    var maxValue = 0;
    var hasValue = false;
    data.forEach(function (item) {
      maxValue = Math.max(maxValue, item.income || 0, item.expense || 0);
      if ((item.income || 0) > 0 || (item.expense || 0) > 0) hasValue = true;
    });
    if (!hasValue) {
      emptyState(ctx, w, h);
      return;
    }
    var top = niceMax(maxValue || 1);

    ctx.font = FONT;
    ctx.strokeStyle = '#eef4f2';
    ctx.fillStyle = '#9aada6';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var i = 0; i <= 3; i++) {
      var y = padTop + (plotH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
      ctx.fillText(shortMoney(top * (1 - i / 3)), padLeft - 8, y);
    }

    var slotW = plotW / data.length;
    var barW = Math.max(5, Math.min(18, slotW * 0.26));
    var gap = 4;

    data.forEach(function (item, index) {
      var center = padLeft + slotW * index + slotW / 2;
      var incomeH = ((item.income || 0) / top) * plotH;
      var expenseH = ((item.expense || 0) / top) * plotH;
      var baseY = padTop + plotH;

      ctx.fillStyle = '#2ec4a6';
      ctx.beginPath();
      roundRect(ctx, center - barW - gap / 2, baseY - incomeH, barW, incomeH, 4);
      ctx.fill();

      ctx.fillStyle = '#f4a261';
      ctx.beginPath();
      roundRect(ctx, center + gap / 2, baseY - expenseH, barW, expenseH, 4);
      ctx.fill();

      ctx.fillStyle = '#7d938c';
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(item.label || '', center, baseY + 8);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, Math.max(h, 0) / 2);
    if (h <= 0) return;
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  var api = { donut: donut, bars: bars, setup: setup };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LedgerCharts = api;
})();