// ---------- 유틸 ----------
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const EQ = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();
const HAS = (a, b) => norm(a).toLowerCase().includes(norm(b).toLowerCase());

function dispatchAll(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  // 일부 UI 라이브러리는 keyup/compositionend도 본다
  el.dispatchEvent(new Event("keyup", { bubbles: true }));
  el.dispatchEvent(new Event("compositionend", { bubbles: true }));
  el.blur?.();
}

function setPlainValue(el, val, labelHint) {
  if (el.type === "file") return true;
  const proto =
    el.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

  const safe = toFieldString(val, labelHint); // ✅ 여기서 객체 방어
  setter ? setter.call(el, safe) : (el.value = safe);
  dispatchAll(el);
  return true;
}

function setCheckbox(el, value) {
  const truthy = (v) =>
    typeof v === "string"
      ? ["true", "1", "on", "y", "yes", "checked"].includes(v.toLowerCase())
      : !!v;
  const proto = HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "checked")?.set;
  setter ? setter.call(el, truthy(value)) : (el.checked = truthy(value));
  // 클릭 시그널까지 필요해하는 UI가 있어 의도적 click 추가
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  dispatchAll(el);
  return true;
}

function setRadio(el, value) {
  const form = el.form || document;
  const name = el.name;
  const radios = name
    ? [
        ...form.querySelectorAll(
          `input[type="radio"][name="${CSS.escape(name)}"]`
        ),
      ]
    : [el];

  // value 또는 라벨 텍스트로 매칭
  const wanted = String(value ?? "");
  let target = radios.find((r) => r.value == wanted);
  if (!target) {
    for (const r of radios) {
      const lab =
        r.closest("label") || form.querySelector(`label[for="${r.id}"]`);
      if (
        lab &&
        (EQ(lab.textContent, wanted) || HAS(lab.textContent, wanted))
      ) {
        target = r;
        break;
      }
    }
  }
  target ||= el;

  const proto = HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "checked")?.set;
  setter ? setter.call(target, true) : (target.checked = true);
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  dispatchAll(target);
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
  // contenteditable 쪽은 상위 노드로 이벤트를 날리는 경우가 있다
  dispatchAll(node);
  return true;
}

