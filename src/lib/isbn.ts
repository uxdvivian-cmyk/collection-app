// ISBN 處理與書籍資料查詢（openBD、Google Books、Open Library，都是免費、免金鑰、允許瀏覽器直接呼叫）。

export interface BookInfo {
  isbn: string
  title: string
  author?: string
  publisher?: string
  coverUrl?: string
  series?: string
  volume?: number
  language?: 'zh' | 'ja' | 'en'
  source: 'openBD' | 'Google Books' | 'Open Library'
}

const isbn13Check = (d: string) => {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10
}

/** 接受 ISBN-10 或 ISBN-13（可含連字號），回傳合法的 ISBN-13；不合法回傳 null。 */
export function normalizeIsbn(input: string): string | null {
  const s = input.replace(/[\s-]/g, '').toUpperCase()
  if (/^\d{13}$/.test(s)) {
    return (s.startsWith('978') || s.startsWith('979')) && Number(s[12]) === isbn13Check(s) ? s : null
  }
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0
    for (let i = 0; i < 9; i++) sum += Number(s[i]) * (10 - i)
    sum += s[9] === 'X' ? 10 : Number(s[9])
    if (sum % 11 !== 0) return null
    const base = '978' + s.slice(0, 9)
    return base + isbn13Check(base)
  }
  return null
}

async function getJson(url: string): Promise<any> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 8000)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fromOpenBD(isbn: string): Promise<BookInfo | null> {
  const j = await getJson(`https://api.openbd.jp/v1/get?isbn=${isbn}`)
  const s = j?.[0]?.summary
  if (!s?.title) return null
  const vol = typeof s.volume === 'string' ? s.volume.trim() : ''
  const title = vol && !s.title.includes(vol) ? `${s.title} ${vol}` : s.title
  const n = Number(vol)
  return {
    isbn, title, author: s.author || undefined, publisher: s.publisher || undefined,
    coverUrl: s.cover || undefined, series: s.series || undefined,
    volume: vol && Number.isInteger(n) ? n : undefined, language: 'ja', source: 'openBD',
  }
}

async function fromGoogleBooks(isbn: string): Promise<BookInfo | null> {
  const j = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`)
  const v = j?.items?.[0]?.volumeInfo
  if (!v?.title) return null
  const lang = v.language === 'ja' ? 'ja' : v.language === 'en' ? 'en' : 'zh'
  return {
    isbn, title: v.subtitle ? `${v.title} ${v.subtitle}` : v.title,
    author: v.authors?.join('、'), publisher: v.publisher,
    coverUrl: v.imageLinks?.thumbnail?.replace(/^http:/, 'https:'), language: lang, source: 'Google Books',
  }
}

async function fromOpenLibrary(isbn: string): Promise<BookInfo | null> {
  const j = await getJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`)
  const v = j?.[`ISBN:${isbn}`]
  if (!v?.title) return null
  return {
    isbn, title: v.title, author: v.authors?.map((a: { name: string }) => a.name).join('、'),
    publisher: v.publishers?.[0]?.name, coverUrl: v.cover?.medium, language: 'en', source: 'Open Library',
  }
}

/** 依 ISBN 查書籍資料。日本書（978-4）先查 openBD，其餘先查 Google Books。查不到回傳 null。 */
export async function lookupIsbn(isbn: string): Promise<BookInfo | null> {
  const order = isbn.startsWith('9784')
    ? [fromOpenBD, fromGoogleBooks, fromOpenLibrary]
    : [fromGoogleBooks, fromOpenLibrary, fromOpenBD]
  for (const f of order) {
    const info = await f(isbn)
    if (info) return info
  }
  return null
}
