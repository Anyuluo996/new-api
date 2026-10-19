package model_route_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/QuantumNous/new-api/setting/config"
)

func TestValidateRoutesJSON(t *testing.T) {
	valid := `[{"name":"gpt-4o-all","targets":[{"model":"gpt-4o"},{"model":"gpt-4o-2024-11-20","tag":"cn"}],"enabled":true}]`
	require.NoError(t, ValidateRoutesJSON(valid))
	require.NoError(t, ValidateRoutesJSON(""))
	require.NoError(t, ValidateRoutesJSON("[]"))

	emptyName := `[{"name":"  ","targets":[{"model":"gpt-4o"}],"enabled":true}]`
	err := ValidateRoutesJSON(emptyName)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "name cannot be empty")

	duplicate := `[{"name":"a","targets":[{"model":"gpt-4o"}],"enabled":true},{"name":"a","targets":[{"model":"claude-3"}],"enabled":true}]`
	err = ValidateRoutesJSON(duplicate)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "duplicate model route name: a")

	noTargets := `[{"name":"a","targets":[],"enabled":true}]`
	err = ValidateRoutesJSON(noTargets)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "at least one target")

	emptyTarget := `[{"name":"a","targets":[{"model":" "}],"enabled":true}]`
	err = ValidateRoutesJSON(emptyTarget)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "empty target model")

	selfTarget := `[{"name":"a","targets":[{"model":"a"}],"enabled":true}]`
	err = ValidateRoutesJSON(selfTarget)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "cannot target itself")

	aliasChained := `[{"name":"a","targets":[{"model":"b"}],"enabled":true},{"name":"b","targets":[{"model":"gpt-4o"}],"enabled":true}]`
	err = ValidateRoutesJSON(aliasChained)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "itself a route name")

	err = ValidateRoutesJSON("not-json")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "must be a JSON array")
}

func TestFindModelRoute(t *testing.T) {
	cfg := config.GlobalConfig.Get("model_route_setting")
	require.NotNil(t, cfg)
	err := config.UpdateConfigFromMap(cfg, map[string]string{
		"routes": `[{"name":"on-route","targets":[{"model":"m1"}],"enabled":true},{"name":"off-route","targets":[{"model":"m2"}],"enabled":false}]`,
	})
	require.NoError(t, err)

	route, ok := FindModelRoute("on-route")
	require.True(t, ok)
	assert.Equal(t, "m1", route.Targets[0].Model)

	_, ok = FindModelRoute("off-route")
	assert.False(t, ok, "disabled route must not be resolvable")

	_, ok = FindModelRoute("missing")
	assert.False(t, ok)
}
