package controller

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/model_route_setting"

	"github.com/gin-gonic/gin"
)

// TestModelRoute dry-runs a configured model route: Fork: 模型路由——返回别名
// 会命中的渠道列表(含生效权重/改写目标)与各目标命中数,不发真实请求。
func TestModelRoute(c *gin.Context) {
	name := c.Query("name")
	if name == "" {
		common.ApiError(c, errors.New("name is required"))
		return
	}
	route, ok := model_route_setting.GetModelRouteByName(name)
	if !ok {
		common.ApiError(c, fmt.Errorf("model route %s not found", name))
		return
	}
	targets, channels := model.ResolveModelRouteChannels(route)
	common.ApiSuccess(c, gin.H{
		"route":    route,
		"targets":  targets,
		"channels": channels,
	})
}
