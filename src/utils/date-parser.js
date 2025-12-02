/**
 * Utility to extract Vietnamese-style dates from free text and normalize to YYYY-MM-DD.
 * Supports patterns:
 * - dd/mm/yyyy or dd-mm-yyyy
 * - dd/mm or dd-mm (auto-fill current year)
 * - "tháng 12 năm 2025" or "tháng 12" (start/end of month)
 * Returns { start_date, end_date } when available.
 */
function pad(n) {
    return n < 10 ? `0${n}` : `${n}`;
}

function toIso(d, m, y) {
    const year = y || new Date().getFullYear();
    const month = Math.min(Math.max(parseInt(m, 10), 1), 12);
    const day = Math.min(Math.max(parseInt(d, 10), 1), 31);
    return `${year}-${pad(month)}-${pad(day)}`;
}

function monthRange(month, year) {
    const y = year || new Date().getFullYear();
    const m = Math.min(Math.max(parseInt(month, 10), 1), 12);
    const lastDay = new Date(y, m, 0).getDate();
    return {
        start: `${y}-${pad(m)}-01`,
        end: `${y}-${pad(m)}-${pad(lastDay)}`
    };
}

function extractDateTokens(text) {
    if (!text) return [];
    const matches = [];
    const regex = /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
        matches.push({ day: m[1], month: m[2], year: m[3] });
    }
    // pattern: tháng 12 (năm 2025)?
    const monthRe = /th(?:á|a)ng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?/gi;
    while ((m = monthRe.exec(text)) !== null) {
        matches.push({ monthOnly: m[1], year: m[2] });
    }
    return matches;
}

function extractDateRange(text) {
    const tokens = extractDateTokens(text);
    const result = {};
    const datePairs = tokens.filter(t => t.day && t.month);
    if (datePairs.length >= 2) {
        result.start_date = toIso(datePairs[0].day, datePairs[0].month, datePairs[0].year);
        result.end_date = toIso(datePairs[1].day, datePairs[1].month, datePairs[1].year);
    } else if (datePairs.length === 1) {
        result.start_date = toIso(datePairs[0].day, datePairs[0].month, datePairs[0].year);
    }

    const monthOnly = tokens.find(t => t.monthOnly);
    if (!result.start_date && monthOnly) {
        const range = monthRange(monthOnly.monthOnly, monthOnly.year);
        result.start_date = range.start;
        result.end_date = range.end;
    } else if (!result.end_date && monthOnly) {
        const range = monthRange(monthOnly.monthOnly, monthOnly.year);
        result.end_date = range.end;
    }

    return result;
}

module.exports = {
    extractDateRange,
    /**
     * Chuẩn hóa chuỗi ngày về dạng YYYY-MM-DD.
     * Hỗ trợ dd-MM-yyyy, dd/MM/yyyy, dd-MM, dd/MM.
     * Nếu không parse được, trả về input gốc.
     */
    normalizeDateString: function (value) {
        if (!value) return value;
        const txt = String(value).trim();
        // yyyy-MM-dd đã chuẩn
        if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) return txt;

        // dd-MM-yyyy hoặc dd/MM/yyyy
        let m = txt.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
        if (m) {
            const [_, d, mo, yRaw] = m;
            const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
            return `${y}-${pad(parseInt(mo, 10))}-${pad(parseInt(d, 10))}`;
        }

        // dd-MM hoặc dd/MM, tự thêm năm hiện tại
        m = txt.match(/^(\d{1,2})[/-](\d{1,2})$/);
        if (m) {
            const year = new Date().getFullYear();
            return `${year}-${pad(parseInt(m[2], 10))}-${pad(parseInt(m[1], 10))}`;
        }

        return txt;
    }
};
