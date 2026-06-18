# Peelzy 開発ログ

## 開発方針

- MVPはスマホアプリ体験を優先する。
- ブラウザ版はCodexのUI確認用プレビューとして使う。
- カメラ、ジェスチャー、写真保存、共有、Safe Areaは実機で確認する。
- Web固有の見た目はMVPでは追いすぎない。

## ログ

### 2026-05-09 15:32:55 JST

作業:
- 開発ログを作成し、MVP方針を記録。
- シール化中の文言と完成演出を改善。
- ステッカー詳細に移動ボタンを追加し、貼り付け演出を短縮。

ファイル:
- `DEVELOPMENT_LOG.md`
- `app/(app)/crop.tsx`
- `app/(app)/book-detail.tsx`

### 2026-05-09 15:39:00 JST

作業:
- ノート/テキスト入力モーダルをキーボードに隠れない位置へ調整。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-19 09:45 JST

作業:
- シール帳詳細の選択中ドックをコンパクト化。
- Size/Turnを横長ステッパーからボタンに変更し、タップ時にMove同様の上部ポップアップで±/回転操作を表示するようにした。
- Size/Turn/Moveのポップアップは同時に1つだけ開くよう制御。
- Stamp/Text選択時の削除ボタンを`×`からゴミ箱表示へ変更。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-18 12:25 JST

作業:
- Moveで別Bookのページに移ったように見える事象を追加調査。
- Move更新処理は`page_index`のみ更新しており`book_id`自体は変更していなかったが、DB更新条件が`id`のみで現在Bookの検証が不足していた。
- シール/Stamp/TextのMove更新に現在の`bookId`条件を追加し、別Book所属のアイテムは更新できないよう防御。
- Bookページキャッシュ読み込み時に、現在Book以外のシール/要素が混ざっていた場合は表示対象から除外するよう修正。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/book-detail.tsx`
- `lib/storage.ts`
- `lib/bookPageCache.ts`
- `DEVELOPMENT_LOG.md`

### 2026-06-18 12:45 JST

作業:
- シール化処理ログ`[StickerProcessingTiming]`へ、アップロード直前の`upload_bytes`/`upload_width`/`upload_height`/`upload_megapixels`を追加。
- cutoutの背景除去先読みと同様に、rounded/heart/starのフレームPNGキャプチャをプレビュー読み込み完了後から先読みするよう変更。
- Peelタップ時は先読み済みキャプチャを待ち、待ち時間を`frame_capture_wait_ms`として記録するようにした。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-18 21:05 JST

作業:
- TestFlightで作成したroundedの処理ログは端末consoleのみでDB保存されておらず、後追い解析できないことを確認。
- 次回以降の解析用に、シールmetadataへ`processingMetrics`を保存するよう変更。
- シール化完了後、完成画像プレビュー待ち中にステータス文言が消えてバウンドだけになる状態を修正。
- 完成直後のDrop表示はSupabaseのpublic URLではなくローカル生成ファイルを使い、アップロード直後の画像再読込待ちを減らすよう変更。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/crop.tsx`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-06-18 21:30 JST

作業:
- 起動時にスプラッシュカード表示後、タブバーだけが先に表示される問題を修正。
- Home画面内でスプラッシュを表示する方式をやめ、タブレイアウト全体の上にスプラッシュを重ねる方式へ変更。
- Home初回ロード中はタブバーを非表示にし、スプラッシュカードからトップ画面へ直接切り替わるようにした。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/_layout.tsx`
- `app/(app)/home.tsx`
- `lib/launchSplashEvents.ts`
- `DEVELOPMENT_LOG.md`

### 2026-06-19 09:20 JST

作業:
- シール帳詳細でシール/Stamp/Text選択中に、何もない場所をタップすると選択解除されるよう変更。
- 別シールをタップした場合は従来どおり選択移動し、空白タップだけ解除するようにした。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-26 12:43 JST

作業:
- RevenueCatの購入・復元・Webhook同期を実装。
- Webhookの重複送信対策を追加。

ファイル:
- `app/(app)/home.tsx`
- `lib/revenuecat.ts`
- `supabase/functions/revenuecat-webhook/index.ts`
- `supabase/functions/sync-revenuecat-status/index.ts`
- `supabase/migrations/018_add_revenuecat_subscription_state.sql`
- `package.json`
- `package-lock.json`
- `ios/Podfile.lock`
- `DEVELOPMENT_LOG.md`

### 2026-05-26 13:33 JST

作業:
- Textの複数行入力と自動サイズ調整を実装。

ファイル:
- `app/(app)/book-detail.tsx`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-05-26 15:01 JST

作業:
- カメラ・写真保存の権限拒否時の設定導線を追加。
- 設定復帰後にカメラ権限を再確認する処理を追加。

ファイル:
- `app/(app)/snap.tsx`
- `app/(app)/book-detail.tsx`
- `app.json`
- `DEVELOPMENT_LOG.md`

### 2026-05-26 19:13 JST

作業:
- 英語版オンボーディング3画面を追加。
- 初回表示と完了保存の導線を実装。

ファイル:
- `app/onboarding.tsx`
- `app/_layout.tsx`
- `constants/onboarding.ts`
- `DEVELOPMENT_LOG.md`

### 2026-05-26 19:45 JST

作業:
- 認証入口画面を追加。
- ログイン・登録・パスワード再設定画面を英語化。

ファイル:
- `app/(auth)/welcome.tsx`
- `app/(auth)/login.tsx`
- `app/(auth)/signup.tsx`
- `app/(auth)/forgot-password.tsx`
- `app/(auth)/update-password.tsx`
- `app/_layout.tsx`
- `app/index.tsx`
- `app/onboarding.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-26 20:01 JST