// Quill/CK/ProseMirror/Draft/Simditor/일반 contenteditable/ div>p
function setRichEditable(rootEl, txt) {
  const html = toHTML(txt);
  const q = (s) => rootEl.querySelector(s);

  // Simditor: .simditor-body + 숨은 textarea 동기화
  if (rootEl.matches(".simditor, .simditor-body") || q(".simditor-body")) {
    const body = rootEl.matches(".simditor-body")
      ? rootEl
      : q(".simditor-body");
    // Simditor 구조상 textarea는 보통 같은 form-item 내부에 위치
    const ta =
      rootEl.querySelector("textarea") ||
      document.querySelector("textarea.simditor-textarea");
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
// ----- JSON → ZIP 스펙 지원 -----
// ----- JSON → ZIP 스펙 -----
async function makeZipFromSpec(spec) {
  if (!spec) return null;
  if (spec.entries)
    return buildZipSTORE(spec.entries, spec.filename || "testcases.zip");
  if (spec.cases) {
    const entries = [];
    spec.cases.forEach((c, i) => {
      const n = i + 1;
      if (c.in != null) entries.push([`${n}.in`, String(c.in)]);
      if (c.out != null) entries.push([`${n}.out`, String(c.out)]);
    });
    return buildZipSTORE(entries, spec.filename || "testcases.zip");
  }
  return null;
}
// ----- 파일 값 처리 -----
async function makeFileFromValue(label, value) {
  try {
    if (!value) return null;
    // 다중 파일
    if (Array.isArray(value)) {
      const arr = [];
      for (const v of value) {
        const f = await makeFileFromValue(label, v);
        if (f) arr.push(f);
      }
      return arr;
    }

    // ✅ 객체 스펙이면 ZIP 즉석 생성
    if (typeof value === "object") {
      const z = await makeZipFromSpec(value);
      if (z) return z;
      return null;
    }

    // 문자열
    if (typeof value !== "string") return null;
    if (value === "__PICK__") return "__PICK__";
    if (value.startsWith("data:")) {
      // data:...#파일명 → # 뒤를 파일명으로 사용
      const [uri, namePart] = value.split("#");
      const r = await fetch(uri);
      const b = await r.blob();
      const name = namePart || "upload.zip";
      return new File([b], name, {
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

function getDropzoneSelector() {
  // 옵션 페이지(JSON 문자열) + 도메인 규칙 병합
  const selOpt = USER_OPTS?.dropzone;
  const selRule = RULES?.dropzone;
  return (
    selOpt ||
    selRule ||
    '.dropzone,[data-dropzone],.el-upload,.ant-upload,div[class*="drop"]'
  );
}

function getDropTargets() {
  return document.querySelectorAll(
    '.el-upload__inner, .el-upload-dragger, .el-upload, .ant-upload, [data-dropzone], .dropzone, div[class*="drop"]'
  );
}

function fireDragSeq(target, dt) {
  for (const type of ["dragenter", "dragover"]) {
    const ev = new DragEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "dataTransfer", { value: dt });
    target.dispatchEvent(ev);
  }
  const drop = new DragEvent("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", { value: dt });
  return target.dispatchEvent(drop);
}
// ✅ File만 통과
function onlyFiles(files) {
  const arr = Array.isArray(files) ? files : [files];
  return arr.filter((f) => f instanceof File);
}

// ✅ 같은 라벨 form-item 스코프 안의 숨은 input에만 주입
function injectFilesToHiddenInput(hiddenInput, fileOrFiles) {
  const files = onlyFiles(fileOrFiles);
  if (!hiddenInput || !files.length) return false;

  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  try {
    Object.defineProperty(hiddenInput, "files", {
      configurable: true,
      get: () => dt.files,
    });
  } catch {}

  // Element UI가 change뿐 아니라 input도 트리거할 때가 있어 둘 다 쏜다
  hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
  hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));

  return true;
}

// ❌ 이 구현을 삭제 (또는 이름 변경)
// function tryInputChangeWithFile(inputEl, fileOrFiles){
//   const files = onlyFiles(fileOrFiles);
//   if (!inputEl || !files.length) return false;
//   const dt = new DataTransfer();
//   for (const f of files) dt.items.add(f);
//   try { Object.defineProperty(inputEl, "files", { configurable:true, get:()=>dt.files }); } catch {}
//   inputEl.dispatchEvent(new Event("change", { bubbles:true }));
//   return true;
// }

// ✅ 올바른 버전: inputEl에만 주입
function tryInputChangeWithFile(inputEl, fileOrFiles) {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  if (!inputEl || !files.length) return false;
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  try {
    Object.defineProperty(inputEl, "files", {
      configurable: true,
      get: () => dt.files,
    });
  } catch {}
  // Element UI가 input 이벤트도 의존하는 경우 대비
  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  inputEl.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

// ---------- 레이블→컨트롤 찾기 ----------
function pickPreferredInScope(scopeEl, label) {
  if (!scopeEl) return null;
  const canonical = expandAliases(label)[0];

  // 1) 선호 셀렉터 우선
  const list = [];
  if (RULES?.preferredByLabel?.[canonical]) {
    list.push(...scopeEl.querySelectorAll(RULES.preferredByLabel[canonical]));
  }

  // 2) 범용 후보 모으되, file input은 맨 뒤로
  const all = [
    ...scopeEl.querySelectorAll(
      'input,textarea,select,[contenteditable="true"],.ql-editor,.ck-content,.ProseMirror,.public-DraftEditor-content,.simditor-body,div p'
    ),
  ];
  const nonFile = all.filter(
    (e) => !(e.tagName === "INPUT" && e.type === "file")
  );
  const fileOnly = all.filter(
    (e) => e.tagName === "INPUT" && e.type === "file"
  );
  list.push(...nonFile, ...fileOnly);

  return list[0] || null;
}

function findByLabelText(text) {
  const wanted = norm(text);

  // 1) 라벨 DOM
  const labels = [
    ...document.querySelectorAll(
      'label, .el-form-item__label, [role="label"], [aria-label]'
    ),
  ];
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

  const lab = matchLabel();
  if (lab) {
    const formItem =
      lab.closest(
        ".el-form-item,.ant-form-item,.form-item,.field,.form-group,form,section,article"
      ) ||
      lab.parentElement ||
      document;

    const preferred = pickPreferredInScope(formItem, wanted);
    if (preferred) return preferred;

    const hit = formItem.querySelector(
      'input,textarea,select,[contenteditable="true"],.ql-editor,.ck-content,.ProseMirror,.public-DraftEditor-content,.simditor-body,div p'
    );
    if (hit) return hit;
  }

  // 2) aria-label/placeholder 직접 매칭
  const aria = document.querySelector(
    `[aria-label="${CSS.escape(wanted)}"], [placeholder="${CSS.escape(
      wanted
    )}"]`
  );
  if (aria) return aria;

  // 3) form-item들의 라벨 포함 매칭 → 선호 컨트롤
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
  if (expandAliases(labelText)[0] === "난이도") {
    const scope = findFormItemByLabel(labelText) || document;
    const ok = await setElSelectByText(scope, value);
    return { label: labelText, found: !!scope, filled: ok, type: "el-select" };
  }

  // fillOne 초반: 배열인데 "언어" 라벨 스코프면 체크박스 그룹 경로
  if (Array.isArray(value) && expandAliases(labelText)[0] === "언어") {
    const scope = findFormItemByLabel(labelText) || document;
    const ok = await setCheckboxGroupByLabels(scope, value);
    return {
      label: labelText,
      found: !!scope,
      filled: ok,
      type: "checkbox-group",
    };
  }
  // 1) 먼저: 배열이면 태그 위젯 플로우로 처리 (라벨 form-item만 있어도 동작)
  if (Array.isArray(value)) {
    const scope =
      findFormItemByLabel(labelText) ||
      findByLabelText(labelText)?.closest?.(".el-form-item,.form-item") ||
      document;
    const ok = await fillTags_ElementUI(scope, value);
    return { label: labelText, found: !!scope, filled: ok, type: "tags" };
  }

  // 2) 그 외 타입은 기존대로 라벨→컨트롤 탐색
  const el = findByLabelText(labelText);
  if (!el) return { label: labelText, found: false, filled: false };

  // ✅ 파일 input에 걸렸지만 값이 파일표현이 아니면 → 같은 스코프의 리치에디터로 폴백
  if (
    el.tagName === "INPUT" &&
    el.type === "file" &&
    typeof value === "string" &&
    !/^(__PICK__|data:|text:)/.test(value)
  ) {
    const scope =
      el.closest(
        ".el-form-item,.ant-form-item,.form-item,.field,.form-group,form,section,article"
      ) || document;
    const rich = scope.querySelector(
      ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p"
    );
    if (rich) {
      const ok = setRichEditable(rich, value);
      return {
        label: labelText,
        found: true,
        filled: ok,
        type: "rich",
        note: "fallback from file",
      };
    }
    // 리치 못찾으면 기존 파일 로직으로 진행
  }

  // fillOne() 내부 파일 필드 분기 교체
  // 파일필드
  // ==== 파일 input 분기 (교체) ====
  if (el.tagName === "INPUT" && el.type === "file") {
    // 1) JSON 값 → File 만들기
    const f = await makeFileFromValue(labelText, value);

    // 사람 손으로 고르게 하는 모드일 때만 피커 열기
    if (f === "__PICK__") {
      el.click();
      return {
        label: labelText,
        found: true,
        filled: true,
        note: "opened picker",
      };
    }

    // 유효성 체크
    const valid = Array.isArray(f)
      ? f.some((x) => x instanceof File)
      : f instanceof File;
    if (!valid) {
      return {
        label: labelText,
        found: true,
        filled: false,
        note: "invalid file spec",
      };
    }

    // 2) 라벨 form-item 스코프 안의 숨은 file input만 정확히 집어오기
    const scope =
      el.closest(
        ".el-form-item,.ant-form-item,.form-item,.field,.form-group"
      ) || el.parentElement;

    // 이 페이지 실제 DOM에 맞춘 셀렉터: .el-upload.el-upload--text > input.el-upload__input
    const hiddenInput =
      scope?.querySelector(
        ".el-upload.el-upload--text > input.el-upload__input"
      ) ||
      scope?.querySelector("input.el-upload__input") ||
      el;

    // 3) 버튼형 업로더는 drop 미지원 → 곧바로 숨은 input에 주입 (클릭 금지)
    const ok = injectFilesToHiddenInput(hiddenInput, f);
    return {
      label: labelText,
      found: true,
      filled: ok,
      note: ok ? "input change (scoped exact input)" : "inject failed",
    };
  }

  // 기본 타입
  if (el.tagName === "INPUT") {
    if (el.type === "checkbox") {
      setCheckbox(el, value);
      return { label: labelText, found: true, filled: true, type: "checkbox" };
    }
    if (el.type === "radio") {
      setRadio(el, value);
      return { label: labelText, found: true, filled: true, type: "radio" };
    }
    setPlainValue(el, value, labelText); // ✅ label 전달
    return { label: labelText, found: true, filled: true, type: "input" };
  }
  if (el.tagName === "TEXTAREA") {
    setPlainValue(el, value, labelText); // ✅
    return { label: labelText, found: true, filled: true, type: "textarea" };
  }
  if (el.tagName === "SELECT") {
    setSelect(el, value);
    return { label: labelText, found: true, filled: true, type: "select" };
  }

  // 리치/커스텀 (Simditor 포함)
  const ok = setRichEditable(el, value);
  return { label: labelText, found: true, filled: ok, type: "rich" };
}

// ---------- 버튼 클릭 ----------
function clickSequence(target) {
  const seq = ["pointerdown", "mousedown", "mouseup", "click"];
  for (const t of seq)
    target.dispatchEvent(new MouseEvent(t, { bubbles: true }));
}

function findButtonByText(text, scope) {
  const wanted = norm(text);
  const root = scope || document;
  const candSel =
    'button, [role="button"], a.button, .el-button, .ant-btn, [type="submit"]';
  const cands = [...root.querySelectorAll(candSel)];
  // 정확 → 포함
  return (
    cands.find((b) => EQ(b.textContent, wanted)) ||
    cands.find((b) => HAS(b.textContent, wanted)) ||
    null
  );
}

async function clickByTexts(texts, scopeLabel) {
  let scope = null;
  if (scopeLabel) {
    const el = findByLabelText(scopeLabel);
    if (el)
      scope =
        el.closest("form, .el-form, .ant-form, section, article") ||
        el.parentElement;
  }
  for (const tx of texts) {
    const btn = findButtonByText(tx, scope) || findButtonByText(tx, document);
    if (btn) clickSequence(btn);
  }
}

// ---------- 옵션/도메인 ----------
const DOMAIN_RULES = {
  "<YOUR_DOMAIN>": {
    readySelectors: [
      ".el-form-item__content",
      ".simditor-body, .ck-content, .ql-editor",
    ],
    aliases: {
      번호: ["문제 아이디", "문제 번호", "번호", "_id"],
      제목: ["문제 제목", "제목", "title"],
      "문제 설명": ["문제 설명", "설명", "Description"],
      "입력 설명": ["입력 설명", "입력형식", "Input", "Input Description"],
      "출력 설명": ["출력 설명", "출력형식", "Output", "Output Description"],
      난이도: ["난이도", "Difficulty"],
      "보이기 설정": ["보이기 설정", "공개", "Visibility"],
      "소스코드 공개": ["소스코드 공개", "코드 공개", "Source Visible"],
      Tag: ["Tag", "태그", "Tags"],
      언어: ["언어", "Languages", "Language"],
      "입력 예시": ["입력 예시", "예시 입력", "Sample Input"],
      "출력 예시": ["출력 예시", "예시 출력", "Sample Output"],
      힌트: ["힌트", "Tip", "Hint"],
      "코드 템플릿": ["코드 템플릿", "템플릿", "Code Template"],
      "스페셜 저지": ["스페셜 저지", "Special Judge", "SPJ"],
      유형: ["유형", "Type", "모드"],
      "입/출력 모드": ["입/출력 모드", "IO 모드", "I/O Mode"],
      "테스트 케이스": [
        "테스트 케이스",
        "케이스 업로드",
        "Testcases",
        "Upload Cases",
      ],
      소스코드: ["소스코드", "Source Code"],
    },

    preferredByLabel: {
      "문제 설명":
        ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p",
      "입력 설명":
        ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p",
      "출력 설명":
        ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p",
      힌트: ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p",
      "테스트 케이스": "input.el-upload__input",
    },
    // 필요하면 dropzone: ".el-upload-dragger"
  },
};
const HOST = location.host.replace(/^www\./, "");
const RULES = DOMAIN_RULES[HOST] || null;

async function waitReady(selectors = [], timeout = 10000) {
  if (!selectors?.length) return;
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (selectors.some((s) => document.querySelector(s))) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

function expandAliases(label) {
  const from = [label];
  const tables = [USER_OPTS?.aliases, RULES?.aliases].filter(Boolean);
  for (const table of tables) {
    for (const [canonical, alist] of Object.entries(table)) {
      if ([canonical, ...(alist || [])].some((v) => v === label))
        return [canonical, ...alist];
    }
  }
  return from;
}

// ---------- 옵션 로딩 ----------
let USER_OPTS = null;
function loadUserOpts() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get("form_filler_opts", (v) => {
        let obj = {};
        try {
          obj = v?.form_filler_opts ? JSON.parse(v.form_filler_opts) : {};
        } catch {}
        USER_OPTS = obj || {};
        resolve(USER_OPTS);
      });
    } catch {
      USER_OPTS = {};
      resolve(USER_OPTS);
    }
  });
}

// ---------- 메시지 핸들러 ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "FILL_BY_LABEL") {
      await loadUserOpts();

      const readySel = [
        ...(RULES?.readySelectors || []),
        ...(USER_OPTS?.readySelectors || []),
        ".simditor-body, .ck-content, .ql-editor",
      ];
      await waitReady(readySel, 15000);

      const raw = msg.data || {};
      const pairs = Array.isArray(raw)
        ? raw
        : Object.entries(raw).map(([label, value]) => ({ label, value }));

      // 메시지 핸들러에서 pairs 처리 전에 별도 키로 꺼내 처리하거나,
      // fillOne 분기 대신 최상단에서 한 번 처리:
      const samples = raw["샘플"];
      if (Array.isArray(samples) && samples.length) await fillSamples(samples);

      // 액션/필드 분리: action:저장 → 버튼 클릭
      const fieldPairs = [];
      const actions = [];
      for (const { label, value } of pairs) {
        if (label?.startsWith?.("action:") || value === "__CLICK__") {
          const text = label.replace(/^action:/, "") || value;
          actions.push(text);
        } else {
          fieldPairs.push({ label, value });
        }
      }

      const results = [];
      for (const { label, value } of fieldPairs) {
        results.push(await fillOne(label, value));
      }

      if (actions.length) await clickByTexts(actions);

      console.table(results);
      sendResponse({ ok: true, results, actionsClicked: actions });
    }
    if (msg?.type === "CLICK_BY_TEXT") {
      await loadUserOpts();
      const texts = Array.isArray(msg.texts) ? msg.texts : [msg.texts];
      await clickByTexts(texts, msg.scopeLabel);
      sendResponse({ ok: true, clicked: texts });
    }
  })();
  return true; // 비동기 응답
});

