/**
 * Enhanced Email Processor
 */

function processNewEmails() {
  const startTime = new Date();
  logSystem('EmailProcessor', 'Starting email processing');
  try {
    const threads = GmailApp.search('is:unread -label:HUB-Processed', 0, CONFIG.SETTINGS.MAX_EMAILS_PER_RUN);
    if (threads.length === 0) { logSystem('EmailProcessor', 'No new emails'); return; }
    logSystem('EmailProcessor', `Processing ${threads.length} threads`);
    const stats = { processed: 0, critical: 0, highPriority: 0, queuedForConfirmation: 0, errors: 0 };
    ensureLabelsExist();
    for (const thread of threads) {
      try {
        const result = processThread(thread);
        stats.processed++;
        if (result.level === 'CRITICAL') stats.critical++;
        if (result.level === 'HIGH') stats.highPriority++;
        if (result.queuedForConfirmation) stats.queuedForConfirmation++;
      } catch (e) { stats.errors++; logSystem('EmailProcessor', `Error: ${e.message}`, 'ERROR'); }
      Utilities.sleep(500);
    }
    const duration = (new Date() - startTime) / 1000;
    logSystem('EmailProcessor', `Completed: ${stats.processed} emails in ${duration}s`);
    if (stats.critical > 0) notifyRaven(`*CRITICAL EMAILS*\n${stats.critical} items need attention!`);
  } catch (e) {
    logSystem('EmailProcessor', `Fatal: ${e.message}`, 'ERROR');
    notifyRaven(`Email processing error: ${e.message}`);
  }
}

function processThread(thread) {
  const messages = thread.getMessages();
  const msg = messages[messages.length - 1];
  const from = msg.getFrom(), to = msg.getTo(), subject = msg.getSubject(), body = msg.getPlainBody(), date = msg.getDate(), messageId = msg.getId();
  const receivingAccount = to.toLowerCase().includes('darkhorse.codes') ? 'darkhorse.codes' : 'tommyrhudsonjr.com';
  const classification = classifyWithGemini(from, subject, body, to);
  applyLabels(thread, classification);
  const isVIP = VIP_CONTACTS.some(v => from.toLowerCase().includes(v.pattern.toLowerCase()));
  if (isVIP) { classification.level = 'CRITICAL'; classification.notifyImmediately = true; }
  const result = { level: classification.level, queuedForConfirmation: false };
  
  if (classification.notifyImmediately) {
    notifyRaven(`*${classification.category}*\nFrom: ${extractName(from)}\nSubject: ${escapeMarkdown(subject)}\nSummary: ${classification.summary || 'No summary'}`);
  }
  
  const contacts = extractContacts(from, body);
  if (contacts.length > 0) saveContacts(contacts, subject);
  
  if (classification.category === 'CALENDAR' || classification.suggestedAction === 'CALENDAR') {
    const events = extractCalendarEvents(subject, body, date);
    for (const event of events) {
      queueForConfirmation({ type: 'CREATE_EVENT', emailId: messageId, from, subject, snippet: body.substring(0, 200), classification, proposedAction: 'CREATE_EVENT', calendarEvent: event });
      result.queuedForConfirmation = true;
    }
  }
  
  const actions = extractActionItems(subject, body, from, date);
  if (actions.length > 0) saveActionItems(actions);
  
  switch (classification.suggestedAction) {
    case 'UNSUBSCRIBE':
      queueForConfirmation({ type: 'UNSUBSCRIBE', emailId: messageId, from, subject, snippet: body.substring(0, 200), classification, proposedAction: 'UNSUBSCRIBE' });
      result.queuedForConfirmation = true;
      break;
    case 'RESPOND':
      const draft = draftResponse({ from, subject, body }, classification);
      if (draft.success) { queueForConfirmation({ type: 'SEND_RESPONSE', emailId: messageId, from, subject, snippet: body.substring(0, 200), classification, proposedAction: 'SEND_RESPONSE', draftResponse: draft.draft }); result.queuedForConfirmation = true; }
      break;
    case 'ARCHIVE':
      if (classification.autoArchive && classification.confidence > LEARNING.HIGH_CONFIDENCE) thread.moveToArchive();
      else { queueForConfirmation({ type: 'ARCHIVE', emailId: messageId, from, subject, snippet: body.substring(0, 200), classification, proposedAction: 'ARCHIVE' }); result.queuedForConfirmation = true; }
      break;
  }
  
  logEmail(date, from, to, subject, receivingAccount, classification);
  thread.addLabel(GmailApp.getUserLabelByName('HUB-Processed'));
  return result;
}