作業:
- Appleログインを追加。
- iOSのSign in with Apple権限を設定。

ファイル:
- `components/auth/AppleSignInButton.tsx`
- `contexts/AuthContext.tsx`
- `app/(auth)/welcome.tsx`
- `app/(auth)/login.tsx`
- `app/(auth)/signup.tsx`
- `app.json`
- `ios/Peelzy/Peelzy.entitlements`
- `package.json`
- `package-lock.json`
- `ios/Podfile.lock`
- `DEVELOPMENT_LOG.md`

### 2026-05-25 22:33 JST

作業:
- シール保存時の最大解像度を1024pxに統一。

ファイル:
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-26 00:06 JST

作業:
- 一覧用サムネイル生成と表示フォールバックを追加。

ファイル:
- `app/(app)/crop.tsx`
- `app/(app)/collection.tsx`
- `app/(app)/home.tsx`
- `lib/storage.ts`
- `supabase/migrations/017_add_sticker_thumbnail_url.sql`
- `DEVELOPMENT_LOG.md`

### 2026-05-26 09:23 JST

作業:
- CollectionのBook追加時の二重モーダルを修正し、Allでも未配置シールを追加可能に変更。

ファイル:
- `app/(app)/collection.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-25 00:30 JST

作業:
- Brutalist/Film表紙の写真配置をClassic型に変更。

ファイル:
- `components/BookCover/BrutalistCover.tsx`
- `components/BookCover/FilmCover.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-09 15:52:54 JST

作業:
- 空ページから撮影したステッカーが対象ページへ即時反映されるよう修正。

ファイル:
- `app/(app)/crop.tsx`
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-09 16:00:48 JST

作業:
- オファー詳細に削除機能を追加。
- アクティブなオファーは確認後に削除するよう変更。

ファイル:
- `app/(app)/collection.tsx`
- `lib/storage.ts`
- `supabase/migrations/013_delete_exchange_offer_rpc.sql`
- `DEVELOPMENT_LOG.md`

### 2026-05-10 10:36:33 JST

作業:
- Snap画面にインカメラ切り替えを追加。
- フロント撮影時は自撮りらしいミラー保存に調整。

ファイル:
- `app/(app)/snap.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-10 10:45:42 JST

作業:
- コレクション詳細をスクロール対応にし、下部ボタンの見切れを修正。
- 主要アクションと補助アクションの配置を整理。

ファイル:
- `app/(app)/collection.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-10 12:05:20 JST

作業:
- シール帳表紙にClassic/Brutalist/Filmの3テーマを追加。
- HomeのBookメニューから名前・表紙・色を編集可能に変更。

ファイル:
- `components/BookCover/*`
- `app/(app)/home.tsx`
- `lib/storage.ts`
- `supabase/migrations/014_add_book_cover_theme.sql`
- `DEVELOPMENT_LOG.md`

### 2026-05-10 12:51:33 JST

作業:
- Book Settings表示時にキーボードが自動表示されないよう修正。
- 表紙選択プレビューを装飾のみの表示に変更。

ファイル:
- `app/(app)/home.tsx`
- `components/BookCover/*`
- `DEVELOPMENT_LOG.md`

### 2026-05-10 12:59:40 JST

作業:
- BookページUIを表紙テーマに合わせて切り替えるよう変更。
- Brutalist/Film用のページ背景、枠、空ページ表示を追加。

ファイル:
- `app/(app)/book-detail.tsx`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-05-10 13:48:21 JST

作業:
- カバー設定プレビューの不要な線・丸を削除。
- 落ち着いた色を追加し、Cover/Page colorを別設定に変更。

