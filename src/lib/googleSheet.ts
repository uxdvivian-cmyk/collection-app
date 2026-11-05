// 讀取「知道連結的人可檢視」的 Google 試算表。用免費的 Google Sheets API 金鑰，唯讀。

const API = 'https://sheets.googleapis.com/v4/spreadsheets'

export function parseSheetId(urlOrId: string): string | null {
  const m = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  return /^[a-zA-Z0-9_-]{20,}$/.test(urlOrId.trim()) ? urlOrId.trim() : null
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json())?.error?.message ?? '' } catch { /* ignore */ }
    if (res.status === 403) throw new Error(`沒有權限讀取（${detail || '403'}）。請確認試算表是「知道連結的人可檢視」，且 API 金鑰已啟用 Google Sheets API。`)
    if (res.status === 404) throw new Error('找不到這份試算表，請確認網址。')
    if (res.status === 400) throw new Error(`API 金鑰或網址有誤（${detail || '400'}）。`)
    throw new Error(`讀取失敗（${res.status} ${detail}）`)
  }
  return res.json()
}

/** 讀出所有分頁，格式與 read-excel-file 相同：[{ sheet, data }] */
export async function fetchSheets(urlOrId: string, apiKey: string): Promise<{ sheet: string; data: unknown[][] }[]> {
  const id = parseSheetId(urlOrId)
  if (!id) throw new Error('無法辨識試算表網址。')
  if (!apiKey.trim()) throw new Error('尚未設定 API 金鑰。')
  const key = encodeURIComponent(apiKey.trim())

  const meta = await getJson(`${API}/${id}?fields=sheets.properties.title&key=${key}`)
  const titles: string[] = (meta.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title)

  // 只讀 A:D 四欄（書名、價格、附註、本數）
  const ranges = titles.map((t) => `ranges=${encodeURIComponent(`'${t.replace(/'/g, "''")}'!A:D`)}`).join('&')
  const vals = await getJson(`${API}/${id}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE&key=${key}`)
  const out: { sheet: string; data: unknown[][] }[] = (vals.valueRanges ?? []).map((v: { values?: unknown[][] }, i: number) => ({
    sheet: titles[i],
    data: (v.values ?? []).map((row) => row.map((c) => (c === '' ? undefined : c))),
  }))
  return out
}
