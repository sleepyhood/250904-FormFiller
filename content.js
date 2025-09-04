// ---------- 유틸 ----------
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const EQ = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();
const HAS = (a, b) => norm(a).toLowerCase().includes(norm(b).toLowerCase());

function dispatchAll(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur?.();
}

function setPlainValue(el, val) {
  if (el.type === "file") return true; // 보안정책상 직접 세팅 금지(별도 처리)
  const proto =
    el.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter ? setter.call(el, val ?? "") : (el.value = val ?? "");
  dispatchAll(el);
  return true;
}

function setSelect(el, val) {
  let ok = false;
  for (const opt of el.options) {
    if (opt.value == val || EQ(opt.textContent, val)) {
      el.value = opt.value;
      ok = true;
      break;
    }
  }
  if (!ok && el.options.length) el.value = el.options[0].value;
  dispatchAll(el);
  return true;
}

const toHTML = (txt) => {
  if (txt == null) return "";
  return String(txt)
    .split(/\r?\n/)
    .map((l) => {
      const esc = l
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<p>${esc || "<br>"}</p>`;
    })
    .join("");
};

function setRichNode(node, html) {
  node.innerHTML = html;
  dispatchAll(node);
  return true;
}

// Quill/CK/ProseMirror/Draft/Simditor/일반 contenteditable/ div>p
function setRichEditable(rootEl, txt) {
  const html = toHTML(txt);
  const q = (s) => rootEl.querySelector(s);
  // Simditor
  if (rootEl.matches(".simditor, .simditor-body") || q(".simditor-body")) {
    const body = rootEl.matches(".simditor-body")
      ? rootEl
      : q(".simditor-body");
    const ta = rootEl.querySelector("textarea"); // Simditor가 내부적으로 보관
    if (body) setRichNode(body, html);
    if (ta) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      setter ? setter.call(ta, html) : (ta.value = html);
      dispatchAll(ta);
    }
    return true;
  }
  // Quill
  if (rootEl.matches(".ql-container, .ql-editor") || q(".ql-editor")) {
    const n = rootEl.matches(".ql-editor") ? rootEl : q(".ql-editor");
    return setRichNode(n, html);
  }
  // CKEditor
  if (rootEl.matches(".ck-editor, .ck-content") || q(".ck-content")) {
    const n = rootEl.matches(".ck-content") ? rootEl : q(".ck-content");
    return setRichNode(n, html);
  }
  // ProseMirror
  if (rootEl.matches(".ProseMirror") || q(".ProseMirror")) {
    const n = rootEl.matches(".ProseMirror") ? rootEl : q(".ProseMirror");
    return setRichNode(n, html);
  }
  // Draft.js
  if (
    rootEl.matches(".public-DraftEditor-content") ||
    q(".public-DraftEditor-content")
  ) {
    const n = rootEl.matches(".public-DraftEditor-content")
      ? rootEl
      : q(".public-DraftEditor-content");
    return setRichNode(n, html);
  }
  // 일반 contenteditable
  if (rootEl.getAttribute("contenteditable") === "true")
    return setRichNode(rootEl, html);
  // div > p 구조
  const p = rootEl.querySelector("p");
  if (p) {
    p.innerHTML = html || "<br>";
    dispatchAll(rootEl);
    return true;
  }
  return false;
}

async function makeFileFromValue(label, value) {
  try {
    if (typeof value !== "string") return null;
    if (value === "__PICK__") return "__PICK__";
    if (value.startsWith("data:")) {
      const r = await fetch(value);
      const b = await r.blob();
      return new File([b], label || "upload", {
        type: b.type || "application/octet-stream",
      });
    }
    if (value.startsWith("text:")) {
      const txt = value.slice(5);
      return new File([txt], (label || "text") + ".txt", {
        type: "text/plain",
      });
    }
  } catch {}
  return null;
}

function tryDropToZone(file) {
  const dz = document.querySelector(
    '.dropzone,[data-dropzone],.el-upload,.ant-upload,div[class*="drop"]'
  );
  if (!dz || !file) return false;
  const dt = new DataTransfer();
  dt.items.add(file);
  const ev = new DragEvent("drop", { bubbles: true });
  Object.defineProperty(ev, "dataTransfer", { value: dt });
  dz.dispatchEvent(ev);
  return true;
}

// ---------- 레이블→컨트롤 찾기 ----------
function controlFromLabelEl(label) {
  if (!label) return null;
  const forId = label.getAttribute("for");
  if (forId) {
    const byId = document.getElementById(forId);
    if (byId) return byId;
  }
  // 같은 .el-form-item 또는 부모 래퍼 안에서 탐색
  const wrappers = [
    label.closest(
      ".el-form-item,.ant-form-item,.form-item,.field,.form-group,[data-field],.editor,.simditor"
    ),
    label.parentElement,
    label,
  ];
  for (const w of wrappers) {
    if (!w) continue;
    const hit = w.querySelector(
      'input,textarea,select,[contenteditable="true"],.ql-editor,.ck-content,.ProseMirror,.public-DraftEditor-content,.simditor-body,div p'
    );
    if (hit) return hit;
  }
  // 폴백: label 이후 나오는 첫 입력형 노드
  const xp = (p, r = document) =>
    document.evaluate(p, r, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue;
  return xp(
    './/following::*[self::input or self::textarea or self::select or @contenteditable="true" or contains(@class,"ql-editor") or contains(@class,"ck-content") or contains(@class,"ProseMirror") or contains(@class,"public-DraftEditor-content") or contains(@class,"simditor-body") or self::div[.//p]][1]',
    label
  );
}

// ---------- 레이블→컨트롤 찾기 (도메인 규칙 우선) ----------
function findByLabelText(text) {
  const wanted = norm(text);

  // 1) 라벨 요소 세트
  const labels = [
    ...document.querySelectorAll(
      'label, .el-form-item__label, [role="label"], [aria-label]'
    ),
  ];

  // 1-a) 정확/포함 매칭으로 레이블 DOM 찾기
  const matchLabel = () => {
    let lab = labels.find(
      (l) =>
        l.matches("label,.el-form-item__label") && EQ(l.textContent, wanted)
    );
    if (!lab)
      lab = labels.find(
        (l) =>
          l.matches("label,.el-form-item__label") && HAS(l.textContent, wanted)
      );
    return lab || null;
  };

  // 1-b) 라벨을 찾으면 같은 form-item 범위에서 "선호 컨트롤" 먼저 집기
  const lab = matchLabel();
  if (lab) {
    const formItem =
      lab.closest(
        ".el-form-item,.ant-form-item,.form-item,.field,.form-group,form,section,article"
      ) ||
      lab.parentElement ||
      document;
    // 도메인 규칙이 있으면 우선
    const preferred = pickPreferredInScope(formItem, wanted);
    if (preferred) return preferred;

    // 없으면 일반 로직
    const hit = formItem.querySelector(
      'input,textarea,select,[contenteditable="true"],.ql-editor,.ck-content,.ProseMirror,.public-DraftEditor-content,.simditor-body,div p'
    );
    if (hit) return hit;
  }

  // 2) aria-label/placeholder 직접
  const aria = document.querySelector(
    `[aria-label="${CSS.escape(wanted)}"], [placeholder="${CSS.escape(
      wanted
    )}"]`
  );
  if (aria) return aria;

  // 3) form-item 집합에서 라벨 텍스트 포함 매칭 → 선호 컨트롤
  const items = [
    ...document.querySelectorAll(
      ".el-form-item,.ant-form-item,.form-item,.field,.form-group,form,section,article"
    ),
  ];
  for (const it of items) {
    const l = it.querySelector("label,.el-form-item__label");
    if (l && HAS(l.textContent, wanted)) {
      const preferred = pickPreferredInScope(it, wanted);
      if (preferred) return preferred;
      const hit = it.querySelector(
        'input,textarea,select,[contenteditable="true"],.ql-editor,.ck-content,.ProseMirror,.public-DraftEditor-content,.simditor-body,div p'
      );
      if (hit) return hit;
    }
  }

  return null;
}

