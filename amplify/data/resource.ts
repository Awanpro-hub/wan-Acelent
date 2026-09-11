import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

/**
 * 極光行動 — 資料模型
 *
 * 每個 model 都用 allow.owner() 授權：每個帳號只能讀寫「自己」建立的資料，
 * 這是由 Cognito 登入身分自動判斷的，不需要另外傳 ownerId。
 * 團隊裡的每個人登入後，看到的都是自己的名單、聯絡記錄、工作規劃 —
 * 彼此獨立、互不可見，且跨裝置自動同步。
 */
const schema = a.schema({
  // 個人顯示名稱（登入後第一次使用時填寫一次）
  // inviteCode 開放給所有登入使用者「讀取」，這樣隊友才能用邀請碼找到你、加你為好友；
  // 只有 displayName、inviteCode 這種公開的顯示資訊，不影響原本名單/紀錄的隱私。
  Profile: a
    .model({
      displayName: a.string().required(),
      inviteCode: a.string(),
    })
    .authorization((allow) => [allow.owner(), allow.authenticated().to(['read'])]),

  // 好友對戰：我加的好友清單（只有我自己看得到我加了誰）
  Friend: a
    .model({
      friendOwnerId: a.string().required(), // 對方的帳號識別碼（來自對方 Profile 的 owner 欄位）
      friendDisplayName: a.string(),
    })
    .authorization((allow) => [allow.owner()]),

  // 好友對戰：每週的 10-3-1 統計快照。
  // viewers 是「我允許誰看到這筆資料」的名單（我加的好友），
  // 對方必須也把我加進他的好友，我們才會互相出現在彼此的 viewers 裡、互相看得到進度。
  TeamStat: a
    .model({
      weekKey: a.string().required(), // 該週週一的日期，例如 "2026-09-07"
      displayName: a.string(),
      effectiveContacts: a.integer().default(0),
      appointments: a.integer().default(0),
      newPeople: a.integer().default(0),
      viewers: a.string().array(),
      // 注意：不用自己再宣告 updatedAt，Amplify 每個 model 都會自動維護一個
      // updatedAt / createdAt 系統欄位，拿來判斷「隊友最近有沒有更新」就夠用了。
    })
    .authorization((allow) => [allow.owner(), allow.ownersDefinedIn('viewers').to(['read'])]),

  // 分類名單裡的一筆聯絡人
  Contact: a
    .model({
      name: a.string().required(),
      groupId: a.string().required(), // g1~g8 預設分類，或自訂群組的 id
      groupName: a.string(), // 自訂群組顯示用的名稱
    })
    .authorization((allow) => [allow.owner()]),

  // 使用者自訂的名單群組（預設 8 類以外的）
  CustomGroup: a
    .model({
      name: a.string().required(),
    })
    .authorization((allow) => [allow.owner()]),

  // 10+3+1 第一把：每日有效聯絡記錄
  ContactLog: a
    .model({
      contactName: a.string().required(),
      type: a.string().required(), // "1"陌生/跟進中 "2"經營型一二課 "3"有狀態領導人 "4"消費型顧客
      note: a.string(),
      loggedAt: a.string().required(), // "YYYY-MM-DDTHH:mm"
    })
    .authorization((allow) => [allow.owner()]),

  // 1+1+1 第二把：工作規劃／約會
  WorkPlan: a
    .model({
      contactName: a.string().required(),
      planType: a.string().required(), // "1"主要 "2"次要 "3"有狀態 "4"其他
      note: a.string(),
      planAt: a.string().required(), // "YYYY-MM-DD"
    })
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
