package model

import (
	"slices"
	"sort"

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

// ExpandModelRoutes injects every enabled route alias into a freshly built
// group2model2channels map so channel selection treats the alias like any
// other model. Channels are collected target by target in configured order
// (first target wins per channel) and the merged list is re-sorted by
// priority, so retry tiers and weighted selection keep working. Groups where
// the alias already exists as a real model are left untouched.
func ExpandModelRoutes(group2model2channels map[string]map[string][]int, channelId2channel map[int]*Channel) {
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
}