ファイル:
- `components/BookCover/*`
- `app/(app)/home.tsx`
- `app/(app)/book-detail.tsx`
- `lib/storage.ts`
- `supabase/migrations/015_add_book_page_color.sql`
- `DEVELOPMENT_LOG.md`

### 2026-05-10 14:02:47 JST

作業:
- 追加カラー2色を指定色に差し替え。

ファイル:
- `components/BookCover/types.ts`
- `supabase/migrations/016_update_book_color_palette.sql`
- `DEVELOPMENT_LOG.md`

### 2026-05-10 23:50:51 JST

作業:
- Apple Subject Lift優先、Clipdropフォールバックの入口を追加。
- MobileSAM保留を含むPoC方針を文書化。

ファイル:
- `lib/appleSubjectLift.ts`
- `lib/backgroundRemoval.ts`
- `app/(app)/crop.tsx`
- `docs/apple-subject-lift-poc.md`
- `DEVELOPMENT_LOG.md`

### 2026-05-11 00:35:21 JST

作業:
- Apple Subject Lift品質確認用の独立PoCを追加。
- 親フォルダをスペースなしに変更し、PoCのiOSビルド成功を確認。

ファイル:
- `pocs/apple-subject-lift-poc/*`
- `DEVELOPMENT_LOG.md`

### 2026-05-11 20:04:55 JST

作業:
- Android ML Kit切り抜き品質確認用の独立PoCを追加。

ファイル:
- `pocs/android-mlkit-subject-segmentation-poc/*`
- `DEVELOPMENT_LOG.md`

### 2026-05-11 21:42:15 JST

作業:
- iOS先行の背景除去方針を仕様書化。

ファイル:
- `docs/background-removal-platform-spec.md`
- `DEVELOPMENT_LOG.md`

### 2026-05-11 21:46:42 JST

作業:
- 背景除去導入前の開発ロードマップを追記。

ファイル:
- `docs/background-removal-platform-spec.md`
- `DEVELOPMENT_LOG.md`

### 2026-05-13 12:46:09 JST

作業:
- iOS本体アプリにApple Subject Liftを追加。
- Development Build用の依存とスクリプトを追加。
- DB移行不要の方針を仕様書に追記。

ファイル:
- `modules/peelzy-subject-lift/*`
- `lib/appleSubjectLift.ts`
- `lib/backgroundRemoval.ts`
- `app/(app)/crop.tsx`
- `lib/storage.ts`
- `package.json`
- `package-lock.json`
- `docs/background-removal-platform-spec.md`
- `DEVELOPMENT_LOG.md`

### 2026-05-16 13:55:11 JST

作業:
- パスワード再設定メール送信と新パスワード設定画面を追加。
- Supabaseの再設定リンクからアプリへ復帰する処理を追加。

ファイル:
- `contexts/AuthContext.tsx`
- `app/_layout.tsx`
- `app/(auth)/login.tsx`
- `app/(auth)/forgot-password.tsx`
- `app/(auth)/update-password.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-16 16:23:37 JST

作業:
- パスワード再設定リンクを固定アプリスキームに変更。

ファイル:
- `contexts/AuthContext.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-16 19:18:01 JST

作業:
- Snap撮影画面のカメラ初期化と撮影失敗時の表示を改善。
- カメラ切替後も撮影できるよう再マウントと準備完了処理を調整。

