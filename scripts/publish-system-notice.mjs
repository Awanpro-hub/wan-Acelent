// 每次後端部署成功（ampx pipeline-deploy 跑完）之後，這支腳本會自動被叫一次，
// 建立一筆「系統公告」資料，讓所有使用者都會在通知中心看到「系統已更新」的提醒、
// 也會收到一次推播。設計成即使這裡出錯，也不能讓整個部署失敗——所以任何失敗
// 都只印錯誤訊息、process.exit(0)，不會讓 amplify.yml 的建置步驟回傳失敗。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputsPath = join(__dirname, '..', 'amplify_outputs.json');

function fail(msg) {
  console.error('[publish-system-notice] ' + msg + '（不影響部署本身，略過發布系統公告）');
  process.exit(0);
}

let outputs;
try {
  outputs = JSON.parse(readFileSync(outputsPath, 'utf-8'));
} catch (err) {
  fail('讀不到 amplify_outputs.json：' + (err && err.message));
}

const endpoint = outputs && outputs.data && outputs.data.url;
const apiKey = outputs && outputs.data && outputs.data.api_key;

if (!endpoint || !apiKey) {
  fail('amplify_outputs.json 裡沒有 data.url 或 data.api_key');
}

const version = (process.env.AWS_COMMIT_ID || '').slice(0, 7) || new Date().toISOString();
const message = '系統已更新，新版本已上線 🎉 打開鯊魚日常看看有什麼新功能！';

const mutation = `
  mutation CreateSystemNotice($input: CreateSystemNoticeInput!) {
    createSystemNotice(input: $input) { id }
  }
`;

try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ query: mutation, variables: { input: { message, version } } }),
  });
  const json = await res.json();
  if (json.errors) {
    console.error('[publish-system-notice] 發布系統公告失敗：' + JSON.stringify(json.errors));
  } else {
    console.log('[publish-system-notice] 已發布系統公告，id=' + (json.data && json.data.createSystemNotice && json.data.createSystemNotice.id) + ' version=' + version);
  }
} catch (err) {
  console.error('[publish-system-notice] 呼叫 GraphQL API 失敗：' + (err && err.message));
}
