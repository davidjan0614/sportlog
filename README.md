# SportLog 運動紀錄 🏃🚴🚶

跑步 / 騎車 / 走路的手機運動紀錄 app。PC 與手機（Android / iPhone 瀏覽器）皆可用。

## 功能
- **GPS 即時追蹤**：距離、時間、配速、速度
- **路線地圖**（OpenStreetMap + Leaflet）
- **運動歷史**：每一筆紀錄都可查、可刪
- **統計**：總次數 / 總距離 / 總時間，依類型分組
- **PWA**：可「加到主畫面」，像 app 一樣使用

## 技術
- 前端：React + TypeScript + Vite + Leaflet
- 後端：FastAPI + SQLite

## 目錄
```
sportlog/
  frontend/   # React 前端
  backend/    # FastAPI 後端（main.py + sportlog.db）
```

## 本機執行

### 1. 後端
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. 前端
```bash
cd frontend
npm install
npm run dev
```
瀏覽器開 http://localhost:5173（Vite 已 proxy `/api` → `localhost:8000`）。

## 部署（Render 範例）
- **後端**：Root = `backend`，Build = `pip install -r requirements.txt`，Start = `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **前端**：Root = `frontend`，Build = `npm run build`，Publish = `dist`；設環境變數 `VITE_API_URL` = 後端網址 + `/api`

## 使用方式
1. 選運動類型（跑步 / 騎車 / 走路）
2. 按「開始」，允許定位權限
3. 運動中可「暫停 / 繼續」
4. 結束按「結束並儲存」
5. 到「歷史」查紀錄、「統計」看總覽
