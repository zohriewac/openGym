import WebKit

/// HTTP from native code for the Coach's provider calls: JS calls
/// `webkit.messageHandlers.http.postMessage({url, method, headers, body, timeout})` and gets
/// `{status, body}`. The WebView's own fetch runs from app://local, where a provider without CORS
/// for that origin is refused before the request leaves; URLSession has no such rule.
final class HttpBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let shared = HttpBridge()

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage,
                               replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        guard let b = m.body as? [String: Any], let s = b["url"] as? String, let url = URL(string: s),
              url.scheme == "https" || url.scheme == "http" else { return replyHandler(nil, "bad request") }
        var req = URLRequest(url: url)
        req.httpMethod = b["method"] as? String ?? "GET"
        req.timeoutInterval = b["timeout"] as? Double ?? 300
        for (k, v) in b["headers"] as? [String: String] ?? [:] { req.setValue(v, forHTTPHeaderField: k) }
        if let body = b["body"] as? String { req.httpBody = body.data(using: .utf8) }
        Task { @MainActor in
            do {
                let (data, res) = try await URLSession.shared.data(for: req)
                replyHandler(["status": (res as? HTTPURLResponse)?.statusCode ?? 0,
                              "body": String(decoding: data, as: UTF8.self)], nil)
            } catch { replyHandler(nil, error.localizedDescription) }
        }
    }
}
