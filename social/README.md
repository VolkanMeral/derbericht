# Der Bericht – Otomatik Facebook & Instagram paylaşımı

havadis-otomasyon ile aynı yapı: GitHub Actions saatte bir çalışır, sunucu gerekmez.

**Her saat :05'te (Viyana 08:05–22:05):**
1. `https://derbericht.com/api/social.json` adresinden en çok gazetenin yazdığı haberleri alır (varsayılan: en az 3 redaksiyon, son 8 saat, sitenin kendi KI resmi olanlar).
2. Henüz paylaşılmamış en önemli haberi seçer.
3. `kart.html` şablonundan 1080×1350 görsel üretir: KI resmi, başlık, başlığın kaynağı, kaç gazete yazdı (bayraklarla), derbericht.com.
4. Facebook sayfasına (haberin derbericht.com'daki karşılaştırma sayfasına linkle), Instagram'a ve isteğe bağlı Threads'e paylaşır.
5. Paylaşılan haberi `posted.json` dosyasına yazar, aynı haber iki kez paylaşılmaz.

Yeni haber yoksa çalışma birkaç saniyede biter. Günde en fazla 15 paylaşım.

**Hukuki çerçeve sitedekiyle aynı:** sadece başlık, kaynak adı ve kendi KI resmimiz. Gazetelerin fotoğrafı veya metni kullanılmaz. Resimde ve metinde "KI-Illustration" yazar.

## Kurulum

havadis.at'te zaten bir Meta geliştirici uygulaman var; **aynı uygulama kullanılabilir**, sadece Der Bericht sayfasının anahtarı alınır.

1. **Instagram'ı Facebook sayfasına bağla:** Instagram → İşletme hesabı; Facebook Der Bericht sayfası → Ayarlar → Bağlı hesaplar → Instagram.
2. **Anahtarları al** (developers.facebook.com → Araçlar → Graph API Explorer, havadis'teki uygulamayı seç):
   - İzinler: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`. İzin penceresinde **Der Bericht sayfasını da işaretle**.
   - Kısa süreli anahtarı Access Token Debugger'da "Extend Access Token" ile uzat.
   - `me/accounts` sorgusu → Der Bericht satırındaki `id` = **META_PAGE_ID**, `access_token` = **META_PAGE_TOKEN**.
   - `<META_PAGE_ID>?fields=instagram_business_account` → çıkan `id` = **IG_USER_ID**.
3. **GitHub'a ekle:** github.com/VolkanMeral/derbericht → Settings → Secrets and variables → Actions
   - Secrets: `META_PAGE_ID`, `META_PAGE_TOKEN`, `IG_USER_ID` (isteğe bağlı `THREADS_TOKEN`)
   - Variables: `DRY_RUN` = `1`
4. **Dene:** Actions → "Social Media" → Run workflow
   - Önce `sadece_kontrol` = 1: sayfa ve Instagram adı görünüyorsa bağlantı tamam.
   - Sonra `dry_run` = 1: Artifacts bölümünden görseli ve metinleri indir, kontrol et.
   - Beğenirsen Variables → `DRY_RUN` = `0`. Sistem artık her saat kendiliğinden paylaşır.

Anahtarları kimseyle paylaşma, sohbete de yapıştırma; sadece GitHub Secrets'a gir.

## Ayarlar (Variables)
| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `DRY_RUN` | `1` | `1` = paylaşma, sadece görsel üret |
| `MIN_SOURCES` | `3` | En az kaç gazetenin yazdığı haberler paylaşılsın |
| `MAX_AGE_HOURS` | `8` | Bundan eski haberler paylaşılmaz |

Paylaşım saatleri: `.github/workflows/social.yml` içindeki `cron` satırı (saatler UTC). Tasarım: `social/kart.html`.
