// 貼文字解析：從露天、BOOTH、Animate（日本安利美特）的訂單文字拆出品項。
// 個資（姓名、地址、電話、email）完全不讀取。折扣、點數一律不計，只取折扣前的商品價。

import type { BookSource, Condition, Currency } from '../types'

export interface ParsedItem {
  kind: 'goods' | 'book'
  name: string
  category: string // 周邊的類別；書固定為 BL（分類預設）
  quantity: number
  unitPrice: number // 原幣單價（折扣前）
  preorder: boolean
  expectedMonth?: string // YYYY-MM
  note?: string
  tags: string[]
  deferred?: string // 暫時不能匯入的原因（例如同人誌要等同人分頁）
  condition?: Condition // 預設新品
  bookSource?: BookSource // 書的來源，預設網購
}

export interface ParsedOrder {
  source: '露天' | 'BOOTH' | 'Animate' | '讀冊' | 'コミコミ'
  orderNo?: string
  date: string // YYYY-MM-DD
  currency: Currency
  domesticShipping: number // 國內運費（有套用免運券 = 0）
  items: ParsedItem[]
}

const num = (s: string) => Number(s.replace(/[,，\s]/g, ''))
const isoDate = (s: string) => s.replace(/\//g, '-')
const ymd = (d: Date) => d.toLocaleDateString('sv-SE')

/** 依品名猜類別（順序有講究：先比對較具體的詞） */
export function guessCategory(name: string): string {
  const rules: [RegExp, string][] = [
    [/コースター|杯墊/, '壓克力杯墊'],
    [/チェキ|拍立得/, '拍立得'],
    [/クリアカード|透明卡|透卡/, '透卡'],
    [/ポストカード|明信片/, '明信片'],
    [/アクリルスタンド|アクスタ|スタンドポップ|立牌|壓克力牌|アクリルキーホルダー|壓克力/, '壓克力牌'],
    [/ブロマイド|トレカ|カード|小卡|寫真/, '小卡'],
    [/缶バッジ|缶バッチ|バッジ|徽章|吧唧|別針/, '徽章'],
    [/色紙/, '色紙'],
    [/ポスター|海報/, '海報'],
    [/ステッカー|シール|貼紙/, '貼紙'],
    [/しおり|ブックマーク|書籤/, '書籤'],
    [/ぬいぐるみ|娃娃|ぬい/, '娃娃'],
    [/サイン板|簽名板/, '簽名板'],
    [/複製畫|複製原画|アートボード/, '複製畫'],
    [/ふりかけ|飯友/, '飯友'],
    [/クロッタ|colotta|克羅塔/i, '克羅塔'],
  ]
  for (const [re, cat] of rules) if (re.test(name)) return cat
  return '其他'
}

const DOUJIN_WORDS = /本|同人誌|合同誌|アンソロジー|再録|新刊|既刊|漫画|小説/

// ── 露天 ──
function parseRuten(text: string, today: string): ParsedOrder | null {
  if (!/訂單編號/.test(text) || !/結帳時間|購買時間/.test(text)) return null
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''))
  const after = (label: string) => {
    const i = lines.findIndex((l) => l.trim() === label)
    return i >= 0 ? (lines[i + 1] ?? '').trim() : ''
  }
  const orderNo = after('訂單編號')
  const dateRaw = after('結帳時間')
  const date = /^\d{4}\/\d{2}\/\d{2}/.test(dateRaw) ? isoDate(dateRaw.slice(0, 10)) : today

  // 品項區塊：以「YYYY/MM/DD」單獨一行開頭，直到「共 N 個商品」
  const start = lines.findIndex((l) => /商品名稱/.test(l))
  const end = lines.findIndex((l, i) => i > start && /^共\s*\d+\s*個商品/.test(l.trim()))
  const body = lines.slice(start + 1, end > 0 ? end : lines.length)
  const blocks: string[][] = []
  for (const l of body) {
    if (/^\d{4}\/\d{2}\/\d{2}\s*$/.test(l.trim())) blocks.push([])
    else if (blocks.length) blocks[blocks.length - 1].push(l)
  }

  const items: ParsedItem[] = []
  for (const b of blocks) {
    const ls = b.map((x) => x.trim()).filter(Boolean)
    const rawName = ls.find((l) => !/^(規格|出貨年月|再次購買|取消交易|投訴|邀評|給評)/.test(l) && !/^\d+\s+\d+/.test(l))
    if (!rawName) continue
    const spec = ls.find((l) => l.startsWith('規格：'))?.replace('規格：', '').trim()
    const ship = ls.find((l) => l.startsWith('出貨年月'))
    const month = ship?.match(/(\d{4})\/(\d{2})/)
    const qp = ls.map((l) => l.match(/^(\d+)\s+(\d+)(?:\s|$)/)).find(Boolean)
    if (!qp) continue
    const quantity = Math.max(1, Number(qp[1]))
    const total = Number(qp[2])
    let name = rawName
      .replace(/^預購\s*/, '')
      .replace(/☆[^☆]+☆\S*\s*/, '') // 賣家前綴，例如「☆卡卡夫☆26年8月預購(取付免訂金)」
      .replace(/\s\d{10,}$/, '') // 結尾的商品編號
      .replace(/\d+種分售/g, '')
      .replace(/\s(0[1-9]|1[0-2])([0-2]\d|3[01])$/, '') // 賣家加的月日代碼，例如「0625」
      .replace(/\s+/g, ' ')
      .trim()
    if (spec) name += `（${spec}）`
    items.push({
      kind: 'goods', name, category: guessCategory(rawName), quantity, unitPrice: total / quantity,
      preorder: /預購/.test(rawName) || !!ship, expectedMonth: month ? `${month[1]}-${month[2]}` : undefined,
      tags: spec ? [spec] : [],
    })
  }

  // 運費：「運費」後面的兩個金額是（原價、使用運費券後）。折扣不計，但免運券讓運費歸零要算 0。
  let domesticShipping = 0
  const si = lines.findIndex((l) => l.trim() === '運費')
  if (si >= 0) {
    const amounts = lines.slice(si + 1, si + 5).map((l) => l.match(/^\$\s*([\d,]+)$/)).filter(Boolean).map((m) => num(m![1]))
    if (amounts.length) domesticShipping = amounts[amounts.length - 1]
  }
  return items.length ? { source: '露天', orderNo: orderNo || undefined, date, currency: 'TWD', domesticShipping, items } : null
}

