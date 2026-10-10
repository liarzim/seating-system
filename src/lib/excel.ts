// Excel templates, exports and parsing. ExcelJS is loaded only when needed.
import type { Workbook, Worksheet } from 'exceljs';

export type ImportKind = 'units' | 'people' | 'assignments';

// Hebrew header -> key sent to the database. Order = column order in the template.
export const COLUMNS: Record<ImportKind, { header: string; key: string; width: number; note: string }[]> = {
  units: [
    { header: 'שם יחידה', key: 'name', width: 28, note: 'חובה. שם ייחודי' },
    { header: 'סוג יחידה', key: 'type', width: 16, note: 'למשל חטיבה, מחלקה, סקוואד. סוג חדש ייווצר אוטומטית' },
    { header: 'יחידת אב', key: 'parent', width: 28, note: 'שם יחידה מהרשימה. ריק = רמה עליונה' },
  ],
  people: [
    { header: 'מספר עובד', key: 'employee_no', width: 14, note: 'חובה. מזהה ייחודי. עובד קיים יתעדכן' },
    { header: 'שם מלא', key: 'full_name', width: 24, note: 'חובה' },
    { header: 'אימייל', key: 'email', width: 30, note: 'רשות' },
    { header: 'יחידה', key: 'unit', width: 28, note: 'שם יחידה קיימת. ריק = ללא שיוך' },
    { header: 'תפקיד', key: 'role', width: 22, note: 'תפקיד חדש ייווצר אוטומטית' },
  ],
  assignments: [
    { header: 'מספר עובד', key: 'employee_no', width: 14, note: 'חובה' },
    { header: 'אתר', key: 'site', width: 10, note: 'קוד האתר, למשל JRS' },
    { header: 'קומה', key: 'floor', width: 8, note: 'מספר הקומה' },
    { header: 'חדר', key: 'room', width: 16, note: 'שם החדר כפי שמופיע במערכת' },
    { header: 'מושב', key: 'seat', width: 8, note: 'שם או מספר המושב בחדר' },
    { header: 'א', key: 'd0', width: 5, note: 'V בימים שבהם יושב' },
    { header: 'ב', key: 'd1', width: 5, note: '' },
    { header: 'ג', key: 'd2', width: 5, note: '' },
    { header: 'ד', key: 'd3', width: 5, note: '' },
    { header: 'ה', key: 'd4', width: 5, note: '' },
  ],
};

export const KIND_LABEL: Record<ImportKind, string> = {
  units: 'מבנה ארגוני',
  people: 'אנשים',
  assignments: 'שיבוצים',
};

async function excel() {
  const mod = await import('exceljs');
  return (mod.default ?? mod) as typeof import('exceljs');
}

function styleSheet(ws: Worksheet) {
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EFEC' } };
}

async function download(wb: Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Template (with optional existing rows) + an instructions sheet.
export async function downloadSheet(kind: ImportKind, rows: Record<string, unknown>[] = []) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(KIND_LABEL[kind]);
  ws.columns = COLUMNS[kind].map((c) => ({ header: c.header, key: c.key, width: c.width }));
  rows.forEach((r) => ws.addRow(r));
  styleSheet(ws);
  const help = wb.addWorksheet('הוראות');
  help.views = [{ rightToLeft: true }];
  help.columns = [{ header: 'עמודה', key: 'h', width: 16 }, { header: 'הסבר', key: 'n', width: 70 }];
  COLUMNS[kind].filter((c) => c.note).forEach((c) => help.addRow({ h: c.header, n: c.note }));
  help.addRow({});
  help.addRow({ h: 'שימו לב', n: 'הייבוא נבדק כולו לפני השמירה. אם יש שורה שגויה, שום דבר לא נשמר.' });
  help.getRow(1).font = { bold: true };
  await download(wb, `${KIND_LABEL[kind]}${rows.length ? '' : ' - תבנית'}.xlsx`);
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text !== undefined) return String(o.text);
    if (o.result !== undefined) return String(o.result);
  }
  return String(v).trim();
}

// Read the first sheet; map columns by their Hebrew header (order does not matter).
export async function parseFile(kind: ImportKind, file: File): Promise<{ rows: Record<string, unknown>[]; missing: string[] }> {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], missing: COLUMNS[kind].map((c) => c.header) };
  const byHeader = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => byHeader.set(cellText(cell.value).replace(/['"׳]/g, ''), col));
  const cols = COLUMNS[kind];
  const required = kind === 'assignments' ? cols.slice(0, 5) : cols.slice(0, kind === 'people' ? 2 : 1);
  const missing = required.filter((c) => !byHeader.has(c.header)).map((c) => c.header);
  const rows: Record<string, unknown>[] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const r: Record<string, string> = {};
    for (const c of cols) {
      const col = byHeader.get(c.header);
      r[c.key] = col ? cellText(row.getCell(col).value) : '';
    }
    if (Object.values(r).every((v) => !v)) return; // skip empty lines
    if (kind === 'assignments') {
      const days = [0, 1, 2, 3, 4].filter((d) => /^(v|x|✓|✔|1|כן)$/i.test(r[`d${d}`]));
      rows.push({ employee_no: r.employee_no, site: r.site, floor: r.floor, room: r.room, seat: r.seat, days });
    } else {
      rows.push(r);
    }
  });
  return { rows, missing };
}
