(function () {
  const SUPABASE_URL = 'https://anknaltyafulhkoaupyc.supabase.co';
  const SUPABASE_PUBLIC_KEY = 'sb_publishable_2LbdQ1yiwnrK-FUi5ipI9Q_pzNe7y7s'; // Thay đúng publishable/anon key công khai của dự án nếu cần
  const CATALOG_TABLE = 'product_catalog';
  const CACHE_KEY = 'avakids_in_sieu_toc_cache_v1';

  const state = {
    items: [],
    selectedGroup: '',
    selectedSub: '',
    keyword: '',
    onlyFlash: false,
    selectedItem: null,
    qty: 1,
    loadedFrom: ''
  };

  function stripDiacritics(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  function formatVND(num) {
    const n = Number(num) || 0;
    if (!n) return '';
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function formatPromoDisplay(item) {
    const parts = [];
    if (item.promo_text) parts.push(item.promo_text.trim());
    if (item.is_flash_sale && !/flash\s*sale/i.test(item.promo_text || '')) {
      parts.unshift('FLASH SALE');
    }
    return parts.join(' | ');
  }

  function findTabContainer() {
    const candidates = Array.from(document.querySelectorAll('button, [role="tab"], a'));
    const manualTab = candidates.find((el) => /nhập\s*tay|thủ\s*công/i.test(el.textContent || ''));
    const batchTab = candidates.find((el) => /đồng\s*loạt|tự\s*động|excel/i.test(el.textContent || ''));
    if (manualTab && batchTab && manualTab.parentElement === batchTab.parentElement) {
      return { parent: manualTab.parentElement, manualTab, batchTab };
    }
    if (manualTab && manualTab.parentElement) {
      return { parent: manualTab.parentElement, manualTab, batchTab: null };
    }
    return null;
  }

  function findFormContainer(manualTab) {
    if (!manualTab) return null;
    let curr = manualTab.parentElement;
    for (let i = 0; i < 6 && curr; i++) {
      const hasInputs = curr.querySelector('input, select, textarea');
      const hasTable = Array.from(curr.querySelectorAll('table')).some((t) =>
        /chờ\s*in|sản\s*phẩm/i.test(t.parentElement?.textContent || t.textContent || '')
      );
      if (hasInputs && !hasTable) return curr;
      curr = curr.parentElement;
    }
    return manualTab.parentElement?.nextElementSibling || null;
  }

  function injectStyles() {
    if (document.getElementById('ist-style')) return;
    const style = document.createElement('style');
    style.id = 'ist-style';
    style.textContent = `
      .ist-tab-btn {
        padding: 8px 14px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        background: #fff;
        color: #111827;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .ist-tab-btn.active {
        background: #0f766e;
        color: #fff;
        border-color: #0f766e;
      }
      #ist-panel {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 14px;
        margin: 10px 0 14px;
        font-family: inherit;
      }
      .ist-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 10px;
      }
      @media (max-width: 768px) {
        .ist-row { grid-template-columns: 1fr; }
      }
      .ist-field label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #334155;
        margin-bottom: 4px;
      }
      .ist-field input, .ist-field select {
        width: 100%;
        padding: 7px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        background: #fff;
        font-size: 13px;
        box-sizing: border-box;
      }
      .ist-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .ist-btn {
        padding: 7px 12px;
        border-radius: 7px;
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #0f172a;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .ist-btn-primary {
        background: #0284c7;
        color: #fff;
        border-color: #0284c7;
      }
      .ist-btn-success {
        background: #15803d;
        color: #fff;
        border-color: #15803d;
      }
      .ist-results {
        max-height: 220px;
        overflow-y: auto;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
      }
      .ist-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-bottom: 1px solid #f1f5f9;
        cursor: pointer;
        font-size: 13px;
      }
      .ist-item:hover, .ist-item.selected {
        background: #e0f2fe;
      }
      .ist-price-box {
        text-align: right;
        white-space: nowrap;
      }
      .ist-sale {
        font-weight: 700;
        color: #dc2626;
      }
      .ist-orig {
        font-size: 11px;
        color: #64748b;
        text-decoration: line-through;
      }
      .ist-badge {
        display: inline-block;
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 999px;
        background: #fef3c7;
        color: #92400e;
        font-weight: 700;
        margin-left: 6px;
      }
      .ist-preview-card {
        margin-top: 10px;
        padding: 10px 12px;
        background: #fff;
        border: 1px dashed #0284c7;
        border-radius: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
      }
    `;
    document.head.appendChild(style);
  }

  async function fetchCatalogFromSupabase(forceRefresh = false) {
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed.items) && parsed.items.length > 0) {
            state.items = parsed.items;
            state.loadedFrom = `Bộ nhớ tạm (${parsed.items.length} SP)`;
            renderSelectors();
            renderResults();
          }
        }
      } catch (_) {}
    }

    const url = `${SUPABASE_URL}/rest/v1/${CATALOG_TABLE}?select=product_code,category_group,sub_category,brand,product_name,original_price,sale_price,discount_pct,price_type,promo_text,is_flash_sale,updated_at&limit=10000`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_PUBLIC_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`
      }
    });

    if (!res.ok) {
      throw new Error(`Không tải được danh mục Supabase (${res.status})`);
    }

    const rows = await res.json();
    state.items = Array.isArray(rows) ? rows : [];
    state.loadedFrom = `Supabase (${state.items.length} SP)`;

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: state.items }));
    } catch (_) {}

    renderSelectors();
    renderResults();
  }

  function getFilteredItems() {
    const tokens = stripDiacritics(state.keyword).split(/\s+/).filter(Boolean);
    return state.items.filter((item) => {
      if (state.onlyFlash && !item.is_flash_sale) return false;
      if (state.selectedGroup && item.category_group !== state.selectedGroup) return false;
      if (state.selectedSub && item.sub_category !== state.selectedSub) return false;

      if (tokens.length > 0) {
        const haystack = stripDiacritics(
          `${item.product_code || ''} ${item.product_name || ''} ${item.brand || ''} ${item.sub_category || ''}`
        );
        const allMatch = tokens.every((t) => haystack.includes(t));
        if (!allMatch) return false;
      }
      return true;
    }).slice(0, 80);
  }

  function fillIntoExistingFormAndAdd(item, qty) {
    // Điền vào các input hiện có trên trang nếu khớp tên/placeholder/id/label
    const inputs = Array.from(document.querySelectorAll('input, textarea'));
    const setVal = (el, val) => {
      if (!el) return;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const nameInput = inputs.find((i) => /tên\s*sản\s*phẩm|product.*name/i.test(i.placeholder || i.name || i.id || ''));
    const origInput = inputs.find((i) => /giá\s*gốc|orig/i.test(i.placeholder || i.name || i.id || ''));
    const saleInput = inputs.find((i) => /giá\s*(giảm|bán|km)|sale|price/i.test(i.placeholder || i.name || i.id || ''));
    const promoInput = inputs.find((i) => /khuyến\s*mãi|quà|promo/i.test(i.placeholder || i.name || i.id || ''));
    const qtyInput = inputs.find((i) => /số\s*lượng|sl\s*in|qty/i.test(i.placeholder || i.name || i.id || ''));

    setVal(nameInput, item.product_name || '');
    setVal(origInput, item.original_price ? formatVND(item.original_price) : '');
    setVal(saleInput, item.sale_price ? formatVND(item.sale_price) : '');
    setVal(promoInput, formatPromoDisplay(item));
    if (qtyInput && qty) setVal(qtyInput, String(qty));

    // Thử kích hoạt nút thêm vào danh sách chờ in nếu tìm thấy
    const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      /thêm\s*(vào\s*)?(ds|danh\s*sách|chờ\s*in)|add\s*(to\s*)?(queue|list)/i.test(b.textContent || '')
    );
    if (addBtn) addBtn.click();
  }

  function renderSelectors() {
    const groupSel = document.getElementById('ist-group-select');
    const subSel = document.getElementById('ist-sub-select');
    const statusEl = document.getElementById('ist-status');
    if (!groupSel || !subSel) return;

    const groups = Array.from(new Set(state.items.map((x) => x.category_group).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'vi')
    );

    groupSel.innerHTML = `<option value="">-- Tất cả nhóm ngành (${groups.length}) --</option>`;
    groups.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      if (g === state.selectedGroup) opt.selected = true;
      groupSel.appendChild(opt);
    });

    const subs = Array.from(
      new Set(
        state.items
          .filter((x) => !state.selectedGroup || x.category_group === state.selectedGroup)
          .map((x) => x.sub_category)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'vi'));

    subSel.innerHTML = `<option value="">-- Tất cả nhóm hàng (${subs.length}) --</option>`;
    subs.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (s === state.selectedSub) opt.selected = true;
      subSel.appendChild(opt);
    });

    if (statusEl && state.loadedFrom) {
      statusEl.textContent = `Nguồn: ${state.loadedFrom}`;
    }
  }

  function renderSelectedCard() {
    const card = document.getElementById('ist-selected-card');
    if (!card) return;
    if (!state.selectedItem) {
      card.style.display = 'none';
      return;
    }
    const it = state.selectedItem;
    card.style.display = 'flex';
    card.innerHTML = `
      <div>
        <div style="font-weight:700;font-size:13px;color:#0f172a;">${it.product_name}</div>
        <div style="font-size:12px;color:#475569;margin-top:2px;">
          Mã: <b>${it.product_code || '-'}</b> |
          Giá giảm: <b style="color:#dc2626;">${it.sale_price ? formatVND(it.sale_price) + 'đ' : '-'}</b> |
          Giá gốc: <span>${it.original_price ? formatVND(it.original_price) + 'đ' : '(trống)'}</span>
        </div>
        ${formatPromoDisplay(it) ? `<div style="font-size:11px;color:#b45309;margin-top:2px;">KM: ${formatPromoDisplay(it)}</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <label style="font-size:12px;font-weight:600;">SL in:
          <input id="ist-qty-input" type="number" min="1" value="${state.qty}" style="width:60px;padding:5px;border:1px solid #cbd5e1;border-radius:6px;" />
        </label>
        <button type="button" id="ist-add-btn" class="ist-btn ist-btn-success">+ Thêm chờ in</button>
      </div>
    `;

    const qtyInput = document.getElementById('ist-qty-input');
    qtyInput?.addEventListener('change', (e) => {
      state.qty = Math.max(1, parseInt(e.target.value, 10) || 1);
    });
    document.getElementById('ist-add-btn')?.addEventListener('click', () => {
      fillIntoExistingFormAndAdd(it, state.qty);
    });
  }

  function renderResults() {
    const listEl = document.getElementById('ist-results');
    if (!listEl) return;
    const rows = getFilteredItems();

    if (rows.length === 0) {
      listEl.innerHTML = `<div style="padding:14px;text-align:center;color:#64748b;">Không tìm thấy sản phẩm phù hợp. Thử gõ từ khóa ngắn hơn (vd: <code>friso 3</code>).</div>`;
      return;
    }

    listEl.innerHTML = rows
      .map((item, idx) => {
        const isSel = state.selectedItem && state.selectedItem.product_code === item.product_code && state.selectedItem.product_name === item.product_name;
        const saleStr = item.sale_price ? `${formatVND(item.sale_price)}đ` : '';
        const origStr = item.original_price ? `${formatVND(item.original_price)}đ` : '';
        return `
          <div class="ist-item ${isSel ? 'selected' : ''}" data-idx="${idx}">
            <div>
              <div style="font-weight:600;color:#0f172a;">
                ${item.product_name}
                ${item.is_flash_sale ? '<span class="ist-badge">FLASH</span>' : ''}
              </div>
              <div style="font-size:11px;color:#64748b;">
                ${item.sub_category || item.category_group || ''} • Mã: ${item.product_code || '-'}
              </div>
            </div>
            <div class="ist-price-box">
              <div class="ist-sale">${saleStr}</div>
              ${origStr ? `<div class="ist-orig">${origStr}</div>` : ''}
            </div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.ist-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-idx'));
        state.selectedItem = rows[idx];
        renderSelectedCard();
        renderResults();
      });
      el.addEventListener('dblclick', () => {
        const idx = Number(el.getAttribute('data-idx'));
        state.selectedItem = rows[idx];
        fillIntoExistingFormAndAdd(rows[idx], state.qty);
      });
    });
  }

  function mountUI() {
    const tabInfo = findTabContainer();
    if (!tabInfo) return;

    injectStyles();

    const { parent, manualTab, batchTab } = tabInfo;
    if (document.getElementById('ist-tab-btn')) return;

    const superTab = document.createElement('button');
    superTab.type = 'button';
    superTab.id = 'ist-tab-btn';
    superTab.className = 'ist-tab-btn';
    superTab.textContent = 'In siêu tốc';

    if (batchTab) {
      parent.insertBefore(superTab, batchTab);
    } else {
      parent.appendChild(superTab);
    }

    const panel = document.createElement('div');
    panel.id = 'ist-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="ist-actions">
        <div>
          <strong style="font-size:14px;color:#0f172a;">⚡ In siêu tốc</strong>
          <span id="ist-status" style="font-size:12px;color:#475569;margin-left:8px;">Đang tải danh mục...</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" id="ist-flash-only" /> Flash Sale
          </label>
          <button type="button" id="ist-refresh-btn" class="ist-btn ist-btn-primary">↻ Đồng bộ giá</button>
        </div>
      </div>

      <div class="ist-row">
        <div class="ist-field">
          <label for="ist-group-select">Nhóm ngành hàng</label>
          <select id="ist-group-select"><option value="">-- Tất cả nhóm ngành --</option></select>
        </div>
        <div class="ist-field">
          <label for="ist-sub-select">Nhóm hàng</label>
          <select id="ist-sub-select"><option value="">-- Tất cả nhóm hàng --</option></select>
        </div>
        <div class="ist-field">
          <label for="ist-search-input">Tìm nhanh (tên, mã, từ khóa: vd. friso 3)</label>
          <input id="ist-search-input" type="text" placeholder="Gõ từ khóa gần đúng..." autocomplete="off" />
        </div>
      </div>

      <div id="ist-results" class="ist-results"></div>
      <div id="ist-selected-card" class="ist-preview-card" style="display:none;"></div>
    `;

    const targetForm = findFormContainer(manualTab);
    if (targetForm && targetForm.parentElement) {
      targetForm.parentElement.insertBefore(panel, targetForm);
    } else {
      parent.insertAdjacentElement('afterend', panel);
    }

    const activateSuperTab = () => {
      superTab.classList.add('active');
      panel.style.display = 'block';
      if (targetForm) targetForm.style.display = 'none';
      if (state.items.length === 0) {
        fetchCatalogFromSupabase(false).catch((err) => {
          const st = document.getElementById('ist-status');
          if (st) st.textContent = err.message;
        });
      }
      document.getElementById('ist-search-input')?.focus();
    };

    const deactivateSuperTab = () => {
      superTab.classList.remove('active');
      panel.style.display = 'none';
      if (targetForm) targetForm.style.display = '';
    };

    superTab.addEventListener('click', activateSuperTab);
    manualTab?.addEventListener('click', deactivateSuperTab);
    batchTab?.addEventListener('click', deactivateSuperTab);

    document.getElementById('ist-group-select')?.addEventListener('change', (e) => {
      state.selectedGroup = e.target.value;
      state.selectedSub = '';
      renderSelectors();
      renderResults();
    });

    document.getElementById('ist-sub-select')?.addEventListener('change', (e) => {
      state.selectedSub = e.target.value;
      renderResults();
    });

    document.getElementById('ist-search-input')?.addEventListener('input', (e) => {
      state.keyword = e.target.value;
      renderResults();
    });

    document.getElementById('ist-flash-only')?.addEventListener('change', (e) => {
      state.onlyFlash = e.target.checked;
      renderResults();
    });

    document.getElementById('ist-refresh-btn')?.addEventListener('click', async () => {
      const st = document.getElementById('ist-status');
      if (st) st.textContent = 'Đang đồng bộ từ Supabase...';
      try {
        await fetchCatalogFromSupabase(true);
      } catch (err) {
        if (st) st.textContent = `Lỗi: ${err.message}`;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountUI);
  } else {
    mountUI();
  }
})();