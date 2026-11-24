import type { BillSource } from '../../types';

/** 引号感知的 CSV 解析（支持 "" 转义、CRLF/CR/LF 混合行尾） */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface CsvTable {
  header: string[];
  headerIndex: number;
  rows: string[][];
}

function normalizedCell(v: string | undefined): string {
  return (v ?? '').trim();
}

export function rowHasAll(row: string[], names: string[]): boolean {
  const cells = row.map(normalizedCell);
  return names.every(n => cells.some(c => c === n || c.includes(n)));
}

export function detectSourceFromHeader(header: string[]): BillSource | null {
  const cells = header.map(normalizedCell);
  const has = (name: string) => cells.some(c => c === name || c.includes(name));
  if (has('交易单号') || has('当前状态') || has('交易类型')) return 'wechat';
  if (has('交易订单号') || has('商品说明') || has('交易分类')) return 'alipay';
  return null;
}

/**
 * 在前若干行里定位表头。说明文字行会被忽略；返回表头行下标与来源。
 */
export function findCsvHeader(rows: string[][]): CsvTable | null {
  const limit = Math.min(rows.length, 80);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!rowHasAll(row, ['交易时间'])) continue;
    const source = detectSourceFromHeader(row);
    if (source) {
      return { header: row.map(normalizedCell), headerIndex: i, rows };
    }
  }
  return null;
}

function headerIndex(header: string[], names: string[]): number {
  for (const name of names) {
    const idx = header.findIndex(h => h === name || h.includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * 支付宝/微信 CSV 的列对齐：
 * - 去掉行尾空列（支付宝每行末尾多一个逗号）
 * - 商品说明里含逗号导致列数超出时，把中间多出来的列并回商品说明
 */
export function alignCsvRow(row: string[], header: string[]): string[] {
  const h = header.slice();
  while (h.length > 0 && h[h.length - 1] === '') h.pop();

  const r = row.slice();
  while (r.length > 0 && r[r.length - 1] === '') r.pop();

  if (r.length === h.length) return r;
  if (r.length < h.length) {
    while (r.length < h.length) r.push('');
    return r;
  }

  const itemIdx = headerIndex(h, ['商品说明', '商品']);
  const directionIdx = headerIndex(h, ['收/支']);
  if (itemIdx >= 0 && directionIdx > itemIdx) {
    const tailCount = h.length - directionIdx;
    const head = r.slice(0, itemIdx);
    const tail = r.slice(r.length - tailCount);
    const item = r.slice(itemIdx, r.length - tailCount).join(',');
    const merged = [...head, item, ...tail];
    if (merged.length === h.length) return merged;
  }

  // 兜底：截断/补齐，至少保证按表头下标取值不越界
  while (r.length < h.length) r.push('');
  return r.slice(0, h.length);
}

/** 表头名 -> 单元格值；带别名与包含匹配 */
export function cellByHeader(header: string[], row: string[], names: string[]): string {
  const idx = headerIndex(header, names);
  return idx >= 0 ? (row[idx] ?? '').trim() : '';
}
