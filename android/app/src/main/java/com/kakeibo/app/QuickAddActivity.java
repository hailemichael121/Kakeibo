package com.kakeibo.app;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.HapticFeedbackConstants;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class QuickAddActivity extends BridgeActivity {
    static final String EXTRA_FROM_WIDGET = "kakeibo.fromWidget";

    @Override
    public void setTheme(int resid) {
        super.setTheme(R.style.AppTheme_QuickAdd);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KakeiboWidgetPlugin.class);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        if (getIntent().getBooleanExtra(EXTRA_FROM_WIDGET, false)) {
            window.getDecorView().post(() -> window.getDecorView().performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY));
        }
        if (getBridge() != null) {
            getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
            String serverUrl = getBridge().getServerUrl();
            if (serverUrl == null) {
                serverUrl = getBridge().getLocalUrl();
            }
            String quickAddUrl = serverUrl.endsWith("/")
                ? serverUrl + "?widgetQuickAdd=1"
                : serverUrl + "/?widgetQuickAdd=1";
            getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(quickAddUrl));
        }
    }
}
