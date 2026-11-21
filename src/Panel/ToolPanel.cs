using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Xml.Linq;
using Microsoft.Win32;

namespace StrataDraw
{
    public sealed partial class ToolPanel : UserControl
    {
        private readonly object application;
        private readonly string data = Path.Combine(Path.GetDirectoryName(typeof(ToolPanel).Assembly.Location), "data");
        private readonly string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StrataDraw");
        private readonly TextBlock status = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(5) };
        private readonly ComboBox tools = new ComboBox();
        private readonly StackPanel form = new StackPanel { Margin = new Thickness(6) };
        private readonly Dictionary<string, Control> fields = new Dictionary<string, Control>();
        private readonly Dictionary<string, Dictionary<string, string>> previous = new Dictionary<string, Dictionary<string, string>>();
        private readonly ComboBox presets = new ComboBox { IsEditable = true, MinWidth = 100 };
        private readonly TextBox output = new TextBox();
        private string page = "";
        private List<Entry> entries;
        private ListBox list;
        private readonly Dictionary<string, List<Entry>> additions = new Dictionary<string, List<Entry>>();
        private XElement preferences = new XElement("settings");
        private static readonly string[] Pages = { "Прослои", "Векторный узор", "Возраст", "Линия", "Знак", "Горизонты", "Каротаж LAS", "Легенда" };
        public ToolPanel(object application)
        {
            this.application = application;
            var root = new DockPanel();
            Content = root;
            var header = new StackPanel { Margin = new Thickness(6) };
            DockPanel.SetDock(header, Dock.Top); root.Children.Add(header);
            header.Children.Add(tools); tools.ItemsSource = Pages;
            var bottom = new StackPanel { Margin = new Thickness(6) };
            DockPanel.SetDock(bottom, Dock.Bottom); root.Children.Add(bottom);
            bottom.Children.Add(layerLabel); bottom.Children.Add(output);
            bottom.Children.Add(status);
            root.Children.Add(new ScrollViewer { Content = form, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
            try
            {
                string file = Path.Combine(profile, "settings.xml");
                if (File.Exists(file)) preferences = XElement.Load(file);
                foreach (var p in preferences.Elements("library"))
                {
                    string group = (string)p.Attribute("page");
                    if (!additions.ContainsKey(group)) additions[group] = new List<Entry>();
                    additions[group].Add(new Entry { Name = (string)p.Attribute("name"), Location = (string)p.Attribute("file") });
                }
            }
            catch (Exception e) { status.Text = "Настройки: " + e.Message; }
            tools.SelectionChanged += (s, e) => Safe(() => ShowPage((string)tools.SelectedItem));
            Safe(() => InitializePreferences(header));
        }
        private void Safe(Action action)
        {
            try { action(); } catch (Exception e) { status.Text = e.GetBaseException().Message; }
        }
        private void Edit(bool click, Action<DrawingSession> change)
        {
            status.Text = Tr(click ? "Щёлкните на чертеже. Esc — отменить." : "Выполняется…");
            DrawingSession.Run(application, click, output.Text.Trim(), change);
            status.Text = Tr("Готово.");
        }
        private void Button(Panel panel, string name, Action action)
        {
            var button = new Button { Content = Tr(name), Padding = new Thickness(5, 3, 5, 3), Margin = new Thickness(2) };
            button.Click += (s, e) => Safe(action); panel.Children.Add(button);
        }
        private void ActionButtons(Action<DrawingSession> change, bool click = true)
        {
            var row = new WrapPanel(); form.Children.Add(row);
            Button(row, "Применить к выделению", () => Edit(false, change));
            if (click) Button(row, "Указать на чертеже", () => Edit(true, change));
        }
        private void Field(string key, string label, Control control)
        {
            form.Children.Add(new TextBlock { Text = Tr(label), Margin = new Thickness(0, 5, 0, 2), TextWrapping = TextWrapping.Wrap });
            form.Children.Add(control); fields[key] = control;
        }
        private void Input(string key, string label, string value) => Field(key, label, new TextBox { Text = value });
        private ComboBox Choice(string key, string label, IEnumerable<string> values, int index = 0)
        {
            var c = new ComboBox { ItemsSource = values.ToArray(), ItemTemplate = Captions(), SelectedIndex = index }; Field(key, label, c); return c;
        }
        private void Flag(string key, string label, bool value)
        {
            var c = new CheckBox { Content = Tr(label), IsChecked = value, Margin = new Thickness(0, 4, 0, 2) }; form.Children.Add(c); fields[key] = c;
        }
        private string Value(string key)
        {
            var c = fields[key];
            if (c is TextBox t) return t.Text.Trim();
            if (c is CheckBox b) return b.IsChecked == true ? "1" : "0";
            if (c is ComboBox cb) return cb.SelectedItem?.ToString() ?? "";
            return ((ListBox)c).SelectedItem?.ToString() ?? "";
        }
        private double Num(string key, double min, double max)
        {
            string raw = Value(key).Replace(',', '.');
            if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out double v) ||
                double.IsNaN(v) || v < min || v > max) throw new ArgumentException("Значение «" + raw + "» должно быть от " + min + " до " + max + ".");
            return v;
        }
        private int Integer(string key, int min, int max)
        {
            double n = Num(key, min, max); if (n != Math.Truncate(n)) throw new ArgumentException("Требуется целое число.");
            return (int)n;
        }
        private int Id(string k) => ((ComboBox)fields[k]).SelectedIndex;
        private bool On(string key) => Value(key) == "1";
        private void Set(string key, string value)
        {
            if (!fields.TryGetValue(key, out Control c)) return;
            if (c is TextBox t) t.Text = value;
            else if (c is CheckBox b) b.IsChecked = value == "1";
            else if (c is ComboBox combo) { if (combo.Items.Contains(value)) combo.SelectedItem = value; }
            else if (c is ListBox l) l.SelectedItem = l.Items.Cast<Entry>().FirstOrDefault(x => x.Name == value) ?? l.Items.Cast<Entry>().FirstOrDefault();
        }
        private void ShowPage(string next)
        {
            building = true;
            if (page.Length > 0) previous[page] = fields.Keys.ToDictionary(k => k, Value);
            form.Children.Clear(); fields.Clear(); page = next; list = null;
            switch (page)
            {
                case "Прослои": BedPage(); break;
                case "Векторный узор": TilePage(); break;
                case "Возраст": AgePage(); break;
                case "Линия": LinePage(); break;
                case "Знак": SymbolPage(); break;
                case "Легенда": LegendPage(); break;
                default: ImportPage(page == "Каротаж LAS"); break;
            }
            if (previous.TryGetValue(page, out var state)) foreach (var kv in state) Set(kv.Key, kv.Value);
            form.Children.Add(new Separator { Margin = new Thickness(0, 10, 0, 4) });
            form.Children.Add(new TextBlock { Text = Tr("Моя коллекция настроек") }); form.Children.Add(presets);
            RefreshPresets();
            var row = new WrapPanel(); form.Children.Add(row);
            Button(row, "Сохранить", () => Preset("save")); Button(row, "Загрузить", () => Preset("load")); Button(row, "Удалить", () => Preset("remove")); building = false; Watch();
        }
        private void Save()
        {
            Directory.CreateDirectory(profile);
            string file = Path.Combine(profile, "settings.xml"), tmp = Path.Combine(profile, Guid.NewGuid() + ".tmp");
            try { preferences.Save(tmp); if (File.Exists(file)) File.Replace(tmp, file, null); else File.Move(tmp, file); }
            finally { if (File.Exists(tmp)) File.Delete(tmp); }
        }
        private IEnumerable<XElement> Presets() => preferences.Elements("preset").Where(el => (string)el.Attribute("page") == page);
        private void RefreshPresets()
        {
            presets.ItemsSource = Presets().Select(p => (string)p.Attribute("name")).ToArray();
            presets.SelectedIndex = presets.Items.Count > 0 ? 0 : -1; if (presets.SelectedIndex < 0) presets.Text = "";
        }
        private void Preset(string op)
        {
            string name = presets.Text.Trim(); if (name.Length == 0) throw new ArgumentException("Введите название набора.");
            var p = Presets().FirstOrDefault(x => (string)x.Attribute("name") == name);
            if (op == "load")
            {
                if (p == null) throw new ArgumentException("Выберите сохранённый набор.");
                foreach (var v in p.Elements("value")) Set((string)v.Attribute("key"), v.Value);
                output.Text = (string)p.Attribute("layer") ?? ""; return;
            }
            p?.Remove();
            if (op == "save") preferences.Add(new XElement("preset", new XAttribute("name", name), new XAttribute("page", page),
                new XAttribute("layer", output.Text), fields.Keys.Select(k => new XElement("value", new XAttribute("key", k), Value(k)))));
            Save(); RefreshPresets(); if (op == "save") presets.SelectedItem = name;
        }
        private void Catalog(List<Entry> source, Action activate)
        {
            entries = source;
            Input("filter", "Найти по названию или номеру", "");
            list = new ListBox { Height = 125, ItemsSource = source, SelectedIndex = source.Count > 0 ? 0 : -1 };
            fields["entry"] = list; form.Children.Add(list);
            var preview = new Image { Width = 88, Height = 64, Stretch = Stretch.Uniform };
            var chip = new Border { Width = 96, Height = 68, Background = Brushes.White, Child = preview, Margin = new Thickness(0, 4, 0, 4) };
            form.Children.Add(chip);
            Action show = () =>
            {
                preview.Source = null; chip.Background = Brushes.White;
                var item = list.SelectedItem as Entry;
                if (item == null) return;
                if (item.Color != null)
                {
                    chip.Background = new SolidColorBrush((System.Windows.Media.Color)ColorConverter.ConvertFromString(item.Color));
                    return;
                }
                if (item.Key == null) return;
                using (var f = File.OpenRead(Path.Combine(data, "previews.zip")))
                using (var z = new ZipArchive(f))
                {
                    var png = z.GetEntry(item.Key + ".png"); if (png == null) return;
                    using (var stream = png.Open())
                    {
                        var bitmap = new BitmapImage(); bitmap.BeginInit(); bitmap.CacheOption = BitmapCacheOption.OnLoad;
                        bitmap.StreamSource = stream; bitmap.EndInit(); bitmap.Freeze(); preview.Source = bitmap;
                    }
                }
            };
            list.SelectionChanged += (s, e) => Safe(show); show();
            var mine = new CheckBox { Content = Tr("Только мои") }; form.Children.Add(mine); fields["mine"] = mine;
            var box = (TextBox)fields["filter"];
            Action filter = () =>
            {
                var favorites = new HashSet<string>(Presets().SelectMany(p => p.Elements("value").Where(v => (string)v.Attribute("key") == "entry").Select(v => v.Value)));
                list.ItemsSource = entries.Where(x => (mine.IsChecked != true || x.Key == null || favorites.Contains(x.Name)) &&
                    x.Name.IndexOf(box.Text, StringComparison.OrdinalIgnoreCase) >= 0).ToList();
                list.SelectedIndex = list.Items.Count > 0 ? 0 : -1;
            };
            box.TextChanged += (s, e) => filter(); mine.Checked += (s, e) => filter(); mine.Unchecked += (s, e) => filter();
            list.MouseDoubleClick += (s, e) => Safe(activate);
        }
        private Entry Selected() => list.SelectedItem as Entry ?? throw new ArgumentException("Выберите элемент каталога.");
        private static string Open(string filter)
        {
            var d = new OpenFileDialog { Filter = filter }; return d.ShowDialog() == true ? d.FileName : null;
        }
        private void AddCatalogFile(bool scale)
        {
            var d = new OpenFileDialog { Multiselect = true, Filter = scale ? "Шкалы (*.xml)|*.xml" : "Векторы и узоры|*.svg;*.cgm;*.pat;*.cdr" };
            if (d.ShowDialog() != true) return;
            if (!additions.ContainsKey(page)) additions[page] = new List<Entry>();
            foreach (string path in d.FileNames)
            {
                if (additions[page].Any(x => x.Location == path)) continue;
                if (scale) Library.ScaleXml(path);
                string name = Path.GetFileNameWithoutExtension(path);
                additions[page].Add(new Entry { Name = name, Location = path });
                preferences.Add(new XElement("library", new XAttribute("page", page), new XAttribute("file", path), new XAttribute("name", name)));
            }
            Save(); ShowPage(page);
        }
        private IEnumerable<Entry> Extras() => additions.TryGetValue(page, out var a) ? a : Enumerable.Empty<Entry>();
    }
}
