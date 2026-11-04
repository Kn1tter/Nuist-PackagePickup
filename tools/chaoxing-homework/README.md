# 学习通作业爬虫

查询**本人账号**的作业提交状态与截止时间。仅供个人学习提醒使用，请控制请求频率。

## 安装

```bash
cd tools/chaoxing-homework
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # 填写账号密码
```

## 使用

```bash
# 默认：按课程拉取（较完整）
python main.py

# 只看未交
python main.py --status 未交

# 快速总览（移动端「我的作业」）
python main.py --mode fast --status 未交

# 限制课程数量，降低风控概率
python main.py --limit 12 --status 未交

# 对未交作业再请求详情页拿精确截止时间（更慢）
python main.py --status 未交 --enrich

# 导出 JSON
python main.py --json -o homework.json
```

也可用命令行传账号（不推荐，会进 shell 历史）：

```bash
python main.py -u 手机号 -p 密码 --status 未交
```

## 输出字段

| 字段 | 说明 |
|------|------|
| `course_name` | 课程名 |
| `title` | 作业名 |
| `status` | 未交 / 待互评 / 待批阅 / 已完成 |
| `remaining` | 剩余时间文案（如「剩余90小时37分钟」） |
| `deadline` | 推算或解析出的截止时间 `YYYY-MM-DD HH:MM` |
| `expired` | 未交且列表上已无剩余时间时，标为疑似过期 |

## 模式说明

| `--mode` | 行为 |
|----------|------|
| `fast` | 只请求 `work/stu-work` 总览，快 |
| `courses` | 课程列表 → 每课 `workEnc` → 作业列表（默认） |
| `both` | 两者合并去重 |

## 注意

- 账号密码只存本地 `.env`，不要提交到 git
- 短时间频繁刷新可能触发验证码/风控；建议 `--delay 0.5` 以上，并配合 `--limit`
- 平台改版可能导致 HTML 解析失效
- 不要用于代写、批量作弊或访问他人账号
