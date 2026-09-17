# EmbodiedLens 3.0 验证记录

日期：2026-09-15。环境：Windows、Node.js、Python 本地 HTTP 服务、Codex 内置 Chromium 浏览器。所有检查针对本包代码和用户提供的真实数据，未运行新的 DUET 推理。

## 已完成的数据检查

- 逐条反向重建紧凑 JSON 的全部 2,349 episodes，与原始 JSON 深度比较通过，包括原始 step/candidate 与 topology。
- 原始与紧凑数据经同一引擎计算的审计结果、analysis fingerprint 相同。
- all_splits JSONL 7,693 episodes 完整解析并分别审计；同一 val_unseen 不重复作为独立数据集统计。
- 原始文件 SHA-256 与紧凑文件 SHA-256 记录在 `data/analysis-summary.json`；可用 `tools/prepare-data.cjs` 重新生成。
- 所有可比较的有效 step 中，XYZ 图距离与 trace distance 无超过 0.05 m 的差异。

## 自动回归测试

`node --test tests/core.test.cjs`：13 项通过、0 失败。

覆盖：原始概率与同名方向动作、缺失 chosen 不回退 argmax、等长最短路与参考路线分歧、完整路径回访、固定跳数邻域、最早几何冲突、最大负距离进度回退、test 指标抑制、缺失指标、共享 topology / JSONL / 复合 key 去重、单组与无失败选择器、默认特征排除结果字段、完整真实数据回归及输入顺序不影响聚类。

实际数据回归同时检查 5,943 次概率不足、1,213 次 chosen 缺失、550 个回访 episode、61 个停止后返回，以及 3411_1 的 t8 chosen ID/概率质量和默认 C1 Representative 1310_1。

`tools/verify-source.cjs` 的原始/紧凑逐条比较通过。所有随包 `.js` / `.cjs` 均通过 `node --check`。

## 浏览器检查

- 完整紧凑 val_unseen 自动加载，显示 2,349 episodes，与独立分析结果一致。
- 通过文件选择器直接导入原始 330 MB JSONL，显示 7,693 episodes，4 个 split 可选。
- 选择 test：显示 4,173 episodes，SR/SPL/NE/nDTW 为不可用，Severe failure 禁用；轨迹和覆盖仍可浏览。
- 选择 C1：Representative 1310_1、Severe 2365_0、Boundary 4028_1，点击更新共享 episode。
- 仅筛选 Success 时 Severe 禁用；空搜索结果清空候选视图，清除筛选后恢复。
- 检索 3411_1 并点击 C 的 t8：D 显示 58.7% raw mass，G 对应 c56e92a，raw p 缺失；点击 G 后 E 对应相同 ID，保持 Geometry only。
- 3766_2：默认最早几何冲突；B 报告 15 决策点、30 次完整节点访问、15 次重复访问；固定比较与备注保存可用。
- 主页面与地图/候选区域经过截图检查。图片缺失和几何参照提示均可见，无伪造视觉内容。

另通过记录恢复文件检查了：3411_1 / t8 / 全局候选 c56e92a、固定比较案例、2 hops 上下文和指定备注均正确恢复。导出窗口的版本、源文件 SHA-256 和筛选参数已在可见 JSON 中检查；未将此检查声称为浏览器文件下载的完整往返测试。

## 边界

以上是软件正确性与功能检查，不是可用性实验、专家研究、性能基准或因果有效性验证。两个初始化的 ARI 不是全面稳定性评估。真实数据没有提供图片或模型 rollout，因此相应展示分支未以真实模型干预记录验证。

内置浏览器对自动 Blob 下载的事件未返回文件，本版提供可见的记录下载链接与完整 JSON 文本作为保存方式；不要把“触发下载”当作文件已持久保存的证明。正式实验请使用常规 Chrome/Edge 检查导出文件，并将源 trace 与分析记录一并存档。
