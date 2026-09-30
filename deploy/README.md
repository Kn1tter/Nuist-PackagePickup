# 阿里云 ECS 一键部署

适用：Ubuntu 22.04，2核2G，安全组已放行 **22 / 80**。

## 你需要准备

1. 服务器公网 IP  
2. root 密码或密钥  
3. 现有 Supabase 的 `DATABASE_URL`  
4. 一段 ≥16 位的 `JWT_SECRET`  
5. 管理员学号（可选）`ADMIN_STUDENT_IDS`

## 步骤（在你自己的电脑上）

### 1. SSH 登录

```bash
ssh root@你的公网IP
```

### 2. 下载代码

```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/Kn1tter/Nuist-PackagePickup.git nuist
cd nuist
```

若本地已有最新代码但 GitHub 还没推送，可用本机上传（在 **Windows PowerShell**）：

```powershell
scp -r C:\Users\14402\Desktop\nuist-packagepickup root@你的公网IP:/var/www/nuist
```

### 3. 写环境变量

```bash
cd /var/www/nuist
bash deploy/aliyun-setup.sh
# 第一次会生成 backend/.env 并退出
nano backend/.env
```

填好例如：

```env
PORT=3000
DATABASE_URL=postgresql://...
JWT_SECRET=你的长随机密钥
FRONTEND_ORIGIN=*
ADMIN_STUDENT_IDS=202683930027
```

### 4. 再跑一遍脚本

```bash
bash deploy/aliyun-setup.sh
```

成功后浏览器打开：`http://你的公网IP`

## 更新网站

```bash
cd /var/www/nuist
git pull
bash deploy/aliyun-setup.sh
```
