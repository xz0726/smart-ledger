import { unzipSync, strFromU8 } from 'fflate';

/** XML 实体与 Excel 控制字符还原 */
export function decodeXmlText(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/_x000D_/g, '')
    .replace(/_x000A_/g, ' ');
}

function textRuns(xml: string): string {
  let out = '';
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out += decodeXmlText(m[1]);
  return out;
}

function parseSharedStrings(xml: string): string[] {
  const list: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) list.push(textRuns(m[1]));
  return list;
}

function colLettersToIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    const code = letters.charCodeAt(i);
    if (code < 65 || code > 90) continue;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

function findEntry(files: Record<string, Uint8Array>, test: (path: string) => boolean): string | null {
  for (const path of Object.keys(files)) {
    if (test(path)) return path;
  }
  return null;
}

/**
 * 读取 XLSX 第一个工作表的单元格文本。
 * 只处理微信/支付宝账单这种简单表格，不依赖 SheetJS。
 */
export function readXlsxRows(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes) as Record<string, Uint8Array>;
  } catch {
    throw new Error('无法解压 Excel 文件，请确认不是加密/损坏的 xlsx');
  }

  const sharedPath = findEntry(files, p => /^xl\/sharedStrings\.xml$/i.test(p));
  const shared = sharedPath ? parseSharedStrings(strFromU8(files[sharedPath])) : [];

  const sheetPath = findEntry(files, p => /^xl\/worksheets\/sheet\d+\.xml$/i.test(p))
    ?? findEntry(files, p => /^xl\/worksheets\/.+\.xml$/i.test(p));
  if (!sheetPath) throw new Error('Excel 中没有找到工作表');

  const sheetXml = strFromU8(files[sheetPath]);
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(sheetXml)) !== null) {
    const rowXml = rowMatch[1];
    const cells: string[] = [];
    let fallbackIndex = 0;
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRe.exec(rowXml)) !== null) {
      const attrs = cellMatch[1] ?? '';
      const inner = cellMatch[2] ?? '';
      const rAttr = /\br="([A-Z]+)\d+"/.exec(attrs);
      const tAttr = /\bt="([^"]*)"/.exec(attrs);
      const type = tAttr ? tAttr[1] : '';
      const colIdx = rAttr ? colLettersToIndex(rAttr[1]) : fallbackIndex;
      fallbackIndex = colIdx + 1;
      if (colIdx < 0) continue;

      let value = '';
      if (type === 'inlineStr') {
        value = textRuns(inner);
      } else {
        const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
        const raw = vMatch ? decodeXmlText(vMatch[1]) : '';
        if (type === 's') {
          const idx = parseInt(raw, 10);
          value = Number.isFinite(idx) ? (shared[idx] ?? '') : '';
        } else {
          value = raw;
        }
      }

      while (cells.length < colIdx) cells.push('');
      cells[colIdx] = value;
    }

    // 跳过纯空行
    if (cells.some(c => c.trim() !== '')) rows.push(cells);
  }

  return rows;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} `
    + `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/** Excel 序列值按「墙上时间」转 YYYY-MM-DD HH:mm:ss（epoch 1899-12-30） */
export function excelSerialToDateTime(serial: number): string {
  const seconds = Math.round(serial * 86400);
  const d = new Date(Date.UTC(1899, 11, 30) + seconds * 1000);
  return formatUtc(d);
}

/** 兼容 Excel 序列值、2026-11-24 11:10:12、2026/11/24 等写法 */
export function normalizeDateTime(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';

  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) return excelSerialToDateTime(n);
  }

  const m = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return '';
  return `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))} `
    + `${pad2(Number(m[4] ?? 0))}:${pad2(Number(m[5] ?? 0))}:${pad2(Number(m[6] ?? 0))}`;
}

export function dateOnly(dateTime: string): string {
  return dateTime.slice(0, 10);
}
