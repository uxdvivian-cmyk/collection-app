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
  doujin?: boolean // 同人（同人誌或同人周邊）
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
    [/アクリルスタンド|アクスタ|スタンドポップ|立牌|壓克力牌|アクリルキーホルダー|アクリルキーリング|キーリング|アクリルプレート|アクリルパネル|アクキー|壓克力/, '壓克力牌'],
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
    // 品名像同人誌（本、新刊、アンソロジー…）就預設為同人誌，其他維持周邊；畫面上都能改
    const isBook = DOUJIN_WORDS.test(raw)
    items.push({
      kind: isBook ? 'book' : 'goods', name, category: isBook ? 'BL' : guessCategory(raw), quantity: Number(m[3]), unitPrice: num(m[2]),
      preorder: false, tags: [], doujin: isBook || undefined,
    })
  }
  return items.length ? { source: 'BOOTH', orderNo, date, currency: 'JPY', domesticShipping: 0, items } : null
}

// ── Animate（日本安利美特）──
function parseAnimate(text: string, today: string): ParsedOrder | null {
  if (!/商品名\s*[:：]/.test(text) || !/アニメイト|animate|●ご注文内容|●合計/i.test(text)) return null
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
// 不認店家，認「結構」，三種寫法都吃：
//   ① 同一行：品名 ＋ 價格 ＋ 數量（¥1,200 x 2、2,500円 × 1）
//   ② 品名一行、價格（與數量）在後面 1～3 行：
//        「1.品名」「商品名：品名」「【商品名】品名」 → 「価格：440円 x 数量：5」「販売価格：787円 5個」「【単価】440円」「【数量】2個」
//   ③ 價格與數量分在兩行
// 運費（送料／運費）取最大值；合計、稅、手續費、點數、折扣、個資行一律略過。
// 解析結果都會讓你在畫面上確認、改名、改數量、改幣別，所以寧可多抓，不要漏。
const SKIP_LINE = /送料|運費|运费|郵資|配送|手数料|手續費|消費税|税|合計|合计|小計|小计|総額|總計|總額|total|subtotal|shipping|ポイント|點數|折扣|割引|値引|クーポン|coupon|お支払|付款|代金|電話|住所|〒|@|決済|番号|URL|http/i
const G_PRICE = /(?:¥|NT\$|\$|TWD|JPY)\s*([\d,]+)|([\d,]+)\s*(?:\(?円\)?|元|JPY|TWD|yen)/i
const G_QTY = /(?:[x×*]\s*(\d{1,3})(?![\d]))|(?:(\d{1,3})\s*(?:個|点|點|pcs|件|入|冊|本|セット)(?![A-Za-z]))|(?:[數数]\s*量\s*[:：]?\s*(\d{1,3}))/i
const G_LABEL = /(?:商品名稱|商品名|品名|販売価格|単\s*価|單價|価格|價格|金額|[數数]\s*量|アイテムコード)\s*[:：】\]]?/g

