// Happening page: hides events that are over by today's date in Hobart (an event that's on says "Happening Now"
// in its card; the Happening Now section itself is on the homepage), keeps the pinned events in "Recommended by
// us" until they're over, writes dates in the page's language, makes "Add to calendar"
// files and draws the month / week calendar. Add ?at=2026-11-08T10:00 to the address to see the page as it will
// look at that moment.
// Without this script every event stays listed under Upcoming.
(function () {
  var root = document.querySelector('[data-happening]');
  if (!root) return;

  var data = JSON.parse(root.querySelector('.happening-data').textContent);
  var S = data.strings;
  // Animated in-page changes come from carousel.js; without it, changes just happen
  var transition = window.siteTransition || function (update) { update(); return null; };
  var locale = root.dataset.locale;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TZ = 'Australia/Hobart';
  var DAY = 86400000;
  var at = new Date(new URLSearchParams(location.search).get('at') || NaN);
  var loaded = Date.now();
  function clockNow() { return isNaN(at) ? new Date() : new Date(at.getTime() + Date.now() - loaded); }

  // ---- Days ----------------------------------------------------------------------------------------------
  // Events are compared by their calendar day in Hobart, written as "2026-11-19" keys, whatever the
  // visitor's own time zone is.

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var keyParts = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  function dayKey(date) {
    var p = {};
    keyParts.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }

  // A key as a UTC midnight timestamp, for day arithmetic and for labels formatted in UTC.
  function keyTime(key) {
    var a = key.split('-');
    return Date.UTC(+a[0], +a[1] - 1, +a[2]);
  }
  function timeKey(t) {
    var d = new Date(t);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function addDays(key, n) { return timeKey(keyTime(key) + n * DAY); }
  function weekday(key) { return (new Date(keyTime(key)).getUTCDay() + 6) % 7; } // Monday 0 … Sunday 6
  function mondayOf(key) { return addDays(key, -weekday(key)); }
  function monthStart(key) { return key.slice(0, 8) + '01'; }
  function addMonths(key, n) {
    var d = new Date(keyTime(monthStart(key)));
    d.setUTCMonth(d.getUTCMonth() + n);
    return timeKey(d.getTime());
  }
  function monthEnd(key) { return addDays(addMonths(key, 1), -1); }

  // ---- Wording -------------------------------------------------------------------------------------------

  // The browser's own date wording when it knows the language. Some browsers have no Nepali data, so then
  // dates are put together from the month and weekday names in the language files.
  var nativeDates = Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
  var names = {
    monthShort: S.monthsShort.split(','), monthLong: S.monthsLong.split(','),
    weekdayShort: S.weekdaysShort.split(','), weekdayLong: S.weekdaysLong.split(',')
  };
  function PlainFormat(options) {
    var parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: options.timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    var weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    this.format = function (date) {
      var p = {};
      parts.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
      p.day = String(+p.day);
      if (options.hour) return p.hour + ':' + p.minute;
      var month = (options.month === 'long' ? names.monthLong : names.monthShort)[+p.month - 1];
      var weekday = (options.weekday === 'long' ? names.weekdayLong : names.weekdayShort)[weekdays.indexOf(p.weekday)];
      if (!options.day) {
        if (options.weekday) return weekday;
        return options.year ? month + ' ' + p.year : month;
      }
      if (!options.month) return p.day;
      return (options.weekday ? weekday + ', ' : '') + p.day + ' ' + month + (options.year ? ' ' + p.year : '');
    };
    this.formatRange = function (a, b) { return this.format(a) + ' – ' + this.format(b); };
  }
  function fmt(options, utc) {
    options.timeZone = utc ? 'UTC' : TZ;
    return nativeDates ? new Intl.DateTimeFormat(locale, options) : new PlainFormat(options);
  }
  var fmtDate = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
  var fmtTime = fmt({ hour: 'numeric', minute: '2-digit' });
  var fmtWeekday = fmt({ weekday: 'short' });
  var fmtMonthShort = fmt({ month: 'short' });
  var fmtDayNum = fmt({ day: 'numeric' });
  var fmtMonthYear = fmt({ month: 'long', year: 'numeric' });
  var keyMonthYear = fmt({ month: 'long', year: 'numeric' }, true);
  var keyMonthName = fmt({ month: 'long' }, true);
  var keyWeekdayShort = fmt({ weekday: 'short' }, true);
  var keyDayNum = fmt({ day: 'numeric' }, true);
  var keyMonthShort = fmt({ month: 'short' }, true);
  var keyDayMonth = fmt({ day: 'numeric', month: 'short' }, true);
  var keyFull = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, true);
  var keyDayMonthYear = fmt({ day: 'numeric', month: 'short', year: 'numeric' }, true);

  function range(f, a, b) {
    return f.formatRange ? f.formatRange(a, b) : f.format(a) + ' – ' + f.format(b);
  }
  function count(n) { return n === 1 ? S.oneEvent : S.events.replace('{n}', n); }

  // "Thu 19 Nov · 5:15 – 6:45 pm"; "Wed 9 – Thu 10 Dec · 10:00 am – 7:00 pm"; "Mon 9 Nov – Thu 3 Dec" (all day);
  // "November 2026 · Date to be confirmed"
  function when(e, timeOnly) {
    if (e.dateTbc) return fmtMonthYear.format(e.startDate) + ' · ' + S.dateTbc;
    var multi = e.startKey !== e.endKey;
    if (e.allDay) return multi ? range(fmtDate, e.startDate, e.endDate) : fmtDate.format(e.startDate);
    var times = multi ? fmtTime.format(e.startDate) + ' – ' + fmtTime.format(e.endDate) : range(fmtTime, e.startDate, e.endDate);
    var day = timeOnly && !multi ? fmtWeekday.format(e.startDate) : multi ? range(fmtDate, e.startDate, e.endDate) : fmtDate.format(e.startDate);
    return day + ' · ' + times;
  }

  // ---- Events --------------------------------------------------------------------------------------------

  var events = data.events.map(function (e) {
    e.startDate = new Date(e.start);
    e.endDate = new Date(e.end);
    if (e.dateTbc) {
      e.startKey = monthStart(dayKey(e.startDate));
      e.endKey = monthEnd(e.startKey);
    } else {
      e.startKey = dayKey(e.startDate);
      e.endKey = dayKey(e.endDate);
    }
    e.card = root.querySelector('.hp-card[data-event="' + e.id + '"]:not(.hp-card--spot)');
    e.spot = root.querySelector('.hp-card--spot[data-event="' + e.id + '"]'); // its copy under "Recommended by us"
    e.row = root.querySelector('.hp-row[data-event="' + e.id + '"]');
    return e;
  });
  var byId = {};
  events.forEach(function (e) { byId[e.id] = e; });

  //   past      over
  //   live      on right now
  //   running   a multi-day event part-way through (both show "Happening Now")
  //   today / tomorrow / week (within the next 7 days) / later
  //   tbc       only the month is known
  function statusOf(e, now, today) {
    if (e.dateTbc) return today > e.endKey ? 'past' : 'tbc';
    if (now >= e.endDate) return 'past';
    if (now >= e.startDate) return e.startKey === e.endKey ? 'live' : 'running';
    if (e.startKey === today) return 'today';
    if (e.startKey === addDays(today, 1)) return 'tomorrow';
    if (e.startKey <= addDays(today, 6)) return 'week';
    return 'later';
  }
  function isNow(status) { return status === 'live' || status === 'running' || status === 'today' || status === 'tomorrow'; }

  var liveIcon = '<svg class="live-icon" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false"><circle class="live-ring live-ring--outer" cx="10" cy="10" r="8.25"/><circle class="live-ring live-ring--inner" cx="10" cy="10" r="5.25"/><circle class="live-dot" cx="10" cy="10" r="2.5"/></svg>';

  // ---- When it starts: a flip clock, or "Happening Now" -----------------------------------------------------
  // An upcoming event counts down to its start in flip-clock digits (days, hours, minutes, seconds); each digit
  // that changes turns over like a split-flap card. An event that is on says "Happening Now" with the live dot,
  // and one with only a month says "Date to be confirmed". Clocks tick every second (see tick() at the end);
  // the screen-reader label only changes once a minute.
  var clocks = [];

  function flipDigit() {
    var d = document.createElement('span');
    d.className = 'flip';
    d.innerHTML = '<span class="flip-top"><span></span></span><span class="flip-bottom"><span></span></span>' +
      '<span class="flip-flap flip-flap-top"><span></span></span><span class="flip-flap flip-flap-bottom"><span></span></span>';
    return d;
  }
  function setDigit(d, v, animate) {
    var old = d.getAttribute('data-v');
    if (old === v) return;
    d.setAttribute('data-v', v);
    function face(cls) { return d.querySelector('.' + cls + ' > span'); }
    face('flip-top').textContent = v;
    clearTimeout(d.flipDone);
    if (!animate || old === null || reduceMotion) { face('flip-bottom').textContent = v; d.classList.remove('flip--go'); return; }
    // The new top shows at once; the old top flaps down over it, then the new bottom flaps down over the old one
    face('flip-bottom').textContent = old;
    face('flip-flap-top').textContent = old;
    face('flip-flap-bottom').textContent = v;
    d.classList.remove('flip--go');
    void d.offsetWidth; // restart the animation
    d.classList.add('flip--go');
    d.flipDone = setTimeout(function () { face('flip-bottom').textContent = v; d.classList.remove('flip--go'); }, 620);
  }

  function makeClock(e, small) {
    var el = document.createElement('span');
    el.className = 'flipclock' + (small ? ' flipclock--sm' : '');
    el.setAttribute('role', 'timer');
    var groups = [S.days, S.hours, S.minutes, S.seconds].map(function (label) {
      var g = document.createElement('span');
      g.className = 'flipclock-group';
      var digits = document.createElement('span');
      digits.className = 'flipclock-digits';
      digits.setAttribute('aria-hidden', 'true');
      var name = document.createElement('span');
      name.className = 'flipclock-label';
      name.setAttribute('aria-hidden', 'true');
      name.textContent = label;
      g.appendChild(digits);
      g.appendChild(name);
      el.appendChild(g);
      return digits;
    });
    var c = { el: el, e: e, groups: groups, label: '' };
    clocks.push(c);
    renderClock(c, clockNow(), false);
    return el;
  }
  function renderClock(c, now, animate) {
    var s = Math.max(0, Math.floor((c.e.startDate - now) / 1000));
    var parts = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
    parts.forEach(function (n, i) {
      var text = String(n);
      while (text.length < 2) text = '0' + text;
      var box = c.groups[i];
      while (box.children.length < text.length) box.insertBefore(flipDigit(), box.firstChild);
      while (box.children.length > text.length) box.removeChild(box.firstChild);
      Array.prototype.forEach.call(box.children, function (d, j) { setDigit(d, text[j], animate); });
    });
    var label = S.startsIn + ' ' + parts[0] + ' ' + S.days + ' ' + parts[1] + ' ' + S.hours + ' ' + parts[2] + ' ' + S.minutes;
    if (label !== c.label) { c.label = label; c.el.setAttribute('aria-label', label); }
    return s;
  }

  // Fills an event's [data-status] slot on a card or list row; rebuilt only when the kind of slot changes
  function whenSlot(slot, e, small) {
    var kind = e.status === 'past' ? 'past' : e.status === 'tbc' ? 'tbc' : e.status === 'live' || e.status === 'running' ? 'live' : 'count';
    slot.hidden = false;
    if (slot.getAttribute('data-kind') === kind) return;
    slot.setAttribute('data-kind', kind);
    slot.innerHTML = '';
    if (kind === 'live') {
      slot.innerHTML = '<span class="hp-live">' + liveIcon + '</span>';
      slot.firstChild.appendChild(document.createTextNode(S.happeningNow));
    } else if (kind === 'count') {
      if (!small) slot.appendChild(h('span', { class: 'hp-countdown-lead', text: S.startsIn }));
      slot.appendChild(makeClock(e, small));
    } else {
      slot.appendChild(h('span', { class: 'hp-when-note', text: kind === 'past' ? S.past : S.dateTbc }));
    }
  }
  function setWhen(el, e, small) {
    var slot = el && el.querySelector('[data-status]');
    if (slot) whenSlot(slot, e, small);
  }

  // Dates in the page's language (the HTML carries an English fallback)
  events.forEach(function (e) {
    [e.card, e.row, e.spot].forEach(function (el) {
      if (!el) return;
      var w = el.querySelector('[data-when]');
      if (w) w.textContent = when(e, w.hasAttribute('data-time-only'));
      var m = el.querySelector('[data-month]');
      if (m) m.textContent = fmtMonthShort.format(e.startDate);
      var d = el.querySelector('[data-day]');
      if (d) d.textContent = e.dateTbc ? '?' : fmtDayNum.format(e.startDate);
    });
  });

  // ---- Carousel: Recommended by us -------------------------------------------------------------------------
  // The deck itself (scroll-snap track, ‹ › dots counter and auto-advance ring) is shared with the events page's
  // "Check This Out!" and lives in carousel.js (window.siteDeck).
  function Deck(el) {
    return window.siteDeck(el, { prev: S.prevEvent, next: S.nextEvent, pause: S.pause, play: S.play });
  }

  // ---- Recommended / Upcoming ---------------------------------------------------------------------------

  var picks = root.querySelector('[data-picks]');
  var picksDeck = picks ? new Deck(picks.querySelector('[data-deck]')) : null;
  var cardList = root.querySelector('[data-upcoming-cards]');
  var rowList = root.querySelector('[data-upcoming-list]');
  var upcomingEmpty = root.querySelector('[data-upcoming-empty]');
  var view = 'cards';
  var upcomingEvents = [];
  var shownUpcoming = 0;

  // Search over the upcoming events, like the Events page: every word typed must appear somewhere in the event.
  // Case, accents and full-width letters don't matter. Kept in the address (?q=…) so a search can be shared.
  var searchInput = root.querySelector('[data-search]');
  var searchStatus = root.querySelector('[data-search-status]');
  var searchCount = searchStatus.querySelector('.events-count');
  var searchEmpty = root.querySelector('[data-search-empty]');
  var searchAnnounce = root.querySelector('[data-search-announce]');
  function fold(text) { return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  events.forEach(function (e) { e.searchText = fold(e.search || ''); });
  function searchTerms() { return fold(searchInput.value).split(/\s+/).filter(Boolean); }

  function sortEvents(now) {
    var today = dayKey(now);
    var upcoming = [];
    var picksLeft = 0;
    events.forEach(function (e) {
      e.status = statusOf(e, now, today);
      if (e.card) setWhen(e.card, e);
      if (e.row) setWhen(e.row, e, true);
      if (e.spot) {
        e.spot.hidden = e.status === 'past';
        if (!e.spot.hidden) picksLeft++;
        setWhen(e.spot, e);
      }
      if (e.status !== 'past') upcoming.push(e);
    });
    if (picks) picks.hidden = !picksLeft;

    upcomingEvents = upcoming;
    applySearch();
    if (picksDeck) picksDeck.refresh();
  }

  // Which cards and rows show: past events never; the others when they match the search
  function applySearch() {
    var terms = searchTerms();
    shownUpcoming = 0;
    events.forEach(function (e) {
      var past = e.status === 'past';
      var match = terms.every(function (t) { return e.searchText.indexOf(t) !== -1; });
      if (!past && match) shownUpcoming++;
      if (e.card) e.card.hidden = past || !match;
      if (e.row) e.row.hidden = past || !match;
    });

    var any = upcomingEvents.length > 0;
    var message = (shownUpcoming === 1 ? searchCount.dataset.single : searchCount.dataset.plural).replace('{n}', shownUpcoming);
    upcomingEmpty.hidden = any;
    searchEmpty.hidden = !any || shownUpcoming > 0;
    searchStatus.hidden = !any || shownUpcoming === 0;
    searchCount.textContent = message;
    searchStatus.querySelector('[data-search-clear]').hidden = !terms.length;
    searchAnnounce.textContent = terms.length ? message : '';
    cardList.hidden = view !== 'cards' || !shownUpcoming;
    rowList.hidden = view !== 'list' || !shownUpcoming;

    var params = new URLSearchParams(location.search);
    if (searchInput.value.trim()) params.set('q', searchInput.value.trim()); else params.delete('q');
    var query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
  }

  searchInput.addEventListener('input', function () {
    root.classList.add('hp-typing');
    applySearch();
  });
  root.querySelectorAll('[data-search-clear]').forEach(function (button) {
    button.addEventListener('click', function () {
      transition(function () { searchInput.value = ''; applySearch(); });
      searchInput.focus();
    });
  });
  var startQuery = new URLSearchParams(location.search).get('q');
  if (startQuery) searchInput.value = startQuery;

  // Cards / List switch, remembered on this device
  var viewButtons = root.querySelectorAll('[data-view]');
  function setView(value) {
    view = value;
    viewButtons.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false'); });
    cardList.hidden = view !== 'cards' || !shownUpcoming;
    rowList.hidden = view !== 'list' || !shownUpcoming;
    try { localStorage.setItem('happening-view', view); } catch (err) { /* private mode */ }
  }
  viewButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.view === view) return;
      transition(function () { setView(b.dataset.view); });
    });
  });

  // ---- Add to calendar (.ics) ----------------------------------------------------------------------------

  function icsText(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function icsStamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  // Lines over 75 octets are folded onto continuation lines that start with a space.
  function icsFold(line) {
    var out = [];
    var chunk = '';
    var bytes = 0;
    Array.from(line).forEach(function (ch) {
      var size = new TextEncoder().encode(ch).length;
      if (bytes + size > 73) { out.push(chunk); chunk = ''; bytes = 0; }
      chunk += ch;
      bytes += size;
    });
    out.push(chunk);
    return out.join('\r\n ');
  }
  function downloadIcs(e) {
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tasmania Welcome//Happening//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + e.id + '@tasmania-welcome',
      'DTSTAMP:' + icsStamp(new Date()),
      // All-day events use calendar dates; the end date is the day after the last one
      e.allDay ? 'DTSTART;VALUE=DATE:' + e.startKey.replace(/-/g, '') : 'DTSTART:' + icsStamp(e.startDate),
      e.allDay ? 'DTEND;VALUE=DATE:' + addDays(e.endKey, 1).replace(/-/g, '') : 'DTEND:' + icsStamp(e.endDate),
      'SUMMARY:' + icsText(e.title),
      'DESCRIPTION:' + icsText(e.summary + (e.url ? '\n\n' + e.url : '')),
      'LOCATION:' + icsText(e.format === 'online' ? S.online : e.location)
    ];
    if (e.url) lines.push('URL:' + e.url);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    var blob = new Blob([lines.map(icsFold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = e.id + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  root.querySelectorAll('[data-ics]').forEach(function (button) {
    var e = byId[button.dataset.ics];
    if (!e || e.dateTbc) return;
    button.hidden = false;
  });
  root.addEventListener('click', function (ev) {
    var button = ev.target.closest('[data-ics]');
    if (button && byId[button.dataset.ics]) downloadIcs(byId[button.dataset.ics]);
  });

  // ---- Calendar ------------------------------------------------------------------------------------------

  var cal = root.querySelector('[data-calendar]');

  // Everything that falls on a day: upcoming events on every day they run (events longer than a week, like a
  // month-long hackathon, only on their first and last day so they don't fill the month), archive events on their date
  var dayItems = {};
  var tbcByMonth = {};
  function addItem(key, item) { (dayItems[key] = dayItems[key] || []).push(item); }
  events.forEach(function (e) {
    if (e.dateTbc) {
      (tbcByMonth[e.startKey.slice(0, 7)] = tbcByMonth[e.startKey.slice(0, 7)] || []).push(e);
      return;
    }
    if (e.endKey > addDays(e.startKey, 6)) {
      addItem(e.startKey, { event: e });
      addItem(e.endKey, { event: e });
      return;
    }
    for (var k = e.startKey; k <= e.endKey; k = addDays(k, 1)) addItem(k, { event: e });
  });
  data.archive.forEach(function (a) { addItem(a.date, { archive: a }); });
  Object.keys(dayItems).forEach(function (k) {
    dayItems[k].sort(function (x, y) { return (x.event ? x.event.startDate : 0) - (y.event ? y.event.startDate : 0); });
  });

  var years = [dayKey(new Date()).slice(0, 4)];
  Object.keys(dayItems).forEach(function (k) { years.push(k.slice(0, 4)); });
  Object.keys(tbcByMonth).forEach(function (k) { years.push(k.slice(0, 4)); });
  var minYear = Math.min.apply(null, years.map(Number));
  var maxYear = Math.max.apply(null, years.map(Number)) + 1;

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (name) {
      if (attrs[name] === false || attrs[name] == null) return;
      if (name === 'text') el.textContent = attrs[name];
      else if (name === 'html') el.innerHTML = attrs[name];
      else el.setAttribute(name, attrs[name] === true ? '' : attrs[name]);
    });
    (children || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function option(value, label) { return h('option', { value: value, text: label }); }

  var calView = 'month';
  try { calView = localStorage.getItem('happening-cal-view') === 'week' ? 'week' : 'month'; } catch (err) { /* private mode */ }
  var cursor;    // a day inside the period on screen
  var selected;  // the day whose events are listed under the grid
  var today;

  var prevBtn = h('button', { type: 'button', class: 'cal-arrow', html: '<span aria-hidden="true">‹</span>' });
  var nextBtn = h('button', { type: 'button', class: 'cal-arrow', html: '<span aria-hidden="true">›</span>' });
  var todayBtn = h('button', { type: 'button', class: 'cal-today-btn', text: S.today });
  var title = h('h3', { class: 'cal-title', 'aria-live': 'polite' });
  var yearSel = h('select', { class: 'cal-select', 'aria-label': S.year });
  var monthSel = h('select', { class: 'cal-select', 'aria-label': S.month });
  var weekSel = h('select', { class: 'cal-select cal-select--week', 'aria-label': S.week });
  var viewBtns = ['month', 'week'].map(function (v) {
    return h('button', { type: 'button', class: 'cal-view-btn', 'data-cal-view': v, text: S[v] });
  });
  for (var y = minYear; y <= maxYear; y++) yearSel.appendChild(option(String(y), String(y)));
  for (var m = 1; m <= 12; m++) monthSel.appendChild(option(pad(m), keyMonthName.format(new Date(Date.UTC(2026, m - 1, 1)))));

  var weekdays = h('div', { class: 'cal-weekdays', 'aria-hidden': 'true' });
  for (var i = 0; i < 7; i++) weekdays.appendChild(h('span', { text: keyWeekdayShort.format(new Date(keyTime(addDays('2026-11-02', i)))) }));
  var tbcStrip = h('div', { class: 'cal-tbc', hidden: true });
  var grid = h('div', { class: 'cal-grid' });
  var legend = h('div', { class: 'cal-legend', 'aria-hidden': 'true' }, [
    h('span', { class: 'cal-key cal-key--today', text: S.today }),
    h('span', { class: 'cal-key cal-key--upcoming', text: S.upcoming }),
    h('span', { class: 'cal-key cal-key--past', text: S.past })
  ]);
  var panelTitle = h('h4', { class: 'cal-panel-title' });
  var panelList = h('ol', { class: 'hp-list cal-panel-list' });
  var panel = h('div', { class: 'cal-panel', 'aria-live': 'polite' }, [panelTitle, panelList]);

  cal.innerHTML = '';
  cal.appendChild(h('div', { class: 'cal-toolbar' }, [
    h('div', { class: 'cal-nav' }, [prevBtn, todayBtn, nextBtn, title]),
    h('div', { class: 'cal-controls' }, [
      h('div', { class: 'cal-pickers' }, [yearSel, monthSel, weekSel]),
      h('div', { class: 'cal-view-toggle', role: 'group', 'data-segmented': true }, viewBtns)
    ])
  ]));
  cal.appendChild(tbcStrip);
  var board = h('div', { class: 'cal-board' }, [weekdays, grid]);
  cal.appendChild(board);
  cal.appendChild(legend);
  cal.appendChild(panel);

  // The days on screen: whole weeks covering the month, or the one week
  function visibleDays() {
    var first = calView === 'month' ? mondayOf(monthStart(cursor)) : mondayOf(cursor);
    var last = calView === 'month' ? addDays(mondayOf(monthEnd(cursor)), 6) : addDays(first, 6);
    var days = [];
    for (var k = first; k <= last; k = addDays(k, 1)) days.push(k);
    return days;
  }

  function itemStatus(item) {
    if (item.archive) return 'past';
    return item.event.status === 'past' ? 'past' : isNow(item.event.status) ? 'now' : 'upcoming';
  }

  function chip(item, withTime) {
    var status = itemStatus(item);
    var text = item.archive ? item.archive.title : item.event.title;
    var time = withTime && item.event && !item.event.allDay && item.event.startKey === item.event.endKey ? fmtTime.format(item.event.startDate) + ' ' : '';
    return h('span', { class: 'cal-chip cal-chip--' + status + (item.archive ? ' cal-chip--archive' : '') }, [
      time ? h('span', { class: 'cal-chip-time', text: time }) : null,
      h('span', { class: 'cal-chip-title', text: text })
    ]);
  }

  function renderGrid() {
    var days = visibleDays();
    var month = cursor.slice(0, 7);
    grid.innerHTML = '';
    grid.className = 'cal-grid cal-grid--' + calView;
    board.className = 'cal-board cal-board--' + calView;
    days.forEach(function (key) {
      var items = dayItems[key] || [];
      var outside = calView === 'month' && key.slice(0, 7) !== month;
      var label = keyFull.format(new Date(keyTime(key))) + (items.length ? ', ' + count(items.length) : '');
      var cell = h('button', {
        type: 'button',
        class: 'cal-day' + (outside ? ' is-outside' : '') + (key === today ? ' is-today' : '') + (key < today ? ' is-past' : '') + (items.length ? ' has-items' : ''),
        'data-day': key,
        'aria-pressed': key === selected ? 'true' : 'false',
        'aria-label': label,
        'aria-current': key === today ? 'date' : false
      });
      var head = h('span', { class: 'cal-day-head', 'aria-hidden': 'true' }, [
        calView === 'week' ? h('span', { class: 'cal-day-weekday', text: keyWeekdayShort.format(new Date(keyTime(key))) }) : null,
        h('span', { class: 'cal-day-num', text: keyDayNum.format(new Date(keyTime(key))) })
      ]);
      cell.appendChild(head);
      var body = h('span', { class: 'cal-day-items', 'aria-hidden': 'true' });
      var limit = calView === 'month' ? 2 : items.length;
      items.slice(0, limit).forEach(function (item) { body.appendChild(chip(item, calView === 'week')); });
      if (items.length > limit) body.appendChild(h('span', { class: 'cal-more', text: S.more.replace('{n}', items.length - limit) }));
      cell.appendChild(body);
      grid.appendChild(cell);
    });

    // Events with only a month so far sit above the grid
    var tbc = calView === 'month' ? (tbcByMonth[month] || []).filter(function (e) { return e.status !== 'past'; }) : [];
    tbcStrip.hidden = !tbc.length;
    tbcStrip.innerHTML = '';
    if (tbc.length) {
      tbcStrip.appendChild(h('span', { class: 'cal-tbc-label', text: S.tbcThisMonth }));
      tbc.forEach(function (e) { tbcStrip.appendChild(h('a', { href: '#event-' + e.id, class: 'cal-chip cal-chip--upcoming', text: e.title })); });
    }
  }

  // The selected day's events, in the same rows as the Upcoming list view
  function panelItem(item) {
    var e = item.event;
    var a = item.archive;
    var startDate = e ? e.startDate : new Date(keyTime(a.date));
    var monthFmt = e ? fmtMonthShort : keyMonthShort;
    var dayFmt = e ? fmtDayNum : keyDayNum;
    var status = itemStatus(item);
    var actions = [];
    if (e && e.url) {
      actions.push(h('a', { class: 'hp-row-link', href: e.url, target: '_blank', rel: 'noopener' }, [
        S.official + ' ', h('span', { 'aria-hidden': 'true', text: '↗' }), h('span', { class: 'sr-only', text: ' (' + S.newTab + ')' })
      ]));
    }
    if (e && status !== 'past' && !e.dateTbc) actions.push(h('button', { type: 'button', class: 'hp-row-more', 'data-ics': e.id, text: S.addToCalendar }));
    var howItWent = a ? a.url : e.previous;
    if (howItWent) actions.push(h('a', { class: a ? 'hp-row-link hp-row-link--ghost' : 'hp-row-more', href: howItWent, text: S.seeHowItWent + ' →' }));

    return h('li', { class: 'hp-row' + (status === 'past' ? ' hp-row--past' : '') }, [
      h('span', { class: 'hp-row-date' }, [
        h('span', { class: 'hp-row-month', text: monthFmt.format(startDate) }),
        h('span', { class: 'hp-row-day', text: e && e.dateTbc ? '?' : dayFmt.format(startDate) })
      ]),
      h('span', { class: 'hp-row-main' }, [
        h('span', { class: 'hp-row-title', text: e ? e.title : a.title }),
        (e ? e.host : S.archived) ? h('span', { class: 'hp-row-host', text: e ? e.host : S.archived }) : null
      ]),
      h('span', { class: 'hp-row-place', text: e ? (e.format === 'online' ? S.online : e.location) : '' }),
      h('span', { class: 'hp-row-when' }, [
        e ? h('time', { datetime: e.start, text: when(e, true) }) : null,
        e ? (function () { var slot = h('span', { class: 'hp-when-slot' }); whenSlot(slot, status === 'past' ? { status: 'past' } : e, true); return slot; })() : null
      ]),
      h('span', { class: 'hp-row-actions' }, actions)
    ]);
  }

  function renderPanel() {
    panelTitle.textContent = keyFull.format(new Date(keyTime(selected)));
    panelList.innerHTML = '';
    var items = dayItems[selected] || [];
    if (!items.length) panelList.appendChild(h('li', { class: 'cal-panel-none', text: S.noEvents }));
    items.forEach(function (item) { panelList.appendChild(panelItem(item)); });
  }

  function renderControls() {
    var first = mondayOf(cursor);
    title.textContent = calView === 'month'
      ? keyMonthYear.format(new Date(keyTime(cursor)))
      : range(keyDayMonthYear, new Date(keyTime(first)), new Date(keyTime(addDays(first, 6))));
    prevBtn.setAttribute('aria-label', calView === 'month' ? S.prevMonth : S.prevWeek);
    nextBtn.setAttribute('aria-label', calView === 'month' ? S.nextMonth : S.nextWeek);
    yearSel.value = cursor.slice(0, 4);
    monthSel.value = cursor.slice(5, 7);
    viewBtns.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.calView === calView ? 'true' : 'false'); });

    // Week picker: the weeks that touch the chosen month
    weekSel.hidden = calView !== 'week';
    weekSel.innerHTML = '';
    var start = mondayOf(monthStart(cursor));
    for (var k = start; k <= monthEnd(cursor); k = addDays(k, 7)) {
      weekSel.appendChild(option(k, range(keyDayMonth, new Date(keyTime(k)), new Date(keyTime(addDays(k, 6))))));
    }
    weekSel.value = first;
    if (weekSel.value !== first) { // a week that starts in the previous month
      weekSel.insertBefore(option(first, range(keyDayMonth, new Date(keyTime(first)), new Date(keyTime(addDays(first, 6))))), weekSel.firstChild);
      weekSel.value = first;
    }
  }

  // Keep the selected day on screen: today if it's showing, else the first day with something on, else the first day
  function settleSelection() {
    var days = visibleDays().filter(function (k) { return calView === 'week' || k.slice(0, 7) === cursor.slice(0, 7); });
    if (days.indexOf(selected) !== -1) return;
    selected = days.indexOf(today) !== -1 ? today
      : days.filter(function (k) { return dayItems[k]; })[0] || days[0];
  }

  function render() {
    settleSelection();
    renderControls();
    renderGrid();
    renderPanel();
  }

  // Moving the calendar slides the month or week in the direction of travel (cal-board keyframes in custom.css)
  function go(key, direction) {
    var dir = direction || (key > cursor ? 'next' : key < cursor ? 'prev' : 'fade');
    var html = document.documentElement;
    board.dataset.vt = 'cal-board';
    html.dataset.calSlide = dir;
    var t = transition(function () { cursor = key; render(); }, [board]);
    var done = function () { delete html.dataset.calSlide; };
    if (t) t.finished.then(done, done); else done();
  }

  prevBtn.addEventListener('click', function () { go(calView === 'month' ? addMonths(cursor, -1) : addDays(cursor, -7)); });
  nextBtn.addEventListener('click', function () { go(calView === 'month' ? addMonths(cursor, 1) : addDays(cursor, 7)); });
  todayBtn.addEventListener('click', function () { selected = today; go(today); });
  yearSel.addEventListener('change', function () { go(yearSel.value + '-' + monthSel.value + '-01'); });
  monthSel.addEventListener('change', function () { go(yearSel.value + '-' + monthSel.value + '-01'); });
  weekSel.addEventListener('change', function () { go(weekSel.value); });
  viewBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.calView === calView) return;
      calView = b.dataset.calView;
      try { localStorage.setItem('happening-cal-view', calView); } catch (err) { /* private mode */ }
      // Switching to week view opens the week of the selected day
      go(calView === 'week' && selected ? selected : cursor, 'fade');
    });
  });
  grid.addEventListener('click', function (ev) {
    var cell = ev.target.closest('[data-day]');
    if (!cell) return;
    selected = cell.dataset.day;
    grid.querySelectorAll('[data-day]').forEach(function (c) { c.setAttribute('aria-pressed', c === cell ? 'true' : 'false'); });
    renderPanel();
  });

  // ---- Start, and keep up as the clock moves on ----------------------------------------------------------

  // Every minute the events are re-sorted; the calendar is only redrawn when the date changes,
  // so it doesn't move under someone who is using it.
  // ?at=2026-11-08T10:00 shows the page as it will look at that moment (for checking pinned events, Happening Now…);
  // the preview clock then runs on from there
  function refresh() {
    var now = clockNow();
    var newToday = dayKey(now);
    sortEvents(now);
    if (newToday === today) return;
    var follow = !cursor || cursor.slice(0, 7) === (today || newToday).slice(0, 7);
    today = newToday;
    if (follow) { cursor = today; selected = today; }
    render();
  }

  try { if (localStorage.getItem('happening-view') === 'list') view = 'list'; } catch (err) { /* private mode */ }
  refresh();
  setView(view);
  setInterval(refresh, 60000);

  // Flip clocks, every second: drop the ones no longer on the page, turn the rest over, and re-sort as soon as
  // one reaches zero so the card says "Happening Now" right away. Skipped while the tab is in the background.
  function tick() {
    if (document.hidden) return;
    var now = clockNow();
    var started = false;
    clocks = clocks.filter(function (c) { return c.el.isConnected; });
    clocks.forEach(function (c) { if (renderClock(c, now, true) === 0) started = true; });
    if (started) refresh();
  }
  setInterval(tick, 1000);
})();
