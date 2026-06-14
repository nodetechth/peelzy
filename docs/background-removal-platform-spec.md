# 背景除去プラットフォーム仕様

## 方針

- iOSはApple Subject Liftを本採用する。
- AndroidはGoogle ML Kit Subject Segmentationを本採用する。
- 背景除去は両OSとも端末内で完結させ、外部APIへ画像を送信しない。
- MobileSAMは精度面の懸念があるため保留する。

## 対象範囲

- 対象機能: 写真をステッカー化する背景除去処理。
- 対象画面: `crop` から呼び出される切り抜き処理。
- 対象外: 交換、シール帳、課金、Supabase保存後の表示処理。

## 実装仕様

背景除去の入口は共通関数に集約する。

```ts
removeBackground(imageUri)
```

内部の分岐:

- `Platform.OS === 'ios'`: Apple Subject Liftを使用する。
- `Platform.OS === 'android'`: Google ML Kit Subject Segmentationを使用する。
- `Platform.OS === 'web'`: 背景除去を提供しない。

ネイティブ背景除去が利用できない場合でも外部APIへフォールバックしない。Expo Goなど、ネイティブモジュールを使えない環境ではエラーを表示する。

## iOS仕様

- Apple Visionの前景マスク処理で主体領域を取得する。
- 処理結果は透過PNGとして扱う。
- PoCでは品質が十分だったため、外部APIへ戻さない。
- 本体統合後はExpo Goでは動作しない。
- 実行・検証はXcodeまたはDev Clientで行う。

## 最終シール形状

AIが返す前景マスクをそのまま最終輪郭にしない。

- 単一前景も複数パーツ前景も、前景全体を包む丸みのある一体輪郭を標準にする。
- 輪郭内は元写真を残し、分断された前景の間も元背景でつなぐ。
- 輪郭外は透明にし、外周に白いシール縁を付ける。
- 切り抜きAIは前景推定までを担当し、シール形状はPeelzy側の後処理で整える。

iOS PoCでは、元画像座標の前景マスクを膨張・平滑化して一体輪郭を作る。輪郭の余白、丸み、縁幅は単体物と複数小物の写真を見ながら調整する。

## Android仕様

- Google ML Kit Subject Segmentationを使用する。
- 独立PoCと本体アプリ実機検証で前景PNGの品質を確認済み。
- 安定経路は入力最大辺を抑え、複数subject個別取得を使わず前景bitmapを使う。
- iOSと同じシール形状後処理へ寄せる。
- ML Kitが失敗した場合はエラーを表示し、外部APIへ画像を送信しない。

## 戻り値の考え方

アプリ内部では「透過PNGのURI」を標準形式に寄せる。

- Apple Subject Lift: 透過PNGファイルURIを返す。
- Android ML Kit: 透過PNGファイルURIを返す。
- Supabase保存時は、完成PNGのローカルURIからArrayBufferを読み込み、Base64を経由せず直接アップロードする。

この形にすることで、両OSで呼び出し側を共通化する。

## DBとデータ移行

DBスキーマの追加は不要。

理由:

- 既存の `stickers.metadata` はJSONBで、処理方式や計測値を追加保存できる。
- 過去のステッカーは `backgroundRemovalProvider` が未設定でも表示・交換・配置に影響しない。
- 既存データを一括更新する必要はない。

新規ステッカーには以下を `metadata` に保存する。

- `backgroundRemovalProvider`: `apple-subject-lift` または `android-mlkit`
- `backgroundRemovalElapsedMs`: 背景除去の処理時間
- `subjectCount`: 検出した主体数

## 開発・検証方針

- iOS実装を先行する。
- AndroidはML Kitを実機検証する。
- 本体アプリには、プラットフォーム分岐以外の余計な条件を増やさない。
- 品質、速度、失敗時の表示は実機で確認する。

## 開発ロードマップ

1. Book / Collection / Offer / Accountなど既存機能のUXを固める。
2. 保存、同期、表示反映の不具合を潰す。
3. 課金、月間枚数制限、運営上必要な仕様を固める。
4. iOS Apple Subject Liftを本体へ統合する。
5. Android ML Kitを本体へ統合する。

背景除去の本体統合は最後寄りにする。理由は、Apple Subject Lift導入後はExpo Go中心の検証からXcode/Dev Client中心に変わり、UI調整や軽微な確認のサイクルが重くなるため。

## Expo GoからXcode/Dev Clientへ移る影響

デメリット:

- Expo Goだけで動作確認できなくなる。
- 初回ビルド、Xcode設定、署名設定の手間が増える。
- ネイティブ依存を追加した後は、依存変更時に再ビルドが必要になる。
- iOS実機確認のサイクルがExpo Goより少し長くなる。
- チーム開発時はXcode/証明書/Provisioning Profileの環境差が出やすい。
- EAS BuildやApp Store配布の設定を早めに整える必要がある。

受け入れる理由:

- Apple Subject Liftの品質が高く、ステッカー化体験の中心価値に直結する。
- 外部背景除去APIの利用料が不要になる。
- 処理が端末内で完結し、速度とプライバシー面で有利。
- MVPがスマホアプリ中心のため、実機ビルド前提に移行する価値がある。

## 関連ファイル

- `lib/backgroundRemoval.ts`
- `lib/appleSubjectLift.ts`
- `lib/androidMlkitSubjectSegmentation.ts`
- `app/(app)/crop.tsx`
- `modules/peelzy-subject-lift/*`
- `modules/peelzy-mlkit-subject-segmentation/*`
- `pocs/apple-subject-lift-poc/*`
- `pocs/android-mlkit-subject-segmentation-poc/*`
