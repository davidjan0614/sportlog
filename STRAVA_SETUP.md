# Strava 啟用

功能已實作；沒有 Strava 應用程式設定時，畫面會明確顯示尚未啟用，不會宣稱已同步。

## 1. 建立 Strava 應用程式

用自己的帳號開啟 https://www.strava.com/settings/api ，依 Strava 流程建立應用程式。

- 網站：https://sportlog-frontend.onrender.com
- Authorization Callback Domain：sportlog-backend.onrender.com
- 完整 callback：https://sportlog-backend.onrender.com/api/strava/callback
- 保存 Client ID 與 Client Secret；Secret 只填入 Render 後端環境變數，不放在聊天、前端或 GitHub。

## 2. Render 後端設定

在 sportlog-backend 的 Environment 加入：

- STRAVA_CLIENT_ID：Strava 核發的 ID
- STRAVA_CLIENT_SECRET：Strava 核發的 Secret
- STRAVA_TOKEN_KEY：固定保存的 Fernet 金鑰，用於加密帳號授權資料。可在可信任的本機 Python 環境執行 `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` 產生，直接貼入 Render。

選填 STRAVA_REDIRECT_URI；預設就是上面的完整 callback。OAuth 與上傳使用 Strava 官方端點，沒有代理服務。

## 3. 永久保存資料

目前 render.yaml 是免費服務，程式使用本機 SQLite；免費服務的暫存磁碟不適合保存授權或運動紀錄。正式啟用前應選擇支援持久磁碟的服務（可能產生費用），掛載到 /var/data，設定：

- SPORTLOG_DB=/var/data/sportlog.db
- SPORTLOG_UPLOAD_DIR=/var/data/uploads

如已有資料，先備份並搬移現有資料庫及 uploads，再切換，避免資料遺失。不要在有資料的線上主機直接重新部署後才處理備份。STRAVA_TOKEN_KEY 不可每次部署重新產生，否則已保存的授權無法解密。

目前後端預設單一 worker，授權更新和上傳以程序內鎖序列化。多 worker／多主機部署前須改成共用鎖與持久工作佇列。

## 4. 上線後使用

「歷史」頁 →「連接 Strava」→ 在 Strava 授權上傳。之後新儲存的運動會自動上傳 GPX，歷史與儲存完成區可查狀態／重試。Strava 在背景處理路線，畫面每 5 秒檢查，最多約一分鐘，之後可按「更新狀態」。

- 舊紀錄沒有逐點時間，不會捏造資料上傳。
- 路線中的暫停區段分開，Strava 仍會自行重算距離、移動時間和配速，可能與本站不同。
- 取消連接會移除此站保存的授權與待完成連接流程，停止後續上傳；不會刪除 Strava 已有運動。也可在 Strava 設定中撤銷應用程式授權。
- 馬拉松世界不在此次直接串接範圍；需確認其 App 的 Strava 同步功能仍可使用。
- 主機中斷可能打斷背景上傳；重新開啟歷史紀錄可手動重試。Strava 以相同 GPX 的重複檢測避免重複紀錄。

驗證：前端 `npm test`、`npm run build`；後端 `python -m unittest discover -s backend -p 'test_*.py'`。網路互動以測試替身驗證；實際 Strava 授權及端到端上傳須在應用程式設定後驗證。
