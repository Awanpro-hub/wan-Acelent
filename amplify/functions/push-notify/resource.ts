import { defineFunction, secret } from '@aws-amplify/backend';

/**
 * 好友對戰：有人的 TeamStat（本週 10-3-1 快照）新增或更新時，
 * 這個 function 會被 DynamoDB Stream 觸發（接線邏輯在 amplify/backend.ts），
 * 找出被允許看到這筆資料的好友（viewers），對他們已註冊的瀏覽器推播訂閱發送通知。
 *
 * VAPID_PRIVATE_KEY 是機密金鑰，用 secret() 存放，
 * 部署後要到 AWS Amplify 主控台的 Hosting → Secrets 手動貼上實際的值（不會進 git）。
 * VAPID_PUBLIC_KEY 不是機密（前端程式碼裡本來就會有一份一樣的），直接寫死即可。
 */
export const pushNotify = defineFunction({
  name: 'push-notify',
  entry: './handler.ts',
  timeoutSeconds: 30,
  environment: {
    VAPID_PUBLIC_KEY: 'BPBXKCP8yALA6fURWlQmoyT6zab2t75p8a6UJDg8FAFOhiNXl4XLJH2BAz2Lr2-oMG2SKEOE1suCfY_qpJzcu8g',
    VAPID_PRIVATE_KEY: secret('VAPID_PRIVATE_KEY'),
    VAPID_SUBJECT: 'mailto:54oldhead@gmail.com',
  },
});
