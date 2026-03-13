import { useState, useEffect, useCallback } from 'react'

const API_BASE = '/api'

interface NotificationStatus {
  telegram: boolean
  webPush: boolean
  pushSubscriptions: number
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function useNotifications() {
  const [status, setStatus] = useState<NotificationStatus | null>(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [loading, setLoading] = useState(false)

  // Check if push is supported
  useEffect(() => {
    setPushSupported('serviceWorker' in navigator && 'PushManager' in window)
  }, [])

  // Check current state
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications/status`)
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch { /* ignore */ }

    // Check if we have an active push subscription
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js')
        if (reg) {
          const sub = await reg.pushManager.getSubscription()
          setPushEnabled(!!sub)
        }
      } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  // Subscribe to push notifications
  const enablePush = useCallback(async () => {
    if (!pushSupported) return false
    setLoading(true)
    try {
      // Request notification permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setLoading(false)
        return false
      }

      // Get VAPID key
      const keyRes = await fetch(`${API_BASE}/notifications/vapid-key`)
      const { key } = await keyRes.json()
      if (!key) {
        console.error('VAPID key not configured on server')
        setLoading(false)
        return false
      }

      // Register service worker
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // Subscribe
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      })

      // Send subscription to server
      await fetch(`${API_BASE}/notifications/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      })

      setPushEnabled(true)
      await fetchStatus()
      return true
    } catch (err) {
      console.error('Failed to enable push:', err)
      return false
    } finally {
      setLoading(false)
    }
  }, [pushSupported, fetchStatus])

  // Unsubscribe from push notifications
  const disablePush = useCallback(async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      if (reg) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await fetch(`${API_BASE}/notifications/unsubscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          })
          await sub.unsubscribe()
        }
      }
      setPushEnabled(false)
      await fetchStatus()
    } catch (err) {
      console.error('Failed to disable push:', err)
    } finally {
      setLoading(false)
    }
  }, [fetchStatus])

  // Send test notification
  const sendTest = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/notifications/test`, { method: 'POST' })
      return true
    } catch {
      return false
    }
  }, [])

  return {
    status,
    pushEnabled,
    pushSupported,
    loading,
    enablePush,
    disablePush,
    sendTest,
    refresh: fetchStatus,
  }
}
