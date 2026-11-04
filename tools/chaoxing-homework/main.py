#!/usr/bin/env python3
"""学习通作业爬虫 CLI：查询本人作业提交状态与截止时间。"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from client import ChaoxingClient


def print_table(homeworks, show_url: bool = False) -> None:
    if not homeworks:
        print("没有匹配的作业。")
        return

    rows = []
    for hw in homeworks:
        deadline = hw.deadline or ("已过期/未知" if hw.expired else (hw.remaining or "-"))
        rows.append(
            {
                "课程": hw.course_name,
                "作业": hw.title,
                "状态": hw.status + ("(过期)" if hw.expired and hw.status == "未交" else ""),
                "截止时间": deadline,
                "链接": hw.detail_url if show_url else "",
            }
        )

    cols = ["课程", "作业", "状态", "截止时间"] + (["链接"] if show_url else [])
    widths = {c: len(c) for c in cols}
    for row in rows:
        for c in cols:
            widths[c] = max(widths[c], len(str(row[c])))

    def line(row: dict) -> str:
        return " | ".join(str(row[c]).ljust(widths[c]) for c in cols)

    sep = "-+-".join("-" * widths[c] for c in cols)
    print(line({c: c for c in cols}))
    print(sep)
    for row in rows:
        print(line(row))

    pending = sum(1 for hw in homeworks if hw.status == "未交")
    expired = sum(1 for hw in homeworks if hw.expired and hw.status == "未交")
    print()
    print(f"合计 {len(homeworks)} 项，未交 {pending} 项（其中疑似过期 {expired} 项）")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="爬取学习通本人作业提交状态与截止时间")
    p.add_argument("-u", "--username", help="手机号/学号；也可用环境变量 CHAOXING_USERNAME")
    p.add_argument("-p", "--password", help="密码；也可用环境变量 CHAOXING_PASSWORD")
    p.add_argument(
        "--mode",
        choices=["fast", "courses", "both"],
        default="courses",
        help="fast=移动端总览；courses=按课程拉取（默认，更完整）；both=两者合并",
    )
    p.add_argument(
        "--status",
        default="",
        help="按状态过滤，逗号分隔，如: 未交,待互评",
    )
    p.add_argument("--all-courses", action="store_true", help="包含已结课/归档课程")
    p.add_argument("--limit", type=int, default=None, help="最多查询前 N 门课（降低风控）")
    p.add_argument(
        "--enrich",
        action="store_true",
        help="对未交且无截止时间的作业再请求详情页解析作答时间（更慢）",
    )
    p.add_argument("--json", dest="as_json", action="store_true", help="输出 JSON")
    p.add_argument("-o", "--output", help="写入文件（配合 --json）")
    p.add_argument("--url", action="store_true", help="表格中显示详情链接")
    p.add_argument("--delay", type=float, default=0.4, help="请求间隔秒数，默认 0.4")
    return p


def main(argv: list[str] | None = None) -> int:
    load_dotenv(Path(__file__).with_name(".env"))
    args = build_parser().parse_args(argv)

    username = args.username or os.getenv("CHAOXING_USERNAME", "")
    password = args.password or os.getenv("CHAOXING_PASSWORD", "")
    if not username or not password:
        print(
            "请提供账号密码：命令行 -u/-p，或复制 .env.example 为 .env 后填写。",
            file=sys.stderr,
        )
        return 2

    status_filter = [s.strip() for s in args.status.split(",") if s.strip()]

    client = ChaoxingClient(username, password, request_delay=args.delay)
    print("正在登录学习通...", file=sys.stderr)
    try:
        client.login()
    except Exception as exc:  # noqa: BLE001
        print(f"登录失败: {exc}", file=sys.stderr)
        return 1
    print("登录成功，正在拉取作业...", file=sys.stderr)

    try:
        result = client.fetch_homeworks(
            mode=args.mode,
            active_only=not args.all_courses,
            status_filter=status_filter or None,
            enrich_pending_deadline=args.enrich,
            course_limit=args.limit,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"拉取失败: {exc}", file=sys.stderr)
        return 1

    for err in result.errors:
        print(f"[警告] {err}", file=sys.stderr)

    payload = {
        "count": len(result.homeworks),
        "courses": [c.__dict__ for c in result.courses],
        "homeworks": [hw.to_dict() for hw in result.homeworks],
        "errors": result.errors,
    }

    if args.as_json or args.output:
        text = json.dumps(payload, ensure_ascii=False, indent=2)
        if args.output:
            Path(args.output).write_text(text, encoding="utf-8")
            print(f"已写入 {args.output}", file=sys.stderr)
        if args.as_json:
            print(text)
        else:
            print_table(result.homeworks, show_url=args.url)
    else:
        print_table(result.homeworks, show_url=args.url)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
