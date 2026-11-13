package com.kakeibo.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.view.inputmethod.InputMethodManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KakeiboWidget")
public class KakeiboWidgetPlugin extends Plugin {

    @PluginMethod
    public void closeQuickAdd(PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> getActivity().finish());
        }
        call.resolve();
    }

    @PluginMethod
    public void showKeyboard(PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                InputMethodManager manager = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
                if (manager == null) return;
                getBridge().getWebView().requestFocus();
                manager.showSoftInput(getBridge().getWebView(), 0);
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        String spendableLeft = call.getString("spendableLeft", "—");
        String spendable = call.getString("spendable", "—");
        String spent = call.getString("spent", "—");
        String hiddenSpendableLeft = call.getString("hiddenSpendableLeft", KakeiboWidgetProvider.maskDigits(spendableLeft));
        String hiddenSpendable = call.getString("hiddenSpendable", KakeiboWidgetProvider.maskDigits(spendable));
        String hiddenSpent = call.getString("hiddenSpent", KakeiboWidgetProvider.maskDigits(spent));
        boolean appAmountsHidden = call.getBoolean("amountsHidden", true);
        KakeiboWidgetProvider.saveValues(
            getContext(),
            spendableLeft,
            spendable,
            spent,
            hiddenSpendableLeft,
            hiddenSpendable,
            hiddenSpent,
            appAmountsHidden
        );
        call.resolve();
    }

    @PluginMethod
    public void pin(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            result.put("supported", false);
            result.put("requested", false);
            result.put("reason", "android-version");
            call.resolve(result);
            return;
        }

        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        if (!manager.isRequestPinAppWidgetSupported()) {
            result.put("supported", false);
            result.put("requested", false);
            result.put("reason", "launcher");
            call.resolve(result);
            return;
        }

        KakeiboWidgetProvider.updateAll(getContext());
        ComponentName provider = new ComponentName(getContext(), KakeiboWidgetProvider.class);
        boolean requested = manager.requestPinAppWidget(provider, null, null);
        result.put("supported", true);
        result.put("requested", requested);
        call.resolve(result);
    }
}