function key(el, type, key, code = key) {
  el.dispatchEvent(
    new KeyboardEvent(type, {
      key,
      code,
      bubbles: true,
      cancelable: true,
    })
  );
}

async function waitForInScope(scope, selectors = [], timeout = 5000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    for (const sel of selectors) {
      const hit = (scope || document).querySelector(sel);
      if (hit) return hit;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

async function clearExistingTags(scope) {
  // 칩의 X 아이콘 흔한 패턴들 (Element, Ant, 일반 칩)
  const closeSel = [
    ".el-tag .el-tag__close",
    ".el-tag .el-icon-close",
    ".ant-tag .ant-tag-close-icon",
    ".ant-tag .anticon-close",
    ".chip .close",
    ".tag .remove",
    '[aria-label="remove tag"]',
  ];
  let removed = 0;
  while (true) {
    const x = scope.querySelector(closeSel.join(","));
    if (!x) break;
    x.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    removed++;
    await new Promise((r) => setTimeout(r, 20));
  }
  return removed;
}

function findTagActivator(scope) {
  // 스샷 기준: .button-new-tag
  const byClass = scope.querySelector(".button-new-tag");
  if (byClass) return byClass;
  // 예비: "+ New Tag" 같은 텍스트 버튼
  const btns = [...scope.querySelectorAll("button,[role='button'],.el-button")];
  return (
    btns.find((b) =>
      /\+\s*new\s*tag|태그\s*추가|add/i.test(b.textContent || "")
    ) || null
  );
}
async function waitIn(scope, sels = [], ms = 1200) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    for (const s of sels) {
      const el = (scope || document).querySelector(s);
      if (el) return el;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  return null;
}

async function fillTags_ElementUI(scope, tags) {
  const content = scope.querySelector(".el-form-item__content") || scope;
  for (const t of tags) {
    const act = findTagActivator(content);
    if (act) clickSeq(act); // ① 버튼 눌러 입력창 열기
    const input = await waitIn(
      content,
      [".el-input__inner", "input[type='text']", "input[role='combobox']"],
      2000
    );
    if (!input) return false;
    // ② 값 입력
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    setter ? setter.call(input, t) : (input.value = t);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    // ③ Enter로 확정
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    input.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Enter", bubbles: true })
    );
    input.blur?.();
    await new Promise((r) => setTimeout(r, 80)); // 칩 생성 대기
  }
  return true;
}

function findTagInput(scope) {
  // 열리면 등장하는 입력창 흔한 패턴들
  const sels = [
    'input[type="text"]',
    'input[role="combobox"]',
    'input[role="textbox"]',
    "input",
    "textarea",
    '[contenteditable="true"]',
  ];
  for (const s of sels) {
    const el = scope.querySelector(s);
    if (el && getComputedStyle(el).display !== "none" && !el.disabled)
      return el;
  }
  return null;
}

async function fillTagsByScope(scope, tags, { mode = "replace" } = {}) {
  // mode: "replace" → 기존 칩 제거 후 추가 / "append" → 기존 유지 후 뒤에 추가
  if (mode === "replace") await clearExistingTags(scope);

  for (const t of tags) {
    // 1) 활성화 버튼이 필요하면 눌러서 입력칸 열기
    let input = findTagInput(scope);
    if (!input) {
      const activator = findTagActivator(scope);
      if (activator)
        activator.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      input = await waitForInScope(
        scope,
        [
          'input[type="text"]',
          'input[role="combobox"]',
          "input",
          '[contenteditable="true"]',
        ],
        2000
      );
    }
    if (!input) return false;

    // 2) 값 입력
    if (input.getAttribute("contenteditable") === "true") {
      input.focus();
      input.innerHTML = t; // 단순 태그 텍스트
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      const proto =
        input.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter ? setter.call(input, t) : (input.value = t);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      key(input, "keydown", "Enter");
      key(input, "keypress", "Enter");
      key(input, "keyup", "Enter");
    }

    // 3) Enter로 확정 (일부 UI는 click으로 확정하므로 Enter+블러 둘 다)
    key(input, "keydown", "Enter");
    key(input, "keyup", "Enter");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    input.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Enter", bubbles: true })
    );
    input.blur?.();

    // 4) 다음 태그를 위해 잠깐 대기(칩 생성/새 버튼 생성 대기)
    await new Promise((r) => setTimeout(r, 60));
  }
  return true;
}

