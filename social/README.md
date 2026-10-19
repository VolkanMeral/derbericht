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

## Tagesplan (seit Oktober 2026)
Der Bot läuft alle 30 Minuten und teilt zu diesen Wiener Zeiten (je ein Beitrag):

| Zeit | Format |
|---|---|
| 07:30 | Morgen-Briefing – die 5 Themen des Morgens |
| 09:00, 11:00, 14:00, 16:00, 19:00, 21:30 | einzelne Meldung (mind. 4 Redaktionen, eigene KI-Illustration) |
| 12:30 | „Nur in Österreich / Deutschland / der Schweiz ein Thema“ (täglich wechselnd) |
| 17:30 | DACH-Vergleich |
| 20:30 | Leser-Stimmung (Emoji-Reaktionen) |
| Sonntag 11:00 | Die Woche in Zahlen (statt Einzelmeldung) |

Fehlen für ein Format die Daten, wird stattdessen eine Einzelmeldung geteilt. Mit `ANTHROPIC_API_KEY` (Secret) schreibt Claude eigene, neutrale Themenzeilen; ohne Schlüssel wird die Schlagzeile mit Quelle gezeigt.
Testen: Actions → Social Media → Run workflow → `format` = `alle`, `dry_run` = `1` → Bilder unter Artifacts.
