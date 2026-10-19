// Explicit, scoped UI check. Only the meter or an isolated meter fixture may
// be targeted; optional preferences/Token disclosures only, never commands/URLs/VPN.
import Cocoa
import ApplicationServices

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8)); exit(2)
}

let options = Set(CommandLine.arguments.dropFirst(2))
guard CommandLine.arguments.count >= 2, options.isSubset(of: ["--preferences", "--meters"]),
      let pid = Int32(CommandLine.arguments[1]),
      let app = NSRunningApplication(processIdentifier: pid),
      let id = app.bundleIdentifier,
      id == "com.wentao.codex-usage-meter.widget" || id.hasPrefix("com.wentao.codex-usage-meter.tests.status.") else {
    fail("Pass the PID of the meter or an isolated status-menu fixture")
}
guard AXIsProcessTrusted() else { fail("Accessibility access is unavailable") }
let root = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(root, 1)
func read(_ element: AXUIElement, _ key: String) -> CFTypeRef? {
    var result: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, key as CFString, &result) == .success ? result : nil
}
func children(_ element: AXUIElement) -> [AXUIElement] {
    return read(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
}
func statusButton() -> AXUIElement? {
    let bars = children(root).filter { (read($0, kAXRoleAttribute) as? String) == kAXMenuBarRole }
    return bars.compactMap { bar -> AXUIElement? in
        let items = children(bar)
        guard items.count == 1, let item = items.first else { return nil }
        let title = read(item, kAXTitleAttribute) as? String ?? ""
        return title.isEmpty || title == "Test" ? item : nil
    }.last
}
let startupDeadline = Date().addingTimeInterval(5)
var candidate = statusButton()
while candidate == nil && Date() < startupDeadline { Thread.sleep(forTimeInterval:0.1); candidate = statusButton() }
guard let button = candidate else { fail("The meter status item is unavailable") }
AXUIElementSetMessagingTimeout(button, 1)
func openMenu() -> AXUIElement? {
    return children(button).first { menu in
        guard (read(menu, kAXRoleAttribute) as? String) == kAXMenuRole,
              let value = read(menu, kAXSizeAttribute), CFGetTypeID(value) == AXValueGetTypeID() else { return false }
        var size = CGSize.zero
        AXValueGetValue(value as! AXValue, .cgSize, &size)
        return size.width > 1 && size.height > 1
    }
}
func waitFor(_ expected: Bool) -> Bool {
    let deadline = Date().addingTimeInterval(1.5)
    repeat {
        if (openMenu() != nil) == expected { return true }
        Thread.sleep(forTimeInterval: 0.02)
    } while Date() < deadline
    return false
}
func menuHeight() -> CGFloat {
    guard let menu = openMenu(), let value = read(menu, kAXSizeAttribute), CFGetTypeID(value) == AXValueGetTypeID() else { return 0 }
    var size = CGSize.zero; AXValueGetValue(value as! AXValue, .cgSize, &size); return size.height
}
func preferenceButton(_ element: AXUIElement, depth: Int = 0) -> AXUIElement? {
    if depth > 5 { return nil }
    let role = read(element,kAXRoleAttribute) as? String ?? ""
    let label = (read(element,kAXTitleAttribute) as? String ?? "")
    let description = (read(element,kAXDescriptionAttribute) as? String ?? "")
    if role == kAXButtonRole && ([label,description].contains("Preferences") || [label,description].contains("偏好设置")) { return element }
    for child in children(element).prefix(100) { if let button = preferenceButton(child,depth:depth+1) { return button } }
    return nil
}
var preferenceProbe: [String: Any] = [:]
func checkPreferences() -> Bool {
    guard let menu = openMenu(), let preference = preferenceButton(menu) else { preferenceProbe = ["found":false]; return false }
    let base = menuHeight()
    let press = AXUIElementPerformAction(preference,kAXPressAction as CFString)
    Thread.sleep(forTimeInterval:0.25)
    let expanded = menuHeight()
    // As with the status item, a tracking-menu AXPress can return a timeout
    // after its action already ran. Judge the actual layout; never press twice
    // to retry an uncertain action. Reacquire the control after native reflow.
    guard expanded > base, let currentMenu = openMenu(), let collapseButton = preferenceButton(currentMenu) else {
        preferenceProbe = ["found":true,"press":press.rawValue,"grew":expanded>base]; return false
    }
    let collapse = AXUIElementPerformAction(collapseButton,kAXPressAction as CFString)
    Thread.sleep(forTimeInterval:0.25)
    let shrank = menuHeight() < expanded && openMenu() != nil
    preferenceProbe = ["found":true,"press":press.rawValue,"grew":true,"collapsePress":collapse.rawValue,"shrank":shrank]
    return shrank
}
func findPeriod(_ element: AXUIElement, depth: Int = 0) -> AXUIElement? {
    if depth > 7 { return nil }
    let title = read(element,kAXTitleAttribute) as? String ?? ""
    let description = read(element,kAXDescriptionAttribute) as? String ?? ""
    if [title,description].contains("Token period") || [title,description].contains("Token 统计范围") { return element }
    for child in children(element).prefix(100) {
        if let control = findPeriod(child,depth:depth+1) { return control }
    }
    return nil
}
func findMeter(_ element: AXUIElement, depth: Int = 0) -> AXUIElement? {
    if depth > 7 { return nil }
    let values = [read(element,kAXTitleAttribute) as? String ?? "",read(element,kAXDescriptionAttribute) as? String ?? ""]
    let role = read(element,kAXRoleAttribute) as? String ?? ""
    if role != kAXButtonRole && values.contains(where: { $0.hasPrefix("Token activity.") || $0.hasPrefix("Token 活动.") }) { return element }
    for child in children(element).prefix(100) {
        if let meter = findMeter(child,depth:depth+1) { return meter }
    }
    return nil
}
func findTokenDisclosure(_ element: AXUIElement, depth: Int = 0) -> AXUIElement? {
    if depth > 7 { return nil }
    let role = read(element,kAXRoleAttribute) as? String ?? ""
    let values = [read(element,kAXTitleAttribute) as? String ?? "",read(element,kAXDescriptionAttribute) as? String ?? ""]
    if role == kAXButtonRole && values.contains(where: { $0 == "Token activity" || $0 == "Token 活动" || $0.hasPrefix("Token activity.") || $0.hasPrefix("Token 活动.") }) { return element }
    for child in children(element).prefix(100) {
        if let control = findTokenDisclosure(child,depth:depth+1) { return control }
    }
    return nil
}
func checkMeters() -> [String: Any] {
    guard let menu = openMenu(), let disclosure = findTokenDisclosure(menu) else { return ["present":false] }
    let initialLabel = (read(disclosure,kAXTitleAttribute) as? String ?? "") + (read(disclosure,kAXDescriptionAttribute) as? String ?? "")
    let defaultCollapsed = initialLabel.contains("Collapsed") || initialLabel.contains("已折叠")
    let base = menuHeight()
    guard defaultCollapsed, AXUIElementPerformAction(disclosure,kAXPressAction as CFString) == .success else {
        return ["present":true,"defaultCollapsed":defaultCollapsed,"expanded":false]
    }
    Thread.sleep(forTimeInterval:0.25)
    guard let meter = findMeter(menu) else { return ["present":true,"defaultCollapsed":true,"chartPresent":false] }
    let expanded = menuHeight() > base
    let label = (read(meter,kAXTitleAttribute) as? String ?? "") + (read(meter,kAXDescriptionAttribute) as? String ?? "")
    let expression = try! NSRegularExpression(pattern:"20[0-9]{2}-[0-9]{2}-[0-9]{2}: [0-9]+")
    let dates = expression.matches(in:label,range:NSRange(label.startIndex...,in:label))
    let count = Set(dates.map { (label as NSString).substring(with:$0.range) }).count
    let noRanges = findPeriod(menu)==nil
    let collapsePress = AXUIElementPerformAction(disclosure,kAXPressAction as CFString) == .success
    Thread.sleep(forTimeInterval:0.25)
    let collapsed = collapsePress && menuHeight() == base && openMenu() != nil
    return ["present":true,"defaultCollapsed":defaultCollapsed,"expanded":expanded,"collapsed":collapsed,
        "rangesRemoved":noRanges,"categoriesRemoved":
        !["Uncached input","Cached input","未缓存输入","缓存输入"].contains(where:label.contains),
        "thirtyDates":count==30,"fixedThirtyDays":label.contains("Past 30 days") || label.contains("过去30天"),
        "officialSource":label.contains("Profile data") || label.contains("官方统计")]
}
defer { if let menu = openMenu() { AXUIElementPerformAction(menu,kAXCancelAction as CFString) } }
var results: [[String: Any]] = []
for _ in 0..<3 {
    if let menu = openMenu() { AXUIElementPerformAction(menu, kAXCancelAction as CFString); _ = waitFor(false) }
    let began = Date()
    let press = AXUIElementPerformAction(button, kAXPressAction as CFString)
    let opened = waitFor(true)
    let latency = Date().timeIntervalSince(began)
    let preferenceOK = !options.contains("--preferences") || (opened && checkPreferences())
    let meters: [String:Any] = options.contains("--meters") && opened ? checkMeters() : [:]
    let description = read(button, kAXDescriptionAttribute) as? String ?? ""
    let closeBegan = Date()
    var cancel = AXError.success
    if let menu = openMenu() { cancel = AXUIElementPerformAction(menu, kAXCancelAction as CFString) }
    let closed = waitFor(false)
    results.append(["press": press.rawValue, "opened": opened, "closed": closed,
                    "cancel": cancel.rawValue, "latency": latency, "description": description,
                    "closeLatency": Date().timeIntervalSince(closeBegan), "preferences":preferenceOK,"preferenceProbe":preferenceProbe,"meters":meters])
    if !opened || !closed { break }
    // AX removes a closing menu before AppKit finishes its dismissal animation.
    // Don't issue the next status-button press into that transition: it can
    // legitimately cancel remaining tracking instead of opening a new menu.
    Thread.sleep(forTimeInterval:0.35)
}
let data = try JSONSerialization.data(withJSONObject: results, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
