package model

import (
	"context"
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// RequestDetail 保存单次 relay 请求的完整请求体/响应体,通过 request_id 与 Log 表关联。
// 仅在 common.DetailLogEnabled 开启时写入,内容为明文 prompt/回复,只应管理员可见。
type RequestDetail struct {
	Id           int    `json:"id"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint;index:idx_request_details_created_at"`
	RequestId    string `json:"request_id" gorm:"type:varchar(64);index:idx_request_details_request_id;default:''"`
	UserId       int    `json:"user_id" gorm:"index;default:0"`
	Username     string `json:"username" gorm:"default:''"`
	TokenId      int    `json:"token_id" gorm:"index;default:0"`
	TokenName    string `json:"token_name" gorm:"default:''"`
	ChannelId    int    `json:"channel_id" gorm:"index;default:0"`
	ModelName    string `json:"model_name" gorm:"default:''"`
	Endpoint     string `json:"endpoint" gorm:"type:varchar(128);default:''"`
	IsStream     bool   `json:"is_stream"`
	StatusCode   int    `json:"status_code" gorm:"default:0"`
	UseTime      int    `json:"use_time" gorm:"default:0"`
	RequestBody  string `json:"request_body"`
	ResponseBody string `json:"response_body"`
	Truncated    bool   `json:"truncated"`
	// Fork: 精细耗时指标(毫秒)。UseTime 保留旧秒精度字段兼容,新数据以 *_ms 为准
	UseTimeMs       int64 `json:"use_time_ms" gorm:"default:0"`
	FirstResponseMs int64 `json:"first_response_ms" gorm:"default:0"`
	UpstreamMs      int64 `json:"upstream_ms" gorm:"default:0"`
	// token 用量来自同 request_id 的消费日志,只读 join 字段,不落库
	PromptTokens     int `json:"prompt_tokens" gorm:"->"`
	CompletionTokens int `json:"completion_tokens" gorm:"->"`
}

// RecordRequestDetail 落库,调用方需在 gin 上下文销毁前构造好完整结构体(可安全异步调用)。
func RecordRequestDetail(detail *RequestDetail) {
	if detail == nil || !common.DetailLogEnabled {
		return
	}
	// ClickHouse 日志库无此表(迁移仅在 SQL 日志库执行)
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		return
	}
	// MySQL 会拒绝含非法 UTF-8 序列的写入(截断切在多字节字符中间、或客户端发来坏字节),
	// 直接 1366 丢整条记录;非法字节替换为 U+FFFD 保住记录。
	detail.RequestBody = strings.ToValidUTF8(detail.RequestBody, "\uFFFD")
	detail.ResponseBody = strings.ToValidUTF8(detail.ResponseBody, "\uFFFD")
	if err := LOG_DB.Create(detail).Error; err != nil {
		common.SysError(common.LogText("failed to record request detail: %s", err.Error()))
	}
}

type RequestDetailFilter struct {
	RequestId      string
	UserId         int
	TokenName      string
	ChannelId      int
	ModelName      string
	StartTimestamp int64
	EndTimestamp   int64
}

func buildRequestDetailQuery(filter RequestDetailFilter) *gorm.DB {
	tx := LOG_DB.Model(&RequestDetail{})
	if filter.RequestId != "" {
		tx = tx.Where("request_details.request_id = ?", filter.RequestId)
	}
	if filter.UserId != 0 {
		tx = tx.Where("request_details.user_id = ?", filter.UserId)
	}
	if filter.TokenName != "" {
		tx = tx.Where("request_details.token_name = ?", filter.TokenName)
	}
	if filter.ChannelId != 0 {
		tx = tx.Where("request_details.channel_id = ?", filter.ChannelId)
	}
	if filter.ModelName != "" {
		tx = tx.Where("request_details.model_name = ?", filter.ModelName)
	}
	if filter.StartTimestamp != 0 {
		tx = tx.Where("request_details.created_at >= ?", filter.StartTimestamp)
	}
	if filter.EndTimestamp != 0 {
		tx = tx.Where("request_details.created_at <= ?", filter.EndTimestamp)
	}
	return tx
}

// requestDetailLogJoin 关联同 request_id 的消费日志取 token 用量。
// RequestDetail 与 Log 同在 LOG_DB,join 成立;ClickHouse 日志库不支持此表(写入已短路)。
const requestDetailLogJoin = "LEFT JOIN logs ON logs.request_id = request_details.request_id AND logs.type = ?"

// requestDetailListColumns 列表查询列(不含 body 正文,控制页重);
// token 用量来自同 request_id 的消费日志。
const requestDetailListColumns = "request_details.id, request_details.created_at, request_details.request_id, " +
	"request_details.user_id, request_details.username, request_details.token_id, request_details.token_name, " +
	"request_details.channel_id, request_details.model_name, request_details.endpoint, request_details.is_stream, " +
	"request_details.status_code, request_details.use_time, request_details.truncated, " +
	"request_details.use_time_ms, request_details.first_response_ms, request_details.upstream_ms, " +
	"IFNULL(MAX(logs.prompt_tokens), 0) AS prompt_tokens, IFNULL(MAX(logs.completion_tokens), 0) AS completion_tokens"

// GetAllRequestDetails 分页列出详情记录;列表不含 body,正文用 GetRequestDetailBody 单独取。
func GetAllRequestDetails(filter RequestDetailFilter, startIdx int, num int) ([]*RequestDetail, int64, error) {
	var details []*RequestDetail
	var total int64
	tx := buildRequestDetailQuery(filter)
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := tx.
		Select(requestDetailListColumns).
		Joins(requestDetailLogJoin, LogTypeConsume).
		Group("request_details.id").
		Order("request_details.id desc").
		Limit(num).Offset(startIdx).
		Find(&details).Error
	return details, total, err
}

func GetRequestDetailBody(id int) (*RequestDetail, error) {
	if id == 0 {
		return nil, errors.New("id is required")
	}
	var detail RequestDetail
	err := LOG_DB.
		Select("request_details.*, IFNULL(MAX(logs.prompt_tokens), 0) AS prompt_tokens, IFNULL(MAX(logs.completion_tokens), 0) AS completion_tokens").
		Joins(requestDetailLogJoin, LogTypeConsume).
		Group("request_details.id").
		First(&detail, "request_details.id = ?", id).Error
	return &detail, err
}

// DeleteOldRequestDetailBatch 分批删除 created_at 早于 targetTimestamp 的详情记录,返回受影响行数。
func DeleteOldRequestDetailBatch(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	if limit <= 0 {
		limit = 100
	}
	if ctx.Err() != nil {
		return 0, ctx.Err()
	}
	res := LOG_DB.WithContext(ctx).Where("created_at < ?", targetTimestamp).Limit(limit).Delete(&RequestDetail{})
	return res.RowsAffected, res.Error
}
