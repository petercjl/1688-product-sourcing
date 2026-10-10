import { dependencyHealth, toolRun } from './dependencies.mjs';
import { reportHealth } from './runtime.mjs';
import { META, AGENTS } from './core.mjs';
import { readFile, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { capabilities } from './capabilities.mjs';
import { CliError, failure } from './errors.mjs';
import { installSkill, skillSource, skillStatus, updateSkill } from './skill-manager.mjs';
import { packageUpdate } from './updater.mjs';
import { validateResearchResult } from './research-validator.mjs';
import { toCommerceViewModel } from './research-viewmodel.mjs';
import { collectResearch } from './research-collect.mjs';
import { buildResearch } from './research-build.mjs';
import { buildVisualBatches } from './visual-batches.mjs';
import { materializeVisualBatches } from './visual-materialize.mjs';
import { compileVisualTags } from './visual-tag-compile.mjs';

const usage = `1688-product-sourcing — 1688 只读找货与供应商筛选

用法:
  1688-product-sourcing tool <1688cli arguments...>
  1688-product-sourcing research validate <sourcing-result.json>
  1688-product-sourcing research collect <search-manifest.json> --output <new-inventory.json>
  1688-product-sourcing research build <inventory.json> --context <analysis.json> --output <new-sourcing-result.json>
  1688-product-sourcing research visual-batches <inventory-or-result.json> --output <new-visual-batches.json>
  1688-product-sourcing research visual-materialize <visual-batches.json> --output-dir <new-directory>
  1688-product-sourcing research visual-compile <visual-batches.json> --tag-dir <标签目录> --output <new-catalog.json>
  1688-product-sourcing research viewmodel <sourcing-result.json> --output <new-viewmodel.json>
  1688-product-sourcing capabilities [--json]
  1688-product-sourcing doctor --json
  1688-product-sourcing update [--check|--apply]
  1688-product-sourcing skill source|status|install|update [--agent codex|sealseek|workbuddy|all] [--mode link|copy] [--path DIR]

查询结果默认输出 JSON 到 stdout。--output <新文件> 可保存 JSON；已有文件拒绝覆盖。`;

const optionNames = new Set(['limit', 'sort', 'score-level', 'purchase-amount', 'tags', 'ic-tags', 'image', 'output', 'output-dir', 'tag-dir', 'context', 'max-price', 'max-moq', 'min-sold', 'location', 'relevance', 'category', 'supplier', 'agent', 'path', 'mode']);
const flags = new Set(['json', 'proofing', 'check', 'apply', 'help', 'version', 'force']);

export function parseArgs(argv) {
  const positionals = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) { positionals.push(item); continue; }
    const name = item.slice(2);
    if (flags.has(name)) { options[name] = true; continue; }
    if (!optionNames.has(name)) throw new CliError('INVALID_OPTION', `未知选项：${item}`);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new CliError('MISSING_OPTION_VALUE', `选项 ${item} 缺少值`);
    options[name] = argv[++i];
  }
  return { positionals, options };
}

function required(value, label) {
  if (!value || value.startsWith('--')) throw new CliError('MISSING_INPUT', `缺少${label}`);
  return value;
}

