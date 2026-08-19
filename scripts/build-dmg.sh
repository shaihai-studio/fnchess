#!/bin/bash
APP_NAME="函数棋"
APP_PATH="dist/mac/${APP_NAME}.app"
DMG_PATH="dist/${APP_NAME}.dmg"
BG_IMAGE="build/dmg-bg.png"

rm -f "$DMG_PATH"

create-dmg \
  --volname "$APP_NAME" \
  --volicon "build/icon.icns" \
  --background "$BG_IMAGE" \
  --window-size 600 400 \
  --icon-size 100 \
  --icon "$APP_NAME.app" 130 220 \
  --app-folder-link 410 220 \
  "$DMG_PATH" \
  "$APP_PATH"