package in.attendx.app;

import android.content.ContentResolver;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

@CapacitorPlugin(name = "DeveloperMode")
public class DeveloperModePlugin extends Plugin {

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
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        ret.put("developerMode", enabled);
        ret.put("mockLocation", false);
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

