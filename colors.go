package main

import (
	"encoding/hex"
	"fmt"
	"strings"
	"unicode"
)

type ElementColor struct {
	Hex  string `json:"hex"`
	Name string `json:"name"`
}

type colorElement struct {
	Key, Label, Task string
	Default          ElementColor
}

var colorElements = []colorElement{
	{"P", "P", "plane", ElementColor{"#2457a7", "синий"}},
	{"Np", "Np", "plane", ElementColor{"#7541a0", "фиолетовый"}},
	{"L", "L", "line", ElementColor{"#c23632", "красный"}},
	{"R", "R", "rake", ElementColor{"#18784a", "зелёный"}},
	{"Lr", "Lr", "rake", ElementColor{"#a54c13", "оранжевый"}},
	{"K1", "K1", "fold", ElementColor{"#2457a7", "синий"}},
	{"K2", "K2", "fold", ElementColor{"#c23632", "красный"}},
	{"H", "H", "fold", ElementColor{"#7541a0", "фиолетовый"}},
	{"pi", "π", "fold", ElementColor{"#18784a", "зелёный"}},
	{"A", "A", "fold", ElementColor{"#a54c13", "оранжевый"}},
	{"B", "B", "fold", ElementColor{"#087c8c", "бирюзовый"}},
	{"OP1", "ОП1", "fold", ElementColor{"#864a2b", "коричневый"}},
	{"OP2", "ОП2", "fold", ElementColor{"#ad286b", "розовый"}},
}

func (c *Config) validateColors() error {
	// Copy the map so validation does not mutate another configuration's palette.
	colors := make(map[string]ElementColor, len(colorElements))
	for _, e := range colorElements {
		colors[e.Key] = e.Default
	}
	for key, color := range c.ElementColors {
		if _, ok := colors[key]; !ok {
			return fmt.Errorf("Неизвестный элемент для выбора цвета: %s", key)
		}
		color.Name = strings.TrimSpace(color.Name)
		if len([]rune(color.Name)) == 0 || len([]rune(color.Name)) > 12 || strings.ContainsFunc(color.Name, unicode.IsControl) {
			return fmt.Errorf("Цвет %s: укажите название от 1 до 12 символов без переносов строк", key)
		}
		if len(color.Hex) != 7 || color.Hex[0] != '#' {
			return fmt.Errorf("Цвет %s: выберите оттенок в палитре", key)
		}
		if _, err := hex.DecodeString(color.Hex[1:]); err != nil {
			return fmt.Errorf("Цвет %s: неверный код оттенка", key)
		}
		color.Hex = strings.ToLower(color.Hex)
		colors[key] = color
	}
	c.ElementColors = colors
	return nil
}

func (c Config) elementColor(key string) ElementColor {
	if !c.ColorsEnabled {
		return ElementColor{"#0f0f0f", "чёрный"}
	}
	if color, ok := c.ElementColors[key]; ok {
		return color
	}
	for _, e := range colorElements {
		if e.Key == key {
			return e.Default
		}
	}
	return ElementColor{"#0f0f0f", "чёрный"}
}

func (color ElementColor) rgb() (int, int, int) {
	b, _ := hex.DecodeString(strings.TrimPrefix(color.Hex, "#"))
	return int(b[0]), int(b[1]), int(b[2])
}

func (c Config) colorLegend() string {
	if !c.ColorsEnabled {
		return ""
	}
	var entries []string
	for _, e := range colorElements {
		for _, task := range c.Tasks {
			if task == e.Task {
				entries = append(entries, e.Label+" — "+c.elementColor(e.Key).Name)
				break
			}
		}
	}
	return "Цвета: " + strings.Join(entries, "; ") + "."
}