// ---------- 값 주입 ----------
async function fillOne(labelText, value) {
  const el = findByLabelText(labelText);
  if (!el) return { label: labelText, found: false, filled: false };

  // 파일필드
  if (el.tagName === "INPUT" && el.type === "file") {
    const f = await makeFileFromValue(labelText, value);
    if (f === "__PICK__") {
      el.click();
      return {
        label: labelText,
        found: true,
        filled: true,
        note: "opened picker",
      };
    }
    const ok = tryDropToZone(f);
    return {
      label: labelText,
      found: true,
      filled: ok,
      note: ok ? "dropped to zone" : "skipped (no zone)",
    };
  }

  // 기본 타입
  if (el.tagName === "INPUT" && el.type !== "checkbox" && el.type !== "radio") {
    setPlainValue(el, value);
    return { label: labelText, found: true, filled: true };
  }
  if (el.tagName === "TEXTAREA") {
    setPlainValue(el, value);
    return { label: labelText, found: true, filled: true };
  }
  if (el.tagName === "SELECT") {
    setSelect(el, value);
    return { label: labelText, found: true, filled: true };
  }
  // 리치/커스텀
  const ok = setRichEditable(el, value);
  return { label: labelText, found: true, filled: ok, type: "rich" };
}

// ---------- 메시지 핸들러 ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "FILL_BY_LABEL") {
      if (RULES?.readySelectors?.length)
        await waitReady(RULES.readySelectors, 15000);

      const data = msg.data || {};
      const pairs = Array.isArray(data)
        ? data
        : Object.entries(data).map(([label, value]) => ({ label, value }));
      const results = [];
      for (const { label, value } of pairs) {
        results.push(await fillOne(label, value));
      }
      console.table(results);
      sendResponse({ ok: true, results });
    }
  })();
  // 비동기 응답
  return true;
});

