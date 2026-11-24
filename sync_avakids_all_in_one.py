import glob
import io
import os
import re
import sys
import time
import datetime
import requests
import pandas as pd
import openpyxl
from concurrent.futures import ThreadPoolExecutor, as_completed

# --- CẤU HÌNH HỆ THỐNG ---
FILE_OUTPUT = "BANG_GIA_AVAKIDS.xlsx"
SHEET_NAME = "Tất cả sản phẩm"
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