// ── BOOTH ──
function parseBooth(text: string, today: string): ParsedOrder | null {
  if (!/\[Order summary\]/i.test(text)) return null
  const date = text.match(/\[Order Date\]\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? today
  const orderNo = text.match(/\[Order ID\]\s*(\d+)/)?.[1]
  const items: ParsedItem[] = []
  const section = text.slice(text.search(/\[Order summary\]/i))
  for (const l of section.split(/\r?\n/)) {
    const m = l.trim().match(/^(.*):\s*([\d,]+)\s*JPY\s*x\s*(\d+)\s*item\(s\)/)
    if (!m) continue
    const raw = m[1].trim()
    const name = raw.replace(/[（(]\s*全\s*\d+\s*種\s*[)）]/g, '').replace(/\s+/g, ' ').trim()
    items.push({
      kind: 'goods', name, category: guessCategory(raw), quantity: Number(m[3]), unitPrice: num(m[2]),
      preorder: false, tags: [],
      deferred: DOUJIN_WORDS.test(raw) ? '像是同人誌，請等「同人」分頁完成後再匯入' : undefined,
    })
  }
  return items.length ? { source: 'BOOTH', orderNo, date, currency: 'JPY', domesticShipping: 0, items } : null
}

// ── Animate（日本安利美特）──
function parseAnimate(text: string, today: string): ParsedOrder | null {
  if (!/商品名\s*[:：]/.test(text)) return null
  const orderNo = text.match(/ご注文番号\s*\n\s*(\d+)/)?.[1]
  const start = text.search(/●ご注文内容|商品名\s*[:：]/)
  const body = text.slice(start)
  const end = body.search(/支払方法|●合計/)
  const blocks = (end > 0 ? body.slice(0, end) : body).split(/^\s*=+\s*$/m)

  const items: ParsedItem[] = []
  let setMembers: string[] = []
  for (const blk of blocks) {
    const rawName = blk.match(/商品名\s*[:：]\s*(.+)/)?.[1]?.trim()
    if (!rawName) continue
    const quantity = Number(blk.match(/数量\s*[:：]\s*(\d+)/)?.[1] ?? 1)
    const unit = num(blk.match(/単価\s*[:：]\s*([\d,]+)/)?.[1] ?? '0')
    const rel = blk.match(/発売日\s*[:：]\s*(.+)/)?.[1] ?? ''
    const rm = rel.match(/(\d{4})\s*[年/]\s*(\d{1,2})/)
    const month = rm ? `${rm[1]}-${rm[2].padStart(2, '0')}` : undefined

    if (/^セット内\//.test(rawName) || /^【有償特典】/.test(rawName)) {
      if (unit === 0) { setMembers.push(rawName.replace(/^セット内\//, '')); continue }
    }
    const isBook = /^【コミック】/.test(rawName)
    const name = rawName.replace(/^(?:セット内\/)?【[^】]*】/, '').replace(/【[^】]*付き】/g, '').replace(/\s+/g, ' ').trim()
    const bundle = rawName.match(/【([^】]*付き)】/)?.[1]?.replace(/付き$/, '').replace(/\+/g, '＋')
    const note = bundle ? `內容物：${bundle}` : setMembers.length ? `內容物：${setMembers.length} 件特典` : undefined
    setMembers = []
    items.push({
      kind: isBook ? 'book' : 'goods', name, category: isBook ? 'BL' : guessCategory(rawName),
      quantity, unitPrice: unit,
      preorder: true, // 訂單確認信：整筆「入荷次第發送」，到貨前都算預購中
      expectedMonth: month, note, tags: [],
    })
  }
  return items.length ? { source: 'Animate', orderNo, date: today, currency: 'JPY', domesticShipping: 0, items } : null
}

// ── 讀冊（書；表格欄位：商品名稱／優惠價／數量／小計…）──
function parseDuku(text: string, today: string): ParsedOrder | null {
  if (!/商品名稱/.test(text) || !/優惠價/.test(text)) return null
  const lines = text.split(/\r?\n/)
  const hi = lines.findIndex((l) => /商品名稱/.test(l) && /優惠價/.test(l))
  const items: ParsedItem[] = []
  let title = ''
  for (const raw of lines.slice(hi + 1)) {
    const l = raw.trim()
    if (!l || l === '查看進度') continue
    const m = raw.match(/^\s*(\d+)\t(\d+)\t(\d+)\t/) // 優惠價、數量、小計
    if (m && title) {
      const used = /[（(]二手[)）]/.test(title)
      items.push({
        kind: 'book', name: title.replace(/[（(]二手[)）]/g, '').replace(/\s+/g, ' ').trim(), category: 'BL',
        quantity: Math.max(1, Number(m[2])), unitPrice: Number(m[1]), preorder: false, tags: [],
        condition: used ? 'used' : 'new', bookSource: 'duku',
      })
      title = ''
    } else title = l
  }
  return items.length ? { source: '讀冊', date: today, currency: 'TWD', domesticShipping: 0, items } : null
}

// ── 中央書店コミコミスタジオ（日本、日幣）──
// 貼上的文字可能是全形／半形混雜（Gmail、網頁複製常見），所以先整份轉成半形再比對。
const stripBalanced = (s: string, start: string) => {
  let i = s.indexOf(start)
  while (i >= 0) {
    let depth = 0
    let j = i
    for (; j < s.length; j++) {
      if (s[j] === '(') depth++
      else if (s[j] === ')' && --depth === 0) break
    }
    s = s.slice(0, i) + s.slice(j + 1)
    i = s.indexOf(start)
  }
  return s
}

// 品項行：「商品名 価格 785(円) x 1(個) = 785(円)」。括號、空白、x 的寫法都放寬。
const COMI_ITEM = /^\s*(.+?)\s*価格\s*([\d,]+)\s*\(?円\)?\s*[x×]\s*(\d+)\s*\(?個\)?/

function parseComicomi(raw: string, today: string): ParsedOrder | null {
  const text = raw.normalize('NFKC')
  const hasItems = text.split(/\r?\n/).some((l) => COMI_ITEM.test(l))
  if (!hasItems || !/(受注番号|コミコミ|発送予定日|\[商品\])/.test(text)) return null

  const orderNo = text.match(/受注番号\]?\s*(\d{6,})/)?.[1]
  const dm = text.match(/日時\]?\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  const date = dm ? `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}` : today
  const sm = text.match(/発送予定日[\s\S]{0,120}?(\d{4})\/(\d{1,2})\/\d{1,2}/)
  const shipMonth = sm ? `${sm[1]}-${sm[2].padStart(2, '0')}` : undefined
  // 送料與「送料割引」相抵：免運折扣有套用就是 0（其他折扣一律不計）
  const sou = num(text.match(/^\s*送料\s+(-?[\d,]+)\s*\(?円/m)?.[1] ?? '0')
  const sdisc = num(text.match(/^\s*送料割引\s+(-?[\d,]+)\s*\(?円/m)?.[1] ?? '0')
  const shipping = Math.max(0, sou + sdisc)

  const items: ParsedItem[] = []
  for (const l of text.split(/\r?\n/)) {
    const m = l.match(COMI_ITEM)
    if (!m) continue
    const notes: string[] = []
    let preorder = !!shipMonth
    let s = m[1].replace(/\s+/g, ' ').trim()
    // 開頭的【…】是特典或活動標籤（【受注予約】代表預購）
    s = s.replace(/^((?:【[^】]*】\s*)+)/, (g) => {
      for (const t of g.matchAll(/【([^】]*)】/g)) {
        if (/受注予約/.test(t[1])) preorder = true
        else if (!/締切|キャンペーン|特典付/.test(t[1])) notes.push(t[1])
      }
      return ''
    })
    // 結尾的活動標籤先去掉；類別用「還帶著括號裡有償特典說明」的名稱來猜（例如杯墊組），再把那段括號從名稱拿掉
    s = s.replace(/(?:\s*【[^】]*(?:締切|キャンペーン|有償特典|特典付|予約)[^】]*】)+\s*$/, '')
    const forGuess = s
    s = stripBalanced(s, '(有償特典').replace(/\s+/g, ' ').trim()
    const category = guessCategory(forGuess)
    items.push({
      kind: category === '其他' ? 'book' : 'goods', name: s, category: category === '其他' ? 'BL' : category,
      quantity: Number(m[3]), unitPrice: num(m[2]), preorder, expectedMonth: preorder ? shipMonth : undefined,
      note: notes.length ? notes.join('、') : undefined, tags: [],
    })
  }
  return items.length ? { source: 'コミコミ', orderNo, date, currency: 'JPY', domesticShipping: shipping, items } : null
}

/** 貼上的文字可能包含多筆訂單、來自不同店家；各自解析，依序回傳。 */
export function parseOrders(text: string, now = new Date()): ParsedOrder[] {
  const today = ymd(now)
  return [parseRuten(text, today), parseBooth(text, today), parseAnimate(text, today), parseDuku(text, today), parseComicomi(text, today)].filter((o): o is ParsedOrder => !!o)
}
