// popup.extract.js
// 버튼: (1) 현재 탭에서 추출 → 복사 (2) 최근 BOJ 추출을 현재 탭에 채우기

const STORAGE_KEYS = {
  LAST_BOJ_JSON: "last_boj_json"
};

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function extractAndCopyFromCurrentTab() {
  const tab = await getActiveTab();
  if (!tab?.id) return alert("활성 탭을 알 수 없습니다.");
  const res = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_BOJ_JSON" }).catch(() => null);
  if (!res?.ok) return alert("추출 실패: " + (res?.reason || res?.error || "알 수 없습니다"));
  const json = JSON.stringify(res.data, null, 2);
  await navigator.clipboard.writeText(json);
  // 백업 저장
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_BOJ_JSON]: res.data });
  alert("추출 완료! JSON이 클립보드에 복사되었습니다.");
}

async function fillCurrentFormWithLastBoj() {
  // 1) 저장본 로드
  const got = await chrome.storage.local.get(STORAGE_KEYS.LAST_BOJ_JSON);
  const extracted = got[STORAGE_KEYS.LAST_BOJ_JSON];
  if (!extracted) return alert("저장된 BOJ 추출 데이터가 없습니다.");

  // 2) 네가 쓰는 스키마로 얕게 매핑(없는 키는 생략)
  //    번호/시간/메모리/언어 등은 추출하지 않음(요청사항)
  const payload = {};
  if (extracted["제목"]) payload["제목"] = extracted["제목"];
  if (extracted["문제 설명"]) payload["문제 설명"] = extracted["문제 설명"];
  if (extracted["입력 설명"]) payload["입력 설명"] = extracted["입력 설명"];
  if (extracted["출력 설명"]) payload["출력 설명"] = extracted["출력 설명"];
  if (extracted["힌트"]) payload["힌트"] = extracted["힌트"];
  if (Array.isArray(extracted["샘플"]) && extracted["샘플"].length) {
    payload["샘플"] = extracted["샘플"];
  }

  // 3) 현재 탭이 폼 페이지여야 함. 기존 content.js가 FILL_BY_LABEL 핸들링 중이라 가정.
  const tab = await getActiveTab();
  const res = await chrome.tabs.sendMessage(tab.id, {
    type: "FILL_BY_LABEL",
    data: payload
  }).catch(() => null);

  if (!res?.ok) {
    alert("폼 채우기 실패(현재 페이지가 폼이 아닐 수 있음).");
  } else {
    alert("폼 채우기 완료!");
  }
}

async function extractBojImagesAndCopy() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return alert("활성 탭을 알 수 없습니다.");
  const res = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_BOJ_IMAGES" }).catch(() => null);
  if (!res?.ok) return alert("이미지 추출 실패: " + (res?.reason || res?.error || "알 수 없습니다"));

  const urls = (res.images || []).map(x => x.src);
  if (!urls.length) return alert("추출된 이미지가 없습니다.");

  await navigator.clipboard.writeText(urls.join("\n"));
  alert(`이미지 URL ${urls.length}개를 복사했습니다.`);
}

// UI 바인딩 (popup.html에 버튼 추가해 연결)
document.addEventListener("DOMContentLoaded", () => {
  const btnExtractCopy = document.getElementById("btn-extract-boj-copy");
  const btnFillFromSaved = document.getElementById("btn-fill-from-boj");
  btnExtractCopy?.addEventListener("click", extractAndCopyFromCurrentTab);
  btnFillFromSaved?.addEventListener("click", fillCurrentFormWithLastBoj);

    const btnCopyImages = document.getElementById("btn-extract-boj-images-copy");
  btnCopyImages?.addEventListener("click", extractBojImagesAndCopy);
});
