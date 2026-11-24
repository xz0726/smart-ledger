import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal, ScrollView,
  ActivityIndicator, Alert, StyleSheet, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, FileSpreadsheet, Trash2, TriangleAlert } from 'lucide-react-native';
import { router } from 'expo-router';
import ModalHeader from '../src/components/ModalHeader';
import { useThemeColors, type ThemeColors } from '../src/theme';
import { spacing, radius, fontSize } from '../src/theme/spacing';
import type { Category, CustomRule, ImportBatch, ExpenseWithCategory } from '../src/types';
import {
  getCategories, getCustomRules, getExpensesInRange, getImportedExternalIds,
  insertImportedExpenses, getImportBatches, undoImportBatch, addExpense,
  findExpenseByExternalId, findRefundCandidates, getProcessedRefundIds,
} from '../src/services/db';
import { pickBillFileBytes } from '../src/services/nativeActions';
import { parseBillFile } from '../src/services/billImport';
import { classifyTransactions } from '../src/services/billImport/classify';
import { dedupeTransactions } from '../src/services/billImport/dedupe';
import { isRefundInFile, pickRefundTarget, refundBaseExternalId } from '../src/services/billImport/refundMatch';
import {
  SOURCE_LABEL, SKIP_REASON_LABEL,
  type ParseResult, type ClassifiedBillTx, type DedupeResult, type CrossMonthRefund,
  type DuplicateMatch, type ExistingExpenseForDedupe, type NormalizedBillTx, type SkippedRow,
} from '../src/services/billImport/types';

type Phase = 'idle' | 'parsing' | 'preview' | 'importing' | 'done';
type Filter = 'import' | 'dup' | 'refund' | 'skipped';

type PreviewItem =
  | { kind: 'header'; key: string; month: string }
  | { kind: 'tx'; key: string; tx: ClassifiedBillTx; match?: DuplicateMatch }
  | { kind: 'refund'; key: string; refund: CrossMonthRefund }
  | { kind: 'skip'; key: string; row: SkippedRow };

interface DupeContext {
  externalIds: Set<string>;
  existing: ExistingExpenseForDedupe[];
}

interface DoneResult {
  batchId: string;
  fileName: string;
  inserted: number;
  skipped: number;
  adjusted: number;
}

const EMPTY_DEDUPE: DedupeResult = {
  exactUids: new Set(),
  fileDuplicateUids: new Set(),
  matches: new Map(),
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  return m ? `${m[1]}年${Number(m[2])}月` : month;
}

function fmtCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function shortDate(date: string): string {
  return date ? date.slice(5) : '--';
}

