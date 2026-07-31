# RAG 全链路口播:选型、生产实践与提升

> **这是什么**:面向面试官,把 RAG 从一份文档到一个答案的**全链路**讲清楚。主线是数据流:文档 → 解析 → 分块 → 上下文增强 → 向量化+索引 → 查询理解 → 多路检索 → 融合 → 重排 → Agentic 决策 → 生成引用 → 评测,生产工程贯穿。
>
> **每步固定讲五件事**:
> 1. **常用选型**:这一步有哪些主流方案/组件
> 2. **生产怎么选、为什么**:我的选择和理由
> 3. **实际怎么用**:是不是混合用、怎么组合(关键--生产很少单一选型,多是分层/组合)
> 4. **看什么指标**:这步的质量怎么量化
> 5. **能提升什么**:前沿方向/优化空间
>
> **风格**:围绕主线娓娓道来,顺着数据流自然展开,项目经历作为"生产上我怎么用的"穿插举例,不是主体。
>
> **三色**:🟢论文/官方/业界共识 🟡我的生产选择或如果是我 🔴推断待核实。

---

## 0. 开场:主线与讲法

我按数据流把 RAG 全链路讲一遍。整个链路分两段:离线建库把文档变成可检索的库,在线检索把 query 变成答案,中间 Agentic 决策是分水岭。我顺着数据流一步步讲,每步说清楚有哪些选型、生产上一般怎么选为什么、实际是不是混合用怎么用、看什么指标、还有什么能提升的。这样讲是因为我觉得 RAG 每一步都不是非此即彼的单选,实际生产多是组合用,而且每步都有指标和提升空间,讲清楚这些才能体现是真的做过而不是只会调 API。

---

## 1. 文档解析(ingest 入口)

链路第一站是文档解析。原始文档是 PDF、Word、HTML、Confluence,格式杂、有表格图片扫描件。这一步的目标是把异构文档变成结构化文本加元数据,质量直接决定后面所有环节的上限,garbage in garbage out。

**常用选型**有这么几类。一类是通用解析库,PyMuPDF、pdfplumber,快但只能拿纯文本,丢结构;一类是结构化解析框架,Unstructured 支持 50 多种格式能区分标题正文表格,MinerU 对复杂中文文档和表格还原强,Docling 是 IBM 2024 年新出的对公式表格还原好;一类是商业服务,LlamaParse 对复杂 PDF 强但要花钱;还有多模态 LLM 直接看图解析,扫描件和图表最强但最贵。

**生产怎么选、为什么**,核心看文档复杂度。简单纯文本 PyMuPDF 就够,快又便宜;复杂文档--表格多、层级深、有规范编号--必须上结构化解析,因为后面要按结构分块、要表格检索,丢了结构这些全做不了。我自己的判断是,中文复杂文档场景 MinerU 优先,通用多格式场景 Unstructured 优先。

**实际怎么用,这里要发散一下**--生产上几乎不会单一用一个解析器,而是**分层组合**。主解析用 MinerU 或 Unstructured 跑全量,拿到标题树、表格、阅读顺序;然后过一层规则清洗,去页眉页脚、修乱码、补页码缺失;碰到扫描件、复杂图表、公式这种主解析搞不定的,再触发多模态 LLM 二次解析,贵但准,只对难解析的页面用,控成本。表格要单独整块保留,别被切碎。所以"用 MinerU"这个说法其实不准确,准确说是 MinerU 主解析 + 规则清洗 + 多模态 LLM 兜底的组合,MinerU 是主引擎不是全部。

**指标**:解析这步自动化指标不多,主要靠抽检。建几十篇评测集人工标正确解析,看表格还原率、字段完整率(关键数字和专名丢没丢)、标题层级识别准确率。

**能提升什么**:多模态 LLM 解析越来越强,前沿的 ColPali 思路甚至跳过 OCR,直接对文档页面图像做检索;Docling 这类新框架在公式表格上还在进步;解析后的结构校验可以用规则加小模型自动做,减少人工抽检。

---

## 2. 分块(chunking)

解析完拿到结构化文本,要切成 chunk。为什么切?两个原因:LLM context 有上限,塞太多又贵又 lost in the middle;整篇文档一起 embed 语义被稀释,一篇既讲 A 又讲 B,向量化出来两个都不像。切成小片段,每片语义聚焦,检索精度高。

