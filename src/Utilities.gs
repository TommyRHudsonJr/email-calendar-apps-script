/**
 * Utility Functions for Email-Calendar Manager
 */

function extractLocation(text) {
  const patterns = [/(?:location|where|venue|address)[:\s]+(.+?)(?:\n|$)/i, /(?:at|@)\s+(.+?)(?:\n|,|$)/i];
  for (const p of patterns) { const m = text.match(p); if (m) return m[1].trim(); }
  return '';
}

function extractCalendarEvents(subject, body, emailDate) {
  const events = [], text = subject + ' ' + body;
  const datePatterns = [/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/gi, /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g, /\b(tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi];
  const calendarKeywords = KEYWORDS.CALENDAR;
  if (calendarKeywords.some(kw => text.toLowerCase().includes(kw))) {
    const event = { title: subject, date: null, time: null, location: extractLocation(body), source: 'email' };
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) { event.dateStr = match[0]; event.start = parseEventDate(match[0], emailDate); event.end = event.start ? new Date(event.start.getTime() + 60 * 60 * 1000) : null; break; }
    }
    if (event.start) events.push(event);
  }
  return events;
}

function parseEventDate(dateStr, refDate) {
  const lower = dateStr.toLowerCase();
  if (lower === 'tomorrow') { const d = new Date(refDate); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }
  const dayMatch = lower.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (dayMatch) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = days.indexOf(dayMatch[1]), d = new Date(refDate), currentDay = d.getDay();
    let daysUntil = targetDay - currentDay; if (daysUntil <= 0) daysUntil += 7;
    d.setDate(d.getDate() + daysUntil); d.setHours(9, 0, 0, 0); return d;
  }
  const monthMatch = dateStr.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/i);
  if (monthMatch) {
    const months = {'jan':0,'january':0,'feb':1,'february':1,'mar':2,'march':2,'apr':3,'april':3,'may':4,'jun':5,'june':5,'jul':6,'july':6,'aug':7,'august':7,'sep':8,'september':8,'oct':9,'october':9,'nov':10,'november':10,'dec':11,'december':11};
    const month = months[monthMatch[1].toLowerCase()], day = parseInt(monthMatch[2]), year = monthMatch[3] ? parseInt(monthMatch[3]) : refDate.getFullYear();
    return new Date(year, month, day, 9, 0, 0);
  }
  const numMatch = dateStr.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (numMatch) { let month = parseInt(numMatch[1]) - 1, day = parseInt(numMatch[2]), year = parseInt(numMatch[3]); if (year < 100) year += 2000; return new Date(year, month, day, 9, 0, 0); }
  return null;
}

function checkCalendarConflicts(startTime, endTime) {
  const conflicts = [];
  try {
    const dhCal = CalendarApp.getCalendarById(CONFIG.CALENDARS.DARKHORSE);
    if (dhCal) { for (const e of dhCal.getEvents(startTime, endTime)) conflicts.push({ calendar: 'DarkHorse', title: e.getTitle(), start: e.getStartTime(), end: e.getEndTime() }); }
  } catch (e) {}
  try {
    const pCal = CalendarApp.getCalendarById(CONFIG.CALENDARS.PERSONAL);
    if (pCal) { for (const e of pCal.getEvents(startTime, endTime)) conflicts.push({ calendar: 'Personal', title: e.getTitle(), start: e.getStartTime(), end: e.getEndTime() }); }
  } catch (e) {}
  return conflicts;
}

function getTodayEvents() {
  const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0), end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const allEvents = [];
  try { const dhCal = CalendarApp.getCalendarById(CONFIG.CALENDARS.DARKHORSE); if (dhCal) for (const e of dhCal.getEvents(start, end)) allEvents.push({ calendar: 'DarkHorse', title: e.getTitle(), start: e.getStartTime(), end: e.getEndTime(), location: e.getLocation() }); } catch (e) {}
  try { const pCal = CalendarApp.getCalendarById(CONFIG.CALENDARS.PERSONAL); if (pCal) for (const e of pCal.getEvents(start, end)) allEvents.push({ calendar: 'Personal', title: e.getTitle(), start: e.getStartTime(), end: e.getEndTime(), location: e.getLocation() }); } catch (e) {}
  return allEvents.sort((a, b) => a.start - b.start);
}

function escapeMarkdown(text) { return text ? text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&') : ''; }

function sendTelegramMessage(text, keyboard) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM.BOT_TOKEN}/sendMessage`;
  const payload = { chat_id: CONFIG.TELEGRAM.CHAT_ID, text, parse_mode: 'Markdown' };
  if (keyboard) payload.reply_markup = JSON.stringify(keyboard);
  return JSON.parse(UrlFetchApp.fetch(url, { method: 'POST', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }).getContentText());
}

function getOrCreateSheet(name, headers) {
  let ss = getDataSpreadsheet() || SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) { ss = SpreadsheetApp.create('HUB-EmailCalendar-Data'); PropertiesService.getScriptProperties().setProperty('DATA_SPREADSHEET_ID', ss.getId()); }
  let sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); if (headers) sheet.appendRow(headers); }
  return sheet;
}

function formatDate(date, format) { return Utilities.formatDate(date, CONFIG.SETTINGS.TIMEZONE, format); }
