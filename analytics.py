"""Supabase event storage and server-side analytics for the weKO dashboard."""

from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


SEOUL = ZoneInfo("Asia/Seoul")
EVENT_TYPES = {
    "visit",
    "survey_start",
    "answer",
    "survey_complete",
    "result_view",
    "share",
}
RESULT_LABELS = {
    "cooperation": "협력 렌즈",
    "participation": "참여 렌즈",
    "case": "사례 렌즈",
    "empathy": "공감 렌즈",
}
SOURCE_ORDER = ["Instagram", "Kakao", "Direct", "Other"]
SHARE_LABELS = {
    "kakao": "카카오톡",
    "link_copy": "링크 복사",
    "native_share": "기기 공유",
    "instagram_story": "인스타그램 스토리",
    "instagram_feed": "인스타그램 피드",
    "other": "기타",
}


def _clean_text(value: Any, limit: int = 300) -> str:
    if value is None:
        return ""
    return str(value).strip()[:limit]


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _event_datetime(event: dict[str, Any]) -> datetime:
    return _parse_datetime(event.get("occurred_at")) or datetime.min.replace(tzinfo=timezone.utc)


def classify_source(source: Any, referrer: Any = "") -> str:
    source_text = _clean_text(source, 120).lower()
    referrer_text = _clean_text(referrer, 500).lower()
    combined = f"{source_text} {referrer_text}"
    if any(token in combined for token in ("instagram", "l.instagram.com", "ig_web")):
        return "Instagram"
    if any(token in combined for token in ("kakao", "talk.kakao", "story.kakao")):
        return "Kakao"
    if not source_text and not referrer_text:
        return "Direct"
    if source_text in {"direct", "(direct)"}:
        return "Direct"
    return "Other"


def make_event_key(payload: dict[str, Any]) -> str:
    event_type = payload["event_type"]
    visit_id = payload["visit_id"]
    if event_type == "answer":
        return f"answer:{visit_id}:{payload['question_id']}"
    if event_type == "share":
        event_id = _clean_text(payload.get("event_id"), 80)
        if not event_id:
            raise ValueError("공유 이벤트 식별자가 필요합니다.")
        return f"share:{visit_id}:{event_id}"
    return f"{event_type}:{visit_id}"


def normalize_event(payload: dict[str, Any]) -> dict[str, Any]:
    event_type = _clean_text(payload.get("event_type"), 40)
    if event_type not in EVENT_TYPES:
        raise ValueError("지원하지 않는 이벤트입니다.")

    visitor_id = _clean_text(payload.get("visitor_id"), 80)
    visit_id = _clean_text(payload.get("visit_id"), 80)
    if not visitor_id or not visit_id:
        raise ValueError("방문자 및 방문 식별자가 필요합니다.")
    if not all(character.isalnum() or character in "-_" for character in visitor_id + visit_id):
        raise ValueError("이벤트 식별자 형식이 올바르지 않습니다.")

    question_id = _clean_text(payload.get("question_id"), 100) or None
    if event_type == "answer" and not question_id:
        raise ValueError("질문 식별자가 필요합니다.")

    source = _clean_text(payload.get("source"), 120) or None
    referrer = _clean_text(payload.get("referrer"), 500)
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    safe_metadata = {
        _clean_text(key, 60): _clean_text(value, 500)
        for key, value in list(metadata.items())[:12]
        if _clean_text(key, 60)
    }
    if referrer:
        safe_metadata["referrer"] = referrer

    normalized = {
        "event_type": event_type,
        "visitor_id": visitor_id,
        "visit_id": visit_id,
        "question_id": question_id,
        "answer_value": _clean_text(payload.get("answer_value"), 500) or None,
        "result_type": _clean_text(payload.get("result_type"), 100) or None,
        "share_channel": _clean_text(payload.get("share_channel"), 100) or None,
        "source": source,
        "medium": _clean_text(payload.get("medium"), 120) or None,
        "campaign": _clean_text(payload.get("campaign"), 120) or None,
        "traffic_source": classify_source(source, referrer) if event_type == "visit" else None,
        "metadata": safe_metadata,
    }
    if event_type in {"answer", "survey_complete", "result_view"}:
        normalized["occurred_at"] = datetime.now(timezone.utc).isoformat()
    normalized["event_key"] = make_event_key({**payload, **normalized})
    return normalized


