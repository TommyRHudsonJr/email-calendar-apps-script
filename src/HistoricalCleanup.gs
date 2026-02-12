/**
 * Historical Cleanup - Process email backlog for missed events and actions
 */

function runHistoricalCleanup(batchSize) {
  const maxEmails = batchSize || CONFIG.SETTINGS.MAX_HISTORICAL_PER_RUN;
  logSystem('Cleanup', `Starting batch (max: ${maxEmails})`);
  try {
    const threads = GmailApp.search('-label:HUB-Processed', 0, maxEmails);
    if (threads.length === 0) { logSystem('Cleanup', 'Complete!'); notifyRaven('Historical cleanup complete!'); return { processed: 0, status: 'COMPLETE' }; }
    const stats = { processed: 0, missedEvents: 0, pastDueActions: 0, priorityTagged: 0, conflicts: 0, errors: 0 };
    ensureLabelsExist();
    for (const thread of threads) {
      try {
        const result = processHistoricalThread(thread);
        stats.processed++; stats.missedEvents += result.missedEvents; stats.pastDueActions += result.pastDueActions;
        stats.priorityTagged += result.priorityTagged; stats.conflicts += result.conflicts;
      } catch (e) { stats.errors++; logSystem('Cleanup', `Error: ${e.message}`, 'ERROR'); }
      if (stats.processed % 10 === 0) Utilities.sleep(2000);
    }
    logSystem('Cleanup', `Done: ${stats.processed} processed, ${stats.missedEvents} missed, ${stats.pastDueActions} past-due`);
    if (stats.missedEvents > 0 || stats.pastDueActions > 0) notifyRaven(`*Cleanup Alert*\nMissed: ${stats.missedEvents}\nPast-due: ${stats.pastDueActions}`);
    return { ...stats, status: 'BATCH_COMPLETE' };
  } catch (e) { logSystem('Cleanup', `Fatal: ${e.message}`, 'ERROR'); notifyRaven(`Cleanup error: ${e.message}`); return { processed: 0, status: 'ERROR', error: e.message }; }
}

function processHistoricalThread(thread) {
  const messages = thread.getMessages(), msg = messages[messages.length - 1];
  const result = { missedEvents: 0, pastDueActions: 0, priorityTagged: 0, conflicts: 0 };
  const from = msg.getFrom(), to = msg.getTo(), subject = msg.getSubject(), body = msg.getPlainBody(), emailDate = msg.getDate(), messageId = msg.getId();
  const classification = classifyWithGemini(from, subject, body, to);
  applyLabels(thread, classification);
  if (['CRITICAL', 'HIGH'].includes(classification.level)) {
    result.priorityTagged++;
    const daysSince = Math.floor((new Date() - emailDate) / (1000 * 60 * 60 * 24));
    if (classification.level === 'CRITICAL' && daysSince > 1) notifyRaven(`*MISSED CRITICAL* (${daysSince} days)\nCategory: ${classification.category}\nFrom: ${escapeMarkdown(extractName(from))}\nSubject: ${escapeMarkdown(subject)}`);
  }
  const events = extractCalendarEventsHistorical(subject, body, emailDate);
  for (const event of events) {
    if (event.date < new Date()) { result.missedEvents++; logMissedEvent(event, from, subject, emailDate); }
    else {
      const conflicts = checkCalendarConflicts(event.start, event.end);
      if (conflicts.length > 0) { result.conflicts++; notifyRaven(`*Conflict*\n${escapeMarkdown(event.title)} vs ${escapeMarkdown(conflicts[0].title)}`); }
      queueForConfirmation({ type: 'CREATE_EVENT', emailId: messageId, from, subject, snippet: body.substring(0, 200), classification, proposedAction: 'CREATE_EVENT', calendarEvent: event });
    }
  }
  const actions = extractActionItemsHistorical(subject, body, from, emailDate);
  for (const action of actions) {
    if (action.dueDate && action.dueDate < new Date()) { result.pastDueActions++; logPastDueAction(action, from, subject, emailDate); }
    else saveActionItem(action);
  }
  thread.addLabel(GmailApp.getUserLabelByName('HUB-Processed'));
  logEmail(emailDate, from, to, subject, 'historical', classification);
  return result;
}

function extractCalendarEventsHistorical(subject, body, emailDate) {
  const events = [], text = subject + ' ' + body;
  const monthDayYear = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/gi;
  const dateMatches = [];
  let match;
  while ((match = monthDayYear.exec(text)) !== null) {
    const month = parseMonth(match[1]), day = parseInt(match[2]), year = match[3] ? parseInt(match[3]) : emailDate.getFullYear();
    if (month !== -1) dateMatches.push(new Date(year, month, day));
  }
  if (dateMatches.length > 0 && KEYWORDS.CALENDAR.some(kw => text.toLowerCase().includes(kw))) {
    for (const d of dateMatches) events.push({ title: subject, start: d, end: new Date(d.getTime() + 60 * 60 * 1000), date: d, location: extractLocation(body), source: 'historical' });
  }
  return events;
}

