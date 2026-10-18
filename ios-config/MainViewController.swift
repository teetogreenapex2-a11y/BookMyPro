import UIKit
import Capacitor
import WebKit

// The iOS equivalent of the native tab bar built for Android tonight -
// same real, native UI at the bottom of the screen, not a web page
// pretending to be one, and it deliberately reuses the exact same
// window.AndroidTabBar JavaScript interface the website's own
// TabBarSync code already calls, so nothing on the website side needed
// to change at all to support this second platform. The name itself is
// a holdover from where this started (Android only) - functionally it
// now serves both platforms identically.
class MainViewController: CAPBridgeViewController, UITabBarDelegate, WKScriptMessageHandler {

    private let tabBar = UITabBar()
    private var currentSlug = ""
    private var currentRole = ""
    // Dynamic ("four tabs plus More") mode, driven by the website.
    private var dynamicMode = false
    private var dynamicJson = ""
    private var dynamicPaths: [Int: String] = [:]
    private var dynamicKeys: [String] = []
    private var activeTag = 1
    private let moreTag = 100

    override func viewDidLoad() {
        super.viewDidLoad()

        // Rather than trying to move the existing webview into a new
        // container (which crashed - the real, actual cause turned out
        // to be a circular view hierarchy, since Capacitor's own webview
        // may already effectively be this view controller's own root
        // view, not a separate child inside it), the tab bar is instead
        // added as its own independent layer on top of the existing
        // screen, pinned to the bottom. Simpler and safer, since it
        // doesn't touch or reshape anything Capacitor itself already set
        // up.
        tabBar.delegate = self
        tabBar.isHidden = true // hidden until the website tells us who's signed in
        tabBar.barTintColor = UIColor(red: 0x1B/255, green: 0x3A/255, blue: 0x2F/255, alpha: 1)
        tabBar.tintColor = .white
        tabBar.unselectedItemTintColor = UIColor.white.withAlphaComponent(0.6)
        tabBar.isTranslucent = false
        tabBar.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(tabBar)
        NSLayoutConstraint.activate([
            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    // Capacitor calls this specifically before the webview's first page
    // load ever begins and before it's even added to the screen - the
    // real reason the tab bar never showed up at all the first time
    // around was that this same setup was happening inside viewDidLoad()
    // instead, which can run too late: the very first page load may
    // already be underway by the time that code executes, meaning the
    // website's own JavaScript never had this bridge available on that
    // first load, and never actually managed to tell the native side who
    // was signed in.
    override func capacitorDidLoad() {
        guard let webView = self.bridge?.webView else { return }

        // Stops the native "rubber-band" bounce past the true top/bottom
        // of the page - a CSS-only fix (overscroll-behavior) doesn't
        // actually work inside WKWebView specifically, since iOS ignores
        // it at this native rendering level regardless of what the
        // stylesheet says. Setting both properties together is the
        // combination that's actually reliable here.
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false

        // Without this, a plain white flash briefly shows at the top
        // edge during scroll - that's the WebView's own default
        // background color showing through for an instant before the
        // page's real content renders over it, not anything about the
        // page's own CSS. Setting it to the app's actual theme color
        // directly removes that gap regardless of scroll speed or
        // timing.
        let fairway = UIColor(red: 0x1B / 255, green: 0x3A / 255, blue: 0x2F / 255, alpha: 1)
        webView.backgroundColor = fairway
        webView.scrollView.backgroundColor = fairway
        webView.isOpaque = false
        view.backgroundColor = fairway

        let bridgeScript = """
        window.AndroidTabBar = {
          setRole: function(role, slug, pageKey) {
            window.webkit.messageHandlers.iosTabBar.postMessage({action: 'setRole', role: role, slug: slug, pageKey: pageKey});
          },
          setTabs: function(json, slug, activeKey) {
            window.webkit.messageHandlers.iosTabBar.postMessage({action: 'setTabs', json: json, slug: slug, activeKey: activeKey});
          },
          hide: function() {
            window.webkit.messageHandlers.iosTabBar.postMessage({action: 'hide'});
          }
        };
        """
        let userScript = WKUserScript(source: bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        webView.configuration.userContentController.addUserScript(userScript)
        webView.configuration.userContentController.add(self, name: "iosTabBar")
    }

    // MARK: - Receiving messages from the website's own JavaScript

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        if action == "hide" {
            tabBar.isHidden = true
            return
        }

        if action == "setTabs" {
            updateDynamicTabs(json: body["json"] as? String ?? "",
                              slug: body["slug"] as? String ?? "",
                              activeKey: body["activeKey"] as? String ?? "")
            return
        }

        if action == "setRole" {
            let role = body["role"] as? String ?? ""
            let slug = body["slug"] as? String ?? ""
            let pageKey = body["pageKey"] as? String ?? ""
            updateTabBar(role: role, slug: slug, pageKey: pageKey)
        }
    }

    private func symbolFor(_ icon: String) -> String {
        switch icon {
        case "calendar": return "calendar"
        case "customers": return "person.2.fill"
        case "videos": return "video.fill"
        case "sketch": return "pencil.and.outline"
        case "settings": return "gearshape.fill"
        case "book": return "book.fill"
        case "messages": return "message.fill"
        case "shop": return "bag.fill"
        case "gift": return "gift.fill"
        case "reports": return "chart.bar.fill"
        case "team": return "person.3.fill"
        default: return "ellipsis"
        }
    }

    private func updateDynamicTabs(json: String, slug: String, activeKey: String) {
        guard !slug.isEmpty else { tabBar.isHidden = true; return }
        dynamicMode = true
        currentSlug = slug
        currentRole = "dynamic"

        if json != dynamicJson {
            guard let data = json.data(using: .utf8),
                  let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
            var items: [UITabBarItem] = []
            dynamicPaths = [:]
            dynamicKeys = []
            for (i, o) in arr.prefix(4).enumerated() {
                let tag = i + 1
                dynamicPaths[tag] = o["path"] as? String ?? "/"
                dynamicKeys.append(o["key"] as? String ?? "")
                items.append(UITabBarItem(title: o["label"] as? String ?? "",
                                          image: UIImage(systemName: symbolFor(o["icon"] as? String ?? "")),
                                          tag: tag))
            }
            items.append(UITabBarItem(title: "More", image: UIImage(systemName: "ellipsis"), tag: moreTag))
            tabBar.items = items
            dynamicJson = json
        }

        var target = moreTag
        for (i, k) in dynamicKeys.enumerated() where k == activeKey { target = i + 1; break }
        activeTag = target
        tabBar.selectedItem = tabBar.items?.first(where: { $0.tag == target })
        tabBar.isHidden = false
        view.bringSubviewToFront(tabBar)
    }

    private func updateTabBar(role: String, slug: String, pageKey: String) {
        let isValidRole = role == "player" || role == "instructor" || role == "owner"
        guard isValidRole else {
            tabBar.isHidden = true
            currentRole = role
            currentSlug = slug
            return
        }

        if role != currentRole || slug != currentSlug {
            currentRole = role
            currentSlug = slug
            tabBar.items = role == "player" ? playerTabs() : instructorTabs()
        }

        tabBar.isHidden = false
        // The webview underneath can get reordered during normal page
        // navigation, which would silently cover the tab bar even
        // though it's technically still there and correctly set to
        // visible - forcing it back to the front here, every time a
        // page changes, is a real, direct guard against exactly that.
        view.bringSubviewToFront(tabBar)

        // Keeps the highlighted tab matching whichever page is actually
        // on screen, even when someone got there some other way than
        // tapping a tab directly. Unlike Android, setting selectedItem
        // directly here doesn't itself trigger the tap delegate below,
        // so there's no risk of this causing an unwanted reload loop.
        if let items = tabBar.items {
            tabBar.selectedItem = items.first(where: { $0.tag == tagFor(pageKey: pageKey) })
        }
    }

    // MARK: - Tab definitions

    private func tagFor(pageKey: String) -> Int {
        switch pageKey {
        case "calendar": return 1
        case "customers": return 2
        case "videos": return 3
        case "swingsketch": return 4
        case "settings": return 5
        case "book": return 6
        default: return 0
        }
    }

    private func instructorTabs() -> [UITabBarItem] {
        return [
            UITabBarItem(title: "Calendar", image: UIImage(systemName: "calendar"), tag: 1),
            UITabBarItem(title: "Customers", image: UIImage(systemName: "person.2.fill"), tag: 2),
            UITabBarItem(title: "Videos", image: UIImage(systemName: "video.fill"), tag: 3),
            UITabBarItem(title: "Sketch", image: UIImage(systemName: "pencil.and.outline"), tag: 4),
            UITabBarItem(title: "Settings", image: UIImage(systemName: "gearshape.fill"), tag: 5),
        ]
    }

    private func playerTabs() -> [UITabBarItem] {
        return [
            UITabBarItem(title: "Book", image: UIImage(systemName: "book.fill"), tag: 6),
            UITabBarItem(title: "Videos", image: UIImage(systemName: "video.fill"), tag: 3),
            UITabBarItem(title: "Sketch", image: UIImage(systemName: "pencil.and.outline"), tag: 4),
            UITabBarItem(title: "Settings", image: UIImage(systemName: "gearshape.fill"), tag: 5),
        ]
    }

    // MARK: - Handling a real tap on a tab

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        if dynamicMode {
            if item.tag == moreTag {
                self.bridge?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('bmp-open-more'))", completionHandler: nil)
                // Keep the highlight on the page actually showing.
                tabBar.selectedItem = tabBar.items?.first(where: { $0.tag == activeTag })
                return
            }
            activeTag = item.tag
            if let p = dynamicPaths[item.tag], let url = URL(string: "https://bookmypro.app/\(currentSlug)\(p)") {
                self.bridge?.webView?.load(URLRequest(url: url))
            }
            return
        }

        let isInstructorRole = currentRole == "instructor" || currentRole == "owner"
        let path: String
        switch item.tag {
        case 1: path = "/instructor"
        case 2: path = "/customers"
        case 3: path = isInstructorRole ? "/instructor/videos" : "/videos"
        case 4: path = isInstructorRole ? "/instructor/swing-sketch" : "/swing-sketches"
        case 5: path = "/settings"
        case 6: path = "/book"
        default: path = "/"
        }
        if let url = URL(string: "https://bookmypro.app/\(currentSlug)\(path)") {
            self.bridge?.webView?.load(URLRequest(url: url))
        }
    }
}
