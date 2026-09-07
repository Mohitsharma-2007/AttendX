/**
 * Bundled app identity. Bump these together with android/app/build.gradle
 * (versionName / versionCode) on every release.
 */
export const APP_VERSION = '1.0.5';
export const APP_VERSION_CODE = 5;

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  latestVersionCode: number;
  apkUrl: string;
  releasePage: string;
  releaseNotes: string;
  updateAvailable: boolean;
}

/**
 * Ask the AttendX server for the latest published APK. Compares version codes
 * so an outdated install can surface the update notice.
 */
export async function checkForUpdate(serverUrl: string): Promise<AppUpdateInfo> {
  const fallback: AppUpdateInfo = {
    currentVersion: APP_VERSION,
    latestVersion: null,
    latestVersionCode: 0,
    apkUrl: `${serverUrl}/api/app/latest`,
    releasePage: 'https://github.com/Mohitsharma-2007/AttendX/releases/latest',
    releaseNotes: '',
    updateAvailable: false,
  };
  try {
    const res = await fetch(`${serverUrl}/api/app/latest`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return fallback;
    const data = await res.json();
    const latestCode = Number(data.versionCode || 0);
    return {
      currentVersion: APP_VERSION,
      latestVersion: data.version || null,
      latestVersionCode: latestCode,
      apkUrl: data.apkUrl || fallback.apkUrl,
      releasePage: data.releasePage || fallback.releasePage,
      releaseNotes: data.releaseNotes || '',
      updateAvailable: latestCode > APP_VERSION_CODE,
    };
  } catch {
    return fallback;
  }
}
