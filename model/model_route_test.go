package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

func setTestModelRoutes(t *testing.T, routesJSON string) {
	t.Helper()
	cfg := config.GlobalConfig.Get("model_route_setting")
	require.NotNil(t, cfg)
	require.NoError(t, config.UpdateConfigFromMap(cfg, map[string]string{"routes": routesJSON}))
}

func routeTestChannels() map[int]*Channel {
	p10 := common.GetPointer(int64(10))
	p20 := common.GetPointer(int64(20))
	tagCN := "cn"
	return map[int]*Channel{
		1: {Id: 1, Models: "gpt-4o", Priority: p10},
		2: {Id: 2, Models: "gpt-4o,gpt-4o-all", Priority: p20},
		3: {Id: 3, Models: "gpt-4o-2024-11-20", Priority: p20, Tag: &tagCN},
	}
}

func TestExpandModelRoutes(t *testing.T) {
	channels := routeTestChannels()
	routes := `[
		{"name":"gpt-4o-all","targets":[{"model":"gpt-4o"},{"model":"gpt-4o-2024-11-20","tag":"cn","weight":3}],"enabled":true},
		{"name":"disabled-alias","targets":[{"model":"gpt-4o"}],"enabled":false}
	]`
	setTestModelRoutes(t, routes)
	groups := map[string]map[string][]int{
		"default": {"gpt-4o": {1}, "gpt-4o-2024-11-20": {3}},
		"vip":     {"gpt-4o": {1}},
		"other":   {"gpt-4o": {1}, "gpt-4o-all": {2}},
	}

	weights := ExpandModelRoutes(groups, channels)

	// Targets merge as [1 (gpt-4o), 3 (tagged gpt-4o-2024-11-20)] and the
	// priority sort puts channel 3 (p20) before channel 1 (p10).
	assert.Equal(t, []int{3, 1}, groups["default"]["gpt-4o-all"])
	assert.Equal(t, []int{1}, groups["vip"]["gpt-4o-all"], "channel 3 only serves groups it belongs to")
	assert.Equal(t, []int{2}, groups["other"]["gpt-4o-all"], "groups where the alias exists as a real model stay untouched")
	_, ok := groups["default"]["disabled-alias"]
	assert.False(t, ok, "disabled routes must not expand")

	// Target weight overrides become per-alias channel weight entries.
	assert.Equal(t, map[string]map[int]uint{
		"gpt-4o-all": {3: 3},
	}, weights)
	// Install like InitChannelCache does, then check the accessor.
	channelSyncLock.Lock()
	routeChannelWeights = weights
	channelSyncLock.Unlock()
	t.Cleanup(func() {
		channelSyncLock.Lock()
		routeChannelWeights = nil
		channelSyncLock.Unlock()
	})
	weight, ok := GetModelRouteChannelWeight("gpt-4o-all", 3)
	assert.True(t, ok)
	assert.Equal(t, uint(3), weight)
	_, ok = GetModelRouteChannelWeight("gpt-4o-all", 1)
	assert.False(t, ok, "targets without explicit weight keep channel weights")
	_, ok = GetModelRouteChannelWeight("unknown-alias", 3)
	assert.False(t, ok)
}

func TestResolveModelRouteUpstream(t *testing.T) {
	channels := routeTestChannels()
	setTestModelRoutes(t, `[{"name":"gpt-4o-all","targets":[{"model":"gpt-4o"},{"model":"gpt-4o-2024-11-20","tag":"cn"}],"enabled":true}]`)

	assert.Empty(t, ResolveModelRouteUpstream(nil, "gpt-4o-all"))
	assert.Empty(t, ResolveModelRouteUpstream(channels[1], "unknown-alias"))
	assert.Empty(t, ResolveModelRouteUpstream(channels[2], "gpt-4o-all"), "channels serving the alias as a real model are never rewritten")

	// Channel 1 serves the first target, the tagless one.
	assert.Equal(t, "gpt-4o", ResolveModelRouteUpstream(channels[1], "gpt-4o-all"))

	// Channel 3 misses the first target's model list; the second target
	// matches both model and tag.
	assert.Equal(t, "gpt-4o-2024-11-20", ResolveModelRouteUpstream(channels[3], "gpt-4o-all"))

	// An untagged channel never matches a tagged target.
	untagged := &Channel{Id: 4, Models: "gpt-4o-2024-11-20"}
	assert.Empty(t, ResolveModelRouteUpstream(untagged, "gpt-4o-all"))

	// A channel that serves none of the targets resolves to nothing.
	other := &Channel{Id: 5, Models: "claude-3"}
	assert.Empty(t, ResolveModelRouteUpstream(other, "gpt-4o-all"))
}
