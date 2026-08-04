package com.bookmypro.app;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.LinearLayout;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.google.android.material.bottomnavigation.BottomNavigationView;

public class MainActivity extends BridgeActivity {
    private BottomNavigationView tabBar;
    private String currentSlug = "";
    private String currentRole = "";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = this.bridge.getWebView();

        // The app loads the real, live website directly rather than a
        // locally bundled copy, which means if the device has no
        // connection, the WebView's own attempt to load bookmypro.app
        // fails before any of the website's own JavaScript ever gets a
        // chance to run. This extends Capacitor's own WebViewClient
        // (rather than replacing it outright, which would break plugin
        // communication) to catch exactly that failure and swap in a
        // real, branded offline page bundled locally inside the app.
        webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    view.loadUrl("file:///android_asset/public/offline.html");
                } else {
                    super.onReceivedError(view, request, error);
                }
            }
        });

        // A real native bottom tab bar, sitting outside the WebView
        // rather than being part of the website itself - genuinely native
        // navigation, not a web page pretending to be one. The native
        // side has no inherent way to know who's signed in or which
        // business is active, since that only exists in the website's own
        // session - so this exposes a small bridge the website's own
        // JavaScript calls once it knows that, telling the native layer
        // which role's tab set to show and which business slug to
        // navigate within.
        webView.getSettings().setJavaScriptEnabled(true);
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void setRole(final String role, final String slug) {
                Log.d("TabBarDebug", "setRole called with role=" + role + " slug=" + slug);
                runOnUiThread(() -> updateTabBar(role, slug));
            }

            @JavascriptInterface
            public void hide() {
                runOnUiThread(() -> tabBar.setVisibility(View.GONE));
            }
        }, "AndroidTabBar");

        // Re-parent the existing WebView into a new vertical layout with
        // the tab bar below it, rather than trying to replace Capacitor's
        // own content view outright, which risks breaking things the
        // Bridge itself depends on.
        ViewGroup originalParent = (ViewGroup) webView.getParent();
        if (originalParent != null) {
            originalParent.removeView(webView);
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.addView(webView, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        tabBar = new BottomNavigationView(this);
        tabBar.setVisibility(View.GONE); // hidden until the website tells us who's signed in
        root.addView(tabBar, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        setContentView(root);

        tabBar.setOnItemReselectedListener(item -> {
            // Tapping the already-selected tab again is a no-op, rather
            // than reloading the same page and losing whatever the person
            // was doing on it.
        });

        tabBar.setOnItemSelectedListener(item -> {
            String path;
            int id = item.getItemId();
            if (id == R.id.tab_calendar) path = "/instructor";
            else if (id == R.id.tab_customers) path = "/customers";
            else if (id == R.id.tab_videos) path = "/videos";
            else if (id == R.id.tab_swingsketch) path = "/swing-sketches";
            else if (id == R.id.tab_settings) path = "/settings";
            else if (id == R.id.tab_book) path = "/book";
            else path = "/";
            webView.loadUrl("https://bookmypro.app/" + currentSlug + path);
            return true;
        });
    }

    private void updateTabBar(String role, String slug) {
        Log.d("TabBarDebug", "updateTabBar running with role=" + role + " slug=" + slug + " currentRole=" + currentRole + " currentSlug=" + currentSlug);
        // The website can genuinely call setRole several times in quick
        // succession while a page is first loading (its own session state
        // typically moves through a "loading" phase before settling) -
        // without this guard, several back-to-back menu rebuilds on the
        // same tab bar view can leave it in an inconsistent state, which
        // is exactly the "some tabs missing" symptom this was causing.
        // Skipping the rebuild entirely when nothing has actually changed
        // makes repeated calls harmless instead of risky.
        if (role.equals(currentRole) && slug.equals(currentSlug)) {
            Log.d("TabBarDebug", "Skipped - nothing changed");
            return;
        }
        currentRole = role;
        currentSlug = slug;
        tabBar.getMenu().clear();
        if ("player".equals(role)) {
            tabBar.inflateMenu(R.menu.player_tabs);
        } else if ("instructor".equals(role) || "owner".equals(role)) {
            tabBar.inflateMenu(R.menu.instructor_tabs);
        } else {
            // An unrecognized or missing role (e.g. someone still on the
            // sign-in page, before any membership exists yet) - stay
            // hidden rather than show tabs that might not make sense yet.
            Log.d("TabBarDebug", "Unrecognized role, hiding");
            tabBar.setVisibility(View.GONE);
            return;
        }
        Log.d("TabBarDebug", "Menu now has " + tabBar.getMenu().size() + " items");
        tabBar.setVisibility(View.VISIBLE);
    }
}
