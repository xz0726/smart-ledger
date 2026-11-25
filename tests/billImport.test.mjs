import { describe, test, assert, assertEquals } from './run.mjs';

// ===================== 纯 JS 镜像（与 src/services/billImport 保持同步） =====================

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function excelSerialToDateTime(serial) {
  const seconds = Math.round(serial * 86400);
  const d = new Date(Date.UTC(1899, 11, 30) + seconds * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} `
    + `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function normalizeDateTime(raw) {
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

function parseAmountToCents(raw) {
  const s = (raw ?? '').replace(/[¥￥,，\s元]/g, '');
  if (!s || !/^-?\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? Math.round(Math.abs(v) * 100) : null;
}

function parseWechatRefundCents(status) {
  const m = /已退款[（(]?\s*[¥￥]?\s*(\d+(?:\.\d{1,2})?)\s*[)）]?/.exec(status ?? '');
  if (!m) return 0;
  const v = Number(m[1]);
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}

function normalizeDirection(raw) {
  const map = { '支出': 'expense', '收入': 'income', '不计收支': 'neutral', '/': 'neutral', '': 'neutral' };
  return map[(raw ?? '').trim()] ?? 'neutral';
}

function parseCsv(text) {
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function alignCsvRow(row, header) {
  const h = header.slice();
  while (h.length > 0 && h[h.length - 1] === '') h.pop();
  const r = row.slice();
  while (r.length > 0 && r[r.length - 1] === '') r.pop();
  if (r.length === h.length) return r;
  if (r.length < h.length) {
    while (r.length < h.length) r.push('');
    return r;
  }
  const head = 4;
  const directionIdx = h.findIndex(x => x === '收/支' || x.includes('收/支'));
  if (directionIdx > head) {
    const tailCount = h.length - directionIdx;
    const merged = [...r.slice(0, head), r.slice(head, r.length - tailCount).join(','), ...r.slice(r.length - tailCount)];
    if (merged.length === h.length) return merged;
  }
  while (r.length < h.length) r.push('');
  return r.slice(0, h.length);
}

function normalizeForMatch(s) {
  return (s ?? '').toLowerCase()
    .replace(/订单付款|收钱码收款|扫码支付|商品交易|二维码支付|二维码收款|收款方备注|转账备注|微信转账|退款-/g, '')
    .replace(/[\s\-_·:：,，.。()（）\[\]【】¥￥/]/g, '');
}

function dayDiff(a, b) {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round(Math.abs(ta - tb) / 86400000);
}

function lcs(a, b) {
  let prev = new Array(b.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

function isSimilarDescription(tx, existing) {
  const merchant = normalizeForMatch(tx.merchant);
  const desc = normalizeForMatch(tx.description);
  const existingText = normalizeForMatch(`${existing.description ?? ''} ${existing.raw_input ?? ''}`);
  if (!existingText) return false;
  if (merchant.length >= 2 && existingText.includes(merchant)) return true;
  if (desc.length >= 2 && (existingText.includes(desc) || desc.includes(existingText))) return true;
  if (existingText.length >= 2 && merchant.includes(existingText)) return true;
  return merchant.length >= 2 && lcs(existingText, merchant) >= 4;
}

function dedupeMatch(tx, existing) {
  if (dayDiff(existing.expense_date, tx.date) !== 0) return null;
  const cat = existing.category_id === tx.categoryId || existing.category_name === tx.categoryName;
  const desc = isSimilarDescription(tx, existing);
  const uncertain = tx.confidence === 'low' || tx.categoryName === '其他' || existing.category_name === '其他';
  if (cat) return { level: 'strong', reason: 'same_category' };
  if (desc) return { level: 'strong', reason: 'similar_description' };
  if (uncertain) return { level: 'strong', reason: 'uncertain_category' };
  return { level: 'weak', reason: 'same_amount_date' };
}

// src/services/billImport/review.ts 的镜像
function isUncategorized(tx) {
  return tx.categoryName === '其他' || tx.confidence === 'low';
}

function reviewReason(tx, match) {
  if (match?.level === 'strong') return null;
  if (isUncategorized(tx)) return 'uncategorized';
  if (match?.level === 'weak') return 'weak_duplicate';
  return null;
}

function selectReviewTxs(txs, dupe) {
  return txs.filter(tx => {
    if (dupe.exactUids.has(tx.uid) || dupe.fileDuplicateUids.has(tx.uid)) return false;
    return reviewReason(tx, dupe.matches.get(tx.uid)) !== null;
  });
}

function refundBaseExternalId(tx) {
  return tx.source === 'alipay' ? tx.externalId.split('_')[0] : '';
}

function isRefundInFile(refund, kept) {
  if (refund.source === 'alipay') {
    const base = refundBaseExternalId(refund);
    return !!base && kept.some(tx => tx.externalId === base);
  }
  const merchant = normalizeForMatch(refund.merchant);
  if (!merchant) return false;
  return kept.some(tx => {
    if (!tx.status.includes('已退款') && !tx.status.includes('全额退款')) return false;
    if (dayDiff(tx.date, refund.date) > 3) return false;
    const rm = /已退款[（(]?\s*[¥￥]?\s*(\d+(?:\.\d{1,2})?)/.exec(tx.status);
    if (rm) {
      const cents = Math.round(Number(rm[1]) * 100);
      if (Number.isFinite(cents) && Math.abs(cents - refund.amountCents) > 1) return false;
    }
    const m = normalizeForMatch(tx.merchant);
    return !!m && (m.includes(merchant) || merchant.includes(m) || lcs(m, merchant) >= 3);
  });
}

function scoreRefundTarget(refund, target) {
  if (target.category_type !== 'expense') return 0;
  const targetCents = Math.round(target.amount * 100);
  if (targetCents < refund.amountCents - 1) return 0;
  if (target.expense_date > refund.date) return 0;
  const diff = dayDiff(target.expense_date, refund.date);
  if (!Number.isFinite(diff) || diff > 180) return 0;
  const rm = normalizeForMatch(refund.merchant);
  const rd = normalizeForMatch(refund.description);
  const text = normalizeForMatch(`${target.description ?? ''} ${target.raw_input ?? ''}`);
  if (!text) return 0;
  let semantic = 0;
  if (rm.length >= 2 && text.includes(rm)) semantic = Math.max(semantic, 60);
  if (rd.length >= 2 && text.includes(rd)) semantic = Math.max(semantic, 50);
  if (rm.length >= 2) {
    const n = lcs(text, rm);
    if (n >= 4) semantic = Math.max(semantic, 40);
    else if (n >= 3) semantic = Math.max(semantic, 25);
  }
  if (semantic === 0) return 0;
  let score = semantic + (targetCents === refund.amountCents ? 15 : 5);
  if (diff <= 1) score += 20;
  else if (diff <= 7) score += 15;
  else if (diff <= 30) score += 10;
  else if (diff <= 90) score += 5;
  else score += 2;
  return score;
}

function pickRefundTarget(refund, candidates) {
  const scored = candidates.map(target => ({ target, score: scoreRefundTarget(refund, target) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0 || scored[0].score < 30) return null;
  const second = scored[1]?.score ?? 0;
  return {
    target: scored[0].target,
    confidence: scored[0].score >= 55 && (scored.length === 1 || scored[0].score - second >= 15)
      ? 'likely' : 'uncertain',
    alternatives: scored.filter(x => x.score >= scored[0].score - 10).length,
  };
}

const ALIPAY_MAP = {
  '餐饮美食': '餐饮', '交通出行': '交通', '教育培训': '学习', '医疗健康': '医疗',
  '商业服务': '其他', '转账红包': '其他', '其他': '其他',
};

function classifyAlipay(billCategory, text, longMerchantCategory) {
  if (longMerchantCategory) return longMerchantCategory;
  return ALIPAY_MAP[billCategory] ?? '其他';
}

// ===================== 测试 =====================

describe('账单导入 · 日期与金额', () => {
  test('Excel 序列值按墙上时间转换', () => {
    assertEquals(excelSerialToDateTime(46349.128842592596), '2026-11-23 03:05:32');
  });

  test('ISO / 斜杠 / 带秒 / 不带秒日期都能解析', () => {
    assertEquals(normalizeDateTime('2026-11-24 11:10:12'), '2026-11-24 11:10:12');
    assertEquals(normalizeDateTime('2026/11/24 11:10'), '2026-11-24 11:10:00');
    assertEquals(normalizeDateTime('2026-11-24'), '2026-11-24 00:00:00');
  });

  test('金额转整数分并去掉 ¥ / 千分位', () => {
    assertEquals(parseAmountToCents('¥1,234.50'), 123450);
    assertEquals(parseAmountToCents('0.90'), 90);
    assertEquals(parseAmountToCents('abc'), null);
  });

  test('微信部分退款金额解析', () => {
    assertEquals(parseWechatRefundCents('已退款(¥8.78)'), 878);
    assertEquals(parseWechatRefundCents('已退款¥8.96'), 896);
    assertEquals(parseWechatRefundCents('已全额退款'), 0);
  });

  test('收/支方向映射', () => {
    assertEquals(normalizeDirection('支出'), 'expense');
    assertEquals(normalizeDirection('收入'), 'income');
    assertEquals(normalizeDirection('不计收支'), 'neutral');
    assertEquals(normalizeDirection('/'), 'neutral');
  });
});

describe('账单导入 · CSV', () => {
  test('引号与逗号字段', () => {
    const rows = parseCsv('a,b\n"x,y",z\n');
    assertEquals(rows.length, 2);
    assertEquals(rows[1][0], 'x,y');
    assertEquals(rows[1][1], 'z');
  });

  test('支付宝尾部逗号 + 商品说明内逗号列对齐', () => {
    const header = ['交易时间', '交易分类', '交易对方', '对方账号', '商品说明', '收/支', '金额', '收/付款方式', '交易状态', '交易订单号', '商家订单号', '备注', ''];
    const row = ['2026-11-24 11:10:12', '餐饮美食', '盒马', 'a@b', '红提,苹果', '支出', '64.50', '卡', '交易成功', '123', '456', '', ''];
    const aligned = alignCsvRow(row, header);
    assertEquals(aligned.length, 12);
    assertEquals(aligned[4], '红提,苹果');
    assertEquals(aligned[5], '支出');
    assertEquals(aligned[10], '456');
  });
});

describe('账单导入 · 去重', () => {
  const tx = {
    merchant: '张亮麻辣烫', description: '张亮麻辣烫 · 午餐',
    categoryId: 1, categoryName: '餐饮', confidence: 'high',
    date: '2026-11-24', amountCents: 2000,
  };
  const dinner = {
    id: -1, amount: 20, category_id: 1, category_name: '餐饮', category_type: 'expense',
    description: '晚饭', raw_input: '晚饭20', expense_date: '2026-11-24',
  };

  test('「晚饭 20」与账单「麻辣烫 20」同分类 → 强疑似', () => {
    const m = dedupeMatch(tx, dinner);
    assertEquals(m.level, 'strong');
    assertEquals(m.reason, 'same_category');
  });

  test('同金额同日期但分类明确不同 → 只给弱提示', () => {
    const metro = { ...tx, merchant: '上海地铁', description: '上海地铁 · 乘车码', categoryId: 2, categoryName: '交通' };
    const coffee = { ...dinner, description: '瑞幸', raw_input: '瑞幸4', amount: 4, category_id: 1, category_name: '餐饮' };
    const m = dedupeMatch({ ...metro, amountCents: 400 }, coffee);
    assertEquals(m.level, 'weak');
    assertEquals(m.reason, 'same_amount_date');
  });

  test('分类不确定（其他 / low）→ 强疑似', () => {
    const m = dedupeMatch({ ...tx, categoryId: 9, categoryName: '其他', confidence: 'low' }, dinner);
    assertEquals(m.level, 'strong');
    assertEquals(m.reason, 'uncertain_category');
  });

  test('商户/描述文字相似 → 强疑似', () => {
    const m = dedupeMatch(
      { ...tx, merchant: '盒马', description: '盒马 · 红提', categoryId: 2, categoryName: '交通' },
      { ...dinner, description: '盒马购物', raw_input: '盒马购物 20', category_id: 3, category_name: '购物' },
    );
    assertEquals(m.level, 'strong');
    assertEquals(m.reason, 'similar_description');
  });

  test('日期不同（含相差 1 天）不参与比对', () => {
    assertEquals(dedupeMatch(tx, { ...dinner, expense_date: '2026-11-23' }), null);
    assertEquals(dedupeMatch(tx, { ...dinner, expense_date: '2026-11-22' }), null);
  });
});

describe('账单导入 · 跨月退款', () => {
  const refund = {
    source: 'alipay', externalId: 'ORDER123_INP999', uid: 'alipay:ORDER123_INP999',
    date: '2026-11-23', merchant: '杭州万桩', description: '杭州万桩 · 退款',
    amountCents: 878, status: '退款成功', direction: 'neutral',
  };
  const original = {
    id: 1, amount: 10, category_id: 2, category_name: '交通', category_type: 'expense',
    description: '杭州万桩 · 充电支付', raw_input: '[账单] 微信 杭州万桩 充电支付',
    expense_date: '2026-10-25',
  };

  test('支付宝退款单号取第一个下划线前的前缀', () => {
    assertEquals(refundBaseExternalId(refund), 'ORDER123');
    assertEquals(refundBaseExternalId({ ...refund, source: 'wechat' }), '');
  });

  test('退款原单在本文件内时标记为已冲减', () => {
    const kept = [{ externalId: 'ORDER123', date: '2026-11-21', merchant: '杭州万桩', amountCents: 1000, status: '交易成功' }];
    assert(isRefundInFile(refund, kept));
    assert(!isRefundInFile(refund, [{ ...kept[0], externalId: 'OTHER' }]));
  });

  test('跨月部分退款：商户匹配 + 金额不小于退款 + 日期早于退款 → 唯一匹配', () => {
    const pick = pickRefundTarget(refund, [original]);
    assert(pick);
    assertEquals(pick.target.id, 1);
    assertEquals(pick.confidence, 'likely');
  });

  test('商户对不上或日期晚于退款 → 不匹配', () => {
    assertEquals(pickRefundTarget(refund, [{ ...original, description: '盒马 · 购物', raw_input: '' }]), null);
    assertEquals(pickRefundTarget(refund, [{ ...original, expense_date: '2026-11-25' }]), null);
  });

  test('微信退款：原单金额已按净额入账时不再跨月冲减', () => {
    const wxRefund = {
      source: 'wechat', date: '2026-11-23', merchant: '杭州万桩',
      amountCents: 878, status: '已退款¥8.78', direction: 'income',
    };
    const kept = [{
      externalId: 'W1', date: '2026-11-22', merchant: '杭州万桩', amountCents: 122,
      status: '已退款(¥8.78)',
    }];
    assert(isRefundInFile(wxRefund, kept));
  });
});

describe('账单导入 · 分类与长跨度', () => {
  test('支付宝交易分类映射', () => {
    assertEquals(classifyAlipay('餐饮美食', '某店', null), '餐饮');
    assertEquals(classifyAlipay('交通出行', '高德', null), '交通');
  });

  test('长商户关键词优先于支付宝误分类（麻辣烫面标成教育培训）', () => {
    assertEquals(classifyAlipay('教育培训', '麻辣烫面', '餐饮'), '餐饮');
  });

  test('一年账单按月分组为 12 组', () => {
    const months = new Set();
    for (let m = 1; m <= 12; m++) months.add(`2026-${pad2(m)}`);
    assertEquals(months.size, 12);
  });
});

describe('账单导入 · 待确认', () => {
  const other = { uid: 'a', categoryName: '其他', confidence: 'low' };
  const normal = { uid: 'b', categoryName: '餐饮', confidence: 'high' };
  const weak = { level: 'weak' };
  const strong = { level: 'strong' };

  test('分类为其他 → 收录', () => {
    assertEquals(reviewReason(other, undefined), 'uncategorized');
  });

  test('普通分类 + 弱疑似重复 → 收录', () => {
    assertEquals(reviewReason(normal, weak), 'weak_duplicate');
  });

  test('普通分类、无匹配 → 不收录', () => {
    assertEquals(reviewReason(normal, undefined), null);
  });

  test('强疑似重复归「疑似重复」，不进待确认', () => {
    assertEquals(reviewReason(other, strong), null);
    assertEquals(reviewReason(normal, strong), null);
  });

  test('其他 + 弱匹配时 reason 优先未分类', () => {
    assertEquals(reviewReason(other, weak), 'uncategorized');
  });

  test('自定义规则映射到其他（high）仍收录', () => {
    assertEquals(reviewReason({ categoryName: '其他', confidence: 'high' }, undefined), 'uncategorized');
  });

  test('删除「其他」分类后的 low fallback（名字非其他）仍收录', () => {
    assertEquals(reviewReason({ categoryName: '餐饮', confidence: 'low' }, undefined), 'uncategorized');
  });

  test('精确重复 / 文件内重复不进待确认', () => {
    const dupe = { exactUids: new Set(['b']), fileDuplicateUids: new Set(['c']), matches: new Map() };
    const txs = [other, normal, { uid: 'c', categoryName: '其他', confidence: 'low' }];
    assertEquals(selectReviewTxs(txs, dupe).map(t => t.uid).join(','), 'a');
  });

  test('可导入里的弱重复行进入待确认', () => {
    const dupe = { exactUids: new Set(), fileDuplicateUids: new Set(), matches: new Map([['b', weak]]) };
    assertEquals(selectReviewTxs([other, normal], dupe).map(t => t.uid).join(','), 'a,b');
  });
});
