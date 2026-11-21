using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Xml.Linq;

namespace StrataDraw
{
    internal sealed partial class DrawingSession
    {
        const string LegendKey = "StrataDraw.legend";
        public void Tag(object item, string section, string caption, string index = "", double age = 0)
        {
            dynamic shape = item;
            dynamic properties = shape.Properties;
            properties[LegendKey, 1] = new XElement("key", new XAttribute("section", section),
                new XAttribute("caption", caption), new XAttribute("index", index), new XAttribute("age", age)).ToString(SaveOptions.DisableFormatting);
        }

        private static void Scan(IEnumerable<object> shapes, Dictionary<string, object> found)
        {
            foreach (dynamic shape in shapes)
            {
                if (!shape.Visible || !shape.Layer.Visible || (string)shape.Name == "Strata Draw · легенда") continue;
                dynamic properties = shape.Properties;
                if (properties.Exists(LegendKey, 1))
                {
                    string key = (string)properties[LegendKey, 1];
                    if (!found.ContainsKey(key)) found.Add(key, shape);
                }
                else if ((int)shape.Type == 7) Scan(Items(shape.Shapes), found);
            }
        }

        public void Legend(int columns, double width, double height, bool sections, bool sortAge, bool indices, bool selectionOnly, double colWidth)
        {
            var examples = new Dictionary<string, object>();
            Scan(selectionOnly ? Selected : Items(Doc.ActivePage.Shapes), examples);
            if (examples.Count == 0) throw new ArgumentException("На странице нет объектов Strata Draw с данными для легенды.");
            var entries = examples.Select(pair => new { Key = XElement.Parse(pair.Key), Shape = pair.Value })
                .OrderBy(x => sections ? (string)x.Key.Attribute("section") : "")
                .ThenBy(x => sortAge ? (double)x.Key.Attribute("age") : 0)
                .ThenBy(x => (string)x.Key.Attribute("caption")).ToList();
            int perCol = (entries.Count + columns - 1) / columns;
            double x0 = Click?.X ?? ((double)Doc.ActivePage.LeftX + 5);
            double y0 = Click?.Y ?? ((double)Doc.ActivePage.TopY - 5);
            Layer.CreateArtisticText(x0, y0, "Условные обозначения").Text.Story.Size = 12;
            string last = ""; double y = y0 - 8;
            for (int i = 0; i < entries.Count; i++)
            {
                if (i % perCol == 0) { last = ""; y = y0 - 8; }
                double x = x0 + (i / perCol) * colWidth;
                var item = entries[i];
                dynamic source = item.Shape;
                string section = (string)item.Key.Attribute("section");
                if (sections && section != last)
                {
                    Layer.CreateArtisticText(x, y, section).Text.Story.Size = 9;
                    y -= 5; last = section;
                }
                dynamic chip;
                if (section == "Возраст" || ((section == "Векторные узоры" || section == "Крапы пород") && (int)source.Fill.Type != 0))
                {
                    chip = Layer.CreateRectangle(x, y, x + width, y - height);
                    chip.Fill.CopyAssign(source.Fill); chip.Outline.Width = .15;
                }
                else
                {
                    chip = source.CopyToLayer(Layer);
                    double w = chip.SizeWidth, h = chip.SizeHeight;
                    double k = Math.Min(width / Math.Max(w, .0001), height / Math.Max(h, .0001));
                    if (w > 0 && h > 0) chip.SetSize(w * k, h * k);
                    else if (w > 0) chip.SizeWidth = width;
                    else if (h > 0) chip.SizeHeight = height;
                    chip.CenterX = x + width / 2; chip.CenterY = y - height / 2;
                }
                string ix = (string)item.Key.Attribute("index");
                string caption = (indices && ix != "" ? ix + "  " : "") + (string)item.Key.Attribute("caption");
                dynamic text = Layer.CreateArtisticText(x + width + 2, y - height / 2, caption);
                text.Text.Story.Size = 8;
                if ((double)text.SizeWidth > colWidth - width - 4) text.SizeWidth = colWidth - width - 4;
                y -= height + 3;
            }
            dynamic group = Layer.Shapes.All().Group(); group.Name = "Strata Draw · легенда";
        }
    }

    public sealed partial class ToolPanel
    {
        private void LegendPage()
        {
            Input("cols", "Число колонок", "1"); Input("colWidth", "Ширина колонки, мм", "85");
            Input("width", "Ширина образца, мм", "15"); Input("height", "Высота образца, мм", "7");
            Flag("sections", "Группировать по разделам", true); Flag("ages", "От молодых к древним", true);
            Flag("index", "Включить геологические индексы", true); Flag("only", "Только по выделенным объектам", false);
            Action<DrawingSession> draw = s =>
            {
                double w = Num("width", 1, 300), col = Num("colWidth", 10, 1000);
                if (w + 6 >= col) throw new ArgumentException("В колонке должно быть место для подписи.");
                s.Legend(Integer("cols", 1, 20), w, Num("height", 1, 200), On("sections"), On("ages"), On("index"), On("only"), col);
            };
            Button(form, "Построить легенду", () => Edit(false, draw)); Button(form, "Указать место легенды", () => Edit(true, draw));
        }
    }
}
