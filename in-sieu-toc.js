(function () {
  const SUPABASE_URL = 'https://anknaltyafulhkoaupyc.supabase.co';
  const SUPABASE_PUBLIC_KEY = 'sb_publishable_2LbdQ1yiwnrK-FUi5ipI9Q_pzNe7hIz';
  const CATALOG_TABLE = 'product_catalog';
  const CACHE_KEY = 'avakids_in_sieu_toc_cache_v3';
  const PAGE_SIZE = 1000;

  const state = {
    items: [],
    selectedGroup: '',
    selectedSub: '',
    selectedBrand: '',
    keyword: '',
    onlyFlash: false,
    applyTime: '',
    selectedCodes: new Set(),
    rowQtyMap: {},
    activeTab: 'super',
    loadedFrom: ''
  };

  function makeItemKey(item) {
    return `${item.product_code || ''}__${item.product_name || ''}`;
  }

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

  function formatAvaPrice(num) {
    const n = Number(num) || 0;
    if (!n) return '';
    return Math.round(n).toLocaleString('vi-VN') + ' Đ';
  }

  function formatPromoDisplay(item) {
    const parts = [];
    if (item.promo_text && String(item.promo_text).trim().toLowerCase() !== 'không có') {
      parts.push(String(item.promo_text).trim());
    }
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
      .ist-tab-bar {
        display: inline-flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }
      .ist-tab-btn {
        padding: 8px 14px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        background: #fff;
        color: #111827;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .ist-tab-btn.active {
        background: #F05A9D;
        color: #fff;
        border-color: #F05A9D;
      }
      #ist-panel {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 14px;
        margin: 8px 0 14px;
        font-family: inherit;
      }
      .ist-grid-4 {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 10px;
      }
      .ist-grid-2 {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 10px;
        margin-bottom: 10px;
      }
      @media (max-width: 900px) {
        .ist-grid-4, .ist-grid-2 { grid-template-columns: 1fr; }
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
      .ist-header-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .ist-bulk-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        border-radius: 8px;
        margin-bottom: 8px;
        font-size: 12px;
      }
      .ist-btn {
        padding: 6px 11px;
        border-radius: 7px;
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #0f172a;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .ist-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .ist-btn-primary {
        background: #0284c7;
        color: #fff;
        border-color: #0284c7;
      }
      .ist-btn-pink {
        background: #F05A9D;
        color: #fff;
        border-color: #F05A9D;
      }
      .ist-btn-success {
        background: #15803d;
        color: #fff;
        border-color: #15803d;
      }
      .ist-results {
        max-height: 290px;
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
        font-size: 13px;
      }
      .ist-item:hover {
        background: #fdf2f8;
      }
      .ist-item.checked {
        background: #fce7f3;
      }
      .ist-item-left {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        flex: 1;
        min-width: 0;
      }
      .ist-item-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .ist-price-box {
        text-align: right;
        white-space: nowrap;
        min-width: 78px;
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
      .ist-promo-note {
        font-size: 11px;
        color: #b45309;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 520px;
      }
      .ist-row-qty {
        width: 48px;
        padding: 4px 6px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 12px;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  async function fetchAllCatalogFromSupabase(forceRefresh = false) {
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed.items) && parsed.items.length > 0) {
            state.items = parsed.items;
            state.loadedFrom = `Bộ nhớ tạm (${parsed.items.length.toLocaleString('vi-VN')} SP)`;
            renderSelectors();
            renderResults();
          }
        }
      } catch (_) {}
    }

    const allRows = [];
    let offset = 0;

    while (true) {
      const from = offset;
      const to = offset + PAGE_SIZE - 1;
      const url = `${SUPABASE_URL}/rest/v1/${CATALOG_TABLE}?select=product_code,category_group,sub_category,brand,product_name,original_price,sale_price,discount_pct,price_type,promo_text,is_flash_sale,updated_at&order=id.asc`;
      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_PUBLIC_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
          Range: `${from}-${to}`,
          'Range-Unit': 'items'
        }
      });

      if (!res.ok) {
        throw new Error(`Không tải được danh mục Supabase (${res.status})`);
      }

      const chunk = await res.json();
      if (!Array.isArray(chunk) || chunk.length === 0) break;

      allRows.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    state.items = allRows;
    const latestUpdate = allRows.find((r) => r.updated_at)?.updated_at || '';
    state.loadedFrom = `${allRows.length.toLocaleString('vi-VN')} SP${latestUpdate ? ` • Cập nhật: ${latestUpdate}` : ''}`;

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
      if (state.selectedBrand && item.brand !== state.selectedBrand) return false;

      if (tokens.length > 0) {
        const haystack = stripDiacritics(
          `${item.product_code || ''} ${item.product_name || ''} ${item.brand || ''} ${item.sub_category || ''} ${item.category_group || ''}`
        );
        if (!tokens.every((t) => haystack.includes(t))) return false;
      }
      return true;
    });
  }

  function buildAvakidsQueueRecord(item, qty) {
    const useQty = Math.max(1, parseInt(qty, 10) || 1);
    const saleNum = Number(item.sale_price) || 0;
    const origNum = Number(item.original_price) || 0;

    // Quy tắc giá: nếu Giá gốc == Giá giảm hoặc không giảm -> đưa vào Giá giảm, để trống Giá gốc
    let finalSale = saleNum > 0 ? formatAvaPrice(saleNum) : formatAvaPrice(origNum);
    let finalOrig = '';
    if (origNum > 0 && saleNum > 0 && Math.abs(origNum - saleNum) > 1e-6) {
      finalOrig = formatAvaPrice(origNum);
      finalSale = formatAvaPrice(saleNum);
    }

    const promoText = formatPromoDisplay(item);
    const applyDate = (state.applyTime || '').trim() || 'AVAKIDS';

    return {
      name: String(item.product_name || '').trim(),
      price: finalSale,
      originalPrice: finalOrig,
      promo: promoText,
      date: applyDate,
      quantity: useQty
    };
  }

  async function applySingleItemToQueue(item, qty) {
    const record = buildAvakidsQueueRecord(item, qty);
    if (!record.name || !record.price) return;

    if (typeof DBManager !== 'undefined' && typeof DBManager.addProduct === 'function' && typeof ProductController !== 'undefined') {
      await DBManager.addProduct(record);
      await ProductController.loadProducts();
      if (typeof Utils !== 'undefined' && typeof Utils.showToast === 'function') {
        Utils.showToast(`Đã thêm: ${record.name}`);
      }
      return;
    }

    // Fallback nếu chạy độc lập
    const nameInput = document.getElementById('manual-name');
    const origInput = document.getElementById('manual-original-price');
    const saleInput = document.getElementById('manual-price');
    const promoInput = document.getElementById('manual-promo');
    const dateInput = document.getElementById('manual-date');
    const qtyInput = document.getElementById('manual-quantity');

    if (nameInput) nameInput.value = record.name;
    if (origInput) origInput.value = record.originalPrice;
    if (saleInput) saleInput.value = record.price;
    if (promoInput) promoInput.value = record.promo;
    if (dateInput) dateInput.value = record.date;
    if (qtyInput) qtyInput.value = String(record.quantity);
    if (typeof ProductController !== 'undefined' && typeof ProductController.addManualProduct === 'function') {
      await ProductController.addManualProduct();
    }
  }

  async function addSelectedItemsToQueue() {
    if (state.selectedCodes.size === 0) return;
    const selectedList = state.items.filter((it) => state.selectedCodes.has(makeItemKey(it)));
    const batch = selectedList
      .map((it) => {
        const k = makeItemKey(it);
        const q = state.rowQtyMap[k] || 1;
        return buildAvakidsQueueRecord(it, q);
      })
      .filter((r) => r.name && r.price);

    if (batch.length > 0 && typeof DBManager !== 'undefined' && typeof DBManager.addProductsBatch === 'function' && typeof ProductController !== 'undefined') {
      await DBManager.addProductsBatch(batch);
      await ProductController.loadProducts();
      if (typeof Utils !== 'undefined' && typeof Utils.showToast === 'function') {
        Utils.showToast(`Đã thêm ${batch.length} sản phẩm vào DS chờ in!`);
      }
    } else {
      for (const it of selectedList) {
        const k = makeItemKey(it);
        await applySingleItemToQueue(it, state.rowQtyMap[k] || 1);
      }
    }

    state.selectedCodes.clear();
    renderBulkBar();
    renderResults();
  }

  function renderSelectors() {
    const groupSel = document.getElementById('ist-group-select');
    const subSel = document.getElementById('ist-sub-select');
    const brandSel = document.getElementById('ist-brand-select');
    const statusEl = document.getElementById('ist-status');
    if (!groupSel || !subSel || !brandSel) return;

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

    const subPool = state.items.filter((x) => !state.selectedGroup || x.category_group === state.selectedGroup);
    const subs = Array.from(new Set(subPool.map((x) => x.sub_category).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'vi')
    );
    subSel.innerHTML = `<option value="">-- Tất cả nhóm hàng (${subs.length}) --</option>`;
    subs.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (s === state.selectedSub) opt.selected = true;
      subSel.appendChild(opt);
    });

    const brandPool = subPool.filter((x) => !state.selectedSub || x.sub_category === state.selectedSub);
    const brands = Array.from(new Set(brandPool.map((x) => x.brand).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'vi')
    );
    brandSel.innerHTML = `<option value="">-- Tất cả hãng (${brands.length}) --</option>`;
    brands.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b;
      opt.textContent = b;
      if (b === state.selectedBrand) opt.selected = true;
      brandSel.appendChild(opt);
    });

    if (statusEl && state.loadedFrom) {
      statusEl.textContent = state.loadedFrom;
    }
  }

  function renderBulkBar() {
    const bulkEl = document.getElementById('ist-bulk-bar');
    if (!bulkEl) return;
    const count = state.selectedCodes.size;
    bulkEl.innerHTML = `
      <div>
        Đã tích chọn: <strong>${count}</strong> sản phẩm
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <button type="button" id="ist-select-visible-btn" class="ist-btn">Chọn kết quả đang hiện</button>
        <button type="button" id="ist-clear-sel-btn" class="ist-btn" ${count === 0 ? 'disabled' : ''}>Bỏ chọn</button>
        <button type="button" id="ist-add-selected-btn" class="ist-btn ist-btn-success" ${count === 0 ? 'disabled' : ''}>
          + Thêm ${count} SP đã chọn
        </button>
      </div>
    `;

    document.getElementById('ist-select-visible-btn')?.addEventListener('click', () => {
      const visible = getFilteredItems().slice(0, 120);
      visible.forEach((it) => state.selectedCodes.add(makeItemKey(it)));
      renderBulkBar();
      renderResults();
    });

    document.getElementById('ist-clear-sel-btn')?.addEventListener('click', () => {
      state.selectedCodes.clear();
      renderBulkBar();
      renderResults();
    });

    document.getElementById('ist-add-selected-btn')?.addEventListener('click', addSelectedItemsToQueue);
  }

  function renderResults() {
    const listEl = document.getElementById('ist-results');
    const countEl = document.getElementById('ist-filter-count');
    if (!listEl) return;

    const matched = getFilteredItems();
    const rows = matched.slice(0, 120);

    if (countEl) {
      countEl.textContent =
        matched.length > 120
          ? `Hiển thị 120 / ${matched.length.toLocaleString('vi-VN')} SP khớp (gõ thêm từ khóa để thu hẹp)`
          : `${matched.length.toLocaleString('vi-VN')} SP khớp`;
    }

    if (rows.length === 0) {
      listEl.innerHTML = `<div style="padding:16px;text-align:center;color:#64748b;">Không tìm thấy sản phẩm phù hợp. Thử gõ từ khóa ngắn hơn (vd: <code>friso 3</code>) hoặc bấm <strong>Xóa lọc</strong>.</div>`;
      return;
    }

    listEl.innerHTML = rows
      .map((item, idx) => {
        const key = makeItemKey(item);
        const isChecked = state.selectedCodes.has(key);
        const rowQty = state.rowQtyMap[key] || 1;
        const saleStr = item.sale_price ? `${formatVND(item.sale_price)}đ` : '';
        const origStr =
          item.original_price && Math.abs(Number(item.original_price) - Number(item.sale_price || 0)) > 1e-6
            ? `${formatVND(item.original_price)}đ`
            : '';
        const promoStr = formatPromoDisplay(item);

        return `
          <div class="ist-item ${isChecked ? 'checked' : ''}" data-idx="${idx}">
            <div class="ist-item-left">
              <input type="checkbox" class="ist-row-check" data-idx="${idx}" ${isChecked ? 'checked' : ''} style="margin-top:3px;cursor:pointer;" />
              <div style="min-width:0;flex:1;">
                <div style="font-weight:600;color:#0f172a;word-break:break-word;">
                  ${item.product_name}
                  ${item.is_flash_sale ? '<span class="ist-badge">FLASH</span>' : ''}
                </div>
                <div style="font-size:11px;color:#64748b;">
                  ${item.brand ? `Hãng: <b>${item.brand}</b> • ` : ''}${item.sub_category || item.category_group || ''} • Mã: ${item.product_code || '-'}
                </div>
                ${promoStr ? `<div class="ist-promo-note" title="${promoStr}">🎁 ${promoStr}</div>` : ''}
              </div>
            </div>
            <div class="ist-item-right">
              <div class="ist-price-box">
                <div class="ist-sale">${saleStr}</div>
                ${origStr ? `<div class="ist-orig">${origStr}</div>` : ''}
              </div>
              <input type="number" min="1" class="ist-row-qty" data-idx="${idx}" value="${rowQty}" title="Số lượng tem" />
              <button type="button" class="ist-btn ist-btn-pink ist-row-add" data-idx="${idx}">+ Thêm</button>
            </div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.ist-row-check').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        const key = makeItemKey(rows[idx]);
        if (e.target.checked) state.selectedCodes.add(key);
        else state.selectedCodes.delete(key);
        renderBulkBar();
        renderResults();
      });
    });

    listEl.querySelectorAll('.ist-row-qty').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        const key = makeItemKey(rows[idx]);
        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
        state.rowQtyMap[key] = val;
        e.target.value = String(val);
      });
    });

    listEl.querySelectorAll('.ist-row-add').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-idx'));
        const item = rows[idx];
        const key = makeItemKey(item);
        const qty = state.rowQtyMap[key] || 1;
        await applySingleItemToQueue(item, qty);
      });
    });
  }

  function mountUI() {
    const tabInfo = findTabContainer();
    if (!tabInfo) return;

    injectStyles();
    const { parent, manualTab, batchTab } = tabInfo;
    if (document.getElementById('ist-tab-bar')) return;

    const targetForm = findFormContainer(manualTab);

    const tabBar = document.createElement('div');
    tabBar.id = 'ist-tab-bar';
    tabBar.className = 'ist-tab-bar';

    const btnManual = document.createElement('button');
    btnManual.type = 'button';
    btnManual.className = 'ist-tab-btn';
    btnManual.textContent = 'Nhập tay';

    const btnSuper = document.createElement('button');
    btnSuper.type = 'button';
    btnSuper.id = 'ist-tab-btn';
    btnSuper.className = 'ist-tab-btn active';
    btnSuper.textContent = '⚡ In siêu tốc';

    const btnBatch = document.createElement('button');
    btnBatch.type = 'button';
    btnBatch.className = 'ist-tab-btn';
    btnBatch.textContent = 'In đồng loạt';

    tabBar.appendChild(btnManual);
    tabBar.appendChild(btnSuper);
    tabBar.appendChild(btnBatch);

    const panel = document.createElement('div');
    panel.id = 'ist-panel';
    panel.innerHTML = `
      <div class="ist-header-bar">
        <div>
          <strong style="font-size:14px;color:#0f172a;">⚡ In siêu tốc</strong>
          <span id="ist-status" style="font-size:12px;color:#475569;margin-left:8px;">Đang tải danh mục...</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" id="ist-flash-only" /> Flash Sale
          </label>
          <button type="button" id="ist-reset-filter-btn" class="ist-btn">× Xóa lọc</button>
          <button type="button" id="ist-refresh-btn" class="ist-btn ist-btn-primary">↻ Đồng bộ giá</button>
        </div>
      </div>

      <div class="ist-grid-4">
        <div class="ist-field">
          <label for="ist-group-select">Nhóm ngành hàng</label>
          <select id="ist-group-select"><option value="">-- Tất cả nhóm ngành --</option></select>
        </div>
        <div class="ist-field">
          <label for="ist-sub-select">Nhóm hàng</label>
          <select id="ist-sub-select"><option value="">-- Tất cả nhóm hàng --</option></select>
        </div>
        <div class="ist-field">
          <label for="ist-brand-select">Hãng sản xuất</label>
          <select id="ist-brand-select"><option value="">-- Tất cả hãng --</option></select>
        </div>
        <div class="ist-field">
          <label for="ist-search-input">Tìm nhanh (tên, mã, từ khóa: vd. friso 3)</label>
          <input id="ist-search-input" type="text" placeholder="Gõ từ khóa gần đúng..." autocomplete="off" />
        </div>
      </div>

      <div class="ist-grid-2">
        <div style="display:flex;align-items:center;font-size:12px;color:#475569;">
          <span id="ist-filter-count">Đang chờ dữ liệu...</span>
        </div>
        <div class="ist-field" style="margin-bottom:0;">
          <label for="ist-apply-time">TG áp dụng chung cho tem thêm mới (tùy chọn)</label>
          <input id="ist-apply-time" type="text" placeholder="Vd: 20/11 - 30/11 hoặc để trống..." />
        </div>
      </div>

      <div id="ist-bulk-bar" class="ist-bulk-bar"></div>
      <div id="ist-results" class="ist-results"></div>
    `;

    const anchorParent = targetForm?.parentElement || parent.parentElement;
    const anchorBefore = targetForm || parent.nextSibling;
    anchorParent.insertBefore(tabBar, anchorBefore);
    anchorParent.insertBefore(panel, anchorBefore);

    if (parent && parent.id !== 'ist-tab-bar') {
      parent.style.display = 'none';
    }

    const switchMode = (mode) => {
      state.activeTab = mode;
      btnManual.classList.toggle('active', mode === 'manual');
      btnSuper.classList.toggle('active', mode === 'super');
      btnBatch.classList.toggle('active', mode === 'batch');

      panel.style.display = mode === 'super' ? 'block' : 'none';
      if (targetForm) {
        targetForm.style.display = mode === 'super' ? 'none' : '';
      }
      if (mode === 'manual' && manualTab) manualTab.click();
      if (mode === 'batch' && batchTab) batchTab.click();
      if (mode === 'super') {
        document.getElementById('ist-search-input')?.focus();
      }
    };

    btnManual.addEventListener('click', () => switchMode('manual'));
    btnSuper.addEventListener('click', () => switchMode('super'));
    btnBatch.addEventListener('click', () => switchMode('batch'));

    document.getElementById('ist-group-select')?.addEventListener('change', (e) => {
      state.selectedGroup = e.target.value;
      state.selectedSub = '';
      state.selectedBrand = '';
      renderSelectors();
      renderResults();
    });

    document.getElementById('ist-sub-select')?.addEventListener('change', (e) => {
      state.selectedSub = e.target.value;
      state.selectedBrand = '';
      renderSelectors();
      renderResults();
    });

    document.getElementById('ist-brand-select')?.addEventListener('change', (e) => {
      state.selectedBrand = e.target.value;
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

    document.getElementById('ist-apply-time')?.addEventListener('input', (e) => {
      state.applyTime = e.target.value;
    });

    document.getElementById('ist-reset-filter-btn')?.addEventListener('click', () => {
      state.selectedGroup = '';
      state.selectedSub = '';
      state.selectedBrand = '';
      state.keyword = '';
      state.onlyFlash = false;
      const kw = document.getElementById('ist-search-input');
      const fl = document.getElementById('ist-flash-only');
      if (kw) kw.value = '';
      if (fl) fl.checked = false;
      renderSelectors();
      renderResults();
    });

    document.getElementById('ist-refresh-btn')?.addEventListener('click', async () => {
      const st = document.getElementById('ist-status');
      if (st) st.textContent = 'Đang đồng bộ toàn bộ danh mục từ Supabase...';
      try {
        await fetchAllCatalogFromSupabase(true);
      } catch (err) {
        if (st) st.textContent = `Lỗi: ${err.message}`;
      }
    });

    renderBulkBar();
    switchMode('super');

    fetchAllCatalogFromSupabase(false).catch((err) => {
      const st = document.getElementById('ist-status');
      if (st) st.textContent = `Lỗi: ${err.message}`;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountUI);
  } else {
    mountUI();
  }
})();
