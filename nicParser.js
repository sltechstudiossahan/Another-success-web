/**
 * nicParser.js
 * Pulls structured fields (NIC number, full name, date of birth, sex)
 * out of raw OCR text from a Sri Lankan National Identity Card.
 *
 * Used server-side only (inside the Cloud Function). Never store the
 * OCR text or image alongside the parsed result — only the fields
 * returned by parseNicText() should ever reach Firestore.
 */

const OLD_NIC_REGEX = /\b(\d{9})\s*([vVxX])\b/;
const NEW_NIC_REGEX = /\b(\d{12})\b/;

const NAME_LABELS = [
  /full\s*name[:\-]?\s*(.+)/i,
  /^name[:\-]?\s*(.+)/im,
];

/**
 * Sri Lankan NICs encode date of birth in the number itself.
 * Old format (9 digits + letter): YY DDD ...  DDD = day-of-year (+500 if female)
 * New format (12 digits):        YYYY DDD ... DDD = day-of-year (+500 if female)
 */
function deriveDobFromNic(digits, isOldFormat) {
  let yearDigits, dayOfYear, sex;

  if (isOldFormat) {
    const yy = parseInt(digits.slice(0, 2), 10);
    // Assume 1900s for old-format cards (they predate the 2016 new format)
    yearDigits = 1900 + yy;
    dayOfYear = parseInt(digits.slice(2, 5), 10);
  } else {
    yearDigits = parseInt(digits.slice(0, 4), 10);
    dayOfYear = parseInt(digits.slice(4, 7), 10);
  }

  sex = dayOfYear > 500 ? 'female' : 'male';
  if (dayOfYear > 500) dayOfYear -= 500;

  // Guard against malformed captures (day 0 or > 366)
  if (dayOfYear < 1 || dayOfYear > 366) return null;

  const dob = new Date(yearDigits, 0);
  dob.setDate(dayOfYear);

  return {
    dob: dob.toISOString().slice(0, 10), // YYYY-MM-DD
    sex,
  };
}

function extractNicNumber(text) {
  const oldMatch = text.match(OLD_NIC_REGEX);
  if (oldMatch) {
    return {
      nicNumber: `${oldMatch[1]}${oldMatch[2].toUpperCase()}`,
      digits: oldMatch[1],
      isOldFormat: true,
    };
  }

  const newMatch = text.match(NEW_NIC_REGEX);
  if (newMatch) {
    return {
      nicNumber: newMatch[1],
      digits: newMatch[1],
      isOldFormat: false,
    };
  }

  return null;
}

function extractName(text) {
  for (const pattern of NAME_LABELS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return cleanNameLine(match[1]);
    }
  }

  // Fallback: NIC cards print the holder's name in capital letters on its
  // own line. Pick the longest all-caps line that isn't a header/label.
  const candidates = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 4 && /^[A-Z .,'-]+$/.test(l))
    .filter((l) => !/DEMOCRATIC|SOCIALIST|REPUBLIC|IDENTITY|CARD|SRI\s*LANKA/i.test(l));

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.length - a.length);
  return cleanNameLine(candidates[0]);
}

function cleanNameLine(line) {
  return line.replace(/[^A-Za-z .,'-]/g, '').trim();
}

/**
 * @param {string} rawText - raw text block returned by the OCR provider
 * @returns {{nicNumber: string, fullName: string|null, dob: string|null,
 *            sex: string|null, confidence: 'high'|'medium'|'low'} | null}
 */
function parseNicText(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  const nicInfo = extractNicNumber(rawText);
  if (!nicInfo) return null; // No NIC number found — treat as failed capture

  const derived = deriveDobFromNic(nicInfo.digits, nicInfo.isOldFormat);
  const fullName = extractName(rawText);

  // Confidence heuristic: both name and a sane derived DOB found -> high.
  let confidence = 'low';
  if (fullName && derived) confidence = 'high';
  else if (fullName || derived) confidence = 'medium';

  return {
    nicNumber: nicInfo.nicNumber,
    fullName: fullName || null,
    dob: derived ? derived.dob : null,
    sex: derived ? derived.sex : null,
    confidence,
  };
}

module.exports = { parseNicText, extractNicNumber, extractName, deriveDobFromNic };
