"""学习通（超星）客户端：登录、课程、作业状态与截止时间。

仅用于查询本人账号数据。请控制请求频率，避免触发平台风控。
"""

from __future__ import annotations

import base64
import re
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from typing import Iterable
from urllib.parse import parse_qs, urlparse

import requests
from bs4 import BeautifulSoup
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

AES_KEY = b"u2oh6Vu^HWe4_AES"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)

STATUS_PENDING = re.compile(r"未交|未提交")
STATUS_PEER = re.compile(r"待互評|待互评")
STATUS_REVIEW = re.compile(r"待批閱|待批阅|待批改")
STATUS_DONE = re.compile(r"已完成|已批改|已互評|已互评")
REMAINING_RE = re.compile(r"剩余\s*(\d+)\s*小时\s*(\d+)\s*分钟")
ANSWER_TIME_RE = re.compile(
    r"作答时间\s*[:：]\s*(\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})\s*至\s*(\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})"
)


def encrypt_aes(text: str) -> str:
    cipher = AES.new(AES_KEY, AES.MODE_CBC, AES_KEY)
    encrypted = cipher.encrypt(pad(text.encode("utf-8"), AES.block_size))
    return base64.b64encode(encrypted).decode("utf-8")


def classify_status(raw: str) -> str:
    text = (raw or "").strip()
    if STATUS_PENDING.search(text):
        return "未交"
    if STATUS_PEER.search(text):
        return "待互评"
    if STATUS_REVIEW.search(text):
        return "待批阅"
    if STATUS_DONE.search(text):
        return "已完成"
    return text or "未知"


def remaining_to_deadline(remaining: str | None, now: datetime | None = None) -> str | None:
    if not remaining:
        return None
    match = REMAINING_RE.search(remaining)
    if not match:
        return None
    now = now or datetime.now()
    hours, minutes = int(match.group(1)), int(match.group(2))
    return (now + timedelta(hours=hours, minutes=minutes)).strftime("%Y-%m-%d %H:%M")


def guess_year_datetime(mmdd_hm: str, now: datetime | None = None) -> datetime:
    """把 'MM-DD HH:MM' 补成年份，取与今天最接近的年份。"""
    now = now or datetime.now()
    candidates: list[datetime] = []
    for year in (now.year - 1, now.year, now.year + 1):
        try:
            candidates.append(datetime.strptime(f"{year}-{mmdd_hm}", "%Y-%m-%d %H:%M"))
        except ValueError:
            continue
    if not candidates:
        raise ValueError(f"无法解析时间: {mmdd_hm}")
    return min(candidates, key=lambda dt: abs((dt - now).total_seconds()))


@dataclass
class Course:
    course_id: str
    class_id: str
    cpi: str
    name: str
    teacher: str = ""
    is_retire: int = 0
    end_date: str = ""

    @property
    def active(self) -> bool:
        return self.is_retire == 0


