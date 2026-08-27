import os
import re
import unittest
from unittest.mock import patch

os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password")
os.environ.setdefault("SECRET_KEY", "test-secret-key")

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
