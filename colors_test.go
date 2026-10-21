package main

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestColorsKeepExistingVariantsAndOldSettingsCompatible(t *testing.T) {
	var old Config
	if err := json.Unmarshal([]byte(`{"count":2,"seed":"same-geometry","mode":"both","step":5,"tasks":["plane","line","rake","fold"]}`), &old); err != nil {
		t.Fatal(err)
	}
	if err := old.Validate(); err != nil {
		t.Fatal(err)
	}
	before := generate(old)
	colored := old
	colored.ColorsEnabled = true
	colored.ElementColors = map[string]ElementColor{"P": {"#123ABC", "мой синий"}}
	if err := colored.Validate(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, generate(colored)) {
		t.Fatal("Changing colors changed the assignment values")
	}
	if old.ColorsEnabled || old.colorLegend() != "" || old.elementColor("P").Hex != "#0f0f0f" {
		t.Fatal("Old settings must remain monochrome")
	}
	if colored.ElementColors["P"].Hex != "#123abc" || len(colored.ElementColors) != len(colorElements) {
		t.Fatal("Custom color or missing defaults lost")
	}
	data, _ := json.Marshal(colored)
	var decoded Config
	if err := json.Unmarshal(data, &decoded); err != nil || !reflect.DeepEqual(colored, decoded) {
		t.Fatal("Palette was not preserved in settings JSON", err)
	}
	colored.ElementColors["P"] = ElementColor{"#010203", "другой"}
	if old.ElementColors["P"] != colorElements[0].Default {
		t.Fatal("Validation mutated another configuration's palette")
	}
}

func TestRejectInvalidElementColors(t *testing.T) {
	for name, entry := range map[string]ElementColor{
		"missing hash":      {"123456", "синий"},
		"invalid hex":       {"#gg0000", "синий"},
		"short code":        {"#123", "синий"},
		"empty name":        {"#123456", "  "},
		"long name":         {"#123456", "оченьдлинныйцвет"},
		"control character": {"#123456", "синий\nцвет"},
	} {
		t.Run(name, func(t *testing.T) {
			c := defaultConfig()
			c.ElementColors = map[string]ElementColor{"P": entry}
			if err := c.Validate(); err == nil {
				t.Fatal("Invalid color accepted")
			}
		})
	}
	c := defaultConfig()
	c.ElementColors = map[string]ElementColor{"unknown": {"#123456", "синий"}}
	if err := c.Validate(); err == nil {
		t.Fatal("Unknown element accepted")
	}
}
