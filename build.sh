#!/bin/zsh
set -euo pipefail
SCRIPT_DIR="${0:A:h}"
BUILD_ROOT=$(/usr/bin/mktemp -d /private/tmp/codex-meter-build.XXXXXX)
trap '/bin/rm -rf "$BUILD_ROOT"' EXIT
APP_NAME='Codex Usage Meter.app'
TARGET="${1:-$BUILD_ROOT-export/$APP_NAME}"
[[ ! -e "$TARGET" ]] || { print -u2 -- "Build target already exists: $TARGET"; exit 1; }
BUNDLE="$BUILD_ROOT/$APP_NAME"
WIDGET="$BUNDLE/Contents/Helpers/CodexUsageMeterMenuBar.app"
ACCOUNT="$WIDGET/Contents/Resources/MaoMaoYunAccount.app"
/bin/mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources" "$BUNDLE/Contents/Helpers"
/bin/zsh "$SCRIPT_DIR/assemble.sh" > "$BUILD_ROOT/main.js"
/usr/bin/osacompile -l JavaScript -s -o "$WIDGET" "$BUILD_ROOT/main.js"
for resource in usage-reader.zsh chatgptTemplate@2x.png; do
  /bin/cp "$SCRIPT_DIR/Sources/$resource" "$WIDGET/Contents/Resources/$resource"
done
/bin/mkdir -p "$ACCOUNT/Contents/MacOS"
/bin/cp "$SCRIPT_DIR/Sources/VPNAccountInfo.plist" "$ACCOUNT/Contents/Info.plist"
/usr/bin/xcrun clang -fobjc-arc -fblocks -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 \
  -framework Cocoa -framework WebKit -framework Security -framework LocalAuthentication \
  "$SCRIPT_DIR/Sources/vpn-account.m" -o "$ACCOUNT/Contents/MacOS/MaoMaoYunAccount"
/usr/bin/plutil -insert CFBundleIdentifier -string com.wentao.codex-usage-meter.widget "$WIDGET/Contents/Info.plist"
/usr/bin/plutil -insert LSUIElement -bool true "$WIDGET/Contents/Info.plist"
/bin/chmod 755 "$WIDGET/Contents/Resources/usage-reader.zsh"
/usr/bin/xcrun clang -fobjc-arc -fblocks -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 \
  -framework Foundation "$SCRIPT_DIR/Sources/token-history-reader.m" -o "$WIDGET/Contents/Resources/TokenHistoryReader"
/usr/bin/codesign --force --sign - "$WIDGET/Contents/Resources/TokenHistoryReader"
/usr/bin/xcrun clang -fobjc-arc -fblocks -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 \
  -framework Foundation "$SCRIPT_DIR/Sources/token-profile-reader.m" -o "$WIDGET/Contents/Resources/TokenProfileReader"
/usr/bin/codesign --force --sign - "$WIDGET/Contents/Resources/TokenProfileReader"
/bin/cp "$SCRIPT_DIR/Sources/AppInfo.plist" "$BUNDLE/Contents/Info.plist"
/bin/cp "$SCRIPT_DIR/maomaoyun-autoconnect.zsh" "$BUNDLE/Contents/Resources/maomaoyun-autoconnect.zsh"
/bin/cp "$WIDGET/Contents/Resources/applet.icns" "$BUNDLE/Contents/Resources/applet.icns"
/usr/bin/xcrun clang -fobjc-arc -fblocks -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 \
  -framework Cocoa "$SCRIPT_DIR/Sources/app-launcher.m" -o "$BUNDLE/Contents/MacOS/CodexUsageMeter"
/usr/bin/xattr -cr "$BUNDLE"
/usr/bin/codesign --force --sign - "$ACCOUNT"
/usr/bin/codesign --force --sign - "$WIDGET"
/usr/bin/codesign --force --sign - "$BUNDLE"
/usr/bin/codesign --verify --deep --strict "$BUNDLE"
/bin/mkdir -p "${TARGET:h}"
/bin/mv "$BUNDLE" "$TARGET"
print -r -- "Built: $TARGET"
