package com.kakeibo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.widget.RemoteViews;

public class KakeiboWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "kakeibo_widget";
    static final String ACTION_TOGGLE_VISIBILITY = "com.kakeibo.app.TOGGLE_WIDGET_VISIBILITY";
    static final String KEY_SPENDABLE_LEFT = "spendableLeft";
    static final String KEY_SPENDABLE = "spendable";
    static final String KEY_SPENT = "spent";
    static final String KEY_HIDDEN_SPENDABLE_LEFT = "hiddenSpendableLeft";
    static final String KEY_HIDDEN_SPENDABLE = "hiddenSpendable";
    static final String KEY_HIDDEN_SPENT = "hiddenSpent";
    static final String KEY_AMOUNTS_HIDDEN = "amountsHidden";
    static final String KEY_APP_AMOUNTS_HIDDEN = "appAmountsHidden";
    private static final String DEFAULT_VALUE = "—";
    private static final String HIDDEN_GLYPHS = "甲乙丙丁戊己庚辛壬癸";

    static void saveValues(
        Context context,
        String spendableLeft,
        String spendable,
        String spent,
        String hiddenSpendableLeft,
        String hiddenSpendable,
        String hiddenSpent,
        boolean appAmountsHidden
    ) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean lastAppHidden = preferences.getBoolean(KEY_APP_AMOUNTS_HIDDEN, true);
        boolean effectiveHidden = preferences.getBoolean(KEY_AMOUNTS_HIDDEN, true);
        if (appAmountsHidden != lastAppHidden) {
            effectiveHidden = appAmountsHidden;
        }
        preferences.edit()
            .putString(KEY_SPENDABLE_LEFT, spendableLeft)
            .putString(KEY_SPENDABLE, spendable)
            .putString(KEY_SPENT, spent)
            .putString(KEY_HIDDEN_SPENDABLE_LEFT, hiddenSpendableLeft)
            .putString(KEY_HIDDEN_SPENDABLE, hiddenSpendable)
            .putString(KEY_HIDDEN_SPENT, hiddenSpent)
            .putBoolean(KEY_APP_AMOUNTS_HIDDEN, appAmountsHidden)
            .putBoolean(KEY_AMOUNTS_HIDDEN, effectiveHidden)
            .apply();
        updateAll(context);
    }

    static String maskDigits(String value) {
        if (value == null) return DEFAULT_VALUE;
        StringBuilder masked = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character >= '0' && character <= '9') {
                masked.append(HIDDEN_GLYPHS.charAt(character - '0'));
            } else {
                masked.append(character);
            }
        }
        return masked.toString();
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, KakeiboWidgetProvider.class));
        updateWidgets(context, manager, ids);
    }

    private static void updateWidgets(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean hidden = preferences.getBoolean(KEY_AMOUNTS_HIDDEN, true);

        String spendableLeft = preferences.getString(KEY_SPENDABLE_LEFT, DEFAULT_VALUE);
        String spendable = preferences.getString(KEY_SPENDABLE, DEFAULT_VALUE);
        String spent = preferences.getString(KEY_SPENT, DEFAULT_VALUE);
        String hiddenSpendableLeft = preferences.getString(KEY_HIDDEN_SPENDABLE_LEFT, maskDigits(spendableLeft));
        String hiddenSpendable = preferences.getString(KEY_HIDDEN_SPENDABLE, maskDigits(spendable));
        String hiddenSpent = preferences.getString(KEY_HIDDEN_SPENT, maskDigits(spent));

        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_kakeibo);
            views.setTextViewText(R.id.widget_spendable_left, hidden ? hiddenSpendableLeft : spendableLeft);
            views.setTextViewText(R.id.widget_spent, "Spent: " + (hidden ? hiddenSpent : spent));
            views.setTextViewText(R.id.widget_spendable, "Spendable: " + (hidden ? hiddenSpendable : spendable));
            views.setImageViewResource(
                R.id.widget_toggle_visibility,
                hidden ? R.drawable.ic_widget_eye_off : R.drawable.ic_widget_eye_on
            );
            views.setContentDescription(
                R.id.widget_toggle_visibility,
                hidden ? "Show amounts" : "Hide amounts"
            );

            Intent openApp = new Intent(context, MainActivity.class);
            openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(context, id, openApp, pendingIntentFlags);
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

            Intent addExpense = new Intent(context, QuickAddActivity.class);
            addExpense.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            addExpense.putExtra(QuickAddActivity.EXTRA_FROM_WIDGET, true);
            PendingIntent addExpensePendingIntent = PendingIntent.getActivity(
                context,
                id + 100000,
                addExpense,
                pendingIntentFlags
            );
            views.setOnClickPendingIntent(R.id.widget_quick_add, addExpensePendingIntent);

            Intent toggleVisibility = new Intent(context, KakeiboWidgetProvider.class);
            toggleVisibility.setAction(ACTION_TOGGLE_VISIBILITY);
            PendingIntent togglePendingIntent = PendingIntent.getBroadcast(
                context,
                id + 200000,
                toggleVisibility,
                pendingIntentFlags
            );
            views.setOnClickPendingIntent(R.id.widget_toggle_visibility, togglePendingIntent);

            manager.updateAppWidget(id, views);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_TOGGLE_VISIBILITY.equals(intent.getAction())) {
            SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            boolean hidden = preferences.getBoolean(KEY_AMOUNTS_HIDDEN, true);
            preferences.edit().putBoolean(KEY_AMOUNTS_HIDDEN, !hidden).apply();
            updateAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateWidgets(context, appWidgetManager, appWidgetIds);
    }
}
