/**
 * Confirmation Queue System - Nothing gets deleted/unsubscribed/sent without approval
 */

function queueForConfirmation(action) {
  const queueId = Utilities.getUuid();
  const queueItem = {
    id: queueId, type: action.type, status: 'PENDING',
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    email: { id: action.emailId, from: action.from, subject: action.subject, snippet: action.snippet },
    classification: action.classification, proposedAction: action.proposedAction,
    draftResponse: action.draftResponse || null, calendarEvent: action.calendarEvent || null
  };
  saveToQueue(queueItem);
  sendConfirmationRequest(queueItem);
  return queueId;
}

function saveToQueue(item) {
  const sheet = getOrCreateSheet('ConfirmationQueue', ['ID', 'Type', 'Status', 'CreatedAt', 'ExpiresAt', 'EmailID', 'From', 'Subject', 'Snippet', 'Category', 'Confidence', 'ProposedAction', 'DraftResponse', 'CalendarEvent', 'UserDecision', 'DecisionAt']);
  sheet.appendRow([item.id, item.type, item.status, item.createdAt, item.expiresAt, item.email.id, item.email.from, item.email.subject, item.email.snippet, item.classification?.category || '', item.classification?.confidence || '', item.proposedAction, JSON.stringify(item.draftResponse), JSON.stringify(item.calendarEvent), '', '']);
}

function sendConfirmationRequest(item) {
  const emoji = {'DELETE': '🗑️', 'UNSUBSCRIBE': '🚫', 'SEND_RESPONSE': '📤', 'CREATE_EVENT': '📅', 'ARCHIVE': '📦'}[item.type] || '❓';
  const confidence = item.classification?.confidence ? `${Math.round(item.classification.confidence * 100)}%` : 'N/A';
  let msg = `${emoji} *Confirmation Required*\n\n*Action:* ${item.type}\n*From:* ${escapeMarkdown(item.email.from)}\n*Subject:* ${escapeMarkdown(item.email.subject)}\n*Category:* ${item.classification?.category || 'UNKNOWN'} (${confidence})\n`;
  if (item.email.snippet) msg += `\n_${escapeMarkdown(item.email.snippet.substring(0, 200))}..._\n`;
  if (item.draftResponse) msg += `\n*Draft:*\n_${escapeMarkdown(item.draftResponse.substring(0, 300))}..._\n`;
  if (item.calendarEvent) msg += `\n*Event:*\n📅 ${item.calendarEvent.title}\n🕐 ${item.calendarEvent.date} ${item.calendarEvent.time}\n`;
  const keyboard = { inline_keyboard: [[{ text: '✅ Approve', callback_data: `approve_${item.id}` }, { text: '❌ Reject', callback_data: `reject_${item.id}` }], [{ text: '✏️ Edit', callback_data: `edit_${item.id}` }, { text: '⏰ Later', callback_data: `later_${item.id}` }]] };
  sendTelegramMessage(msg, keyboard);
}

function processConfirmationCallback(callbackData, callbackQueryId) {
  const parts = callbackData.split('_'), action = parts[0], queueId = parts.slice(1).join('_');
  const item = getQueueItem(queueId);
  if (!item) { answerCallback(callbackQueryId, '❌ Item not found'); return; }
  switch (action) {
    case 'approve': executeApprovedAction(item); updateQueueStatus(queueId, 'APPROVED'); logLearning(item, 'APPROVED'); answerCallback(callbackQueryId, '✅ Approved!'); break;
    case 'reject': updateQueueStatus(queueId, 'REJECTED'); logLearning(item, 'REJECTED'); answerCallback(callbackQueryId, '❌ Rejected'); break;
    case 'edit': sendTelegramMessage(`✏️ Reply with edits for: *${item.email.subject}*`, null); updateQueueStatus(queueId, 'EDITING'); answerCallback(callbackQueryId, '✏️ Send edits'); break;
    case 'later': answerCallback(callbackQueryId, '⏰ Will ask again'); break;
  }
}

