# 設定跨裝置同步（Google Drive）

一次性設定，約 10 分鐘。完成後電腦和手機的書會自動保持一致。
App 只使用 Drive 的「應用程式專用資料夾」，看不到你 Drive 裡的其他檔案，也不會出現在你的檔案清單裡。

## 1. 啟用 Google Drive API
1. 開啟 [Google Cloud Console](https://console.cloud.google.com/)，選你的專案（例如 My First Project）。
2. 左上選單 → **APIs & Services** → **Library**，搜尋 **Google Drive API** → **Enable**。

## 2. 設定同意畫面（OAuth consent screen）
1. **APIs & Services** → **OAuth consent screen**（新版叫 Google Auth Platform）。第一次要先按 **Get started**。
2. App name 填「收藏帳本」，User support email 選你的信箱，Audience 選 **External**，Contact 填你的信箱 → 建立。
3. **Data Access**（或 Scopes）→ Add or remove scopes → 加入 `https://www.googleapis.com/auth/drive.appdata` → Save。
4. **Audience** → 按 **Publish app**（切到 In production）。這個權限屬於低風險範圍，不需要送審。
   不發布的話，只能用「測試使用者」，而且授權每 7 天會失效。

## 3. 建立 OAuth 用戶端 ID
1. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**。
2. Application type 選 **Web application**，Name 填「收藏帳本」。
3. **Authorized JavaScript origins** → Add URI，填 `https://uxdvivian-cmyk.github.io`
   （只到網域，後面不要加路徑，也不要加 `/`）。
4. Create，複製「Client ID」（`…apps.googleusercontent.com`）。不需要 Client secret。

## 4. 在 App 裡啟用
1. 電腦：打開收藏帳本 → 設定 → 「跨裝置同步」→ 貼上 Client ID → 「登入並同步」，用同一個 Google 帳號登入並同意。
2. 手機：同樣填 Client ID、登入同一個 Google 帳號。
3. 之後預設「自動同步」：開啟 App 時、修改資料後幾秒會自動同步。登入期限到了，設定頁會提示重新登入。

## 注意
- 兩邊同時改同一本書，以「最後修改」的為準。
- 刪除也會同步。
- iPhone 若從「主畫面 App」無法完成 Google 登入，請改用 Safari 直接開網址使用。
