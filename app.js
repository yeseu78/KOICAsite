import {
  combinationCopy,
  contentLensData,
  correctionLensData,
  correctionLensMap,
  questions,
} from "./data.js";

const app = document.querySelector("#app");

const state = {
  answers: [],
  field: null,
  questionIndex: 0,
};

function makeAnonymousId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getStoredId(storage, key) {
  try {
    const current = storage.getItem(key);
    if (current) return current;
    const created = makeAnonymousId();
    storage.setItem(key, created);
    return created;
  } catch {
    return makeAnonymousId();
  }
}

function getAttribution() {
  const storageKey = "weko_attribution";
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) return JSON.parse(stored);
  } catch {
    // Privacy-restricted browsers can continue without session storage.
  }

  const params = new URLSearchParams(window.location.search);
  let externalReferrer = "";
  try {
    externalReferrer = document.referrer && new URL(document.referrer).origin !== window.location.origin
      ? new URL(document.referrer).origin
      : "";
  } catch {
    externalReferrer = "";
  }
  const attribution = {
    source: params.get("utm_source") || "",
    medium: params.get("utm_medium") || "",
    campaign: params.get("utm_campaign") || "",
    referrer: externalReferrer,
  };
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(attribution));
  } catch {
    // Analytics must never block the survey experience.
  }
  return attribution;
}

const analyticsContext = {
  visitor_id: getStoredId(localStorage, "weko_visitor_id"),
  visit_id: getStoredId(sessionStorage, "weko_visit_id"),
  attribution: getAttribution(),
};

const analyticsEndpoint = window.location.hostname === "yeseu78.github.io"
  ? "https://weko-traffic.onrender.com/api/analytics/events"
  : "/api/analytics/events";

function trackEvent(eventType, detail = {}) {
  const payload = {
    event_type: eventType,
    visitor_id: analyticsContext.visitor_id,
    visit_id: analyticsContext.visit_id,
    ...detail,
  };
  fetch(analyticsEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Tracking failures must not change the public survey flow.
  });
}

function trackShare(channel) {
  trackEvent("share", {
    share_channel: channel,
    event_id: makeAnonymousId(),
  });
}

trackEvent("visit", analyticsContext.attribution);

const validCorrectionKeys = Object.keys(correctionLensData);
const validContentKeys = Object.keys(contentLensData);

function setDocumentTitle(title) {
  document.title = `${title} | weKO AI 시력검사`;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "instant" });
}

function updateRoute(params, { replace = false } = {}) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams(params).toString();
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}

const homeProfileLinks = {
  wenki:
    "https://www.instagram.com/p/DcYq-UPlETM/?utm_source=ig_web_copy_link&igsi=MzRlODBiNWFlZA==",
  euiseong:
    "https://www.instagram.com/p/DbvUkT2lF6j/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  yeseul:
    "https://www.instagram.com/p/DbvQ3ctlDxC/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  ain:
    "https://www.instagram.com/p/DbvS2UClKLf/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  sua:
    "https://www.instagram.com/p/DbvQDjHlEBr/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
};

const mobileProfiles = [
  {
    key: "wenki",
    name: "WENKI",
    image: "./assets/home/profile-wenki.png",
    description: "다양한 시선을 모아 더 따뜻한 세상을 찾아가는 WE:NK의 마스코트",
    featured: true,
  },
  {
    key: "euiseong",
    name: "EUISEONG",
    image: "./assets/home/profile-euiseong.png",
    description: "경험 속에서 답을 찾아가는 도전가",
  },
  {
    key: "yeseul",
    name: "YESEUL",
    image: "./assets/home/profile-yeseul.png",
    description: "새로운 질문으로 가능성을 발견하는 관찰자",
  },
  {
    key: "ain",
    name: "AIN",
    image: "./assets/home/profile-ain.png",
    description: "섬세한 시선으로 이야기를 잇는 기록가",
  },
  {
    key: "sua",
    name: "SUA",
    image: "./assets/home/profile-sua.png",
    description: "따뜻한 공감으로 함께할 길을 만드는 연결자",
  },
];

