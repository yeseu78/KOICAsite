const numberFormatter = new Intl.NumberFormat("ko-KR");
const colors = ["#6f35a5", "#f1973f", "#46a778", "#e85f8e", "#4e78c4", "#9d72bf"];
const trafficColors = {
  Instagram: "#7d3eb1",
  Kakao: "#f1b72c",
  "Shared Link": "#4e78c4",
  Direct: "#4d9c78",
  Other: "#a7a1ab",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function formatNumber(value) {
  return numberFormatter.format(Number(value || 0));
}

function setMetric(name, value) {
  document.querySelectorAll(`[data-metric="${name}"]`).forEach((element) => {
    element.textContent = name.includes("rate") ? Number(value || 0).toFixed(1) : formatNumber(value);
  });
}

function donutBackground(items, colorFor) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (!total) return "conic-gradient(#eee9f0 0 100%)";
  let cursor = 0;
  const stops = items.map((item, index) => {
    const start = cursor;
    cursor += (item.count / total) * 100;
    return `${colorFor(item, index)} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function renderLegend(container, items, colorFor, valueKey = "count") {
  container.innerHTML = items.length
    ? items
        .map(
          (item, index) => `
            <div class="legend-row">
              <i style="--legend-color:${colorFor(item, index)}"></i>
              <span>${escapeHtml(item.label || item.source)}</span>
              <strong>${formatNumber(item[valueKey])}<small> · ${Number(item.rate || 0).toFixed(1)}%</small></strong>
            </div>`,
        )
        .join("")
    : '<p class="empty-state">아직 집계된 데이터가 없습니다.</p>';
}

function renderTrend(items) {
  const container = document.querySelector("[data-trend-chart]");
  if (!items.length) {
    container.innerHTML = '<p class="empty-state">아직 참여 데이터가 없습니다.</p>';
    return;
  }
  const width = 760;
  const height = 260;
  const left = 42;
  const right = 18;
  const top = 22;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(...items.map((item) => item.count), 1);
  const points = items.map((item, index) => ({
    ...item,
    x: left + (items.length === 1 ? plotWidth / 2 : (index / (items.length - 1)) * plotWidth),
    y: top + plotHeight - (item.count / max) * plotHeight,
  }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const area = `${path} L${points.at(-1).x},${top + plotHeight} L${points[0].x},${top + plotHeight} Z`;
  const labelStep = Math.max(1, Math.ceil(items.length / 7));
  const labels = points
    .filter((_, index) => index % labelStep === 0 || index === points.length - 1)
    .map((point) => `<text x="${point.x}" y="244" text-anchor="middle">${escapeHtml(point.label)}</text>`)
    .join("");
  const dots = points
    .map(
      (point) => `
        <g class="trend-point"><circle cx="${point.x}" cy="${point.y}" r="4"></circle>
        <title>${escapeHtml(point.date)}: ${formatNumber(point.count)}명</title></g>`,
    )
    .join("");
  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="참여자 수 선 그래프">
      <defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#8d4bbe" stop-opacity=".24"/><stop offset="1" stop-color="#8d4bbe" stop-opacity="0"/></linearGradient></defs>
      <line class="chart-grid" x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}"></line>
      <line class="chart-grid" x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}"></line>
      <text class="axis-value" x="${left - 8}" y="${top + 4}" text-anchor="end">${formatNumber(max)}</text>
      <text class="axis-value" x="${left - 8}" y="${top + plotHeight + 4}" text-anchor="end">0</text>
      <path class="trend-area" d="${area}"></path><path class="trend-line" d="${path}"></path>${dots}${labels}
    </svg>`;
}

function renderTraffic(items, total) {
  const donut = document.querySelector("[data-traffic-donut]");
  donut.style.background = donutBackground(items.map((item) => ({ ...item, count: item.visits })), (item) => trafficColors[item.source]);
  donut.innerHTML = `<span>${formatNumber(total)}<small>방문</small></span>`;
  const legendItems = items.map((item) => ({ ...item, count: item.visits }));
  renderLegend(document.querySelector("[data-traffic-legend]"), legendItems, (item) => trafficColors[item.source]);
  document.querySelector("[data-traffic-table]").innerHTML = items
    .map(
      (item) => `<tr><td><i style="--legend-color:${trafficColors[item.source]}"></i>${escapeHtml(item.label || item.source)}</td><td>${formatNumber(item.visits)}</td><td>${formatNumber(item.completed)}</td><td><strong>${Number(item.completion_rate).toFixed(1)}%</strong></td></tr>`,
    )
    .join("");
}

function renderResults(items, insight) {
  const donut = document.querySelector("[data-result-donut]");
  const total = items.reduce((sum, item) => sum + item.count, 0);
  donut.style.background = donutBackground(items, (_, index) => colors[index % colors.length]);
  donut.innerHTML = `<span>${formatNumber(total)}<small>완료</small></span>`;
  renderLegend(document.querySelector("[data-result-legend]"), items, (_, index) => colors[index % colors.length]);
  document.querySelector("[data-result-insight]").innerHTML = insight
    ? `<span>MOST COMMON RESULT</span><strong>${escapeHtml(insight.label)}</strong><p>${formatNumber(insight.count)}명 · 전체 결과의 ${Number(insight.rate).toFixed(1)}%</p>`
    : "<span>MOST COMMON RESULT</span><strong>아직 결과가 없습니다</strong><p>설문 완료 데이터가 쌓이면 자동으로 표시됩니다.</p>";
}

function renderBars(container, items) {
  container.innerHTML = items.length
    ? items
        .map(
          (item) => `<div class="bar-row"><div><span>${escapeHtml(item.label)}</span><strong>${formatNumber(item.count)} · ${Number(item.rate).toFixed(1)}%</strong></div><div class="bar-track"><span style="width:${Math.min(item.rate, 100)}%"></span></div></div>`,
        )
        .join("")
    : '<p class="empty-state">아직 집계된 데이터가 없습니다.</p>';
}

function renderQuestions(questions) {
  const container = document.querySelector("[data-question-list]");
  container.innerHTML = questions.length
    ? questions
        .map((question, questionIndex) => {
          const questionNumber = Number.isInteger(question.order) && question.order > 0 && question.order < 999
            ? question.order
            : questionIndex + 1;
          return `
            <article class="question-stat">
              <div class="question-stat-heading"><span>Q${questionNumber}</span><div><h3>${escapeHtml(question.title)}</h3><p>${formatNumber(question.total)}명 응답</p></div></div>
              <div class="bar-list">${question.options
                .map(
                  (option) => `<div class="bar-row"><div><span>${escapeHtml(option.label)}</span><strong>${formatNumber(option.count)}명 · ${Number(option.rate).toFixed(1)}%</strong></div><div class="bar-track"><span style="width:${Math.min(option.rate, 100)}%"></span></div></div>`,
                )
                .join("")}</div>
            </article>`;
        })
        .join("")
    : '<p class="empty-state empty-state-large">응답 데이터가 쌓이면 질문별 분포가 표시됩니다.</p>';
}

function renderKpis(items) {
  document.querySelector("[data-kpi-list]").innerHTML = items
    .map((item) => {
      if (!item.enabled) {
        return `<article class="kpi-row is-disabled"><div><span>${escapeHtml(item.label)}</span><strong>${formatNumber(item.value)}${escapeHtml(item.suffix)}</strong></div><p>목표값 미설정</p><div class="kpi-track"><span style="width:0%"></span></div></article>`;
      }
      return `<article class="kpi-row"><div><span>${escapeHtml(item.label)}</span><strong>${formatNumber(item.value)} / ${formatNumber(item.target)}${escapeHtml(item.suffix)}</strong></div><p>${Number(item.rate).toFixed(1)}% 달성</p><div class="kpi-track"><span style="width:${Math.min(item.rate, 100)}%"></span></div></article>`;
    })
    .join("");
}

function renderDashboard(data) {
  Object.entries(data.summary).forEach(([key, value]) => setMetric(key, value));
  document.querySelector("[data-completion-bar]").style.width = `${Math.min(data.summary.completion_rate, 100)}%`;
  document.querySelector("[data-completion-rate]").textContent = `${Number(data.summary.completion_rate).toFixed(1)}%`;
  document.querySelector("[data-dropoffs]").textContent = `${formatNumber(data.summary.dropoffs)}명`;
  renderTrend(data.trend);
  renderTraffic(data.traffic, data.summary.total_visits);
  renderResults(data.results, data.most_common_result);
  renderBars(document.querySelector("[data-share-bars]"), data.shares);
  renderQuestions(data.questions);
  renderKpis(data.kpis);
}

async function loadDashboard({ force = false } = {}) {
  const period = document.querySelector("[data-period]").value;
  const status = document.querySelector("[data-status]");
  const message = document.querySelector("[data-message]");
  const refresh = document.querySelector("[data-refresh]");
  status.className = "data-status is-loading";
  status.innerHTML = "<i></i> 데이터 불러오는 중";
  refresh.disabled = true;
  message.hidden = true;
  try {
    const response = await fetch(`/admin/api/summary?period=${encodeURIComponent(period)}${force ? `&refresh=${Date.now()}` : ""}`, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.assign("/admin");
      return;
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "통계를 불러오지 못했습니다.");
    renderDashboard(payload.data);
    status.className = `data-status ${payload.configured ? "is-live" : "is-warning"}`;
    status.innerHTML = `<i></i> ${payload.configured ? "Supabase 연결됨" : "설정 필요"}`;
    if (!payload.configured) {
      message.textContent = payload.error;
      message.hidden = false;
    }
  } catch (error) {
    status.className = "data-status is-error";
    status.innerHTML = "<i></i> 불러오기 실패";
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    refresh.disabled = false;
  }
}

document.querySelector("[data-period]").addEventListener("change", () => loadDashboard());
document.querySelector("[data-refresh]").addEventListener("click", () => loadDashboard({ force: true }));
loadDashboard();
