import { registerPlugin, Capacitor } from '@capacitor/core'

export interface IntegrityResult { developerMode: boolean; mockLocation: boolean; rooted: boolean; platform: string }
interface DeviceIntegrityPlugin { check(): Promise<IntegrityResult> }
const DeviceIntegrity = registerPlugin<DeviceIntegrityPlugin>('DeviceIntegrity')

export async function checkDeviceIntegrity(): Promise<IntegrityResult> {
  if (!Capacitor.isNativePlatform()) return { developerMode: false, mockLocation: false, rooted: false, platform: 'web' }
  try { return await DeviceIntegrity.check() } catch { return { developerMode: false, mockLocation: false, rooted: false, platform: Capacitor.getPlatform() } }
}

