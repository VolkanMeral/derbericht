// Legal / info pages. The text is editable in the admin area (Seiten); these Markdown texts are the
// defaults used until someone saves a version. Everything in [ECKIGEN KLAMMERN] must be filled in.

import { type Country } from "./sources.ts";
import { flag } from "./render.ts";
import { escapeHtml as e } from "./text.ts";
import { renderMarkdown } from "./markdown.ts";
import type { Env } from "./types.ts";

export type PageSlug = "impressum" | "datenschutz" | "quellen";
export const PAGE_SLUGS: PageSlug[] = ["impressum", "datenschutz", "quellen"];

export const PAGE_DEFAULTS: Record<PageSlug, { title: string; body: string; hint: string }> = {
  impressum: {
    title: "Impressum & Offenlegung",
    hint: "Pflichtangaben nach § 5 ECG und § 25 MedienG.",
    body: `## Angaben gemäß § 5 ECG und § 25 MedienG

**Medieninhaber und Herausgeber:**
[NAME / FIRMA]
[STRASSE NR]
[PLZ ORT], Österreich

**Kontakt:** E-Mail: [E-MAIL] · Telefon: [TELEFON]

**Unternehmensgegenstand:** [z. B. Betrieb von Online-Informationsdiensten]
[UID-Nummer] · [Firmenbuchnummer / Firmenbuchgericht, falls vorhanden] · [Gewerbebehörde / Kammerzugehörigkeit, falls zutreffend]

## Grundlegende Richtung (Blattlinie)

Der Bericht ist ein unabhängiger Nachrichtenüberblick. Er zeigt Schlagzeilen und sehr kurze Auszüge von Nachrichtenartikeln aus Österreich, Deutschland und der Schweiz und verlinkt auf die Originalartikel der jeweiligen Herausgeber. Die Auswahl erfolgt automatisch nach Aktualität und der Zahl der berichtenden Redaktionen, ohne politische Gewichtung. Eigene Beiträge der Redaktion sind als „Aus der Redaktion“ bzw. „Kommentar“ gekennzeichnet.

## Hinweise

Die verlinkten Inhalte stammen von den jeweiligen Herausgebern; für deren Inhalt sind ausschließlich diese verantwortlich. Bilder mit dem Hinweis „KI-Illustration“ wurden mit künstlicher Intelligenz erzeugt (Art. 50 KI-Verordnung) und stellen keine realen Ereignisse oder Personen dar. Entgeltliche Einschaltungen sind als „Anzeige“ gekennzeichnet.

Herausgeber, die nicht verlinkt werden möchten, finden auf der Seite [Quellen & Opt-out](/quellen) den Weg zur Entfernung.`,
  },
  datenschutz: {
    title: "Datenschutzerklärung",
    hint: "Muss erweitert werden, bevor Werbenetzwerke (z. B. Google AdSense) eingebunden werden.",
    body: `**Verantwortlicher:** [NAME / FIRMA], [ADRESSE], [E-MAIL]

## Was wir verarbeiten

Diese Website verwendet keine Tracking-Tools und lädt keine Schriften oder Skripte von Dritten.

- **Hosting:** Die Website läuft bei Cloudflare, Inc. Beim Aufruf verarbeitet Cloudflare technisch notwendige Daten (z. B. IP-Adresse, Zeitpunkt, aufgerufene Seite), um die Seite auszuliefern und vor Angriffen zu schützen (Art. 6 Abs. 1 lit. f DSGVO).
- **Länderauswahl:** Aus der IP-Adresse wird nur das Land abgeleitet, um passende Nachrichten zu zeigen. Die IP-Adresse wird dafür nicht gespeichert.
- **Cookie „edition“:** Wenn Sie eine Ausgabe (DACH, AT, DE, CH) wählen, speichern wir diese Wahl für ein Jahr in einem technisch notwendigen Cookie. Es enthält nur das Kürzel der Ausgabe.
- **Werbung:** Banner werden von unserem eigenen Server ausgeliefert. Wir zählen Einblendungen und Klicks ohne personenbezogene Daten.

## Externe Links

Beim Klick auf einen Artikel verlassen Sie diese Website. Es gilt dann die Datenschutzerklärung des jeweiligen Herausgebers.

## Ihre Rechte

Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch. Beschwerden können Sie bei der Österreichischen Datenschutzbehörde ([dsb.gv.at](https://www.dsb.gv.at)) einbringen.`,
  },
  quellen: {
    title: "Quellen & Opt-out",
    hint: "Text über der Quellenliste. Die Liste der Herausgeber wird automatisch darunter angezeigt.",
    body: `Der Bericht zeigt von den folgenden Herausgebern ausschließlich die Schlagzeile, einen Auszug von höchstens 120 Zeichen und einen Link zum Originalartikel. Wir übernehmen keine Fotos und keine Volltexte. Auszüge werden nach 48 Stunden gelöscht, Schlagzeile und Link nach 14 Tagen.

## Sie möchten nicht verlinkt werden?

Schreiben Sie an **[E-MAIL]** mit Ihrer Domain. Wir entfernen Ihre Inhalte innerhalb von 24 Stunden vollständig und nehmen sie nicht mehr auf.

Unser Abruf-Programm meldet sich als DerBerichtBot/1.0 und liest ausschließlich öffentliche RSS-Feeds.`,
  },
};

export interface PageRow { slug: PageSlug; title: string; body: string; updated: number | null; updated_by_name?: string | null }

export async function getPage(env: Env, slug: PageSlug): Promise<PageRow> {
  const row = await env.DB.prepare(
    "SELECT p.slug, p.title, p.body, p.updated, u.name AS updated_by_name FROM pages p LEFT JOIN users u ON u.id = p.updated_by WHERE p.slug = ?",
  ).bind(slug).first<PageRow>();
  return row ?? { slug, title: PAGE_DEFAULTS[slug].title, body: PAGE_DEFAULTS[slug].body, updated: null };
}

export async function savePage(env: Env, slug: PageSlug, title: string, body: string, userId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO pages (slug, title, body, updated, updated_by) VALUES (?,?,?,?,?)
     ON CONFLICT(slug) DO UPDATE SET title = excluded.title, body = excluded.body, updated = excluded.updated, updated_by = excluded.updated_by`,
  ).bind(slug, title, body, Date.now(), userId).run();
}

export function pageHtml(p: PageRow, extra = ""): string {
  return `<div class="prose"><h1>${e(p.title)}</h1>${renderMarkdown(p.body)}${extra}</div>`;
}

export function feedTable(feeds: { publisher: string; country: Country; homepage: string; active: number }[]): string {
  const rows = feeds.filter((f) => f.active).map((f) =>
    `<tr><td>${flag(f.country)}</td><td><a href="${e(f.homepage)}" target="_blank" rel="noopener">${e(f.publisher)}</a></td></tr>`).join("");
  return `<h2>Herausgeber</h2><table><thead><tr><th></th><th>Herausgeber</th></tr></thead><tbody>${rows}</tbody></table>`;
}
