package ch.swissbitcoinpay.checkout

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import android.os.Build
import android.os.Bundle
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.net.ConnectivityManager
import com.zoontek.rnbootsplash.RNBootSplash
import com.zoontek.rnbars.RNBars

import mobileserver.Mobileserver

class MainActivity : ReactActivity() {
  private val ACTION_USB_PERMISSION = "ch.swissbitcoinpay.checkout.USB_PERMISSION"

  override fun onCreate(savedInstanceState: Bundle?) {
        RNBootSplash.init(this, R.style.BootTheme)
        super.onCreate(savedInstanceState)
        RNBars.init(this, "light-content", false)
    }
  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "SwissBitcoinPay"
  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onNewIntent(intent: Intent) {
    // This is only called reliably when intents are received (e.g. USB is attached or when
    // handling 'aopp:' URIs through the android.intent.action.VIEW intent) with
    // android:launchMode="singleTop"
      super.onNewIntent(intent)
      setIntent(intent) // make sure onResume will have access to this intent
  }
}