function getMobileHomeMarkup() {
  const lensSymbols = {
    cooperation: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="13" r="4"/><circle cx="13" cy="20" r="3.5"/><circle cx="35" cy="20" r="3.5"/><path d="M17 37v-4c0-5 3-9 7-9s7 4 7 9v4M5 37v-3c0-5 3-8 8-8M43 37v-3c0-5-3-8-8-8"/><path d="M19 17l5 4 5-4"/></svg>`,
    participation: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="18" r="9"/><circle cx="24" cy="18" r="4"/><path d="M24 3v5M9 18H4M44 18h-5M13 7l4 4M35 7l-4 4"/><circle cx="12" cy="34" r="5"/><circle cx="24" cy="35" r="5"/><circle cx="36" cy="34" r="5"/></svg>`,
    case: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 24V12M24 17c-7 0-10-4-10-9 7 0 10 4 10 9ZM24 14c6 0 9-3 9-8-6 0-9 3-9 8Z"/><path d="M5 31c6-2 10-1 14 2l5 3 8-5c4-2 8 0 10 3L26 44 8 39Z"/></svg>`,
    empathy: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M18 17l-5-5c-3-3-8 2-5 5l6 6c2 2 5 2 7 0l6-6c2-2 5-2 7 0l6 6c3 3-2 8-5 5l-5-5"/><path d="M17 31l5 5c3 3 8-2 5-5l-6-6M31 17l-5-5c-3-3-8 2-5 5"/></svg>`,
  };
  const homeLensCards = ["cooperation", "participation", "case", "empathy"]
    .map((key) => {
      const lens = correctionLensData[key];
      return `
        <article class="mobile-lens-card" style="--lens-accent: ${lens.accent}; --lens-soft: ${lens.soft}">
          <span class="mobile-lens-symbol">${lensSymbols[key]}</span>
          <img src="${lens.image}" alt="${lens.displayName} 안경" width="240" height="120" loading="lazy" />
          <h3>${lens.displayName}</h3>
          <p>${lens.shortCopy}</p>
        </article>
      `;
    })
    .join("");

  const profileCards = mobileProfiles
    .map(
      (profile) => `
        <a
          class="mobile-profile-card${profile.featured ? " is-featured" : ""}"
          href="${homeProfileLinks[profile.key]}"
          target="_blank"
          rel="noreferrer"
          aria-label="${profile.name} 프로필 이야기 보기"
        >
          <span class="mobile-profile-photo">
            <img src="${profile.image}" alt="${profile.name} 프로필" loading="lazy" />
          </span>
          <span class="mobile-profile-copy">
            <strong>${profile.name}</strong>
            <small>${profile.description}</small>
          </span>
          <span class="mobile-profile-sticker" aria-hidden="true">click!</span>
        </a>
      `,
    )
    .join("");

  return `
    <div class="mobile-home" data-mobile-home>
      <header class="mobile-header landing-container">
        <a class="mobile-brand" href="#mobile-home-top" aria-label="ODA OPTICA by KOICA 홈으로 이동">
          <span>ODA OPTICA</span>
          <small>BY KOICA</small>
        </a>
        <button
          class="mobile-menu-toggle"
          type="button"
          data-action="toggle-mobile-menu"
          aria-expanded="false"
          aria-controls="mobile-navigation"
          aria-label="메뉴 열기"
        >
          <span></span><span></span><span></span>
        </button>
        <nav class="mobile-navigation" id="mobile-navigation" aria-label="모바일 메뉴">
          <a href="#mobile-lenses">렌즈 소개</a>
          <a href="#mobile-team">W&amp;NK Profile</a>
          <a href="#mobile-impact">KOICA Impact</a>
          <button type="button" data-action="start">시력 검사 시작하기</button>
        </nav>
      </header>

      <section class="mobile-hero" id="mobile-home-top" aria-labelledby="mobile-home-title">
        <div class="landing-container">
          <p class="mobile-kicker">협력의 시야를 맞추는 AI웹 안경점</p>
          <h1 id="mobile-home-title">당신의 시선,<br />세상을 바꾸는<br /><em>렌즈</em>가 될 수 있어요.</h1>
          <div class="mobile-hero-visual">
            <img src="./assets/home/hero-collage.png" alt="WE:NK 팀과 안경, 지구가 함께 배치된 콜라주" width="1254" height="1254" />
          </div>
          <p class="mobile-hero-description">
            KOICA와 함께 개발협력(ODA)을 이해하고, 세상을 바라보는 새로운 시선을 만나보세요.
            AI 시력검사로 당신의 시선을 진단하고 맞춤형 렌즈를 처방해 드립니다.
          </p>
          <button class="mobile-primary-cta" type="button" data-action="start">시력 검사 시작하기 <span>→</span></button>
        </div>
      </section>

      <section class="mobile-features" aria-label="AI 시력검사 진행 방식">
        <div class="landing-container mobile-feature-grid">
          <article>
            <span class="mobile-feature-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48"><path d="M5 24s7-11 19-11 19 11 19 11-7 11-19 11S5 24 5 24Z"/><circle cx="24" cy="24" r="5"/></svg>
            </span>
            <strong>시력 검사</strong>
            <p>정확한 진단으로<br />당신의 시선을 분석해요</p>
          </article>
          <article>
            <span class="mobile-feature-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48"><circle cx="15" cy="25" r="8"/><circle cx="33" cy="25" r="8"/><path d="M23 24h2M7 23l-3-3M41 23l3-3"/></svg>
            </span>
            <strong>맞춤형 렌즈 처방</strong>
            <p>라이프스타일에 맞는<br />렌즈를 추천해 드려요</p>
          </article>
          <article>
            <span class="mobile-feature-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48"><circle cx="24" cy="14" r="5"/><circle cx="12" cy="20" r="4"/><circle cx="36" cy="20" r="4"/><path d="M15 37v-4c0-6 4-10 9-10s9 4 9 10v4M4 37v-3c0-5 3-8 8-8M44 37v-3c0-5-3-8-8-8"/></svg>
            </span>
            <strong>KOICA와 함께</strong>
            <p>세상을 바꾸는 일에<br />당신의 시선을 더해요</p>
          </article>
          <article>
            <span class="mobile-feature-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17"/><path d="M7 24h34M24 7c5 5 7 11 7 17s-2 12-7 17M24 7c-5 5-7 11-7 17s2 12 7 17"/></svg>
            </span>
            <strong>더 나은 세상</strong>
            <p>따뜻한 시선이 모여<br />변화를 만들어가요</p>
          </article>
        </div>
      </section>

      <section class="mobile-lenses" id="mobile-lenses" aria-labelledby="mobile-lenses-title">
        <div class="landing-container">
          <header class="mobile-section-heading">
            <p>FIND YOUR LENS</p>
            <h2 id="mobile-lenses-title">당신에게 필요한 <em>렌즈</em></h2>
            <span>네 가지 렌즈로 세상을 바라보는 시선을 바꿔보세요.</span>
          </header>
          <div class="mobile-lens-grid">${homeLensCards}</div>
        </div>
      </section>

      <section class="mobile-team" id="mobile-team" aria-labelledby="mobile-team-title">
        <div class="landing-container">
          <header class="mobile-team-heading">
            <p>W&amp;NK</p>
            <h2 id="mobile-team-title">Profile</h2>
            <span>사진을 누르면 각 팀원의 이야기를 볼 수 있어요.</span>
          </header>
          <div class="mobile-profile-grid">${profileCards}</div>
        </div>
      </section>

      <section class="mobile-impact" id="mobile-impact" aria-labelledby="mobile-impact-title">
        <div class="landing-container">
          <p class="mobile-impact-kicker">KOICA ODA IMPACT</p>
          <h2 id="mobile-impact-title">한 번의 시선이,<br /><em>누군가의 내일을 바꿉니다.</em></h2>
          <p class="mobile-impact-description">
            KOICA가 만드는 변화는 한 번의 지원으로 끝나지 않습니다. 누군가가 스스로 삶을 바꾸고,
            지역이 다시 성장하며 그 변화가 다음 세대까지 이어지도록 지속가능한 기반을 함께 만들어갑니다.
          </p>
          <div class="mobile-impact-gallery">
            <img src="./assets/home/impact-volunteer.jpg" alt="KOICA 해외봉사단 단체 사진" loading="lazy" />
            <img src="./assets/home/impact-koica.jpg" alt="KOICA 봉사활동 현장" loading="lazy" />
          </div>
          <div class="mobile-stats" aria-label="KOICA ODA 주요 통계">
            <span><strong>155개국+</strong>파트너 국가</span>
            <span><strong>1,734개+</strong>사업 수행</span>
            <span><strong>6,700만명+</strong>수혜자</span>
          </div>
          <a class="mobile-impact-link" href="https://www.koica.go.kr/sites/koica_kr/index.do" target="_blank" rel="noreferrer">
            KOICA 협력 더 알아보기 <span>→</span>
          </a>
        </div>
      </section>

      <section class="mobile-final-cta" aria-labelledby="mobile-final-title">
        <div class="landing-container">
          <span class="mobile-plane-doodle" aria-hidden="true">⌁ ✈</span>
          <h2 id="mobile-final-title">지금 당신의 시선으로<br /><em>세상을 바꿔보세요.</em></h2>
          <p>나의 시선을 확인하고 세상에 선한 영향을 전하는 첫걸음을 함께해요.</p>
          <button class="mobile-primary-cta" type="button" data-action="start">무료로 검사 시작하기 <span>→</span></button>
        </div>
      </section>
    </div>
  `;
}

