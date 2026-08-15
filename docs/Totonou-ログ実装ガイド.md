# Totonou ログ実装ガイド（VibeLogger採用）

- 参考: 深津貴之氏「バイブコーディングを加速させる Vibe Logger入門チュートリアル」（note）
  https://note.com/fladdict/n/n5046f72bdadd
- ライブラリ: https://github.com/fladdict/vibe-logger （npm: `vibelogger`）
- 位置づけ: 要件定義書 非機能要件「構造化ログ」の実装方式。S2（処理履歴）・M4（日報下書き）と共用

---

## 1. なぜTotonouにVibeLoggerか

VibeLoggerは「AIエージェントがログから自律的に状況を把握できる」ことを狙った構造化ロガー。
operation / context / human_note / ai_todo をJSONで記録する。

Totonouでは3つの用途に効く:

1. **開発デバッグ**: Claude Code / Devin に「./logs を読んで原因を調べて」と投げられる
2. **S2 処理履歴**: 「32件処理、要返信2件をタスク化」の表示はログの集計そのもの
3. **M4 日報下書き**: 「今日何をしたか」をAIが書く材料。ログがAI可読であるほど日報の質が上がる

## 2. アーキテクチャ（重要）

**Vercelのファイルシステムは揮発する**ため、VibeLogger標準のファイル出力だけでは本番ログが残らない。
→ 薄いラッパー `lib/logger.ts` を1枚挟み、環境で出力先を切り替える:

```
開発(ローカル):  vibelogger → ./logs/totonou/*.log   ← Claude Code/Devinが読む
本番(Vercel):   Supabase `activity_logs` テーブル    ← S2表示・M4材料・障害調査
共通:           console(構造化JSON)                  ← Vercelのログビューにも残る
```

アプリコードは必ずラッパー経由で記録する（vibeloggerを直接importしない）。
npm版のAPIがPython版と細部で異なる可能性があるため、**実装前にGitHubのREADMEで
シグネチャを確認**すること（ラッパーに差異を閉じ込めるのが目的）。

## 3. セットアップ

```bash
npm install vibelogger
```

Supabaseにテーブル追加:

```sql
create table activity_logs (
  id           bigint generated always as identity primary key,
  ts           timestamptz not null default now(),
  level        text not null,             -- INFO / WARN / ERROR
  operation    text not null,             -- 命名規約は §4
  message      text not null,
  correlation_id text,                    -- 1回のメールチェック等を貫くID
  context      jsonb,
  human_note   text,
  ai_todo      text
);
create index on activity_logs (ts desc);
create index on activity_logs (operation);
create index on activity_logs (correlation_id);
```

## 4. Totonou operation 命名規約（動詞_名詞_詳細）

| operation | 記録タイミング | contextに必ず入れるもの |
|---|---|---|
| `fetch_mail_batch_start` / `_complete` | メールチェックボタン押下/完了 | fetch_range, query, fetched_count |
| `triage_exclude_rule` | 機械的除外の適用 | rule(promotions/noreply/domain), excluded_count |
| `triage_classify` | AI分類1件ごと | message_id, category, priority, task_type, reason |
| `task_create` | タスク生成 | task_id, source(email/manual/calendar), message_id? |
| `task_start` / `task_complete` | 開始/完了ボタン | task_id, elapsed_min(完了時) |
| `reply_draft_generate` | 返信案生成 | message_id, model, tokens_in/out |
| `reply_send` | 承認送信 | message_id, thread_id, approved_by_user: true |
| `mark_as_read` | 既読化 | message_id, success |
| `review_generate` | 夜の日報下書き | date, tasks_done, total_min |
| `voice_coach_speak` | 声かけ | trigger(start/pomodoro/idle), persona, tts(aivis/webspeech) |
| `api_error` | 外部API失敗 | service(gmail/claude/aivis/supabase), status, retry |

相関ID: 1回のメールチェック処理は `chk_<uuid>` を correlation_id にして全ログを紐づける
（「このチェックで何が起き、何がタスク化されたか」をAIが一発で追える）。

## 5. ラッパー実装の骨子（lib/logger.ts）

```ts
// 使い方: await log.info("triage_classify", "分類完了", { context, humanNote, aiTodo })
// - dev:  vibelogger でファイル出力（./logs/totonou/）
// - prod: Supabase activity_logs へ insert ＋ console.log(JSON)
// - 失敗してもアプリ本体を落とさない（try/catchで握る）

type LogEntry = {
  operation: string;
  message: string;
  context?: Record<string, unknown>;
  humanNote?: string;   // 人間への説明
  aiTodo?: string;      // AIへの依頼（例: リトライ実装を提案して）
  correlationId?: string;
};

export const log = {
  info:  (op: string, msg: string, e?: Partial<LogEntry>) => write("INFO",  op, msg, e),
  warn:  (op: string, msg: string, e?: Partial<LogEntry>) => write("WARN",  op, msg, e),
  error: (op: string, msg: string, e?: Partial<LogEntry>) => write("ERROR", op, msg, e),
};
// write() 内で環境判定して振り分け。実装はClaude Codeに本ガイドを渡して生成させる
```

記録ルール:

- context はフラットにせず構造化する（`{ user: {...}, mail: {...}, timing: {...} }`）
- human_note は「人間への説明」、ai_todo は「AIへの依頼」を書き分ける
- **本文・氏名・アドレスなど個人情報はログに入れない**（message_idで参照。デモ画面にログを映すため必須）
- 秘密情報（トークン・APIキー）は絶対に記録しない

## 6. CLAUDE.md への追記（コピペ用）

```
### ロギング ###
* 本プロジェクトのログは lib/logger.ts（VibeLogger方式）経由で記録する。console.log直書き禁止
* operation命名・context構造は docs/Totonou-ログ実装ガイド.md の規約に従う
* 新しい処理を実装したら、開始・成功・失敗の3点でログを入れる
* human_note には人間向けの補足、ai_todo にはAIへの改善依頼を書く
* デバッグ時は ./logs/totonou/ を読み、correlation_id で処理を追跡する
```

## 7. S2・M4 との接続

- **S2 処理履歴**: `activity_logs` を correlation_id でグルーピングして表示するだけ。
  例: 「chk_xxx: 32件取得 → 除外28件 → AI分類4件 → タスク化2件（8:05）」
- **M4 日報下書き**: 当日の `task_*` / `fetch_*` / `reply_*` ログを日報生成プロンプトの
  材料として渡す。VibeLoggerの構造化がそのままプロンプトの品質になる

## 8. スコープ注意（3日ハッカソン）

- やる: ラッパー1枚＋上記operationの記録＋activity_logsテーブル
- やらない: ログ検索UI、ダッシュボード、ローテーション運用、外部監視連携（Won't）
- Devinへの依頼単位: 「§3のテーブル作成＋§5のラッパー実装＋fetch/triage系への組み込み」で1タスク
