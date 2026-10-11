import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileVisualTags } from '../src/visual-tag-compile.mjs';
import { validateResearchResult } from '../src/research-validator.mjs';
import { toCommerceViewModel } from '../src/research-viewmodel.mjs';
import { buildResearch } from '../src/research-build.mjs';
import { spawnSync } from 'node:child_process';

function fixture() {
  const styles = ['fold-chair', 'round-stool'].map((id, i) => ({ style_id: id,
    name: i ? '圆面四足凳' : '折叠靠背椅', definition: i ? '圆形座面、四足支撑的完整凳体' : '靠背与座架通过折叠支撑连接的椅子',
    selection_significance: '独立结构方案，需要分别验证使用方式与供应商', version: '1',
    inclusion_rules: [i ? '圆面四足' : '折叠连接与靠背'], exclusion_rules: [i ? '带靠背椅' : '固定支撑座架'],
    representative_offer_ids: ['a'], evidence: ['原图可见完整实物'], unknowns: ['真实材质'], confidence: 'high' }));
  const catalog = { version: 'v1', styles, revisions: [{ action: 'create', reason: '差异样本中发现两种完整方案', affected_offer_ids: ['b'], rechecked_offer_ids: ['b'] }],
    review: { status: 'approved', reviewer: 'fixture-reviewer', notes: '测试夹具审阅记录，非真实视觉验收', catalog_version: 'v1', reviewed_offer_ids: ['a', 'b', 'c'] } };
  const items = ['a', 'b', 'c'].map(id => ({ offer_id: id, image_url: `https://example.com/${id}.jpg`, image_fingerprint: `fixture:${id}`,
    catalog_version: 'v1', style_ids: id === 'a' ? ['fold-chair', 'round-stool'] : id === 'b' ? ['fold-chair'] : [],
    visible_objects: id === 'a' ? ['折叠椅', '圆凳'] : id === 'b' ? ['折叠椅'] : [],
    association_reason: id === 'c' ? '主体被遮挡，保留待定' : '与原型代表图的完整实物关系相符',
    multiple_styles: id === 'a', variants: id === 'b' ? ['颜色不同'] : [], unknowns: ['材质'],
    compared_style_ids: ['fold-chair', 'round-stool'], boundary_status: id === 'c' ? 'pending' : 'confirmed' }));
  return { catalog, items };
}
async function prepare() {
  const root = await mkdtemp(join(tmpdir(), 'style-prototypes-')); const tags = join(root, 'tags'); await mkdir(tags);
  const { catalog, items } = fixture();
  const manifest = join(root, 'manifest.json'), proto = join(root, 'prototypes.json');
  await writeFile(manifest, JSON.stringify({ batch_size: 10, batches: [{ batch_id: 'visual-0001', items: items.map(({ offer_id, image_url }) => ({ offer_id, image_url })) }] }));
  await writeFile(proto, JSON.stringify(catalog));
  await writeFile(join(tags, 'batch.json'), JSON.stringify({ batch_id: 'visual-0001', items }));
  return { root, tags, manifest, proto, catalog, items };
}
function result(compiled) {
  const products = compiled.items.map(item => ({ offer_id: item.offer_id, title: '家具', url: `https://example.com/offer/${item.offer_id}`, image_url: item.image_url,
    price: 10, moq: 1, sku_title: '款式规格待核验', supplier_name: '测试商家', source_search_ids: ['q1'], observations: [{ search_id: 'q1' }],
    assessment: item.association_reason, relevance: 'possible', category_ids: item.style_ids, style_assignment: item }));
  return { schema: '1688-sourcing-result', schema_version: '2.2.0', mode: 'explore', status: 'complete',
    request: { original_text: '家具', reference_images: [], hard_constraints: [], preferences: [] },
    search_log: [{ search_id: 'q1', method: 'text', input: '家具', reason: '宽词召回', status: 'success', result_count: 3, offer_ids: ['a', 'b', 'c'], raw_path: 'q1.json' }], products,
    coverage: { returned_rows: 3, unique_offers: 3, backend_exhaustive: false, limitations: ['测试夹具'] },
    mode_data: { prototype_catalog: { version: compiled.version, styles: compiled.styles, revisions: compiled.revisions, review: compiled.review },
      clusters: compiled.clusters, priority_cluster_ids: [], clustering_basis: compiled.clustering_basis }, human_handoff: { questions: [], unverified: ['材质'] }, stop_reason: '测试预算结束' };
}

