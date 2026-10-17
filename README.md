# Der Bericht — derbericht.com

Almanca konuşan ülkeler (Avusturya, Almanya, İsviçre) için tamamen otomatik haber köprüsü.
Site haber sitelerinin RSS'lerinden **başlık + en fazla 120 karakterlik özet + link** alır, aynı olayı
anlatan haberleri tek kartta toplar ve okuru haberin tamamı için kaynak siteye gönderir.

Cloudflare Workers üzerinde çalışır: D1 (veritabanı), R2 (KI görselleri), Workers AI (görsel üretimi), Cron (her 10 dakika).

## Ne yapıyor

| Bölüm | Açıklama |
| --- | --- |
| Haber çekme | 18 kaynak (AT/DE/CH) her 10 dakikada; RSS ve Atom |
| İçerik kuralları | Başlık + ≤120 karakter, fotoğraf asla alınmaz, takip parametreleri silinir, Abo işareti |
| Gruplama | Aynı olayı anlatan haberler tek kartta (Almanca birleşik kelimeleri tanır) |
| DACH-Vergleich | 2+ ülkeden kaynaklı haberler ülke ülke yan yana |
| KI görselleri | Sadece 2+ kaynaklı ve hassas olmayan haberler; illüstrasyon tarzı, kişi/yüz/yazı yok, "KI-Illustration" etiketi, günlük üst sınır |
| Ülke algılama | `/` ziyaretçinin ülkesine göre sıralanır; `/at` `/de` `/ch` asla yönlendirilmez, sadece öneri şeridi; seçim çerezde hatırlanır |
| Temizlik | Özet 48 saat sonra, başlık+link 14 gün sonra silinir; opt-out alan adları tamamen kaldırılır |
| SEO | hreflang (de-AT/de-DE/de-CH/x-default), sitemap, robots; tekil hikâye sayfaları `noindex` |
| Gizlilik | Harici font, script, takip yok |

## Admin paneli (/admin)

| Rol | Yetki |
| --- | --- |
| Administrator | Her şey + kullanıcı ekleme, rol verme, hesap kapatma |
| Redakteur | Tüm yazıları yayınlar, banner reklamlar, kaynaklar ve opt-out |
| Autor | Kendi yazılarını yazar ve onaya gönderir |

- **İlk kurulum:** Cloudflare → Worker `derbericht` → Settings → Variables and Secrets → Secret `SETUP_CODE`. Sonra `/admin` açılır ve kod ile ilk admin oluşturulur. Bu sayfa yalnızca bir kez çalışır.
- **Kendi yazılar:** Nachricht veya Kommentar; Markdown (## başlık, **kalın**, *italik*, [link](https://…), liste, > alıntı); kapak görseli (en fazla 1,5 MB, veritabanında saklanır). Yayınlananlar `/artikel/<slug>` adresinde, ana sayfada „Aus der Redaktion“ bölümünde ve `/redaktion` sayfasında görünür.
- **Werbung:** Yerler: üst, yan sütun, rubrikler arası. Görsel + link veya reklam kodu; başlangıç/bitiş tarihi; gösterim ve tıklama sayacı. Her reklam otomatik olarak „Anzeige“ etiketi alır (§ 26 MedienG).

## Sayfalar

`/` · `/at` `/de` `/ch` · `/<kategori>` ve `/at/<kategori>` · `/vergleich` · `/story/<id>` · `/quellen` · `/impressum` · `/datenschutz`

## Kurulum (bir kez)

Bilgisayarında Node.js 20+ gerekli.

```bash
git clone https://github.com/VolkanMeral/derbericht.git
cd derbericht
npm install
npx wrangler login

npx wrangler d1 create derbericht            # çıkan database_id'yi wrangler.toml'a yaz
npx wrangler r2 bucket create derbericht-images
npm run db:init                              # tabloları oluşturur
npx wrangler secret put ADMIN_TOKEN          # uzun rastgele bir şifre gir

npm run deploy
```

Sonra Cloudflare panelinde: **Workers → derbericht → Settings → Domains & Routes** altından
`derbericht.com` ve `www.derbericht.com` ekle (domain Cloudflare DNS'te olmalı).
`derbericht.at` için Cloudflare'de bir yönlendirme kuralı: `derbericht.at/*` → `https://derbericht.com/at`.

İlk haberleri hemen çekmek için:

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://derbericht.com/admin/run
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://derbericht.com/admin/feeds   # hangi feed hata veriyor
```

## Yerel test

```bash
npm test          # Cloudflare olmadan: sahte feed'ler + bellekte SQLite, 21 test
npm run dev       # wrangler ile yerel çalıştırma
```

## Yayın öncesi yapılacaklar

- [ ] `src/legal.ts` içindeki `[KÖŞELİ PARANTEZ]` alanlarını doldur (Impressum, Offenlegung, Datenschutz, opt-out e-postası)
- [ ] Her feed'in RSS kullanım şartlarını kontrol et; uygun olmayanları `src/sources.ts` içinde `active: false` yap (veya D1'de `terms_status = 'verboten'`)
- [ ] `/admin/feeds` ile tüm feed adreslerinin çalıştığını doğrula (bu ortamdan dış sitelere erişilemediği için adresler test edilmedi)
- [ ] Konsepti ve içerik kurallarını bir medya/telif avukatına kontrol ettir
- [ ] AdSense eklenmeden önce: onaylı bir çerez onay aracı (CMP) ve genişletilmiş Datenschutz

## Ayarlar (`wrangler.toml`)

| Değişken | Varsayılan | Anlamı |
| --- | --- | --- |
| `IMAGE_AI` | `on` | `off` = KI görseli yok, sadece kategori ikonları |
| `IMAGE_DAILY_LIMIT` | `60` | Günlük en fazla KI görseli |
| `IMAGES_PER_RUN` | `4` | Her 10 dakikalık çalışmada en fazla |

## Yeni kaynak eklemek

`src/sources.ts` → `FEEDS` listesine ekle. Veritabanı doluysa D1'e doğrudan ekle:

```bash
npx wrangler d1 execute derbericht --remote --command \
 "INSERT INTO feeds (id,publisher,country,url,homepage,category) VALUES ('krone','Kronen Zeitung','at','https://…/rss','https://www.krone.at','chronik')"
```

Yayıncı çıkmak isterse:

```bash
npx wrangler d1 execute derbericht --remote --command "INSERT INTO optouts (domain, added) VALUES ('ornek.at', strftime('%s','now')*1000)"
```
