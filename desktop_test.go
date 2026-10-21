package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestDesktopSavesCompleteSetsWithoutReplacingEarlierFiles(t *testing.T) {
	root := t.TempDir()
	c := defaultConfig()
	c.Count, c.Seed, c.ColorsEnabled = 1, "desktop-check", true
	first, err := saveDesktopSet(c, root)
	if err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(filepath.Join(first, "students.pdf"))
	if err != nil {
		t.Fatal(err)
	}
	second, err := saveDesktopSet(c, root)
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("A second generation reused an existing directory")
	}
	after, _ := os.ReadFile(filepath.Join(first, "students.pdf"))
	if !bytes.Equal(before, after) {
		t.Fatal("Previous assignment was replaced")
	}
	for _, folder := range []string{first, second} {
		files, _ := os.ReadDir(folder)
		if len(files) != 7 {
			t.Fatal("Missing PDF, key or archive", folder)
		}
		var saved struct {
			Config Config `json:"config"`
		}
		data, _ := os.ReadFile(filepath.Join(folder, "settings.json"))
		if err = json.Unmarshal(data, &saved); err != nil {
			t.Fatal(err)
		}
		if saved.Config.Seed != c.Seed || !saved.Config.ColorsEnabled || len(saved.Config.ElementColors) != 13 {
			t.Fatal("Desktop output lost its settings")
		}
	}
	blocker := filepath.Join(root, "existing-file")
	os.WriteFile(blocker, []byte("preserve me"), 0644)
	if _, err = saveDesktopSet(c, blocker); err == nil {
		t.Fatal("File accepted as output directory")
	}
	data, _ := os.ReadFile(blocker)
	if string(data) != "preserve me" {
		t.Fatal("Existing file changed")
	}
}

func TestDesktopRecognizesWrittenColorNames(t *testing.T) {
	for _, name := range []string{"красный", " КРАСНЫМ ", "синий", "синим", "зелёным", "зеленый", "голубым", "жёлтым"} {
		if _, ok := desktopNamedColor(name); !ok {
			t.Errorf("Known color not recognized: %s", name)
		}
	}
	if _, ok := desktopNamedColor("мой оттенок"); ok {
		t.Fatal("Custom color name silently changed its shade")
	}
}