const STORES: [RegExp, string][] = [
  [/ムービック|movic/i, 'Movic'], [/カドスト|KADOKAWA|角川/i, '角川カドスト'], [/とらのあな|toranoana/i, '虎之穴'], [/メロンブックス|melonbooks/i, 'メロンブックス'],
  [/駿河屋/, '駿河屋'], [/ゲーマーズ|gamers/i, 'ゲーマーズ'], [/ステラワース|stellaworth/i, 'ステラワース'],
  [/Amazon|アマゾン/i, 'Amazon'], [/楽天|rakuten/i, '樂天'], [/メルカリ|mercari/i, 'メルカリ'], [/ヨドバシ/, 'ヨドバシ'],
  [/ホビーサーチ/, 'ホビーサーチ'], [/アニプレックス|aniplex/i, 'Aniplex'],
]
function detectStore(text: string): string {
  for (const [re, name] of STORES) if (re.test(text)) return name
  const m = text.match(/([^\s、。,，「」【】]{2,12}?)(?:ストア|STORE|Store)に(?:ご)?注文/)
  return m ? m[1] + 'ストア' : '其他'
}
function detectOrderNo(text: string): string | undefined {
  return text.match(/(?:オーダーID|注文コード|注文番号|受注番号|出荷番号|訂單編號|订单编号|order\s*(?:no|number|id|#)?)\s*[】\]:：#]*\s*([A-Za-z0-9][A-Za-z0-9-]{5,})/i)?.[1]
}
function detectDate(text: string, today: string): string {
  const m = text.match(/(?:ご?注文日|注文日時|訂單日期|order\s*date|日時)[^\d]{0,6}(\d{4})[年/.\-](\d{1,2})[月/.\-](\d{1,2})/i)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : today
}

function parseGeneric(raw: string, today: string): ParsedOrder | null {
  // 全形轉半形方便比對，但品名裡常見的 ①②、＜＞、／、！、～ 保留原樣
  const text = Array.from(raw).map((c) => (/[①-⑳＜＞／！？～〜]/.test(c) ? c : c.normalize('NFKC'))).join('')
  const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^[・●■□•]\s*/, ''))
  const jpy = /円|¥|JPY|yen/i.test(text) && !/NT\$|NTD|TWD|新台幣/i.test(text)
  let shipping = 0
  const items: ParsedItem[] = []
  let pending: { name: string; at: number } | null = null

  const cleanName = (n: string) =>
    n.replace(G_LABEL, ' ').replace(/[=＝].*$/, '').replace(/^\s*\d{1,2}\s*[.)．、]\s*/, '').replace(/[()（）\s:：|｜,，]+$/g, '').replace(/\s+/g, ' ').trim()
  const push = (name0: string, price: number, qty: number, ctx: string) => {
    let name = name0
    if (name.length < 2 || !/[\p{L}]/u.test(name) || !price) return
    const pre = /[＜<【\[(（]\s*(?:予約|予约|預購|預售|預訂)\s*[＞>】\])）]/
    const isPre = pre.test(name) || /予約|予约|預購|預售|預訂/.test(ctx)
    name = name.replace(new RegExp(pre.source, 'g'), '').replace(/\s+/g, ' ').trim()
    const category = guessCategory(name)
    items.push({ kind: 'goods', name, category, quantity: qty, unitPrice: price, preorder: isPre, tags: [] })
  }
  const qtyOf = (l: string) => {
    const q = l.match(G_QTY)
    return Number(q?.[1] ?? q?.[2] ?? q?.[3] ?? 0) || 0
  }
  const nameOnly = (l: string): string | null => {
    // 「商品名：X」「N.X」這類只有品名的行
    const lab = l.match(/^(?:【\s*)?(?:商品名稱|商品名|品名)\s*[】:：]?\s*(.+)$/)
    if (lab) return lab[1].trim()
    const num = l.match(/^\d{1,2}\s*[.)．]\s*(.{2,})$/)
    return num ? num[1].trim() : null
  }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l) continue
    if (/送料|運費|运费|郵資|shipping/i.test(l.replace(/[=＝].*$/, '')) && !/割引|免運|無料|free/i.test(l)) {
      const m = l.match(G_PRICE) ?? l.match(/[:：]\s*([\d,]+)/)
      if (m) shipping = Math.max(shipping, num(m[1] ?? m[2] ?? '0'))
      continue
    }
    if (SKIP_LINE.test(l.replace(/[=＝].*$/, '')) && !nameOnly(l)) continue
    const pm = l.match(G_PRICE)
    const nm = nameOnly(l)
    if (nm && !pm) { pending = { name: cleanName(nm), at: i }; continue }
    if (!pm) continue
    const price = num(pm[1] ?? pm[2])
    let qty = qtyOf(l)
    const inline = cleanName(nm ?? l.replace(new RegExp(G_PRICE.source, 'ig'), ' ').replace(new RegExp(G_QTY.source, 'ig'), ' '))
    if (inline.length >= 2 && /[\p{L}]/u.test(inline) && !/^(?:価格|金額)$/.test(inline)) {
      push(inline, price, qty || 1, l); pending = null; continue
    }
    // 價格行：品名在前面
    if (pending && i - pending.at <= 4) {
      if (!qty) for (let k = i + 1; k <= i + 2 && k < lines.length; k++) { if (nameOnly(lines[k])) break; if (G_PRICE.test(lines[k])) break; qty = qtyOf(lines[k]); if (qty) break }
      push(pending.name, price, qty || 1, pending.name + l); pending = null
    }
  }
  if (!items.length) return null
  const source = detectStore(text)
  // 虎之穴、Melonbooks 這類書店：認不出類別的品項預設當書（畫面上可切換成周邊）
  if (/虎之穴|メロンブックス/.test(source)) for (const it of items) if (it.category === '其他') { it.kind = 'book'; it.category = 'BL' }
  return { source, orderNo: detectOrderNo(text), date: detectDate(text, today), currency: jpy ? 'JPY' : 'TWD', domesticShipping: shipping, items }
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
  const orderNo = detectOrderNo(text)
  const ship = num(text.match(/【\s*送料\s*】\s*([\d,]+)/)?.[1] ?? '0')
  const store = text.match(/([^\s、。,，]{2,12}?)(?:ストア|STORE|Store)に(?:ご)?注文/)
  return { source: store ? store[1] + 'ストア' : '其他', orderNo, date: today, currency: 'JPY', domesticShipping: ship, items }
}

