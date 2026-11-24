import os
import re
import sys
import time
import datetime
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

# --- CẤU HÌNH HỆ THỐNG ---
PROVINCE_ID = 1027  # Hồ Chí Minh / Toàn quốc
SITE_ID = "17"

SUPABASE_URL = "https://anknaltyafulhkoaupyc.supabase.co"
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
TABLE_NAME = "product_catalog"
BATCH_SIZE = 300

HEADERS = {
    'content-type': 'application/json',
    'provinceid': str(PROVINCE_ID),
    'siteid': SITE_ID,
    'os': 'WebAVAKids',
    'platform': '1',
    'accept': 'application/json, text/plain, */*',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

POPULAR_BRANDS = [
    'molfix', 'rascals', 'rascal', 'nan', 'pediasure', 'similac', 'growplus', 'grow', 'aptamil', 'enfa', 'enfagrow', 'enspire',
    'colosbaby', 'friso', 'frisolac', 'vinamilk', 'optimum', 'animo', 'bobby', 'huggies', 'pampers', 'moony', 'merries',
    'meiji', 'glico', 'morinaga', 'bellamy', 'blackmores', 'hipp', 'heinz', 'gerber', 'dielac', 'colosgold', 'whito',
    'genki', 'goon', 'supdry', 'yubest', 'unidry', 'jo', 'yoko', 'cetaphil', 'johnson', 'pigeon', 'wesser',
    'kun', 'milo', 'th true milk', 'th true', 'th', 'fami', 'vinasoy', 'ovaltine', 'dutch lady', 'cô gái hà lan',
    'nutifood', 'dalatmilk', 'applecrumby', 'rose baby', 'nabizam', 'goldgi', 'makuku', 'elibell', 'momo rabbit',
    'agi', 'metacare', 'care 100', 'pedia plus', 'nestle', 'nestlé', 'a2', 'babylove', 'drpapie', 'd-nee', 'dnee',
    'jordan', 'diana', 'la pomme', 'rabity', 'ku-ku', 'farlin', 'philips avent', 'avent', 'chicco', 'comotomo',
    'pureen', 'chuchu', 'bebe', 'bapbi', 'reebaby', 'joie', 'zaracos', 'jovikids', 'cay thi', 'cây thị', 'sg food'
]
POPULAR_BRANDS = sorted(POPULAR_BRANDS, key=len, reverse=True)


def get_session():
    s = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=35, pool_maxsize=35, max_retries=2)
    s.mount('https://', adapter)
    return s


def extract_brand_fallback(name):
    name_lower = name.lower()
    for b in POPULAR_BRANDS:
        if re.search(r'\b' + re.escape(b) + r'\b', name_lower):
            return b.title()
    return "Khác"


def clean_number(val) -> float:
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "không có", "-"):
        return 0.0
    s_num = re.sub(r"[^\d.,-]", "", s)
    if not s_num:
        return 0.0
    if "." in s_num and "," in s_num:
        s_num = s_num.replace(".", "").replace(",", ".")
    elif s_num.count(".") > 1:
        s_num = s_num.replace(".", "")
    elif len(s_num.split(".")[-1]) == 3 and "." in s_num:
        s_num = s_num.replace(".", "")
    try:
        return float(s_num)
    except ValueError:
        return 0.0


def clean_text(val) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    if s.lower() in ("nan", "none", "không có"):
        return ""
    return s


