# EmbodiedLens 3.0 使用说明

## 1. 开始分析

在项目目录启动 `run_windows.bat` 或 `bash run_linux.sh`，打开 <http://127.0.0.1:8003/>。等待页首显示 `2,349 episodes · loaded locally`。真实 val_unseen 数据已随包提供，系统不需要运行 DUET。

“导入 JSON / JSONL”兼容原始单文件、episodes 数组包装、单 episode 和每行一条 episode 的 JSONL；共享 topology 的紧凑格式也可读取。可选多个文件。按 Dataset + Agent + Split + Scan + Episode ID 去重，重复 key 保留首次记录。没有 steps 的记录不纳入分析。

每次导入会替换数据、清空未导出的备注与比较状态。点击“导出分析记录”打开窗口，再点击“下载 JSON”，或复制窗口内完整文本保存；以后导入同一数据再“恢复记录”。记录包含参数和交互状态，不包含原始全部 trace。

## 2. 先看证据审计

顶部展示当前参考集合的 episode 数、有效 SR、scan 数、局部概率不足比例、chosen 缺失次数和含实际回访的 episode 数。展开审计可查看各 split 和信号来源。

本次 val_unseen 有 2,349 episodes、16,856 decisions、11 scans；SR=71.52%，SPL=0.6041，NE=3.3124 m，nDTW=0.6702。候选图片和模型重运行 rollout 均为 0。

局部候选概率之和低于 0.99 的 step 标为覆盖不足。DUET 在全局动作空间产生决策，而日志只导出一部分局部候选，所以这里保留 raw p，不把它们强制加到 1。未观测概率质量不能被分配给某一个未知动作。

`test` 默认不使用结果指标与 GT 几何诊断，因为当前日志不提供可靠测试真值。只有数据提供者显式设置 `metrics_valid:true` 才会覆盖此限制。非 test 数据默认要求 GT 路径存在，或显式声明指标有效。`—` / N/A 表示不可用，不等于 0。

## 3. A：从总体选案例

A 的每一行是自动形成的 cohort，不是预先指定的失败类别。同一特征列在所有行采用共同刻度；浅灰刻痕是抽稀显示的真实 episode 值，中间条是第 25–75 百分位，深线是中位数。行内 SR 是聚类后的描述。

默认向量为平均 entropy、最大 entropy、完整路径回访率、log(1+决策数)、chosen 未在局部候选的比例、平均 raw local probability mass。缺失值用参考集合中位数填补，再按该集合均值/样本标准差标准化；常数列标准差置 1。后两项涉及日志覆盖，因此应称“行为与日志覆盖 cohort”，不能称已验证的失败机制。

SPL、NE、nDTW、success、failure_type 默认不参与聚类。Feature set 的 outcome 选项用于敏感性比较，额外加入 SPL、log(1+NE)、nDTW；A 仍显示六个主特征。在该模式下，cohort 的结果差异不再是独立发现。

固定排序后使用确定性的 farthest-first 初始化和 k-means，最多 80 次迭代；两个起点为 0 和 floor(N/3)。ARI 比较这两次初始化，不能代替 bootstrap 或跨模型验证。K 可选 3–8；没有宣称 5 是最优 K。

点击一行默认打开 **Representative**。三个选择器均只在当前可见且属于该 cohort 的 episode 中选取：

| 选择器 | 定义 | 适合回答 |
|---|---|---|
| Representative | 标准化空间中距离该 cohort 固定中心最近的真实 episode | 这类行为的典型案例是什么？ |
| Severe failure | 有效失败样本中严重度 S 最大 | 这类行为中哪条失败结果最严重？ |
| Boundary case | own-vs-other 中心距离 margin 最小 | 哪条案例最接近群体的划分边界？ |

Representative 是“中心最近真实样本”，未实现总成对距离最小的精确 medoid，不应在论文中误称 medoid。

严重度 `S = [log(1+NE)/log(1+NEmax) + (1−SPL) + (1−nDTW)] / 3`。NEmax 是当前参考集合有效 NE 的最大值，下限 1；比例截断至 0–1。指标需完整，success 必须为 false。等权是显式设计选择，需要用户实验或权重敏感性验证，不能等同“最有分析价值”。

边界 `margin = min_{j≠k} ||z−μj||₂ − ||z−μk||₂`；取最小值。不是离群度，不是异常检测。无有效失败或无其他 cohort 时对应按钮禁用。多个选择器可能给出同一 episode。并列按完整 episode key 排序，结果可复现。

Dataset / Agent / Split / K / Feature set 改变会重新拟合；Outcome / Diagnostic event / 搜索只筛选案例，保持 cohort 中心、尺度、严重度 NEmax 固定。A 显示“可见数 / 参考数”；指标和分布仍描述参考集合。Episode Browser 的所有匹配案例均可翻页访问，也能手动选择。

## 4. 进入 episode 后的默认 step

系统先选最早可验证的 **graph decision conflict**。这里明确以到目标的图距离作参照：

`regret(t) = length(actual transition t) + d(chosen target, goal) − d(current, goal)`。

移动动作 regret 大于 0.0001 m 视为几何冲突；同长度的多条最短路线均允许，不把任意一个唯一邻居当真值。STOP 在当前点距目标至少 3 m 时标为停止冲突。移动 oracle 对齐精确目标；STOP 采用 R2R 成功容差，两者语义在此明确区分。

