# Uzum Sklad

Uzum Market sotuvchilari uchun sklad, buyurtma va moliya boshqaruv paneli.
[Uzum Seller OpenAPI](https://api-seller.uzum.uz/api/seller-openapi/swagger/swagger-ui/webjars/swagger-ui/index.html)
ustiga qurilgan — spetsifikatsiyadagi **38 ta amal (35 yo'l) to'liq ulangan**.

React 19 · Vite 6 · Tailwind CSS 4 · i18next (uz / ru / en) · Express proxy

---

## Tez boshlash

```bash
npm install
cp .env.example .env     # kerak bo'lsa tahrirlang
npm run dev              # http://localhost:5173
```

Ilova ochilgach API tokenni kiriting. Tokenni
[seller.uzum.uz/seller/api-keys](https://seller.uzum.uz/seller/api-keys) dan olasiz.

### Production

```bash
npm run start            # build + Express server, http://localhost:3000
```

yoki alohida:

```bash
npm run build
npm run server
```

### Vercel'ga joylash

Vercel'da uzoq ishlaydigan Express serveri bo'lmaydi, shuning uchun proxy
serverless funksiya sifatida `api/` papkasida turadi:

| Fayl | Vazifasi |
|---|---|
| `api/uzum/[...path].js` | `/api/uzum/*` → Uzum API |
| `api/config.js` | Serverda token bor-yo'qligini aytadi |
| `api/_lib/proxy.js` | Ikkala proxy uchun umumiy xavfsizlik qatlami |
| `vercel.json` | SPA marshrutlari + xavfsizlik sarlavhalari |

#### Muhit o'zgaruvchilari

**Hech narsa qo'yish shart emas** — standart qiymatlar to'g'ri ishlaydi.
Quyidagilar faqat kerak bo'lganda:

| O'zgaruvchi | Standart | Qachon kerak |
|---|---|---|
| `UZUM_API_BASE` | `https://api-seller.uzum.uz` | Uzum manzili o'zgarsa |
| `UZUM_API_PREFIX` | `/api/seller-openapi` | API prefiksi o'zgarsa |
| `UZUM_API_TOKEN` | *(bo'sh)* | **Ochiq deployda qo'ymang** — pastga qarang |
| `ALLOW_SERVER_TOKEN` | *(bo'sh)* | Serverdagi tokenni ishlatish uchun `1` |

---

## Xavfsizlik

Ilova ochiq manzilga joylanganda (masalan Vercel) quyidagilar amal qiladi.

#### Token

Token **brauzerda** saqlanadi va faqat `X-Uzum-Token` sarlavhasida shu
ilovaning o'z proxy'siga yuboriladi. Har bir foydalanuvchi o'z tokenini
kiritadi — birov boshqasining ma'lumotini ko'rmaydi.

> `UZUM_API_TOKEN` ni ochiq deployga qo'ymang. Qo'ysangiz, havolani bilgan
> **har kim** sizning do'kon, buyurtma va moliya ma'lumotlaringizni ko'radi.
> Shuning uchun u qo'shimcha `ALLOW_SERVER_TOKEN=1` bo'lmasa ishlamaydi.

#### Proxy himoyasi

| Chora | Tafsilot |
|---|---|
| Metod cheklovi | Faqat `GET` va `POST`; qolganlari → 405 |
| Yo'l tekshiruvi | Faqat `/v1`, `/v2`, `/v3`; `..` va kodlangan variantlari → 400 |
| Manzil doirasi | Yakuniy URL `api-seller.uzum.uz` ichida qolishi majburiy |
| Sarlavha filtri | Yuqoriga faqat `content-type`, `accept`, `accept-language` uzatiladi |
| Tana hajmi | 2 MB dan katta so'rov → 413 |
| Chastota | Bitta IP uchun daqiqasiga 240 so'rov → 429 |
| CORS | Yo'q — proxy boshqa saytlardan chaqirilmaydi |
| Kesh | `no-store` — javoblar oraliq keshlarda qolmaydi |

#### Sarlavhalar

`Content-Security-Policy` (skript faqat `'self'`), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`Permissions-Policy` (kamera/mikrofon/geolokatsiya o'chirilgan),
`Strict-Transport-Security`.

#### Kirishni cheklash

Eng ishonchli yo'l — Vercel'ning o'z himoyasi:
**Project → Settings → Deployment Protection → Password Protection**.
U kodgacha, chekkada ishlaydi.

Ilova faqat o'zingiz uchun bo'lsa, uni ochiq internetga chiqarmay
`npm run start` bilan lokal ishlatish xavfsizroq.

---|---|
| `api/uzum/[...path].js` | `/api/uzum/*` → Uzum API (`server/index.js` bilan bir xil) |
| `api/config.js` | Serverda token bor-yo'qligini aytadi |
| `vercel.json` | SPA marshrutlari `index.html` ga yo'naltiriladi, `/api/*` funksiyalarga |

Muhit o'zgaruvchilari Vercel → Settings → Environment Variables da
qo'yiladi (`UZUM_API_BASE`, `UZUM_API_PREFIX`, `UZUM_API_TOKEN`).

> **Diqqat:** Vercel manzili ochiq bo'ladi. `UZUM_API_TOKEN` ni Vercel'ga
> qo'ysangiz, havolani bilgan **har kim** sizning do'kon ma'lumotlaringizni
> ko'radi. Uni bo'sh qoldiring — shunda har bir foydalanuvchi o'z tokenini
> kiritadi va u faqat o'sha brauzerda saqlanadi.

---

## Nima uchun proxy kerak

Uzum Seller API brauzerdan kelgan so'rovlarga CORS sarlavhalarini qaytarmaydi —
frontend unga to'g'ridan-to'g'ri murojaat qila olmaydi. Shuning uchun so'rovlar
ikki bosqichdan o'tadi:

```
brauzer  →  /api/uzum/v1/shops
            ↓  (dev: Vite proxy · prod: server/index.js)
            https://api-seller.uzum.uz/api/seller-openapi/v1/shops
            Authorization: <token>          ← Bearer prefiksisiz
```

Token ikki joyda saqlanishi mumkin:

| Rejim | Qayerda | Qachon qulay |
|---|---|---|
| Klient | Brauzer `localStorage`, so'rovda `X-Uzum-Token` sarlavhasi | Bir foydalanuvchi, lokal ish |
| Server | `.env` dagi `UZUM_API_TOKEN` | Token brauzerga umuman tushmasligi kerak bo'lganda |

Serverda token bo'lsa `/api/config` buni aytadi va kirish ekrani chetlab o'tiladi.

---

## Bo'limlar

| Sahifa | Endpointlar | Imkoniyatlar |
|---|---|---|
| **Boshqaruv paneli** | `/v2/fbs/orders`, `/v2/fbs/orders/count`, `/v1/product/shop/{id}`, `/v3/fbs/sku/stocks`, `/v1/finance/orders`, `/v1/finance/expenses` | Statuslar bo'yicha sanoq, buyurtmalar grafigi, moliyaviy xulosa (tushum · foyda · komissiya · xarajat · sof foyda), shoshilinch buyurtmalar, qoldig'i kam SKU lar |
| **Mahsulotlar** | `/v1/product/shop/{id}`, `/v1/product/{id}/sendPriceData`, `/v1/product/barcodes/types`, `/v1/product/shop/{id}/barcodes/print` | Qidiruv, filtr, saralash, SKU jadvali, narx tahriri, etiketka chop etish (PDF), **SKU kuzatuv kartasi** |
| **Qoldiqlar** | `/v3/fbs/sku/stocks`, `/v2/fbs/sku/stocks` (GET + POST) | Inline tahrir, faqat o'zgarganlarini saqlash, v3/v2 manba tanlovi |
| **Buyurtmalar** | `/v2/fbs/orders`, `/v1/fbs/order/{id}` va uning barcha amallari, `/v1/dbs/order/{id}/*`, `/v1/fbs/order/return-reasons`, `/v1/fbs/order/{id}/labels/print` | Tasdiqlash, bekor qilish, identifikator biriktirish, etiketka, DBS oqimi (yetkazish · topshirish · qaytarish), yuk xati yaratish |
| **FBS yuk xatlari** | `/v1/fbs/invoice` (barcha 11 ta amal) | Yaratish sehrgari (punkt → vaqt oralig'i), tarkibni o'zgartirish, punkt/vaqtni almashtirish, bekor qilish, dalolatnomalar (PDF) |
| **Yetkazib berish** | `/v1/shop/{id}/invoice`, `/v1/shop/{id}/invoice/products`, `/v1/invoice` | Do'kon bo'yicha va umumiy ro'yxat, xat tarkibi |
| **Qaytarishlar** | `/v1/shop/{id}/return`, `/v1/shop/{id}/return/{returnId}`, `/v1/return` | Ro'yxat, tarkib, tafsilot paneli |
| **Sotuvlar** | `/v1/finance/orders`, `/v1/finance/expenses` | Tushum/foyda grafigi, komissiya va logistika, sof foyda, rentabellik, o'rtacha chek |
| **Xarajatlar** | `/v1/finance/expenses` | Kirim/chiqim, manba bo'yicha filtr, balans |
| **Tovar aylanmasi** | `/v1/invoice`, `/v1/finance/orders`, `/v3/fbs/sku/stocks` | Kirim · sotuv · qaytarish · qoldiq bir jadvalda, kunlik o'rtacha sotuv, «necha kunga yetadi», tugayotgan SKU filtri |
| **Muammoli buyurtmalar** | `/v2/fbs/orders` (9 status) | Qabul/yetkazish muddati o'tgan, tugallanmagan, punktda olinmagan, yo'lda qotgan, bekor qilinayotgan va qaytarilganlar — tur bo'yicha tab va CSV |
| **Komissioner hisoboti** | `/v1/finance/orders` | Komissiya savdosi hujjati: sotuv, qaytarish, komissiya mukofoti, logistika, komitentga hisoblangan va to'lanmagan qoldiq. SKU / buyurtma / oy kesimi, CSV va chop etish |
| **Foyda va zarar** | `/v1/finance/orders`, `/v1/finance/expenses` | Tushum → daromad → yalpi foyda → operatsion foyda → sof foyda ketma-ketligi, oylik dinamika, xarajatlar taqsimoti |
| **Sozlamalar** | `/v1/shops` | Mavzu, til, jadval zichligi, token, ulanish testi |

### Tovarlarni kuzatib borish

Mahsulot qatorini yoyib, istalgan SKU yonidagi **Kuzatuv** tugmasi to'liq
kartani ochadi:

- **Identifikatorlar** — SKU ID, shtrix-kod, artikul, IKPU, sotuvchi kodi
- **Qoldiq taqsimoti** — yaratilgan, faol, FBS, qo'shimcha, kutilayotgan,
  fotostudiyada, arxivda, sotilgan, qaytarilgan, nuqsonli, yetishmayotgan
- **Iqtisodiyot** — narx, tannarx, komissiya, aylanma, kunlik o'rtacha sotuv,
  pullik saqlash
- **Jonli FBS qoldig'i** — `/v3/fbs/sku/stocks` dan kursor orqali olinadi
- **Sotuvlar tarixi** — oxirgi 90 kun (`/v1/finance/orders`)
- **Qaytarishlar tarixi** — `/v1/return` dan shu SKU bo'yicha filtrlangan

---

## Hisobotlar qanday hisoblanadi

Uzum Seller API tayyor hisobot bermaydi — quyidagi to'rt bo'lim uning xom
ma'lumotidan hisoblanadi. Har bir sahifada **Dev manba** belgisi bor
(Sozlamalar → Ko'rinish → Dev rejim): u qaysi endpoint, qanday parametr bilan
chaqirilganini va nechta yozuv kelganini ko'rsatadi.

### Komissioner hisoboti

`/v1/finance/orders` javobidagi pozitsiyalar davr bo'yicha yig'iladi:

| Ko'rsatkich | Formula / manba |
|---|---|
| Sotuv summasi | `sellPrice` (yoki `sellerPrice`) yig'indisi |
| Qaytarish summasi | `amountReturns` × birlik narx — API alohida summa bermaydi |
| Sof savdo | Sotuv − Qaytarish |
| Komissiya mukofoti | `commission` |
| Yetkazib berish | `logisticDeliveryFee` |
| Tannarx | `purchasePrice`, «o'z tannarxim» kiritilgan bo'lsa — o'sha |
| Komitentga hisoblangan | `sellerProfit` (Uzumning o'z hisobi) |
| To'langan | `withdrawnProfit` |
| To'lanmagan qoldiq | Hisoblangan − To'langan |

### Muammoli buyurtmalar

API'da «muammoli» filtri yo'q, shuning uchun status va muddatlardan
hisoblanadi (`utils/format.js` → `orderProblems`):

| Tur | Shart |
|---|---|
| Qabul muddati o'tgan | `CREATED`, `acceptUntil` < hozir |
| Tugallanmagan | `CREATED`/`PACKING` da 5 kundan ortiq |
| Yetkazish muddati o'tgan | `deliverUntil` < hozir, buyurtma yopilmagan |
| Yo'lda qotib qolgan | `DELIVERING`/`PENDING_DELIVERY` da 7 kundan ortiq |
| O'z vaqtida olinmagan | punktda 5 kundan ortiq |
| Bekor qilinmoqda | `PENDING_CANCELLATION` |
| Qaytarilgan | `RETURNED` |

Chegaralar `STUCK_DAYS`, `TRANSIT_DAYS`, `PICKUP_DAYS` doimiylarida.
`COMPLETED` va `CANCELED` skanerlanmaydi — ular harakat talab qilmaydi.

### Foyda va zarar

```
Tushum − Qaytarishlar                                  = Daromad
Daromad − Tannarx                                      = Yalpi foyda
Yalpi foyda − (komissiya + logistika + xarajatlar)     = Operatsion foyda
Operatsion foyda − Soliqlar                            = Sof foyda
```

`/v1/finance/expenses` dagi **`INCOME` to'lovlar daromadga qo'shilmaydi** —
ular hisobga yechib olingan foyda, ya'ni allaqachon sanalgan pulning
ko'chirilishi. Soliq qatoriga manba nomida `soliq / налог / QQS / tax`
uchraganlar tushadi: Uzum API soliq uchun alohida belgi bermaydi, shuning
uchun sahifada xarajatlar manba bo'yicha ochib ko'rsatiladi.

### Tovar aylanmasi

Uchta endpoint bitta jadvalga birlashtiriladi:

| Ustun | Manba |
|---|---|
| Kirim | `/v1/invoice` → `productForInvoiceDto.quantityAccepted` |
| Sotilgan / Qaytarilgan | `/v1/finance/orders` → `amount`, `amountReturns` |
| Joriy qoldiq | `/v3/fbs/sku/stocks` → `amount` |

Uchala manbada **yagona SKU kaliti yo'q**: birida shtrix-kod bor, boshqasida
faqat nom. Shuning uchun `utils/skuMatch.js` har bir yozuv uchun bir nechta
nomzod kalit (shtrix-kod → sotuvchi kodi → `skuId` → nom) hisoblab, bittasi
mos kelganlarni union-find orqali bitta guruhga qo'shadi.

Ikki ogohlantirish: **joriy qoldiq** davrga bog'liq emas (u hozirgi holat),
va `/v1/invoice` sana parametrini qabul qilmaydi — xatlar `dateAccepted`
bo'yicha brauzerda filtrlanadi.

---

## Uzum API nimani bermaydi

Loyiha faqat Uzum API qaytargan ma'lumot ustida ishlaydi. Quyidagilar
Uzum Seller OpenAPI'da **umuman yo'q**, shuning uchun bu bo'limlar ham yo'q:

- Kontragentlar, shartnomalar, o'z omborlaringiz
- Yetkazib beruvchilarga buyurtmalar, xaridlarni boshqarish
- Kassa, to'lovlar, pul oqimi, o'zaro hisob-kitoblar
- Tannarxli kirim hujjati (оприходование), tovar guruhlari, to'plamlar

Ular uchun alohida ma'lumot bazasi kerak bo'ladi — bu Uzum ma'lumotini
ko'rsatish emas, o'z buxgalteriyangizni yuritish demak.

Tannarx bo'yicha yagona istisno: `sendPriceData` faqat sotuv narxini
o'zgartiradi, tannarxni yozib bo'lmaydi. Shuning uchun «o'z tannarxim»
brauzerda saqlanadi (`useCostOverride`) va Rentabellik, Komissioner
hisoboti hamda Foyda va zarar sahifalarida hisobga olinadi.

---

## «Barcha ma'lumotlar» ko'rinishi

Har bir tafsilot panelida va jadval qatorlarini yoyganda
**Barcha ma'lumotlar** bo'limi bor. U API qaytargan obyektni rekursiv
chizadi — hech bir maydon yashirilmaydi:

- maydon nomlari `fields.*` lug'atidan uch tilda tarjima qilinadi
  (lug'atda yo'q yangi maydon ham yo'qolmaydi — nomi o'qiladigan ko'rinishga keltiriladi);
- sanalar mahalliy formatga, summalar so'mga keltiriladi;
- rasm havolalari kichik rasm sifatida chiziladi va yuqorida galereya yig'iladi;
- base64 PDF (dalolatnoma, etiketka) yuklab olish tugmasiga aylanadi;
- `{ }` tugmasi xom JSON ni ko'rsatadi, nusxalash tugmasi uni buferga oladi.

---

## Loyiha tuzilishi

```
src/
├─ api/
│  ├─ client.js       fetch o'rami: token, query, xato normalizatsiyasi, blob
│  ├─ endpoints.js    38 ta endpoint — swagger bo'limlari bo'yicha guruhlangan
│  ├─ bulk.js         hisobotlar uchun «barcha sahifani yuklash» qatlami
│  └─ constants.js    enum qiymatlari va ularning ranglari
├─ i18n/              uz · ru · en (interfeys + 179 ta API maydon nomi)
├─ context/           Theme (yorug'/qorong'i/tizim), Auth (token + do'kon), Toast
├─ hooks/             useApi (abort + refetch), useAction, useSelection, ...
├─ components/
│  ├─ ui/             Button, Input, Select, Badge, Modal, Drawer, DataTable, ...
│  ├─ common.jsx      StatusBadge, ProductCell, DateRangeFilter, FilterBar
│  ├─ DataViewer.jsx  «Barcha ma'lumotlar» rekursiv ko'rinishi
│  ├─ ProductTracking.jsx  SKU kuzatuv kartasi
│  └─ layout/         Sidebar, Topbar, AppLayout
├─ pages/             14 ta sahifa
└─ utils/
   ├─ format.js       pul, sana, muddat, base64→PDF, buyurtma muammolari
   └─ skuMatch.js     turli endpointdagi bir xil SKU ni birlashtirish (union-find)
server/index.js       production proxy + SPA
```

---

## Sozlamalar (`.env`)

| O'zgaruvchi | Standart | Izoh |
|---|---|---|
| `UZUM_API_BASE` | `https://api-seller.uzum.uz` | API bazaviy manzili |
| `UZUM_API_PREFIX` | `/api/seller-openapi` | API prefiksi |
| `UZUM_API_TOKEN` | *(bo'sh)* | Serverda saqlanadigan token |
| `PORT_DEV` | `5173` | Vite dev server porti |
| `PORT` | `3000` | Express server porti |
| `CORS_ORIGIN` | `http://localhost:5173` | Proxy'ga ruxsat etilgan manbalar |

---

## Skriptlar

| Buyruq | Nima qiladi |
|---|---|
| `npm run dev` | Vite dev server (proxy bilan) |
| `npm run build` | `dist/` ga yig'ish |
| `npm run preview` | Yig'ilgan versiyani ko'rish |
| `npm run server` | Faqat Express proxy + SPA |
| `npm run start` | `build` + `server` |
| `npm run lint` | ESLint |

---

## Bilib qo'yish kerak

- **Sahifalash 0 dan boshlanadi** — Uzum API shuni kutadi, UI 1 dan ko'rsatadi.
- **Summalar butun so'mda** keladi, tiyinsiz.
- **Sanalar** ba'zi endpointlarda ISO satr, ba'zilarida epoch millisekund —
  `utils/format.js` ikkalasini ham qabul qiladi.
- **Filtrda `statuses` majburiy** (`/v1/fbs/invoice`) — shuning uchun boshida
  barcha statuslar tanlangan holda keladi.
- **Qoldiqni yangilash uchun shtrix-kod shart** — shtrix-kodsiz SKU maydoni
  o'chirilgan holda ko'rsatiladi.
- **Yuk xati yaratishda** faqat `PACKING` yoki `PENDING_DELIVERY` holatidagi
  FBS buyurtmalar tanlanadi.
