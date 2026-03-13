import webpush from 'web-push'
import https from 'https'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SUBSCRIPTIONS_FILE = path.join(__dirname, '..', 'push-subscriptions.json')

// --- VAPID Keys ---
// Set via env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// Generate with: npx web-push generate-vapid-keys
let vapidConfigured = false

export function initVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (publicKey && privateKey) {
    webpush.setVapidDetails('mailto:admin@monitor.hardart.cz', publicKey, privateKey)
    vapidConfigured = true
    console.log('Web Push VAPID configured')
  } else {
    console.log('Web Push disabled: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set in .env')
  }
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null
}

// --- Web Push Subscriptions ---
interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

let subscriptions: PushSubscription[] = []

function loadSubscriptions() {
  try {
    if (existsSync(SUBSCRIPTIONS_FILE)) {
      subscriptions = JSON.parse(readFileSync(SUBSCRIPTIONS_FILE, 'utf-8'))
    }
  } catch { subscriptions = [] }
}

function saveSubscriptions() {
  try {
    writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2))
  } catch (err) {
    console.error('Failed to save push subscriptions:', err)
  }
}

// Load on module init
loadSubscriptions()

export function addPushSubscription(sub: PushSubscription) {
  // Deduplicate by endpoint
  const existing = subscriptions.findIndex(s => s.endpoint === sub.endpoint)
  if (existing >= 0) {
    subscriptions[existing] = sub
  } else {
    subscriptions.push(sub)
  }
  saveSubscriptions()
}

export function removePushSubscription(endpoint: string) {
  subscriptions = subscriptions.filter(s => s.endpoint !== endpoint)
  saveSubscriptions()
}

export function getPushSubscriptionCount(): number {
  return subscriptions.length
}

// --- Send Web Push ---
async function sendWebPush(title: string, body: string, tag?: string) {
  if (!vapidConfigured || subscriptions.length === 0) return

  const payload = JSON.stringify({ title, body, tag: tag || 'alert', url: '/' })
  const expiredEndpoints: string[] = []

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, payload)
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription expired, mark for removal
          expiredEndpoints.push(sub.endpoint)
        }
      }
    })
  )

  // Clean up expired subscriptions
  if (expiredEndpoints.length > 0) {
    subscriptions = subscriptions.filter(s => !expiredEndpoints.includes(s.endpoint))
    saveSubscriptions()
  }
}

// --- Telegram ---
function getTelegramConfig(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return null
  return { token, chatId }
}

function sendTelegramMessage(text: string): Promise<void> {
  const config = getTelegramConfig()
  if (!config) return Promise.resolve()

  return new Promise((resolve) => {
    const data = JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    })

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${config.token}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 10000,
      },
      (res) => {
        res.resume()
        resolve()
      }
    )

    req.on('error', (err) => {
      console.error('Telegram send error:', err.message)
      resolve()
    })
    req.on('timeout', () => {
      req.destroy()
      resolve()
    })
    req.write(data)
    req.end()
  })
}

// --- Unified Alert Sending ---
export type AlertLevel = 'critical' | 'warning' | 'recovery'

export interface Alert {
  level: AlertLevel
  title: string
  message: string
  tag: string // for dedup/grouping
}

const EMOJI: Record<AlertLevel, string> = {
  critical: '\u{1F534}', // red circle
  warning: '\u{1F7E1}',  // yellow circle
  recovery: '\u{1F7E2}', // green circle
}

export async function sendAlert(alert: Alert) {
  const emoji = EMOJI[alert.level]

  // Send both channels in parallel
  await Promise.allSettled([
    sendTelegramMessage(`${emoji} <b>${alert.title}</b>\n${alert.message}`),
    sendWebPush(`${emoji} ${alert.title}`, alert.message, alert.tag),
  ])
}

// --- Status ---
export function getNotificationStatus() {
  const tg = getTelegramConfig()
  return {
    telegram: !!tg,
    webPush: vapidConfigured,
    pushSubscriptions: subscriptions.length,
  }
}