def clean_promotions(product, promo_detail=None):
    promos = []
    if promo_detail and isinstance(promo_detail, dict):
        text_promos = promo_detail.get('lstTextPromotion') or []
        for tp in text_promos:
            blocks = tp.get('lstBlockTextPromotion') or []
            for b in blocks:
                b_title = (b.get('title') or '').strip()
                gifts = b.get('lstGift') or []
                if gifts:
                    gift_items = []
                    for g in gifts:
                        g_name = (g.get('name') or '').strip()
                        g_qty = g.get('quantity')
                        if g_name:
                            qty_str = f" (SL: {int(g_qty)})" if g_qty and float(g_qty) > 0 else ""
                            gift_items.append(f"{g_name}{qty_str}")
                    g_str = ", ".join(gift_items)
                    if b_title:
                        sep = " " if b_title.endswith(':') else ": "
                        promos.append(f"{b_title}{sep}{g_str}")
                    else:
                        promos.append(f"Quà tặng: {g_str}")
                elif b_title:
                    promos.append(b_title)
                sub_titles = b.get('subTitle') or []
                for st in sub_titles:
                    c_st = re.sub(r'<[^>]*>', '', st).strip()
                    if c_st and c_st not in promos:
                        promos.append(c_st)
    if not promos:
        gift = product.get('gift')
        if isinstance(gift, dict) and gift.get('name'):
            promos.append(f"Quà tặng: {gift['name'].strip()}")
        gift_fs = product.get('giftFS')
        if isinstance(gift_fs, dict) and gift_fs.get('name'):
            promos.append(f"Quà tặng Flash Sale: {gift_fs['name'].strip()}")
    text_promos_cat = product.get('lstTextPromotion')
    if text_promos_cat:
        for tp in text_promos_cat:
            block = tp.get('lstBlockTextPromotion')
            if block:
                for b in block:
                    sub = b.get('subTitle')
                    if sub:
                        for html_text in sub:
                            clean_txt = re.sub(r'<[^>]*>', '', html_text).strip()
                            if clean_txt and clean_txt not in promos:
                                promos.append(clean_txt)
    promo_list = product.get('promotionList')
    if promo_list:
        for pl in promo_list:
            if isinstance(pl, dict):
                p_name = pl.get('name') or pl.get('title')
                if p_name and p_name.strip() and p_name.strip() not in promos:
                    promos.append(p_name.strip())
    unique_promos = []
    for p in promos:
        if p and p not in unique_promos:
            unique_promos.append(p)
    return " | ".join(unique_promos) if unique_promos else "Không có"


def fetch_flash_sale_codes(session):
    fs_codes = set()
    try:
        r_tl = session.get(
            f"https://api.avakids.com/gw/bus-ava-tmdt/api/v2/FlashSale/GetFlashSaleTimeLine?provinceId={PROVINCE_ID}",
            headers=HEADERS,
            timeout=10
        )
        if r_tl.status_code == 200:
            timelines = r_tl.json().get('data') or []
            for tl in timelines:
                tl_id = tl.get('timelineId')
                if not tl_id:
                    continue
                r_fs = session.post(
                    "https://api.avakids.com/gw/bus-ava-tmdt/api/v2/FlashSale/GetFlashSaleProducts",
                    headers=HEADERS,
                    json={"provinceId": PROVINCE_ID, "pageSize": 500, "timelineId": tl_id},
                    timeout=10
                )
                if r_fs.status_code == 200:
                    prods = r_fs.json().get('data') or []
                    for p in prods:
                        for code_field in ['productCode', 'productPEId', 'variantCode', 'id']:
                            val = p.get(code_field)
                            if val:
                                fs_codes.add(str(val))
    except Exception as e:
        print(f"[!] Cảnh báo khi tải Flash Sale Timeline: {e}")
    return fs_codes


def fetch_all_categories(session):
    menu_url = f"https://api.avakids.com/gw/bus-ava-tmdt/api/Static/GetMenu?provinceId={PROVINCE_ID}"
    r_menu = session.get(menu_url, headers=HEADERS, timeout=12)
    menu_data = r_menu.json().get('data') or []
    tasks = []
    seen = set()
    for parent in menu_data:
        pname = parent.get('name', '').strip()
        pid = parent.get('id')
        purl = parent.get('url', '').strip()
        if not purl.startswith('/'):
            purl = '/' + purl
        if 'sieu uu dai' in pname.lower() or 'chuong-trinh' in purl:
            continue
        children = parent.get('childrens') or []
        if not children:
            if purl not in seen:
                seen.add(purl)
                tasks.append({'nganh_hang': pname, 'nhom_hang': pname, 'url': purl, 'id': str(pid)})
        else:
            for ch in children:
                cname = ch.get('name', '').strip()
                cid = ch.get('id')
                curl = ch.get('url', '').strip()
                if not curl.startswith('/'):
                    curl = '/' + curl
                task_key = (pname, curl)
                if task_key not in seen:
                    seen.add(task_key)
                    tasks.append({'nganh_hang': pname, 'nhom_hang': cname, 'url': curl, 'id': str(cid)})
    return tasks


