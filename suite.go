package main

import (
	"bytes"
	"io/fs"
	"net/http"
	"strings"
	"time"
)

// The two applications share one local process and token, but keep their
// documents separate so map controls and Wulff controls cannot collide.
func (a *app) suiteHandler(base string) http.Handler {
	files, _ := fs.Sub(resources, "geomap")
	static := http.FileServer(http.FS(files))
	controls := a.handler(base)
	wulffBase := base + "wulff/"
	wulff := a.handler(wulffBase)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, wulffBase) {
			wulff.ServeHTTP(w, r)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
		if !strings.HasPrefix(r.URL.Path, base) {
			http.NotFound(w, r)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host {
			fail(w, "Запрос из другого приложения отклонён", http.StatusForbidden)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, base)
		if path == "ping" || path == "quit" {
			controls.ServeHTTP(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
			return
		}
		a.last.Store(time.Now().Unix())
		if path == "" {
			data, err := resources.ReadFile("geomap/index.html")
			if err != nil {
				http.Error(w, "Не удалось открыть интерфейс", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			http.ServeContent(w, r, "index.html", time.Time{}, bytes.NewReader(data))
			return
		}
		if path != "styles.css" && path != "suite.css" && path != "suite.js" &&
			!(strings.HasPrefix(path, "js/") && strings.HasSuffix(path, ".js") && strings.Count(path, "/") == 1) {
			http.NotFound(w, r)
			return
		}
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/" + path
		static.ServeHTTP(w, r2)
	})
}
