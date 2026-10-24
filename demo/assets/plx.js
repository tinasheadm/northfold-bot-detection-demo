/*
 * plx.js - a generic partner-tracking pixel written for this demo.
 *
 * It does three things:
 *   1. attribution: reads the click ID from the landing URL and stores it in a
 *      first-party cookie.
 *   2. observation: watches how the application form is filled in.
 *   3. conversion:  when the application is submitted, attaches a traffic
 *      verdict (human / suspicious / bot) and sends the conversion to the
 *      partner payout platform.
 *
 * Commands are queued the same way most analytics tags work, so it does not
 * matter whether the tag or the library loads first:
 *   plxq.push(['attribution', { param: 'plclid', days: 30 }]);
 *   plxq.push(['conversion',  { orderId: 'NF-123', productId: 'self_directed' }]);
 *
 * Demo shortcuts, on purpose:
 *   - The verdict is computed in the browser so it can be shown on screen. A
 *     production system would send the raw signals and score them on the
 *     server, and never reveal the verdict to the visitor.
 *   - "Sending" the conversion writes to localStorage, which the mock
 *     PartnerLedger page reads. In production this is an HTTPS request.
 */
(function () {
  if (window.plx) return;

  var COOKIE = 'plx_click';
  var FORM_KEY = 'plx_form';
  var LEDGER_KEY = 'partnerledger_conversions';

  // Each signal is a named observation with a weight between 0 and 1.
  var WEIGHTS = {
    automation_flag: 0.9,    // browser reports it is driven by automation software
    trap_field_filled: 0.8,  // a field hidden from people was filled in
    no_interaction: 0.5,     // form submitted with no real mouse, touch or key input
    form_not_observed: 0.5,  // submission happened before the script could observe it
    fast_submit: 0.4,        // submitted faster than a person can read the form
    no_typing: 0.3           // clicked, but never typed (autofill or paste)
  };
  var FAST_SUBMIT_MS = 3000;
  var BOT_THRESHOLD = 0.75;
  var SUSPICIOUS_THRESHOLD = 0.25;

  // ---- 1. attribution ----------------------------------------------------

  function attribution(opts) {
    var params = new URLSearchParams(location.search);
    var clickId = params.get(opts.param || 'plclid');
    if (!clickId) return;
    // Last click wins: a newer partner click replaces the stored one.
    var value = JSON.stringify({
      clickId: clickId,
      partnerId: params.get('utm_source') || 'unknown',
      clickedAt: new Date().toISOString()
    });
    document.cookie = COOKIE + '=' + encodeURIComponent(value) +
      '; max-age=' + (opts.days || 30) * 86400 + '; path=/; SameSite=Lax';
  }

  function readClick() {
    var match = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
    if (!match) return null;
    try { return JSON.parse(decodeURIComponent(match[1])); } catch (e) { return null; }
  }

  // ---- 2. observation ----------------------------------------------------

  var pointerEvents = 0;
  var keyEvents = 0;
  // isTrusted is true only for input the browser received from a real device.
  document.addEventListener('pointerdown', function (e) { if (e.isTrusted) pointerEvents++; }, true);
  document.addEventListener('keydown', function (e) { if (e.isTrusted) keyEvents++; }, true);

  document.addEventListener('submit', function (e) {
    var trap = e.target.querySelector('[data-plx-trap]');
    sessionStorage.setItem(FORM_KEY, JSON.stringify({
      elapsedMs: Math.round(performance.now()),
      pointerEvents: pointerEvents,
      keyEvents: keyEvents,
      trapFilled: !!(trap && trap.value),
      automation: navigator.webdriver === true
    }));
  }, true);

  // ---- 3. conversion -----------------------------------------------------

  function assess(orderId) {
    var form = null;
    try { form = JSON.parse(sessionStorage.getItem(FORM_KEY)); } catch (e) { /* treated as missing */ }
    // Ignore observations that belong to an earlier application in this tab.
    if (form && form.orderId && form.orderId !== orderId) form = null;

    var signals = [];
    function add(name, evidence) {
      signals.push({ name: name, weight: WEIGHTS[name], evidence: evidence });
    }

    if (!form) {
      add('form_not_observed', 'no form activity was recorded for this application');
      if (navigator.webdriver === true) add('automation_flag', 'navigator.webdriver is true');
    } else {
      form.orderId = orderId;
      sessionStorage.setItem(FORM_KEY, JSON.stringify(form));
      if (form.automation) add('automation_flag', 'navigator.webdriver is true');
      if (form.trapFilled) add('trap_field_filled', 'hidden field contained a value');
      if (form.pointerEvents === 0 && form.keyEvents === 0) {
        add('no_interaction', '0 pointer events, 0 key events');
      } else if (form.keyEvents === 0) {
        add('no_typing', form.pointerEvents + ' pointer events, 0 key events');
      }
      if (form.elapsedMs < FAST_SUBMIT_MS) {
        add('fast_submit', 'submitted ' + (form.elapsedMs / 1000).toFixed(1) + 's after page load');
      }
    }

    // Combine as "probability at least one signal is right", which assumes the
    // signals are independent. Simple and explainable; not a trained model.
    var pHuman = 1;
    signals.forEach(function (s) { pHuman *= (1 - s.weight); });
    var score = Math.round((1 - pHuman) * 100) / 100;
    var verdict = score >= BOT_THRESHOLD ? 'bot' : score >= SUSPICIOUS_THRESHOLD ? 'suspicious' : 'human';
    return { verdict: verdict, score: score, signals: signals };
  }

  function readLedger() {
    try { return JSON.parse(localStorage.getItem(LEDGER_KEY)) || []; } catch (e) { return []; }
  }

  function conversion(opts) {
    var outcome;
    var click = readClick();
    var ledger = readLedger();
    var existing = ledger.filter(function (r) { return r.orderId === opts.orderId; })[0];

    if (!opts.orderId) {
      outcome = { result: 'ignored', reason: 'No order ID supplied.' };
    } else if (!click) {
      outcome = { result: 'unattributed', reason: 'No partner click cookie, so there is no partner to pay.' };
    } else if (existing) {
      // The order ID is the idempotency key: a page reload must not pay twice.
      outcome = { result: 'duplicate', reason: 'Order ID already received. Ignored.', record: existing };
    } else {
      var assessment = assess(opts.orderId);
      var record = {
        orderId: opts.orderId,
        productId: opts.productId,
        clickId: click.clickId,
        partnerId: click.partnerId,
        receivedAt: new Date().toISOString(),
        verdict: assessment.verdict,
        score: assessment.score,
        signals: assessment.signals
      };
      ledger.push(record);
      localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
      outcome = { result: 'recorded', record: record };

      // Make the same data available to other tags (for example a GA4 event).
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'partner_conversion',
        plx_order_id: record.orderId,
        plx_partner_id: record.partnerId,
        plx_click_id: record.clickId,
        plx_verdict: record.verdict,
        plx_score: record.score,
        plx_signals: record.signals.map(function (s) { return s.name; }).join(',')
      });
    }

    window.plxLast = outcome;
    window.dispatchEvent(new CustomEvent('plx:conversion', { detail: outcome }));
  }

  // ---- command queue -----------------------------------------------------

  var commands = { attribution: attribution, conversion: conversion };
  function run(cmd) {
    if (cmd && commands[cmd[0]]) commands[cmd[0]](cmd[1] || {});
  }

  window.plx = { version: 'demo-1' };
  var queued = window.plxq || [];
  window.plxq = { push: run };
  queued.forEach(run);
})();
