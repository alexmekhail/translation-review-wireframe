import type { Doc, Paragraph } from './types'

// Invented short sentences. English drafts are deliberately rough.
const merchant: [string, string][] = [
  ['كان في قديم الزمان تاجر يسافر بين المدن.', 'In old times there was a merchant who travel between the cities.'],
  ['وكان له ثلاثة أبناء لا يحبون العمل.', 'And he had three sons who do not love the work.'],
  ['فقال لهم يومًا: إن المال لا يبقى لمن لا يحفظه.', 'So he say to them one day: The money does not stay for who does not keep it.'],
  ['فسمع الابن الأكبر نصيحة أبيه وذهب إلى السوق.', 'The older son heard advice of his father and went to market.'],
  ['وهناك رأى رجلًا يبيع الكتب القديمة.', 'And there he saw a man selling the old books.'],
  ['فاشترى كتابًا عن الحكمة وقرأه في ليلة واحدة.', 'He bought a book about wisdom and read it in one night.'],
  ['وفي الصباح عاد إلى أبيه وقال: لقد تعلمت أن الصبر مفتاح الفرج.', 'In the morning he returned to his father and said: I have learned that the patience key of the relief.'],
  ['فابتسم الأب وقال: هذا خير من كل الذهب.', 'The father smiled and said: This is good from all the gold.'],
]

const sermon: [string, string][] = [
  ['الكلمة الطيبة صدقة.', 'A good word is charity.'],
  ['ومن كان في حاجة أخيه كان الله في حاجته.', 'Whoever helps his brother in need, God helps him in his need.'],
  ['فلا تحقرن من المعروف شيئًا.', 'So do not belittle any act of kindness.'],
]

const poem: [string, string][] = [
  ['يا ليلُ طُلْ أو لا تطُلْ', 'O night, be long or do not be long'],
  ['لا بد لي أن أسهرَك', 'I must stay awake through you'],
  ['لو بات عندي قمري', 'If my moon spent the night with me'],
  ['ما بتُّ أرعى قمرَك', 'I would not spend it watching your moon'],
]

const letters: [string, string][] = [
  ['أكتب إليك من مدينة بعيدة.', 'I write to you from a far city.'],
  ['الطقس هنا بارد والناس طيبون.', 'The weather here is cold and the people kind.'],
  ['أرجو أن تكون بخير.', 'I hope you are good.'],
  ['سأعود قبل نهاية الشتاء.', 'I will return before end of the winter.'],
  ['مع خالص المحبة.', 'With sincere love.'],
]

function paras(prefix: string, rows: [string, string][]): Paragraph[] {
  return rows.map(([ar, en], i) => ({
    id: `${prefix}-${i + 1}`,
    ar,
    machine: en,
    current: en,
    done: false,
    tstatus: 'translated',
  }))
}

const merchantParas = paras('m', merchant)
// A few paragraphs already reviewed / edited so progress and diffs show up
merchantParas[0].current = 'Long ago, there was a merchant who traveled between cities.'
merchantParas[0].done = true
merchantParas[1].current = 'He had three sons who did not like to work.'
merchantParas[1].done = true
merchantParas[3].current = 'The eldest son heeded his father’s advice and went to the market.'
merchantParas[5].done = true

const poemParas = paras('p', poem).map((p, i) =>
  i % 2 === 1 ? { ...p, machine: null, current: '', tstatus: 'failed' as const } : p,
)

const letterParas = paras('l', letters).map((p, i) =>
  i >= 2 ? { ...p, machine: null, current: '', tstatus: 'pending' as const, willFail: i === 3 } : p,
)

export const initialDocs: Doc[] = [
  {
    id: 'merchant',
    title: 'The Merchant and His Sons',
    uploadedAt: '2026-10-09',
    status: 'in_review',
    paragraphs: merchantParas,
  },
  {
    id: 'sermon',
    title: 'Friday sermon notes',
    uploadedAt: '2026-10-02',
    status: 'done',
    paragraphs: paras('s', sermon).map((p) => ({ ...p, done: true })),
  },
  {
    id: 'letters',
    title: 'Letters from abroad',
    uploadedAt: '2026-10-13',
    status: 'translating',
    paragraphs: letterParas,
  },
  {
    id: 'poem',
    title: 'Night poem (draft)',
    uploadedAt: '2026-09-28',
    status: 'failed',
    paragraphs: poemParas,
  },
]

/** Paragraphs used for any newly "uploaded" file. */
export function samplePendingParagraphs(docId: string): Paragraph[] {
  return merchant.slice(0, 6).map(([ar], i) => ({
    id: `${docId}-${i + 1}`,
    ar,
    machine: null,
    current: '',
    done: false,
    tstatus: 'pending',
    willFail: i === 2 || i === 4,
  }))
}

export const machineFor = (ar: string): string => {
  const all = [...merchant, ...sermon, ...poem, ...letters]
  return all.find(([a]) => a === ar)?.[1] ?? '[machine translation]'
}
