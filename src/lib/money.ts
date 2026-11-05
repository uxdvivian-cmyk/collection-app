import type { Currency } from '../types'

const RATE_KEY = 'jpyRate'
const DEFAULT_RATE = 0.21 // 1 JPY ≈ 0.21 TWD，可在設定頁修改

export function getRate(): number {
  try {
    const v = parseFloat(localStorage.getItem(RATE_KEY) || '')
    if (v > 0) return v
  } catch { /* 無痕模式等情況 */ }
  return DEFAULT_RATE
}

export function setRate(v: number) {
  try { localStorage.setItem(RATE_KEY, String(v)) } catch { /* ignore */ }
}

export function toTWD(amount: number, cur: Currency, fx?: number): number {
  return cur === 'JPY' ? Math.round(amount * (fx ?? getRate())) : Math.round(amount)
}

export const twd = (n: number) => 'NT$ ' + n.toLocaleString()

interface Priced {
  unitPrice: number
  quantity: number
  currency: Currency
  fxRate?: number
  shippingShare?: number
  intlShippingShare?: number
}

/** 單筆總成本（台幣）：商品價 × 數量 + 分攤運費。折扣一律不計。 */
export function totalCost(i: Priced): number {
  return toTWD(i.unitPrice * i.quantity, i.currency, i.fxRate) + Math.round((i.shippingShare ?? 0) + (i.intlShippingShare ?? 0))
}
