/**
 * Communication Schedule - Weekday briefings and weekend reviews
 */

function scheduledTouchpoint() {
  const dayOfWeek = new Date().getDay();
  logSystem('Schedule', `Running touchpoint (day: ${dayOfWeek})`);
  if (CONFIG.SCHEDULE.WEEKEND.DAYS.includes(dayOfWeek)) weekendReview();
  else if (CONFIG.SCHEDULE.WEEKDAY.DAYS.includes(dayOfWeek)) weekdayBriefing();
}

function weekdayBriefing() {
  logSystem('Schedule', 'Starting weekday briefing');
  try {
    const briefing = [], now = new Date();
    briefing.push(`*${Utilities.formatDate(now, CONFIG.SETTINGS.TIMEZONE, 'EEEE, MMMM d')}*\n`);
    
    const criticalItems = getCriticalItems();
    if (criticalItems.length > 0) {
      briefing.push('*CRITICAL ATTENTION*');
      for (const item of criticalItems.slice(0, 5)) briefing.push(`${item.emoji} ${escapeMarkdown(item.summary)}`);
      briefing.push('');
    }
    
    const todayEvents = getTodayEvents();
    briefing.push(`*TODAY'S SCHEDULE* (${todayEvents.length} events)`);
    if (todayEvents.length > 0) for (const e of todayEvents.slice(0, 5)) briefing.push(`  ${Utilities.formatDate(e.start, CONFIG.SETTINGS.TIMEZONE, 'h:mm a')}: ${escapeMarkdown(e.title)}`);
    else briefing.push('  No events');
    briefing.push('');
    
    const pending = getPendingConfirmations();
    if (pending.total > 0) { briefing.push(`*PENDING DECISIONS* (${pending.total})`); for (const [t, c] of Object.entries(pending.byType)) briefing.push(`  • ${t}: ${c}`); briefing.push(''); }
    
    const stats = getQuickStats();
    briefing.push('*INBOX SNAPSHOT*');
    briefing.push(`  Unread: ${stats.unread} | High Priority: ${stats.highPriority}`);
    briefing.push(`  Kids/School: ${stats.kidsSchool} | Masonic: ${stats.masonic}`);
    
    sendTelegramMessage(briefing.join('\n'), getQuickActionKeyboard());
    logSystem('Schedule', 'Briefing sent');
  } catch (e) { logSystem('Schedule', `Briefing error: ${e.message}`, 'ERROR'); sendTelegramMessage(`Briefing error: ${e.message}`, null); }
}

function weekendReview() {
  logSystem('Schedule', 'Starting weekend review');
  try {
    const review = [];
    review.push('*WEEKLY REVIEW*\n');
    
    const weekStats = getWeekStats();
    review.push('*THIS WEEK SUMMARY*');
    review.push(`  Emails processed: ${weekStats.emailsProcessed}`);
    review.push(`  Decisions made: ${weekStats.decisionsMade}`);
    review.push('');
    
    const cleanup = getHistoricalCleanupProgress();
    review.push('*HISTORICAL CLEANUP*');
    review.push(`  Total backlog: ${cleanup.total}`);
    review.push(`  Processed this week: ${cleanup.processedThisWeek}`);
    review.push(`  Remaining: ${cleanup.remaining}`);
    review.push('');
    
    const upcoming = getUpcomingWeekEvents();
    review.push(`*UPCOMING WEEK* (${upcoming.length} events)`);
    const byDay = groupEventsByDay(upcoming);
    for (const [day, events] of Object.entries(byDay).slice(0, 5)) {
      review.push(`  *${day}*: ${events.length} events`);
      for (const e of events.slice(0, 3)) review.push(`    • ${escapeMarkdown(e.title)}`);
    }
    review.push('');
    
    const pending = getPendingConfirmations();
    if (pending.total > 0) { review.push(`*ALL PENDING (${pending.total})*`); for (const item of pending.items.slice(0, 10)) review.push(`  • ${item.type}: ${escapeMarkdown(item.subject.substring(0, 40))}`); }
    
    const msg = review.join('\n');
    if (msg.length > 4000) { const chunks = splitMessage(msg, 4000); for (const c of chunks) { sendTelegramMessage(c, null); Utilities.sleep(1000); } }
    else sendTelegramMessage(msg, getWeekendActionKeyboard());
    logSystem('Schedule', 'Weekend review sent');
  } catch (e) { logSystem('Schedule', `Review error: ${e.message}`, 'ERROR'); sendTelegramMessage(`Review error: ${e.message}`, null); }
}

