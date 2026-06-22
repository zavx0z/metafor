package ru.proizvodstvo1.metafor

import android.content.Context
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    enterImmersiveMode()
    super.onCreate(savedInstanceState)
  }

  override fun onResume() {
    super.onResume()
    enterImmersiveMode()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      enterImmersiveMode()
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.isFocusable = true
    webView.isFocusableInTouchMode = true
    webView.addJavascriptInterface(MetaForKeyboardBridge(this, webView), "MetaForKeyboard")
  }

  private fun enterImmersiveMode() {
    window.setFlags(
      WindowManager.LayoutParams.FLAG_FULLSCREEN,
      WindowManager.LayoutParams.FLAG_FULLSCREEN
    )

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.insetsController?.let { controller ->
        controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
        controller.systemBarsBehavior =
          WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      }
      return
    }

    @Suppress("DEPRECATION")
    window.decorView.systemUiVisibility =
      View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
        View.SYSTEM_UI_FLAG_FULLSCREEN or
        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
  }
}

class MetaForKeyboardBridge(
  private val activity: MainActivity,
  private val webView: WebView
) {
  @JavascriptInterface
  fun show() {
    activity.runOnUiThread {
      showKeyboardOnce()
      webView.postDelayed({ showKeyboardOnce() }, 80)
    }
  }

  @JavascriptInterface
  fun hide() {
    activity.runOnUiThread {
      val input = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      input.hideSoftInputFromWindow(webView.windowToken, 0)
    }
  }

  private fun showKeyboardOnce() {
    webView.isFocusable = true
    webView.isFocusableInTouchMode = true
    webView.requestFocus()
    val input = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
    input.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT)
  }
}
