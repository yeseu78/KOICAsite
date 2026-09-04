import fs from "node:fs/promises";

const endpoint = "http://127.0.0.1:9223";
const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const pageTarget = targets.find(
  (target) => target.type === "page" && !target.url.startsWith("edge://"),
);
if (!pageTarget) throw new Error("테스트 브라우저 페이지를 찾지 못했습니다.");

const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let requestId = 0;
const pending = new Map();
const eventWaiters = new Map();

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }

  const waiters = eventWaiters.get(message.method);
  if (waiters?.length) waiters.shift()(message.params);
});

function send(method, params = {}) {
  requestId += 1;
  const id = requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function waitForEvent(method) {
  return new Promise((resolve) => {
    const waiters = eventWaiters.get(method) ?? [];
    waiters.push(resolve);
    eventWaiters.set(method, waiters);
  });
}

async function navigate(url) {
  const loaded = waitForEvent("Page.loadEventFired");
  await send("Page.navigate", { url });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 180));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function screenshot(path) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  await fs.writeFile(path, Buffer.from(result.data, "base64"));
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Browser.grantPermissions", {
  origin: "http://127.0.0.1:4173",
  permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
});
await send("Emulation.setDeviceMetricsOverride", {
  width: 500,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false,
});

await navigate("http://127.0.0.1:4173/?view=quiz&question=1");
const initial = await evaluate(`(() => ({
  selected: document.querySelectorAll('.option-button.is-selected').length,
  nextDisabled: document.querySelector('[data-action="next"]').disabled
}))()`);

const firstClick = await evaluate(`(() => {
  document.querySelector('[data-option-index="0"]').click();
  return {
    selected: document.querySelectorAll('.option-button.is-selected').length,
    pressed: document.querySelector('[data-option-index="0"]').getAttribute('aria-pressed'),
    nextDisabled: document.querySelector('[data-action="next"]').disabled
  };
})()`);

await screenshot("./.artifacts/selection-single.png");

const secondClick = await evaluate(`(() => {
  document.querySelector('[data-option-index="0"]').click();
  return {
    selected: document.querySelectorAll('.option-button.is-selected').length,
    pressed: document.querySelector('[data-option-index="0"]').getAttribute('aria-pressed'),
    nextDisabled: document.querySelector('[data-action="next"]').disabled
  };
})()`);

const switchSelection = await evaluate(`(() => {
  document.querySelector('[data-option-index="0"]').click();
  document.querySelector('[data-option-index="1"]').click();
  return {
    selected: document.querySelectorAll('.option-button.is-selected').length,
    selectedLabel: document.querySelector('.option-button.is-selected .option-label')?.textContent,
    firstPressed: document.querySelector('[data-option-index="0"]').getAttribute('aria-pressed'),
    secondPressed: document.querySelector('[data-option-index="1"]').getAttribute('aria-pressed')
  };
})()`);

