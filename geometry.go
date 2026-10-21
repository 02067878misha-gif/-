package main

import "math"

// Coordinates are east, north, down. All projections use the lower hemisphere.
type Vec struct{ X, Y, Z float64 }
type Plane struct {
	Az  float64 `json:"dip_direction"`
	Dip float64 `json:"dip"`
}
type Line struct {
	Trend  float64 `json:"trend"`
	Plunge float64 `json:"plunge"`
}
type XY struct{ X, Y float64 }

func rad(x float64) float64       { return x * math.Pi / 180 }
func deg(x float64) float64       { return x * 180 / math.Pi }
func azimuth(x float64) float64   { return math.Mod(math.Mod(x, 360)+360, 360) }
func clamp(x float64) float64     { return math.Max(-1, math.Min(1, x)) }
func (a Vec) Add(b Vec) Vec       { return Vec{a.X + b.X, a.Y + b.Y, a.Z + b.Z} }
func (a Vec) Scale(k float64) Vec { return Vec{a.X * k, a.Y * k, a.Z * k} }
func (a Vec) Dot(b Vec) float64   { return a.X*b.X + a.Y*b.Y + a.Z*b.Z }
func (a Vec) Cross(b Vec) Vec     { return Vec{a.Y*b.Z - a.Z*b.Y, a.Z*b.X - a.X*b.Z, a.X*b.Y - a.Y*b.X} }
func (a Vec) Unit() Vec           { return a.Scale(1 / math.Sqrt(a.Dot(a))) }
func (a Vec) Lower() Vec {
	if a.Z < -1e-12 {
		return a.Scale(-1)
	}
	return a
}
func (l Line) Vec() Vec {
	t, p := rad(l.Trend), rad(l.Plunge)
	return Vec{math.Cos(p) * math.Sin(t), math.Cos(p) * math.Cos(t), math.Sin(p)}
}
func lineFromVec(v Vec) Line {
	v = v.Unit().Lower()
	if math.Hypot(v.X, v.Y) < 1e-10 {
		return Line{0, 90}
	}
	return Line{azimuth(deg(math.Atan2(v.X, v.Y))), deg(math.Asin(clamp(v.Z)))}
}
func (p Plane) Pole() Vec    { return Line{azimuth(p.Az + 180), 90 - p.Dip}.Vec() }
func (p Plane) Strike() Vec  { return Line{azimuth(p.Az - 90), 0}.Vec() }
func (p Plane) DipLine() Vec { return Line{p.Az, p.Dip}.Vec() }
func planeFromPole(v Vec) Plane {
	v = v.Unit().Lower()
	l := lineFromVec(v)
	if math.Hypot(v.X, v.Y) < 1e-10 {
		return Plane{0, 0}
	}
	return Plane{azimuth(l.Trend + 180), 90 - l.Plunge}
}
func (p Plane) RakeLine(r float64) Line {
	return lineFromVec(p.Strike().Scale(math.Cos(rad(r))).Add(p.DipLine().Scale(math.Sin(rad(r)))))
}
func (p Plane) RakeOf(l Line) float64 {
	v := l.Vec()
	return deg(math.Atan2(v.Dot(p.DipLine()), v.Dot(p.Strike())))
}

// Stereographic (equal-angle), NOT equal-area: r=tan(45°-plunge/2).
func project(v Vec) XY {
	v = v.Unit().Lower()
	return XY{v.X / (1 + v.Z), -v.Y / (1 + v.Z)}
}
func unproject(p XY) Vec {
	r2 := p.X*p.X + p.Y*p.Y
	return Vec{2 * p.X / (1 + r2), -2 * p.Y / (1 + r2), (1 - r2) / (1 + r2)}
}
func greatCircle(p Plane) []XY {
	s, d := p.Strike(), p.DipLine()
	pts := make([]XY, 361)
	for i := range pts {
		t := math.Pi * float64(i) / 360
		pts[i] = project(s.Scale(math.Cos(t)).Add(d.Scale(math.Sin(t))))
	}
	return pts
}

type FoldAnswer struct {
	Hinge      Line    `json:"hinge"`
	Acute      float64 `json:"acute_dihedral"`
	Supplement float64 `json:"supplementary_dihedral"`
	Bisector1  Plane   `json:"bisector_1"`
	Bisector2  Plane   `json:"bisector_2"`
}

func solveFold(p, q Plane) FoldAnswer {
	a, b := p.Pole(), q.Pole()
	angle := deg(math.Acos(clamp(math.Abs(a.Dot(b)))))
	return FoldAnswer{lineFromVec(a.Cross(b)), angle, 180 - angle, planeFromPole(a.Add(b)), planeFromPole(a.Add(b.Scale(-1)))}
}
