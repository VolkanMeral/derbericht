// Legal pages. Everything in [ECKIGEN KLAMMERN] must be filled in before launch and checked by a lawyer.

import { COUNTRY_FLAG, type Country } from "./sources.ts";
import { escapeHtml as e } from "./text.ts";

export function impressum(): string {
  return `<div class="prose"><h1>Impressum &amp; Offenlegung</h1>
<h2>Angaben gemäß § 5 ECG und § 25 MedienG</h2>
<p><strong>Medieninhaber und Herausgeber:</strong><br>[NAME / FIRMA]<br>[STRASSE NR]<br>[PLZ ORT], Österreich</p>
<p><strong>Kontakt:</strong> E-Mail: [E-MAIL] · Telefon: [TELEFON]</p>
<p><strong>Unternehmensgegenstand:</strong> [z. B. Betrieb von Online-Informationsdiensten]<br>
[UID-Nummer: …] · [Firmenbuchnummer / Firmenbuchgericht, falls vorhanden] · [Gewerbebehörde / Kammerzugehörigkeit, falls zutreffend]</p>
<h2>Grundlegende Richtung (Blattlinie)</h2>
<p>Der Bericht ist ein unabhängiger, automatisierter Nachrichtenüberblick. Er zeigt Schlagzeilen und sehr kurze Auszüge von Nachrichtenartikeln aus Österreich, Deutschland und der Schweiz und verlinkt auf die Originalartikel der jeweiligen Herausgeber. Die Auswahl erfolgt automatisch nach Aktualität und der Zahl der berichtenden Redaktionen, ohne politische Gewichtung.</p>
<h2>Hinweise</h2>
<p>Die verlinkten Inhalte stammen von den jeweiligen Herausgebern; für deren Inhalt sind ausschließlich diese verantwortlich. Bilder mit dem Hinweis „KI-Illustration“ wurden mit künstlicher Intelligenz erzeugt (Art. 50 KI-Verordnung) und stellen keine realen Ereignisse oder Personen dar.</p>
<p>Herausgeber, die nicht verlinkt werden möchten, finden auf der Seite <a href="/quellen">Quellen &amp; Opt-out</a> den Weg zur Entfernung.</p></div>`;
}

export function datenschutz(): string {
  return `<div class="prose"><h1>Datenschutzerklärung</h1>
<p><strong>Verantwortlicher:</strong> [NAME / FIRMA], [ADRESSE], [E-MAIL]</p>
<h2>Was wir verarbeiten</h2>
<p>Diese Website verwendet keine Tracking-Tools, keine Werbe-Cookies und lädt keine Schriften oder Skripte von Dritten.</p>
<ul>
<li><strong>Hosting:</strong> Die Website läuft bei Cloudflare, Inc. Beim Aufruf verarbeitet Cloudflare technisch notwendige Daten (z. B. IP-Adresse, Zeitpunkt, aufgerufene Seite), um die Seite auszuliefern und vor Angriffen zu schützen (Art. 6 Abs. 1 lit. f DSGVO).</li>
<li><strong>Länderauswahl:</strong> Aus der IP-Adresse wird nur das Land abgeleitet, um passende Nachrichten zu zeigen. Die IP-Adresse wird dafür nicht gespeichert.</li>
<li><strong>Cookie „edition“:</strong> Wenn Sie eine Ausgabe (DACH, AT, DE, CH) wählen, speichern wir diese Wahl für ein Jahr in einem technisch notwendigen Cookie. Es enthält nur das Kürzel der Ausgabe.</li>
</ul>
<h2>Externe Links</h2>
<p>Beim Klick auf einen Artikel verlassen Sie diese Website. Es gilt dann die Datenschutzerklärung des jeweiligen Herausgebers.</p>
<h2>Ihre Rechte</h2>
<p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch. Beschwerden können Sie bei der Österreichischen Datenschutzbehörde (dsb.gv.at) einbringen.</p>
<p><em>[Dieser Text ist ein Entwurf. Vor dem Einsatz von Werbung (z. B. Google AdSense) muss er erweitert und ein Einwilligungs-Banner (CMP) eingebaut werden.]</em></p></div>`;
}

export function quellen(feeds: { publisher: string; country: Country; homepage: string; active: number }[]): string {
  const rows = feeds.filter((f) => f.active).map((f) =>
    `<tr><td>${COUNTRY_FLAG[f.country]}</td><td><a href="${e(f.homepage)}" target="_blank" rel="noopener">${e(f.publisher)}</a></td></tr>`).join("");
  return `<div class="prose"><h1>Quellen &amp; Opt-out</h1>
<p>Der Bericht zeigt von den folgenden Herausgebern ausschließlich die Schlagzeile, einen Auszug von höchstens 120 Zeichen und einen Link zum Originalartikel. Wir übernehmen keine Fotos und keine Volltexte. Auszüge werden nach 48 Stunden gelöscht, Schlagzeile und Link nach 14 Tagen.</p>
<table><thead><tr><th></th><th>Herausgeber</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Sie möchten nicht verlinkt werden?</h2>
<p>Schreiben Sie an <strong>[E-MAIL]</strong> mit Ihrer Domain. Wir entfernen Ihre Inhalte innerhalb von 24 Stunden vollständig und nehmen sie nicht mehr auf.</p>
<p>Unser Abruf-Programm meldet sich als <code>DerBerichtBot/1.0</code> und liest ausschließlich öffentliche RSS-Feeds.</p></div>`;
}
