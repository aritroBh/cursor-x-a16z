// ax-dump: walks the macOS Accessibility tree of a target app and emits a
// compact JSON list of elements with screen-space bounds. Used by Specter to
// drive pixel-perfect cursor targeting without relying on a vision model's
// pixel guess.
//
// Build:   xcrun swiftc -framework Cocoa ax-dump.swift -o ax-dump
// Usage:   ax-dump <bundle-id|app-name>

import Cocoa
import ApplicationServices

let args = CommandLine.arguments
let target: String

func findApp(_ identifier: String) -> NSRunningApplication? {
    if let app = NSRunningApplication.runningApplications(withBundleIdentifier: identifier).first {
        return app
    }
    let workspace = NSWorkspace.shared
    for app in workspace.runningApplications {
        if app.bundleIdentifier == identifier { return app }
        if app.localizedName == identifier { return app }
    }
    return nil
}

let app: NSRunningApplication
if args.count >= 2 {
    target = args[1]
    guard let resolved = findApp(target) else {
        FileHandle.standardError.write("not-found:\(target)\n".data(using: .utf8)!)
        exit(3)
    }
    app = resolved
} else {
    // No arg = walk the frontmost app, mirroring the PowerShell helper's
    // GetForegroundWindow default. Keeps the cross-platform interface symmetrical.
    guard let frontmost = NSWorkspace.shared.frontmostApplication else {
        FileHandle.standardError.write("no-frontmost-app\n".data(using: .utf8)!)
        exit(4)
    }
    target = frontmost.bundleIdentifier ?? frontmost.localizedName ?? "unknown"
    app = frontmost
}

let pid = app.processIdentifier
let axApp = AXUIElementCreateApplication(pid)

func axGet(_ elem: AXUIElement, _ attr: String) -> CFTypeRef? {
    var ref: CFTypeRef?
    let err = AXUIElementCopyAttributeValue(elem, attr as CFString, &ref)
    return err == .success ? ref : nil
}

func axCGPoint(_ ref: CFTypeRef) -> CGPoint {
    var pt = CGPoint.zero
    if CFGetTypeID(ref) == AXValueGetTypeID() {
        AXValueGetValue(ref as! AXValue, .cgPoint, &pt)
    }
    return pt
}

func axCGSize(_ ref: CFTypeRef) -> CGSize {
    var sz = CGSize.zero
    if CFGetTypeID(ref) == AXValueGetTypeID() {
        AXValueGetValue(ref as! AXValue, .cgSize, &sz)
    }
    return sz
}

// Roles where we always want to surface the element to the picker. Other
// elements are still emitted but flagged actionable=false so the model can
// down-weight them.
let actionableRoles: Set<String> = [
    "AXButton", "AXLink", "AXMenuItem", "AXMenuButton", "AXMenu",
    "AXCheckBox", "AXRadioButton", "AXTextField", "AXTextArea",
    "AXTab", "AXTabGroup", "AXPopUpButton", "AXSlider", "AXSwitch",
    "AXSearchField", "AXComboBox", "AXCell", "AXRow", "AXOutline",
    "AXImage", "AXStaticText", "AXGroup", "AXToolbar", "AXSheet",
    "AXDisclosureTriangle", "AXIncrementor", "AXDecrementor",
]

let MAX_ELEMENTS = 4000
let MAX_DEPTH = 80

struct Out {
    let i: Int
    let role: String
    let title: String
    let desc: String
    let value: String
    let x: Double
    let y: Double
    let w: Double
    let h: Double
    let depth: Int
    let actionable: Bool
}

var elements: [Out] = []
var idx = 0

func walk(_ elem: AXUIElement, depth: Int) {
    if elements.count >= MAX_ELEMENTS { return }
    if depth > MAX_DEPTH { return }

    let role = (axGet(elem, kAXRoleAttribute as String) as? String) ?? ""
    let title = (axGet(elem, kAXTitleAttribute as String) as? String) ?? ""
    let desc = (axGet(elem, kAXDescriptionAttribute as String) as? String) ?? ""
    let valueRaw = axGet(elem, kAXValueAttribute as String)
    let value = (valueRaw as? String) ?? ""

    var x = 0.0, y = 0.0, w = 0.0, h = 0.0
    if let posRef = axGet(elem, kAXPositionAttribute as String) {
        let p = axCGPoint(posRef); x = Double(p.x); y = Double(p.y)
    }
    if let sizeRef = axGet(elem, kAXSizeAttribute as String) {
        let s = axCGSize(sizeRef); w = Double(s.width); h = Double(s.height)
    }

    let actionable = actionableRoles.contains(role)
    let hasGeometry = w > 0.5 && h > 0.5
    let hasLabel = !title.isEmpty || !desc.isEmpty || !value.isEmpty

    if hasGeometry && (actionable || hasLabel) {
        elements.append(Out(
            i: idx, role: role, title: title, desc: desc, value: value,
            x: x, y: y, w: w, h: h, depth: depth, actionable: actionable
        ))
        idx += 1
    }

    if let children = axGet(elem, kAXChildrenAttribute as String) as? [AXUIElement] {
        for child in children {
            walk(child, depth: depth + 1)
            if elements.count >= MAX_ELEMENTS { return }
        }
    }
}

// Walk top-level windows. Fall back to the app element if no windows exist.
if let windows = axGet(axApp, kAXWindowsAttribute as String) as? [AXUIElement], !windows.isEmpty {
    for window in windows {
        walk(window, depth: 0)
    }
} else {
    walk(axApp, depth: 0)
}

func jsonEscape(_ s: String) -> String {
    var out = ""
    out.reserveCapacity(s.count + 8)
    for c in s.unicodeScalars {
        switch c {
        case "\\": out += "\\\\"
        case "\"": out += "\\\""
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        default:
            if c.value < 0x20 {
                out += String(format: "\\u%04x", c.value)
            } else {
                out += String(c)
            }
        }
    }
    return out
}

var json = "{\"app\":\"\(jsonEscape(target))\",\"pid\":\(pid),\"elements\":["
for (n, e) in elements.enumerated() {
    if n > 0 { json += "," }
    json += "{\"i\":\(e.i),"
    json += "\"role\":\"\(jsonEscape(e.role))\","
    json += "\"title\":\"\(jsonEscape(e.title))\","
    json += "\"desc\":\"\(jsonEscape(e.desc))\","
    json += "\"value\":\"\(jsonEscape(e.value))\","
    json += "\"x\":\(e.x),\"y\":\(e.y),\"w\":\(e.w),\"h\":\(e.h),"
    json += "\"depth\":\(e.depth),\"actionable\":\(e.actionable)}"
}
json += "]}"

print(json)
