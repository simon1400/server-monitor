import { format, parseISO, differenceInCalendarDays } from 'date-fns'

export const CURRENCIES = ['CZK', 'EUR', 'USD']

// 1500 → "1 500 CZK", 3000.5 → "3 000,50 CZK"
export function formatAmount(n: number, currency: string): string {
  const isInt = Number.isInteger(n)
  const [int, dec] = (isInt ? String(Math.trunc(n)) : n.toFixed(2)).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${grouped}${dec ? ',' + dec : ''} ${currency}`
}

// 'YYYY-MM-DD' → 'DD.MM.YYYY'
export function formatDate(ymd: string): string {
  return format(parseISO(ymd), 'dd.MM.yyyy')
}

export function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function daysSince(ymd: string): number {
  return differenceInCalendarDays(new Date(), parseISO(ymd))
}

// Accepts "1500", "1 500", "1500,50", "1500.5" → number, '' → null, garbage → NaN
export function parseAmountInput(s: string): number | null {
  const t = s.replace(/[\s ]/g, '').replace(',', '.')
  if (t === '') return null
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return NaN
  return Math.round(Number(t) * 100) / 100
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
