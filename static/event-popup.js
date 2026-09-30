const hiddenDateKey = "wenk_popup_2026_10_hidden_date";
let dialog;
let launcher;
let hasAutoOpened = false;
let isHomeVisible = false;

function todayInKorea() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function isHiddenToday() {
  try {
    return localStorage.getItem(hiddenDateKey) === todayInKorea();
  } catch {
    return false;
  }
}

function openPopup() {
  if (dialog.open) return;
  dialog.querySelector("[data-event-hide-today]").checked = isHiddenToday();
  dialog.showModal();
  document.documentElement.classList.add("event-popup-open");
  dialog.querySelector(".event-popup-scroll").scrollTop = 0;
  dialog.querySelector("#event-popup-title").focus({ preventScroll: true });
}

function createPopup() {
  launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "event-popup-launcher";
  launcher.hidden = true;
  launcher.setAttribute("aria-haspopup", "dialog");
  launcher.setAttribute("aria-controls", "wenk-event-popup");
  launcher.innerHTML = '<span aria-hidden="true">✦</span> 팝업 안내 <span class="event-popup-launcher-date">10.03–04</span>';
  launcher.addEventListener("click", openPopup);

  dialog = document.createElement("dialog");
  dialog.id = "wenk-event-popup";
  dialog.className = "event-popup";
  dialog.setAttribute("aria-labelledby", "event-popup-title");
  dialog.setAttribute("aria-describedby", "event-popup-intro");
  dialog.innerHTML = `
    <button class="event-popup-close" type="button" aria-label="행사 안내 닫기" data-event-close>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
    </button>
    <div class="event-popup-scroll">
      <div class="event-popup-layout">
        <div class="event-popup-poster">
          <a href="./assets/events/wenk-popup-2026.pdf" target="_blank" rel="noopener noreferrer" aria-label="WE ARE Odavich 행사 포스터 PDF 크게 보기 (새 탭)">
            <img src="./assets/events/wenk-popup-2026.webp" width="1203" height="1701" alt="WE ARE Odavich. WE:NK 팝업 부스, 2026년 10월 3일부터 4일까지. 안경 너머로 펼쳐진 길과 열기구를 담은 행사 포스터." decoding="async" />
            <span class="event-popup-poster-link">포스터 크게 보기 <span aria-hidden="true">↗</span></span>
          </a>
        </div>
        <section class="event-popup-details" aria-labelledby="event-popup-title">
          <p class="event-popup-eyebrow"><span aria-hidden="true"></span> WE:NK POP-UP · BUSAN</p>
          <h2 id="event-popup-title" tabindex="-1">WE ARE <span>Odavich</span></h2>
          <p id="event-popup-intro">10월의 첫 주말,<br /> 부산에서 WE:NK를 만나요.</p>
          <div class="event-popup-schedule">
            <section class="event-popup-day" aria-labelledby="event-day-one">
              <div class="event-popup-date"><span class="event-popup-day-label">DAY 1</span><h3 id="event-day-one"><time datetime="2026-10-03">10/3 <span>(토)</span></time></h3><span class="event-popup-time">12:00–17:00</span></div>
              <p class="event-popup-venue">부산대역 1번 출구 앞 문화나눔터</p>
              <p class="event-popup-address">부산 금정구 장전온천천로 48</p>
            </section>
            <section class="event-popup-day" aria-labelledby="event-day-two">
              <div class="event-popup-date"><span class="event-popup-day-label">DAY 2</span><h3 id="event-day-two"><time datetime="2026-10-04">10/4 <span>(일)</span></time></h3><span class="event-popup-time">12:00–17:00</span></div>
              <p class="event-popup-venue">다비치 안경 부산남포점</p>
              <p class="event-popup-address">부산 중구 중구로 3</p>
            </section>
          </div>
          <p class="event-popup-note">행사 소식은 인스타그램에서 확인해 주세요.</p>
        </section>
      </div>
    </div>
    <footer class="event-popup-footer">
      <a class="event-popup-instagram" href="https://www.instagram.com/weko8th_wenk/" target="_blank" rel="noopener noreferrer" aria-label="WE:NK 인스타그램 바로가기 (새 탭)">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.7" /><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.7" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
        <span>인스타그램 바로가기</span><span aria-hidden="true">↗</span>
      </a>
      <div class="event-popup-dismiss">
        <label><input type="checkbox" data-event-hide-today /> 오늘 하루 보지 않기</label>
        <button type="button" data-event-close>닫기</button>
      </div>
    </footer>
  `;
  dialog.querySelectorAll("[data-event-close]").forEach((button) => {
    button.addEventListener("click", () => dialog.close());
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("a[href], button, input")];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      dialog.close();
    }
  });
  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("event-popup-open");
    try {
      if (dialog.querySelector("[data-event-hide-today]").checked) {
        localStorage.setItem(hiddenDateKey, todayInKorea());
      } else {
        localStorage.removeItem(hiddenDateKey);
      }
    } catch {
      // Closing must still work when the browser blocks local storage.
    }
    if (isHomeVisible) launcher.focus({ preventScroll: true });
  });
  document.body.append(launcher, dialog);
}

export function setHomeEventPopup(visible) {
  isHomeVisible = visible;
  if (!visible) {
    if (launcher) launcher.hidden = true;
    if (dialog?.open) dialog.close();
    document.documentElement.classList.remove("event-popup-open");
    return;
  }
  if (!dialog) createPopup();
  launcher.hidden = false;
  if (!hasAutoOpened) {
    hasAutoOpened = true;
    if (!isHiddenToday()) openPopup();
  }
}
