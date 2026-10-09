import crypto from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import { parseCookies, getValidSession, isSessionValid } from './auth.js'

// Second password layer for the Billing module (BILLING_PASSWORD).
// Separate cookie + token set; a billing token is bound to the main session
// it was issued under, so it dies together with that session.

const COOKIE_NAME = 'sm_billing'
const COOKIE_MAX_AGE = 12 * 60 * 60 * 1000 // 12 hours

const MAX_FAILS = 5
const BLOCK_MS = 10 * 60 * 1000 // 10 minutes
const WRONG_DELAY_MS = 500

interface BillingSession { mainToken: string; expiresAt: number }
const billingSessions = new Map<string, BillingSession>()

interface FailState { count: number; lastAt: number; blockedUntil: number }
const failures = new Map<string, FailState>()

function clientIp(req: Request): string {
  // `trust proxy` is set to loopback in index.ts, so req.ip is the real client behind nginx
  return req.ip || req.socket.remoteAddress || 'unknown'
}

function passwordMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false
  const a = crypto.createHash('sha256').update(given).digest()
  const b = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

function isUnlocked(req: Request): boolean {
  const mainToken = getValidSession(req)
  if (!mainToken) return false
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token) return false
  const s = billingSessions.get(token)
  if (!s) return false
  if (s.expiresAt < Date.now() || !isSessionValid(s.mainToken)) {
    billingSessions.delete(token)
    return false
  }
  return s.mainToken === mainToken
}

function pruneExpired() {
  const now = Date.now()
  for (const [token, s] of billingSessions) {
    if (s.expiresAt < now || !isSessionValid(s.mainToken)) billingSessions.delete(token)
  }
  for (const [ip, f] of failures) {
    if (f.blockedUntil < now && now - f.lastAt > BLOCK_MS) failures.delete(ip)
  }
}
setInterval(pruneExpired, 15 * 60 * 1000).unref()

const OPEN_PATHS = new Set(['/unlock', '/lock', '/check'])

// Mounted on /api/billing (after the global authMiddleware)
export function billingAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!process.env.BILLING_PASSWORD) {
    res.status(500).json({ error: 'BILLING_PASSWORD not configured' })
    return
  }
  if (OPEN_PATHS.has(req.path)) return next()
  if (isUnlocked(req)) return next()
  res.status(401).json({ error: 'locked' })
}

export async function billingUnlock(req: Request, res: Response) {
  const expected = process.env.BILLING_PASSWORD!
  const mainToken = getValidSession(req)
  if (!mainToken) { res.status(401).json({ error: 'Unauthorized' }); return }

  const ip = clientIp(req)
  const now = Date.now()
  let f = failures.get(ip)
  if (f && f.blockedUntil > now) {
    const mins = Math.ceil((f.blockedUntil - now) / 60000)
    res.status(429).json({ error: `Too many attempts. Try again in ${mins} min.` })
    return
  }

  if (!passwordMatches(req.body?.password, expected)) {
    if (!f || now - f.lastAt > BLOCK_MS) f = { count: 0, lastAt: now, blockedUntil: 0 }
    f.count++
    f.lastAt = now
    if (f.count >= MAX_FAILS) {
      f.blockedUntil = now + BLOCK_MS
      f.count = 0
      console.warn(`[billing] ${MAX_FAILS} wrong passwords from ${ip} — blocked for 10 min`)
    }
    failures.set(ip, f)
    await new Promise(r => setTimeout(r, WRONG_DELAY_MS))
    if (f.blockedUntil > now) {
      res.status(429).json({ error: 'Too many attempts. Try again in 10 min.' })
    } else {
      res.status(401).json({ error: 'Wrong password' })
    }
    return
  }

  failures.delete(ip)
  const token = crypto.randomUUID()
  billingSessions.set(token, { mainToken, expiresAt: now + COOKIE_MAX_AGE })
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
  })
  res.json({ ok: true })
}

export function billingLock(req: Request, res: Response) {
  const token = parseCookies(req)[COOKIE_NAME]
  if (token) billingSessions.delete(token)
  res.clearCookie(COOKIE_NAME)
  res.json({ ok: true })
}

export function billingCheck(req: Request, res: Response) {
  res.json({ unlocked: isUnlocked(req) })
}
