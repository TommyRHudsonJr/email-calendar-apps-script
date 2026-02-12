/**
 * Enhanced Configuration for Email-Calendar Manager
 */

const CONFIG = {
  CALENDARS: {
    DARKHORSE: 'darkhorse.codes@gmail.com',
    PERSONAL: 'tommyrhudsonjr@gmail.com'
  },
  EMAIL_DOMAINS: {
    'darkhorse.codes': 'business',
    'tommyrhudsonjr.com': 'personal'
  },
  TELEGRAM: {
    BOT_TOKEN: '8344667511:AAHkUwPCy0Bhm6VT2V8yFZ8M-kvEDp9wUWo',
    CHAT_ID: '1696910834'
  },
  RAVEN_WEBHOOK: 'https://raven.darkhorse.codes/webhook/notification',
  SHEETS: {
    CONTACTS_MASTER: '',
    CALENDAR_EVENTS: '',
    ACTION_ITEMS: '',
    EMAIL_LOG: '',
    SYSTEM_LOG: '',
    CONFIRMATION_QUEUE: '',
    LEARNING_LOG: ''
  },
  SETTINGS: {
    MAX_EMAILS_PER_RUN: 100,
    MAX_HISTORICAL_PER_RUN: 50,
    TIMEZONE: 'America/New_York'
  },
  SCHEDULE: {
    WEEKDAY: { START_HOUR: 6, DURATION_MINS: 30, DAYS: [1, 2, 3, 4, 5] },
    WEEKEND: { START_HOUR: 9, DURATION_MINS: 60, DAYS: [0, 6] }
  },
  GEMINI: { MODEL: 'gemini-pro', MAX_TOKENS: 2000, TEMPERATURE: 0.2 }
};

const PRIORITY_CATEGORIES = {
  KIDS_SCHOOL: {
    level: 'CRITICAL', label: 'HUB-Kids-School',
    keywords: ['school', 'teacher', 'principal', 'grades', 'report card', 'parent', 'pta', 'homework', 'bus'],
    domains: ['k12.com', 'schoolmessenger.com', 'parentvue', 'powerschool'],
    autoArchive: false, notifyImmediately: true
  },
  KIDS_MEDICAL: {
    level: 'CRITICAL', label: 'HUB-Kids-Medical',
    keywords: ['pediatric', 'vaccination', 'immunization', 'pediatrician', 'child appointment'],
    domains: ['mychart', 'patient.portal', 'pediatric'],
    autoArchive: false, notifyImmediately: true
  },
  FREEMASON: {
    level: 'HIGH', label: 'HUB-Masonic',
    keywords: ['lodge', 'grand lodge', 'freemason', 'masonic', 'worshipful', 'stated meeting', 'tiled'],
    domains: ['grandlodge', 'freemasons.org'],
    autoArchive: false, notifyImmediately: false
  },
  SCOTTISH_RITE: {
    level: 'HIGH', label: 'HUB-ScottishRite',
    keywords: ['scottish rite', 'orient', 'valley', 'consistory', 'rose croix', '32nd degree'],
    domains: ['scottishrite.org'],
    autoArchive: false, notifyImmediately: false
  },
  OTHER_MASONIC: {
    level: 'HIGH', label: 'HUB-MasonicAppendant',
    keywords: ['shrine', 'york rite', 'royal arch', 'knights templar', 'eastern star', 'demolay'],
    domains: ['shrinersvillage', 'yorkrite.org'],
    autoArchive: false, notifyImmediately: false
  },
  FINANCIAL: {
    level: 'STANDARD', label: 'HUB-Financial',
    keywords: ['invoice', 'receipt', 'payment', 'subscription', 'billing', 'statement'],
    domains: ['chase.com', 'bankofamerica.com', 'paypal.com'],
    autoArchive: false, notifyImmediately: false
  },
  CALENDAR: {
    level: 'STANDARD', label: 'HUB-Calendar',
    keywords: ['meeting', 'appointment', 'scheduled', 'rsvp', 'event', 'invitation'],
    domains: ['calendar.google.com', 'zoom.us'],
    autoArchive: false, notifyImmediately: false
  },
  ACTION_REQUIRED: {
    level: 'STANDARD', label: 'HUB-Action',
    keywords: ['action required', 'please review', 'urgent', 'deadline', 'response needed'],
    domains: [],
    autoArchive: false, notifyImmediately: false
  },
  INFORMATIONAL: {
    level: 'LOW', label: 'HUB-Info',
    keywords: ['update', 'newsletter', 'weekly digest', 'announcement'],
    domains: [],
    autoArchive: false, notifyImmediately: false
  },
  UNSUBSCRIBE: {
    level: 'ARCHIVE', label: 'HUB-Unsubscribe',
    keywords: ['unsubscribe', 'opt-out', 'marketing', 'promo', 'special offer'],
    domains: ['marketing.', 'mail.', 'news.', 'promo.'],
    autoArchive: true, notifyImmediately: false
  }
};

const VIP_CONTACTS = [
  { pattern: 'dana', type: 'family' },
  { pattern: 'worshipful', type: 'masonic' },
  { pattern: 'grand', type: 'masonic' }
];

const CONFIRMATION_REQUIRED = {
  DELETE: true, UNSUBSCRIBE: true, SEND_RESPONSE: true, CREATE_EVENT: true, ARCHIVE: false, LABEL: false
};

const LEARNING = {
  APPROVE_BOOST: 1.2, REJECT_PENALTY: 0.7, MIN_CONFIDENCE: 0.3, HIGH_CONFIDENCE: 0.85
};

const KEYWORDS = {
  CALENDAR: ['meeting', 'appointment', 'event', 'scheduled', 'rsvp', 'invitation'],
  ACTION: ['action required', 'please review', 'urgent', 'deadline', 'response needed', 'sign', 'approve']
};
