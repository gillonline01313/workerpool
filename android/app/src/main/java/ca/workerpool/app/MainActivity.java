package ca.workerpool.app;

import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.TextView;
import android.widget.Toast;

/** The app's launcher: opens workerpool.ca, but first shows the last crash report if there is one. */
public class MainActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private String pendingReport;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SharedPreferences p = getSharedPreferences(App.PREFS, Context.MODE_PRIVATE);
        pendingReport = p.getString("report", null);
        if (pendingReport != null) p.edit().remove("report").commit();
        super.onCreate(savedInstanceState);
        if (pendingReport != null && !isFinishing()) showReport();
    }

    @Override
    protected boolean shouldLaunchImmediately() {
        return pendingReport == null;
    }

    private void showReport() {
        TextView text = new TextView(this);
        text.setText(pendingReport);
        text.setTextIsSelectable(true);
        text.setTextSize(11);
        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        text.setPadding(pad, pad, pad, pad);
        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        scroll.addView(text);
        new AlertDialog.Builder(this, android.R.style.Theme_Material_Light_Dialog_Alert)
                .setTitle("WorkerPool stopped last time")
                .setView(scroll)
                .setCancelable(false)
                .setPositiveButton("Copy and continue", (d, w) -> {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("WorkerPool crash", pendingReport));
                    Toast.makeText(this, "Copied. Please send it to WorkerPool.", Toast.LENGTH_LONG).show();
                    pendingReport = null;
                    launchTwa();
                })
                .setNegativeButton("Continue", (d, w) -> { pendingReport = null; launchTwa(); })
                .show();
    }
}
