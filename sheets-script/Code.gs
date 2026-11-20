/**
 * Mail Merge + Scheduled Send (Google Sheets + Gmail)
 *
 * Setup (one time per sheet):
 *   1. Open the Google Sheet with your contacts.
 *   2. Extensions > Apps Script. Delete what's there, paste this whole file, click Save.
 *   3. Reload the sheet. A "Mail Merge" menu appears. Run "1. Set up sheet".
 *      Google will ask you to authorize the script the first time (see README).
 *
 * Every run after that:
 *   Edit the Template tab > Preview > Send test to myself > Schedule send.
 *
 * How sending works: the first email goes out at the time you pick, then one email
 * every few minutes (the "Minutes between emails" setting) until every row with an
 * empty Status is sent. Each row is marked Sent with a timestamp, so nobody gets
 * emailed twice. Type "Skip" in a row's Status to leave that person out.
 * Your computer does not need to be on: this runs on Google's servers.
 */

const CONTACTS = 'Contacts';
const TEMPLATE = 'Template';
const PASTE = 'Paste';
const HANDLER = 'sendNext';
const BASE_HEADERS = ['FirstName', 'LastName', 'Email', 'Title', 'Company', 'Location'];
const EXTRA_HEADERS = ['CustomLine', 'Status', 'SentAt'];
const EMAIL_RE = /^[\w.+'-]+@[\w-]+(\.[\w-]+)+$/;

const DEFAULT_SUBJECT = '{{Company}} [ROLE] applicant: [YOUR NAME]';
const DEFAULT_BODY = [
  'Hi {{FirstName}},',
  '',
  "I'm [YOUR NAME], [ONE LINE ABOUT YOU]. I applied to {{Company}}'s [ROLE NAME + JOB ID] and wanted to reach out directly.",
  '',
  '{{CustomLine}}',
  '',
  "A few things I've built:",
  '- [PROJECT OR ROLE 1]',
  '- [PROJECT OR ROLE 2]',
  '',
  "If this isn't on your desk, I'd appreciate a pointer to whoever owns it. My resume is attached.",
  '',
  'Thanks,',
  '[YOUR NAME]',
].join('\n');

/* ---------------- Menu ---------------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Mail Merge')
    .addItem('1. Set up sheet', 'setupSheet')
    .addItem('Import contacts from Paste tab', 'importFromPaste')
    .addSeparator()
    .addItem('2. Preview first email', 'previewFirst')
    .addItem('3. Send test to myself', 'sendTest')
    .addItem('4. Schedule send...', 'scheduleSend')
    .addSeparator()
    .addItem('Show status', 'showStatus')
    .addItem('Cancel scheduled send', 'cancelSchedule')
    .addToUi();
}

/* ---------------- Setup ---------------- */

function setupSheet() {
  const ss = SpreadsheetApp.getActive();

  // Contacts tab: use an existing "Contacts" tab, otherwise adopt the first tab.
  let contacts = ss.getSheetByName(CONTACTS);
  if (!contacts) {
    contacts = ss.getSheets()[0];
    contacts.setName(CONTACTS);
  }
  if (contacts.getLastColumn() === 0 || !String(contacts.getRange(1, 1).getValue()).trim()) {
    contacts.getRange(1, 1, 1, BASE_HEADERS.length).setValues([BASE_HEADERS]);
  }
  const headers = getHeaders_(contacts);
  EXTRA_HEADERS.forEach(h => {
    if (headers.indexOf(h) === -1) {
      contacts.getRange(1, contacts.getLastColumn() + 1).setValue(h);
      headers.push(h);
    }
  });
  contacts.getRange(1, 1, 1, contacts.getLastColumn()).setFontWeight('bold');
  contacts.setFrozenRows(1);

  // Template tab.
  if (!ss.getSheetByName(TEMPLATE)) {
    const t = ss.insertSheet(TEMPLATE);
    t.getRange('A1:B6').setValues([
      ['Subject', DEFAULT_SUBJECT],
      ['Body', DEFAULT_BODY],
      ['Resume (Google Drive link, optional)', ''],
      ['Sender name', ''],
      ['Minutes between emails', 3],
      ['', ''],
    ]);
    t.getRange('A8').setValue(
      'Placeholders: {{FirstName}}, {{LastName}}, {{Company}}, {{Title}}, {{CustomLine}}, or any other column header on the Contacts tab.\n' +
      'If a row has no CustomLine, that line disappears cleanly.\n' +
      'Any text in [SQUARE BRACKETS] blocks scheduling until you replace it, so you cannot send a half-finished template.');
    t.getRange('A1:A6').setFontWeight('bold').setVerticalAlignment('top');
    t.getRange('B1:B6').setWrap(true).setVerticalAlignment('top');
    t.setColumnWidth(1, 240);
    t.setColumnWidth(2, 640);
  }

  // Paste tab for importing raw exports (Apollo and similar).
  if (!ss.getSheetByName(PASTE)) {
    const p = ss.insertSheet(PASTE);
    p.getRange('A1').setValue('Paste a raw contact export (Apollo etc.) into column A starting at A2, then run Mail Merge > Import contacts from Paste tab.');
  }

  ss.setActiveSheet(ss.getSheetByName(TEMPLATE));
  SpreadsheetApp.getUi().alert(
    'Sheet is ready.\n\nCheck File > Settings > Time zone is yours (currently ' + ss.getSpreadsheetTimeZone() + ').\n' +
    'Next: edit the Template tab, then Preview, then Send test to myself.');
}

/* ---------------- Import from a raw paste ---------------- */

function importFromPaste() {
  const ss = SpreadsheetApp.getActive();
  const paste = ss.getSheetByName(PASTE);
  if (!paste || paste.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('Paste your raw export into column A of the Paste tab (from A2 down) first.');
    return;
  }
  // Works whether the paste landed in one cell or was split across rows.
  const lines = paste.getRange(2, 1, paste.getLastRow() - 1, 1).getValues()
    .map(r => String(r[0])).join('\n').split('\n').map(s => s.trim());

  const found = [];
  lines.forEach((line, i) => {
    if (!EMAIL_RE.test(line)) return;
    const email = line.toLowerCase();
    const back = [];
    for (let j = i - 1; j >= 0 && j >= i - 8 && back.length < 3; j--) if (lines[j]) back.push(lines[j]);
    const local = email.split('@')[0].split(/[._-]/);
    let company = back[0] || '', title = back[1] || '', name = back[2] || '';
    const lastName = name.split(/\s+/).pop().toLowerCase();
    if (!name || lastName !== local[local.length - 1]) {
      // Record was cut off or doesn't line up: fall back to a name built from the email.
      name = local.map(cap_).join(' ');
      title = '';
      company = company && !EMAIL_RE.test(company) ? company : '';
    }
    let location = '';
    for (let j = i + 1; j < Math.min(lines.length, i + 16); j++) {
      const t = lines[j];
      if (EMAIL_RE.test(t)) break;
      if ((t.indexOf(',') > -1 && !/^[\d,+]+$/.test(t)) || t === 'United States') { location = t; break; }
    }
    const parts = name.split(/\s+/);
    found.push({ FirstName: parts[0], LastName: parts.slice(1).join(' '), Email: email, Title: title, Company: company, Location: location });
  });

  if (!found.length) { SpreadsheetApp.getUi().alert('No email addresses found in the Paste tab.'); return; }

  const { sheet, headers, rows } = readContacts_();
  const existing = new Set(rows.map(r => String(r.data.Email).toLowerCase()));
  const fresh = found.filter(f => !existing.has(f.Email));
  if (fresh.length) {
    const values = fresh.map(f => headers.map(h => f[h] !== undefined ? f[h] : ''));
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
  }
  SpreadsheetApp.getUi().alert('Found ' + found.length + ' contacts, added ' + fresh.length +
    ' new (skipped ' + (found.length - fresh.length) + ' already on the Contacts tab).\n\nCheck names and companies before sending.');
}

/* ---------------- Preview / test ---------------- */

function previewFirst() {
  const tpl = readTemplate_();
  const pending = pendingRows_();
  if (!pending.length) { SpreadsheetApp.getUi().alert('No unsent contacts.'); return; }
  const r = pending[0];
  const html = '<div style="font-family:Arial,sans-serif;font-size:13px">' +
    '<b>To:</b> ' + esc_(r.data.Email) + '<br><b>Subject:</b> ' + esc_(render_(tpl.subject, r.data)) +
    (tpl.resumeId ? '<br><b>Attachment:</b> resume from Drive' : '<br><b>Attachment:</b> none') +
    '<hr><pre style="white-space:pre-wrap;font-family:Arial,sans-serif">' + esc_(render_(tpl.body, r.data)) + '</pre>' +
    problemsHtml_(validate_(tpl)) + '</div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(640).setHeight(520), 'Preview: ' + r.data.FirstName);
}

function sendTest() {
  const tpl = readTemplate_();
  const pending = pendingRows_();
  if (!pending.length) { SpreadsheetApp.getUi().alert('No unsent contacts to build a test from.'); return; }
  const me = Session.getEffectiveUser().getEmail();
  sendOne_(pending[0], tpl, me, '[TEST] ');
  const problems = validate_(tpl);
  SpreadsheetApp.getUi().alert('Test sent to ' + me + ' using ' + pending[0].data.FirstName + "'s row." +
    (problems.length ? '\n\nStill needs fixing before you can schedule:\n- ' + problems.join('\n- ') : ''));
}

/* ---------------- Scheduling ---------------- */

function scheduleSend() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const tpl = readTemplate_();
  const problems = validate_(tpl);
  if (problems.length) { ui.alert('Fix these before scheduling:\n\n- ' + problems.join('\n- ')); return; }
  const pending = pendingRows_();
  if (!pending.length) { ui.alert('No unsent contacts.'); return; }

  const tz = ss.getSpreadsheetTimeZone();
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const def = Utilities.formatDate(tomorrow, tz, 'yyyy-MM-dd') + ' 10:00';
  const resp = ui.prompt('Schedule send',
    'When should the first email go out?\nFormat: yyyy-MM-dd HH:mm (24-hour, ' + tz + ')\nLeave blank for ' + def + '.',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const text = resp.getResponseText().trim() || def;

  let when;
  try { when = Utilities.parseDate(text, tz, 'yyyy-MM-dd HH:mm'); }
  catch (e) { ui.alert('Could not read "' + text + '". Use the format 2026-11-20 10:00.'); return; }
  if (when.getTime() <= Date.now() + 60 * 1000) { ui.alert('That time is in the past (or under a minute away).'); return; }

  const endsAt = new Date(when.getTime() + (pending.length - 1) * tpl.gapMinutes * 60 * 1000);
  const ok = ui.alert('Confirm',
    'Send ' + pending.length + ' emails, first at ' + fmt_(when, tz) + ', then one every ~' + tpl.gapMinutes +
    ' min (last one around ' + fmt_(endsAt, tz) + ')?\n\nSubject: ' + render_(tpl.subject, pending[0].data),
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  deleteTriggers_();
  ScriptApp.newTrigger(HANDLER).timeBased().at(when).create();
  PropertiesService.getScriptProperties().setProperty('MM_NEXT', when.toISOString());
  ui.alert('Scheduled. First email at ' + fmt_(when, tz) + '.\n\nYou can close this tab. You will get a summary email when it finishes.\nTo stop it: Mail Merge > Cancel scheduled send.');
}

/** Runs on a timer: sends the next unsent row, then schedules itself again. */
function sendNext() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    deleteTriggers_();
    const props = PropertiesService.getScriptProperties();
    const tpl = readTemplate_();
    const pending = pendingRows_();
    if (!pending.length) { finish_(); return; }

    if (MailApp.getRemainingDailyQuota() < 1) {
      // Out of Gmail's daily quota: try again in 24 hours instead of failing rows.
      const retry = new Date(Date.now() + 24 * 3600 * 1000);
      ScriptApp.newTrigger(HANDLER).timeBased().at(retry).create();
      props.setProperty('MM_NEXT', retry.toISOString());
      return;
    }

    const row = pending[0];
    try {
      sendOne_(row, tpl, row.data.Email, '');
      mark_(row, 'Sent');
    } catch (e) {
      mark_(row, 'Error: ' + e.message);
    }

    if (pending.length > 1) {
      const jitter = Math.floor(Math.random() * 60 * 1000); // up to 1 min, so sends aren't perfectly regular
      const next = new Date(Date.now() + tpl.gapMinutes * 60 * 1000 + jitter);
      ScriptApp.newTrigger(HANDLER).timeBased().at(next).create();
      props.setProperty('MM_NEXT', next.toISOString());
    } else {
      finish_();
    }
  } finally {
    lock.releaseLock();
  }
}

