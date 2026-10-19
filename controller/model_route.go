package controller

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/model_route_setting"

	"github.com/gin-gonic/gin"
)

// TestModelRoute dry-runs a configured model route: Fork: 模型路由——返回别名
// 会命中的渠道列表(含生效权重/改写目标)、各目标命中数与可用分组,不发真实请求。
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
	dryRun := model.ResolveModelRouteChannels(route)
	common.ApiSuccess(c, gin.H{
		"route":    route,
		"targets":  dryRun.Targets,
		"channels": dryRun.Channels,
		"groups":   dryRun.Groups,
	})
}

// SimulateModelRoute runs the production channel selection for the alias
// `times` times in the given group and tallies the winners: Fork: 模型路由——
// 模拟选择,验证权重与优先级档位是否按预期分布。
func SimulateModelRoute(c *gin.Context) {
	name := c.Query("name")
	group := c.Query("group")
	if name == "" || group == "" {
		common.ApiError(c, errors.New("name and group are required"))
		return
	}
	route, ok := model_route_setting.GetModelRouteByName(name)
	if !ok {
		common.ApiError(c, fmt.Errorf("model route %s not found", name))
		return
	}
	if !route.Enabled {
		common.ApiError(c, fmt.Errorf("model route %s is disabled", name))
		return
	}
	times := 10
	if raw := c.Query("times"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			common.ApiError(c, errors.New("times must be a positive integer"))
			return
		}
		times = min(parsed, 100)
	}
	picks, misses, err := model.SimulateModelRouteSelection(name, group, times)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"group":  group,
		"times":  times,
		"picks":  picks,
		"misses": misses,
	})
}
