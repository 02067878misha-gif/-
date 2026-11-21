using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using NetTopologySuite.Geometries;

namespace StrataDraw
{
    public sealed partial class ToolPanel
    {
        private static readonly string[] marks = { "Нет", "Штрих", "Крест", "Треугольник", "Кружок", "Квадрат", "Ромб", "Стрелка", "Шеврон", "Черта", "Точка", "Полукруг", "Двойной штрих" };
        private Mark MarkAt(string key) => (Mark)Id(key);
        private void BedPage()
        {
            var models = new Dictionary<string, Mark[]>{
                {"Песок",new[]{Mark.Dot,Mark.None}},{"Глинистый сланец",new[]{Mark.Bar,Mark.None}},
                {"Известняк",new[]{Mark.Tick,Mark.None}},{"Брекчия",new[]{Mark.Triangle,Mark.Diamond}},
                {"Гравий",new[]{Mark.Circle,Mark.Dot}},{"Доломит",new[]{Mark.Chevron,Mark.None}},
                {"Конгломерат",new[]{Mark.Circle,Mark.Diamond}},{"Гипс",new[]{Mark.Cross,Mark.None}},
                {"Песчаник",new[]{Mark.Dot,Mark.Bar}},{"Мергель",new[]{Mark.Bar,Mark.Tick}},
                {"Каменная соль",new[]{Mark.Square,Mark.Cross}},{"Алевролит",new[]{Mark.Bar,Mark.Dot}},
                {"Мел",new[]{Mark.Tick,Mark.Dot}},{"Аргиллит",new[]{Mark.DoubleTick,Mark.Bar}}
            };
            var model = Choice("rock", "Порода", models.Keys);
            Choice("main", "Основной знак", marks, (int)Mark.Dot); Choice("extra", "Дополнительный знак", marks);
            model.SelectionChanged += (s, e) => { var pair = models[Value("rock")]; ((ComboBox)fields["main"]).SelectedIndex = (int)pair[0]; ((ComboBox)fields["extra"]).SelectedIndex = (int)pair[1]; };
            Input("space", "Мощность прослоя, мм", "3"); Input("rows", "Число прослоев (0 — по мощности)", "0");
            Input("mult", "Множитель числа прослоев", "1"); Input("along", "Шаг знаков в долях мощности", "1.7");
            Input("start", "Отступ первого знака в долях шага", "0.5"); Input("factor", "Высота дополнительного знака, %", "60");
            Input("freq", "Каждый N-й дополнительный знак", "2"); Flag("random", "Случайное размещение", false); Input("seed", "Число для повторения рисунка", "17");
            Flag("alt", "Смещать каждый второй ряд", true); Flag("beds", "Рисовать границы прослоев", true);
            Input("width", "Толщина, мм", "0.18"); Input("color", "Цвет линий", "#222222");
            Input("primaryFile", "Свой основной знак (необязательно)", "");
            Button(form, "Выбрать основной знак…", () => { var f = Open("Вектор|*.svg;*.cgm;*.cdr"); if (f != null) Set("primaryFile", f); });
            Input("extraFile", "Свой дополнительный знак (необязательно)", "");
            Button(form, "Выбрать дополнительный знак…", () => { var f = Open("Вектор|*.svg;*.cgm;*.cdr"); if (f != null) Set("extraFile", f); });
            Input("rotation", "Поворот дополнительного знака, °", "0");
            Flag("varySize", "Варьировать размер знаков", false); Flag("varyAngle", "Варьировать поворот знаков", false);
            ActionButtons(s => DrawBeds(s, false), false);
            Button(form, "Вставить образец 48 × 24 мм", () => Edit(false, s => DrawBeds(s, true)));
        }
        private void DrawBeds(DrawingSession session, bool sample)
        {
            var frame = Contours.Line(new[] { new Coordinate(0, 0), new Coordinate(48, 0), new Coordinate(48, 24), new Coordinate(0, 24), new Coordinate(0, 0) });
            var paths = sample ? new[] { frame } : session.SelectionPaths();
            var area = Contours.Region(paths);
            var options = new BedOptions
            {
                Spacing = Num("space", .05, 1000),
                Rows = Integer("rows", 0, 2000),
                Multiplier = Num("mult", .05, 50),
                Horizontal = Num("along", .1, 100),
                Start = Num("start", 0, 100),
                SymbolSize = Num("factor", 1, 200) / 100,
                Main = MarkAt("main"),
                Extra = MarkAt("extra"),
                Frequency = Integer("freq", 1, 100),
                Seed = Integer("seed", 0, int.MaxValue),
                Alternate = On("alt"),
                Beds = On("beds"),
                Random = On("random"),
                Angle = Num("rotation", -360, 360),
                VarySize = On("varySize"),
                VaryAngle = On("varyAngle"),
                MainGeometry = session.ReadGlyph(Value("primaryFile")),
                ExtraGeometry = session.ReadGlyph(Value("extraFile"))
            };
            var lines = Beds.Draw(area, paths, options);
            if (sample) lines.Add(frame);
            dynamic result = session.Strokes(lines, Value("color"), Num("width", .01, 10)); result.Name = "Strata Draw · " + Value("rock"); session.Tag((object)result, "Прослои", Value("rock"));
        }

