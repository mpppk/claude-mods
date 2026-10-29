# claude-mods

Claude Code の mod（function hooks で動くプラグイン）を集めたリポジトリです。リポジトリ全体が 1 つのマーケットプレイスになっていて、mod を 1 つずつインストールできます。

## mod 一覧

| mod | 内容 |
| --- | --- |
| [cache-timer](mods/cache-timer) | プロンプトキャッシュの残り時間をステータス行に控えめに表示 |

## インストール

ターミナルの Claude Code のプロンプトで:

```
/plugin install cache-timer --marketplace mpppk/claude-mods
```

マーケットプレイスの追加を聞かれたら `y`、スコープはそのまま Enter で user スコープです。

シェルからなら:

```bash
claude plugin install cache-timer --marketplace mpppk/claude-mods
```

デスクトップアプリでは、プロンプト欄の横の + → Plugins → Add marketplace に `mpppk/claude-mods` を入れ、Add plugin から選びます。

## 構成

```
.claude-plugin/marketplace.json   マーケットプレイス（mod ごとに 1 エントリ）
mods/<mod>/                       mod 1 つ = プラグイン 1 つ
  .claude-plugin/plugin.json      マニフェスト
  hooks/hooks.json                hooks モジュールの指定
  hooks/register.ts               hooks モジュール本体
  types/index.d.ts                $.state の型契約（使う mod のみ）
  tests/*.test.ts                 claude plugin test で走るテスト
  README.md
scripts/check.sh                  全 mod の validate / tsc / test
```

## 開発

手元の作業コピーをそのまま読み込ませて試すには:

```bash
claude --plugin-dir ./mods/cache-timer
```

ファイルを保存するとセッション中に自動でリロードされます。チェックは:

```bash
scripts/check.sh
```

新しい mod の追加手順は [CLAUDE.md](CLAUDE.md) にまとめています。
