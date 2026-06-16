plugins {
  id("com.android.application")
}

android {
  namespace = "com.metafor.androidrtc"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.metafor.androidrtc"
    minSdk = 26
    targetSdk = 35
    versionCode = 1
    versionName = "0.1.0"
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

dependencies {
  implementation("io.github.webrtc-sdk:android:144.7559.09")
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