class SupabaseError(RuntimeError):
    pass


@dataclass
class SupabaseEventStore:
    url: str
    key: str
    table: str = "weko_analytics_events"
    timeout: int = 12

    @classmethod
    def from_environment(cls) -> "SupabaseEventStore | None":
        url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
        key = (
            os.getenv("SUPABASE_SECRET_KEY", "").strip()
            or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
            or os.getenv("SUPABASE_KEY", "").strip()
        )
        if not url or not key:
            return None
        return cls(url=url, key=key, table=os.getenv("SUPABASE_ANALYTICS_TABLE", "weko_analytics_events"))

    @property
    def endpoint(self) -> str:
        return f"{self.url}/rest/v1/{self.table}"

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {
            "apikey": self.key,
            "Content-Type": "application/json",
        }
        # Supabase's new sb_secret keys authenticate through apikey. Legacy
        # service_role JWTs also need to be forwarded as the bearer token.
        if not self.key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.key}"
        if extra:
            headers.update(extra)
        return headers

    def upsert_event(self, event: dict[str, Any]) -> None:
        query = urlencode({"on_conflict": "event_key"})
        resolution = (
            "merge-duplicates"
            if event.get("event_type") in {"answer", "survey_complete", "result_view"}
            else "ignore-duplicates"
        )
        request = Request(
            f"{self.endpoint}?{query}",
            data=json.dumps([event], ensure_ascii=False).encode("utf-8"),
            headers=self._headers({"Prefer": f"resolution={resolution},return=minimal"}),
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                if response.status not in (200, 201, 204):
                    raise SupabaseError(f"Supabase event write failed ({response.status})")
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:500]
            raise SupabaseError(f"Supabase event write failed ({error.code}): {detail}") from error
        except URLError as error:
            raise SupabaseError("Supabase에 연결할 수 없습니다.") from error

    def check_connection(self) -> None:
        query = urlencode({"select": "id", "limit": 1})
        request = Request(
            f"{self.endpoint}?{query}",
            headers=self._headers(),
            method="GET",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                if response.status != 200:
                    raise SupabaseError(f"Supabase readiness check failed ({response.status})")
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:500]
            raise SupabaseError(
                f"Supabase readiness check failed ({error.code}): {detail}"
            ) from error
        except (URLError, json.JSONDecodeError) as error:
            raise SupabaseError("Supabase 연결 상태를 확인할 수 없습니다.") from error
        if not isinstance(payload, list):
            raise SupabaseError("Supabase readiness 응답 형식이 올바르지 않습니다.")

    def fetch_events(self) -> list[dict[str, Any]]:
        selected = (
            "event_type,visitor_id,visit_id,question_id,answer_value,result_type,"
            "share_channel,source,medium,campaign,traffic_source,metadata,occurred_at"
        )
        events: list[dict[str, Any]] = []
        page_size = 1000
        start = 0
        while True:
            query = urlencode({"select": selected, "order": "occurred_at.asc"})
            request = Request(
                f"{self.endpoint}?{query}",
                headers=self._headers({"Range": f"{start}-{start + page_size - 1}"}),
                method="GET",
            )
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    batch = json.loads(response.read().decode("utf-8"))
            except HTTPError as error:
                detail = error.read().decode("utf-8", errors="replace")[:500]
                raise SupabaseError(f"Supabase event read failed ({error.code}): {detail}") from error
            except (URLError, json.JSONDecodeError) as error:
                raise SupabaseError("Supabase 통계 데이터를 불러올 수 없습니다.") from error
            if not isinstance(batch, list):
                raise SupabaseError("Supabase 통계 응답 형식이 올바르지 않습니다.")
            events.extend(batch)
            if len(batch) < page_size:
                break
            start += page_size
        return events


