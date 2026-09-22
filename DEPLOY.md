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
| `JWT_SECRET` | **必填**，至少 16 位随机字符（缺失会直接启动失败） |
| `FRONTEND_ORIGIN` | 前端地址，如 `https://xxx.vercel.app`（可先 `*`） |
| `ADMIN_STUDENT_IDS` | 管理员学号，逗号分隔，如 `202683930027`（仅此名单会获得管理员） |
| `SUPABASE_URL` | （可选）`https://项目ID.supabase.co`，用于凭证照片对象存储 |
| `SUPABASE_SERVICE_ROLE_KEY` | （可选）Service Role Key；与 URL 一起配置后照片进 Storage |
| `SUPABASE_STORAGE_BUCKET` | （可选）默认 `order-photos`，需在 Supabase 建桶并设为 public |

未配置 Storage 时：本地写磁盘；Vercel 上会把小图（≤1.5MB）存成 data URL 到数据库。

5. Deploy → 得到例如 `https://nuist-packagepickup-api.vercel.app`  
6. 打开 `https://你的后端.vercel.app/api/health` 应返回 `{"ok":true,...}`

### 可选：建照片桶（推荐）

Supabase → Storage → New bucket → 名 `order-photos` → Public。  
后端用 Service Role 上传，公开 URL 给前端展示。

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

本地不设 `DATABASE_URL` 时仍用 SQLite；本地可不设 `JWT_SECRET`（会用开发默认值）。