**常用选型**有五种。固定长度切,简单但会切断句子;递归字符切分,按段落、行、空格优先级递归切,LangChain 的 RecursiveCharacterTextSplitter 是这个,通用兜底首选;语义切分,用 embedding 算相邻句子相似度,骤降处切,最准但要逐句 embed 慢且贵;markdown 标题切分,按标题层级切带祖先路径,LlamaIndex 的 MarkdownNodeParser,结构化文档最佳;还有 Jina 2024 年的 Late Chunking,先整篇用长上下文 embed 模型整体 embed,再按 chunk 边界对 token 向量做 pooling,让每个 chunk 吸收整篇上下文。

**生产怎么选、为什么**,核心看文档结构。结构化文档--技术文档、wiki、规范--按标题或条款切,天然有语义边界;通用纯文本用递归字符切;对召回质量要求高且文档量不大的场景才上语义切分。通用参数甜点是 512 token 加 10% overlap,这个是业界共识。

**实际怎么用,又是组合**。生产上一般**按文档类型分策略**,不是全局一个切法。比如同一个库里,施工规范按条款条文切,工艺手册按步骤切,表格整块保留带表头上下文,普通说明文字用递归切。而且切完每个 chunk 必须绑元数据--来源、章节、页码、条文号、版本,这些后面条件过滤、引用展示、索引重建全要用。还有一个容易忽略的点,LlamaIndex 生产指南强调的**检索块和合成块要解耦**:检索用小 chunk 精度高,合成喂 LLM 时取该 chunk 前后窗口或整篇,上下文完整。Naive RAG 把这俩当同一个是错的。

**指标**:chunk 内聚度(同 chunk 内句子 embedding 平均相似度)、边界切断率(抽检有没有切断关键句表格)、下游 Recall 间接反映。

**能提升什么**:Late Chunking 让 chunk 带整篇上下文,但要长上下文 embed 模型;下一节讲的 Contextual Retrieval 是另一个增强方向;动态分块根据内容密度自适应也是趋势。

---

## 3. 上下文增强(Contextual Retrieval)

分块后、向量化前,其实可以插一步上下文增强。这一步很多人跳过,但我认为它是目前最大单项提升,值得单独讲。

**问题在哪**:一个 chunk 脱离原文后语义自足性差。比如一个 chunk 内容是"它的定价是每月 50 元",脱离原文你不知道"它"是谁,embedding 向量模糊,检索容易捞不到或捞错。

**常用选型**目前就两个方向。一个是 Anthropic 2024 年 9 月的 Contextual Retrieval,用 LLM 给每个 chunk 生成 50 到 100 token 的上下文前缀,说明它在整篇里的位置主题,拼到 chunk 前再 embed;一个是前面讲的 Late Chunking,从 embedding 层面让 chunk 带整篇上下文。

**生产怎么选、为什么**:Contextual Retrieval 效果最硬,Anthropic 官方实测检索失败率从 5.7% 降到 1.9%,降 67%,不需要训练模型。但**有个大坑必须说**,不加 prompt caching 会贵死,因为给每个 chunk 生成上下文都要把整篇文档塞 prompt,一个文档 N 个 chunk 就塞 N 次。配 prompt caching 把整篇标记成缓存前缀,100 万文档 token 才 1.02 美元,可接受。框架没有现成的,Anthropic 给了思路,得自己实现。

**实际怎么用**:这一步是可选增强,不是所有项目都上。我的判断是,如果 chunk 切得比较小、或者文档语义关联强、或者召回质量不达标,就值得上 Contextual Retrieval;文档本身语义自足、量又大,可以先不上控成本。上了之后,embedding 和 BM25 两路都要用增强后的文本,才有叠加效果。可以和 Late Chunking 二选一或组合,看 embed 模型支不支持长上下文。

**指标**:检索失败率对比(base vs contextual)、A/B 看下游答案正确率、context precision。

**能提升什么**:Contextual Retrieval 加 Late Chunking 组合、用更强模型生成上下文前缀、上下文生成的 prompt 优化。

---

## 4. 向量化(embedding)

chunk 准备好,接下来向量化。embedding 模型把文本变定长向量,向量相似度约等于语义相似度,这是检索精度的地基。

**常用选型**:中文开源主要是智源的 BGE 系列,bge-large-zh-v1.5 是 1024 维中文强,bge-m3 更新,自带 dense 加 sparse 加 ColBERT 三种模式,还支持 8K 上下文;商业的有 OpenAI text-embedding-3-large(3072 维,支持 Matryoshka 可截断降维)、Voyage-3(Anthropic 推荐)、Cohere embed-v3(区分 query 和 doc 的 input_type);jina-embeddings-v2/v3 支持 8K 上下文,是 Late Chunking 的基础。

