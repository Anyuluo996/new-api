package middleware

import (
	"bytes"
	"io"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// detailCaptureWriter 包装 gin.ResponseWriter,把写给客户端的字节额外截留一份(上限 maxBytes),
// 用于请求详情日志。所有内嵌方法原样转发,SSE Flush/Hijack 不受影响。
type detailCaptureWriter struct {
	gin.ResponseWriter
	buf       bytes.Buffer
	maxBytes  int
	truncated bool
}

func (w *detailCaptureWriter) Write(b []byte) (int, error) {
	if w.buf.Len() < w.maxBytes {
		remaining := w.maxBytes - w.buf.Len()
		if len(b) <= remaining {
			w.buf.Write(b)
		} else {
			w.buf.Write(b[:remaining])
			w.truncated = true
		}
	} else if len(b) > 0 {
		w.truncated = true
	}
	return w.ResponseWriter.Write(b)
}

func (w *detailCaptureWriter) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

// detailReadRequestBody 限量读取请求体:优先走已缓存的 BodyStorage(不经 GetBodyStorage,
// 避免在处理链路从未读过 body 时把全量请求灌入存储);否则直接从原始流限量读。
// 返回内容与是否被截断。必须在响应结束后调用,且不回填 c.Request.Body。
func detailReadRequestBody(c *gin.Context, maxBytes int) (string, bool) {
	if storage, exists := c.Get(common.KeyBodyStorage); exists && storage != nil {
		if bs, ok := storage.(common.BodyStorage); ok {
			reader, err := bs.NewReader()
			if err != nil {
				return "", false
			}
			defer reader.Close()
			return detailReadLimited(reader, maxBytes)
		}
	}
	if c.Request == nil || c.Request.Body == nil {
		return "", false
	}
	return detailReadLimited(c.Request.Body, maxBytes)
}

func detailReadLimited(r io.Reader, maxBytes int) (string, bool) {
	data, err := io.ReadAll(io.LimitReader(r, int64(maxBytes)+1))
	if err != nil && len(data) == 0 {
		return "", false
	}
	if len(data) > maxBytes {
		return string(data[:maxBytes]), true
	}
	return string(data), false
}

// RequestDetailCapture 在 relay 路由上捕获每次请求的完整请求体/响应体并落库,
// 受 common.DetailLogEnabled 开关控制;记录通过 request_id 与消费日志关联。
func RequestDetailCapture() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !common.DetailLogEnabled {
			c.Next()
			return
		}
		maxBytes := common.DetailLogMaxBodyKB * 1024
		if maxBytes <= 0 {
			maxBytes = 64 * 1024
		}
		start := time.Now()
		cw := &detailCaptureWriter{ResponseWriter: c.Writer, maxBytes: maxBytes}
		c.Writer = cw

		c.Next()

		requestBody, requestTruncated := detailReadRequestBody(c, maxBytes)
		contentType := cw.Header().Get("Content-Type")
		detail := &model.RequestDetail{
			CreatedAt:    common.GetTimestamp(),
			RequestId:    c.GetString(common.RequestIdKey),
			UserId:       c.GetInt("id"),
			TokenId:      c.GetInt("token_id"),
			TokenName:    c.GetString("token_name"),
			ChannelId:    common.GetContextKeyInt(c, constant.ContextKeyChannelId),
			ModelName:    common.GetContextKeyString(c, constant.ContextKeyOriginalModel),
			Endpoint:     c.Request.URL.Path,
			IsStream:     strings.Contains(contentType, "text/event-stream"),
			StatusCode:   cw.Status(),
			UseTime:      int(time.Since(start).Seconds()),
			RequestBody:  requestBody,
			ResponseBody: cw.buf.String(),
			Truncated:    cw.truncated || requestTruncated,
		}
		go model.RecordRequestDetail(detail)
	}
}
