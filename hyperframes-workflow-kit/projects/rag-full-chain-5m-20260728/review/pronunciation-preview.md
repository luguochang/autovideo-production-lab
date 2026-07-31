# 发音预扫描

状态：`preview-from-unapproved-editorial-draft`  
绑定候选 SHA-256：`0bd400ff29c30be0161c3a927926dc09cc25a4f448cfaa35d6a46afc854f9c97`

## 结果

| 项目 | 初始机械稿 | 当前审稿候选 |
| --- | ---: | ---: |
| 不同拉丁 token | 181 | 59 |
| 拉丁 token 总出现次数 | 561 | 177 |
| 可按字母缩写默认处理 | 23 | 18 |
| 必须原句听审 | 158 | 41 |

当前 41 个待听审项主要是必要技术名称，而不是可直接移到屏幕或翻成中文的通用词，例如：`BM25`、`pgvector`、`MinerU`、`ColBERT`、`bge-m3`、`Self-RAG`、`Reflexion`、`LangChain`、`HyDE`、`nDCG`、`P99`。

完整 token、分类、出现位置、原句上下文和上下文哈希见 `review/pronunciation.preview.json`。该文件只是锁稿前预览，不能替代正式 `input/pronunciation.json`，也没有任何人工发音批准。
