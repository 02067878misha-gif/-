//go:build windows

package main

import (
	"bytes"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"unsafe"

	"github.com/lxn/walk"
	d "github.com/lxn/walk/declarative"
	"github.com/lxn/win"
)

type desktopColorRow struct {
	entry     colorElement
	name      *walk.ComboBox
	swatch    *walk.Label
	choose    *walk.PushButton
	composite *walk.Composite
	color     ElementColor
}

type desktopWindow struct {
	window                         *walk.MainWindow
	tabs                           *walk.TabWidget
	title, seed, output, savedPath *walk.LineEdit
	count                          *walk.NumberEdit
	step, mode                     *walk.ComboBox
	tasks                          map[string]*walk.CheckBox
	useColors                      *walk.CheckBox
	rows                           []*desktopColorRow
	summary                        *walk.TextLabel
	legend, help                   *walk.TextEdit
	status                         *walk.TextLabel
	progress                       *walk.ProgressBar
	generateButton                 *walk.PushButton
	resetButton                    *walk.PushButton
	copyButton                     *walk.PushButton
	reuseButton                    *walk.PushButton
	browseButton                   *walk.PushButton
	ready, updating, busy          bool
	resultDir                      string
	lastConfig                     *Config
	net                            *walk.Bitmap
	customColors                   [16]win.COLORREF
	// Used by the Windows integration test after the real asynchronous UI flow.
	onFinished func(string, error)
}

func runDesktop(c Config) (bool, error) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	ui, err := newDesktopWindow(c, defaultDesktopDirectory())
	if err != nil {
		walk.MsgBox(nil, "Сетка Вульфа", "Не удалось открыть окно: "+err.Error(), walk.MsgBoxIconError)
		return true, err
	}
	defer ui.dispose()
	ui.window.Run()
	return true, nil
}

