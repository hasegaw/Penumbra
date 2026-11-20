# PENUMBRA

H. INNOVATION CINEMA のブラウザ向け3D短編。映像とステレオ音声は WebGL と Web Audio でリアルタイムに描画・合成する。

[GitHub Pages で上映する](https://hasegaw.github.io/Penumbra/)

## ローカル上映

リポジトリ直下で次を実行し、[ローカル上映](http://127.0.0.1:8766/)を開く。Python 3.8 以降で動作する。

```sh
python3 tools/serve.py
```

同じ LAN の iPhone から確認するときは次を使う。iPhone の Safari で、上映用 Mac の LAN アドレスとポート 8767 を指定する。

```sh
python3 tools/serve.py --bind 0.0.0.0 --port 8767
```

ロード演出の検証では、次のコマンドで合計 768 kbit/s、各応答に 120 ms の遅延を設定できる。複数の接続で帯域を分け合う。テスト用 URL のパスは `/Penumbra/` で、再読み込みのたびにアセットをダウンロードする。

```sh
python3 tools/serve.py --bind 0.0.0.0 --port 8768 --kbps 768 --latency-ms 120 --prefix /Penumbra/
```

ファイルから上映する場合は `cinema/index.html` をブラウザで開く。再生ボタンで音声が始まる。

## MP4 を書き出す

Google Chrome、Node.js 20 以降、FFmpeg と ffprobe を用意し、リポジトリ直下から実行する。

```sh
npm ci --prefix tools/render
node tools/render/render.mjs
```

Chrome が 1920×1080 の各フレームをフィルム時刻から描画する。標準は 24 fps、90 秒で 2,160 枚。黒画面での合図から始まり、機体番号、タイトル、シーン間のフェードも入る。Web Audio で同じ時刻のカメラ位置に沿ってステレオ音声を合成する。

出力先は `renders/<日時>/`。`frames/` に連番 PNG、`score.wav` に 48 kHz ステレオ音声、`PENUMBRA.mp4` にトーンマッピング済みの SDR 映像（H.264）と音声（AAC）を保存する。`--out` で空の出力先、`--fps` で 24・25・30・50・60 fps を選べる。

## リポジトリと公開

- `cinema/` に上映ページ、JavaScript、スタイル、画像、フォント、Three.js と各ライセンスをまとめている。すべての依存アセットを同梱している。
- `tools/` にローカルで上映と読み込み検証に使うサーバーを置いている。
- ルートの `index.html` はファイルから上映ページを開くための入口。

GitHub Pages の Source は **GitHub Actions**。`main` に上映用ファイルを push すると `cinema/` をサイトのルートに公開する。Actions の **Deploy cinema to GitHub Pages** からも手動実行できる。

## ライセンス

PENUMBRA のオリジナルコードと素材は MIT License で配布する。[本作のライセンス](LICENSE)

同梱の Three.js は MIT License、Barlow Condensed と IBM Plex Mono は SIL Open Font License 1.1 で配布されている。[Three.js](cinema/assets/vendor/three-LICENSE.txt)・[Barlow Condensed](cinema/assets/fonts/barlow-condensed-LICENSE.txt)・[IBM Plex Mono](cinema/assets/fonts/ibm-plex-mono-LICENSE.txt)

GitHub アイコンには [Primer Octicons の MIT License](cinema/assets/icons/octicons-LICENSE.txt) が適用される。
