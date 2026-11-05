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
  source: string // 露天 / BOOTH / Animate / 讀冊 / コミコミ，或通用解析的「其他」
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
    [/アクリルスタンド|アクスタ|スタンドポップ|立牌|壓克力牌|アクリルキーホルダー|アクリルプレート|アクリルパネル|アクキー|壓克力/, '壓克力牌'],
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
// ── 通用解析（沒有專屬格式的新平台、代購都走這裡）──
// 不認店家，只看每一行：有價格（¥／円／NT$／元）的就當成一個品項，數量認 x2／×2／2個／2點。
// 解析結果一律讓你在畫面上確認、改名、改數量、改幣別，所以寧可多抓，不要漏。
const SKIP_LINE = /送料|運費|运费|郵資|配送|手数料|手續費|消費税|税|合計|合计|小計|小计|総額|總計|總額|total|subtotal|shipping|ポイント|點數|折扣|割引|クーポン|coupon|お支払|付款|代金|電話|住所|〒|@/i

function parseGeneric(raw: string, today: string): ParsedOrder | null {
  const text = raw.normalize('NFKC')
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const jpy = /円|¥|JPY|yen/i.test(text) && !/NT\$|NTD|TWD|新台幣/i.test(text)
  const PRICE = /(?:¥|NT\$|\$|TWD|JPY)\s*([\d,]+)|([\d,]+)\s*(?:\(?円\)?|元|JPY|TWD|yen)/i
  const QTY = /(?:[x×*]\s*(\d{1,3})\b)|(?:(\d{1,3})\s*(?:個|点|點|pcs|件|入|冊|本|セット)\b)|(?:數量[:：\s]*(\d{1,3}))|(?:数量[:：\s]*(\d{1,3}))/i
  let shipping = 0
  const items: ParsedItem[] = []
  for (const l of lines) {
    if (/送料|運費|运费|郵資|shipping/i.test(l) && !/割引|免運|無料|free/i.test(l)) {
      const m = l.match(PRICE) ?? l.match(/([\d,]{2,})/)
      if (m) shipping = Math.max(shipping, num((m[1] ?? m[2] ?? '0')))
      continue
    }
    if (SKIP_LINE.test(l)) continue
    const pm = l.match(PRICE)
    if (!pm) continue
    const price = num(pm[1] ?? pm[2])
    if (!price) continue
    const qm = l.match(QTY)
    const qty = Number(qm?.[1] ?? qm?.[2] ?? qm?.[3] ?? qm?.[4] ?? 1) || 1
    // 行內有「單價 x 數量 = 小計」時，PRICE 抓到的是第一個（單價）
    let name = l.replace(/[=＝].*$/, '').replace(new RegExp(PRICE.source, 'ig'), ' ').replace(new RegExp(QTY.source, 'ig'), ' ')
    name = name.replace(/[()（）\s:：|｜,，]+$/g, '').replace(/^[\s・\-*•●■□\d]+[.)、]?\s+(?=\S)/, '').replace(/\s+/g, ' ').trim()
    if (name.length < 2 || !/[\p{L}]/u.test(name)) continue
    const category = guessCategory(name)
    items.push({
      kind: category === '其他' ? 'goods' : 'goods', name, category, quantity: qty, unitPrice: price,
      preorder: /予約|予约|預購|預售|預訂/.test(l), tags: [],
    })
  }
  if (!items.length) return null
  const orderNo = text.match(/(?:注文番号|訂單編號|订单编号|order\s*(?:no|number|#)?)[\s:：#]*([A-Za-z0-9-]{6,})/i)?.[1]
  return { source: '其他', orderNo, date: today, currency: jpy ? 'JPY' : 'TWD', domesticShipping: shipping, items }
}

// ── 「【商品名】／【単価】／【数量】」分行標籤格式（マンガ展ストア等日本店家）──
// 品名、單價、數量各佔一行，所以通用解析（要求同一行有價格）抓不到。標籤名稱放寬，其他用這種格式的店家也能用。
function parseLabeled(raw: string, today: string): ParsedOrder | null {
  const text = raw.normalize('NFKC')
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const lab = (l: string, re: RegExp) => l.match(new RegExp(`^【\\s*(?:${re.source})\\s*】\\s*(.*)$`))
  const NAME = /商品名|品名|商品名稱/, PRICE = /単価|単\s*価|單價|価格|價格/, QTY = /数量|數量/
  const items: ParsedItem[] = []
  for (let i = 0; i < lines.length; i++) {
    const nm = lab(lines[i], NAME)
    if (!nm) continue
    let price: number | undefined, qty = 1
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
      if (lab(lines[j], NAME)) break
      const pm = lab(lines[j], PRICE)
      if (pm) price = num(pm[1].replace(/[^\d,]/g, '') || '0')
      const qm = lab(lines[j], QTY)
      if (qm) qty = Number(qm[1].match(/\d+/)?.[0] ?? 1) || 1
    }
    if (price === undefined) continue
    let name = nm[1].trim()
    const notes: string[] = []
    // 開頭的 [申込期間：…] 之類方括號是活動說明，放備註
    name = name.replace(/^((?:\[[^\]]*\]\s*)+)/, (g) => { for (const t of g.matchAll(/\[([^\]]*)\]/g)) notes.push(t[1]); return '' }).trim()
    const category = guessCategory(name)
    items.push({
      kind: category === '其他' ? 'book' : 'goods', name, category: category === '其他' ? 'BL' : category,
      quantity: qty, unitPrice: price, preorder: false, note: notes.length ? notes.join('、') : undefined, tags: [],
    })
  }
  if (!items.length) return null
  const orderNo = text.match(/【\s*(?:注文番号|受注番号|訂單編號)\s*】\s*([A-Za-z0-9-]+)/)?.[1]
  const ship = num(text.match(/【\s*送料\s*】\s*([\d,]+)/)?.[1] ?? '0')
  const store = text.match(/([^\s、。,，]{2,12}?)(?:ストア|STORE|Store)に(?:ご)?注文/)
  return { source: store ? store[1] + 'ストア' : '其他', orderNo, date: today, currency: 'JPY', domesticShipping: ship, items }
}

/** 先試各店家的專屬格式；全部都認不出來才用通用解析 */
export function parseOrders(text: string, now = new Date()): ParsedOrder[] {
  const today = ymd(now)
  const known = [parseRuten(text, today), parseBooth(text, today), parseAnimate(text, today), parseDuku(text, today), parseComicomi(text, today), parseLabeled(text, today)].filter((o): o is ParsedOrder => !!o)
  if (known.length) return known
  const g = parseGeneric(text, today)
  return g ? [g] : []
}