func newDesktopWindow(c Config, output string) (*desktopWindow, error) {
	ui := &desktopWindow{tasks: make(map[string]*walk.CheckBox)}
	netData, err := resources.ReadFile("assets/wulff.png")
	if err != nil {
		return nil, err
	}
	image, err := png.Decode(bytes.NewReader(netData))
	if err != nil {
		return nil, err
	}
	ui.net, err = walk.NewBitmapFromImage(image)
	if err != nil {
		return nil, err
	}
	green := walk.RGB(28, 76, 58)
	muted := walk.RGB(91, 110, 96)
	titleFont := d.Font{Family: "Segoe UI", PointSize: 22, Bold: true}
	sectionFont := d.Font{Family: "Segoe UI", PointSize: 11, Bold: true}
	taskWidgets := []d.Widget{}
	for _, task := range []string{"plane", "line", "rake", "fold"} {
		key := task
		taskWidgets = append(taskWidgets, d.CheckBox{Name: key, Text: taskName(key), Checked: true, OnCheckedChanged: ui.update})
		ui.tasks[key] = nil
	}
	colorWidgets := []d.Widget{
		d.TextLabel{Text: "Выберите оттенок и подпишите его для студентов. Знакомое название можно вписать: например, «красным». Для своего оттенка используйте «Выбрать…». Названия печатаются в условиях.", MinSize: d.Size{Width: 300}, TextColor: muted},
		d.CheckBox{AssignTo: &ui.useColors, Text: "Разные цвета элементов", OnCheckedChanged: ui.update},
	}
	colorNames := make([]string, len(desktopNamedColors))
	for i, color := range desktopNamedColors {
		colorNames[i] = color.Name
	}
	for _, element := range colorElements {
		row := &desktopColorRow{entry: element, color: element.Default}
		ui.rows = append(ui.rows, row)
		label := element.Label + " · " + desktopElementDescription(element.Key)
		colorWidgets = append(colorWidgets, d.Composite{
			AssignTo: &row.composite, Layout: d.HBox{MarginsZero: true, Spacing: 10},
			Children: []d.Widget{
				d.Label{Text: label, MinSize: d.Size{Width: 220}, MaxSize: d.Size{Width: 220}},
				d.Label{AssignTo: &row.swatch, Text: "■", Font: d.Font{PointSize: 18}, MinSize: d.Size{Width: 26}},
				d.ComboBox{AssignTo: &row.name, Editable: true, Model: colorNames, MaxLength: 12, MinSize: d.Size{Width: 150}, StretchFactor: 1, OnTextChanged: func() { ui.colorNameChanged(row) }},
				d.PushButton{AssignTo: &row.choose, Text: "Выбрать…", OnClicked: func() { ui.chooseColor(row) }},
			},
		})
	}
	colorWidgets = append(colorWidgets, d.TextLabel{Text: "Метки и типы линий сохраняются при чёрно-белой печати. Цветной режим можно выключить, сохранив настроенные оттенки.", MinSize: d.Size{Width: 300}, TextColor: muted}, d.VSpacer{})
	definitions := d.MainWindow{
		AssignTo: &ui.window, Title: "Сетка Вульфа · " + version, Size: d.Size{Width: 1120, Height: 850}, MinSize: d.Size{Width: 940, Height: 700},
		Font: d.Font{Family: "Segoe UI", PointSize: 10}, Background: d.SolidColorBrush{Color: walk.RGB(246, 248, 243)},
		Layout: d.VBox{Margins: d.Margins{Left: 22, Top: 18, Right: 22, Bottom: 16}, Spacing: 12},
		Children: []d.Widget{
			d.Label{Text: "Сетка Вульфа", Font: titleFont, TextColor: green},
			d.Label{Text: "Задания студентам и готовые ответы преподавателю · работает без интернета", TextColor: muted},
			d.Composite{Layout: d.HBox{MarginsZero: true, Spacing: 16}, StretchFactor: 1, Children: []d.Widget{
				d.TabWidget{AssignTo: &ui.tabs, StretchFactor: 1, Pages: []d.TabPage{
					{Title: "Параметры работы", Layout: d.VBox{Margins: d.Margins{Left: 16, Top: 14, Right: 16, Bottom: 14}, Spacing: 12}, Children: []d.Widget{
						d.Label{Text: "Новый комплект заданий", Font: sectionFont, TextColor: green},
						d.GroupBox{Title: "Параметры", Layout: d.Grid{Columns: 2, Spacing: 10}, Children: []d.Widget{
							d.Label{Text: "Название на листах", Row: 0, Column: 0},
							d.LineEdit{AssignTo: &ui.title, Row: 0, Column: 1, MaxLength: 70, OnTextChanged: ui.update},
							d.Label{Text: "Вариантов (1–20)", Row: 1, Column: 0},
							d.NumberEdit{AssignTo: &ui.count, Row: 1, Column: 1, MinValue: 1, MaxValue: 20, Decimals: 0, Value: 20, SpinButtonsVisible: true, OnValueChanged: ui.update},
							d.Label{Text: "Шаг исходных углов", Row: 2, Column: 0},
							d.ComboBox{AssignTo: &ui.step, Row: 2, Column: 1, Model: []string{"5° — стандартный", "10° — крупный", "1° — точный"}, CurrentIndex: 0, OnCurrentIndexChanged: ui.update},
							d.Label{Text: "Типы задач", Row: 3, Column: 0},
							d.ComboBox{AssignTo: &ui.mode, Row: 3, Column: 1, Model: []string{"Прямые и обратные", "Только прямые", "Только обратные"}, CurrentIndex: 0, OnCurrentIndexChanged: ui.update},
						}},
						d.GroupBox{Title: "Что включить в работу", Layout: d.VBox{Spacing: 9}, Children: taskWidgets},
						d.TextLabel{Text: "Все выбранные элементы — на одной крупной сетке. В обратной задаче даётся отдельный случайный набор.", MinSize: d.Size{Width: 300}, TextColor: muted},
						d.GroupBox{Title: "Повторение набора", Layout: d.VBox{}, Children: []d.Widget{
							d.LineEdit{AssignTo: &ui.seed, MaxLength: 48, CueBanner: "Пусто — новые случайные значения", OnTextChanged: ui.update},
							d.TextLabel{Text: "Тот же код, шаг и состав заданий повторяют значения. Цвета можно изменить отдельно.", MinSize: d.Size{Width: 300}, TextColor: muted},
						}}, d.VSpacer{},
					}},
					{Title: "Цвета элементов", Layout: d.VBox{MarginsZero: true}, Children: []d.Widget{d.ScrollView{Layout: d.VBox{Spacing: 10}, HorizontalFixed: true, Children: colorWidgets}}},
					{Title: "Памятка", Layout: d.VBox{Spacing: 10}, Children: []d.Widget{
						d.TextEdit{AssignTo: &ui.help, ReadOnly: true, VScroll: true, Text: desktopHelpText, StretchFactor: 1},
						d.PushButton{Text: "Открыть печатную памятку PDF", OnClicked: ui.openGuide},
					}},
				}},
				d.Composite{MinSize: d.Size{Width: 270}, MaxSize: d.Size{Width: 300}, Layout: d.VBox{Margins: d.Margins{Left: 12, Top: 12, Right: 12, Bottom: 12}, Spacing: 10}, Background: d.SolidColorBrush{Color: walk.RGB(255, 255, 255)}, Children: []d.Widget{
					d.Label{Text: "Ваш комплект", Font: sectionFont, TextColor: green},
					d.ImageView{Image: ui.net, Mode: d.ImageViewModeShrink, MinSize: d.Size{Width: 210, Height: 210}, MaxSize: d.Size{Width: 250, Height: 250}, ToolTipText: "Схема сетки. Готовые построения — в созданных PDF."},
					d.TextLabel{AssignTo: &ui.summary, MinSize: d.Size{Width: 230}, TextColor: green},
					d.Label{Text: "Цветовое оформление", TextColor: muted},
					d.TextEdit{AssignTo: &ui.legend, ReadOnly: true, VScroll: true, MinSize: d.Size{Height: 95}, MaxSize: d.Size{Height: 140}, StretchFactor: 1},
					d.TextLabel{Text: "Печать: A4 → 100%.\r\nСетка диаметром 180 мм.\r\nСтудентам: задания и памятка.\r\nОтветы храните отдельно.", MinSize: d.Size{Width: 230}, TextColor: muted}, d.VSpacer{},
				}},
			}},
			d.GroupBox{Title: "Сохранение комплекта", Layout: d.VBox{Spacing: 9}, Children: []d.Widget{
				d.Composite{Layout: d.HBox{MarginsZero: true}, Children: []d.Widget{
					d.LineEdit{AssignTo: &ui.output, Text: output, ReadOnly: true, StretchFactor: 1, ToolTipText: "Для каждого комплекта создаётся новая подпапка."},
					d.PushButton{AssignTo: &ui.browseButton, Text: "Выбрать папку…", OnClicked: ui.chooseDirectory},
					d.PushButton{AssignTo: &ui.resetButton, Text: "Сбросить", OnClicked: func() {
						ui.applyConfig(defaultConfig())
						ui.setStatus("Исходные настройки восстановлены.", false)
					}},
					d.PushButton{AssignTo: &ui.generateButton, Text: "Создать комплект PDF", Font: sectionFont, MinSize: d.Size{Height: 36}, OnClicked: ui.startGeneration},
				}},
				d.ProgressBar{AssignTo: &ui.progress, MarqueeMode: true, Visible: false, MaxSize: d.Size{Height: 8}},
				d.TextLabel{AssignTo: &ui.status, Text: "Выберите параметры работы. Предыдущие комплекты не перезаписываются.", MinSize: d.Size{Width: 600}, TextColor: muted},
				d.Composite{Layout: d.HBox{MarginsZero: true}, Children: ui.resultButtons()},
				d.LineEdit{AssignTo: &ui.savedPath, ReadOnly: true, CueBanner: "Здесь появится путь к готовому комплекту"},
			}},
		},
	}
	if err = definitions.Create(); err != nil {
		ui.dispose()
		return nil, err
	}
	// Named native checkboxes are collected after declarative construction.
	var collect func(walk.Container)
	collect = func(parent walk.Container) {
		for i := 0; i < parent.Children().Len(); i++ {
			child := parent.Children().At(i)
			if checkbox, ok := child.(*walk.CheckBox); ok {
				if _, exists := ui.tasks[checkbox.Name()]; exists {
					ui.tasks[checkbox.Name()] = checkbox
				}
			}
			if container, ok := child.(walk.Container); ok {
				collect(container)
			}
		}
	}
	// Tab pages are managed separately from the TabWidget's ordinary children.
	for i := 0; i < ui.tabs.Pages().Len(); i++ {
		collect(ui.tabs.Pages().At(i))
	}
	for key, checkbox := range ui.tasks {
		if checkbox == nil {
			ui.dispose()
			return nil, fmt.Errorf("Не удалось создать настройку %s", key)
		}
	}
	ui.window.Closing().Attach(func(cancel *bool, reason walk.CloseReason) {
		if ui.busy {
			*cancel = true
			ui.setStatus("Создаётся комплект. Дождитесь завершения сохранения.", false)
		}
	})
	ui.ready = true
	ui.applyConfig(c)
	return ui, nil
}