**生产怎么选、为什么**,三个考量。一是中文效果,中文场景 BGE 系列开源里最强;二是部署,企业知识不能出域的就选 BGE 本地部署,不差钱不在乎数据出境用 OpenAI 或 Voyage 效果更好;三是维度,3072 维存检索都贵,Matryoshka 降到 1024 通常够用。我的默认选择是中文企业场景 BGE,要 ColBERT 能力上 bge-m3。

**实际怎么用**:有几个坑要注意。第一,query 和 doc 用同一个模型;Cohere 那种区分 input_type 的,query 传 query、doc 传 search_document,搞反精度大跌。第二,换模型等于全库重新 embed,要做版本管理,带 embedding_version 字段灰度切换。第三,MTEB 榜单只是参考,**通用榜单不代表你领域好**,真正要看的自建领域评测集的 recall@k。

**指标**:MTEB 榜单(参考)、领域评测集 recall@k(关键)、embedding 计算吞吐。

**能提升什么**:bge-m3 的多模态能力、Matryoshka 降维省存储、对 embedding 做领域微调(有标注数据时)、指令化 embedding(instruction-tuned)。

---

## 5. 向量库与索引

向量存哪、怎么检索,这是向量库和索引的事。

**常用选型**:pgvector 是 PostgreSQL 扩展,中小规模加要 SQL 加要事务的首选;Milvus 是分布式大规模亿级首选;Weaviate 内置 hybrid(BM25 加向量)一站式;Qdrant 是 Rust 写的轻量高性能;Chroma 适合原型;Elasticsearch 既能全文又能向量,适合已有 ES 技术栈。索引算法主要是 HNSW(多层图,快且准,生产首选)、IVF(聚类,大规模内存友好)、Flat(暴力,小数据精确)。

**生产怎么选、为什么**,核心看三件事:规模、是否要事务和 join、运维成本。我的判断是,中小规模(千万级以内)且已有 PostgreSQL 的,选 pgvector 不选 Milvus,理由很实在--后端团队熟悉 SQL,能 `WHERE metadata 过滤 ORDER BY 向量相似度 LIMIT k`,先过滤再排序跟数据库执行计划一个道理,还能跟业务表 join、走事务、运维省一个中间件,预估超千万级片段再迁 Milvus。要内置 hybrid 省事用 Weaviate。大规模亿级才上 Milvus。

**实际怎么用**:pgvector 上一般同时建 HNSW 向量索引和 tsvector 全文索引,为在线多路检索铺路,一个库管两种索引,不用再引一个 ES。HNSW 参数 m=16、ef_construction=200 是通用值,ef_search 查询时调,50 到 100,大一点准但慢。还要配 metadata 打标,检索时预过滤缩小候选集。pgvector 的 HNSW 删除是标记删除,定期要重建索引回收空间。万物云 agent 的长期记忆也用 pgvector,就是看中同库事务这点。

**指标**:ANN 召回率(跟 Flat 暴力搜对比,应 95% 以上)、QPS、延迟 P99、内存占用。

**能提升什么**:HNSW 参数调优、量化压缩(PQ/SQ 降内存)、多级索引、分片、IVF 加 PQ 组合用于超大规模。

---

## 6. 查询理解(改写与路由)

离线建库讲完,进入在线,从 query 开始。query 进来先别急着检索,先做查询理解--判断这个 query 怎么处理。

**常用选型**分两块。一块是 query 改写:Multi-query 扩展,让 LLM 把一个 query 改成多个不同角度;HyDE,先让 LLM 生成假设答案文档再用它检索;Step-back,把具体问题抽象成更高层问题;Decomposition,把复合问题拆成子问题。另一块是 query 路由:Adaptive RAG 的思路,事前判断 query 复杂度路由到不检索、单次检索、多跳检索。

**生产怎么选、为什么**:关键判断是**不是所有 query 都要改写**。简单事实查询直接检索就好,改写反而引入噪声、增加延迟和成本。所以一般先做 Adaptive 路由判断,简单的直接走,复杂的才改写或多跳。改写策略里,Multi-query 最通用;HyDE 对概念性方法性查询有效,但对事实查询有害--LLM 假设错会把检索带偏,这个坑要注意。

