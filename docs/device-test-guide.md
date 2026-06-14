# Peelzy 実機テスト手順

## 前提

作業フォルダは本体アプリです。

```bash
cd "/Users/hiro/Documents/NewProject/peelzy"
```

PoCではなく、本体アプリを確認します。

- 本体: `/Users/hiro/Documents/NewProject/peelzy`
- iOS本体Workspace: `/Users/hiro/Documents/NewProject/peelzy/ios/Peelzy.xcworkspace`
- iOS PoCではない: `/Users/hiro/Documents/NewProject/peelzy/pocs/apple-subject-lift-poc`

## 共通: Metro起動

iPhone/Androidどちらも、まずMetroをDevelopment Build向けに起動します。

```bash
cd "/Users/hiro/Documents/NewProject/peelzy"
npx expo start --dev-client
```

キャッシュを消して起動したい場合:

```bash
cd "/Users/hiro/Documents/NewProject/peelzy"
npx expo start --dev-client --clear
```

## iPhone実機でテスト

### 通常の起動

別ターミナルで実行します。

```bash
cd "/Users/hiro/Documents/NewProject/peelzy"
npx expo run:ios --device
```

### Xcodeから起動する場合

```bash
cd "/Users/hiro/Documents/NewProject/peelzy"
open ios/Peelzy.xcworkspace
```

Xcodeで確認すること:

- Scheme: `Peelzy`
- Device: `hiroのiPhone`
- Runボタンを押す

### iPhoneで確認する機能

- ログイン
- Snap撮影
- Apple Subject Liftでシール化
- コレクションのAll/Unplaced表示
- Bookへの追加
- Book上のステッカー表示
- 課金状態の表示

## Android実機でテスト

### 端末接続確認

```bash
adb devices
```

以下のように `device` と表示されればOKです。

```text
List of devices attached
xxxxxxxxxxxx	device
```

`unauthorized` の場合:

- Android端末側に出るUSBデバッグ許可を承認
- USBケーブルを抜き差し
- 再度 `adb devices`

### 通常の起動

別ターミナルで実行します。

```bash
cd "/Users/hiro/Documents/NewProject/peelzy"
npx expo run:android --device
```

### Androidで確認する機能

- ログイン
- Snap撮影
- Android ML Kitでシール化
- コレクションのAll/Unplaced表示
- Bookへの追加
- Book上のステッカー表示
- 課金状態の表示

## 変更内容ごとの反映方法

JS/TSだけ変更した場合:

- アプリ内でReload
- またはMetroを再読み込み

iOS Swiftを変更した場合:

```bash
cd "/Users/hiro/Documents/NewProject/peelzy"
npx expo run:ios --device
```

またはXcodeでRun。

Android Kotlin/Gradleを変更した場合:

```bash
cd "/Users/hiro/Documents/NewProject/peelzy"
npx expo run:android --device
```

`package.json`、ネイティブモジュール、`ios/`、`android/` に関係する変更をした場合:

- iPhone/Androidともに再ビルドが必要

## よくあるエラー

### Development serverが見つからない

Metroが起動していない可能性があります。

```bash
cd "/Users/hiro/Documents/NewProject/peelzy"
npx expo start --dev-client
```

### 古い画面が出る

キャッシュを消してMetroを起動します。

```bash
cd "/Users/hiro/Documents/NewProject/peelzy"
npx expo start --dev-client --clear
```

それでも古い場合は、実機アプリを再ビルドします。

### iPhoneでPoCの画面が出る

PoCのXcode workspaceを開いています。本体を開き直してください。

```bash
cd "/Users/hiro/Documents/NewProject/peelzy"
open ios/Peelzy.xcworkspace
```

### Androidで端末が出ない

```bash
adb devices
```

`device` が表示されない場合:

- USBデバッグをON
- 端末側のUSBデバッグ許可を承認
- ケーブルを抜き差し
- Android StudioやSDKの設定を確認

## 補足

現在のシール化方式:

- iPhone: Apple Subject Lift
- Android: Google ML Kit Subject Segmentation
- Web/ネイティブモジュールなし: Clipdrop

Expo GoではApple Subject LiftとAndroid ML Kitは動きません。実機テストはDevelopment Buildで行います。
