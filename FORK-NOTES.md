# Fork 说明(自用构建)

上游: https://github.com/QuantumNous/new-api
基础标签: `v1.0.0-rc.44`(与 wo4 部署版本一致)
分支: `custom/rc44-gemini-embed-usage`

## 改动内容

`relay/channel/gemini/relay-gemini-native.go` — `NativeGeminiEmbeddingHandler`:
原生 `:embedContent` 响应含 `usageMetadata.promptTokenCount` 时优先采用,替代原实现中的本地文本预计数。
背景:纯图片嵌入请求无文本可本地计数,原实现恒记 0;PR #1537 的"Gemini 不返回 Embedding 统计"前提已过时。
`batchEmbedContents` 上游无 usageMetadata,回退原逻辑。

## Fork 功能:请求详情日志(2026-10-16 新增)

记录每次 relay 请求的完整请求体/响应体,通过 `request_id` 与消费日志(`Log` 表)关联。

- **模型/落库**: `model/request_detail.go` — `RequestDetail` 表(挂日志库,ClickHouse 日志库不支持);列表接口不含 body,正文按 id 单取
- **捕获**: `middleware/body_capture.go` — 包一层 `c.Writer` 截留响应体(流式 SSE 原文),请求体从 BodyStorage/原始流限量读;挂载于 `/v1` HTTP relay、`/pg` playground、`/v1beta` gemini 原生(不含 `/mj`、WS、task plugin 协议路由)
- **开关**(运营设置 option 表,默认关):
  - `DetailLogEnabled` — 总开关
  - `DetailLogMaxBodyKB` — 单侧截断上限,默认 64KB,超出置 `truncated=true`
  - `DetailLogRetentionDays` — 保留天数,默认 7;`0` 永不自动清;随"日志清理"系统任务执行
- **查询 API**(仅管理员,access-token scope `log:read`):
  - `GET /api/request_detail/?request_id=&user_id=&channel_id=&model_name=&token_name=&start_timestamp=&end_timestamp=&p=&page_size=`
  - `GET /api/request_detail/:id` — 含完整请求/响应体
- **注意**: 内容为明文 prompt/回复,体量约每请求 KB 级 × 全部 relay 流量,开启前评估磁盘;表格随启动 AutoMigrate 自动建

## 构建与部署

- 推送 `custom/**` 分支或手动触发 `Build custom image` workflow
- 产物: `ghcr.io/anyuluo996/new-api:rc44-gemini-embed-usage` + Release 附件镜像 tar.gz(docker load 兜底)
- wo4: `/root/new-api/docker-compose.yml` 的 image 字段指向上述镜像

## 升级到新上游版本时

1. 从新标签(如 `v1.0.0-rc.4x`)拉新分支
2. 确认 `NativeGeminiEmbeddingHandler` 是否仍丢弃 usageMetadata(若上游已修,该补丁可弃)
3. 重放 fork 提交(gemini 补丁 + workflow + 本文档),更新 workflow 中的 tag
4. fork 自有文件(`model/request_detail.go`、`middleware/body_capture*.go`、`controller/request_detail.go`)与上游无交集,rebase 冲突面主要在 `router/*`、`model/option.go`、`model/main.go`、`middleware/access_token_routes.go`、`service/system_task.go` 的少量插入行
