# 当前输出契约 2.2.0

新研究使用 `1688-sourcing-result` / `2.2.0`。1.0、2.0、2.1 历史结果仍可读取，其字段见 [历史契约](legacy-output-contract.md)，新任务不加载历史方法。

## 共用完整商品库

查询清单 searches[] 保存 search_id、method、input、reason、raw_path；用户图搜另存 reference_id。`research collect` 归并全部成功查询。Agent 只写 analysis.json：schema_version、mode、status、request、mode_data、human_handoff、stop_reason、按商品 ID 键控的 assessments。`research build` 合并完整商品库并验证，禁止人工复制时遗漏未入选商品。

request 保存 original_text、reference_images（reference_id/source）、hard_constraints、preferences。每个 assessment 保存 relevance（relevant/possible/irrelevant/unreviewed）、assessment、category_ids。价格、SKU、来源及 observations 沿用商品库事实。完整状态不含 unreviewed；coverage 保留 returned_rows、unique_offers、backend_exhaustive:false 与 limitations。stop_reason 记录边际新增、预算、服务边界或用户停止，代表款数不作为完成依据。

## 探索模式：款式目录

原型文件包含 version（非空版本）、styles[]、revisions[]、review。

每个 style 必填：style_id、name、definition（完整实物定义）、selection_significance、version、inclusion_rules[]、exclusion_rules[]、representative_offer_ids[]、evidence[]、unknowns[]、confidence（high/medium/low）。代表图须来自真实归属成员；纳入、边界和证据均须有内容。

每批归属文件结构为 `{ "batch_id": "visual-0001", "items": [...] }`。每条必填：offer_id、image_url、image_fingerprint、catalog_version、style_ids[]、visible_objects[]、association_reason、multiple_styles、variants[]、unknowns[]、compared_style_ids[]、boundary_status（confirmed/pending/unusable）。图片指纹优先采用实际图像文件的内容 SHA-256；只能取得 URL 时明确记录 `url:<URL>` 并注明内容未验证，跨轮不能据此宣称图片内容未变化。归属指向当前目录版本。多款归属需 multiple_styles:true 及逐款可见实物；待定/不可用 style_ids 为空。

revisions 每项保存 action（create/merge/split/boundary）、reason、affected_offer_ids[]、rechecked_offer_ids[]。完整状态下所有受影响商品已回查；初始原型没有早期样本可用空数组。

review 保存 status（pending/approved/changes_requested）。approved 还须 reviewer、notes、catalog_version、reviewed_offer_ids（包含所有商品及边界组）。写真实审阅者及结论；未完成审阅时 status:partial，可先生成审阅 HTML。程序只能校验记录一致性，不能证明视觉或人工审阅已经发生。

运行 `1688-product-sourcing research visual-compile <批次.json> --tag-dir <归属目录> --prototypes <原型.json> --output <新-catalog.json>`，得到 items、clusters、styles、revisions、review 和 coverage。程序不自动决定分类。保留每轮文件，最终清单覆盖完整商品库；无可用主图项自动进入 unusable 边界组。

最终 mode_data 保存 clustering_basis:whole_product_prototypes、prototype_catalog（version/styles/revisions/review）、clusters（编译器返回值）、priority_cluster_ids。每个 assessment 的 style_assignment 使用 catalog.items 中对应商品记录，category_ids 与 style_assignment.style_ids 相同。每个 cluster 的 cluster_id 对应 style_id，member_offer_ids 是全部成员，representative_offer_ids 对应原型代表图。多组可重叠，总商品数仍按 offer_id 去重。

## 精确模式

按逐参考图匹配交付，不强制探索式分类目录。mode_data.references[] 保存 reference_id、source、relation_to_other_images；matches[] 保存 reference_id、offer_id、match_level（likely_same/similar_alternative/mismatch/uncertain）、visible_evidence[]、differences[]、unknowns[]。参考 ID 与输入一致；complete 每张图都有成功图搜，partial 每张图记录真实尝试。需要对相似替代归纳款式时再加载原型方法，不能把相似度当同款证明。

## 校验与交付

human_handoff 包含 questions[]、unverified[]，覆盖目标 SKU、采购量、阶梯价、运费税票、样品交期及质量责任。运行 research validate 后生成 viewmodel 并交给 compact-commerce-ui；HTML 商品图和链接须 HTTPS。输出完整 JSON、查询清单、原型目录与归属、审阅图组及覆盖摘要。缺图、依赖失败或审阅未完成时保留 partial 和真实限制。
