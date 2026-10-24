/*
 * site.js - the fictional customer's website code, plus the demo controls.
 *
 * The website itself only does what a real customer's site would do:
 *   - loads a tag manager, and
 *   - pushes an "application_submitted" event with a confirmation number.
 * Everything about partners and bots lives in the tags, not in the site.
 */
(function () {
  var cfg = window.DEMO_CONFIG;
  var page = document.body.dataset.page;
  var params = new URLSearchParams(location.search);
  window.dataLayer = window.dataLayer || [];

  // ---- tag deployment ----------------------------------------------------

  var useGtm = /^GTM-[A-Z0-9]+$/.test(cfg.gtmId);
  if (useGtm) {
    // Standard Google Tag Manager snippet.
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var gtm = document.createElement('script');
    gtm.async = true;
    gtm.src = 'https://www.googletagmanager.com/gtm.js?id=' + cfg.gtmId;
    document.head.appendChild(gtm);
  } else {
    // Direct mode: the same two calls the GTM tags make (see README.md).
    window.plxq = window.plxq || [];
    window.plxq.push(['attribution', { param: 'plclid', days: 30 }]);
    var lib = document.createElement('script');
    lib.async = true;
    lib.src = 'assets/plx.js';
    document.head.appendChild(lib);

    var originalPush = window.dataLayer.push;
    window.dataLayer.push = function (entry) {
      if (entry && entry.event === 'application_submitted') {
        window.plxq.push(['conversion', { orderId: entry.confirmation_id, productId: entry.product_id }]);
      }
      return originalPush.apply(window.dataLayer, arguments);
    };
  }

  // ---- page behaviour ----------------------------------------------------

  var SAMPLE_APPLICANT = { full_name: 'Alex Sample', email: 'alex.sample@example.com', account_type: 'tfsa' };

  function fillForm(form, includeTrap) {
    Object.keys(SAMPLE_APPLICANT).forEach(function (name) {
      form.elements[name].value = SAMPLE_APPLICANT[name];
    });
    // A script fills every input it finds, including the one people cannot see.
    if (includeTrap) form.elements.company_website.value = 'https://example.com';
  }

  if (page === 'landing' && params.get('autopilot')) {
    setTimeout(function () { location.href = 'apply.html?autopilot=1'; }, 1200);
  }

  if (page === 'apply') {
    var form = document.getElementById('application');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var confirmation = 'NF-' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
      sessionStorage.setItem('nf_confirmation', confirmation);
      location.href = 'thank-you.html';
    });
    if (params.get('autopilot')) {
      setTimeout(function () { fillForm(form, true); form.requestSubmit(); }, 1500);
    }
  }

  if (page === 'thank-you') {
    var confirmationId = sessionStorage.getItem('nf_confirmation');
    var target = document.getElementById('confirmation');
    if (confirmationId) {
      target.textContent = confirmationId;
      window.addEventListener('plx:conversion', function (e) { showInspector(e.detail); });
      window.dataLayer.push({
        event: 'application_submitted',
        confirmation_id: confirmationId,
        product_id: cfg.productId
      });
    } else {
      target.textContent = 'none (no application in progress)';
    }
  }

  // ---- demo controls (not part of the fictional website) -------------------

  function trackingLink(partnerId, autopilot) {
    var clickId = 'c' + Math.random().toString(36).slice(2, 12);
    return 'index.html?utm_medium=affiliate&utm_source=' + partnerId + '&plclid=' + clickId +
      (autopilot ? '&autopilot=1' : '');
  }

  var bar = document.createElement('aside');
  bar.className = 'demo-bar';
  bar.innerHTML =
    '<div class="demo-bar-head">' +
      '<strong>Demo controls</strong>' +
      '<span class="demo-mode">Tags via ' + (useGtm ? 'Google Tag Manager (' + cfg.gtmId + ')' : 'direct calls (no container set)') + '</span>' +
    '</div>' +
    '<div class="demo-actions">' +
      '<button data-act="human">Arrive from partner RateCompass</button>' +
      '<button data-act="human2">Arrive from partner DealDrifter</button>' +
      '<button data-act="bot">Run automated visitor from DealDrifter</button>' +
      (page === 'apply' ? '<button data-act="autofill">Autofill form</button>' : '') +
      '<a href="ledger.html" target="plx-ledger">Open PartnerLedger</a>' +
    '</div>' +
    '<pre id="inspector" hidden></pre>';
  document.body.appendChild(bar);

  // Cookies and shared storage do not work when the pages are opened as files.
  if (location.protocol === 'file:') {
    var warning = document.createElement('div');
    warning.className = 'demo-warning';
    warning.textContent = 'Opened as a file, so tracking will not work. Use http://localhost:8765 instead.';
    bar.insertBefore(warning, bar.firstChild);
  }

  bar.addEventListener('click', function (e) {
    var act = e.target.dataset.act;
    if (act === 'human') location.href = trackingLink('RC-1001');
    if (act === 'human2') location.href = trackingLink('DD-2002');
    if (act === 'bot') location.href = trackingLink('DD-2002', true);
    if (act === 'autofill') fillForm(document.getElementById('application'), false);
  });

  function showInspector(outcome) {
    var el = document.getElementById('inspector');
    el.hidden = false;
    el.textContent = 'Sent to PartnerLedger (a real visitor never sees this):\n' +
      JSON.stringify(outcome, null, 2);
  }
})();