func (ui *desktopWindow) dispose() {
	if ui.window != nil {
		ui.window.Dispose()
	}
	if ui.net != nil {
		ui.net.Dispose()
	}
}

func desktopElementDescription(key string) string {
	return map[string]string{"P": "плоскость", "Np": "полюс плоскости", "L": "линейность", "R": "плоскость для rake", "Lr": "линейность в R", "K1": "первое крыло", "K2": "второе крыло", "H": "шарнир", "pi": "перпендикулярная плоскость", "A": "пересечение с K1", "B": "пересечение с K2", "OP1": "осевая поверхность", "OP2": "осевая поверхность"}[key]
}

func (ui *desktopWindow) resultButtons() []d.Widget {
	widgets := []d.Widget{}
	for _, item := range []struct{ label, file string }{{"Задания", "students.pdf"}, {"Ответы", "teacher.pdf"}, {"Таблица Excel", "answers.csv"}, {"Папка комплекта", ""}} {
		file := item.file
		widgets = append(widgets, d.PushButton{Text: item.label, Enabled: false, Name: "open-" + file, OnClicked: func() { ui.openResult(file) }})
	}
	widgets = append(widgets, d.PushButton{AssignTo: &ui.copyButton, Text: "Копировать код", Enabled: false, OnClicked: ui.copySeed}, d.PushButton{AssignTo: &ui.reuseButton, Text: "Повторить настройки", Enabled: false, OnClicked: func() {
		if ui.lastConfig != nil {
			ui.applyConfig(*ui.lastConfig)
			ui.tabs.SetCurrentIndex(0)
			ui.setStatus("Настройки готового набора восстановлены.", false)
		}
	}})
	return widgets
}

