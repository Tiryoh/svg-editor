# TODO

## タスク2: ストロークのアウトライン化（完了）

- [x] paper.js + paperjs-offset で実装 → UMD互換性問題で断念
- [x] ブラウザ標準 SVG API（`getPointAtLength`）でのアウトライン化に切替
- [x] 破線（`stroke-dasharray`）のセグメント分割対応
- [x] round cap のえぐれ修正 — arc sweep direction が逆だった（`0 0 1` → `0 0 0`）
- [x] 端点のキャップ座標をサンプリングから独立して正確に計算するよう改善
- [x] 複雑なパス（曲線の鋭角部分等）でのアウトライン品質検証 — テストSVG追加+e2eテスト
- [x] アウトライン化後に「目視確認してください」のメッセージ表示（設計書の要件）

## タスク3: 色パレットの精度向上（完了）

- [x] CSS継承によるfill/stroke（親要素やclass指定）の取得改善
- [x] `getComputedStyle` ベースへの統一（現状は属性優先で不完全）
- [x] `style` 属性内のインライン指定への対応

## e2eテスト（別途進行）

- 28テスト全 passed

## その他

- [ ] paper.js は現在未使用（`strokeToPath.ts` から除去済み）だが `dependencies` に残っている → 削除可能
- [ ] テスト用SVG `public/test.svg`, `public/test-strokes.svg`, `public/test-round-cap.svg` はビルドに含まれる → 本番では除外検討