test('generic prototypes preserve multi-style images, variants, boundaries and unique inventory through build and views', async () => {
  const p = await prepare(); const compiled = await compileVisualTags(p.manifest, p.tags, p.proto);
  assert.deepEqual(compiled.clusters.map(x => x.cluster_id), ['fold-chair', 'round-stool']);
  assert.equal(compiled.coverage.memberships, 3); assert.equal(compiled.coverage.unique_offers, 3);
  assert.deepEqual(compiled.items[1].variants, ['颜色不同']);
  const data = result(compiled); assert.equal(validateResearchResult(data).products, 3);
  const inventory = join(p.root, 'inventory.json'), context = join(p.root, 'analysis.json');
  await writeFile(inventory, JSON.stringify({ schema: '1688-search-inventory', schema_version: '1.0.0', products: data.products, search_log: data.search_log, coverage: data.coverage }));
  await writeFile(context, JSON.stringify({ ...data, assessments: {} }));
  assert.equal((await buildResearch(inventory, context)).schema_version, '2.2.0');
  const model = toCommerceViewModel(data);
  if (process.env.SOURCING_SMOKE_DIR) { await writeFile(join(process.env.SOURCING_SMOKE_DIR, 'result.json'), JSON.stringify(data), { flag: 'wx' }); await writeFile(join(process.env.SOURCING_SMOKE_DIR, 'viewmodel.json'), JSON.stringify(model), { flag: 'wx' }); }
  const views = model.views;
  const cards = id => views.find(v => v.id === id).blocks.find(b => b.type === 'products').items;
  assert.equal(cards('category_1').length, 2); assert.equal(cards('category_2').length, 1);
  assert.equal(cards('visual_review').length, 1); assert.equal(cards('all_candidates').length, 3);
  assert.ok(views.find(v => v.id === 'category_1').blocks[0].items.some(x => x.includes('选款意义')));
  const cli = spawnSync(process.execPath, ['scripts/1688-product-sourcing.mjs', 'research', 'visual-compile', p.manifest, '--tag-dir', p.tags, '--prototypes', p.proto], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr); assert.equal(JSON.parse(cli.stdout).clusters.length, 2);
});

test('refuses missing prototypes, wrong batches, incomplete or duplicate observations', async () => {
  const p = await prepare();
  await assert.rejects(compileVisualTags(p.manifest, p.tags), e => e.code === 'PROTOTYPES_REQUIRED');
  const file = join(p.tags, 'batch.json');
  for (const data of [{ batch_id: 'wrong', items: p.items }, { batch_id: 'visual-0001', items: p.items.slice(1) }, { batch_id: 'visual-0001', items: [...p.items, p.items[0]] }]) {
    await writeFile(file, JSON.stringify(data)); await assert.rejects(compileVisualTags(p.manifest, p.tags, p.proto));
  }
});

test('completion requires real recorded review of the current catalog and affected earlier samples', async () => {
  const p = await prepare(); const original = result(await compileVisualTags(p.manifest, p.tags, p.proto));
  for (const mutate of [d => d.mode_data.prototype_catalog.review.status = 'pending', d => d.mode_data.prototype_catalog.review.catalog_version = 'old', d => d.mode_data.prototype_catalog.review.reviewed_offer_ids.pop(), d => d.mode_data.prototype_catalog.revisions[0].rechecked_offer_ids = []]) {
    const d = structuredClone(original); mutate(d); assert.throws(() => validateResearchResult(d), e => e.code === 'OUTPUT_CONTRACT_FAILED');
  }
  const draft = structuredClone(original); draft.status = 'partial'; draft.mode_data.prototype_catalog.review = { status: 'pending' };
  assert.equal(validateResearchResult(draft).status, 'partial'); assert.ok(toCommerceViewModel(draft).views.length);
});

test('rejects unsupported memberships, stale assignments, invented representatives and inconsistent groups', async () => {
  const p = await prepare(); const original = result(await compileVisualTags(p.manifest, p.tags, p.proto));
  for (const mutate of [d => d.products[0].style_assignment.multiple_styles = false, d => d.products[0].style_assignment.catalog_version = 'old', d => d.mode_data.prototype_catalog.styles[1].representative_offer_ids = ['b'], d => d.products[2].category_ids = ['fold-chair'], d => d.mode_data.clusters[0].member_offer_ids = ['a']]) {
    const d = structuredClone(original); mutate(d); assert.throws(() => validateResearchResult(d), e => e.code === 'OUTPUT_CONTRACT_FAILED');
  }
});
