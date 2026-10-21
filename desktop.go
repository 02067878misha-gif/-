package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Each desktop generation owns a new directory. Never reuse a previous set.
func saveDesktopSet(c Config, parent string) (directory string, err error) {
	if err = c.Validate(); err != nil {
		return "", err
	}
	if strings.TrimSpace(parent) == "" {
		return "", fmt.Errorf("Выберите папку для сохранения")
	}
	files, err := buildFiles(c)
	if err != nil {
		return "", err
	}
	files["wulff-set.zip"], err = zipFiles(files)
	if err != nil {
		return "", err
	}
	if err = os.MkdirAll(parent, 0755); err != nil {
		return "", fmt.Errorf("Не удалось открыть папку для сохранения: %w", err)
	}
	directory, err = os.MkdirTemp(parent, "Комплект_"+time.Now().Format("2006-01-02_15-04-05")+"_")
	if err != nil {
		return "", err
	}
	defer func() {
		if err != nil {
			os.RemoveAll(directory) // Only this call's newly created directory.
		}
	}()
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		var file *os.File
		file, err = os.OpenFile(filepath.Join(directory, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
		if err != nil {
			return directory, err
		}
		_, err = file.Write(files[name])
		closeErr := file.Close()
		if err == nil {
			err = closeErr
		}
		if err != nil {
			return directory, err
		}
	}
	return directory, nil
}

func defaultDesktopDirectory() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "Сетка Вульфа")
	}
	return filepath.Join(home, "Documents", "Сетка Вульфа")
}

var desktopNamedColors = []ElementColor{
	{"#2457a7", "синий"}, {"#c23632", "красный"}, {"#18784a", "зелёный"},
	{"#7541a0", "фиолетовый"}, {"#a54c13", "оранжевый"}, {"#087c8c", "бирюзовый"},
	{"#864a2b", "коричневый"}, {"#ad286b", "розовый"}, {"#0f0f0f", "чёрный"},
	{"#656565", "серый"}, {"#1684ba", "голубой"}, {"#b58b00", "жёлтый"},
}

func desktopNamedColor(name string) (ElementColor, bool) {
	name = strings.ReplaceAll(strings.ToLower(strings.TrimSpace(name)), "ё", "е")
	for _, c := range desktopNamedColors {
		normal := strings.ReplaceAll(c.Name, "ё", "е")
		instrumental := strings.TrimSuffix(strings.TrimSuffix(strings.TrimSuffix(normal, "ый"), "ий"), "ой") + "ым"
		if normal == "синий" {
			instrumental = "синим"
		}
		if name == normal || name == instrumental {
			return c, true
		}
	}
	return ElementColor{}, false
}
