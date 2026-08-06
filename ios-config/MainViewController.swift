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

    override func viewDidLoad() {
        super.viewDidLoad()

        guard let webView = self.bridge?.webView else { return }

        // Bridges the gap between Android's addJavascriptInterface
        // (which lets JavaScript call native methods directly with real
        // arguments) and how WKWebView actually works on iOS (JavaScript
        // can only ever post a single message object to a named
        // handler). This small injected script recreates the exact same
        // window.AndroidTabBar.setRole(role, slug, pageKey) / .hide()
        // interface the website already calls, translating each call
        // into the message format this handler expects below.
        let bridgeScript = """
        window.AndroidTabBar = {
          setRole: function(role, slug, pageKey) {
            window.webkit.messageHandlers.iosTabBar.postMessage({action: 'setRole', role: role, slug: slug, pageKey: pageKey});
          },
          hide: function() {
            window.webkit.messageHandlers.iosTabBar.postMessage({action: 'hide'});
          }
        };
        """
        let userScript = WKUserScript(source: bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        webView.configuration.userContentController.addUserScript(userScript)
        webView.configuration.userContentController.add(self, name: "iosTabBar")

        // Re-parent the existing WebView into a vertical stack with the
        // tab bar below it, rather than trying to replace Capacitor's
        // own view hierarchy outright.
        webView.removeFromSuperview()

        let stack = UIStackView()
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        webView.translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(webView)

        tabBar.delegate = self
        tabBar.isHidden = true // hidden until the website tells us who's signed in
        tabBar.barTintColor = UIColor(red: 0x1B/255, green: 0x3A/255, blue: 0x2F/255, alpha: 1)
        tabBar.tintColor = .white
        tabBar.unselectedItemTintColor = UIColor.white.withAlphaComponent(0.6)
        tabBar.isTranslucent = false
        stack.addArrangedSubview(tabBar)
    }

    // MARK: - Receiving messages from the website's own JavaScript

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        if action == "hide" {
            tabBar.isHidden = true
            return
        }

        if action == "setRole" {
            let role = body["role"] as? String ?? ""
            let slug = body["slug"] as? String ?? ""
            let pageKey = body["pageKey"] as? String ?? ""
            updateTabBar(role: role, slug: slug, pageKey: pageKey)
        }
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
