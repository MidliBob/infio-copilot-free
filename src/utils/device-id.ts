import { Platform } from 'obsidian'

const DEVICE_ID_STORAGE_KEY = 'icf_device_id'

function generatePseudoId(): string {
  // RFC4122-ish v4 UUID (non-crypto), sufficient for stable device identifier when persisted
  let timeSeed = Date.now()
  let perfSeed = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? Math.floor(performance.now() * 1000)
    : 0
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    let rand = Math.random() * 16
    if (timeSeed > 0) {
      rand = (timeSeed + rand) % 16
      timeSeed = Math.floor(timeSeed / 16)
    } else {
      rand = (perfSeed + rand) % 16
      perfSeed = Math.floor(perfSeed / 16)
    }
    const value = ch === 'x' ? rand : (rand & 0x3) | 0x8
    return Math.floor(value).toString(16)
  })
}

function safeGetLocalStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key)
    }
  } catch { /* noop */ }
  return null
}

function safeSetLocalStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value)
    }
  } catch { /* noop */ }
}

export async function getDeviceId(): Promise<string> {
  // Stable per-device pseudo identifier, persisted locally.
  // No hardware fingerprinting (Obsidian developer policies).
  const existing = safeGetLocalStorage(DEVICE_ID_STORAGE_KEY)
  if (existing) return existing
  const generated = generatePseudoId()
  safeSetLocalStorage(DEVICE_ID_STORAGE_KEY, generated)
  return generated
}

export function getOperatingSystem(): string {
  if (Platform.isWin) return 'windows'
  if (Platform.isMacOS) return 'macos'
  if (Platform.isLinux) return 'linux'
  if (Platform.isAndroidApp) return 'android'
  if (Platform.isIosApp) return 'ios'
  return 'unknown'
}


