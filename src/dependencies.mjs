import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execute,nodeCli} from './runtime.mjs';
import {CliError} from './errors.mjs';
const require=createRequire(import.meta.url);
export async function atomicEntry(){
 if(process.env.ALI1688_CLI_ENTRY){await fs.access(process.env.ALI1688_CLI_ENTRY);return process.env.ALI1688_CLI_ENTRY;}
 try{return path.join(path.dirname(require.resolve('@petercjl/1688cli/package.json')),'scripts/1688cli.mjs');}catch{}
 const entry=await nodeCli('1688cli','@petercjl/1688cli','scripts/1688cli.mjs');
 if(!entry)throw new CliError('DEPENDENCY_UNAVAILABLE','Install @petercjl/1688cli >=0.4 <1');return entry;
}
export async function dependencyHealth(){
 try{const entry=await atomicEntry();const c=JSON.parse((await execute(process.execPath,[entry,'capabilities','--json'],{encoding:'utf8',timeout:15000})).stdout);
 const compatible=c.contracts?.products==='1688-products@1'&&c.contracts?.suppliers==='1688-suppliers@1';
 let health;try{health=JSON.parse((await execute(process.execPath,[entry,'doctor','--json'],{encoding:'utf8',timeout:30000})).stdout);}catch(e){try{health=JSON.parse(e.stdout);}catch{health={ok:false,code:'DOCTOR_FAILED'};}}
 return {ok:compatible&&health.ok,compatible,version:c.version,entry,health};
 }catch(e){return {ok:false,compatible:false,code:e.code||'DEPENDENCY_UNAVAILABLE'};}
}
export async function toolRun(args,io=console){
 const allowed=['products','suppliers','screen','version','capabilities','doctor','skill'];
 if(!allowed.includes(args[0])||(args[0]==='skill'&&args[1]!=='source'))throw new CliError('OPERATION_NOT_ALLOWED','Only atomic read operations and canonical Skill discovery are delegated');
 const entry=await atomicEntry();
 const c=JSON.parse((await execute(process.execPath,[entry,'capabilities','--json'],{encoding:'utf8',timeout:15000})).stdout);
 if(c.contracts?.products!=='1688-products@1'||c.contracts?.suppliers!=='1688-suppliers@1')throw new CliError('CONTRACT_UNSUPPORTED','Require 1688-products@1 and 1688-suppliers@1');
 try{const r=await execute(process.execPath,[entry,...args],{encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});io.log(r.stdout.trim());return 0;}
 catch(e){if(e.stdout?.trim())io.log(e.stdout.trim());if(e.stderr?.trim())io.error(e.stderr.trim());return 1;}
}
