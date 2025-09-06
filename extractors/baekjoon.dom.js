// extractors/baekjoon.dom.js
// BOJ 문제 페이지에서 제목/본문/입력/출력/힌트/샘플 + 이미지 URL 추출
(() => {
  const isBoj = /acmicpc\.net\/problem\/|boj\.kr\//.test(location.href);

  // --- utils ---
  const norm = (s) =>
    (s ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\r?\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const getText = (el) => (el ? norm(el.innerText || el.textContent || "") : "");
  const Q  = (sel, root = document) => root.querySelector(sel);
  const QA = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ✅ 절대 URL 변환기 (문제의 absUrl 누락/이름 불일치 방지)
  function resolveAbsUrl(u) {
    try { return new URL(u, document.baseURI).href; } catch { return u || ""; }
  }

  // --- fields ---
  function getTitle() {
    const t = Q("#problem_title");
    if (t) return getText(t);
    const h = Q("h1, h2");                // (폴백: 확실하지 않음)
    return getText(h);
  }
  const getProblemText = () => getText(Q("#problem_description"));
  const getInputText   = () => getText(Q("#problem_input"));
  const getOutputText  = () => getText(Q("#problem_output"));
  function getHintText() {
    const el = Q("#problem_hint");
    if (!el) return "";
    return getText(el); // iframe만 있으면 빈 문자열일 수 있음(확실하지 않음)
  }

  function parseIndexFromId(id, def = null) {
    if (!id) return def;
    const m = String(id).match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : def;
  }

  function collectSamples() {
    const inputs = new Map();
    const outputs = new Map();

    QA("section[id^='sampleinput']").forEach((sec) => {
      const pre = Q("pre.sampledata", sec) || Q("pre", sec) || Q("code", sec);
      if (!pre) return;
      const idx = parseIndexFromId(sec.id, inputs.size + 1);
      inputs.set(idx, norm(pre.innerText || pre.textContent || ""));
    });

    QA("section[id^='sampleoutput']").forEach((sec) => {
      const pre = Q("pre.sampledata", sec) || Q("pre", sec) || Q("code", sec);
      if (!pre) return;
      const idx = parseIndexFromId(sec.id, outputs.size + 1);
      outputs.set(idx, norm(pre.innerText || pre.textContent || ""));
    });

    const allIdx = Array.from(new Set([...inputs.keys(), ...outputs.keys()])).sort((a,b)=>a-b);
    const arr = [];
    for (const i of allIdx) {
      const vin  = inputs.get(i)  || "";
      const vout = outputs.get(i) || "";
      if (vin || vout) arr.push({ "입력 예시": vin, "출력 예시": vout });
    }
    return arr;
  }

  // ✅ 이미지 수집 (src / data-src / srcset 대응)
  function collectImages() {
    const scopes = [
      "#problem_description",
      "#problem_input",
      "#problem_output",
      "#problem_hint",
      "section[id^='sampleinput']",
      "section[id^='sampleoutput']",
    ];
    const list = [];

    const pickFromSrcset = (img) => {
      const ss = img.getAttribute("srcset");
      if (!ss) return "";
      // 가장 마지막(보통 가장 큰 해상도) 선택 – 보편적이지만 100% 보장 아님(확실하지 않음)
      const parts = ss.split(",").map(s => s.trim()).filter(Boolean);
      const last  = parts[parts.length - 1] || "";
      return last.split(/\s+/)[0] || "";
    };

    for (const sel of scopes) {
      QA(`${sel} img`).forEach((img, idx) => {
        let src = img.getAttribute("src")
               || img.getAttribute("data-src")
               || pickFromSrcset(img);
        if (!src) return;
        list.push({
          src: resolveAbsUrl(src),
          alt: img.getAttribute("alt") || "",
          section: sel.replace(/^#/, ""),
          index: idx
        });
      });
    }
    // 중복 제거
    const seen = new Set();
    const out = [];
    for (const it of list) {
      if (seen.has(it.src)) continue;
      seen.add(it.src);
      out.push(it);
    }
    return out;
  }

  function extractBojMinimalJson() {
    const out = {};
    const title = getTitle();         if (title) out["제목"] = title;
    const desc = getProblemText();    if (desc)  out["문제 설명"] = desc;
    const inD  = getInputText();      if (inD)   out["입력 설명"] = inD;
    const outD = getOutputText();     if (outD)  out["출력 설명"] = outD;
    const hint = getHintText();       if (hint)  out["힌트"] = hint;

    const samples = collectSamples(); if (samples.length) out["샘플"] = samples;

    const images  = collectImages();
    if (images.length) {
      out["이미지"] = images.map(x => x.src);  // 실제 사용에 충분
      out["_이미지메타"] = images;              // (선택) 개발자 확인용
    }
    return out;
  }

  // --- messaging ---
  chrome.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
    try {
      if (msg?.type === "EXTRACT_BOJ_JSON") {
        if (!isBoj) return sendResponse({ ok: false, reason: "not_boj_page" });
        return sendResponse({ ok: true, data: extractBojMinimalJson(), url: location.href });
      }
      if (msg?.type === "EXTRACT_BOJ_IMAGES") {
        if (!isBoj) return sendResponse({ ok: false, reason: "not_boj_page" });
        return sendResponse({ ok: true, images: collectImages(), url: location.href });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  });

  // 콘솔 디버깅용
  window.__BOJ_EXTRACT__ = extractBojMinimalJson;
  window.__BOJ_EXTRACT_IMAGES__ = collectImages;
})();