function findFormItemByLabel(text) {
  const wanted = norm(text);
  const items = [
    ...document.querySelectorAll(".el-form-item,.ant-form-item,.form-item"),
  ];
  for (const it of items) {
    const lab = it.querySelector("label,.el-form-item__label");
    if (lab && (EQ(lab.textContent, wanted) || HAS(lab.textContent, wanted)))
      return it;
  }
  return null;
}

function clickSeq(el) {
  ["pointerdown", "mousedown", "mouseup", "click"].forEach((t) =>
    el.dispatchEvent(new MouseEvent(t, { bubbles: true }))
  );
}

// ZIP 업로드
// ----- ZIP STORE builder (add this once) -----
// ----- ZIP STORE builder (CRC32 포함) -----
function __crc32Table() {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
}
const __CRC_T = __crc32Table();
function __crc32(u8) {
  let c = 0 ^ -1;
  for (let i = 0; i < u8.length; i++)
    c = (__CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ -1) >>> 0;
}
const __U8 = (s) => new TextEncoder().encode(String(s));
const __LE = (n, b) => {
  const a = new Uint8Array(b);
  for (let i = 0; i < b; i++) a[i] = (n >>> (8 * i)) & 0xff;
  return a;
};
const __join = (arrs) => {
  const n = arrs.reduce((s, a) => s + a.length, 0);
  const o = new Uint8Array(n);
  let p = 0;
  for (const a of arrs) {
    o.set(a, p);
    p += a.length;
  }
  return o;
};

