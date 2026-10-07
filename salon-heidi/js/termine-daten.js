/* Salon Heidi – Datenschicht der Termin-Demo
 *
 * DEMO: Alle Termine liegen nur im localStorage dieses Browsers.
 * Nichts wird übermittelt.
 *
 * Kunden- und Salonansicht greifen ausschließlich über window.SalonTermine
 * auf Daten zu. Für ein echtes Buchungstool wird nur diese Datei ersetzt:
 * gleiche Funktionsnamen, gleiche Rückgabeformen (alle Funktionen liefern
 * Promises, damit später Netzwerkaufrufe passen).
 *
 * Datenformate
 *   Datum:   "JJJJ-MM-TT" (lokale Zeit)
 *   Uhrzeit: Minuten seit Mitternacht (9:30 Uhr = 570)
 *   Termin:  { id, datum, start, dauer, leistungId, name, telefon }
 *   Sperre:  { id, datum, start, ende, grund }
 */
(function () {
  'use strict';

  var SPEICHER_KEY = 'salonHeidiDemo.v1';
  var RASTER = 30;          // Minuten zwischen möglichen Startzeiten
  var VORLAUF_TAGE = 56;    // so weit im Voraus ist buchbar

  // Platzhalter: echte Leistungen und Dauern liefert der Salon
  var LEISTUNGEN = [
    { id: 'damen-schnitt',  name: 'Damenhaarschnitt',     dauer: 60 },
    { id: 'herren-schnitt', name: 'Herrenhaarschnitt',    dauer: 30 },
    { id: 'waschen-foehnen', name: 'Waschen und Föhnen',  dauer: 30 },
    { id: 'farbe',          name: 'Färben',               dauer: 90 }
  ];

  // Wochentag (0 = Sonntag) → Öffnungszeit in Minuten, null = geschlossen
  var OEFFNUNGSZEITEN = {
    0: null, 1: null,
    2: { von: 540, bis: 1080 }, 3: { von: 540, bis: 1080 },
    4: { von: 540, bis: 1080 }, 5: { von: 540, bis: 1080 },
    6: { von: 480, bis: 720 }
  };

  /* ---------- Datum ---------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function datumText(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function textDatum(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function plusTage(s, n) { var d = textDatum(s); d.setDate(d.getDate() + n); return datumText(d); }
  function heute() { return datumText(new Date()); }
  function jetztMinuten() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function oeffnungAm(datum) { return OEFFNUNGSZEITEN[textDatum(datum).getDay()]; }
  function neueId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- Speicher ---------- */

  var speicherOk = true;
  var fluechtig = null;   // Ersatz, falls localStorage gesperrt ist (privates Fenster)

  function laden() {
    var roh = null;
    try { roh = localStorage.getItem(SPEICHER_KEY); } catch (e) { speicherOk = false; }
    if (!speicherOk) return fluechtig || (fluechtig = beispielDaten());
    if (!roh) { var neu = beispielDaten(); sichern(neu); return neu; }
    try { return JSON.parse(roh); } catch (e) { var ersatz = beispielDaten(); sichern(ersatz); return ersatz; }
  }

  function sichern(daten) {
    if (!speicherOk) { fluechtig = daten; return; }
    try { localStorage.setItem(SPEICHER_KEY, JSON.stringify(daten)); }
    catch (e) { speicherOk = false; fluechtig = daten; }
  }

  /* Erfundene Beispieltermine – offensichtlich fiktive Namen */
  function beispielDaten() {
    var namen = ['Erika Mustermann', 'Max Mustermann', 'Lieschen Müller', 'Otto Normalverbraucher',
                 'Maria Musterfrau', 'Hans Beispiel', 'Klara Probe', 'Peter Platzhalter'];
    var muster = [   // [Startminute, Leistungsindex]
      [[570, 0], [690, 1], [900, 3]],
      [[540, 2], [600, 0], [840, 1], [960, 0]],
      [[630, 3], [780, 1]],
      [[480, 1], [540, 0], [630, 2]]
    ];
    var termine = [], sperren = [], datum = heute(), offenTage = 0, n = 0;
    for (var i = 0; offenTage < 10 && i < 30; i++, datum = plusTage(datum, 1)) {
      var oz = oeffnungAm(datum);
      if (!oz) continue;
      var tagesMuster = textDatum(datum).getDay() === 6 ? muster[3] : muster[offenTage % 3];
      tagesMuster.forEach(function (m) {
        var l = LEISTUNGEN[m[1]];
        if (m[0] < oz.von || m[0] + l.dauer > oz.bis) return;
        termine.push({ id: neueId(), datum: datum, start: m[0], dauer: l.dauer, leistungId: l.id,
                       name: namen[n % namen.length], telefon: '040 000000' + (n % 10) });
        n++;
      });
      if (textDatum(datum).getDay() !== 6) sperren.push({ id: neueId(), datum: datum, start: 750, ende: 780, grund: 'Mittagspause' });
      offenTage++;
    }
    return { termine: termine, sperren: sperren };
  }

  /* ---------- Belegung ---------- */

  function belegteZeiten(daten, datum) {
    var r = [];
    daten.termine.forEach(function (t) { if (t.datum === datum) r.push({ start: t.start, ende: t.start + t.dauer }); });
    daten.sperren.forEach(function (s) { if (s.datum === datum) r.push({ start: s.start, ende: s.ende }); });
    return r;
  }

  function ueberschneidet(start, ende, zeiten) {
    return zeiten.some(function (z) { return start < z.ende && ende > z.start; });
  }

  function buchbarerTag(datum) {
    if (datum < heute() || datum > plusTage(heute(), VORLAUF_TAGE)) return false;
    return !!oeffnungAm(datum);
  }

  /* Alle Startzeiten des Tages für eine Dauer, jeweils frei oder belegt.
     Nur Zeiten, bei denen die Leistung vor Ladenschluss fertig ist. */
  function zeitfenster(daten, datum, dauer) {
    var oz = oeffnungAm(datum);
    if (!oz || !buchbarerTag(datum)) return [];
    var belegt = belegteZeiten(daten, datum);
    var istHeute = datum === heute(), jetzt = jetztMinuten();
    var r = [];
    for (var m = oz.von; m + dauer <= oz.bis; m += RASTER) {
      var frei = !ueberschneidet(m, m + dauer, belegt) && !(istHeute && m <= jetzt);
      r.push({ start: m, frei: frei });
    }
    return r;
  }

  function leistung(id) {
    for (var i = 0; i < LEISTUNGEN.length; i++) if (LEISTUNGEN[i].id === id) return LEISTUNGEN[i];
    return null;
  }

  /* ---------- Änderungen von anderen Tabs ---------- */

  var beobachter = [];
  window.addEventListener('storage', function (e) {
    if (e.key === SPEICHER_KEY || e.key === null) beobachter.forEach(function (f) { f(); });
  });
  function melden() { beobachter.forEach(function (f) { f(); }); }

  function kopie(o) { return JSON.parse(JSON.stringify(o)); }
  var ok = function (wert) { return Promise.resolve(wert); };

  /* ---------- Öffentliche Schnittstelle ---------- */

  window.SalonTermine = {
    istDemo: true,
    speicherVerfuegbar: function () { laden(); return speicherOk; },

    /* Hilfen für Datum und Öffnungszeiten */
    hilfe: { heute: heute, plusTage: plusTage, textDatum: textDatum, datumText: datumText, oeffnungAm: oeffnungAm },

    /* Wird aufgerufen, wenn sich Daten ändern (auch in einem anderen Tab) */
    beiAenderung: function (f) { beobachter.push(f); },

    /* Kundenansicht – liefert nie Namen oder Details anderer Kunden */
    kunde: {
      leistungen: function () { return ok(kopie(LEISTUNGEN)); },

      /* Tag buchbar? Mit Anzahl freier Startzeiten für die gewählte Dauer */
      tagesStatus: function (datum, dauer) {
        if (!buchbarerTag(datum)) return ok({ buchbar: false, frei: 0, grund: 'geschlossen' });
        var frei = zeitfenster(laden(), datum, dauer).filter(function (z) { return z.frei; }).length;
        return ok({ buchbar: frei > 0, frei: frei, grund: frei ? '' : 'ausgebucht' });
      },

      /* [{ start, frei }] */
      zeitfenster: function (datum, leistungId) {
        var l = leistung(leistungId);
        return ok(l ? zeitfenster(laden(), datum, l.dauer) : []);
      },

      /* Legt einen Termin an. Prüft die Zeit vorher erneut. */
      buchen: function (eingabe) {
        var daten = laden(), l = leistung(eingabe.leistungId);
        if (!l) return Promise.reject(new Error('Unbekannte Leistung'));
        var passt = zeitfenster(daten, eingabe.datum, l.dauer).some(function (z) { return z.start === eingabe.start && z.frei; });
        if (!passt) return Promise.reject(new Error('belegt'));
        var termin = { id: neueId(), datum: eingabe.datum, start: eingabe.start, dauer: l.dauer, leistungId: l.id,
                       name: String(eingabe.name).trim(), telefon: String(eingabe.telefon).trim() };
        daten.termine.push(termin);
        sichern(daten); melden();
        return ok({ id: termin.id, datum: termin.datum, start: termin.start, dauer: termin.dauer, leistungId: termin.leistungId });
      }
    },

    /* Salonansicht – alle Details */
    salon: {
      leistungen: function () { return ok(kopie(LEISTUNGEN)); },

      /* Termine und Sperren von–bis (einschließlich), sortiert */
      eintraege: function (von, bis) {
        var daten = laden();
        var nachZeit = function (a, b) { return a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.start - b.start; };
        return ok({
          termine: daten.termine.filter(function (t) { return t.datum >= von && t.datum <= bis; }).sort(nachZeit).map(kopie),
          sperren: daten.sperren.filter(function (s) { return s.datum >= von && s.datum <= bis; }).sort(nachZeit).map(kopie)
        });
      },

      absagen: function (terminId) {
        var daten = laden();
        daten.termine = daten.termine.filter(function (t) { return t.id !== terminId; });
        sichern(daten); melden();
        return ok(true);
      },

      /* Sperrt einen Zeitraum, auch über mehrere Tage (z. B. Urlaub).
         eingabe: { vonDatum, bisDatum, start, ende, grund } – start/ende null = ganzer Tag */
      sperren: function (eingabe) {
        var daten = laden(), anzahl = 0;
        var bis = eingabe.bisDatum && eingabe.bisDatum > eingabe.vonDatum ? eingabe.bisDatum : eingabe.vonDatum;
        for (var d = eingabe.vonDatum; d <= bis; d = plusTage(d, 1)) {
          var oz = oeffnungAm(d);
          if (!oz) continue;
          var start = eingabe.start == null ? oz.von : Math.max(eingabe.start, oz.von);
          var ende = eingabe.ende == null ? oz.bis : Math.min(eingabe.ende, oz.bis);
          if (ende <= start) continue;
          daten.sperren.push({ id: neueId(), datum: d, start: start, ende: ende, grund: String(eingabe.grund || 'Gesperrt').trim() });
          anzahl++;
        }
        sichern(daten); melden();
        return ok(anzahl);
      },

      sperreAufheben: function (sperreId) {
        var daten = laden();
        daten.sperren = daten.sperren.filter(function (s) { return s.id !== sperreId; });
        sichern(daten); melden();
        return ok(true);
      },

      /* Nur für die Demo: Beispieltermine neu einspielen */
      demoZuruecksetzen: function () {
        sichern(beispielDaten()); melden();
        return ok(true);
      }
    }
  };
})();
