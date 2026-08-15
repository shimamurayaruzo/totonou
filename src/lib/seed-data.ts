import type {
  ActivityLog,
  AppState,
  CalendarEvent,
  DailyReview,
  GmailCategory,
  JsonObject,
  MailAccount,
  Message,
  PraisePost,
  Settings,
  Task,
  TaskPriority,
  TaskType,
  TriageCategory,
  TriageReasonCode,
  TriageResult,
  WeeklyReview,
} from "./types";

export const DEMO_USER_ID = "demo-user-001";
export const DEMO_TIME_ZONE = "Asia/Tokyo";

interface MessageDecisionSeed {
  readonly category: TriageCategory;
  readonly priority: TaskPriority | null;
  readonly taskType: TaskType | null;
  readonly summary: string;
  readonly reason: string;
  readonly reasonCode: TriageReasonCode;
  readonly confidence: number;
}

interface MessageSeed {
  readonly fromName: string;
  readonly fromAddress: string;
  readonly subject: string;
  readonly body: string;
  readonly category: GmailCategory;
  readonly account: MailAccount;
  readonly decision: MessageDecisionSeed | null;
}

const messageSeeds: readonly MessageSeed[] = [
  {
    fromName: "青空企画 担当窓口",
    fromAddress: "contact@aozora-kikaku.example",
    subject: "次回打ち合わせの日程候補について",
    body: "来週の打ち合わせは火曜午前か水曜午後でいかがでしょうか。ご都合をお知らせください。",
    category: "forums",
    account: "gmail",
    decision: {
      category: "needs_reply",
      priority: "urgent",
      taskType: "sukima",
      summary: "打ち合わせ候補日の確認依頼",
      reason: "候補日への回答が求められています。",
      reasonCode: "schedule_coordination",
      confidence: 0.98,
    },
  },
  {
    fromName: "こもれび制作 見積窓口",
    fromAddress: "estimate@komorebi-studio.example",
    subject: "お見積書の内容確認をお願いします",
    body: "試作案件のお見積書を更新しました。数量と納期の欄をご確認ください。",
    category: "primary",
    account: "goodsystem",
    decision: {
      category: "needs_action",
      priority: "urgent",
      taskType: "jikkuri",
      summary: "更新された見積書の確認",
      reason: "数量と納期の確認作業が必要です。",
      reasonCode: "document_review",
      confidence: 0.96,
    },
  },
  {
    fromName: "ひだまり編集室",
    fromAddress: "editor@hidamari-press.example",
    subject: "紹介記事の初稿をご確認ください",
    body: "紹介記事の初稿が整いました。表現と掲載画像について金曜までにご意見をお願いします。",
    category: "forums",
    account: "gmail",
    decision: {
      category: "needs_reply",
      priority: "today",
      taskType: "jikkuri",
      summary: "紹介記事の初稿確認と返信",
      reason: "期限付きで意見の返信が求められています。",
      reasonCode: "document_review",
      confidence: 0.97,
    },
  },
  {
    fromName: "みなも事務局",
    fromAddress: "billing@minamo-office.example",
    subject: "今月分の請求手続きのご案内",
    body: "今月分の請求内容をポータルに登録しました。期日までに確認操作をお願いします。",
    category: "updates",
    account: "goodsystem",
    decision: {
      category: "needs_action",
      priority: "today",
      taskType: "sukima",
      summary: "請求内容の確認操作",
      reason: "期日までの確認操作が必要です。",
      reasonCode: "deadline_detected",
      confidence: 0.94,
    },
  },
  {
    fromName: "つむぎ勉強会 運営",
    fromAddress: "community@tsumugi-lab.example",
    subject: "次回勉強会の発表順について",
    body: "次回の発表順を調整しています。第二希望まで返信をお願いします。",
    category: "forums",
    account: "gmail",
    decision: {
      category: "needs_reply",
      priority: "today",
      taskType: "sukima",
      summary: "勉強会の発表順を返信",
      reason: "希望順の回答が求められています。",
      reasonCode: "direct_question",
      confidence: 0.95,
    },
  },
  {
    fromName: "そよかぜ分析室",
    fromAddress: "report@soyokaze-data.example",
    subject: "週次アクセスレポートを共有します",
    body: "今週の集計レポートを共有します。前週比は資料内に記載しています。",
    category: "updates",
    account: "goodsystem",
    decision: {
      category: "information",
      priority: null,
      taskType: null,
      summary: "週次アクセスレポートの共有",
      reason: "確認依頼や返信依頼はありません。",
      reasonCode: "informational_only",
      confidence: 0.93,
    },
  },
  {
    fromName: "架空マーケット",
    fromAddress: "offers@fictional-market.example",
    subject: "今週限定のおすすめ特集",
    body: "デモ用の架空キャンペーン情報です。期間限定の特集をご案内します。",
    category: "promotions",
    account: "gmail",
    decision: null,
  },
  {
    fromName: "デモ交流サービス",
    fromAddress: "notice@demo-social.example",
    subject: "新しいリアクションがあります",
    body: "デモ用プロフィールに新しいリアクションが届きました。",
    category: "social",
    account: "gmail",
    decision: null,
  },
  {
    fromName: "あかつきクラウド",
    fromAddress: "no-reply@akatsuki-cloud.example",
    subject: "定期メンテナンスのお知らせ",
    body: "日曜未明にデモ環境の定期メンテナンスを実施します。操作は不要です。",
    category: "updates",
    account: "goodsystem",
    decision: null,
  },
  {
    fromName: "木の葉ニュース",
    fromAddress: "news@konoha-letter.example",
    subject: "今月のプロダクト便り",
    body: "架空プロダクトの更新情報をまとめた月次便りです。",
    category: "updates",
    account: "gmail",
    decision: null,
  },
  {
    fromName: "しずくデザイン",
    fromAddress: "desk@shizuku-design.example",
    subject: "参考資料を受領しました",
    body: "先ほど参考資料を受領しました。ご共有ありがとうございました。",
    category: "primary",
    account: "goodsystem",
    decision: {
      category: "information",
      priority: null,
      taskType: null,
      summary: "参考資料の受領連絡",
      reason: "受領報告のみで追加対応は不要です。",
      reasonCode: "informational_only",
      confidence: 0.91,
    },
  },
  {
    fromName: "月灯りプロジェクト",
    fromAddress: "team@tsukiakari-project.example",
    subject: "打ち合わせ場所の確認",
    body: "明日の打ち合わせはオンライン開催でよいでしょうか。変更があればお知らせください。",
    category: "forums",
    account: "gmail",
    decision: {
      category: "needs_reply",
      priority: "urgent",
      taskType: "sukima",
      summary: "打ち合わせ形式の確認返信",
      reason: "開催形式について質問されています。",
      reasonCode: "direct_question",
      confidence: 0.97,
    },
  },
  {
    fromName: "白波リサーチ",
    fromAddress: "survey@shiranami-research.example",
    subject: "簡単な事前アンケートのお願い",
    body: "次回相談に向けた三問の事前アンケートです。前日までに入力をお願いします。",
    category: "primary",
    account: "gmail",
    decision: {
      category: "needs_action",
      priority: "anytime",
      taskType: "sukima",
      summary: "事前アンケートへの回答",
      reason: "期限までのフォーム入力が必要です。",
      reasonCode: "explicit_request",
      confidence: 0.92,
    },
  },
  {
    fromName: "若葉クリエイティブ",
    fromAddress: "review@wakaba-creative.example",
    subject: "デザイン案二案のレビュー依頼",
    body: "表紙デザインを二案用意しました。方向性と修正点をご確認ください。",
    category: "primary",
    account: "goodsystem",
    decision: {
      category: "needs_action",
      priority: "today",
      taskType: "jikkuri",
      summary: "表紙デザイン二案のレビュー",
      reason: "比較検討と修正点の整理が必要です。",
      reasonCode: "document_review",
      confidence: 0.96,
    },
  },
  {
    fromName: "灯台メディア",
    fromAddress: "rights@todai-media.example",
    subject: "事例掲載の許諾について",
    body: "架空の導入事例として概要を掲載してよいか、ご回答をお願いします。",
    category: "forums",
    account: "goodsystem",
    decision: {
      category: "needs_reply",
      priority: "today",
      taskType: "sukima",
      summary: "事例掲載の可否を返信",
      reason: "掲載許諾への明確な回答が必要です。",
      reasonCode: "direct_question",
      confidence: 0.98,
    },
  },
  {
    fromName: "野原サポート",
    fromAddress: "contract@nohara-support.example",
    subject: "デモ契約の更新内容確認",
    body: "デモ契約の更新条件をまとめました。変更点をご確認ください。",
    category: "updates",
    account: "goodsystem",
    decision: {
      category: "needs_action",
      priority: "anytime",
      taskType: "jikkuri",
      summary: "契約更新条件の確認",
      reason: "更新前に変更点の確認が必要です。",
      reasonCode: "document_review",
      confidence: 0.9,
    },
  },
  {
    fromName: "虹色開発室",
    fromAddress: "dev@niji-dev.example",
    subject: "試作画面の仕様について質問です",
    body: "完了ボタン押下後の表示は一覧に残す想定でしょうか。仕様をご教示ください。",
    category: "forums",
    account: "gmail",
    decision: {
      category: "needs_reply",
      priority: "urgent",
      taskType: "sukima",
      summary: "完了後表示の仕様を返信",
      reason: "実装を進めるための回答が求められています。",
      reasonCode: "direct_question",
      confidence: 0.98,
    },
  },
  {
    fromName: "風鈴配送センター",
    fromAddress: "delivery@furin-logistics.example",
    subject: "サンプル品の発送予定",
    body: "サンプル品は明日の午後に発送予定です。到着見込みは翌々日です。",
    category: "updates",
    account: "goodsystem",
    decision: {
      category: "information",
      priority: null,
      taskType: null,
      summary: "サンプル品の発送予定連絡",
      reason: "配送予定の共有のみです。",
      reasonCode: "informational_only",
      confidence: 0.94,
    },
  },
  {
    fromName: "架空イベント案内局",
    fromAddress: "events@fictional-events.example",
    subject: "週末オンラインイベントのご案内",
    body: "架空のオンラインイベントをご案内します。参加は任意です。",
    category: "promotions",
    account: "gmail",
    decision: null,
  },
  {
    fromName: "デモSNS通知",
    fromAddress: "alerts@demo-network.example",
    subject: "今週のつながりまとめ",
    body: "デモ用の交流状況をまとめた自動通知です。",
    category: "social",
    account: "gmail",
    decision: null,
  },
  {
    fromName: "星空セキュリティ",
    fromAddress: "no-reply@hoshizora-secure.example",
    subject: "デモ環境へのログイン通知",
    body: "デモ環境へのログインを検知したという架空の通知です。秘密情報は含まれていません。",
    category: "updates",
    account: "goodsystem",
    decision: null,
  },
  {
    fromName: "水辺プロジェクト",
    fromAddress: "minutes@mizube-project.example",
    subject: "本日の会議メモを共有します",
    body: "本日の決定事項と次回までの確認項目を会議メモにまとめました。",
    category: "primary",
    account: "gmail",
    decision: {
      category: "information",
      priority: null,
      taskType: null,
      summary: "会議メモの共有",
      reason: "明示的な担当依頼はありません。",
      reasonCode: "informational_only",
      confidence: 0.89,
    },
  },
  {
    fromName: "小径テスト室",
    fromAddress: "qa@komichi-test.example",
    subject: "確認テストで二点見つかりました",
    body: "試作画面の確認テストで軽微な表示差分を二点見つけました。確認をお願いします。",
    category: "primary",
    account: "goodsystem",
    decision: {
      category: "needs_action",
      priority: "today",
      taskType: "jikkuri",
      summary: "表示差分二点の確認",
      reason: "テスト結果に対する確認作業が必要です。",
      reasonCode: "explicit_request",
      confidence: 0.95,
    },
  },
  {
    fromName: "朝凪相談室",
    fromAddress: "schedule@asanagi-consult.example",
    subject: "相談時間の候補をお送りします",
    body: "木曜十時または金曜十三時で調整可能です。ご希望を返信してください。",
    category: "forums",
    account: "gmail",
    decision: {
      category: "needs_reply",
      priority: "today",
      taskType: "sukima",
      summary: "相談時間の希望を返信",
      reason: "二つの候補から希望回答が必要です。",
      reasonCode: "schedule_coordination",
      confidence: 0.98,
    },
  },
  {
    fromName: "森の学び場 運営",
    fromAddress: "program@mori-learning.example",
    subject: "ミニセッション登壇のご相談",
    body: "来月の架空イベントで十五分のミニセッションをご相談できますか。",
    category: "forums",
    account: "goodsystem",
    decision: {
      category: "needs_reply",
      priority: "anytime",
      taskType: "jikkuri",
      summary: "登壇相談への回答検討",
      reason: "依頼を受けるか検討して返信する必要があります。",
      reasonCode: "explicit_request",
      confidence: 0.94,
    },
  },
  {
    fromName: "紙ひこうき印刷",
    fromAddress: "production@kamihikoki-print.example",
    subject: "入稿データの締切確認",
    body: "初回校正に間に合わせるため、入稿データを水曜正午までにお送りください。",
    category: "primary",
    account: "goodsystem",
    decision: {
      category: "needs_action",
      priority: "urgent",
      taskType: "jikkuri",
      summary: "入稿データの準備と送付",
      reason: "明確な締切がある提出作業です。",
      reasonCode: "deadline_detected",
      confidence: 0.99,
    },
  },
  {
    fromName: "空想プロダクト通信",
    fromAddress: "news@kuso-product.example",
    subject: "月次アップデートのお知らせ",
    body: "架空サービスの月次アップデート情報です。返信は不要です。",
    category: "updates",
    account: "gmail",
    decision: null,
  },
  {
    fromName: "架空受付システム",
    fromAddress: "info@fictional-reception.example",
    subject: "お問い合わせを受け付けました",
    body: "デモ用お問い合わせを受け付けたという自動応答です。",
    category: "updates",
    account: "goodsystem",
    decision: null,
  },
  {
    fromName: "夕焼け工房",
    fromAddress: "hello@yuyake-workshop.example",
    subject: "先日の説明ありがとうございました",
    body: "先日の丁寧な説明ありがとうございました。チーム内で共有しました。",
    category: "primary",
    account: "gmail",
    decision: {
      category: "information",
      priority: null,
      taskType: null,
      summary: "説明へのお礼",
      reason: "感謝の連絡で対応依頼はありません。",
      reasonCode: "informational_only",
      confidence: 0.9,
    },
  },
  {
    fromName: "麦の穂チーム",
    fromAddress: "team@muginoho.example",
    subject: "来週の優先事項を確認させてください",
    body: "来週は試作改善と資料整備のどちらを先に進めるべきか、ご意見をお願いします。",
    category: "forums",
    account: "goodsystem",
    decision: {
      category: "needs_reply",
      priority: "today",
      taskType: "sukima",
      summary: "来週の優先事項を返信",
      reason: "作業順について意思決定と回答が必要です。",
      reasonCode: "direct_question",
      confidence: 0.96,
    },
  },
];

