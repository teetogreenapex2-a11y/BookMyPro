package com.bookmypro.app;

import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // The app loads the real, live website directly rather than a
        // locally bundled copy, which means if the device has no
        // connection, the WebView's own attempt to load bookmypro.app
        // fails before any of the website's own JavaScript ever gets a
        // chance to run - a fix built inside the website itself can't
        // catch that moment. This extends Capacitor's own WebViewClient
        // (rather than replacing it outright, which would break plugin
        // communication) to catch exactly that failure and swap in a
        // real, branded offline page bundled locally inside the app
        // itself, instead of Android's own generic "can't load this
        // page" browser error screen.
        this.bridge.getWebView().setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // isForMainFrame matters here - without it, a failed
                // sub-resource (an image, a tracking script, anything
                // secondary) would trigger this same callback and wipe out
                // an already-working page for no real reason.
                if (request.isForMainFrame()) {
                    view.loadUrl("file:///android_asset/public/offline.html");
                } else {
                    super.onReceivedError(view, request, error);
                }
            }
        });
    }
}