function cancelSchedule() {
  deleteTriggers_();
  PropertiesService.getScriptProperties().deleteProperty('MM_NEXT');
  SpreadsheetApp.getUi().alert('Scheduled send cancelled. Rows already marked Sent stay sent; the rest stay unsent.');
}

function showStatus() {
  const { rows } = readContacts_();
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  let sent = 0, errors = 0, skipped = 0, pending = 0;
  rows.forEach(r => {
    const s = String(r.data.Status || '');
    if (s === 'Sent') sent++;
    else if (s.indexOf('Error') === 0) errors++;
    else if (s) skipped++;
    else if (EMAIL_RE.test(String(r.data.Email).trim())) pending++;
  });
  const next = PropertiesService.getScriptProperties().getProperty('MM_NEXT');
  const scheduled = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === HANDLER);
  SpreadsheetApp.getUi().alert(
    'Sent: ' + sent + '\nErrors: ' + errors + '\nSkipped: ' + skipped + '\nWaiting: ' + pending +
    '\n\n' + (scheduled && next ? 'Next send: ' + fmt_(new Date(next), tz) : 'Nothing scheduled.') +
    '\nGmail sends left today: ' + MailApp.getRemainingDailyQuota());
}

/* ---------------- Internals ---------------- */

function sendOne_(row, tpl, to, subjectPrefix) {
  const opts = { name: tpl.senderName };
  if (tpl.resumeId) {
    const file = DriveApp.getFileById(tpl.resumeId);
    const isGoogleDoc = file.getMimeType().indexOf('application/vnd.google-apps') === 0;
    const blob = isGoogleDoc ? file.getAs(MimeType.PDF) : file.getBlob();
    if (isGoogleDoc) blob.setName(file.getName() + '.pdf');
    opts.attachments = [blob];
  }
  MailApp.sendEmail(to, subjectPrefix + render_(tpl.subject, row.data), render_(tpl.body, row.data), opts);
}

