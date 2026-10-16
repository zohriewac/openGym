import SwiftUI
import WebKit
import UniformTypeIdentifiers

// Serves the bundled openGym mobile build over app://local/ so ES modules, fetch and
// localStorage work. Everything stays on the device: no network, no server.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    let root = Bundle.module.resourceURL!.appendingPathComponent("web")

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path.isEmpty || url.path == "/" ? "/index.html" : url.path
        var file = root.appendingPathComponent(path.removingPercentEncoding ?? path)
        // SPA fallback for client-side routes
        if !FileManager.default.fileExists(atPath: file.path) { path = "/index.html"; file = root.appendingPathComponent("index.html") }
        guard let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            task.didFailWithError(URLError(.fileDoesNotExist)); return
        }
        let mime = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        var status = 200
        var body = data
        var headers = ["Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "no-cache"]
        // Safari-family media players require byte-range answers for video.
        if let range = task.request.value(forHTTPHeaderField: "Range"), range.hasPrefix("bytes="),
           data.count > 0 {
            let parts = range.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
            let start = Int(parts.first ?? "") ?? 0
            let end = min(Int(parts.count > 1 ? parts[1] : "") ?? data.count - 1, data.count - 1)
            if start <= end {
                body = data.subdata(in: start..<(end + 1)); status = 206
                headers["Content-Range"] = "bytes \(start)-\(end)/\(data.count)"
            }
        }
        headers["Content-Length"] = String(body.count)
        task.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(body)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

struct WebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "app")
        cfg.userContentController.addScriptMessageHandler(HealthBridge.shared, contentWorld: .page, name: "health")
        cfg.userContentController.add(WidgetBridge.shared, contentWorld: .page, name: "widget")
        cfg.userContentController.addScriptMessageHandler(HttpBridge.shared, contentWorld: .page, name: "http")
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: cfg)
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.047, green: 0.055, blue: 0.071, alpha: 1)
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.load(URLRequest(url: URL(string: "app://local/")!))
        return view
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct ContentView: View {
    var body: some View {
        WebView().ignoresSafeArea().background(Color(red: 0.047, green: 0.055, blue: 0.071))
    }
}