def scrape_category_products(session, task):
    nganh_hang = task['nganh_hang']
    nhom_hang_default = task['nhom_hang']
    curl = task['url']
    cid = task['id']
    cate_url = "https://api.avakids.com/gw/bus-ava-tmdt/api/Cate/GetproductCateV2"
    page_index = 0
    page_size = 1000
    category_products = []
    while True:
        payload = {
            "pageIndex": page_index,
            "pageSize": page_size,
            "provinceId": PROVINCE_ID,
            "urlCate": curl,
            "cateId": cid,
            "filters": [{"filterId": 1, "filterTypeId": 6, "sortName": "FEATURED_PRODUCTS", "url": ""}]
        }
        try:
            res = session.post(cate_url, headers=HEADERS, json=payload, timeout=18)
            if res.status_code != 200:
                break
            d = res.json().get('data') or {}
            prods = d.get('products') or []
            if not prods:
                break
            for p in prods:
                p['__nganh_hang'] = nganh_hang
                p['__nhom_hang_default'] = nhom_hang_default
                category_products.append(p)
            total_prod = d.get('totalProduct', 0)
            if len(category_products) >= total_prod or len(prods) < page_size:
                break
            page_index += 1
        except Exception:
            break
    return category_products


def fetch_single_promotion_detail(session, product):
    model_code = str(product.get('id') or '')
    prod_code = str(product.get('productCode') or product.get('productPEId') or '')
    if not model_code or not prod_code:
        return prod_code, None
    url = (
        f"https://api.avakids.com/gw/bus-ava-tmdt/api/Product/GetPromotionDetail"
        f"?ModelCode={model_code}&ProductCode={prod_code}&ProvinceId={PROVINCE_ID}&DistrictId=0&WardId=0&isFlashSale=false"
    )
    try:
        res = session.get(url, headers=HEADERS, timeout=6)
        if res.status_code == 200:
            return prod_code, res.json().get('data')
    except Exception:
        pass
    return prod_code, None


def parse_product_record(p, fs_codes, update_time_str, promo_detail=None):
    name = (p.get('name') or '').strip()
    code = str(p.get('productCode') or p.get('productPEId') or p.get('id') or '')
    pe_id = str(p.get('productPEId') or '')
    variant_code = str(p.get('variantCode') or '')

    nganh_hang = p.get('__nganh_hang') or "Mẹ và Bé"
    nhom_hang = p.get('cateName') or p.get('__nhom_hang_default') or "Khác"

    brand_obj = p.get('brand')
    brand_name = ""
    if isinstance(brand_obj, dict):
        brand_name = brand_obj.get('brandName', '').strip()
    elif isinstance(brand_obj, str):
        brand_name = brand_obj.strip()
    if not brand_name:
        brand_name = extract_brand_fallback(name)

    prices = p.get('productPrices') or [{}]
    p0 = prices[0]
    sys_price = clean_number(p0.get('sysPrice', 0))
    current_price = clean_number(p0.get('price', 0))

    if sys_price <= 0:
        sys_price = current_price
    if current_price <= 0 and sys_price > 0:
        current_price = sys_price

    # Quy tắc: nếu Giá gốc == Giá giảm (không giảm giá) -> đưa giá vào Giá giảm, để trống Giá gốc (0)
    if sys_price > 0 and current_price > 0 and abs(sys_price - current_price) < 1e-6:
        orig_price = 0.0
        sale_price = current_price
    else:
        orig_price = sys_price
        sale_price = current_price

    tiet_kiem = max(0.0, orig_price - sale_price) if orig_price > 0 else 0.0
    phan_tram_giam = round((tiet_kiem / orig_price * 100.0), 2) if orig_price > 0 else 0.0

    is_flash_sale = False
    if p.get('flashSaleInfo') is not None:
        is_flash_sale = True
    elif code in fs_codes or pe_id in fs_codes or variant_code in fs_codes:
        is_flash_sale = True
    else:
        for pr in prices:
            if pr.get('saleProgramTypeId') == 1 or pr.get('orderTypeId') == 341 or pr.get('outputTypeId') == 222:
                is_flash_sale = True
                break

    loai_gia = "Giá Flash Sale" if is_flash_sale else "Giá thường"
    promo_str = clean_promotions(p, promo_detail)

    return {
        "product_code": code,
        "category_group": nganh_hang,
        "sub_category": nhom_hang,
        "brand": brand_name,
        "product_name": name,
        "original_price": orig_price,
        "sale_price": sale_price,
        "discount_pct": phan_tram_giam,
        "price_type": loai_gia,
        "promo_text": promo_str,
        "is_flash_sale": is_flash_sale,
        "updated_at": update_time_str,
        "_sort_key": (nganh_hang.lower(), nhom_hang.lower(), brand_name.lower(), name.lower()),
    }


