import os
import re
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password")
os.environ.setdefault("SECRET_KEY", "test-secret-key")

from analytics import SupabaseError
from app import app


class FlaskAppTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True, SESSION_COOKIE_SECURE=False)
        self.client = app.test_client()

    def csrf_from_login(self):
        response = self.client.get("/admin")
        match = re.search(rb'name="csrf_token" value="([^"]+)"', response.data)
        self.assertIsNotNone(match)
        return match.group(1).decode()

    def test_public_site_and_assets_are_served(self):
        for path in ("/", "/app.js", "/static/admin.css"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            response.close()

    def test_survey_start_event_has_one_emission_point(self):
        source = (Path(__file__).resolve().parents[1] / "app.js").read_text(encoding="utf-8")
        self.assertEqual(source.count('trackEvent("survey_start")'), 1)

    def test_dashboard_uses_original_question_order(self):
        source = (
            Path(__file__).resolve().parents[1] / "static" / "admin-dashboard.js"
        ).read_text(encoding="utf-8")
        self.assertIn("question.order", source)
        self.assertIn("Q${questionNumber}", source)

    @patch("app.SupabaseEventStore.from_environment")
    def test_readiness_checks_supabase_connection(self, from_environment):
        store = Mock()
        from_environment.return_value = store
        response = self.client.get("/ready")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ready", "analytics": "connected"})
        store.check_connection.assert_called_once_with()

    @patch("app.SupabaseEventStore.from_environment", return_value=None)
    def test_readiness_fails_when_supabase_is_not_configured(self, _from_environment):
        response = self.client.get("/ready")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["analytics"], "not_configured")

    @patch("app.SupabaseEventStore.from_environment")
    def test_readiness_fails_when_supabase_is_unavailable(self, from_environment):
        store = Mock()
        store.check_connection.side_effect = SupabaseError("unavailable")
        from_environment.return_value = store
        with self.assertLogs(app.logger.name, level="ERROR"):
            response = self.client.get("/ready")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["analytics"], "unavailable")

    def test_dashboard_requires_login(self):
        response = self.client.get("/admin/dashboard")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin", response.headers["Location"])

    def test_github_pages_origin_can_preflight_analytics(self):
        response = self.client.options(
            "/api/analytics/events",
            headers={
                "Origin": "https://yeseu78.github.io",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["Access-Control-Allow-Origin"],
            "https://yeseu78.github.io",
        )
        self.assertEqual(response.headers["Vary"], "Origin")

    def test_shared_result_link_starts_the_first_question(self):
        source = (Path(__file__).resolve().parents[1] / "app.js").read_text(encoding="utf-8")
        share_function = re.search(
            r"function getResultShareData\(.*?\n}\n",
            source,
            re.DOTALL,
        )
        self.assertIsNotNone(share_function)
        self.assertIn('view: "quiz"', share_function.group(0))
        self.assertIn('question: "1"', share_function.group(0))
        self.assertNotIn('view: "result"', share_function.group(0))

    def test_wrong_password_is_rejected_and_correct_password_logs_in(self):
        csrf = self.csrf_from_login()
        wrong = self.client.post(
            "/admin",
            data={"csrf_token": csrf, "password": "wrong"},
        )
        self.assertEqual(wrong.status_code, 200)
        self.assertIn("비밀번호가 올바르지 않습니다".encode(), wrong.data)

        csrf = self.csrf_from_login()
        correct = self.client.post(
            "/admin",
            data={"csrf_token": csrf, "password": "test-admin-password"},
        )
        self.assertEqual(correct.status_code, 302)
        self.assertTrue(correct.headers["Location"].endswith("/admin/dashboard"))
        self.assertEqual(self.client.get("/admin/dashboard").status_code, 200)

    @patch.dict(
        os.environ,
        {
            "SUPABASE_URL": "",
            "SUPABASE_SECRET_KEY": "",
            "SUPABASE_SERVICE_ROLE_KEY": "",
            "SUPABASE_KEY": "",
        },
    )
    def test_analytics_endpoint_fails_closed_without_supabase_config(self):
        response = self.client.post(
            "/api/analytics/events",
            json={
                "event_type": "visit",
                "visitor_id": "visitor-test",
                "visit_id": "visit-test",
                "source": "instagram",
            },
        )
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.get_json()["accepted"])


if __name__ == "__main__":
    unittest.main()
