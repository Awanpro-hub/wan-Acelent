import { defineBackend } from '@aws-amplify/backend';
import { Stack } from 'aws-cdk-lib';
import { Effect, Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { EventSourceMapping, StartingPosition, Function as CdkLambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { pushNotify } from './functions/push-notify/resource';

const backend = defineBackend({
  auth,
  data,
  pushNotify,
});

// 放寬密碼規則，讓團隊夥伴比較好設定：至少 8 碼、需有英文字母＋數字，
// 不強制要求大寫或特殊符號（Cognito 預設兩者都會要求，容易讓人卡關）。
const { cfnUserPool } = backend.auth.resources.cfnResources;
cfnUserPool.policies = {
  passwordPolicy: {
    minimumLength: 8,
    requireLowercase: true,
    requireNumbers: true,
    requireUppercase: false,
    requireSymbols: false,
  },
};

/**
 * 好友對戰推播通知：
 * TeamStat（每週 10-3-1 快照）一有新增/更新，就用 DynamoDB Stream 觸發 pushNotify function，
 * 由它去查 PushSubscription 表、找出這筆資料的 viewers 裡有訂閱推播的人，發送瀏覽器通知。
 */
const teamStatTable = backend.data.resources.tables['TeamStat'];
const pushSubTable = backend.data.resources.tables['PushSubscription'];
const pokeTable = backend.data.resources.tables['Poke'];
const systemNoticeTable = backend.data.resources.tables['SystemNotice'];
// backend.pushNotify.resources.lambda 的 TypeScript 型別是比較籠統的 IFunction，
// 沒有宣告 addEnvironment 這個方法（雖然實際上底層物件就是一般的 Lambda Function，
// 一定支援這個方法）。用型別轉換告訴 TypeScript「這其實是一個 Function」即可。
const pushNotifyLambda = backend.pushNotify.resources.lambda as CdkLambdaFunction;

pushNotifyLambda.addEnvironment('PUSH_SUBSCRIPTION_TABLE_NAME', pushSubTable.tableName);
// 用 stream ARN 來判斷「這筆事件是哪張表來的」，比用資料欄位長相去猜更準確、
// 之後再加新的表也不會互相誤判。
pushNotifyLambda.addEnvironment('TEAMSTAT_STREAM_ARN', teamStatTable.tableStreamArn as string);
pushNotifyLambda.addEnvironment('POKE_STREAM_ARN', pokeTable.tableStreamArn as string);
pushNotifyLambda.addEnvironment('SYSTEMNOTICE_STREAM_ARN', systemNoticeTable.tableStreamArn as string);

// 注意：這些建構元都放在「function 自己的 stack」裡（Stack.of(pushNotifyLambda)），
// 不是放在 data 的 stack 裡。因為上面 addEnvironment 已經讓 function stack
// 依賴 data stack（要讀 pushSubTable.tableName）；如果這裡的 Policy／EventSourceMapping
// 又放在 data stack 裡、反過來依賴 function 的 role/Lambda，兩個 nested stack
// 就會互相依賴，造成 CloudFormation 部署失敗（circular dependency between nested stacks）。
// 全部放同一個方向（function stack 依賴 data stack），就不會有循環依賴的問題。
const functionStack = Stack.of(pushNotifyLambda);

const streamPolicy = new Policy(functionStack, 'PushNotifyStreamPolicy', {
  statements: [
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['dynamodb:DescribeStream', 'dynamodb:GetRecords', 'dynamodb:GetShardIterator', 'dynamodb:ListStreams'],
      resources: [
        teamStatTable.tableStreamArn as string,
        pokeTable.tableStreamArn as string,
        systemNoticeTable.tableStreamArn as string,
      ],
    }),
  ],
});
pushNotifyLambda.role?.attachInlinePolicy(streamPolicy);

const readSubsPolicy = new Policy(functionStack, 'PushNotifyReadSubscriptionsPolicy', {
  statements: [
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['dynamodb:Scan', 'dynamodb:Query', 'dynamodb:GetItem'],
      resources: [pushSubTable.tableArn, pushSubTable.tableArn + '/index/*'],
    }),
  ],
});
pushNotifyLambda.role?.attachInlinePolicy(readSubsPolicy);

const streamMapping = new EventSourceMapping(functionStack, 'PushNotifyTeamStatStreamMapping', {
  target: pushNotifyLambda,
  eventSourceArn: teamStatTable.tableStreamArn,
  startingPosition: StartingPosition.LATEST,
});
streamMapping.node.addDependency(streamPolicy);

// 「戳戳」功能：Poke 表一有新增，就用同一個 pushNotify function 發推播，
// 跟 TeamStat 共用同一支 Lambda，程式碼裡會依照資料的欄位自己判斷這是哪一種通知。
const pokeStreamMapping = new EventSourceMapping(functionStack, 'PushNotifyPokeStreamMapping', {
  target: pushNotifyLambda,
  eventSourceArn: pokeTable.tableStreamArn,
  startingPosition: StartingPosition.LATEST,
});
pokeStreamMapping.node.addDependency(streamPolicy);

// 「系統公告」功能：SystemNotice 表一有新增（每次新版本部署上線都會自動新增一筆，
// 見 scripts/publish-system-notice.mjs），一樣共用同一支 Lambda 發推播，
// 但這種通知要發給「所有」有訂閱推播的人，不是只發給 viewers 名單裡的人。
const systemNoticeStreamMapping = new EventSourceMapping(functionStack, 'PushNotifySystemNoticeStreamMapping', {
  target: pushNotifyLambda,
  eventSourceArn: systemNoticeTable.tableStreamArn,
  startingPosition: StartingPosition.LATEST,
});
systemNoticeStreamMapping.node.addDependency(streamPolicy);