**实际怎么用**:生产上是**路由判断 + 按需改写**的组合。先用分类器或 LLM-as-router 判断 query 类型,决定走哪条路:简单的不检索或单次检索,复杂的触发改写和多跳。改写也不是无脑全上四种,根据 query 特点选--模糊的用 Multi-query 扩展,概念性的用 HyDE,复合的用 Decomposition。多轮对话场景还要结合会话上下文做指代消解和条件补全,这个用 Redis 管会话。

**指标**:改写后 recall@k 提升、路由准确率(confusion matrix)、改写质量人工评。

**能提升什么**:Adaptive RAG 的事前路由(arXiv:2403.14403)、query 改写模型微调、基于历史日志学习改写策略。

---

## 7. 多路检索(混合检索)

query 理解完,正式检索。这一步是召回的主力。

**常用选型**:纯向量检索,懂语义但关键词匹配弱;纯 BM25,精确关键词但不懂语义;hybrid,BM25 加向量两路互补;更激进的多路,向量加全文加编号精确加表格,各管一类。BM25 经典公式,参数 k1 是 1.2 到 2.0、b 是 0.75。

**生产怎么选、为什么**:核心认知是**纯向量检索在两类查询上翻车**--编号查询(比如"GB 50204 第 4.1.2 条",向量把编号当普通文本匹配不准)和术语精确查询(需要字面命中)。所以生产上几乎都上 hybrid,补 BM25 关键词路。如果场景里编号、术语、表格多,就上多路,把编号精确匹配和表格检索也单独建索引。

**实际怎么用,又是组合**:我一般至少 hybrid 起步--向量路 pgvector、关键词路 tsvector BM25,两路并行各出 top-50。规范文档场景会加到四路:向量、全文、编号精确匹配(正则结构化)、表格检索(表格内容单独索引),每路管一类 query。BM25 中文要分词,用 jieba。具体几路看场景,路越多越准但越慢,要权衡。中建那个项目就是四路混合,这是 Recall 提升的关键之一。

**指标**:recall@k、hit rate@k,跟单路对比看提升。

**能提升什么**:多路扩展(加更多专用索引)、各路 top_k 调优、元数据预过滤缩小候选集。

---

## 8. 融合(RRF)

多路检索拿到的是多份候选,各路分数尺度不一样--向量相似度 0 到 1,全文是 BM25 分,编号是 0 或 1,不能直接加,要融合。

**常用选型**:RRF(Reciprocal Rank Fusion),只用排名不用分数;加权分数融合,各路加权求和但要先归一化;凸组合。生产主流是 RRF。

**生产怎么选、为什么**:RRF 公式是 score 等于每路 1 除以 k 加 rank 的求和,k 取 60。为什么用排名不用分数?因为各路尺度不同不可比,直接加权没意义;RRF 只用排名,尺度无关,简单鲁棒,像多评委投票不比绝对分比平均名次。k=60 是论文经验值,基本不用调。LangChain 的 EnsembleRetriever 直接给了 hybrid 加 RRF,不用手搓。

**实际怎么用**:RRF 是默认选择。但如果某一路明显比其他路准,比如编号精确匹配几乎不会错,可以用加权 RRF 给它更高权重。一般场景标准 RRF 就够。

**指标**:融合后 nDCG、跟单路对比、双路重叠率(太低没互补价值,太高冗余)。

**能提升什么**:加权 RRF、学习融合权重(有标注数据时)。

---

## 9. 重排(rerank)

融合完拿到 top-50 候选,还混着噪声,上重排精排到真正最相关的 top-K。

**常用选型**:cross-encoder,把 query 和 doc 拼成序列过 transformer 全注意力交互,精度最高,主流是 bge-reranker-v2-m3、Cohere rerank、Voyage rerank;ColBERT 是 late interaction,query 和 doc 分别编码成 token 级向量,打分时 query 每个 token 跟 doc 所有 token 做 max-cosine 再求和,精度速度折中,bge-m3 自带;bi-encoder 就是 dense 检索本身,不算独立 rerank。

**生产怎么选、为什么**:关键要分清 cross-encoder 和双塔的区别。向量召回是双塔,query 和 doc 各自编码再算相似度,快但粗,适合从大量 chunk 里粗筛;rerank 是 cross-encoder,query 和 doc 拼一起过模型,精度高但慢,只能精排几十条。所以架构是**先双塔粗召 top-50,再 cross-encoder 精排 top-5 或 top-20**,不是直接用 rerank 召回。Anthropic 流程是 hybrid 出 top-150、rerank 到 top-20,top-20 是喂 LLM 的最优数量。

