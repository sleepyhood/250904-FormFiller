/* =========================
 * Simditor 이미지 붙여넣기 지원
 * 요구: 마크다운 모드에서 <p><img src="..."><br></p> 형태로 삽입
 * 사용: await appendImagesToSimditorByLabel("문제 설명", ["https://..."]);
 * JSON: { "이미지":[...]} 또는 { "문제 설명_이미지":[...] }도 지원 (메시지 핸들러 하단 참조)
 * ========================= */

// 보조: 보임 여부
function __isVisible(el){
  if (!el) return false;
  const st = getComputedStyle(el);
  return el.offsetParent !== null && st.display !== "none" && st.visibility !== "hidden";
}

// 보조: Simditor 컨테이너 획득(라벨 스코프 내)
function __getSimditorWrapper(scope){
  return (
    scope.querySelector(".simditor-wrapper") ||
    scope.querySelector(".simditor") ||
    scope
  );
}

// 1) 마크다운 모드 보장
async function ensureSimditorMarkdownMode(scope, want = true, timeout = 2500){
  const wrap = __getSimditorWrapper(scope);
  const btn  = wrap.querySelector(".toolbar-item.toolbar-item-markdown");
  const ta   = wrap.querySelector(".markdown-editor textarea");

  const isOn = () => __isVisible(ta);
  if (isOn() === want) return true;

  if (!btn) return false;
  // 토글 클릭
  ["pointerdown","mousedown","mouseup","click"].forEach(t =>
    btn.dispatchEvent(new MouseEvent(t, { bubbles:true }))
  );

  // 전환 대기
  const t0 = performance.now();
  while (performance.now() - t0 < timeout){
    if (isOn() === want) return true;
    await new Promise(r => setTimeout(r, 60));
  }
  return isOn() === want;
}

// 2) 이미지 블록 HTML 생성
function buildImgBlock(urls){
  const clean = (u) => {
    try { return new URL(u, document.baseURI).href; } catch { return String(u || ""); }
  };
  return (urls || [])
    .map(u => u && `<p><img src="${clean(u)}"><br></p>`)
    .filter(Boolean)
    .join("");
}

// 3) Simditor에 HTML 주입 (마크다운 textarea + simditor-body 동기화)
async function setSimditorHTML(scope, html, {append=true} = {}){
  const wrap = __getSimditorWrapper(scope);
  const body = wrap.querySelector(".simditor-body");
  const mdTa = wrap.querySelector(".markdown-editor textarea");

  // 마크다운 textarea에 삽입 (요구사항: 마크다운 모드에서 적용)
  if (mdTa){
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set;
    const val = append && mdTa.value ? mdTa.value.replace(/\s*$/,"") + "\n" + html : html;
    setter ? setter.call(mdTa, val) : (mdTa.value = val);
    dispatchAll(mdTa);
  }

  // 시각적 동기: body에도 반영 (플러그인에 따라 즉시 반영 안될 수 있어도 무해)
  if (body){
    if (append) body.insertAdjacentHTML("beforeend", html);
    else body.innerHTML = html;
    dispatchAll(body);
  }
  return true;
}

// 4) 라벨 기준으로 이미지 붙이기(핵심 API)
async function appendImagesToSimditorByLabel(labelText, urls, {append=true} = {}){
  if (!Array.isArray(urls) || !urls.length) return false;
  const scope = findFormItemByLabel(labelText) || document;
  if (!scope) return false;

  // 마크다운 모드 보장
  await ensureSimditorMarkdownMode(scope, true);

  // 이미지 블록 생성 & 삽입
  const block = buildImgBlock(urls);
  if (!block) return false;
  return await setSimditorHTML(scope, block, {append});
}

/* -----------------------
 * 메시지 핸들러 연결부 보강
 * - JSON에 "문제 설명_이미지" 또는 "이미지" 배열이 있으면,
 *   모든 필드 채운 뒤 마지막에 이미지 블록을 append
 * ----------------------- */

let __LAST_RAW_JSON__ = null; // 원본 JSON 보관