func (ui *desktopWindow) config() Config {
	c := defaultConfig()
	c.Title = strings.TrimSpace(ui.title.Text())
	c.Count = int(ui.count.Value())
	c.Seed = strings.TrimSpace(ui.seed.Text())
	steps := []int{5, 10, 1}
	modes := []string{"both", "forward", "inverse"}
	if i := ui.step.CurrentIndex(); i >= 0 && i < len(steps) {
		c.Step = steps[i]
	}
	if i := ui.mode.CurrentIndex(); i >= 0 && i < len(modes) {
		c.Mode = modes[i]
	}
	c.Tasks = nil
	for _, task := range []string{"plane", "line", "rake", "fold"} {
		if ui.tasks[task].Checked() {
			c.Tasks = append(c.Tasks, task)
		}
	}
	c.ColorsEnabled = ui.useColors.Checked()
	c.ElementColors = make(map[string]ElementColor, len(ui.rows))
	for _, row := range ui.rows {
		color := row.color
		color.Name = strings.TrimSpace(row.name.Text())
		if !c.ColorsEnabled && color.Name == "" {
			color.Name = row.entry.Default.Name
		}
		c.ElementColors[row.entry.Key] = color
	}
	return c
}

func (ui *desktopWindow) applyConfig(c Config) {
	ui.updating = true
	ui.title.SetText(c.Title)
	ui.seed.SetText(c.Seed)
	ui.count.SetValue(float64(c.Count))
	for i, value := range []int{5, 10, 1} {
		if c.Step == value {
			ui.step.SetCurrentIndex(i)
		}
	}
	for i, value := range []string{"both", "forward", "inverse"} {
		if c.Mode == value {
			ui.mode.SetCurrentIndex(i)
		}
	}
	for task, checkbox := range ui.tasks {
		selected := false
		for _, t := range c.Tasks {
			if task == t {
				selected = true
			}
		}
		checkbox.SetChecked(selected)
	}
	ui.useColors.SetChecked(c.ColorsEnabled)
	colorConfig := c
	colorConfig.ColorsEnabled = true
	for _, row := range ui.rows {
		row.color = colorConfig.elementColor(row.entry.Key)
		row.name.SetText(row.color.Name)
		r, g, b := row.color.rgb()
		row.swatch.SetTextColor(walk.RGB(byte(r), byte(g), byte(b)))
	}
	ui.updating = false
	ui.update()
}

