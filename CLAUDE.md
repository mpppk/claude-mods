# claude-mods

Claude Code の mod（function hooks のプラグイン）を複数置くリポジトリ。リポジトリ直下の `.claude-plugin/marketplace.json` がマーケットプレイスで、各 mod は `mods/<name>/` に 1 プラグインずつ置く。

## mod を追加するとき

1. `mods/<name>/` を作る。`<name>` は小文字・数字・ハイフンのみで、フォルダ名・`plugin.json` の `name`・marketplace のエントリ名をそろえる。
2. 最低限のファイル:
   - `.claude-plugin/plugin.json`: `name` / `version` / `description` / `author` / `license`（`MIT`）。`$.state` を使うなら `"types": "./types/index.d.ts"`、設定があるなら `userConfig`。
   - `hooks/hooks.json`: `{ "modules": ["./register.ts"] }`
   - `hooks/register.ts`: `export const register: Register = (on, options) => { ... }`
   - `tsconfig.json`: `{ "extends": "./.claude-plugin/types/tsconfig.json" }`
   - `README.md`: 何をするか、設定、しくみ（日本語）
3. `.claude-plugin/marketplace.json` の `plugins` にエントリを足し、ルートの `README.md` の mod 一覧に 1 行足す。
4. `scripts/check.sh <name>` が通ることを確認する。

## 書き方の約束

- `$` を受け取るヘルパー関数はファイルのトップレベルに `function` で書く（`register` 内のクロージャに `$` を渡すと `claude plugin validate` が拒否する）。
- モジュール変数はホットリロードで消える。セッション中に残したい値は `$.state`（`types/index.d.ts` の `PluginState` に宣言）、セッションをまたぐ値は `$.store`。
- 観察するだけの hook は挙動を変えない: `next(e)` の結果をそのまま返し、ゲートになるイベント（`classic.*` など）には `.catch(($, e, next) => next(e))` を付ける。
- 純粋なロジックは別ファイル（例: `hooks/cache.ts`）に分け、テストから直接呼べるようにする。
- テストは `tests/*.test.ts`。エンジン側の応答はテスト内の `on(...)` で用意し、時間は `mock.clock` で進める。

## チェック

- `scripts/check.sh [<name>...]`: `claude plugin validate` → `tsc -p`（型が置かれていれば）→ `claude plugin test`
- API の型は Claude Code が mod を読み込んだときに `mods/<name>/.claude-plugin/types/` に書き出す（gitignore 済み）。一度も読み込んでいない環境では `tsc` はスキップされる。
- API はアーリーアクセスで、リリースごとに変わりうる。型ファイル（`.claude-plugin/types/claude-code/index.d.ts`）が正。
