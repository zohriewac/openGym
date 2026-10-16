import HealthKit
import WebKit

/// Read-only Apple Health bridge: JS calls `webkit.messageHandlers.health.postMessage({days})`
/// and gets body weight (kg) and resting heart rate (bpm) samples, newest per sample, by day.
final class HealthBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let shared = HealthBridge()
    private let store = HKHealthStore()
    private let mass = HKQuantityType(.bodyMass)
    private let rhr = HKQuantityType(.restingHeartRate)

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage,
                               replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else { return replyHandler(["status": "unavailable"], nil) }
        let days = (m.body as? [String: Any])?["days"] as? Int ?? 90
        Task { @MainActor in
            do {
                try await store.requestAuthorization(toShare: [], read: [mass, rhr])
                let since = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
                let w = try await samples(mass, since, .gramUnit(with: .kilo))
                let h = try await samples(rhr, since, HKUnit.count().unitDivided(by: .minute()))
                replyHandler(["status": "ok",
                              "weights": w.map { ["d": $0.d, "kg": $0.v, "t": $0.t] as [String: Any] },
                              "restingHr": h.map { ["d": $0.d, "bpm": $0.v, "t": $0.t] as [String: Any] }], nil)
            } catch { replyHandler(nil, error.localizedDescription) }
        }
    }

    private func samples(_ type: HKQuantityType, _ since: Date, _ unit: HKUnit) async throws
        -> [(d: String, v: Double, t: Int)] {
        let pred = HKQuery.predicateForSamples(withStart: since, end: nil)
        let q = HKSampleQueryDescriptor(predicates: [.quantitySample(type: type, predicate: pred)],
                                        sortDescriptors: [SortDescriptor(\.endDate)])
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return try await q.result(for: store).map {
            (f.string(from: $0.endDate), $0.quantity.doubleValue(for: unit), Int($0.endDate.timeIntervalSince1970 * 1000))
        }
    }
}
