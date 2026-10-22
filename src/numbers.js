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

  root.TTNumbers = { parseCount, VIEW_WORDS, LIVE_WORDS };
})(typeof window !== 'undefined' ? window : globalThis);
