// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FocusSetup",
    platforms: [.iOS("26.0")],
    products: [.library(name: "FocusSetup", targets: ["FocusSetup"])],
    targets: [.target(name: "FocusSetup", path: "host", exclude: ["ViewController.swift"], resources: [.process("Resources")])]
)
