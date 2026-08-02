// Central timezone helper for the "The Ivy School" attendance system.
//
// The app stores times as naive local strings ("YYYY-MM-DD HH:MM:SS") in the
// *configured* school timezone (settings `school_timezone`), overriding SQLite's
// default `datetime('now')` (which is UTC). This file is the single source of
// truth so every scan, created_at and audit timestamp is consistent.
//
// Active timezone resolution order:
//   1. settings.school_timezone  (refreshed by initTimezone() at startup)
//   2. env APP_TIMEZONE
//   3. server local timezone (Intl)
//   4. UTC (fallback)

const { getSetting } = require('../db/schema');

let activeTz = null;
const p = (n) => String(n).padStart(2, '0');

function validTz(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

function effectiveTz() {
  if (activeTz && validTz(activeTz)) return activeTz;
  if (validTz(process.env.APP_TIMEZONE)) return process.env.APP_TIMEZONE;
  try {
    const l = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (validTz(l)) return l;
  } catch (e) {
    // ignore
  }
  return 'UTC';
}

// partsFor returns {year, month, day, hour, minute, second} in the active tz.
const cache = new Map();
function partsFor(d, tz) {
  let fmt = cache.get(tz);
  if (!fmt) { fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); cache.set(tz, fmt); }
  const m = {};
  for (const part of fmt.formatToParts(d)) if (part.type !== 'literal') m[part.type] = part.value;
  return m;
}

// Refresh activeTz from the settings table. Called at startup after the schema
// exists, and again whenever the timezone setting is changed.
async function initTimezone() {
  try {
    const stored = await getSetting('school_timezone', null);
    activeTz = (stored && validTz(stored)) ? stored : null;
  } catch (e) {
    activeTz = null;
  }
}

function setTimezone(tz) {
  activeTz = (tz && validTz(tz)) ? tz : null;
}

// "YYYY-MM-DD HH:MM:SS" in the active timezone.
function nowStr() {
  const tz = effectiveTz();
  const m = partsFor(new Date(), tz);
  return `${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute}:${m.second}`;
}

// "YYYY-MM-DD" in the active timezone.
function todayStr() {
  const tz = effectiveTz();
  const m = partsFor(new Date(), tz);
  return `${m.year}-${m.month}-${m.day}`;
}

// Convert a UTC SQLite timestamp (datetime('now')) to the active local string.
// Accepts 'YYYY-MM-DD HH:MM:SS'. If the value already carries a timezone offset
// (ISO with 'Z' or '+HH:MM') it is shifted to the active timezone too.
function toLocalSql(value) {
  if (!value) return value;
  const s = String(value).trim();
  if (s.length >= 19 && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) {
    let date;
    if (/[a-zA-Z]$/.test(s)) {
      // "YYYY-MM-DD HH:MM:SS" with trailing "Z"/utc marker
      date = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19)));
    } else {
      // naive -> assume UTC (came from datetime('now'))
      date = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19)));
    }
    return formatDate(date, effectiveTz());
  }
  return value;
}

function formatDate(d, tz) {
  const m = partsFor(d, tz);
  return `${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute}:${m.second}`;
}

// Convert a (possibly ISO-with-offset) string to a naive local DB string.
function toDbString(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value; // already a naive local string
  return formatDate(d, effectiveTz());
}

module.exports = {
  nowStr,
  todayStr,
  toLocalSql,
  toDbString,
  initTimezone,
  setTimezone,
  effectiveTz
};