ファイル:
- `app/(app)/snap.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-16 19:59:19 JST

作業:
- シール帳ページ上のステッカー描画を高解像度化。
- ページ拡大中にドラッグ移動できるよう修正。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-17 10:16:47 JST

作業:
- Stripe SandboxにPeelzy Plusの商品と月額Priceを作成。
- Checkoutを固定Price ID利用に変更し、Supabaseへ反映。

ファイル:
- `supabase/functions/create-checkout-session/index.ts`
- `app/(app)/home.tsx`
- `.env.example`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 JST

作業:
- Android ML Kit PoCの入力画像縮小でクラッシュを調査。

ファイル:
- `pocs/android-mlkit-subject-segmentation-poc/modules/peelzy-mlkit-subject-segmentation/android/src/main/java/com/peelzy/mlkitsubjectsegmentation/PeelzyMlkitSubjectSegmentationModule.kt`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 JST

作業:
- iOS PoCに丸みのある背景保持シール形状を追加。
- 輪郭余白を追加で半分に調整。
- 白フチを30%増やした。
- 背景除去仕様にシール形状の方針を追記。

ファイル:
- `pocs/apple-subject-lift-poc/modules/peelzy-subject-lift/ios/PeelzySubjectLiftModule.swift`
- `docs/background-removal-platform-spec.md`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 03:31:07 JST

作業:
- iOS PoCで写真端に接する被写体にも白フチが出るよう修正。

ファイル:
- `pocs/apple-subject-lift-poc/modules/peelzy-subject-lift/ios/PeelzySubjectLiftModule.swift`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 03:32:59 JST

作業:
- iOS PoCの白フチを50%増しに調整。

ファイル:
- `pocs/apple-subject-lift-poc/modules/peelzy-subject-lift/ios/PeelzySubjectLiftModule.swift`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 03:37:44 JST

作業:
- iOS PoCの白フチ生成キャンバスを正規化。

ファイル:
- `pocs/apple-subject-lift-poc/modules/peelzy-subject-lift/ios/PeelzySubjectLiftModule.swift`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 03:42:44 JST

作業:
- iOS PoCの輪郭余白を30%減らし、白フチを50%増やした。

ファイル:
- `pocs/apple-subject-lift-poc/modules/peelzy-subject-lift/ios/PeelzySubjectLiftModule.swift`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 03:45:44 JST

作業:
- 見切れ部分の白フチが太く見える問題を修正。

ファイル:
- `pocs/apple-subject-lift-poc/modules/peelzy-subject-lift/ios/PeelzySubjectLiftModule.swift`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 03:55:16 JST

作業:
- iOS PoCの白フチを10%減らした。

ファイル:
- `pocs/apple-subject-lift-poc/modules/peelzy-subject-lift/ios/PeelzySubjectLiftModule.swift`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 03:59:51 JST

作業:
- iOS PoCに円形素材の欠け補正を追加。

ファイル:
- `pocs/apple-subject-lift-poc/modules/peelzy-subject-lift/ios/PeelzySubjectLiftModule.swift`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 04:19:27 JST

作業:
- Apple Subject Liftを本体アプリ側へ移植。

ファイル:
- `modules/peelzy-subject-lift/ios/PeelzySubjectLiftModule.swift`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 04:40:11 JST

作業:
- Stripe決済後のプラン同期処理を追加。

ファイル:
- `supabase/functions/sync-billing-status/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `lib/storage.ts`
- `app/(app)/home.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 15:15:46 JST

作業:
- Android ML Kitによるシール化を本体アプリへ追加。

ファイル:
- `modules/peelzy-mlkit-subject-segmentation/`
- `lib/androidMlkitSubjectSegmentation.ts`
- `lib/backgroundRemoval.ts`
- `lib/storage.ts`
- `package.json`
- `package-lock.json`
- `android/`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 JST

作業:
- iPhone/Android実機テスト手順を作成。

ファイル:
- `docs/device-test-guide.md`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 15:44 JST

作業:
- iOS Podsを再生成し、Xcodeビルド失敗を解消。

ファイル:
- `ios/Pods`
- `ios/Podfile.lock`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 23:17 JST

作業:
- iOSの円形補正を削除し、ビルドを確認。

ファイル:
- `modules/peelzy-subject-lift/ios/PeelzySubjectLiftModule.swift`
- `DEVELOPMENT_LOG.md`

### 2026-05-23 23:24 JST

作業:
- シール帳上のシール描画解像度を上げた。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 00:05 JST

作業:
- シール帳上のシール描画解像度を1024pxに変更。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 00:18 JST

作業:
- ページカラー反映とズーム時の画質劣化を調整。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 00:31 JST

作業:
- ズーム時にシール画像を直接高解像度描画するよう調整。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 00:42 JST

作業:
- シール化の事前処理と保存前リサイズを追加。

ファイル:
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 00:50 JST

作業:
- シール化中の表示文言を短く調整。

ファイル:
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 01:02 JST

作業:
- 完成モーションと完了後ボタンを調整。

ファイル:
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 01:14 JST

作業:
- 撮影画面にシャッター、明るさ、フォーカス、フラッシュ操作を追加。

ファイル:
- `app/(app)/snap.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 01:31 JST

作業:
- 撮影画面の操作UI重なりと新規シール表示サイズを調整。

ファイル:
- `app/(app)/snap.tsx`
- `app/(app)/crop.tsx`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 01:43 JST

作業:
- シール帳に貼る新規シールの表示サイズを調整。

ファイル:
- `app/(app)/crop.tsx`
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 01:51 JST

作業:
- シール帳の表示基準サイズをシール化画面に合わせた。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 02:02 JST

作業:
- 撮影画面の操作UI配置と明るさ表示を調整。