function getMobileFigmaHomeMarkup() {
  return `
    <div class="mobile-home mobile-home-figma" data-mobile-home>
      <div class="mobile-figma-artboard" aria-label="ODA OPTICA by KOICA 모바일 홈">
        <picture class="mobile-figma-picture">
          <source
            type="image/svg+xml"
            media="(min-resolution: 3dppx)"
            srcset="./assets/figma/home-mobile-figma-vector.svg"
          />
          <img
            class="mobile-figma-image"
            src="./assets/figma/home-mobile-figma-original-1x.png"
            srcset="./assets/figma/home-mobile-figma-original-1x.png 1x, ./assets/figma/home-mobile-figma-original-2x.png 2x, ./assets/figma/home-mobile-figma-original-4x.png 4x"
            width="390"
            height="2136"
            decoding="sync"
            fetchpriority="high"
            alt="당신의 시선, 세상을 바꾸는 렌즈가 될 수 있어요. WE:NK 팀과 네 가지 렌즈, KOICA 개발협력 이야기를 소개합니다."
          />
        </picture>

        <button
          class="mobile-menu-toggle mobile-figma-menu-toggle"
          type="button"
          data-action="toggle-mobile-menu"
          aria-expanded="false"
          aria-controls="mobile-navigation"
          aria-label="메뉴 열기"
        >
          <span></span><span></span><span></span>
        </button>

        <nav class="mobile-navigation mobile-figma-navigation" id="mobile-navigation" aria-label="모바일 메뉴">
          <a href="#mobile-lenses">렌즈 소개</a>
          <a href="#mobile-team">W&amp;NK Profile</a>
          <a href="#mobile-impact">KOICA Impact</a>
          <button type="button" data-action="start">시력 검사 시작하기</button>
        </nav>

        <span class="mobile-figma-anchor anchor-lenses" id="mobile-lenses" aria-hidden="true"></span>
        <span class="mobile-figma-anchor anchor-team" id="mobile-team" aria-hidden="true"></span>
        <span class="mobile-figma-anchor anchor-impact" id="mobile-impact" aria-hidden="true"></span>

        <button class="mobile-figma-hotspot mobile-hero-start" type="button" data-action="start" aria-label="시력 검사 시작하기"></button>

        <a class="mobile-figma-hotspot mobile-profile-wenki" href="${homeProfileLinks.wenki}" target="_blank" rel="noreferrer" aria-label="WENKI 프로필 보기"></a>
        <a class="mobile-figma-hotspot mobile-profile-euiseong" href="${homeProfileLinks.euiseong}" target="_blank" rel="noreferrer" aria-label="EUISEONG 프로필 보기"></a>
        <a class="mobile-figma-hotspot mobile-profile-yeseul" href="${homeProfileLinks.yeseul}" target="_blank" rel="noreferrer" aria-label="YESEUL 프로필 보기"></a>
        <a class="mobile-figma-hotspot mobile-profile-ain" href="${homeProfileLinks.ain}" target="_blank" rel="noreferrer" aria-label="AIN 프로필 보기"></a>
        <a class="mobile-figma-hotspot mobile-profile-sua" href="${homeProfileLinks.sua}" target="_blank" rel="noreferrer" aria-label="SUA 프로필 보기"></a>

        <a
          class="mobile-figma-hotspot mobile-koica-link"
          href="https://www.koica.go.kr/sites/koica_kr/index.do"
          target="_blank"
          rel="noreferrer"
          aria-label="KOICA 협력 더 알아보기"
        ></a>

        <button class="mobile-figma-hotspot mobile-bottom-start" type="button" data-action="start" aria-label="무료로 검사 시작하기"></button>
      </div>
    </div>
  `;
}

