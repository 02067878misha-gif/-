using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Threading;
using System.Xml.Linq;

namespace StrataDraw
{
    internal sealed class Caption : IValueConverter
    {
        private readonly Func<string, string> translate;
        public Caption(Func<string, string> translate) { this.translate = translate; }
        public object Convert(object value, Type t, object p, CultureInfo c) => translate(value?.ToString() ?? "");
        public object ConvertBack(object value, Type t, object p, CultureInfo c) => Binding.DoNothing;
    }
    public sealed partial class ToolPanel
    {
        private Dictionary<string, string> english;
        private bool en, building;
        private readonly DispatcherTimer timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(650) };
        private readonly TextBlock layerLabel = new TextBlock();
        private string Tr(string s) => en && english != null && english.TryGetValue(s, out string translation) ? translation : s;
        private DataTemplate Captions()
        {
            var label = new FrameworkElementFactory(typeof(TextBlock));
            label.SetBinding(TextBlock.TextProperty, new Binding { Converter = new Caption(Tr) });
            return new DataTemplate { VisualTree = label };
        }
        private void Watch()
        {
            if (building || page.Length == 0) return;
            timer.Stop(); timer.Start();
        }
        private void PersistWorkspace()
        {
            if (page.Length == 0 || building) return;
            previous[page] = fields.Keys.ToDictionary(k => k, Value);
            var state = new XElement("workspace", new XAttribute("page", page), new XAttribute("output", output.Text), new XAttribute("language", en ? "en" : "ru"),
                previous.Select(p => new XElement("tool", new XAttribute("page", p.Key),
                    p.Value.Select(v => new XElement("field", new XAttribute("key", v.Key), v.Value)))));
            preferences.Element("workspace")?.Remove(); preferences.Add(state); Save();
        }
        private void InitializePreferences(StackPanel header)
        {
            string[] rows = System.IO.File.ReadAllLines(System.IO.Path.Combine(data, "ui-en.tsv"));
            english = rows.Select(l => l.Split('\t')).ToDictionary(f => f[0], f => f[1]);
            var workspace = preferences.Element("workspace");
            foreach (var tool in workspace?.Elements("tool") ?? Enumerable.Empty<XElement>())
                previous[(string)tool.Attribute("page")] = tool.Elements("field").ToDictionary(f => (string)f.Attribute("key"), f => f.Value);
            output.Text = (string)workspace?.Attribute("output") ?? "";
            en = (string)workspace?.Attribute("language") == "en";
            var language = new ComboBox { ItemsSource = new[] { "Русский", "English" }, SelectedIndex = en ? 1 : 0 };
            header.Children.Insert(0, language);
            language.SelectionChanged += (s, e) => Safe(() =>
            {
                en = language.SelectedIndex == 1; tools.ItemTemplate = Captions(); ShowPage(page);
                layerLabel.Text = Tr("Слой результата (пусто — активный)"); Watch();
            });
            tools.ItemTemplate = Captions(); layerLabel.Text = Tr("Слой результата (пусто — активный)");
            timer.Tick += (s, e) => { timer.Stop(); Safe(PersistWorkspace); };
            Unloaded += (s, e) => { timer.Stop(); Safe(PersistWorkspace); };
            output.TextChanged += (s, e) => Watch();
            form.AddHandler(TextBox.TextChangedEvent, new TextChangedEventHandler((s, e) => Watch()));
            form.AddHandler(System.Windows.Controls.Primitives.Selector.SelectionChangedEvent, new SelectionChangedEventHandler((s, e) => Watch()));
            form.AddHandler(CheckBox.CheckedEvent, new RoutedEventHandler((s, e) => Watch()));
            form.AddHandler(CheckBox.UncheckedEvent, new RoutedEventHandler((s, e) => Watch()));
            string current = (string)workspace?.Attribute("page");
            tools.SelectedItem = Pages.Contains(current) ? current : Pages[0];
        }
    }
}
