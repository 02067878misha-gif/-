package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	mathrand "math/rand"
	"strings"
)

type Config struct {
	Count         int                     `json:"count"`
	Seed          string                  `json:"seed"`
	Mode          string                  `json:"mode"`
	Step          int                     `json:"step"`
	Tasks         []string                `json:"tasks"`
	Title         string                  `json:"title"`
	ColorsEnabled bool                    `json:"colors_enabled"`
	ElementColors map[string]ElementColor `json:"element_colors,omitempty"`
}
type Elements struct {
	Plane     Plane      `json:"plane"`
	Line      Line       `json:"line"`
	RakePlane Plane      `json:"rake_plane"`
	Rake      float64    `json:"rake"`
	RakeFrom  float64    `json:"rake_from_azimuth"`
	RakeLine  Line       `json:"rake_line"`
	Wing1     Plane      `json:"wing_1"`
	Wing2     Plane      `json:"wing_2"`
	Fold      FoldAnswer `json:"fold_answer"`
}
type Variant struct {
	Number int `json:"number"`
	Elements
	Inverse Elements `json:"inverse"`
}

func (v Variant) ForMode(mode string) Elements {
	if mode == "inverse" {
		return v.Inverse
	}
	return v.Elements
}

func defaultConfig() Config {
	return Config{Count: 20, Mode: "both", Step: 5, Tasks: []string{"plane", "line", "rake", "fold"}, Title: "Стереографические проекции"}
}
func (c *Config) Validate() error {
	if c.Count < 1 || c.Count > 20 {
		return errors.New("Количество вариантов: от 1 до 20")
	}
	if c.Mode != "both" && c.Mode != "forward" && c.Mode != "inverse" {
		return errors.New("Неизвестный режим задач")
	}
	if c.Step != 1 && c.Step != 5 && c.Step != 10 {
		return errors.New("Шаг углов: 1, 5 или 10 градусов")
	}
	if len(c.Tasks) == 0 || len(c.Tasks) > 4 {
		return errors.New("Выберите хотя бы один тип задания")
	}
	seen := map[string]bool{}
	for _, t := range c.Tasks {
		if t != "plane" && t != "line" && t != "rake" && t != "fold" {
			return errors.New("Неизвестный тип задания")
		}
		if seen[t] {
			return errors.New("Повтор типа задания")
		}
		seen[t] = true
	}
	if len([]rune(c.Title)) > 70 || strings.ContainsAny(c.Title, "\r\n\t") {
		return errors.New("Название: до 70 символов, без переносов строк")
	}
	if len([]rune(c.Seed)) > 48 || strings.ContainsAny(c.Seed, "\r\n\t") {
		return errors.New("Код набора: до 48 символов, без переносов строк")
	}
	if c.Title == "" {
		c.Title = "Стереографические проекции"
	}
	if c.Seed == "" {
		var b [6]byte
		if _, err := rand.Read(b[:]); err != nil {
			return err
		}
		c.Seed = hex.EncodeToString(b[:])
	}
	return c.validateColors()
}
func generate(c Config) []Variant {
	rng := func(domain string) *mathrand.Rand {
		h := sha256.Sum256([]byte("wulff-v3/" + domain + "/" + c.Seed))
		return mathrand.New(mathrand.NewSource(int64(binary.LittleEndian.Uint64(h[:8]))))
	}
	forward, inverse := rng("forward"), rng("inverse")
	used := map[string]bool{}
	out := make([]Variant, c.Count)
	for i := range out {
		out[i] = Variant{Number: i + 1, Elements: generateElements(c, forward, used), Inverse: generateElements(c, inverse, used)}
	}
	return out
}

func generateElements(c Config, r *mathrand.Rand, used map[string]bool) Elements {
	angle := func(min, max int) float64 {
		lo := (min + c.Step - 1) / c.Step
		hi := max / c.Step
		return float64((lo + r.Intn(hi-lo+1)) * c.Step)
	}
	plane := func() Plane { return Plane{angle(0, 360-c.Step), angle(15, 75)} }
	for {
		v := Elements{Plane: plane(), Line: Line{angle(0, 360-c.Step), angle(10, 70)}, RakePlane: plane(), Rake: angle(15, 75)}
		v.RakeFrom = azimuth(v.RakePlane.Az - 90 + float64(r.Intn(2))*180)
		v.RakeLine = v.RakePlane.RakeLineFrom(v.Rake, v.RakeFrom)
		for {
			v.Wing1, v.Wing2 = plane(), plane()
			n1, n2 := v.Wing1.Pole(), v.Wing2.Pole()
			if n1.Cross(n2).Dot(n1.Cross(n2)) < 1e-8 {
				continue
			}
			v.Fold = solveFold(v.Wing1, v.Wing2)
			if v.Fold.Acute >= 25 && v.Fold.Acute <= 80 && v.Fold.Hinge.Plunge <= 65 {
				break
			}
		}
		// Ensure uniqueness even if only one task type is selected.
		keys := []string{}
		for _, task := range c.Tasks {
			var k string
			switch task {
			case "plane":
				k = fmt.Sprint(v.Plane)
			case "line":
				k = fmt.Sprint(v.Line)
			case "rake":
				k = fmt.Sprint(v.RakePlane, v.Rake, v.RakeFrom)
			case "fold":
				k = fmt.Sprint(v.Wing1, v.Wing2)
			}
			keys = append(keys, task+k)
		}
		duplicate := false
		for _, k := range keys {
			if used[k] {
				duplicate = true
			}
		}
		if duplicate {
			continue
		}
		for _, k := range keys {
			used[k] = true
		}
		return v
	}
}