function getCriticalItems() {
  const items = [];
  for (const t of GmailApp.search('is:unread label:HUB-Kids-School', 0, 10)) { const m = t.getMessages()[t.getMessageCount() - 1]; items.push({ type: 'KIDS_SCHOOL', emoji: '🏫', summary: `${extractName(m.getFrom())}: ${m.getSubject()}`, messageId: m.getId() }); }
  for (const t of GmailApp.search('is:unread label:HUB-Kids-Medical', 0, 10)) { const m = t.getMessages()[t.getMessageCount() - 1]; items.push({ type: 'KIDS_MEDICAL', emoji: '🏥', summary: `${extractName(m.getFrom())}: ${m.getSubject()}`, messageId: m.getId() }); }
  for (const t of GmailApp.search('is:unread label:HUB-Action', 0, 5)) { const m = t.getMessages()[t.getMessageCount() - 1]; items.push({ type: 'ACTION', emoji: '⚡', summary: m.getSubject(), messageId: m.getId() }); }
  return items;
}

function getQuickStats() {
  return {
    unread: GmailApp.getInboxUnreadCount(),
    highPriority: GmailApp.search('is:unread (label:HUB-Action OR label:HUB-VIP)').length,
    kidsSchool: GmailApp.search('is:unread label:HUB-Kids-School').length,
    masonic: GmailApp.search('is:unread (label:HUB-Masonic OR label:HUB-ScottishRite OR label:HUB-MasonicAppendant)').length
  };
}

function getWeekStats() {
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const sheet = SpreadsheetApp.getActiveSpreadsheet()?.getSheetByName('LearningLog');
  let decisions = 0;
  if (sheet) { const data = sheet.getDataRange().getValues(); for (let i = 1; i < data.length; i++) if (new Date(data[i][0]) >= weekAgo) decisions++; }
  return { emailsProcessed: GmailApp.search('label:HUB-Processed newer_than:7d').length, decisionsMade: decisions };
}

function getHistoricalCleanupProgress() {
  const unprocessed = GmailApp.search('-label:HUB-Processed older_than:7d'), processed = GmailApp.search('label:HUB-Processed newer_than:7d').length;
  let oldest = null;
  if (unprocessed.length > 0) { const m = unprocessed[unprocessed.length - 1].getMessages()[0]; oldest = Utilities.formatDate(m.getDate(), CONFIG.SETTINGS.TIMEZONE, 'MMM d, yyyy'); }
  return { total: unprocessed.length + processed, processedThisWeek: processed, remaining: unprocessed.length, oldestUnprocessed: oldest };
}

function getUpcomingWeekEvents() {
  const now = new Date(), weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), allEvents = [];
  try { const cal = CalendarApp.getCalendarById(CONFIG.CALENDARS.DARKHORSE); if (cal) for (const e of cal.getEvents(now, weekFromNow)) allEvents.push({ calendar: 'DarkHorse', title: e.getTitle(), start: e.getStartTime(), end: e.getEndTime() }); } catch (e) {}
  try { const cal = CalendarApp.getCalendarById(CONFIG.CALENDARS.PERSONAL); if (cal) for (const e of cal.getEvents(now, weekFromNow)) allEvents.push({ calendar: 'Personal', title: e.getTitle(), start: e.getStartTime(), end: e.getEndTime() }); } catch (e) {}
  return allEvents.sort((a, b) => a.start - b.start);
}

function groupEventsByDay(events) {
  const byDay = {};
  for (const e of events) { const day = Utilities.formatDate(e.start, CONFIG.SETTINGS.TIMEZONE, 'EEE, MMM d'); if (!byDay[day]) byDay[day] = []; byDay[day].push(e); }
  return byDay;
}

function getQuickActionKeyboard() {
  return { inline_keyboard: [[{ text: 'Show Pending', callback_data: 'show_pending' }, { text: 'Show Critical', callback_data: 'show_critical' }], [{ text: 'Approve All Low', callback_data: 'approve_all_low' }, { text: 'Done', callback_data: 'done' }]] };
}

function getWeekendActionKeyboard() {
  return { inline_keyboard: [[{ text: 'Start Cleanup', callback_data: 'start_cleanup' }, { text: 'Review Pending', callback_data: 'review_pending' }], [{ text: 'Plan Week', callback_data: 'plan_week' }, { text: 'Done', callback_data: 'done' }]] };
}

function splitMessage(msg, maxLen) {
  const chunks = []; let current = '';
  for (const line of msg.split('\n')) { if ((current + line + '\n').length > maxLen) { chunks.push(current); current = line + '\n'; } else current += line + '\n'; }
  if (current) chunks.push(current);
  return chunks;
}
