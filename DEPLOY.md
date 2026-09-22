# 上线部署指南（Vercel + Render + Supabase）

按顺序做。免费额度够学生课设用。首次部署大约 20–40 分钟。

## 0. 准备

- GitHub 账号
- [Supabase](https://supabase.com) 账号
- [Render](https://render.com) 账号
- [Vercel](https://vercel.com) 账号（可用 GitHub 登录）

把本仓库推到 GitHub（一个仓库即可，内含 `frontend/` 和 `backend/`）。

```bash
cd C:\Users\14402\Desktop\nuist-packagepickup
git add .
git commit -m "Prepare for Vercel/Render/Supabase deploy"
# 在 GitHub 新建空仓库 nuist-packagepickup 后：
git remote add origin https://github.com/你的用户名/nuist-packagepickup.git
git branch -M main
git push -u origin main
```

---

## 1. 数据库（Supabase）

1. 打开 https://supabase.com → New project  
2. 记好数据库密码  
3. 左侧 **SQL Editor** → New query → 粘贴并运行仓库里的 `sql/schema.sql`  
4. **Project Settings → Database → Connection string → URI**  
   复制类似：

   `postgresql://postgres.xxx:密码@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`

   这就是后面的 `DATABASE_URL`（密码里若有特殊字符需 URL 编码）。

> 后端启动时也会自动 `CREATE TABLE IF NOT EXISTS`，跑一遍 SQL 更稳妥。

---

## 2. 后端（Render）

1. https://dashboard.render.com → **New → Web Service**  
2. 连接刚才的 GitHub 仓库  
3. 填写：

| 项 | 值 |
|----|-----|
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |

4. **Environment** 添加：

| Key | Value |
|-----|--------|
| `DATABASE_URL` | Supabase 连接串 |
| `JWT_SECRET` | 一长串随机字符 |
| `FRONTEND_ORIGIN` | 先空着，前端部署后再填 `https://xxx.vercel.app` |

5. Create Web Service，等部署完成  
6. 复制服务地址，例如 `https://nuist-packagepickup-api.onrender.com`  
7. 浏览器打开：`https://你的后端.onrender.com/api/health`  
   应看到 `{"ok":true,...}`

> 免费实例会休眠，第一次访问可能要等 30–60 秒。

---

## 3. 前端（Vercel）

1. https://vercel.com → **Add New Project** → 导入同一仓库  
2. 设置：

| 项 | 值 |
|----|-----|
| Root Directory | `frontend` |
| Framework | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

3. **Environment Variables**：

| Key | Value |
|-----|--------|
| `VITE_API_BASE` | `https://你的后端.onrender.com`（不要末尾斜杠） |

4. Deploy  
5. 得到 `https://xxx.vercel.app`

---

## 4. 把前端地址填回后端

回到 Render → Environment → 设置：

```
FRONTEND_ORIGIN=https://xxx.vercel.app
```

保存后会自动重新部署。

---

## 5. 验收

1. 打开 Vercel 地址  
2. 注册两个学号账号  
3. A 发单 → B 接单 → 查看取件码 → 状态走到完成  

若注册失败：先看 Render 日志里数据库是否连上；再确认 `VITE_API_BASE` 没有多余斜杠、CORS 的 `FRONTEND_ORIGIN` 与 Vercel 域名一致。

---

## 本地开发（不受影响）

```bash
# 后端：仍用 SQLite
cd backend && npm run dev

# 前端：不设 VITE_API_BASE，走本地代理
cd frontend && npm run dev
```

---

## 费用与限制（心里有数）

- Supabase / Render / Vercel 免费层够演示  
- Render 休眠后冷启动慢  
- 上传的图片目前存在 Render 磁盘，重启可能丢失；课设演示够用，以后再换 Cloudflare R2
