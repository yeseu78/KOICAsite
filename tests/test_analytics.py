import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from analytics import build_summary, classify_source, normalize_event


class AnalyticsTests(unittest.TestCase):
    def test_source_classification(self):
        self.assertEqual(classify_source("instagram", ""), "Instagram")
        self.assertEqual(classify_source("", "https://talk.kakao.com/path"), "Kakao")
        self.assertEqual(classify_source("", ""), "Direct")
        self.assertEqual(classify_source("newsletter", "https://example.com"), "Other")

    def test_normalize_event_dedupes_answer_by_event_key(self):
        event = normalize_event(
            {
                "event_type": "answer",
                "visitor_id": "visitor-1",
                "visit_id": "visit-1",
                "question_id": "oda-image",
                "answer_value": "1",
                "metadata": {"answer_label": "응답"},
            }
        )
        self.assertEqual(event["event_key"], "answer:visit-1:oda-image")
        self.assertEqual(event["metadata"]["answer_label"], "응답")

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
        self.assertEqual(summary["summary"]["completion_rate"], 100.0)
        self.assertEqual(summary["traffic"][0]["visits"], 1)
        self.assertEqual(summary["most_common_result"]["label"], "공감 렌즈")
        self.assertEqual(summary["kpis"][0]["rate"], 10.0)


if __name__ == "__main__":
    unittest.main()