function bindHomeInteractions() {
  app.querySelectorAll('[data-action="start"]').forEach((button) => {
    button.addEventListener("click", () => {
      trackEvent("survey_start");
      state.answers = [];
      state.field = null;
      state.questionIndex = 0;
      updateRoute({ view: "quiz", question: "1" });
      renderQuestion(0);
    });
  });

  const mobileHome = app.querySelector("[data-mobile-home]");
  const menuToggle = app.querySelector('[data-action="toggle-mobile-menu"]');
  const navigation = app.querySelector("#mobile-navigation");
  if (!mobileHome || !menuToggle || !navigation) return;

  const setMenuOpen = (isOpen) => {
    mobileHome.classList.toggle("is-menu-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "메뉴 닫기" : "메뉴 열기");
  };

  menuToggle.addEventListener("click", () => {
    setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
  });
  navigation.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenuOpen(false));
  });
  mobileHome.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenuOpen(false);
  });
}

function renderHome({ replace = false } = {}) {
  setDocumentTitle("홈");
  if (replace) updateRoute({}, { replace: true });
  app.classList.add("is-home");

  app.innerHTML = `
    <div class="home-screen figma-home-exact" data-screen="home">
      <div class="figma-home-artboard" aria-label="WE:NK AI 시력검사 홈">
        <img
          class="figma-home-image"
          src="./assets/figma/home-figma-4x.png"
          width="1560"
          height="3956"
          decoding="sync"
          fetchpriority="high"
          alt="당신의 시선, 세상을 바꾸는 렌즈가 될 수 있어요. WE:NK 팀과 네 가지 렌즈, KOICA 개발협력 이야기를 소개합니다."
        />

        <div class="home-polish-layer" aria-hidden="true">
          <span class="home-hero-glow"></span>
          <span class="home-lens-glint lens-glint-cooperation"></span>
          <span class="home-lens-glint lens-glint-participation"></span>
          <span class="home-lens-glint lens-glint-case"></span>
          <span class="home-lens-glint lens-glint-empathy"></span>
          <span class="home-sparkle home-sparkle-one"></span>
          <span class="home-sparkle home-sparkle-two"></span>
          <span class="home-sparkle home-sparkle-three"></span>
          <span class="home-impact-aura"></span>
        </div>

        <button class="home-hotspot home-start-hotspot" type="button" data-action="start" aria-label="시력 검사 시작하기"></button>
        <span class="home-shimmer" aria-hidden="true"></span>

        <a class="home-hotspot home-profile-hotspot profile-wenki" href="${homeProfileLinks.wenki}" target="_blank" rel="noreferrer" aria-label="WENKI 프로필 보기"></a>
        <a class="home-hotspot home-profile-hotspot profile-euiseong" href="${homeProfileLinks.euiseong}" target="_blank" rel="noreferrer" aria-label="EUISEONG 프로필 보기"></a>
        <a class="home-hotspot home-profile-hotspot profile-yeseul" href="${homeProfileLinks.yeseul}" target="_blank" rel="noreferrer" aria-label="YESEUL 프로필 보기"></a>
        <a class="home-hotspot home-profile-hotspot profile-ain" href="${homeProfileLinks.ain}" target="_blank" rel="noreferrer" aria-label="AIN 프로필 보기"></a>
        <a class="home-hotspot home-profile-hotspot profile-sua" href="${homeProfileLinks.sua}" target="_blank" rel="noreferrer" aria-label="SUA 프로필 보기"></a>

        <a class="home-hotspot home-koica-hotspot" href="https://www.koica.go.kr/sites/koica_kr/index.do" target="_blank" rel="noreferrer" aria-label="KOICA 협력 더 알아보기"></a>
        <button class="home-hotspot home-bottom-start-hotspot" type="button" data-action="start" aria-label="무료로 검사 시작하기"></button>
      </div>
    </div>
    ${getMobileFigmaHomeMarkup()}
  `;

  bindHomeInteractions();

  scrollToTop();
}