function render_(text, data) {
  return String(text)
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => (data[key] === undefined || data[key] === null) ? '' : String(data[key]).trim())
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')   // removes the gap left by an empty {{CustomLine}}
    .trim();
}

function validate_(tpl) {
  const problems = [];
  if (!tpl.subject.trim()) problems.push('Subject is empty.');
  if (!tpl.body.trim()) problems.push('Body is empty.');
  const brackets = (tpl.subject + '\n' + tpl.body).match(/\[[^\]\n]{2,80}\]/g);
  if (brackets) problems.push('Unfilled placeholder(s): ' + brackets.join(', '));
  const headers = getHeaders_(getContactsSheet_());
  const keys = ((tpl.subject + tpl.body).match(/\{\{\s*\w+\s*\}\}/g) || []).map(k => k.replace(/[{}\s]/g, ''));
  const unknown = keys.filter((k, i) => headers.indexOf(k) === -1 && keys.indexOf(k) === i);
  if (unknown.length) problems.push('No Contacts column for: ' + unknown.map(k => '{{' + k + '}}').join(', '));
  if (headers.indexOf('Company') > -1 && keys.indexOf('Company') > -1 &&
      pendingRows_().some(r => !String(r.data.Company).trim())) problems.push('Some unsent rows have an empty Company.');
  if (tpl.resumeLink && !tpl.resumeId) problems.push('Could not read a Drive file ID from the resume link.');
  if (tpl.resumeId) {
    try { DriveApp.getFileById(tpl.resumeId).getName(); }
    catch (e) { problems.push('Cannot open the resume file. Make sure the link points to a file in your Drive.'); }
  }
  return problems;
}

