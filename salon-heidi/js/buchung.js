/* Salon Heidi – Online-Terminbuchung (Kundenansicht, DEMO)
 * Liest und schreibt ausschließlich über window.SalonTermine.kunde
 * (js/termine-daten.js). Kunden sehen nur freie und belegte Zeiten. */
(function () {
  'use strict';

  var app = document.getElementById('buchung');
  if (!app || !window.SalonTermine) return;
  var api = window.SalonTermine.kunde;
  var H = window.SalonTermine.hilfe;

  var panel = app.querySelector('.booking-panel');
  var schritte = app.querySelectorAll('.steps li');
  var reduziert = matchMedia('(prefers-reduced-motion: reduce)');

  var MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var TAGE_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  var MAX_TAGE = 56;

  var zustand = { schritt: 1, leistung: null, datum: null, start: null, monat: null, name: '', telefon: '', buchung: null };
  var leistungen = [];

  /* ---------- Hilfen ---------- */

  function el(tag, attrs, kinder) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) e.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    (kinder || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  function uhrzeit(min) { return Math.floor(min / 60) + ':' + (min % 60 < 10 ? '0' : '') + (min % 60); }
  function datumLang(s) {
    return H.textDatum(s).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function leistungsName(l) {
    return el('span', { 'class': 'choice-name' }, [el('span', { 'class': 'placeholder', text: '[PLATZHALTER]' }), ' ' + l.name]);
  }

  /* ---------- Schrittanzeige ---------- */

  function schrittanzeige() {
    for (var i = 0; i < schritte.length; i++) {
      var nr = i + 1, li = schritte[i], btn = li.querySelector('button');
      li.classList.toggle('is-current', nr === zustand.schritt);
      li.classList.toggle('is-done', nr < zustand.schritt);
      // Zurückspringen nur zu erledigten Schritten und nicht nach der Bestätigung
      btn.disabled = !(nr < zustand.schritt && zustand.schritt < 5);
      if (nr === zustand.schritt) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
    }
  }

  function gehe(schritt, fokus) {
    zustand.schritt = schritt;
    schrittanzeige();
    zeichne().then(function () {
      if (!fokus) return;
      var h = panel.querySelector('h3');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      // Schrittleiste oben halten, damit der neue Schritt ganz zu sehen ist
      var oben = app.getBoundingClientRect().top;
      if (oben < 0 || oben > 96) {
        app.scrollIntoView({ behavior: reduziert.matches ? 'auto' : 'smooth', block: 'start' });
      }
    });
  }

  function zurueckKnopf(ziel) {
    return el('button', { type: 'button', 'class': 'link-back', onclick: function () { gehe(ziel, true); } }, ['Zurück']);
  }

  /* ---------- Schritt 1: Leistung ---------- */

  function schritt1() {
    var liste = el('ul', { 'class': 'choices' });
    leistungen.forEach(function (l) {
      var aktiv = zustand.leistung && zustand.leistung.id === l.id;
      liste.appendChild(el('li', null, [
        el('button', {
          type: 'button', 'class': 'choice' + (aktiv ? ' is-selected' : ''), 'aria-pressed': aktiv ? 'true' : 'false',
          onclick: function () {
            if (!zustand.leistung || zustand.leistung.id !== l.id) zustand.start = null;
            zustand.leistung = l;
            gehe(2, true);
          }
        }, [leistungsName(l), el('span', { 'class': 'choice-meta', text: l.dauer + ' Min.' })])
      ]));
    });
    return Promise.resolve([el('h3', { text: 'Welche Leistung möchten Sie buchen?' }), liste]);
  }

  /* ---------- Schritt 2: Tag ---------- */

  function schritt2() {
    var heute = H.heute(), letzter = H.plusTage(heute, MAX_TAGE);
    var h0 = H.textDatum(heute), hl = H.textDatum(letzter);
    if (!zustand.monat) {
      var basis = zustand.datum ? H.textDatum(zustand.datum) : h0;
      zustand.monat = new Date(basis.getFullYear(), basis.getMonth(), 1);
    }
    var m = zustand.monat;
    var ersterMonat = new Date(h0.getFullYear(), h0.getMonth(), 1);
    var letzterMonat = new Date(hl.getFullYear(), hl.getMonth(), 1);
    var tageImMonat = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    var versatz = (m.getDay() + 6) % 7;

    var datums = [];
    for (var d = 1; d <= tageImMonat; d++) datums.push(H.datumText(new Date(m.getFullYear(), m.getMonth(), d)));

    return Promise.all(datums.map(function (s) { return api.tagesStatus(s, zustand.leistung.dauer); })).then(function (status) {
      var kopf = el('div', { 'class': 'cal-head' }, [
        el('p', { 'class': 'cal-month', 'aria-live': 'polite', text: MONATE[m.getMonth()] + ' ' + m.getFullYear() }),
        el('div', { 'class': 'cal-nav' }, [
          el('button', { type: 'button', 'aria-label': 'Vorheriger Monat', disabled: m <= ersterMonat,
            onclick: function () { zustand.monat = new Date(m.getFullYear(), m.getMonth() - 1, 1); zeichne(); } },
            [pfeil('M15 6l-6 6 6 6')]),
          el('button', { type: 'button', 'aria-label': 'Nächster Monat', disabled: m >= letzterMonat,
            onclick: function () { zustand.monat = new Date(m.getFullYear(), m.getMonth() + 1, 1); zeichne(); } },
            [pfeil('M9 6l6 6-6 6')])
        ])
      ]);

      var raster = el('div', { 'class': 'cal-grid', role: 'grid', 'aria-label': 'Kalender ' + MONATE[m.getMonth()] });
      TAGE_KURZ.forEach(function (t) { raster.appendChild(el('span', { 'class': 'cal-wd', 'aria-hidden': 'true', text: t })); });
      for (var v = 0; v < versatz; v++) raster.appendChild(el('span', { 'aria-hidden': 'true' }));

      datums.forEach(function (s, i) {
        var st = status[i], tag = i + 1;
        var klassen = 'cal-day';
        if (st.buchbar) klassen += ' is-open';
        else if (st.grund === 'ausgebucht') klassen += ' is-full';
        if (s === heute) klassen += ' is-today';
        if (s === zustand.datum) klassen += ' is-selected';
        var info = st.buchbar ? 'frei' : (st.grund === 'ausgebucht' ? 'ausgebucht' : 'nicht buchbar');
        raster.appendChild(el('button', {
          type: 'button', 'class': klassen, disabled: !st.buchbar,
          'aria-label': datumLang(s) + ', ' + info,
          onclick: function () {
            if (zustand.datum !== s) zustand.start = null;
            zustand.datum = s;
            gehe(3, true);
          }
        }, [String(tag)]));
      });

      return [
        el('h3', { text: 'An welchem Tag?' }),
        kopf, raster,
        el('p', { 'class': 'booking-hint', text: 'Buchbar sind Dienstag bis Samstag in den nächsten acht Wochen. Durchgestrichene Tage sind ausgebucht.' }),
        zurueckKnopf(1)
      ];
    });
  }

  function pfeil(d) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.6'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    return svg;
  }

  /* ---------- Schritt 3: Uhrzeit ---------- */

  function schritt3() {
    return api.zeitfenster(zustand.datum, zustand.leistung.id).then(function (fenster) {
      var frei = fenster.filter(function (z) { return z.frei; }).length;
      var teile = [
        el('h3', { text: 'Um wie viel Uhr?' }),
        el('p', { 'class': 'booking-sub', text: datumLang(zustand.datum) + ' · ' + zustand.leistung.dauer + ' Min.' })
      ];
      if (!frei) {
        teile.push(el('p', { 'class': 'booking-hint', text: 'An diesem Tag ist leider keine passende Zeit mehr frei. Bitte wählen Sie einen anderen Tag.' }));
      } else {
        var raster = el('div', { 'class': 'slots', role: 'group', 'aria-label': 'Uhrzeiten' });
        fenster.forEach(function (z) {
          var gewaehlt = z.start === zustand.start;
          raster.appendChild(el('button', {
            type: 'button', 'class': 'slot' + (gewaehlt ? ' is-selected' : ''), disabled: !z.frei,
            'aria-label': uhrzeit(z.start) + ' Uhr, ' + (z.frei ? 'frei' : 'belegt'),
            onclick: function () { zustand.start = z.start; gehe(4, true); }
          }, [uhrzeit(z.start)]));
        });
        teile.push(raster);
        teile.push(el('p', { 'class': 'booking-hint', text: 'Durchgestrichene Zeiten sind belegt.' }));
      }
      teile.push(zurueckKnopf(2));
      return teile;
    });
  }

  /* ---------- Schritt 4: Angaben ---------- */

  function schritt4() {
    var fehler = el('p', { 'class': 'form-error', role: 'alert' });
    var name = el('input', { id: 'bk-name', name: 'name', type: 'text', autocomplete: 'name', required: true, value: zustand.name,
      oninput: function () { zustand.name = name.value; fehler.textContent = ''; name.removeAttribute('aria-invalid'); } });
    var tel = el('input', { id: 'bk-tel', name: 'telefon', type: 'tel', autocomplete: 'tel', inputmode: 'tel', required: true, value: zustand.telefon,
      oninput: function () { zustand.telefon = tel.value; fehler.textContent = ''; tel.removeAttribute('aria-invalid'); } });
    var senden = el('button', { type: 'submit', 'class': 'btn' }, ['Termin buchen']);

    var form = el('form', { 'class': 'booking-form', novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      fehler.textContent = '';
      var n = name.value.trim(), t = tel.value.trim();
      name.removeAttribute('aria-invalid'); tel.removeAttribute('aria-invalid');
      if (n.length < 2) { name.setAttribute('aria-invalid', 'true'); fehler.textContent = 'Bitte geben Sie Ihren Namen ein.'; name.focus(); return; }
      if (t.replace(/\D/g, '').length < 6) { tel.setAttribute('aria-invalid', 'true'); fehler.textContent = 'Bitte geben Sie eine Telefonnummer ein, unter der wir Sie erreichen.'; tel.focus(); return; }
      senden.disabled = true;
      api.buchen({ leistungId: zustand.leistung.id, datum: zustand.datum, start: zustand.start, name: n, telefon: t }).then(function (b) {
        zustand.buchung = b;
        gehe(5, true);
      }, function () {
        senden.disabled = false;
        zustand.start = null;
        fehler.textContent = 'Diese Zeit ist inzwischen vergeben. Bitte wählen Sie eine andere Uhrzeit.';
        setTimeout(function () { gehe(3, true); }, 1600);
      });
    } }, [
      el('div', { 'class': 'field' }, [el('label', { 'for': 'bk-name', text: 'Name' }), name]),
      el('div', { 'class': 'field' }, [el('label', { 'for': 'bk-tel', text: 'Telefonnummer' }), tel,
        el('p', { 'class': 'field-hint', text: 'Für Rückfragen zu Ihrem Termin.' })]),
      fehler,
      el('div', { 'class': 'form-actions' }, [senden, zurueckKnopf(3)])
    ]);

    return Promise.resolve([
      el('h3', { text: 'Ihre Angaben' }),
      el('p', { 'class': 'booking-sub', text: datumLang(zustand.datum) + ', ' + uhrzeit(zustand.start) + ' Uhr · ' + zustand.leistung.dauer + ' Min.' }),
      form
    ]);
  }

  /* ---------- Schritt 5: Bestätigung ---------- */

  function schritt5() {
    var b = zustand.buchung;
    var liste = el('ul', { 'class': 'facts' }, [
      el('li', null, [el('span', { text: 'Leistung' }), el('span', null, [el('span', { 'class': 'placeholder', text: '[PLATZHALTER]' }), ' ' + zustand.leistung.name])]),
      el('li', null, [el('span', { text: 'Tag' }), el('span', { text: datumLang(b.datum) })]),
      el('li', null, [el('span', { text: 'Uhrzeit' }), el('span', { text: uhrzeit(b.start) + '–' + uhrzeit(b.start + b.dauer) + ' Uhr' })]),
      el('li', null, [el('span', { text: 'Name' }), el('span', { text: zustand.name.trim() })])
    ]);
    return Promise.resolve([
      el('h3', { 'class': 'confirm-title', text: 'Ihr Termin ist eingetragen.' }),
      liste,
      el('p', { 'class': 'booking-hint', text: 'Demo – diese Buchung wurde nicht an den Salon übermittelt. Sie ist nur in diesem Browser gespeichert.' }),
      el('p', { 'class': 'booking-hint', text: 'Termin absagen oder verschieben: 040 828814.' }),
      el('button', { type: 'button', 'class': 'btn btn-line', onclick: function () {
        zustand = { schritt: 1, leistung: null, datum: null, start: null, monat: null, name: zustand.name, telefon: zustand.telefon, buchung: null };
        gehe(1, true);
      } }, ['Weiteren Termin buchen'])
    ]);
  }

  /* ---------- Zeichnen ---------- */

  var lauf = 0;
  function zeichne() {
    var nr = ++lauf;
    var bau = [null, schritt1, schritt2, schritt3, schritt4, schritt5][zustand.schritt];
    return bau().then(function (teile) {
      if (nr !== lauf) return;   // inzwischen neu gezeichnet
      panel.textContent = '';
      var wrap = el('div', { 'class': 'panel-step' }, teile);
      panel.appendChild(wrap);
    });
  }

  for (var i = 0; i < schritte.length; i++) (function (nr) {
    schritte[i].querySelector('button').addEventListener('click', function () { gehe(nr, true); });
  })(i + 1);

  /* Ändert der Salon etwas (anderer Tab), Tag und Uhrzeit neu prüfen */
  window.SalonTermine.beiAenderung(function () {
    if (zustand.schritt === 2 || zustand.schritt === 3) zeichne();
  });

  api.leistungen().then(function (l) {
    leistungen = l;
    app.classList.add('is-ready');
    schrittanzeige();
    zeichne();
  });
})();