func (ui *desktopWindow) update() {
	if !ui.ready || ui.updating {
		return
	}
	c := ui.config()
	pages := c.Count * pagesPerVariant(c)
	ui.summary.SetText(fmt.Sprintf("%d вариантов\r\n%d страниц заданий\r\n%d страниц ответов\r\n+ общая памятка", c.Count, pages, pages))
	if len(c.Tasks) == 0 {
		ui.summary.SetText("Выберите хотя бы один тип задания.")
	}
	legend := "Чёрно-белые построения.\r\nЦвета можно включить на вкладке «Цвета элементов»."
	if c.ColorsEnabled {
		legend = strings.ReplaceAll(strings.TrimPrefix(c.colorLegend(), "Цвета: "), "; ", "\r\n")
	}
	ui.legend.SetText(legend)
	selected := map[string]bool{}
	for _, task := range c.Tasks {
		selected[task] = true
	}
	for _, row := range ui.rows {
		row.composite.SetVisible(selected[row.entry.Task])
		row.name.SetEnabled(c.ColorsEnabled && !ui.busy)
		row.choose.SetEnabled(c.ColorsEnabled && !ui.busy)
	}
}

func (ui *desktopWindow) setStatus(text string, isError bool) {
	color := walk.RGB(50, 93, 66)
	if isError {
		color = walk.RGB(160, 50, 38)
	}
	ui.status.SetTextColor(color)
	ui.status.SetText(text)
}

func (ui *desktopWindow) colorNameChanged(row *desktopColorRow) {
	if !ui.ready || ui.updating {
		return
	}
	if color, ok := desktopNamedColor(row.name.Text()); ok {
		row.color.Hex = color.Hex
		r, g, b := color.rgb()
		row.swatch.SetTextColor(walk.RGB(byte(r), byte(g), byte(b)))
	}
	ui.update()
}

func (ui *desktopWindow) chooseColor(row *desktopColorRow) {
	r, g, b := row.color.rgb()
	choice := win.CHOOSECOLOR{HwndOwner: ui.window.Handle(), RgbResult: win.COLORREF(walk.RGB(byte(r), byte(g), byte(b))), LpCustColors: &ui.customColors, Flags: win.CC_RGBINIT | win.CC_FULLOPEN}
	choice.LStructSize = uint32(unsafe.Sizeof(choice))
	if !win.ChooseColor(&choice) {
		return
	}
	color := walk.Color(choice.RgbResult)
	hex := fmt.Sprintf("#%02x%02x%02x", color.R(), color.G(), color.B())
	name := hex
	for _, known := range desktopNamedColors {
		if known.Hex == hex {
			name = known.Name
			break
		}
	}
	ui.updating = true
	row.color = ElementColor{hex, name}
	row.name.SetText(name)
	row.swatch.SetTextColor(color)
	ui.updating = false
	ui.update()
}

func (ui *desktopWindow) chooseDirectory() {
	dialog := walk.FileDialog{Title: "Куда сохранять комплекты", InitialDirPath: ui.output.Text()}
	accepted, err := dialog.ShowBrowseFolder(ui.window)
	if err != nil {
		ui.setStatus("Не удалось выбрать папку: "+err.Error(), true)
	} else if accepted {
		ui.output.SetText(dialog.FilePath)
	}
}

func (ui *desktopWindow) setBusy(busy bool) {
	ui.busy = busy
	ui.tabs.SetEnabled(!busy)
	ui.generateButton.SetEnabled(!busy)
	ui.resetButton.SetEnabled(!busy)
	ui.browseButton.SetEnabled(!busy)
	ui.progress.SetVisible(busy)
	if busy {
		ui.generateButton.SetText("Создаём PDF…")
	} else {
		ui.generateButton.SetText("Создать комплект PDF")
	}
	ui.copyButton.SetEnabled(!busy && ui.lastConfig != nil)
	ui.reuseButton.SetEnabled(!busy && ui.lastConfig != nil)
}