function readTemplate_() {
  const t = SpreadsheetApp.getActive().getSheetByName(TEMPLATE);
  if (!t) throw new Error('No Template tab. Run Mail Merge > 1. Set up sheet first.');
  const map = {};
  t.getRange(1, 1, Math.max(t.getLastRow(), 1), 2).getValues().forEach(r => { map[String(r[0]).trim().toLowerCase()] = r[1]; });
  const get = prefix => { const k = Object.keys(map).find(x => x.indexOf(prefix) === 0); return k ? map[k] : ''; };
  const resumeLink = String(get('resume') || '').trim();
  const idMatch = resumeLink.match(/[-\w]{25,}/);
  const gap = Number(get('minutes between'));
  return {
    subject: String(get('subject') || ''),
    body: String(get('body') || ''),
    resumeLink: resumeLink,
    resumeId: idMatch ? idMatch[0] : '',
    senderName: String(get('sender name') || '').trim() || undefined,
    gapMinutes: gap >= 1 ? gap : 3,
  };
}

function getContactsSheet_() {
  const s = SpreadsheetApp.getActive().getSheetByName(CONTACTS);
  if (!s) throw new Error('No Contacts tab. Run Mail Merge > 1. Set up sheet first.');
  return s;
}

function getHeaders_(sheet) {
  if (sheet.getLastColumn() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
}

function readContacts_() {
  const sheet = getContactsSheet_();
  const headers = getHeaders_(sheet);
  const rows = [];
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().forEach((vals, i) => {
      const data = {};
      headers.forEach((h, j) => { data[h] = vals[j]; });
      rows.push({ rowIndex: i + 2, data: data });
    });
  }
  return { sheet: sheet, headers: headers, rows: rows };
}