// ========== [추가] 도메인별 커스텀 ==========
const DOMAIN_RULES = {
  "<YOUR_DOMAIN>": {
    // 페이지가 다 뜨기 전에 실행되는 SPA 대응 대기 셀렉터
    readySelectors: [
      ".el-form-item__content",
      ".simditor-body, .ck-content, .ql-editor",
    ],

    // 라벨 alias (JSON 키 ↔ 화면 라벨 표기가 다를 때)
    aliases: {
      번호: ["문제 아이디", "문제 번호", "번호"],
      제목: ["문제 제목", "제목"],
      "문제 설명": ["문제 설명", "설명", "Description"],
      "입력 설명": ["입력 설명", "입력형식"],
      "출력 설명": ["출력 설명", "출력형식"],
      "입력 예시": ["입력 예시", "예시 입력"],
      "출력 예시": ["출력 예시", "예시 출력"],
      힌트: ["힌트", "Tip"],
    },

    // 특정 라벨에 대해 "선호 컨트롤"을 지정 (리치에디터 우선)
    preferredByLabel: {
      "문제 설명":
        ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p",
      "입력 설명":
        ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p",
      "출력 설명":
        ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p",
      힌트: ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p",
    },

    // (선택) 구조가 고정이라면 인덱스로 빠르게 집는 규칙도 가능
    // 예: Simditor가 항상 두 번째 폼 아이템일 때
    // fixedPositions: { "문제 설명": { itemNth: 2, prefer: ".simditor-body" } }
  },
};

const HOST = location.host.replace(/^www\./, "");
const RULES = DOMAIN_RULES[HOST] || null;

// ========== [추가] SPA 로딩 대기 ==========
async function waitReady(selectors = [], timeout = 10000) {
  if (!selectors?.length) return;
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (selectors.some((s) => document.querySelector(s))) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

// ========== [추가] 도메인별: 라벨 문자열 정규화/alias ==========
function expandAliases(label) {
  if (!RULES?.aliases) return [label];
  for (const [canonical, alist] of Object.entries(RULES.aliases)) {
    if ([canonical, ...(alist || [])].some((v) => v === label)) {
      return [canonical, ...alist];
    }
  }
  return [label];
}

// ========== [추가] 도메인별: 컨트롤 선호 선택 ==========
function pickPreferredInScope(scopeEl, label) {
  if (!scopeEl) return null;
  const candidates = [];
  const canonical = expandAliases(label)[0];
  const preferSel = RULES?.preferredByLabel?.[canonical];
  if (preferSel) candidates.push(...scopeEl.querySelectorAll(preferSel));
  // 범용 후보
  candidates.push(
    ...scopeEl.querySelectorAll(
      'input,textarea,select,[contenteditable="true"],.ql-editor,.ck-content,.ProseMirror,.public-DraftEditor-content,.simditor-body,div p'
    )
  );
  return candidates[0] || null;
}
