package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

func requestDetailFilterFromQuery(c *gin.Context) model.RequestDetailFilter {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	userId, _ := strconv.Atoi(c.Query("user_id"))
	channelId, _ := strconv.Atoi(c.Query("channel_id"))
	return model.RequestDetailFilter{
		RequestId:      c.Query("request_id"),
		UserId:         userId,
		TokenName:      c.Query("token_name"),
		ChannelId:      channelId,
		ModelName:      c.Query("model_name"),
		StartTimestamp: startTimestamp,
		EndTimestamp:   endTimestamp,
	}
}

// GetAllRequestDetails 管理员分页查询请求详情记录;列表不含请求/响应体,正文走 GetRequestDetailBody。
func GetAllRequestDetails(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	filter := requestDetailFilterFromQuery(c)
	details, total, err := model.GetAllRequestDetails(filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(details)
	common.ApiSuccess(c, pageInfo)
}

// GetRequestDetailBody 按 id 返回单条记录的完整请求体/响应体。
func GetRequestDetailBody(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	detail, err := model.GetRequestDetailBody(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, detail)
}