@dataclass
class Homework:
    course_name: str
    title: str
    status: str
    status_raw: str = ""
    remaining: str | None = None
    deadline: str | None = None
    expired: bool = False
    course_id: str = ""
    class_id: str = ""
    cpi: str = ""
    work_id: str = ""
    detail_url: str = ""
    source: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class FetchResult:
    homeworks: list[Homework] = field(default_factory=list)
    courses: list[Course] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class ChaoxingClient:
    def __init__(self, username: str, password: str, request_delay: float = 0.4):
        self.username = username.strip()
        self.password = password
        self.request_delay = max(0.0, request_delay)
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": UA,
                "Accept-Language": "zh-CN,zh;q=0.9",
            }
        )
        self._uid: str | None = None

    def _sleep(self) -> None:
        if self.request_delay:
            time.sleep(self.request_delay)

    def login(self) -> None:
        """网页端 AES 登录。"""
        url = "https://passport2.chaoxing.com/fanyalogin"
        data = {
            "fid": "-1",
            "uname": encrypt_aes(self.username),
            "password": encrypt_aes(self.password),
            "refer": "https%3A%2F%2Fi.chaoxing.com",
            "t": "true",
            "forbidotherlogin": "0",
            "validate": "",
            "doubleFactorLogin": "0",
            "independentId": "0",
            "independentNameId": "0",
        }
        headers = {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": "https://passport2.chaoxing.com",
            "Referer": "https://passport2.chaoxing.com/login?fid=&newversion=true&refer=http%3A%2F%2Fi.chaoxing.com",
            "X-Requested-With": "XMLHttpRequest",
        }
        resp = self.session.post(url, data=data, headers=headers, timeout=20)
        resp.raise_for_status()
        payload = resp.json()
        if not payload.get("status"):
            msg = payload.get("msg2") or payload.get("msg") or "未知错误"
            raise RuntimeError(f"登录失败: {msg}")

        self._uid = self.session.cookies.get("_uid") or self.session.cookies.get("UID")
        # 激活 i.chaoxing cookie 域
        self.session.get("https://i.chaoxing.com/", timeout=20)
        self._sleep()

    def list_courses(self, active_only: bool = True) -> list[Course]:
        url = "https://mooc1-api.chaoxing.com/mycourse/backclazzdata"
        resp = self.session.get(url, params={"view": "json", "rss": "1"}, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        if data.get("result") != 1:
            raise RuntimeError(f"获取课程失败: {data.get('msg') or data}")

        courses: list[Course] = []
        for channel in data.get("channelList") or []:
            content = channel.get("content") or {}
            course_data = ((content.get("course") or {}).get("data") or [{}])[0]
            if not course_data.get("id") or not content.get("id"):
                continue
            course = Course(
                course_id=str(course_data["id"]),
                class_id=str(content["id"]),
                cpi=str(content.get("cpi") or ""),
                name=str(course_data.get("name") or "未命名课程"),
                teacher=str(course_data.get("teacherfactor") or ""),
                is_retire=int(content.get("isretire") or 0),
                end_date=str(content.get("endDate") or ""),
            )
            if active_only and not course.active:
                continue
            courses.append(course)
        self._sleep()
        return courses

    def _extract_work_enc(self, html: str) -> str | None:
        soup = BeautifulSoup(html, "lxml")
        for eid in ("workEnc", "enc", "oldenc"):
            node = soup.find("input", id=eid)
            if node and node.get("value"):
                return str(node["value"]).strip()
        match = re.search(r'id=["\']workEnc["\'][^>]*value=["\']([a-f0-9]{32})["\']', html, re.I)
        if match:
            return match.group(1)
        match = re.search(r"[?&]enc=([a-f0-9]{32})", html)
        return match.group(1) if match else None

    def get_work_enc(self, course: Course) -> str:
        url = "https://mooc1.chaoxing.com/visit/stucoursemiddle"
        params = {
            "courseid": course.course_id,
            "clazzid": course.class_id,
            "cpi": course.cpi,
            "ismooc2": "1",
            "v": "2",
        }
        resp = self.session.get(url, params=params, timeout=20, allow_redirects=True)
        resp.raise_for_status()
        enc = self._extract_work_enc(resp.text)
        if not enc:
            raise RuntimeError(f"课程「{course.name}」未找到 workEnc")
        self._sleep()
        return enc

    def _parse_work_list_html(
        self,
        html: str,
        course: Course,
        now: datetime | None = None,
    ) -> tuple[list[Homework], int]:
        now = now or datetime.now()
        soup = BeautifulSoup(html, "lxml")
        items: list[Homework] = []

        for li in soup.select("li[data]"):
            detail_url = (li.get("data") or "").strip()
            title_node = li.select_one(".overHidden2") or li.find("p")
            status_node = li.select_one(".status")
            time_node = li.select_one(".time")

            title = title_node.get_text(strip=True) if title_node else ""
            status_raw = status_node.get_text(strip=True) if status_node else ""
            remaining = time_node.get_text(strip=True) if time_node else None
            if remaining:
                remaining = remaining.replace("\xa0", " ").strip()

            status = classify_status(status_raw)
            expired = False
            deadline = remaining_to_deadline(remaining, now=now)

            if status == "未交" and not time_node:
                expired = True

            work_id = ""
            if detail_url:
                qs = parse_qs(urlparse(detail_url).query)
                work_id = (qs.get("workId") or qs.get("taskrefId") or [""])[0]

            items.append(
                Homework(
                    course_name=course.name,
                    title=title,
                    status=status,
                    status_raw=status_raw,
                    remaining=remaining,
                    deadline=deadline,
                    expired=expired,
                    course_id=course.course_id,
                    class_id=course.class_id,
                    cpi=course.cpi,
                    work_id=work_id,
                    detail_url=detail_url,
                    source="course_work_list",
                )
            )

        total_pages = 1
        page = soup.select_one("#page")
        if page:
            nums = []
            for li in page.find_all("li"):
                classes = li.get("class") or []
                if "xl-prevPage" in classes or "xl-nextPage" in classes:
                    continue
                text = li.get_text(strip=True)
                if text.isdigit():
                    nums.append(int(text))
            if nums:
                total_pages = max(nums)
        return items, total_pages

    def list_course_homeworks(self, course: Course, work_enc: str | None = None) -> list[Homework]:
        enc = work_enc or self.get_work_enc(course)
        page_num = 1
        total_pages = 1
        all_items: list[Homework] = []

        while page_num <= total_pages:
            url = "https://mooc1.chaoxing.com/mooc-ans/mooc2/work/list"
            params = {
                "courseId": course.course_id,
                "classId": course.class_id,
                "cpi": course.cpi,
                "enc": enc,
                "pageNum": page_num,
                "ut": "s",
                "isdisplaytable": "2",
            }
            resp = self.session.get(url, params=params, timeout=20)
            resp.raise_for_status()
            items, total_pages = self._parse_work_list_html(resp.text, course)
            all_items.extend(items)
            page_num += 1
            self._sleep()

        return all_items

    def enrich_deadline_from_detail(self, homework: Homework) -> Homework:
        """从作业详情页解析「作答时间 ... 至 ...」作为精确截止时间。"""
        if not homework.detail_url:
            return homework
        url = homework.detail_url
        if url.startswith("/"):
            url = "https://mooc1.chaoxing.com" + url
        resp = self.session.get(url, timeout=20)
        resp.raise_for_status()
        text = BeautifulSoup(resp.text, "lxml").get_text(" ", strip=True)
        match = ANSWER_TIME_RE.search(text)
        if match:
            end = guess_year_datetime(match.group(2))
            homework.deadline = end.strftime("%Y-%m-%d %H:%M")
            homework.expired = end < datetime.now()
        self._sleep()
        return homework

    def fetch_all_homeworks_fast(self) -> list[Homework]:
        """移动端「我的作业」总览，速度快，适合先看未交与剩余时间。"""
        resp = self.session.get("https://mooc1-api.chaoxing.com/work/stu-work", timeout=20)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        now = datetime.now()
        result: list[Homework] = []

        for li in soup.find_all("li"):
            if not li.has_attr("data"):
                continue
            detail_url = li["data"]
            p_tag = li.find("p")
            if not p_tag:
                continue
            title = p_tag.get_text(strip=True)
            spans = li.find_all("span")
            if len(spans) < 2:
                continue

            status_raw = ""
            for span in spans:
                classes = span.get("class") or []
                if "status" in classes:
                    status_raw = span.get_text(strip=True)
                    break
            if not status_raw:
                status_raw = spans[0].get_text(strip=True)

            course_name = spans[1].get_text(strip=True)
            remaining = None
            for span in spans:
                classes = span.get("class") or []
                if "fr" in classes:
                    remaining = span.get_text(strip=True)
                    break

            status = classify_status(status_raw)
            qs = parse_qs(urlparse(detail_url).query)
            work_id = (qs.get("taskrefId") or qs.get("workId") or [""])[0]

            result.append(
                Homework(
                    course_name=course_name,
                    title=title,
                    status=status,
                    status_raw=status_raw,
                    remaining=remaining,
                    deadline=remaining_to_deadline(remaining, now=now),
                    expired=status == "未交" and not remaining,
                    work_id=work_id,
                    detail_url=detail_url if detail_url.startswith("http") else f"https://mooc1-api.chaoxing.com{detail_url}",
                    source="stu_work",
                )
            )
        self._sleep()
        return result

    def fetch_homeworks(
        self,
        *,
        mode: str = "courses",
        active_only: bool = True,
        status_filter: Iterable[str] | None = None,
        enrich_pending_deadline: bool = False,
        course_limit: int | None = None,
    ) -> FetchResult:
        """
        mode:
          - fast: 仅移动端总览
          - courses: 按课程拉取作业列表（更完整）
          - both: 先课程列表，再补全
        """
        result = FetchResult()
        wanted = {s.strip() for s in (status_filter or []) if s and s.strip()}

        if mode in {"fast", "both"}:
            try:
                result.homeworks.extend(self.fetch_all_homeworks_fast())
            except Exception as exc:  # noqa: BLE001
                result.errors.append(f"fast 模式失败: {exc}")

        if mode in {"courses", "both"}:
            courses = self.list_courses(active_only=active_only)
            if course_limit is not None:
                courses = courses[: max(0, course_limit)]
            result.courses = courses

            for course in courses:
                try:
                    items = self.list_course_homeworks(course)
                    result.homeworks.extend(items)
                except Exception as exc:  # noqa: BLE001
                    result.errors.append(f"课程「{course.name}」失败: {exc}")

        # 去重：course_id+work_id+title，优先保留 courses 来源
        dedup: dict[str, Homework] = {}
        for hw in result.homeworks:
            key = f"{hw.course_id}|{hw.work_id}|{hw.title}|{hw.course_name}"
            prev = dedup.get(key)
            if not prev or (prev.source == "stu_work" and hw.source == "course_work_list"):
                if prev and not hw.deadline and prev.deadline:
                    hw.deadline = prev.deadline
                    hw.remaining = hw.remaining or prev.remaining
                dedup[key] = hw
        result.homeworks = list(dedup.values())

        if enrich_pending_deadline:
            for hw in result.homeworks:
                if hw.status != "未交" or hw.deadline:
                    continue
                try:
                    self.enrich_deadline_from_detail(hw)
                except Exception as exc:  # noqa: BLE001
                    result.errors.append(f"详情截止时间失败「{hw.title}」: {exc}")

        if wanted:
            result.homeworks = [hw for hw in result.homeworks if hw.status in wanted]

        def sort_key(hw: Homework):
            # 未交优先，再按截止时间
            status_rank = {"未交": 0, "待互评": 1, "待批阅": 2, "已完成": 3}.get(hw.status, 9)
            if hw.expired:
                ts = 10**18
            elif hw.deadline:
                try:
                    ts = int(datetime.strptime(hw.deadline, "%Y-%m-%d %H:%M").timestamp())
                except ValueError:
                    ts = 10**17
            else:
                ts = 10**17
            return (status_rank, ts, hw.course_name, hw.title)

        result.homeworks.sort(key=sort_key)
        return result
