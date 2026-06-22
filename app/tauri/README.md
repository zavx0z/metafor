# MetaFor Tauri

Tauri WebView shell for `https://meta.proizvodstvo1.ru`.

The app opens the current production MetaFor web app in its own WebView. SSO is handled by the existing production login flow inside that WebView, so cookies and WebSocket access stay in one application profile.

This package is the Tauri shell for Android now, and can also be used for iOS or desktop targets where the platform WebView supports the renderer requirements. It does not replace or modify `pkg/android/apk`.

## Commands

```bash
cd app/tauri
bun install

# Desktop
bun run dev
bun run build

# Android
bun run android:init
bun run android:dev
bun run android:build
```

`android:init` creates the Tauri Android project under `src-tauri/gen/android`.

On this Mac the Android build uses the MacPorts ADB plus a user-local Android SDK
and JDK 21:

```bash
export JAVA_HOME="$HOME/.jdks/temurin-21/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```
