# 南信大代取 · nuist-packagepickup

校园快递互助（Vue3 + Express）。本地默认 SQLite，不接线上支付，取件码仅接单人可看完整内容。

## 本地启动

开两个终端：

```bash
# 1) 后端
cd backend
npm install
copy .env.example .env   # 已有 .env 可跳过
npm run dev
```

```bash
# 2) 前端
cd frontend
npm install
npm run dev
```

浏览器打开：http://127.0.0.1:5173

建议用两个学号各注册一次，走一遍：发单 → 接单 → 查看取件码 → 已取件 → 已送达 → 确认收货。

## 目录

```
nuist-packagepickup/
├── frontend/          # Vue3 + Vite
├── backend/           # Express + SQLite
├── sql/schema.sql     # 部署 Supabase/PostgreSQL 用
└── README.md
```

## 核心接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（学号） |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/orders?status=pending` | 订单大厅 |
| POST | `/api/orders` | 发单 |
| POST | `/api/orders/:id/accept` | 接单 |
| GET | `/api/orders/:id?reveal=1` | 接单人查看完整取件码 |
| POST | `/api/orders/:id/status` | 状态流转 |

状态：`pending → accepted → picked → delivered → done`（可 `cancelled`）

## 部署（上线）

**推荐不绑卡方案**：前后端都放 **Vercel** + 数据库用 **Supabase**。

完整步骤见 **[DEPLOY.md](./DEPLOY.md)**（已不再依赖 Render）。

## 说明

- 报酬默认线下微信转账；完成时可标记 `paid_offline`
- 取消订单会扣信用分，完成接单会加分
- 学号校验目前是 8–12 位数字，可按南信大规则再收紧
