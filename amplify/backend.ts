import { defineBackend } from '@aws-amplify/backend';
import { Stack } from 'aws-cdk-lib';
import { Effect, Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { EventSourceMapping, StartingPosition } from 'aws-cdk-lib/aws-lambda';
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
const pushNotifyLambda = backend.pushNotify.resources.lambda;

pushNotifyLambda.addEnvironment('PUSH_SUBSCRIPTION_TABLE_NAME', pushSubTable.tableName);

const streamPolicy = new Policy(Stack.of(teamStatTable), 'PushNotifyStreamPolicy', {
  statements: [
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['dynamodb:DescribeStream', 'dynamodb:GetRecords', 'dynamodb:GetShardIterator', 'dynamodb:ListStreams'],
      resources: [teamStatTable.tableStreamArn as string],
    }),
  ],
});
pushNotifyLambda.role?.attachInlinePolicy(streamPolicy);

const readSubsPolicy = new Policy(Stack.of(pushSubTable), 'PushNotifyReadSubscriptionsPolicy', {
  statements: [
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['dynamodb:Scan', 'dynamodb:Query', 'dynamodb:GetItem'],
      resources: [pushSubTable.tableArn, pushSubTable.tableArn + '/index/*'],
    }),
  ],
});
pushNotifyLambda.role?.attachInlinePolicy(readSubsPolicy);

const streamMapping = new EventSourceMapping(Stack.of(teamStatTable), 'PushNotifyTeamStatStreamMapping', {
  target: pushNotifyLambda,
  eventSourceArn: teamStatTable.tableStreamArn,
  startingPosition: StartingPosition.LATEST,
});
streamMapping.node.addDependency(streamPolicy);
