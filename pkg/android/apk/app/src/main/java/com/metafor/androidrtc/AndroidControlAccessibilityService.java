package com.metafor.androidrtc;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.graphics.Path;
import android.media.AudioManager;
import android.os.Build;
import android.view.accessibility.AccessibilityEvent;
import java.lang.ref.WeakReference;
import org.json.JSONObject;

public final class AndroidControlAccessibilityService extends AccessibilityService {
  private static WeakReference<AndroidControlAccessibilityService> active = new WeakReference<>(null);

  static boolean execute(JSONObject command) {
    AndroidControlAccessibilityService service = active.get();
    if (service == null) return false;
    return service.executeCommand(command);
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

  private boolean executeCommand(JSONObject command) {
    String type = command.optString("type", "");
    if ("tap".equals(type)) {
      return gestureTap((float) command.optDouble("x"), (float) command.optDouble("y"));
    }
    if ("swipe".equals(type)) {
      return gestureSwipe(
        (float) command.optDouble("x1"),
        (float) command.optDouble("y1"),
        (float) command.optDouble("x2"),
        (float) command.optDouble("y2"),
        Math.max(50, Math.min(2000, command.optInt("durationMs", 250)))
      );
    }
    if ("key".equals(type)) {
      return key(command.optString("code", ""));
    }
    if ("launch".equals(type)) {
      return launch(command.optString("packageName", ""));
    }
    return false;
  }

  private boolean gestureTap(float x, float y) {
    Path path = new Path();
    path.moveTo(x, y);
    GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(path, 0, 1);
    return dispatchGesture(new GestureDescription.Builder().addStroke(stroke).build(), null, null);
  }

  private boolean gestureSwipe(float x1, float y1, float x2, float y2, int durationMs) {
    Path path = new Path();
    path.moveTo(x1, y1);
    path.lineTo(x2, y2);
    GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(path, 0, durationMs);
    return dispatchGesture(new GestureDescription.Builder().addStroke(stroke).build(), null, null);
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