ファイル:
- `app/(app)/snap.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 09:44 JST

作業:
- シール帳の個別シール選択、移動、拡大縮小、回転を実装。

ファイル:
- `app/(app)/book-detail.tsx`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 10:01 JST

作業:
- シール選択中はページ操作を止め、選択シールの編集操作を優先。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 10:26 JST

作業:
- シールの透明余白を選択しにくいようにタップ範囲を調整。

ファイル:
- `app/(app)/book-detail.tsx`
- `app/(app)/crop.tsx`
- `lib/backgroundRemoval.ts`
- `lib/storage.ts`
- `modules/peelzy-subject-lift/ios/PeelzySubjectLiftModule.swift`
- `modules/peelzy-subject-lift/src/index.ts`
- `modules/peelzy-mlkit-subject-segmentation/android/src/main/java/com/peelzy/mlkitsubjectsegmentation/PeelzyMlkitSubjectSegmentationModule.kt`
- `modules/peelzy-mlkit-subject-segmentation/src/index.ts`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 10:36 JST

作業:
- 狭めた選択範囲でも移動と拡大縮小が効くように修正。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 10:54 JST

作業:
- シール移動の戻り不具合と編集UIの重なりを調整。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 11:43 JST

作業:
- シール端配置とページまたぎ移動を実装。

ファイル:
- `app/(app)/book-detail.tsx`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 12:10 JST

作業:
- 選択後のシール移動が固定される問題を修正。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 12:26 JST

作業:
- ページまたぎ移動の保持時間と移動先位置を調整。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 12:34 JST

作業:
- シール移動完了時に元位置が一瞬表示される問題を調整。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 13:37 JST

作業:
- ノート・テキスト・スタンプを選択後に移動、拡大縮小、回転できるように実装。

ファイル:
- `app/(app)/book-detail.tsx`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 14:49 JST

作業:
- シール選択解除時に位置・角度・画質が変わる問題を修正。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 15:06 JST

作業:
- シール移動時の元位置表示、ページ移動判定、描画順を調整。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 15:21 JST

作業:
- ページ送りターゲット表示と指位置ベースのページ移動を実装。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 18:05 JST

作業:
- ノート・テキスト・スタンプの編集、色変更、ページ移動を実装。

ファイル:
- `app/(app)/book-detail.tsx`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 21:27 JST

作業:
- ページ移動中にシールと指位置がズレる問題を調整。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 21:42 JST

作業:
- 選択中ツールバーを下部に統合し、拡大縮小・回転ボタンを追加。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-24 23:33 JST

作業:
- ページズームをMVP向けに無効化し、ページ要素の拡大縮小を全体スケールに変更。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-26 20:42 JST

作業:
- Privacyページを追加し、Terms/Privacyとメール確認案内の導線を確認。

ファイル:
- `app/(auth)/privacy.tsx`
- `app/(auth)/signup.tsx`
- `app/(auth)/welcome.tsx`
- `app/(auth)/check-email.tsx`
- `contexts/AuthContext.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-26 21:39 JST

作業:
- カメラ・写真保存権限の拒否時案内と設定復帰後の再確認を調整。

ファイル:
- `app.json`
- `app/(app)/snap.tsx`
- `app/(app)/camera.tsx`
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-05-26 22:50 JST

作業:
- アプリアイコン画像を差し替え。

ファイル:
- `assets/icon.png`
- `assets/adaptive-icon.png`
- `assets/favicon.png`
- `DEVELOPMENT_LOG.md`

### 2026-05-28 21:39 JST

作業:
- RevenueCat課金処理をAndroidにも対応。

ファイル:
- `lib/revenuecat.ts`
- `app/(app)/home.tsx`
- `.env.example`
- `DEVELOPMENT_LOG.md`

### 2026-05-31 17:00 JST

作業:
- Plus向けフレームステッカー作成機能を追加。

ファイル:
- `app/(app)/snap.tsx`
- `app/(app)/crop.tsx`
- `lib/stickerFrames.ts`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-06-02 20:37 JST

作業:
- 認証入口画面の下部リンク見切れを修正。

ファイル:
- `app/(auth)/welcome.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-02 23:35 JST

作業:
- Appleログインのnonce不一致を修正。

ファイル:
- `components/auth/AppleSignInButton.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-02 23:59 JST

作業:
- 撮影後画面の戻る導線を改善。

ファイル:
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-03 00:12 JST

作業:
- 撮影画面の操作UIが撮影枠に重ならないよう調整。

ファイル:
- `app/(app)/snap.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-03 00:28 JST

作業:
- 撮影画面の下部操作UIの重なりを修正。

ファイル:
- `app/(app)/snap.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-03 00:42 JST

作業:
- 撮影枠を上寄せし、カメラ反転を右上へ移動。

