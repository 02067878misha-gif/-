package main

import (
	"archive/zip"
	"bytes"
	"embed"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/phpdave11/gofpdf"
)

//go:embed assets/* web/*
var resources embed.FS

func planeText(p Plane) string {
	return fmt.Sprintf("аз. пад. %.0f°; угол %.0f°", p.Az, p.Dip)
}
func planePrecise(p Plane) string {
	return fmt.Sprintf("аз. пад. %.1f°; угол %.1f°", p.Az, p.Dip)
}
func lineText(l Line) string {
	return fmt.Sprintf("аз. погр. %.1f°; погр. %.1f°", l.Trend, l.Plunge)
}
func taskName(t string) string {
	switch t {
	case "plane":
		return "Плоскость"
	case "line":
		return "Линейный элемент"
	case "rake":
		return "Линейность в плоскости · rake"
	default:
		return "Крылья складки"
	}
}
func modes(c Config) []string {
	if c.Mode == "both" {
		return []string{"forward", "inverse"}
	}
	return []string{c.Mode}
}
func pagesPerVariant(c Config) int         { return len(modes(c)) }
func setFont(p *gofpdf.Fpdf, size float64) { p.SetFont("DV", "", size); p.SetTextColor(25, 30, 35) }
func textAt(p *gofpdf.Fpdf, x, y float64, text string, size float64) {
	setFont(p, size)
	p.Text(x, y, text)
}
func wrapped(p *gofpdf.Fpdf, x, y, w float64, text string, size float64) {
	setFont(p, size)
	p.SetXY(x, y)
	p.MultiCell(w, 4, text, "", "L", false)
}

func grid(p *gofpdf.Fpdf, cx, cy, r float64) {
	p.ImageOptions("wulff", cx-r, cy-r, 2*r, 2*r, false, gofpdf.ImageOptions{ImageType: "PNG"}, 0, "")
	p.SetLineWidth(.25)
	p.SetDrawColor(30, 30, 30)
	p.SetDashPattern(nil, 0)
	p.Circle(cx, cy, r, "D")
	for a := 0; a < 360; a += 10 {
		t := rad(float64(a))
		x, y := math.Sin(t), -math.Cos(t)
		p.Line(cx+r*x, cy+r*y, cx+(r+1.1)*x, cy+(r+1.1)*y)
		if a%30 == 0 {
			label := fmt.Sprint(a)
			switch a {
			case 0:
				label = "С / 0°"
			case 90:
				label = "90°"
			case 180:
				label = "Ю / 180°"
			case 270:
				label = "270°"
			}
			setFont(p, 6.5)
			w := p.GetStringWidth(label)
			tx := cx + (r+4)*x - w/2
			if a == 90 {
				tx = cx + r + 2
			}
			if a == 270 {
				tx = cx - r - 2 - w
			}
			p.Text(tx, cy+(r+4)*y+1, label)
		}
	}
}
func curve(p *gofpdf.Fpdf, pl Plane, cx, cy, r float64, style int) {
	pts := greatCircle(pl)
	path := func() {
		p.MoveTo(cx+r*pts[0].X, cy+r*pts[0].Y)
		for _, pt := range pts[1:] {
			p.LineTo(cx+r*pt.X, cy+r*pt.Y)
		}
		p.DrawPath("D")
	}
	// A narrow white halo separates the construction from the dense net.
	p.SetDashPattern(nil, 0)
	p.SetDrawColor(255, 255, 255)
	p.SetLineWidth(1.05)
	path()
	p.SetDrawColor(15, 15, 15)
	p.SetLineWidth(.65)
	switch style {
	case 1:
		p.SetDashPattern([]float64{2, 1}, 0)
	case 5:
		p.SetDashPattern([]float64{.5, .8}, 0)
		p.SetDrawColor(90, 90, 90)
		p.SetLineWidth(.45)
	case 3:
		p.SetDashPattern([]float64{4, 1.5}, 0)
	case 4:
		p.SetDashPattern([]float64{4, 1, .6, 1}, 0)
	case 2:
		p.SetDashPattern([]float64{.45, 1.1}, 0)
		p.SetLineWidth(.4)
	default:
		p.SetDashPattern(nil, 0)
	}
	path()
	p.SetDashPattern(nil, 0)
}
func marker(p *gofpdf.Fpdf, l Line, cx, cy, r float64, label string, kind int) {
	v := project(l.Vec())
	x, y := cx+r*v.X, cy+r*v.Y
	p.SetDrawColor(0, 0, 0)
	p.SetFillColor(255, 255, 255)
	p.SetLineWidth(.5)
	switch kind {
	case 1:
		p.Line(x-1.5, y, x+1.5, y)
		p.Line(x, y-1.5, x, y+1.5)
	case 3:
		p.Rect(x-1.3, y-1.3, 2.6, 2.6, "DF")
	case 2:
		p.Polygon([]gofpdf.PointType{{X: x, Y: y - 1.7}, {X: x + 1.7, Y: y}, {X: x, Y: y + 1.7}, {X: x - 1.7, Y: y}}, "DF")
	default:
		p.Circle(x, y, 1.25, "DF")
		p.SetFillColor(0, 0, 0)
		p.Circle(x, y, .45, "F")
	}
	setFont(p, 8)
	w := p.GetStringWidth(label)
	p.SetFillColor(255, 255, 255)
	p.Rect(x+1.8, y-3.8, w+1, 4, "F")
	p.Text(x+2.2, y-.5, label)
}
func curveLabel(p *gofpdf.Fpdf, pl Plane, cx, cy, r float64, label string) {
	l := pl.DipLine()
	v := project(l)
	x, y := cx+r*v.X, cy+r*v.Y
	setFont(p, 7.5)
	w := p.GetStringWidth(label)
	p.SetFillColor(255, 255, 255)
	p.Rect(x+1, y-4, w+1, 4, "F")
	p.Text(x+1.5, y-1, label)
}

