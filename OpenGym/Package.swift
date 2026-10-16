// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "OpenGym",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        // An xtool project should contain exactly one library product,
        // representing the main app.
        .library(
            name: "OpenGym",
            targets: ["OpenGym"]
        ),
        .library(
            name: "OpenGymWidget",
            targets: ["OpenGymWidget"]
        ),
    ],
    targets: [
        .target(
            name: "OpenGym",
            resources: [.copy("web")]
        ),
        .target(
            name: "OpenGymWidget",
            linkerSettings: [.unsafeFlags(["-Xlinker", "-u", "-Xlinker", "_main"])]
        ),
    ]
)
