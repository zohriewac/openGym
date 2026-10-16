import WebKit
import UIKit

/// JS posts 'tick' (a number passed on the rep wheel) or 'commit' (a value picked); we answer with the Taptic Engine.
// @MainActor: feedback generators are main-actor types (Swift 6); WebKit delivers messages on main.
@MainActor
final class HapticBridge: NSObject, WKScriptMessageHandler {
    static let shared = HapticBridge()

    private let selection = UISelectionFeedbackGenerator()
    private let impact = UIImpactFeedbackGenerator(style: .light)

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        switch m.body as? String {
        case "tick":
            selection.selectionChanged()
            selection.prepare()
        case "commit":
            impact.impactOccurred()
            impact.prepare()
        default:
            break
        }
    }
}
