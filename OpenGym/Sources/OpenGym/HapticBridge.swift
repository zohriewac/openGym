import WebKit
import UIKit

/// JS posts 'tick' (a number passed on the rep wheel) or 'commit' (a value picked); we answer with the Taptic Engine.
final class HapticBridge: NSObject, WKScriptMessageHandler {
    static let shared = HapticBridge()

    private let selection = UISelectionFeedbackGenerator()
    private let impact = UIImpactFeedbackGenerator(style: .light)

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let kind = m.body as? String else { return }
        DispatchQueue.main.async {
            switch kind {
            case "tick":
                self.selection.selectionChanged()
                self.selection.prepare()
            case "commit":
                self.impact.impactOccurred()
                self.impact.prepare()
            default:
                break
            }
        }
    }
}
