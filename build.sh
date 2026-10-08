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
/bin/mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources" "$BUNDLE/Contents/Helpers"
/bin/zsh "$SCRIPT_DIR/assemble.sh" > "$BUILD_ROOT/main.js"
/usr/bin/osacompile -l JavaScript -o "$WIDGET" "$BUILD_ROOT/main.js"
for resource in usage-reader.zsh chatgptTemplate@2x.png; do
  /bin/cp "$SCRIPT_DIR/Sources/$resource" "$WIDGET/Contents/Resources/$resource"
done
/usr/bin/plutil -insert CFBundleIdentifier -string com.wentao.codex-usage-meter.widget "$WIDGET/Contents/Info.plist"
/usr/bin/plutil -insert LSUIElement -bool true "$WIDGET/Contents/Info.plist"
/bin/chmod 755 "$WIDGET/Contents/Resources/usage-reader.zsh"
/bin/cp "$SCRIPT_DIR/Sources/AppInfo.plist" "$BUNDLE/Contents/Info.plist"
/bin/cp "$SCRIPT_DIR/maomaoyun-autoconnect.zsh" "$BUNDLE/Contents/Resources/maomaoyun-autoconnect.zsh"
/bin/cp "$WIDGET/Contents/Resources/applet.icns" "$BUNDLE/Contents/Resources/applet.icns"
/usr/bin/xcrun clang -fobjc-arc -fblocks -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 \
  -framework Cocoa "$SCRIPT_DIR/Sources/app-launcher.m" -o "$BUNDLE/Contents/MacOS/CodexUsageMeter"
/usr/bin/xattr -cr "$BUNDLE"
/usr/bin/codesign --force --sign - "$WIDGET"
/usr/bin/codesign --force --sign - "$BUNDLE"
/usr/bin/codesign --verify --deep --strict "$BUNDLE"
/bin/mkdir -p "${TARGET:h}"
/bin/mv "$BUNDLE" "$TARGET"
print -r -- "Built: $TARGET"
