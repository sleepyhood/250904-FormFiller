// popup.preview.js
// 기능: #json textarea에 붙여넣은 JSON/URL에서 이미지 주소를 추출해 미리보기 그리드로 표시

(() => {
  const ta = document.getElementById('json');
  if (!ta) return; // 방어

  // 미리보기 컨테이너 동적 삽입 (디자인은 기존 카드 안에 자연스럽게 들어가도록)
  const card = ta.closest('.card') || document.body;
  const holder = document.createElement('div');
  holder.innerHTML = `
    <div class="divider" style="margin:12px 0"></div>
    <div id="imgPreviewWrap">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px">
        <h3 style="margin:0; font-size:13px; color:var(--muted)">이미지 미리보기</h3>
        <span id="previewCount" class="badge" style="display:none">0</span>
        <div style="margin-left:auto; display:flex; gap:6px;">
          <button id="btnClearPreview" class="btn btn-sm btn-ghost" title="미리보기 지우기">지우기</button>
          <button id="btnCopyPreviewUrls" class="btn btn-sm btn-ghost" title="보이는 이미지 URL 복사">URL 복사</button>
        </div>
      </div>
      <div id="imgPreview" class="img-grid"></div>
    </div>
  `;
  card.appendChild(holder);

  // 간단한 스타일(없으면 추가)
  if (!document.getElementById('img-grid-style')) {
    const css = document.createElement('style');
    css.id = 'img-grid-style';
    css.textContent = `
      .img-grid{
        display:grid; grid-template-columns: repeat(3, 1fr); gap:8px;
        max-height:260px; overflow:auto; padding:2px;
        border:1px dashed var(--line); border-radius:10px; background:rgba(0,0,0,.02);
      }
      .img-grid a{
        display:block; position:relative; border-radius:8px; overflow:hidden;
        background:var(--panel); border:1px solid var(--line);
      }
      .img-grid img{
        display:block; width:100%; height:80px; object-fit:contain; background:#fff0;
      }
      .img-grid .broken::after{
        content:"×"; position:absolute; inset:0; display:grid; place-items:center;
        font-weight:700; color:#c33; background:rgba(0,0,0,.05);
      }
      @media (prefers-color-scheme: light){
        .img-grid{ background:#fff; }
      }
    `;
    document.head.appendChild(css);
  }

  const grid  = document.getElementById('imgPreview');
  const badge = document.getElementById('previewCount');
  const btnClear = document.getElementById('btnClearPreview');
  const btnCopy  = document.getElementById('btnCopyPreviewUrls');

  function uniq(arr){ return Array.from(new Set(arr)); }

  // 텍스트에서 이미지 URL 뽑기 (jpg|jpeg|png|gif|webp|bmp|svg + 쿼리 허용)
  function extractUrlsFromText(s){
    if (!s) return [];
    const re = /\bhttps?:\/\/[^\s"'<>)]+?\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^\s"'<>)]*)?/gi;
    return (s.match(re) || []);
  }

  // JSON 파싱: { 이미지: [ ... ] } 또는 { ... "_이미지메타": [{src:...}] }
  function extractFromJson(text){
    try{
      const obj = JSON.parse(text);
      const urls = [];
      if (Array.isArray(obj?.이미지)) {
        for (const u of obj.이미지) if (typeof u === 'string') urls.push(u);
      }
      if (Array.isArray(obj?._이미지메타)) {
        for (const it of obj._이미지메타) if (it?.src) urls.push(String(it.src));
      }
      return urls;
    }catch{
      return [];
    }
  }

  function resolveAbs(u){
    try { return new URL(u, location.href).href; } catch { return u || ''; }
  }

  function render(urls){
    grid.innerHTML = '';
    const list = uniq(urls.map(resolveAbs)).slice(0, 60); // 너무 많으면 60개 제한
    for (const u of list){
      const a = document.createElement('a');
      a.href = u; a.target = '_blank'; a.rel = 'noopener';
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = u;
      img.alt = '';
      img.onerror = () => a.classList.add('broken');
      a.appendChild(img);
      grid.appendChild(a);
    }
    badge.style.display = list.length ? 'inline-block' : 'none';
    badge.textContent = String(list.length);
    return list;
  }

  let lastUrls = [];

  function updatePreview(){
    const text = ta.value || '';
    // 1) JSON 우선
    let urls = extractFromJson(text);
    // 2) JSON에 없으면, 텍스트에서 URL 패턴 추출
    if (!urls.length) urls = extractUrlsFromText(text);
    lastUrls = render(urls);
  }

  ta.addEventListener('input', updatePreview);
  btnClear?.addEventListener('click', () => {
    grid.innerHTML = '';
    badge.style.display = 'none';
    lastUrls = [];
  });
  btnCopy?.addEventListener('click', async () => {
    if (!lastUrls.length) return;
    try{
      await navigator.clipboard.writeText(lastUrls.join('\n'));
    }catch(e){
      console.warn('clipboard write failed', e);
    }
  });

  // 초기 1회
  updatePreview();
})();
