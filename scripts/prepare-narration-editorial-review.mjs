import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    args[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.output || !args.report) {
  console.error('Usage: node scripts/prepare-narration-editorial-review.mjs --input <source.txt> --output <review.txt> --report <report.json>');
  process.exit(1);
}

const replacements = [
  {
    id: 'opening-review-frame',
    kind: 'fluency',
    from: '我顺着数据流一步步讲,每步说清楚有哪些选型、生产上一般怎么选为什么、实际是不是混合用怎么用、看什么指标、还有什么能提升的。这样讲是因为我觉得 RAG 每一步都不是非此即彼的单选,实际生产多是组合用,而且每步都有指标和提升空间,讲清楚这些才能体现是真的做过而不是只会调 API。',
    to: '我顺着数据流一步步讲，每一步都说清楚有哪些选型、生产上一般怎么选、为什么这么选，实际是否组合使用、怎么组合，看哪些指标，还有哪些提升空间。因为 RAG 的每一步都不是非此即彼的单选，实际生产更多是组合使用。把这些判断讲清楚，才能体现真正做过，而不只是会调 API。',
    reason: '拆开过长并列句，补齐口语停顿，不改变开场主张。',
  },
  {
    id: 'parsing-input-list',
    kind: 'fluency',
    from: '原始文档是 PDF、Word、HTML、Confluence,格式杂、有表格图片扫描件。',
    to: '原始文档可能来自 PDF、Word、HTML 或 Confluence，格式复杂，既有表格、图片，也有扫描件。',
    reason: '把名词堆叠改成可听懂的枚举。',
  },
  {
    id: 'parsing-candidate-claims',
    kind: 'evidence',
    from: '一类是结构化解析框架,Unstructured 支持 50 多种格式能区分标题正文表格,MinerU 对复杂中文文档和表格还原强,Docling 是 IBM 2024 年新出的对公式表格还原好;一类是商业服务,LlamaParse 对复杂 PDF 强但要花钱;还有多模态 LLM 直接看图解析,扫描件和图表最强但最贵。',
    to: '一类是结构化解析框架，候选包括 Unstructured、MinerU 和 Docling。它们支持的格式、中文复杂文档效果、公式和表格还原能力，要用同一批样本比较；商业服务如 LlamaParse 也可以列入候选；扫描件和图表可以用多模态 LLM 兜底，但成本通常更高。',
    reason: '保留选型范围，移除会随版本变化的格式数量、发布时间和无条件强弱判断。',
  },
  {
    id: 'parsing-selection-caveat',
    kind: 'precision',
    from: '复杂文档--表格多、层级深、有规范编号--必须上结构化解析',
    to: '复杂文档——表格多、层级深、有规范编号——通常要用结构化解析',
    reason: '把无条件断言改为生产判断。',
  },
  {
    id: 'parsing-combination-intro',
    kind: 'fluency',
    from: '实际怎么用,这里要发散一下--生产上几乎不会单一用一个解析器,而是分层组合。',
    to: '实际怎么用？这里补充一个关键点：生产上很少只用一个解析器，而是采用分层组合。',
    reason: '去掉口头赘词，直接落到组合结论。',
  },
  {
    id: 'parsing-evaluation-set',
    kind: 'fluency',
    from: '建几十篇评测集人工标正确解析',
    to: '建立几十篇文档的评测集，人工标注正确解析结果',
    reason: '修正不自然的宾语结构。',
  },
  {
    id: 'chunk-embedding-explanation',
    kind: 'clarity',
    from: '整篇文档一起 embed 语义被稀释,一篇既讲 A 又讲 B,向量化出来两个都不像。',
    to: '整篇文档一起 embed，语义会被稀释。一篇文档既讲 A 又讲 B，生成的向量可能同时偏离两类主题。',
    reason: '把比喻改成明确的检索含义。',
  },
  {
    id: 'chunk-parameter-caveat',
    kind: 'evidence',
    from: '通用参数甜点是 512 token 加 10% overlap,这个是业界共识。',
    to: '一个常见起点是 512 token 配 10% overlap，但它不是固定答案，仍要用领域评测集校准。',
    reason: '保留实用参数，同时去掉未经来源限定的“甜点值”和“业界共识”。',
  },
  {
    id: 'chunk-recursive-fallback-caveat',
    kind: 'precision',
    from: '通用兜底首选',
    to: '常见兜底选择',
    reason: '保留递归字符切分的通用性，不把缺少场景限定的经验判断写成唯一首选。',
  },
  {
    id: 'chunk-markdown-structure-caveat',
    kind: 'precision',
    from: '结构化文档最佳',
    to: '更适合标题层级清晰的结构化文档',
    reason: '补充适用条件，避免把文档结构差异简化为无条件最佳结论。',
  },
  {
    id: 'retrieval-synthesis-decoupling',
    kind: 'precision',
    from: 'Naive RAG 把这俩当同一个是错的。',
    to: 'Naive RAG 往往把两者当成同一个对象，生产上需要把检索块和合成块解耦。',
    reason: '把绝对判断改成可执行的工程结论。',
  },
  {
    id: 'contextual-priority',
    kind: 'precision',
    from: '这一步很多人跳过,但我认为它是目前最大单项提升,值得单独讲。',
    to: '这一步经常被跳过，但我认为它是值得优先评估的增强项，所以单独讲。',
    reason: '去掉缺少跨场景证据的“最大单项提升”。',
  },
  {
    id: 'contextual-public-numbers',
    kind: 'evidence',
    from: 'Contextual Retrieval 效果最硬,Anthropic 官方实测检索失败率从 5.7% 降到 1.9%,降 67%,不需要训练模型。但有个大坑必须说,不加 prompt caching 会贵死,因为给每个 chunk 生成上下文都要把整篇文档塞 prompt,一个文档 N 个 chunk 就塞 N 次。配 prompt caching 把整篇标记成缓存前缀,100 万文档 token 才 1.02 美元,可接受。框架没有现成的,Anthropic 给了思路,得自己实现。',
    to: 'Contextual Retrieval 的公开实验结果很有参考价值。按 Anthropic 2024 年 9 月发布的材料，检索失败率从 5.7% 降到 1.9%，相对下降 67%。这些数字只代表其公开实验，不能直接当作项目承诺。它不需要额外训练模型，但如果不给 prompt 做缓存，每个 chunk 都重复携带整篇文档，成本会迅速放大。该材料还给出了当时的缓存价格示例；真实成本要按当前价格和自己的文档规模重算。框架通常需要自己组装这条链路。',
    reason: '保留来源稿中的公开实验数据，补充来源、时间和适用边界，移除易过期的单价口播。',
  },
  {
    id: 'embedding-candidate-list',
    kind: 'fluency',
    from: '常用选型:中文开源主要是智源的 BGE 系列,bge-large-zh-v1.5 是 1024 维中文强,bge-m3 更新,自带 dense 加 sparse 加 ColBERT 三种模式,还支持 8K 上下文;商业的有 OpenAI text-embedding-3-large(3072 维,支持 Matryoshka 可截断降维)、Voyage-3(Anthropic 推荐)、Cohere embed-v3(区分 query 和 doc 的 input_type);jina-embeddings-v2/v3 支持 8K 上下文,是 Late Chunking 的基础。',
    to: '常用选型分为开源和商业两类。中文开源候选包括 BGE 系列；需要稠密、稀疏和 ColBERT 多种模式时，可以评估 bge-m3。商业候选包括 OpenAI、Voyage 和 Cohere 的向量模型；Jina 的长上下文模型可以配合延迟分块。具体版本、维度和输入类型，要以当前文档和同一套领域评测为准。',
    reason: '保留选型家族和能力差异，把易过期的版本细节移到屏幕辅助。',
  },
  {
    id: 'embedding-selection-caveat',
    kind: 'evidence',
    from: '生产怎么选、为什么,三个考量。一是中文效果,中文场景 BGE 系列开源里最强;二是部署,企业知识不能出域的就选 BGE 本地部署,不差钱不在乎数据出境用 OpenAI 或 Voyage 效果更好;三是维度,3072 维存检索都贵,Matryoshka 降到 1024 通常够用。我的默认选择是中文企业场景 BGE,要 ColBERT 能力上 bge-m3。',
    to: '生产怎么选、为什么？主要看三个方面。第一是中文效果，BGE 系列通常是中文开源方案的重要候选，但仍要用领域评测集比较。第二是部署边界，企业知识不能出域时优先评估本地模型；允许外部服务时，再把 OpenAI、Voyage 等商业方案放进同一评测。第三是维度，3072 维的存储和检索成本更高，是否降到 1024 维，也要用召回指标确认。我的默认起点是中文企业场景先评估 BGE，需要 ColBERT 能力时再评估 bge-m3。',
    reason: '保留选型框架，移除“最强”和无评测依据的效果承诺。',
  },
  {
    id: 'embedding-usage-pitfalls',
    kind: 'fluency',
    from: '实际怎么用:有几个坑要注意。第一,query 和 doc 用同一个模型;Cohere 那种区分 input_type 的,query 传 query、doc 传 search_document,搞反精度大跌。第二,换模型等于全库重新 embed,要做版本管理,带 embedding_version 字段灰度切换。第三,MTEB 榜单只是参考,通用榜单不代表你领域好,真正要看的自建领域评测集的 recall@k。',
    to: '实际使用有三个坑。第一，查询和文档要使用相互兼容的向量模型配置；对区分输入类型的模型，要分别标明查询输入和文档输入，搞反会影响精度。第二，换模型等于全库重新计算向量，要用版本字段做灰度切换。第三，MTEB 榜单只能作为参考，最终要看自建领域评测集的召回率。',
    reason: '保留三个工程风险，去掉不适合口播的代码字段名，并兼容成对编码器等共享向量空间的实现。',
  },
  {
    id: 'vector-database-candidates',
    kind: 'precision',
    from: '常用选型:pgvector 是 PostgreSQL 扩展,中小规模加要 SQL 加要事务的首选;Milvus 是分布式大规模亿级首选;Weaviate 内置 hybrid(BM25 加向量)一站式;Qdrant 是 Rust 写的轻量高性能;Chroma 适合原型;Elasticsearch 既能全文又能向量,适合已有 ES 技术栈。索引算法主要是 HNSW(多层图,快且准,生产首选)、IVF(聚类,大规模内存友好)、Flat(暴力,小数据精确)。',
    to: '常用向量库候选包括 pgvector、Milvus、Weaviate、Qdrant、Chroma 和 Elasticsearch。pgvector 的优势是复用 PostgreSQL 的事务和联表能力；Milvus 面向分布式扩展；Weaviate 内置混合检索；已有 Elasticsearch 技术栈时，也可以复用它的全文和向量能力。常见索引算法包括 HNSW、IVF 和 Flat。它们分别偏向低延迟、高规模或精确基线，具体选择要看压测，不能只按数据量贴标签。',
    reason: '保留候选与能力差异，移除未经压测的规模硬阈值和“首选”表述。',
  },
  {
    id: 'vector-db-thresholds',
    kind: 'precision',
    from: '我的判断是,中小规模(千万级以内)且已有 PostgreSQL 的,选 pgvector 不选 Milvus,理由很实在--后端团队熟悉 SQL,能 WHERE metadata 过滤 ORDER BY 向量相似度 LIMIT k,先过滤再排序跟数据库执行计划一个道理,还能跟业务表 join、走事务、运维省一个中间件,预估超千万级片段再迁 Milvus。要内置 hybrid 省事用 Weaviate。大规模亿级才上 Milvus。',
    to: '我的判断是：在中小规模、已有 PostgreSQL、又需要事务和 join 的场景里，可以先评估 pgvector。理由很实在：后端团队熟悉 SQL，可以先按 metadata 过滤，再按向量相似度排序，还能跟业务表 join、走事务，少运维一个中间件。规模、延迟或分片需求超过单库能力后，再评估 Milvus 等分布式方案。需要内置 hybrid 时，可以把 Weaviate 放进候选。具体迁移阈值不能只看片段数量，要用压测决定。',
    reason: '保留个人生产决策，避免把千万级和亿级写成通用硬阈值。',
  },
  {
    id: 'hnsw-project-privacy',
    kind: 'publication',
    from: 'HNSW 参数 m=16、ef_construction=200 是通用值,ef_search 查询时调,50 到 100,大一点准但慢。还要配 metadata 打标,检索时预过滤缩小候选集。pgvector 的 HNSW 删除是标记删除,定期要重建索引回收空间。万物云 agent 的长期记忆也用 pgvector,就是看中同库事务这点。',
    to: 'HNSW 参数可以从 m=16、ef_construction=200 这类常见组合开始压测，ef_search 在查询阶段调节，通常需要在召回和延迟之间取舍。还要配合 metadata 打标，检索时先缩小候选集。pgvector 的索引维护和空间回收也要进入运维计划。在我参与的一个知识 Agent 项目里，我们选择 pgvector 的重要原因之一，就是它能和业务数据共享事务边界。',
    reason: '把参数改为压测起点，并去掉未授权客户名称。',
  },
  {
    id: 'ann-threshold-caveat',
    kind: 'evidence',
    from: '指标:ANN 召回率(跟 Flat 暴力搜对比,应 95% 以上)、QPS、延迟 P99、内存占用。',
    to: '指标：ANN 召回率要和 Flat 暴力搜索对比，再结合 QPS、延迟 P99 和内存占用设定业务门槛；95% 可以作为一个评估起点，不是所有场景的统一标准。',
    reason: '避免把示例阈值写成无条件标准。',
  },
  {
    id: 'hyde-caveat',
    kind: 'precision',
    from: 'HyDE 对概念性方法性查询有效,但对事实查询有害--LLM 假设错会把检索带偏,这个坑要注意。',
    to: 'HyDE 对概念性、方法性查询可能有效，但在事实查询里也可能因为假设错误把检索带偏，这个风险要单独评测。',
    reason: '把绝对因果改为需要评测的风险。',
  },
  {
    id: 'retrieval-project-privacy',
    kind: 'publication',
    from: '中建那个项目就是四路混合,这是 Recall 提升的关键之一。',
    to: '在我参与的一个规范文档项目里，我们采用过四路混合检索，它是提升 Recall 的关键因素之一。',
    reason: '去掉未授权客户名称，保留个人项目经验。',
  },
  {
    id: 'rrf-k-caveat',
    kind: 'evidence',
    from: 'k=60 是论文经验值,基本不用调。LangChain 的 EnsembleRetriever 直接给了 hybrid 加 RRF,不用手搓。',
    to: 'k=60 是常见的论文经验起点，但仍应结合候选规模和离线指标确认。LangChain 的 EnsembleRetriever 提供了 hybrid 加 RRF 的现成组合，可以减少重复实现。',
    reason: '去掉“不用调”的绝对结论。',
  },
  {
    id: 'rerank-optimum-caveat',
    kind: 'evidence',
    from: 'Anthropic 流程是 hybrid 出 top-150、rerank 到 top-20,top-20 是喂 LLM 的最优数量。',
    to: 'Anthropic 的公开流程示例采用 hybrid 取 top-150，再 rerank 到 top-20；这是一种参考配置，不是所有模型和任务的统一最优值。',
    reason: '保留公开流程示例，移除通用最优声明。',
  },
  {
    id: 'rerank-candidate-list',
    kind: 'precision',
    from: '常用选型:cross-encoder,把 query 和 doc 拼成序列过 transformer 全注意力交互,精度最高,主流是 bge-reranker-v2-m3、Cohere rerank、Voyage rerank;ColBERT 是 late interaction,query 和 doc 分别编码成 token 级向量,打分时 query 每个 token 跟 doc 所有 token 做 max-cosine 再求和,精度速度折中,bge-m3 自带;bi-encoder 就是 dense 检索本身,不算独立 rerank。',
    to: '常用重排方案包括交叉编码器和 ColBERT。交叉编码器把查询和文档放进同一个 Transformer 做全注意力交互，通常比双塔召回更精细；候选可以包括 bge-reranker-v2-m3、Cohere 和 Voyage 的重排服务。ColBERT 采用延迟交互，在精度和速度之间折中。双塔编码器负责稠密召回，本身不等于独立重排。',
    reason: '保留架构差异和候选，移除“精度最高”等无条件结论以及不适合口播的逐词公式。',
  },
  {
    id: 'rerank-production-choice',
    kind: 'precision',
    from: '实际怎么用:cross-encoder 是主流,bge-reranker-v2-m3 开源够用。如果追求速度精度折中可以上 ColBERT,bge-m3 一个模型自带 dense、sparse、ColBERT 三路。rerank 候选数别太多,top-50 到 top-150,再多 rerank 成本不值。LangChain 的 ContextualCompressionRetriever 能接 rerank 模型。',
    to: '实际使用时，可以先把 bge-reranker-v2-m3 作为开源交叉编码器候选；需要速度和精度折中时，再评估 ColBERT。候选数量要用离线指标和延迟压测共同决定，前五十条到前一百五十条可以作为起始范围。LangChain 的 ContextualCompressionRetriever 可以接入重排模型。',
    reason: '保留工程起点，去掉“够用”和“成本不值”的绝对判断。',
  },
  {
    id: 'self-rag-adoption-caveat',
    kind: 'evidence',
    from: '关键判断是Self-RAG 原版要微调,门槛极高,99% 团队不做。',
    to: '关键判断是：Self-RAG 原版需要微调，实施门槛较高，多数团队不会直接照搬完整方案。',
    reason: '去掉无法公开验证的“99% 团队”。',
  },
  {
    id: 'agentic-project-result',
    kind: 'publication',
    from: '中建项目就是这个轻量闭环,引用支持率做到 92%。',
    to: '在我参与的一个项目里，我们采用了这套轻量闭环，引用支持率得到明显改善；具体项目名称和数值要在获得公开授权后再披露。',
    reason: '保留个人实践结论，隐藏未授权客户和项目指标。',
  },
  {
    id: 'evaluation-project-result',
    kind: 'publication',
    from: '中建项目就是这个闭环,Recall@5 从 65% 提到 82%。',
    to: '在我参与的一个项目里，我们用这套 trace 闭环定位并修复问题，Recall@5 得到明显提升；具体项目名称和数值要在获得公开授权后再披露。',
    reason: '保留 trace 闭环的实践价值，隐藏未授权客户和项目指标。',
  },
  {
    id: 'cache-public-numbers',
    kind: 'evidence',
    from: 'prompt caching 必须做,文档和 system prompt 标记缓存,Contextual Retrieval 的低成本就靠它,降本约 90%、首 token 延迟降 2 倍。',
    to: '在 Contextual Retrieval 这类重复携带长前缀的流程里，prompt caching 应优先评估。公开材料给出过显著的成本和首 token 延迟改善，但真实收益取决于模型、缓存命中率和当前计费规则，不能直接当作项目承诺。',
    reason: '保留工程建议，去掉缺少当前来源回执的收益数字。',
  },
  {
    id: 'production-threshold-caveat',
    kind: 'evidence',
    from: '指标:可用性 SLA(99.9% 以上)、延迟 P99、单 query 成本、cache 命中率(应 80% 以上才划算)、注入拦截率、增量索引正确性、版本切换无感。',
    to: '指标：可用性 SLA、延迟 P99、单次 query 成本、cache 命中率、注入拦截率、增量索引正确性和版本切换稳定性。SLA 与缓存收益门槛要按业务目标和成本模型单独设定。',
    reason: '保留完整指标，移除无来源的统一阈值。',
  },
  {
    id: 'closing-evidence-caveat',
    kind: 'evidence',
    from: '从 Contextual Retrieval 降 67% 失败率,到 Reflexion memory 让 agent 从失败学习,到 RAGAS 四指标量化质量',
    to: '从 Contextual Retrieval 公开实验里的检索失败率下降，到 Reflexion memory 让 agent 从失败中学习，再到 RAGAS 四类指标量化质量',
    reason: '结尾保留证据链，但不重复脱离来源限定的百分比。',
  },
  {
    id: 'multi-query-scope-caveat',
    kind: 'precision',
    from: 'Multi-query 最通用',
    to: 'Multi-query 适用面相对广',
    reason: '把无条件的“最通用”改成带范围的口语判断。',
  },
  {
    id: 'hybrid-retrieval-adoption-caveat',
    kind: 'precision',
    from: '所以生产上几乎都上 hybrid',
    to: '所以生产上通常至少要评估 hybrid',
    reason: '避免把混合检索说成所有生产场景的必选项。',
  },
  {
    id: 'exact-match-reliability-caveat',
    kind: 'precision',
    from: '编号精确匹配几乎不会错',
    to: '编号精确匹配在格式规则清晰时通常更可靠',
    reason: '补充编号规则清晰这一适用条件，去掉“几乎不会错”的保证。',
  },
  {
    id: 'standard-rrf-starting-point',
    kind: 'precision',
    from: '一般场景标准 RRF 就够',
    to: '一般场景可以先从标准 RRF 开始,再看离线指标是否需要加权',
    reason: '把“够用”改成可验证的工程起点，并交代后续决策依据。',
  },
  {
    id: 'citation-precision-caveat',
    kind: 'precision',
    from: 'span 级用支持 citation 的模型直接给答案片段对应哪个 chunk(最精确,Cohere 有这个能力)',
    to: 'span 级用支持 citation 的模型直接给答案片段对应哪个 chunk(通常能给出更细的引用对应,Cohere 有这个能力)',
    reason: '说明片段级引用的粒度优势，避免无条件宣称“最精确”。',
  },
  {
    id: 'production-readiness-transition-caveat',
    kind: 'precision',
    from: '还有几件事必须做',
    to: '还有几件关键工程能力要补齐',
    reason: '把命令式判断改成自然的章节过渡，并保留上线准备含义。',
  },
  {
    id: 'parsing-quality-influence',
    kind: 'precision',
    from: '质量直接决定后面所有环节的上限',
    to: '解析质量会直接影响后面各环节的效果',
    reason: '保留解析质量的重要性，避免把后续效果说成由单一环节绝对决定。',
  },
  {
    id: 'simple-parser-starting-point',
    kind: 'precision',
    from: '简单纯文本 PyMuPDF 就够,快又便宜',
    to: '简单纯文本可以先用 PyMuPDF,速度快,成本也低',
    reason: '把“就够”改为可继续评测的工具起点，并拆开口播节奏。',
  },
  {
    id: 'multimodal-hard-page-caveat',
    kind: 'precision',
    from: '再触发多模态 LLM 二次解析,贵但准,只对难解析的页面用,控成本',
    to: '再触发多模态 LLM 二次解析,成本更高,但更适合处理这些难页,只在需要时使用',
    reason: '用适用场景替代无条件的“准”，同时说明成本控制方式。',
  },
  {
    id: 'chunk-metadata-spoken',
    kind: 'fluency',
    from: '每个 chunk 必须绑元数据',
    to: '每个 chunk 都要带上元数据',
    reason: '保留生产约束，把“必须绑”改成自然口语。',
  },
  {
    id: 'contextual-two-route-condition',
    kind: 'precision',
    from: '上了之后,embedding 和 BM25 两路都要用增强后的文本,才有叠加效果',
    to: '如果想叠加两路收益,embedding 和 BM25 都要使用增强后的文本',
    reason: '先说明目标，再给出两路都使用增强文本的条件。',
  },
  {
    id: 'query-rewrite-selection-spoken',
    kind: 'fluency',
    from: '改写也不是无脑全上四种',
    to: '改写也不是四种方法全上',
    reason: '去掉情绪化用词，保留按查询类型选择方法的意思。',
  },
  {
    id: 'specialized-retrieval-routes-caveat',
    kind: 'precision',
    from: '如果场景里编号、术语、表格多,就上多路',
    to: '如果场景里编号、术语、表格多,再评估多路检索',
    reason: '把无条件实施改成由场景和评测驱动的选择。',
  },
  {
    id: 'retrieval-route-tradeoff',
    kind: 'precision',
    from: '具体几路看场景,路越多越准但越慢,要权衡',
    to: '具体几路要看场景。每加一路都可能补充召回,也会增加噪声和延迟,最终要看离线指标和压测',
    reason: '说明增加检索路线同时存在收益、噪声和延迟，不承诺路线越多越准。',
  },
  {
    id: 'reranker-scope-caveat',
    kind: 'precision',
    from: 'rerank 是 cross-encoder,query 和 doc 拼一起过模型,精度高但慢,只能精排几十条',
    to: 'rerank 是 cross-encoder,query 和 doc 拼在一起过模型,通常更精细,但计算更慢,更适合精排几十条',
    reason: '把重排的精度和候选规模改为通常适用的工程判断。',
  },
  {
    id: 'langgraph-fit-caveat',
    kind: 'precision',
    from: 'LangGraph 天生适合带条件分支和循环的决策流',
    to: 'LangGraph 更适合表达带条件分支和循环的决策流',
    reason: '去掉营销式的“天生适合”，保留框架与任务结构的匹配关系。',
  },
  {
    id: 'prompt-injection-controls-spoken',
    kind: 'fluency',
    from: '要文档内容用分隔符隔离、system 强调文档是数据不是指令、输出过滤',
    to: '做法包括:用分隔符隔离文档内容,在 system 中明确文档是数据而不是指令,再做输出过滤',
    reason: '修正不自然的宾语前置，把三项安全控制改成连续动作。',
  },
];

