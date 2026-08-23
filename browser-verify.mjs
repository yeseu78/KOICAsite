import fs from "node:fs/promises";

const endpoint = "http://127.0.0.1:9223";
const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const pageTarget = targets.find((target) => target.type === "page");
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
  content: document.querySelector('[data-screen="result"]')?.dataset.content
}))()`);

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
  startHotspots: document.querySelectorAll('[data-action="start"]').length,
  profileLinks: document.querySelectorAll('.home-profile-hotspot').length,
  koicaLinks: document.querySelectorAll('.home-koica-hotspot').length,
  polishElements: document.querySelectorAll('.home-polish-layer > span').length,
  lensAnimation: getComputedStyle(document.querySelector('.home-lens-glint'), '::after').animationName,
  animation: getComputedStyle(document.querySelector('.figma-home-image')).animationName,
  pageWidth: Math.round(document.querySelector('.app-shell.is-home').getBoundingClientRect().width),
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
  heroWidth: Math.round(document.querySelector('.figma-home-image')?.getBoundingClientRect().width || 0),
  scrollHeight: document.documentElement.scrollHeight,
  hotspots: (() => {
    const artboard = document.querySelector('.figma-home-artboard').getBoundingClientRect();
    const measure = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return {
        left: Math.round(rect.left - artboard.left),
        top: Math.round(rect.top - artboard.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    return {
      topStart: measure('.home-start-hotspot'),
      koica: measure('.home-koica-hotspot'),
      bottomStart: measure('.home-bottom-start-hotspot')
    };
  })()
}))()`);
await screenshot("./.artifacts/home-phone-390.png");
await evaluate(`document.querySelector('.home-koica-hotspot').scrollIntoView({ block: 'center', behavior: 'instant' })`);
await new Promise((resolve) => setTimeout(resolve, 80));
const koicaHoverBox = await evaluate(`(() => {
  const rect = document.querySelector('.home-koica-hotspot').getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
})()`);
await send("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x: koicaHoverBox.x,
  y: koicaHoverBox.y
});
await new Promise((resolve) => setTimeout(resolve, 120));
narrowHome.hoverLayer = await evaluate(`(() => {
  const style = getComputedStyle(document.querySelector('.home-koica-hotspot'), '::after');
  return { backgroundColor: style.backgroundColor, boxShadow: style.boxShadow };
})()`);
await screenshot("./.artifacts/home-button-hover.png");

const checks = {
  initial,
  firstClick,
  secondClick,
  switchSelection,
  fullFlowResult,
  shareUi,
  storyMedia,
  homeEffects,
  desktopHome,
  narrowHome,
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
  homeEffects.startHotspots === 2 &&
  homeEffects.profileLinks === 5 &&
  homeEffects.koicaLinks === 1 &&
  homeEffects.polishElements === 5 &&
  homeEffects.lensAnimation === "home-lens-shine" &&
  homeEffects.heroAsset.includes("home-figma-4x.png") &&
  homeEffects.heroNaturalWidth === 1560 &&
  homeEffects.heroNaturalHeight === 3956 &&
      homeEffects.pageWidth >= 480 &&
  homeEffects.scrollHeight > homeEffects.viewportHeight &&
  homeEffects.animation !== "none" &&
  desktopHome.image.includes("home-figma-4x.png") &&
  desktopHome.imageWidth >= 1400 &&
      desktopHome.pageWidth >= 1400 &&
  desktopHome.scrollHeight > desktopHome.viewportHeight &&
  desktopHome.startedScreen === "question" &&
  narrowHome.viewportWidth === 390 &&
  narrowHome.pageWidth >= 375 &&
  narrowHome.horizontalOverflow === false &&
  Math.abs(narrowHome.hotspots.topStart.left - 47) <= 1 &&
  Math.abs(narrowHome.hotspots.topStart.top - 152) <= 1 &&
  Math.abs(narrowHome.hotspots.koica.left - 42) <= 1 &&
  Math.abs(narrowHome.hotspots.koica.top - 850) <= 1 &&
  Math.abs(narrowHome.hotspots.bottomStart.left - 147) <= 1 &&
  Math.abs(narrowHome.hotspots.bottomStart.top - 952) <= 1 &&
  narrowHome.hoverLayer.backgroundColor === "rgba(0, 0, 0, 0)" &&
  narrowHome.hoverLayer.boxShadow === "none" &&
  narrowHome.heroWidth <= narrowHome.pageWidth + 24;

console.log(JSON.stringify({ passed, checks }, null, 2));
socket.close();
if (!passed) process.exit(1);
