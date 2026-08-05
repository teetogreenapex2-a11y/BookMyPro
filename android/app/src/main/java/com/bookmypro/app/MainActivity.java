package com.bookmypro.app;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.LinearLayout;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.google.android.material.navigation.NavigationBarView;
import android.content.res.ColorStateList;
import android.graphics.Color;

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

        // Configure WebView settings to support modern app data syncing,
        // window management, and fresh content loading.
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true); // Critical for saving state locally
        settings.setDatabaseEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE); // Force fresh load to see settings changes
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void setRole(final String role, final String slug, final String pageKey) {
                Log.d("TabBarDebug", "setRole called with role=" + role + " slug=" + slug + " pageKey=" + pageKey);
                runOnUiThread(() -> updateTabBar(role, slug, pageKey));
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

        // Styling the Nav Bar (Ensures icons/text are always visible)
        tabBar.setBackgroundColor(Color.parseColor("#1B3A2F"));
        int[][] states = new int[][] {
            new int[] { android.R.attr.state_selected },
            new int[] { -android.R.attr.state_selected }
        };
        int[] colors = new int[] {
            Color.WHITE,
            Color.parseColor("#80FFFFFF")
        };
        ColorStateList colorStateList = new ColorStateList(states, colors);
        tabBar.setItemIconTintList(colorStateList);
        tabBar.setItemTextColor(colorStateList);

        // Force all labels to show to prevent shifting/measurement bugs
        tabBar.setLabelVisibilityMode(NavigationBarView.LABEL_VISIBILITY_LABELED);

        root.addView(tabBar, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        setContentView(root);

        tabBar.setOnItemReselectedListener(item -> {
            // Tapping the already-selected tab again is a no-op
        });

        tabClickListener = item -> {
            String path;
            int id = item.getItemId();
            boolean isInstructorRole = "instructor".equals(currentRole) || "owner".equals(currentRole);
            if (id == R.id.tab_calendar) path = "/instructor";
            else if (id == R.id.tab_customers) path = "/customers";
            else if (id == R.id.tab_videos) path = isInstructorRole ? "/instructor/videos" : "/videos";
            else if (id == R.id.tab_swingsketch) path = isInstructorRole ? "/instructor/swing-sketch" : "/swing-sketches";
            else if (id == R.id.tab_settings) path = "/settings";
            else if (id == R.id.tab_book) path = "/book";
            else path = "/";
            webView.loadUrl("https://bookmypro.app/" + currentSlug + path);
            return true;
        };
        tabBar.setOnItemSelectedListener(tabClickListener);
    }

    private BottomNavigationView.OnItemSelectedListener tabClickListener;

    private void updateTabBar(String role, String slug, String pageKey) {
        Log.d("TabBarDebug", "updateTabBar running with role=" + role + " slug=" + slug + " pageKey=" + pageKey + " currentRole=" + currentRole + " currentSlug=" + currentSlug);

        boolean isValidRole = "player".equals(role) || "instructor".equals(role) || "owner".equals(role);

        if (!isValidRole) {
            Log.d("TabBarDebug", "Unrecognized or empty role, hiding");
            tabBar.setVisibility(View.GONE);
            currentRole = role;
            currentSlug = slug;
            return;
        }

        // Only rebuild the menu items if the role/slug actually changed
        if (!role.equals(currentRole) || !slug.equals(currentSlug)) {
            currentRole = role;
            currentSlug = slug;
            tabBar.getMenu().clear();
            if ("player".equals(role)) {
                tabBar.inflateMenu(R.menu.player_tabs);
            } else {
                tabBar.inflateMenu(R.menu.instructor_tabs);
            }
            Log.d("TabBarDebug", "Menu rebuilt, now has " + tabBar.getMenu().size() + " items");
        }

        // Keeps the highlighted tab matching whichever page is actually on
        // screen, even when someone got there some other way than tapping
        // a tab directly (a "\u2190 Back" link, the system back button).
        // Detaching the listener first is what stops this from re-firing
        // a page load of its own - setSelectedItemId() normally triggers
        // the same click handler a real tap would, which would otherwise
        // send the WebView back to whatever page it's already showing,
        // over and over.
        int targetId = getTabIdForPageKey(pageKey);
        if (targetId != 0 && tabBar.getSelectedItemId() != targetId) {
            tabBar.setOnItemSelectedListener(null);
            tabBar.setSelectedItemId(targetId);
            tabBar.setOnItemSelectedListener(tabClickListener);
        }

        // ALWAYS ensure visibility and layout pass (Fixes disappearing bar on nav back)
        tabBar.setVisibility(View.VISIBLE);
        tabBar.requestLayout();
        tabBar.invalidate();
        if (tabBar.getParent() != null) {
            tabBar.getParent().requestLayout();
        }
    }

    private int getTabIdForPageKey(String pageKey) {
        if (pageKey == null) return 0;
        switch (pageKey) {
            case "calendar": return R.id.tab_calendar;
            case "customers": return R.id.tab_customers;
            case "videos": return R.id.tab_videos;
            case "swingsketch": return R.id.tab_swingsketch;
            case "settings": return R.id.tab_settings;
            case "book": return R.id.tab_book;
            default: return 0;
        }
    }
}
