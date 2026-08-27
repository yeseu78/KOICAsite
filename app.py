"""Flask entrypoint for the public weKO survey and protected analytics dashboard."""

from __future__ import annotations

import hmac
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import (
    Flask,
    abort,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)

from analytics import SupabaseError, SupabaseEventStore, build_summary, normalize_event


ROOT = Path(__file__).resolve().parent


def _load_local_environment(path: Path) -> None:
    """Load an ignored local .env file without adding a runtime dependency."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        if name.isidentifier():
            os.environ.setdefault(name, value.strip().strip("'\""))


_load_local_environment(ROOT / ".env")
app = Flask(__name__, template_folder=str(ROOT / "templates"), static_folder=None)
app.secret_key = os.getenv("SECRET_KEY", "") or secrets.token_hex(32)
app.config.update(
    MAX_CONTENT_LENGTH=32 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=bool(os.getenv("RENDER")) or os.getenv("SESSION_COOKIE_SECURE") == "1",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 8,
)

_login_attempts: dict[str, deque[float]] = defaultdict(deque)
_event_attempts: dict[str, deque[float]] = defaultdict(deque)
_rate_lock = threading.Lock()
_summary_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_analytics_origins = {"https://yeseu78.github.io"}


def _rate_limited(bucket: dict[str, deque[float]], key: str, limit: int, window: int) -> bool:
    now = time.time()
    with _rate_lock:
        attempts = bucket[key]
        while attempts and attempts[0] <= now - window:
            attempts.popleft()
        if len(attempts) >= limit:
            return True
        attempts.append(now)
    return False


def _csrf_token() -> str:
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(24)
    return session["csrf_token"]


def _valid_csrf(value: str | None) -> bool:
    expected = session.get("csrf_token", "")
    return bool(value and expected and hmac.compare_digest(value, expected))


def admin_required(view: Callable):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin_authenticated"):
            if request.path.startswith("/admin/api/"):
                return jsonify({"error": "인증이 필요합니다."}), 401
            return redirect(url_for("admin_login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if request.path.startswith("/admin"):
        response.headers["Cache-Control"] = "no-store"
    if request.path == "/api/analytics/events":
        origin = request.headers.get("Origin", "")
        if origin in _analytics_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
            response.headers["Vary"] = "Origin"
    return response


@app.get("/")
def public_site():
    return send_from_directory(ROOT, "index.html")


@app.get("/health")
def health():
    return jsonify({"status": "ok", "analytics_configured": SupabaseEventStore.from_environment() is not None})


@app.get("/assets/<path:filename>")
def public_asset(filename: str):
    return send_from_directory(ROOT / "assets", filename)


@app.get("/static/<path:filename>")
def admin_asset(filename: str):
    return send_from_directory(ROOT / "static", filename)


@app.get("/<any(app.js,data.js,styles.css,.nojekyll):filename>")
def public_root_asset(filename: str):
    return send_from_directory(ROOT, filename)


@app.route("/admin", methods=["GET", "POST"])
def admin_login():
    if session.get("admin_authenticated"):
        return redirect(url_for("admin_dashboard"))

    error = None
    configured = bool(os.getenv("ADMIN_PASSWORD", "") and os.getenv("SECRET_KEY", ""))
    if request.method == "POST":
        if not _valid_csrf(request.form.get("csrf_token")):
            abort(400)
        client_key = request.remote_addr or "unknown"
        if _rate_limited(_login_attempts, client_key, limit=5, window=300):
            error = "로그인 시도가 많습니다. 5분 후 다시 시도해 주세요."
        elif not configured:
            error = "관리자 환경변수가 설정되지 않았습니다."
        else:
            supplied = request.form.get("password", "")
            expected = os.getenv("ADMIN_PASSWORD", "")
            if hmac.compare_digest(supplied, expected):
                session.clear()
                session["admin_authenticated"] = True
                session["csrf_token"] = secrets.token_urlsafe(24)
                session.permanent = True
                return redirect(url_for("admin_dashboard"))
            error = "비밀번호가 올바르지 않습니다."

    return render_template(
        "admin/login.html",
        error=error,
        configured=configured,
        csrf_token=_csrf_token(),
    )


@app.post("/admin/logout")
@admin_required
def admin_logout():
    if not _valid_csrf(request.form.get("csrf_token")):
        abort(400)
    session.clear()
    return redirect(url_for("admin_login"))


@app.get("/admin/dashboard")
@admin_required
def admin_dashboard():
    return render_template("admin/dashboard.html", csrf_token=_csrf_token())


@app.get("/admin/api/summary")
@admin_required
def admin_summary():
    period = request.args.get("period", "7d")
    if period not in {"7d", "14d", "all"}:
        return jsonify({"error": "지원하지 않는 기간입니다."}), 400
    store = SupabaseEventStore.from_environment()
    if store is None:
        return jsonify(
            {
                "configured": False,
                "error": "Supabase 환경변수가 설정되지 않았습니다.",
                "data": build_summary([], period),
            }
        )

    cached = _summary_cache.get(period)
    if request.args.get("refresh"):
        cached = None
    if cached and cached[0] > time.time() - 30:
        return jsonify({"configured": True, "data": cached[1]})
    try:
        summary = build_summary(store.fetch_events(), period)
    except SupabaseError:
        app.logger.exception("Unable to load analytics summary")
        return jsonify({"configured": True, "error": "통계 데이터를 불러오지 못했습니다."}), 502
    _summary_cache[period] = (time.time(), summary)
    return jsonify({"configured": True, "data": summary})


@app.post("/api/analytics/events")
def capture_event():
    client_key = request.remote_addr or "unknown"
    if _rate_limited(_event_attempts, client_key, limit=180, window=60):
        return jsonify({"error": "요청이 너무 많습니다."}), 429
    if not request.is_json:
        return jsonify({"error": "JSON 요청이 필요합니다."}), 415
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "이벤트 형식이 올바르지 않습니다."}), 400
    try:
        event = normalize_event(payload)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    store = SupabaseEventStore.from_environment()
    if store is None:
        return jsonify({"accepted": False, "reason": "analytics_not_configured"}), 503
    try:
        store.upsert_event(event)
    except SupabaseError:
        app.logger.exception("Unable to persist analytics event")
        return jsonify({"accepted": False}), 502
    _summary_cache.clear()
    return jsonify({"accepted": True}), 202


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "4173")), debug=os.getenv("FLASK_DEBUG") == "1")
