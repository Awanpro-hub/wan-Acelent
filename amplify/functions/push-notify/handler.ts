import type { DynamoDBStreamHandler } from 'aws-lambda';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import webpush from 'web-push';

// 注意：這裡故意不用 Amplify 的 "$amplify/env/push-notify" 這個特殊路徑
// （官方文件範例是這樣寫，但在 pipeline-deploy 的建置環境下 esbuild 解析不了這個路徑，
// 建置會直接失敗）。改用最單純、保證能用的 process.env 讀取一樣的環境變數/密鑰，
// 效果完全相同。
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:example@example.com';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

const ddb = new DynamoDBClient({});

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

type SubRow = {
  owner?: string;
  endpoint?: string;
  p256dh?: string;
  authKey?: string;
};

export const handler: DynamoDBStreamHandler = async (event) => {
  // 除錯用：只印「有沒有值」，不印金鑰本身內容，避免外洩。
  console.log(
    '[push-notify] 啟動，VAPID_PUBLIC_KEY存在=' +
      !!VAPID_PUBLIC_KEY +
      ' VAPID_PRIVATE_KEY存在=' +
      !!VAPID_PRIVATE_KEY +
      ' PUSH_SUBSCRIPTION_TABLE_NAME=' +
      (process.env.PUSH_SUBSCRIPTION_TABLE_NAME || '(未設定)') +
      ' 收到記錄數=' +
      event.Records.length
  );

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error('缺少 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY，還沒設定 Secret 之前無法發送推播。');
    return;
  }
  var teamStatItems: { viewers: string[]; displayName: string }[] = [];

  for (const record of event.Records) {
    console.log('[push-notify] 收到一筆事件，type=' + record.eventName);
    if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') continue;
    const img = record.dynamodb && record.dynamodb.NewImage;
    if (!img) {
      console.log('[push-notify] 這筆事件沒有 NewImage，略過');
      continue;
    }
    const item = unmarshall(img as any) as any;
    const viewers: string[] = Array.isArray(item.viewers) ? item.viewers : [];
    console.log('[push-notify] displayName=' + item.displayName + ' viewers數量=' + viewers.length + ' viewers=' + JSON.stringify(viewers));
    if (!viewers.length) continue;
    teamStatItems.push({ viewers: viewers, displayName: item.displayName || '隊友' });
  }

  if (!teamStatItems.length) {
    console.log('[push-notify] 沒有任何一筆資料有 viewers（可能還沒加好友，或這次更新的人沒有好友看得到），結束。');
    return;
  }

  const tableName = process.env.PUSH_SUBSCRIPTION_TABLE_NAME;
  if (!tableName) {
    console.error('缺少 PUSH_SUBSCRIPTION_TABLE_NAME 環境變數');
    return;
  }

  // 訂閱數量在這個工具的使用規模下很小，用 Scan 一次拿全部即可，不用另外建索引。
  const scan = await ddb.send(new ScanCommand({ TableName: tableName }));
  const subs: SubRow[] = (scan.Items || []).map((it) => unmarshall(it) as SubRow);
  console.log('[push-notify] PushSubscription 表裡總共有 ' + subs.length + ' 筆訂閱資料，owner清單=' + JSON.stringify(subs.map((s) => s.owner)));

  const sendTasks: Promise<any>[] = [];
  for (const stat of teamStatItems) {
    const payload = JSON.stringify({
      title: '好友對戰更新 🦈',
      body: stat.displayName + ' 更新了本週的 10-3-1 進度，打開鯊魚日常看看誰領先！',
    });
    for (const sub of subs) {
      if (!sub.owner || !sub.endpoint || !sub.p256dh || !sub.authKey) {
        console.log('[push-notify] 這筆訂閱資料欄位不完整，略過。owner=' + sub.owner);
        continue;
      }
      if (stat.viewers.indexOf(sub.owner) === -1) {
        console.log('[push-notify] ' + sub.owner + ' 不在這筆資料的 viewers 名單裡，不發給他。');
        continue;
      }
      console.log('[push-notify] 準備發送推播給 owner=' + sub.owner);
      sendTasks.push(
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.authKey } } as any,
            payload
          )
          .then(function () {
            console.log('[push-notify] 發送成功，owner=' + sub.owner);
          })
          .catch((err) => {
            console.error('[push-notify] 推播失敗（可能是訂閱已失效），owner=' + sub.owner + ' 錯誤=', err && (err.statusCode || err.message || err));
          })
      );
    }
  }

  await Promise.all(sendTasks);
  console.log('[push-notify] 全部處理完成。');
};