func (ui *desktopWindow) startGeneration() {
	if ui.busy {
		return
	}
	c := ui.config()
	if err := c.Validate(); err != nil {
		ui.setStatus(err.Error(), true)
		return
	}
	parent := ui.output.Text()
	ui.setBusy(true)
	ui.setStatus("Подбираем варианты, строим PDF и сохраняем комплект…", false)
	go func() {
		directory, err := saveDesktopSet(c, parent)
		ui.window.Synchronize(func() {
			ui.setBusy(false)
			if err != nil {
				ui.setStatus("Не удалось сохранить комплект: "+err.Error(), true)
			} else {
				ui.resultDir = directory
				ui.lastConfig = &c
				ui.savedPath.SetText(directory)
				ui.copyButton.SetEnabled(true)
				ui.reuseButton.SetEnabled(true)
				var enableResults func(walk.Container)
				enableResults = func(parent walk.Container) {
					for i := 0; i < parent.Children().Len(); i++ {
						child := parent.Children().At(i)
						if strings.HasPrefix(child.Name(), "open-") {
							child.SetEnabled(true)
						}
						if nested, ok := child.(walk.Container); ok {
							enableResults(nested)
						}
					}
				}
				enableResults(ui.window)
				ui.setStatus(fmt.Sprintf("Готово! Сохранено %d вариантов. Код набора: %s. Откройте задания или папку комплекта кнопками ниже.", c.Count, c.Seed), false)
			}
			if ui.onFinished != nil {
				ui.onFinished(directory, err)
			}
		})
	}()
}

func (ui *desktopWindow) openPath(path string) {
	if !win.ShellExecute(ui.window.Handle(), syscall.StringToUTF16Ptr("open"), syscall.StringToUTF16Ptr(path), nil, nil, win.SW_SHOWNORMAL) {
		ui.setStatus("Не удалось открыть файл. Откройте его из папки комплекта.", true)
	}
}
func (ui *desktopWindow) openResult(file string) {
	if ui.resultDir != "" {
		ui.openPath(filepath.Join(ui.resultDir, file))
	}
}
func (ui *desktopWindow) copySeed() {
	if ui.lastConfig != nil {
		if err := walk.Clipboard().SetText(ui.lastConfig.Seed); err != nil {
			ui.setStatus("Не удалось скопировать код: "+err.Error(), true)
		} else {
			ui.setStatus("Код набора скопирован: "+ui.lastConfig.Seed, false)
		}
	}
}
func (ui *desktopWindow) openGuide() {
	data, err := makeGuidePDF()
	if err != nil {
		ui.setStatus(err.Error(), true)
		return
	}
	dir, err := os.MkdirTemp("", "WulffGuide-")
	if err != nil {
		ui.setStatus(err.Error(), true)
		return
	}
	path := filepath.Join(dir, "student_guide.pdf")
	if err = os.WriteFile(path, data, 0644); err != nil {
		os.RemoveAll(dir)
		ui.setStatus(err.Error(), true)
		return
	}
	ui.openPath(path)
}

const desktopHelpText = `КАК ВЫПОЛНЯТЬ ПОСТРОЕНИЯ

1. Подготовьте кальку
Совместите центры кальки и сетки, обведите внешний круг и отметьте север. Сетка остаётся неподвижной. Вращайте кальку вокруг центра, после каждого построения возвращайте север к 0°. Все элементы варианта — на одной кальке.

2. Плоскость P и полюс Np
Даны азимут и угол падения. Отметьте азимут на внешнем круге, совместите направление с горизонтальным диаметром, отсчитайте угол от края к центру и обведите дугу большого круга. Полюс — перпендикуляр к плоскости.

3. Линейность L
Даны азимут и угол погружения. Совместите азимут с диаметром и отложите угол от края к центру. Результат — точка.

4. Склонение (rake)
R — заданная плоскость; Lr — линейность в ней. Постройте R, затем вдоль её дуги от указанного конца простирания отложите угол rake и поставьте Lr. Верните север к 0° и определите азимут и угол погружения Lr. В обратной задаче укажите также конец отсчёта.

5. Складка
K1 и K2 — крылья. Их пересечение — шарнир H. Постройте π-плоскость, перпендикулярную H. A и B — её пересечения с крыльями. Измерьте оба угла между крыльями и постройте два возможных положения осевой поверхности: ОП1 и ОП2. Выбор одного положения требует сведений о полярности крыльев.

6. Обратная задача
На сетке уже нанесён другой случайный набор элементов. Определите параметры дуг и точек. Вспомогательные построения выполните на кальке.

ЦВЕТА И ПЕЧАТЬ
Если в условии указаны цвета, используйте их для соответствующих элементов. Печатайте A4, фактический размер / 100%, без подгонки. Диаметр сетки — 180 мм. Расчётные ответы округлены до 0,1°; ориентир допуска для ручного считывания ±2° задаёт преподаватель.

Студентам выдавайте students.pdf и student_guide.pdf. Файлы teacher.pdf, answers.csv и settings.json содержат ответы.

ПАМЯТКА В PDF
Кнопка ниже открывает общую двухстраничную памятку для печати.`
