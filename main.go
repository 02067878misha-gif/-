package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const version = "1.1.1"

type app struct {
	mu       sync.RWMutex
	files    map[string][]byte
	job      string
	busy     chan struct{}
	last     atomic.Int64
	shutdown func()
}

func token() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}
func fail(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
func (a *app) handler(base string) http.Handler {
	site, _ := fs.Sub(resources, "web")
	assets, _ := fs.Sub(resources, "assets")
	pages := http.FileServer(http.FS(site))
	images := http.StripPrefix(base+"assets/", http.FileServer(http.FS(assets)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'")
		w.Header().Set("Cache-Control", "no-store")
		if !strings.HasPrefix(r.URL.Path, base) {
			http.NotFound(w, r)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host {
			fail(w, "Запрос из другого приложения отклонён", 403)
			return
		}
		a.last.Store(time.Now().Unix())
		path := strings.TrimPrefix(r.URL.Path, base)
		switch {
		case path == "generate":
			if r.Method != "POST" {
				w.Header().Set("Allow", "POST")
				fail(w, "Требуется POST", 405)
				return
			}
			select {
			case a.busy <- struct{}{}:
				defer func() { <-a.busy }()
			default:
				fail(w, "Генерация уже выполняется", 409)
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, 8192)
			defer r.Body.Close()
			var c Config
			d := json.NewDecoder(r.Body)
			d.DisallowUnknownFields()
			if err := d.Decode(&c); err != nil {
				fail(w, "Не удалось прочитать настройки", 400)
				return
			}
			if err := c.Validate(); err != nil {
				fail(w, err.Error(), 400)
				return
			}
			files, err := buildFiles(c)
			if err != nil {
				log.Print(err)
				fail(w, "Не удалось создать PDF: "+err.Error(), 500)
				return
			}
			bundle, err := zipFiles(files)
			if err != nil {
				fail(w, "Не удалось создать архив", 500)
				return
			}
			files["wulff-set.zip"] = bundle
			job := token()
			a.mu.Lock()
			a.files, a.job = files, job
			a.mu.Unlock()
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			json.NewEncoder(w).Encode(map[string]any{"job": job, "seed": c.Seed, "pages": c.Count * pagesPerVariant(c), "count": c.Count, "version": version})
		case strings.HasPrefix(path, "download/"):
			if r.Method != "GET" && r.Method != "HEAD" {
				fail(w, "Требуется GET", 405)
				return
			}
			parts := strings.Split(strings.TrimPrefix(path, "download/"), "/")
			if len(parts) != 2 {
				http.NotFound(w, r)
				return
			}
			a.mu.RLock()
			data, ok := a.files[parts[1]]
			job := a.job
			a.mu.RUnlock()
			if !ok || parts[0] != job {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", mime.TypeByExtension(filepath.Ext(parts[1])))
			if r.URL.Query().Get("inline") == "1" && filepath.Ext(parts[1]) == ".pdf" {
				w.Header().Set("Content-Disposition", "inline")
			} else {
				w.Header().Set("Content-Disposition", `attachment; filename="`+parts[1]+`"`)
			}
			http.ServeContent(w, r, parts[1], time.Time{}, bytes.NewReader(data))
		case path == "ping":
			w.WriteHeader(204)
		case path == "quit":
			if r.Method != "POST" {
				fail(w, "Требуется POST", 405)
				return
			}
			w.WriteHeader(204)
			if a.shutdown != nil {
				go func() { time.Sleep(150 * time.Millisecond); a.shutdown() }()
			}
		case strings.HasPrefix(path, "assets/"):
			images.ServeHTTP(w, r)
		default:
			if path != "" && path != "app.js" && path != "style.css" {
				http.NotFound(w, r)
				return
			}
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/" + path
			pages.ServeHTTP(w, r2)
		}
	})
}
func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.Print("Откройте в браузере: ", url)
	} else {
		go cmd.Wait()
	}
}
func main() {
	c := defaultConfig()
	generateFlag := flag.Bool("generate", false, "Создать PDF без интерфейса")
	out := flag.String("out", "output", "Папка для результатов CLI")
	flag.IntVar(&c.Count, "count", c.Count, "Количество вариантов (1–20)")
	flag.StringVar(&c.Seed, "seed", "", "Код набора")
	flag.StringVar(&c.Mode, "mode", c.Mode, "both, forward, inverse")
	flag.IntVar(&c.Step, "step", c.Step, "Шаг углов (1, 5, 10)")
	tasks := flag.String("tasks", strings.Join(c.Tasks, ","), "Типы: plane,line,rake,fold")
	flag.StringVar(&c.Title, "title", c.Title, "Заголовок")
	noBrowser := flag.Bool("no-browser", false, "Не открывать браузер")
	versionFlag := flag.Bool("version", false, "Версия")
	flag.Parse()
	if *versionFlag {
		fmt.Println(version)
		return
	}
	if *generateFlag {
		c.Tasks = strings.Split(*tasks, ",")
		if err := c.Validate(); err != nil {
			log.Fatal(err)
		}
		files, err := buildFiles(c)
		if err != nil {
			log.Fatal(err)
		}
		bundle, err := zipFiles(files)
		if err != nil {
			log.Fatal(err)
		}
		files["wulff-set.zip"] = bundle
		if err := os.MkdirAll(*out, 0755); err != nil {
			log.Fatal(err)
		}
		// Do not silently replace any existing set.
		for name := range files {
			if _, err := os.Stat(filepath.Join(*out, name)); err == nil {
				log.Fatal("Файл уже существует: ", filepath.Join(*out, name))
			} else if !os.IsNotExist(err) {
				log.Fatal(err)
			}
		}
		for name, data := range files {
			if err := os.WriteFile(filepath.Join(*out, name), data, 0644); err != nil {
				log.Fatal(err)
			}
		}
		fmt.Printf("Готово: %d вариантов, %d страниц в каждом PDF. Код: %s. Папка: %s\n", c.Count, c.Count*pagesPerVariant(c), c.Seed, *out)
		return
	}
	l, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	base := "/" + token() + "/"
	url := "http://" + l.Addr().String() + base
	a := &app{busy: make(chan struct{}, 1)}
	a.last.Store(time.Now().Unix())
	server := &http.Server{Handler: a.handler(base), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
	a.shutdown = func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			if time.Now().Unix()-a.last.Load() > 15*60 {
				a.shutdown()
				return
			}
		}
	}()
	fmt.Println("Сетка Вульфа " + version + " · " + url)
	if !*noBrowser {
		openBrowser(url)
	}
	if err := server.Serve(l); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
