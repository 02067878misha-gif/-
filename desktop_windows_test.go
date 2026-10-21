//go:build windows

package main

import (
	"encoding/json"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/lxn/walk"
)

func TestNativeDesktopWindowAndGeneration(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	root := t.TempDir()
	c := defaultConfig()
	c.Count, c.Seed = 2, "native-windows-check"
	ui, err := newDesktopWindow(c, root)
	if err != nil {
		t.Fatal(err)
	}
	defer ui.dispose()
	ui.window.Show()
	if ui.window.Handle() == 0 || ui.tabs.Pages().Len() != 3 || len(ui.rows) != 13 {
		t.Fatal("Native controls were not created")
	}
	ui.useColors.SetChecked(true)
	ui.rows[0].name.SetText("красным")
	if ui.config().ElementColors["P"].Hex != "#c23632" {
		t.Fatal("Typing a color did not update the native palette")
	}
	ui.applyConfig(defaultConfig())
	if ui.useColors.Checked() {
		t.Fatal("Reset did not restore monochrome mode")
	}
	ui.applyConfig(c)
	ui.useColors.SetChecked(true)
	ui.rows[0].name.SetText("красным")
	// These are screenshots of real native controls, saved as CI artifacts.
	snapshot := func(name string) {
		if directory := os.Getenv("WULFF_GUI_SCREENSHOTS"); directory != "" {
			if err := os.MkdirAll(directory, 0755); err != nil {
				t.Error(err)
				return
			}
			bmp, err := walk.NewBitmapFromWindow(ui.window)
			if err != nil {
				t.Error(err)
				return
			}
			defer bmp.Dispose()
			image, err := bmp.ToImage()
			if err != nil {
				t.Error(err)
				return
			}
			file, err := os.Create(filepath.Join(directory, name+".png"))
			if err != nil {
				t.Error(err)
				return
			}
			defer file.Close()
			if err = png.Encode(file, image); err != nil {
				t.Error(err)
			}
		}
	}
	// Synchronize schedules control interactions through the real message loop.
	go ui.window.Synchronize(func() {
		snapshot("native-interface")
		ui.tabs.SetCurrentIndex(1)
		ui.window.Synchronize(func() {
			snapshot("native-colors")
			ui.tabs.SetCurrentIndex(0)
			ui.window.SetSize(walk.Size{Width: 940, Height: 640})
			ui.window.Synchronize(func() {
				snapshot("native-small-window")
				button := ui.generateButton.BoundsPixels()
				parent := ui.generateButton.Parent().ClientBoundsPixels()
				if button.X < 0 || button.Y < 0 || button.X+button.Width > parent.Width || button.Y+button.Height > parent.Height {
					t.Error("Generation button clipped in the smaller window")
				}
				ui.startGeneration()
			})
		})
	})
	finished := false
	ui.onFinished = func(directory string, err error) {
		defer ui.window.Close()
		finished = true
		if err != nil {
			t.Error(err)
			return
		}
		if ui.busy || directory == "" || ui.savedPath.Text() != directory || !ui.copyButton.Enabled() {
			t.Error("Native window did not finish the generation flow")
		}
		for _, name := range []string{"students.pdf", "teacher.pdf", "student_guide.pdf", "answers.csv", "settings.json", "PRINT_README.txt", "wulff-set.zip"} {
			if _, err := os.Stat(filepath.Join(directory, name)); err != nil {
				t.Error(err)
			}
		}
		var saved struct {
			Config Config `json:"config"`
		}
		data, _ := os.ReadFile(filepath.Join(directory, "settings.json"))
		if err := json.Unmarshal(data, &saved); err != nil {
			t.Error(err)
			return
		}
		if saved.Config.Count != 2 || saved.Config.ElementColors["P"].Name != "красным" {
			t.Error("Native settings not used in generated files")
		}
		ui.applyConfig(*ui.lastConfig)
		if ui.seed.Text() != c.Seed || ui.rows[0].name.Text() != "красным" {
			t.Error("Native settings restore failed")
		}
	}
	ui.window.Run()
	if !finished {
		t.Fatal("Native message loop exited before generation completed")
	}
}
