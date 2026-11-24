import { TextDecoder } from 'text-encoding';
import type { BillSource } from '../../types';
import { parseCsv, findCsvHeader, alignCsvRow, detectSourceFromHeader } from './csv';
import { readXlsxRows } from './xlsx';
import { transactionFromRow, filterTransactions, extractHeadline } from './normalize';
import type { ParseMeta, ParseResult } from './types';

function hasZipMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function decodeBillText(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030').decode(bytes);
  }
}

function fileLabel(source: BillSource): string {
  return source === 'wechat' ? '微信' : '支付宝';
}

/**
 * 解析微信/支付宝账单文件（xlsx 或 csv），返回已过滤为「待导入支出」的交易。
 * 纯本地、同步；不访问数据库。
 */
export function parseBillFile(fileName: string, bytes: Uint8Array): ParseResult {
  const lower = (fileName ?? '').toLowerCase();
  if (lower.endsWith('.pdf')) {
    throw new Error('暂不支持 PDF 账单，请在微信/支付宝里导出 Excel 或 CSV');
  }
  if (lower.endsWith('.xls') && !hasZipMagic(bytes)) {
    throw new Error('暂不支持旧版 .xls，请导出 .xlsx 或 .csv');
  }

  let rows: string[][];
  const isXlsx = hasZipMagic(bytes);
  if (isXlsx) {
    rows = readXlsxRows(bytes);
  } else {
    rows = parseCsv(decodeBillText(bytes));
  }

  const table = findCsvHeader(rows);
  if (!table) {
    throw new Error('无法识别账单表头；请确认是微信/支付宝导出的账单文件');
  }

  const source = detectSourceFromHeader(table.header);
  if (!source) {
    throw new Error('无法判断账单来源（微信 / 支付宝）');
  }

  const rawDataRows = rows
    .slice(table.headerIndex + 1)
    .map(row => alignCsvRow(row, table.header))
    .filter(row => row.some(cell => (cell ?? '').trim() !== ''));

  const transactions = rawDataRows.map((row, i) => transactionFromRow(source, table.header, row, i));
  const filtered = filterTransactions(source, transactions);

  let rawExpenseRows = 0;
  let rawExpenseCents = 0;
  let dateStart = '';
  let dateEnd = '';
  for (const tx of transactions) {
    if (tx.direction === 'expense') {
      rawExpenseRows++;
      rawExpenseCents += tx.amountCents;
    }
    if (tx.date) {
      if (!dateStart || tx.date < dateStart) dateStart = tx.date;
      if (!dateEnd || tx.date > dateEnd) dateEnd = tx.date;
    }
  }

  const headline = extractHeadline(rows, table.headerIndex);
  const warnings: string[] = [];
  if (headline.totalRows !== undefined && headline.totalRows !== rawDataRows.length) {
    warnings.push(`说明头写 ${headline.totalRows} 笔，实际解析 ${rawDataRows.length} 笔，账单可能不完整`);
  }
  if (headline.expenseRows !== undefined && headline.expenseRows !== rawExpenseRows) {
    warnings.push(`说明头写支出 ${headline.expenseRows} 笔，实际解析 ${rawExpenseRows} 笔`);
  }

  const meta: ParseMeta = {
    source,
    fileName,
    totalRows: rawDataRows.length,
    rawExpenseRows,
    rawExpenseCents,
    dateStart,
    dateEnd,
    headline,
    warnings,
  };

  return {
    source,
    fileName: `${fileLabel(source)} · ${fileName}`,
    meta,
    transactions: filtered.kept,
    refunds: filtered.refunds,
    skipped: filtered.skipped,
  };
}