def sync_to_supabase(records: list[dict]):
    if not SUPABASE_SECRET_KEY:
        raise ValueError("Thiếu SUPABASE_SECRET_KEY trong biến môi trường / GitHub Secrets!")

    headers = {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/clear_product_catalog"
    resp_clear = requests.post(rpc_url, headers=headers, json={})
    if resp_clear.status_code not in (200, 204):
        raise RuntimeError(f"Lỗi xóa dữ liệu cũ ({resp_clear.status_code}): {resp_clear.text}")

    insert_url = f"{SUPABASE_URL}/rest/v1/{TABLE_NAME}"
    total_inserted = 0
    clean_payload = [
        {k: v for k, v in rec.items() if not k.startswith("_")}
        for rec in records
    ]

    for i in range(0, len(clean_payload), BATCH_SIZE):
        batch = clean_payload[i : i + BATCH_SIZE]
        resp = requests.post(insert_url, headers=headers, json=batch)
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Lỗi đẩy lô {i // BATCH_SIZE + 1} ({resp.status_code}): {resp.text}")
        total_inserted += len(batch)
        print(f"Đã đẩy: {total_inserted}/{len(clean_payload)} dòng...")

    return total_inserted


def run_all():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    update_time_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    start_time = time.time()

    print("==================================================================")
    print(" HỆ THỐNG CÀO GIÁ & ĐỒNG BỘ SUPABASE AVAKIDS (1 FILE GỘP)")
    print(f" Thời gian thực hiện: {update_time_str}")
    print("==================================================================")

    session = get_session()

    print("\n[+] BƯỚC 1: Quét danh sách Flash Sale...")
    fs_codes = fetch_flash_sale_codes(session)
    print(f"-> Đã phát hiện {len(fs_codes)} mã Flash Sale.")

    print("\n[+] BƯỚC 2: Quét toàn bộ cây danh mục AVAKids...")
    tasks = fetch_all_categories(session)
    print(f"-> Tìm thấy {len(tasks)} danh mục.")

    print("\n[+] BƯỚC 3: Tải danh sách sản phẩm đa luồng...")
    all_raw = []
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {executor.submit(scrape_category_products, session, t): t for t in tasks}
        completed = 0
        for f in as_completed(futures):
            all_raw.extend(f.result())
            completed += 1
            if completed % 20 == 0 or completed == len(tasks):
                print(f"    Tiến độ: {completed}/{len(tasks)} danh mục ({len(all_raw)} lượt SP)...")

    print("\n[+] BƯỚC 4: Lọc trùng & lấy chi tiết quà tặng...")
    unique_map = {}
    for p in all_raw:
        code = str(p.get('productCode') or p.get('productPEId') or p.get('id') or p.get('name'))
        if code not in unique_map:
            unique_map[code] = p

    products_with_promo = [
        p for p in unique_map.values()
        if p.get('gift') or p.get('giftFS') or p.get('lstTextPromotion') or p.get('promotionList')
    ]
    promo_details_map = {}
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(fetch_single_promotion_detail, session, p) for p in products_with_promo]
        for f in as_completed(futures):
            p_code, promo_data = f.result()
            if p_code and promo_data:
                promo_details_map[p_code] = promo_data

    parsed_records = []
    for _, p in unique_map.items():
        promo_data = promo_details_map.get(str(p.get('productCode') or p.get('productPEId') or ''))
        rec = parse_product_record(p, fs_codes, update_time_str, promo_data)
        if rec['sale_price'] > 0 or rec['original_price'] > 0:
            parsed_records.append(rec)

    parsed_records.sort(key=lambda x: x['_sort_key'])
    print(f"-> Tổng số SP hợp lệ: {len(parsed_records):,}")

    if not parsed_records:
        raise RuntimeError("Không có dữ liệu sản phẩm hợp lệ để đồng bộ!")

    print("\n[+] BƯỚC 5: Đẩy dữ liệu trực tiếp lên Supabase...")
    count = sync_to_supabase(parsed_records)

    elapsed = time.time() - start_time
    print(f"\nHOÀN TẤT ĐỒNG BỘ {count:,} SẢN PHẨM TRONG {elapsed:.1f} GIÂY!")


if __name__ == "__main__":
    run_all()
