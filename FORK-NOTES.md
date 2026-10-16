# Fork 说明(自用构建)

上游: https://github.com/QuantumNous/new-api
基础标签: `v1.0.0-rc.44`(与 wo4 部署版本一致)
分支: `custom/rc44-gemini-embed-usage`

## 改动内容

`relay/channel/gemini/relay-gemini-native.go` — `NativeGeminiEmbeddingHandler`:
原生 `:embedContent` 响应含 `usageMetadata.promptTokenCount` 时优先采用,替代原实现中的本地文本预计数。
背景:纯图片嵌入请求无文本可本地计数,原实现恒记 0;PR #1537 的"Gemini 不返回 Embedding 统计"前提已过时。
`batchEmbedContents` 上游无 usageMetadata,回退原逻辑。

## 构建与部署

- 推送 `custom/**` 分支或手动触发 `Build custom image` workflow
- 产物: `ghcr.io/anyuluo996/new-api:rc44-gemini-embed-usage` + Release 附件镜像 tar.gz(docker load 兜底)
- wo4: `/root/new-api/docker-compose.yml` 的 image 字段指向上述镜像

## 升级到新上游版本时

1. 从新标签(如 `v1.0.0-rc.4x`)拉新分支
2. 确认 `NativeGeminiEmbeddingHandler` 是否仍丢弃 usageMetadata(若上游已修,直接用官方镜像,废弃本 fork)
3. 重放上述单文件补丁,更新 workflow 中的 tag