function renderQuestion(index) {
  const safeIndex = Math.min(Math.max(index, 0), questions.length - 1);
  if (safeIndex === 0) trackEvent("survey_start");
  const question = questions[safeIndex];
  const currentAnswer = state.answers[safeIndex] ?? null;
  const currentAnswerIndex = question.options.indexOf(currentAnswer);
  state.questionIndex = safeIndex;
  setDocumentTitle(`${safeIndex + 1}번 질문`);
  app.classList.remove("is-home");

  const options = question.options
    .map(
      (option, optionIndex) => `
        <button
          class="option-button${optionIndex === currentAnswerIndex ? " is-selected" : ""}"
          type="button"
          data-option-index="${optionIndex}"
          aria-label="${option.label}"
          aria-pressed="${optionIndex === currentAnswerIndex}"
        >
          <span class="option-index" aria-hidden="true">${String.fromCharCode(65 + optionIndex)}</span>
          <span class="option-copy">
            <span class="option-label">${option.label}</span>
            ${option.detail ? `<span class="option-detail">${option.detail}</span>` : ""}
          </span>
          <span class="option-check" aria-hidden="true">✓</span>
        </button>
      `,
    )
    .join("");

  app.innerHTML = `
    <section class="screen question-screen" data-screen="question" data-question="${safeIndex + 1}">
      <span class="question-paper" aria-hidden="true"></span>
      <header class="question-heading">
        <p class="question-number" aria-label="${questions.length}개 중 ${safeIndex + 1}번 질문">Q${safeIndex + 1}</p>
        <button class="question-back-button" type="button" data-action="back" aria-label="이전 화면으로">← 이전</button>
        <img class="question-plane" src="./assets/figma/quiz-plane.png" alt="" />
        <h1 class="question-title">${question.title}</h1>
        ${
          question.context
            ? `<aside class="question-context" aria-label="사례 설명">
                <span class="question-context-label"><span aria-hidden="true">✦</span> 사례</span>
                <p class="question-context-copy">${question.context}</p>
              </aside>`
            : ""
        }
      </header>
      <div class="question-body">
        <div class="option-list" role="group" aria-label="답변 선택">
          ${options}
        </div>
      </div>
      <footer class="question-actions">
        <img class="question-magnifier" src="./assets/figma/quiz-magnifier.png" alt="" />
        <button
          class="primary-button question-next-button"
          type="button"
          data-action="next"
          ${currentAnswer ? "" : "disabled"}
        >
          ${safeIndex === questions.length - 1 ? "결과 확인하기" : "다음으로 →"}
        </button>
        <p class="selection-guide" data-selection-guide aria-live="polite">
          ${currentAnswer ? "선택 완료 · 한 번 더 누르면 선택이 취소돼요" : "한 문항에 하나만 선택할 수 있어요"}
        </p>
      </footer>
    </section>
  `;

  app.querySelector('[data-action="back"]').addEventListener("click", () => {
    if (safeIndex === 0) {
      updateRoute({});
      renderHome();
      return;
    }

    const previousIndex = safeIndex - 1;
    updateRoute({ view: "quiz", question: String(previousIndex + 1) });
    renderQuestion(previousIndex);
  });

  app.querySelectorAll("[data-option-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedOptionIndex = Number(button.dataset.optionIndex);
      const selectedOption = question.options[selectedOptionIndex];
      const shouldCancel = state.answers[safeIndex] === selectedOption;
      state.answers[safeIndex] = shouldCancel ? null : selectedOption;

      trackEvent("answer", {
        question_id: question.id,
        answer_value: shouldCancel ? "" : String(selectedOptionIndex),
        metadata: {
          question_title: question.title,
          answer_label: shouldCancel ? "" : selectedOption.label,
          question_order: String(safeIndex + 1),
        },
      });

      if (question.type === "field") {
        state.field = shouldCancel ? null : selectedOption.value;
      }

      app.querySelectorAll("[data-option-index]").forEach((optionButton) => {
        const isSelected =
          !shouldCancel && optionButton.dataset.optionIndex === button.dataset.optionIndex;
        optionButton.classList.toggle("is-selected", isSelected);
        optionButton.setAttribute("aria-pressed", String(isSelected));
      });

      const nextButton = app.querySelector('[data-action="next"]');
      nextButton.disabled = !state.answers[safeIndex];
      app.querySelector("[data-selection-guide]").textContent = state.answers[safeIndex]
        ? "선택 완료 · 한 번 더 누르면 선택이 취소돼요"
        : "선택이 취소됐어요 · 하나만 선택할 수 있어요";
    });
  });

  app.querySelector('[data-action="next"]').addEventListener("click", () => {
    if (!state.answers[safeIndex]) return;

    if (safeIndex < questions.length - 1) {
      const nextIndex = safeIndex + 1;
      updateRoute({ view: "quiz", question: String(nextIndex + 1) });
      renderQuestion(nextIndex);
      return;
    }

    const result = calculateResult();
    trackEvent("survey_complete", {
      result_type: result.correctionLens,
      metadata: {
        raw_result_type: result.rawResultType,
        content_lens: result.contentLens,
      },
    });
    updateRoute({
      view: "result",
      correction: result.correctionLens,
      content: result.contentLens,
    });
    renderResult(result.correctionLens, result.contentLens, result.rawResultType);
  });

  scrollToTop();
}

function calculateResult() {
  const scores = {
    misunderstanding: 0,
    indifference: 0,
    actionLoss: 0,
    conceptBlur: 0,
    cooperation: 0,
  };

  questions.forEach((question, index) => {
    const answer = state.answers[index];
    if (question.type === "diagnosis" && answer?.score) {
      scores[answer.score] += question.weight ?? 1;
    }
  });

  const highestScore = Math.max(...Object.values(scores));
  const tiedTypes = Object.keys(scores).filter((key) => scores[key] === highestScore);
  let rawResultType = tiedTypes[0];

  for (let index = state.answers.length - 1; index >= 0; index -= 1) {
    const score = state.answers[index]?.score;
    if (score && tiedTypes.includes(score)) {
      rawResultType = score;
      break;
    }
  }

  return {
    rawResultType,
    correctionLens: correctionLensMap[rawResultType],
    contentLens: state.field ?? "education",
  };
}

function getResultShareData(correctionKey, contentKey) {
  const correction = correctionLensData[correctionKey];
  const content = contentLensData[contentKey];
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({
    view: "quiz",
    question: "1",
    utm_source: "shared_link",
    utm_medium: "share",
    utm_campaign: "result_share",
  }).toString();

  return {
    title: `나의 weKO 렌즈는 ${correction.displayName} + ${content.displayName}`,
    text: `내 AI 시력검사 결과는 ${correction.displayName} + ${content.displayName}였어! 👓\n너는 어떤 렌즈가 나오는지 한번 해봐!`,
    url: url.toString(),
  };
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 권한이 막힌 브라우저에서는 아래의 선택 복사 방식으로 한 번 더 시도합니다.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const didCopy = document.execCommand("copy");
  textarea.remove();
  if (!didCopy) throw new Error("클립보드 복사를 지원하지 않습니다.");
}

