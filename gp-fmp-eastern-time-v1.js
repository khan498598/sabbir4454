(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.GPFmpEasternTimeV1 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FMP_TIME_ZONE = 'America/New_York';
  var DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
  var NAIVE_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/;
  var EXPLICIT_OFFSET = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
  var formatter = null;

  function utcMilliseconds(parts) {
    // Date.UTC treats years 0-99 as 1900-1999. Building from epoch and setting
    // the full year keeps strict ISO year semantics.
    var date = new Date(0);
    date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
    date.setUTCHours(parts.hour || 0, parts.minute || 0, parts.second || 0, parts.millisecond || 0);
    return date.getTime();
  }

  function hasValidCalendarParts(parts) {
    if (
      parts.month < 1 || parts.month > 12 ||
      parts.day < 1 || parts.day > 31 ||
      parts.hour < 0 || parts.hour > 23 ||
      parts.minute < 0 || parts.minute > 59 ||
      parts.second < 0 || parts.second > 59 ||
      parts.millisecond < 0 || parts.millisecond > 999
    ) return false;

    var date = new Date(utcMilliseconds(parts));
    return date.getUTCFullYear() === parts.year &&
      date.getUTCMonth() + 1 === parts.month &&
      date.getUTCDate() === parts.day &&
      date.getUTCHours() === parts.hour &&
      date.getUTCMinutes() === parts.minute &&
      date.getUTCSeconds() === parts.second &&
      date.getUTCMilliseconds() === parts.millisecond;
  }

  function newYorkFormatter() {
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-US-u-ca-iso8601-nu-latn', {
        timeZone: FMP_TIME_ZONE,
        calendar: 'iso8601',
        numberingSystem: 'latn',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      });
    }
    return formatter;
  }

  function localParts(epochMilliseconds) {
    var result = {};
    var pieces = newYorkFormatter().formatToParts(new Date(epochMilliseconds));
    for (var index = 0; index < pieces.length; index += 1) {
      var piece = pieces[index];
      if (piece.type !== 'literal') result[piece.type] = Number(piece.value);
    }
    return {
      year: result.year,
      month: result.month,
      day: result.day,
      hour: result.hour,
      minute: result.minute,
      second: result.second
    };
  }

  function offsetAt(epochMilliseconds) {
    var wholeSecond = Math.floor(epochMilliseconds / 1000) * 1000;
    var parts = localParts(wholeSecond);
    return utcMilliseconds({
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
      millisecond: 0
    }) - wholeSecond;
  }

  function sameWallClock(actual, expected) {
    return actual.year === expected.year &&
      actual.month === expected.month &&
      actual.day === expected.day &&
      actual.hour === expected.hour &&
      actual.minute === expected.minute &&
      actual.second === expected.second;
  }

  function newYorkWallClockToEpoch(parts) {
    if (!hasValidCalendarParts(parts)) return NaN;

    var wallClockAsUtc = utcMilliseconds(parts);
    var offsets = [];
    // Sampling both sides of the requested wall clock discovers the EST/EDT
    // offsets even on transition days. It also lets us reject nonexistent
    // spring-forward wall times instead of silently moving the candle.
    for (var hours = -36; hours <= 36; hours += 6) {
      var offset = offsetAt(wallClockAsUtc + hours * 60 * 60 * 1000);
      if (offsets.indexOf(offset) === -1) offsets.push(offset);
    }

    var matches = [];
    for (var index = 0; index < offsets.length; index += 1) {
      var candidate = wallClockAsUtc - offsets[index];
      if (sameWallClock(localParts(candidate), parts)) matches.push(candidate);
    }
    if (!matches.length) return NaN;

    // A fall-back hour occurs twice. Choosing the earlier instant is stable and
    // corresponds to the first occurrence of that exchange wall-clock value.
    matches.sort(function (left, right) { return left - right; });
    return matches[0];
  }

  function matchToParts(match) {
    var fraction = match[7] || '';
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4] || 0),
      minute: Number(match[5] || 0),
      second: Number(match[6] || 0),
      millisecond: Number((fraction + '000').slice(0, 3))
    };
  }

  function parseMilliseconds(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return NaN;
      return Math.abs(value) < 100000000000 ? value * 1000 : value;
    }
    if (typeof value !== 'string') return NaN;

    var source = value.trim();
    if (!source) return NaN;

    var dateOnlyMatch = DATE_ONLY.exec(source);
    if (dateOnlyMatch) {
      // FMP EOD dates are calendar labels, not exchange-time instants. UTC
      // midnight preserves the stated date in every browser locale.
      var dateParts = matchToParts(dateOnlyMatch);
      return hasValidCalendarParts(dateParts) ? utcMilliseconds(dateParts) : NaN;
    }

    if (EXPLICIT_OFFSET.test(source)) {
      // Normalize FMP's space separator but preserve the supplied Z/offset.
      var explicit = source
        .replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T')
        .replace(/\s+([zZ]|[+-]\d{2}:?\d{2})$/, '$1');
      return Date.parse(explicit);
    }

    var naiveMatch = NAIVE_DATE_TIME.exec(source);
    if (!naiveMatch) return NaN;
    return newYorkWallClockToEpoch(matchToParts(naiveMatch));
  }

  function parseSeconds(value) {
    var milliseconds = parseMilliseconds(value);
    return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : NaN;
  }

  function parseDate(value) {
    var milliseconds = parseMilliseconds(value);
    return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
  }

  var api = {
    timeZone: FMP_TIME_ZONE,
    parseMilliseconds: parseMilliseconds,
    parseSeconds: parseSeconds,
    parseDate: parseDate
  };
  return typeof Object.freeze === 'function' ? Object.freeze(api) : api;
});
