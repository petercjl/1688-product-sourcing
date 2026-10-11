# 1688 找货应用

把关键词或参考图转成完整商品库、视觉款式分类、价格商家对比和 HTML 报告。

## 安装与使用

在当前 Agent 对话中发送：

```text
请安装 @petercjl/1688-product-sourcing 及配套 Skill。
```

```text
请用 1688-product-sourcing 帮我找【商品或需求】。
```

有参考图时附图，发送：

```text
请用 1688-product-sourcing 根据这张图片找货。
```

```text
请将 @petercjl/1688-product-sourcing 及配套 Skill 更新到最新稳定版。
```

支持 Codex、SealSeek、WorkBuddy 的安装适配；业务运行依赖当前 Agent 的图片观察能力。当前开发版采用完整实物原型：差异样本提出原型、逐图持续比较、记录变体与多款同图、修订回查、图片组审阅。图组通过审阅后再形成选款比较。

## 架构与依赖

`@petercjl/1688cli` 属于原子能力层；`@petercjl/1688-product-sourcing` 与 `@petercjl/1688-opportunity-sourcing-research` 属于独立应用层。`@petercjl/taobao-ai-ops` 注册和管理这些独立组件。

原子包依赖 Node.js 20+、官方 1688 provider、Python requests/keyring/Pillow 和用户自有 AK。安装不附带服务授权。应用通过版本化商品/供应商契约获取事实，自己管理查询计划、分析、项目文件和业务 QA。找货应用的 HTML 依赖 commerce-ui 的 compact-workbench@1.0；机会选品应用携带自己的报告模板并使用 Python 3 标准库。

平台数据均为只读；不发送询盘、不下单、不支付。输出文件仅写入新路径。凭证在用户环境中，包内不含凭证。doctor 只检查本地配置，实际授权以服务响应为准。

## 开发者接口

先完整读取包内 `skill/SKILL.md`。原子查询用 `1688cli products search/image/link`、`suppliers search`、`screen`。找货应用的确定性处理用 `1688-product-sourcing research ...`；机会选品应用用 `1688-opportunity-sourcing-research script ...`，脚本和参数见该 Skill。

应用的 `tool <arguments...>` 委托安装的原子依赖，支持 `tool skill source --json` 动态加载依赖说明。输入的关键词、图片和限制原样传入；服务错误和证据缺失保留给应用决定恢复路径。

## 开发者验证与发布

`npm test`、`npm run check`、`node scripts/packed-smoke.mjs` 验证生命周期和契约。GitHub Actions 覆盖 macOS/Windows 与 Node 22/24。真实 Agent 视觉、浏览器与服务登录另行验证，状态见 [兼容性](docs/compatibility.md)。发布经 GitHub Actions/npm Trusted Publishing。
