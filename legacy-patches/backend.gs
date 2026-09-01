// ===== CONFIG =====
const BLOCK_WIDTH = 7;
const DAY_HEADER_ROW = 3;
const MAX_ROWS_PER_BLOCK = 40;

// ===== FOLDER IDS =====
const FOLDER_IDS = [
  '1OmNOsUH_0FTj1iKFj93_wxab5JiuWQ8x', // Online Clients
  '1Hl7Lem5kyr9v036gmMDZdfi24SKH4Quc'  // Gym Clients
];

// ===== UTIL =====

// Normalize: lowercase, collapse whitespace — but KEEP numbers
function normalize(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, () => new Array(n+1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
    }
  }
  return dp[m][n];
}

// Generic words that appear across many different exercises — ignored for matching
const STOPWORDS = new Set(['machine','cable','barbell','dumbbell','db','seated','standing','lying','incline','decline','flat','band','plate','smith','bench']);

function stripStopwords(norm) {
  const kept = norm.split(' ').filter(function(t){ return t && !STOPWORDS.has(t); });
  return kept.length ? kept.join(' ') : norm; // never strip everything
}

// Jaccard token overlap (0–1)
function jaccardSimilarity(normA, normB) {
  const setA = new Set(normA.split(' '));
  const setB = new Set(normB.split(' '));
  let inter = 0;
  setA.forEach(t => { if (setB.has(t)) inter++; });
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

// Levenshtein similarity as 0–1
function levSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / maxLen;
}

// Extract digit strings from a normalized string
function extractNumbers(norm) {
  return norm.match(/\d+/g) || [];
}

/**
 * Exact token-set match.
 *
 * Previous version scored PARTIAL word overlap (Jaccard + Levenshtein),
 * which let "BB bench press" match "DB bench press" — they share 2 of 3
 * words and are nearly the same length, so the combined score cleared the
 * 0.5 threshold despite BB (barbell) and DB (dumbbell) being different
 * equipment. There is no safe partial-credit threshold for exercise names:
 * a single differing word is often the whole point (BB vs DB, incline vs
 * flat, left vs right).
 *
 * New rule: same set of words, case-insensitive, order-independent — full
 * credit or nothing. A few common equipment abbreviations are canonicalized
 * first (bb→barbell, db→dumbbell, kb→kettlebell) so "BB Bench Press" still
 * matches "Barbell Bench Press" written out in full, without ever treating
 * bb and db as interchangeable.
 */
const ABBREVIATIONS = { bb: 'barbell', db: 'dumbbell', kb: 'kettlebell' };

function canonicalTokenSet(norm) {
  return norm.split(' ').filter(Boolean).map(t => ABBREVIATIONS[t] || t).sort().join(' ');
}

function fuzzyScore(inputNorm, candidateNorm) {
  return canonicalTokenSet(inputNorm) === canonicalTokenSet(candidateNorm) ? 1 : 0;
}

function fuzzyMatchImage(exerciseName, entries, threshold) {
  threshold = threshold !== undefined ? threshold : 0.5;
  const target = normalize(exerciseName);
  let best = null, bestScore = -1;
  entries.forEach(e => {
    const score = fuzzyScore(target, e.norm);
    if (score > bestScore) { bestScore = score; best = e; }
  });
  if (!best || bestScore < threshold) return null;
  return { url: best.url, cues: best.cues || null };
}

function fuzzyMatchProgress(exerciseName, rows, threshold) {
  threshold = threshold !== undefined ? threshold : 0.5;
  const target = normalize(exerciseName);
  let best = null, bestScore = -1;
  rows.forEach(rw => {
    const score = fuzzyScore(target, rw.norm);
    if (score > bestScore) { bestScore = score; best = rw; }
  });
  if (!best || bestScore < threshold) return null;
  return best.pr;
}

// Quick test — run manually in Apps Script editor to verify fuzzy matching
function testFuzzyMatch() {
  const entries = [
    { name: 'Leg Extension Machine', norm: normalize('Leg Extension Machine'), url: 'url_legext', cues: null },
    { name: 'Leg Press Machine', norm: normalize('Leg Press Machine'), url: 'url_legpress', cues: null },
    { name: 'Back Extension', norm: normalize('Back Extension'), url: 'url_back', cues: null },
    { name: 'Chest Machine 47', norm: normalize('Chest Machine 47'), url: 'url_cm47', cues: null },
    { name: 'Chest Machine 48', norm: normalize('Chest Machine 48'), url: 'url_cm48', cues: null },
  ];

  const tests = [
    { input: 'leg extension machine', expect: 'url_legext' },
    { input: 'leg press machine', expect: 'url_legpress' },
    { input: 'back extension', expect: 'url_back' },
    { input: 'chest machine 47', expect: 'url_cm47' },
    { input: 'chest machine 48', expect: 'url_cm48' },
  ];

  tests.forEach(t => {
    const result = fuzzyMatchImage(t.input, entries);
    const got = result ? result.url : null;
    Logger.log((got === t.expect ? '✅' : '❌') + ' "' + t.input + '" → ' + got + ' (expected ' + t.expect + ')');
  });
}