ファイル:
- `app/(app)/snap.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-03 01:06 JST

作業:
- 色選択を7色に統一し、撮影画面の配置を調整。

ファイル:
- `constants/colors.ts`
- `lib/stickerFrames.ts`
- `components/BookCover/types.ts`
- `components/BookCover/utils.ts`
- `app/(app)/snap.tsx`
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-03 01:23 JST

作業:
- フレーム撮影範囲表示と撮影後プレビューを調整。

ファイル:
- `app/(app)/snap.tsx`
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-03 01:41 JST

作業:
- フレーム撮影の位置ずれと縁幅を修正。

ファイル:
- `app/(app)/snap.tsx`
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-03 02:02 JST

作業:
- フレーム撮影を専用の大きな撮影範囲に変更。

ファイル:
- `app/(app)/snap.tsx`
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-03 09:35 JST

作業:
- 有料判定をRevenueCatの状態でも反映。

ファイル:
- `lib/revenuecat.ts`
- `lib/accountStatus.ts`
- `app/(app)/snap.tsx`
- `app/(app)/crop.tsx`
- `app/(app)/home.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-03 12:46 JST

作業:
- フレームシール化時のプレビュー参照エラーを修正。

ファイル:
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-03 20:44 JST

作業:
- シール化完了画面に輪郭の発光演出を追加。

ファイル:
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-06 12:40 JST

作業:
- TestFlight初回用のiOSビルド番号を設定。
- Androidの音声録音権限が未設定であることを確認。

ファイル:
- `app.json`
- `DEVELOPMENT_LOG.md`

### 2026-06-06 13:05 JST

作業:
- Clipdrop依存を削除し、iOS・Androidの端末内切り抜きに統一。

ファイル:
- `lib/backgroundRemoval.ts`
- `lib/androidMlkitSubjectSegmentation.ts`
- `lib/storage.ts`
- `lib/clipdrop.ts`
- `.env.example`
- `DEVELOPMENT_LOG.md`

### 2026-06-13 12:55 JST

作業:
- EAS Buildの送信容量を削減する除外設定を追加。

ファイル:
- `.easignore`
- `DEVELOPMENT_LOG.md`

### 2026-06-13 14:35 JST

作業:
- TestFlight起動クラッシュの原因となったEAS Production環境変数不足を修正。

ファイル:
- `DEVELOPMENT_LOG.md`

### 2026-06-13 16:08 JST

作業:
- ホーム取得を軽量化し、Book先頭ページを事前読み込み。
- Bookページを表示中ページのみ遅延取得する方式に変更。

ファイル:
- `lib/storage.ts`
- `app/(app)/home.tsx`
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-13 22:10 JST

作業:
- シール化の工程別処理時間をログ出力。
- 処理画面の先行表示、経過時間表示、長時間処理案内を追加。

ファイル:
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-13 23:41 JST

作業:
- シールの選択範囲を共通化し、タップ判定と選択後の操作領域を拡張。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-14 00:22 JST

作業:
- 元写真アップロードを廃止し、撮影画像をローカルURIで処理する方式に統一。
- 既存の元写真とStorageバケットを削除。

ファイル:
- `app/(app)/camera.tsx`
- `app/(app)/crop.tsx`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-06-14 18:00 JST

作業:
- シール・フレーム・サムネイルのBase64変換を廃止し、ファイルを直接アップロード。

ファイル:
- `app/(app)/crop.tsx`
- `lib/storage.ts`
- `lib/backgroundRemoval.ts`
- `lib/appleSubjectLift.ts`
- `lib/androidMlkitSubjectSegmentation.ts`
- `docs/background-removal-platform-spec.md`
- `package.json`
- `package-lock.json`
- `DEVELOPMENT_LOG.md`

### 2026-06-14 19:05 JST

作業:
- 新規シールに64×64透明度マスクを保存し、回転・拡大を考慮した最前面タップ判定を実装。

ファイル:
- `lib/stickerAlphaMask.ts`
- `lib/storage.ts`
- `app/(app)/crop.tsx`
- `app/(app)/book-detail.tsx`
- `modules/peelzy-subject-lift/`
- `modules/peelzy-mlkit-subject-segmentation/`
- `DEVELOPMENT_LOG.md`

### 2026-06-14 21:10 JST

作業:
- シール帳のBook詳細とページ内容をAsyncStorageへキャッシュし、初期表示とページ移動時に先出し表示するよう変更。
- シール帳ページ取得のSupabase selectを表示に必要なカラムへ限定。
- シール・要素の追加、削除、移動、編集時にページキャッシュも更新。

ファイル:
- `lib/bookPageCache.ts`
- `lib/storage.ts`
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-14 21:35 JST

作業:
- シール画像を端末キャッシュへ保存してから表示する共通コンポーネントを追加。
- Book詳細、Collection、Home表紙プレビューのシール画像表示をローカルキャッシュ対応に変更。
- Homeの先頭ページプリフェッチをローカル画像キャッシュのウォームアップへ変更。
- Supabase Storageへアップロードするシール本体とサムネイルに長期cacheControlを設定。

