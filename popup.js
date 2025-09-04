const $ = (sel) => document.querySelector(sel);

$("#file").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const txt = await f.text();
  $("#json").value = txt;
});

$("#run").addEventListener("click", async () => {
  let payload;
  try {
    payload = JSON.parse($("#json").value || "{}");
  } catch (e) {
    alert("JSON 파싱 실패: " + e.message);
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return alert("탭을 찾지 못했습니다.");
  await chrome.tabs.sendMessage(tab.id, {
    type: "FILL_BY_LABEL",
    data: payload,
  });
  window.close();
});
