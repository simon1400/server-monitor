import crypto from 'crypto'
import type { Request, Response, NextFunction } from 'express'

const sessions = new Set<string>()

const COOKIE_NAME = 'sm_session'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie || ''
  return Object.fromEntries(
    header.split(';').map(c => {
      const [key, ...rest] = c.trim().split('=')
      return [key, rest.join('=')]
    })
  )
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Allow login endpoint
  if (req.path === '/api/login' || req.path === '/api/auth/check') {
    return next()
  }

  const cookies = parseCookies(req)
  const token = cookies[COOKIE_NAME]

  if (token && sessions.has(token)) {
    return next()
  }

  // For API routes, return 401
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  // For non-API routes, let them through (SPA handles auth in frontend)
  next()
}

export function login(req: Request, res: Response) {
  const { password } = req.body
  const expected = process.env.AUTH_PASSWORD

  if (!expected) {
    res.status(500).json({ error: 'AUTH_PASSWORD not configured' })
    return
  }

  if (password !== expected) {
    res.status(401).json({ error: 'Wrong password' })
    return
  }

  const token = crypto.randomUUID()
  sessions.add(token)

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
  })

  res.json({ ok: true })
}

export function logout(req: Request, res: Response) {
  const cookies = parseCookies(req)
  const token = cookies[COOKIE_NAME]
  if (token) sessions.delete(token)

  res.clearCookie(COOKIE_NAME)
  res.json({ ok: true })
}

export function checkAuth(req: Request, res: Response) {
  const cookies = parseCookies(req)
  const token = cookies[COOKIE_NAME]
  const authenticated = !!(token && sessions.has(token))
  res.json({ authenticated })
}