        private void TilePage()
        {
            Action<DrawingSession> apply = session =>
            {
                var area = session.Area(); var entry = Selected();
                double width = Num("size", 0, 1000);
                Library.WithFile(entry, path => { dynamic result = session.Vector(area, path, width == 0 ? entry.NativeWidth : width, Num("angle", -360, 360)); session.Tag((object)result, "Векторные узоры", entry.Name); });
            };
            Catalog(Library.Tiles(data).Concat(Extras()).ToList(), () => Edit(false, apply));
            Input("size", "Ширина плитки, мм (0 — размер каталога)", "0"); Input("angle", "Поворот, °", "0");
            ActionButtons(apply); Button(form, "Добавить свои плитки…", () => AddCatalogFile(false));
        }
        private void AgePage()
        {
            var all = Library.Ages(data);
            foreach (var file in Extras().Where(x => File.Exists(x.Location)))
                all.AddRange(Library.ScaleXml(file.Location).Select(x => { x.Name = file.Name + " · " + x.Name; return x; }));
            Action<DrawingSession> apply = s =>
            {
                var area = s.Area(); var entry = Selected();
                dynamic target = s.Boundary(area); target.Fill.ApplyUniformFill(s.Color(entry.Color)); target.Name = entry.Name; s.Tag((object)target, "Возраст", entry.Name, entry.Index, entry.Age);
                if (!On("label")) return;
                var box = area.EnvelopeInternal; var pt = area.InteriorPoint.Coordinate;
                double x = Id("pos") == 1 ? box.MinX : Id("pos") == 2 ? box.MaxX : pt.X;
                dynamic text = s.Layer.CreateArtisticText(x, pt.Y, entry.Index);
                text.Text.Story.Size = Num("font", 3, 100);
                text.CenterX = x; text.CenterY = pt.Y;
                if (On("paper"))
                {
                    dynamic bg = s.Layer.CreateRectangle(text.LeftX - .5, text.TopY + .4, text.RightX + .5, text.BottomY - .4);
                    bg.Fill.ApplyUniformFill(s.Color("#ffffff")); bg.Outline.SetNoOutline(); bg.OrderBehind(text);
                }
            };
            Catalog(all, () => Edit(false, apply));
            Flag("label", "Подписывать индекс", true); Choice("pos", "Положение индекса", new[] { "Внутри", "Левый край", "Правый край" });
            Flag("paper", "Белый фон индекса", false); Input("font", "Размер подписи, пт", "8");
            ActionButtons(apply); Button(form, "Подключить шкалу XML…", () => AddCatalogFile(true));
        }
        private void LinePage()
        {
            string[] styles = { "Контакт", "Предполагаемый контакт", "Размыв", "Зубчатая граница", "Надвиг", "Сброс", "Уступ", "Двойная граница" };
            var fgdc = File.ReadLines(Path.Combine(data, "lines.tsv")).Select(l => l.Split('\t')).ToArray();
            var template = Choice("model", "Оформление", styles.Concat(fgdc.Select(r => r[0])));
            Choice("form", "Основная линия", new[] { "Сплошная", "Пунктир", "Волна", "Пила" });
            Input("width", "Толщина линии, мм", "0.25"); Input("color", "Цвет линии", "#222222");
            Input("pitch", "Длина волны, мм", "5"); Input("amp", "Амплитуда, мм", "1");
            Input("dash", "Штрих, мм", "3"); Input("gap", "Пробел, мм", "1");
            Input("rhythm", "Чередование штрих–пробел, мм (например 4;1;1;1)", "");
            Flag("straight", "Чередовать волну с прямым отрезком", false);
            Flag("parallel", "Добавить параллельную линию", false);
            Input("par", "Смещение параллельной линии, мм", "0"); Input("pw", "Толщина параллельной линии, мм", "0.2");
            Choice("mark1", "Первый знак группы", marks); Choice("mark2", "Второй знак", marks); Choice("mark3", "Третий знак", marks);
            Input("mw", "Ширина знака, мм", "1.8"); Input("mh", "Высота знака, мм", "1"); Input("offset", "Смещение знаков по нормали, мм", "0");
            Input("repeat", "Интервал групп, мм", "6"); Input("gap2", "Расстояние между знаками, мм", "0.5"); Input("freq", "Каждая N-я группа", "1");
            Field("group", "Своя группа (по строке на знак, например Triangle;2;1;верх;2)", new TextBox { AcceptsReturn = true, MinHeight = 40, TextWrapping = TextWrapping.Wrap });
            Flag("reverse", "Обратить направление", false);
            template.SelectionChanged += (sender, args) =>
            {
                int i = template.SelectedIndex;
                if (i < 0) return;
                var standard = i >= styles.Length ? fgdc[i - styles.Length] : null;
                string rhythm = standard == null || standard[3] == "-" ? "" : standard[3];
                Set("group", ""); Set("rhythm", rhythm); Set("width", standard == null ? "0.25" : standard[2]);
                Set("color", standard == null ? "#222222" : standard[1]); Set("straight", "0");
                ((ComboBox)fields["mark2"]).SelectedIndex = 0;
                ((ComboBox)fields["mark3"]).SelectedIndex = 0;
                ((ComboBox)fields["form"]).SelectedIndex = i < 4 ? i : rhythm.Length > 0 ? 1 : 0;
                ((ComboBox)fields["mark1"]).SelectedIndex = (int)(i == 4 ? Mark.Triangle : i == 5 ? Mark.Tick : i == 6 ? Mark.DoubleTick : Mark.None);
                Set("parallel", i == 7 ? "1" : "0"); Set("par", i == 7 ? "0.7" : "0");
            };
            ActionButtons(s => s.Decorate(new LineStyle
            {
                Form = (LineForm)Id("form"),
                Custom = LineSymbol.Parse(Value("group")),
                DashSequence = Value("rhythm") == "" ? null : Value("rhythm").Split(';').Select(LineSymbol.ReadSize).ToArray(),
                StraightBetween = On("straight"),
                ParallelEnabled = On("parallel"),
                Width = Num("width", .01, 20),
                Color = Value("color"),
                Pitch = Num("pitch", .1, 1000),
                Amplitude = Num("amp", 0, 100),
                Dash = Num("dash", .05, 1000),
                Gap = Num("gap", .05, 1000),
                Parallel = Num("par", -100, 100),
                ParallelWidth = Num("pw", .01, 20),
                Marks = new[] { MarkAt("mark1"), MarkAt("mark2"), MarkAt("mark3") }.Where(m => m != Mark.None).ToArray(),
                MarkWidth = Num("mw", .05, 100),
                MarkHeight = Num("mh", .05, 100),
                Offset = Num("offset", -100, 100),
                MarkPitch = Num("repeat", .1, 1000),
                MarkGap = Num("gap2", 0, 100),
                Frequency = Integer("freq", 1, 1000),
                Reverse = On("reverse")
            }, Value("model")));
            Button(form, "Вернуть исходную кривую", () => Edit(false, s => s.Restore()));
        }
        private void SymbolPage()
        {
            Action<DrawingSession> apply = s =>
            {
                Library.WithFile(Selected(), path =>
                {
                    dynamic mark = s.Import(path);
                    double scale = Num("size", .1, 500) / (double)mark.SizeHeight;
                    mark.SetSize((double)mark.SizeWidth * scale, (double)mark.SizeHeight * scale);
                    mark.Rotate(Num("angle", -360, 360));
                    if (s.Click != null) { mark.CenterX = s.Click.X; mark.CenterY = s.Click.Y; }
                    else if (s.Selected.Length == 1) { dynamic anchor = s.Selected[0]; mark.CenterX = anchor.CenterX; mark.CenterY = anchor.CenterY; }
                    mark.Name = Selected().Name; s.Tag((object)mark, "Знаки", Selected().Name);
                });
            };
            Catalog(Library.Symbols(data).Concat(Extras()).ToList(), () => Edit(false, apply));
            Input("size", "Высота, мм", "5"); Input("angle", "Поворот, °", "0");
            var row = new WrapPanel(); form.Children.Add(row);
            Button(row, "Вставить знак", () => Edit(false, apply)); Button(row, "Указать точку", () => Edit(true, apply));
            Button(form, "Добавить свои знаки…", () => AddCatalogFile(false));
        }
        private void ImportPage(bool las)
        {
            Input("file", las ? "Файл LAS" : "Таблица горизонтов", "");
            Button(form, "Выбрать файл…", () => { var f = Open(las ? "LAS|*.las|Все файлы|*.*" : "Таблица|*.csv;*.tsv;*.txt;*.dat|Все файлы|*.*"); if (f != null) Set("file", f); });
            Choice("encoding", "Кодировка", new[] { "UTF-8", "Windows-1251" });
            if (!las)
            {
                Flag("header", "Названия в первой строке", true); Input("skip", "Пропустить строк", "0"); Input("fixed", "Фиксированная ширина поля (0 — разделитель)", "0");
                Input("sx", "Горизонтальный масштаб 1 :", "1000"); Input("xm", "Метров на единицу X", "1"); Input("ym", "Метров на единицу Y", "1"); Flag("down", "Отметки возрастают вниз", false);
            }
            Input("sy", "Вертикальный масштаб 1 :", las ? "200" : "1000");
            if (las)
            {
                Input("depthstep", "Шаг отметок глубины (0 — авто)", "0");
                Field("tracks", "Строка на кривую: номер;дорожка;мин;макс;lin/log/rev/log-rev;цвет;толщина;заливка (0/1)", new TextBox { AcceptsReturn = true, MinHeight = 46, TextWrapping = TextWrapping.Wrap });
                Input("track", "Ширина дорожки, мм", "35"); Input("gap", "Между дорожками, мм", "4");
            }
            Flag("corner", "Разместить в левом верхнем углу листа", false);
            Input("margin", "Отступ от края, мм", "5"); Flag("triple", "Тройная рамка", false);
            Flag("vertical", "Вертикальная ось", true); if (!las) Flag("horizontal", "Горизонтальная ось", true);
            Input("simplify", "Допуск упрощения кривой, мм (0 — выключено)", "0");
            Input("cols", "Номера кривых через запятую (пусто — все)", "");
            Flag("grid", "Горизонтальная сетка", true); Flag("frame", "Рамка", true); Flag("title", "Заголовок", true); Input("stamp", "Подпись", "");
            Func<System.Xml.Linq.XElement> plot = () =>
            {
                var lines = File.ReadLines(Value("file"), Id("encoding") == 1 ? Encoding.GetEncoding(1251) : Encoding.UTF8);
                Survey survey = las ? Survey.Las(lines) : Survey.Horizons(lines, On("header"), Integer("skip", 0, 1000), Integer("fixed", 0, 1000));
                if (survey.Title.Length == 0) survey.Title = Path.GetFileNameWithoutExtension(Value("file"));
                string cols = Value("cols");
                return SectionPlot.Draw(survey, las, new PlotOptions
                {
                    ScaleX = las ? 1000 : Num("sx", .01, 1e9),
                    ScaleY = Num("sy", .01, 1e9),
                    TrackWidth = las ? Num("track", 1, 1000) : 35,
                    Gap = las ? Num("gap", 0, 100) : 4,
                    YToMeters = las ? 1 : Num("ym", .0001, 1e6),
                    XToMeters = las ? 1 : Num("xm", .0001, 1e6),
                    XAxis = !las && On("horizontal"),
                    YAxis = On("vertical"),
                    Triple = On("triple"),
                    Simplify = Num("simplify", 0, 10),
                    PositiveDown = !las && On("down"),
                    Frame = On("frame"),
                    Grid = On("grid"),
                    Title = On("title"),
                    Stamp = Value("stamp"),
                    Tracks = las ? Value("tracks") : "",
                    DepthStep = las ? Num("depthstep", 0, 100000) : 0,
                    Columns = cols.Length == 0 ? null : cols.Split(',').Select(x => int.Parse(x.Trim())).Distinct().ToArray()
                });
            };
            Button(form, "Построить в документе", () =>
            {
                var svg = plot(); Edit(false, s =>
                {
                    dynamic group = s.Svg(svg); if (On("corner")) { double m = Num("margin", 0, 1000); group.LeftX = s.Doc.ActivePage.LeftX + m; group.TopY = s.Doc.ActivePage.TopY - m; }
                });
            });
            Button(form, "Сохранить SVG…", () => { var d = new Microsoft.Win32.SaveFileDialog { Filter = "SVG|*.svg" }; if (d.ShowDialog() == true) { plot().Save(d.FileName); status.Text = Tr("SVG сохранён."); } });
        }
    }
}