function executeApprovedAction(item) {
  try {
    switch (item.type) {
      case 'DELETE': GmailApp.moveMessageToTrash(GmailApp.getMessageById(item.email.id)); logSystem('Queue', `Deleted: ${item.email.subject}`); break;
      case 'UNSUBSCRIBE': const r = tryUnsubscribe(item.email.id); if (!r.success) sendTelegramMessage(`⚠️ Could not auto-unsubscribe from ${item.email.from}`, null); break;
      case 'SEND_RESPONSE': if (item.draftResponse) { GmailApp.getMessageById(item.email.id).reply(item.draftResponse); logSystem('Queue', `Sent to: ${item.email.from}`); } break;
      case 'CREATE_EVENT': if (item.calendarEvent) { createCalendarEvent(item.calendarEvent); logSystem('Queue', `Created: ${item.calendarEvent.title}`); } break;
      case 'ARCHIVE': GmailApp.getMessageById(item.email.id).getThread().moveToArchive(); logSystem('Queue', `Archived: ${item.email.subject}`); break;
    }
    sendTelegramMessage(`✅ Executed: ${item.type} for "${item.email.subject}"`, null);
  } catch (e) { logSystem('Queue', `Error: ${e.message}`, 'ERROR'); sendTelegramMessage(`❌ Failed: ${e.message}`, null); }
}

function tryUnsubscribe(messageId) {
  try {
    const body = GmailApp.getMessageById(messageId).getBody();
    const patterns = [/href=["']([^"']*unsubscribe[^"']*)["']/gi, /href=["']([^"']*opt-out[^"']*)["']/gi];
    for (const p of patterns) { const m = body.match(p); if (m && m[1]) { logSystem('Unsubscribe', `Found: ${m[1]}`); return { success: true, link: m[1] }; } }
    return { success: false, reason: 'No link found' };
  } catch (e) { return { success: false, reason: e.message }; }
}

function getQueueItem(queueId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()?.getSheetByName('ConfirmationQueue');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === queueId) return { id: data[i][0], type: data[i][1], status: data[i][2], email: { id: data[i][5], from: data[i][6], subject: data[i][7], snippet: data[i][8] }, classification: { category: data[i][9], confidence: parseFloat(data[i][10]) }, proposedAction: data[i][11], draftResponse: data[i][12] ? JSON.parse(data[i][12]) : null, calendarEvent: data[i][13] ? JSON.parse(data[i][13]) : null };
  }
  return null;
}

function updateQueueStatus(queueId, status) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()?.getSheetByName('ConfirmationQueue');
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { if (data[i][0] === queueId) { sheet.getRange(i + 1, 3).setValue(status); sheet.getRange(i + 1, 15).setValue(status); sheet.getRange(i + 1, 16).setValue(new Date().toISOString()); break; } }
}

function logLearning(item, decision) {
  const sheet = getOrCreateSheet('LearningLog', ['Timestamp', 'EmailFrom', 'Subject', 'Category', 'Confidence', 'ProposedAction', 'UserDecision', 'ActionType']);
  sheet.appendRow([new Date().toISOString(), item.email.from, item.email.subject, item.classification?.category || '', item.classification?.confidence || '', item.proposedAction, decision, item.type]);
}

function getPendingConfirmationsCount() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()?.getSheetByName('ConfirmationQueue');
  if (!sheet) return 0;
  return sheet.getDataRange().getValues().filter((r, i) => i > 0 && r[2] === 'PENDING').length;
}

function getPendingConfirmations() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()?.getSheetByName('ConfirmationQueue');
  if (!sheet) return { total: 0, byType: {}, items: [] };
  const data = sheet.getDataRange().getValues(), pending = { total: 0, byType: {}, items: [] };
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === 'PENDING') { pending.total++; const type = data[i][1]; pending.byType[type] = (pending.byType[type] || 0) + 1; pending.items.push({ id: data[i][0], type, subject: data[i][7], from: data[i][6] }); }
  }
  return pending;
}

function answerCallback(callbackQueryId, text) {
  UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM.BOT_TOKEN}/answerCallbackQuery`, { method: 'POST', contentType: 'application/json', payload: JSON.stringify({ callback_query_id: callbackQueryId, text }), muteHttpExceptions: true });
}
