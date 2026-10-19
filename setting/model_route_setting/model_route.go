package model_route_setting

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

// ModelRoutesOptionKey is the option key holding the serialized route list.
const ModelRoutesOptionKey = "model_route_setting.routes"

// maxTargetWeight bounds per-target weight so weighted selection sums cannot
// overflow.
const maxTargetWeight = 1_000_000

// ModelRouteTarget is one routing destination: a real model name served by
// channels, optionally restricted to channels carrying a tag. Weight, when
// set, replaces the participating channels' own weight during alias
// selection (0 keeps channel weights).
type ModelRouteTarget struct {
	Model  string `json:"model"`
	Tag    string `json:"tag,omitempty"`
	Weight uint   `json:"weight,omitempty"`
}

// ModelRoute publishes one alias model name. A request for Name is channel
// selected as if it were any of the Targets, and rewritten to the target
// model of whichever channel wins.
type ModelRoute struct {
	Name    string             `json:"name"`
	Targets []ModelRouteTarget `json:"targets"`
	Enabled bool               `json:"enabled"`
	Remark  string             `json:"remark,omitempty"`
}

type modelRouteConfig struct {
	Routes []ModelRoute `json:"routes"`
}

var routeConfig = &modelRouteConfig{Routes: []ModelRoute{}}

func init() {
	config.GlobalConfig.Register("model_route_setting", routeConfig)
}

// GetModelRoutes returns the configured routes in declaration order.
func GetModelRoutes() []ModelRoute {
	return routeConfig.Routes
}

// FindModelRoute returns the enabled route publishing the given alias.
func FindModelRoute(name string) (ModelRoute, bool) {
	for _, route := range routeConfig.Routes {
		if route.Enabled && route.Name == name {
			return route, true
		}
	}
	return ModelRoute{}, false
}

// GetModelRouteByName returns the route with the given alias regardless of
// enabled state, for the dry-run test endpoint.
func GetModelRouteByName(name string) (ModelRoute, bool) {
	for _, route := range routeConfig.Routes {
		if route.Name == name {
			return route, true
		}
	}
	return ModelRoute{}, false
}

// ValidateRoutesJSON parses and validates an option value for
// ModelRoutesOptionKey.
func ValidateRoutesJSON(value string) error {
	routes, err := parseRoutesJSON(value)
	if err != nil {
		return err
	}
	return ValidateRoutes(routes)
}

// ValidateRoutes enforces the route invariants shared by the option
// validator and the WebUI editor.
func ValidateRoutes(routes []ModelRoute) error {
	aliases := make(map[string]bool, len(routes))
	for _, route := range routes {
		name := strings.TrimSpace(route.Name)
		if name == "" {
			return errors.New("model route name cannot be empty")
		}
		if aliases[name] {
			return fmt.Errorf("duplicate model route name: %s", name)
		}
		aliases[name] = true
		if len(route.Targets) == 0 {
			return fmt.Errorf("model route %s must define at least one target", name)
		}
		for _, target := range route.Targets {
			if strings.TrimSpace(target.Model) == "" {
				return fmt.Errorf("model route %s contains an empty target model", name)
			}
			if strings.TrimSpace(target.Model) == name {
				return fmt.Errorf("model route %s cannot target itself", name)
			}
			if target.Weight > maxTargetWeight {
				return fmt.Errorf("model route %s target weight %d exceeds the limit %d", name, target.Weight, maxTargetWeight)
			}
		}
	}
	// Expansion and rewrite are single-level: a target must be a real model,
	// not another alias, so selection semantics stay predictable.
	for _, route := range routes {
		for _, target := range route.Targets {
			if aliases[strings.TrimSpace(target.Model)] {
				return fmt.Errorf("model route %s targets %q, which is itself a route name; targets must be real models", route.Name, target.Model)
			}
		}
	}
	return nil
}

func parseRoutesJSON(value string) ([]ModelRoute, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return []ModelRoute{}, nil
	}
	var routes []ModelRoute
	if err := common.Unmarshal([]byte(trimmed), &routes); err != nil {
		return nil, fmt.Errorf("model routes must be a JSON array: %s", err.Error())
	}
	return routes, nil
}