没有已验证冲突时，取 `Δd(t)=distance(t−1)−distance(t)` 最负的一步，即观测到离目标最明显变远的决策点。该变化属于抵达 t 之前的移动；图 regret 属于 t 做出的动作。两行有意区分时间含义。没有负变化或数据不足则停在 t0。

参考 GT 下一节点与 chosen 不同记为 **R**，与图冲突分开。参考路径不一定是唯一合理路线；几何最短路也不保证遵循指令。没有真值时不伪造图冲突。

## 5. B / C / D / E 的联动

| 视图 | 如何读 | 点击后的结果 |
|---|---|---|
| B Route & Traversal | 蓝线是完整实际经过路径；绿虚线是参考路径；青线是当前决策对应的实际运动段；t 是决策点 | 点击决策点更新 C、D、E 和摘要 |
| C Evidence Ribbon | 同列对齐 local rank、chosen 身份、图冲突/R、概率质量、全局 entropy、距离变化和实际回访 | 点击任一 step 更新 B、D、E |
| D Candidate Inspector | 按 raw p 排序；viewpoint ID 标识动作，方向仅是说明；显示可用几何代价 | 点击候选更新 E |
| E Alternative Inspector | 橙虚线仅是理想几何延续；若导入匹配的真实 rollout，单独标明 Provided rollout | 检查替代动作，写下需要验证的假设 |

C 蓝边框表示真实 chosen；G 表示 chosen 全局目标不在导出的局部表，其概率显示缺失，绝不回退到局部 argmax；绿色三角是局部图最优候选，红色菱形是几何冲突，R 是参考分歧，灰斜纹是未观测概率质量。C 横向滚动可查看完整长序列。

B 的路径来自分段 trajectory，而不仅是决策节点；一次全局选择可能经过多个中间节点。完整路径的回访是某 viewpoint 再次出现，连续重复端点合并。回访不必然是 loop，也可能是合理返回。Context 控制路径附近 0/1/2 跳，XY 保持等比例，距离使用 XYZ 图权重；跨楼层在 XY 上可能重叠，本版本尚未提供楼层分离。

D 的短 ID 悬停可见完整 ID。缺少 bearing 不绘制伪方向，缺少图片不填入示意照片。旧 grounding_gap、evidence、utility/risk 等代理字段保留在数据中，但不作为模型注意力或视觉 grounding 的证据。

E 使用全环境静态图，包含智能体当时可能尚不知道的信息，因此只作离线几何参照。它不生成模型成功率或预测 rollout。导入 rollout 按 episode + step + viewpoint 精确匹配，系统仍不替数据提供者证明其受控性。

“固定当前案例作比较”保留另一条案例的结果和行为统计。不同 scan 不叠加坐标；当前是描述性案例比较，未实现跨策略的语义时间对齐。

## 6. 三个真实案例练习

1. 清除筛选，搜索 **3411_1**，点击 C 中 **t8**。D 显示 raw local mass 约 **58.7%**；全局 chosen `c56e92a10dda45a0a27fe34224c8294e` 不在局部表，概率为 `—`。B 显示该全局决策实际经过的路线。结论是日志覆盖不足，不能由局部排名判断模型选择了哪个最高概率动作。
2. 搜索 **3766_2**。完整路径有 **15 次重复访问**，回访率 **0.5**；默认进入 **t3** 的最早几何冲突。在 B/C 中沿时间检查全局选择和中间路径。数据支持“存在反复经过区域”的观察，但判断记忆失效、grounding 错误或探索是否合理需要进一步证据。
3. 搜索 **1744_2**。检查最后决策点与完整轨迹终点：此案例包含停止后返回。停止点距离与最终 NE 不是同一个量，不能由最后一步距离直接推断最终结果。

默认 K=5、val_unseen 的 C1 Representative 为 **1310_1**，Severe 为 **2365_0**，Boundary 为 **4028_1**。如果改变参考集合或聚类配置，这些 ID 可以改变。

## 7. 保存与论文图

每个主图的 SVG 按钮导出矢量图。长 ribbon 可很宽，论文排版时选取有分析目的的连续时间窗，并说明范围，不应删去与论点相反的 step。

备注按 episode key + step 保存到当前会话；点击“保存”之后还需“导出分析记录”持久保存。导出包括版本、源文件 SHA-256、轻量 analysis fingerprint、筛选、标准化参数、cohort 成员/中心、案例/step/候选、比较案例、备注和操作历史。

恢复时先加载相同数据，导入记录文件，或打开分析记录窗口、将之前保存的 JSON 粘贴进文本框并点击“从下方文本恢复”。系统校验版本与轻量分析 fingerprint，再恢复状态。fingerprint 不是密码学证明；严格复现应另核对记录中源文件的 SHA-256。原始 JSON 与拓扑去重后的紧凑 JSON 的文件 SHA 不同，这是预期行为。

保存一条论文发现时建议包含：参考集合与参数 → 案例选择理由 → step 与动作 ID → 可观察事实 → 替代解释 → 待验证假设 → 对应 SVG 与会话记录。不要把假设写成已经证实的因果机制。
