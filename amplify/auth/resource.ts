import { defineAuth } from '@aws-amplify/backend';

/**
 * 極光行動 — 團隊帳號設定
 * 每個人用自己的 Email + 密碼註冊登入（AWS Cognito）。
 * https://docs.amplify.aws/react/build-a-backend/auth/
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
