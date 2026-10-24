/*
 * ledger.js - mock of the second application: a partner payout platform.
 * It reads the conversions the pixel "sent" (localStorage in this demo) and
 * turns each verdict into a payout decision.
 */
(function () {
  var KEY = 'partnerledger_conversions';
  var COMMISSION = window.DEMO_CONFIG.commission;
  var PARTNERS = { 'RC-1001': 'RateCompass', 'DD-2002': 'DealDrifter' };

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function save(rows) { localStorage.setItem(KEY, JSON.stringify(rows)); }

  // The payout rule: pay humans, hold anything uncertain for a person to
  // review, exclude confident bots. A reviewer's decision overrides the verdict.
  function status(row) {
    if (row.review === 'released') return 'payable';
    if (row.review === 'excluded') return 'excluded';
    return { human: 'payable', suspicious: 'held', bot: 'excluded' }[row.verdict];
  }

  var STATUS_LABEL = { payable: 'Payable', held: 'Held for review', excluded: 'Excluded' };
  function money(n) { return '$' + n.toLocaleString('en-CA'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render() {
    var rows = load();
    var counts = { payable: 0, held: 0, excluded: 0 };
    var byPartner = {};
    rows.forEach(function (r) {
      var s = status(r);
      counts[s]++;
      var p = byPartner[r.partnerId] = byPartner[r.partnerId] || { payable: 0, held: 0, excluded: 0 };
      p[s]++;
    });

    ['payable', 'held', 'excluded'].forEach(function (s) {
      document.getElementById(s + '-value').textContent = money(counts[s] * COMMISSION);
      document.getElementById(s + '-count').textContent = counts[s] + ' conversion' + (counts[s] === 1 ? '' : 's');
    });

    var partnerIds = Object.keys(byPartner).sort();
    document.getElementById('partners').innerHTML = partnerIds.length === 0
      ? '<tr><td class="empty">No conversions received yet.</td></tr>'
      : '<tr><th>Partner</th><th class="num">Payable</th><th class="num">Held</th><th class="num">Excluded</th><th class="num">Share flagged</th><th class="num">Commission payable</th></tr>' +
        partnerIds.map(function (id) {
          var p = byPartner[id];
          var total = p.payable + p.held + p.excluded;
          return '<tr><td>' + esc(PARTNERS[id] || id) + ' <code>' + esc(id) + '</code></td>' +
            '<td class="num">' + p.payable + '</td><td class="num">' + p.held + '</td><td class="num">' + p.excluded + '</td>' +
            '<td class="num">' + Math.round((p.held + p.excluded) / total * 100) + '%</td>' +
            '<td class="num">' + money(p.payable * COMMISSION) + '</td></tr>';
        }).join('');

    var newestFirst = rows.slice().sort(function (a, b) { return a.receivedAt < b.receivedAt ? 1 : -1; });
    document.getElementById('conversions').innerHTML = rows.length === 0
      ? '<tr><td class="empty">No conversions received yet. Submit an application on the Northfold site.</td></tr>'
      : '<tr><th>Received</th><th>Order ID</th><th>Partner</th><th>Click ID</th><th>Verdict</th><th>Payout status</th><th></th></tr>' +
        newestFirst.map(function (r) {
          var s = status(r);
          var signals = r.signals.map(function (x) { return esc(x.name) + ' (' + esc(x.evidence) + ')'; }).join('<br>');
          var actions = s === 'held'
            ? '<button data-order="' + esc(r.orderId) + '" data-review="released">Release</button> ' +
              '<button data-order="' + esc(r.orderId) + '" data-review="excluded">Exclude</button>'
            : '';
          return '<tr>' +
            '<td>' + new Date(r.receivedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) + '</td>' +
            '<td><code>' + esc(r.orderId) + '</code></td>' +
            '<td>' + esc(PARTNERS[r.partnerId] || r.partnerId) + '</td>' +
            '<td><code>' + esc(r.clickId) + '</code></td>' +
            '<td><span class="chip ' + esc(r.verdict) + '">' + esc(r.verdict) + '</span> ' + r.score.toFixed(2) +
              '<div class="signals">' + (signals || 'no signals fired') + '</div></td>' +
            '<td>' + STATUS_LABEL[s] + (r.review ? ' (reviewed)' : '') + '</td>' +
            '<td>' + actions + '</td></tr>';
        }).join('');
  }

  // Fictional history so the per-partner pattern is visible before the live runs.
  function seed() {
    var rows = load().filter(function (r) { return !r.sample; });
    var botSignals = [
      { name: 'trap_field_filled', weight: 0.8, evidence: 'hidden field contained a value' },
      { name: 'no_interaction', weight: 0.5, evidence: '0 pointer events, 0 key events' },
      { name: 'fast_submit', weight: 0.4, evidence: 'submitted 1.4s after page load' }
    ];
    var autofillSignals = [{ name: 'no_typing', weight: 0.3, evidence: '2 pointer events, 0 key events' }];
    var plan = [
      ['RC-1001', 'human', 9], ['RC-1001', 'suspicious', 1],
      ['DD-2002', 'human', 3], ['DD-2002', 'suspicious', 1], ['DD-2002', 'bot', 7]
    ];
    var n = 0;
    plan.forEach(function (item) {
      for (var i = 0; i < item[2]; i++) {
        n++;
        rows.push({
          sample: true,
          orderId: 'NF-SAMPLE' + String(n).padStart(3, '0'),
          productId: window.DEMO_CONFIG.productId,
          clickId: 'csample' + String(n).padStart(3, '0'),
          partnerId: item[0],
          receivedAt: new Date(Date.now() - n * 26 * 3600 * 1000).toISOString(),
          verdict: item[1],
          score: item[1] === 'bot' ? 0.94 : item[1] === 'suspicious' ? 0.3 : 0,
          signals: item[1] === 'bot' ? botSignals : item[1] === 'suspicious' ? autofillSignals : []
        });
      }
    });
    save(rows);
    render();
  }

  document.getElementById('seed').addEventListener('click', seed);
  document.getElementById('reset').addEventListener('click', function () { save([]); render(); });
  document.getElementById('conversions').addEventListener('click', function (e) {
    var order = e.target.dataset.order;
    if (!order) return;
    var rows = load();
    rows.forEach(function (r) { if (r.orderId === order) r.review = e.target.dataset.review; });
    save(rows);
    render();
  });
  // Update live when a conversion arrives from the Northfold tab.
  window.addEventListener('storage', function (e) { if (e.key === KEY) render(); });

  render();
})();