// ===== REST UNCHANGED BELOW =====

function toDriveImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1000';
  return url;
}

const IMAGE_SHEET_ID = '1o_Tax3WO-1Ks7Oq-8WISymZq8Xsxx9gADTlXw1enV74';

function buildImageMap(ss) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('imageMap');
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  let sheet;
  try {
    sheet = SpreadsheetApp.openById(IMAGE_SHEET_ID).getSheets()[0];
  } catch (e) {
    sheet = ss.getSheetByName('Exercise Images');
  }
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const entries = [];
  for (let r = 1; r < values.length; r++) {
    const name = values[r][0];
    if (!name) continue;
    let url = values[r][1];
    if (url && typeof url === 'object' && url.getUrl) url = url.getUrl();
    const cues = values[r][2] ? String(values[r][2]) : null;
    entries.push({ name: name, norm: normalize(name), url: url ? toDriveImageUrl(url) : null, cues: cues });
  }
  try { cache.put('imageMap', JSON.stringify(entries), 600); } catch (e) {}
  return entries;
}

function findTodayBlock(sheet, targetDay) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  for (let r = 0; r < values.length; r++) {
    const cell = values[r][0];
    if (typeof cell === 'string' && cell.toUpperCase().indexOf('WEEK') === 0) {
      const dayRow = r + 1;
      for (let c = 0; c < lastCol; c += BLOCK_WIDTH) {
        const dayVal = values[dayRow] ? values[dayRow][c] : null;
        if (dayVal && Math.round(Number(dayVal)) === targetDay) {
          return { startCol: c + 1, headerRow: dayRow + 2 };
        }
      }
    }
  }
  return null;
}

// ===== NEW: full block registry, used by moveDay / assignDay =====
// Mirrors findTodayBlock's row/column math exactly, but returns EVERY block
// in the sheet (not just the one matching a target day), including blocks
// whose day cell is blank but still contain exercise data underneath —
// those are "unscheduled" trainings waiting to be assigned a day.
function locateAllBlocks(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const blocks = [];
  for (let r = 0; r < values.length; r++) {
    const cell = values[r][0];
    if (typeof cell === 'string' && cell.toUpperCase().indexOf('WEEK') === 0) {
      const dayRow = r + 1; // 0-indexed row into `values` holding the day numbers
      for (let c = 0; c < lastCol; c += BLOCK_WIDTH) {
        const raw = values[dayRow] ? values[dayRow][c] : null;
        const valid = raw !== null && raw !== '' && !isNaN(Number(raw));
        blocks.push({
          dayCellRow: dayRow + 1,      // 1-indexed absolute sheet row of the day-number cell
          dayCellCol: c + 1,           // 1-indexed absolute sheet column of the day-number cell
          dayVal: valid ? Math.round(Number(raw)) : null,
          startCol: c + 1,             // matches findTodayBlock's startCol contract
          headerRow: dayRow + 2        // matches findTodayBlock's headerRow contract exactly
        });
      }
    }
  }
  return blocks;
}

function blockLabel(sheet, block, dayForLabel) {
  const exs = readBlock(sheet, block.startCol, block.headerRow);
  if (!exs.length) return 'Day ' + dayForLabel;
  const extra = exs.length > 1 ? ' +' + (exs.length - 1) + ' more' : '';
  return exs[0].name + extra;
}

// Moves the training on `fromDay` to `toDay` within the current month tab.
// If `toDay` is already occupied, that block's day cell is cleared (blanked)
// instead of being overwritten, and its identity is returned as `displaced`
// so the front end can show it as "Unscheduled" until reassigned.
function moveDayAction(ss, fromDay, toDay) {
  const tabName = getCurrentMonthTabName(ss, new Date());
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return { error: 'sheet_not_found' };
  const blocks = locateAllBlocks(sheet);
  const fromBlock = blocks.find(b => b.dayVal === fromDay);
  if (!fromBlock) return { error: 'source_day_not_found' };
  const toBlock = blocks.find(b => b.dayVal === toDay);
  let displaced = null;
  if (toBlock) {
    const label = blockLabel(sheet, toBlock, toDay);
    sheet.getRange(toBlock.dayCellRow, toBlock.dayCellCol).setValue('');
    displaced = { id: tabName + ':' + toBlock.dayCellRow + ':' + toBlock.dayCellCol, label: label };
  }
  sheet.getRange(fromBlock.dayCellRow, fromBlock.dayCellCol).setValue(toDay);
  return { status: 'ok', displaced: displaced };
}

