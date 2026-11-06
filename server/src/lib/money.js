// All money is an integer number of paise (₹1 = 100 paise).
//
// Floating point cannot store most decimal amounts exactly: in JavaScript
// 0.1 + 0.2 === 0.30000000000000004 and 1.15 * 100 === 114.99999999999999.
// A payments system that adds floats slowly loses or creates money. Integer
// paise add up exactly, so every balance and ledger sum here is an integer.

// Converts what the user typed ("125.5", "1,250.75", 99) into paise.
// Works on the text and never multiplies a float by 100.
// Returns null when the input is not a valid positive amount.
export function toPaise(input) {
  if (input === null || input === undefined) return null;
  const text = String(input).trim().replace(/,/g, '');
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;

  const rupees = Number(match[1]);
  const fraction = (match[2] || '').padEnd(2, '0');
  const paise = rupees * 100 + Number(fraction);
  return paise > 0 ? paise : null;
}

// 12550 -> "125.50"
export function paiseToRupees(paise) {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export const rupees = (n) => n * 100;
