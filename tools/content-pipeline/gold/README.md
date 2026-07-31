# 真人中文金标队列

这里不存机器伪造的“人工通过”。使用 `node scripts/content-gold-workflow.mjs register` 登记真实用户资料和候选输出，再由真实 reviewer 用 `review --confirm-human` 独立评分。

金标回执只用于提示词回归，不授权 `NarrationLock`、配音晋级或公开发布。`status` 只有在 case、candidate、hard assertion、人工 reviewer 和分数全部通过 SHA 绑定后才计入 `humanReviewedGoldCases`。测试、fixture、synthetic、machine、bot、agent 身份会被拒绝。