// Assigns a day to a previously-unscheduled block, identified by the
// `id` returned from getMonthCalendar / moveDayAction ("tabName:row:col").
// If the chosen day is already occupied, that block is displaced in turn,
// same as moveDayAction.
function assignDayAction(ss, id, day) {
  const parts = String(id).split(':');
  if (parts.length !== 3) return { error: 'invalid_id' };
  const tabName = parts[0], row = parseInt(parts[1], 10), col = parseInt(parts[2], 10);
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return { error: 'invalid_id' };
  const blocks = locateAllBlocks(sheet);
  const toBlock = blocks.find(b => b.dayVal === day);
  let displaced = null;
  if (toBlock) {
    const label = blockLabel(sheet, toBlock, day);
    sheet.getRange(toBlock.dayCellRow, toBlock.dayCellCol).setValue('');
    displaced = { id: tabName + ':' + toBlock.dayCellRow + ':' + toBlock.dayCellCol, label: label };
  }
  sheet.getRange(row, col).setValue(day);
  return { status: 'ok', displaced: displaced };
}

function readBlock(sheet, startCol, headerRow) {
  const firstDataRow = headerRow + 1;
  const exercises = [];
  let lastColor = null;
  let groupId = 0;
  let blankStreak = 0;
  for (let r = firstDataRow; r < firstDataRow + MAX_ROWS_PER_BLOCK; r++) {
    const exCell = sheet.getRange(r, startCol);
    const name = exCell.getValue();
    if (!name) {
      blankStreak++;
      if (blankStreak >= 2) break;
      continue;
    }
    if (typeof name === 'string' && name.toUpperCase().indexOf('WEEK') === 0) break;
    blankStreak = 0;
const target = sheet.getRange(r, startCol + 1).getValue();
const targetWeight = sheet.getRange(r, startCol + 2).getValue();  // coach col, read for display later if needed
const weight = sheet.getRange(r, startCol + 3).getValue();
const reps   = sheet.getRange(r, startCol + 4).getValue();
const notes  = sheet.getRange(r, startCol + 5).getValue();
if (!target && !weight && !reps && !notes) continue;
    const color = exCell.getBackground();
    if (color !== lastColor && color !== '#ffffff' && color !== '#000000') groupId++;
    lastColor = color;
    const videoUrl = exCell.getRichTextValue() ? exCell.getRichTextValue().getLinkUrl() : null;
    exercises.push({
      id: 'r' + r + 'c' + startCol,
      name: name,
      target: target || '',
      weight: weight || '',
      reps: reps || '',
      notes: notes || '',
      videoUrl: videoUrl,
      groupColor: (color && color !== '#ffffff') ? color : null,
      groupId: (color && color !== '#ffffff') ? groupId : null,
      sheet: sheet.getName(),
      row: r,
targetWeight: targetWeight || '',
weightCol: columnToLetter(startCol + 3),
repsCol:   columnToLetter(startCol + 4),
notesCol:  columnToLetter(startCol + 5),
feedbackCol: columnToLetter(startCol + 6)
    });
  }
  return exercises;
}

