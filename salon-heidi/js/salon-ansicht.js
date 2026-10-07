/* Salon Heidi – Salonansicht der Termin-Demo
 * Liest und schreibt ausschließlich über window.SalonTermine.salon
 * (js/termine-daten.js). */
(function () {
  'use strict';

  var T = window.SalonTermine;
  if (!T) return;
  var api = T.salon, H = T.hilfe;

  var ansicht = document.getElementById('ansicht');
  var zustand = { modus: 'tag', datum: H.heute(), abfrage: null };
  var leistungen = {};

  /* ---------- Hilfen ---------- */

  function el(tag, attrs, kinder) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) e.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    (kinder || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function uhrzeit(min) { return Math.floor(min / 60) + ':' + (min % 60 < 10 ? '0' : '') + (min % 60); }
  function minuten(hhmm) { var p = String(hhmm).split(':'); return p.length === 2 ? (+p[0]) * 60 + (+p[1]) : NaN; }
  function datumLang(s, mitJahr) {
    var o = { weekday: 'long', day: 'numeric', month: 'long' };
    if (mitJahr) o.year = 'numeric';
    return H.textDatum(s).toLocaleDateString('de-DE', o);
  }
  function datumKurz(s) { return H.textDatum(s).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }); }
  function wochentag(s) { return H.textDatum(s).toLocaleDateString('de-DE', { weekday: 'long' }); }
  function montag(s) { var d = H.textDatum(s); return H.plusTage(s, -((d.getDay() + 6) % 7)); }
  function dauerText(min) { return min >= 60 ? (Math.floor(min / 60) + ' Std.' + (min % 60 ? ' ' + (min % 60) + ' Min.' : '')) : min + ' Min.'; }

  /* ---------- Einträge ---------- */

  function terminZeile(t) {
    var l = leistungen[t.leistungId];
    var aktionen = el('div', { 'class': 'entry-actions' });
    function normal() {
      aktionen.textContent = '';
      aktionen.appendChild(el('button', { type: 'button', 'class': 'act', onclick: frage }, ['Absagen']));
    }
    function frage() {
      aktionen.textContent = '';
      var nein = el('button', { type: 'button', 'class': 'act', onclick: normal }, ['Nein']);
      aktionen.appendChild(el('div', { 'class': 'confirm-row' }, [
        'Termin absagen?',
        el('button', { type: 'button', 'class': 'act is-danger', onclick: function () { api.absagen(t.id); } }, ['Ja, absagen']),
        nein
      ]));
      nein.focus();
    }
    normal();
    return el('li', { 'class': 'entry' }, [
      el('div', { 'class': 'entry-time' }, [uhrzeit(t.start) + '–' + uhrzeit(t.start + t.dauer), el('small', { text: dauerText(t.dauer) })]),
      el('div', { 'class': 'entry-main' }, [
        el('div', { 'class': 'entry-title' }, [t.name]),
        el('div', { 'class': 'entry-detail' }, [
          el('span', { 'class': 'placeholder', text: '[PLATZHALTER]' }), ' ' + (l ? l.name : t.leistungId) + ' · ',
          el('a', { href: 'tel:' + t.telefon.replace(/[^\d+]/g, ''), text: t.telefon })
        ])
      ]),
      aktionen
    ]);
  }

  function sperrZeile(s) {
    return el('li', { 'class': 'entry is-block' }, [
      el('div', { 'class': 'entry-time' }, [uhrzeit(s.start) + '–' + uhrzeit(s.ende), el('small', { text: dauerText(s.ende - s.start) })]),
      el('div', { 'class': 'entry-main' }, [
        el('div', { 'class': 'entry-title' }, ['Gesperrt: ' + s.grund]),
        el('div', { 'class': 'entry-detail', text: 'Auf der Website nicht buchbar' })
      ]),
      el('div', { 'class': 'entry-actions' }, [
        el('button', { type: 'button', 'class': 'act', onclick: function () { api.sperreAufheben(s.id); } }, ['Sperre aufheben'])
      ])
    ]);
  }

  function tagesListe(datum, daten) {
    var eintraege = [];
    daten.termine.forEach(function (t) { if (t.datum === datum) eintraege.push({ start: t.start, el: terminZeile(t) }); });
    daten.sperren.forEach(function (s) { if (s.datum === datum) eintraege.push({ start: s.start, el: sperrZeile(s) }); });
    eintraege.sort(function (a, b) { return a.start - b.start; });
    if (!eintraege.length) return el('p', { 'class': 'empty', text: H.oeffnungAm(datum) ? 'Keine Termine.' : 'Geschlossen.' });
    return el('ul', { 'class': 'entries' }, eintraege.map(function (e) { return e.el; }));
  }

  function zaehlen(datum, daten) {
    var t = daten.termine.filter(function (x) { return x.datum === datum; });
    var min = t.reduce(function (s, x) { return s + x.dauer; }, 0);
    return { anzahl: t.length, minuten: min };
  }

  function oeffnungText(datum) {
    var oz = H.oeffnungAm(datum);
    return oz ? 'Geöffnet ' + uhrzeit(oz.von) + '–' + uhrzeit(oz.bis) + ' Uhr' : 'Geschlossen';
  }

  /* ---------- Ansichten ---------- */

  function tagesAnsicht(daten) {
    var d = zustand.datum, z = zaehlen(d, daten);
    var meta = oeffnungText(d);
    if (H.oeffnungAm(d)) meta += ' · ' + z.anzahl + (z.anzahl === 1 ? ' Termin' : ' Termine') + (z.anzahl ? ', zusammen ' + dauerText(z.minuten) : '');
    return el('div', { 'class': 'view' }, [
      el('h2', { 'class': 'period', text: (d === H.heute() ? 'Heute, ' : '') + datumLang(d, true) }),
      el('p', { 'class': 'period-meta', text: meta }),
      tagesListe(d, daten)
    ]);
  }

  function wochenAnsicht(daten) {
    var mo = montag(zustand.datum), tage = [];
    for (var i = 1; i <= 5; i++) tage.push(H.plusTage(mo, i));   // Di–Sa
    var gesamt = 0;
    var spalten = tage.map(function (d) {
      var z = zaehlen(d, daten); gesamt += z.anzahl;
      return el('div', { 'class': 'week-day' + (d === H.heute() ? ' is-today' : '') }, [
        el('h3', null, [el('button', { type: 'button', onclick: function () { zustand.modus = 'tag'; zustand.datum = d; zeichne(); } },
          [wochentag(d) + ', ' + datumKurz(d)])]),
        el('p', { 'class': 'day-meta', text: z.anzahl + (z.anzahl === 1 ? ' Termin' : ' Termine') }),
        tagesListe(d, daten)
      ]);
    });
    return el('div', { 'class': 'view' }, [
      el('h2', { 'class': 'period', text: 'Woche vom ' + datumKurz(tage[0]) + ' bis ' + datumLang(tage[4], true).replace(/^[^,]+, /, '') }),
      el('p', { 'class': 'period-meta', text: gesamt + (gesamt === 1 ? ' Termin' : ' Termine') + ' · Dienstag bis Samstag' }),
      el('div', { 'class': 'week' }, spalten),
      el('p', { 'class': 'week-closed', text: 'Sonntag und Montag geschlossen. Ein Klick auf den Tag öffnet die Tagesansicht mit allen Funktionen.' })
    ]);
  }

  var lauf = 0;
  function zeichne() {
    var nr = ++lauf;
    var von, bis;
    if (zustand.modus === 'tag') { von = bis = zustand.datum; }
    else { von = montag(zustand.datum); bis = H.plusTage(von, 6); }
    document.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === zustand.modus)); });
    return api.eintraege(von, bis).then(function (daten) {
      if (nr !== lauf) return;
      ansicht.textContent = '';
      ansicht.appendChild(zustand.modus === 'tag' ? tagesAnsicht(daten) : wochenAnsicht(daten));
    });
  }

  /* ---------- Bedienung ---------- */

  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.addEventListener('click', function () { zustand.modus = b.getAttribute('data-view'); zeichne(); });
  });

  document.querySelectorAll('[data-step]').forEach(function (b) {
    b.addEventListener('click', function () {
      var s = +b.getAttribute('data-step');
      if (s === 0) zustand.datum = H.heute();
      else if (zustand.modus === 'woche') zustand.datum = H.plusTage(zustand.datum, 7 * s);
      else {
        // Tag für Tag, geschlossene Tage überspringen
        var d = zustand.datum;
        for (var i = 0; i < 7; i++) { d = H.plusTage(d, s); if (H.oeffnungAm(d)) break; }
        zustand.datum = d;
      }
      zeichne();
    });
  });

  /* Zeit sperren */
  var form = document.getElementById('sperren-form');
  var f = function (id) { return document.getElementById(id); };
  var msg = f('sp-msg');
  f('sp-von').value = H.heute();

  function ganzerTag() { var g = f('sp-ganz').checked; f('sp-start').disabled = g; f('sp-ende').disabled = g; }
  f('sp-ganz').addEventListener('change', ganzerTag);
  form.querySelectorAll('[data-grund]').forEach(function (b) {
    b.addEventListener('click', function () {
      f('sp-grund').value = b.getAttribute('data-grund');
      f('sp-ganz').checked = !!b.getAttribute('data-ganz');
      ganzerTag();
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = '';
    var von = f('sp-von').value, bis = f('sp-bis').value || von, ganz = f('sp-ganz').checked;
    var start = ganz ? null : minuten(f('sp-start').value), ende = ganz ? null : minuten(f('sp-ende').value);
    if (!von) { msg.textContent = 'Bitte einen Tag wählen.'; return; }
    if (bis < von) { msg.textContent = '„Bis Tag“ liegt vor „Von Tag“.'; return; }
    if (!ganz && (isNaN(start) || isNaN(ende) || ende <= start)) { msg.textContent = 'Bitte eine gültige Uhrzeit von–bis angeben.'; return; }

    api.sperren({ vonDatum: von, bisDatum: bis, start: start, ende: ende, grund: f('sp-grund').value || 'Gesperrt' }).then(function (anzahl) {
      if (!anzahl) { msg.textContent = 'Nichts gesperrt – der Zeitraum liegt außerhalb der Öffnungszeiten.'; return; }
      return api.eintraege(von, bis).then(function (daten) {
        var betroffen = daten.termine.filter(function (t) {
          if (ganz) return H.oeffnungAm(t.datum);
          return t.start < ende && t.start + t.dauer > start;
        }).length;
        msg.textContent = (anzahl === 1 ? 'Gesperrt.' : anzahl + ' Tage gesperrt.') +
          (betroffen ? ' Achtung: ' + betroffen + (betroffen === 1 ? ' Termin liegt' : ' Termine liegen') + ' im Zeitraum und bleibt bestehen.' : '');
        if (betroffen > 1) msg.textContent = msg.textContent.replace('bleibt bestehen', 'bleiben bestehen');
        zustand.datum = von; zeichne();
      });
    });
  });

  f('demo-reset').addEventListener('click', function () {
    api.demoZuruecksetzen().then(function () { f('demo-msg').textContent = 'Beispieltermine neu geladen.'; });
  });

  /* Neue Buchung in einem anderen Tab → sofort neu zeichnen */
  T.beiAenderung(zeichne);

  if (!T.speicherVerfuegbar()) {
    document.querySelector('.lead').textContent = 'Dieser Browser erlaubt keinen lokalen Speicher (z. B. privates Fenster). Die Demo läuft, Änderungen gehen beim Neuladen verloren.';
  }

  api.leistungen().then(function (l) {
    l.forEach(function (x) { leistungen[x.id] = x; });
    zeichne();
  });
})();
