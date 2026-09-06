import { registerPlugin, Capacitor } from '@capacitor/core'

export interface IntegrityResult {
  developerMode: boolean;
  mockLocation: boolean;
  rooted: boolean;
  platform: string;
}

interface DeveloperModePlugin {
  check(): Promise<IntegrityResult>;
  isDeveloperModeEnabled(): Promise<{ enabled: boolean; developerMode?: boolean }>;
  openSettings(): Promise<void>;
}

const DeveloperMode = registerPlugin<DeveloperModePlugin>('DeveloperMode')

export async function checkDeviceIntegrity(): Promise<IntegrityResult> {
  if (!Capacitor.isNativePlatform()) {
    return { developerMode: false, mockLocation: false, rooted: false, platform: 'web' };
  }
  try {
    const res = await DeveloperMode.check();
    return {
      developerMode: Boolean(res.developerMode ?? (res as any).enabled),
      mockLocation: Boolean(res.mockLocation),
      rooted: Boolean(res.rooted),
      platform: res.platform || 'android',
    };
  } catch {
    try {
      const fallback = await DeveloperMode.isDeveloperModeEnabled();
      return {
        developerMode: Boolean(fallback.enabled || fallback.developerMode),
        mockLocation: false,
        rooted: false,
        platform: 'android',
      };
    } catch {
      return { developerMode: false, mockLocation: false, rooted: false, platform: Capacitor.getPlatform() };
    }
  }
}

export async function openDeveloperSettings(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await DeveloperMode.openSettings();
    } catch (e) {
      console.warn('Could not open developer settings:', e);
    }
  }
}
