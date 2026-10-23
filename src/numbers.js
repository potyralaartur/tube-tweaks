// Parses YouTube's abbreviated, localized counts ("1.2K views", "1,2 tys. wyświetleń",
// "12 345 Aufrufe", "3,4 mln") into numbers.
(function (root) {
  // Suffix → multiplier. Checked case-insensitively against the word after the number.
  const SUFFIXES = [
    [/^(k|tys|tsd|mil|тыс|тис|rb)$/i, 1e3],
    [/^(m|mln|mio|млн|mn|jt|tr)$/i, 1e6],
    [/^(bn|mld|mrd|млрд|md)$/i, 1e9],
  ];

  function suffixMultiplier(word) {
    if (!word) return 1;
    const w = word.replace(/\.$/, '');
    if (w === 'B') return 1e9; // English billions
    if (w === 'K' || w === 'k') return 1e3;
    if (w === 'M') return 1e6;
    for (const [re, mult] of SUFFIXES) if (re.test(w)) return mult;
    return 1;
  }

  // Returns a number, or null when the text has no count in it.
  function parseCount(text) {
    if (!text) return null;
    const t = String(text).replace(/ | /g, ' ').trim();
    if (/^(no|brak|keine|aucune|sin|nessuna|нет)\b/i.test(t)) return 0;
    const m = t.match(/(\d[\d.,' ]*\d|\d)\s*([^\d\s.,]+\.?)?/);
    if (!m) return null;
    let num = m[1];
    const mult = suffixMultiplier(m[2]);
    if (mult > 1) {
      // Abbreviated: the separator is a decimal point ("1.2K", "1,2 tys.").
      num = num.replace(/[ ']/g, '').replace(',', '.');
      return Math.round(parseFloat(num) * mult);
    }
    // Full number: every separator is a thousands separator.
    return parseInt(num.replace(/[.,' ]/g, ''), 10);
  }

  // Words used for "views" in YouTube's metadata line across common locales.
  const VIEW_WORDS = /view|wyświetle|aufruf|vue|visualiza|visualizz|просмотр|перегляд|weergave|visning|visualizações|görüntüleme|zhlédnutí|megtekintés|vizionăr|προβολ|次|조회|回視聴|lượt xem|tayangan|การดู/i;
  const LIVE_WORDS = /watching|ogląda|zuschauer|spectateur|viendo|guardando|смотр|kijk/i;

  // "6 hours ago", "1 day ago (edited)", "5 godzin temu", "vor 3 Tagen" → age in seconds, or null.
  const AGE_UNITS = [
    [/^(sec|sek|seg|сек)/i, 1],
    [/^(min|мин|хв)/i, 60],
    [/^(hour|hr|godz|stund|heure|hora|or[ae]|час|год|uur|saat)/i, 3600],
    [/^(day|dni|dzie|tag|jour|día|dia|giorn|д[ен]|dag|gün)/i, 86400],
    [/^(week|wk|tydz|tygod|woche|semaine|semana|settiman|недел|тиж|wek|hafta)/i, 604800],
    [/^(month|mo|miesi|monat|mois|mes|mês|mese|месяц|місяц|maand|ay)/i, 2592000],
    [/^(year|yr|rok|lat|jahr|an|año|ano|ann|год|лет|рік|jaar|yıl)/i, 31536000],
  ];
  function parseAge(text) {
    if (!text) return null;
    const t = String(text).toLowerCase();
    const m = t.match(/(\d+)\s*([^\d\s]+)/) || t.match(/()(\p{L}+)/u);
    if (!m) return null;
    const n = m[1] ? parseInt(m[1], 10) : 1;
    for (const [re, secs] of AGE_UNITS) if (re.test(m[2])) return n * secs;
    return null;
  }

  root.TTNumbers = { parseCount, parseAge, VIEW_WORDS, LIVE_WORDS };
})(typeof window !== 'undefined' ? window : globalThis);
