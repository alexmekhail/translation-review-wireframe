/**
 * Synthetic sample: invented Arabic sentences from the wireframe's mock data (src/mockData.ts),
 * with deliberately rough English drafts. Used by the SIMULATED fake provider and by tests.
 * Not reviewed by a qualified translator; not domain validation.
 */
export const MERCHANT_PARAGRAPHS: [string, string][] = [
  ['كان في قديم الزمان تاجر يسافر بين المدن.', 'In old times there was a merchant who travel between the cities.'],
  ['وكان له ثلاثة أبناء لا يحبون العمل.', 'And he had three sons who do not love the work.'],
  ['فقال لهم يومًا: إن المال لا يبقى لمن لا يحفظه.', 'So he say to them one day: The money does not stay for who does not keep it.'],
  ['فسمع الابن الأكبر نصيحة أبيه وذهب إلى السوق.', 'The older son heard advice of his father and went to market.'],
  ['وهناك رأى رجلًا يبيع الكتب القديمة.', 'And there he saw a man selling the old books.'],
  ['فاشترى كتابًا عن الحكمة وقرأه في ليلة واحدة.', 'He bought a book about wisdom and read it in one night.'],
]

export const FIXTURE_DICTIONARY: Record<string, string> = Object.fromEntries(MERCHANT_PARAGRAPHS)
