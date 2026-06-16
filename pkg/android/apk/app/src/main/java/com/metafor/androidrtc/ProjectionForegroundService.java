package com.metafor.androidrtc;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

public final class ProjectionForegroundService extends Service {
  static final String CHANNEL_ID = "metafor_projection";
  static final int NOTIFICATION_ID = 4017;
  private static volatile boolean foreground;

  @Override public void onCreate() {
    super.onCreate();
    ensureChannel();
    startForeground(NOTIFICATION_ID, notification());
    foreground = true;
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    return START_STICKY;
  }

  @Override public void onDestroy() {
    foreground = false;
    super.onDestroy();
  }

  @Override public IBinder onBind(Intent intent) {
    return null;
  }

  static boolean isForeground() {
    return foreground;
  }

  static void resetForeground() {
    foreground = false;
  }

  private void ensureChannel() {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationChannel channel = new NotificationChannel(
      CHANNEL_ID,
      "MetaFor screen streaming",
      NotificationManager.IMPORTANCE_LOW
    );
    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager != null) manager.createNotificationChannel(channel);
  }

  private Notification notification() {
    Notification.Builder builder = Build.VERSION.SDK_INT >= 26
      ? new Notification.Builder(this, CHANNEL_ID)
      : new Notification.Builder(this);
    return builder
      .setSmallIcon(android.R.drawable.presence_video_online)
      .setContentTitle("MetaFor Android RTC")
      .setContentText("Streaming the screen to MetaFor")
      .setOngoing(true)
      .build();
  }
}