function columnToLetter(col) {
  let letter = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

function getCurrentMonthTabName(ss, refDate) {
  const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const mon = monthNames[refDate.getMonth()];
  const yy = String(refDate.getFullYear()).slice(-2);
  const candidate = mon + yy;
  if (ss.getSheetByName(candidate)) return candidate;
  return ss.getSheets()[0].getName();
}

function getPinCache() {
  const raw = PropertiesService.getScriptProperties().getProperty('pinCache');
  try { return raw ? JSON.parse(raw) : {}; } catch(e) { return {}; }
}

function savePinCache(cache) {
  PropertiesService.getScriptProperties().setProperty('pinCache', JSON.stringify(cache));
}

function clearClientCache() {
  PropertiesService.getScriptProperties().deleteProperty('pinCache');
  Logger.log('PIN cache cleared.');
}

function findClientByPin(pin) {
  const cache = getPinCache();
  const pinStr = String(pin).trim();

  if (cache[pinStr]) {
    try {
      const ss = SpreadsheetApp.openById(cache[pinStr].fileId);
      return { ss: ss, clientName: cache[pinStr].clientName };
    } catch(e) {
      delete cache[pinStr];
      savePinCache(cache);
    }
  }

  for (let i = 0; i < FOLDER_IDS.length; i++) {
    const folder = DriveApp.getFolderById(FOLDER_IDS[i]);
    const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
    while (files.hasNext()) {
      const file = files.next();
      const ss = SpreadsheetApp.open(file);
      const infoSheet = ss.getSheetByName('info');
      if (!infoSheet) continue;
      const values = infoSheet.getDataRange().getValues();
      for (let r = 0; r < values.length; r++) {
        if (String(values[r][0]).toLowerCase().indexOf('pin') === 0) {
          const sheetPin = String(values[r][1]).replace('.0','').trim();
          if (sheetPin === pinStr) {
            const nameRow = values.find(row => String(row[0]).toLowerCase() === 'client name');
            const clientName = nameRow ? nameRow[1] : file.getName();
            cache[pinStr] = { fileId: file.getId(), clientName: clientName };
            savePinCache(cache);
            return { ss: ss, clientName: clientName };
          }
        }
      }
    }
  }
  return null;
}

function buildProgressMap(ss) {
  const sheet = ss.getSheetByName('Progress');
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const rows = [];
  for (let r = 2; r < values.length; r++) {
    const name = values[r][0];
    if (!name) continue;
    const entries = [];
    for (let c = 1; c < values[r].length; c += 2) {
      const date = values[r][c];
      const result = values[r][c + 1];
      if (date || result) entries.push({ date: date, result: result });
    }
    let best = null;
    entries.forEach(e => {
      const w = parsePrWeight(e.result);
      if (w !== null && (!best || w > best.weight)) {
        best = { weight: w, date: formatPrDate(e.date), result: String(e.result || '') };
      }
    });
    rows.push({ name: name, norm: normalize(name), pr: best });
  }
  return rows;
}

function parsePrWeight(result) {
  if (!result) return null;
  const m = String(result).match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function formatPrDate(d) {
  if (Object.prototype.toString.call(d) === '[object Date]') {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd.MM.yy');
  }
  return d ? String(d) : '';
}

// ===== UPDATED: also surfaces "unscheduled" blocks (blank day cell, but has exercise data) =====
function getMonthCalendar(ss, refDate) {
  const tabName = getCurrentMonthTabName(ss, refDate);
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return { days: [], unscheduled: [] };
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const range = sheet.getRange(1, 1, lastRow, lastCol);
  const values = range.getValues();
  const backgrounds = range.getBackgrounds();
  const days = [];
  const unscheduled = [];
  for (let r = 0; r < values.length; r++) {
    const cell = values[r][0];
    if (typeof cell === 'string' && cell.toUpperCase().indexOf('WEEK') === 0) {
      const dayRow = r + 1;
      const headerRow = dayRow + 2;
      const firstDataRow = headerRow + 1;
      for (let c = 0; c < lastCol; c += BLOCK_WIDTH) {
        const dayValRaw = values[dayRow] ? values[dayRow][c] : null;
        const validDay = dayValRaw !== null && dayValRaw !== '' && !isNaN(Number(dayValRaw));
        const firstExCell = values[firstDataRow] ? values[firstDataRow][c] : null;

        if (!validDay) {
          if (firstExCell) {
            unscheduled.push({
              id: tabName + ':' + (dayRow + 1) + ':' + (c + 1),
              label: String(firstExCell)
            });
          }
          continue;
        }

        const dayNum = Math.round(Number(dayValRaw));
        const repsColIdx = c + 4;
        let logged = false;
        for (let dr = firstDataRow; dr < firstDataRow + MAX_ROWS_PER_BLOCK; dr++) {
          if (dr >= values.length) break;
          const exName = values[dr] ? values[dr][c] : null;
          if (!exName) {
            const nextBlank = (dr + 1 < values.length) ? !values[dr + 1][c] : true;
            if (nextBlank) break;
            continue;
          }
          if (typeof exName === 'string' && exName.toUpperCase().indexOf('WEEK') === 0) break;
          const bg = backgrounds[dr] ? backgrounds[dr][repsColIdx] : null;
          if (bg && bg.toLowerCase() === '#c8f0c8') { logged = true; break; }
        }
        days.push({ day: dayNum, logged: logged });
      }
    }
  }
  return { days: days, unscheduled: unscheduled };
}

// ===== Web app entrypoints =====
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ error: 'use_post' })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const action = payload.action || 'save';

  if (action === 'load') {
    const found = findClientByPin(payload.pin);
    if (!found) return json({ error: 'invalid_pin' });

    const today = new Date();
    const tabName = getCurrentMonthTabName(found.ss, today);
    const sheet = found.ss.getSheetByName(tabName);
    const block = findTodayBlock(sheet, today.getDate());
    if (!block) return json({ error: 'no_session_today', clientName: found.clientName });

    const exercises = readBlock(sheet, block.startCol, block.headerRow);
    const imageEntries = buildImageMap(found.ss);
    const progressRows = buildProgressMap(found.ss);
    exercises.forEach(ex => {
      const imgMatch = fuzzyMatchImage(ex.name, imageEntries);
      ex.muscleImg = imgMatch ? imgMatch.url : null;
      ex.cues = imgMatch ? imgMatch.cues : null;
      ex.pr = fuzzyMatchProgress(ex.name, progressRows);
    });
    return json({ clientName: found.clientName, title: found.clientName + ' — ' + tabName, exercises: exercises });
  }

  if (action === 'calendar') {
    const found = findClientByPin(payload.pin);
    if (!found) return json({ error: 'invalid_pin' });
    const cal = getMonthCalendar(found.ss, new Date());
    // Merge scheduled + unscheduled into one list; front end tells them apart
    // by whether an entry has a `day` key or an `id` key.
    return json({ days: cal.days.concat(cal.unscheduled), clientName: found.clientName });
  }

  if (action === 'day') {
    const found = findClientByPin(payload.pin);
    if (!found) return json({ error: 'invalid_pin' });
    const today = new Date();
    const refDate = new Date(today.getFullYear(), today.getMonth(), parseInt(payload.day));
    const tabName = getCurrentMonthTabName(found.ss, refDate);
    const sheet = found.ss.getSheetByName(tabName);
    const block = findTodayBlock(sheet, parseInt(payload.day));
    if (!block) return json({ error: 'no_session_today', clientName: found.clientName });
    const exercises = readBlock(sheet, block.startCol, block.headerRow);
    const imageEntries = buildImageMap(found.ss);
    const progressRows = buildProgressMap(found.ss);
    exercises.forEach(ex => {
      const imgMatch = fuzzyMatchImage(ex.name, imageEntries);
      ex.muscleImg = imgMatch ? imgMatch.url : null;
      ex.cues = imgMatch ? imgMatch.cues : null;
      ex.pr = fuzzyMatchProgress(ex.name, progressRows);
    });
    return json({ clientName: found.clientName, title: found.clientName + ' — ' + tabName, exercises: exercises });
  }

  if (action === 'moveDay') {
    const found = findClientByPin(payload.pin);
    if (!found) return json({ error: 'invalid_pin' });
    const result = moveDayAction(found.ss, parseInt(payload.fromDay, 10), parseInt(payload.toDay, 10));
    return json(result);
  }

  if (action === 'assignDay') {
    const found = findClientByPin(payload.pin);
    if (!found) return json({ error: 'invalid_pin' });
    const result = assignDayAction(found.ss, payload.id, parseInt(payload.day, 10));
    return json(result);
  }

  const found = findClientByPin(payload.pin);
  if (!found) return json({ status: 'error', error: 'invalid_pin' });
  const ss = found.ss;
  payload.exercises.forEach(ex => {
    const sheet = ss.getSheetByName(ex.sheet);
    if (!sheet || !ex.row) return;
    if (ex.weight && ex.weightCol) sheet.getRange(ex.weightCol + ex.row).setValue(ex.weight);
    if (ex.reps && ex.repsCol) sheet.getRange(ex.repsCol + ex.row).setValue(ex.reps);
    if (ex.notes && ex.feedbackCol) sheet.getRange(ex.feedbackCol + ex.row).setValue(ex.notes);
    if (ex.done && ex.repsCol) sheet.getRange(ex.repsCol + ex.row).setBackground('#c8f0c8');
  });
  return json({ status: 'ok' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function testImageMap(){
  CacheService.getScriptCache().remove('imageMap');
  const sheet = SpreadsheetApp.openById(IMAGE_SHEET_ID).getSheets()[0];
  Logger.log('Tab: ' + sheet.getName() + ' rows: ' + sheet.getLastRow());
  const v = sheet.getDataRange().getValues();
  for (let r = 1; r < Math.min(v.length, 6); r++){
    Logger.log(v[r][0] + ' | C: ' + JSON.stringify(v[r][2]));
  }
}

function testPin() {
  const result = findClientByPin('1308');
  Logger.log(result ? result.clientName : 'NOT FOUND');
}
