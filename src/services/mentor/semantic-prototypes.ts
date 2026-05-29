/**
 * Semantic Prototypes
 *
 * 定义 soft type 语义原型，不依赖关键词命中。
 * examples 覆盖语义表达，用于生成 prototype embedding 进行相似度比较。
 * 初版以本地配置实现，不要求产品化 UI。
 */

export type SemanticType = 'question' | 'decision' | 'principle' | 'action' | 'requirement' | 'risk' | 'review';

export interface SemanticPrototype {
  type: SemanticType;
  label: string;
  /** 语义覆盖例句，不要求用户原文逐字命中，只用于生成 prototype embedding */
  examples: string[];
  /** 预计算的 embedding（可由运行时生成） */
  embedding?: number[];
  /** 相似度阈值：候选文本与 prototype 的 cosine similarity 需超过此值 */
  threshold: number;
}

/**
 * 语义原型库
 *
 * 每个 prototype 的 examples 覆盖多种语义表达，而非关键词字典。
 * 例如 principle 覆盖「约束/边界/规则/禁止/必须先确认」等语义。
 */
export const SEMANTIC_PROTOTYPES: SemanticPrototype[] = [
  {
    type: 'principle',
    label: '原则/约束',
    examples: [
      '这类内容应先得到用户确认再进入长期记忆',
      '系统不应该在用户输入时打断写作',
      '自动化只能给建议，最终决定权留给用户',
      '任何会改动用户原文的动作都应先让用户确认',
      '本地数据是唯一真源，云端同步只做备份',
      'API key 不能进入前端持久化存储',
      '所有外部模型调用前必须提示用户数据会发送出去',
    ],
    threshold: 0.65,
  },
  {
    type: 'decision',
    label: '决策',
    examples: [
      '我们决定采用 p-queue 作为并发控制方案',
      '经过评估，选择 SQLite FTS5 而非 Elasticsearch',
      '最终方案是用 Tauri command 封装文件操作，前端不直接读写文件',
      '本阶段暂不引入 Redis，桌面端不应引入额外运维负担',
      '确定了用 CodeMirror 6 作为编辑器基础',
    ],
    threshold: 0.65,
  },
  {
    type: 'question',
    label: '待澄清问题',
    examples: [
      'Context Pack 放在 Platter 里可能会让入口变重，这一点需要判断',
      '是否需要为每个文档生成独立的摘要索引',
      'embedding 相似度阈值应该设为多少才合理',
      '如果用户切换 vault，是否应该保留当前 session 的建议',
      '前端是否需要缓存最近的 FTS 搜索结果',
    ],
    threshold: 0.62,
  },
  {
    type: 'action',
    label: '待执行动作',
    examples: [
      '接下来要验证用户手动清理历史建议的路径',
      '需要为 detector 写覆盖 12 条语义输入的测试用例',
      '完成 Step 3 后进入 Step 4 Delivery Policy 开发',
      '检查 metadata.db 中 mentor_suggestions 表的索引是否生效',
      '部署前需要确认 AI Runtime 的 fallback 策略已配置',
    ],
    threshold: 0.65,
  },
  {
    type: 'requirement',
    label: '需求/要求',
    examples: [
      'Inbox 中的建议应按时间分组展示，支持手动清理',
      'shortMessage 必须控制在 12 到 28 个中文字之间',
      'inline bubble 最多只能显示 2 个 action 按钮',
      '所有写入操作必须有用户二次确认',
    ],
    threshold: 0.66,
  },
  {
    type: 'risk',
    label: '风险/注意事项',
    examples: [
      '如果 embedding 模型不可用，L0 规则只能给 low-confidence 结果',
      '清理 dismissed 建议时注意不要误删 accepted 记录',
      'job 去重依赖 inputHash，如果 hash 碰撞会导致任务被跳过',
      '长时间 idle 后连续触发 detector 可能产生重复 suggestion',
    ],
    threshold: 0.66,
  },
  {
    type: 'review',
    label: '需要复查',
    examples: [
      '这里与之前确定的架构边界有冲突，需要复查',
      'Context Pack 的来源类型与输出目标不匹配',
      '文档中出现了与现有决策矛盾的内容',
      '这段内容与另一篇文档高度相似，可能重复',
    ],
    threshold: 0.64,
  },
];

/**
 * 根据 semantic type 获取对应的 prototype
 */
export function getPrototypeByType(type: SemanticType): SemanticPrototype | undefined {
  return SEMANTIC_PROTOTYPES.find(p => p.type === type);
}

/**
 * 获取所有 prototype
 */
export function getAllPrototypes(): SemanticPrototype[] {
  return SEMANTIC_PROTOTYPES;
}