await evaluate(`document.querySelector('[data-action="next"]').click()`);
await new Promise((resolve) => setTimeout(resolve, 80));
for (const optionIndex of [2, 2, 1, 1]) {
  await evaluate(`(() => {
    document.querySelector('[data-option-index="${optionIndex}"]').click();
    document.querySelector('[data-action="next"]').click();
    return true;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 90));
}
const fullFlowResult = await evaluate(`(() => ({
  screen: document.querySelector('[data-screen]')?.dataset.screen,
  correction: document.querySelector('[data-screen="result"]')?.dataset.correction,
  content: document.querySelector('[data-screen="result"]')?.dataset.content,
  metricValues: [...document.querySelectorAll('.result-metric-card > strong')].map((item) => item.textContent.trim()),
  metricCount: document.querySelectorAll('.result-metric-card').length
}))()`);
await screenshot("./.artifacts/result-metrics-desktop.png");

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
});
await navigate(
  "http://127.0.0.1:4173/?view=result&correction=cooperation&content=ict",
);
const mobileResultMetrics = await evaluate(`(() => {
  const cards = [...document.querySelectorAll('.result-metric-card')];
  const boxes = cards.map((card) => {
    const rect = card.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      clipped: card.scrollWidth > card.clientWidth || card.scrollHeight > card.clientHeight
    };
  });
  return {
    combination: document.querySelector('.lens-combination').textContent.trim().replace(/\\s+/g, ' '),
    values: cards.map((card) => card.querySelector('strong').textContent.trim()),
    labels: cards.map((card) => card.querySelector('span').textContent.trim()),
    groups: [...document.querySelectorAll('.metric-group-title > span')].map((item) => item.textContent.trim()),
    guidance: document.querySelector('.result-metric-help').textContent.replace(/\\s+/g, ' ').trim(),
    interpretation: document.querySelector('.combination-interpretation .diagnosis-text').textContent.trim(),
    boxes,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
})()`);
await screenshot("./.artifacts/result-metrics-mobile-390-dpr3.png");

await send("Emulation.setDeviceMetricsOverride", {
  width: 500,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false,
});

await navigate(
  "http://127.0.0.1:4173/?view=result&correction=cooperation&content=peace",
);
const shareUi = await evaluate(`(() => ({
  correction: document.querySelector('[data-screen="result"]').dataset.correction,
  content: document.querySelector('[data-screen="result"]').dataset.content,
  shareButtons: document.querySelectorAll('[data-action^="share"], [data-action="copy-result"]').length,
  shareLabels: [...document.querySelectorAll('.share-button, .instagram-button')].map((button) => button.textContent.trim())
}))()`);
const storyMedia = await evaluate(`(() => ({
  images: [...document.querySelectorAll('.story-image')].map((img) => ({
    width: Math.round(img.getBoundingClientRect().width),
    height: Math.round(img.getBoundingClientRect().height),
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    objectFit: getComputedStyle(img).objectFit
  }))
}))()`);
await evaluate(`document.querySelector('.story-image').scrollIntoView({ block: 'center', behavior: 'instant' })`);
await new Promise((resolve) => setTimeout(resolve, 120));
await screenshot("./.artifacts/result-story-before.png");
await evaluate(`(() => {
  const button = document.querySelector('[data-action="copy-result"]');
  document.documentElement.style.scrollBehavior = 'auto';
  button.scrollIntoView({ block: 'center', behavior: 'instant' });
  return true;
})()`);
await new Promise((resolve) => setTimeout(resolve, 100));
const copyButtonBox = await evaluate(`(() => {
  const button = document.querySelector('[data-action="copy-result"]');
  const rect = button.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
})()`);
await send("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x: copyButtonBox.x,
  y: copyButtonBox.y,
  button: "left",
  clickCount: 1,
});
await send("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x: copyButtonBox.x,
  y: copyButtonBox.y,
  button: "left",
  clickCount: 1,
});
await new Promise((resolve) => setTimeout(resolve, 180));
shareUi.copyStatus = await evaluate(
  `document.querySelector('[data-share-status]').textContent.trim()`,
);
await evaluate(`(() => {
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  return true;
})()`);
await evaluate(`document.querySelector('[data-action="share-story"]').click()`);
await new Promise((resolve) => setTimeout(resolve, 5000));
shareUi.instagramStatus = await evaluate(
  `document.querySelector('[data-share-status]').textContent.trim()`,
);
await evaluate(`document.querySelector('[data-action="share-feed"]').click()`);
await new Promise((resolve) => setTimeout(resolve, 1000));
shareUi.feedStatus = await evaluate(
  `document.querySelector('[data-share-status]').textContent.trim()`,
);
await evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
await new Promise((resolve) => setTimeout(resolve, 120));
await screenshot("./.artifacts/share-panel.png");

await navigate("http://127.0.0.1:4173/");
const homeEffects = await evaluate(`(() => ({
  heroAsset: document.querySelector('.figma-home-image')?.currentSrc,
  heroNaturalWidth: document.querySelector('.figma-home-image')?.naturalWidth,
  heroNaturalHeight: document.querySelector('.figma-home-image')?.naturalHeight,
  mobileAsset: document.querySelector('.mobile-figma-image')?.currentSrc,
  mobileNaturalWidth: document.querySelector('.mobile-figma-image')?.naturalWidth,
  mobileNaturalHeight: document.querySelector('.mobile-figma-image')?.naturalHeight,
  mobileVisible: getComputedStyle(document.querySelector('.mobile-home')).display !== 'none',
  desktopVisible: getComputedStyle(document.querySelector('.figma-home-exact')).display !== 'none',
  startButtons: document.querySelectorAll('[data-action="start"]').length,
  mobileHotspots: document.querySelectorAll('.mobile-figma-hotspot').length,
  mobileProfileLinks: document.querySelectorAll('.mobile-figma-hotspot[class*="mobile-profile-"]').length,
  profileLinks: document.querySelectorAll('.home-profile-hotspot').length,
  koicaLinks: document.querySelectorAll('.home-koica-hotspot').length,
  polishElements: document.querySelectorAll('.home-polish-layer > span').length,
  pageWidth: Math.round(document.querySelector('.app-shell.is-home').getBoundingClientRect().width),
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  scrollHeight: document.documentElement.scrollHeight,
  viewportHeight: window.innerHeight
}))()`);
await screenshot("./.artifacts/home-effects.png");

await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 960,
  deviceScaleFactor: 1,
  mobile: false,
});
await navigate("http://127.0.0.1:4173/");
const desktopHome = await evaluate(`(() => ({
  image: document.querySelector('.figma-home-image')?.currentSrc,
  imageWidth: Math.round(document.querySelector('.figma-home-image')?.getBoundingClientRect().width || 0),
  desktopVisible: getComputedStyle(document.querySelector('.figma-home-exact')).display !== 'none',
  mobileVisible: getComputedStyle(document.querySelector('.mobile-home')).display !== 'none',
  pageWidth: Math.round(document.querySelector('.app-shell.is-home')?.getBoundingClientRect().width || 0),
  scrollHeight: document.documentElement.scrollHeight,
  viewportHeight: window.innerHeight
}))()`);
await screenshot("./.artifacts/home-desktop.png");
await evaluate(`document.querySelector('[data-action="start"]').click()`);
await new Promise((resolve) => setTimeout(resolve, 100));
desktopHome.startedScreen = await evaluate(`document.querySelector('[data-screen]')?.dataset.screen`);

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await navigate("http://127.0.0.1:4173/");
const narrowHome = await evaluate(`(() => ({
  viewportWidth: window.innerWidth,
  pageWidth: Math.round(document.querySelector('.app-shell.is-home')?.getBoundingClientRect().width || 0),
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  mobileVisible: getComputedStyle(document.querySelector('.mobile-home')).display !== 'none',
  desktopVisible: getComputedStyle(document.querySelector('.figma-home-exact')).display !== 'none',
  artboardWidth: Math.round(document.querySelector('.mobile-figma-artboard').getBoundingClientRect().width),
  imageWidth: Math.round(document.querySelector('.mobile-figma-image').getBoundingClientRect().width),
  imageHeight: Math.round(document.querySelector('.mobile-figma-image').getBoundingClientRect().height),
  heroCtaHeight: Math.round(document.querySelector('.mobile-hero-start').getBoundingClientRect().height),
  heroCtaTop: (() => {
    const artboard = document.querySelector('.mobile-figma-artboard').getBoundingClientRect();
    const button = document.querySelector('.mobile-hero-start').getBoundingClientRect();
    return Math.round(button.top - artboard.top);
  })(),
  heroEffect: (() => {
    const artboard = document.querySelector('.mobile-figma-artboard').getBoundingClientRect();
    const effect = document.querySelector('.mobile-cta-motion').getBoundingClientRect();
    return {
      top: Math.round(effect.top - artboard.top),
      width: Math.round(effect.width),
      height: Math.round(effect.height)
    };
  })(),
  bottomCtaHeight: Math.round(document.querySelector('.mobile-bottom-start').getBoundingClientRect().height),
  menuButtonSize: (() => {
    const rect = document.querySelector('.mobile-menu-toggle').getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  })(),
  hotspotCount: document.querySelectorAll('.mobile-figma-hotspot').length,
  profileLinkCount: document.querySelectorAll('.mobile-figma-hotspot[class*="mobile-profile-"]').length,
  scrollHeight: document.documentElement.scrollHeight,
  viewportHeight: window.innerHeight
}))()`);
await screenshot("./.artifacts/home-phone-390.png");
await evaluate(`document.querySelector('[data-action="toggle-mobile-menu"]').click()`);
await new Promise((resolve) => setTimeout(resolve, 240));
narrowHome.menu = await evaluate(`(() => ({
  expanded: document.querySelector('[data-action="toggle-mobile-menu"]').getAttribute('aria-expanded'),
  label: document.querySelector('[data-action="toggle-mobile-menu"]').getAttribute('aria-label'),
  navigationVisible: getComputedStyle(document.querySelector('.mobile-navigation')).visibility === 'visible'
}))()`);
await screenshot("./.artifacts/home-phone-390-menu.png");
await evaluate(`document.querySelector('[data-action="toggle-mobile-menu"]').click()`);
await evaluate(`window.scrollTo({ top: 600, behavior: 'instant' })`);
await new Promise((resolve) => setTimeout(resolve, 80));
await screenshot("./.artifacts/home-mobile-features.png");
await evaluate(`document.querySelector('.anchor-lenses').scrollIntoView({ block: 'start', behavior: 'instant' })`);
await new Promise((resolve) => setTimeout(resolve, 80));
await screenshot("./.artifacts/home-mobile-lenses.png");
await evaluate(`document.querySelector('.anchor-team').scrollIntoView({ block: 'start', behavior: 'instant' })`);
await new Promise((resolve) => setTimeout(resolve, 80));
await screenshot("./.artifacts/home-mobile-team.png");
await evaluate(`document.querySelector('.anchor-impact').scrollIntoView({ block: 'start', behavior: 'instant' })`);
await new Promise((resolve) => setTimeout(resolve, 80));
await screenshot("./.artifacts/home-mobile-impact.png");
await evaluate(`document.querySelector('.mobile-bottom-start').scrollIntoView({ block: 'center', behavior: 'instant' })`);
await new Promise((resolve) => setTimeout(resolve, 80));
await screenshot("./.artifacts/home-mobile-final-cta.png");

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
});
await navigate("http://127.0.0.1:4173/");
await new Promise((resolve) => setTimeout(resolve, 260));
const highDpiMobile = await evaluate(`(() => ({
  dpr: window.devicePixelRatio,
  image: document.querySelector('.mobile-figma-image')?.currentSrc,
  imageWidth: Math.round(document.querySelector('.mobile-figma-image')?.getBoundingClientRect().width || 0),
  imageHeight: Math.round(document.querySelector('.mobile-figma-image')?.getBoundingClientRect().height || 0),
  profileLogoInline: Boolean(document.querySelector('.mobile-profile-wenk-logo-overlay > svg')),
  profileLogoViewBox: document.querySelector('.mobile-profile-wenk-logo-overlay > svg')?.getAttribute('viewBox'),
  profileLogoWidth: Math.round(document.querySelector('.mobile-profile-wenk-logo-overlay')?.getBoundingClientRect().width || 0),
  profileLabelInline: Boolean(document.querySelector('.mobile-profile-label-overlay > svg')),
  profileLabelViewBox: document.querySelector('.mobile-profile-label-overlay > svg')?.getAttribute('viewBox'),
  profileCard: document.querySelector('.mobile-profile-wenki-card-overlay')?.currentSrc,
  profileCardNaturalWidth: document.querySelector('.mobile-profile-wenki-card-overlay')?.naturalWidth,
  profileCardWidth: Math.round(document.querySelector('.mobile-profile-wenki-card-overlay')?.getBoundingClientRect().width || 0),
  correctedBrand: document.querySelector('.mobile-header-koica-correction')?.textContent.trim(),
  sourceAssetCount: document.querySelectorAll('.mobile-source-asset').length,
  sourceAssetNaturalWidths: [...document.querySelectorAll('.mobile-source-asset img')].map((img) => img.naturalWidth),
  heroCollageAsset: document.querySelector('.mobile-hero-collage-original')?.currentSrc,
  heroCollageNaturalWidth: document.querySelector('.mobile-hero-collage-original')?.naturalWidth,
  heroCollageClipPath: getComputedStyle(document.querySelector('.mobile-hero-collage-original')).clipPath,
  heroCollageBox: (() => {
    const artboard = document.querySelector('.mobile-figma-artboard').getBoundingClientRect();
    const asset = document.querySelector('.mobile-hero-collage-original').getBoundingClientRect();
    return {
      left: Math.round(asset.left - artboard.left),
      top: Math.round(asset.top - artboard.top),
      width: Math.round(asset.width),
      height: Math.round(asset.height)
    };
  })(),
  featureNaturalWidths: [...document.querySelectorAll('.mobile-feature-source img')].map((img) => img.naturalWidth),
  profilePhotoOverlayCount: document.querySelectorAll('.mobile-profile-photo-source').length,
  impactPhotoOverlayCount: document.querySelectorAll('.mobile-impact-photo-source').length,
  profileShineCount: document.querySelectorAll('.mobile-profile-photo-shine').length,
  animatedProfileHotspots: document.querySelectorAll('.mobile-figma-hotspot[class*="mobile-profile-"][data-mobile-animate]').length,
  profileAlignment: (() => {
    const artboard = document.querySelector('.mobile-figma-artboard').getBoundingClientRect();
    const shine = document.querySelector('.mobile-profile-shine-euiseong').getBoundingClientRect();
    const hotspot = document.querySelector('.mobile-profile-euiseong').getBoundingClientRect();
    const box = (rect) => ({
      left: Math.round(rect.left - artboard.left),
      top: Math.round(rect.top - artboard.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    });
    return { shine: box(shine), hotspot: box(hotspot) };
  })(),
  impactGlobeNaturalWidth: document.querySelector('.mobile-impact-globe-source img')?.naturalWidth,
  firstLensBox: (() => {
    const artboard = document.querySelector('.mobile-figma-artboard').getBoundingClientRect();
    const asset = document.querySelector('.mobile-lens-cooperation-icon').getBoundingClientRect();
    return {
      left: Math.round(asset.left - artboard.left),
      top: Math.round(asset.top - artboard.top),
      width: Math.round(asset.width),
      height: Math.round(asset.height)
    };
  })(),
  clipBackBox: (() => {
    const artboard = document.querySelector('.mobile-figma-artboard').getBoundingClientRect();
    const asset = document.querySelector('.mobile-profile-clip-back').getBoundingClientRect();
    return {
      left: Math.round(asset.left - artboard.left),
      top: Math.round(asset.top - artboard.top)
    };
  })(),
  impactAnimation: (() => {
    const link = document.querySelector('.mobile-koica-link');
    return {
      animateAttribute: link?.dataset.mobileAnimate || null,
      pseudoAnimation: getComputedStyle(link, '::after').animationName,
      pulseExists: Boolean(document.querySelector('.mobile-impact-pulse'))
    };
  })(),
  motionElements: document.querySelectorAll('[data-mobile-animate]').length,
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
}))()`);
await screenshot("./.artifacts/home-phone-390-dpr3.png");
await evaluate(`document.querySelector('.anchor-team').scrollIntoView({ block: 'start', behavior: 'instant' })`);
await new Promise((resolve) => setTimeout(resolve, 220));
highDpiMobile.teamMotion = await evaluate(`(() => ({
  logoVisible: document.querySelector('.mobile-profile-wenk-logo-overlay')?.classList.contains('is-in-view'),
  cardVisible: document.querySelector('.mobile-profile-wenki-card-overlay')?.classList.contains('is-in-view'),
  activeElements: document.querySelectorAll('[data-mobile-animate].is-in-view').length
}))()`);
await screenshot("./.artifacts/home-mobile-team-dpr3.png");
await new Promise((resolve) => setTimeout(resolve, 4200));
await screenshot("./.artifacts/home-mobile-team-shine-dpr3.png");

await send("Emulation.setDeviceMetricsOverride", {
  width: 320,
  height: 740,
  deviceScaleFactor: 1,
  mobile: true,
});
await navigate("http://127.0.0.1:4173/");
const smallHome = await evaluate(`(() => ({
  viewportWidth: window.innerWidth,
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  artboardWidth: Math.round(document.querySelector('.mobile-figma-artboard').getBoundingClientRect().width),
  imageWidth: Math.round(document.querySelector('.mobile-figma-image').getBoundingClientRect().width),
  heroCtaHeight: Math.round(document.querySelector('.mobile-hero-start').getBoundingClientRect().height),
  bottomCtaHeight: Math.round(document.querySelector('.mobile-bottom-start').getBoundingClientRect().height)
}))()`);
await screenshot("./.artifacts/home-phone-320.png");

await send("Emulation.setDeviceMetricsOverride", {
  width: 768,
  height: 900,
  deviceScaleFactor: 1,
  mobile: true,
});
await navigate("http://127.0.0.1:4173/");
const breakpointHome = await evaluate(`(() => ({
  viewportWidth: window.innerWidth,
  mobileVisible: getComputedStyle(document.querySelector('.mobile-home')).display !== 'none',
  desktopVisible: getComputedStyle(document.querySelector('.figma-home-exact')).display !== 'none',
  contentWidth: Math.round(document.querySelector('.mobile-figma-artboard').getBoundingClientRect().width),
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
}))()`);
await evaluate(`document.querySelector('.mobile-hero-start').click()`);
await new Promise((resolve) => setTimeout(resolve, 100));
breakpointHome.startedScreen = await evaluate(`document.querySelector('[data-screen]')?.dataset.screen`);

await send("Emulation.setDeviceMetricsOverride", {
  width: 1024,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await navigate("http://127.0.0.1:4173/");
const desktopBreakpointHome = await evaluate(`(() => ({
  viewportWidth: window.innerWidth,
  mobileVisible: getComputedStyle(document.querySelector('.mobile-home')).display !== 'none',
  desktopVisible: getComputedStyle(document.querySelector('.figma-home-exact')).display !== 'none',
  imageWidth: Math.round(document.querySelector('.figma-home-image').getBoundingClientRect().width),
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
}))()`);
await screenshot("./.artifacts/home-desktop-1024.png");

const checks = {
  initial,
  firstClick,
  secondClick,
  switchSelection,
  fullFlowResult,
  mobileResultMetrics,
  shareUi,
  storyMedia,
  homeEffects,
  desktopHome,
  narrowHome,
  highDpiMobile,
  smallHome,
  breakpointHome,
  desktopBreakpointHome,
};

const passed =
  initial.selected === 0 &&
  initial.nextDisabled === true &&
  firstClick.selected === 1 &&
  firstClick.pressed === "true" &&
  firstClick.nextDisabled === false &&
  secondClick.selected === 0 &&
  secondClick.pressed === "false" &&
  secondClick.nextDisabled === true &&
  switchSelection.selected === 1 &&
  switchSelection.firstPressed === "false" &&
  switchSelection.secondPressed === "true" &&
  fullFlowResult.screen === "result" &&
  fullFlowResult.correction === "participation" &&
  fullFlowResult.content === "water" &&
  fullFlowResult.metricCount === 3 &&
  JSON.stringify(fullFlowResult.metricValues) === JSON.stringify(["+0.5", "180°", "100%"]) &&
  mobileResultMetrics.combination === "협력렌즈 × 테크렌즈" &&
  JSON.stringify(mobileResultMetrics.values) === JSON.stringify(["+2.0", "60°", "100%"]) &&
  JSON.stringify(mobileResultMetrics.labels) === JSON.stringify(["협력도", "공감 시야각", "테크 감도"]) &&
  JSON.stringify(mobileResultMetrics.groups) === JSON.stringify(["교정렌즈 진단", "콘텐츠 렌즈 매칭"]) &&
  mobileResultMetrics.guidance.includes("협력도와 공감 시야각은 현재 ODA 인식을 분석한 교정렌즈 진단 결과예요") &&
  mobileResultMetrics.guidance.includes("수치가 높을수록 더 많은 인식 교정이 필요해요") &&
  mobileResultMetrics.guidance.includes("각도가 넓을수록 협력의 연결 관계를 폭넓게 바라보고 있어요") &&
  mobileResultMetrics.guidance.includes("선택한 관심 분야와 추천 콘텐츠의 매칭 정도예요") &&
  mobileResultMetrics.interpretation.includes("공감 시야각은 60°") &&
  mobileResultMetrics.interpretation.includes("ICT 분야에는 100%") &&
  mobileResultMetrics.boxes[0].top === mobileResultMetrics.boxes[1].top &&
  mobileResultMetrics.boxes[0].width >= 140 &&
  mobileResultMetrics.boxes[1].width >= 140 &&
  mobileResultMetrics.boxes[2].top > mobileResultMetrics.boxes[1].top + mobileResultMetrics.boxes[1].height &&
  mobileResultMetrics.boxes[2].width > mobileResultMetrics.boxes[0].width * 1.8 &&
  mobileResultMetrics.boxes.every((box) => box.clipped === false) &&
  mobileResultMetrics.horizontalOverflow === false &&
  shareUi.shareButtons === 4 &&
  shareUi.copyStatus.includes("복사") &&
  !shareUi.copyStatus.includes("복사하지 못했어요") &&
  shareUi.instagramStatus.includes("스토리용") &&
  !shareUi.instagramStatus.includes("준비하지 못했어요") &&
  shareUi.feedStatus.length > 0 &&
  storyMedia.images.length === 2 &&
  storyMedia.images.every((img) => img.height <= 360) &&
  storyMedia.images.every((img) => img.objectFit === "contain") &&
  !shareUi.feedStatus.includes("준비하지 못했어요") &&
  homeEffects.mobileVisible === true &&
  homeEffects.desktopVisible === false &&
  homeEffects.startButtons === 5 &&
  homeEffects.mobileHotspots === 8 &&
  homeEffects.mobileProfileLinks === 5 &&
  homeEffects.mobileAsset.includes("home-mobile-figma-vector.svg") &&
  homeEffects.mobileNaturalWidth === 390 &&
  homeEffects.mobileNaturalHeight === 2136 &&
  homeEffects.profileLinks === 5 &&
  homeEffects.koicaLinks === 1 &&
  homeEffects.polishElements === 9 &&
  homeEffects.heroAsset.includes("home-figma-4x.png") &&
  homeEffects.heroNaturalWidth === 1560 &&
  homeEffects.heroNaturalHeight === 3956 &&
  homeEffects.pageWidth >= 480 &&
  homeEffects.horizontalOverflow === false &&
  homeEffects.scrollHeight > homeEffects.viewportHeight &&
  desktopHome.image.includes("home-figma-4x.png") &&
  desktopHome.imageWidth >= 1400 &&
  desktopHome.pageWidth >= 1400 &&
  desktopHome.desktopVisible === true &&
  desktopHome.mobileVisible === false &&
  desktopHome.scrollHeight > desktopHome.viewportHeight &&
  desktopHome.startedScreen === "question" &&
  narrowHome.viewportWidth === 390 &&
  narrowHome.pageWidth >= 375 &&
  narrowHome.horizontalOverflow === false &&
  narrowHome.mobileVisible === true &&
  narrowHome.desktopVisible === false &&
  narrowHome.artboardWidth === 390 &&
  narrowHome.imageWidth === 390 &&
  narrowHome.imageHeight === 2136 &&
  narrowHome.heroCtaHeight >= 48 &&
  narrowHome.heroCtaTop === 537 &&
  narrowHome.heroEffect.top === 537 &&
  narrowHome.heroEffect.width === 322 &&
  narrowHome.heroEffect.height === 46 &&
  narrowHome.bottomCtaHeight >= 48 &&
  narrowHome.menuButtonSize.width >= 44 &&
  narrowHome.menuButtonSize.height >= 44 &&
  narrowHome.hotspotCount === 8 &&
  narrowHome.profileLinkCount === 5 &&
  narrowHome.menu.expanded === "true" &&
  narrowHome.menu.label === "메뉴 닫기" &&
  narrowHome.menu.navigationVisible === true &&
  highDpiMobile.dpr === 3 &&
  highDpiMobile.image.includes("home-mobile-figma-vector.svg") &&
  highDpiMobile.imageWidth === 390 &&
  highDpiMobile.imageHeight === 2136 &&
  highDpiMobile.profileLogoInline === true &&
  highDpiMobile.profileLogoViewBox === "0 0 155 61" &&
  highDpiMobile.profileLogoWidth === 155 &&
  highDpiMobile.profileLabelInline === true &&
  highDpiMobile.profileLabelViewBox === "0 0 51 18" &&
  highDpiMobile.profileCard.includes("profile-wenki-card.svg") &&
  highDpiMobile.profileCardNaturalWidth === 132 &&
  highDpiMobile.profileCardWidth === 132 &&
  highDpiMobile.correctedBrand === "KOICA안경소" &&
  highDpiMobile.sourceAssetCount === 19 &&
  highDpiMobile.sourceAssetNaturalWidths.length === 18 &&
  highDpiMobile.sourceAssetNaturalWidths.every((width) => width > 0) &&
  highDpiMobile.heroCollageAsset.includes("mobile-hero-collage-figma-4x.png") &&
  highDpiMobile.heroCollageNaturalWidth === 1304 &&
  highDpiMobile.heroCollageClipPath === "inset(5% 0px 0px)" &&
  highDpiMobile.heroCollageBox.left === 13 &&
  highDpiMobile.heroCollageBox.top === 209 &&
  highDpiMobile.heroCollageBox.width === 349 &&
  highDpiMobile.heroCollageBox.height === 266 &&
  highDpiMobile.featureNaturalWidths.length === 4 &&
  highDpiMobile.featureNaturalWidths.every((width) => width === 1536) &&
  highDpiMobile.profilePhotoOverlayCount === 0 &&
  highDpiMobile.impactPhotoOverlayCount === 0 &&
  highDpiMobile.profileShineCount === 5 &&
  highDpiMobile.animatedProfileHotspots === 0 &&
  highDpiMobile.profileAlignment.shine.left === 159 &&
  highDpiMobile.profileAlignment.shine.top === 1156 &&
  highDpiMobile.profileAlignment.shine.width === 84 &&
  highDpiMobile.profileAlignment.shine.height === 105 &&
  highDpiMobile.profileAlignment.hotspot.left === 152 &&
  highDpiMobile.profileAlignment.hotspot.top === 1144 &&
  highDpiMobile.profileAlignment.hotspot.width === 99 &&
  highDpiMobile.profileAlignment.hotspot.height === 148 &&
  highDpiMobile.impactGlobeNaturalWidth === 1024 &&
  highDpiMobile.firstLensBox.left === 26 &&
  highDpiMobile.firstLensBox.top === 878 &&
  highDpiMobile.firstLensBox.width === 63 &&
  highDpiMobile.firstLensBox.height === 63 &&
  highDpiMobile.clipBackBox.left === -12 &&
  highDpiMobile.clipBackBox.top === 1271 &&
  highDpiMobile.impactAnimation.animateAttribute === null &&
  highDpiMobile.impactAnimation.pseudoAnimation === "none" &&
  highDpiMobile.impactAnimation.pulseExists === false &&
  highDpiMobile.motionElements === 22 &&
  highDpiMobile.teamMotion.logoVisible === true &&
  highDpiMobile.teamMotion.cardVisible === true &&
  highDpiMobile.teamMotion.activeElements >= 8 &&
  highDpiMobile.horizontalOverflow === false &&
  smallHome.viewportWidth === 320 &&
  smallHome.horizontalOverflow === false &&
  smallHome.artboardWidth === 320 &&
  smallHome.imageWidth === 320 &&
  smallHome.heroCtaHeight >= 48 &&
  smallHome.bottomCtaHeight >= 48 &&
  breakpointHome.viewportWidth === 768 &&
  breakpointHome.mobileVisible === true &&
  breakpointHome.desktopVisible === false &&
  breakpointHome.contentWidth === 390 &&
  breakpointHome.horizontalOverflow === false &&
  breakpointHome.startedScreen === "question" &&
  desktopBreakpointHome.viewportWidth === 1024 &&
  desktopBreakpointHome.mobileVisible === false &&
  desktopBreakpointHome.desktopVisible === true &&
  desktopBreakpointHome.imageWidth >= 1000 &&
  desktopBreakpointHome.horizontalOverflow === false;

console.log(JSON.stringify({ passed, checks }, null, 2));
socket.close();
if (!passed) process.exit(1);
