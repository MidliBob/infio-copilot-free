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
  // On mobile, generate and persist a stable pseudo ID
  if (Platform.isMobile) {
    const existing = safeGetLocalStorage(DEVICE_ID_STORAGE_KEY)
    if (existing) return existing
    const generated = generatePseudoId()
    safeSetLocalStorage(DEVICE_ID_STORAGE_KEY, generated)
    return generated
  }

  // Desktop: try node-machine-id; fall back to persisted pseudo ID
  try {
    const moduleName = 'node-machine-id'
    // Use dynamic import via variable to avoid bundlers pulling it into mobile builds
    const mod: unknown = await import(/* @vite-ignore */ moduleName)
    if (
      typeof mod === 'object' && mod !== null &&
      'machineId' in mod && typeof (mod as Record<string, unknown>).machineId === 'function'
    ) {
      const id = await (mod as { machineId: () => Promise<string> }).machineId()
      if (id) return id
    }
  } catch {
    // ignore and fall back
  }

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


