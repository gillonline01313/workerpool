package ca.workerpool.app;

import android.app.Application;
import android.content.Context;
import android.os.Build;
import android.util.Log;

/** Saves the details of any crash so the next launch can show them (see MainActivity). */
public class App extends Application {
    static final String PREFS = "crash";

    @Override
    public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                String report = "WorkerPool " + BuildConfig.VERSION_NAME + " · Android " + Build.VERSION.RELEASE
                        + " (API " + Build.VERSION.SDK_INT + ") · " + Build.MANUFACTURER + " " + Build.MODEL
                        + "\nThread: " + thread.getName() + "\n\n" + Log.getStackTraceString(error);
                getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("report", report).commit();
            } catch (Throwable ignored) { }
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }
}
