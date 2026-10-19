package model

import (
	"maps"
	"slices"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/model_route_setting"
)

// ResolveModelRouteUpstream returns the real model name that the route
// publishing alias maps to on the given channel, or "" when the channel is
// not a routing destination for the alias. Targets are matched in configured
// order; a target matches when the channel carries the target tag (an empty
// target tag matches any channel) and serves the target model. A channel
// that serves the alias as a real model is never rewritten.
func ResolveModelRouteUpstream(channel *Channel, alias string) string {
	if channel == nil || alias == "" {
		return ""
	}
	route, ok := model_route_setting.FindModelRoute(alias)
	if !ok {
		return ""
	}
	if slices.Contains(channel.GetModels(), alias) {
		return ""
	}
	for _, target := range route.Targets {
		if !routeTargetTagMatches(target.Tag, channel.Tag) {
			continue
		}
		if slices.Contains(channel.GetModels(), target.Model) {
			return target.Model
		}
	}
	return ""
}

func routeTargetTagMatches(targetTag string, channelTag *string) bool {
	if targetTag == "" {
		return true
	}
	return channelTag != nil && *channelTag == targetTag
}

// routeChannelWeights holds per-alias channel weight overrides built during
// cache expansion (alias -> channelId -> target weight). Only selection for
// the alias consults it; guard is channelSyncLock in channel_cache.go.
var routeChannelWeights map[string]map[int]uint

// GetModelRouteChannelWeight returns the weight override configured by the
// alias's target for the given channel. Targets without an explicit weight
// keep the channel's own weight.
func GetModelRouteChannelWeight(alias string, channelId int) (uint, bool) {
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()
	if routeChannelWeights == nil {
		return 0, false
	}
	weight, ok := routeChannelWeights[alias][channelId]
	return weight, ok
}

// ExpandModelRoutes injects every enabled route alias into a freshly built
// group2model2channels map so channel selection treats the alias like any
// other model. Channels are collected target by target in configured order
// (first target wins per channel) and the merged list is re-sorted by
// priority, so retry tiers and weighted selection keep working. Groups where
// the alias already exists as a real model are left untouched. It also
// returns the alias channel weight overrides to install under
// channelSyncLock.
func ExpandModelRoutes(group2model2channels map[string]map[string][]int, channelId2channel map[int]*Channel) map[string]map[int]uint {
	weightOverrides := make(map[string]map[int]uint)
	for _, route := range model_route_setting.GetModelRoutes() {
		if !route.Enabled {
			continue
		}
		for _, model2channels := range group2model2channels {
			if _, exists := model2channels[route.Name]; exists {
				continue
			}
			var aliasChannels []int
			seen := make(map[int]bool)
			for _, target := range route.Targets {
				for _, channelId := range model2channels[target.Model] {
					if seen[channelId] {
						continue
					}
					channel := channelId2channel[channelId]
					if channel == nil {
						continue
					}
					if !routeTargetTagMatches(target.Tag, channel.Tag) {
						continue
					}
					seen[channelId] = true
					aliasChannels = append(aliasChannels, channelId)
					if target.Weight > 0 {
						if weightOverrides[route.Name] == nil {
							weightOverrides[route.Name] = make(map[int]uint)
						}
						weightOverrides[route.Name][channelId] = target.Weight
					}
				}
			}
			if len(aliasChannels) == 0 {
				continue
			}
			sort.Slice(aliasChannels, func(i, j int) bool {
				return channelId2channel[aliasChannels[i]].GetPriority() > channelId2channel[aliasChannels[j]].GetPriority()
			})
			model2channels[route.Name] = aliasChannels
		}
	}
	return weightOverrides
}

// ModelRouteTestChannel is one channel a route resolves to in a dry run.
type ModelRouteTestChannel struct {
	ChannelId    int    `json:"channel_id"`
	ChannelName  string `json:"channel_name"`
	ChannelGroup string `json:"channel_group"`
	Tag          string `json:"tag,omitempty"`
	Priority     int64  `json:"priority"`
	Weight       int    `json:"weight"`
	Enabled      bool   `json:"enabled"`
	TargetModel  string `json:"target_model"`
}