// Every selected element shares this single net, in both task directions.
func elementLabel(task string) string {
	switch task {
	case "plane":
		return "P · плоскость"
	case "line":
		return "L · линейность"
	case "rake":
		return "Склонение (rake)"
	default:
		return "K1, K2 · складка"
	}
}
func directionName(a float64) string {
	a = azimuth(a)
	for i, n := range []string{"С", "В", "Ю", "З"} {
		if math.Abs(a-float64(i*90)) < 1e-8 {
			return n
		}
	}
	return []string{"СВ", "ЮВ", "ЮЗ", "СЗ"}[int(a/90)]
}
func rakeStart(v Elements) string {
	return fmt.Sprintf("%s (аз. %.0f°)", directionName(v.RakeFrom), v.RakeFrom)
}
func prompt(task, mode string, v Elements) string {
	if mode == "forward" {
		switch task {
		case "plane":
			return "P: " + planeText(v.Plane) + ". Постройте дугу большого круга P и полюс Np (перпендикуляр к P)."
		case "line":
			return fmt.Sprintf("L: азимут погружения %.0f°; угол погружения %.0f°. Отложите угол от внешнего круга и отметьте линейность точкой L.", v.Line.Trend, v.Line.Plunge)
		case "rake":
			return fmt.Sprintf("R (плоскость): %s. Lr (линейность в R): склонение (rake — угол к простиранию) %.0f° от %s конца. Отложите угол по дуге R; найдите азимут и угол погружения Lr.", planeText(v.RakePlane), v.Rake, rakeStart(v))
		default:
			return "Крылья: K1 " + pairPlane(v.Wing1) + "; K2 " + pairPlane(v.Wing2) + " (аз. пад./угол). Пересечение дуг — шарнир H. Найдите его азимут и угол погружения; через π-плоскость — углы и осевые поверхности."
		}
	}
	switch task {
	case "plane":
		return "По дуге большого круга P определите азимут и угол падения плоскости. Постройте полюс Np (перпендикуляр к P)."
	case "line":
		return "По точке L определите азимут и угол погружения линейности: угол считайте от внешнего круга."
	case "rake":
		return "По дуге R (плоскости) и точке Lr (линейности в R) найдите их ориентировку и склонение (rake — угол к простиранию). Укажите конец отсчёта: направление и азимут."
	default:
		return "Определите падение K1, K2. Их пересечение — шарнир H: найдите азимут и угол погружения. Постройте π-плоскость (перпендикулярно H); найдите оба угла и осевые поверхности."
	}
}
func pairPlane(p Plane) string { return fmt.Sprintf("%.1f°/%.1f°", p.Az, p.Dip) }
func pairLine(l Line) string   { return fmt.Sprintf("%.1f°/%.1f°", l.Trend, l.Plunge) }
func answers(task string, v Elements) string {
	switch task {
	case "plane":
		return "P: " + pairPlane(v.Plane) + "; Np: " + pairLine(lineFromVec(v.Plane.Pole()))
	case "line":
		return "L: " + pairLine(v.Line)
	case "rake":
		return fmt.Sprintf("R: %s; Lr: %s; склонение (rake) %.0f° от %s", pairPlane(v.RakePlane), pairLine(v.RakeLine), v.Rake, rakeStart(v))
	default:
		return fmt.Sprintf("K1: %s; K2: %s; H (аз./погр.): %s.\nπ-плоскость: %s; углы %.1f° и %.1f°.\nОсевые поверхности (два варианта): ОП1 %s; ОП2 %s.", pairPlane(v.Wing1), pairPlane(v.Wing2), pairLine(v.Fold.Hinge), pairPlane(v.Fold.SectionPlane), v.Fold.Acute, v.Fold.Supplement, pairPlane(v.Fold.Bisector1), pairPlane(v.Fold.Bisector2))
	}
}
func blankAnswer(task string) string {
	switch task {
	case "plane":
		return "P: _____/_____; Np: _____/_____"
	case "line":
		return "L: _____/_____"
	case "rake":
		return "R: _____/_____; Lr: _____/_____; склонение (rake): _____ от конца простирания _____ (аз. _____)"
	default:
		return "K1: _____/_____; K2: _____/_____; H (аз./погр.): _____/_____.\nπ-плоскость: _____/_____; углы: _____ и _____.\nОсевые поверхности (два варианта): ОП1 _____/_____; ОП2 _____/_____."
	}
}
func drawElements(p *gofpdf.Fpdf, c Config, v Elements, cx, cy, r float64, teacher bool) {
	// Curves first, labels and point markers last, so intersections stay readable.
	for _, task := range c.Tasks {
		switch task {
		case "plane":
			curve(p, v.Plane, cx, cy, r, 0)
		case "rake":
			curve(p, v.RakePlane, cx, cy, r, 1)
		case "fold":
			curve(p, v.Wing1, cx, cy, r, 3)
			curve(p, v.Wing2, cx, cy, r, 4)
			if teacher {
				curve(p, v.Fold.SectionPlane, cx, cy, r, 5)
				curve(p, v.Fold.Bisector1, cx, cy, r, 2)
				curve(p, v.Fold.Bisector2, cx, cy, r, 2)
			}
		}
	}
	for _, task := range c.Tasks {
		switch task {
		case "plane":
			curveLabel(p, v.Plane, cx, cy, r, "P")
			if teacher {
				marker(p, lineFromVec(v.Plane.Pole()), cx, cy, r, "Np", 1)
			}
		case "line":
			marker(p, v.Line, cx, cy, r, "L", 0)
		case "rake":
			curveLabel(p, v.RakePlane, cx, cy, r, "R")
			marker(p, v.RakeLine, cx, cy, r, "Lr", 3)
		case "fold":
			curveLabel(p, v.Wing1, cx, cy, r, "K1")
			curveLabel(p, v.Wing2, cx, cy, r, "K2")
			if teacher {
				curveLabel(p, v.Fold.SectionPlane, cx, cy, r, "π")
				curveLabel(p, v.Fold.Bisector1, cx, cy, r, "ОП1")
				curveLabel(p, v.Fold.Bisector2, cx, cy, r, "ОП2")
				marker(p, v.Fold.Section1, cx, cy, r, "A", 0)
				marker(p, v.Fold.Section2, cx, cy, r, "B", 0)
				marker(p, v.Fold.Hinge, cx, cy, r, "H", 2)
			}
		}
	}
}
func makePDF(c Config, variants []Variant, teacher bool) ([]byte, error) {
	p := gofpdf.New("P", "mm", "A4", "")
	p.SetMargins(12, 10, 12)
	p.SetAutoPageBreak(false, 0)
	p.SetCompression(true)
	font, _ := resources.ReadFile("assets/DejaVuSans.ttf")
	p.AddUTF8FontFromBytes("DV", "", font)
	net, _ := resources.ReadFile("assets/wulff.png")
	p.RegisterImageOptionsReader("wulff", gofpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(net))
	role := "Задания студентам"
	if teacher {
		role = "Ответы преподавателя"
	}
	p.SetTitle(c.Title+" — "+role, true)
	p.SetAuthor("Сетка Вульфа · генератор заданий", true)
	p.SetSubject("Одна крупная сетка на лист A4; нижняя полусфера", true)
	total := len(variants) * pagesPerVariant(c)
	for _, variant := range variants {
		for _, mode := range modes(c) {
			v := variant.ForMode(mode)
			p.AddPage()
			size := 12.
			setFont(p, size)
			for p.GetStringWidth(c.Title) > 186 && size > 6 {
				size -= .5
				setFont(p, size)
			}
			p.Text(12, 11, c.Title)
			m := "Прямая задача"
			if mode == "inverse" {
				m = "Обратная задача · новый набор элементов"
			}
			textAt(p, 12, 18, fmt.Sprintf("Вариант %02d · %s · %s", variant.Number, m, role), 8)
			if teacher {
				textAt(p, 12, 24, "Ответы ниже сетки: азимут/угол, в градусах. Расчёт до 0,1°; ручное считывание — ориентир ±2°.", 7)
			} else {
				textAt(p, 12, 24, "ФИО: __________________________________  Группа: __________  Дата: __________", 8)
			}
			instruction := "Сетка Вульфа, нижняя полусфера. Все элементы — на одной кальке; после построений верните север к 0°."
			if mode == "inverse" {
				instruction = "На сетке — новый набор элементов. Определите их параметры; выполните вспомогательные построения на кальке."
			}
			textAt(p, 12, 30, instruction, 7.5)
			p.SetDrawColor(160, 170, 160)
			p.SetLineWidth(.15)
			for i, task := range c.Tasks {
				y := 34 + 8.5*float64(i)
				p.Line(12, y, 198, y)
				textAt(p, 12, y+3.8, elementLabel(task), 7.5)
				setFont(p, 7.2)
				p.SetXY(47, y+.7)
				p.MultiCell(151, 3.4, prompt(task, mode, v), "", "L", false)
			}
			grid(p, 105, 166, 90)
			if mode == "inverse" || teacher {
				drawElements(p, c, v, 105, 166, 90, teacher)
			}
			textAt(p, 12, 265, "Ответы: азимут/угол, в градусах. Для плоскости — падение, для линии — погружение.", 7)
			y := 267.
			for _, task := range c.Tasks {
				text := blankAnswer(task)
				if teacher {
					text = answers(task, v)
				}
				setFont(p, 7)
				p.SetXY(12, y)
				p.MultiCell(186, 3.4, text, "", "L", false)
				y = p.GetY()
			}
			footer := fmt.Sprintf("Набор: %s · Вариант %02d · %d/%d", c.Seed, variant.Number, p.PageNo(), total)
			size = 7
			setFont(p, size)
			for p.GetStringWidth(footer) > 110 && size > 4 {
				size -= .25
				setFont(p, size)
			}
			textAt(p, 12, 292, footer, size)
			textAt(p, 136, 292, "A4 · 100% · сетка 180 мм", 7)
		}
	}
	var b bytes.Buffer
	err := p.Output(&b)
	return b.Bytes(), err
}
func makeCSV(c Config, vs []Variant) []byte {
	var b bytes.Buffer
	b.Write([]byte{0xef, 0xbb, 0xbf})
	w := csv.NewWriter(&b)
	w.Comma = ';'
	w.Write([]string{"Вариант", "Направление", "Задание", "Ответ"})
	for _, v := range vs {
		for _, mode := range modes(c) {
			for _, t := range c.Tasks {
				w.Write([]string{fmt.Sprint(v.Number), mode, taskName(t), strings.ReplaceAll(answers(t, v.ForMode(mode)), "\n", " ")})
			}
		}
	}
	w.Flush()
	return b.Bytes()
}