ファイル:
- `lib/stickerImageCache.ts`
- `components/CachedStickerImage.tsx`
- `app/(app)/book-detail.tsx`
- `app/(app)/collection.tsx`
- `app/(app)/home.tsx`
- `components/BookCover/*`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-06-14 22:05 JST

作業:
- シール選択後、表示されている画像範囲をすぐドラッグできるよう選択中の操作エリアを拡張。
- 選択中でも別の最前面シールをタップして選択を移せるよう変更。
- ページ移動、画面離脱、アプリ非active時にシール帳キャンバスの選択状態を解除。
- シールのドラッグ制限を選択余白基準から中心点基準へ変更し、ページ端まで配置できるよう調整。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-14 22:35 JST

作業:
- シール帳詳細画面の右上「…」をページカラー変更シートに変更。
- Book設定更新時にログインユーザー条件を明示し、ページカラー単体更新APIを追加。
- シール帳選択画面の表紙カードを一回り大きくし、表紙サムネイルを5枚表示に変更。
- 選択中シールを最前面に上げ、Stampなどのページ要素と重なった後もすぐ動かしやすく調整。

検証:
- `npx tsc --noEmit`

ファイル:
- `app/(app)/book-detail.tsx`
- `app/(app)/home.tsx`
- `components/BookCover/*`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-06-16 JST

作業:
- 選択中Dockを `[✓] [− Size ＋] [↺ Turn ↻] [Move] [Peel/Delete]` のステッパー風UIへ変更。
- Moveタップ時にDockの上へページ選択ポップアップを表示し、現在ページを無効化。
- Page 1-5から移動先を選ぶと、画面は現在ページのまま、対象だけ指定ページへ移動するよう変更。
- 既存の端ドラッグによる隣ページ移動と左右端ターゲット表示を削除。

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-16 JST

作業:
- Collection画面の端末キャッシュを追加し、キャッシュ済みのシール一覧・Book・交換オファーを即表示するよう変更。
- Collection初期表示から`getUnplacedStickers()`の二重取得を外し、未配置シールは全シール一覧からローカル算出。
- シール一覧・交換オファー関連のSupabase selectを表示に必要なカラムへ限定。
- 交換オファーはUnplaced/Offersタブ表示時、または未配置シール詳細表示時に遅延取得するよう変更。
- 交換オファー0件の取得済み状態をキャッシュし、未取得の空配列と区別。

ファイル:
- `app/(app)/collection.tsx`
- `lib/collectionCache.ts`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-06-16 JST

作業:
- RPCを使わずにCollection差分同期を行うため、`stickers.updated_at`と`sticker_deletions`削除履歴テーブルのマイグレーションを追加。
- `stickers`更新時に`updated_at`を更新するtriggerと、削除時に削除履歴を記録するtriggerを追加。
- Collectionキャッシュに`lastStickerSyncAt`を保存し、次回以降はRESTで変更シールと削除IDだけ取得してローカル一覧へマージ。
- 差分同期に失敗した場合は全件取得へフォールバックするよう変更。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`

ファイル:
- `app/(app)/collection.tsx`
- `lib/collectionCache.ts`
- `lib/storage.ts`
- `supabase/migrations/20260616103036_add_collection_delta_sync.sql`
- `DEVELOPMENT_LOG.md`

### 2026-06-16 19:46 JST

作業:
- 写真撮影時と切り抜き保存時のハートフレーム形状を共通ヘルパーに統一。
- ハートフレームを左右対称で丸みのあるベジェ曲線に調整。
- ハートフレームのタップ判定用alpha maskも同じハート形状ベースへ変更。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/snap.tsx`
- `app/(app)/crop.tsx`
- `lib/stickerAlphaMask.ts`
- `lib/stickerFrameShapes.ts`
- `DEVELOPMENT_LOG.md`

### 2026-06-16 19:54 JST

作業:
- 撮影画面の`Dark / Auto / Bright`明るさ切り替えを削除。
- フラッシュ切り替えは既存のまま維持。
- タップフォーカスを連続タップでも再トリガーしやすいよう、タップごとにautofocusを再設定する処理へ整理。
- シャッターボタン位置を維持するため、削除した明るさボタン部分は空きスペースに変更。

ファイル:
- `app/(app)/snap.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-16 19:59 JST

作業:
- 交換オファーの有効期限が24時間であることを確認。
- CollectionのOffers一覧に、アクティブなオファーの残り時間と期限切れ表示を追加。
- Offers表示中に残り時間が1分ごとに更新されるように変更。

ファイル:
- `app/(app)/collection.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-16 20:19 JST

作業:
- シール化処理中のユーザー向け秒数カウント表示を削除。
- 内部の経過秒数計測は長時間処理メッセージ用に維持。
- 処理完了直後、完成シール画像が読み込まれるまでバウンド画面を表示し続けるよう変更。

