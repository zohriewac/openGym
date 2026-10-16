import Charts
import SwiftUI
import WidgetKit

@main struct OpenGymWidgetBundle: WidgetBundle {
    var body: some Widget {
        OpenGymWidget()
        ProgressWidget()
    }
}

// MARK: snapshot (written by the app's WidgetBridge, see frontend widget sync)

struct Snapshot: Codable {
    struct Next: Codable { var name: String; var on: String }
    struct Week: Codable { var done: Int; var planned: Int; var start: String }
    struct Progress: Codable { var pct: Double; var points: [Double] }
    var next: Next?
    var week: Week
    var progress: Progress?

    static let sample = Snapshot(next: .init(name: "Push A", on: "2026-10-16"),
                                 week: .init(done: 3, planned: 4, start: "2026-10-12"),
                                 progress: .init(pct: 3.0, points: [100, 100.6, 101.2, 100.9, 101.8, 102.4, 102.1, 103.0]))

    static let empty = Snapshot(next: nil, week: .init(done: 0, planned: 0, start: "1970-01-01"), progress: nil)

    /// nil when missing or corrupt (first install, before the app ran): callers fall back to a placeholder.
    static func load() -> Snapshot? {
        guard let s = UserDefaults(suiteName: "group.com.zohriewac.opengym")?.string(forKey: "snapshot") else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: Data(s.utf8))
    }
}

private func parse(_ s: String) -> Date? {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = .current
    return f.date(from: s)
}

/// "Today"/"Tomorrow"/weekday from the current date; nil if `on` is already past (stale snapshot).
func dayLabel(_ on: String, today: Date) -> String? {
    guard let d = parse(on) else { return nil }
    let cal = Calendar.current
    let n = cal.dateComponents([.day], from: cal.startOfDay(for: today), to: cal.startOfDay(for: d)).day ?? -1
    if n < 0 { return nil }
    if n == 0 { return "Today" }
    if n == 1 { return "Tomorrow" }
    return d.formatted(.dateTime.weekday(.abbreviated))
}

/// Done count, reset to 0 once the snapshot's week is over.
func weekDone(_ s: Snapshot, today: Date) -> Int {
    guard let start = parse(s.week.start),
          let end = Calendar.current.date(byAdding: .day, value: 7, to: start) else { return s.week.done }
    return today >= end ? 0 : s.week.done
}

// MARK: widget

struct Entry: TimelineEntry {
    var date = Date()
    var snap: Snapshot?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(snap: .sample) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(snap: context.isPreview ? .sample : Snapshot.load() ?? .empty))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let snap = Snapshot.load() ?? .empty
        let now = Date()
        let midnight = Calendar.current.nextDate(after: now, matching: DateComponents(hour: 0), matchingPolicy: .nextTime)
        completion(Timeline(entries: [Entry(date: now, snap: snap)] + (midnight.map { [Entry(date: $0, snap: snap)] } ?? []),
                            policy: .atEnd))
    }
}

struct OpenGymWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "OpenGymWidget", provider: Provider()) { entry in
            WidgetView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("openGym")
        .description("Next workout, this week, and your lift progress.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct WidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry

    var snap: Snapshot { entry.snap ?? .empty }
    var name: String { snap.next?.name ?? "No plan" }
    var day: String? { snap.next.flatMap { dayLabel($0.on, today: entry.date) } }
    var done: Int { weekDone(snap, today: entry.date) }
    var planned: Int { snap.week.planned }
    var pct: Double? { snap.progress?.pct }

    var body: some View {
        switch family {
        case .accessoryCircular:
            Gauge(value: Double(done), in: 0...Double(max(planned, 1))) { EmptyView() } currentValueLabel: {
                Text("\(done)/\(planned)")
            }.gaugeStyle(.accessoryCircularCapacity)
        case .accessoryRectangular:
            VStack(alignment: .leading) {
                Text(name).bold()
                Text([day, "\(done)/\(planned)"].compactMap { $0 }.joined(separator: " · "))
                if let p = pct { Text("\(progressArrow(p)) \(p.formatted(.number.precision(.fractionLength(1))))% 8 wk") }
            }.frame(maxWidth: .infinity, alignment: .leading)
        case .accessoryInline:
            Text([name, "\(done)/\(planned)", pct.map { "\(progressArrow($0))\($0.formatted(.number.precision(.fractionLength(1))))%" }]
                .compactMap { $0 }.joined(separator: " · "))
        default:
            VStack(alignment: .leading, spacing: 2) {
                Text("NEXT").font(.caption2).foregroundStyle(.secondary)
                Text(name).font(.headline).lineLimit(1)
                if let day { Text(day).font(.subheadline).foregroundStyle(.secondary) }
                Text("\(done)/\(planned) this week").font(.caption)
                Spacer(minLength: 0)
                if let pr = snap.progress, let p = pct {
                    ProgressChart(points: pr.points, tint: progressTint(p), area: false).frame(height: 28)
                    Text("\(progressArrow(p)) \(p.formatted(.number.precision(.fractionLength(1))))%").font(.caption.bold()).foregroundStyle(progressTint(p))
                } else {
                    Text("–").foregroundStyle(.secondary)
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: avg progress widget

func progressArrow(_ p: Double) -> String { p > 0.5 ? "↑" : p < -0.5 ? "↓" : "→" }
func progressTint(_ p: Double) -> Color { p > 0.5 ? .green : p < -0.5 ? .red : .secondary }

/// The one chart implementation: line, optionally with a soft area and the dashed 100 baseline.
struct ProgressChart: View {
    let points: [Double]
    let tint: Color
    var area = false

    var body: some View {
        Chart {
            ForEach(Array(points.enumerated()), id: \.offset) { i, v in
                if area {
                    AreaMark(x: .value("i", i), y: .value("v", v)).foregroundStyle(tint.opacity(0.2)).interpolationMethod(.catmullRom)
                }
                LineMark(x: .value("i", i), y: .value("v", v)).foregroundStyle(tint).interpolationMethod(.catmullRom)
            }
            if area {
                RuleMark(y: .value("base", 100)).lineStyle(StrokeStyle(lineWidth: 1, dash: [3])).foregroundStyle(.secondary)
            }
        }
        .chartXAxis(.hidden).chartYAxis(.hidden).chartYScale(domain: .automatic(includesZero: false))
    }
}

struct ProgressWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "OpenGymProgress", provider: Provider()) { entry in
            AvgProgressView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Avg Progress")
        .description("Average estimated 1RM of your top lifts over 8 weeks.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}

struct AvgProgressView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry

    var body: some View {
        if let pr = entry.snap?.progress, pr.points.count >= 2 {
            let p = pr.pct
            let txt = "\(progressArrow(p)) \(p.formatted(.number.precision(.fractionLength(1))))%"
            if family == .accessoryRectangular {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Avg Progress \(txt)").bold()
                    ProgressChart(points: pr.points, tint: .primary)
                }.frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Text("AVG PROGRESS").font(.caption2).foregroundStyle(.secondary)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(txt).font(.title2.bold()).foregroundStyle(progressTint(p))
                        Text("8 wk").font(.caption).foregroundStyle(.secondary)
                    }
                    ProgressChart(points: pr.points, tint: progressTint(p), area: true)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            VStack(alignment: .leading, spacing: 2) {
                Text("Avg Progress").bold()
                Text("Log a lift twice to see your trend").font(.caption).foregroundStyle(.secondary)
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
