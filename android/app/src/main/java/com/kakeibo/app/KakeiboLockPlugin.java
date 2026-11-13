package com.kakeibo.app;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

@CapacitorPlugin(name = "KakeiboLock")
public class KakeiboLockPlugin extends Plugin {

    private BiometricPrompt biometricPrompt;
    private PluginCall activeCall;

    @PluginMethod
    public void available(PluginCall call) {
        BiometricManager manager = BiometricManager.from(getContext());
        int status = manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
        JSObject result = new JSObject();
        result.put("available", status == BiometricManager.BIOMETRIC_SUCCESS || status == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED);
        result.put("enrolled", status == BiometricManager.BIOMETRIC_SUCCESS);
        if (status == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
            result.put("reason", "no-hardware");
        } else if (status == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
            result.put("reason", "none-enrolled");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        if (!(getActivity() instanceof FragmentActivity)) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("reason", "no-activity");
            call.resolve(result);
            return;
        }
        activeCall = call;
        FragmentActivity activity = (FragmentActivity) getActivity();
        Executor executor = ContextCompat.getMainExecutor(getContext());
        biometricPrompt = new BiometricPrompt(activity, executor, new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult authResult) {
                resolveActive(true, null);
            }

            @Override
            public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                resolveActive(false, errString.toString());
            }

            @Override
            public void onAuthenticationFailed() {
                resolveActive(false, "failed");
            }
        });
        String title = call.getString("title", "Unlock Kakeibo");
        String subtitle = call.getString("subtitle", "Confirm with your fingerprint or face");
        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText("Use PIN")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
            .build();
        activity.runOnUiThread(() -> biometricPrompt.authenticate(promptInfo));
    }

    private void resolveActive(boolean success, String reason) {
        PluginCall call = activeCall;
        activeCall = null;
        if (call == null) return;
        JSObject result = new JSObject();
        result.put("success", success);
        if (reason != null) result.put("reason", reason);
        call.resolve(result);
    }
}
