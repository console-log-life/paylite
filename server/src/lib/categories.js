// Spending categories. Every payment a user makes is filed under one of these,
// which is what turns the payment history into a spending report.
export const EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Shopping',
  'Travel',
  'Transport',
  'Bills & Utilities',
  'Rent',
  'Entertainment',
  'Health',
  'Education',
  'Friends & Family',
  'Other',
];

// Labels for money coming in. They are not spending, so reports leave them out.
export const INCOME = 'Income';
export const TOPUP = 'Wallet top-up';

// Keyword rules for guessing a category from the payment note.
// Checked in order; the first rule with a matching word wins.
const RULES = [
  ['Rent', ['rent', 'pg', 'hostel', 'landlord', 'flat', 'maintenance']],
  ['Groceries', ['grocery', 'groceries', 'blinkit', 'zepto', 'bigbasket', 'dmart', 'vegetables', 'sabzi', 'milk', 'kirana']],
  ['Food & Dining', ['swiggy', 'zomato', 'food', 'lunch', 'dinner', 'breakfast', 'chai', 'tea', 'coffee', 'pizza', 'restaurant', 'cafe', 'canteen', 'mess', 'snacks', 'biryani']],
  ['Transport', ['uber', 'ola', 'rapido', 'auto', 'cab', 'taxi', 'metro', 'bus', 'petrol', 'diesel', 'fuel', 'parking']],
  ['Travel', ['flight', 'train', 'irctc', 'hotel', 'trip', 'goa', 'holiday', 'booking', 'makemytrip', 'airbnb']],
  ['Shopping', ['amazon', 'flipkart', 'myntra', 'meesho', 'ajio', 'clothes', 'shoes', 'shopping', 'gift']],
  ['Bills & Utilities', ['electricity', 'bill', 'recharge', 'wifi', 'internet', 'broadband', 'gas', 'water', 'mobile', 'jio', 'airtel', 'dth']],
  ['Entertainment', ['movie', 'netflix', 'spotify', 'prime', 'hotstar', 'concert', 'game', 'party', 'pvr', 'bookmyshow']],
  ['Health', ['doctor', 'medicine', 'pharmacy', 'hospital', 'clinic', 'gym', 'apollo', 'medical']],
  ['Education', ['fees', 'fee', 'course', 'book', 'books', 'tuition', 'exam', 'college', 'udemy', 'coaching']],
  ['Friends & Family', ['mom', 'dad', 'mummy', 'papa', 'bro', 'sis', 'family', 'birthday', 'loan', 'udhaar']],
];

// Returns a category for a note like "Swiggy order" -> "Food & Dining",
// or null if no keyword matches.
export function categoryFromNote(note) {
  const words = String(note || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  for (const [category, keywords] of RULES) {
    if (keywords.some((k) => words.includes(k))) return category;
  }
  return null;
}

export const isExpenseCategory = (value) => EXPENSE_CATEGORIES.includes(value);
