package in.attendx.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;
import java.util.List;

@CapacitorPlugin(name = "DeveloperMode")
public class DeveloperModePlugin extends Plugin {

    private static final String TAG = "AttendXIntegrity";

    private boolean isDevModeOn() {
        try {
            ContentResolver cr = getContext().getContentResolver();
            int devGlobal = 0;
            int devSecure = 0;
            int adbGlobal = 0;
            int adbSecure = 0;

            try {
                devGlobal = Settings.Global.getInt(cr, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0);
            } catch (Exception ignored) {}

            try {
                devSecure = Settings.Secure.getInt(cr, "development_settings_enabled", 0);
            } catch (Exception ignored) {}

            try {
                adbGlobal = Settings.Global.getInt(cr, Settings.Global.ADB_ENABLED, 0);
            } catch (Exception ignored) {}

            try {
                adbSecure = Settings.Secure.getInt(cr, Settings.Secure.ADB_ENABLED, 0);
            } catch (Exception ignored) {}

            return (devGlobal != 0) || (devSecure != 0) || (adbGlobal != 0) || (adbSecure != 0);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Detect mock locations from every provider source:
     *  - API 31+: Settings.Secure "allow_mock_location" still works on many OEMs,
     *    and AppOps "android:mock_location" is the canonical check.
     *  - API 23-30: Location.isFromMockProvider() on the last known fix, plus
     *    the secure setting fallback.
     *  - Also flags active mock location apps (fake GPS) via allowed mock
     *    location package checks on supported builds.
     */
    private boolean isMockLocationActive() {
        try {
            ContentResolver cr = getContext().getContentResolver();

            // Legacy secure setting still present on most devices
            int allowMock = 0;
            try {
                allowMock = Settings.Secure.getInt(cr, Settings.Secure.ALLOW_MOCK_LOCATION, 0);
            } catch (Exception ignored) {}
            if (allowMock != 0) return true;

            // AppOps check (no special permission needed to read own/op state)
            try {
                android.app.AppOpsManager ops =
                        (android.app.AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
                if (ops != null) {
                    String pkg = getContext().getPackageName();
                    int mode;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        mode = ops.unsafeCheckOpNoThrow(
                                "android:mock_location", android.os.Process.myUid(), pkg);
                    } else {
                        mode = ops.checkOpNoThrow(
                                "android:mock_location", android.os.Process.myUid(), pkg);
                    }
                    if (mode == android.app.AppOpsManager.MODE_ALLOWED) return true;
                }
            } catch (Exception ignored) {}

            // Inspect active providers for mock fixes
            try {
                LocationManager lm =
                        (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
                if (lm != null) {
                    List<String> providers = lm.getProviders(true);
                    for (String provider : providers) {
                        android.location.Location last =
                                lm.getLastKnownLocation(provider);
                        if (last != null && last.isFromMockProvider()) {
                            return true;
                        }
                    }
                }
            } catch (Exception ignored) {}

            // Flag the well-known fake GPS apps if enabled as mock providers
            try {
                String mockApp = Settings.Secure.getString(cr, "mock_location_app");
                if (mockApp != null && !mockApp.trim().isEmpty()) return true;
            } catch (Exception ignored) {}

            return false;
        } catch (Exception e) {
            Log.w(TAG, "mock location check failed", e);
            return false;
        }
    }

    private boolean isUsbDebuggingOn() {
        try {
            ContentResolver cr = getContext().getContentResolver();
            int adbGlobal = 0;
            int adbSecure = 0;
            try {
                adbGlobal = Settings.Global.getInt(cr, Settings.Global.ADB_ENABLED, 0);
            } catch (Exception ignored) {}
            try {
                adbSecure = Settings.Secure.getInt(cr, Settings.Secure.ADB_ENABLED, 0);
            } catch (Exception ignored) {}
            return (adbGlobal != 0) || (adbSecure != 0);
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void isDeveloperModeEnabled(PluginCall call) {
        boolean enabled = isDevModeOn();
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        ret.put("developerMode", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void check(PluginCall call) {
        boolean enabled = isDevModeOn();
        boolean mock = isMockLocationActive();
        boolean usb = isUsbDebuggingOn();
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        ret.put("developerMode", enabled);
        ret.put("mockLocation", mock);
        ret.put("usbDebugging", usb);
        ret.put("rooted", false);
        ret.put("platform", "android");
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                fallback.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception ex) {
                call.reject("Could not open settings", ex);
            }
        }
    }
}
