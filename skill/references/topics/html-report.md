# 1688 找货 HTML 报告映射

此页是 `1688-product-sourcing` 的业务 ViewModel 模板契约；HTML/CSS/交互模板由安装中的 `compact-commerce-ui` Skill 与 `commerce-ui` 模板包维护，不在本包复制渲染代码。

## 依赖与返回点

- 逻辑依赖名：`compact-commerce-ui`。从当前宿主公告的 Skill 目录或配置的 Skill roots 中按完整名称解析，读取它当下完整的 `SKILL.md`；不得凭相似名称替代。完成它的渲染、校验与预览主线后，返回 `1688-product-sourcing` 主线第 10 步交付节点。
- CLI：`commerce-ui`，运行时检查 `version --json`、`doctor`、`templates list --json` 和 `schema --template compact-workbench`。目标契约为 `compact-workbench@1.0`；若版本或模板不可用，按被调用 Skill 的错误契约返回，不使用私有 HTML 备用模板。
- 输入：已经通过 `1688-product-sourcing research validate` 的 `sourcing-result.json`。先运行 `1688-product-sourcing research viewmodel <输入> --output <新-viewmodel.json>`，得到可复核的页面数据。
- 输出：新的 `report.html`、原始找货 JSON、ViewModel JSON，以及 `commerce-ui validate` 结果。HTML 文件不含凭证、私有本机路径或本地商品图片。

## 页面结构

2.2.0 探索报告按款式原型建页，展示实物定义、选款意义、纳入与排除边界、代表商品 ID、版本和全部归属商品。多款同图可在多个款式页出现；“全部唯一链接”仍按商品 ID 去重。边界/待定/不可用图片单列。总览显示真实审阅状态，partial 可以生成审阅稿；批准后才形成完成报告。

精确报告按用户参考图建页，展示逐商品匹配等级、可见依据、差异及未知项。各页面可重复引用商品；唯一链接页保持完整。

商品卡保留原图与详情 HTTPS 链接、SKU/价格/起订量/商家和来源。图组用于实物判断；图组批准后再做商业价值比较。旧版本按原字段兼容读取，不把历史单一类别约束用于新任务。

## 验收

1. `commerce-ui validate report.html` 成功，且其远程商品图片数量与商品卡数量相符；网络图片需要在线查看，失效时页面应显示缺图占位。
2. 检查桌面与窄屏页面：分类切换、商品详情按钮、图片可见性、文字溢出和打印展开均正常。不能仅以静态校验通过宣称视觉验收。
3. 对照 `sourcing-result.json`，新版唯一链接页不遗漏且不重复；`2.2.0` 的多款商品可以跨组，归属证据、原型边界和审阅状态可追溯。若部分商品缺少 HTTPS 图片或详情链接，转换命令返回 `OUTPUT_CONTRACT_FAILED`，保留 JSON 并说明 HTML 受阻。
