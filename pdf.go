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
func pagesPerVariant(c Config) int         { return ((len(c.Tasks) + 1) / 2) * len(modes(c)) }
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
				label = "В / 90°"
			case 180:
				label = "Ю / 180°"
			case 270:
				label = "З / 270°"
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
func prompt(task, mode string, v Variant) string {
	if mode == "forward" {
		switch task {
		case "plane":
			return "Постройте дугу плоскости и её полюс: " + planeText(v.Plane) + "."
		case "line":
			return fmt.Sprintf("Нанесите линейный элемент L: азимут погружения %.0f°; угол погружения %.0f°.", v.Line.Trend, v.Line.Plunge)
		case "rake":
			return fmt.Sprintf("Плоскость: %s. Нанесите L при rake %.0f°; определите азимут и угол погружения L.", planeText(v.RakePlane), v.Rake)
		default:
			return "Крыло 1: " + planeText(v.Wing1) + ". Крыло 2: " + planeText(v.Wing2) + ". Постройте крылья, шарнир и обе биссекторные плоскости; определите углы."
		}
	}
	switch task {
	case "plane":
		return "По дуге P определите азимут и угол падения плоскости. Постройте её полюс."
	case "line":
		return "По точке L определите азимут и угол погружения линейного элемента."
	case "rake":
		return "Определите падение плоскости P, азимут и угол погружения L и rake линии L в плоскости P."
	default:
		return "Определите падение крыльев 1 и 2, азимут и погружение шарнира, оба двугранных угла и обе биссекторные плоскости."
	}
}
func answers(task string, v Variant) string {
	switch task {
	case "plane":
		return "P: " + planeText(v.Plane) + ".\nПолюс: " + lineText(lineFromVec(v.Plane.Pole()))
	case "line":
		return "L: " + lineText(v.Line)
	case "rake":
		return fmt.Sprintf("P: %s.\nRake %.0f°.\nL: %s", planeText(v.RakePlane), v.Rake, lineText(v.RakeLine))
	default:
		return fmt.Sprintf("1: %s.\n2: %s.\nШарнир H: %s.\nУглы: %.1f° / %.1f°.\nБиссектриса A: %s.\nБиссектриса B: %s.", planeText(v.Wing1), planeText(v.Wing2), lineText(v.Fold.Hinge), v.Fold.Acute, v.Fold.Supplement, planePrecise(v.Fold.Bisector1), planePrecise(v.Fold.Bisector2))
	}
}
func drawTask(p *gofpdf.Fpdf, task, mode string, v Variant, top float64, teacher bool, index int) {
	textAt(p, 14, top, fmt.Sprintf("%d. %s", index, taskName(task)), 10)
	wrapped(p, 14, top+2, 182, prompt(task, mode, v), 8)
	cx, cy, r := 105., top+69, 50.
	grid(p, cx, cy, r)
	if mode == "inverse" || teacher {
		switch task {
		case "plane":
			curve(p, v.Plane, cx, cy, r, 0)
			curveLabel(p, v.Plane, cx, cy, r, "P")
			if teacher {
				marker(p, lineFromVec(v.Plane.Pole()), cx, cy, r, "N", 1)
			}
		case "line":
			marker(p, v.Line, cx, cy, r, "L", 0)
		case "rake":
			curve(p, v.RakePlane, cx, cy, r, 0)
			curveLabel(p, v.RakePlane, cx, cy, r, "P")
			marker(p, v.RakeLine, cx, cy, r, "L", 0)
		case "fold":
			curve(p, v.Wing1, cx, cy, r, 0)
			curve(p, v.Wing2, cx, cy, r, 1)
			if teacher {
				curve(p, v.Fold.Bisector1, cx, cy, r, 2)
				curve(p, v.Fold.Bisector2, cx, cy, r, 2)
				curveLabel(p, v.Fold.Bisector1, cx, cy, r, "A")
				curveLabel(p, v.Fold.Bisector2, cx, cy, r, "B")
				marker(p, v.Fold.Hinge, cx, cy, r, "H", 2)
			}
			curveLabel(p, v.Wing1, cx, cy, r, "1")
			curveLabel(p, v.Wing2, cx, cy, r, "2")
		}
	}
	if teacher {
		wrapped(p, 14, top+19, 35, answers(task, v), 7)
		wrapped(p, 163, top+20, 33, "ОТВЕТ\n\nN — полюс\nL — линейность\nH — шарнир\n\nПостроения:\n1 — сплошная\n2 — штриховая\nA, B — точечные", 6.5)
	} else {
		side := "Место для ответа\n\nАзимут: ______\n\nУгол: ______"
		if task == "fold" {
			side = "Шарнир\nАз.: ______\nУгол: ______\n\nУглы крыльев:\n______ / ______\n\nБиссектрисы:\nA: _____ / _____\nB: _____ / _____"
		}
		if task == "rake" {
			side = "Плоскость P:\n_____ / _____\n\nЛинейность L:\n_____ / _____\n\nRake: ______"
		}
		wrapped(p, 14, top+20, 34, side, 7)
		note := "Нижняя полусфера.\n\nАзимуты — от севера по часовой стрелке."
		if task == "rake" {
			note = "Rake: от направления простирания (аз. пад. − 90°) к линии падения, 0–90°."
		}
		if task == "fold" {
			note = "1 — сплошная дуга.\n2 — штриховая.\n\nНайдите острый и смежный углы.\n\nБез полярности складки осевая поверхность неоднозначна."
		}
		wrapped(p, 163, top+20, 33, note, 7)
	}
}
func makePDF(c Config, variants []Variant, teacher bool) ([]byte, error) {
	p := gofpdf.New("P", "mm", "A4", "")
	p.SetMargins(14, 10, 14)
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
	p.SetSubject("Равноугольная стереографическая проекция; нижняя полусфера", true)
	total := len(variants) * pagesPerVariant(c)
	for _, v := range variants {
		for _, mode := range modes(c) {
			for start := 0; start < len(c.Tasks); start += 2 {
				p.AddPage()
				setFont(p, 12)
				size := 12.
				for p.GetStringWidth(c.Title) > 182 && size > 6 {
					size -= .5
					setFont(p, size)
				}
				p.Text(14, 12, c.Title)
				m := "Прямая задача"
				if mode == "inverse" {
					m = "Обратная задача"
				}
				textAt(p, 14, 19, fmt.Sprintf("Вариант %02d · %s · %s", v.Number, m, role), 9)
				if !teacher {
					textAt(p, 14, 25, "ФИО: __________________________________  Группа: __________  Дата: __________", 8)
				} else {
					textAt(p, 14, 25, "Расчётные ответы округлены до 0,1°. Погрешность ручного считывания: ориентир ±2°.", 8)
				}
				for j := 0; j < 2 && start+j < len(c.Tasks); j++ {
					drawTask(p, c.Tasks[start+j], mode, v, 30+128*float64(j), teacher, start+j+1)
				}
				footer := fmt.Sprintf("Набор: %s · Вариант %02d · %d / %d", c.Seed, v.Number, p.PageNo(), total)
				footerSize := 7.
				setFont(p, footerSize)
				for p.GetStringWidth(footer) > 95 && footerSize > 4 {
					footerSize -= .25
					setFont(p, footerSize)
				}
				textAt(p, 14, 290, footer, footerSize)
				textAt(p, 113, 290, "A4 · 100% · диаметр сетки 100 мм", 7)
			}
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
	w.Write([]string{"Вариант", "Задание", "Ответ"})
	for _, v := range vs {
		for _, t := range c.Tasks {
			w.Write([]string{fmt.Sprint(v.Number), taskName(t), strings.ReplaceAll(answers(t, v), "\n", " ")})
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

Печать: A4, «Фактический размер» / 100%, без подгонки страницы.
Диаметр каждой сетки — 100 мм. Проверьте линейкой после печати.
Сетки расположены по две на странице. Каждому варианту соответствуют
все его последовательные страницы; номер указан на каждой странице.

Используется приложенная сетка Wulff10sm.bmp (встроенная PNG-копия).
Равноугольная стереографическая проекция, нижняя полусфера.
Север сверху, восток справа; азимуты от севера по часовой стрелке.
Плоскость задаётся азимутом ПАДЕНИЯ и углом падения.
Линейность задаётся азимутом ПОГРУЖЕНИЯ и углом погружения.
Rake отсчитывается в плоскости от направления простирания
(азимут падения − 90°) к направлению падения; диапазон 0–90°.
Числа в ключе округлены до 0,1°; для ручного считывания ориентир ±2°.
Азимуты 0° и 360° эквивалентны; для горизонтального шарнира
противоположные направления эквивалентны.

Складки: пересечение плоскостей даёт шарнир. Приведены острый
двугранный угол и его дополнение до 180°, а также обе биссекторные
плоскости A и B. По двум неориентированным крыльям нельзя однозначно
выбрать геологический угол складки и осевую поверхность; нужны сведения
о полярности/внутренней области. В заданиях требуется найти обе пары.
Это геометрическая модель симметричной складки, а не восстановление
произвольной природной осевой поверхности.

Повторение набора: введите тот же код набора, шаг, типы заданий,
режим и количество в той же версии программы (алгоритм wulff-v1).
Увеличение количества сохраняет первые варианты при прочих равных.
Программа не требует интернета и не отправляет данные на серверы.
`

func buildFiles(c Config) (map[string][]byte, error) {
	vs := generate(c)
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
	}{"wulff-v1", c, vs}
	j, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return nil, err
	}
	return map[string][]byte{"students.pdf": student, "teacher.pdf": teacher, "answers.csv": makeCSV(c, vs), "settings.json": j, "PRINT_README.txt": []byte(printReadme)}, nil
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
