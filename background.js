// background.js
// 기능: (1) 컨텍스트 메뉴로 BOJ JSON 추출/복사/저장 (2) 팝업에서 쓰는 헬퍼 API

const STORAGE_KEYS = {
  LAST_BOJ_JSON: "last_boj_json",
};

// 설치/업데이트 시 컨텍스트 메뉴 생성
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "boj_extract_copy",
    title: "BOJ → JSON 추출 (클립보드 복사)",
    contexts: ["page"],
    documentUrlPatterns: ["https://www.acmicpc.net/problem/*", "https://boj.kr/*"],
  });
  chrome.contextMenus.create({
    id: "boj_extract_save",
    title: "BOJ → JSON 추출 (임시 저장)",
    contexts: ["page"],
    documentUrlPatterns: ["https://www.acmicpc.net/problem/*", "https://boj.kr/*"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "boj_extract_copy" || info.menuItemId === "boj_extract_save") {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_BOJ_JSON" }).catch(() => null);
    if (!res?.ok) {
      console.warn("BOJ extract failed:", res);
      return;
    }
    const json = JSON.stringify(res.data, null, 2);

    if (info.menuItemId === "boj_extract_copy") {
      // 서비스워커 직접 클립보드 접근이 어려워, 탭에 주입하여 복사
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (text) => navigator.clipboard.writeText(text),
        args: [json],
      });
    } else {
      await chrome.storage.local.set({ [STORAGE_KEYS.LAST_BOJ_JSON]: res.data });
    }
  }
});

// 팝업에서 최근 추출 가져오기
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "GET_LAST_BOJ_JSON") {
      const v = await chrome.storage.local.get(STORAGE_KEYS.LAST_BOJ_JSON);
      sendResponse({ ok: true, data: v[STORAGE_KEYS.LAST_BOJ_JSON] || null });
    }
  })();
  return true;
});
