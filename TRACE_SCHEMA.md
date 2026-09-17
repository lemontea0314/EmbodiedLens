# 后续 trace 采集建议

3.0 可直接读取当前原始 JSON/JSONL，无需先修改 DUET。本文件列出后续研究所需数据；以下字段未自动补造，也未写入用户的 WSL 工程。

## 当前读取约定

- episode：`episode_id, dataset, model_id, split, scan_id, instruction, gt_path, goal_viewpoint, success, spl, nav_error, ndtw, trajectory, steps, topology`。
- 指标有效性：`metrics_valid` 可显式声明。test 默认不使用 GT/outcome；未知数值用 null，不用 0 占位。
- step：`t, viewpoint_id, chosen_viewpoint_id, chosen_action, distance_to_goal, uncertainty, candidates`。`uncertainty` 在当前 DUET 中是归一化全局 entropy。
- candidate：`viewpoint_id, action, probability, bearing`；bearing 以弧度计，可选 `image/image_url/thumbnail`。STOP 用 null viewpoint 与 action=stop。实际节点用完整 ID，不能只用 left 等方向。
- topology：nodes `{id,x,y,z}`；edges `[source,target]` 或 `{source,target,weight}`。未提供 weight 时使用坐标欧氏距离。当前支持无向图。
- DUET 分段 trajectory：初始段为起点，此后第 i+1 段是决策 i 的实际执行路径；系统检查段终点与 chosen 对应才使用。其他导出器需明确转换这个约定。平铺路径支持总体显示，但非邻接全局动作未必能逐决策重建。
- compact：episode 可通过 `topology_id` 引用根节点 `topologies`。该格式只消除重复 topology。

## 优先补充的信号

| 数据 | 为什么需要 | 记录建议 |
|---|---|---|
| 完整动作空间 | 解释当前 1,213 次缺失 chosen 的概率与竞争关系 | `global_viewpoint_ids`、有效 mask、global/local/fused logits 与概率、chosen 的原始索引；保留各自归一化空间 |
| 真实执行路径 | 区分计划目标、实际行动和中间访问 | `decision_id`、`chosen_target`、`executed_path`、每个物理动作时间戳和 heading |
| 停止语义 | 区分主动 STOP、最大步数、回退到最佳停止节点 | `termination_reason`、`stop_decision_viewpoint`、`final_viewpoint`、post-stop path、停止得分历史 |
| 视觉与语言证据 | 支持 grounding 假设检查 | 同步 panorama/candidate 图片引用、词 token、层/头明确的 attention 或模型特征；不得将 attention 直接等同因果解释 |
| 运行出处 | 可复现比较 | checkpoint SHA、代码 commit、配置、seed、数据版本、split、instruction/route ID、导航图来源 |
| 真值状态 | 避免 test 伪指标 | `metrics_valid`、GT 来源、评价器版本、成功阈值；无 GT 的结果设 null |

建议新导出器对每个字段附带 `observed/model_output/derived/proxy/ground_truth` 来源与计算定义。3.0 当前只有已知字段的语义处理，不会自动解释任意新增字段。

## 模型干预与几何参照

真实 counterfactual 需要恢复选中 step 的模拟器与模型状态，强制一个指定候选动作后，让同一策略继续运行，并控制 checkpoint、seed、终止条件和评估器。应同时保留事实 continuation 对照。几何最短路延续不满足这些条件。

3.0 支持在 episode 或 step 的 `counterfactuals` 数组读取已有记录，匹配 `step/t` 与 `alternative_viewpoint_id/viewpoint_id`；STOP 还需 `alternative_action/action=stop`。路径可用 `trajectory/path/counterfactual_path`。`proxy:true` 不视为提供的模型 rollout。指标支持 `nav_error, spl, success` 或 `counterfactual_ne, counterfactual_spl, counterfactual_success`。

当前 UI 将匹配记录标成 Provided rollout，并明确提示系统没有验证其受控性。正式研究还应附 `intervention_id, checkpoint_sha256, seed, restored_state_id, policy_config, evaluator_version, factual_run_id` 等 provenance，并在独立实验脚本中验证，而非仅凭一个 `proxy:false` 标记宣称因果证据。