export default function BillImportScreen() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(c, insets.bottom), [c, insets.bottom]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [classified, setClassified] = useState<ClassifiedBillTx[]>([]);
  const [dupeContext, setDupeContext] = useState<DupeContext | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [crossRefunds, setCrossRefunds] = useState<CrossMonthRefund[]>([]);
  const [selectedRefunds, setSelectedRefunds] = useState<Set<string>>(new Set());
  const [processedRefundIds, setProcessedRefundIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('import');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [categories, setCategories] = useState<Category[]>([]);
  const [customRules, setCustomRules] = useState<CustomRule[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [pickerUid, setPickerUid] = useState<string | null>(null);
  const [done, setDone] = useState<DoneResult | null>(null);

  const categoryById = useMemo(() => {
    const map = new Map<number, Category>();
    for (const cat of categories) if (!map.has(cat.id)) map.set(cat.id, cat);
    return map;
  }, [categories]);

  const effectiveTxs = useMemo(() => {
    return classified.map(tx => {
      const categoryId = overrides[tx.uid];
      if (!categoryId) return tx;
      const cat = categoryById.get(categoryId);
      if (!cat) return tx;
      return { ...tx, categoryId: cat.id, categoryName: cat.name, confidence: 'high' as const };
    });
  }, [classified, overrides, categoryById]);

  const dupeResult = useMemo<DedupeResult>(() => {
    if (!dupeContext) return EMPTY_DEDUPE;
    return dedupeTransactions(effectiveTxs, dupeContext);
  }, [effectiveTxs, dupeContext]);

  const importable = useMemo(
    () => effectiveTxs.filter(tx =>
      !dupeResult.exactUids.has(tx.uid)
      && !dupeResult.fileDuplicateUids.has(tx.uid)
      && dupeResult.matches.get(tx.uid)?.level !== 'strong'),
    [effectiveTxs, dupeResult],
  );

  const strongDup = useMemo(
    () => effectiveTxs.filter(tx =>
      !dupeResult.exactUids.has(tx.uid)
      && !dupeResult.fileDuplicateUids.has(tx.uid)
      && dupeResult.matches.get(tx.uid)?.level === 'strong'),
    [effectiveTxs, dupeResult],
  );

  const skippedDisplay = useMemo(() => {
    if (!parseResult) return [];
    const out: SkippedRow[] = [...parseResult.skipped];
    for (const tx of effectiveTxs) {
      if (dupeResult.fileDuplicateUids.has(tx.uid)) out.push({ tx, reason: 'duplicate_file' });
      else if (dupeResult.exactUids.has(tx.uid)) out.push({ tx, reason: 'duplicate_exact' });
    }
    const matchedRefundUids = new Set(crossRefunds.map(r => r.tx.uid));
    for (const tx of parseResult.refunds) {
      if (processedRefundIds.has(tx.externalId)) out.push({ tx, reason: 'refund_processed' });
      else if (!matchedRefundUids.has(tx.uid)) out.push({ tx, reason: 'refund' });
    }
    return out;
  }, [parseResult, effectiveTxs, dupeResult, crossRefunds, processedRefundIds]);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const tx of effectiveTxs) if (tx.date) set.add(tx.date.slice(0, 7));
    for (const r of crossRefunds) if (r.tx.date) set.add(r.tx.date.slice(0, 7));
    for (const row of skippedDisplay) if (row.tx?.date) set.add(row.tx.date.slice(0, 7));
    return [...set].sort().reverse();
  }, [effectiveTxs, crossRefunds, skippedDisplay]);

  const selectedRows = useMemo(
    () => effectiveTxs.filter(tx =>
      selected.has(tx.uid)
      && !dupeResult.exactUids.has(tx.uid)
      && !dupeResult.fileDuplicateUids.has(tx.uid)),
    [effectiveTxs, selected, dupeResult],
  );

  const selectedStrongCount = selectedRows.filter(
    tx => dupeResult.matches.get(tx.uid)?.level === 'strong',
  ).length;

  const selectedRefundRows = useMemo(
    () => crossRefunds.filter(r => selectedRefunds.has(r.tx.uid)),
    [crossRefunds, selectedRefunds],
  );

  const previewItems = useMemo<PreviewItem[]>(() => {
    if (filter === 'refund') {
      const byMonth = new Map<string, CrossMonthRefund[]>();
      for (const r of crossRefunds) {
        if (monthFilter !== 'all' && !r.tx.date.startsWith(monthFilter)) continue;
        const m = r.tx.date.slice(0, 7) || '未知';
        const list = byMonth.get(m);
        if (list) list.push(r);
        else byMonth.set(m, [r]);
      }
      const items: PreviewItem[] = [];
      for (const m of [...byMonth.keys()].sort().reverse()) {
        items.push({ kind: 'header', key: `h-${m}`, month: m });
        const list = byMonth.get(m)!.slice().sort((a, b) => b.tx.date.localeCompare(a.tx.date));
        for (const r of list) items.push({ kind: 'refund', key: `r-${r.tx.uid}`, refund: r });
      }
      return items;
    }

    const source = filter === 'import' ? importable : filter === 'dup' ? strongDup : null;
    if (source) {
      const byMonth = new Map<string, ClassifiedBillTx[]>();
      for (const tx of source) {
        if (monthFilter !== 'all' && !tx.date.startsWith(monthFilter)) continue;
        const m = tx.date.slice(0, 7) || '未知';
        const list = byMonth.get(m);
        if (list) list.push(tx);
        else byMonth.set(m, [tx]);
      }
      const items: PreviewItem[] = [];
      for (const m of [...byMonth.keys()].sort().reverse()) {
        items.push({ kind: 'header', key: `h-${m}`, month: m });
        const list = byMonth.get(m)!.slice().sort((a, b) => (b.time || b.date).localeCompare(a.time || a.date));
        for (const tx of list) {
          items.push({ kind: 'tx', key: `t-${tx.uid}`, tx, match: dupeResult.matches.get(tx.uid) });
        }
      }
      return items;
    }

    const rows = skippedDisplay.filter(row => {
      const date = row.tx?.date ?? '';
      return monthFilter === 'all' || date.startsWith(monthFilter);
    });
    const byMonth = new Map<string, SkippedRow[]>();
    for (const row of rows) {
      const m = row.tx?.date?.slice(0, 7) || '未知';
      const list = byMonth.get(m);
      if (list) list.push(row);
      else byMonth.set(m, [row]);
    }
    const items: PreviewItem[] = [];
    for (const m of [...byMonth.keys()].sort().reverse()) {
      items.push({ kind: 'header', key: `h-${m}`, month: m });
      for (let i = 0; i < byMonth.get(m)!.length; i++) {
        items.push({ kind: 'skip', key: `s-${m}-${i}`, row: byMonth.get(m)![i] });
      }
    }
    return items;
  }, [filter, importable, strongDup, skippedDisplay, crossRefunds, monthFilter, dupeResult]);

  const loadBatches = useCallback(async () => {
    try { setBatches(await getImportBatches(8)); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const enterPreview = useCallback(async (
    parsed: ParseResult,
    existingOverride?: ExistingExpenseForDedupe[],
    crossOverride?: CrossMonthRefund[],
  ) => {
    const cats = await getCategories();
    const rules = await getCustomRules();
    if (cats.filter(x => x.type === 'expense').length === 0) {
      throw new Error('没有可用的支出分类，请先在分类管理中添加');
    }

    const classifiedList = classifyTransactions(parsed.transactions, cats, rules);

    let existing: ExistingExpenseForDedupe[];
    let externalIds: Set<string>;
    if (existingOverride) {
      existing = existingOverride;
      externalIds = new Set();
    } else {
      const start = shiftDate(parsed.meta.dateStart || todayString(), -1);
      const end = shiftDate(parsed.meta.dateEnd || todayString(), 1);
      const rows = await getExpensesInRange(start, end);
      existing = rows.map(e => ({
        id: e.id,
        amount: e.amount,
        category_id: e.category_id,
        category_name: e.category_name,
        category_type: e.category_type,
        description: e.description,
        raw_input: e.raw_input,
        expense_date: e.expense_date,
      }));
      externalIds = await getImportedExternalIds(parsed.source);
    }

    const dupe = dedupeTransactions(classifiedList, { externalIds, existing });
    const defaultSelected = new Set(
      classifiedList
        .filter(tx => !dupe.exactUids.has(tx.uid)
          && !dupe.fileDuplicateUids.has(tx.uid)
          && dupe.matches.get(tx.uid)?.level !== 'strong')
        .map(tx => tx.uid),
    );

    // 跨月退款：找已有账本里的原支出
    let cross: CrossMonthRefund[];
    let processed = new Set<string>();
    if (crossOverride) {
      cross = crossOverride;
    } else {
      const fileIds = new Set<string>();
      for (const tx of parsed.transactions) fileIds.add(tx.externalId);
      for (const row of parsed.skipped) if (row.tx) fileIds.add(row.tx.externalId);
      processed = await getProcessedRefundIds(parsed.source);
      cross = [];

      for (const refund of parsed.refunds) {
        if (processed.has(refund.externalId)) continue;
        if (isRefundInFile(refund, parsed.transactions)) continue;

        if (refund.source === 'alipay') {
          const base = refundBaseExternalId(refund);
          if (base) {
            const exact = await findExpenseByExternalId('alipay', base);
            if (exact && exact.category_type === 'expense') {
              cross.push({ tx: refund, target: exact, confidence: 'exact', alternatives: 1 });
              continue;
            }
            // 原单就在本文件里（交易关闭/全额退款），没有历史账目可冲减，不再模糊猜别的账
            if (fileIds.has(base)) continue;
          }
        }

        const candidates = await findRefundCandidates({
          source: refund.source,
          date: refund.date,
          amountCents: refund.amountCents,
        });
        const pick = pickRefundTarget(refund, candidates);
        if (pick) {
          cross.push({
            tx: refund,
            target: pick.target,
            confidence: pick.confidence,
            alternatives: pick.alternatives,
          });
        }
      }
    }
    cross.sort((a, b) => a.tx.date.localeCompare(b.tx.date));

    setCategories(cats);
    setCustomRules(rules);
    setParseResult(parsed);
    setClassified(classifiedList);
    setDupeContext({ externalIds, existing });
    setOverrides({});
    setSelected(defaultSelected);
    setCrossRefunds(cross);
    setProcessedRefundIds(processed);
    setSelectedRefunds(new Set(
      cross.filter(r => r.confidence !== 'uncertain').map(r => r.tx.uid),
    ));
    setFilter('import');
    setMonthFilter('all');
    setDone(null);
    setPhase('preview');
  }, []);

  const handlePick = useCallback(async () => {
    if (phase === 'parsing' || phase === 'importing') return;
    setPhase('parsing');
    try {
      const picked = await pickBillFileBytes();
      if (!picked) { setPhase(parseResult ? 'preview' : 'idle'); return; }
      await new Promise(resolve => setTimeout(resolve, 30));
      const parsed = parseBillFile(picked.name, picked.bytes);
      if (parsed.transactions.length === 0 && parsed.skipped.length === 0 && parsed.refunds.length === 0) {
        throw new Error('账单里没有解析到交易记录');
      }
      await enterPreview(parsed);
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || '无法解析账单文件');
      setPhase(parseResult ? 'preview' : 'idle');
    }
  }, [phase, parseResult, enterPreview]);

  const loadDemo = useCallback(async () => {
    const day = todayString();
    const tx = (
      id: number, merchant: string, item: string, cents: number, date = day,
    ): NormalizedBillTx => ({
      uid: `wechat:demo-${id}`,
      source: 'wechat',
      externalId: `demo-${id}`,
      time: `${date} 12:0${id}:00`,
      date,
      direction: 'expense',
      amountCents: cents,
      merchant,
      item,
      description: item ? `${merchant} · ${item}` : merchant,
      billCategory: '商户消费',
      status: '支付成功',
      paymentMethod: '零钱',
      raw: `[微信] ${date} ${merchant} ${item}`,
    });

    const rows: NormalizedBillTx[] = [
      tx(1, '张亮麻辣烫', '午餐', 2000),
      tx(2, '上海地铁', '乘车码', 400),
      tx(3, '淘宝', '日用品', 8900, shiftDate(day, -1)),
      tx(4, '上海市普陀区人民医院', '门诊费用', 11115, shiftDate(day, -1)),
      tx(5, '万达影城', '电影票', 4500, shiftDate(day, -2)),
      tx(6, '瑞幸咖啡', '生椰拿铁', 990, shiftDate(day, -2)),
    ];

    const skipped: SkippedRow[] = [
      { tx: { ...tx(7, '刘恭豪', '转账备注:微信转账', 2400), direction: 'income', status: '已转入零钱通' }, reason: 'income' },
      { tx: { ...tx(8, '杭州万桩', '充电支付', 1000), status: '已全额退款' }, reason: 'full_refund' },
    ];

    const refund: NormalizedBillTx = {
      ...tx(9, '张亮麻辣烫', '退款', 2000),
      direction: 'neutral',
      billCategory: '退款',
      status: '退款成功',
      description: '张亮麻辣烫 · 退款',
    };

    const parsed: ParseResult = {
      source: 'wechat',
      fileName: '微信 · 示例账单.xlsx',
      meta: {
        source: 'wechat',
        fileName: '示例账单.xlsx',
        totalRows: 9,
        rawExpenseRows: 6,
        rawExpenseCents: 2000 + 400 + 8900 + 11115 + 4500 + 990,
        dateStart: shiftDate(day, -2),
        dateEnd: day,
        headline: { totalRows: 9, expenseRows: 6 },
        warnings: [],
      },
      transactions: rows,
      refunds: [refund],
      skipped,
    };

    const foodId = categories.find(x => x.name === '餐饮')?.id ?? categories[0]?.id ?? 1;
    const drinkId = categories.find(x => x.name === '餐饮')?.id ?? foodId;
    // 给示例退款一个真实存在的原账目，便于走通「冲减 + 撤销」
    const realTargetId = await addExpense(20, foodId, day, '晚饭', '晚饭20');
    const fakeTarget: ExpenseWithCategory = {
      id: realTargetId, amount: 20, category_id: foodId, category_name: '餐饮',
      category_icon: '🍔', category_color: '#f97316', category_type: 'expense',
      description: '晚饭', raw_input: '晚饭20', expense_date: day, created_at: '',
      source: null, external_id: null, import_batch_id: null,
    };
    const fakeExisting: ExistingExpenseForDedupe[] = [
      fakeTarget,
      {
        id: -2, amount: 4, category_id: drinkId, category_name: '餐饮', category_type: 'expense',
        description: '瑞幸', raw_input: '瑞幸4', expense_date: day,
      },
    ];

    try {
      await enterPreview(parsed, fakeExisting, [
        { tx: refund, target: fakeTarget, confidence: 'exact', alternatives: 1 },
      ]);
    } catch (e: any) {
      Alert.alert('示例加载失败', e?.message || '请先在分类管理中添加支出分类');
    }
  }, [categories, enterPreview]);

  const toggle = useCallback((uid: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const toggleRefund = useCallback((uid: string) => {
    setSelectedRefunds(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (filter === 'import') {
      const visible = importable
        .filter(tx => monthFilter === 'all' || tx.date.startsWith(monthFilter))
        .map(tx => tx.uid);
      const allOn = visible.length > 0 && visible.every(uid => selected.has(uid));
      setSelected(prev => {
        const next = new Set(prev);
        for (const uid of visible) {
          if (allOn) next.delete(uid);
          else next.add(uid);
        }
        return next;
      });
    } else if (filter === 'dup') {
      const visible = strongDup
        .filter(tx => monthFilter === 'all' || tx.date.startsWith(monthFilter))
        .map(tx => tx.uid);
      const allOn = visible.length > 0 && visible.every(uid => selected.has(uid));
      setSelected(prev => {
        const next = new Set(prev);
        for (const uid of visible) {
          if (allOn) next.delete(uid);
          else next.add(uid);
        }
        return next;
      });
    }
  }, [filter, importable, strongDup, monthFilter, selected]);

  const handleImport = useCallback(async () => {
    if (!parseResult || (selectedRows.length === 0 && selectedRefundRows.length === 0)) return;
    setPhase('importing');
    try {
      const batchId = `bill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const rows = selectedRows.map(tx => ({
        amount: tx.amountCents / 100,
        categoryId: tx.categoryId,
        expenseDate: tx.date,
        description: tx.description,
        rawInput: `[账单] ${SOURCE_LABEL[tx.source]} ${tx.time} ${tx.description} ¥${fmtCents(tx.amountCents)}`,
        source: tx.source,
        externalId: tx.externalId,
        importBatchId: batchId,
      }));
      const refundPayload = selectedRefundRows.map(r => ({
        source: r.tx.source,
        refundExternalId: r.tx.externalId,
        expenseId: r.target.id,
        amountCents: r.tx.amountCents,
      }));
      const result = await insertImportedExpenses(rows, {
        id: batchId,
        source: parseResult.source,
        fileName: parseResult.meta.fileName,
        totalRows: parseResult.meta.totalRows,
        skippedCount: Math.max(0, parseResult.meta.totalRows - rows.length - refundPayload.length),
      }, refundPayload);
      setDone({
        batchId,
        fileName: parseResult.meta.fileName,
        inserted: result.inserted,
        skipped: Math.max(0, parseResult.meta.totalRows - result.inserted - result.adjusted),
        adjusted: result.adjusted,
      });
      setPhase('done');
      loadBatches();
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || '写入数据库失败');
      setPhase('preview');
    }
  }, [parseResult, selectedRows, selectedRefundRows, loadBatches]);

  const resetToIdle = useCallback(() => {
    setPhase('idle');
    setParseResult(null);
    setClassified([]);
    setDupeContext(null);
    setOverrides({});
    setSelected(new Set());
    setCrossRefunds([]);
    setSelectedRefunds(new Set());
    setProcessedRefundIds(new Set());
    setDone(null);
    setPickerUid(null);
  }, []);

  const handleUndo = useCallback((batch: ImportBatch) => {
    const adjustedNote = (batch.adjusted_count ?? 0) > 0
      ? `，并恢复本次冲减的 ${batch.adjusted_count} 笔原支出`
      : '';
    Alert.alert(
      '撤销这次导入',
      `将删除「${batch.file_name}」导入的全部 ${batch.imported_count} 条账目（含之后编辑过的）${adjustedNote}。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '撤销', style: 'destructive', onPress: async () => {
            try {
              const deleted = await undoImportBatch(batch.id);
              await loadBatches();
              if (done?.batchId === batch.id) resetToIdle();
              const restored = (batch.adjusted_count ?? 0) > 0
                ? `，恢复了 ${batch.adjusted_count} 笔原支出`
                : '';
              Alert.alert('已撤销', `删除了 ${deleted} 条账目${restored}`);
            } catch (e: any) {
              Alert.alert('撤销失败', e?.message || '请稍后重试');
            }
          },
        },
      ],
    );
  }, [done, loadBatches, resetToIdle]);

  const renderItem = useCallback(({ item }: { item: PreviewItem }) => {
    if (item.kind === 'header') {
      return <Text style={s.monthHeader}>{item.month === '未知' ? '未知日期' : monthLabel(item.month)}</Text>;
    }

    if (item.kind === 'refund') {
      const { tx, target, confidence } = item.refund;
      const on = selectedRefunds.has(tx.uid);
      const remaining = Math.max(0, Math.round(target.amount * 100) - tx.amountCents) / 100;
      const badge = confidence === 'exact' ? '自动匹配' : confidence === 'likely' ? '唯一匹配' : '需确认';
      const refundLabel = tx.description
        .replace(/^退款\s*[·\-]\s*/, '')
        .replace(/\s*[·\-]\s*退款.*$/, '')
        .trim();
      return (
        <View style={s.txRow}>
          <TouchableOpacity style={s.checkHit} onPress={() => toggleRefund(tx.uid)} activeOpacity={0.7}>
            <View style={[s.checkbox, on && s.checkboxOn]}>
              {on ? <Check size={13} color="#fff" /> : null}
            </View>
          </TouchableOpacity>
          <View style={s.txMain}>
            <View style={s.txTop}>
              <Text style={s.txDesc} numberOfLines={1}>退款 · {refundLabel || tx.merchant || tx.description}</Text>
              <Text style={[s.txAmount, { color: c.success }]}>+{fmtCents(tx.amountCents)}</Text>
            </View>
            <View style={s.txMeta}>
              <Text style={s.txDate}>{shortDate(tx.date)}</Text>
              <Text style={s.txSource}>{SOURCE_LABEL[tx.source]}</Text>
              <Text style={[s.refundBadge, confidence === 'uncertain' && { color: c.warning }]}>{badge}</Text>
            </View>
            <Text style={s.dupHint} numberOfLines={3}>
              冲减：{shortDate(target.expense_date)} {target.category_name} ¥{target.amount.toFixed(2)} {target.description || target.raw_input || ''}
              {remaining > 0 ? ` → 剩余 ¥${remaining.toFixed(2)}` : ' → 将删除原账目'}
              {confidence === 'uncertain' && item.refund.alternatives > 1 ? `（${item.refund.alternatives} 个候选，请核对）` : ''}
            </Text>
          </View>
        </View>
      );
    }

    if (item.kind === 'skip') {
      const tx = item.row.tx;
      return (
        <View style={s.skipRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.skipDesc} numberOfLines={1}>
              {tx?.description || tx?.merchant || '（无明细）'}
            </Text>
            <Text style={s.skipMeta} numberOfLines={1}>
              {tx?.date ? shortDate(tx.date) : '--'} · {SKIP_REASON_LABEL[item.row.reason]}
              {item.row.detail ? ` · ${item.row.detail}` : ''}
            </Text>
          </View>
          <Text style={s.skipAmount}>{tx ? `¥${fmtCents(tx.amountCents)}` : ''}</Text>
        </View>
      );
    }

    const { tx, match } = item;
    const on = selected.has(tx.uid);
    const cat = categoryById.get(tx.categoryId);
    const strong = match?.level === 'strong';
    const weak = match?.level === 'weak';

    return (
      <View style={s.txRow}>
        <TouchableOpacity style={s.checkHit} onPress={() => toggle(tx.uid)} activeOpacity={0.7}>
          <View style={[s.checkbox, on && s.checkboxOn]}>
            {on ? <Check size={13} color="#fff" /> : null}
          </View>
        </TouchableOpacity>
        <View style={s.txMain}>
          <View style={s.txTop}>
            <Text style={s.txDesc} numberOfLines={1}>{tx.description}</Text>
            <Text style={s.txAmount}>-{fmtCents(tx.amountCents)}</Text>
          </View>
          <View style={s.txMeta}>
            <Text style={s.txDate}>{shortDate(tx.date)}</Text>
            <Text style={s.txSource}>{SOURCE_LABEL[tx.source]}</Text>
            <TouchableOpacity
              style={s.catChip}
              onPress={() => setPickerUid(tx.uid)}
              activeOpacity={0.7}
            >
              <Text style={s.catText}>{cat?.icon ?? '📦'} {tx.categoryName}</Text>
            </TouchableOpacity>
            {tx.confidence === 'low' ? <Text style={s.pending}>待确认</Text> : null}
            {strong ? <Text style={s.strong}>疑似重复</Text> : null}
          </View>
          {strong && match ? (
            <Text style={s.dupHint} numberOfLines={2}>
              已有：{shortDate(match.existing.expense_date)} {match.existing.category_name} ¥{match.existing.amount.toFixed(2)} {match.existing.description || match.existing.raw_input || ''}
            </Text>
          ) : null}
          {weak && match ? (
            <Text style={s.weakHint} numberOfLines={2}>
              同日同金额（分类不同）：{shortDate(match.existing.expense_date)} {match.existing.category_name} ¥{match.existing.amount.toFixed(2)} {match.existing.description || match.existing.raw_input || ''}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }, [selected, selectedRefunds, categoryById, s, toggle, toggleRefund, c]);

  const pickerTx = pickerUid ? effectiveTxs.find(tx => tx.uid === pickerUid) ?? null : null;
  const expenseCategories = useMemo(() => {
    const seen = new Set<string>();
    return categories.filter(x => x.type === 'expense').filter(x => {
      if (seen.has(x.name)) return false;
      seen.add(x.name);
      return true;
    });
  }, [categories]);

  // ===================== render =====================

  if (phase === 'parsing') {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={s.centerText}>正在解析账单…</Text>
      </View>
    );
  }

  if (phase === 'idle') {
    return (
      <ScrollView style={s.page} contentContainerStyle={s.pagePad}>
        <View style={s.card}>
          <View style={s.heroRow}>
            <View style={s.heroIcon}><FileSpreadsheet size={22} color={c.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroTitle}>导入微信 / 支付宝账单</Text>
              <Text style={s.heroSub}>支持微信 xlsx、支付宝 csv；只录入支出</Text>
            </View>
          </View>
          <Text style={s.bullet}>· 退款按净额入账：全额退款剔除，部分退款自动扣减</Text>
          <Text style={s.bullet}>· 跨月退款会匹配原支出，确认后冲减历史账目</Text>
          <Text style={s.bullet}>· 收入、转账、理财、还款、交易关闭不计入</Text>
          <Text style={s.bullet}>· 交易单号精确去重；与已有账目同金额、同日、同分类的会标为疑似重复</Text>
          <Text style={s.bullet}>· 支持几天到一年的账单，按月分组预览</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={handlePick} activeOpacity={0.8}>
            <FileSpreadsheet size={18} color="#fff" />
            <Text style={s.primaryBtnText}>选择账单文件</Text>
          </TouchableOpacity>
          {__DEV__ && Platform.OS === 'web' ? (
            <TouchableOpacity style={s.ghostBtn} onPress={loadDemo}>
              <Text style={s.ghostBtnText}>载入示例预览（调试）</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {batches.length > 0 ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>最近导入</Text>
            {batches.map(b => (
              <View key={b.id} style={s.batchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.batchName} numberOfLines={1}>{SOURCE_LABEL[b.source]} · {b.file_name}</Text>
                  <Text style={s.batchMeta}>
                    {b.created_at.slice(5, 16)} · 导入 {b.imported_count} 笔
                    {(b.adjusted_count ?? 0) > 0 ? ` / 冲减 ${b.adjusted_count} 笔` : ''}
                    {` / 跳过 ${b.skipped_count} 笔`}
                  </Text>
                </View>
                <TouchableOpacity style={s.undoBtn} onPress={() => handleUndo(b)}>
                  <Trash2 size={14} color={c.danger} />
                  <Text style={s.undoText}>撤销</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  if (phase === 'done' && done) {
    return (
      <ScrollView style={s.page} contentContainerStyle={s.pagePad}>
        <View style={s.card}>
          <View style={s.doneIcon}><Check size={26} color="#fff" /></View>
          <Text style={s.doneTitle}>导入完成</Text>
          <Text style={s.doneSub}>{done.fileName}</Text>
          <Text style={s.doneNum}>
            成功导入 {done.inserted} 笔
            {done.adjusted > 0 ? `，冲减 ${done.adjusted} 笔跨月退款` : ''}
            {done.skipped > 0 ? `，跳过 ${done.skipped} 笔` : ''}
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => router.back()}>
            <Text style={s.primaryBtnText}>完成</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={resetToIdle}>
            <Text style={s.ghostBtnText}>再导入一个</Text>
          </TouchableOpacity>
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>反悔了？</Text>
          <Text style={s.hintText}>可以撤销这次导入，删除本批次账目，并恢复本次冲减过的原支出。</Text>
          <TouchableOpacity
            style={s.dangerBtn}
            onPress={() => handleUndo({
              id: done.batchId,
              source: parseResult?.source ?? 'wechat',
              file_name: done.fileName,
              total_rows: parseResult?.meta.totalRows ?? 0,
              imported_count: done.inserted,
              skipped_count: done.skipped,
              adjusted_count: done.adjusted,
              created_at: '',
            })}
          >
            <Trash2 size={16} color={c.danger} />
            <Text style={s.dangerBtnText}>撤销本次导入</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (!parseResult) return <View style={s.center} />;

  const warning = parseResult.meta.warnings[0];
  const monthOptions = ['all', ...months];
  const filterDefs: Array<[Filter, string]> = [
    ['import', `可导入 ${importable.length}`],
    ['dup', `疑似重复 ${strongDup.length}`],
    ...(crossRefunds.length > 0
      ? [['refund', `跨月退款 ${crossRefunds.length}`] as [Filter, string]]
      : []),
    ['skipped', `已跳过 ${skippedDisplay.length}`],
  ];

  return (
    <View style={s.page}>
      <View style={s.summary}>
        <View style={s.summaryTop}>
          <Text style={s.summaryName} numberOfLines={1}>{parseResult.fileName}</Text>
          <Text style={s.summaryRange}>
            {parseResult.meta.dateStart ? `${parseResult.meta.dateStart} ~ ${parseResult.meta.dateEnd}` : '无日期'}
          </Text>
        </View>
        <View style={s.summaryStats}>
          <Text style={s.stat}><Text style={s.statNum}>{importable.length}</Text> 可导入</Text>
          <Text style={s.stat}><Text style={[s.statNum, { color: c.warning }]}>{strongDup.length}</Text> 疑似重复</Text>
          {crossRefunds.length > 0 ? (
            <Text style={s.stat}><Text style={[s.statNum, { color: c.success }]}>{crossRefunds.length}</Text> 跨月退款</Text>
          ) : null}
          <Text style={s.stat}><Text style={[s.statNum, { color: c.hint }]}>{skippedDisplay.length}</Text> 已跳过</Text>
          <Text style={s.stat}><Text style={s.statNum}>{parseResult.meta.totalRows}</Text> 原始行</Text>
        </View>
        {warning ? (
          <View style={s.warnRow}>
            <TriangleAlert size={14} color={c.warning} />
            <Text style={s.warnText}>{warning}</Text>
          </View>
        ) : null}
      </View>

      <View style={s.filterRow}>
        {filterDefs.map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[s.filterChip, filter === key && s.filterChipOn]}
            onPress={() => setFilter(key)}
          >
            <Text style={[s.filterText, filter === key && s.filterTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {months.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthBar} contentContainerStyle={s.monthBarContent}>
          {monthOptions.map(m => (
            <TouchableOpacity
              key={m}
              style={[s.monthChip, monthFilter === m && s.monthChipOn]}
              onPress={() => setMonthFilter(m)}
            >
              <Text style={[s.monthChipText, monthFilter === m && s.monthChipTextOn]}>
                {m === 'all' ? '全部月份' : m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <FlatList
        data={previewItems}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        style={s.list}
        contentContainerStyle={s.listContent}
        initialNumToRender={20}
        windowSize={10}
        removeClippedSubviews
        ListEmptyComponent={<Text style={s.empty}>这里还没有记录</Text>}
        ListHeaderComponent={filter === 'import' ? (
          <View style={s.selectAllRow}>
            <TouchableOpacity style={s.selectAllBtn} onPress={toggleAll}>
              <Text style={s.selectAllText}>
                {(() => {
                  const visible = importable.filter(tx => monthFilter === 'all' || tx.date.startsWith(monthFilter));
                  const scope = monthFilter === 'all' ? '全部' : '当前月份';
                  return visible.length > 0 && visible.every(tx => selected.has(tx.uid))
                    ? `取消${scope}全选`
                    : `全选${scope}`;
                })()}
              </Text>
            </TouchableOpacity>
            <Text style={s.selectHint}>默认已选非疑似重复项</Text>
          </View>
        ) : null}
      />

      <View style={s.bottomBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.bottomCount}>
            已选 {selectedRows.length} 笔待导入
            {selectedRefundRows.length > 0 ? `，冲减 ${selectedRefundRows.length} 笔退款` : ''}
          </Text>
          {selectedStrongCount > 0 ? (
            <Text style={s.bottomWarn}>其中疑似重复 {selectedStrongCount} 笔</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[s.importBtn, ((selectedRows.length === 0 && selectedRefundRows.length === 0) || phase === 'importing') && s.importBtnOff]}
          onPress={handleImport}
          disabled={(selectedRows.length === 0 && selectedRefundRows.length === 0) || phase === 'importing'}
          activeOpacity={0.8}
        >
          {phase === 'importing'
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.importBtnText}>
              {selectedRows.length > 0 ? `导入 ${selectedRows.length} 笔` : `冲减 ${selectedRefundRows.length} 笔退款`}
            </Text>}
        </TouchableOpacity>
      </View>

      <Modal visible={pickerTx !== null} transparent animationType="slide" onRequestClose={() => setPickerUid(null)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.modalBackdrop} onPress={() => setPickerUid(null)} activeOpacity={1} />
          <View style={s.modalPanel}>
            <ModalHeader title="选择分类" onClose={() => setPickerUid(null)} />
            <ScrollView contentContainerStyle={s.catGrid}>
              {expenseCategories.map(cat => {
                const active = pickerTx?.categoryId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[s.catItem, active && s.catItemOn]}
                    onPress={() => {
                      if (!pickerTx) return;
                      setOverrides(prev => ({ ...prev, [pickerTx.uid]: cat.id }));
                      setPickerUid(null);
                    }}
                  >
                    <Text>{cat.icon}</Text>
                    <Text style={[s.catItemText, active && s.catItemTextOn]}>{cat.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (c: ThemeColors, bottomInset: number) => StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background },
  pagePad: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background },
  centerText: { marginTop: spacing.md, color: c.textSecondary, fontSize: fontSize.base },

  card: {
    backgroundColor: c.card, borderRadius: radius.md, padding: spacing.lg,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: c.subtle,
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: '600', color: c.text, marginBottom: spacing.md },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  heroIcon: {
    width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.primarySoftBg,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  heroTitle: { fontSize: fontSize.lg, fontWeight: '600', color: c.text },
  heroSub: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2 },
  bullet: { fontSize: fontSize.sm, color: c.textSecondary, lineHeight: 20, marginBottom: 4 },

  primaryBtn: {
    marginTop: spacing.lg, backgroundColor: c.primary, borderRadius: radius.sm,
    paddingVertical: spacing.md, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: spacing.sm,
  },
  primaryBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '600' },
  ghostBtn: { marginTop: spacing.sm, paddingVertical: spacing.md, alignItems: 'center' },
  ghostBtnText: { color: c.primary, fontSize: fontSize.base },
  dangerBtn: {
    marginTop: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: c.danger,
    paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: spacing.xs,
  },
  dangerBtnText: { color: c.danger, fontSize: fontSize.base, fontWeight: '500' },

  batchRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: c.subtle,
  },
  batchName: { fontSize: fontSize.base, color: c.text, fontWeight: '500' },
  batchMeta: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2 },
  undoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: spacing.sm },
  undoText: { color: c.danger, fontSize: fontSize.sm },

  doneIcon: {
    width: 54, height: 54, borderRadius: radius.circle, backgroundColor: c.success,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.md,
  },
  doneTitle: { fontSize: fontSize.lg, fontWeight: '600', color: c.text, textAlign: 'center' },
  doneSub: { fontSize: fontSize.sm, color: c.textSecondary, textAlign: 'center', marginTop: 4 },
  doneNum: { fontSize: fontSize.lg, color: c.success, fontWeight: '600', textAlign: 'center', marginTop: spacing.lg },
  hintText: { fontSize: fontSize.sm, color: c.textSecondary, lineHeight: 20 },

  summary: {
    backgroundColor: c.card, marginHorizontal: spacing.lg, marginTop: spacing.md,
    borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: c.subtle,
  },
  summaryTop: { flexDirection: 'row', alignItems: 'center' },
  summaryName: { flex: 1, fontSize: fontSize.base, fontWeight: '600', color: c.text },
  summaryRange: { fontSize: fontSize.xs, color: c.hint, marginLeft: spacing.sm },
  summaryStats: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  stat: { fontSize: fontSize.xs, color: c.textSecondary },
  statNum: { fontSize: fontSize.lg, fontWeight: '600', color: c.text },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  warnText: { flex: 1, fontSize: fontSize.xs, color: c.warning },

  filterRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  filterChip: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill,
    backgroundColor: c.subtle, alignItems: 'center',
  },
  filterChipOn: { backgroundColor: c.primarySoftBg },
  filterText: { fontSize: fontSize.sm, color: c.textSecondary },
  filterTextOn: { color: c.primary, fontWeight: '600' },

  monthBar: { maxHeight: 46, marginTop: spacing.sm },
  monthBarContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  monthChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill,
    borderWidth: 1, borderColor: c.border,
  },
  monthChipOn: { borderColor: c.primary, backgroundColor: c.primarySoftBg },
  monthChipText: { fontSize: fontSize.sm, color: c.textSecondary },
  monthChipTextOn: { color: c.primary, fontWeight: '500' },

  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 96 },
  empty: { textAlign: 'center', color: c.hint, fontSize: fontSize.base, paddingVertical: 60 },

  selectAllRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  selectAllBtn: { paddingVertical: 4, paddingRight: spacing.md },
  selectAllText: { color: c.primary, fontSize: fontSize.sm, fontWeight: '500' },
  selectHint: { color: c.hint, fontSize: fontSize.xs },

  monthHeader: {
    fontSize: fontSize.sm, color: c.textSecondary, fontWeight: '600',
    paddingTop: spacing.md, paddingBottom: spacing.xs,
  },

  txRow: {
    flexDirection: 'row', backgroundColor: c.card, borderRadius: radius.md,
    paddingVertical: spacing.md, paddingRight: spacing.md, marginBottom: 6,
    borderWidth: 1, borderColor: c.subtle,
  },
  checkHit: { width: 42, alignItems: 'center', paddingTop: 2 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: c.primary, borderColor: c.primary },
  txMain: { flex: 1 },
  txTop: { flexDirection: 'row', alignItems: 'center' },
  txDesc: { flex: 1, fontSize: fontSize.base, color: c.text, fontWeight: '500' },
  txAmount: { fontSize: fontSize.base, color: c.text, fontWeight: '600', marginLeft: spacing.sm },
  txMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  txDate: { fontSize: fontSize.xs, color: c.hint },
  txSource: { fontSize: fontSize.xs, color: c.hint },
  catChip: {
    paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill,
    backgroundColor: c.inputBg, borderWidth: 1, borderColor: c.border,
  },
  catText: { fontSize: fontSize.xs, color: c.textSecondary },
  pending: { fontSize: fontSize.xs, color: c.warning },
  strong: { fontSize: fontSize.xs, color: c.warning, fontWeight: '600' },
  refundBadge: { fontSize: fontSize.xs, color: c.success, fontWeight: '500' },
  dupHint: { fontSize: fontSize.xs, color: c.warning, marginTop: 4, lineHeight: 16 },
  weakHint: { fontSize: fontSize.xs, color: c.hint, marginTop: 4, lineHeight: 16 },

  skipRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md, marginBottom: 4, borderRadius: radius.sm,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.subtle,
  },
  skipDesc: { fontSize: fontSize.sm, color: c.textSecondary },
  skipMeta: { fontSize: fontSize.xs, color: c.hint, marginTop: 2 },
  skipAmount: { fontSize: fontSize.sm, color: c.hint, marginLeft: spacing.sm },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    paddingBottom: Math.max(bottomInset, spacing.md),
    backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.subtle,
  },
  bottomCount: { fontSize: fontSize.base, color: c.text, fontWeight: '600' },
  bottomWarn: { fontSize: fontSize.xs, color: c.warning, marginTop: 2 },
  importBtn: {
    backgroundColor: c.primary, borderRadius: radius.sm,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    minWidth: 120, alignItems: 'center', justifyContent: 'center',
  },
  importBtnOff: { opacity: 0.4 },
  importBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '600' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalBackdrop: { flex: 1 },
  modalPanel: {
    backgroundColor: c.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    maxHeight: '75%', paddingBottom: Math.max(bottomInset, spacing.lg),
  },
  catGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.lg,
  },
  catItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.card,
  },
  catItemOn: { borderColor: c.primary, backgroundColor: c.primarySoftBg },
  catItemText: { fontSize: fontSize.md, color: c.textSecondary, marginLeft: spacing.xs },
  catItemTextOn: { color: c.primary, fontWeight: '500' },
});
