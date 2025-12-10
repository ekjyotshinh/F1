package main

import (
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

const (
	// Using 127.0.0.1 to avoid IPv6 issues seen with localhost
	pythonServiceURL = "https://python-data-service-production.up.railway.app"
	serverPort       = ":3000"
)

func main() {
	r := gin.Default()

	// CORS configuration
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"https://ekjyotshinh.github.io"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.GET("/", func(c *gin.Context) {
		c.String(http.StatusOK, "F1 Dashboard API (Go/Gin)")
	})

	// Proxy handler for years
	r.GET("/api/years", func(c *gin.Context) {
		targetURL := fmt.Sprintf("%s/api/years", pythonServiceURL)
		proxyRequest(c, targetURL)
	})

	// Proxy handler for schedule
	r.GET("/api/schedule/:year", func(c *gin.Context) {
		year := c.Param("year")
		targetURL := fmt.Sprintf("%s/api/schedule/%s", pythonServiceURL, year)
		proxyRequest(c, targetURL)
	})

	// Proxy handler for race data
	r.GET("/api/race/:year/:race_name", func(c *gin.Context) {
		year := c.Param("year")
		raceName := c.Param("race_name")

		targetURL := fmt.Sprintf("%s/api/race/%s/%s", pythonServiceURL, year, raceName)
		proxyRequest(c, targetURL)
	})

	// Proxy handler for analytics
	r.GET("/api/analytics/:year/:race_name", func(c *gin.Context) {
		year := c.Param("year")
		raceName := c.Param("race_name")

		targetURL := fmt.Sprintf("%s/api/analytics/%s/%s", pythonServiceURL, year, raceName)
		proxyRequest(c, targetURL)
	})

	// Admin endpoint - clear cache
	r.POST("/api/clear-cache", func(c *gin.Context) {
		proxyClearCache(c, pythonServiceURL+"/api/clear-cache")
	})

	fmt.Printf("Server running on http://localhost%s\n", serverPort)
	r.Run(serverPort)
}

func proxyRequest(c *gin.Context, targetURL string) {
	// Create HTTP client with longer timeout for FastF1 data loading
	client := &http.Client{
		Timeout: 120 * time.Second, // 2 minutes for FastF1 downloads
	}
	
	resp, err := client.Get(targetURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to reach data service: %v", err)})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.JSON(resp.StatusCode, gin.H{"error": "Data service returned error"})
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read response body"})
		return
	}

	// Pass through Cache-Control headers from the data service
	if cacheControl := resp.Header.Get("Cache-Control"); cacheControl != "" {
		c.Header("Cache-Control", cacheControl)
	}

	c.Data(resp.StatusCode, "application/json", body)
}

func proxyClearCache(c *gin.Context, targetURL string) {
	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Create POST request
	req, err := http.NewRequest("POST", targetURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to create request: %v", err)})
		return
	}

	// Execute request
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to reach data service: %v", err)})
		return
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read response body"})
		return
	}

	c.Data(resp.StatusCode, "application/json", body)
}

