import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';

const backend = defineBackend({
  auth,
  data,
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