ファイル:
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-16 20:28 JST

作業:
- 写真撮影後のシール化完了から`Add to Book`する際、Book選択後にPage 1-5を選べるよう変更。
- 新規Book作成時も、作成後すぐPage選択へ進むよう変更。
- Bookが0冊の状態でも、`Add to Book`から新規Book作成へ進めるよう変更。
- Add to Book完了後はHomeではなく対象Bookの対象ページへ遷移し、`refresh`付きでBook詳細を強制更新するよう変更。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/crop.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-16 21:02 JST

作業:
- 起動直後の空白感を減らすため、Peelzyロゴとキラキラの静止スプラッシュ画像を生成。
- `expo-splash-screen`を追加し、ネイティブスプラッシュをJS初期化まで保持するよう変更。
- フォント/Auth/オンボーディング確認中のJS待機画面を、Peelzyロゴのキラキラアニメーション画面へ変更。

検証:
- `npx expo config --type public --json`
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app.json`
- `app/_layout.tsx`
- `assets/splash-icon.png`
- `components/LaunchSplash.tsx`
- `package.json`
- `package-lock.json`
- `DEVELOPMENT_LOG.md`

### 2026-06-16 21:08 JST

作業:
- スプラッシュ画像を指定画像へ差し替え。
- 画像を高さ1280pxへリサイズし、約744KBまで軽量化。
- ネイティブ/JSスプラッシュを全画面`cover`表示に変更し、背景色を暗色へ合わせた。

検証:
- `npx expo config --type public --json`
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app.json`
- `assets/splash-icon.png`
- `components/LaunchSplash.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-16 21:25 JST

作業:
- Brutalistページ左上の`PEELZY PAGE`ラベルを削除。
- ホームの`My Books`とClassic表紙のシール帳名を、詳細画面タイトルと同じ`Nunito_900Black`へ統一。
- 新規シール帳作成時のデフォルト名を`New Book N`へ変更。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/home.tsx`
- `app/(app)/book-detail.tsx`
- `components/BookCover/ClassicCover.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-18 00:20 JST

作業:
- ネイティブ/JSスプラッシュ後にホームの初回スケルトン画面が一瞬表示される問題を修正。
- ホームの初回データ取得中は同じ`LaunchSplash`を表示し続け、空の`My Books`画面を見せないよう変更。
- 未使用になったホームのスケルトンカード処理を削除。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/home.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-18 00:45 JST

作業:
- シール帳詳細のページカラー更新失敗原因を調査。
- アプリの現行カラーパレットとSupabaseの`books_page_color_check`/`books_accent_color_check`制約がずれていたため、DB制約を現行7色へ揃えるマイグレーションを追加。
- 既存の古い色値は近い現行色へ変換してから制約を張り直すようにした。
- Book設定/ページカラー/課金まわりのエラー表示を英語へ統一。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/book-detail.tsx`
- `app/(app)/home.tsx`
- `supabase/migrations/20260618002500_align_book_color_constraints.sql`
- `DEVELOPMENT_LOG.md`

### 2026-06-18 12:10 JST

作業:
- Moveで別ページへ移動した後、ページ再取得の古い結果が戻って表示を上書きする競合を調査。
- ページごとのローカル更新バージョンを追加し、Move後の古い取得結果を破棄するよう変更。
- シール/Stamp/TextのMove時に移動元・移動先のキャッシュを即時更新し、DB更新後は両ページを再取得して整合させるよう修正。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`

### 2026-06-19 00:05 JST

作業:
- シール帳詳細の選択DOCから全体の灰色背景・枠・影を削除し、各ボタンが単体で浮く表示へ変更。
- `Layer`ボタンを追加し、Size/Turnと同じ上ポップアップで選択中のシール/Stamp/Textを前面・背面へ移動できるようにした。
- レイヤー順をシールは`metadata.layerOrder`、Stamp/Textは`style.layerOrder`へ保存し、再表示後も重なり順が維持されるようにした。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/book-detail.tsx`
- `lib/storage.ts`
- `DEVELOPMENT_LOG.md`

### 2026-06-19 00:35 JST

作業:
- シール帳詳細でシール/Stamp/Textが重なった位置をタップした時、共通のレイヤー順で最前面のオブジェクトを選択するよう修正。
- 描画もシール/Stamp/Textを共通レイヤーリストで行い、見た目の最前面とタップ選択の最前面が一致するようにした。
- `Layer`操作をシール同士/要素同士だけでなく、シールとStamp/Textをまたいで上下移動できるよう共通化。

検証:
- `./node_modules/.bin/tsc --noEmit --pretty false`
- `git diff --check`

ファイル:
- `app/(app)/book-detail.tsx`
- `DEVELOPMENT_LOG.md`
