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
  Profile: a
    .model({
      displayName: a.string().required(),
    })
    .authorization((allow) => [allow.owner()]),

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
