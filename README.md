# Totonou

一日を整えるAI秘書。

メール・タスク・予定を朝のブリーフィングにまとめ、開始・完了操作から実績時間を記録し、夜の日報を下書きします。

## 主な機能

- 朝の3秒サマリー、今日の目標、予定、優先度×性質で整理したタスク
- Gmailの機械的除外とAIトリアージ、要返信・要対応メールのタスク化
- タスクの開始・完了、所要時間計測、Gmail既読化
- 25分集中＋5分休憩のポモドーロとテキスト声かけ
- 元メール、AI要約、分類理由、編集可能な返信案、承認後の送信
- 日程候補抽出、予定競合の警告、承認後のGoogle Calendar登録
- 予定対実績、日報下書き、未完了タスク持ち越し、HTMLエクスポート
- correlation ID単位の処理履歴
- 返信文体の学習、Xserver IMAP/SMTPアダプター
- 週次集計、過去の自分の言葉を根拠にした「今週の自分褒め」
- Supabase Auth Google OAuthと全テーブルのRLS

APIキーがない環境では、30件の架空メールと1週間分の実績を使う決定論的デモモードで全画面を操作できます。

## 技術構成

- Next.js 16 App Router / React 19 / TypeScript
- Tailwind CSS 4 / shadcn/ui / Base UI / lucide-react
- Anthropic SDK
- Supabase Database / Auth / RLS
- Gmail API / Google Calendar API
- imapflow / nodemailer
- VibeLogger
- Vitest / Testing Library

## セットアップ

必要環境:

- Node.js 24以上
- npm 11以上

```bash
npm install
cp .env.example .env.local
npm run dev
```

`http://localhost:3000` を開きます。環境変数を空のままにするとデモモードになります。

## 環境変数

`.env.example` を参照してください。秘密情報は `.env.local` またはVercelの環境変数に設定し、コミットしないでください。

主要な設定:

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトURL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase公開キー |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー側ログ保存などの管理処理 |
| `ANTHROPIC_API_KEY` | トリアージ・返信案・日報生成 |
| `GOOGLE_*` | Gmail / Calendarのサーバー連携 |
| `XSERVER_*` | IMAP / SMTP連携 |

GoogleログインはSupabaseのGoogle Providerを有効にし、GmailとCalendarのスコープをGoogle Cloud側で許可してください。未審査の開発中アプリでは、利用者をテストユーザーへ追加します。

## Supabase

`supabase/migrations/202608150001_initial_schema.sql` を適用します。

マイグレーションには以下が含まれます。

- messages / tasks / task_sessions / calendar_events
- daily_reviews / weekly_reviews / praise_posts
- reply_drafts / mail_style_profiles / settings
- activity_logs
- ユーザー単位のRLS
- 同一ユーザーが同時に実行できるタスクを1件に制限する部分ユニークインデックス

## コマンド

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run check
npm run seed
```

`npm run seed` はデモデータの件数と整合性を確認するだけで、データベースを変更しません。

## アーキテクチャ

```text
src/app                 画面とRoute Handler
src/components          画面、状態管理、shadcn/ui
src/lib/domain          純粋な業務ロジック
src/lib/server          Anthropic、Supabase、Gmail、Calendar、Xserver
src/lib/logger.ts       VibeLogger / Supabase / consoleの共通ラッパー
supabase/migrations     DBスキーマ、制約、RLS
```

ブラウザのデモ状態はlocalStorageに保存されます。本番連携はRoute Handler内のサーバー専用アダプターを通り、APIキーやOAuthトークンをクライアントへ渡しません。

## 安全設計

- 返信送信と予定登録は `approvedByUser: true` を必須にする
- Gmail返信は `threadId` のみを使い、`inReplyTo` を送らない
- Gmail既読化は `removeLabelIds: ["UNREAD"]` のみを使う
- 1回のメール取得を100件に制限する
- 本文、氏名、アドレス、トークン、APIキーをログから再帰的に除去する
- 本番ログはSupabase、開発ログは `logs/totonou/` に保存する
- 音声合成は行わず、声かけは画面上のテキストだけにする

## 要件

- `docs/Totonou-要件定義書-v1.md`
- `docs/Totonou-ログ実装ガイド.md`
