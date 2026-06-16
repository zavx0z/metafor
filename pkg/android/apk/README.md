# MetaFor Android RTC APK

Native Android sender for the interpreter Android panel.

It replaces the slow ADB PNG/screenrecord path with:

- `MediaProjection` screen capture
- WebRTC video track to the interpreter
- WebRTC data channel control from the interpreter
- `AccessibilityService` for tap, swipe, Back, Home, Recent, volume, lock-screen, and package launch commands

Default signaling URL:

```text
ws://192.168.8.106:6500/hud/android/webrtc/signaling?room=android-display&peer=android
```

Build:

```bash
cd pkg/android/apk
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Runtime setup on the phone:

1. Open the APK.
2. Tap `Open Accessibility Settings`.
3. Enable `MetaFor Android Control`.
4. Return to the APK.
5. Check the signaling URL points to the Mac running the interpreter.
6. Tap `Start Screen RTC` and approve screen capture.
7. In the interpreter, open the Android HUD.

If Gradle wrapper is not present, install Android Studio or Gradle + Android SDK, then run:

```bash
gradle wrapper
./gradlew assembleDebug
```
