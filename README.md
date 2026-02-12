# Email-Calendar Manager - Google Apps Script

Autonomous email and calendar management with native Gemini AI integration.

## Features

- **AI Classification**: Gemini-powered email categorization with keyword fallback
- **Priority Categories**:
  - CRITICAL: Kids School, Kids Medical (immediate notification)
  - HIGH: Masonic, Scottish Rite, Other Masonic appendant bodies
  - STANDARD: Financial, Calendar, Action Required
  - LOW: Informational, Newsletters
  - ARCHIVE: Unsubscribe candidates
- **Confirmation Gates**: Nothing deleted/unsubscribed/sent without Telegram approval
- **Communication Schedule**:
  - Weekdays: 6 AM - 30 minute quick briefing
  - Weekends: 9 AM - 1 hour deep review
- **Historical Cleanup**: Gradual processing of email backlog
- **Learning System**: Tracks approvals/rejections to improve over time

## Quick Deploy

### Option 1: Copy/Paste
1. Go to https://script.google.com
2. Create new project
3. Copy each .gs file from `src/` folder
4. Run `setupSheets()` then `setupTriggers()`

### Option 2: Clasp CLI
```bash
npm install -g @google/clasp
clasp login
clasp clone <SCRIPT_ID>
# Copy files and push
clasp push
```

## Setup Steps

1. **Create Data Spreadsheet**: Run `setupSheets()` once
2. **Set Gemini API Key**: Run `setGeminiApiKey('YOUR_KEY')`
3. **Configure Triggers**: Run `setupTriggers()`
4. **Deploy Web App** for Telegram callbacks
5. **Set Telegram Webhook**:
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WEB_APP_URL>"
```

## Telegram Commands

- `/status` - System status
- `/pending` - Show pending confirmations
- `/cleanup` - Run cleanup batch
- `/briefing` - Send today's briefing

## File Structure

```
src/
├── Config.gs              # Configuration and priority categories
├── GeminiClassifier.gs    # AI classification logic
├── ConfirmationQueue.gs   # Telegram approval system
├── CommunicationSchedule.gs # Briefing and review system
├── HistoricalCleanup.gs   # Backlog processing
├── EmailProcessor.gs      # Main email processing
├── Triggers.gs            # Trigger setup and handlers
└── Utilities.gs           # Helper functions
```

## License

MIT
