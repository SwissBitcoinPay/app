package ch.swissbitcoinpay.checkout;

import android.content.Context;
import android.content.BroadcastReceiver;
import android.webkit.JavascriptInterface;
import android.content.ComponentName;
import android.app.PendingIntent;
import android.content.IntentFilter;
import android.content.Intent;
import android.content.ServiceConnection;
import android.hardware.usb.UsbDevice;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Message;
import android.os.IBinder;
import android.annotation.SuppressLint;
import android.hardware.usb.UsbManager;
import android.util.Log;
import android.app.Activity;
import android.webkit.WebView;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.io.InputStream;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import android.util.Base64;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.BufferedWriter;
import java.io.OutputStreamWriter;
import java.io.OutputStream;
import java.net.HttpURLConnection;

import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Observer;
import androidx.lifecycle.ViewModelStoreOwner;
import androidx.lifecycle.ViewModelProvider;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.regex.Pattern;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import ch.swissbitcoinpay.checkout.R;

import com.facebook.react.bridge.LifecycleEventListener;


import mobileserver.Mobileserver;

public class BitBoxBridgeModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
    private Context context;

    BitBoxBridgeModule(ReactApplicationContext context) {
        super(context);
        this.context = context;

        context.addLifecycleEventListener(this);
        context.addActivityEventListener(new BaseActivityEventListener() {
            @Override
            public void onNewIntent(Intent intent) {
                // This is only called reliably when intents are received (e.g. USB is attached or when
                // handling 'aopp:' URIs through the android.intent.action.VIEW intent) with
                // android:launchMode="singleTop"
                super.onNewIntent(intent);

                Activity currentActivity = getCurrentActivity();
                if (currentActivity != null) {
                    currentActivity.setIntent(intent);
                }
                // Activity currentActivity = getCurrentActivity();
                // currentActivity.setIntent(intent); // make sure onResume will have access to this intent
            }
        });
    }

    private static final String ACTION_USB_PERMISSION = "ch.swissbitcoinpay.checkout.USB_PERMISSION";
    GoService goService;

    protected static final String JAVASCRIPT_INTERFACE = "sbp_bitbox_android";

    // Connection to bind with GoService
    private ServiceConnection connection = new ServiceConnection() {

        @Override
        public void onServiceConnected(ComponentName className,
                                       IBinder service) {
            GoService.GoServiceBinder binder = (GoService.GoServiceBinder) service;
            goService = binder.getService();
            startServer();
        }

        @Override
        public void onServiceDisconnected(ComponentName arg0) {
            goService = null;
        }
    };

    @Override
    public String getName() {
        return "BitBoxBridge";
    }

    @ReactMethod
    public void startBitBoxBridge(Promise promise) {
        try {
            Util.log("Starting server...");

            Activity currentActivity = getCurrentActivity();

            if (currentActivity == null) {
                Util.log("No current activity available");
                return;
            }

            // The backend is run inside GoService, to avoid (as much as possible) latency errors due to
            // the scheduling when the app is out of focus.
            Intent intent = new Intent(currentActivity, GoService.class);

            currentActivity.bindService(intent, connection, Context.BIND_AUTO_CREATE);
            Util.log("BitBoxBridge service started...");
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("Error", e);
        }
    }

    private void startServer() {
        Activity currentActivity = getCurrentActivity();

        final GoViewModel gVM = new ViewModelProvider((ViewModelStoreOwner) currentActivity).get(GoViewModel.class);

        var id = R.id.sbp_bitbox_webview;

        final WebView vw = currentActivity.findViewById(id);

        gVM.setMessageHandlers(
                new Handler() {
                    @Override
                    public void handleMessage(final Message msg) {
                        final GoViewModel.Response response = (GoViewModel.Response) msg.obj;
                        var gson = new Gson();
                        var value = response.response;

                        String finalString = ((value instanceof String) && (!value.equals("{}"))) ? value.trim().replace("\\n", "\\\\n").replace("'", "\\'") : gson.toJson(value).replace("\\n", "");

                        vw.evaluateJavascript("window.ReactNativeWebView.postMessage('{ \"queryID\": " + response.queryID + ", \"data\": " + finalString + " }');", null);
                    }
                },
                new Handler() {
                    @Override
                    public void handleMessage(final Message msg) {
                        vw.evaluateJavascript("window.ReactNativeWebView.postMessage('{ \"data\": " + (String)(msg.obj) + " }');", null);
                    }
                }
        );

        vw.clearCache(true);
        vw.clearHistory();
        vw.getSettings().setJavaScriptEnabled(true);
        vw.getSettings().setAllowUniversalAccessFromFileURLs(true);
        vw.getSettings().setAllowFileAccess(true);

        var url = vw.getUrl();

        vw.addJavascriptInterface(new JavascriptBridge(), JAVASCRIPT_INTERFACE);
        vw.reload();

        // We call updateDevice() here in case the app was started while the device was already connected.
        // In that case, handleIntent() is not called with ACTION_USB_DEVICE_ATTACHED.
        this.updateDevice();

        if (goService == null) {
            Util.log("goService is not defined");
        }

        goService.startServer(this.context.getApplicationContext().getFilesDir().getAbsolutePath(), gVM.getGoEnvironment(), gVM.getGoAPI());
    }

    protected class JavascriptBridge {
        JavascriptBridge() {}

        @JavascriptInterface
        public void call(int queryID, String query) {
            Util.log("call(" + query + ")");
            Mobileserver.backendCall(queryID, query);
        }
    }
    
    private void updateDevice() {
        Activity currentActivity = getCurrentActivity();

        // Triggered by usb device attached intent and usb device detached broadcast events.
        final GoViewModel goViewModel = new ViewModelProvider((ViewModelStoreOwner) currentActivity).get(GoViewModel.class);
        // final GoViewModel goViewModel = ViewModelProviders.of(this).get(GoViewModel.class);
        goViewModel.setDevice(null);
        UsbManager manager = (UsbManager) this.context.getApplicationContext().getSystemService(Context.USB_SERVICE);
        HashMap<String, UsbDevice> deviceList = manager.getDeviceList();
        Iterator<UsbDevice> deviceIterator = deviceList.values().iterator();
        while (deviceIterator.hasNext()){
            UsbDevice device = deviceIterator.next();
            // One other instance where we filter vendor/product IDs is in
            // @xml/device_filter resource, which is used for USB_DEVICE_ATTACHED
            // intent to launch the app when a device is plugged and the app is still
            // closed. This filter, on the other hand, makes sure we feed only valid
            // devices to the Go backend once the app is launched or opened.
            //
            // BitBox02 Vendor ID: 0x03eb, Product ID: 0x2403.
            if (device.getVendorId() == 1003 && device.getProductId() == 9219) {
                if (manager.hasPermission(device)) {
                    goViewModel.setDevice(device);
                } else {
                    PendingIntent permissionIntent = PendingIntent.getBroadcast(currentActivity, 0, new Intent(ACTION_USB_PERMISSION), PendingIntent.FLAG_IMMUTABLE);
                    manager.requestPermission(device, permissionIntent);
                }
                break; // only one device supported for now
            }
        }
    }

    @Override
    public void onHostPause() {
        Util.log("lifecycle: onHostPause");
        Activity currentActivity = getCurrentActivity();

        currentActivity.unregisterReceiver(this.usbStateReceiver);
    }

    @Override
    public void onHostDestroy() {
        Util.log("lifecycle: onHostDestroy");
        if (this.goService != null) {
            Activity currentActivity = getCurrentActivity();
            currentActivity.unbindService(this.connection);
            Mobileserver.shutdown();
        }
    }

    @Override
    public void onHostResume() {
        Util.log("lifecycle: onHostResume");
        Mobileserver.triggerAuth();

        IntentFilter filter = new IntentFilter();
        Activity currentActivity = getCurrentActivity();
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        filter.addAction(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            currentActivity.registerReceiver(this.usbStateReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            currentActivity.registerReceiver(this.usbStateReceiver, filter);
        }

        Intent intent = currentActivity.getIntent();
        handleIntent(intent);
    }
    
    private void handleIntent(Intent intent) {
        if (intent.getAction().equals(ACTION_USB_PERMISSION)) {
            // See https://developer.android.com/guide/topics/connectivity/usb/host#permission-d
            synchronized (this) {
                UsbDevice device = (UsbDevice) intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                    if (device != null) {
                        Util.log("usb: permission granted");
                    }
                } else {
                    Util.log("usb: permission denied");
                }
            }
        }
        if (intent.getAction().equals(UsbManager.ACTION_USB_DEVICE_ATTACHED)) {
            this.updateDevice();
        }
        if (intent.getAction().equals(UsbManager.ACTION_USB_DEVICE_DETACHED)) {
            this.updateDevice();
        }
    }

    private final BroadcastReceiver usbStateReceiver = new BroadcastReceiver() {
        public void onReceive(Context context, Intent intent) {
            handleIntent(intent);
        }
    };

    private BroadcastReceiver networkStateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            Mobileserver.usingMobileDataChanged();
         }
    };
}