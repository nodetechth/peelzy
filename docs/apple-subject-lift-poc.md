# Apple Subject Lift PoC 方針

## 方針

- iOSはApple Subject Liftを優先候補にする。
- Apple Subject Liftが未対応・失敗した場合はClipdropへフォールバックする。
- Androidは当面Clipdropを継続する。
- MobileSAMは精度面の懸念が大きいため保留する。

## 現在の実装

- `lib/backgroundRemoval.ts` で切り抜き処理の入口を一本化。
- iOSで `PeelzySubjectLift` ネイティブモジュールが存在する場合だけApple Subject Liftを試す。
- Expo GoやAndroidではネイティブモジュールが存在しないため、自動的にClipdropを使う。

## 次のPoC

1. iOS Dev ClientまたはXcodeビルド用のブランチを切る。
2. `PeelzySubjectLift` ネイティブモジュールをSwiftで実装する。
3. 同じ写真でApple Subject LiftとClipdropの品質・速度を比較する。
4. 品質が十分ならiOSだけApple Subject Liftを本採用する。

## 注意

- Apple Subject LiftはExpo Goでは動かない。
- 本格導入にはDev Client化またはXcodeビルドが必要。
- Androidの代替処理は別途検討が必要。