async function runCommand(positionals, options) {
  const [group, action, input] = positionals;
  if (group === 'version' || options.version) return { version: META.version };
  if (!group || group === 'help' || options.help) return { help: usage };
  if (group === 'capabilities') return { ok: true, package: META.name, version: META.version, agents: AGENTS, operating_systems: ['darwin','win32'], capabilities, lifecycle: ['skill source','skill status','skill install','skill update','update check','update install'], dependencies: ['@petercjl/1688cli >=0.4 <1: 1688-products@1 / 1688-suppliers@1','HTML: compact-commerce-ui / compact-workbench@1.0'], layer:'application' };
  if (group === 'doctor') { const dependency=await dependencyHealth(); const report=await reportHealth(); return {ok:dependency.ok&&report.available,package:META.name,version:META.version,layer:'application',dependency,report,skill:await skillStatus()}; }
  if (group === 'update') {
    if(action && !['check','install'].includes(action)) throw new CliError('UNKNOWN_COMMAND','update 支持 check、install');
    return packageUpdate(Boolean(options.apply || action==='install'));
  }
  if (group === 'skill') {
    if (action === 'source') return { ok: true, source: skillSource() };
    if (action === 'status') return { ok: true, ...(await skillStatus({agent:options.agent,path:options.path})) };
    if (!['install', 'update'].includes(action)) throw new CliError('UNKNOWN_COMMAND', 'skill 支持 source、status、install、update');
    const agents = options.agent === 'all' ? AGENTS : [options.agent || 'codex'];
    if(options.path && agents.length>1) throw new CliError('INVALID_INPUT','--path 须指定单个 Agent');
    const opts={path:options.path,mode:options.mode,force:options.force};
    const results = [];
    for (const agent of agents) results.push(action === 'install' ? await installSkill(agent,opts) : await updateSkill(agent,opts));
    return { ok: true, results };
  }
  if (group === 'research' && ['validate', 'viewmodel', 'collect', 'build', 'visual-batches', 'visual-materialize', 'visual-compile'].includes(action)) {
    const path = resolve(required(input, '找货结果 JSON 文件'));
    if (action === 'collect') return collectResearch(path);
    if (action === 'build') return buildResearch(path, resolve(required(options.context, '判断 JSON 文件')));
    if (action === 'visual-batches') return buildVisualBatches(path);
    if (action === 'visual-materialize') return materializeVisualBatches(path, resolve(required(options['output-dir'], '新输出目录')));
    if (action === 'visual-compile') return compileVisualTags(path, resolve(required(options['tag-dir'], '视觉标签目录')));
    let data;
    try { data = JSON.parse(await readFile(path, 'utf8')); }
    catch { throw new CliError('INPUT_READ_FAILED', '无法读取找货结果 JSON 文件', { path }); }
    return action === 'validate' ? { ...validateResearchResult(data), path } : toCommerceViewModel(data);
  }
  throw new CliError('UNKNOWN_COMMAND', '未知命令；运行 1688-product-sourcing help 查看用法');
}

async function saveNew(path, content) {
  let handle;
  try {
    handle = await open(resolve(path), 'wx', 0o600);
    await handle.writeFile(content);
  } catch (error) {
    if (error.code === 'EEXIST') throw new CliError('OUTPUT_EXISTS', '输出文件已存在，拒绝覆盖', { path: resolve(path) });
    throw error;
  } finally { await handle?.close(); }
}

export async function main(argv, io = console) {
  try {
    if (argv[0] === 'tool') return toolRun(argv.slice(1),io);
    const { positionals, options } = parseArgs(argv);
    const result = await runCommand(positionals, options);
    const output = result.help || JSON.stringify(result, null, 2);
    if (options.output) await saveNew(options.output, `${output}\n`);
    const researchSaved = options.output && positionals[0] === 'research' && ['viewmodel', 'collect', 'build', 'visual-batches', 'visual-compile'].includes(positionals[1]);
    const summary = researchSaved && positionals[1] === 'collect'
      ? { ok: true, path: resolve(options.output), searches: result.search_log.length, products: result.products.length, coverage: result.coverage }
      : researchSaved && positionals[1] === 'build' ? { ok: true, path: resolve(options.output), ...validateResearchResult(result) }
      : researchSaved && positionals[1] === 'visual-batches' ? { ok: true, path: resolve(options.output), batch_size: result.batch_size, batches: result.batches.length, coverage: result.coverage }
      : researchSaved && positionals[1] === 'visual-compile' ? { ok: true, path: resolve(options.output), clusters: result.clusters.length, coverage: result.coverage }
      : researchSaved ? { ok: true, path: resolve(options.output), contract: result.contract, views: result.views.length } : null;
    io.log(researchSaved ? JSON.stringify(summary, null, 2) : output);
    return result.ok === false ? 1 : 0;
  } catch (error) {
    io.error(JSON.stringify(failure(error)));
    if (io === console) process.exitCode = 1;
    return 1;
  }
}
