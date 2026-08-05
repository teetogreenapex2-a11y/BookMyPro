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

        // The default colors for a programmatically-created tab bar can
        // sometimes default to black-on-black for unselected items
        // depending on the system theme, which makes them look missing.
        // Explicitly setting the brand green background and white/gray
        // tints ensures they're always visible.
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

        // Force all labels to show, which prevents the "shifting"
        // behavior that can sometimes make the layout feel jumpy or
        // hide icons if space is tight.
        tabBar.setLabelVisibilityMode(NavigationBarView.LABEL_VISIBILITY_LABELED);

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

        // The website often calls setRole() several times in quick
        // succession while a page is loading, or on every page load even
        // if the role haven't changed.
        
        boolean isValidRole = "player".equals(role) || "instructor".equals(role) || "owner".equals(role);
        
        if (!isValidRole) {
            Log.d("TabBarDebug", "Unrecognized or empty role, hiding");
            tabBar.setVisibility(View.GONE);
            // We still update these so that if the user somehow gets back
            // to a valid state, it triggers a rebuild.
            currentRole = role;
            currentSlug = slug;
            return;
        }

        // Only rebuild the menu if something actually changed, to avoid
        // flickering or inconsistent states during rapid-fire JS calls.
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

        // Even if we skipped the menu rebuild, we MUST ensure the tab bar
        // is visible and has a fresh layout pass - this handles cases
        // where it might have been briefly hidden during a transition.
        tabBar.setVisibility(View.VISIBLE);
        tabBar.requestLayout();
        tabBar.invalidate();
        if (tabBar.getParent() != null) {
            tabBar.getParent().requestLayout();
        }
    }
}
