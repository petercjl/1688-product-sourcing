import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateStylePrototypes } from './style-prototypes.mjs';
import { CliError } from './errors.mjs';

async function jsonFiles(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...await jsonFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(path);
  }
  return out.sort();
}

function expandFile(data, source) {
  if (data.batch_id && Array.isArray(data.items)) return data.items.map(item => ({ ...item, batch_id: data.batch_id, tag_source: source }));
  if (!Array.isArray(data.batches)) throw new CliError('INVALID_VISUAL_TAGS', '视觉标签文件缺少 batch_id/items 或 batches', { source });
  const out = [];
  for (const batch of data.batches) {
    if (Array.isArray(batch.items)) out.push(...batch.items.map(item => ({ ...item, batch_id: batch.batch_id, tag_source: source })));
    if (Array.isArray(batch.assignments)) {
      for (const [offerId, profileId] of batch.assignments) {
        const profile = data.profiles?.[profileId];
        if (!profile) throw new CliError('INVALID_VISUAL_TAGS', '紧凑标签引用了不存在的 profile', { source, profile_id: profileId });
        out.push({ offer_id: offerId, ...profile, batch_id: batch.batch_id, tag_source: source });
      }
    }
  }
  return out;
}

export async function compileVisualTags(manifestPath, tagDir, prototypesPath) {
  if (!prototypesPath) throw new CliError('PROTOTYPES_REQUIRED', '须提供 --prototypes：由图片归纳的款式原型目录');
  const prototypes = JSON.parse(await readFile(resolve(prototypesPath), 'utf8'));
  let manifest;
  try { manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8')); }
  catch { throw new CliError('INPUT_READ_FAILED', '无法读取视觉批次清单', { path: resolve(manifestPath) }); }
  const expected = manifest.batches.flatMap(batch => batch.items.map(item => ({ ...item, batch_id: batch.batch_id })));
  const tagged = [];
  for (const file of await jsonFiles(resolve(tagDir))) tagged.push(...expandFile(JSON.parse(await readFile(file, 'utf8')), file));
  const byId = new Map();
  for (const item of tagged) {
    if (byId.has(String(item.offer_id))) throw new CliError('DUPLICATE_VISUAL_TAG', '同一 offer_id 出现多个视觉标签', { offer_id: String(item.offer_id) });
    byId.set(String(item.offer_id), item);
  }
  const missing = expected.filter(item => !byId.has(String(item.offer_id))).map(item => String(item.offer_id));
  const unexpected = [...byId.keys()].filter(id => !expected.some(item => String(item.offer_id) === id));
  if (missing.length || unexpected.length) throw new CliError('VISUAL_TAG_COVERAGE_MISMATCH', '视觉标签覆盖与批次清单不一致', { missing, unexpected });
  const items = expected.map(source => {
    const tag = byId.get(String(source.offer_id));
    if (tag.batch_id !== source.batch_id) throw new CliError('INVALID_VISUAL_TAGS', '商品标签批次与清单不一致');
    if (tag.image_url && tag.image_url !== source.image_url) throw new CliError('INVALID_VISUAL_TAGS', '商品标签图片与清单不一致');
    return { ...tag, offer_id: String(source.offer_id), image_url: source.image_url };
  });
  for (const row of manifest.unusable || []) items.push({ ...row, offer_id: String(row.offer_id),
    image_fingerprint: 'unavailable:' + String(row.offer_id), catalog_version: prototypes.version,
    style_ids: [], visible_objects: [], variants: [], unknowns: ['图片不可用'], compared_style_ids: [],
    multiple_styles: false, boundary_status: 'unusable', association_reason: row.reason || '图片不可用' });
  const checked = validateStylePrototypes(prototypes, items);
  const clusters = prototypes.styles.map(style => {
    const members = items.filter(item => item.style_ids.includes(style.style_id)).map(item => item.offer_id);
    return { ...style, cluster_id: style.style_id, member_offer_ids: members, member_count: members.length,
      distinguishing_cues: style.inclusion_rules, search_terms_seen: style.search_terms_seen || [],
      next_search_options: style.next_search_options || [] };
  });
  return { schema: '1688-style-prototype-catalog', schema_version: '1.0.0',
    version: prototypes.version, source_manifest: resolve(manifestPath),
    clustering_basis: 'whole_product_prototypes', batch_size: manifest.batch_size,
    styles: prototypes.styles, revisions: prototypes.revisions, review: prototypes.review,
    coverage: { ...checked, requested: expected.length, boundary: items.filter(x => x.boundary_status !== 'confirmed').length },
    clusters, items };
}