// ── 博客來（台灣、台幣）──
// 訂單頁複製下來只有「訂單總額」，沒有每個品項的單價，所以把總額依數量平均分攤（畫面上可逐筆修正）。
function parseBooks(raw: string, today: string): ParsedOrder | null {
  // 訂單詳細頁：「序號<tab>品名<tab>單價<tab>數量」，折扣一律不計
  if (/商品名稱\s+單價/.test(raw)) {
    const items: ParsedItem[] = []
    for (const l of raw.split(/\r?\n/)) {
      const m = l.match(/^\s*(\d{1,3})\t(.+?)\t([\d,]+)\t(\d{1,3})\s*$/)
      if (m) items.push({ kind: 'book', name: m[2].trim(), category: 'BL', quantity: Number(m[4]), unitPrice: num(m[3]), preorder: false, tags: [] })
    }
    if (items.length) {
      const dm = raw.match(/訂購時間[:：]\s*(\d{4})\/(\d{2})\/(\d{2})/)
      return { source: '博客來', orderNo: raw.match(/訂單編號[:：]\s*(\d+)/)?.[1], date: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : today, currency: 'TWD', domesticShipping: 0, items }
    }
  }
  if (!/詳細進度查詢/.test(raw) || !/\d{4}\/\d{2}\/\d{2}/.test(raw)) return null
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''))
  const QTY = /^\s*(\d{1,3})\t\s*\d{2}\/\d{2}/
  const rows: { name: string; qty: number }[] = []
  let total = 0
  for (let i = 0; i < lines.length; i++) {
    if (!QTY.test(lines[i])) continue
    let j = i - 1
    while (j >= 0 && !lines[j].trim()) j--
    if (j < 0) continue
    let name = lines[j].trim()
    // 第一個品項跟訂單資訊同一行：「23:56:11<tab>信用卡線上刷卡<tab>905<tab>品名」
    if (/^\d{2}:\d{2}:\d{2}\t/.test(name)) {
      const f = name.split('\t').map((x) => x.trim()).filter(Boolean)
      name = f[f.length - 1]
      const t = f.slice(1, -1).reverse().find((x) => /^[\d,]+$/.test(x))
      if (t) total = num(t)
    }
    if (name && name !== '詳細進度查詢') rows.push({ name, qty: Number(lines[i].match(QTY)![1]) })
  }
  if (!rows.length) return null
  const totalQty = rows.reduce((a, r) => a + r.qty, 0)
  const each = total ? Math.floor(total / totalQty) : 0
  const items: ParsedItem[] = rows.map((r) => ({
    kind: 'book', name: r.name, category: 'BL', quantity: r.qty, unitPrice: each, preorder: false, tags: [],
    note: total ? '博客來未列單價，已把訂單總額平均分攤，請核對' : '博客來未列單價，請手動填',
  }))
  if (total && items.length) items[0].unitPrice += total - each * totalQty   // 除不盡的零頭算在第一筆
  const dm = raw.match(/(\d{4})\/(\d{2})\/(\d{2})\s*\n\s*\d{2}:\d{2}:\d{2}/) ?? raw.match(/(\d{4})\/(\d{2})\/(\d{2})/)
  return {
    source: '博客來', orderNo: raw.match(/^\s*(\d{12,16})\s*$/m)?.[1],
    date: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : today, currency: 'TWD', domesticShipping: 0, items,
  }
}

// ── 金石堂（台灣、台幣）：品名連結後面依序是 訂購量／實出量／售價／優惠折抵／明細小計 ──
function parseKingstone(raw: string, today: string): ParsedOrder | null {
  if (!/kingstone\.com\.tw|金石堂/.test(raw) || !/商品名稱/.test(raw)) return null
  const lines = raw.split(/\r?\n/).map((l) => l.trim())
  const bullet = (l: string) => l.replace(/^\*\s*/, '').trim()
  const items: ParsedItem[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\*\s*\[(.+?)\]\(https?:\/\/[^)]*\)\s*$/)
    if (!m || /聯絡客服|查看發票|購買證明|全家|7-?11|萊爾富|OK/.test(m[1])) continue
    const vals: string[] = []
    for (let k = i + 1; k < lines.length && vals.length < 5; k++) {
      if (!lines[k] || lines[k] === '*') continue
      if (/^\*\s*\[/.test(lines[k])) break
      vals.push(bullet(lines[k]))
    }
    const qty = Number(vals[0]), price = num(vals[2] ?? '')
    if (!qty || !price) continue
    items.push({ kind: 'book', name: m[1].trim(), category: 'BL', quantity: qty, unitPrice: price, preorder: false, tags: [] })
  }
  if (!items.length) return null
  const dm = raw.match(/\*\s*(\d{4})\/(\d{2})\/(\d{2})\s+\d{2}:\d{2}/)
  return {
    source: '金石堂', orderNo: raw.match(/\*\s*(\d{12,})\s*$/m)?.[1],
    date: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : today, currency: 'TWD', domesticShipping: 0, items,
  }
}

/** 先試各店家的專屬格式；全部都認不出來才用通用解析 */
export function parseOrders(text: string, now = new Date()): ParsedOrder[] {
  const today = ymd(now)
  const known = [parseRuten(text, today), parseBooth(text, today), parseAnimate(text, today), parseDuku(text, today), parseComicomi(text, today), parseLabeled(text, today), parseBooks(text, today), parseKingstone(text, today)].filter((o): o is ParsedOrder => !!o)
  if (known.length) return known
  const g = parseGeneric(text, today)
  return g ? [g] : []
}