// ModelRouteTargetSummary reports how many channels one route target matched.
type ModelRouteTargetSummary struct {
	Model        string `json:"model"`
	Tag          string `json:"tag,omitempty"`
	Weight       uint   `json:"weight,omitempty"`
	ChannelCount int    `json:"channel_count"`
}

// ModelRouteDryRun is the dry-run result of a route: per-target match
// counts, the deduplicated channel list, and the groups the alias is
// available in (groups of enabled matched channels).
type ModelRouteDryRun struct {
	Targets  []ModelRouteTargetSummary `json:"targets"`
	Channels []ModelRouteTestChannel   `json:"channels"`
	Groups   []string                  `json:"groups"`
}

// ResolveModelRouteChannels dry-runs the route against current channels:
// per-target match counts plus the deduplicated channel list the alias would
// draw from, with effective weights (target weight replaces channel weight).
func ResolveModelRouteChannels(route model_route_setting.ModelRoute) *ModelRouteDryRun {
	var allChannels []*Channel
	DB.Find(&allChannels)
	dryRun := &ModelRouteDryRun{
		Targets:  make([]ModelRouteTargetSummary, 0, len(route.Targets)),
		Channels: make([]ModelRouteTestChannel, 0),
	}
	groups := make(map[string]bool)
	seen := make(map[int]bool)
	for _, target := range route.Targets {
		summary := ModelRouteTargetSummary{Model: target.Model, Tag: target.Tag, Weight: target.Weight}
		for _, channel := range allChannels {
			if seen[channel.Id] {
				continue
			}
			if !routeTargetTagMatches(target.Tag, channel.Tag) {
				continue
			}
			if !slices.Contains(channel.GetModels(), target.Model) {
				continue
			}
			seen[channel.Id] = true
			summary.ChannelCount++
			info := ModelRouteTestChannel{
				ChannelId:    channel.Id,
				ChannelName:  channel.Name,
				ChannelGroup: channel.Group,
				Priority:     channel.GetPriority(),
				Weight:       channel.GetWeight(),
				Enabled:      channel.Status == common.ChannelStatusEnabled,
				TargetModel:  target.Model,
			}
			if target.Weight > 0 {
				info.Weight = int(target.Weight)
			}
			if channel.Tag != nil {
				info.Tag = *channel.Tag
			}
			if info.Enabled {
				for group := range strings.SplitSeq(channel.Group, ",") {
					if group != "" {
						groups[group] = true
					}
				}
			}
			dryRun.Channels = append(dryRun.Channels, info)
		}
		dryRun.Targets = append(dryRun.Targets, summary)
	}
	dryRun.Groups = slices.Sorted(maps.Keys(groups))
	return dryRun
}

// ModelRoutePick tallies simulated alias selections per channel.
type ModelRoutePick struct {
	ChannelId   int    `json:"channel_id"`
	ChannelName string `json:"channel_name"`
	TargetModel string `json:"target_model"`
	Count       int    `json:"count"`
}

// SimulateModelRouteSelection runs the real channel selection `times` times
// for the alias in the given group and tallies which channel wins each pick
// along with the target model it would be rewritten to. It exercises the
// production selection path including route weights and priority tiers.
func SimulateModelRouteSelection(alias, group string, times int) ([]ModelRoutePick, int, error) {
	tally := make(map[int]*ModelRoutePick)
	order := make([]int, 0, times)
	misses := 0
	for range times {
		channel, err := GetRandomSatisfiedChannel(group, alias, 0, nil)
		if err != nil {
			return nil, misses, err
		}
		if channel == nil {
			misses++
			continue
		}
		pick, ok := tally[channel.Id]
		if !ok {
			pick = &ModelRoutePick{
				ChannelId:   channel.Id,
				ChannelName: channel.Name,
				TargetModel: alias,
			}
			tally[channel.Id] = pick
			order = append(order, channel.Id)
		}
		pick.Count++
		if target := ResolveModelRouteUpstream(channel, alias); target != "" {
			pick.TargetModel = target
		}
	}
	picks := make([]ModelRoutePick, 0, len(order))
	for _, id := range order {
		picks = append(picks, *tally[id])
	}
	return picks, misses, nil
}
