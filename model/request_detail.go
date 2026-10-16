package model

import (
	"context"
	"errors"

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
		tx = tx.Where("request_id = ?", filter.RequestId)
	}
	if filter.UserId != 0 {
		tx = tx.Where("user_id = ?", filter.UserId)
	}
	if filter.TokenName != "" {
		tx = tx.Where("token_name = ?", filter.TokenName)
	}
	if filter.ChannelId != 0 {
		tx = tx.Where("channel_id = ?", filter.ChannelId)
	}
	if filter.ModelName != "" {
		tx = tx.Where("model_name = ?", filter.ModelName)
	}
	if filter.StartTimestamp != 0 {
		tx = tx.Where("created_at >= ?", filter.StartTimestamp)
	}
	if filter.EndTimestamp != 0 {
		tx = tx.Where("created_at <= ?", filter.EndTimestamp)
	}
	return tx
}

// GetAllRequestDetails 分页列出详情记录;列表不含 body,正文用 GetRequestDetailBody 单独取。
func GetAllRequestDetails(filter RequestDetailFilter, startIdx int, num int) ([]*RequestDetail, int64, error) {
	var details []*RequestDetail
	var total int64
	tx := buildRequestDetailQuery(filter)
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := tx.Omit("request_body", "response_body").Order("id desc").Limit(num).Offset(startIdx).Find(&details).Error
	return details, total, err
}

func GetRequestDetailBody(id int) (*RequestDetail, error) {
	if id == 0 {
		return nil, errors.New("id is required")
	}
	var detail RequestDetail
	err := LOG_DB.First(&detail, "id = ?", id).Error
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
