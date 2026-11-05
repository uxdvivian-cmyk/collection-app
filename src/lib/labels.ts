import type { BookGenre, BookSource, Condition } from '../types'

export const GENRE_LABEL: Record<BookGenre, string> = { BL: 'BL', nonBL: '非BL', novel: '小說' }
export const GENRES: BookGenre[] = ['BL', 'nonBL', 'novel']

export const SOURCE_LABEL: Record<BookSource, string> = { friend: '朋友', duku: '讀冊', online: '網購', store: '實體' }
export const SOURCES: BookSource[] = ['friend', 'duku', 'online', 'store']

export const CONDITION_LABEL: Record<Condition, string> = { new: '新品', used: '二手' }

/** 朋友二手書：原價 = 實付 ÷ 0.7（推算值，使用者可手動修正） */
export const FRIEND_DISCOUNT = 0.7