const spokenTermReplacements = [
  {id: 'metric-recall-at-five', pattern: /Recall@5/g, replacement: '前五召回率', screenTerm: 'Recall@5'},
  {id: 'metric-recall-at-k', pattern: /recall@k/gi, replacement: '前若干结果的召回率', screenTerm: 'recall@k'},
  {id: 'metric-hit-rate-at-k', pattern: /hit rate@k/gi, replacement: '前若干结果的命中率', screenTerm: 'hit rate@k'},
  {id: 'candidate-top-150', pattern: /top-150/gi, replacement: '前一百五十条', screenTerm: 'top-150'},
  {id: 'candidate-top-50', pattern: /top-50/gi, replacement: '前五十条', screenTerm: 'top-50'},
  {id: 'candidate-top-20', pattern: /top-20/gi, replacement: '前二十条', screenTerm: 'top-20'},
  {id: 'candidate-top-5', pattern: /top-5/gi, replacement: '前五条', screenTerm: 'top-5'},
  {id: 'candidate-top-k', pattern: /top-K/gi, replacement: '前若干条', screenTerm: 'top-K'},
  {id: 'candidate-top-k-code', pattern: /top_k/gi, replacement: '候选数量', screenTerm: 'top_k'},
  {id: 'garbage-phrase', pattern: /garbage in garbage out/gi, replacement: '垃圾进，垃圾出', screenTerm: 'garbage in, garbage out'},
  {id: 'lost-middle', pattern: /lost in the middle/gi, replacement: '中间信息遗失', screenTerm: 'lost in the middle'},
  {id: 'contextual-retrieval', pattern: /Contextual Retrieval/g, replacement: '上下文检索', screenTerm: 'Contextual Retrieval'},
  {id: 'late-chunking', pattern: /Late Chunking/g, replacement: '延迟分块', screenTerm: 'Late Chunking'},
  {id: 'multi-query', pattern: /Multi-query/g, replacement: '多查询扩展', screenTerm: 'Multi-query'},
  {id: 'step-back', pattern: /Step-back/g, replacement: '后退一步改写', screenTerm: 'Step-back'},
  {id: 'decomposition', pattern: /Decomposition/g, replacement: '问题分解', screenTerm: 'Decomposition'},
  {id: 'cross-encoder', pattern: /cross-encoder/gi, replacement: '交叉编码器', screenTerm: 'cross-encoder'},
  {id: 'bi-encoder', pattern: /bi-encoder/gi, replacement: '双塔编码器', screenTerm: 'bi-encoder'},
  {id: 'late-interaction', pattern: /late interaction/gi, replacement: '延迟交互', screenTerm: 'late interaction'},
  {id: 'recursive-character-splitter', pattern: /LangChain 的 RecursiveCharacterTextSplitter/g, replacement: 'LangChain 的递归字符切分器', screenTerm: 'RecursiveCharacterTextSplitter'},
  {id: 'markdown-node-parser', pattern: /LlamaIndex 的 MarkdownNodeParser/g, replacement: 'LlamaIndex 的 Markdown 节点解析器', screenTerm: 'MarkdownNodeParser'},
  {id: 'llm-judge', pattern: /LLM-as-judge/gi, replacement: '大模型裁判', screenTerm: 'LLM-as-judge'},
  {id: 'reflection-token', pattern: /reflection token/gi, replacement: '反思词元', screenTerm: 'reflection token'},
  {id: 'reflection-memory', pattern: /reflection memory/gi, replacement: '反思记忆', screenTerm: 'reflection memory'},
  {id: 'episodic-memory', pattern: /episodic memory/gi, replacement: '情景记忆', screenTerm: 'episodic memory'},
  {id: 'golden-qa', pattern: /golden QA/gi, replacement: '黄金问答集', screenTerm: 'golden QA'},
  {id: 'bad-case', pattern: /bad case/gi, replacement: '问题样例', screenTerm: 'bad case'},
  {id: 'prompt-caching', pattern: /prompt caching/gi, replacement: '提示词缓存', screenTerm: 'prompt caching'},
  {id: 'prompt-injection', pattern: /prompt injection/gi, replacement: '提示词注入', screenTerm: 'prompt injection'},
  {id: 'system-prompt', pattern: /system prompt/gi, replacement: '系统提示词', screenTerm: 'system prompt'},
  {id: 'context-precision', pattern: /context precision/gi, replacement: '上下文精度', screenTerm: 'context precision'},
  {id: 'context-recall', pattern: /context recall/gi, replacement: '上下文召回率', screenTerm: 'context recall'},
  {id: 'answer-relevancy', pattern: /answer relevancy/gi, replacement: '答案相关性', screenTerm: 'answer relevancy'},
  {id: 'input-type-sentence', pattern: /Cohere 那种区分 input_type 的,query 传 query、doc 传 search_document/g, replacement: 'Cohere 这类区分输入类型的模型，要分别标明查询输入和文档输入', screenTerm: 'input_type / search_document'},
  {id: 'embedding-version', pattern: /embedding_version/gi, replacement: '向量模型版本字段', screenTerm: 'embedding_version'},
  {id: 'base-contextual', pattern: /base vs contextual/gi, replacement: '基础方案和上下文增强方案', screenTerm: 'base vs contextual'},
  {id: 'rrf-full-name', pattern: /RRF\(Reciprocal Rank Fusion\)/g, replacement: 'RRF，也就是倒数排名融合', screenTerm: 'Reciprocal Rank Fusion'},
  {id: 'reflection-four-states', pattern: /Retrieve、IsRel、IsSup、IsUse/g, replacement: '是否检索、是否相关、是否支持、是否有用', screenTerm: 'Retrieve / IsRel / IsSup / IsUse'},
  {id: 'issup', pattern: /\bIsSup\b/g, replacement: '支持性检查', screenTerm: 'IsSup'},
  {id: 'isuse', pattern: /\bIsUse\b/g, replacement: '有用性检查', screenTerm: 'IsUse'},
  {id: 'llm-router', pattern: /LLM-as-router/gi, replacement: '大模型路由器', screenTerm: 'LLM-as-router'},
  {id: 'confusion-matrix', pattern: /confusion matrix/gi, replacement: '混淆矩阵', screenTerm: 'confusion matrix'},
  {id: 'structured-output', pattern: /structured output/gi, replacement: '结构化输出', screenTerm: 'structured output'},
  {id: 'hit-rate', pattern: /hit rate/gi, replacement: '命中率', screenTerm: 'hit rate'},
  {id: 'ndcg-at-k', pattern: /nDCG@k/g, replacement: 'nDCG', screenTerm: 'nDCG@k'},
  {id: 'metadata', pattern: /\bmetadata\b/gi, replacement: '元数据', screenTerm: 'metadata'},
  {id: 'pooling', pattern: /\bpooling\b/gi, replacement: '池化', screenTerm: 'pooling'},
  {id: 'wiki', pattern: /\bwiki\b/gi, replacement: '知识库', screenTerm: 'wiki'},
  {id: 'overlap', pattern: /\boverlap\b/gi, replacement: '重叠比例', screenTerm: 'overlap'},
  {id: 'naive', pattern: /\bNaive\b/g, replacement: '朴素', screenTerm: 'Naive'},
  {id: 'instruction-tuned', pattern: /instruction-tuned/gi, replacement: '指令微调', screenTerm: 'instruction-tuned'},
  {id: 'score', pattern: /\bscore\b/gi, replacement: '分数', screenTerm: 'score'},
  {id: 'evaluator', pattern: /\bevaluator\b/gi, replacement: '评估器', screenTerm: 'evaluator'},
  {id: 'correct-state', pattern: /\bcorrect\b/gi, replacement: '正确状态', screenTerm: 'correct'},
  {id: 'ambiguous-state', pattern: /\bambiguous\b/gi, replacement: '模糊状态', screenTerm: 'ambiguous'},
  {id: 'incorrect-state', pattern: /\bincorrect\b/gi, replacement: '错误状态', screenTerm: 'incorrect'},
  {id: 'span', pattern: /\bspan\b/gi, replacement: '片段', screenTerm: 'span'},
  {id: 'demo', pattern: /\bdemo\b/gi, replacement: '演示', screenTerm: 'demo'},
  {id: 'system', pattern: /\bsystem\b/gi, replacement: '系统', screenTerm: 'system'},
  {id: 'agentic', pattern: /\bAgentic\b/g, replacement: '智能体式', screenTerm: 'Agentic'},
  {id: 'agent', pattern: /\bagent\b/gi, replacement: '智能体', screenTerm: 'agent'},
  {id: 'query', pattern: /\bquery\b/gi, replacement: '查询', screenTerm: 'query'},
  {id: 'chunk', pattern: /\bchunk\b/gi, replacement: '文本块', screenTerm: 'chunk'},
  {id: 'rerank', pattern: /\brerank\b/gi, replacement: '重排', screenTerm: 'rerank'},
  {id: 'prompt', pattern: /\bprompt\b/gi, replacement: '提示词', screenTerm: 'prompt'},
  {id: 'embedding-model', pattern: /\bembedding 模型/gi, replacement: '向量模型', screenTerm: 'embedding model'},
  {id: 'embedding', pattern: /\bembedding\b/gi, replacement: '向量化', screenTerm: 'embedding'},
  {id: 'embed', pattern: /\bembed\b/gi, replacement: '向量化', screenTerm: 'embed'},
  {id: 'context', pattern: /\bcontext\b/gi, replacement: '上下文', screenTerm: 'context'},
  {id: 'token', pattern: /\btoken\b/gi, replacement: '词元', screenTerm: 'token'},
  {id: 'doc', pattern: /\bdoc\b/gi, replacement: '文档', screenTerm: 'doc'},
  {id: 'hybrid', pattern: /\bhybrid\b/gi, replacement: '混合检索', screenTerm: 'hybrid'},
  {id: 'dense', pattern: /\bdense\b/gi, replacement: '稠密', screenTerm: 'dense'},
  {id: 'sparse', pattern: /\bsparse\b/gi, replacement: '稀疏', screenTerm: 'sparse'},
  {id: 'memory', pattern: /\bmemory\b/gi, replacement: '记忆', screenTerm: 'memory'},
  {id: 'trace', pattern: /\btrace\b/gi, replacement: '调用链', screenTerm: 'trace'},
  {id: 'faithfulness', pattern: /\bfaithfulness\b/gi, replacement: '忠实度', screenTerm: 'faithfulness'},
  {id: 'citation', pattern: /\bcitation\b/gi, replacement: '引用', screenTerm: 'citation'},
  {id: 'bias', pattern: /\bbias\b/gi, replacement: '偏差', screenTerm: 'bias'},
  {id: 'web', pattern: /\bweb\b/gi, replacement: '网络检索', screenTerm: 'web'},
  {id: 'cache', pattern: /\bcache\b/gi, replacement: '缓存', screenTerm: 'cache'},
  {id: 'join', pattern: /\bjoin\b/gi, replacement: '联表', screenTerm: 'join'},
  {id: 'recall', pattern: /\bRecall\b/gi, replacement: '召回率', screenTerm: 'Recall'},
  {id: 'precision', pattern: /\bprecision\b/gi, replacement: '精度', screenTerm: 'precision'},
];