**实际怎么用**:cross-encoder 是主流,bge-reranker-v2-m3 开源够用。如果追求速度精度折中可以上 ColBERT,bge-m3 一个模型自带 dense、sparse、ColBERT 三路。rerank 候选数别太多,top-50 到 top-150,再多 rerank 成本不值。LangChain 的 ContextualCompressionRetriever 能接 rerank 模型。

**指标**:rerank 前后 nDCG@k、MRR,看相关项是否排更靠前;rerank 延迟 P99。

**能提升什么**:ColBERT 的 late interaction、ColPali 多模态 rerank(直接对文档图像)、rerank 模型选型、领域微调 rerank。

---

## 10. Agentic 决策(反思闭环)

检索拿到 top-K 证据,到这里是分水岭。普通 RAG 是直线--检索完直接生成,不管证据够不够都硬答。Agentic RAG 是状态机,拿到证据先评估,不够就改写重检,够了才生成,实在不够就拒答。这一步我多讲点,因为这是 Agentic 之所以叫 Agentic 的核心。

**常用选型**,按反思时机分。事前有 Adaptive RAG(检索前路由);事后有 CRAG(arXiv:2401.15884),检索后用 evaluator 评估检索质量,correct 用、ambiguous 补 web、incorrect 全转 web;事中有 Self-RAG(arXiv:2310.11511),用四个 reflection token(Retrieve、IsRel、IsSup、IsUse)贯穿检索生成全程,但要微调;还有 Reflexion(arXiv:2303.11366),把每轮失败反思存 episodic memory 跨轮累积,让 agent 从失败中学习。

**生产怎么选、为什么**:关键判断是**Self-RAG 原版要微调,门槛极高,99% 团队不做**。生产务实做法是用 LLM-as-judge 模拟反思--用 prompt 让 LLM 输出结构化判断,代替微调的 reflection token。思想是 Self-RAG 的,实现是轻量的。四个反思时机里,IsSup(答案是否被 context 支持)是防幻觉的核心,即使不做其他三个,IsSup 也强烈建议做。

**实际怎么用,组合**:生产 Agentic 一般是**证据充分性评估 + 改写重试 + 拒答**的轻量闭环,不微调。拿到 top-K 证据先评估够不够(综合证据数、相关度、引用支持率),不够就改写 query 二次检索,限 N 跳防死循环(比如 3 跳);够了才生成,实在不够就拒答不硬编。整个决策循环我用 LangGraph 的图状态机实现,不是手搓 if while,LangGraph 天生适合带条件分支和循环的决策流。坑是 LLM 自评有 bias 偏好自己答案,关键场景要换更强模型当 judge 交叉。中建项目就是这个轻量闭环,引用支持率做到 92%。

**指标**:多跳任务成功率、拒答准确率、faithfulness、收敛轮数分布、有 memory vs 无 memory 的成功率差值(验证 Reflexion 价值)。

**能提升什么**:Reflexion 的 reflection memory 跨轮学习(这是比单轮强的根本)、Self-RAG 微调、CRAG 的 web 兜底、GraphRAG 做跨文档推理和全局总结、多 agent 互评。

---

## 11. 生成与引用

证据够了,生成最终答案。

**常用选型**:生成上就是 prompt 工程,要求只基于资料答、资料没有就说不知道、温度调低 0 到 0.3 减发散。引用三种实现--prompt 级让 LLM 自己标 [n](简单但会标错)、后处理校验(LLM 生成完用规则或小模型校验引用真实性)、span 级用支持 citation 的模型直接给答案片段对应哪个 chunk(最精确,Cohere 有这个能力)。

**生产怎么选、为什么**:防幻觉是命门,要四道防线--IsSup 检查、温度调低、明确说不知道、引用校验。LLM 会合理化编造,即使 context 没有也可能编一个看似合理的,IsSup 加引用校验是兜底。引用我建议 prompt 级加后处理校验,别光信 LLM 标的号。

**实际怎么用**:prompt 模板要求每个事实陈述后标 [n] 来源编号,生成完用后处理校验每个 [n] 是不是真存在于 context 且内容对应。多候选场景可以生成多个答案用 IsUse 选最优,但成本翻倍,只对低置信答案做。答案要返回来源文档、章节、页码、引用片段,这是 RAG 相比纯 LLM 的可信度优势。

**指标**:citation 准确率(引用是否真实存在且对应)、citation 覆盖率、faithfulness、幻觉率(人工标注)。

**能提升什么**:structured output 强制引用格式、IsSup 逐句校验、引用回溯到具体页码条文号、答案置信度标注。