// content.cleaned.js
// 목적: 불필요한 업로드/드래그앤드롭 로직 제거, "번호" 안정 주입, 배열→태그 한정, 중복/미사용 함수 정리
// 근거: 기존 content.js를 기반으로 최소 변경 정리(주요 출처 위치) :contentReference[oaicite:0]{index=0}

// ---------- 유틸 ----------
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const EQ = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();
const HAS = (a, b) => norm(a).toLowerCase().includes(norm(b).toLowerCase());

function dispatchAll(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setPlainValue(el, val, labelHint) {
  if (el.type === "file") return true;
  const proto =
    el.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

  const safe = toFieldString(val, labelHint); // 객체 방어
  setter ? setter.call(el, safe) : (el.value = safe);

  // "번호"는 이벤트 최소화 + 사후 보정 가드
  if (labelHint === "번호") {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    queueMicrotask(() => {
      if (el.value === "[object Object]") {
        const setter2 = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        setter2 ? setter2.call(el, safe) : (el.value = safe);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    return true;
  }

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

// ---------- ZIP 생성 (로컬 다운로드용) ----------
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

function downloadBlobFile(fileOrBlob, filename = "testcases.zip") {
  try {
    const url = URL.createObjectURL(fileOrBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000); // 확실하지 않음: 안전 지연
    return true;
  } catch {
    return false;
  }
}

async function downloadLocalZipFromSpec(spec) {
  const file = await makeZipFromSpec(spec);
  if (!file) return false;
  const name = spec?.filename || file.name || "testcases.zip";
  return downloadBlobFile(file, name);
}

// ---------- 레이블→컨트롤 찾기 ----------
function pickPreferredInScope(scopeEl, label) {
  if (!scopeEl) return null;
  const canonical = expandAliases(label)[0];
  const content =
    scopeEl.querySelector?.(".el-form-item__content") || scopeEl;

  // 1) 선호 셀렉터 우선
  const list = [];
  if (RULES?.preferredByLabel?.[canonical]) {
    list.push(...content.querySelectorAll(RULES.preferredByLabel[canonical]));
  }

  // 2) 범용 후보(파일 input은 뒤로)
  const all = [
    ...content.querySelectorAll(
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

  // 2) aria-label/placeholder
  const aria = document.querySelector(
    `[aria-label="${CSS.escape(wanted)}"], [placeholder="${CSS.escape(
      wanted
    )}"]`
  );
  if (aria) return aria;

  // 3) form-item 라벨 포함 매칭
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
  const canonical = expandAliases(labelText)[0];
  const safe = toFieldString(value, canonical);

  // 테스트 케이스: 업로드 금지(별도 다운로드 처리)
  if (canonical === "테스트 케이스") {
    return {
      label: labelText,
      found: true,
      filled: false,
      type: "download-only",
      note: "upload skipped by policy",
    };
  }

  // 난이도: Element-UI select
  if (canonical === "난이도") {
    const scope = findFormItemByLabel(labelText) || document;
    const ok = await setElSelectByText(scope, value);
    return { label: labelText, found: !!scope, filled: ok, type: "el-select" };
  }

  // 언어: 체크박스 그룹
  if (Array.isArray(value) && canonical === "언어") {
    const scope = findFormItemByLabel(labelText) || document;
    const ok = await setCheckboxGroupByLabels(scope, value);
    return {
      label: labelText,
      found: !!scope,
      filled: ok,
      type: "checkbox-group",
    };
  }

  // Tag: 칩 위젯
  if (Array.isArray(value) && canonical === "Tag") {
    const scope =
      findFormItemByLabel(labelText) ||
      findByLabelText(labelText)?.closest?.(".el-form-item,.form-item") ||
      document;
    const ok = await fillTags_ElementUI(scope, value);
    return { label: labelText, found: !!scope, filled: ok, type: "tags" };
  }

  // 기타 배열 필드: 안전하게 무시
  if (Array.isArray(value)) {
    return {
      label: labelText,
      found: true,
      filled: false,
      type: "skip",
      note: "array field ignored",
    };
  }

  // 일반 컨트롤 탐색
  let el = findByLabelText(labelText);
  if (!el) return { label: labelText, found: false, filled: false };

  // 번호: 같은 form-item 안의 진짜 텍스트 인풋으로 재보정
  if (canonical === "번호") {
    const scope =
      el.closest(".el-form-item,.ant-form-item,.form-item,.field,.form-group") ||
      document;
    const txt = scope.querySelector("input[type='text'], input.el-input__inner");
    if (txt) el = txt;
  }

  // 파일 input 분기 제거(업로드 금지 정책)

  // 기본 타입
  if (el.tagName === "INPUT") {
    if (el.type === "checkbox") {
      setCheckbox(el, safe);
      return { label: labelText, found: true, filled: true, type: "checkbox" };
    }
    if (el.type === "radio") {
      setRadio(el, safe);
      return { label: labelText, found: true, filled: true, type: "radio" };
    }
    setPlainValue(el, safe, canonical);
    return { label: labelText, found: true, filled: true, type: "input" };
  }
  if (el.tagName === "TEXTAREA") {
    setPlainValue(el, safe, canonical);
    return { label: labelText, found: true, filled: true, type: "textarea" };
  }
  if (el.tagName === "SELECT") {
    setSelect(el, safe);
    return { label: labelText, found: true, filled: true, type: "select" };
  }

  // 리치/커스텀 (Simditor 등)
  const ok = setRichEditable(el, safe);
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
      번호: "input[type='text']",
      "문제 설명":
        ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p",
      "입력 설명":
        ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p",
      "출력 설명":
        ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p",
      힌트:
        ".simditor-body, .ck-content, .ql-editor, [contenteditable='true'], .public-DraftEditor-content, .ProseMirror, div p",
      "테스트 케이스": "input.el-upload__input", // (참고용, 실제 업로드는 하지 않음)
    },
  },
};

const HOST = location.host.replace(/^www\./, "");
const RULES =
  DOMAIN_RULES[HOST] ||
  DOMAIN_RULES["<YOUR_DOMAIN>"] ||
  Object.values(DOMAIN_RULES)[0] ||
  null;

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
      __LAST_RAW_JSON__ = raw; // ← 보관

      // 번호 1차 문자열화(상류 가드)
      if (raw["번호"] != null) {
        raw["번호"] = toFieldString(raw["번호"], "번호");
      }

      const pairs = Array.isArray(raw)
        ? raw
        : Object.entries(raw).map(([label, value]) => ({ label, value }));

      // 샘플
      const samples = raw["샘플"];
      if (Array.isArray(samples) && samples.length) await fillSamples(samples);

      // 테스트 케이스: 즉시 로컬 다운로드
      if (raw["테스트 케이스"]) {
        await downloadLocalZipFromSpec(raw["테스트 케이스"]);
      }

      // 액션/필드 분리 + 샘플/테스트케이스 제외
      const fieldPairs = [];
      const actions = [];
      for (const { label, value } of pairs) {
        const canon = expandAliases(label)[0];
        if (label?.startsWith?.("action:") || value === "__CLICK__") {
          const text = label.replace(/^action:/, "") || value;
          actions.push(text);
          continue;
        }
        if (canon === "테스트 케이스" || canon === "샘플") continue;
        fieldPairs.push({ label, value });
      }

      // 나머지 필드 주입
      const results = [];
      for (const { label, value } of fieldPairs) {
        results.push(await fillOne(label, value));
      }

      if (actions.length) await clickByTexts(actions);

   // 🔸 신규: 이미지 배열이 있으면 마지막에 문제 설명에 append
      const imgList = Array.isArray(raw["문제 설명_이미지"]) && raw["문제 설명_이미지"].length
        ? raw["문제 설명_이미지"]
        : (Array.isArray(raw["이미지"]) ? raw["이미지"] : null);

      if (imgList && imgList.length){
        await appendImagesToSimditorByLabel("문제 설명", imgList, {append:true});
      }

      console.table(results);
      sendResponse({
        ok: true,
        results,
        actionsClicked: actions,
        downloadedZip: !!raw["테스트 케이스"],
      });
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

// ---------- 보조 ----------
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

function findTagActivator(scope) {
  const byClass = scope.querySelector(".button-new-tag");
  if (byClass) return byClass;
  const btns = [...scope.querySelectorAll("button,[role='button'],.el-button")];
  return (
    btns.find((b) =>
      /\+\s*new\s*tag|태그\s*추가|add/i.test(b.textContent || "")
    ) || null
  );
}

async function fillTags_ElementUI(scope, tags) {
  const content = scope.querySelector(".el-form-item__content") || scope;
  for (let t of tags) {
    if (typeof t !== "string") t = String(t?.label ?? t?.text ?? t?.value ?? t);
    const act = findTagActivator(content);
    if (act) clickSeq(act);
    const input = await waitIn(
      content,
      [".el-input__inner", "input[type='text']", "input[role='combobox']"],
      2000
    );
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    setter ? setter.call(input, t) : (input.value = t);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    input.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Enter", bubbles: true })
    );
    input.blur?.();
    await new Promise((r) => setTimeout(r, 80));
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

function toFieldString(v, labelHint) {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);

  // 흔한 키 우선(match by label + common keys)
  const preferredKeysByLabel = {
    번호: ["번호", "_id", "id", "value", "text", "label"],
    제목: ["제목", "title", "name", "text", "label", "value"],
  };
  const commons = ["value", "text", "label", "id", "_id", "name"];
  const pickOrder = [...(preferredKeysByLabel[labelHint] || []), ...commons];

  for (const k of pickOrder) {
    if (k in v && typeof v[k] !== "object") return String(v[k]);
  }
  // 최후 수단
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

async function fillSamples(samples) {
  // 1개는 기본 카드에, 2개 이상은 버튼 눌러가며 생성
  const addBtn = document.querySelector('.add-samples,.add-sample-btn button');
  for (let i = 0; i < samples.length; i++) {
    if (i > 0 && addBtn) { clickSeq(addBtn); await new Promise(r=>setTimeout(r,80)); }
    const card = [...document.querySelectorAll('.accordion .body')][i];
    if (!card) break;
    const inBox = card.querySelector('textarea[placeholder*="입력"]') || card.querySelector('textarea');
    const outBox = [...card.querySelectorAll('textarea')].find(t => t !== inBox);
    if (inBox) setPlainValue(inBox, samples[i]["입력 예시"] ?? "");
    if (outBox) setPlainValue(outBox, samples[i]["출력 예시"] ?? "");
  }
  return true;
}

async function setElSelectByText(scope, text) { 
  const root = scope.querySelector(".el-select") || scope.closest(".el-select") || scope; const input = root.querySelector(".el-input__inner"); if (!input) return false; 
  // 드롭다운 열기 clickSeq(input); 
  // 드롭다운 아이템 찾기 
  const list = document.querySelector(".el-select-dropdown"); if (!list) return false; const item = [ ...list.querySelectorAll(".el-select-dropdown__item span"), ].find((sp) => EQ(sp.textContent, text) || HAS(sp.textContent, text)); if (!item) return false; clickSeq(item); dispatchAll(input); return true; }


  async function setCheckboxGroupByLabels(scope, values) { const setWanted = new Set(values.map((v) => norm(v))); const boxes = scope.querySelectorAll(".el-checkbox"); if (!boxes.length) return false; for (const box of boxes) { const label = norm(box.textContent || ""); const input = box.querySelector('input[type="checkbox"]'); const shouldCheck = setWanted.has(label); const isChecked = box.classList.contains("is-checked") || input?.checked; if (shouldCheck !== isChecked) { 
    clickSeq(box); // 라벨 전체 클릭이 Element UI에 더 안전 
    await new Promise((r) => setTimeout(r, 20)); } } return true; }