const oralTransitionReplacements = [
  {
    id: 'parsing-options-transition',
    from: '常用选型有这么几类。',
    to: '先看解析工具，大致有这么几类。',
    reason: '用当前环节作主语，避免重复念“常用选型”。',
  },
  {
    id: 'parsing-choice-transition',
    from: '生产怎么选、为什么，核心看文档复杂度。',
    to: '具体到解析工具，先看文档复杂度。',
    reason: '把栏目问法改成承接解析工具的决策句。',
  },
  {
    id: 'parsing-implementation-transition',
    from: '实际怎么用？这里补充一个关键点：',
    to: '落地时，还有一个关键点：',
    reason: '用落地语境自然进入组合方案。',
  },
  {
    id: 'chunking-options-transition',
    from: '常用选型有五种。',
    to: '分块方式主要有五种。',
    reason: '直接点明本章对象，减少栏目感。',
  },
  {
    id: 'chunking-choice-transition',
    from: '生产怎么选、为什么，核心看文档结构。',
    to: '分块怎么选，核心看文档结构。',
    reason: '保留选择问题，但明确本章语义。',
  },
  {
    id: 'chunking-implementation-transition',
    from: '实际怎么用，又是组合。',
    to: '真正落地时，仍然是组合策略。',
    reason: '用上一段选择自然转入组合落地。',
  },
  {
    id: 'contextual-options-transition',
    from: '常用选型目前就两个方向。',
    to: '这类上下文增强，目前主要有两个方向。',
    reason: '用方案类别替代通用栏目词。',
  },
  {
    id: 'contextual-choice-transition',
    from: '生产怎么选、为什么：上下文检索的公开实验结果很有参考价值。',
    to: '上下文检索值不值得上？公开实验结果很有参考价值，但还要结合自己的成本边界。',
    reason: '把选型标签改成是否采用方案的真实问题。',
  },
  {
    id: 'contextual-implementation-transition',
    from: '实际怎么用：这一步是可选增强，不是所有项目都上。',
    to: '具体接入链路时，这一步是可选增强，不是所有项目都要上。',
    reason: '用接入链路语境承接成本与收益判断。',
  },
  {
    id: 'embedding-options-transition',
    from: '常用选型分为开源和商业两类。',
    to: '向量模型先分开源和商业两类。',
    reason: '直接点明向量模型，避免提纲标签。',
  },
  {
    id: 'embedding-choice-transition',
    from: '生产怎么选、为什么？主要看三个方面。',
    to: '向量模型怎么选？主要看三个方面。',
    reason: '保留自然问句并绑定本章对象。',
  },
  {
    id: 'embedding-implementation-transition',
    from: '实际使用有三个坑。',
    to: '这里有三个很容易踩的坑。',
    reason: '用口语提醒自然进入工程注意事项。',
  },
  {
    id: 'vector-store-options-transition',
    from: '常用向量库候选包括',
    to: '向量库的候选包括',
    reason: '去掉不必要的“常用”栏目修饰。',
  },
  {
    id: 'vector-store-choice-transition',
    from: '生产怎么选、为什么，核心看三件事：',
    to: '向量库怎么选，核心看三件事：',
    reason: '把通用栏目问法换成本章决策问题。',
  },
  {
    id: 'vector-store-implementation-transition',
    from: '实际怎么用：pgvector 上一般',
    to: '以 pgvector 为例，一般',
    reason: '用具体实现示例自然承接选型结论。',
  },
  {
    id: 'query-understanding-options-transition',
    from: '常用选型分两块。',
    to: '查询理解可以拆成两块。',
    reason: '用章节概念直接引出两类能力。',
  },
  {
    id: 'query-understanding-choice-transition',
    from: '生产怎么选、为什么：关键判断是不是所有查询都要改写。',
    to: '查询改写要不要做，关键看是不是所有查询都值得改写。',
    reason: '把栏目标签改成真实决策问题。',
  },
  {
    id: 'query-understanding-implementation-transition',
    from: '实际怎么用：生产上是路由判断 + 按需改写的组合。',
    to: '落地时，我通常把路由判断和按需改写组合起来。',
    reason: '用第一人称工程做法承接上一段判断。',
  },
  {
    id: 'retrieval-options-transition',
    from: '常用选型：纯向量检索',
    to: '检索方式可以先分成几类：纯向量检索',
    reason: '用分类句自然引出检索方案。',
  },
  {
    id: 'retrieval-choice-transition',
    from: '生产怎么选、为什么：核心认知是纯向量检索在两类查询上翻车',
    to: '检索这一层，先要认清纯向量检索会在两类查询上翻车',
    reason: '从栏目标签改成检索层的关键认知。',
  },
  {
    id: 'retrieval-implementation-transition',
    from: '实际怎么用，又是组合：我一般至少混合检索起步',
    to: '真正跑在线链路时，我一般至少从混合检索起步',
    reason: '用在线链路语境引出个人实践。',
  },
  {
    id: 'fusion-options-transition',
    from: '常用选型：RRF，也就是倒数排名融合',
    to: '融合方案里，RRF 也就是倒数排名融合',
    reason: '用融合方案作主语，避免栏目式列举。',
  },
  {
    id: 'fusion-choice-transition',
    from: '生产怎么选、为什么：RRF 的计算方式是：',
    to: '融合阶段为什么常从 RRF 开始？先看它的计算方式：',
    reason: '用本章核心问题自然引出公式解释。',
  },
  {
    id: 'fusion-implementation-transition',
    from: '实际怎么用：RRF 是默认选择。',
    to: '工程上，我通常先用标准 RRF。',
    reason: '把抽象默认选择改成明确工程起点。',
  },
  {
    id: 'rerank-options-transition',
    from: '常用重排方案包括',
    to: '重排方案主要包括',
    reason: '去掉重复的“常用”栏目修饰。',
  },
  {
    id: 'rerank-choice-transition',
    from: '生产怎么选、为什么：关键要分清交叉编码器和双塔的区别。',
    to: '到了重排这里，先要分清交叉编码器和双塔的区别。',
    reason: '用链路位置承接到架构差异。',
  },
  {
    id: 'rerank-implementation-transition',
    from: '实际使用时，可以先把 bge-reranker-v2-m3 作为开源交叉编码器候选；',
    to: '如果采用交叉编码器，可以先把 bge-reranker-v2-m3 作为开源候选；',
    reason: '用条件句承接前面的架构选择。',
  },
  {
    id: 'agentic-options-transition',
    from: '常用选型，按反思时机分。',
    to: '这些智能体式方案，可以按反思时机来分。',
    reason: '用方案类别自然引出时间维度。',
  },
  {
    id: 'agentic-choice-transition',
    from: '生产怎么选、为什么：关键判断是：Self-RAG 原版需要微调，',
    to: '智能体式 RAG 怎么落到生产？Self-RAG 原版需要微调，',
    reason: '把栏目标签改成落地问题，并直接进入约束。',
  },
  {
    id: 'agentic-implementation-transition',
    from: '实际怎么用，组合：生产智能体式一般是证据充分性评估 + 改写重试 + 拒答的轻量闭环，不微调。',
    to: '落地时，生产智能体式通常先做证据充分性评估、改写重试和拒答组成的轻量闭环，不急着微调。',
    reason: '用渐进落地语气替代栏目式说明。',
  },
  {
    id: 'generation-options-transition',
    from: '常用选型：生成上就是提示词工程，',
    to: '到了生成阶段，先把提示词约束做好：',
    reason: '用链路阶段承接生成策略，避免把生成质量归结为单一手段。',
  },
  {
    id: 'generation-choice-transition',
    from: '生产怎么选、为什么：防幻觉是命门，要四道防线',
    to: '到了生成环节，防幻觉是命门，要守住四道防线',
    reason: '用生成环节作主语并保持防线结论。',
  },
  {
    id: 'generation-implementation-transition',
    from: '实际怎么用：提示词模板要求',
    to: '具体到生成链路，提示词模板要求',
    reason: '用生成链路语境承接具体实现。',
  },
  {
    id: 'evaluation-options-transition',
    from: '常用选型：RAGAS 是常用评测框架之一，',
    to: '评测工具里，RAGAS 是常用框架之一，',
    reason: '直接进入评测工具，避免重复“常用选型”。',
  },
  {
    id: 'evaluation-choice-transition',
    from: '生产怎么选、为什么：RAGAS 用大模型裁判有偏差',
    to: '评测怎么落地？先承认 RAGAS 用大模型裁判也有偏差',
    reason: '用落地问题引出裁判偏差。',
  },
  {
    id: 'evaluation-implementation-transition',
    from: '实际怎么用：建 200 条左右黄金问答集，',
    to: '评测闭环可以这样搭：先建 200 条左右黄金问答集，',
    reason: '用搭建闭环的动作句引出实践步骤。',
  },
  {
    id: 'production-options-transition',
    from: '常用做法：提示词缓存降本',
    to: '上线前，通常还要把这些工程能力补齐：提示词缓存降本',
    reason: '用上线阶段承接工程能力清单。',
  },
  {
    id: 'production-choice-transition',
    from: '生产怎么选、为什么：逐个说。',
    to: '最后看上线工程，这些能力要组合着选。',
    reason: '用全片收束语气进入工程决策。',
  },
  {
    id: 'production-implementation-transition',
    from: '实际怎么用：这几件事是组合配套的。',
    to: '这些能力不能各做各的，而要组合配套。',
    reason: '用结论句替代最后一次栏目提示。',
  },
  {
    id: 'parsing-metrics-transition',
    from: '指标：解析这步自动化指标不多，主要靠抽检。',
    to: '那解析质量怎么验收？这一步自动化指标不多，主要还是靠抽检。',
    reason: '把栏目标签改成承接上一段的验收问题。',
  },
  {
    id: 'parsing-improvement-transition',
    from: '能提升什么：多模态 LLM 解析越来越强，前沿的 ColPali 思路甚至跳过 OCR，直接对文档页面图像做检索；Docling 这类新框架在公式表格上还在进步；解析后的结构校验可以用规则加小模型自动做，减少人工抽检。',
    to: '把基础解析跑稳以后，还可以从三条线继续提升：用多模态 LLM 处理复杂页面，评估 ColPali 这类直接检索页面图像的思路，跟进 Docling 在公式和表格上的能力；解析后的结构校验，也可以用规则加小模型自动完成，减少人工抽检。',
    reason: '用阶段承接和三条优化线替代提纲式栏目名。',
  },
  {
    id: 'chunking-metrics-transition',
    from: '指标：文本块内聚度(同文本块内句子向量化平均相似度)、边界切断率(抽检有没有切断关键句表格)、下游召回率间接反映。',
    to: '分块效果不能只凭感觉，至少要看三类信号：文本块内聚度，也就是同一文本块内句子向量的平均相似度；边界切断率，抽检有没有切断关键句和表格；最后再用下游召回率验证。',
    reason: '把指标清单改成可听懂的判断顺序。',
  },
  {
    id: 'chunking-improvement-transition',
    from: '能提升什么：延迟分块让文本块带整篇上下文，但要长上下文向量模型；下一节讲的上下文检索是另一个增强方向；动态分块根据内容密度自适应也是趋势。',
    to: '分块还想继续提升，可以沿三个方向走：用延迟分块带入整篇上下文，但前提是向量模型支持长上下文；用下一节的上下文检索补充位置和主题；或者根据内容密度做动态分块。',
    reason: '用自然承接引出下一章，同时保留三个优化方向。',
  },
  {
    id: 'contextual-metrics-transition',
    from: '指标：检索失败率对比(基础方案和上下文增强方案)、对照实验看下游答案正确率、上下文精度。',
    to: '这套增强值不值得上，要靠对照实验回答：先比较基础方案和上下文增强方案的检索失败率，再看下游答案正确率和上下文精度。',
    reason: '把指标改成是否采用方案的决策问题。',
  },
  {
    id: 'contextual-improvement-transition',
    from: '能提升什么：上下文检索加延迟分块组合、用更强模型生成上下文前缀、上下文生成的提示词优化。',
    to: '如果对照实验确认有收益，再继续比较三件事：上下文检索和延迟分块是否组合，用什么模型生成上下文前缀，以及生成前缀的提示词怎么优化。',
    reason: '把优化清单放到对照实验通过后的条件语境中。',
  },
  {
    id: 'embedding-metrics-transition',
    from: '指标：MTEB 榜单(参考)、领域评测集前若干结果的召回率(关键)、向量化计算吞吐。',
    to: '向量模型选得对不对，重点看三件事：MTEB 榜单只作参考，领域评测集前若干结果的召回率才是关键，同时还要看向量化计算吞吐。',
    reason: '把指标按参考、关键和工程成本分层。',
  },
  {
    id: 'embedding-improvement-transition',
    from: '能提升什么：bge-m3 的多模态能力、Matryoshka 降维省存储、对向量化做领域微调(有标注数据时)、指令化向量化(指令微调)。',
    to: '后续优化可以从能力、成本和领域适配三条线展开：评估 bge-m3 的多模态能力，用 Matryoshka 降维节省存储；有标注数据时，再考虑领域微调和指令微调。',
    reason: '把并列术语组织成三条可执行的优化线。',
  },
  {
    id: 'vector-store-metrics-transition',
    from: '指标：ANN 召回率要和 Flat 暴力搜索对比，再结合 QPS、延迟 P99 和内存占用设定业务门槛；95% 可以作为一个评估起点，不是所有场景的统一标准。',
    to: '向量库和索引不能只看速度。ANN 召回率要先和 Flat 暴力搜索对比，再结合 QPS、延迟 P99 和内存占用设定业务门槛；95% 可以作为一个评估起点，但不是所有场景的统一标准。',
    reason: '用决策提醒替代指标标签，并保留阈值边界。',
  },
  {
    id: 'vector-store-improvement-transition',
    from: '能提升什么：HNSW 参数调优、量化压缩(PQ/SQ 降内存)、多级索引、分片、IVF 加 PQ 组合用于超大规模。',
    to: '数据规模继续增长时，再逐步考虑 HNSW 参数调优、用 PQ 或 SQ 量化压缩降低内存，以及多级索引、分片和 IVF 加 PQ 这类超大规模组合。',
    reason: '把优化项放入规模增长的真实触发条件。',
  },
  {
    id: 'query-understanding-metrics-transition',
    from: '指标：改写后前若干结果的召回率提升、路由准确率(混淆矩阵)、改写质量人工评。',
    to: '查询理解有没有带来收益，主要看改写后前若干结果的召回率是否提升、路由准确率的混淆矩阵，以及人工评估的改写质量。',
    reason: '把指标改成验证查询理解收益的问题。',
  },
  {
    id: 'query-understanding-improvement-transition',
    from: '能提升什么：Adaptive RAG 的事前路由(arXiv：2403.14403)、查询改写模型微调、基于历史日志学习改写策略。',
    to: '查询理解跑稳以后，可以继续评估 Adaptive RAG 的事前路由，也可以微调查询改写模型，或者利用历史日志学习改写策略。',
    reason: '用成熟度阶段承接后续优化。',
  },
  {
    id: 'retrieval-metrics-transition',
    from: '指标：前若干结果的召回率、前若干结果的命中率，跟单路对比看提升。',
    to: '召回层是否有效，先看前若干结果的召回率和命中率，再和单路检索做对比，确认多路组合是不是真的带来提升。',
    reason: '把指标改成多路检索的验证闭环。',
  },
  {
    id: 'retrieval-improvement-transition',
    from: '能提升什么：多路扩展(加更多专用索引)、各路候选数量调优、元数据预过滤缩小候选集。',
    to: '召回还不够时，优先从三处优化：增加真正有区分度的专用索引，调整各路候选数量，再用元数据预过滤缩小候选集。',
    reason: '把提升项改成有优先顺序的排查路径。',
  },
  {
    id: 'fusion-metrics-transition',
    from: '指标：融合后 nDCG、跟单路对比、双路重叠率(太低没互补价值，太高冗余)。',
    to: '融合是否真的有增益，可以看融合后的 nDCG、和单路结果的对比，以及双路重叠率。重叠率太低可能没有互补价值，太高又说明信息冗余。',
    reason: '把指标解释成融合方案的判断逻辑。',
  },
  {
    id: 'fusion-improvement-transition',
    from: '能提升什么：加权 RRF、学习融合权重(有标注数据时)。',
    to: '有了标注数据以后，可以进一步学习融合权重；在此之前，先从加权 RRF 这类可解释方案开始。',
    reason: '把优化方向按数据条件分阶段。',
  },
  {
    id: 'rerank-metrics-transition',
    from: '指标：重排前后 nDCG、MRR，看相关项是否排更靠前；重排延迟 P99。',
    to: '重排值不值得这段额外延迟，关键看重排前后的 nDCG 和 MRR，确认相关项有没有排得更靠前，同时盯住重排延迟 P99。',
    reason: '把效果和延迟组织成同一个取舍问题。',
  },
  {
    id: 'rerank-improvement-transition',
    from: '能提升什么：ColBERT 的延迟交互、ColPali 多模态重排(直接对文档图像)、重排模型选型、领域微调重排。',
    to: '重排层后续可以继续比较 ColBERT 的延迟交互、ColPali 这类直接处理文档图像的多模态重排，再根据领域数据做模型选型或微调。',
    reason: '把术语清单改成由通用能力走向领域适配的顺序。',
  },
  {
    id: 'agentic-metrics-transition',
    from: '指标：多跳任务成功率、拒答准确率、忠实度、收敛轮数分布、有记忆和无记忆的成功率差值(验证 Reflexion 价值)。',
    to: '这套闭环不能只看答案漂亮不漂亮，还要看多跳任务成功率、拒答准确率、忠实度和收敛轮数分布；再比较有记忆和无记忆的成功率差值，验证 Reflexion 到底有没有价值。',
    reason: '把指标改成验证闭环和记忆价值的完整问题。',
  },
  {
    id: 'agentic-improvement-transition',
    from: '能提升什么：Reflexion 的反思记忆跨轮学习(这是比单轮强的根本)、Self-RAG 微调、CRAG 的网络检索兜底、GraphRAG 做跨文档推理和全局总结、多智能体互评。',
    to: '轻量闭环跑稳以后，再逐步评估跨轮能力：用 Reflexion 的反思记忆从失败中学习，按需要尝试 Self-RAG 微调、CRAG 的网络检索兜底、GraphRAG 的跨文档推理和全局总结，以及多智能体互评。',
    reason: '把前沿能力放在轻量闭环稳定后的演进路径中。',
  },
  {
    id: 'generation-metrics-transition',
    from: '指标：引用准确率(引用是否真实存在且对应)、引用覆盖率、忠实度、幻觉率(人工标注)。',
    to: '生成环节最后看四个结果：引用是不是真实对应，覆盖是否完整，答案是否忠实，以及人工标注的幻觉率。',
    reason: '把抽象指标改成观众能直接理解的验收问题。',
  },
  {
    id: 'generation-improvement-transition',
    from: '能提升什么：结构化输出强制引用格式、支持性检查逐句校验、引用回溯到具体页码条文号、答案置信度标注。',
    to: '生成侧还可以继续加强四件事：用结构化输出约束引用格式，逐句做支持性检查，把引用回溯到具体页码和条文号，并给答案标注置信度。',
    reason: '把提升项改成连续、可执行的动作句。',
  },
  {
    id: 'evaluation-metrics-transition',
    from: '指标：前若干结果的召回率、忠实度、答案相关性、上下文精度/召回率、引用准确率、拒答准确率。',
    to: '整条评测链要持续追踪前若干结果的召回率、忠实度、答案相关性、上下文精度和召回率、引用准确率，以及拒答准确率。',
    reason: '用全链路追踪语境替代独立指标标签。',
  },
  {
    id: 'evaluation-improvement-transition',
    from: '能提升什么：RAGAS 四指标全量接入、大模型裁判偏差校准、问题样例自动归因、线上对照实验评测、持续集成式回归测试(每次改动跑全评测集不退化才上线)。',
    to: '评测体系成熟以后，可以进一步全量接入 RAGAS 四类指标，校准大模型裁判偏差，自动归因问题样例，再把线上对照实验和持续集成式回归测试接起来，做到每次改动都先验证不退化再上线。',
    reason: '把提升项组织成评测体系的成熟路径。',
  },
  {
    id: 'production-metrics-transition',
    from: '指标：可用性 SLA、延迟 P99、单次查询成本、缓存命中率、注入拦截率、增量索引正确性和版本切换稳定性。SLA 与缓存收益门槛要按业务目标和成本模型单独设定。',
    to: '到了线上，指标还要扩展到工程侧：可用性 SLA、延迟 P99、单次查询成本、缓存命中率、注入拦截率、增量索引正确性和版本切换稳定性。SLA 与缓存收益门槛，要按业务目标和成本模型单独设定。',
    reason: '用从效果到工程的章节收束替代指标标签。',
  },
  {
    id: 'production-improvement-transition',
    from: '能提升什么：多级缓存(查询结果缓存、向量化缓存)、异步增量索引、灰度发布、混沌测试注入攻击、成本告警。',
    to: '工程侧的下一步，包括多级缓存，也就是查询结果缓存和向量化缓存；还可以做异步增量索引、灰度发布、用混沌测试验证注入攻击防护，并补上成本告警。',
    reason: '把最后一组提升项改成自然的工程演进总结。',
  },
];

