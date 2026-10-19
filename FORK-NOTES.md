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

- **模型/落库**: `model/request_detail.go` — `RequestDetail` 表(挂日志库,ClickHouse 日志库不支持);列表接口不含 body,正文按 id 单取;含精细耗时指标 `use_time_ms`/`first_response_ms`/`upstream_ms`(上游耗时由 `DoApiRequest`/`DoFormRequest` 打点写入 context,重试取最后一次),token 用量查询时 LEFT JOIN 同 request_id 消费日志(`gorm:"->"` 只读字段,不落库)
- **捕获**: `middleware/body_capture.go` — 包一层 `c.Writer` 截留响应体(流式 SSE 原文),请求体从 BodyStorage/原始流限量读;挂载于 `/v1` HTTP relay、`/pg` playground、`/v1beta` gemini 原生(不含 `/mj`、WS、task plugin 协议路由)
- **开关**(运营设置 → 日志维护页有 UI;默认关):
  - `DetailLogEnabled` — 总开关
  - `DetailLogMaxBodyKB` — 单侧截断上限,默认 64KB,超出置 `truncated=true`
  - `DetailLogRetentionDays` — 保留天数,默认 7;`0` 永不自动清;随"日志清理"系统任务执行
- **查询 API**(仅管理员,access-token scope `log:read`):
  - `GET /api/request_detail/?request_id=&user_id=&channel_id=&model_name=&token_name=&start_timestamp=&end_timestamp=&p=&page_size=`
  - `GET /api/request_detail/:id` — 含完整请求/响应体
- **WebUI**: 侧边栏「使用日志」分组 → 「请求详情」(`RequiredRole ADMIN`),`/usage-logs/details`;feature 代码在 `web/src/features/usage-logs/request-details/`,列表 + 筛选(模型/渠道/用户/令牌/请求 ID/时间)+ 详情弹窗(JSON 美化 + 复制);侧边栏显隐跟随「通用日志」模块配置
- **注意**: 内容为明文 prompt/回复,体量约每请求 KB 级 × 全部 relay 流量,开启前评估磁盘;表格随启动 AutoMigrate 自动建

## Fork 功能:模型路由(2026-10-19 新增)

一个对外模型名(别名)可映射到多个真实模型(可限定渠道标签),跨多渠道复用既有优先级/权重/重试机制。

- **配置**: option `model_route_setting.routes`(JSON 数组,经 `setting/config` 注册;`GET/PUT /api/option/` 读写,校验挂 `validateOptionValue`,更新后 `handleConfigUpdate` 重建渠道缓存)
- **结构**: `[{name, targets:[{model, tag?}], enabled, remark}]`;targets 自上而下匹配,`tag` 过滤渠道;别名不得与自身互指、不得指向其他别名(单层展开),重复别名拒绝
- **选择**: `model/model_route.go` `ExpandModelRoutes` 在 `InitChannelCache` 构建时把别名注入 `group2model2channels`(该组已有同名真实模型则跳过);内存缓存关闭路径走 `model/ability.go` `GetChannelForRoute`(合并各目标模型 abilities,同渠道首目标优先)
- **改写**: `SetupContextForSelectedChannel` 写入 `ContextKeyRoutedModel` = 命中目标(`ResolveModelRouteUpstream` 为纯函数:路由配置×渠道,两种缓存模式通用);`InitChannelMeta` 用其覆盖 `UpstreamModelName`;渠道级 model_mapping 在改写结果之上继续生效;重试时按新渠道重新解析
- **计费**: `relay/helper/price.go` `ModelPriceHelper`/`ModelPriceHelperPerCall` 按改写名计价(别名无需配倍率,零配置即按真实模型价格);计费快照在 `PrepareRequestBilling` 一次生成,跨渠道重试沿用首次选中渠道目标的价格;消费日志 `ModelName` 仍记别名,真实模型在 admin 可见的 `other.upstream_model_name`
- **模型列表**: `/v1/models` 注入当前分组下已生效的别名(`controller/model.go` `routedModelAliases`,豁免「未配倍率」过滤;令牌模型限制照常约束别名)
- **WebUI**: 系统设置 → 请求策略 → 「模型路由」(`web/src/features/system-settings/request-policies/model-routing/`),规则表+编辑弹窗+启停开关,保存走 `PUT /api/option/`(Root 权限);i18n 六语言已补
- **注意**: 别名勿与现有真实模型重名(重名时真实模型优先);别名不进渠道模型列表/能力表,纯运行时展开

## 构建与部署

- 推送 `custom/**` 分支或手动触发 `Build custom image` workflow
- 产物: `ghcr.io/anyuluo996/new-api:rc44-gemini-embed-usage` + Release 附件镜像 tar.gz(docker load 兜底)
- wo4: `/root/new-api/docker-compose.yml` 的 image 字段指向上述镜像

## 升级到新上游版本时

1. 从新标签(如 `v1.0.0-rc.4x`)拉新分支
2. 确认 `NativeGeminiEmbeddingHandler` 是否仍丢弃 usageMetadata(若上游已修,该补丁可弃)
3. 重放 fork 提交(gemini 补丁 + workflow + 本文档),更新 workflow 中的 tag
4. fork 自有文件(`model/request_detail.go`、`middleware/body_capture*.go`、`controller/request_detail.go`、`model/model_route.go`、`setting/model_route_setting/`)与上游无交集,rebase 冲突面主要在 `router/*`、`model/option.go`、`model/main.go`、`model/channel_cache.go`、`model/ability.go`、`middleware/distributor.go`、`relay/common/relay_info.go`、`relay/helper/price.go`、`controller/model.go`、`middleware/access_token_routes.go`、`service/system_task.go` 的少量插入行
