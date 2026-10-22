package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSuiteServesBothApplicationsAndKeepsGeneratedFiles(t *testing.T) {
	a := &app{busy: make(chan struct{}, 1)}
	server := httptest.NewServer(a.suiteHandler("/suite-token/"))
	defer server.Close()
	get := func(path string, status int, contains string) {
		t.Helper()
		r, err := http.Get(server.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		data, _ := io.ReadAll(r.Body)
		if r.StatusCode != status || !strings.Contains(string(data), contains) {
			t.Fatalf("%s: status %d, missing %q", path, r.StatusCode, contains)
		}
	}
	get("/suite-token/", 200, `id="tab-wulff"`)
	get("/suite-token/", 200, `id="mapSvg"`)
	get("/suite-token/js/geology.js", 200, "generateModel")
	get("/suite-token/suite.js", 200, "embedded=1")
	get("/suite-token/wulff/?embedded=1", 200, `id="settings"`)
	get("/suite-token/wulff/app.js", 200, "colors_enabled")
	get("/suite-token/wulff/guide", 200, "%PDF-")
	get("/", 404, "")
	get("/suite-token/ORIGIN.md", 404, "")
	get("/suite-token/js/../README_RU.txt", 404, "")
	c := defaultConfig()
	c.Count, c.Seed, c.ColorsEnabled = 1, "suite-preserves-output", true
	body, _ := json.Marshal(c)
	r, err := http.Post(server.URL+"/suite-token/wulff/generate", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	var result struct {
		Job string `json:"job"`
	}
	if r.StatusCode != 200 || json.NewDecoder(r.Body).Decode(&result) != nil {
		t.Fatal("Embedded generation failed", r.StatusCode)
	}
	get("/suite-token/", 200, "Геологическая карта")
	get("/suite-token/js/stratigraphy.js", 200, "DIVISIONS")
	get("/suite-token/wulff/download/"+result.Job+"/students.pdf", 200, "%PDF-")
	get("/suite-token/wulff/download/"+result.Job+"/settings.json", 200, "suite-preserves-output")
	for _, path := range []string{"/suite-token/quit", "/suite-token/wulff/generate"} {
		req, _ := http.NewRequest("POST", server.URL+path, bytes.NewReader(body))
		req.Header.Set("Origin", "https://another.example")
		response, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != 403 {
			t.Fatal("Foreign-origin request accepted", path)
		}
	}
	get("/suite-token/quit", 405, "")
}