const spokenReadabilityReplacements = [
  {
    id: 'parsing-combination-spoken',
    from: '所以"用 MinerU"这个说法其实不准确，准确说是 MinerU 主解析 + 规则清洗 + 多模态 LLM 兜底的组合，MinerU 是主引擎不是全部。',
    to: '所以，只说“用 MinerU”并不准确。更准确的说法是：以 MinerU 为主解析，再配规则清洗和多模态 LLM 兜底。MinerU 是主引擎，但不是全部。',
    reason: '移除会被逐字朗读的 ASCII 引号和加号，并拆开过长结论。',
  },
  {
    id: 'parsing-metric-parenthetical',
    from: '看表格还原率、字段完整率(关键数字和专名丢没丢)、标题层级识别准确率。',
    to: '重点看三项：表格还原率；字段完整率，也就是关键数字和专名有没有丢失；以及标题层级识别准确率。',
    reason: '把书面括注改成有层次的三项口语验收。',
  },
  {
    id: 'context-pronoun-example-spoken',
    from: '比如一个文本块内容是"它的定价是每月 50 元"，脱离原文你不知道"它"是谁，向量化向量模糊，检索容易捞不到或捞错。',
    to: '比如，某个文本块只写“它的定价是每月 50 元”。脱离原文，你根本不知道这里的“它”指谁，生成的向量也会很模糊，检索时就容易捞不到，或者捞错。',
    reason: '把引号示例拆成短句，并修正“向量化向量模糊”的拗口表达。',
  },
  {
    id: 'hnsw-parameters-screen-only',
    from: 'HNSW 参数可以从 m=16、ef_construction=200 这类常见组合开始压测，ef_search 在查询阶段调节，通常需要在召回和延迟之间取舍。',
    to: 'HNSW 参数可以先从常见组合开始压测。构建阶段调整连接度和构建深度，查询阶段再调搜索深度，通常要在召回和延迟之间取舍。',
    reason: '精确代码参数移到屏幕注记，旁白保留调参阶段和取舍。',
  },
  {
    id: 'quantization-names-spoken',
    from: '用 PQ 或 SQ 量化压缩降低内存，以及多级索引、分片和 IVF 加 PQ 这类超大规模组合',
    to: '用乘积量化或标量量化降低内存，以及多级索引、分片和倒排文件索引配乘积量化这类超大规模组合',
    reason: '旁白使用算法含义，精确缩写留给屏幕。',
  },
  {
    id: 'bm25-parameters-screen-only',
    from: 'BM25 经典公式，参数 k1 是 1.2 到 2.0、b 是 0.75。',
    to: 'BM25 的参数可以先用论文里的常见默认值，再用自己的领域数据校准。',
    reason: '精确参数值移到屏幕注记，旁白保留使用原则。',
  },
  {
    id: 'retrieval-query-parentheticals',
    from: '检索这一层，先要认清纯向量检索会在两类查询上翻车——编号查询(比如"GB 50204 第 4.1.2 条"，向量把编号当普通文本匹配不准)和术语精确查询(需要字面命中)。',
    to: '检索这一层，先要认清纯向量检索会在两类查询上翻车。第一类是编号查询，比如“GB 50204 第 4.1.2 条”，向量容易把编号当普通文本，匹配不准。第二类是术语精确查询，它要求字面命中。',
    reason: '把两组括注展开成有停顿的第一类、第二类。',
  },
  {
    id: 'retrieval-route-parentheticals',
    from: '规范文档场景会加到四路：向量、全文、编号精确匹配(正则结构化)、表格检索(表格内容单独索引)，每路管一类查询。',
    to: '规范文档场景会加到四路：向量、全文、用正则做结构化的编号精确匹配，以及把表格内容单独建索引的表格检索。每一路负责一类查询。',
    reason: '把实现说明从括号中展开，并拆开四路结论。',
  },
  {
    id: 'agentic-paper-ids-screen-only',
    from: '这些智能体式方案，可以按反思时机来分。事前有 Adaptive RAG(检索前路由)；事后有 CRAG(arXiv：2401.15884)，检索后用评估器评估检索质量，正确状态用、模糊状态补网络检索、错误状态全转网络检索；事中有 Self-RAG(arXiv：2310.11511)，用四个反思词元(是否检索、是否相关、是否支持、是否有用)贯穿检索生成全程，但要微调；还有 Reflexion(arXiv：2303.11366)，把每轮失败反思存情景记忆跨轮累积，让智能体从失败中学习。',
    to: '这些智能体式方案，可以按反思时机来分。事前是自适应 RAG，负责检索前路由；事后是 CRAG，也就是纠错型 RAG，检索后用评估器判断检索质量，证据正确就直接用，证据模糊就补网络检索，证据错误就转向网络检索；事中是 Self-RAG，也就是自反思 RAG，用四个反思词元，也就是是否检索、是否相关、是否支持和是否有用，贯穿检索与生成全程，但它需要微调；还有 Reflexion，也就是反思记忆，把每轮失败的反思存进情景记忆，让智能体跨轮学习。',
    reason: '移除三个论文编号，把状态和反思词元展开为可朗读解释。',
  },
  {
    id: 'support-check-apposition',
    from: '支持性检查(答案是否被上下文支持)是防幻觉的核心',
    to: '支持性检查，也就是答案是否被上下文支持，是防幻觉的核心',
    reason: '把定义括注改成同位解释。',
  },
  {
    id: 'agent-loop-appositions',
    from: '拿到前若干条证据先评估够不够(综合证据数、相关度、引用支持率)，不够就改写查询二次检索，限制最大跳数，防止死循环(比如 3 跳)；',
    to: '拿到前若干条证据，先综合证据数、相关度和引用支持率，判断够不够。不够就改写查询，再检索一次；同时把最大跳数限制在三跳左右，防止死循环。',
    reason: '展开两组括注，并用短句明确评估、重试和终止条件。',
  },
  {
    id: 'citation-implementations-spoken',
    from: '引用三种实现——提示词级让 LLM 自己标来源编号(简单但会标错)、后处理校验(LLM 生成完用规则或小模型校验引用真实性)、片段级用支持引用的模型直接给答案片段对应哪个文本块(通常能给出更细的引用对应，Cohere 有这个能力)。',
    to: '引用有三种实现。第一种是在提示词里让 LLM 自己标来源编号，简单，但可能标错。第二种是后处理校验，生成完成后再用规则或小模型核对引用是否真实。第三种是片段级引用，让模型直接指出答案片段对应哪个文本块；这种方式通常能给出更细的引用对应，Cohere 提供了相关能力。',
    reason: '把长达一整句的三项括注清单改成第一、第二、第三的口语节奏。',
  },
  {
    id: 'evaluation-metrics-spoken',
    from: '评测工具里，RAGAS 是常用框架之一，四大指标——忠实度(忠实防幻觉)、答案相关性(切题)、上下文精度(检索精度)、上下文召回率(检索召回)；TruLens、DeepEval 类似；还有自建黄金问答集加调用链归因。',
    to: '评测工具里，RAGAS 是常用框架之一。它主要看四类指标：忠实度，判断答案是否忠于证据；答案相关性，看回答是否切题；上下文精度，看检索结果准不准；上下文召回率，看该找的证据有没有找全。TruLens 和 DeepEval 也有类似能力；除此之外，还可以用自建黄金问答集配合调用链归因。',
    reason: '把四个指标逐项解释，避免括号和破折号清单连读。',
  },
  {
    id: 'evaluation-growth-sentences',
    from: '评测体系成熟以后，可以进一步全量接入 RAGAS 四类指标，校准大模型裁判偏差，自动归因问题样例，再把线上对照实验和持续集成式回归测试接起来，做到每次改动都先验证不退化再上线。',
    to: '评测体系成熟以后，可以进一步全量接入 RAGAS 四类指标，再校准大模型裁判偏差，自动归因问题样例。下一步，把线上对照实验和持续集成式回归测试接起来，做到每次改动都先验证不退化，再上线。',
    reason: '拆开过长的评测演进句，给阶段切换留出停顿。',
  },
  {
    id: 'production-capabilities-sentences',
    from: '上线前，通常还要把这些工程能力补齐：提示词缓存降本、流式输出降延迟、去重防上下文碎片、防提示词注入防安全、增量索引控更新成本、版本管理控模型切换、监控告警保可用。',
    to: '上线前，通常还要把几组工程能力补齐。提示词缓存和流式输出，分别控制成本与首字延迟；内容去重和防提示词注入，负责上下文质量与安全；增量索引和版本管理，控制更新成本和模型切换；最后再用监控告警守住可用性。',
    reason: '把七项压缩清单改成四组工程职责。',
  },
  {
    id: 'monitoring-parenthetical',
    from: '全链路配监控(延迟、成本、错误率、缓存命中率)。',
    to: '全链路监控延迟、成本、错误率和缓存命中率。',
    reason: '把监控项从括号中展开。',
  },
  {
    id: 'closing-chain-spoken',
    from: '第一，RAG 全链路是数据流——离线建库(解析、分块、上下文增强、向量化索引)决定上限，在线检索(查询理解、多路混合、RRF、重排)决定召回，智能体式决策(评估、改写重试、拒答)决定可信，评测闭环决定能持续迭代。',
    to: '第一，RAG 全链路是一条数据流。离线建库，包括解析、分块、上下文增强和向量化索引，决定系统上限；在线检索，包括查询理解、多路混合、RRF 和重排，决定召回效果；智能体式决策，通过评估、改写重试和拒答，决定回答是否可信；最后，评测闭环决定这套系统能不能持续迭代。',
    reason: '把总结中的三组括注展开成四个有停顿的因果分句。',
  },
  {
    id: 'closing-improvement-spoken',
    from: '第三，每步都有指标和提升空间，从上下文检索公开实验里的检索失败率下降，到 Reflexion 记忆让智能体从失败中学习，再到 RAGAS 四类指标量化质量，RAG 是个工程系统不是提示词技巧，讲究的是每环可控可测可迭代。',
    to: '第三，每一步都有指标，也都有继续提升的空间。上下文检索要看失败率有没有下降；Reflexion 记忆要看智能体能不能从失败中学习；RAGAS 则用四类指标量化质量。归根结底，RAG 是一套工程系统，不是单纯的提示词技巧，讲究的是每一环都可控、可测、可迭代。',
    reason: '拆开全片最后一个超长句，用三个并列验证问题收束。',
  },
  {
    id: 'postgres-index-identifiers-screen-only',
    from: '以 pgvector 为例，一般同时建 HNSW 向量索引和 tsvector 全文索引，为在线多路检索铺路，一个库管两种索引，不用再引一个 ES。',
    to: '以 pgvector 为例，一般同时建 HNSW 向量索引和 PostgreSQL 全文索引，为在线多路检索铺路。一个库管理两种索引，不用再单独引入 Elasticsearch。',
    reason: '把数据库内部标识移到屏幕，旁白使用产品和能力名称。',
  },
  {
    id: 'retrieval-route-identifiers-screen-only',
    from: '真正跑在线链路时，我一般至少从混合检索起步——向量路 pgvector、关键词路 tsvector BM25，两路并行各出前五十条。',
    to: '真正跑在线链路时，我一般至少从混合检索起步。向量路使用 pgvector，关键词路使用 PostgreSQL 全文检索，两路并行，各取前五十条候选。',
    reason: '把内部索引标识改成可听懂的检索能力，并拆开长句。',
  },
  {
    id: 'ensemble-retriever-screen-only',
    from: 'LangChain 的 EnsembleRetriever 提供了混合检索加 RRF 的现成组合，可以减少重复实现。',
    to: 'LangChain 已经提供混合检索加 RRF 的现成组合，可以减少重复实现。',
    reason: '类名留作屏幕技术注记，旁白只讲框架能力。',
  },
  {
    id: 'reranker-version-screen-only',
    from: '如果采用交叉编码器，可以先把 bge-reranker-v2-m3 作为开源候选；',
    to: '如果采用交叉编码器，可以先评估 BGE 系列的开源重排模型；',
    reason: '完整模型版本号留作屏幕候选，旁白保留模型家族。',
  },
  {
    id: 'compression-retriever-screen-only',
    from: 'LangChain 的 ContextualCompressionRetriever 可以接入重排模型。',
    to: 'LangChain 也可以接入重排模型。',
    reason: '类名留作屏幕技术注记，旁白保留接入能力。',
  },
  {
    id: 'adaptive-rag-first-mention',
    from: '另一块是查询路由：Adaptive RAG 的思路，',
    to: '另一块是查询路由：Adaptive RAG，也就是自适应 RAG 的思路，',
    reason: '官方名只在首次出现时保留，并立即给出中文含义。',
  },
  {
    id: 'adaptive-route-chinese-reference',
    from: '所以一般先做 Adaptive 路由判断，',
    to: '所以一般先做自适应路由判断，',
    reason: '首次解释后使用中文回指。',
  },
  {
    id: 'adaptive-rag-chinese-reference',
    from: '可以继续评估 Adaptive RAG 的事前路由，',
    to: '可以继续评估自适应 RAG 的事前路由，',
    reason: '避免重复朗读英文方案名。',
  },
  {
    id: 'reranker-candidate-list-screen-only',
    from: '候选可以包括 bge-reranker-v2-m3、Cohere 和 Voyage 的重排服务。',
    to: '开源可以看 BGE 系列重排模型，商业服务可以评估 Cohere 和 Voyage。',
    reason: '完整开源模型版本号留在屏幕，旁白按开源与商业分组。',
  },
  {
    id: 'self-rag-chinese-reference',
    from: 'Self-RAG 原版需要微调，实施门槛较高，多数团队不会直接照搬完整方案。生产务实做法是用大模型裁判模拟反思——用提示词让 LLM 输出结构化判断，代替微调的反思词元。思想是 Self-RAG 的，实现是轻量的。',
    to: '自反思 RAG 原版需要微调，实施门槛较高，多数团队不会直接照搬完整方案。生产务实做法是用大模型裁判模拟反思——用提示词让 LLM 输出结构化判断，代替微调的反思词元。思想来自自反思方案，实现则是轻量的。',
    reason: '官方名首次解释后改用中文回指。',
  },
  {
    id: 'reflexion-metric-chinese-reference',
    from: '验证 Reflexion 到底有没有价值。',
    to: '验证反思记忆到底有没有价值。',
    reason: '指标段使用已解释的中文概念。',
  },
  {
    id: 'agentic-improvement-chinese-references',
    from: '轻量闭环跑稳以后，再逐步评估跨轮能力：用 Reflexion 的反思记忆从失败中学习，按需要尝试 Self-RAG 微调、CRAG 的网络检索兜底、GraphRAG 的跨文档推理和全局总结，以及多智能体互评。',
    to: '轻量闭环跑稳以后，再逐步评估跨轮能力：用反思记忆从失败中学习，按需要尝试自反思 RAG 微调、纠错型 RAG 的网络检索兜底、图谱 RAG 的跨文档推理和全局总结，以及多智能体互评。',
    reason: '提升清单使用中文概念，官方名保留在首次介绍和屏幕来源层。',
  },
  {
    id: 'closing-reflexion-chinese-reference',
    from: 'Reflexion 记忆要看智能体能不能从失败中学习；',
    to: '反思记忆要看智能体能不能从失败中学习；',
    reason: '结尾总结使用中文概念，避免再次插入英文名。',
  },
];

