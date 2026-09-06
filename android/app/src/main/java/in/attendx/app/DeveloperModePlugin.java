package in.attendx.app;

import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

@CapacitorPlugin(name = "DeveloperMode")
public class DeveloperModePlugin extends Plugin {
    @PluginMethod
    public void isDeveloperModeEnabled(PluginCall call) {
        try {
            int devOptions = Settings.Global.getInt(
                getContext().getContentResolver(),
                Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0
            );
            JSObject ret = new JSObject();
            ret.put("enabled", devOptions != 0);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to check developer mode", e);
        }
    }
}
