/**
 * Enhanced Triggers for Email-Calendar Manager
 */

function setupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) ScriptApp.deleteTrigger(trigger);

  ScriptApp.newTrigger('processNewEmails').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('weekdayBriefing').timeBased().atHour(CONFIG.SCHEDULE.WEEKDAY.START_HOUR).everyDays(1).inTimezone(CONFIG.SETTINGS.TIMEZONE).create();
  ScriptApp.newTrigger('weekendReview').timeBased().onWeekDay(ScriptApp.WeekDay.SATURDAY).atHour(CONFIG.SCHEDULE.WEEKEND.START_HOUR).inTimezone(CONFIG.SETTINGS.TIMEZONE).create();
  ScriptApp.newTrigger('weekendReview').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(CONFIG.SCHEDULE.WEEKEND.START_HOUR).inTimezone(CONFIG.SETTINGS.TIMEZONE).create();
  ScriptApp.newTrigger('runHistoricalCleanup').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).inTimezone(CONFIG.SETTINGS.TIMEZONE).create();
  ScriptApp.newTrigger('dailyDigest').timeBased().atHour(21).everyDays(1).inTimezone(CONFIG.SETTINGS.TIMEZONE).create();
  console.log('All triggers set up!');
  logSystem('Setup', 'Triggers configured');
}

function setupSheets() {
  const ss = SpreadsheetApp.create('HUB-EmailCalendar-Data');
  const sheets = [
    { name: 'Contacts', headers: ['Name', 'Email', 'Phone', 'Company', 'Role', 'How We Know', 'Affiliations', 'Relations', 'Demographics', 'First Seen', 'Source', 'Last Contact'] },
    { name: 'Events', headers: ['Title', 'Date', 'Time', 'Duration', 'Location', 'Status', 'Source From', 'Source Subject', 'Extracted'] },
    { name: 'Actions', headers: ['Item', 'Priority', 'Due Date', 'Source', 'Assigned To', 'Status', 'Related Contact', 'Related Project', 'Notes', 'Created', 'Completed'] },
    { name: 'EmailLog', headers: ['Date', 'From', 'To', 'Subject', 'Account', 'Type', 'Priority', 'Labels', 'Processed'] },
    { name: 'ConfirmationQueue', headers: ['ID', 'Type', 'Status', 'CreatedAt', 'ExpiresAt', 'EmailID', 'From', 'Subject', 'Snippet', 'Category', 'Confidence', 'ProposedAction', 'DraftResponse', 'CalendarEvent', 'UserDecision', 'DecisionAt'] },
    { name: 'LearningLog', headers: ['Timestamp', 'EmailFrom', 'Subject', 'Category', 'Confidence', 'ProposedAction', 'UserDecision', 'ActionType'] },
    { name: 'MissedEvents', headers: ['EventTitle', 'EventDate', 'Location', 'EmailFrom', 'EmailSubject', 'EmailDate', 'DaysLate', 'LoggedAt'] },
    { name: 'PastDueActions', headers: ['ActionItem', 'OriginalDueDate', 'DaysOverdue', 'EmailFrom', 'EmailSubject', 'EmailDate', 'Priority', 'LoggedAt', 'Status', 'ResolvedAt'] },
    { name: 'SystemLog', headers: ['Timestamp', 'Component', 'Level', 'Message'] }
  ];
  
  const firstSheet = ss.getSheetByName('Sheet1');
  if (firstSheet) { firstSheet.setName(sheets[0].name); firstSheet.appendRow(sheets[0].headers); }
  for (let i = 1; i < sheets.length; i++) {
    const sheet = ss.insertSheet(sheets[i].name);
    sheet.appendRow(sheets[i].headers);
  }
  
  console.log('Sheets created! ID: ' + ss.getId());
  PropertiesService.getScriptProperties().setProperty('DATA_SPREADSHEET_ID', ss.getId());
  return ss.getId();
}

function setGeminiApiKey(apiKey) {
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', apiKey);
  console.log('Gemini API key stored');
}

function testWeekdayBriefing() { weekdayBriefing(); }
function testWeekendReview() { weekendReview(); }
function testEmailProcessing() { processNewEmails(); }
function testHistoricalCleanup() { runHistoricalCleanup(10); }
function testGeminiClassification() {
  const result = classifyWithGemini('test@school.k12.com', 'Important: Your child report card', 'Please review grades...', 'darkhorse.codes@gmail.com');
  console.log(JSON.stringify(result, null, 2));
}
function testTelegramNotification() { sendTelegramMessage('Test notification from Apps Script!', null); }

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.callback_query) { processConfirmationCallback(data.callback_query.data, data.callback_query.id); }
    else if (data.message && data.message.text) { handleTelegramMessage(data.message); }
  } catch (e) { logSystem('Webhook', `Error: ${e.message}`, 'ERROR'); }
  return ContentService.createTextOutput('OK');
}

function handleTelegramMessage(message) {
  const text = message.text;
  if (text.startsWith('/')) {
    const command = text.split(' ')[0].toLowerCase();
    switch (command) {
      case '/status': const status = getCleanupStatus(); sendTelegramMessage(`*Status*\nUnprocessed: ${status.totalUnprocessed}\nProcessed: ${status.totalProcessed}\nProgress: ${status.percentComplete}%`, null); break;
      case '/pending': const pending = getPendingConfirmations(); sendTelegramMessage(pending.total === 0 ? 'No pending!' : `*Pending (${pending.total})*\n${pending.items.slice(0,10).map(i => `• ${i.type}: ${i.subject.substring(0,40)}`).join('\n')}`, null); break;
      case '/cleanup': sendTelegramMessage('Starting cleanup...', null); runHistoricalCleanup(20); break;
      case '/briefing': scheduledTouchpoint(); break;
      case '/help': sendTelegramMessage('*Commands*\n/status /pending /cleanup /briefing /help', null); break;
    }
  }
}

function getDataSpreadsheet() {
  const ssId = PropertiesService.getScriptProperties().getProperty('DATA_SPREADSHEET_ID');
  if (ssId) { try { return SpreadsheetApp.openById(ssId); } catch (e) { return null; } }
  return null;
}
