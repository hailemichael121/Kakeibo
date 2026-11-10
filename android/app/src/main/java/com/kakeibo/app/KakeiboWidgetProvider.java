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
    static final String KEY_SPENDABLE_LEFT = "spendableLeft";
    static final String KEY_SPENDABLE = "spendable";
    static final String KEY_SPENT = "spent";
    private static final String DEFAULT_VALUE = "—";

    static void saveValues(Context context, String spendableLeft, String spendable, String spent) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        preferences.edit()
            .putString(KEY_SPENDABLE_LEFT, spendableLeft)
            .putString(KEY_SPENDABLE, spendable)
            .putString(KEY_SPENT, spent)
            .apply();
        updateAll(context);
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, KakeiboWidgetProvider.class));
        updateWidgets(context, manager, ids);
    }

    private static void updateWidgets(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String spendableLeft = preferences.getString(KEY_SPENDABLE_LEFT, DEFAULT_VALUE);
        String spendable = preferences.getString(KEY_SPENDABLE, DEFAULT_VALUE);
        String spent = preferences.getString(KEY_SPENT, DEFAULT_VALUE);

        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_kakeibo);
            views.setTextViewText(R.id.widget_spendable_left, spendableLeft);
            views.setTextViewText(R.id.widget_spent, "Spent: " + spent);
            views.setTextViewText(R.id.widget_spendable, "Spendable: " + spendable);

            Intent openApp = new Intent(context, MainActivity.class);
            openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                id,
                openApp,
                pendingIntentFlags
            );
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
            manager.updateAppWidget(id, views);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateWidgets(context, appWidgetManager, appWidgetIds);
    }
}