const screenOnlyTechnicalNotes = [
  {id: 'adaptive-rag-paper', screenText: 'Adaptive-RAG · arXiv:2403.14403', placement: 'query-understanding source footer'},
  {id: 'crag-paper', screenText: 'CRAG · arXiv:2401.15884', placement: 'agentic-RAG source footer'},
  {id: 'self-rag-paper', screenText: 'Self-RAG · arXiv:2310.11511', placement: 'agentic-RAG source footer'},
  {id: 'reflexion-paper', screenText: 'Reflexion · arXiv:2303.11366', placement: 'agentic-RAG source footer'},
  {id: 'bm25-defaults', screenText: 'BM25 · k1=1.2-2.0 · b=0.75', placement: 'retrieval parameter note'},
  {id: 'hnsw-probe-defaults', screenText: 'HNSW · m=16 · ef_construction=200 · tune ef_search', placement: 'vector-index parameter note'},
  {id: 'quantization-abbreviations', screenText: 'PQ / SQ · IVF+PQ', placement: 'vector-index optimization note'},
  {id: 'postgres-full-text', screenText: 'PostgreSQL · tsvector', placement: 'online retrieval implementation note'},
  {id: 'langchain-ensemble', screenText: 'LangChain · EnsembleRetriever', placement: 'rank-fusion implementation note'},
  {id: 'bge-reranker-candidate', screenText: 'bge-reranker-v2-m3', placement: 'reranker candidate note'},
  {id: 'langchain-compression', screenText: 'LangChain · ContextualCompressionRetriever', placement: 'reranker integration note'},
].map((item) => ({...item, provenance: 'user-provided source narration; screen-only, never voiceover'}));

