#!/usr/bin/env bash
# Builds the iOS app and uploads it to App Store Connect for TestFlight.
# Run on a Mac with Xcode signed in to the Buzzie LLC team (P3F54L5BAH).
# The app record for com.buzzie.roadster must already exist in App Store Connect.
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"
ARCHIVE="build/Roadster.xcarchive"

npm ci
npm test
npm run build
npx cap sync ios

rm -rf "$ARCHIVE"
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  archive

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist ios/ExportOptions.plist \
  -exportPath build/export \
  -allowProvisioningUpdates

echo "Uploaded build $BUILD_NUMBER. It shows up in TestFlight once App Store Connect finishes processing."