function ensureLabelsExist() {
  const labels = ['HUB-Processed', 'HUB-Kids-School', 'HUB-Kids-Medical', 'HUB-Masonic', 'HUB-ScottishRite', 'HUB-MasonicAppendant', 'HUB-Financial', 'HUB-Calendar', 'HUB-Action', 'HUB-Info', 'HUB-Unsubscribe', 'HUB-VIP'];
  for (const name of labels) { if (!GmailApp.getUserLabelByName(name)) GmailApp.createLabel(name); }
}

function applyLabels(thread, classification) {
  if (classification.label) { const label = GmailApp.getUserLabelByName(classification.label); if (label) thread.addLabel(label); }
}

function extractName(from) { const match = from.match(/^([^<]+)/); return match ? match[1].trim() : from.split('@')[0]; }

function extractContacts(from, body) {
  const emailMatch = from.match(/<([^>]+)>/);
  return [{ name: extractName(from), email: emailMatch ? emailMatch[1] : from, source: 'email-from' }];
}

function saveContacts(contacts, sourceSubject) {
  const sheet = getOrCreateSheet('Contacts', ['Name', 'Email', 'Phone', 'Company', 'Role', 'How We Know', 'Affiliations', 'Relations', 'Demographics', 'First Seen', 'Source', 'Last Contact']);
  for (const c of contacts) {
    const existing = findExistingContact(sheet, c.email);
    if (!existing) sheet.appendRow([c.name, c.email, '', '', '', '', '', '', '', new Date().toISOString(), sourceSubject, new Date().toISOString()]);
    else sheet.getRange(existing, 12).setValue(new Date().toISOString());
  }
}

function findExistingContact(sheet, email) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) if (data[i][1] && data[i][1].toLowerCase() === email.toLowerCase()) return i + 1;
  return null;
}

function extractActionItems(subject, body, from, date) {
  const text = subject + ' ' + body;
  if (PRIORITY_CATEGORIES.ACTION_REQUIRED.keywords.some(kw => text.toLowerCase().includes(kw))) {
    return [{ item: subject, priority: 'medium', dueDate: null, source: from, created: new Date() }];
  }
  return [];
}

function saveActionItems(actions) {
  const sheet = getOrCreateSheet('Actions', ['Item', 'Priority', 'Due Date', 'Source', 'Assigned To', 'Status', 'Related Contact', 'Related Project', 'Notes', 'Created', 'Completed']);
  for (const a of actions) sheet.appendRow([a.item, a.priority, a.dueDate || '', a.source, '', 'PENDING', '', '', '', a.created.toISOString(), '']);
}

function logEmail(date, from, to, subject, account, classification) {
  const sheet = getOrCreateSheet('EmailLog', ['Date', 'From', 'To', 'Subject', 'Account', 'Type', 'Priority', 'Labels', 'Processed']);
  sheet.appendRow([Utilities.formatDate(date, CONFIG.SETTINGS.TIMEZONE, 'yyyy-MM-dd HH:mm'), from, to, subject, account, classification.category, classification.level, classification.label, new Date().toISOString()]);
}

function logSystem(component, message, level = 'INFO') {
  console.log(`[${level}] ${component}: ${message}`);
  try {
    const sheet = getOrCreateSheet('SystemLog', ['Timestamp', 'Component', 'Level', 'Message']);
    sheet.appendRow([new Date().toISOString(), component, level, message]);
    if (sheet.getLastRow() > 1000) sheet.deleteRows(2, 500);
  } catch (e) { console.error('Log error:', e.message); }
}

function notifyRaven(message) {
  try { sendTelegramMessage(message, null); return; } catch (e) { console.error('Telegram failed:', e.message); }
  try { UrlFetchApp.fetch(CONFIG.RAVEN_WEBHOOK, { method: 'POST', contentType: 'application/json', payload: JSON.stringify({ message, source: 'apps-script' }), muteHttpExceptions: true }); } catch (e) {}
}

function createCalendarEvent(event) {
  try {
    const calendar = CalendarApp.getCalendarById(CONFIG.CALENDARS.DARKHORSE);
    if (!calendar) throw new Error('Calendar not found');
    const newEvent = calendar.createEvent(event.title, event.start, event.end, { location: event.location || '', description: `Created from email` });
    return { success: true, eventId: newEvent.getId() };
  } catch (e) { return { success: false, error: e.message }; }
}
