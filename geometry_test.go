package main

import (
	"fmt"
	"math"
	"reflect"
	"testing"
)

func near(t *testing.T, a, b, eps float64) {
	t.Helper()
	if math.IsNaN(a) || math.Abs(a-b) > eps {
		t.Fatalf("got %.12f, want %.12f", a, b)
	}
}
func sameAxis(t *testing.T, a, b Vec) {
	t.Helper()
	near(t, math.Abs(a.Unit().Dot(b.Unit())), 1, 1e-10)
}
func TestStereographicReferencePoints(t *testing.T) {
	// Analytic stereographic radii; these distinguish Wulff from Schmidt.
	for _, tc := range []struct {
		l    Line
		x, y float64
	}{
		{Line{0, 0}, 0, -1}, {Line{90, 0}, 1, 0}, {Line{180, 0}, 0, 1}, {Line{270, 0}, -1, 0},
		{Line{0, 90}, 0, 0}, {Line{90, 30}, 1 / math.Sqrt(3), 0}, {Line{90, 45}, math.Sqrt(2) - 1, 0},
	} {
		p := project(tc.l.Vec())
		near(t, p.X, tc.x, 1e-10)
		near(t, p.Y, tc.y, 1e-10)
		sameAxis(t, unproject(p), tc.l.Vec())
	}
}
func TestPlaneReferencePoints(t *testing.T) {
	p := Plane{90, 45}
	pole := lineFromVec(p.Pole())
	near(t, pole.Trend, 270, 1e-9)
	near(t, pole.Plunge, 45, 1e-9)
	c := greatCircle(p)
	near(t, c[0].X, 0, 1e-9)
	near(t, c[0].Y, -1, 1e-9)
	near(t, c[180].X, math.Sqrt(2)-1, 1e-9)
	near(t, c[180].Y, 0, 1e-9)
	for _, q := range greatCircle(Plane{90, 90}) {
		near(t, q.X, 0, 1e-9)
	}
	for _, q := range greatCircle(Plane{90, 0}) {
		near(t, q.X*q.X+q.Y*q.Y, 1, 1e-9)
	}
}
func TestRakeReference(t *testing.T) {
	p := Plane{90, 60}
	l := p.RakeLine(30)
	near(t, l.Trend, 16.102113751986, 1e-9)
	near(t, l.Plunge, 25.658906273255, 1e-9)
	near(t, p.Pole().Dot(l.Vec()), 0, 1e-10)
	near(t, p.RakeOf(l), 30, 1e-9)
	sameAxis(t, p.RakeLine(0).Vec(), p.Strike())
	sameAxis(t, p.RakeLine(90).Vec(), p.DipLine())
}
func TestFoldReference(t *testing.T) {
	// Two opposite 30-degree dips intersect horizontally; bisectors are
	// horizontal and vertical, dihedral angles 60 and 120 degrees.
	p, q := Plane{0, 30}, Plane{180, 30}
	a := solveFold(p, q)
	near(t, a.Acute, 60, 1e-9)
	near(t, a.Supplement, 120, 1e-9)
	near(t, a.Hinge.Plunge, 0, 1e-9)
	sameAxis(t, a.Hinge.Vec(), Line{90, 0}.Vec())
	near(t, a.Bisector1.Dip, 0, 1e-9)
	near(t, a.Bisector2.Dip, 90, 1e-9)
}
func TestGeneratedGeometry(t *testing.T) {
	for _, step := range []int{1, 5, 10} {
		for _, seed := range []string{"reference", "геология-2026", "12345", "20"} {
			c := defaultConfig()
			c.Step = step
			c.Seed = seed
			if err := c.Validate(); err != nil {
				t.Fatal(err)
			}
			vs := generate(c)
			for _, pair := range vs {
				for _, v := range []Elements{pair.Elements, pair.Inverse} {
					for _, p := range []Plane{v.Plane, v.RakePlane, v.Wing1, v.Wing2} {
						sameAxis(t, planeFromPole(p.Pole()).Pole(), p.Pole())
						for _, pt := range greatCircle(p) {
							near(t, unproject(pt).Dot(p.Pole()), 0, 1e-9)
							if pt.X*pt.X+pt.Y*pt.Y > 1+1e-9 {
								t.Fatal("point outside net")
							}
						}
					}
					near(t, v.RakePlane.Pole().Dot(v.RakeLine.Vec()), 0, 1e-9)
					near(t, v.RakePlane.RakeOf(v.RakeLine), v.Rake, 1e-9)
					h := v.Fold.Hinge.Vec()
					near(t, h.Dot(v.Wing1.Pole()), 0, 1e-9)
					near(t, h.Dot(v.Wing2.Pole()), 0, 1e-9)
					a, b := v.Fold.Bisector1.Pole(), v.Fold.Bisector2.Pole()
					near(t, a.Dot(b), 0, 1e-9)
					for _, n := range []Vec{a, b} {
						near(t, math.Abs(n.Dot(v.Wing1.Pole())), math.Abs(n.Dot(v.Wing2.Pole())), 1e-9)
						near(t, n.Dot(h), 0, 1e-9)
					}
					near(t, v.Fold.Acute+v.Fold.Supplement, 180, 1e-9)
				}
			}
		}
	}
}
func TestSeedRepeatabilityAndUniqueness(t *testing.T) {
	for _, task := range []string{"plane", "line", "rake", "fold"} {
		c := defaultConfig()
		c.Tasks = []string{task}
		c.Seed = "teaching"
		a := generate(c)
		b := generate(c)
		if !reflect.DeepEqual(a, b) {
			t.Fatal("seed is not stable")
		}
		c.Count = 5
		if !reflect.DeepEqual(a[:5], generate(c)) {
			t.Fatal("prefix changed")
		}
		for i, v := range a {
			for _, w := range a[:i] {
				switch task {
				case "plane":
					if v.Plane == w.Plane {
						t.Fatal("duplicate plane")
					}
				case "line":
					if v.Line == w.Line {
						t.Fatal("duplicate line")
					}
				case "rake":
					if v.RakePlane == w.RakePlane && v.Rake == w.Rake {
						t.Fatal("duplicate rake")
					}
				case "fold":
					if v.Wing1 == w.Wing1 && v.Wing2 == w.Wing2 {
						t.Fatal("duplicate fold")
					}
				}
			}
		}
	}
}
func TestInvalidConfig(t *testing.T) {
	for _, mutate := range []func(*Config){func(c *Config) { c.Count = 0 }, func(c *Config) { c.Count = 21 }, func(c *Config) { c.Tasks = nil }, func(c *Config) { c.Tasks = []string{"line", "line"} }, func(c *Config) { c.Tasks = []string{"bad"} }, func(c *Config) { c.Mode = "bad" }, func(c *Config) { c.Step = 3 }, func(c *Config) { c.Seed = "a\nb" }} {
		c := defaultConfig()
		mutate(&c)
		if c.Validate() == nil {
			t.Fatal("accepted invalid config", c)
		}
	}
}

func TestInverseUsesDistinctElements(t *testing.T) {
	c := defaultConfig()
	c.Seed = "independent-values"
	vs := generate(c)
	planes := map[Plane]bool{}
	lines := map[Line]bool{}
	rakes := map[string]bool{}
	folds := map[string]bool{}
	for _, v := range vs {
		for _, e := range []Elements{v.Elements, v.Inverse} {
			if planes[e.Plane] || lines[e.Line] {
				t.Fatal("repeated forward/inverse input")
			}
			planes[e.Plane] = true
			lines[e.Line] = true
			rk := fmt.Sprint(e.RakePlane, e.Rake)
			fk := fmt.Sprint(e.Wing1, e.Wing2)
			if rakes[rk] || folds[fk] {
				t.Fatal("repeated forward/inverse task")
			}
			rakes[rk] = true
			folds[fk] = true
		}
	}
	// Switching presentation direction must not change either data set.
	c.Mode = "inverse"
	if !reflect.DeepEqual(vs, generate(c)) {
		t.Fatal("data depends on mode")
	}
}