let text = (await readFile(args.input, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const sourceText = text;
const applied = [];
const spokenTerms = [];
const oralTransitions = [];
const spokenReadabilityEdits = [];

for (const replacement of replacements) {
  const occurrences = countOccurrences(text, replacement.from);
  if (occurrences !== 1) {
    console.error(`Replacement ${replacement.id} expected exactly one match, found ${occurrences}.`);
    process.exit(1);
  }
  const index = text.indexOf(replacement.from);
  applied.push({
    ...replacement,
    sourceLine: text.slice(0, index).split('\n').length,
  });
  text = text.replace(replacement.from, replacement.to);
}

for (const replacement of spokenTermReplacements) {
  const matches = [...text.matchAll(replacement.pattern)];
  if (!matches.length) continue;
  spokenTerms.push({
    id: replacement.id,
    screenTerm: replacement.screenTerm,
    spokenAs: replacement.replacement,
    occurrences: matches.length,
  });
  text = text.replace(replacement.pattern, replacement.replacement);
}

text = text
  .replace(/既讲 A 又讲 B/g, '既讲主题一又讲主题二')
  .replace(/A\/B/g, '对照实验')
  .replace(/限 N 跳防死循环/g, '限制最大跳数，防止死循环')
  .replace(/RRF 公式是 分数 等于每路 1 除以 k 加 rank 的求和,k 取 60/g, 'RRF 的计算方式是：每一路用 1 除以常数加名次，再把各路结果求和；这个常数常取 60')
  .replace(/k=60/g, '常数取 60')
  .replace(/有 记忆 vs 无 记忆/g, '有记忆和无记忆')
  .replace(/if while/g, '条件判断和循环')
  .replace(/judge 交叉/g, '裁判做交叉评估')
  .replace(/\[n\]/g, '来源编号')
  .replace(/向量化 模型/g, '向量模型')
  .replace(/向量模型版本字段 字段/g, '向量模型版本字段')
  .replace(/多查询扩展\s*扩展/g, '多查询扩展')
  .replace(/支持性检查\s*检查/g, '支持性检查')
  .replace(/来源编号\s*来源编号/g, '来源编号')
  .replace(/最准但/g, '精度潜力较高，但')
  .replace(/生产主流是 RRF/g, 'RRF 是常见默认方案')
  .replace(/RAGAS 是事实标准/g, 'RAGAS 是常用评测框架之一')
  .replace(/流式输出用户体验必需/g, '流式输出通常是改善用户体验的重要手段')
  .replace(/(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])/g, '');

text = text
  .replace(/--/g, '——')
  .replace(/,/g, '，')
  .replace(/;/g, '；')
  .replace(/\?/g, '？')
  .replace(/:/g, '：')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

for (const replacement of oralTransitionReplacements) {
  const occurrences = countOccurrences(text, replacement.from);
  if (occurrences !== 1) {
    console.error(`Oral transition ${replacement.id} expected exactly one match, found ${occurrences}.`);
    process.exit(1);
  }
  const index = text.indexOf(replacement.from);
  oralTransitions.push({
    ...replacement,
    sourceLine: text.slice(0, index).split('\n').length,
  });
  text = text.replace(replacement.from, replacement.to);
}

for (const replacement of spokenReadabilityReplacements) {
  const occurrences = countOccurrences(text, replacement.from);
  if (occurrences !== 1) {
    console.error(`Spoken readability ${replacement.id} expected exactly one match, found ${occurrences}.`);
    process.exit(1);
  }
  const index = text.indexOf(replacement.from);
  spokenReadabilityEdits.push({
    ...replacement,
    sourceLine: text.slice(0, index).split('\n').length,
  });
  text = text.replace(replacement.from, replacement.to);
}

const report = {
  schemaVersion: 'autovideo-narration-editorial-review/v1',
  status: 'draft-awaiting-user-confirmation',
  input: args.input.replace(/\\/g, '/'),
  output: args.output.replace(/\\/g, '/'),
  sourceSha256: sha256(sourceText),
  outputSha256: sha256(`${text}\n`),
  sourceHanCount: (sourceText.match(/[\u3400-\u9fff]/g) ?? []).length,
  outputHanCount: (text.match(/[\u3400-\u9fff]/g) ?? []).length,
  paragraphCount: text.split(/\n\s*\n/).length,
  semanticEditCount: applied.length,
  edits: applied,
  oralTransitionEditCount: oralTransitions.length,
  oralTransitions,
  spokenReadabilityEditCount: spokenReadabilityEdits.length,
  spokenReadabilityEdits,
  screenOnlyTechnicalNotes,
  spokenTermReplacementCount: spokenTerms.length,
  spokenTerms,
  mechanicalEdits: [
    'ASCII commas and semicolons converted to Chinese punctuation',
    'Question marks converted to Chinese punctuation',
    'Double hyphens converted to Chinese em dashes',
    'Colons converted to Chinese punctuation for TTS pauses',
  ],
};

await mkdir(path.dirname(args.output), { recursive: true });
await mkdir(path.dirname(args.report), { recursive: true });
await writeFile(args.output, `${text}\n`, 'utf8');
await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  output: report.output,
  report: path.resolve(args.report),
  outputSha256: report.outputSha256,
  sourceHanCount: report.sourceHanCount,
  outputHanCount: report.outputHanCount,
  paragraphCount: report.paragraphCount,
  semanticEditCount: report.semanticEditCount,
}, null, 2));