---

## 12. 评测

不评测的 RAG 就是瞎调,每改一环都要有指标量化。评测贯穿全链路。

**常用选型**:RAGAS 是事实标准,四大指标--faithfulness(忠实防幻觉)、answer relevancy(切题)、context precision(检索精度)、context recall(检索召回);TruLens、DeepEval 类似;还有自建 golden QA 加 trace 归因。检索独立指标有 recall@k、MRR、nDCG、hit rate。

**生产怎么选、为什么**:RAGAS 用 LLM-as-judge 有 bias--偏好长答案、偏好自己风格,要换不同强模型当裁判交叉、多次评判取平均、关键场景加人工校准。我的判断是,贴合具体场景的 golden QA 加 trace 归因比通用 RAGAS 更实用,因为能定位到具体环节。评测集三种来源混合:LLM 从文档生成 query 做量、人工标注做质、生产真实 query 采样做校准。

**实际怎么用**:建 200 条左右 golden QA,核心指标三个--Recall@5 看检索、引用支持率看生成可信、拒答准确率看兜底。线上每次问答落 trace,记录 query、改写、召回片段、排序分数、引用、Prompt 版本、用户反馈。bad case 通过 trace 定位到具体环节--是分块切断条文、还是召回没命中、还是生成没挂引用,而不是笼统说效果不好,定位完回流迭代。中建项目就是这个闭环,Recall@5 从 65% 提到 82%。

**指标**:Recall@k、faithfulness、answer relevancy、context precision/recall、引用准确率、拒答准确率。

**能提升什么**:RAGAS 四指标全量接入、LLM-as-judge bias 校准、bad case 自动归因、线上 A/B 评测、持续集成式回归测试(每次改动跑全评测集不退化才上线)。

---

## 13. 生产工程

从 demo 到生产,还有几件事必须做,这步往往是被忽视但决定能不能上线的。

**常用做法**:prompt caching 降本、流式输出降延迟、去重防 context 碎片、防 prompt injection 防安全、增量索引控更新成本、版本管理控模型切换、监控告警保可用。

**生产怎么选、为什么**:逐个说。prompt caching 必须做,文档和 system prompt 标记缓存,Contextual Retrieval 的低成本就靠它,降本约 90%、首 token 延迟降 2 倍。流式输出用户体验必需。防 prompt injection 是安全重点,检索到的文档里可能藏恶意指令,要文档内容用分隔符隔离、system 强调文档是数据不是指令、输出过滤。增量索引用内容指纹加版本,文档更新不做全量重建,指纹相同跳过幂等、版本变化只重建差异块。换 embedding 模型要版本管理,带 embedding_version 字段灰度切换。

**实际怎么用**:这几件事是组合配套的。prompt caching 配 Contextual Retrieval;增量索引配版本管理;防注入配输出过滤;全链路配监控(延迟、成本、错误率、cache 命中率)。pgvector 的 HNSW 删除是标记删除,定期重建索引回收空间,这个运维细节要注意。

**指标**:可用性 SLA(99.9% 以上)、延迟 P99、单 query 成本、cache 命中率(应 80% 以上才划算)、注入拦截率、增量索引正确性、版本切换无感。

**能提升什么**:多级缓存(query 结果缓存、embedding 缓存)、异步增量索引、灰度发布、混沌测试注入攻击、成本告警。

---

## 14. 收尾:三句话

第一,RAG 全链路是数据流--离线建库(解析、分块、上下文增强、向量化索引)决定上限,在线检索(查询理解、多路混合、RRF、Rerank)决定召回,Agentic 决策(评估、改写重试、拒答)决定可信,评测闭环决定能持续迭代。

第二,每一步都不是单一选型,生产多是组合--解析是主引擎加规则清洗加多模态兜底,检索是多路混合,Agentic 是轻量闭环不微调,关键是要有选型判断和理由,不是调 API。

第三,每步都有指标和提升空间,从 Contextual Retrieval 降 67% 失败率,到 Reflexion memory 让 agent 从失败学习,到 RAGAS 四指标量化质量,RAG 是个工程系统不是 prompt 技巧,讲究的是每环可控可测可迭代。

---

> **口播稿结束**。追问通用全流程与伪代码切《RAG工程辅导-从query到输出的Agentic RAG全流程》;追问 Agentic 反思机制切《Agentic-RAG与反思机制深入-核心详解》;追问中建项目实现细节切《Sware知识Agent辅导笔记》。