function buildZipSTORE(entries, filename = "testcases.zip") {
  const files = entries.map(([name, content]) => {
    const nameU8 = __U8(name),
      dataU8 = __U8(content),
      crc = __crc32(dataU8);
    const local = __join([
      __U8("PK\x03\x04"),
      __LE(20, 2),
      __LE(0, 2),
      __LE(0, 2),
      __LE(0, 2),
      __LE(0, 2),
      __LE(crc, 4),
      __LE(dataU8.length, 4),
      __LE(dataU8.length, 4),
      __LE(nameU8.length, 2),
      __LE(0, 2),
      nameU8,
      dataU8,
    ]);
    return { nameU8, dataU8, crc, local, offset: 0 };
  });
  let off = 0;
  for (const f of files) {
    f.offset = off;
    off += f.local.length;
  }
  const centrals = files.map((f) =>
    __join([
      __U8("PK\x01\x02"),
      __LE(20, 2),
      __LE(20, 2),
      __LE(0, 2),
      __LE(0, 2),
      __LE(0, 2),
      __LE(0, 2),
      __LE(f.crc, 4),
      __LE(f.dataU8.length, 4),
      __LE(f.dataU8.length, 4),
      __LE(f.nameU8.length, 2),
      __LE(0, 2),
      __LE(0, 2),
      __LE(0, 2),
      __LE(0, 2),
      __LE(f.offset, 4),
      f.nameU8,
    ])
  );
  const cd = __join(centrals);
  const end = __join([
    __U8("PK\x05\x06"),
    __LE(0, 2),
    __LE(0, 2),
    __LE(files.length, 2),
    __LE(files.length, 2),
    __LE(cd.length, 4),
    __LE(off, 4),
    __LE(0, 2),
  ]);
  const blob = new Blob([...files.map((f) => f.local), cd, end], {
    type: "application/zip",
  });
  return new File([blob], filename, { type: "application/zip" });
}