function pendingRows_() {
  return readContacts_().rows.filter(r => !String(r.data.Status || '').trim() && EMAIL_RE.test(String(r.data.Email).trim()));
}

function mark_(row, status) {
  const sheet = getContactsSheet_();
  const headers = getHeaders_(sheet);
  sheet.getRange(row.rowIndex, headers.indexOf('Status') + 1).setValue(status);
  sheet.getRange(row.rowIndex, headers.indexOf('SentAt') + 1).setValue(new Date());
  SpreadsheetApp.flush();
}

function finish_() {
  PropertiesService.getScriptProperties().deleteProperty('MM_NEXT');
  const { rows } = readContacts_();
  const sent = rows.filter(r => r.data.Status === 'Sent').length;
  const errs = rows.filter(r => String(r.data.Status).indexOf('Error') === 0);
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Mail merge finished: ' + sent + ' sent',
    'Sent: ' + sent + '\nErrors: ' + errs.length +
    (errs.length ? '\n\n' + errs.map(r => r.data.Email + ': ' + r.data.Status).join('\n') : '') +
    '\n\nSheet: ' + SpreadsheetApp.getActive().getUrl());
}

function deleteTriggers_() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === HANDLER) ScriptApp.deleteTrigger(t); });
}

function fmt_(d, tz) { return Utilities.formatDate(d, tz, 'EEE MMM d, h:mm a'); }
function cap_(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function problemsHtml_(p) {
  return p.length ? '<hr><div style="color:#b00"><b>Fix before scheduling:</b><ul><li>' + p.map(esc_).join('</li><li>') + '</li></ul></div>' : '';
}
