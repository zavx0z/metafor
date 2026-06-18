package com.metafor.androidrtc;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.util.DisplayMetrics;
import android.graphics.Path;
import android.media.AudioManager;
import android.os.Build;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import java.lang.ref.WeakReference;
import org.json.JSONObject;

public final class AndroidControlAccessibilityService extends AccessibilityService {
  private static WeakReference<AndroidControlAccessibilityService> active = new WeakReference<>(null);
  private static final int TAP_DURATION_MS = 90;

  interface ControlResultCallback {
    void onResult(boolean ok);
  }

  static void execute(JSONObject command, ControlResultCallback callback) {
    AndroidControlAccessibilityService service = active.get();
    if (service == null) {
      callback.onResult(false);
      return;
    }
    service.executeCommand(command, callback);
  }

  static boolean isReady() {
    return active.get() != null;
  }

  @Override public void onServiceConnected() {
    active = new WeakReference<>(this);
  }

  @Override public void onDestroy() {
    if (active.get() == this) active = new WeakReference<>(null);
    super.onDestroy();
  }

  @Override public void onAccessibilityEvent(AccessibilityEvent event) {}

  @Override public void onInterrupt() {}

  private void executeCommand(JSONObject command, ControlResultCallback callback) {
    String type = command.optString("type", "");
    if ("tap".equals(type)) {
      gestureTap(command, (float) command.optDouble("x"), (float) command.optDouble("y"), callback);
      return;
    }
    if ("swipe".equals(type)) {
      gestureSwipe(
        command,
        (float) command.optDouble("x1"),
        (float) command.optDouble("y1"),
        (float) command.optDouble("x2"),
        (float) command.optDouble("y2"),
        Math.max(50, Math.min(2000, command.optInt("durationMs", 250))),
        callback
      );
      return;
    }
    if ("key".equals(type)) {
      callback.onResult(key(command.optString("code", "")));
      return;
    }
    if ("launch".equals(type)) {
      callback.onResult(launch(command.optString("packageName", "")));
      return;
    }
    callback.onResult(false);
  }

  private void gestureTap(JSONObject command, float x, float y, ControlResultCallback callback) {
    DisplayMetrics metrics = displayMetrics();
    Path path = new Path();
    path.moveTo(mapX(commandFrameWidth(command), x, metrics), mapY(commandFrameHeight(command), y, metrics));
    GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(path, 0, TAP_DURATION_MS);
    dispatchGestureWithResult(path, stroke, callback);
  }

  private void gestureSwipe(JSONObject command, float x1, float y1, float x2, float y2, int durationMs, ControlResultCallback callback) {
    DisplayMetrics metrics = displayMetrics();
    float sourceW = commandFrameWidth(command);
    float sourceH = commandFrameHeight(command);
    Path path = new Path();
    path.moveTo(mapX(sourceW, x1, metrics), mapY(sourceH, y1, metrics));
    path.lineTo(mapX(sourceW, x2, metrics), mapY(sourceH, y2, metrics));
    GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(path, 0, durationMs);
    dispatchGestureWithResult(path, stroke, callback);
  }

  private void dispatchGestureWithResult(Path path, GestureDescription.StrokeDescription stroke, ControlResultCallback callback) {
    boolean accepted = dispatchGesture(
      new GestureDescription.Builder().addStroke(stroke).build(),
      new GestureResultCallback() {
        @Override public void onCompleted(GestureDescription gestureDescription) {
          callback.onResult(true);
        }

        @Override public void onCancelled(GestureDescription gestureDescription) {
          callback.onResult(false);
        }
      },
      null
    );
    if (!accepted) callback.onResult(false);
  }

  private DisplayMetrics displayMetrics() {
    DisplayMetrics metrics = new DisplayMetrics();
    WindowManager manager = (WindowManager) getSystemService(WINDOW_SERVICE);
    if (manager != null) manager.getDefaultDisplay().getRealMetrics(metrics);
    if (metrics.widthPixels <= 0) metrics.widthPixels = 1;
    if (metrics.heightPixels <= 0) metrics.heightPixels = 1;
    return metrics;
  }

  private float commandFrameWidth(JSONObject command) {
    double value = command.optDouble("frameW", Double.NaN);
    return Double.isFinite(value) && value > 0 ? (float) value : displayMetrics().widthPixels;
  }

  private float commandFrameHeight(JSONObject command) {
    double value = command.optDouble("frameH", Double.NaN);
    return Double.isFinite(value) && value > 0 ? (float) value : displayMetrics().heightPixels;
  }

  private float mapX(float sourceWidth, float x, DisplayMetrics metrics) {
    float mapped = x * metrics.widthPixels / Math.max(1, sourceWidth);
    return clamp(mapped, 0, metrics.widthPixels - 1);
  }

  private float mapY(float sourceHeight, float y, DisplayMetrics metrics) {
    float mapped = y * metrics.heightPixels / Math.max(1, sourceHeight);
    return clamp(mapped, 0, metrics.heightPixels - 1);
  }

  private static float clamp(float value, float min, float max) {
    return Math.max(min, Math.min(max, value));
  }

  private boolean key(String code) {
    if ("KEYCODE_BACK".equals(code)) return performGlobalAction(GLOBAL_ACTION_BACK);
    if ("KEYCODE_HOME".equals(code)) return performGlobalAction(GLOBAL_ACTION_HOME);
    if ("KEYCODE_APP_SWITCH".equals(code)) return performGlobalAction(GLOBAL_ACTION_RECENTS);
    if ("KEYCODE_POWER".equals(code) && Build.VERSION.SDK_INT >= 28) return performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN);
    AudioManager audio = (AudioManager) getSystemService(AUDIO_SERVICE);
    if (audio == null) return false;
    if ("KEYCODE_VOLUME_DOWN".equals(code)) {
      audio.adjustVolume(AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
      return true;
    }
    if ("KEYCODE_VOLUME_UP".equals(code)) {
      audio.adjustVolume(AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI);
      return true;
    }
    return false;
  }

  private boolean launch(String packageName) {
    if (packageName == null || packageName.trim().isEmpty()) return false;
    Intent intent = getPackageManager().getLaunchIntentForPackage(packageName.trim());
    if (intent == null) return false;
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    startActivity(intent);
    return true;
  }
}
