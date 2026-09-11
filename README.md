# 鯊魚日常（AWS Amplify 版）

分類名單 + 10-3-1 每日追蹤工具，鯊魚不游就會死——這套工具就是幫你每天保持行動量。這個版本部署在**你自己的 AWS 帳號**上，
用 Email/密碼登入（AWS Cognito），每個人的名單、聯絡記錄、工作規劃彼此獨立、互不可見，
且跨裝置自動同步。

## 這個專案長什麼樣子

```
amplify/
  auth/resource.ts     # 帳號登入設定（Email + 密碼）
  data/resource.ts     # 資料表：Profile / Contact / CustomGroup / ContactLog / WorkPlan
  backend.ts           # 把上面兩個接起來
index.html             # 頁面外觀（「鯊魚日常」的設計）
src/main.js            # 前端邏輯：登入畫面、名單、10-3-1 追蹤
amplify.yml            # 告訴 AWS Amplify Hosting 怎麼建置這個專案
package.json           # 相依套件與建置指令
```

## 部署步驟（第一次）

### 前置需求
- 一個 GitHub 帳號（免費）：https://github.com
- 一個 AWS 帳號（免費建立，之後這個規模的用量幾乎不會產生費用，但仍建議留意帳單）：https://aws.amazon.com

### 步驟一：把這個資料夾傳到 GitHub

**如果你不熟悉指令**，最簡單的方式：
1. 到 https://github.com/new 建立一個新的 repository（例如叫 `aurora-action`），設為 Private。
2. 建立好之後，在該頁面選「uploading an existing file」，把這個資料夾**裡面的所有檔案和子資料夾**拖進去上傳、送出（commit）。
   （不需要上傳 `node_modules`、`dist`，這個資料夾裡本來就沒有這些）

**如果你熟悉指令列**：
```bash
cd aurora-action-amplify
git init
git add .
git commit -m "鯊魚日常：初始版本"
git branch -M main
git remote add origin https://github.com/<你的帳號>/aurora-action.git
git push -u origin main
```

### 步驟二：在 AWS Amplify 建立並連接這個專案

1. 登入 AWS 主控台，搜尋並進入「**AWS Amplify**」。
2. 點「**Create new app**」→「**Host web app**」。
3. 選擇「**GitHub**」，授權 AWS 存取你的 GitHub 帳號。
4. 選擇你剛剛建立的 repository 和分支（`main`）。
5. Amplify 會自動偵測到 `amplify.yml`，直接用裡面的設定即可（不需要修改）。
6. 點「**Save and deploy**」。

第一次建置大約需要 5–10 分鐘（會同時建立後端的帳號系統與資料庫），
完成後 Amplify 會給你一個網址，例如 `https://main.xxxxxxxxxx.amplifyapp.com`，
這就是可以分享給團隊夥伴的連結。

### 之後要更新怎麼辦？

以後只要把改動 push 到 GitHub 的 `main` 分支，Amplify 就會自動重新建置、重新部署，
不需要再手動操作。

### 想接自己的網域名稱？

在 Amplify 主控台左側選「**Domain management**」，可以把你自己買的網域（例如
`list.你的網站.com`）指向這個 App，跟著畫面指示設定 DNS 即可。

## 常見問題

**Q: 建置失敗（Build failed）怎麼辦？**
A: 點進失敗的那次建置，展開紅字的那個步驟看錯誤訊息，把訊息貼給我，我可以幫你判斷問題出在哪裡。這是連接雲端服務時常見的狀況，通常是小地方的設定問題。

**Q: 團隊夥伴要怎麼開始用？**
A: 把 Amplify 給你的網址傳給他們，請他們自己「註冊」一個帳號（Email + 密碼），
註冊時會收到驗證碼，驗證完成後設定自己的顯示名稱即可開始使用。
每個人看到的名單、記錄都是自己的，彼此不會看到對方的資料。

**Q: 這樣會產生費用嗎？**
A: AWS Amplify、Cognito、DynamoDB 都有免費額度，一個十幾人小團隊的使用量通常在免費額度內或費用極低，但仍建議你在 AWS 帳單主控台設定「預算警示（Budget Alert）」，超過某個金額會寄信通知你。

**Q: 我想要新增「三把到八把」的功能怎麼辦？**
A: 之後把設計截圖給我，我可以幫你在 `amplify/data/resource.ts` 加新的資料表、在 `src/main.js` 加新的畫面，一樣用同一套流程部署更新。
