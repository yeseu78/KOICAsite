import os
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from urllib.error import URLError

from analytics import SupabaseError, SupabaseEventStore, build_summary, classify_source, normalize_event


class AnalyticsTests(unittest.TestCase):
    @patch("analytics.urlopen")
    def test_supabase_readiness_accepts_a_list_response(self, urlopen):
        response = MagicMock()
        response.status = 200
        response.read.return_value = b"[]"
        urlopen.return_value.__enter__.return_value = response

        SupabaseEventStore("https://example.supabase.co", "secret").check_connection()

    @patch("analytics.urlopen", side_effect=URLError("offline"))
    def test_supabase_readiness_wraps_connection_errors(self, _urlopen):
        with self.assertRaises(SupabaseError):
            SupabaseEventStore("https://example.supabase.co", "secret").check_connection()

    def test_source_classification(self):
        self.assertEqual(classify_source("instagram", ""), "Instagram")
        self.assertEqual(classify_source("", "https://talk.kakao.com/path"), "Kakao")
        self.assertEqual(classify_source("shared_link", ""), "Shared Link")
        self.assertEqual(
            classify_source("shared_link", "https://l.instagram.com/redirect"),
            "Instagram",
        )
        self.assertEqual(
            classify_source("shared_link", "https://talk.kakao.com/path"),
            "Kakao",
        )
        self.assertEqual(classify_source("", ""), "Direct")
        self.assertEqual(classify_source("newsletter", "https://example.com"), "Other")

    def test_shared_link_stays_compatible_with_existing_database_constraint(self):
        event = normalize_event(
            {
                "event_type": "visit",
                "visitor_id": "visitor-shared",
                "visit_id": "visit-shared",
                "source": "shared_link",
                "medium": "share",
            }
        )
        self.assertEqual(event["source"], "shared_link")
        self.assertEqual(event["traffic_source"], "Other")

    def test_normalize_event_dedupes_answer_by_event_key(self):
        event = normalize_event(
            {
                "event_type": "answer",
                "visitor_id": "visitor-1",
                "visit_id": "visit-1",
                "attempt_id": "attempt-1",
                "question_id": "oda-image",
                "answer_value": "1",
                "metadata": {"answer_label": "응답"},
            }
        )
        self.assertEqual(event["event_key"], "answer:visit-1:attempt-1:oda-image")
        self.assertEqual(event["attempt_id"], "attempt-1")
        self.assertEqual(event["metadata"]["answer_label"], "응답")

    def test_survey_attempts_get_distinct_event_keys_in_one_visit(self):
        first = normalize_event(
            {
                "event_type": "survey_complete",
                "visitor_id": "visitor-1",
                "visit_id": "visit-1",
                "attempt_id": "attempt-1",
            }
        )
        second = normalize_event(
            {
                "event_type": "survey_complete",
                "visitor_id": "visitor-1",
                "visit_id": "visit-1",
                "attempt_id": "attempt-2",
            }
        )

        self.assertEqual(first["event_key"], "survey_complete:visit-1:attempt-1")
        self.assertEqual(second["event_key"], "survey_complete:visit-1:attempt-2")
        self.assertNotEqual(first["event_key"], second["event_key"])

    @patch.dict(os.environ, {"KPI_SURVEY_TARGET": "10"}, clear=False)
    def test_summary_uses_seoul_dates_and_real_events(self):
        events = [
            {
                "event_type": "visit",
                "visitor_id": "v1",
                "visit_id": "s1",
                "traffic_source": "Instagram",
                "occurred_at": "2026-08-27T15:10:00Z",
            },
            {
                "event_type": "survey_start",
                "visitor_id": "v1",
                "visit_id": "s1",
                "occurred_at": "2026-08-27T15:11:00Z",
            },
            {
                "event_type": "survey_complete",
                "visitor_id": "v1",
                "visit_id": "s1",
                "result_type": "empathy",
                "occurred_at": "2026-08-27T15:15:00Z",
            },
            {
                "event_type": "result_view",
                "visitor_id": "v1",
                "visit_id": "s1",
                "occurred_at": "2026-08-27T15:15:01Z",
            },
            {
                "event_type": "share",
                "visitor_id": "v1",
                "visit_id": "s1",
                "share_channel": "link_copy",
                "occurred_at": "2026-08-27T15:16:00Z",
            },
        ]
        summary = build_summary(
            events,
            now=datetime(2026, 8, 28, 1, tzinfo=timezone.utc),
        )
        self.assertEqual(summary["summary"]["today_participants"], 1)
        self.assertEqual(summary["summary"]["today_surveys"], 1)
        self.assertEqual(summary["summary"]["completion_rate"], 100.0)
        self.assertEqual(summary["traffic"][0]["visits"], 1)
        self.assertEqual(summary["most_common_result"]["label"], "공감 렌즈")
        self.assertEqual(summary["kpis"][0]["rate"], 10.0)

    def test_all_counting_scenarios_are_consistent(self):
        events = [
            # Six visits: Instagram, KakaoTalk, shared link, two direct, one other.
            {"event_type": "visit", "visitor_id": "v1", "visit_id": "ig-1", "source": "instagram", "occurred_at": "2026-09-04T00:00:00Z"},
            {"event_type": "visit", "visitor_id": "v1", "visit_id": "direct-repeat", "traffic_source": "Direct", "occurred_at": "2026-09-04T01:00:00Z"},
            {"event_type": "visit", "visitor_id": "v2", "visit_id": "kakao-1", "source": "shared_link", "traffic_source": "Other", "metadata": {"referrer": "https://talk.kakao.com/path"}, "occurred_at": "2026-09-04T00:10:00Z"},
            {"event_type": "visit", "visitor_id": "v3", "visit_id": "shared-1", "source": "shared_link", "traffic_source": "Other", "occurred_at": "2026-09-04T00:20:00Z"},
            {"event_type": "visit", "visitor_id": "v4", "visit_id": "direct-only", "traffic_source": "Direct", "occurred_at": "2026-09-04T00:30:00Z"},
            {"event_type": "visit", "visitor_id": "v5", "visit_id": "other-1", "source": "newsletter", "traffic_source": "Other", "occurred_at": "2026-09-04T00:40:00Z"},
            # Five survey attempts. Legacy events use visit_id as the attempt key.
            {"event_type": "survey_start", "visitor_id": "v1", "visit_id": "ig-1", "occurred_at": "2026-09-04T00:01:00Z"},
            {"event_type": "survey_start", "visitor_id": "v1", "visit_id": "ig-1", "occurred_at": "2026-09-04T00:02:00Z"},
            {"event_type": "survey_start", "visitor_id": "v1", "visit_id": "direct-repeat", "occurred_at": "2026-09-04T01:01:00Z"},
            {"event_type": "survey_start", "visitor_id": "v2", "visit_id": "kakao-1", "occurred_at": "2026-09-04T00:11:00Z"},
            {"event_type": "survey_start", "visitor_id": "v3", "visit_id": "shared-1", "occurred_at": "2026-09-04T00:21:00Z"},
            {"event_type": "survey_start", "visitor_id": "v5", "visit_id": "other-1", "occurred_at": "2026-09-04T00:41:00Z"},
            # v2 exits midway. An orphan completion must not push the rate over 100%.
            {"event_type": "survey_complete", "visitor_id": "v1", "visit_id": "ig-1", "result_type": "cooperation", "occurred_at": "2026-09-04T00:05:00Z"},
            {"event_type": "survey_complete", "visitor_id": "v3", "visit_id": "shared-1", "result_type": "case", "occurred_at": "2026-09-04T00:25:00Z"},
            {"event_type": "survey_complete", "visitor_id": "v5", "visit_id": "other-1", "result_type": "empathy", "occurred_at": "2026-09-04T00:45:00Z"},
            {"event_type": "survey_complete", "visitor_id": "orphan", "visit_id": "orphan-1", "result_type": "participation", "occurred_at": "2026-09-04T00:50:00Z"},
            {"event_type": "result_view", "visitor_id": "v1", "visit_id": "ig-1", "occurred_at": "2026-09-04T00:06:00Z"},
            {"event_type": "result_view", "visitor_id": "v3", "visit_id": "shared-1", "occurred_at": "2026-09-04T00:26:00Z"},
            # Five successful share actions by three users; repeated clicks all count.
            {"event_type": "share", "visitor_id": "v1", "visit_id": "ig-1", "share_channel": "link_copy", "occurred_at": "2026-09-04T00:07:00Z"},
            {"event_type": "share", "visitor_id": "v1", "visit_id": "ig-1", "share_channel": "link_copy", "occurred_at": "2026-09-04T00:07:01Z"},
            {"event_type": "share", "visitor_id": "v1", "visit_id": "ig-1", "share_channel": "instagram_story", "occurred_at": "2026-09-04T00:07:02Z"},
            {"event_type": "share", "visitor_id": "v3", "visit_id": "shared-1", "share_channel": "native_share", "occurred_at": "2026-09-04T00:27:00Z"},
            {"event_type": "share", "visitor_id": "share-orphan", "visit_id": "share-orphan-1", "share_channel": "kakao", "occurred_at": "2026-09-04T00:28:00Z"},
            # The later selection replaces the earlier answer for the same visitor/question.
            {"event_type": "answer", "visitor_id": "v1", "visit_id": "ig-1", "question_id": "q1", "answer_value": "0", "occurred_at": "2026-09-04T00:03:00Z"},
            {"event_type": "answer", "visitor_id": "v1", "visit_id": "direct-repeat", "question_id": "q1", "answer_value": "1", "occurred_at": "2026-09-04T01:02:00Z"},
            {"event_type": "answer", "visitor_id": "v2", "visit_id": "kakao-1", "question_id": "q1", "answer_value": "0", "occurred_at": "2026-09-04T00:12:00Z"},
        ]

        data = build_summary(events, now=datetime(2026, 9, 4, 3, tzinfo=timezone.utc))
        summary = data["summary"]
        self.assertEqual(summary["total_visits"], 6)
        self.assertEqual(summary["total_participants"], 5)
        self.assertEqual(summary["completed_participants"], 3)
        self.assertEqual(summary["total_surveys"], 3)
        self.assertEqual(summary["dropoffs"], 2)
        self.assertEqual(summary["completion_rate"], 60.0)
        self.assertEqual(summary["share_clicks"], 5)
        self.assertEqual(summary["share_users"], 3)
        self.assertEqual(summary["result_view_users"], 2)
        self.assertEqual(summary["share_rate"], 100.0)

        traffic = {item["source"]: item for item in data["traffic"]}
        self.assertEqual(traffic["Instagram"]["visits"], 1)
        self.assertEqual(traffic["Kakao"]["visits"], 1)
        self.assertEqual(traffic["Shared Link"]["visits"], 1)
        self.assertEqual(traffic["Shared Link"]["completed"], 1)
        self.assertEqual(traffic["Direct"]["visits"], 2)
        self.assertEqual(traffic["Other"]["visits"], 1)

        shares = {item["key"]: item["count"] for item in data["shares"]}
        self.assertEqual(shares["link_copy"], 2)
        self.assertEqual(shares["instagram_story"], 1)
        self.assertEqual(shares["native_share"], 1)
        self.assertEqual(shares["kakao"], 1)
        self.assertEqual(data["questions"][0]["total"], 3)
        answers = {item["key"]: item["count"] for item in data["questions"][0]["options"]}
        self.assertEqual(answers, {"0": 2, "1": 1})
        self.assertEqual(sum(item["count"] for item in data["results"]), 3)

    def test_same_device_and_visit_counts_each_attempt(self):
        events = [
            {
                "event_type": event_type,
                "visitor_id": "same-device",
                "visit_id": "same-visit",
                "attempt_id": attempt_id,
                "question_id": "q1" if event_type == "answer" else None,
                "answer_value": answer if event_type == "answer" else None,
                "result_type": result if event_type == "survey_complete" else None,
                "occurred_at": occurred_at,
            }
            for attempt_id, answer, result, minute in (
                ("attempt-1", "0", "cooperation", 1),
                ("attempt-2", "1", "empathy", 11),
            )
            for event_type, offset in (
                ("survey_start", 0),
                ("answer", 1),
                ("survey_complete", 2),
            )
            for occurred_at in [f"2026-10-03T00:{minute + offset:02d}:00Z"]
        ]

        data = build_summary(events, now=datetime(2026, 10, 3, 3, tzinfo=timezone.utc))

        self.assertEqual(data["summary"]["total_participants"], 2)
        self.assertEqual(data["summary"]["total_surveys"], 2)
        self.assertEqual(data["summary"]["today_surveys"], 2)
        self.assertEqual(data["summary"]["completion_rate"], 100.0)
        self.assertEqual(data["trend"][-1]["count"], 2)
        self.assertEqual(data["questions"][0]["total"], 2)
        self.assertEqual(sum(item["count"] for item in data["results"]), 2)


if __name__ == "__main__":
    unittest.main()