def _latest_by(events: Iterable[dict[str, Any]], key) -> list[dict[str, Any]]:
    latest: dict[Any, dict[str, Any]] = {}
    for event in events:
        item_key = key(event)
        current = latest.get(item_key)
        if current is None or _event_datetime(event) >= _event_datetime(current):
            latest[item_key] = event
    return list(latest.values())


def _percentage(numerator: int | float, denominator: int | float) -> float:
    if not denominator:
        return 0.0
    return round(float(numerator) / float(denominator) * 100, 1)


def _target_from_env(name: str) -> float | None:
    value = os.getenv(name, "").strip()
    if not value:
        return None
    try:
        target = float(value)
    except ValueError:
        return None
    return target if target > 0 else None


def _build_kpi(label: str, value: float, target_env: str, suffix: str = "") -> dict[str, Any]:
    target = _target_from_env(target_env)
    return {
        "label": label,
        "value": round(value, 1),
        "target": target,
        "suffix": suffix,
        "rate": _percentage(value, target) if target else None,
        "enabled": target is not None,
    }


def build_summary(events: list[dict[str, Any]], period: str = "7d", now: datetime | None = None) -> dict[str, Any]:
    now_utc = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    now_seoul = now_utc.astimezone(SEOUL)
    today = now_seoul.date()
    week_start = today - timedelta(days=today.weekday())

    starts = [event for event in events if event.get("event_type") == "survey_start"]
    completions = [event for event in events if event.get("event_type") == "survey_complete"]
    visits = [event for event in events if event.get("event_type") == "visit"]
    result_views = [event for event in events if event.get("event_type") == "result_view"]
    shares = [event for event in events if event.get("event_type") == "share"]
    answers = [event for event in events if event.get("event_type") == "answer"]

    latest_start_visitors = _latest_by(starts, lambda event: event.get("visitor_id"))
    latest_completion_visitors = _latest_by(completions, lambda event: event.get("visitor_id"))
    latest_results = _latest_by(completions, lambda event: event.get("visitor_id"))
    latest_answers = _latest_by(
        answers,
        lambda event: (event.get("visitor_id"), event.get("question_id")),
    )
    latest_answers = [
        event for event in latest_answers if event.get("answer_value") not in (None, "")
    ]
    unique_visits = _latest_by(visits, lambda event: event.get("visit_id"))

    def seoul_date(event: dict[str, Any]):
        parsed = _parse_datetime(event.get("occurred_at"))
        return parsed.astimezone(SEOUL).date() if parsed else None

    total_participants = len(latest_start_visitors)
    today_participants = sum(seoul_date(event) == today for event in latest_start_visitors)
    week_participants = sum(
        bool((event_date := seoul_date(event)) and week_start <= event_date <= today)
        for event in latest_start_visitors
    )
    completed_participants = len(latest_completion_visitors)
    completion_rate = _percentage(completed_participants, total_participants)
    dropoffs = max(total_participants - completed_participants, 0)

    result_counts = Counter(
        event.get("result_type") or "unknown" for event in latest_results
    )
    result_total = sum(result_counts.values())
    result_distribution = []
    for result_type, count in result_counts.most_common():
        result_distribution.append(
            {
                "key": result_type,
                "label": RESULT_LABELS.get(result_type, result_type or "미분류"),
                "count": count,
                "rate": _percentage(count, result_total),
            }
        )

    grouped_answers: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for answer in latest_answers:
        grouped_answers[answer.get("question_id") or "unknown"].append(answer)
    question_stats = []
    for question_id, question_events in grouped_answers.items():
        counts = Counter(event.get("answer_value") or "미응답" for event in question_events)
        labels: dict[str, str] = {}
        question_title = question_id
        question_orders: list[int] = []
        for event in question_events:
            metadata = event.get("metadata") if isinstance(event.get("metadata"), dict) else {}
            answer_value = event.get("answer_value") or "미응답"
            labels[answer_value] = metadata.get("answer_label") or answer_value
            question_title = metadata.get("question_title") or question_title
            raw_order = str(metadata.get("question_order", ""))
            if raw_order.isdigit():
                question_orders.append(int(raw_order))
        total = sum(counts.values())
        options = [
            {
                "key": key,
                "label": labels.get(key, key),
                "count": count,
                "rate": _percentage(count, total),
            }
            for key, count in counts.most_common()
        ]
        question_stats.append(
            {
                "id": question_id,
                "title": question_title,
                "order": min(question_orders, default=999),
                "total": total,
                "options": options,
            }
        )
    question_stats.sort(key=lambda item: (item["order"], item["id"]))

    share_users = len({event.get("visitor_id") for event in shares if event.get("visitor_id")})
    result_view_users = len(
        {event.get("visitor_id") for event in result_views if event.get("visitor_id")}
    )
    share_counts = Counter(event.get("share_channel") or "other" for event in shares)
    share_channels = [
        {
            "key": channel,
            "label": SHARE_LABELS.get(channel, channel),
            "count": count,
            "rate": _percentage(count, len(shares)),
        }
        for channel, count in share_counts.most_common()
    ]

    visit_source_by_id = {
        event.get("visit_id"): event.get("traffic_source") or classify_source(
            event.get("source"),
            (event.get("metadata") or {}).get("referrer", "")
            if isinstance(event.get("metadata"), dict)
            else "",
        )
        for event in unique_visits
    }
    traffic_counts = Counter(visit_source_by_id.values())
    completion_visit_ids = {
        event.get("visit_id") for event in completions if event.get("visit_id")
    }
    traffic = []
    for source_name in SOURCE_ORDER:
        count = traffic_counts.get(source_name, 0)
        completed = sum(
            visit_id in completion_visit_ids
            for visit_id, source in visit_source_by_id.items()
            if source == source_name
        )
        traffic.append(
            {
                "source": source_name,
                "visits": count,
                "rate": _percentage(count, len(unique_visits)),
                "completed": completed,
                "completion_rate": _percentage(completed, count),
            }
        )

    days = 14 if period == "14d" else 7
    if period == "all" and starts:
        start_dates = [date for event in starts if (date := seoul_date(event))]
        first_date = min(start_dates) if start_dates else today
    else:
        first_date = today - timedelta(days=days - 1)
    day_count = max((today - first_date).days + 1, 1)
    daily_visitors: dict[Any, set[str]] = defaultdict(set)
    for event in starts:
        event_date = seoul_date(event)
        if event_date and event_date >= first_date and event.get("visitor_id"):
            daily_visitors[event_date].add(event["visitor_id"])
    trend = [
        {
            "date": (first_date + timedelta(days=index)).isoformat(),
            "label": (first_date + timedelta(days=index)).strftime("%-m/%-d")
            if os.name != "nt"
            else f"{(first_date + timedelta(days=index)).month}/{(first_date + timedelta(days=index)).day}",
            "count": len(daily_visitors[first_date + timedelta(days=index)]),
        }
        for index in range(day_count)
    ]

    most_common_result = result_distribution[0] if result_distribution else None
    instagram_visits = traffic_counts.get("Instagram", 0)
    kpis = [
        _build_kpi("설문 참여자", total_participants, "KPI_SURVEY_TARGET", "명"),
        _build_kpi("공유 횟수", len(shares), "KPI_SHARE_TARGET", "회"),
        _build_kpi("설문 완료율", completion_rate, "KPI_COMPLETION_RATE_TARGET", "%"),
        _build_kpi("Instagram 유입", instagram_visits, "KPI_INSTAGRAM_TARGET", "회"),
    ]

    return {
        "generated_at": now_seoul.isoformat(),
        "timezone": "Asia/Seoul",
        "period": period,
        "summary": {
            "total_participants": total_participants,
            "today_participants": today_participants,
            "week_participants": week_participants,
            "completed_participants": completed_participants,
            "completion_rate": completion_rate,
            "dropoffs": dropoffs,
            "share_clicks": len(shares),
            "share_users": share_users,
            "share_rate": _percentage(share_users, result_view_users),
            "result_view_users": result_view_users,
            "total_visits": len(unique_visits),
        },
        "trend": trend,
        "traffic": traffic,
        "results": result_distribution,
        "most_common_result": most_common_result,
        "questions": question_stats,
        "shares": share_channels,
        "kpis": kpis,
    }
