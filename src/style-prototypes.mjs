import { CliError } from './errors.mjs';

const list = x => Array.isArray(x) ? x : [];
const text = x => typeof x === 'string' && x.trim().length > 0;
const unique = x => Array.isArray(x) && new Set(x).size === x.length;

// Validate recorded decisions; never infer a product style from words or tags.
export function validateStylePrototypes(catalog, items, { complete = false } = {}) {
  const issues = [];
  const check = (ok, path, message) => { if (!ok) issues.push({ path, message }); };
  const styles = list(catalog?.styles), rows = list(items);
  const ids = new Set(rows.map(x => x?.offer_id));
  const styleIds = new Set(styles.map(x => x?.style_id));
  check(text(catalog?.version), 'version', '缺少原型目录版本');
  check(Array.isArray(catalog?.styles), 'styles', '须为款式原型数组');
  check(styleIds.size === styles.length, 'styles', '款式 ID 重复');
  check(ids.size === rows.length, 'items', '商品 ID 重复');
  for (const [i, s] of styles.entries()) {
    const at = `styles[${i}]`;
    for (const key of ['style_id', 'name', 'definition', 'selection_significance', 'version']) check(text(s?.[key]), `${at}.${key}`, '须为非空文字');
    for (const key of ['inclusion_rules', 'exclusion_rules', 'representative_offer_ids', 'evidence', 'unknowns']) check(Array.isArray(s?.[key]), `${at}.${key}`, '须为数组');
    for (const key of ['inclusion_rules', 'exclusion_rules', 'evidence']) check(list(s?.[key]).length > 0 && list(s?.[key]).every(text), `${at}.${key}`, '须记录判断依据与边界');
    check(['high', 'medium', 'low'].includes(s?.confidence), `${at}.confidence`, '置信度无效');
    check(list(s?.representative_offer_ids).length > 0 && unique(s.representative_offer_ids), `${at}.representative_offer_ids`, '须有不重复的代表商品');
    for (const id of list(s?.representative_offer_ids)) check(ids.has(id) && rows.find(x => x.offer_id === id)?.style_ids?.includes(s.style_id), `${at}.representative_offer_ids`, '代表图须来自本款式真实成员');
  }
  for (const [i, row] of rows.entries()) {
    const at = `items[${i}]`;
    for (const key of ['offer_id', 'image_fingerprint', 'association_reason']) check(text(row?.[key]), `${at}.${key}`, '须保留图片身份与归属理由');
    check(typeof row?.image_url === 'string', `${at}.image_url`, '须保留原图来源');
    check(row?.catalog_version === catalog?.version, `${at}.catalog_version`, '归属须按当前原型版本复核');
    check(unique(row?.style_ids), `${at}.style_ids`, '须为不重复的款式 ID 数组');
    check(typeof row?.multiple_styles === 'boolean', `${at}.multiple_styles`, '须声明是否多款同图');
    check(['confirmed', 'pending', 'unusable'].includes(row?.boundary_status), `${at}.boundary_status`, '边界状态无效');
    for (const key of ['visible_objects', 'variants', 'unknowns', 'compared_style_ids']) check(Array.isArray(row?.[key]), `${at}.${key}`, '须为数组');
    for (const id of [...list(row?.style_ids), ...list(row?.compared_style_ids)]) check(styleIds.has(id), `${at}.style_ids`, `款式不存在: ${id}`);
    if (row?.boundary_status === 'confirmed') {
      check(list(row.style_ids).length > 0 && list(row.visible_objects).length > 0, at, '已确认商品须有可见实物和款式');
      check(list(row.style_ids).every(id => list(row.compared_style_ids).includes(id)), `${at}.compared_style_ids`, '须记录与归属原型的比较');
      if (list(row.style_ids).length > 1) check(row.multiple_styles && list(row.visible_objects).length >= row.style_ids.length, at, '多重归属须有多款实物证据');
    } else check(list(row?.style_ids).length === 0, `${at}.style_ids`, '待定或不可用图片留在边界组');
  }
  check(Array.isArray(catalog?.revisions), 'revisions', '须记录原型变更与回查');
  for (const [i, event] of list(catalog?.revisions).entries()) {
    const at = `revisions[${i}]`;
    check(['create', 'merge', 'split', 'boundary'].includes(event?.action) && text(event?.reason), at, '须记录变更类型与原因');
    for (const key of ['affected_offer_ids', 'rechecked_offer_ids']) check(unique(event?.[key]), `${at}.${key}`, '须记录不重复的回查范围');
    for (const id of [...list(event?.affected_offer_ids), ...list(event?.rechecked_offer_ids)]) check(ids.has(id), at, '回查商品不存在');
    if (complete) check(list(event?.affected_offer_ids).every(id => list(event?.rechecked_offer_ids).includes(id)), at, '受影响的早期商品尚未全部回查');
  }
  const review = catalog?.review;
  check(['pending', 'approved', 'changes_requested'].includes(review?.status), 'review.status', '须记录图片组审阅状态');
  if (complete || review?.status === 'approved') {
    check(review?.status === 'approved' && text(review?.reviewer) && text(review?.notes), 'review', '完成前须保留真实图片组审阅记录');
    check(review?.catalog_version === catalog?.version, 'review.catalog_version', '原型变化后须重新审阅');
    check(unique(review?.reviewed_offer_ids) && review.reviewed_offer_ids.length === ids.size && review.reviewed_offer_ids.every(id => ids.has(id)), 'review.reviewed_offer_ids', '审阅须覆盖全部商品及边界组');
  }
  if (issues.length) throw new CliError('OUTPUT_CONTRACT_FAILED', '款式原型与逐商品归属不一致', { issues });
  return { ok: true, unique_offers: ids.size, memberships: rows.reduce((n, x) => n + list(x.style_ids).length, 0) };
}