function showShareStatus(message, type = "success") {
  const status = app.querySelector("[data-share-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
}

function loadCanvasImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${src}`));
    image.src = src;
  });
}

function roundedRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function drawCoverImage(context, image, x, y, width, height, radius) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.height * targetRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / targetRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  context.save();
  roundedRectPath(context, x, y, width, height, radius);
  context.clip();
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
  context.restore();
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines = 10) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(testLine).width <= maxWidth || !currentLine) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  lines.slice(0, maxLines).forEach((line, index) => {
    const isLastVisibleLine = index === maxLines - 1 && lines.length > maxLines;
    context.fillText(isLastVisibleLine ? `${line}…` : line, x, y + index * lineHeight);
  });

  return y + Math.min(lines.length, maxLines) * lineHeight;
}

function drawCombination(context, correction, content, y, fontSize, canvasWidth) {
  const plus = " + ";
  context.font = `700 ${fontSize}px "Noto Sans KR", sans-serif`;
  const correctionWidth = context.measureText(correction.displayName).width;
  const plusWidth = context.measureText(plus).width;
  const contentWidth = context.measureText(content.displayName).width;
  let x = (canvasWidth - correctionWidth - plusWidth - contentWidth) / 2;

  context.textAlign = "left";
  context.fillStyle = correction.accent;
  context.fillText(correction.displayName, x, y);
  x += correctionWidth;
  context.fillStyle = "#68128c";
  context.fillText(plus, x, y);
  x += plusWidth;
  context.fillStyle = "#3f72e8";
  context.fillText(content.displayName, x, y);
  context.textAlign = "center";
}

async function createResultShareCard(correction, content, copy, format) {
  await document.fonts?.ready;
  const isStory = format === "story";
  const width = 1080;
  const height = isStory ? 1920 : 1080;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const [lensImage, storyImage] = await Promise.all([
    loadCanvasImage(correction.image),
    loadCanvasImage(content.mainImage),
  ]);

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#fffaf6");
  background.addColorStop(0.55, correction.soft);
  background.addColorStop(1, "#eef4ff");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.28;
  context.fillStyle = correction.accent;
  context.beginPath();
  context.arc(950, 120, isStory ? 260 : 190, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#3f72e8";
  context.beginPath();
  context.arc(90, height - 70, isStory ? 330 : 220, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  const margin = isStory ? 86 : 70;
  const cardY = isStory ? 110 : 54;
  const cardHeight = height - cardY * 2;
  context.fillStyle = "rgba(255, 255, 255, 0.93)";
  roundedRectPath(context, margin, cardY, width - margin * 2, cardHeight, 48);
  context.fill();
  context.strokeStyle = "rgba(104, 18, 140, 0.16)";
  context.lineWidth = 3;
  context.stroke();

  context.textAlign = "center";
  context.fillStyle = "#68128c";
  context.font = `700 ${isStory ? 36 : 29}px "Noto Sans KR", sans-serif`;
  context.fillText("weKO · AI LENS TEST", width / 2, isStory ? 205 : 118);

  context.fillStyle = correction.soft;
  roundedRectPath(context, width / 2 - 180, isStory ? 250 : 148, 360, 72, 36);
  context.fill();
  context.fillStyle = correction.accent;
  context.font = `700 ${isStory ? 30 : 25}px "Noto Sans KR", sans-serif`;
  context.fillText("AI 시력검사 완료!", width / 2, isStory ? 298 : 195);

  context.fillStyle = "#171717";
  context.font = `700 ${isStory ? 48 : 38}px "Noto Sans KR", sans-serif`;
  context.fillText("내게 필요한 렌즈는", width / 2, isStory ? 390 : 270);
  drawCombination(
    context,
    correction,
    content,
    isStory ? 480 : 342,
    isStory ? 68 : 54,
    width,
  );

  const lensY = isStory ? 535 : 380;
  const lensWidth = isStory ? 720 : 500;
  const lensHeight = lensWidth * 0.46;
  context.drawImage(
    lensImage,
    0,
    lensImage.height * 0.27,
    lensImage.width,
    lensImage.height * 0.46,
    (width - lensWidth) / 2,
    lensY,
    lensWidth,
    lensHeight,
  );

  context.fillStyle = "#3b3340";
  context.font = `600 ${isStory ? 34 : 27}px "Noto Sans KR", sans-serif`;
  context.textAlign = "center";
  drawWrappedText(
    context,
    copy,
    width / 2,
    isStory ? 930 : 635,
    isStory ? 790 : 860,
    isStory ? 54 : 43,
    isStory ? 4 : 3,
  );

  if (isStory) {
    drawCoverImage(context, storyImage, 146, 1170, 788, 405, 32);
    context.fillStyle = "#171717";
    context.font = '700 43px "Noto Sans KR", sans-serif';
    context.fillText(`${content.displayName} · ${content.field}`, width / 2, 1650);
    context.fillStyle = "#746b77";
    context.font = '600 29px "Noto Sans KR", sans-serif';
    context.fillText(content.country, width / 2, 1702);
  } else {
    drawCoverImage(context, storyImage, 104, 735, 326, 235, 28);
    context.textAlign = "left";
    context.fillStyle = "#3f72e8";
    context.font = '700 39px "Noto Sans KR", sans-serif';
    context.fillText(`${content.displayName} · ${content.field}`, 480, 800);
    context.fillStyle = "#68128c";
    context.font = '700 27px "Noto Sans KR", sans-serif';
    context.fillText(content.country, 480, 850);
    context.fillStyle = "#554a52";
    context.font = '500 24px "Noto Sans KR", sans-serif';
    context.textAlign = "left";
    drawWrappedText(context, content.oneLine, 480, 900, 470, 36, 3);
  }

  const ctaY = isStory ? 1770 : 990;
  context.fillStyle = "#68128c";
  roundedRectPath(context, width / 2 - 270, ctaY, 540, isStory ? 82 : 64, 36);
  context.fill();
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.font = `700 ${isStory ? 30 : 25}px "Noto Sans KR", sans-serif`;
  context.fillText("너도 어떤 렌즈인지 확인해봐!", width / 2, ctaY + (isStory ? 53 : 42));

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("공유 이미지를 만들지 못했습니다."))),
      "image/png",
      0.96,
    );
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareResultCard(format, cardPromise, shareData, correctionKey, contentKey) {
  showShareStatus("공유 이미지를 준비하고 있어요…", "pending");

  try {
    const blob = await cardPromise;
    if (!blob) throw new Error("공유 이미지 생성 실패");
    const file = new File([blob], `weko-${correctionKey}-${contentKey}-${format}.png`, {
      type: "image/png",
    });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: shareData.title,
          text: `${shareData.text}\n${shareData.url}`,
        });
        trackShare(format === "story" ? "instagram_story" : "instagram_feed");
        showShareStatus(
          `${format === "story" ? "스토리" : "피드"}용 결과 이미지를 공유 메뉴로 보냈어요. Instagram을 선택해주세요.`,
        );
        return;
      } catch (error) {
        if (error?.name === "AbortError") {
          showShareStatus("공유가 취소됐어요.", "neutral");
          return;
        }
      }
    }

    downloadBlob(blob, file.name);
    trackShare(format === "story" ? "instagram_story" : "instagram_feed");
    try {
      await copyText(`${shareData.text}\n${shareData.url}`);
      showShareStatus(
        `${format === "story" ? "스토리" : "피드"}용 이미지를 저장하고 소개 문구도 복사했어요. Instagram에서 이미지를 선택해주세요.`,
      );
    } catch {
      showShareStatus(
        `${format === "story" ? "스토리" : "피드"}용 이미지를 저장했어요. Instagram에서 이미지를 선택해주세요.`,
      );
    }
  } catch (error) {
    showShareStatus("공유 이미지를 준비하지 못했어요. 잠시 후 다시 시도해주세요.", "error");
  }
}

function renderResult(correctionKey, contentKey, rawResultType = "direct") {
  app.classList.remove("is-home");
  const safeCorrection = validCorrectionKeys.includes(correctionKey) ? correctionKey : "empathy";
  const safeContent = validContentKeys.includes(contentKey) ? contentKey : "water";
  const correction = correctionLensData[safeCorrection];
  const content = contentLensData[safeContent];
  const copy = combinationCopy[safeCorrection][safeContent];

  setDocumentTitle(`${correction.displayName} + ${content.displayName}`);

  app.innerHTML = `
    <article
      class="result-screen"
      data-screen="result"
      data-correction="${safeCorrection}"
      data-content="${safeContent}"
      style="--correction: ${correction.accent}; --correction-soft: ${correction.soft};"
    >
      <header class="result-header">
        <span class="completion-badge">AI 시력검사 완료!</span>
        <h1 class="result-kicker">당신에게 필요한 렌즈는</h1>
        <div class="lens-combination" aria-label="${correction.displayName} 더하기 ${content.displayName}">
          <span class="correction-name">${correction.displayName}</span>
          <span class="combination-plus" aria-hidden="true">+</span>
          <span class="content-name">${content.displayName}</span>
        </div>
        <p class="combination-copy">${copy}</p>
      </header>

      <hr class="section-divider" />

      <section class="result-section" aria-labelledby="diagnosis-title">
        <h2 class="section-title" id="diagnosis-title">당신의 시야 진단</h2>
        <div class="diagnosis-card">
          <span class="label-chip">당신의 시야 진단</span>
          <div class="diagnosis-summary">
            <div
              class="diagnosis-lens-media"
              role="img"
              aria-label="${correction.displayName} 안경"
              style="background-image: url('${correction.image}')"
            ></div>
            <div>
              <h3 class="diagnosis-name">${correction.displayName}</h3>
              <p class="diagnosis-short">${correction.description}</p>
            </div>
          </div>
          <div class="diagnosis-callout">
            <p class="callout-label">진단 결과</p>
            <p class="diagnosis-text">${correction.diagnosis}</p>
          </div>
        </div>
      </section>

      <hr class="section-divider" />

      <section class="result-section" aria-labelledby="content-title">
        <h2 class="section-title" id="content-title">이 렌즈로 무엇을 볼까요?</h2>
        <div class="content-card">
          <img
            class="content-thumb"
            src="${content.mainImage}"
            alt="${content.field} 사례 미리보기"
            width="1448"
            height="1086"
          />
          <div>
            <div class="content-card-top">
              <h3 class="content-card-title">${content.displayName} (${content.field})</h3>
              <span class="field-pill">선택 분야</span>
            </div>
            <p class="content-one-line">${content.oneLine}</p>
          </div>
        </div>
      </section>

      <hr class="section-divider" />

      <section class="result-section" aria-labelledby="story-section-title">
        <header class="story-header">
          <h2 class="section-title" id="story-section-title">추천 이야기</h2>
          <p class="scroll-guide">아래로 스크롤하면 이야기가 이어집니다 ↓</p>
        </header>
        <div class="story-card">
          <div class="story-chips">
            <span class="story-chip">${content.field}</span>
            <span class="story-chip country-chip">${content.country}</span>
          </div>
          <h3 class="story-title">${content.title}</h3>
          <img
            class="story-image"
            src="${content.mainImage}"
            alt="${content.title} 메인 일러스트"
            width="1448"
            height="1086"
          />
          <p class="story-copy">${content.intro}</p>

          <h4 class="story-subtitle">KOICA는 무엇을 지원했나요?</h4>
          <p class="project-name">프로젝트 · ${content.project}</p>
          <p class="story-copy">${content.support}</p>

          <div class="change-callout">
            <h4 class="story-subtitle">무엇이 달라졌을까요?</h4>
            <p class="story-copy">${content.change}</p>
          </div>

          <img
            class="story-image"
            src="${content.subImage}"
            alt="${content.field} 현장의 변화 일러스트"
            width="1448"
            height="1086"
            loading="lazy"
          />

          <hr class="meaning-divider" />
          <h4 class="story-subtitle meaning-title">그래서 이 이야기가 중요한 이유</h4>
          <p class="story-copy">${content.meaning}</p>
        </div>
      </section>

      <hr class="section-divider" />

      <section class="share-section" aria-labelledby="share-title">
        <span class="share-kicker">SHARE MY LENS</span>
        <h2 class="section-title" id="share-title">내 결과를 친구에게 알려주세요</h2>
        <p class="share-description">
          나에게 나온 렌즈와 검사 링크를 보내고, 친구는 어떤 렌즈가 나오는지 함께 확인해보세요.
        </p>
        <div class="share-button-grid">
          <button class="share-button share-button-copy" type="button" data-action="copy-result">
            <span aria-hidden="true">🔗</span>
            <span>결과 문구·링크 복사</span>
          </button>
          <button class="share-button share-button-native" type="button" data-action="share-result">
            <span aria-hidden="true">💬</span>
            <span>카톡·SNS로 공유</span>
          </button>
        </div>
        <div class="instagram-share-card">
          <div>
            <p class="instagram-label">Instagram용 결과 카드</p>
            <p class="instagram-note">모바일 공유 메뉴에서 Instagram을 선택하거나, 저장된 이미지를 올려주세요.</p>
          </div>
          <div class="instagram-buttons">
            <button class="instagram-button" type="button" data-action="share-story">
              <span class="instagram-ratio story-ratio" aria-hidden="true"></span>
              스토리 9:16
            </button>
            <button class="instagram-button" type="button" data-action="share-feed">
              <span class="instagram-ratio feed-ratio" aria-hidden="true"></span>
              피드 1:1
            </button>
          </div>
        </div>
        <p class="share-status" data-share-status data-type="neutral" aria-live="polite"></p>
      </section>

      <hr class="section-divider" />

      <footer class="result-actions">
        <button class="primary-button" type="button" data-action="retake">다른 렌즈로 다시 검사하기</button>
        <button class="text-button" type="button" data-action="home">홈으로 돌아가기</button>
      </footer>
    </article>
  `;

  const shareData = getResultShareData(safeCorrection, safeContent);
  const shareText = `${shareData.text}\n${shareData.url}`;
  const rememberCardError = (error) => {
    console.error("weKO share card:", error);
    return null;
  };
  const storyCardPromise = createResultShareCard(correction, content, copy, "story").catch(
    rememberCardError,
  );
  const feedCardPromise = createResultShareCard(correction, content, copy, "feed").catch(
    rememberCardError,
  );

  trackEvent("result_view", {
    result_type: safeCorrection,
    metadata: { content_lens: safeContent },
  });

  app.querySelector('[data-action="copy-result"]').addEventListener("click", async () => {
    try {
      await copyText(shareText);
      trackShare("link_copy");
      showShareStatus("결과 소개 문구와 링크를 복사했어요. 카카오톡이나 SNS에 붙여넣어 주세요.");
    } catch {
      showShareStatus("복사하지 못했어요. 브라우저의 클립보드 권한을 확인해주세요.", "error");
    }
  });

  app.querySelector('[data-action="share-result"]').addEventListener("click", async () => {
    if (!navigator.share) {
      await copyText(shareText);
      trackShare("link_copy");
      showShareStatus("이 브라우저는 공유 메뉴를 지원하지 않아 문구와 링크를 대신 복사했어요.");
      return;
    }

    try {
      await navigator.share(shareData);
      trackShare("native_share");
      showShareStatus("공유 메뉴로 결과를 보냈어요.");
    } catch (error) {
      if (error?.name === "AbortError") {
        showShareStatus("공유가 취소됐어요.", "neutral");
        return;
      }
      await copyText(shareText);
      trackShare("link_copy");
      showShareStatus("공유 메뉴를 열지 못해 문구와 링크를 대신 복사했어요.");
    }
  });

  app.querySelector('[data-action="share-story"]').addEventListener("click", () => {
    shareResultCard("story", storyCardPromise, shareData, safeCorrection, safeContent);
  });

  app.querySelector('[data-action="share-feed"]').addEventListener("click", () => {
    shareResultCard("feed", feedCardPromise, shareData, safeCorrection, safeContent);
  });

  app.querySelector('[data-action="retake"]').addEventListener("click", () => {
    trackEvent("survey_start");
    state.answers = [];
    state.field = null;
    state.questionIndex = 0;
    updateRoute({ view: "quiz", question: "1" });
    renderQuestion(0);
  });

  app.querySelector('[data-action="home"]').addEventListener("click", () => {
    updateRoute({});
    renderHome();
  });

  window.dispatchEvent(
    new CustomEvent("weko:result", {
      detail: {
        rawResultType,
        correctionLens: safeCorrection,
        contentLens: safeContent,
      },
    }),
  );

  scrollToTop();
}

function renderFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "result") {
    renderResult(params.get("correction"), params.get("content"));
    return;
  }

  if (view === "quiz") {
    const questionNumber = Number(params.get("question") ?? 1);
    renderQuestion(Number.isFinite(questionNumber) ? questionNumber - 1 : 0);
    return;
  }

  renderHome();
}

window.addEventListener("popstate", renderFromUrl);
renderFromUrl();