function concatU8(arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of arrs) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

function getDropTargetsIn(scope) {
  const root = scope || document;
  return root.querySelectorAll(
    ".el-upload__inner, .el-upload-dragger, .el-upload"
  );
}

async function setElSelectByText(scope, text) {
  const root =
    scope.querySelector(".el-select") || scope.closest(".el-select") || scope;
  const input = root.querySelector(".el-input__inner");
  if (!input) return false;

  // 드롭다운 열기
  clickSeq(input);
  // 드롭다운 아이템 찾기
  const list = document.querySelector(".el-select-dropdown");
  if (!list) return false;
  const item = [
    ...list.querySelectorAll(".el-select-dropdown__item span"),
  ].find((sp) => EQ(sp.textContent, text) || HAS(sp.textContent, text));
  if (!item) return false;

  clickSeq(item);
  dispatchAll(input);
  return true;
}

async function setCheckboxGroupByLabels(scope, values) {
  const setWanted = new Set(values.map((v) => norm(v)));
  const boxes = scope.querySelectorAll(".el-checkbox");
  if (!boxes.length) return false;
  for (const box of boxes) {
    const label = norm(box.textContent || "");
    const input = box.querySelector('input[type="checkbox"]');
    const shouldCheck = setWanted.has(label);
    const isChecked = box.classList.contains("is-checked") || input?.checked;
    if (shouldCheck !== isChecked) {
      clickSeq(box); // 라벨 전체 클릭이 Element UI에 더 안전
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  return true;
}

async function fillSamples(samples) {
  // 1개는 기본 카드에, 2개 이상은 버튼 눌러가며 생성
  const addBtn = document.querySelector(".add-samples,.add-sample-btn button");
  for (let i = 0; i < samples.length; i++) {
    if (i > 0 && addBtn) {
      clickSeq(addBtn);
      await new Promise((r) => setTimeout(r, 80));
    }
    const card = [...document.querySelectorAll(".accordion .body")][i];
    if (!card) break;
    const inBox =
      card.querySelector('textarea[placeholder*="입력"]') ||
      card.querySelector("textarea");
    const outBox = [...card.querySelectorAll("textarea")].find(
      (t) => t !== inBox
    );
    if (inBox) setPlainValue(inBox, samples[i]["입력 예시"] ?? "");
    if (outBox) setPlainValue(outBox, samples[i]["출력 예시"] ?? "");
  }
  return true;
}

async function fillScoreTable(rows) {
  const table = document.querySelector(".el-table");
  const addRowBtn = document.querySelector(".add-row,.el-button.add-row"); // 실제 버튼 셀렉터 필요
  if (!table || !addRowBtn) return false;

  for (const r of rows) {
    clickSeq(addRowBtn);
    await new Promise((res) => setTimeout(res, 50));
    // 새 행의 3개 셀 내부 입력창에 값 주입 (실제 셀렉터에 맞게 조정)
    const lastRow = table.querySelector("tbody tr:last-child");
    const ins = lastRow?.querySelectorAll("input,textarea");
    if (ins?.length >= 3) {
      setPlainValue(ins[0], r["입력"] ?? "");
      setPlainValue(ins[1], r["출력"] ?? "");
      setPlainValue(ins[2], String(r["점수"] ?? ""));
    }
  }
  return true;
}

function toFieldString(v, labelHint) {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);

  // 1) 흔한 키 우선(match by label + common keys)
  const preferredKeysByLabel = {
    번호: ["번호", "_id", "id", "value", "text", "label"],
    제목: ["제목", "title", "name", "text", "label", "value"],
  };
  const commons = ["value", "text", "label", "id", "_id", "name"];
  const pickOrder = [...(preferredKeysByLabel[labelHint] || []), ...commons];

  for (const k of pickOrder) {
    if (k in v && typeof v[k] !== "object") return String(v[k]);
  }
  // 2) 그래도 못 고르면 JSON 문자열화(최후 수단)
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
