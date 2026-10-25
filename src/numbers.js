// Parses YouTube's abbreviated, localized counts ("1.2K views", "1,2 tys. wyświetleń",
// "12 345 Aufrufe", "3,4 mln") into numbers.
(function (root) {
  // Suffix → multiplier. Checked case-insensitively against the word after the number.
  const SUFFIXES = [
    [/^(k|tys|tsd|тыс|тис|rb|tis|χιλ|tn|t|พัน)$/i, 1e3],
    [/^(หมื่น)$/i, 1e4],
    [/^(lakh|lac|แสน)$/i, 1e5],
    [/^(m|mln|mio|mill|млн|mn|jt|tr|εκ|mi|ล้าน)$/i, 1e6],
    [/^(crore|cr)$/i, 1e7],
    [/^(bn|mld|mrd|млрд|md|mr)$/i, 1e9],
  ];

  function suffixMultiplier(word, text) {
    if (!word) return 1;
    const dotted = /\.$/.test(word);
    const w = word.replace(/\.$/, '');
    // Turkish "B" is bin (thousand); elsewhere it's billions.
    if (w === 'B') return /görüntüleme|izlenme|beğen/i.test(text) ? 1e3 : 1e9;
    if (w === 'E') return 1e3; // Hungarian ezer
    if (w === 'N') return 1e3; // Vietnamese nghìn
    // "mil" is thousand in Spanish/Portuguese, "mil." million in Czech/Romanian.
    if (/^mil$/i.test(w)) return dotted ? 1e6 : 1e3;
    // East Asian units are written straight before the next word ("1.2万次观看", "1.2만회").
    if (/^[万萬만]/.test(w)) return 1e4;
    if (/^[億亿억]/.test(w)) return 1e8;
    if (/^[千천]/.test(w)) return 1e3;
    for (const [re, mult] of SUFFIXES) if (re.test(w)) return mult;
    return 1;
  }

  // Returns a number, or null when the text has no count in it (or one it can't read for sure).
  function parseCount(text) {
    if (!text) return null;
    const t = String(text).replace(/ | /g, ' ').trim();
    if (/^(no|brak|keine|aucune|sin|nessuna|нет)(?=\s|$)/i.test(t)) return 0;
    const m = t.match(/(\d[\d.,' ]*\d|\d)\s*([^\d\s.,]+\.?)?/);
    if (!m) return null;
    let num = m[1];
    const mult = suffixMultiplier(m[2], t);
    if (mult > 1) {
      // Abbreviated: the separator is a decimal point ("1.2K", "1,2 tys.").
      num = num.replace(/[ ']/g, '').replace(',', '.');
      return Math.round(parseFloat(num) * mult);
    }
    // Full number: separators only ever split groups of three digits ("12 345", "1,234,567").
    // Anything else is a decimal with a unit we don't know ("5.2 lakh"): better no answer than 52.
    if (!/^\d{1,3}([.,' ]\d{3})*$/.test(num) && !/^\d+$/.test(num)) return null;
    return parseInt(num.replace(/[.,' ]/g, ''), 10);
  }

  // Words used for "views" in YouTube's metadata line across common locales.
  const VIEW_WORDS = /\bviews?\b|wyświetle|aufruf|\bvues?\b|visualiza|visualizz|просмотр|перегляд|weergave|visning|visualizações|görüntüleme|zhlédnutí|megtekintés|vizionăr|προβολ|次|조회|回視聴|lượt xem|tayangan|การดู/i;
  const LIVE_WORDS = /watching|ogląda|zuschauer|spectateur|viendo|guardando|(?<!про)смотр|kijk/i; // not просмотры (views)

  // "6 hours ago", "1 day ago (edited)", "5 godzin temu", "vor 3 Tagen" → age in seconds, or null.
  const AGE_UNITS = [
    [/^(sec|sek|seg|сек|saniye|giây|másodperc|秒|초|วินาที)/i, 1],
    [/^(min(?!ggu)|мин|хв|perc|phút|dakika|分|분|นาที)/i, 60],
    [/^(hour|hr|godz|stund|heure|hora|or[ae]|час|годин|uur|saat|óra|giờ|jam|hod|時間|小时|小時|시간|ชั่วโมง)/i, 3600],
    [/^(day|dni|dzie|tag|jour|día|dia|giorn|д[ен]|dag|gün|den|dn|nap|ngày|hari|日|天|일|วัน)/i, 86400],
    [/^(week|wk|tydz|tygod|woche|semaine|semana|settiman|недел|тиж|wek|hafta|týd|hét|tuần|minggu|週|周|주|สัปดาห์)/i, 604800],
    [/^(month|mo|miesi|monat|mois|mes|mês|mese|месяц|місяц|maand|ay|měs|hónap|tháng|bulan|か月|ヶ月|个月|個月|개월|เดือน)/i, 2592000],
    [/^(year|yr|rok|lat|let|jahr|an|año|ano|ann|год|лет|рік|jaar|yıl|év|năm|tahun|年|년|ปี)/i, 31536000],
  ];
  function parseAge(text) {
    if (!text) return null;
    const t = String(text).toLowerCase();
    const m = t.match(/(\d+)\s*([^\d\s]+)/) || t.match(/()(\p{L}+)/u);
    if (!m) return null;
    const n = m[1] ? parseInt(m[1], 10) : 1;
    // Malay "saat lalu" is seconds; Turkish "saat önce" is hours.
    if (/^saat/.test(m[2]) && /\blalu\b/.test(t)) return n;
    for (const [re, secs] of AGE_UNITS) if (re.test(m[2])) return n * secs;
    return null;
  }

  root.TTNumbers = { parseCount, parseAge, VIEW_WORDS, LIVE_WORDS };
})(typeof window !== 'undefined' ? window : globalThis);
