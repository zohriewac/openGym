import WebKit
import WidgetKit

/// JS posts the widget snapshot (a JSON string); we park it in the App Group for the widget extension.
final class WidgetBridge: NSObject, WKScriptMessageHandler {
    static let shared = WidgetBridge()

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let json = m.body as? String else { return }
        UserDefaults(suiteName: "group.com.zohriewac.opengym")?.set(json, forKey: "snapshot")
        WidgetCenter.shared.reloadAllTimelines()
    }
}
