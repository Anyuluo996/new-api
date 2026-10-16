package middleware

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupCaptureTestDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	// :memory: 每个池化连接是独立库,钉住单连接避免建表不可见
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("get sql db: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&model.RequestDetail{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	origLog := model.LOG_DB
	origMain := model.DB
	model.LOG_DB = db
	model.DB = db
	t.Cleanup(func() {
		model.LOG_DB = origLog
		model.DB = origMain
	})
}

func saveCaptureGlobals(t *testing.T, enabled bool, maxKB int) {
	t.Helper()
	origEnabled, origMax := common.DetailLogEnabled, common.DetailLogMaxBodyKB
	common.DetailLogEnabled = enabled
	common.DetailLogMaxBodyKB = maxKB
	t.Cleanup(func() {
		common.DetailLogEnabled = origEnabled
		common.DetailLogMaxBodyKB = origMax
	})
}

func waitForDetailCount(t *testing.T, want int) []model.RequestDetail {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		var details []model.RequestDetail
		if err := model.LOG_DB.Find(&details).Error; err == nil && len(details) == want {
			return details
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("expected %d request detail rows, timed out", want)
	return nil
}

func newCaptureRouter(buildRoutes func(r *gin.Engine)) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.RequestIdKey, "req-test-1")
		c.Set("id", 7)
		c.Set("token_id", 3)
		c.Set("token_name", "sk-test")
		c.Set(string(constant.ContextKeyChannelId), 11)
		c.Set(string(constant.ContextKeyOriginalModel), "gpt-test")
		c.Next()
	})
	r.Use(RequestDetailCapture())
	buildRoutes(r)
	return r
}

func TestRequestDetailCaptureDisabled(t *testing.T) {
	setupCaptureTestDB(t)
	saveCaptureGlobals(t, false, 64)

	r := newCaptureRouter(func(r *gin.Engine) {
		r.POST("/v1/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})
	})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/test", strings.NewReader(`{"a":1}`))
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var count int64
	if err := model.LOG_DB.Model(&model.RequestDetail{}).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("expected no rows when disabled, got %d", count)
	}
}

func TestRequestDetailCaptureBasic(t *testing.T) {
	setupCaptureTestDB(t)
	saveCaptureGlobals(t, true, 64)

	r := newCaptureRouter(func(r *gin.Engine) {
		r.POST("/v1/chat/completions", func(c *gin.Context) {
			// 模拟 relay handler 读取请求体(建立 BodyStorage 缓存)
			if _, err := common.GetRequestBody(c); err != nil {
				t.Errorf("read body: %v", err)
			}
			c.Header("Content-Type", "application/json")
			c.String(http.StatusOK, `{"choices":[{"message":{"content":"hi"}}]}`)
		})
	})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-test","messages":[]}`))
	r.ServeHTTP(w, req)

	details := waitForDetailCount(t, 1)
	d := details[0]
	if d.RequestBody != `{"model":"gpt-test","messages":[]}` {
		t.Errorf("request_body = %q", d.RequestBody)
	}
	if !strings.Contains(d.ResponseBody, `"content":"hi"`) {
		t.Errorf("response_body = %q", d.ResponseBody)
	}
	if d.ResponseBody != w.Body.String() {
		t.Errorf("captured body differs from client response")
	}
	if d.StatusCode != http.StatusOK || d.IsStream || d.Truncated {
		t.Errorf("status=%d stream=%v truncated=%v", d.StatusCode, d.IsStream, d.Truncated)
	}
	if d.RequestId != "req-test-1" || d.UserId != 7 || d.TokenId != 3 || d.ChannelId != 11 || d.ModelName != "gpt-test" {
		t.Errorf("context fields wrong: %+v", d)
	}
	if d.Endpoint != "/v1/chat/completions" {
		t.Errorf("endpoint = %q", d.Endpoint)
	}
}

func TestRequestDetailCaptureTruncation(t *testing.T) {
	setupCaptureTestDB(t)
	saveCaptureGlobals(t, true, 1) // 1KB 上限

	big := strings.Repeat("x", 5*1024)
	r := newCaptureRouter(func(r *gin.Engine) {
		r.POST("/v1/test", func(c *gin.Context) {
			_, _ = common.GetRequestBody(c)
			c.String(http.StatusOK, big)
		})
	})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/test", strings.NewReader(big))
	r.ServeHTTP(w, req)

	// 捕获截断不能影响客户端收到的完整响应
	if w.Body.Len() != len(big) {
		t.Fatalf("client received %d bytes, want %d", w.Body.Len(), len(big))
	}
	details := waitForDetailCount(t, 1)
	d := details[0]
	if len(d.ResponseBody) != 1024 {
		t.Errorf("captured %d bytes, want 1024", len(d.ResponseBody))
	}
	if !d.Truncated {
		t.Error("expected truncated=true")
	}
}

func TestRequestDetailCaptureStream(t *testing.T) {
	setupCaptureTestDB(t)
	saveCaptureGlobals(t, true, 64)

	r := newCaptureRouter(func(r *gin.Engine) {
		r.POST("/v1/chat/completions", func(c *gin.Context) {
			_, _ = common.GetRequestBody(c)
			c.Header("Content-Type", "text/event-stream; charset=utf-8")
			for i := 0; i < 3; i++ {
				_, _ = c.Writer.WriteString(fmt.Sprintf("data: {\"chunk\":%d}\n\n", i))
				c.Writer.Flush()
			}
		})
	})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{}`))
	r.ServeHTTP(w, req)

	details := waitForDetailCount(t, 1)
	d := details[0]
	if !d.IsStream {
		t.Error("expected is_stream=true for SSE response")
	}
	if !strings.Contains(d.ResponseBody, `"chunk":2`) {
		t.Errorf("stream capture missing later chunks: %q", d.ResponseBody)
	}
	if !strings.Contains(w.Body.String(), `"chunk":2`) {
		t.Error("client should still receive all chunks")
	}
}

func TestRequestDetailCaptureUnreadBody(t *testing.T) {
	setupCaptureTestDB(t)
	saveCaptureGlobals(t, true, 64)

	// handler 从未读 body(模拟前置校验失败路径),仍应从原始流捕获请求体
	r := newCaptureRouter(func(r *gin.Engine) {
		r.POST("/v1/test", func(c *gin.Context) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "no available channel"})
		})
	})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/test", strings.NewReader(`{"model":"gpt-test"}`))
	r.ServeHTTP(w, req)

	details := waitForDetailCount(t, 1)
	d := details[0]
	if d.RequestBody != `{"model":"gpt-test"}` {
		t.Errorf("request_body = %q", d.RequestBody)
	}
	if d.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("status = %d", d.StatusCode)
	}
}

func TestDetailReadLimited(t *testing.T) {
	data := []byte("0123456789")
	got, truncated := detailReadLimited(bytes.NewReader(data), 5)
	if got != "01234" || !truncated {
		t.Errorf("got=%q truncated=%v", got, truncated)
	}
	got, truncated = detailReadLimited(bytes.NewReader(data), 10)
	if got != string(data) || truncated {
		t.Errorf("got=%q truncated=%v", got, truncated)
	}
	// 恰好等于上限不算截断
	got, truncated = detailReadLimited(bytes.NewReader(data), 11)
	if got != string(data) || truncated {
		t.Errorf("got=%q truncated=%v", got, truncated)
	}
}
