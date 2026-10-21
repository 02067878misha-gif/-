package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGenerateAndDownload(t *testing.T) {
	a := &app{busy: make(chan struct{}, 1)}
	h := a.handler("/test-token/")
	c := defaultConfig()
	c.Count = 1
	c.Seed = "http-check"
	c.ColorsEnabled = true
	c.ElementColors = map[string]ElementColor{"P": {"#123ABC", "мой синий"}}
	body, _ := json.Marshal(c)
	req := httptest.NewRequest("POST", "http://localhost/test-token/generate", bytes.NewReader(body))
	r := httptest.NewRecorder()
	h.ServeHTTP(r, req)
	if r.Code != 200 {
		t.Fatal(r.Code, r.Body.String())
	}
	var result struct {
		Job, Seed string
		Pages     int
	}
	if err := json.Unmarshal(r.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Pages != 2 || result.Seed != c.Seed {
		t.Fatal(result)
	}
	get := func(path string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRecorder()
		h.ServeHTTP(r, httptest.NewRequest("GET", "http://localhost"+path, nil))
		return r
	}
	z := get("/test-token/download/" + result.Job + "/wulff-set.zip")
	if z.Code != 200 {
		t.Fatal(z.Code)
	}
	zr, err := zip.NewReader(bytes.NewReader(z.Body.Bytes()), int64(z.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	if len(zr.File) != 6 {
		t.Fatal("missing output files")
	}
	for _, f := range zr.File {
		if f.Name == "students.pdf" || f.Name == "teacher.pdf" || f.Name == "student_guide.pdf" {
			r, _ := f.Open()
			data, _ := io.ReadAll(r)
			r.Close()
			if !bytes.HasPrefix(data, []byte("%PDF-")) {
				t.Fatal("not a PDF")
			}
		}
	}
	if get("/test-token/download/old/students.pdf").Code != 404 {
		t.Fatal("stale job accepted")
	}
	settings := get("/test-token/download/" + result.Job + "/settings.json")
	var saved struct {
		Config Config `json:"config"`
	}
	if err := json.Unmarshal(settings.Body.Bytes(), &saved); err != nil {
		t.Fatal(err)
	}
	if !saved.Config.ColorsEnabled || saved.Config.ElementColors["P"] != (ElementColor{"#123abc", "мой синий"}) {
		t.Fatal("Downloaded settings lost the selected colors")
	}
	instructions := get("/test-token/download/" + result.Job + "/PRINT_README.txt")
	if !strings.Contains(instructions.Body.String(), "P — мой синий") {
		t.Fatal("Student color instructions missing")
	}
	if get("/generate").Code != 404 {
		t.Fatal("missing session token accepted")
	}
	if get("/test-token/generate").Code != http.StatusMethodNotAllowed {
		t.Fatal("GET allowed on mutation")
	}
	if get("/test-token/").Code != 200 {
		t.Fatal("UI missing")
	}
	if get("/test-token/guide").Code != 200 {
		t.Fatal("lecture guide missing")
	}
	if get("/test-token/assets/wulff.png").Code != 200 {
		t.Fatal("grid missing")
	}
	if get("/test-token/../go.mod").Code != 404 {
		t.Fatal("non-embedded file exposed")
	}
	r = httptest.NewRecorder()
	req = httptest.NewRequest("POST", "http://localhost/test-token/generate", bytes.NewReader(body))
	req.Header.Set("Origin", "https://other.example")
	h.ServeHTTP(r, req)
	if r.Code != 403 {
		t.Fatal("foreign origin accepted")
	}
}
func TestModesAndPageCounts(t *testing.T) {
	c := defaultConfig()
	if pagesPerVariant(c) != 2 {
		t.Fatal("both-mode count")
	}
	c.Mode = "inverse"
	if pagesPerVariant(c) != 1 {
		t.Fatal("inverse count")
	}
	c.Tasks = c.Tasks[:1]
	if pagesPerVariant(c) != 1 {
		t.Fatal("single task count")
	}
}
