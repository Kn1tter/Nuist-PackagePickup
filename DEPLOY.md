# 上线部署（不绑卡版）：Vercel 前端 + Vercel 后端 + Supabase

Render 免费层常要求绑信用卡，本项目改为 **全部放 Vercel**（Hobby 一般不用绑卡）。

## 1. Supabase（你已完成）

SQL 已建表。`DATABASE_URL` 用 Session pooler，密码里的 `!` 写成 `%21`：

```
postgresql://postgres.项目ID:密码%21xxx@aws-0-地区.pooler.supabase.com:5432/postgres
```

## 2. 后端 → Vercel（API）

1. 打开 https://vercel.com → 用 GitHub 登录  
2. **Add New… → Project** → 导入 `Kn1tter/Nuist-PackagePickup`  
3. 设置：

| 项 | 值 |
|----|-----|
| Project Name | `nuist-packagepickup-api` |
| Root Directory | `backend` |
| Framework Preset | Other |

4. Environment Variables：

| Key | Value |
|-----|--------|
| `DATABASE_URL` | 上面的 Session pooler 连接串 |
| `JWT_SECRET` | 一长串随机字符 |
| `FRONTEND_ORIGIN` | 先填 `*` 或等前端部署后再改成 `https://xxx.vercel.app` |

5. Deploy → 得到例如 `https://nuist-packagepickup-api.vercel.app`  
6. 打开 `https://你的后端.vercel.app/api/health` 应返回 `{"ok":true,...}`

## 3. 前端 → Vercel

再 **Add New Project** 一次（同一仓库）：

| 项 | 值 |
|----|-----|
| Project Name | `nuist-packagepickup` |
| Root Directory | `frontend` |
| Framework | Vite |

环境变量：

| Key | Value |
|-----|--------|
| `VITE_API_BASE` | `https://nuist-packagepickup-api.vercel.app`（不要末尾斜杠） |

Deploy 完成后，把前端地址填回后端的 `FRONTEND_ORIGIN`，Redeploy 后端。

## 4. 本地开发（不变）

```bash
cd backend && npm run dev
cd frontend && npm run dev
```

本地不设 `DATABASE_URL` 时仍用 SQLite。
