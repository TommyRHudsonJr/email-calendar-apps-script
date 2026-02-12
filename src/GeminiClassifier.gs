/**
 * Gemini AI Classifier for Emails
 */

function classifyWithGemini(from, subject, body, to) {
  const truncatedBody = body.substring(0, 2000);
  const prompt = buildClassificationPrompt(from, subject, truncatedBody, to);
  try {
    const response = callGemini(prompt);
    return parseClassificationResponse(response, from, subject);
  } catch (e) {
    logSystem('GeminiClassifier', `Error: ${e.message}, falling back to keywords`, 'WARN');
    return classifyWithKeywords(from, subject, body);
  }
}

function buildClassificationPrompt(from, subject, body, to) {
  return `You are an email classifier. Classify this email into exactly ONE category.

PRIORITY ORDER:
1. KIDS_SCHOOL - Children's school communications
2. KIDS_MEDICAL - Children's medical communications
3. FREEMASON - Masonic lodge communications
4. SCOTTISH_RITE - Scottish Rite Freemasonry
5. OTHER_MASONIC - Other Masonic organizations
6. FINANCIAL - Bills, invoices, payments
7. CALENDAR - Meeting invites, appointments
8. ACTION_REQUIRED - Needs response within 7 days
9. INFORMATIONAL - Newsletters, updates
10. UNSUBSCRIBE - Marketing, promotions

EMAIL:\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\nBody: ${body}

RESPOND IN JSON ONLY:
{"category": "NAME", "confidence": 0.0-1.0, "priority": 1-5, "summary": "10 words max", "suggestedAction": "ARCHIVE|RESPOND|CALENDAR|FLAG|UNSUBSCRIBE|REVIEW", "reasoning": "brief reason"}`;
}

function callGemini(prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
  const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: CONFIG.GEMINI.TEMPERATURE, maxOutputTokens: CONFIG.GEMINI.MAX_TOKENS } };
  
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (apiKey) {
    const response = UrlFetchApp.fetch(`${url}?key=${apiKey}`, { method: 'POST', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
    const result = JSON.parse(response.getContentText());
    if (result.candidates && result.candidates[0]) return result.candidates[0].content.parts[0].text;
  }
  
  const token = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(url, { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, payload: JSON.stringify(payload), muteHttpExceptions: true });
  const result = JSON.parse(response.getContentText());
  if (result.candidates && result.candidates[0]) return result.candidates[0].content.parts[0].text;
  throw new Error('No valid response from Gemini');
}

function parseClassificationResponse(response, from, subject) {
  try {
    let jsonStr = response;
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
    const parsed = JSON.parse(jsonStr);
    if (!PRIORITY_CATEGORIES[parsed.category]) { parsed.category = 'INFORMATIONAL'; parsed.confidence = 0.5; }
    const categoryConfig = PRIORITY_CATEGORIES[parsed.category];
    return {
      category: parsed.category, level: categoryConfig.level, confidence: parseFloat(parsed.confidence) || 0.5,
      priority: parseInt(parsed.priority) || 3, summary: parsed.summary || subject.substring(0, 50),
      suggestedAction: parsed.suggestedAction || 'REVIEW', reasoning: parsed.reasoning || '',
      label: categoryConfig.label, autoArchive: categoryConfig.autoArchive, notifyImmediately: categoryConfig.notifyImmediately,
      requiresConfirmation: parsed.confidence < LEARNING.HIGH_CONFIDENCE || categoryConfig.level === 'CRITICAL' || ['DELETE', 'UNSUBSCRIBE', 'SEND_RESPONSE'].includes(parsed.suggestedAction)
    };
  } catch (e) {
    logSystem('GeminiClassifier', `Parse error: ${e.message}`, 'WARN');
    return classifyWithKeywords(from, subject, '');
  }
}

function classifyWithKeywords(from, subject, body) {
  const text = `${from} ${subject} ${body}`.toLowerCase();
  for (const [catName, catConfig] of Object.entries(PRIORITY_CATEGORIES)) {
    const keywordMatch = catConfig.keywords.some(kw => text.includes(kw.toLowerCase()));
    const domainMatch = catConfig.domains.some(domain => from.toLowerCase().includes(domain));
    if (keywordMatch || domainMatch) {
      return {
        category: catName, level: catConfig.level, confidence: keywordMatch && domainMatch ? 0.9 : 0.7,
        priority: catConfig.level === 'CRITICAL' ? 1 : catConfig.level === 'HIGH' ? 2 : 3,
        summary: subject.substring(0, 50), suggestedAction: 'REVIEW',
        reasoning: `Matched ${keywordMatch ? 'keyword' : 'domain'} pattern`,
        label: catConfig.label, autoArchive: catConfig.autoArchive, notifyImmediately: catConfig.notifyImmediately, requiresConfirmation: true
      };
    }
  }
  return { category: 'INFORMATIONAL', level: 'LOW', confidence: 0.5, priority: 4, summary: subject.substring(0, 50), suggestedAction: 'REVIEW', reasoning: 'No pattern matched', label: 'HUB-Info', autoArchive: false, notifyImmediately: false, requiresConfirmation: true };
}

function batchClassify(emails) {
  const results = [];
  for (const email of emails) {
    results.push({ ...email, classification: classifyWithGemini(email.from, email.subject, email.body, email.to) });
    Utilities.sleep(500);
  }
  return results;
}

function draftResponse(email, classification) {
  const prompt = `Draft a professional email response.\n\nORIGINAL:\nFrom: ${email.from}\nSubject: ${email.subject}\nBody: ${email.body.substring(0, 1500)}\n\nContext: ${classification.category}\n\nBe concise and professional. Respond with ONLY the email body text.`;
  try { return { success: true, draft: callGemini(prompt), requiresApproval: true }; }
  catch (e) { return { success: false, error: e.message, draft: null }; }
}