function dateInTokyo(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("referenceDate must be a valid date");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DEMO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function utcTimestamp(
  date: string,
  hour: number,
  minute = 0,
  second = 0,
): string {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const ss = String(second).padStart(2, "0");
  return new Date(`${date}T${hh}:${mm}:${ss}+09:00`).toISOString();
}

function addMinutes(timestamp: string, minutes: number): string {
  return new Date(new Date(timestamp).getTime() + minutes * 60_000).toISOString();
}

function createMessages(today: string): Message[] {
  const classifiedAt = utcTimestamp(today, 7, 55);
  return messageSeeds.map((seed, index) => {
    const number = String(index + 1).padStart(3, "0");
    const receivedDate = shiftDate(today, -(index % 5));
    const recipient =
      seed.account === "gmail"
        ? { name: "デモ利用者", address: "demo-user@gmail.example" }
        : { name: "デモ業務窓口", address: "desk@goodsystem.example" };
    const triageResult: TriageResult | null = seed.decision
      ? { ...seed.decision, classifiedAt }
      : null;
    return {
      messageId: `demo-msg-${number}`,
      userId: DEMO_USER_ID,
      threadId: `demo-thread-${number}`,
      channel: "gmail",
      account: seed.account,
      from: { name: seed.fromName, address: seed.fromAddress },
      to: [recipient],
      subject: seed.subject,
      bodyText: seed.body,
      bodyHtml:
        index % 4 === 0
          ? `<div><p>${seed.body}</p><a href="https://portal.demo-work.example/items/${number}">デモ詳細</a></div>`
          : null,
      receivedAt: utcTimestamp(receivedDate, 7 + (index % 11), (index * 7) % 60),
      category: seed.category,
      labels: seed.category === "forums" ? ["UNREAD", "CATEGORY_FORUMS"] : ["UNREAD"],
      isUnread: true,
      sourceUrl: `https://mail.google.com/mail/u/0/#inbox/demo-msg-${number}`,
      triageResult,
    } satisfies Message;
  });
}

function createCalendarEvents(today: string): CalendarEvent[] {
  const createdAt = utcTimestamp(shiftDate(today, -4), 10);
  return [
    {
      id: "demo-event-001",
      externalId: "google-demo-event-001",
      userId: DEMO_USER_ID,
      account: "gmail",
      title: "朝の進行確認",
      description: "デモチームで今日の優先事項を確認する架空の予定",
      location: "オンライン",
      startAt: utcTimestamp(today, 9),
      endAt: utcTimestamp(today, 9, 30),
      allDay: false,
      status: "confirmed",
      sourceUrl: "https://calendar.google.com/calendar/event?eid=demo-event-001",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "demo-event-002",
      externalId: "google-demo-event-002",
      userId: DEMO_USER_ID,
      account: "goodsystem",
      title: "試作企画の確認会",
      description: "架空の試作企画について確認する予定",
      location: "オンライン会議室A",
      startAt: utcTimestamp(today, 10, 15),
      endAt: utcTimestamp(today, 11),
      allDay: false,
      status: "confirmed",
      sourceUrl: "https://calendar.google.com/calendar/event?eid=demo-event-002",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "demo-event-003",
      externalId: "google-demo-event-003",
      userId: DEMO_USER_ID,
      account: "gmail",
      title: "制作物の短時間レビュー",
      description: "午前中に架空の制作物を確認する予定",
      location: "作業スペース",
      startAt: utcTimestamp(today, 11, 20),
      endAt: utcTimestamp(today, 12),
      allDay: false,
      status: "confirmed",
      sourceUrl: "https://calendar.google.com/calendar/event?eid=demo-event-003",
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function createTodayTasks(today: string): Task[] {
  const createdAt = utcTimestamp(today, 8);
  const startedAt = utcTimestamp(today, 8, 15);
  return [
    {
      id: "demo-task-today-001",
      userId: DEMO_USER_ID,
      source: "email",
      messageId: "demo-msg-001",
      calendarEventId: null,
      emailAction: "reply",
      title: "青空企画へ候補日を返信する",
      notes: "火曜午前と水曜午後の予定を確認して回答する",
      priority: "urgent",
      taskType: "sukima",
      status: "pending",
      estimatedMinutes: 10,
      elapsedMinutes: null,
      startedAt: null,
      completedAt: null,
      dueDate: today,
      carriedOverFrom: null,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "demo-task-today-002",
      userId: DEMO_USER_ID,
      source: "email",
      messageId: "demo-msg-003",
      calendarEventId: null,
      emailAction: "reply",
      title: "紹介記事の初稿を確認して返信する",
      notes: "表現と掲載画像を確認する",
      priority: "today",
      taskType: "jikkuri",
      status: "pending",
      estimatedMinutes: 30,
      elapsedMinutes: null,
      startedAt: null,
      completedAt: null,
      dueDate: today,
      carriedOverFrom: null,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "demo-task-today-003",
      userId: DEMO_USER_ID,
      source: "email",
      messageId: "demo-msg-002",
      calendarEventId: null,
      emailAction: "action",
      title: "更新見積書の数量と納期を確認する",
      notes: "確認結果を箇条書きにする",
      priority: "urgent",
      taskType: "jikkuri",
      status: "in_progress",
      estimatedMinutes: 45,
      elapsedMinutes: null,
      startedAt,
      completedAt: null,
      dueDate: today,
      carriedOverFrom: null,
      createdAt,
      updatedAt: startedAt,
    },
    {
      id: "demo-task-today-004",
      userId: DEMO_USER_ID,
      source: "manual",
      messageId: null,
      calendarEventId: null,
      emailAction: null,
      title: "日報テンプレートの改善案を一つ書く",
      notes: "毎日続けやすい項目に絞る",
      priority: "anytime",
      taskType: "jikkuri",
      status: "pending",
      estimatedMinutes: 25,
      elapsedMinutes: null,
      startedAt: null,
      completedAt: null,
      dueDate: today,
      carriedOverFrom: null,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "demo-task-today-005",
      userId: DEMO_USER_ID,
      source: "calendar",
      messageId: null,
      calendarEventId: "demo-event-002",
      emailAction: null,
      title: "試作企画の確認会に向けた論点整理",
      notes: "確認したい点を三つに絞る",
      priority: "today",
      taskType: "sukima",
      status: "completed",
      estimatedMinutes: 15,
      elapsedMinutes: 18,
      startedAt: utcTimestamp(today, 7, 35),
      completedAt: utcTimestamp(today, 7, 53),
      dueDate: today,
      carriedOverFrom: null,
      createdAt,
      updatedAt: utcTimestamp(today, 7, 53),
    },
    {
      id: "demo-task-today-006",
      userId: DEMO_USER_ID,
      source: "calendar",
      messageId: null,
      calendarEventId: "demo-event-001",
      emailAction: null,
      title: "朝の進行確認で共有する要点をまとめる",
      notes: "今日中に終える項目を共有する",
      priority: "today",
      taskType: "sukima",
      status: "pending",
      estimatedMinutes: 10,
      elapsedMinutes: null,
      startedAt: null,
      completedAt: null,
      dueDate: today,
      carriedOverFrom: null,
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

const historyTitles = [
  ["見積もり条件を整理する", "返信が必要な連絡を片付ける"],
  ["企画メモを読み直す", "翌日の予定を整理する"],
  ["制作物の確認事項をまとめる", "短い確認連絡を返す"],
  ["資料の構成を整える", "進行表を更新する"],
  ["試作結果を記録する", "依頼内容を一覧化する"],
  ["週内の未処理を確認する", "日報の改善案を書く"],
  ["一週間の成果を棚卸しする", "次週の優先事項を決める"],
] as const;

const reviewGoals = [
  "小さな確認を先送りせず、今日中に終える",
  "大事な一件に集中して形にする",
  "返信をためず、相手が進める状態を作る",
  "資料の目的を見失わずに整える",
  "試して分かったことを言葉に残す",
  "未完了を見える化して週末に残さない",
  "今週の積み重ねを認めて次へつなぐ",
] as const;

const reviewCheers = [
  "小さな完了も、前に進んだ確かな証拠です。",
  "集中できた時間を自信に変えていこう。",
  "丁寧な返信が、明日の余白を作っています。",
  "目的に戻れた自分を、今日はしっかり褒めよう。",
  "試したからこそ得られた発見を大切に。",
  "整えて終えた一日が、週末の安心につながります。",
  "一週間やりきった自分の歩みは、ちゃんと残っています。",
] as const;

function createHistoryTasks(today: string): Task[] {
  return historyTitles.flatMap((titles, dayIndex) => {
    const date = shiftDate(today, dayIndex - 7);
    return titles.map((title, taskIndex) => {
      const sequence = dayIndex * 2 + taskIndex + 1;
      const elapsedMinutes = 24 + dayIndex * 3 + taskIndex * 11;
      const startedAt = utcTimestamp(date, taskIndex === 0 ? 9 : 14, taskIndex * 10);
      const completedAt = addMinutes(startedAt, elapsedMinutes);
      return {
        id: `demo-task-history-${String(sequence).padStart(3, "0")}`,
        userId: DEMO_USER_ID,
        source: "manual",
        messageId: null,
        calendarEventId: null,
        emailAction: null,
        title,
        notes: "デモ用に作成した架空の完了実績",
        priority: taskIndex === 0 ? "today" : "anytime",
        taskType: taskIndex === 0 ? "jikkuri" : "sukima",
        status: "completed",
        estimatedMinutes: taskIndex === 0 ? 35 : 25,
        elapsedMinutes,
        startedAt,
        completedAt,
        dueDate: date,
        carriedOverFrom: null,
        createdAt: utcTimestamp(date, 8),
        updatedAt: completedAt,
      } satisfies Task;
    });
  });
}

function createDailyReviews(today: string, historyTasks: readonly Task[]): DailyReview[] {
  return reviewGoals.map((goal, dayIndex) => {
    const date = shiftDate(today, dayIndex - 7);
    const dayTasks = historyTasks.filter((task) => task.dueDate === date);
    const actualMinutes = dayTasks.reduce(
      (total, task) => total + (task.elapsedMinutes ?? 0),
      0,
    );
    const generatedAt = utcTimestamp(date, 20, 30);
    return {
      id: `demo-review-${date}`,
      userId: DEMO_USER_ID,
      date,
      status: "completed",
      goal,
      result: `${dayTasks.length}件を完了し、合計${actualMinutes}分取り組みました。`,
      goodJob: `${dayTasks.map((task) => task.title).join("、")}を完了できました。`,
      badJob:
        dayIndex === 3
          ? "確認に想定より時間がかかったので、着手前に完了条件を決めます。"
          : "大きな滞りはありませんでした。",
      rules: "返信は要点を三つ以内に整理してから送る。",
      improvements: "集中作業の前に通知を閉じ、短い確認はまとめて処理する。",
      cheer: reviewCheers[dayIndex],
      scheduleComparison: dayTasks.map((task) => ({
        id: `comparison-${task.id}`,
        label: task.title,
        source: "task" as const,
        plannedMinutes: task.estimatedMinutes,
        actualMinutes: task.elapsedMinutes ?? 0,
        status: "completed" as const,
      })),
      sourceTaskIds: dayTasks.map((task) => task.id),
      sourceLogIds: dayTasks.map((task) => `demo-log-complete-${task.id}`),
      exportedHtml: null,
      generatedAt,
      updatedAt: generatedAt,
    } satisfies DailyReview;
  });
}

function createLog(
  id: string,
  ts: string,
  operation: ActivityLog["operation"],
  message: string,
  context: JsonObject,
  correlationId: string | null = null,
): ActivityLog {
  return {
    id,
    userId: DEMO_USER_ID,
    ts,
    level: "INFO",
    operation,
    message,
    correlationId,
    context,
    humanNote: null,
    aiTodo: null,
  };
}

function createActivityLogs(
  today: string,
  messages: readonly Message[],
  historyTasks: readonly Task[],
  dailyReviews: readonly DailyReview[],
): ActivityLog[] {
  const correlationId = "chk_demo_today_001";
  const logs: ActivityLog[] = [
    createLog(
      "demo-log-fetch-start",
      utcTimestamp(today, 7, 50),
      "fetch_mail_batch_start",
      "メール確認を開始",
      { fetch_range: "last_5_days", query_kind: "unread_recent" },
      correlationId,
    ),
    createLog(
      "demo-log-exclude-category",
      utcTimestamp(today, 7, 51),
      "triage_exclude_rule",
      "カテゴリ除外を適用",
      { rule: "promotions_social", excluded_count: 4 },
      correlationId,
    ),
    createLog(
      "demo-log-exclude-sender",
      utcTimestamp(today, 7, 52),
      "triage_exclude_rule",
      "自動送信元除外を適用",
      { rule: "automated_sender", excluded_count: 5 },
      correlationId,
    ),
    createLog(
      "demo-log-fetch-complete",
      utcTimestamp(today, 7, 56),
      "fetch_mail_batch_complete",
      "メール確認が完了",
      { fetched_count: messages.length, classified_count: 21, task_candidate_count: 15 },
      correlationId,
    ),
  ];
  messages
    .filter((message) => message.triageResult !== null)
    .slice(0, 6)
    .forEach((message, index) => {
      const result = message.triageResult;
      if (!result) {
        return;
      }
      logs.push(
        createLog(
          `demo-log-triage-${String(index + 1).padStart(3, "0")}`,
          utcTimestamp(today, 7, 52, index),
          "triage_classify",
          "メール分類が完了",
          {
            message_id: message.messageId,
            category: result.category,
            priority: result.priority,
            task_type: result.taskType,
            reason_code: result.reasonCode,
          },
          correlationId,
        ),
      );
    });
  historyTasks.forEach((task) => {
    logs.push(
      createLog(
        `demo-log-complete-${task.id}`,
        task.completedAt ?? task.updatedAt,
        "task_complete",
        "タスクを完了",
        { task_id: task.id, elapsed_min: task.elapsedMinutes ?? 0 },
      ),
    );
  });
  dailyReviews.forEach((review) => {
    logs.push(
      createLog(
        `demo-log-review-${review.date}`,
        review.generatedAt,
        "review_generate",
        "日報下書きを生成",
        {
          date: review.date,
          tasks_done: review.sourceTaskIds.length,
          total_min: review.scheduleComparison.reduce(
            (total, item) => total + item.actualMinutes,
            0,
          ),
        },
      ),
    );
  });
  return logs;
}

function createSettings(today: string): Settings {
  const createdAt = utcTimestamp(shiftDate(today, -30), 9);
  return {
    id: "demo-settings-001",
    userId: DEMO_USER_ID,
    dreams: ["毎日の仕事を整え、大切な創作に集中できる状態を作る"],
    monthlyGoals: ["日報を平日毎日続ける", "返信待ちを翌日に残さない"],
    fetchRange: "last_5_days",
    coachPersona: "gentle_secretary",
    markAsRead: true,
    domainAllowlist: ["tsumugi-lab.example", "niji-dev.example"],
    domainBlocklist: ["blocked-demo.example"],
    timeZone: DEMO_TIME_ZONE,
    weekStartsOn: 1,
    createdAt,
    updatedAt: utcTimestamp(today, 7, 30),
  };
}

function createWeeklyReview(
  today: string,
  historyTasks: readonly Task[],
  dailyReviews: readonly DailyReview[],
): WeeklyReview {
  const plannedMinutes = historyTasks.reduce(
    (total, task) => total + task.estimatedMinutes,
    0,
  );
  const actualMinutes = historyTasks.reduce(
    (total, task) => total + (task.elapsedMinutes ?? 0),
    0,
  );
  const generatedAt = utcTimestamp(shiftDate(today, -1), 21);
  return {
    id: `demo-weekly-${shiftDate(today, -7)}`,
    userId: DEMO_USER_ID,
    weekStart: shiftDate(today, -7),
    weekEnd: shiftDate(today, -1),
    status: "completed",
    summary: `一週間で${historyTasks.length}件を完了し、合計${actualMinutes}分の実績を残しました。`,
    completedTaskCount: historyTasks.length,
    totalTaskCount: historyTasks.length,
    plannedMinutes,
    actualMinutes,
    completionRate: 1,
    highlights: ["毎日二件ずつ完了実績を残した", "返信と集中作業を分けて進めた"],
    challenges: ["確認作業の完了条件を着手前に明確にする"],
    nextWeekFocus: "午前中に重要な確認を終え、午後の余白を守る",
    sourceDailyReviewIds: dailyReviews.map((review) => review.id),
    generatedAt,
    updatedAt: generatedAt,
  };
}

function createPraisePost(
  today: string,
  weeklyReview: WeeklyReview,
  dailyReviews: readonly DailyReview[],
  historyTasks: readonly Task[],
): PraisePost {
  const sourceReview = dailyReviews[0];
  const createdAt = weeklyReview.generatedAt;
  return {
    id: `demo-praise-${weeklyReview.weekStart}`,
    userId: DEMO_USER_ID,
    weeklyReviewId: weeklyReview.id,
    status: "draft",
    text: `週初めのあなたは「${sourceReview.goal}」と書きました。その言葉どおり、見積もり条件の整理を含む${historyTasks.length}件を完了しました。小さな完了を積み重ねた一週間、本当によく整えました。`,
    evidence: [
      {
        sourceDailyReviewId: sourceReview.id,
        sourceDate: sourceReview.date,
        kind: "goal",
        quote: sourceReview.goal,
        fact: `見積もり条件の整理を含む${historyTasks.length}件を完了`,
        taskIds: historyTasks.map((task) => task.id),
      },
    ],
    createdAt,
    updatedAt: createdAt,
    publishedAt: null,
  };
}

export function createSeedState(referenceDate: Date | string = new Date()): AppState {
  const today = dateInTokyo(referenceDate);
  const messages = createMessages(today);
  const calendarEvents = createCalendarEvents(today);
  const todayTasks = createTodayTasks(today);
  const historyTasks = createHistoryTasks(today);
  const dailyReviews = createDailyReviews(today, historyTasks);
  const activityLogs = createActivityLogs(today, messages, historyTasks, dailyReviews);
  const settings = createSettings(today);
  const weeklyReview = createWeeklyReview(today, historyTasks, dailyReviews);
  const praisePost = createPraisePost(
    today,
    weeklyReview,
    dailyReviews,
    historyTasks,
  );
  return {
    userId: DEMO_USER_ID,
    asOfDate: today,
    messages,
    tasks: [...todayTasks, ...historyTasks],
    calendarEvents,
    dailyReviews,
    activityLogs,
    settings,
    weeklyReviews: [weeklyReview],
    praisePosts: [praisePost],
  };
}

export const seedState: AppState = createSeedState();