const printReadme = `СЕТКА ВУЛЬФА — КОМПЛЕКТ ДЛЯ ПЕЧАТИ

students.pdf — только задания, без численных ответов.
teacher.pdf — задания, построения и ответы; студентам не выдавать.
answers.csv — краткие ответы, UTF-8 с BOM, разделитель «;» для Excel.
settings.json — параметры набора и полные расчётные ответы.
student_guide.pdf — общая памятка по построениям (2 страницы).
Памятка отдельная: к двум листам каждого варианта её добавлять не нужно.

Печать: A4, «Фактический размер» / 100%, без подгонки страницы.
Диаметр каждой сетки — 180 мм. Проверьте линейкой после печати.
На каждой странице A4 — одна крупная сетка, общая для всех элементов.
Прямая и обратная задачи занимают по одному отдельному листу.
Значения обратной задачи генерируются отдельно от прямой.
При обоих направлениях: 2 листа на вариант, 40 листов на 20 вариантов.

Используется приложенная сетка Wulff10sm.bmp (встроенная PNG-копия).
Равноугольная стереографическая проекция, нижняя полусфера.
Север сверху, восток справа; азимуты от севера по часовой стрелке.
Плоскость задаётся азимутом ПАДЕНИЯ и углом падения.
Линейность задаётся азимутом ПОГРУЖЕНИЯ и углом погружения.
Обозначения общей сетки: P — плоскость, Np — её полюс; L — линия;
R — плоскость для rake, Lr — линия в ней; K1, K2 — крылья складки.
P — сплошная, R — штриховая, K1 — длинные штрихи, K2 — штрихпунктир.
H — шарнир; π — плоскость, перпендикулярная шарниру;
A, B — пересечения π-плоскости с крыльями;
ОП1, ОП2 — два возможных положения осевой поверхности.
Склонение (rake) отсчитывается вдоль дуги большого круга
от УКАЗАННОГО конца простирания (например, СЗ с точным азимутом), 0–90°.
В обратной задаче укажите и угол, и конец отсчёта.
Числа в ключе округлены до 0,1°; для ручного считывания ориентир ±2°.
Азимуты 0° и 360° эквивалентны; для горизонтального шарнира
противоположные направления эквивалентны.

Складки: пересечение плоскостей даёт шарнир. Приведены острый
двугранный угол и его дополнение до 180°, а также обе биссекторные
плоскости ОП1 и ОП2. По двум неориентированным крыльям нельзя однозначно
выбрать геологический угол складки и осевую поверхность; нужны сведения
о полярности/внутренней области. В заданиях требуется найти обе пары.
Это геометрическая модель симметричной складки, а не восстановление
произвольной природной осевой поверхности.

Повторение набора: введите тот же код набора, шаг, типы заданий,
режим и количество в той же версии программы (алгоритм wulff-v3).
Увеличение количества сохраняет первые варианты при прочих равных.
Программа не требует интернета и не отправляет данные на серверы.
`

func buildFiles(c Config) (map[string][]byte, error) {
	vs := generate(c)
	guide, err := makeGuidePDF()
	if err != nil {
		return nil, err
	}
	student, err := makePDF(c, vs, false)
	if err != nil {
		return nil, err
	}
	teacher, err := makePDF(c, vs, true)
	if err != nil {
		return nil, err
	}
	meta := struct {
		Algorithm string    `json:"algorithm"`
		Config    Config    `json:"config"`
		Variants  []Variant `json:"variants"`
	}{"wulff-v3", c, vs}
	j, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return nil, err
	}
	return map[string][]byte{"students.pdf": student, "teacher.pdf": teacher, "answers.csv": makeCSV(c, vs), "settings.json": j, "PRINT_README.txt": []byte(printReadme), "student_guide.pdf": guide}, nil
}
func zipFiles(files map[string][]byte) ([]byte, error) {
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		w, err := z.Create(name)
		if err != nil {
			return nil, err
		}
		if _, err = w.Write(files[name]); err != nil {
			return nil, err
		}
	}
	if err := z.Close(); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}