function extractActionItemsHistorical(subject, body, from, emailDate) {
  const actions = [], text = subject + ' ' + body;
  if (!KEYWORDS.ACTION.some(kw => text.toLowerCase().includes(kw))) return actions;
  const deadlineMatch = text.match(/(?:by|before|due|deadline)[:\s]+([^.\n]+)/i);
  let dueDate = null;
  if (deadlineMatch) dueDate = parseDeadline(deadlineMatch[1], emailDate);
  actions.push({ item: subject, priority: dueDate && dueDate < new Date() ? 'high' : 'medium', dueDate, source: from, sourceSubject: subject, sourceDate: emailDate, status: dueDate && dueDate < new Date() ? 'PAST_DUE' : 'PENDING' });
  return actions;
}

function parseMonth(monthStr) {
  const months = {'jan':0,'january':0,'feb':1,'february':1,'mar':2,'march':2,'apr':3,'april':3,'may':4,'jun':5,'june':5,'jul':6,'july':6,'aug':7,'august':7,'sep':8,'september':8,'oct':9,'october':9,'nov':10,'november':10,'dec':11,'december':11};
  return months[monthStr.toLowerCase()] ?? -1;
}

function parseDeadline(text, refDate) {
  const lower = text.toLowerCase().trim();
  if (lower.includes('tomorrow')) { const d = new Date(refDate); d.setDate(d.getDate() + 1); return d; }
  if (lower.includes('next week')) { const d = new Date(refDate); d.setDate(d.getDate() + 7); return d; }
  if (lower.includes('friday') || lower.includes('end of week')) { const d = new Date(refDate), dow = d.getDay(); d.setDate(d.getDate() + (5 - dow + 7) % 7); return d; }
  const dateMatch = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})/i);
  if (dateMatch) { const month = parseMonth(dateMatch[1]), day = parseInt(dateMatch[2]); return new Date(refDate.getFullYear(), month, day); }
  return null;
}

function logMissedEvent(event, from, subject, emailDate) {
  const sheet = getOrCreateSheet('MissedEvents', ['EventTitle', 'EventDate', 'Location', 'EmailFrom', 'EmailSubject', 'EmailDate', 'DaysLate', 'LoggedAt']);
  const daysLate = Math.floor((new Date() - event.date) / (1000 * 60 * 60 * 24));
  sheet.appendRow([event.title, Utilities.formatDate(event.date, CONFIG.SETTINGS.TIMEZONE, 'yyyy-MM-dd'), event.location || '', from, subject, Utilities.formatDate(emailDate, CONFIG.SETTINGS.TIMEZONE, 'yyyy-MM-dd'), daysLate, new Date().toISOString()]);
}

function logPastDueAction(action, from, subject, emailDate) {
  const sheet = getOrCreateSheet('PastDueActions', ['ActionItem', 'OriginalDueDate', 'DaysOverdue', 'EmailFrom', 'EmailSubject', 'EmailDate', 'Priority', 'LoggedAt', 'Status', 'ResolvedAt']);
  const daysOverdue = action.dueDate ? Math.floor((new Date() - action.dueDate) / (1000 * 60 * 60 * 24)) : 0;
  sheet.appendRow([action.item, action.dueDate ? Utilities.formatDate(action.dueDate, CONFIG.SETTINGS.TIMEZONE, 'yyyy-MM-dd') : '', daysOverdue, from, subject, Utilities.formatDate(emailDate, CONFIG.SETTINGS.TIMEZONE, 'yyyy-MM-dd'), action.priority, new Date().toISOString(), 'PENDING_REVIEW', '']);
}

function saveActionItem(action) {
  const sheet = getOrCreateSheet('Actions', ['Item', 'Priority', 'DueDate', 'Source', 'AssignedTo', 'Status', 'RelatedContact', 'RelatedProject', 'Notes', 'Created', 'Completed']);
  sheet.appendRow([action.item, action.priority, action.dueDate ? Utilities.formatDate(action.dueDate, CONFIG.SETTINGS.TIMEZONE, 'yyyy-MM-dd') : '', action.source, '', action.status || 'PENDING', '', '', `Source: ${action.sourceSubject}`, new Date().toISOString(), '']);
}

function getCleanupStatus() {
  const unprocessed = GmailApp.search('-label:HUB-Processed').length, processed = GmailApp.search('label:HUB-Processed').length;
  const missedSheet = SpreadsheetApp.getActiveSpreadsheet()?.getSheetByName('MissedEvents'), pastDueSheet = SpreadsheetApp.getActiveSpreadsheet()?.getSheetByName('PastDueActions');
  return { totalUnprocessed: unprocessed, totalProcessed: processed, percentComplete: Math.round((processed / (unprocessed + processed)) * 100), missedEvents: missedSheet ? missedSheet.getLastRow() - 1 : 0, pastDueActions: pastDueSheet ? pastDueSheet.getLastRow() - 1 : 0 };
}
